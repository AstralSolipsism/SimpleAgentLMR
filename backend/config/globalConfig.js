const fs = require('fs');
const path = require('path');

// 默认配置
const defaultConfig = {
  // 系统基础配置
  system: {
    port: 3000,
    host: '0.0.0.0',
    apiPrefix: '/api/v1',
    environment: 'test' // test | production
  },
  
  // 维格表配置
  vika: {
    userToken: 'uskoInjR7NrA4OfkL97qN37', // 用户token
    apiBase: 'https://api.vika.cn', // API地址
    spaceId: 'spcBxkW6UiuzT', // 默认空间站ID
    rateLimitQPS: 2, // API请求频率限制
    autoSyncEnabled: false, // 是否启用自动同步
    syncTime: '03:00',
    syncIntervalDays: 1,
    lastSyncTimestamp: 0
  },
  
  // 数据库配置
  database: {
    type: 'sqlite', // sqlite | mysql | postgresql
    sqlite: {
      path: './data/a2a_system.db'
    },
    mysql: {
      host: '10.121.232.66',
      port: 3306,
      database: 'a2a_system',
      username: 'root',
      password: ''
    }
  },
  
  // 智能体平台配置
  agentPlatform: {
    // 测试环境配置
    test: {
      type: 'openai',
      apiBase: 'https://api.deepseek.com/v1',
      apiKey: '',
      model: 'deepseek-chat'
    },
    // 生产环境配置
    production: {
      type: 'csg',
      apiBase: 'http://10.121.232.66:8080', // 内网智能体平台地址
      apiKey: '',
      appId: '',
      appSecret: ''
    }
  },
  
  // 任务执行配置
  taskExecution: {
    maxConcurrentTasks: 10, // 最大并发任务数
    taskTimeout: 300000, // 任务超时时间（毫秒）
    retryAttempts: 3, // 重试次数
    logLevel: 'info' // debug | info | warn | error
  },
  
  // 缓存配置
  cache: {
    enabled: true,
    ttl: 3600, // 缓存过期时间（秒）
    maxKeys: 1000 // 最大缓存键数量
  },

  // 外部服务配置
  services: {
    serperApiKey: '' // Serper API密钥
  }
};

// 配置文件路径
const configFilePath = path.join(__dirname, '../../data/config.json');

// 确保data目录存在
const dataDir = path.dirname(configFilePath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

class GlobalConfig {
  constructor() {
    this.config = this.loadConfig();
  }
  
  // 加载配置
  loadConfig() {
    try {
      if (fs.existsSync(configFilePath)) {
        const fileContent = fs.readFileSync(configFilePath, 'utf8');
        const userConfig = JSON.parse(fileContent);
        return this.mergeConfig(defaultConfig, userConfig);
      }
    } catch (error) {
      console.warn('配置文件加载失败，使用默认配置:', error.message);
    }
    
    // 首次运行，保存默认配置
    this.saveConfig(defaultConfig);
    return defaultConfig;
  }
  
  // 保存配置
  saveConfig(config = this.config) {
    try {
      fs.writeFileSync(configFilePath, JSON.stringify(config, null, 2), 'utf8');
      return true;
    } catch (error) {
      console.error('配置文件保存失败:', error);
      return false;
    }
  }
  
  // 深度合并配置
  mergeConfig(defaultConf, userConf) {
    const result = { ...defaultConf };
    
    for (const key in userConf) {
      if (userConf[key] !== null && typeof userConf[key] === 'object' && !Array.isArray(userConf[key])) {
        result[key] = this.mergeConfig(result[key] || {}, userConf[key]);
      } else {
        result[key] = userConf[key];
      }
    }
    
    return result;
  }
  
  // 获取配置值
  get(path) {
    const keys = path.split('.');
    let value = this.config;
    
    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key];
      } else {
        return undefined;
      }
    }
    
    return value;
  }
  
  // 设置配置值
  set(path, value) {
    const keys = path.split('.');
    let current = this.config;
    
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!current[key] || typeof current[key] !== 'object') {
        current[key] = {};
      }
      current = current[key];
    }
    
    current[keys[keys.length - 1]] = value;
    return this.saveConfig();
  }
  
  // 获取完整配置
  getAll() {
    return this.config;
  }
  
  // 更新配置
  update(newConfig) {
    this.config = this.mergeConfig(this.config, newConfig);
    return this.saveConfig();
  }
  
  // 重置为默认配置
  reset() {
    this.config = { ...defaultConfig };
    return this.saveConfig();
  }
  
  // 验证配置
  validate() {
    const errors = [];
    
    // 验证维格表配置
    if (!this.get('vika.userToken')) {
      errors.push('维格表用户Token未配置');
    }
    
    // 验证智能体平台配置
    const currentEnv = this.get('system.environment');
    const agentConfig = this.get(`agentPlatform.${currentEnv}`);
    
    if (!agentConfig) {
      errors.push(`智能体平台配置缺失: ${currentEnv}`);
    } else {
      if (currentEnv === 'production' && !agentConfig.appId) {
        errors.push('生产环境智能体平台AppId未配置');
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
}

// 创建全局配置实例
const globalConfig = new GlobalConfig();

module.exports = {
  globalConfig,
  defaultConfig
};
