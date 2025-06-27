/**
 * 错误处理中间件
 */

const logger = require('../utils/logger');

/**
 * 404错误处理中间件
 */
const notFoundHandler = (req, res, next) => {
  const error = new Error(`路径 ${req.originalUrl} 未找到`);
  error.status = 404;
  next(error);
};

/**
 * 全局错误处理中间件
 */
const errorHandler = (err, req, res, next) => {
  // 设置默认错误状态码
  const status = err.status || err.statusCode || 500;
  
  // 记录错误日志
  logger.error('请求处理错误', {
    method: req.method,
    url: req.originalUrl,
    status,
    error: err.message,
    stack: err.stack,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });
  
  // 开发环境返回详细错误信息
  const isDevelopment = process.env.NODE_ENV !== 'production';
  
  // 构造错误响应
  const errorResponse = {
    success: false,
    code: status,
    message: err.message || '服务器内部错误',
    timestamp: new Date().toISOString()
  };
  
  // 开发环境添加错误堆栈
  if (isDevelopment) {
    errorResponse.stack = err.stack;
    errorResponse.details = err.details || null;
  }
  
  // 特殊错误类型处理
  switch (err.name) {
    case 'ValidationError':
      errorResponse.code = 400;
      errorResponse.message = '请求参数验证失败';
      if (err.details) {
        errorResponse.details = err.details;
      }
      break;
      
    case 'UnauthorizedError':
      errorResponse.code = 401;
      errorResponse.message = '未授权访问';
      break;
      
    case 'ForbiddenError':
      errorResponse.code = 403;
      errorResponse.message = '禁止访问';
      break;
      
    case 'NotFoundError':
      errorResponse.code = 404;
      errorResponse.message = '资源未找到';
      break;
      
    case 'ConflictError':
      errorResponse.code = 409;
      errorResponse.message = '资源冲突';
      break;
      
    case 'TooManyRequestsError':
      errorResponse.code = 429;
      errorResponse.message = '请求过于频繁';
      break;
      
    case 'SyntaxError':
      errorResponse.code = 400;
      errorResponse.message = 'JSON格式错误';
      break;
      
    case 'DatabaseError':
      errorResponse.code = 500;
      errorResponse.message = '数据库操作失败';
      break;
      
    case 'NetworkError':
      errorResponse.code = 502;
      errorResponse.message = '网络连接失败';
      break;
      
    case 'TimeoutError':
      errorResponse.code = 504;
      errorResponse.message = '请求超时';
      break;
  }
  
  // 发送错误响应
  res.status(errorResponse.code).json(errorResponse);
};

/**
 * 异步错误处理包装器
 */
const asyncErrorHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * 自定义错误类
 */
class AppError extends Error {
  constructor(message, statusCode = 500, details = null) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;
    
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, 400, details);
    this.name = 'ValidationError';
  }
}

class UnauthorizedError extends AppError {
  constructor(message = '未授权访问') {
    super(message, 401);
    this.name = 'UnauthorizedError';
  }
}

class ForbiddenError extends AppError {
  constructor(message = '禁止访问') {
    super(message, 403);
    this.name = 'ForbiddenError';
  }
}

class NotFoundError extends AppError {
  constructor(message = '资源未找到') {
    super(message, 404);
    this.name = 'NotFoundError';
  }
}

class ConflictError extends AppError {
  constructor(message = '资源冲突') {
    super(message, 409);
    this.name = 'ConflictError';
  }
}

class TooManyRequestsError extends AppError {
  constructor(message = '请求过于频繁') {
    super(message, 429);
    this.name = 'TooManyRequestsError';
  }
}

class DatabaseError extends AppError {
  constructor(message = '数据库操作失败', details = null) {
    super(message, 500, details);
    this.name = 'DatabaseError';
  }
}

class NetworkError extends AppError {
  constructor(message = '网络连接失败') {
    super(message, 502);
    this.name = 'NetworkError';
  }
}

class TimeoutError extends AppError {
  constructor(message = '请求超时') {
    super(message, 504);
    this.name = 'TimeoutError';
  }
}

module.exports = {
  notFoundHandler,
  errorHandler,
  asyncErrorHandler,
  AppError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  TooManyRequestsError,
  DatabaseError,
  NetworkError,
  TimeoutError
};
