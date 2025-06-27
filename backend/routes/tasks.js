/**
 * 任务管理路由 (已修复异步数据库调用)
 */

const express = require('express');
const router = express.Router();
const db = require('../database/init');
const logger = require('../utils/logger');
const { asyncErrorHandler, ValidationError, NotFoundError } = require('../middleware/errorHandler');
const { v4: uuidv4 } = require('uuid');
const taskExecutor = require('../services/taskExecutor');

// 辅助函数，将回调风格的db调用Promise化
const dbGet = (sql, params) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => {
    if (err) reject(err);
    else resolve(row);
  });
});

const dbAll = (sql, params) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => {
    if (err) reject(err);
    else resolve(rows);
  });
});

const dbRun = (sql, params) => new Promise((resolve, reject) => {
  db.run(sql, params, function(err) {
    if (err) reject(err);
    else resolve(this);
  });
});


/**
 * 获取任务列表
 */
router.get('/', asyncErrorHandler(async (req, res) => {
  const { page = 1, pageSize = 20, status, source_id } = req.query;
  const offset = (page - 1) * pageSize;

  let sql = `
    SELECT t.*, ins.source_name
    FROM tasks t
    LEFT JOIN input_sources ins ON t.source_id = ins.id
    WHERE 1=1
  `;
  let countSql = 'SELECT COUNT(*) as total FROM tasks WHERE 1=1';
  const params = [];
  const countParams = [];

  if (status) {
    sql += ' AND t.status = ?';
    countSql += ' AND status = ?';
    params.push(status);
    countParams.push(status);
  }

  if (source_id) {
    sql += ' AND t.source_id = ?';
    countSql += ' AND source_id = ?';
    params.push(source_id);
    countParams.push(source_id);
  }

  sql += ' ORDER BY t.created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(pageSize), parseInt(offset));

  const totalResult = await dbGet(countSql, countParams);
  const tasks = await dbAll(sql, params);

  const processedTasks = tasks.map(task => ({
    ...task,
    input_data: task.input_data ? JSON.parse(task.input_data) : null,
    result: task.result ? JSON.parse(task.result) : null,
  }));

  res.json({
    success: true,
    data: {
      items: processedTasks,
      pagination: {
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        total: totalResult.total,
        totalPages: Math.ceil(totalResult.total / pageSize)
      }
    }
  });
}));

/**
 * 获取任务详情
 */
router.get('/:taskId', asyncErrorHandler(async (req, res) => {
  const { taskId } = req.params;

  const task = await dbGet('SELECT * FROM tasks WHERE id = ?', [taskId]);
  if (!task) {
    throw new NotFoundError('任务不存在');
  }

  const steps = await dbAll('SELECT * FROM task_steps WHERE task_id = ? ORDER BY started_at ASC', [taskId]);

  task.input_data = task.input_data ? JSON.parse(task.input_data) : null;
  task.result = task.result ? JSON.parse(task.result) : null;
  const processedSteps = steps.map(step => ({
      ...step,
      context: step.context ? JSON.parse(step.context) : null,
      response: step.response ? JSON.parse(step.response) : null,
      parsed_actions: step.parsed_actions ? JSON.parse(step.parsed_actions) : null,
      action_results: step.action_results ? JSON.parse(step.action_results) : null,
  }));

  res.json({
    success: true,
    data: {
      ...task,
      steps: processedSteps
    }
  });
}));

/**
 * 获取任务步骤
 */
router.get('/:taskId/steps', asyncErrorHandler(async (req, res) => {
    const { taskId } = req.params;
    const steps = await dbAll('SELECT * FROM task_steps WHERE task_id = ? ORDER BY started_at ASC', [taskId]);
    
    if (!steps || steps.length === 0) {
        const task = await dbGet('SELECT id FROM tasks WHERE id = ?', [taskId]);
        if (!task) throw new NotFoundError('任务不存在');
    }

    res.json({
        success: true,
        data: steps.map(step => ({
            ...step,
            context: step.context ? JSON.parse(step.context) : null,
            response: step.response ? JSON.parse(step.response) : null,
            parsed_actions: step.parsed_actions ? JSON.parse(step.parsed_actions) : null,
            action_results: step.action_results ? JSON.parse(step.action_results) : null,
        }))
    });
}));


/**
 * 获取活跃任务
 */
router.get('/active', asyncErrorHandler(async (req, res) => {
    const activeTasks = await dbAll(`
        SELECT t.*, ins.source_name
        FROM tasks t
        LEFT JOIN input_sources ins ON t.source_id = ins.id
        WHERE t.status IN ('pending', 'running')
        ORDER BY t.created_at DESC
    `, []);
    
    const processedTasks = activeTasks.map(task => ({
        ...task,
        input_data: task.input_data ? JSON.parse(task.input_data) : null,
    }));

    res.json({
        success: true,
        data: {
            tasks: processedTasks,
            count: processedTasks.length
        }
    });
}));

/**
 * 取消任务
 */
router.post('/:taskId/cancel', asyncErrorHandler(async (req, res) => {
  const { taskId } = req.params;
  const { reason = '任务被手动取消' } = req.body;

  const task = await dbGet('SELECT status FROM tasks WHERE id = ?', [taskId]);
  if (!task) {
    throw new NotFoundError('任务不存在');
  }

  if (!['pending', 'running'].includes(task.status)) {
    throw new ValidationError('只能取消待执行或正在执行的任务');
  }

  await dbRun(
    "UPDATE tasks SET status = 'failed', error = ?, finished_at = ? WHERE id = ?",
    [reason, new Date().toISOString(), taskId]
  );
  
  logger.info('任务取消成功', { taskId, reason });

  res.json({
    success: true,
    message: '任务取消成功',
    data: {
      taskId: taskId,
      status: 'failed',
      cancelled_at: new Date().toISOString()
    }
  });
}));

/**
 * 从特定输入源触发新任务
 */
router.post('/trigger/:sourceId', (req, res, next) => {
  const { sourceId } = req.params;
  const inputData = req.body;

  // 使用 Promise.all 并行处理数据库查询和任务创建
  dbGet("SELECT * FROM input_sources WHERE id = ? AND status = 'active'", [sourceId])
    .then(inputSource => {
      if (!inputSource) {
        throw new NotFoundError(`输入源 ${sourceId} 未配置或已禁用`);
      }

      const taskId = uuidv4();
      const createdAt = new Date().toISOString();
      
      const sql = 'INSERT INTO tasks (id, source_id, input_data, status, created_at) VALUES (?, ?, ?, ?, ?)';
      const params = [taskId, sourceId, JSON.stringify(inputData), 'pending', createdAt];

      // 使用原始的回调方式来获取 lastID 并确保时序
      db.run(sql, params, function(err) {
        if (err) {
          return next(err); // 将错误传递给Express错误处理中间件
        }

        // 1. 立即响应客户端
        res.status(202).json({
          success: true,
          message: '任务已接收，正在处理中',
          data: {
            taskId: taskId,
            sourceId: sourceId,
            status: 'pending',
            created_at: createdAt
          }
        });
        
        logger.info('通过输入源触发任务成功', { taskId, sourceId });

        // 2. 创建完整的 taskRecord 对象
        const taskRecord = {
          id: taskId,
          source_id: sourceId,
          // agent_id 不在 tasks 表中，但 executeTask 需要它，所以我们从 inputSource 获取
          // 这个字段不会被存入数据库，仅用于传递
          agent_id: inputSource.agent_id,
          status: 'pending',
          input_data: JSON.stringify(inputData),
          created_at: createdAt,
          // 注意：其他字段如 started_at, finished_at, result, error 默认为 NULL
        };

        // 3. 使用 setImmediate 将任务执行推迟到下一个事件循环
        //    这样可以确保响应已经发送给客户端
        setImmediate(() => {
          taskExecutor.executeTask(taskRecord).catch(err => {
            logger.error(`后台执行任务失败: ${taskId}`, { error: err.message, stack: err.stack });
          });
        });
      });
    })
    .catch(next); // 捕获 dbGet 的错误并传递给Express
});

module.exports = router;
