// backend/scripts/unlock_db.js
const { db, initPromise } = require('../database/init');
const logger = require('../utils/logger');

async function unlockDatabase() {
  try {
    await initPromise; // 等待数据库初始化完成
    logger.info('数据库已连接，准备清理卡住的任务...');

    const query = `DELETE FROM tasks WHERE status IN ('pending', 'running', 'delegated')`;
    
    db.run(query, function(err) {
      if (err) {
        logger.error('清理任务失败', { error: err.message });
        return;
      }
      logger.info(`操作成功，共清理了 ${this.changes} 个卡住的任务。数据库现在应该已解锁。`);
    });

    // 关闭数据库连接
    db.close((err) => {
      if (err) {
        logger.error('关闭数据库连接失败', err.message);
      } else {
        logger.info('数据库连接已关闭。');
      }
    });

  } catch (error) {
    logger.error('执行解锁脚本时发生严重错误', { error: error.message, stack: error.stack });
  }
}

unlockDatabase();