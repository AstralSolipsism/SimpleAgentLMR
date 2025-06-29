const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { globalConfig } = require('../config/globalConfig');
const { getCurrentEnvironment, getResponseParser } = require('../config/environment');
const { db } = require('../database/init');
const logger = require('../utils/logger');

const healthCache = {
 lastCheck: 0,
 data: null,
 cacheDuration: 30000, // 30秒缓存
};

class CSGClient {
 constructor() {
    this.appKeys = new Map(); // 存储AppKey缓存
    this.loadCSGApi();
  }
  
  // 获取当前环境配置
  getConfig() {
    const envConfig = getCurrentEnvironment();
    const agentConfig = globalConfig.get(`agentPlatform.${envConfig.name}`);
    
    return {
      ...envConfig,
      ...agentConfig,
      rateLimitQPS: globalConfig.get('vika.rateLimitQPS') || 2,
      timeout: globalConfig.get('taskExecution.taskTimeout') || 30000
    };
  }
  
  // 动态加载CSGapi.js
  loadCSGApi() {
    try {
      const csgApiPath = path.join(__dirname, 'CSGapi.js');
      if (fs.existsSync(csgApiPath)) {
        const csgApiContent = fs.readFileSync(csgApiPath, 'utf8');
        
        // 适配Node.js环境
        const adaptedContent = this.adaptForNode(csgApiContent);
        eval(adaptedContent);
        
        logger.info('CSGapi.js 加载成功');
      } else {
        logger.warn('CSGapi.js 文件不存在，使用默认实现');
        this.createDefaultImplementation();
      }
    } catch (error) {
      logger.error('CSGapi.js 加载失败:', { error });
      this.createDefaultImplementation();
    }
  }
  
  // 适配Node.js环境
  adaptForNode(content) {
    // 替换浏览器特有的对象和方法
    return content
      .replace(/window\./g, 'global.')
      .replace(/document\./g, '/* document. */')
      .replace(/fetch\(/g, 'this.nodeFetch(')
      .replace(/XMLHttpRequest/g, 'require("http")');
  }
  
  // 创建默认实现
  createDefaultImplementation() {
    global.CSGApi = {
      call: async (endpoint, data) => {
        return this.makeRequest(endpoint, data);
      }
    };
  }
  
  // Node.js环境的fetch实现
  async nodeFetch(url, options = {}) {
    const https = require('https');
    const http = require('http');
    
    return new Promise((resolve, reject) => {
      const protocol = url.startsWith('https:') ? https : http;
      const req = protocol.request(url, {
        method: options.method || 'GET',
        headers: options.headers || {},
        timeout: this.getConfig().timeout
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            json: () => Promise.resolve(JSON.parse(data)),
            text: () => Promise.resolve(data)
          });
        });
      });
      
      req.on('error', reject);
      
      if (options.body) {
        req.write(options.body);
      }
      
      req.end();
    });
  }
  
  // 获取或刷新AppKey（仅生产环境需要）
  async getAppKey(appId, appSecret, apiBase) {
    const cacheKey = `${appId}:${appSecret}`;
    const cached = this.appKeys.get(cacheKey);
    
    // 检查缓存是否有效（10分钟过期）
    if (cached && Date.now() - cached.timestamp < 10 * 60 * 1000) {
      return cached.appKey;
    }
    
    try {
      // 调用内网智能体平台获取AppKey
      const response = await this.makeRequest(
        apiBase,
        '/auth/getAppKey', {
        appId,
        appSecret
      });
      
      if (response.success) {
        const appKey = response.data.appKey;
        this.appKeys.set(cacheKey, {
          appKey,
          timestamp: Date.now()
        });
        return appKey;
      } else {
        throw new Error(response.message || 'AppKey获取失败');
      }
    } catch (error) {
      logger.error('AppKey获取失败:', { error });
      throw error;
    }
  }
  
  /**
   * 调用智能体 (重构后)
   * @param {object} agentObject - 从数据库查询并传入的完整智能体对象
   * @param {Array<object>} messages - 消息历史记录
   * @param {object} options - 调用选项，如 systemPrompt, temperature 等
   */
  async callAgent(agentObject, messages, options = {}) {
    try {
      // 直接使用传入的 agentObject，不再进行数据库查询
      if (!agentObject || !agentObject.agent_id) {
        throw new Error('无效的 agentObject 传入 csgClient.callAgent');
      }

      const { base_url, app_id, app_secret, environment_type, agent_id } = agentObject;
      let finalAppKey;

      if (environment_type === 'test') {
        // 测试环境：直接使用app_secret作为最终的AppKey
        finalAppKey = app_secret;
        if (!finalAppKey) {
          throw new Error(`应用 ${app_id} 在测试模式下未配置有效的app_secret作为AppKey`);
        }
        // 测试环境统一调用OpenAI格式的接口
        return this.callTestEnvironmentAgent(base_url, finalAppKey, agentObject, messages, options);
      } else {
        // 生产环境：动态获取AppKey
        finalAppKey = await this.getAppKey(app_id, app_secret, base_url);
        // 注意：生产环境的调用也需要 agentId
        return this.callProductionEnvironmentAgent(base_url, app_id, agent_id, finalAppKey, messages, options);
      }
    } catch (error) {
      logger.error('智能体调用失败:', { error: error.message, stack: error.stack });
      // 抛出错误，由上层 taskExecutor 捕获和处理
      throw error;
    }
  }
  
  // 测试环境智能体调用（OpenAI格式）
  async callTestEnvironmentAgent(apiBase, appKey, agent, messages, options = {}) {
    logger.info('正在调用外部大模型API(测试环境)', { agent_id: agent.agent_id, model: agent.model });
    // 查找是否已存在 system prompt
    const hasSystemPrompt = messages.some(m => m.role === 'system');
    
    let finalMessages = [...messages];

    // 如果没有 system prompt，并且 options 中提供了，则添加一个
    if (!hasSystemPrompt && options.systemPrompt) {
      finalMessages.unshift({
        role: 'system',
        content: options.systemPrompt,
      });
    }

    const payload = {
      model: agent.model || 'deepseek-chat',
      messages: finalMessages,
      stream: options.stream || false,
      temperature: options.temperature || 0.7,
      max_tokens: options.maxTokens || 2000
    };
    
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${appKey}`
    };
    
    const config = this.getConfig();
    const endpoint = config.apiEndpoint || '/v1/chat/completions'; // 提供默认端点

    if (options.stream) {
      const finalRawResponse = await this.callAgentStreaming(apiBase, payload, headers, endpoint, 'test');
      const parser = getResponseParser();
      const parsed = parser.parseNonStreaming(finalRawResponse);
      return {
        success: true,
        data: parsed,
        message: 'Stream completed successfully.',
        rawResponse: finalRawResponse
      };
    } else {
      return this.callAgentNonStreaming(apiBase, payload, headers, endpoint);
    }
  }
  
  // 生产环境智能体调用（内网平台格式）
  async callProductionEnvironmentAgent(apiBase, appId, agentId, appKey, messages, options = {}) {
    logger.info('正在调用外部大模型API(生产环境)', { agent_id: agentId, model: 'production_model' });
    const payload = {
      messages: messages, // 直接使用完整的 messages 数组
      stream: options.stream || false,
      temperature: options.temperature || 0.7,
      maxTokens: options.maxTokens || 2000,
      systemPrompt: options.systemPrompt
    };
    
    const headers = {
      'Content-Type': 'application/json',
      'appId': appId,
      'appKey': appKey
    };
    
    const config = this.getConfig();
    // 生产环境的端点通常包含 agentId
    const endpoint = (config.apiEndpoint || '/agents/{agentId}/run').replace('{agentId}', agentId);

    if (options.stream) {
      const finalRawResponse = await this.callAgentStreaming(apiBase, payload, headers, endpoint, 'production');
      const parser = getResponseParser();
      const parsed = parser.parseNonStreaming(finalRawResponse);
      return {
        success: true,
        data: parsed,
        message: 'Stream completed successfully.',
        rawResponse: finalRawResponse
      };
    } else {
      return this.callAgentNonStreaming(apiBase, payload, headers, endpoint);
    }
  }
  
  // 非流式调用
  async callAgentNonStreaming(apiBase, payload, headers, endpoint) {
    const response = await this.makeRequest(apiBase, endpoint, payload, {
      method: 'POST',
      headers
    });
    
    // 使用环境对应的解析器
    const parser = getResponseParser();
    const parsed = parser.parseNonStreaming(response.data);

    if (response.success) {
      logger.info('模型调用成功', { agent_id: payload.model, response: parsed });
    } else {
      logger.error('模型调用出错', { agent_id: payload.model, error: response.message });
    }
    
    return {
      success: response.success,
      data: parsed,
      message: response.message,
      rawResponse: response.data
    };
  }
  
  // 流式调用
  async callAgentStreaming(apiBase, payload, headers, endpoint, environmentType) {
    return new Promise(async (resolve, reject) => {
      try {
        const responseStream = await this.makeStreamRequest(apiBase, endpoint, payload, {
          method: 'POST',
          headers: { ...headers, 'Accept': 'text/event-stream' }
        });

        let fullContent = ''; // For 'test' env (delta concatenation)
        let lastChunkObject = null; // For 'production' env (full content replacement)

        responseStream.on('data', (chunk) => {
          const chunkStr = chunk.toString();
          // A single chunk can have multiple data lines
          const lines = chunkStr.split('\n').filter(line => line.startsWith('data:'));

          for (const line of lines) {
            const jsonStr = line.substring(5).trim();
            if (jsonStr === '[DONE]') continue;
            if (!jsonStr) continue;

            try {
              const parsedJson = JSON.parse(jsonStr);
              if (environmentType === 'production') {
                // The last valid JSON object is the one we keep
                lastChunkObject = parsedJson;
              } else { // 'test' environment
                if (parsedJson.choices && parsedJson.choices[0].delta && parsedJson.choices[0].delta.content) {
                  fullContent += parsedJson.choices[0].delta.content;
                }
              }
            } catch (e) {
              // In a stream, it's possible to get an incomplete JSON object.
              // We can ignore it and wait for the next chunk.
            }
          }
        });

        responseStream.on('end', () => {
          if (environmentType === 'production') {
            if (lastChunkObject) {
              resolve(lastChunkObject); // Resolve with the final complete object
            } else {
              reject(new Error('Production stream ended without valid data.'));
            }
          } else { // 'test' environment
            // Reconstruct the final object to match the non-streaming format
            const finalResponseObject = {
              choices: [{
                finish_reason: 'stop',
                index: 0,
                message: { content: fullContent, role: 'assistant' }
              }]
            };
            resolve(finalResponseObject);
          }
        });

        responseStream.on('error', reject);

      } catch (error) {
        reject(error);
      }
    });
  }
  
  // 发起流式HTTP请求
  async makeStreamRequest(apiBase, endpoint, data = {}, options = {}) {
    const url = `${apiBase}${endpoint}`;
    const config = this.getConfig();
    
    const https = require('https');
    const http = require('http');
    
    return new Promise((resolve, reject) => {
      const protocol = url.startsWith('https:') ? https : http;
      
      const req = protocol.request(url, {
        method: options.method || 'POST',
        headers: options.headers,
        timeout: config.timeout
      }, (res) => {
        resolve(res);
      });
      
      req.on('error', reject);
      
      if (data) {
        req.write(JSON.stringify(data));
      }
      
      req.end();
    });
  }
  
  // 发起HTTP请求
  async makeRequest(apiBase, endpoint, data = {}, options = {}) {
    const url = `${apiBase}${endpoint}`;
    
    const requestOptions = {
      method: options.method || 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      body: JSON.stringify(data)
    };
    
    try {
      const response = await this.nodeFetch(url, requestOptions);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Request failed with status ${response.status}: ${errorText}`);
      }

      const result = await response.json();
      
      return {
        success: true,
        data: result,
        status: response.status
      };
    } catch (error) {
      logger.error('请求失败:', { url, options: requestOptions, error: error.message });
      throw error;
    }
  }
  
  // 测试连接
  async testConnection(agentObject) {
    try {
      const response = await this.callAgent(agentObject, [{ role: 'user', content: '测试连接' }], {
        systemPrompt: '请简单回复"连接成功"以确认连接状态。'
      });
      
      return {
        success: true,
        message: '连接测试成功',
        data: response
      };
    } catch (error) {
      return {
        success: false,
        message: `连接测试失败: ${error.message}`,
        error
      };
    }
  }
  // 健康检查（带缓存）
  async healthCheck() {
    const now = Date.now();
    if (now - healthCache.lastCheck < healthCache.cacheDuration && healthCache.data) {
      return { success: true, data: healthCache.data, fromCache: true };
    }

    const config = this.getConfig();
    const { name, apiBase, environment_type } = config;

    let healthStatus;

    try {
      if (environment_type === 'test') {
        // 测试环境：通常检查 OpenAI 兼容的 /v1/models 端点
        const testUrl = `${apiBase}/v1/models`;
        const response = await axios.get(testUrl, {
          headers: { 'Authorization': `Bearer ${config.appKey}` },
          timeout: 5000
        });
        if (response.status === 200 && response.data.data) {
          healthStatus = { status: 'ok', service: 'CsgClient', environment: name, mode: 'test' };
        } else {
          throw new Error(`Test environment check failed with status ${response.status}`);
        }
      } else {
        // 生产环境：假设有一个 /health 端点
        const prodUrl = `${apiBase}/health`;
        const response = await axios.get(prodUrl, { timeout: 5000 });
        if (response.status === 200 && response.data.status === 'healthy') {
          healthStatus = { status: 'ok', service: 'CsgClient', environment: name, mode: 'production', details: response.data };
        } else {
          throw new Error(`Production environment check failed with status ${response.status}`);
        }
      }
      
      healthCache.data = healthStatus;
      healthCache.lastCheck = now;
      return { success: true, data: healthStatus };

    } catch (error) {
      healthStatus = {
        status: 'error',
        service: 'CsgClient',
        environment: name,
        error: error.message,
      };
      healthCache.data = healthStatus;
      healthCache.lastCheck = now;
      return { success: false, data: healthStatus };
    }
  }
}

module.exports = new CSGClient();