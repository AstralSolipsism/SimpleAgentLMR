/**
 * 智能体管理路由
 */

const express = require('express');
const router = express.Router();
const { db } = require('../database/init');
const logger = require('../utils/logger');
const { asyncErrorHandler, ValidationError, NotFoundError, ConflictError } = require('../middleware/errorHandler');
const CSGClient = require('../services/csgClient');
const csgClientManager = require('../services/csgClient');
const { getCurrentEnvironment } = require('../config/environment');

/**
 * 获取智能体列表
 */
router.get('/', asyncErrorHandler(async (req, res) => {
  logger.info('GET /api/v1/agents - 收到请求', { query: req.query });

  const { page = 1, pageSize = 20, status, app_id, search } = req.query;
  const offset = (page - 1) * pageSize;
  
  let sql = `
    SELECT
      a.id, a.agent_id as "agentId", a.app_id, a.agent_name, a.responsibilities_and_functions,
      a.config, a.status, a.model, a.created_at as "createdAt",
      app.app_name, app.base_url,
      (
        SELECT JSON_GROUP_ARRAY(
          JSON_OBJECT(
            'capability_type', ac.capability_type,
            'target_id', ac.target_id,
            'target_name', ac.target_name,
            'config', ac.config,
            'displayName', CASE
                              WHEN ac.capability_type = 'mcp_tool' THEN mt.display_name
                              ELSE ac.target_name
                            END
          )
        )
        FROM agent_capabilities ac
        LEFT JOIN mcp_tools mt ON ac.target_id = mt.tool_name AND ac.capability_type = 'mcp_tool'
        WHERE ac.agent_id = a.agent_id
      ) as capabilities_json
    FROM agents a
    LEFT JOIN applications app ON a.app_id = app.app_id
    WHERE 1=1
  `;
 const currentEnv = getCurrentEnvironment();
 let countSql = 'SELECT COUNT(*) as total FROM agents a LEFT JOIN applications app ON a.app_id = app.app_id WHERE 1=1';
 const params = [];

 // 环境筛选
 sql += ' AND app.environment_type = ?';
 countSql += ' AND app.environment_type = ?';
 params.push(currentEnv.name);
 
 // 状态筛选
  if (status) {
    sql += ' AND a.status = ?';
    countSql += ' AND a.status = ?';
    params.push(status);
  }
  
  // 应用筛选
  if (app_id) {
    sql += ' AND a.app_id = ?';
    countSql += ' AND a.app_id = ?';
    params.push(app_id);
  }
  
  // 搜索筛选
  if (search) {
    sql += ' AND (a.agent_name LIKE ? OR a.responsibilities_and_functions LIKE ?)';
    countSql += ' AND (a.agent_name LIKE ? OR a.responsibilities_and_functions LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }
  
  sql += ' GROUP BY a.id';
  sql += ' ORDER BY a.created_at DESC LIMIT ? OFFSET ?';
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
    const agents = await new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    // 解析JSON字段
    const processedAgents = agents.map(agent => ({
      ...agent,
      capabilities: agent.capabilities_json ? JSON.parse(agent.capabilities_json) : [],
      config: agent.config ? JSON.parse(agent.config) : {}
    }));
    
    
    logger.info('GET /api/v1/agents - 操作成功');
    res.json({
      success: true,
      code: 200,
      message: '获取智能体列表成功',
      data: {
        items: processedAgents,
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
    logger.error('获取智能体列表失败', { error: error.message, stack: error.stack });
    throw error;
  }
}));

/**
 * 获取智能体详情
 */
router.get('/:agentId', asyncErrorHandler(async (req, res) => {
  const { agentId } = req.params;
  logger.info(`GET /api/v1/agents/${agentId} - 收到请求`, { params: req.params });

  try {
    // 获取智能体信息
    const agent = await new Promise((resolve, reject) => {
      const sql = `
        SELECT
          a.id, a.agent_id as "agentId", a.app_id, a.agent_name, a.responsibilities_and_functions,
          a.config, a.status, a.model,
          a.created_at as "createdAt",
          app.app_name, app.app_secret, app.base_url, app.environment_type
        FROM agents a
        LEFT JOIN applications app ON a.app_id = app.app_id
        WHERE a.agent_id = ?
      `;
      
      db.get(sql, [agentId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!agent) {
      throw new NotFoundError('智能体不存在');
    }
    
    // 获取智能体能力
    const capabilities = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM agent_capabilities WHERE agent_id = ?', [agentId], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    // 处理能力数据
    const processedCapabilities = capabilities.map(cap => ({
      ...cap,
      config: cap.config ? JSON.parse(cap.config) : {}
    }));
    
    
    logger.info(`GET /api/v1/agents/${agentId} - 操作成功`);
    res.json({
      success: true,
      code: 200,
      message: '获取智能体详情成功',
      data: {
        ...agent,
        config: agent.config ? JSON.parse(agent.config) : {},
        capabilities: processedCapabilities
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error(`获取智能体详情失败，agentId: ${agentId}`, { error: error.message, stack: error.stack });
    throw error;
  }
}));

/**
 * 注册新智能体 (已重构)
 */
router.post('/', asyncErrorHandler(async (req, res) => {
  // 请求体中包含敏感数据，仅记录非敏感字段
  logger.info('POST /api/v1/agents - 收到请求', { body: { agent_id: req.body.agent_id, app_id: req.body.app_id, agent_name: req.body.agent_name, model: req.body.model } });

  const {
    agent_id,
    app_id,
    agent_name,
    responsibilities_and_functions,
    config,
    model,
    subordinate_agent_ids = [],
    allowed_tool_names = []
  } = req.body;

  // 参数验证
  if (!agent_id || !app_id || !agent_name) {
    throw new ValidationError('智能体ID、应用ID和智能体名称不能为空');
  }

  try {
    // 检查应用是否存在
    const application = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM applications WHERE app_id = ?', [app_id], (err, row) => {
        if (err) reject(err); else resolve(row);
      });
    });
    if (!application) throw new NotFoundError('指定的应用不存在');

    // 检查智能体ID是否已存在
    const existingAgent = await new Promise((resolve, reject) => {
      db.get('SELECT agent_id FROM agents WHERE agent_id = ?', [agent_id], (err, row) => {
        if (err) reject(err); else resolve(row);
      });
    });
    if (existingAgent) throw new ConflictError('智能体ID已存在');

    // 事务处理
    db.serialize(async () => {
      try {
        db.run('BEGIN TRANSACTION');

        // 1. 插入主表
        const configJson = config ? JSON.stringify(config) : '{}';
        const agentSql = `
          INSERT INTO agents (agent_id, app_id, agent_name, responsibilities_and_functions, config, model)
          VALUES (?, ?, ?, ?, ?, ?)
        `;
        // 注意：capabilities 字段保留，但不再由这个API直接填充复杂逻辑，可以存空或基础信息
        await new Promise((resolve, reject) => {
          db.run(agentSql, [agent_id, app_id, agent_name, responsibilities_and_functions || '', configJson, model], function(err) {
            if (err) reject(err); else resolve({ id: this.lastID });
          });
        });

        // 2. 插入子智能体能力
        if (subordinate_agent_ids && subordinate_agent_ids.length > 0) {
          const capStmt = db.prepare('INSERT INTO agent_capabilities (agent_id, capability_type, target_id, target_name) VALUES (?, ?, ?, ?)');
          for (const subAgentId of subordinate_agent_ids) {
            // 在实际应用中，你可能需要查询sub-agent的名称
            await new Promise((resolve, reject) => {
              capStmt.run([agent_id, 'sub_agent', subAgentId, subAgentId], (err) => {
                if (err) reject(err); else resolve();
              });
            });
          }
          capStmt.finalize();
        }

        // 3. 插入工具能力
        if (allowed_tool_names && allowed_tool_names.length > 0) {
          const toolStmt = db.prepare('INSERT INTO agent_capabilities (agent_id, capability_type, target_id, target_name) VALUES (?, ?, ?, ?)');
          for (const toolName of allowed_tool_names) {
             await new Promise((resolve, reject) => {
              toolStmt.run([agent_id, 'mcp_tool', toolName, toolName], (err) => {
                 if (err) reject(err); else resolve();
              });
            });
          }
          toolStmt.finalize();
        }

        db.run('COMMIT');
        
        logger.info(`POST /api/v1/agents - 操作成功，agentId: ${agent_id}`);
        res.status(201).json({
          success: true,
          code: 201,
          message: '智能体注册成功',
          data: {
            agentId: agent_id,
            app_id,
            agent_name,
            responsibilities_and_functions: responsibilities_and_functions || '',
            config: config || {},
            subordinate_agent_ids,
            allowed_tool_names,
            status: 'active',
            createdAt: new Date().toISOString()
          },
          timestamp: new Date().toISOString()
        });

      } catch (txError) {
        db.run('ROLLBACK');
        logger.error('智能体注册事务失败', { error: txError.message, stack: txError.stack });
        throw txError; // 抛出给 asyncErrorHandler 处理
      }
    });
  } catch (error) {
    // 这个 catch 用于捕获事务开始前的验证错误
    logger.error('智能体注册失败', { error: error.message, stack: error.stack });
    throw error;
  }
}));

/**
 * 更新智能体信息 (已重构)
 */
router.put('/:agentId', asyncErrorHandler(async (req, res) => {
  const { agentId } = req.params;
  // 请求体中包含敏感数据，仅记录非敏感字段
  logger.info(`PUT /api/v1/agents/${agentId} - 收到请求`, { params: req.params, body: { agent_name: req.body.agent_name, status: req.body.status, model: req.body.model } });

  const {
    agent_name,
    responsibilities_and_functions,
    config,
    status,
    model,
    subordinate_agent_ids,
    allowed_tool_names
  } = req.body;

  try {
    // 检查智能体是否存在
    const existingAgent = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM agents WHERE agent_id = ?', [agentId], (err, row) => {
        if (err) reject(err); else resolve(row);
      });
    });
    if (!existingAgent) throw new NotFoundError('智能体不存在');

    // 事务处理
    db.serialize(async () => {
      try {
        db.run('BEGIN TRANSACTION');

        // 1. 更新主表
        const updateFields = [];
        const updateValues = [];
        if (agent_name !== undefined) { updateFields.push('agent_name = ?'); updateValues.push(agent_name); }
        if (responsibilities_and_functions !== undefined) { updateFields.push('responsibilities_and_functions = ?'); updateValues.push(responsibilities_and_functions); }
        if (config !== undefined) { updateFields.push('config = ?'); updateValues.push(JSON.stringify(config)); }
        if (status !== undefined) { updateFields.push('status = ?'); updateValues.push(status); }
        if (model !== undefined) { updateFields.push('model = ?'); updateValues.push(model); }

        if (updateFields.length > 0) {
          updateFields.push('updated_at = CURRENT_TIMESTAMP');
          updateValues.push(agentId);
          const agentSql = `UPDATE agents SET ${updateFields.join(', ')} WHERE agent_id = ?`;
          await new Promise((resolve, reject) => {
            db.run(agentSql, updateValues, (err) => { if (err) reject(err); else resolve(); });
          });
        }

        // 2. 删除旧的能力
        await new Promise((resolve, reject) => {
          db.run('DELETE FROM agent_capabilities WHERE agent_id = ?', [agentId], (err) => {
            if (err) reject(err); else resolve();
          });
        });

        // 3. 插入新的子智能体能力
        if (subordinate_agent_ids && subordinate_agent_ids.length > 0) {
          const capStmt = db.prepare('INSERT INTO agent_capabilities (agent_id, capability_type, target_id, target_name) VALUES (?, ?, ?, ?)');
          for (const subAgentId of subordinate_agent_ids) {
            await new Promise((resolve, reject) => {
              capStmt.run([agentId, 'sub_agent', subAgentId, subAgentId], (err) => { if (err) reject(err); else resolve(); });
            });
          }
          capStmt.finalize();
        }

        // 4. 插入新的工具能力
        if (allowed_tool_names && allowed_tool_names.length > 0) {
          const toolStmt = db.prepare('INSERT INTO agent_capabilities (agent_id, capability_type, target_id, target_name) VALUES (?, ?, ?, ?)');
          for (const toolName of allowed_tool_names) {
            await new Promise((resolve, reject) => {
              toolStmt.run([agentId, 'mcp_tool', toolName, toolName], (err) => { if (err) reject(err); else resolve(); });
            });
          }
          toolStmt.finalize();
        }

        db.run('COMMIT');

        // 获取更新后的完整数据
        const updatedAgent = await new Promise((resolve, reject) => {
            const sql = `SELECT a.id, a.agent_id as "agentId", a.app_id, a.agent_name, a.responsibilities_and_functions, a.config, a.status, a.model, a.created_at as "createdAt" FROM agents a WHERE a.agent_id = ?`;
            db.get(sql, [agentId], (err, row) => { if (err) reject(err); else resolve(row); });
        });


        logger.info(`PUT /api/v1/agents/${agentId} - 操作成功`);
        res.json({
          success: true,
          code: 200,
          message: '智能体更新成功',
          data: {
            ...updatedAgent,
            config: updatedAgent.config ? JSON.parse(updatedAgent.config) : {},
            subordinate_agent_ids: subordinate_agent_ids || [],
            allowed_tool_names: allowed_tool_names || []
          },
          timestamp: new Date().toISOString()
        });

      } catch (txError) {
        db.run('ROLLBACK');
        logger.error('智能体更新事务失败', { agent_id: agentId, error: txError.message, stack: txError.stack });
        throw txError;
      }
    });
  } catch (error) {
    logger.error('智能体更新失败', { agent_id: agentId, error: error.message, stack: error.stack });
    throw error;
  }
}));

/**
 * 删除智能体
 */
router.delete('/:agentId', asyncErrorHandler(async (req, res) => {
  const { agentId } = req.params;
  logger.info(`DELETE /api/v1/agents/${agentId} - 收到请求`, { params: req.params });
  
  try {
    // 检查智能体是否存在
    const existingAgent = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM agents WHERE agent_id = ?', [agentId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!existingAgent) {
      throw new NotFoundError('智能体不存在');
    }
    
    // 检查是否有关联的输入源或正在执行的任务
    const inputSourceCount = await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as count FROM input_sources WHERE agent_id = ?', [agentId], (err, row) => {
        if (err) reject(err);
        else resolve(row.count);
      });
    });
    
const runningTaskCount = await new Promise((resolve, reject) => {
  db.get('SELECT COUNT(*) as count FROM tasks WHERE agent_id = ? AND status IN ("pending", "running")', [agentId], (err, row) => {
    if (err) reject(err);
    else resolve(row ? row.count : 0);
  });
});
    
    if (inputSourceCount > 0) {
      throw new ConflictError('无法删除智能体，该智能体有关联的输入源');
    }
    
    if (runningTaskCount > 0) {
      throw new ConflictError('无法删除智能体，该智能体有正在执行的任务');
    }
    
    // 删除智能体（关联的能力和日志会通过外键约束自动删除）
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM agents WHERE agent_id = ?', [agentId], function(err) {
        if (err) reject(err);
        else resolve();
      });
    });
    
    
    logger.info(`DELETE /api/v1/agents/${agentId} - 操作成功`);
    
    res.json({
      success: true,
      code: 200,
      message: '智能体删除成功',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('智能体删除失败', { agent_id: agentId, error: error.message, stack: error.stack });
    throw error;
  }
}));

/**
 * 测试智能体连接
 */
router.post('/:agentId/test', asyncErrorHandler(async (req, res) => {
  const { agentId } = req.params;
  logger.info(`POST /api/v1/agents/${agentId}/test - 收到请求`, { params: req.params });
  
  try {
    // 获取智能体和应用信息
    const agent = await new Promise((resolve, reject) => {
      const sql = `
        SELECT a.*, app.app_secret, app.base_url, app.environment_type
        FROM agents a
        LEFT JOIN applications app ON a.app_id = app.app_id
        WHERE a.agent_id = ?
      `;
      
      db.get(sql, [agentId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!agent) {
      throw new NotFoundError('智能体不存在');
    }
    
    
    // 使用CSG客户端测试连接
    const testResult = await csgClientManager.testConnection(
      agent, // 传递完整的agent对象，其中包含了application的信息
      agentId
    );
    
    logger.info(`POST /api/v1/agents/${agentId}/test - 操作成功`);
    
    const responsePayload = {
      success: testResult.success,
      code: testResult.success ? 200 : 500,
      data: {
        agent_id: agentId,
        agent_name: agent.agent_name,
        test_result: testResult,
        test_time: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    };

    if (testResult.success) {
      responsePayload.message = testResult.message;
    } else {
      responsePayload.error = testResult.message;
    }

    res.status(responsePayload.code).json(responsePayload);
    
  } catch (error) {
    logger.error('智能体连接测试失败', { agent_id: agentId, error: error.message, stack: error.stack });
    res.json({ success: false, error: error.message });
  }
}));

/*
 * 以下关于 /:agentId/capabilities 的路由已被废弃。
 * 其功能已整合到 POST / 和 PUT /:agentId 的事务性操作中。
 * 为了保持API的整洁性，这些路由已被移除。
 */

module.exports = router;
