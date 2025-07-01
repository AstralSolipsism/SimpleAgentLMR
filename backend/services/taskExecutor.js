const { db } = require('../database/init.js');
const CSGClient = require('./csgClient');
const vikaService = require('./vikaService');
const AgentResponseParser = require('./agentResponseParser');
const { globalConfig } = require('../config/globalConfig');
const logger = require('../utils/logger');
const mcpManager = require('./mcpManager');
const llmService = require('./llmService');
const { Task } = require('../database/models');
const { v4: uuidv4 } = require('uuid');
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
    this.csgClient = require('./csgClient');
    this.vikaService = vikaService;
    this.responseParser = new AgentResponseParser();
  }

  /**
   * 执行任务
   * @param {Object} taskRecord - 从数据库获取的任务记录对象
   * @returns {Promise<void>}
   */
  async executeTask(taskRecord) {
    // 任务对象现在被直接注入，不再需要从数据库查询
    logger.info('任务开始执行', { taskId: taskRecord.id, agent_id: taskRecord.agent_id });

    // 检查传入的 taskRecord 是否有效
    if (!taskRecord || !taskRecord.id) {
      logger.error('任务执行失败: 接收到一个无效的任务记录对象。', { taskRecord });
      return;
    }

    const taskId = taskRecord.id;

    // 将任务状态更新为 'running'
    await dbRun('UPDATE tasks SET status = ?, started_at = ? WHERE id = ?', ['running', new Date().toISOString(), taskId]);

    try {
      // 获取输入源配置 (对于A2A子任务，source_id可能为null，此时不需要获取输入源配置)
      let inputSource = {};
      if (taskRecord.source_id) {
        inputSource = await this.getInputSourceConfig(taskRecord.source_id);
        if (!inputSource || Object.keys(inputSource).length === 0) {
          throw new Error(`输入源配置不存在 (ID: ${taskRecord.source_id})`);
        }
      }

      // 获取起始智能体
      const startAgent = await this.getAgentConfig(taskRecord.agent_id);
      if (!startAgent || Object.keys(startAgent).length === 0) {
        throw new Error(`起始智能体配置不存在 (ID: ${taskRecord.agent_id})`);
      }

      // 解析输入参数
      const inputData = JSON.parse(taskRecord.input_data || '{}');


      // 执行智能体链路
      // 主要执行逻辑现已封装在 executeAgentChain 中
      const result = await this.executeAgentChain(taskRecord);

      // 根据结构化结果进行执行后的状态更新
      if (result && result.type === 'delegation') {
        // 对于异步 a2a-task，状态已在链中更新为 'delegated'
        // 此处记录日志以保持清晰
        logger.info('任务已成功委托 (delegation)', { taskId: taskRecord.id, details: result.details });
      } else if (result && result.type === 'completion') {
        // 对于正常完成的任务，我们更新状态和最终结果
        await dbRun(
          'UPDATE tasks SET status = ?, result = ?, finished_at = ? WHERE id = ?',
          ['completed', JSON.stringify(result.result), new Date().toISOString(), taskId]
        );
        logger.info('任务成功完成 (completion)', { taskId, result: result.result });
        // 当任务完成时，检查是否需要唤醒父任务
        if (taskRecord.parent_task_id) {
          this.wakeupParentTask(taskRecord.parent_task_id);
        }
      } else if (result && result.type === 'task_transfer') {
        // 如果仍在使用，则处理旧的 'task_transfer' 机制
        const { targetAgent, task, context } = result.details;
        // 创建子任务记录 - 【修复】确保 context 参数被正确传递
        const subTask = await createSubTask(targetAgent, task, context, taskId);
        // 异步执行新任务
        setImmediate(() => {
            this.executeTask(subTask).catch(err => {
                logger.error(`后台执行委托任务失败: ${subTask.id}`, { error: err.message, stack: err.stack });
            });
        });
        // 将当前任务更新为 'delegated'
        await this.updateTask(taskId, { status: 'delegated', output: '任务已成功委托给下一个智能体。' });
        return;
      }

    } catch (error) {
      logger.error('任务因错误失败', { taskId, error: error.message, stack: error.stack });
      // 更新任务状态为 'failed'
      await dbRun(
        'UPDATE tasks SET status = ?, error = ?, finished_at = ? WHERE id = ?',
        ['failed', error.message, new Date().toISOString(), taskId]
      );
    }
  }

  /**
   * 执行智能体调用链 (ReAct模式)
   * 此函数实现了一个ReAct (Reasoning and Acting)循环来逐步完成任务。
   * 它不再使用递归调用，而是通过一个while循环来模拟智能体的“思考->行动->观察”过程。
   * @param {string} taskId - 任务ID
   * @param {Object} agentConfig - 智能体的完整配置对象
   * @param {string} userInput - 用户的初始输入
   * @param {Object} options - 执行选项 (主要是 context)
   * @returns {Promise<Object>} 最终执行结果
   */
  async executeAgentChain(task) {
    const taskId = task.id;

    const agentConfig = await this.getAgentConfig(task.agent_id);
    const inputData = JSON.parse(task.input_data || '{}');
    const options = { context: inputData.context || {} };
    let userInput = inputData.input; // 原始输入

    // 修复通信协议：如果这是一个子任务，则将上下文格式化并附加到输入中
    if (task.parent_task_id && options.context && Object.keys(options.context).length > 0) {
      userInput += `\n\n父任务提供的上下文 (Context): ${JSON.stringify(options.context, null, 2)}`;
      logger.info('已为子任务附加了父任务的上下文', { taskId: task.id });
    }

    const maxSteps = 10;
    const history = [];
    let finalAnswer = null;

    const systemPrompt = await this.responseParser.generateSystemPrompt(agentConfig.agent_id);
    history.push({ role: 'system', content: systemPrompt });
    if (agentConfig.environment_type) {
      agentConfig.llm_env = agentConfig.environment_type;
    }

    // 步骤3：恢复完整历史并注入子任务结果
    const previousSteps = await dbAll('SELECT * FROM task_steps WHERE task_id = ? ORDER BY started_at ASC', [taskId]);
    let currentStep = previousSteps.length > 0 ? previousSteps.length -1 : 0;

    if (previousSteps.length > 0) {
      // 如果有历史步骤，则重建历史
      for (const step of previousSteps) {
        if (step.input) {
          history.push({ role: 'user', content: step.input });
        }
        if (step.response) {
          const responseData = JSON.parse(step.response);
          if (responseData && responseData.raw_response) {
            history.push({ role: 'assistant', content: responseData.raw_response });
          }
        }
      }
    } else {
      // 如果是首次运行，则添加初始输入
      history.push({ role: 'user', content: userInput });
    }

    // 如果任务是从“暂停”状态恢复，则添加子任务的结果作为新的观察信息
    // 如果任务是从“暂停”状态恢复，则添加子任务的结果作为新的观察信息
    if (task.status === 'delegated') {
      const lastSubTask = await dbGet(
        "SELECT result FROM tasks WHERE parent_task_id = ? AND status = 'completed' ORDER BY finished_at DESC LIMIT 1",
        [taskId]
      );

      if (lastSubTask && lastSubTask.result) {
        let subTaskResult;
        try {
          // 子任务的结果本身可能是一个JSON字符串，也可能包含```json ... ```块
          let cleanedResult = lastSubTask.result;
          const jsonMatch = cleanedResult.match(/```(?:json:result|json)?\s*([\s\S]*?)\s*```/);
          if (jsonMatch && jsonMatch[1]) {
            cleanedResult = jsonMatch[1].trim();
          }
          subTaskResult = JSON.parse(cleanedResult);
        } catch (parseError) {
          logger.warn('无法将子任务结果解析为JSON，将作为原始文本使用。', { taskId, subTaskResult: lastSubTask.result, error: parseError.message });
          subTaskResult = lastSubTask.result; // 如果解析失败，则按原样使用
        }

        const observation = {
            role: 'user',
            content: `Observation:\n\`\`\`json:result\n${JSON.stringify(subTaskResult, null, 2)}\n\`\`\``
        };
        history.push(observation);
        logger.info(`已为任务 ${task.id} 注入上一步的观察结果。`);

        // 将父任务状态更新回 'running'
        // 关键修复：在更新状态的同时，显式地保留原始的 agent_id
        await dbRun("UPDATE tasks SET status = 'running', agent_id = ? WHERE id = ?", [task.agent_id, taskId]);
        logger.info(`任务 ${taskId} 已成功恢复，并载入了子任务的结果。`);
      } else {
        logger.warn(`任务 ${taskId} 正在恢复，但未找到已完成的子任务结果。`);
      }
    }

    // 在循环开始前，如果是首次运行 (没有历史步骤)，则记录初始输入作为第0步
    if (previousSteps.length === 0) {
      await dbRun(
        'INSERT INTO task_steps (task_id, step_id, agent_id, agent_name, input, context, status, started_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [taskId, 'step_0', agentConfig.id, agentConfig.name, userInput, JSON.stringify(options.context || {}), 'completed', new Date().toISOString()]
      );
    }

    while (currentStep < maxSteps) {
      currentStep++;
      logger.info(`开始执行第 ${currentStep} 步`, { taskId, current_agent_id: agentConfig.agent_id });
      const stepId = `step_${currentStep}`;
      const stepStartTime = new Date().toISOString();

      logger.trace('向大模型发送的完整消息:', JSON.stringify(history, null, 2));
      const response = await llmService.invokeLLM(history, agentConfig);
      logger.trace('从大模型收到的原始响应:', JSON.stringify(response, null, 2));
      if (!response || !response.content) {
        throw new Error('LLM did not return a valid response.');
      }

      const parsedResponse = this.responseParser.parseAgentResponse(response.content.content, agentConfig.agent_id, { react_mode: true });
      const thought = parsedResponse.thought;
      let action = parsedResponse.actions.length > 0 ? parsedResponse.actions[0] : null;

      // 修复：增加一个更通用的“救援”机制。如果主解析器未能提取出 Action，但响应文本中明显包含了任何可执行的 Action（如 skill-call），
      // 我们将尝试进行一次补救性解析，以防止任务被错误地标记为完成。
      if (!action && parsedResponse.content) {
        const actionPatterns = {
          'skill_call': /```json:skill-call\s*([\s\S]*?)\s*```/,
          'task_transfer': /```json:task_transfer\s*([\s\S]*?)\s*```/
        };

        for (const [type, pattern] of Object.entries(actionPatterns)) {
          const match = parsedResponse.content.match(pattern);
          if (match && match[1]) {
            logger.warn(`主解析器未能提取 Action，但检测到 ${type} 意图。正在尝试救援解析...`);
            try {
              const jsonData = JSON.parse(match[1].trim());
              let isValid = false;
              if (type === 'skill_call' && jsonData.skill && jsonData.parameters) {
                action = { type: 'skill_call', skill: jsonData.skill, parameters: jsonData.parameters };
                isValid = true;
              } else if (type === 'task_transfer' && jsonData.targetAgent && jsonData.task) {
                action = { type: 'task_transfer', ...jsonData };
                isValid = true;
              }

              if (isValid) {
                logger.info(`成功从原始文本中救援出 ${type} Action。`, { rescuedAction: action });
                break; // 成功救援，跳出循环
              }
            } catch (e) {
              logger.error(`救援解析：尝试解析 ${type} JSON 代码块失败。`, { error: e.message });
            }
          }
        }
      }

      history.push({ role: 'assistant', content: response.content.content });
      
      await dbRun(
        'INSERT INTO task_steps (task_id, step_id, agent_id, agent_name, status, started_at, response, parsed_actions) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [taskId, stepId, agentConfig.id, agentConfig.name, 'running', stepStartTime, JSON.stringify({ thought, raw_response: response.content.content }), JSON.stringify(action ? [action] : [])]
      );

      if (!action || action.type === 'result') {
        // 确保 agentResponse 是从模型返回的原始字符串内容
        const agentResponse = action ? action.data : parsedResponse.content;

        // 1. 检查是否为 a2a-task (任务委托)
        const a2aMatch = typeof agentResponse === 'string' ? agentResponse.match(/```json:a2a-task\s*([\s\S]*?)\s*```/) : null;
        if (a2aMatch && a2aMatch[1]) {
            try {
                const parsed = JSON.parse(a2aMatch[1].trim());
                logger.info('检测到A2A任务派发请求 (异步委托)', { taskId: task.id, parsedFinalAnswer: parsed });
                await this.delegateTask(task, parsed);
                
                // 更新步骤状态
                const actionForDb = { type: 'a2a-task', ...parsed };
                const resultForDb = { success: true, message: 'Task delegated' };
                await dbRun(
                  'UPDATE task_steps SET status = ?, finished_at = ?, action_results = ? WHERE task_id = ? AND step_id = ?',
                  ['completed', new Date().toISOString(), JSON.stringify([{ action: actionForDb, result: resultForDb }]), taskId, stepId]
                );
                
                return { type: 'delegation', details: parsed }; // 委托后，当前任务执行结束
            } catch (e) {
                logger.error('解析 a2a-task JSON 失败，将按常规结果处理', { taskId: task.id, error: e.message });
            }
        }


        // 3. 如果以上都不是，则视为常规结果 (completion)
        let cleanedResult = agentResponse;
        if (typeof agentResponse === 'string') {
            const resultMatch = agentResponse.match(/```(?:json:result|json)?\s*([\s\S]*?)\s*```/);
            if (resultMatch && resultMatch[1]) {
                cleanedResult = resultMatch[1].trim();
            }
        }
        
        // 尝试将清理后的结果作为JSON存储，如果失败则作为原始文本存储
        let finalResultForDb;
        try {
            const finalJson = JSON.parse(cleanedResult);
            finalAnswer = finalJson;
            finalResultForDb = JSON.stringify(finalJson, null, 2);
        } catch (e) {
            finalAnswer = cleanedResult;
            finalResultForDb = cleanedResult;
        }

        // 更新步骤表
        const actionForDb = { type: 'result', data: finalAnswer };
        const resultForDb = { success: true, data: finalAnswer };
        await dbRun(
          'UPDATE task_steps SET status = ?, finished_at = ?, action_results = ? WHERE task_id = ? AND step_id = ?',
          ['completed', new Date().toISOString(), JSON.stringify([{ action: actionForDb, result: resultForDb }]), taskId, stepId]
        );

        // 更新任务表
        await dbRun('UPDATE tasks SET status = ?, result = ?, finished_at = ? WHERE id = ?', ['completed', finalResultForDb, new Date().toISOString(), task.id]);
        logger.info('任务成功完成 (completion)', { taskId: task.id });
        
        
        break; // 终止循环
      }

      let observation = '';
      let actionResult;
      try {
        // ** 新增：同步子智能体执行 **
        if (action.type === 'skill_call' && action.skill && action.skill.startsWith('agent:')) {
            const targetAgentId = action.skill.split(':')[1];
            const taskInput = (action.parameters && (action.parameters.task || action.parameters.input)) || '';
            observation = await executeSubAgentAndWait(targetAgentId, taskInput, taskId);
            actionResult = { success: true, result: observation };
        } else {
            switch (action.type) {
              case 'skill_call':
                actionResult = await this.executeSkillCall(action);
                break;
              case 'task_transfer':
                await dbRun(
                  'UPDATE task_steps SET status = ?, finished_at = ?, action_results = ? WHERE task_id = ? AND step_id = ?',
                  ['completed', new Date().toISOString(), JSON.stringify([{ action, result: { success: true, message: 'Task transferred' } }]), taskId, stepId]
                );
                return { type: 'task_transfer', details: action };
              default:
                actionResult = { success: false, message: `Unknown action type: ${action.type}` };
            }
            observation = `Observation: ${JSON.stringify(actionResult.result || actionResult.message || actionResult.error)}`;
        }
      } catch (error) {
        logger.error('任务步骤执行失败', { taskId, step: currentStep, action, error: error.message });
        actionResult = { success: false, error: error.message };
        observation = `Observation: Error: ${error.message}`;
      }
      
      await dbRun(
        'UPDATE task_steps SET status = ?, finished_at = ?, action_results = ? WHERE task_id = ? AND step_id = ?',
        [actionResult.success ? 'completed' : 'failed', new Date().toISOString(), JSON.stringify([{ action, result: actionResult }]), taskId, stepId]
      );

      history.push({ role: 'user', content: observation });
    }

    if (currentStep >= maxSteps) {
      logger.warn('任务因达到最大步骤限制而中断', { taskId, maxSteps });
      finalAnswer = finalAnswer || { error: 'Max steps reached' };
    }

    return { type: 'completion', result: finalAnswer };
  }

  /**
   * 唤醒父任务
   * @param {string} parentTaskId - 父任务ID
   */
  async wakeupParentTask(parentTaskId) {
    logger.info(`子任务完成，准备唤醒父任务 ${parentTaskId}`);
    setImmediate(async () => {
      try {
        const parentTask = await dbGet("SELECT * FROM tasks WHERE id = ?", [parentTaskId]);
        if (parentTask && parentTask.status === 'delegated') {
            // 原子性修复：立即更新状态，防止其他唤醒调用重复执行。
            // 我们只对状态为 'delegated' 的任务进行更新，这确保了只有一个调用能成功。
            const updateResult = await dbRun("UPDATE tasks SET status = 'running' WHERE id = ? AND status = 'delegated'", [parentTaskId]);

            // 检查更新是否真的影响了一行。如果 `changes` 是 0，意味着另一个进程已经抢先更新了它。
            if (updateResult.changes > 0) {
                logger.info(`准备将完整的父任务 ${parentTask.id} (Agent: ${parentTask.agent_id}) 重新执行。`);
                const executor = require('./taskExecutor');
                // 传递更新后的任务对象
                await executor.executeTask(parentTask);
            } else {
                logger.warn(`任务 ${parentTaskId} 的状态已被其他进程更新，本次唤醒操作被跳过。`);
            }
        } else if (parentTask) {
          logger.warn(`父任务 ${parentTask.id} 未处于 'delegated' 状态 (当前状态: ${parentTask.status})，无法唤醒。`);
        } else {
          logger.error(`无法找到ID为 ${parentTaskId} 的父任务记录。`);
        }
      } catch (e) {
        logger.error(`唤醒父任务 ${parentTaskId} 失败`, { error: e.message, stack: e.stack });
      }
    });
  }

  /**
   * 委托任务给另一个智能体
   * @param {Object} task - 当前任务对象
   * @param {Object} delegationData - 委托任务所需数据
   */
  async delegateTask(task, delegationData) {
    const { targetAgent, task: taskDescription, context } = delegationData;
    const subTask = await createSubTask(targetAgent, taskDescription, context, task.id);
    
    setImmediate(() => {
      module.exports.executeTask(subTask).catch(err => {
        logger.error(`后台执行委托任务失败: ${subTask.id}`, { error: err.message, stack: err.stack });
      });
    });

    // 关键修复：在更新状态为 'delegated' 的同时，必须显式地保留原始的 agent_id
    await dbRun(
      "UPDATE tasks SET status = ?, result = ?, finished_at = ?, agent_id = ? WHERE id = ?",
      ['delegated', JSON.stringify({ message: '任务已成功委托给下一个智能体。', a2a_task: delegationData }), new Date().toISOString(), task.agent_id, task.id]
    );
    
    logger.info('任务已成功委托 (delegation)', { taskId: task.id, details: delegationData });
  }

  /**
   * 更新任务状态和输出
   * @param {string} taskId - 任务ID
   * @param {object} data - 要更新的数据 { status, output }
   */
  async updateTask(taskId, data) {
    try {
      const { status, output } = data; // output 变量仍然保留，但不再用于数据库更新
      await dbRun(
        'UPDATE tasks SET status = ?, result = ?, finished_at = ? WHERE id = ?',
        [status, JSON.stringify({ output: output || data.result }), new Date().toISOString(), taskId] // 确保使用 result 列
      );
      logger.info('任务状态更新成功', { taskId, status });
    } catch (error) {
      logger.error('更新任务状态失败', { taskId, error: error.message });
    }
  }

  /**
   * 执行任务传递。
   * 在ReAct循环中，这被视为一个“最终行动”，它会终止当前的智能体链，
   * 并将控制权和任务移交给另一个智能体。
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
    
    // 调用另一个agent chain，有效地将任务传递出去。
    // 当前的ReAct循环将被调用者终止。
    return await this.executeAgentChain(
      taskId,
      targetAgent,
      action.task,
      {
        context: { ...parentOptions.context, ...action.context }
      }
    );
  }

  /**
   * 执行技能调用
   * @param {Object} action - 技能调用操作
   * @returns {Promise<Object>} 技能执行结果
   */
  async executeSkillCall(action) {
    const { skill, parameters } = action;
    logger.info('正在调用工具', { toolName: skill, parameters: parameters });
    
    try {
      // 从 action 对象中提取工具名称和参数
      

      // 调用 MCP 管理器的 callTool 方法
      const result = await mcpManager.callTool(skill, parameters);

      logger.info('工具调用成功', { toolName: skill, result });
      
      // 返回成功结果
      return {
        success: true,
        skill: skill,
        result: result,
        parameters: parameters
      };
    } catch (error) {
      logger.error('工具调用失败', {
        toolName: action.skill,
        error: error.message,
        stack: error.stack
      });
      
      // 返回失败结果
      return {
        success: false,
        skill: action.skill,
        error: error.message,
        parameters: action.parameters
      };
    }
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
        if (row.config) row.config = JSON.parse(row.config);
      } catch(e) {
        logger.error(`解析智能体配置失败 (ID: ${agentId})`, { error: e.message });
        return null;
      }
    }
    return row;
  }
}

// 独立函数定义在类下方，以避免 `this` 上下文问题并使代码更清晰。
// 它们不是 TaskExecutor 类本身的一部分。

/**
 * 执行一个子智能体并等待其完成（同步A2A调用）。
 * 此函数负责编排同步子任务的创建和执行。
 * @param {string} targetAgentId - 要执行的智能体的ID。
 * @param {string} taskInput - 子任务的输入。
 * @param {string} parentTaskId - 父任务的ID。
 * @returns {Promise<string>} 来自子智能体的最终结果。
 */
async function executeSubAgentAndWait(targetAgentId, taskInput, parentTaskId) {
  try {
    // 1. 在数据库中创建子任务记录。 - 【修复】确保空的 context 对象和 parentTaskId 被正确传递
    const subTask = await createSubTask(targetAgentId, taskInput, {}, parentTaskId);
    
    // 2. 获取执行器实例并为子任务执行智能体链。
    // 当此代码被调用时，`module.exports` 将是 `TaskExecutor` 的实例。
    const executor = module.exports;
    const resultObject = await executor.executeAgentChain(subTask);

    // 3. 处理来自子智能体的结果。
    if (resultObject && resultObject.type === 'completion') {
      return resultObject.result;
    } else {
      const errorMessage = `子智能体 ${targetAgentId} 未成功完成或返回了意外的结构。`;
      logger.error(errorMessage, { resultObject });
      return errorMessage; // 将错误消息作为观察结果返回给父智能体。
    }
  } catch (error) {
    logger.error(`为父任务 ${parentTaskId} 同步执行子智能体时出错`, { error: error.message, stack: error.stack });
    return `执行子智能体失败: ${error.message}`; // 将错误消息作为观察结果返回。
  }
}

/**
 * 在数据库中创建子任务并返回新创建的任务对象。
 * 此函数现在是一个独立的、基于 Promise 的实用工具。
 * @param {string} targetAgentId - 要分配任务的智能体的ID。
 * @param {string} taskInput - 子任务的输入。
 * @param {string|null} parentTaskId - 父任务的ID。
 * @returns {Promise<Object>} 从数据库创建的任务对象。
 */
function createSubTask(targetAgentId, taskDescription, taskContext, parentTaskId) {
  return new Promise((resolve, reject) => {
    const newTaskId = uuidv4();
    const sql = `
      INSERT INTO tasks (id, agent_id, input_data, status, parent_task_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    const params = [
      newTaskId,
      targetAgentId,
      JSON.stringify({ input: taskDescription, context: taskContext || {} }),
      'pending',
      parentTaskId,
      new Date().toISOString()
    ];
    
    db.run(sql, params, function (err) {
      if (err) {
        logger.error('在数据库中创建子任务失败', { error: err.message, parentTaskId });
        return reject(err);
      }
      // 检索完整的任务对象以返回它，因为执行流程需要它。
      db.get('SELECT * FROM tasks WHERE id = ?', newTaskId, (err, row) => {
        if (err) {
          logger.error(`检索新创建的子任务失败 (ID: ${newTaskId})`, { error: err.message });
          return reject(err);
        }
        if (!row) {
          return reject(new Error(`创建后未能找到子任务 (ID: ${newTaskId})`));
        }
        logger.info('成功创建子任务记录', { subTaskId: newTaskId, parentTaskId });
        resolve(row);
      });
    });
  });
}

module.exports = new TaskExecutor();