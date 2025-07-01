const db = require('./init');
const { v4: uuidv4 } = require('uuid');

/**
 * 将db.run包装成Promise
 * @param {string} sql 
 * @param {Array} params 
 * @returns Promise
 */
const dbRun = (sql, params) => new Promise((resolve, reject) => {
  db.db.run(sql, params, function(err) {
    if (err) {
      reject(err);
    } else {
      resolve(this);
    }
  });
});

/**
 * 将db.get包装成Promise
 * @param {string} sql 
 * @param {Array} params 
 * @returns Promise
 */
const dbGet = (sql, params) => new Promise((resolve, reject) => {
  db.db.get(sql, params, (err, row) => {
    if (err) {
      reject(err);
    } else {
      resolve(row);
    }
  });
});


class Task {
  /**
   * 创建一个新任务
   * @param {object} data - 任务数据
   * @returns {Promise<object>} - 创建的任务对象
   */
  static async create(data) {
    const taskId = uuidv4();
    const { agent_id, input_data, status, parent_task_id } = data;
    
    const sql = `
      INSERT INTO tasks (id, agent_id, input_data, status, parent_task_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    
    const params = [
      taskId,
      agent_id,
      input_data, // 直接使用调用者提供的 input_data
      status || 'pending',
      parent_task_id || null,
      new Date().toISOString()
    ];

    await dbRun(sql, params);
    
    return await dbGet('SELECT * FROM tasks WHERE id = ?', [taskId]);
  }
}

module.exports = {
  Task
};