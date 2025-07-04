const CSGClient = require('./csgClient');
const { globalConfig } = require('../config/globalConfig');
const logger = require('../utils/logger');

const csgClientInstance = require('./csgClient');

const requestTimestamps = [];
const RATE_LIMIT_PER_SECOND = 2;
const ONE_SECOND_IN_MS = 1000;

/**
 * 统一调用LLM服务的抽象层。
 * @param {Array<object>} messages - 发送给LLM的消息数组，格式如 [{ role: 'user', content: '...' }]。
 * @param {object} agentConfig - 包含LLM环境和其他配置的对象。
 * @param {string} agentConfig.llm_env - LLM环境，'test' 或 'production'。
 * @param {string} [agentConfig.model] - （可选）在测试环境中指定模型。
 * @param {string} [agentConfig.agent_id] - （可选）在生产环境中指定agent_id。
 * @returns {Promise<object>} - 返回一个包含调用结果的对象，格式为 { success: boolean, content: string, error?: string }。
 */
async function invokeLLM(messages, agentConfig) {
  // --- 速率限制逻辑开始 ---
  const now = Date.now();

  // 移除所有一秒前的时间戳
  while (requestTimestamps.length > 0 && now - requestTimestamps[0] > ONE_SECOND_IN_MS) {
    requestTimestamps.shift();
  }

  // 如果在一秒内请求次数已达上限
  if (requestTimestamps.length >= RATE_LIMIT_PER_SECOND) {
    const timeToWait = ONE_SECOND_IN_MS - (now - requestTimestamps[0]);
    if (timeToWait > 0) {
        logger.warn(`LLM速率限制触发，等待 ${timeToWait}ms...`);
        await new Promise(resolve => setTimeout(resolve, timeToWait));
    }
  }

  // 记录当前请求的时间戳
  requestTimestamps.push(Date.now());
  // --- 速率限制逻辑结束 ---

  try {
    if (!agentConfig || !agentConfig.llm_env) {
      throw new Error('llm_env is required in agentConfig.');
    }

    const { llm_env } = agentConfig;

    if (llm_env === 'production') {
      const prodConfig = globalConfig.get('agentPlatform.production');
      if (!prodConfig) {
        throw new Error('Production environment configuration is missing.');
      }
      agentObject = {
        environment_type: 'production',
        base_url: prodConfig.apiBase,
        app_id: prodConfig.appId,
        app_secret: prodConfig.appSecret,
        agent_id: agentConfig.agent_id || null, // 允许从调用处传入agent_id
      };
      
      // csgClient的生产环境调用需要agentId
      if (!agentObject.agent_id) {
          logger.warn('Calling production LLM without a specific agent_id.');
      }

    } else if (llm_env === 'test') {
      const testConfig = globalConfig.get('agentPlatform.test');
      if (!testConfig) {
        throw new Error('Test environment configuration is missing.');
      }
      agentObject = {
        environment_type: 'test',
        base_url: testConfig.apiBase,
        app_secret: testConfig.apiKey, // 在测试模式下，app_secret被用作apiKey
        model: agentConfig.model || testConfig.model,
      };

    } else {
      throw new Error(`Unsupported llm_env: ${llm_env}`);
    }

    // 显式构建一个符合 csgClient.callAgent 期望的、干净的 agentObject
    // 这可以防止将不相关的配置字段传递给 csgClient，并确保所有必需字段都存在
    const agentObjectForCSG = {
      agent_id: agentConfig.agent_id,
      base_url: agentConfig.base_url,
      app_id: agentConfig.app_id,
      app_secret: agentConfig.app_secret,
      environment_type: agentConfig.llm_env, // 使用 taskExecutor 传递过来的 llm_env
      model: agentConfig.model
    };

    const response = await csgClientInstance.callAgent(
      agentObjectForCSG, // <--- 使用新构建的、干净的对象
      messages,
      {
        // 如果需要，可以在这里传递其他选项，如systemPrompt
        // systemPrompt: messages.find(m => m.role === 'system')?.content
      }
    );

    if (response && response.success && response.data) {
      return {
        success: true,
        content: response.data, // csgClient已经处理了解析，data字段是最终的文本内容
      };
    } else {
      throw new Error(response.message || 'LLM call failed with no specific message.');
    }

  } catch (error) {
    logger.error('invokeLLM failed:', { error: error.message, stack: error.stack });
    return {
      success: false,
      content: null,
      error: error.message,
    };
  }
}

module.exports = {
  invokeLLM,
};