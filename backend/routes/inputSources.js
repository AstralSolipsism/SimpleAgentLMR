/**
 * 输入源管理路由
 */

const express = require('express');
const router = express.Router();
const { db } = require('../database/init');
const logger = require('../utils/logger');
const { asyncErrorHandler, ValidationError, NotFoundError, ConflictError } = require('../middleware/errorHandler');
const { getCurrentEnvironment } = require('../config/environment');

/**
 * 获取输入源列表
 */
router.get('/', asyncErrorHandler(async (req, res) => {
  logger.info('GET /api/v1/input-sources - 收到请求', { query: req.query });
  
  const { page = 1, pageSize = 20, status, agent_id, source_type } = req.query;
  const offset = (page - 1) * pageSize;
  
  let sql = `
    SELECT i.*, a.agent_name
    FROM input_sources i
    LEFT JOIN agents a ON i.agent_id = a.agent_id
    LEFT JOIN applications app ON a.app_id = app.app_id
    WHERE 1=1
  `;
 const currentEnv = getCurrentEnvironment();
 let countSql = 'SELECT COUNT(*) as total FROM input_sources i LEFT JOIN agents a ON i.agent_id = a.agent_id LEFT JOIN applications app ON a.app_id = app.app_id WHERE 1=1';
 const params = [];

 // 环境筛选
 sql += ' AND app.environment_type = ?';
 countSql += ' AND app.environment_type = ?';
 params.push(currentEnv.name);
 
 // 状态筛选
  if (status) {
    sql += ' AND i.status = ?';
    countSql += ' AND status = ?';
    params.push(status);
  }
  
  // 智能体筛选
  if (agent_id) {
    sql += ' AND i.agent_id = ?';
    countSql += ' AND agent_id = ?';
    params.push(agent_id);
  }
  
  // 类型筛选
  if (source_type) {
    sql += ' AND i.source_type = ?';
    countSql += ' AND source_type = ?';
    params.push(source_type);
  }
  
  sql += ' ORDER BY i.created_at DESC LIMIT ? OFFSET ?';
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
    const inputSources = await new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    // 解析JSON字段
    const processedSources = inputSources.map(source => ({
      ...source,
      config: source.config ? JSON.parse(source.config) : {}
    }));
    
    
    logger.info('GET /api/v1/input-sources - 操作成功');
    res.json({
      success: true,
      code: 200,
      message: '获取输入源列表成功',
      data: {
        items: processedSources,
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
    logger.error('获取输入源列表失败', { error: error.message, stack: error.stack });
    throw error;
  }
}));

/**
 * 获取输入源详情
 */
router.get('/:source_id', asyncErrorHandler(async (req, res) => {
  const { source_id } = req.params;
  logger.info(`GET /api/v1/input-sources/${source_id} - 收到请求`, { params: req.params });
  
  try {
    const inputSource = await new Promise((resolve, reject) => {
      const sql = `
        SELECT ins.*, a.agent_name
        FROM input_sources ins
        LEFT JOIN agents a ON ins.agent_id = a.agent_id
        WHERE ins.source_id = ?
      `;
      
      db.get(sql, [source_id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!inputSource) {
      throw new NotFoundError('输入源不存在');
    }
    
    
    logger.info(`GET /api/v1/input-sources/${source_id} - 操作成功`);
    res.json({
      success: true,
      code: 200,
      message: '获取输入源详情成功',
      data: {
        ...inputSource,
        config: inputSource.config ? JSON.parse(inputSource.config) : {}
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error(`获取输入源详情失败，source_id: ${source_id}`, { error: error.message, stack: error.stack });
    throw error;
  }
}));

/**
 * 创建输入源
 */
router.post('/', asyncErrorHandler(async (req, res) => {
  const { source_name, source_type, endpoint, agent_id, config } = req.body;
  logger.info('POST /api/v1/input-sources - 收到请求', { body: req.body });
  
  // 参数验证
  if (!source_name || !source_type || !endpoint || !agent_id) {
    throw new ValidationError('源名称、源类型、端点和智能体ID不能为空');
  }
  
  if (!['http_endpoint', 'webhook'].includes(source_type)) {
    throw new ValidationError('源类型只能为http_endpoint或webhook');
  }
  
  
  try {
    // 检查智能体是否存在
    const agent = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM agents WHERE agent_id = ? AND status = "active"', [agent_id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!agent) {
      throw new NotFoundError('指定的智能体不存在或已禁用');
    }
    
    // 检查端点是否已存在
    const existingEndpoint = await new Promise((resolve, reject) => {
      db.get('SELECT id FROM input_sources WHERE endpoint = ?', [endpoint], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (existingEndpoint) {
      throw new ConflictError('端点已存在');
    }
    
    // 插入新输入源
    const result = await new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO input_sources (source_name, source_type, endpoint, agent_id, config)
        VALUES (?, ?, ?, ?, ?)
      `;
      
      const configJson = config ? JSON.stringify(config) : '{}';
      
      db.run(sql, [source_name, source_type, endpoint, agent_id, configJson], function(err) {
        if (err) reject(err);
        else resolve({ id: this.lastID });
      });
    });
    
    
    logger.info(`POST /api/v1/input-sources - 操作成功，source_id: ${result.id}`);
    
    res.status(201).json({
      success: true,
      code: 201,
      message: '输入源创建成功',
      data: {
        id: result.id,
        source_name,
        source_type,
        endpoint,
        agent_id,
        config: config || {},
        status: 'active',
        created_at: new Date().toISOString(),
        webhook_url: `${req.protocol}://${req.get('host')}/api/v1/tasks/${endpoint}`
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('输入源创建失败', { error: error.message, stack: error.stack });
    throw error;
  }
}));

/**
 * 更新输入源
 */
router.put('/:id', asyncErrorHandler(async (req, res) => {
  const { id } = req.params;
  const { source_name, agent_id, config, status } = req.body;
  logger.info(`PUT /api/v1/input-sources/${id} - 收到请求`, { params: req.params, body: req.body });

  try {
    // 检查输入源是否存在
    const existingSource = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM input_sources WHERE id = ?', [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!existingSource) {
      throw new NotFoundError('输入源不存在');
    }
    
    // 构建更新字段
    const updateFields = [];
    const updateValues = [];
    
    if (source_name !== undefined) {
      updateFields.push('source_name = ?');
      updateValues.push(source_name);
    }
    
    if (agent_id !== undefined) {
      // 检查智能体是否存在
      const agent = await new Promise((resolve, reject) => {
        db.get('SELECT agent_id FROM agents WHERE agent_id = ? AND status = "active"', [agent_id], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
      
      if (!agent) {
        throw new NotFoundError('指定的智能体不存在或已禁用');
      }
      
      updateFields.push('agent_id = ?');
      updateValues.push(agent_id);
    }
    
    if (config !== undefined) {
      updateFields.push('config = ?');
      updateValues.push(JSON.stringify(config));
    }
    
    if (status !== undefined) {
      if (!['active', 'inactive'].includes(status)) {
        throw new ValidationError('状态只能为active或inactive');
      }
      updateFields.push('status = ?');
      updateValues.push(status);
    }
    
    if (updateFields.length === 0) {
      throw new ValidationError('没有提供需要更新的字段');
    }
    
    updateValues.push(id);
    
    // 执行更新
    const sql = `UPDATE input_sources SET ${updateFields.join(', ')} WHERE id = ?`;
    
    await new Promise((resolve, reject) => {
      db.run(sql, updateValues, function(err) {
        if (err) reject(err);
        else resolve();
      });
    });
    
    // 获取更新后的数据
    const updatedSource = await new Promise((resolve, reject) => {
      const sql = `
        SELECT ins.*, a.agent_name, a.app_id
        FROM input_sources ins
        LEFT JOIN agents a ON ins.agent_id = a.agent_id
        WHERE ins.id = ?
      `;
      
      db.get(sql, [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    
    logger.info(`PUT /api/v1/input-sources/${id} - 操作成功`);
    
    res.json({
      success: true,
      code: 200,
      message: '输入源更新成功',
      data: {
        ...updatedSource,
        config: updatedSource.config ? JSON.parse(updatedSource.config) : {}
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('输入源更新失败', { id, error: error.message, stack: error.stack });
    throw error;
  }
}));

/**
 * 删除输入源
 */
router.delete('/:id', asyncErrorHandler(async (req, res) => {
  const { id } = req.params;
  logger.info(`DELETE /api/v1/input-sources/${id} - 收到请求`, { params: req.params });
  
  try {
    // 检查输入源是否存在
    const existingSource = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM input_sources WHERE id = ?', [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!existingSource) {
      throw new NotFoundError('输入源不存在');
    }
    
    // 检查是否有正在使用的任务
    const activeTaskCount = await new Promise((resolve, reject) => {
      db.get(
        'SELECT COUNT(*) as count FROM task_executions WHERE source_endpoint = ? AND status IN ("pending", "running")',
        [existingSource.endpoint],
        (err, row) => {
          if (err) reject(err);
          else resolve(row.count);
        }
      );
    });
    
    if (activeTaskCount > 0) {
      throw new ConflictError('无法删除输入源，该端点有正在执行的任务');
    }
    
    // 删除输入源
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM input_sources WHERE id = ?', [id], function(err) {
        if (err) reject(err);
        else resolve();
      });
    });
    
    
    logger.info(`DELETE /api/v1/input-sources/${id} - 操作成功`);
    
    res.json({
      success: true,
      code: 200,
      message: '输入源删除成功',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('输入源删除失败', { id, error: error.message, stack: error.stack });
    throw error;
  }
}));

/**
 * 测试输入源
 */
router.post('/:id/test', asyncErrorHandler(async (req, res) => {
  const { id } = req.params;
  const { test_data } = req.body;
  logger.info(`POST /api/v1/input-sources/${id}/test - 收到请求`, { params: req.params, body: req.body });
  
  try {
    // 获取输入源信息
    const inputSource = await new Promise((resolve, reject) => {
      const sql = `
        SELECT ins.*, a.agent_name, a.app_id
        FROM input_sources ins
        LEFT JOIN agents a ON ins.agent_id = a.agent_id
        WHERE ins.id = ? AND ins.status = 'active'
      `;
      
      db.get(sql, [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!inputSource) {
      throw new NotFoundError('输入源不存在或已禁用');
    }
    
    
    // 模拟测试数据
    const testData = test_data || {
      message: '这是一个测试消息',
      timestamp: new Date().toISOString(),
      test: true
    };
    
    logger.info(`POST /api/v1/input-sources/${id}/test - 操作成功`);
    
    res.json({
      success: true,
      code: 200,
      message: '输入源测试成功',
      data: {
        input_source_id: id,
        endpoint: inputSource.endpoint,
        agent_id: inputSource.agent_id,
        agent_name: inputSource.agent_name,
        test_data: testData,
        webhook_url: `${req.protocol}://${req.get('host')}/api/v1/tasks/${inputSource.endpoint}`,
        status: 'ready',
        test_time: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('输入源测试失败', { id, error: error.message, stack: error.stack });
    throw error;
  }
}));

/**
 * 获取输入源统计信息
 */
router.get('/stats/overview', asyncErrorHandler(async (req, res) => {
  logger.info('GET /api/v1/input-sources/stats/overview - 收到请求');
  
  try {
    // 获取各种统计数据
    const totalSources = await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as count FROM input_sources', [], (err, row) => {
        if (err) reject(err);
        else resolve(row.count);
      });
    });
    
    const activeSources = await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as count FROM input_sources WHERE status = "active"', [], (err, row) => {
        if (err) reject(err);
        else resolve(row.count);
      });
    });
    
    const sourcesByType = await new Promise((resolve, reject) => {
      db.all('SELECT source_type, COUNT(*) as count FROM input_sources GROUP BY source_type', [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    const recentTasks = await new Promise((resolve, reject) => {
      db.get(
        'SELECT COUNT(*) as count FROM task_executions WHERE started_at > datetime("now", "-24 hours")',
        [],
        (err, row) => {
          if (err) reject(err);
          else resolve(row.count);
        }
      );
    });
    
    
    logger.info('GET /api/v1/input-sources/stats/overview - 操作成功');
    res.json({
      success: true,
      code: 200,
      message: '获取输入源统计成功',
      data: {
        total_sources: totalSources,
        active_sources: activeSources,
        inactive_sources: totalSources - activeSources,
        sources_by_type: sourcesByType,
        recent_tasks_24h: recentTasks
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('获取输入源统计失败', { error: error.message, stack: error.stack });
    throw error;
  }
}));

module.exports = router;
