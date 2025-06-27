const db = require('../database/init.js');
const CSGClient = require('./csgClient');
const vikaService = require('./vikaService');
const AgentResponseParser = require('./agentResponseParser');
const { globalConfig } = require('../config/globalConfig');
const logger = require('../utils/logger');
// 辅助函数，将回调风格的db调用Promise化
const dbGet = (sql, params) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => {
    if (err) reject(err);
    else resolve(row);
  });
});

const dbAll = (sql, params) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => {
    if (err) reject(err);
    else resolve(rows);
  });
});

const dbRun = (sql, params) => new Promise((resolve, reject) => {
  db.run(sql, params, function(err) {
    if (err) reject(err);
    else resolve(this);
  });
});

/**
 * 任务执行器 - 处理A2A智能体调度和任务执行
 */
class TaskExecutor {
  constructor() {
    this.db = db;
    this.csgClient = new CSGClient();
    this.vikaService = vikaService;
    this.responseParser = new AgentResponseParser();
  }

  /**
   * 执行任务
   * @param {string} taskIdFromRoute - 从路由传入的任务ID
   * @returns {Promise<void>}
   */
  async executeTask(taskRecord) {
    // 任务对象现在被直接注入，不再需要从数据库查询
    logger.info(`开始执行任务: ${taskRecord.id}`);

    // 检查传入的 taskRecord 是否有效
    if (!taskRecord || !taskRecord.id) {
      logger.error('任务执行失败: 接收到一个无效的任务记录对象。', { taskRecord });
      return;
    }

    const taskId = taskRecord.id;

    // 将任务状态更新为 'running'
    await dbRun('UPDATE tasks SET status = ?, started_at = ? WHERE id = ?', ['running', new Date().toISOString(), taskId]);

    try {
      // 获取输入源配置
      const inputSource = await this.getInputSourceConfig(taskRecord.source_id);
      if (!inputSource || Object.keys(inputSource).length === 0) {
        throw new Error(`输入源配置不存在 (ID: ${taskRecord.source_id})`);
      }

      // 获取起始智能体
      // agent_id 现在直接从 taskRecord 中获取，该对象由 tasks.js 路由构建
      const startAgent = await this.getAgentConfig(taskRecord.agent_id);
      if (!startAgent || Object.keys(startAgent).length === 0) {
        throw new Error(`起始智能体配置不存在 (ID: ${taskRecord.agent_id})`);
      }

      // 解析输入参数
      const inputData = JSON.parse(taskRecord.input_data || '{}');


      // 执行智能体链路
      const result = await this.executeAgentChain(taskId, startAgent, inputData.input, {
        context: inputData.context || {},
        maxDepth: 10 // 最大调用深度
      });

      // 更新任务状态为 'completed'
      await dbRun(
        'UPDATE tasks SET status = ?, result = ?, finished_at = ? WHERE id = ?',
        ['completed', JSON.stringify(result), new Date().toISOString(), taskId]
      );

      logger.info(`任务执行完成: ${taskId}`, { result });

    } catch (error) {
      logger.error(`任务执行失败: ${taskId}`, { error: error.message, stack: error.stack });
      // 更新任务状态为 'failed'
      await dbRun(
        'UPDATE tasks SET status = ?, error = ?, finished_at = ? WHERE id = ?',
        ['failed', error.message, new Date().toISOString(), taskId]
      );
    }
  }

  /**
   * 执行智能体调用链
   * @param {string} taskId - 任务ID
   * @param {Object} agent - 智能体配置
   * @param {string} input - 输入内容
   * @param {Object} options - 执行选项
   * @returns {Promise<Object>} 执行结果
   */
  async executeAgentChain(taskId, agent, input, options = {}) {
    const { context = {}, depth = 0, maxDepth = 10 } = options;

    if (depth >= maxDepth) {
      throw new Error('达到最大调用深度限制');
    }

    const stepId = `step_${depth + 1}`;
    const stepStartTime = new Date().toISOString();
    
    // 记录步骤开始
    await dbRun(
        'INSERT INTO task_steps (task_id, step_id, agent_id, agent_name, input, context, status, started_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [taskId, stepId, agent.id, agent.name, input, JSON.stringify(context), 'running', stepStartTime]
    );


    try {
      logger.info(`执行智能体步骤: ${stepId}`, {
        agentId: agent.id,
        agentName: agent.name,
        depth
      });

      const systemPrompt = await this.responseParser.generateSystemPrompt(agent.agent_id);

      // csgClient.callAgent 内部会处理 AppKey 的获取逻辑
      // 第一个参数是 application 对象，第二个参数是 agentId
      // 根据最终分析，csgClient.callAgent 的正确签名应为 (agentId, appKey, input, options)
      // 此处 appKey 使用 agent 对象中的 app_id
      const response = await this.csgClient.callAgent(
        agent, // 重构：传递完整的 agent 对象
        input,
        {
          systemPrompt,
          temperature: agent.config?.temperature || 0.7,
          maxTokens: agent.config?.max_tokens || 2000
        }
      );

      if (!response.success) {
        throw new Error(`智能体调用失败: ${response.message}`);
      }

      const parsed = this.responseParser.parseAgentResponse(
        response.data.content,
        agent.id
      );

      const actionResults = [];
      for (const action of parsed.actions) {
        try {
          let actionResult;
          switch (action.type) {
            case 'vika_operation':
              actionResult = await this.executeVikaOperation(action);
              break;
            case 'task_transfer':
              actionResult = await this.executeTaskTransfer(taskId, action, options);
              break;
            case 'skill_call':
              actionResult = await this.executeSkillCall(action);
              break;
            case 'result':
              actionResult = await this.executeResultOutput(action);
              break;
            default:
              logger.warn(`未知操作类型: ${action.type}`);
              actionResult = { success: false, message: '未知操作类型' };
          }
          actionResults.push({ action, result: actionResult });
        } catch (error) {
          logger.error(`操作执行失败: ${action.type}`, { error: error.message });
          actionResults.push({ action, result: { success: false, error: error.message } });
        }
      }
      
      // 步骤完成，更新数据库记录
      await dbRun(
        'UPDATE task_steps SET response = ?, parsed_actions = ?, action_results = ?, status = ?, finished_at = ? WHERE task_id = ? AND step_id = ?',
        [JSON.stringify(response.data), JSON.stringify(parsed.actions), JSON.stringify(actionResults), 'completed', new Date().toISOString(), taskId, stepId]
      );


      return {
        stepId,
        agentId: agent.id,
        response: response.data,
        actions: parsed.actions,
        actionResults,
        hasStructuredOutput: parsed.hasStructuredOutput
      };

    } catch (error) {
       // 步骤失败，更新数据库记录
       await dbRun(
        'UPDATE task_steps SET error = ?, status = ?, finished_at = ? WHERE task_id = ? AND step_id = ?',
        [error.message, 'failed', new Date().toISOString(), taskId, stepId]
      );
      logger.error(`智能体步骤执行失败: ${stepId}`, { error: error.message });
      throw error;
    }
  }

  /**
   * 执行维格表操作
   * @param {Object} action - 维格表操作
   * @returns {Promise<Object>} 操作结果
   */
  async executeVikaOperation(action) {
    const validation = this.responseParser.validateVikaOperation(action);
    if (!validation.valid) {
      throw new Error(`维格表操作参数无效: ${validation.errors.join(', ')}`);
    }
    
    const { operation, datasheet, recordId, data, query, viewId } = action;
    
    logger.info(`执行维格表操作: ${operation}`, { datasheet, recordId });
    
    switch (operation) {
      case 'create':
        return await this.vikaService.createRecord(datasheet, data);
      case 'read':
        if (recordId) {
          return await this.vikaService.getRecord(datasheet, recordId);
        } else {
          return await this.vikaService.getRecords(datasheet, { viewId, ...query });
        }
      case 'update':
        return await this.vikaService.updateRecord(datasheet, recordId, data);
      case 'delete':
        return await this.vikaService.deleteRecord(datasheet, recordId);
      case 'list':
        return await this.vikaService.getRecords(datasheet, { viewId, ...query });
      default:
        throw new Error(`不支持的维格表操作: ${operation}`);
    }
  }

  /**
   * 执行任务传递
   * @param {string} taskId - 当前任务ID
   * @param {Object} action - 任务传递操作
   * @param {Object} parentOptions - 父级选项
   * @returns {Promise<Object>} 传递结果
   */
  async executeTaskTransfer(taskId, action, parentOptions) {
    const validation = this.responseParser.validateTaskTransfer(action);
    if (!validation.valid) {
      throw new Error(`任务传递参数无效: ${validation.errors.join(', ')}`);
    }
    
    const targetAgent = await this.getAgentConfig(action.targetAgent);
    if (!targetAgent) {
      throw new Error(`目标智能体不存在: ${action.targetAgent}`);
    }
    
    logger.info(`任务传递到智能体: ${action.targetAgent}`, { task: action.task });
    
    return await this.executeAgentChain(
      taskId,
      targetAgent,
      action.task,
      {
        context: { ...parentOptions.context, ...action.context },
        depth: (parentOptions.depth || 0) + 1,
        maxDepth: parentOptions.maxDepth
      }
    );
  }

  /**
   * 执行技能调用
   * @param {Object} action - 技能调用操作
   * @returns {Promise<Object>} 技能执行结果
   */
  async executeSkillCall(action) {
    logger.info(`执行技能调用: ${action.skill}`, { parameters: action.parameters });
    return {
      success: true,
      skill: action.skill,
      result: `技能 ${action.skill} 执行完成`,
      parameters: action.parameters
    };
  }

  /**
   * 执行结果输出
   * @param {Object} action - 结果输出操作
   * @returns {Promise<Object>} 输出结果
   */
  async executeResultOutput(action) {
    logger.info('执行结果输出', { data: action.data, destination: action.destination });
    return {
      success: true,
      data: action.data,
      format: action.format,
      destination: action.destination
    };
  }

  /**
   * 获取输入源配置
   * @param {string} inputSourceId - 输入源ID
   * @returns {Promise<Object|null>} 输入源配置
   */
  async getInputSourceConfig(inputSourceId) {
    const row = await dbGet('SELECT * FROM input_sources WHERE id = ?', [inputSourceId]);
    if (row && row.config) {
      try {
        row.config = JSON.parse(row.config);
      } catch (e) {
        logger.error(`解析输入源配置失败 (ID: ${inputSourceId})`, { error: e.message });
        // 根据业务决定是返回null还是抛出错误
        return null;
      }
    }
    return row;
  }

  /**
   * 获取智能体配置
   * @param {string} agentId - 智能体ID
   * @returns {Promise<Object|null>} 智能体配置
   */
  async getAgentConfig(agentId) {
    const sql = `
      SELECT
        a.id,
        a.agent_id,
        a.agent_name,
        a.responsibilities_and_functions,
        a.config,
        a.model,
        a.status,
        app.app_id,
        app.app_secret,
        app.app_name,
        app.base_url,
        app.environment_type
      FROM agents a
      JOIN applications app ON a.app_id = app.app_id
      WHERE a.agent_id = ?
    `;
    const row = await dbGet(sql, [agentId]);
    if (row) {
      try {
        // capabilities is now dynamically fetched, no need to parse from agent table
        if (row.config) row.config = JSON.parse(row.config);
      } catch(e) {
        logger.error(`解析智能体配置失败 (ID: ${agentId})`, { error: e.message });
        return null;
      }
    }
    return row;
  }
}

module.exports = new TaskExecutor();