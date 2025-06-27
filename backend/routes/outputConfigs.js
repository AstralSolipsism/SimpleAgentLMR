/**
 * 输出配置管理路由
 */

const express = require('express');
const router = express.Router();
const db = require('../database/init');
const logger = require('../utils/logger');
const { asyncErrorHandler, ValidationError, NotFoundError } = require('../middleware/errorHandler');
const vikaService = require('../services/vikaService');

const findNodeById = (nodes, id) => {
  for (const node of nodes) {
    if (node.id === id) {
      return node;
    }
    if (node.children && node.children.length > 0) {
      const found = findNodeById(node.children, id);
      if (found) {
        return found;
      }
    }
  }
  return null;
};

/**
 * 获取输出配置列表
 */
router.get('/', asyncErrorHandler(async (req, res) => {
  
  const { page = 1, pageSize = 20, status, output_type } = req.query;
  const offset = (page - 1) * pageSize;
  
  let sql = 'SELECT * FROM output_configs WHERE 1=1';
  let countSql = 'SELECT COUNT(*) as total FROM output_configs WHERE 1=1';
  const params = [];
  
  // 状态筛选
  if (status) {
    sql += ' AND status = ?';
    countSql += ' AND status = ?';
    params.push(status);
  }
  
  // 类型筛选
  if (output_type) {
    sql += ' AND output_type = ?';
    countSql += ' AND output_type = ?';
    params.push(output_type);
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
    const outputConfigs = await new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    // 解析JSON字段
    const processedConfigs = outputConfigs.map(config => ({
      ...config,
      field_mapping: config.field_mapping ? JSON.parse(config.field_mapping) : {}
    }));
    
    res.json({
      success: true,
      code: 200,
      message: '获取输出配置列表成功',
      data: {
        items: processedConfigs,
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
    logger.error('获取输出配置列表失败', { error: error.message });
    throw error;
  }
}));

/**
 * 获取输出配置详情
 */
router.get('/:id', asyncErrorHandler(async (req, res) => {
  const { id } = req.params;
  
  try {
    const outputConfig = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM output_configs WHERE id = ?', [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!outputConfig) {
      throw new NotFoundError('输出配置不存在');
    }
    
    res.json({
      success: true,
      code: 200,
      message: '获取输出配置详情成功',
      data: {
        ...outputConfig,
        field_mapping: outputConfig.field_mapping ? JSON.parse(outputConfig.field_mapping) : {}
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    throw error;
  }
}));

/**
 * 创建输出配置
 */
router.post('/', asyncErrorHandler(async (req, res) => {
  logger.info('Creating output config with data:', req.body);
  // 参数验证
  if (!req.body.config_name || !req.body.output_type || !req.body.vika_space_id) {
    throw new ValidationError('配置名称、输出类型和维格表空间ID不能为空');
  }
  
  if (!['vika_datasheet', 'vika_record'].includes(req.body.output_type)) {
    throw new ValidationError('输出类型只能为vika_datasheet或vika_record');
  }
  
  if (req.body.output_type === 'vika_datasheet' && !req.body.vika_datasheet_id) {
    throw new ValidationError('数据表输出类型需要指定数据表ID');
  }
  
  if (req.body.output_type === 'vika_record' && (!req.body.vika_datasheet_id || !req.body.vika_record_id)) {
    throw new ValidationError('记录输出类型需要指定数据表ID和记录ID');
  }
  
  
  try {
    // 检查配置名称是否已存在
    const existingConfig = await new Promise((resolve, reject) => {
      db.get('SELECT id FROM output_configs WHERE config_name = ?', [req.body.config_name], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (existingConfig) {
      throw new ValidationError('配置名称已存在，请使用其他名称');
    }
    
    let vika_space_name = null;
    let vika_datasheet_name = null;

    // 验证维格表配置并获取名称
    // 1. 获取所有空间站以找到名称
    const spacesResult = await vikaService.getSpaces();
    if (!spacesResult.success) {
      throw new ValidationError(`获取维格表空间列表失败: ${spacesResult.message || '未知错误'}`);
    }
    console.log('维格表空间列表返回结果:', JSON.stringify(spacesResult, null, 2));
    const space = spacesResult.data.find(s => s.id === req.body.vika_space_id);
    if (!space) {
      throw new ValidationError('提供的维格表空间ID无效或不存在');
    }
    vika_space_name = space.name;

    // 2. 如果有数据表ID，获取其名称
    if (req.body.vika_datasheet_id) {
      const datasheetsResult = await vikaService.getDatasheets(req.body.vika_space_id);
      if (!datasheetsResult.success) {
        throw new ValidationError(`获取维格表的数据表列表失败: ${datasheetsResult.message || '未知错误'}`);
      }
      
      const datasheet = findNodeById(datasheetsResult.data, req.body.vika_datasheet_id);
      if (!datasheet) {
        throw new ValidationError('在指定的空间中未找到该数据表ID');
      }
      vika_datasheet_name = datasheet.name;
    }
    
    // 插入新配置
    const result = await new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO output_configs (
          config_name, description, output_type, vika_space_id, vika_space_name,
          vika_datasheet_id, vika_datasheet_name, vika_record_id, field_mapping
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      const params = [
        req.body.config_name,
        req.body.description,
        req.body.output_type,
        req.body.vika_space_id,
        vika_space_name, // 使用从vika服务获取的名称
        req.body.vika_datasheet_id || null,
        vika_datasheet_name, // 使用从vika服务获取的名称
        req.body.vika_record_id || null,
        req.body.field_mapping ? JSON.stringify(req.body.field_mapping) : '{}'
      ];
      
      console.log('即将写入数据库的参数:', params);
      db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID });
        }
      });
    });

    // 从数据库获取刚刚创建的、最真实的数据
    const newConfig = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM output_configs WHERE id = ?', [result.id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!newConfig) {
      throw new NotFoundError('创建配置后无法立即找到该配置');
    }
    
    logger.info('输出配置创建成功，从数据库返回的完整对象为:', newConfig);
    
    res.status(201).json({
      success: true,
      code: 201,
      message: '输出配置创建成功',
      data: {
        ...newConfig,
        field_mapping: newConfig.field_mapping ? JSON.parse(newConfig.field_mapping) : {}
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('输出配置创建失败', { error: error.message });
    throw error;
  }
}));

/**
 * 更新输出配置
 */
router.put('/:id', asyncErrorHandler(async (req, res) => {
  logger.info(`Updating output config ${req.params.id} with data:`, req.body);
  const { id } = req.params;
  const {
    config_name, 
    description,
    vika_space_id,
    vika_space_name,
    vika_datasheet_id,
    vika_datasheet_name,
    vika_record_id,
    field_mapping,
    status
  } = req.body;
  
  
  try {
    // 检查配置是否存在
    const existingConfig = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM output_configs WHERE id = ?', [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!existingConfig) {
      throw new NotFoundError('输出配置不存在');
    }
    
    // 构建更新字段
    const updateFields = [];
    const updateValues = [];
    
    if (config_name !== undefined) {
      updateFields.push('config_name = ?');
      updateValues.push(config_name);
    }
    
    if (description !== undefined) {
      updateFields.push('description = ?');
      updateValues.push(description);
    }

    if (vika_space_id !== undefined) {
      // 验证维格表空间
      try {
        await vikaService.getSpaceInfo(vika_space_id);
      } catch (error) {
        throw new ValidationError(`维格表空间验证失败: ${error.message}`);
      }
      
      updateFields.push('vika_space_id = ?');
      updateValues.push(vika_space_id);
    }
    
    if (vika_space_name !== undefined) {
      updateFields.push('vika_space_name = ?');
      updateValues.push(vika_space_name);
    }

    if (vika_datasheet_id !== undefined) {
      if (vika_datasheet_id) {
        // 验证数据表
        try {
          await vikaService.getFields(vika_datasheet_id);
        } catch (error) {
          throw new ValidationError(`维格表数据表验证失败: ${error.message}`);
        }
      }

      updateFields.push('vika_datasheet_id = ?');
      updateValues.push(vika_datasheet_id || null);
    }

    if (vika_datasheet_name !== undefined) {
      updateFields.push('vika_datasheet_name = ?');
      updateValues.push(vika_datasheet_name);
    }
    
    if (vika_record_id !== undefined) {
      updateFields.push('vika_record_id = ?');
      updateValues.push(vika_record_id || null);
    }
    
    if (field_mapping !== undefined) {
      updateFields.push('field_mapping = ?');
      updateValues.push(JSON.stringify(field_mapping));
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
    const sql = `UPDATE output_configs SET ${updateFields.join(', ')} WHERE id = ?`;
    
    const dataToUpdate = {};
    updateFields.forEach((field, index) => {
      const key = field.split(' = ?')[0].trim();
      dataToUpdate[key] = updateValues[index];
    });
    await new Promise((resolve, reject) => {
      db.run(sql, updateValues, function(err) {
        if (err) reject(err);
        else resolve();
      });
    });
    
    // 获取更新后的数据
    const updatedConfig = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM output_configs WHERE id = ?', [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    logger.info('输出配置更新成功', { id });
    
    res.json({
      success: true,
      code: 200,
      message: '输出配置更新成功',
      data: {
        ...updatedConfig,
        field_mapping: updatedConfig.field_mapping ? JSON.parse(updatedConfig.field_mapping) : {}
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('输出配置更新失败', { id, error: error.message });
    throw error;
  }
}));

/**
 * 删除输出配置
 */
router.delete('/:id', asyncErrorHandler(async (req, res) => {
  const { id } = req.params;
  
  try {
    // 检查配置是否存在
    const existingConfig = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM output_configs WHERE id = ?', [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!existingConfig) {
      throw new NotFoundError('输出配置不存在');
    }
    
    // 删除配置
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM output_configs WHERE id = ?', [id], function(err) {
        if (err) reject(err);
        else resolve();
      });
    });
    
    logger.info('输出配置删除成功', { id, config_name: existingConfig.config_name });
    
    res.json({
      success: true,
      code: 200,
      message: '输出配置删除成功',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('输出配置删除失败', { id, error: error.message });
    throw error;
  }
}));

/**
 * 测试输出配置
 */
router.post('/:id/test', asyncErrorHandler(async (req, res) => {
  const { id } = req.params;
  const { test_data } = req.body;
  
  try {
    // 获取配置信息
    const outputConfig = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM output_configs WHERE id = ? AND status = "active"', [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!outputConfig) {
      throw new NotFoundError('输出配置不存在或已禁用');
    }
    
    // 准备测试数据
    const testData = test_data || {
      task_id: 'test_' + Date.now(),
      message: '这是一个测试输出',
      timestamp: new Date().toISOString(),
      test: true
    };
    
    // 执行测试写入
    try {
      const result = await vikaService.writeToOutput(outputConfig, testData);
      
      logger.info('输出配置测试成功', { id, config_name: outputConfig.config_name });
      
      res.json({
        success: true,
        code: 200,
        message: '输出配置测试成功',
        data: {
          config_id: id,
          config_name: outputConfig.config_name,
          output_type: outputConfig.output_type,
          test_data: testData,
          vika_result: result,
          test_time: new Date().toISOString()
        },
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      res.json({
        success: false,
        code: 500,
        message: '输出配置测试失败',
        data: {
          config_id: id,
          config_name: outputConfig.config_name,
          error: error.message,
          test_time: new Date().toISOString()
        },
        timestamp: new Date().toISOString()
      });
    }
    
  } catch (error) {
    logger.error('输出配置测试失败', { id, error: error.message });
    throw error;
  }
}));

/**
 * 获取维格表数据表列表
 */
router.get('/vika/spaces/:spaceId/datasheets', asyncErrorHandler(async (req, res) => {
  const { spaceId } = req.params;
  
  try {
    const datasheetsResult = await vikaService.getDatasheets(spaceId);
    if (!datasheetsResult.success) {
      throw new Error(datasheetsResult.error || '获取维格表数据表列表失败');
    }
    
    res.json({
      success: true,
      code: 200,
      message: '获取维格表数据表列表成功',
      data: datasheetsResult.data,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('获取维格表数据表列表失败', { spaceId, error: error.message });
    throw error;
  }
}));

/**
 * 获取维格表空间列表或单个空间信息
 */
router.get('/vika/spaces/:spaceId?', asyncErrorHandler(async (req, res) => {
  const { spaceId } = req.params;

  try {
    if (spaceId) {
      // 获取单个空间信息
      const spaceInfo = await vikaService.getSpaceInfo(spaceId);
      if (!spaceInfo.success) {
        throw new Error(spaceInfo.error || '获取维格表空间信息失败');
      }
      res.json({
        success: true,
        code: 200,
        message: '获取维格表空间信息成功',
        data: spaceInfo.data,
        timestamp: new Date().toISOString()
      });
    } else {
      // 获取空间列表
      const spacesResult = await vikaService.getSpaces();
      if (!spacesResult.success) {
        throw new Error(spacesResult.error || '获取维格表空间列表失败');
      }
      res.json({
        success: true,
        code: 200,
        message: '获取维格表空间列表成功',
        data: spacesResult.data,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    logger.error('获取维格表空间信息或列表失败', { spaceId, error: error.message });
    throw error;
  }
}));

/**
 * 获取维格表数据表字段
 */
router.get('/vika/datasheets/:datasheetId/fields', asyncErrorHandler(async (req, res) => {
  const { datasheetId } = req.params;
  
  try {
    const fieldsResult = await vikaService.getFields(datasheetId);
    if (!fieldsResult.success) {
      throw new Error(fieldsResult.error || '获取维格表数据表字段失败');
    }
    
    res.json({
      success: true,
      code: 200,
      message: '获取维格表数据表字段成功',
      data: fieldsResult.data,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('获取维格表数据表字段失败', { datasheetId, error: error.message });
    throw error;
  }
}));

/**
 * 手动清除维格表缓存
 */
router.post('/vika/clear-cache', asyncErrorHandler(async (req, res) => {
  try {
    await vikaService.clearAllCache();
    logger.info('维格表缓存已通过API请求手动清除');
    res.json({
      success: true,
      code: 200,
      message: '维格表缓存清除成功',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('手动清除维格表缓存失败', { error: error.message });
    throw error;
  }
}));
module.exports = router;
