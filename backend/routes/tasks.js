/**
 * 任务管理路由 (已修复异步数据库调用)
 */

const express = require('express');
const router = express.Router();
const { db } = require('../database/init');
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
  logger.info(`GET /api/v1/tasks - Request received`, { query: req.query });
  const { page = 1, pageSize = 20, status, source_id } = req.query;
  const offset = (page - 1) * pageSize;

  // 1. 基础查询只针对主任务 (parent_task_id IS NULL)
  let baseWhere = ' WHERE t.parent_task_id IS NULL ';
  const params = [];
  const countParams = [];

  if (status && status !== 'all') {
    baseWhere += ' AND t.status = ?';
    params.push(status);
    countParams.push(status);
  }

  if (source_id) {
    baseWhere += ' AND t.source_id = ?';
    params.push(source_id);
    countParams.push(source_id);
  }

  // 2. 构建主任务和总数查询SQL
  const countSql = `SELECT COUNT(*) as total FROM tasks t ${baseWhere}`;
  const sql = `
    SELECT t.*, ins.source_name
    FROM tasks t
    LEFT JOIN input_sources ins ON t.source_id = ins.id
    ${baseWhere}
    ORDER BY t.created_at DESC
    LIMIT ? OFFSET ?
  `;
  params.push(parseInt(pageSize), parseInt(offset));

  // 执行查询
  const totalResult = await dbGet(countSql, countParams);
  const mainTasks = await dbAll(sql, params);

  if (mainTasks.length === 0) {
    return res.json({
      success: true,
      data: {
        items: [],
        pagination: { page: parseInt(page), pageSize: parseInt(pageSize), total: 0, totalPages: 0 }
      }
    });
  }

  // 3. 获取主任务ID，并一次性查询所有相关的子任务
  const mainTaskIds = mainTasks.map(t => t.id);
  const subtasksSql = `
    SELECT * FROM tasks
    WHERE parent_task_id IN (${mainTaskIds.map(() => '?').join(',')})
    ORDER BY created_at ASC
  `;
  const allSubtasks = await dbAll(subtasksSql, mainTaskIds);

  // 4. 将子任务按 parent_task_id 分组
  const subtasksMap = allSubtasks.reduce((acc, subtask) => {
    const parentId = subtask.parent_task_id;
    if (!acc[parentId]) {
      acc[parentId] = [];
    }
    // 解析子任务的JSON字段
    try {
      subtask.input_data = subtask.input_data ? JSON.parse(subtask.input_data) : null;
      subtask.result = subtask.result ? JSON.parse(subtask.result) : null;
    } catch (e) {
      logger.warn(`Failed to parse JSON for subtask ${subtask.id}`, e);
    }
    acc[parentId].push(subtask);
    return acc;
  }, {});

  // 5. 处理主任务并附加子任务数组
  const processedTasks = mainTasks.map(task => {
    try {
      task.input_data = task.input_data ? JSON.parse(task.input_data) : null;
      task.result = task.result ? JSON.parse(task.result) : null;
    } catch (e) {
      logger.warn(`Failed to parse JSON for main task ${task.id}`, e);
    }
    return {
      ...task,
      subtasks: subtasksMap[task.id] || [] // 附加子任务
    };
  });

  logger.info(`GET /api/v1/tasks - Operation successful`);
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
  logger.trace(`GET /api/v1/tasks/${taskId} - Request received`, { params: req.params });

  const task = await dbGet('SELECT * FROM tasks WHERE id = ?', [taskId]);
  if (!task) {
    throw new NotFoundError('任务不存在');
  }

  const steps = await dbAll('SELECT * FROM task_steps WHERE task_id = ? ORDER BY started_at ASC', [taskId]);
  
  // 新增：获取子任务
  let subtasks = await dbAll('SELECT * FROM tasks WHERE parent_task_id = ? ORDER BY created_at ASC', [taskId]);

  // 为每个子任务获取其步骤
  for (let i = 0; i < subtasks.length; i++) {
    const subtaskSteps = await dbAll('SELECT * FROM task_steps WHERE task_id = ? ORDER BY started_at ASC', [subtasks[i].id]);
    subtasks[i].steps = subtaskSteps.map(step => ({
      ...step,
      context: step.context ? JSON.parse(step.context) : null,
      response: step.response ? JSON.parse(step.response) : null,
      parsed_actions: step.parsed_actions ? JSON.parse(step.parsed_actions) : null,
      action_results: step.action_results ? JSON.parse(step.action_results) : null,
    }));
    // 解析一下子任务的JSON字段
    subtasks[i].input_data = subtasks[i].input_data ? JSON.parse(subtasks[i].input_data) : null;
    subtasks[i].result = subtasks[i].result ? JSON.parse(subtasks[i].result) : null;
  }

  task.input_data = task.input_data ? JSON.parse(task.input_data) : null;
  task.result = task.result ? JSON.parse(task.result) : null;
  const processedSteps = steps.map(step => ({
      ...step,
      context: step.context ? JSON.parse(step.context) : null,
      response: step.response ? JSON.parse(step.response) : null,
      parsed_actions: step.parsed_actions ? JSON.parse(step.parsed_actions) : null,
      action_results: step.action_results ? JSON.parse(step.action_results) : null,
  }));

  logger.trace(`GET /api/v1/tasks/${taskId} - Operation successful`);
  res.json({
    success: true,
    data: {
      ...task,
      steps: processedSteps,
      subtasks: subtasks // 在响应中加入子任务
    }
  });
}));

/**
 * 获取任务步骤
 */
router.get('/:taskId/steps', asyncErrorHandler(async (req, res) => {
    const { taskId } = req.params;
    logger.info(`GET /api/v1/tasks/${taskId}/steps - Request received`, { params: req.params });
    const steps = await dbAll('SELECT * FROM task_steps WHERE task_id = ? ORDER BY started_at ASC', [taskId]);
    
    if (!steps || steps.length === 0) {
        const task = await dbGet('SELECT id FROM tasks WHERE id = ?', [taskId]);
        if (!task) throw new NotFoundError('任务不存在');
    }

    logger.info(`GET /api/v1/tasks/${taskId}/steps - Operation successful`);
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
    logger.info(`GET /api/v1/tasks/active - Request received`);
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

    logger.info(`GET /api/v1/tasks/active - Operation successful`);
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
  logger.info(`POST /api/v1/tasks/${taskId}/cancel - Request received`, { params: req.params, body: req.body });

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
  
  logger.info(`POST /api/v1/tasks/${taskId}/cancel - Operation successful`);

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
  logger.info(`POST /api/v1/tasks/trigger/${sourceId} - Request received`, { params: req.params, body: inputData });

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
          logger.error(`Trigger task failed during DB insert for sourceId: ${sourceId}`, { error: err.message, stack: err.stack });
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
        
        logger.info(`POST /api/v1/tasks/trigger/${sourceId} - Task creation successful, queuing for execution.`);

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

/**
 * 批量删除任务及其所有子任务和相关步骤
 */
router.delete('/', asyncErrorHandler(async (req, res) => {
  const { taskIds } = req.body;

  if (!taskIds || !Array.isArray(taskIds) || taskIds.length === 0) {
    throw new ValidationError('请求体中必须包含一个非空的 taskIds 数组');
  }

  logger.info(`DELETE /api/v1/tasks - Request received to delete tasks`, { taskIds });

  // 1. 递归函数，用于查找一个任务的所有子孙任务ID
  const findAllDescendantIds = async (parentId) => {
    let descendantIds = [];
    const children = await dbAll('SELECT id FROM tasks WHERE parent_task_id = ?', [parentId]);
    for (const child of children) {
      descendantIds.push(child.id);
      const grandchildrenIds = await findAllDescendantIds(child.id);
      descendantIds = descendantIds.concat(grandchildrenIds);
    }
    return descendantIds;
  };

  // 2. 收集所有需要删除的任务ID（包括子孙任务）
  let allTaskIdsToDelete = [...taskIds];
  for (const taskId of taskIds) {
    const descendantIds = await findAllDescendantIds(taskId);
    allTaskIdsToDelete = allTaskIdsToDelete.concat(descendantIds);
  }
  // 去重
  allTaskIdsToDelete = [...new Set(allTaskIdsToDelete)];

  // 3. 使用事务执行删除操作
  await new Promise((resolve, reject) => {
    db.serialize(async () => {
      try {
        await dbRun('BEGIN TRANSACTION;', []);

        const placeholder = allTaskIdsToDelete.map(() => '?').join(',');

        // 3.1 删除所有相关任务的步骤
        const deleteStepsSql = `DELETE FROM task_steps WHERE task_id IN (${placeholder})`;
        await dbRun(deleteStepsSql, allTaskIdsToDelete);

        // 3.2 删除所有相关任务
        const deleteTasksSql = `DELETE FROM tasks WHERE id IN (${placeholder})`;
        await dbRun(deleteTasksSql, allTaskIdsToDelete);

        await dbRun('COMMIT;', []);
        resolve();
      } catch (err) {
        logger.error('Transaction failed, rolling back.', { error: err.message });
        await dbRun('ROLLBACK;', []);
        reject(err);
      }
    });
  });

  logger.info(`DELETE /api/v1/tasks - Successfully deleted tasks and their descendants.`);
  res.status(200).json({
    success: true,
    message: `成功删除了 ${taskIds.length} 个主任务及其所有相关数据。`,
    data: {
      deleted_ids: allTaskIdsToDelete
    }
  });
}));
module.exports = router;
