/**
 * 日志工具模块
 */

const fs = require('fs');
const path = require('path');
const config = require('../config/config');

// 确保日志目录存在
const logDir = path.dirname(config.logging.file);
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// 日志级别
const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  trace: 4
};

class Logger {
  constructor() {
    const logLevel = process.env.LOG_LEVEL || 'info';
    this.level = LOG_LEVELS[logLevel] || LOG_LEVELS.info;
  }
  
  /**
   * 格式化日志消息
   */
  formatMessage(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const metaStr = Object.keys(meta).length > 0 ? ` | ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}`;
  }
  
  /**
   * 写入日志文件
   */
  writeToFile(logMessage) {
    try {
      fs.appendFileSync(config.logging.file, logMessage + '\n');
    } catch (error) {
      console.error('写入日志文件失败:', error.message);
    }
  }
  
  /**
   * 输出日志
   */
  log(level, message, meta = {}) {
    const levelValue = LOG_LEVELS[level];
    
    if (levelValue <= this.level) {
      const formattedMessage = this.formatMessage(level, message, meta);
      
      // 控制台输出
      if (level === 'error') {
        console.error(formattedMessage);
      } else if (level === 'warn') {
        console.warn(formattedMessage);
      } else {
        console.log(formattedMessage);
      }
      
      // 文件输出
      this.writeToFile(formattedMessage);
    }
  }
  
  /**
   * 错误日志
   */
  error(message, meta = {}) {
    this.log('error', message, meta);
  }
  
  /**
   * 警告日志
   */
  warn(message, meta = {}) {
    this.log('warn', message, meta);
  }
  
  /**
   * 信息日志
   */
  info(message, meta = {}) {
    this.log('info', message, meta);
  }
  
  /**
   * 调试日志
   */
  debug(message, meta = {}) {
    this.log('debug', message, meta);
  }
  
  /**
   * 追踪日志
   */
  trace(message, meta = {}) {
    this.log('trace', message, meta);
  }
  
  /**
   * 日志轮转 (简单实现)
   */
  rotate() {
    try {
      const stats = fs.statSync(config.logging.file);
      const maxSize = 10 * 1024 * 1024; // 10MB
      
      if (stats.size > maxSize) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFile = config.logging.file.replace('.log', `-${timestamp}.log`);
        fs.renameSync(config.logging.file, backupFile);
        
        // 保留最近7个备份文件
        const logFiles = fs.readdirSync(logDir)
          .filter(file => file.startsWith('app-') && file.endsWith('.log'))
          .sort()
          .reverse();
          
        if (logFiles.length > 7) {
          logFiles.slice(7).forEach(file => {
            fs.unlinkSync(path.join(logDir, file));
          });
        }
      }
    } catch (error) {
      console.error('日志轮转失败:', error.message);
    }
  }
}

// 创建全局日志实例
const logger = new Logger();

// 定期检查日志轮转
setInterval(() => {
  logger.rotate();
}, 60000); // 每分钟检查一次

module.exports = logger;
