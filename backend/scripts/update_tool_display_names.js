// backend/scripts/update_tool_display_names.js

const fs = require('fs').promises;
const path = require('path');
const { db, initPromise } = require('../database/init');
const logger = require('../utils/logger');

const TOOLS_DIR = path.join(__dirname, '..', 'services', 'mcp_tools');
const JSDOC_NAME_REGEX = /^\s*\*\s*@name\s+(.*)/m;

/**
 * Scans local MCP tool files and updates the database with display names from JSDoc comments.
 */
async function updateToolDisplayNames() {
  // 等待数据库初始化完成
  await initPromise;
  logger.info('数据库初始化完成，开始更新工具显示名称...');

  // 1. 检查并添加 'display_name' 列
  try {
    const columns = await new Promise((resolve, reject) => {
      db.all("PRAGMA table_info(mcp_tools)", (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });

    const hasDisplayNameColumn = columns.some(col => col.name === 'display_name');

    if (!hasDisplayNameColumn) {
      logger.info('`mcp_tools` 表中缺少 `display_name` 列，正在添加...');
      await new Promise((resolve, reject) => {
        db.run("ALTER TABLE mcp_tools ADD COLUMN display_name TEXT", (err) => {
          if (err) return reject(err);
          logger.info('成功添加 `display_name` 列。');
          resolve();
        });
      });
    } else {
      logger.info('`display_name` 列已存在，跳过添加步骤。');
    }
  } catch (error) {
    logger.error('检查或添加 `display_name` 列时出错:', error);
    throw error; // 如果此步骤失败，则停止执行
  }

  // 2. 扫描工具目录
  const files = await fs.readdir(TOOLS_DIR);
  const jsFiles = files.filter(file => file.endsWith('.js'));
  logger.info(`在 ${TOOLS_DIR} 中找到 ${jsFiles.length} 个 JS 文件。`);

  // 3. 循环处理每个文件
  for (const file of jsFiles) {
    const filePath = path.join(TOOLS_DIR, file);
    try {
      const fileContent = await fs.readFile(filePath, 'utf8');
      
      // 使用 require.resolve 获取完整路径，然后从缓存中删除，以确保每次都读取最新的模块信息
      const fullPath = require.resolve(filePath);
      delete require.cache[fullPath];
      const toolModule = require(filePath);
      
      const tool_name = toolModule.name;

      if (!tool_name) {
        logger.warn(`跳过文件 ${file}：未导出 'name' 属性。`);
        continue;
      }

      const match = fileContent.match(JSDOC_NAME_REGEX);
      if (match && match[1]) {
        const display_name = match[1].trim();
        
        // 4. 更新数据库
        await new Promise((resolve, reject) => {
          const stmt = db.prepare("UPDATE mcp_tools SET display_name = ? WHERE tool_name = ?");
          stmt.run(display_name, tool_name, function(err) {
            if (err) {
              logger.error(`更新工具 '${tool_name}' 的显示名称失败:`, err);
              return reject(err);
            }
            if (this.changes > 0) {
              logger.info(`成功更新工具: ${tool_name} -> ${display_name}`);
            } else {
              logger.warn(`未找到工具 '${tool_name}' 的记录进行更新，可能需要先注册该工具。`);
            }
            resolve();
          });
          stmt.finalize();
        });
      } else {
        logger.warn(`跳过工具 '${tool_name}' (文件: ${file})：未在 JSDoc 中找到 @name 标签。`);
      }
    } catch (error) {
      logger.error(`处理文件 ${file} 时发生错误:`, error);
    }
  }
}

// 执行主函数并处理数据库连接的关闭
(async () => {
  try {
    await updateToolDisplayNames();
  } catch (error) {
    logger.error('执行更新脚本时发生严重错误:', error);
    process.exit(1); // 以错误码退出
  } finally {
    db.close((err) => {
      if (err) {
        logger.error('关闭数据库连接时出错:', err.message);
      } else {
        logger.info('数据库连接已成功关闭。');
      }
    });
  }
})();