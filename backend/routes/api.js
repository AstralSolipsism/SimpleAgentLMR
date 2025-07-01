const express = require('express');
const router = express.Router();
const taskExecutor = require('../services/taskExecutor');
const logger = require('../utils/logger');
const { db } = require('../database/init.js'); // 引入数据库实例
const { v4: uuidv4 } = require('uuid'); // 用于生成任务ID

// 引入各个路由模块
const applicationsRouter = require('./applications');
const agentsRouter = require('./agents');
const tasksRouter = require('./tasks');
const inputSourcesRouter = require('./inputSources');
const outputConfigsRouter = require('./outputConfigs');
const mcpRouter = require('./mcp');
const visualizationRouter = require('./visualization');
const configRouter = require('./config');


// 注册内部管理路由
router.use('/applications', applicationsRouter);
router.use('/agents', agentsRouter);
router.use('/tasks', tasksRouter);
router.use('/input-sources', inputSourcesRouter);
router.use('/output-configs', outputConfigsRouter);
router.use('/mcp', mcpRouter);
router.use('/visualization', visualizationRouter);
router.use('/config', configRouter);


// 外部访问接口 - 任务状态查询
router.get('/external/task/:taskId', async (req, res) => {
  const { taskId } = req.params;
  logger.info(`GET /external/task/${taskId} - 收到请求`, { params: req.params });
  try {
    const task = await db.get('SELECT * FROM tasks WHERE id = ?', [taskId]);

    if (!task) {
      return res.status(404).json({ success: false, message: '任务不存在' });
    }

    const steps = await db.all('SELECT * FROM task_steps WHERE task_id = ? ORDER BY started_at ASC', [taskId]);

    // 解析JSON字段
    let result = null;
    if (task.result) {
        try {
            result = JSON.parse(task.result);
        } catch (e) {
            result = task.result; // 如果解析失败，返回原始字符串
        }
    }

    logger.info(`GET /external/task/${taskId} - 操作成功`);
    res.json({
      success: true,
      data: {
        id: task.id,
        status: task.status,
        startTime: task.started_at,
        endTime: task.finished_at,
        progress: {
          totalSteps: steps.length,
          completedSteps: steps.filter(s => s.status === 'completed').length,
          currentStep: steps.find(s => s.status === 'running')?.step_id || null
        },
        result: task.status === 'completed' ? result : null,
        error: task.error || null
      }
    });

  } catch (error) {
    logger.error(`任务状态查询失败，taskId: ${taskId}`, { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, message: '任务状态查询失败', error: error.message });
  }
});

// 外部访问接口 - 输入源列表（用于其他系统了解可用的接入点）
router.get('/external/input-sources', async (req, res) => {
  logger.info('GET /external/input-sources - 收到请求');
  try {
    const sources = await db.all('SELECT id, source_name FROM input_sources');
    const baseUrl = `http://${req.get('host')}`;

    const formattedSources = sources.map(source => ({
      id: source.id,
      name: source.source_name,
      description: `通过此端点使用 '${source.source_name}' 输入源来触发任务。`,
      endpoint: `/api/v1/tasks/trigger/${source.id}`,
      baseUrl: baseUrl,
      method: 'POST',
      parameters: {
        path: {
          sourceId: `string - 输入源ID: ${source.id}`
        },
        body: {
          input: 'string - 用于任务的主要输入数据。',
          context: 'object - (可选) 用于任务的附加上下文数据。'
        }
      },
      example: {
        description: `触发源 '${source.source_name}' 的示例请求`,
        request: {
          url: `${baseUrl}/api/v1/tasks/trigger/${source.id}`,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: {
            input: '这是一个测试输入。',
            context: {
              sourceType: 'external_api'
            }
          }
        }
      }
    }));

    logger.info('GET /external/input-sources - 操作成功');
    res.json({
      success: true,
      data: formattedSources
    });

  } catch (error) {
    logger.error('获取输入源列表失败', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '获取输入源列表失败',
      error: error.message
    });
  }
});

// 健康检查
router.get('/health', (req, res) => {
  logger.info('GET /health - 健康检查');
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

// API文档信息
router.get('/info', (req, res) => {
  logger.info('GET /info - 获取API信息');
  res.json({
    name: 'SimpleA2A System',
    description: 'A2A智能体调度系统',
    version: '1.0.0',
    endpoints: {
      external: {
        status: 'GET /api/v1/external/task/:taskId - 查询任务状态',
        inputSources: 'GET /api/v1/external/input-sources - 获取输入源列表'
      },
      management: {
        config: '/api/v1/config - 系统配置管理',
        agents: '/api/v1/agents - 智能体管理',
        tasks: '/api/v1/tasks - 任务管理',
        visualization: '/api/v1/visualization - 网络可视化'
      }
    },
    documentation: {
      swagger: '/api/docs',
      readme: '/README.md'
    }
  });
});

module.exports = router;