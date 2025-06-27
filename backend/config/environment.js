// 环境配置管理
const environments = {
  // 测试环境 - 使用OPENAI标准格式（DeepSeek等）
  test: {
    name: 'test',
    description: '测试环境 - 支持OPENAI格式',
    agentApiType: 'openai', // openai格式
    agentApiBase: 'https://api.deepseek.com/v1', // 测试环境API地址
    responseParser: 'openai' // 使用openai格式解析器
  },
  
  // 生产环境 - 使用内网智能体平台
  production: {
    name: 'production', 
    description: '生产环境 - 内网智能体平台',
    agentApiType: 'csg', // CSG内网平台
    agentApiBase: 'https://api.vika.cn/fusion/v1', // 内网智能体平台地址
    responseParser: 'csg' // 使用CSG格式解析器
  }
};

// 当前环境设置
let currentEnvironment = process.env.NODE_ENV === 'production' ? 'production' : 'test';

// 响应解析器
const responseParsers = {
  // OpenAI格式解析器（测试环境）
  openai: {
    parseNonStreaming: (response) => {
      try {
        if (response.choices && response.choices[0] && response.choices[0].message) {
          return {
            content: response.choices[0].message.content,
            role: response.choices[0].message.role,
            finishReason: response.choices[0].finish_reason
          };
        }
        return null;
      } catch (error) {
        console.error('OpenAI格式解析错误:', error);
        return null;
      }
    },
    
    parseStreaming: (chunk) => {
      try {
        if (chunk.startsWith('data: ')) {
          const data = chunk.slice(6);
          if (data === '[DONE]') {
            return { done: true };
          }
          
          const parsed = JSON.parse(data);
          if (parsed.choices && parsed.choices[0] && parsed.choices[0].delta) {
            return {
              content: parsed.choices[0].delta.content || '',
              done: parsed.choices[0].finish_reason === 'stop'
            };
          }
        }
        return null;
      } catch (error) {
        console.error('OpenAI流式解析错误:', error);
        return null;
      }
    }
  },
  
  // CSG内网平台格式解析器（生产环境）
  csg: {
    parseNonStreaming: (response) => {
      try {
        if (response.choices && response.choices[0] && response.choices[0].message) {
          return {
            content: response.choices[0].message.content,
            role: response.choices[0].message.role,
            finishReason: response.choices[0].finish_reason
          };
        }
        return null;
      } catch (error) {
        console.error('CSG格式解析错误:', error);
        return null;
      }
    },
    
    parseStreaming: (chunk) => {
      try {
        // 处理info行（插件调用信息）
        if (chunk.startsWith('info: ')) {
          const infoData = JSON.parse(chunk.slice(6));
          return {
            type: 'info',
            moduleInfo: infoData,
            content: ''
          };
        }
        
        // 处理data行（实际内容）
        if (chunk.startsWith('data: ')) {
          const data = chunk.slice(6);
          if (data === '[DONE]') {
            return { done: true };
          }
          
          const parsed = JSON.parse(data);
          if (parsed.choices && parsed.choices[0] && parsed.choices[0].delta) {
            return {
              type: 'content',
              content: parsed.choices[0].delta.content || '',
              done: parsed.choices[0].finish_reason === 'stop'
            };
          }
        }
        return null;
      } catch (error) {
        console.error('CSG流式解析错误:', error);
        return null;
      }
    }
  }
};

module.exports = {
  environments,
  currentEnvironment,
  responseParsers,
  
  // 获取当前环境配置
  getCurrentEnvironment: () => environments[currentEnvironment],
  
  // 切换环境
  switchEnvironment: (env) => {
    if (environments[env]) {
      currentEnvironment = env;
      console.log(`环境已切换到: ${env}`);
      return true;
    }
    return false;
  },
  
  // 获取响应解析器
  getResponseParser: () => {
    const env = environments[currentEnvironment];
    return responseParsers[env.responseParser];
  }
};
