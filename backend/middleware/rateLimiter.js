/**
 * 限流中间件
 */

const config = require('../config/config');
const logger = require('../utils/logger');

// 内存存储的限流器（简单实现）
class MemoryRateLimiter {
  constructor(options = {}) {
    this.windowMs = options.windowMs || 15 * 60 * 1000; // 15分钟
    this.max = options.max || 1000; // 最大请求数
    this.store = new Map();
    
    // 定期清理过期记录
    setInterval(() => {
      this.cleanup();
    }, this.windowMs);
  }
  
  /**
   * 检查是否超过限制
   */
  isAllowed(key) {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    
    if (!this.store.has(key)) {
      this.store.set(key, []);
    }
    
    const requests = this.store.get(key);
    
    // 移除过期请求
    const validRequests = requests.filter(timestamp => timestamp > windowStart);
    
    if (validRequests.length >= this.max) {
      return false;
    }
    
    // 添加当前请求
    validRequests.push(now);
    this.store.set(key, validRequests);
    
    return true;
  }
  
  /**
   * 获取剩余请求数
   */
  getRemaining(key) {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    
    if (!this.store.has(key)) {
      return this.max;
    }
    
    const requests = this.store.get(key);
    const validRequests = requests.filter(timestamp => timestamp > windowStart);
    
    return Math.max(0, this.max - validRequests.length);
  }
  
  /**
   * 获取重置时间
   */
  getResetTime(key) {
    if (!this.store.has(key)) {
      return Date.now() + this.windowMs;
    }
    
    const requests = this.store.get(key);
    if (requests.length === 0) {
      return Date.now() + this.windowMs;
    }
    
    const oldestRequest = Math.min(...requests);
    return oldestRequest + this.windowMs;
  }
  
  /**
   * 清理过期记录
   */
  cleanup() {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    
    for (const [key, requests] of this.store.entries()) {
      const validRequests = requests.filter(timestamp => timestamp > windowStart);
      
      if (validRequests.length === 0) {
        this.store.delete(key);
      } else {
        this.store.set(key, validRequests);
      }
    }
    
    logger.debug('限流器清理完成', { 
      activeKeys: this.store.size,
      cleanupTime: new Date().toISOString()
    });
  }
}

// 创建限流器实例
const rateLimiter = new MemoryRateLimiter(config.security.rateLimiting);

/**
 * 限流中间件
 */
const rateLimiterMiddleware = (req, res, next) => {
  try {
    // 获取客户端标识（IP地址）
    const clientId = req.ip || req.connection.remoteAddress || 'unknown';
    
    // 检查是否超过限制
    if (!rateLimiter.isAllowed(clientId)) {
      const resetTime = rateLimiter.getResetTime(clientId);
      const retryAfter = Math.ceil((resetTime - Date.now()) / 1000);
      
      // 记录限流日志
      logger.warn('请求被限流', {
        clientId,
        method: req.method,
        url: req.originalUrl,
        retryAfter
      });
      
      // 设置响应头
      res.set({
        'X-RateLimit-Limit': config.security.rateLimiting.max,
        'X-RateLimit-Remaining': 0,
        'X-RateLimit-Reset': new Date(resetTime).toISOString(),
        'Retry-After': retryAfter
      });
      
      return res.status(429).json({
        success: false,
        code: 429,
        message: '请求过于频繁，请稍后再试',
        retryAfter,
        timestamp: new Date().toISOString()
      });
    }
    
    // 设置响应头
    const remaining = rateLimiter.getRemaining(clientId);
    const resetTime = rateLimiter.getResetTime(clientId);
    
    res.set({
      'X-RateLimit-Limit': config.security.rateLimiting.max,
      'X-RateLimit-Remaining': remaining,
      'X-RateLimit-Reset': new Date(resetTime).toISOString()
    });
    
    next();
    
  } catch (error) {
    logger.error('限流中间件错误', { error: error.message });
    // 限流器出错时不阻止请求
    next();
  }
};

/**
 * CSG API专用限流器（2 QPS）
 */
class CSGRateLimiter {
  constructor() {
    this.qps = config.csg.qps; // 2 QPS
    this.interval = 1000 / this.qps; // 500ms间隔
    this.lastRequestTime = 0;
    this.queue = [];
    this.processing = false;
  }
  
  /**
   * 添加请求到队列
   */
  addRequest(requestFn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ requestFn, resolve, reject });
      this.processQueue();
    });
  }
  
  /**
   * 处理请求队列
   */
  async processQueue() {
    if (this.processing || this.queue.length === 0) {
      return;
    }
    
    this.processing = true;
    
    while (this.queue.length > 0) {
      const now = Date.now();
      const timeSinceLastRequest = now - this.lastRequestTime;
      
      if (timeSinceLastRequest < this.interval) {
        const waitTime = this.interval - timeSinceLastRequest;
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
      
      const { requestFn, resolve, reject } = this.queue.shift();
      
      try {
        this.lastRequestTime = Date.now();
        const result = await requestFn();
        resolve(result);
      } catch (error) {
        reject(error);
      }
    }
    
    this.processing = false;
  }
}

// 创建CSG API限流器实例
const csgRateLimiter = new CSGRateLimiter();

module.exports = {
  rateLimiter: rateLimiterMiddleware,
  csgRateLimiter
};
