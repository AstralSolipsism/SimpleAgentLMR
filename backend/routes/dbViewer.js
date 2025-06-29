/**
 * 数据库速览功能路由
 */
const express = require('express');
const router = express.Router();
const { db } = require('../database/init');
const logger = require('../utils/logger');
const { asyncErrorHandler } = require('../middleware/errorHandler');

/**
 * 获取所有数据表的名称列表
 */
router.get('/tables', asyncErrorHandler(async (req, res) => {
  logger.info('GET /api/v1/db-viewer/tables - 收到请求');
  try {
    const tables = await new Promise((resolve, reject) => {
      db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows.map(row => row.name));
        }
      });
    });
    
    logger.info('GET /api/v1/db-viewer/tables - 操作成功');
    res.json({
      success: true,
      code: 200,
      message: '获取数据库表列表成功',
      data: tables,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('获取数据库表列表失败', { error: error.message, stack: error.stack });
    throw error;
  }
}));

/**
 * 获取指定数据表的内容（带分页）
 */
router.get('/tables/:tableName', asyncErrorHandler(async (req, res) => {
  const { tableName } = req.params;
  const { page = 1, pageSize = 20 } = req.query;
  logger.info(`GET /api/v1/db-viewer/tables/${tableName} - 收到请求`, { params: req.params, query: req.query });
  const offset = (page - 1) * pageSize;

  // 安全性检查：确保表名是合法的，防止SQL注入
  const tables = await new Promise((resolve, reject) => {
    db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, rows) => {
      if (err) reject(err);
      else resolve(rows.map(row => row.name));
    });
  });

  if (!tables.includes(tableName)) {
    return res.status(404).json({ success: false, message: '表不存在' });
  }

  try {
    // 获取总行数
    const countResult = await new Promise((resolve, reject) => {
      db.get(`SELECT COUNT(*) as total FROM ${tableName}`, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    // 获取分页后的数据
    const tableContent = await new Promise((resolve, reject) => {
      const sql = `SELECT * FROM ${tableName} LIMIT ? OFFSET ?`;
      db.all(sql, [pageSize, offset], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    logger.info(`GET /api/v1/db-viewer/tables/${tableName} - 操作成功`);
    res.json({
      success: true,
      code: 200,
      message: `获取表 ${tableName} 内容成功`,
      data: {
        items: tableContent,
        pagination: {
          page: parseInt(page),
          pageSize: parseInt(pageSize),
          total: countResult.total,
          totalPages: Math.ceil(countResult.total / pageSize)
        }
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error(`获取表 ${tableName} 内容失败`, { error: error.message, stack: error.stack });
    throw error;
  }
}));
module.exports = router;