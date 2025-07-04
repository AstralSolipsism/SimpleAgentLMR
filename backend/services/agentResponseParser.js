const { globalConfig } = require('../config/globalConfig');
const { getResponseParser } = require('../config/environment');
const { db } = require('../database/init.js');

/**
 * 智能体响应解析器
 * 解析智能体返回的结构化content，提取A2A协议相关信息
 */
class AgentResponseParser {
  constructor() {
    this.patterns = {
      // A2A任务传递模式
      taskTransfer: /```json:a2a-task\s*\n(.*?)\n```/s,
      
      // 技能调用模式
      skillCall: /```json:skill-call\s*\n(.*?)\n```/s,
      
      // 结果输出模式
      resultOutput: /```json:result\s*\n(.*?)\n```/s
    };
  }
  
  /**
   * 解析智能体响应
   * @param {string} content - 智能体返回的content
   * @param {string} agentId - 当前智能体ID
   * @param {Object} options - 解析选项，例如 { react_mode: true }
   * @returns {Object} 解析结果
   */
  parseAgentResponse(content, agentId, options = {}) {
    const result = {
      agentId,
      content,
      actions: [],
      taskTransfers: [],
      skillCalls: [],
      results: [],
      thought: '', // 新增 thought 字段
      hasStructuredOutput: false
    };

    // ReAct 模式下，只解析第一个有效的指令
  if (options && options.react_mode) {
    // 提取思考过程
    const thoughtMatch = content.match(/Thought:(.*?)(?=Action:|Final Answer:|$)/s);
    if (thoughtMatch) {
      result.thought = thoughtMatch[1].trim();
    }

    // 查找第一个动作或最终答案
    const finalAnswerMatch = content.match(/Final Answer:\s*(.*)/s);
    if (finalAnswerMatch) {
      const finalAction = { type: 'result', data: finalAnswerMatch[1].trim() };
      result.actions.push(finalAction);
      result.results.push(finalAction); // 兼容旧字段
      result.hasStructuredOutput = true;
      return result;
    }

    // 更健壮的正则表达式，只捕获json块内容
    // 更健壮的正则表达式，处理可选的类型声明，并只捕获json块内容
    const actionMatch = content.match(/```json(?::[a-zA-Z0-9_-]*)?\s*([\s\S]*?)\s*```/s);
    if (actionMatch) {
      const actionJson = actionMatch[1].trim();
      try {
        const parsed = JSON.parse(actionJson);
        // 从JSON负载本身获取动作类型
        const internalActionType = parsed.type;

        if (!internalActionType) {
          // 如果JSON中没有type字段，则无法处理
          return result;
        }

        let action = null;
        
        // 映射到协议定义的类型
        switch (internalActionType) {
          case 'a2a-task':
            // 将外部的 'a2a-task' 映射到内部的 'task_transfer'
            // 确保我们的内部类型 'task_transfer' 不会被原始的 'a2a-task' 类型覆盖
            action = { ...parsed, type: 'task_transfer' };
            result.taskTransfers.push(action);
            break;
          case 'skill-call':
            // 确保我们的内部类型 'skill_call' 不会被任何可能的原始类型覆盖
            action = { ...parsed, type: 'skill_call' };
            result.skillCalls.push(action);
            break;
          case 'result':
             // 增强健壮性，接受多种可能的结果字段
             action = { ...parsed, type: 'result', data: parsed.result || parsed.data || parsed };
             result.results.push(action);
             break;
          default:
            // 如果是不支持的类型，则不作为有效action
            return result;
        }
        
        // 确保所有有效action都被添加到actions数组中
        if (action) {
          result.actions.push(action);
        }
        result.hasStructuredOutput = true;

      } catch (error) {
        console.error(`ReAct模式下JSON解析错误:`, error, `\n原始JSON文本: ${actionJson}`);
      }
    }
    
    return result;
  }

    // --- 以下是旧的、非ReAct模式的逻辑 ---
    const taskTransfers = this.extractPattern(content, this.patterns.taskTransfer);
    taskTransfers.forEach(taskData => {
      try {
        const parsed = JSON.parse(taskData);
        result.taskTransfers.push({
          type: 'task_transfer',
          targetAgent: parsed.targetAgent,
          task: parsed.task,
          context: parsed.context || {},
          priority: parsed.priority || 'normal',
          timeout: parsed.timeout || 300000
        });
        result.hasStructuredOutput = true;
      } catch (error) {
        console.error('任务传递解析错误:', error);
      }
    });
    
    // 解析技能调用
    const skillCalls = this.extractPattern(content, this.patterns.skillCall);
    skillCalls.forEach(skillData => {
      try {
        // 移除JSON字符串中的注释，提高解析的健壮性
        const cleanedJsonString = skillData.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
        const parsed = JSON.parse(cleanedJsonString);
        result.skillCalls.push({
          type: 'skill_call',
          skill: parsed.skill,
          parameters: parsed.parameters || {},
          callback: parsed.callback
        });
        result.hasStructuredOutput = true;
      } catch (error) {
        console.error('技能调用解析错误:', error);
      }
    });
    
    // 解析结果输出
    const results = this.extractPattern(content, this.patterns.resultOutput);
    results.forEach(resultData => {
      try {
        const parsed = JSON.parse(resultData);
        result.results.push({
          type: 'result',
          data: parsed.data,
          format: parsed.format || 'json',
          destination: parsed.destination || 'default'
        });
        result.hasStructuredOutput = true;
      } catch (error) {
        console.error('结果输出解析错误:', error);
      }
    });
    
    // 汇总所有行动
    result.actions = [
      ...result.taskTransfers,
      ...result.skillCalls,
      ...result.results
    ];
    
    return result;
  }
  
  /**
   * 提取匹配模式的内容
   * @param {string} content - 原始内容
   * @param {RegExp} pattern - 匹配模式
   * @returns {Array} 匹配结果数组
   */
  extractPattern(content, pattern) {
    const matches = [];
    let match;
    
    // 使用全局匹配
    const globalPattern = new RegExp(pattern.source, pattern.flags + 'g');
    
    while ((match = globalPattern.exec(content)) !== null) {
      matches.push(match[1].trim());
    }
    
    return matches;
  }
  
  /**
   * 验证任务传递参数
   * @param {Object} transfer - 任务传递对象
   * @returns {Object} 验证结果
   */
  validateTaskTransfer(transfer) {
    const errors = [];
    
    if (!transfer.targetAgent) {
      errors.push('缺少targetAgent字段');
    }
    
    if (!transfer.task) {
      errors.push('缺少task字段');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
  
  /**
   * 生成智能体系统提示词
   * @param {string} agentId - 智能体ID
   * @returns {Promise<string>} 系统提示词
   */
  async generateSystemPrompt(agentId) {
    // 1. 查询主智能体信息
    const agent = await new Promise((resolve, reject) => {
      db.get('SELECT agent_name, responsibilities_and_functions FROM agents WHERE agent_id = ?', [agentId], (err, row) => {
        if (err) reject(new Error(`数据库查询主智能体信息失败: ${err.message}`));
        else resolve(row);
      });
    });

    if (!agent) {
      throw new Error(`未找到ID为 ${agentId} 的智能体。`);
    }

    // 2. 查询下级智能体
    const subAgents = await new Promise((resolve, reject) => {
      const sql = `
        SELECT a.agent_id as id, a.agent_name as name, a.responsibilities_and_functions
        FROM agent_capabilities ac
        JOIN agents a ON ac.target_id = a.agent_id
        WHERE ac.agent_id = ? AND ac.capability_type = 'sub_agent'
      `;
      db.all(sql, [agentId], (err, rows) => {
        if (err) reject(new Error(`数据库查询下级智能体失败: ${err.message}`));
        else resolve(rows);
      });
    });

    // 3. 查询可用的MCP工具
    const mcpTools = await new Promise((resolve, reject) => {
      const sql = `
        SELECT mt.tool_name as name, mt.description
        FROM agent_capabilities ac
        JOIN mcp_tools mt ON ac.target_id = mt.tool_name
        WHERE ac.agent_id = ? AND ac.capability_type = 'mcp_tool'
      `;
      db.all(sql, [agentId], (err, rows) => {
        if (err) reject(new Error(`数据库查询MCP工具失败: ${err.message}`));
        else resolve(rows);
      });
    });

    // 4. 构建提示词
    const responsibilities = `你是智能体'${agent.agent_name}'，你的职责与功能是：\n${agent.responsibilities_and_functions}`;

    let subAgentsPrompt = "你可以将任务传递给以下下级智能体：\n";
    if (subAgents && subAgents.length > 0) {
      subAgentsPrompt += subAgents.map(sa => `- ID: ${sa.id}, 名称: ${sa.name}, 职责: ${sa.responsibilities_and_functions}`).join('\n');
      subAgentsPrompt += "\n\n**如需将任务委托给以上任何下级，请使用 `json:a2a-task` 格式，并将该下级的 `id` 填入 `targetAgent` 字段。**";
    } else {
      subAgentsPrompt += "无";
    }

    let toolsPrompt = "你允许调用以下工具：\n";
    if (mcpTools && mcpTools.length > 0) {
      toolsPrompt += mcpTools.map(tool => `- 名称: ${tool.name}, 描述: ${tool.description}`).join('\n');
      toolsPrompt += "\n\n**如需使用以上任何工具，请使用 `json:skill-call` 格式，并将该工具的名称填入 `skill` 字段。**";
    } else {
      toolsPrompt += "无";
    }

    return `${responsibilities}

${subAgentsPrompt}

${toolsPrompt}

# 重要：输出格式规范

当需要执行特定操作时，必须使用以下结构化格式：

## 1. 任务传递给其他智能体
\`\`\`json:a2a-task
{
  "targetAgent": "目标智能体ID",
  "task": "具体任务描述",
  "context": {
    "key": "传递的上下文信息"
  },
  "priority": "normal|high|low",
  "timeout": 300000
}
\`\`\`

## 2. 技能调用
\`\`\`json:skill-call
{
  "skill": "技能名称",
  "parameters": {
    "param1": "value1"
  },
  "callback": "回调处理方式"
}
\`\`\`

## 3. 结果输出
\`\`\`json:result
{
  "data": "处理结果数据",
  "format": "json|text|table",
  "destination": "输出目标"
}
\`\`\`

请严格按照以上格式输出结构化信息，系统将自动解析并执行相应操作。`;
  }
}

module.exports = AgentResponseParser;
