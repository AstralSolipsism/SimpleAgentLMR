// backend/app.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const { createServer } = require('http');
const WebSocket = require('ws');

// 导入配置和工具
const config = require('./config/config');
const logger = require('./utils/logger');
const { db, initPromise: dbInitPromise } = require('./database/init'); // 引入数据库实例和初始化Promise
const mcpManager = require('./services/mcpManager'); // 引入MCP管理器
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { rateLimiter } = require('./middleware/rateLimiter');

// 导入路由
const apiRoutes = require('./routes/api');
const taskRoutes = require('./routes/tasks');
const agentRoutes = require('./routes/agents');
const mcpRoutes = require('./routes/mcp');
const visualizationRoutes = require('./routes/visualization');
const dbViewerRoutes = require('./routes/dbViewer');
const dataSyncRoutes = require('./routes/dataSync');

// 创建Express应用
const app = express();
const server = createServer(app);

// WebSocket服务器
const wss = new WebSocket.Server({
  server,
  path: '/ws'
});

// 中间件配置
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "ws:", "wss:"]
    }
  }
}));

app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['http://10.121.232.66'] 
    : ['http://localhost:8080', 'http://127.0.0.1:8080'],
  credentials: true
}));

app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 速率限制
app.use('/api', rateLimiter);

// 静态文件服务 (如果需要)
app.use('/static', express.static(path.join(__dirname, 'public')));

// API路由
app.use('/api/v1', apiRoutes);
app.use('/api/v1/tasks', taskRoutes);
app.use('/api/v1/agents', agentRoutes);
app.use('/api/v1/mcp', mcpRoutes);
app.use('/api/v1/visualization', visualizationRoutes);
app.use('/api/v1/db-viewer', dbViewerRoutes);
app.use('/api/v1', dataSyncRoutes);

// 健康检查端点
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'A2A智能体调度系统运行正常',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// WebSocket连接处理
wss.on('connection', (ws, req) => {
  logger.info('WebSocket客户端连接', { ip: req.socket.remoteAddress });
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      logger.debug('收到WebSocket消息', { data });
      
      // 处理不同类型的WebSocket消息
      switch (data.type) {
        case 'subscribe_task':
          // 订阅任务状态更新
          ws.taskId = data.taskId;
          ws.send(JSON.stringify({
            type: 'subscribed',
            taskId: data.taskId,
            message: '已订阅任务状态更新'
          }));
          break;
          
        case 'ping':
          ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
          break;
          
        default:
          ws.send(JSON.stringify({
            type: 'error',
            message: '未知的消息类型'
          }));
      }
    } catch (error) {
      logger.error('WebSocket消息处理错误', { error: error.message });
      ws.send(JSON.stringify({
        type: 'error',
        message: '消息格式错误'
      }));
    }
  });
  
  ws.on('close', () => {
    logger.info('WebSocket客户端断开连接');
  });
  
  ws.on('error', (error) => {
    logger.error('WebSocket错误', { error: error.message });
  });
});

// 任务状态广播函数
const broadcastTaskUpdate = (taskId, update) => {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN && client.taskId === taskId) {
      client.send(JSON.stringify({
        type: 'task_update',
        taskId,
        ...update
      }));
    }
  });
};

// 将广播函数添加到app对象，供其他模块使用
app.broadcastTaskUpdate = broadcastTaskUpdate;

// 错误处理中间件
app.use(notFoundHandler);
app.use(errorHandler);

// 优雅关闭处理
const gracefulShutdown = (signal) => {
  logger.info(`收到 ${signal} 信号，开始优雅关闭`);
  server.close(() => {
    logger.info('HTTP服务器已关闭');
    if (db) {
      db.close((err) => {
        if (err) {
          logger.error('关闭数据库连接失败', { error: err.message });
          process.exit(1);
        } else {
          logger.info('数据库连接已成功关闭');
          process.exit(0);
        }
      });
    } else {
      logger.info('数据库未初始化，无需关闭');
      process.exit(0);
    }
  });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// 未捕获异常处理
process.on('uncaughtException', (error) => {
  logger.error('未捕获的异常', { error: error.message, stack: error.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('未处理的Promise拒绝', { reason, promise });
  process.exit(1);
});

// 启动服务器
const startServer = async () => {
  try {
    // 1. 等待数据库完全初始化
    logger.info('正在初始化数据库...');
    await dbInitPromise; // 等待数据库初始化Promise解析
    logger.info('数据库初始化完成。');

    // 2. 在数据库就绪后，再初始化MCP管理器
    logger.info('正在初始化MCP管理器...');
    await mcpManager.initialize();
    logger.info('MCP管理器初始化完成。');

    // 初始化并启动定时任务调度器
    logger.info('正在初始化定时任务调度器...');
    const scheduler = require('./services/scheduler');
    scheduler.start();
    logger.info('定时任务调度器初始化完成。');

    // 3. 启动服务器
    const port = process.env.PORT || config.server.port;
    server.listen(port, () => {
      logger.info(`A2A智能体调度系统启动成功`, {
        port,
        environment: process.env.NODE_ENV || 'development',
        pid: process.pid
      });
    });
  } catch (error) {
    logger.error('服务器启动失败', { error: error.message, stack: error.stack });
    process.exit(1);
  }
};

// 如果直接运行此文件，则启动服务器
if (require.main === module) {
  startServer();
}

module.exports = app;
