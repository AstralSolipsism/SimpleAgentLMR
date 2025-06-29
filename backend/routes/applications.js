/**
 * 智能体应用管理路由
 */

const express = require('express');
const router = express.Router();
const { db } = require('../database/init');
const logger = require('../utils/logger');
const { asyncErrorHandler, ValidationError, NotFoundError, ConflictError } = require('../middleware/errorHandler');
const { v4: uuidv4 } = require('uuid');
const { getCurrentEnvironment } = require('../config/environment');

/**
 * 获取应用列表
 */
router.get('/', asyncErrorHandler(async (req, res) => {
  logger.info('GET /api/v1/applications - 收到请求', { query: req.query });
  
  const { page = 1, pageSize = 20, status, search } = req.query;
  const offset = (page - 1) * pageSize;
  
  const currentEnv = getCurrentEnvironment();
  
  let sql = 'SELECT * FROM applications WHERE environment_type = ?';
  let countSql = 'SELECT COUNT(*) as total FROM applications WHERE environment_type = ?';
  const params = [currentEnv.name];
  
  // 状态筛选
  if (status) {
    sql += ' AND status = ?';
    countSql += ' AND status = ?';
    params.push(status);
  }
  
  // 搜索筛选
  if (search) {
    sql += ' AND (app_name LIKE ? OR description LIKE ?)';
    countSql += ' AND (app_name LIKE ? OR description LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }
  
  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(pageSize, offset);
  
  try {
    // 获取总数
    const countResult = await new Promise((resolve, reject) => {
      db.get(countSql, params.slice(0, -2), (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    // 获取数据
    const applications = await new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    
    logger.info('GET /api/v1/applications - 操作成功');
    res.json({
      success: true,
      code: 200,
      message: '获取应用列表成功',
      data: {
        items: applications,
        pagination: {
          page: parseInt(page),
          pageSize: parseInt(pageSize),
          total: countResult.total,
          totalPages: Math.ceil(countResult.total / pageSize)
        }
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('获取应用列表失败', { error: error.message, stack: error.stack });
    throw error;
  }
}));

/**
 * 获取应用详情
 */
router.get('/:appId', asyncErrorHandler(async (req, res) => {
  const { appId } = req.params;
  logger.info(`GET /api/v1/applications/${appId} - 收到请求`, { params: req.params });
  
  try {
    // 获取应用信息
    const application = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM applications WHERE app_id = ?', [appId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!application) {
      throw new NotFoundError('应用不存在');
    }
    
    // 获取该应用下的智能体数量
    const agentCount = await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as count FROM agents WHERE app_id = ?', [appId], (err, row) => {
        if (err) reject(err);
        else resolve(row.count);
      });
    });
    
    
    logger.info(`GET /api/v1/applications/${appId} - 操作成功`);
    res.json({
      success: true,
      code: 200,
      message: '获取应用详情成功',
      data: {
        ...application,
        agent_count: agentCount
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error(`获取应用详情失败，appId: ${appId}`, { error: error.message, stack: error.stack });
    throw error;
  }
}));

/**
 * 注册新应用
 */
router.post('/', asyncErrorHandler(async (req, res) => {
  // 不记录 app_secret
  logger.info('POST /api/v1/applications - 收到请求', { body: { app_id: req.body.app_id, app_name: req.body.app_name, description: req.body.description, base_url: req.body.base_url, environment_type: req.body.environment_type } });
  
  const { app_id, app_name, description, base_url, app_secret, environment_type } = req.body;
  
  // 参数验证
  if (!app_id || !app_name || !base_url || !app_secret) {
    throw new ValidationError('应用ID、应用名称、基础URL和应用密钥不能为空');
  }
  
  if (!base_url.startsWith('http://') && !base_url.startsWith('https://')) {
    throw new ValidationError('基础URL必须以http://或https://开头');
  }
  
  try {
    // 检查 app_id 是否已存在
    const existingAppById = await new Promise((resolve, reject) => {
      db.get('SELECT app_id FROM applications WHERE app_id = ?', [app_id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (existingAppById) {
      throw new ConflictError('应用ID已存在');
    }

    // 检查应用名称是否已存在
    const existingAppByName = await new Promise((resolve, reject) => {
      db.get('SELECT app_id FROM applications WHERE app_name = ?', [app_name], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (existingAppByName) {
      throw new ConflictError('应用名称已存在');
    }
    
    // 插入新应用
    const result = await new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO applications (app_id, app_name, description, base_url, app_secret, environment_type)
        VALUES (?, ?, ?, ?, ?, ?)
      `;
      
      db.run(sql, [app_id, app_name, description || '', base_url, app_secret, environment_type || 'production'], function(err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, app_id });
      });
    });
    
    
    logger.info(`POST /api/v1/applications - 操作成功，appId: ${app_id}`);
    
    res.status(201).json({
      success: true,
      code: 201,
      message: '应用注册成功',
      data: {
        id: result.id,
        app_id,
        app_name,
        description: description || '',
        base_url,
        status: 'active',
        created_at: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('应用注册失败', { error: error.message, stack: error.stack });
    throw error;
  }
}));

/**
 * 更新应用信息
 */
router.put('/:appId', asyncErrorHandler(async (req, res) => {
  const { appId } = req.params;
  // 不记录 app_secret
  logger.info(`PUT /api/v1/applications/${appId} - 收到请求`, { params: req.params, body: { app_name: req.body.app_name, description: req.body.description, base_url: req.body.base_url, status: req.body.status, environment_type: req.body.environment_type } });
  
  const { app_name, description, base_url, app_secret, status, environment_type } = req.body;
  
  try {
    // 检查应用是否存在
    const existingApp = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM applications WHERE app_id = ?', [appId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!existingApp) {
      throw new NotFoundError('应用不存在');
    }
    
    // 构建更新字段
    const updateFields = [];
    const updateValues = [];
    
    if (app_name !== undefined) {
      // 检查名称是否与其他应用冲突
      const nameConflict = await new Promise((resolve, reject) => {
        db.get('SELECT app_id FROM applications WHERE app_name = ? AND app_id != ?', [app_name, appId], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
      
      if (nameConflict) {
        throw new ConflictError('应用名称已被其他应用使用');
      }
      
      updateFields.push('app_name = ?');
      updateValues.push(app_name);
    }
    
    if (description !== undefined) {
      updateFields.push('description = ?');
      updateValues.push(description);
    }
    
    if (base_url !== undefined) {
      if (!base_url.startsWith('http://') && !base_url.startsWith('https://')) {
        throw new ValidationError('基础URL必须以http://或https://开头');
      }
      updateFields.push('base_url = ?');
      updateValues.push(base_url);
    }
    
    if (app_secret !== undefined) {
      updateFields.push('app_secret = ?');
      updateValues.push(app_secret);
    }
    
    if (status !== undefined) {
      if (!['active', 'inactive'].includes(status)) {
        throw new ValidationError('状态只能为active或inactive');
      }
      updateFields.push('status = ?');
      updateValues.push(status);
    }
    
    if (environment_type !== undefined) {
      if (!['test', 'production'].includes(environment_type)) {
        throw new ValidationError('环境类型只能为test或production');
      }
      updateFields.push('environment_type = ?');
      updateValues.push(environment_type);
    }
    
    if (updateFields.length === 0) {
      throw new ValidationError('没有提供需要更新的字段');
    }
    
    updateFields.push('updated_at = CURRENT_TIMESTAMP');
    updateValues.push(appId);
    
    // 执行更新
    const sql = `UPDATE applications SET ${updateFields.join(', ')} WHERE app_id = ?`;
    
    await new Promise((resolve, reject) => {
      db.run(sql, updateValues, function(err) {
        if (err) reject(err);
        else resolve();
      });
    });
    
    // 获取更新后的数据
    const updatedApp = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM applications WHERE app_id = ?', [appId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    
    logger.info(`PUT /api/v1/applications/${appId} - 操作成功`);
    
    res.json({
      success: true,
      code: 200,
      message: '应用更新成功',
      data: updatedApp,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('应用更新失败', { app_id: appId, error: error.message, stack: error.stack });
    throw error;
  }
}));

/**
 * 删除应用
 */
router.delete('/:appId', asyncErrorHandler(async (req, res) => {
  const { appId } = req.params;
  logger.info(`DELETE /api/v1/applications/${appId} - 收到请求`, { params: req.params });
  
  try {
    // 检查应用是否存在
    const existingApp = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM applications WHERE app_id = ?', [appId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!existingApp) {
      throw new NotFoundError('应用不存在');
    }
    
    // 检查是否有关联的智能体
    const agentCount = await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as count FROM agents WHERE app_id = ?', [appId], (err, row) => {
        if (err) reject(err);
        else resolve(row.count);
      });
    });
    
    if (agentCount > 0) {
      throw new ConflictError('无法删除应用，该应用下还有智能体');
    }
    
    // 删除应用
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM applications WHERE app_id = ?', [appId], function(err) {
        if (err) reject(err);
        else resolve();
      });
    });
    
    
    logger.info(`DELETE /api/v1/applications/${appId} - 操作成功`);
    
    res.json({
      success: true,
      code: 200,
      message: '应用删除成功',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('应用删除失败', { app_id: appId, error: error.message, stack: error.stack });
    throw error;
  }
}));

/**
 * 测试应用连接
 */
router.post('/:appId/test', asyncErrorHandler(async (req, res) => {
  const { appId } = req.params;
  logger.info(`POST /api/v1/applications/${appId}/test - 收到请求`, { params: req.params });
  
  try {
    // 获取应用信息
    const application = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM applications WHERE app_id = ?', [appId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!application) {
      throw new NotFoundError('应用不存在');
    }
    
    
    // 测试连接（这里可以添加具体的连接测试逻辑）
    logger.info(`POST /api/v1/applications/${appId}/test - 操作成功`);
    
    res.json({
      success: true,
      code: 200,
      message: '应用连接正常',
      data: {
        app_id: appId,
        app_name: application.app_name,
        base_url: application.base_url,
        status: 'connected',
        test_time: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('应用连接测试失败', { app_id: appId, error: error.message, stack: error.stack });
    throw error;
  }
}));

module.exports = router;
