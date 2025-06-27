/**
 * 应用配置文件
 */

const path = require('path');

const config = {
  // 服务器配置
  server: {
    port: 3000,
    host: 'localhost'
  },
  
  // 数据库配置
  database: {
    sqlite: {
      filename: path.join(__dirname, '../data/database.sqlite'),
      options: {
        mode: 'OPEN_READWRITE | OPEN_CREATE',
        timeout: 5000
      }
    }
  },
  
  // Redis配置
  redis: {
    host: 'localhost',
    port: 6379,
    password: null,
    db: 0,
    retryDelayOnFailover: 100,
    maxRetriesPerRequest: 3
  },
  
  // JWT配置
  jwt: {
    secret: process.env.JWT_SECRET || 'a2a-agent-scheduler-secret-key',
    expiresIn: '24h'
  },
  
  // 日志配置
  logging: {
    level: process.env.LOG_LEVEL || 'debug',
    file: path.join(__dirname, '../logs/app.log'),
    maxSize: '10MB',
    maxFiles: '7d'
  },
  
  // 维格表配置
  vika: {
    token: 'uskoInjR7NrA4OfkL97qN37',
    baseUrl: 'https://api.vika.cn/fusion/v1',
    spaceId: 'spcBxkW6UiuzT',
    requestTimeout: 30000,
    maxRetries: 3,
    retryDelay: 1000
  },
  
  // CSG智能体API配置
  csg: {
    baseUrl: 'https://10.10.65.104:5030',
    timeout: 300000, // 5分钟
    qps: 2, // 每秒请求数限制
    retryTimes: 3
  },
  
  // 任务配置
  task: {
    maxConcurrent: 10, // 最大并发任务数
    timeout: 300000, // 任务超时时间 (5分钟)
    retryAttempts: 3, // 重试次数
    retryDelay: 2000 // 重试延迟 (毫秒)
  },
  
  // MCP配置
  mcp: {
    timeout: 30000, // MCP工具调用超时时间
    maxPayloadSize: '5MB' // 最大负载大小
  },
  
  // 安全配置
  security: {
    rateLimiting: {
      windowMs: 15 * 60 * 1000, // 15分钟
      max: 1000 // 每个IP最大请求数
    },
    cors: {
      origin: process.env.NODE_ENV === 'production' 
        ? ['http://10.121.232.66'] 
        : ['http://localhost:8080', 'http://127.0.0.1:8080']
    }
  },
  
  // 监控配置
  monitoring: {
    metricsInterval: 30000, // 指标收集间隔 (毫秒)
    healthCheckInterval: 60000 // 健康检查间隔 (毫秒)
  }
};

module.exports = config;
