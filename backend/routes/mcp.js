/**
 * MCP工具管理路由
 */

const express = require('express');
const router = express.Router();
const { db } = require('../database/init');
const logger = require('../utils/logger');
const { asyncErrorHandler, ValidationError, NotFoundError, ConflictError } = require('../middleware/errorHandler');
const mcpManager = require('../services/mcpManager');
router.get('/', (req, res) => {
  res.json([]);
});

/**
 * 获取MCP工具列表
 */
router.get('/tools', asyncErrorHandler(async (req, res) => {
  logger.info('GET /api/v1/mcp/tools - Request received');
  
  try {
    const tools = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM mcp_tools;', [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    // 解析JSON字段
    const processedTools = tools.map(tool => ({
      ...tool,
      config: tool.config ? JSON.parse(tool.config) : {}
    }));
    
    logger.info('GET /api/v1/mcp/tools - Operation successful');
    res.json({
      success: true,
      code: 200,
      message: '获取MCP工具列表成功',
      data: {
        tools: processedTools
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('获取MCP工具列表失败', { error: error.message, stack: error.stack });
    throw error;
  }
}));

/**
 * 获取MCP工具详情
 */
router.get('/tools/:toolName', asyncErrorHandler(async (req, res) => {
  const { toolName } = req.params;
  logger.info(`GET /api/v1/mcp/tools/${toolName} - Request received`, { params: req.params });
  
  try {
    const tool = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM mcp_tools WHERE tool_name = ?', [toolName], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!tool) {
      throw new NotFoundError('MCP工具不存在');
    }
    
    
    // 获取运行时工具详情
    const runtimeDetails = mcpManager.getToolDetails(toolName);
    
    logger.info(`GET /api/v1/mcp/tools/${toolName} - Operation successful`);
    res.json({
      success: true,
      code: 200,
      message: '获取MCP工具详情成功',
      data: {
        ...tool,
        config: tool.config ? JSON.parse(tool.config) : {},
        runtime_details: runtimeDetails
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error(`获取MCP工具详情失败 for toolName: ${toolName}`, { error: error.message, stack: error.stack });
    throw error;
  }
}));

/**
 * 注册MCP工具
 */
router.post('/tools', asyncErrorHandler(async (req, res) => {
  const { tool_name, tool_type, endpoint, description, config } = req.body;
  logger.info(`POST /api/v1/mcp/tools - Request received`, { body: req.body });
  
  // 参数验证
  if (!tool_name || !tool_type) {
    throw new ValidationError('工具名称和工具类型不能为空');
  }
  
  if (!['local', 'remote'].includes(tool_type)) {
    throw new ValidationError('工具类型只能为local或remote');
  }
  
  if (tool_type === 'remote' && !endpoint) {
    throw new ValidationError('远程工具需要指定端点');
  }
  
  
  try {
    // 检查工具名称是否已存在
    const existingTool = await new Promise((resolve, reject) => {
      db.get('SELECT tool_name FROM mcp_tools WHERE tool_name = ?', [tool_name], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (existingTool) {
      throw new ConflictError('工具名称已存在');
    }
    
    // 插入新工具
    const result = await new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO mcp_tools (tool_name, tool_type, endpoint, description, config)
        VALUES (?, ?, ?, ?, ?)
      `;
      
      const configJson = config ? JSON.stringify(config) : '{}';
      
      db.run(sql, [tool_name, tool_type, endpoint || null, description || '', configJson], function(err) {
        if (err) reject(err);
        else resolve({ id: this.lastID });
      });
    });
    
    
    // 重新加载工具
    await mcpManager.reloadTools();
    
    logger.info(`POST /api/v1/mcp/tools - Operation successful for toolName: ${tool_name}`);
    
    res.status(201).json({
      success: true,
      code: 201,
      message: 'MCP工具注册成功',
      data: {
        id: result.id,
        tool_name,
        tool_type,
        endpoint: endpoint || null,
        description: description || '',
        config: config || {},
        status: 'active',
        created_at: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('MCP工具注册失败', { error: error.message, stack: error.stack });
    throw error;
  }
}));

/**
 * 调用MCP工具
 */
router.post('/tools/:toolName/call', asyncErrorHandler(async (req, res) => {
  const { toolName } = req.params;
  const { params = {} } = req.body;
  logger.info(`POST /api/v1/mcp/tools/${toolName}/call - Request received`, { params: req.params, body: req.body });
  
  try {
    // 验证工具参数
    mcpManager.validateToolParams(toolName, params);
    
    // 调用工具
    const result = await mcpManager.callTool(toolName, params);
    
    logger.info(`POST /api/v1/mcp/tools/${toolName}/call - Operation successful`);
    
    res.json({
      success: true,
      code: 200,
      message: 'MCP工具调用成功',
      data: {
        tool_name: toolName,
        params,
        result,
        call_time: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('MCP工具调用失败', { tool: toolName, params, error: error.message, stack: error.stack });
    
    res.status(500).json({
      success: false,
      code: 500,
      message: 'MCP工具调用失败',
      data: {
        tool_name: toolName,
        params,
        error: error.message,
        call_time: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    });
  }
}));

/**
 * 重新加载MCP工具
 */
router.post('/tools/reload', asyncErrorHandler(async (req, res) => {
  logger.info('POST /api/v1/mcp/tools/reload - Request received');
  try {
    await mcpManager.reloadTools();
    
    logger.info('POST /api/v1/mcp/tools/reload - Operation successful');
    
    res.json({
      success: true,
      code: 200,
      message: 'MCP工具重新加载成功',
      data: {
        stats: mcpManager.getStats(),
        reload_time: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('MCP工具重新加载失败', { error: error.message, stack: error.stack });
    throw error;
  }
}));

/**
 * 获取MCP管理器统计信息
 */
router.get('/stats', asyncErrorHandler(async (req, res) => {
  logger.info('GET /api/v1/mcp/stats - Request received');
  logger.info('GET /api/v1/mcp/stats - Operation successful');
  res.json({
    success: true,
    code: 200,
    message: '获取MCP统计信息成功',
    data: mcpManager.getStats(),
    timestamp: new Date().toISOString()
  });
}));

// 临时调试路由，用于直接查看 mcp_tools 表的内容
router.get('/debug-dump', async (req, res, next) => {
  logger.info('GET /api/v1/mcp/debug-dump - Request received');
  try {
    db.all('SELECT * FROM mcp_tools', [], (err, rows) => {
      if (err) {
        logger.error('GET /api/v1/mcp/debug-dump - Database error', { error: err.message, stack: err.stack });
        return res.status(500).json({ success: false, error: err.message });
      }
      logger.info('GET /api/v1/mcp/debug-dump - Operation successful');
      res.status(200).json({ success: true, data: rows });
    });
  } catch (error) {
    logger.error('GET /api/v1/mcp/debug-dump - Unexpected error', { error: error.message, stack: error.stack });
    next(error);
  }
});

module.exports = router;
