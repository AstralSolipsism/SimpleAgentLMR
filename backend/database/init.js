// backend/database/init.js
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const config = require('../config/config');
const logger = require('../utils/logger');

const dbPath = config.database.sqlite.filename;
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  logger.info('创建数据目录', { path: dataDir });
}

let dbInstance;
let dbInitializedPromise;

// 使用单例模式确保只初始化一次
if (!dbInstance) {
  dbInitializedPromise = new Promise((resolve, reject) => {
    dbInstance = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        logger.error('连接数据库失败', { path: dbPath, error: err.message });
        return reject(err);
      }
      logger.info('数据库连接成功', { path: dbPath });

      dbInstance.serialize(async () => {
        const runQuery = (sql) => {
          return new Promise((resolve, reject) => {
            dbInstance.run(sql, function(err) {
              if (err) {
                logger.error('执行SQL失败', { sql, error: err.message });
                return reject(err);
              }
              resolve(this);
            });
          });
        };

        try {
          await runQuery('PRAGMA foreign_keys = ON');
          logger.info('外键约束已启用');

          const tables = [
            // 智能体应用表
            `CREATE TABLE IF NOT EXISTS applications (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              app_id VARCHAR(255) UNIQUE NOT NULL,
              app_secret VARCHAR(255) NOT NULL,
              app_name VARCHAR(255) NOT NULL,
              description TEXT,
              base_url VARCHAR(255) NOT NULL,
              environment_type VARCHAR(20) NOT NULL DEFAULT 'production' CHECK (environment_type IN ('test', 'production')),
              status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,
            
            // 智能体表
            `CREATE TABLE IF NOT EXISTS agents (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              agent_id VARCHAR(255) UNIQUE NOT NULL,
              app_id VARCHAR(255) NOT NULL,
              agent_name VARCHAR(255) NOT NULL,
              responsibilities_and_functions TEXT,
              capabilities TEXT, -- JSON存储
              config TEXT, -- JSON存储
              model TEXT,
              status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (app_id) REFERENCES applications(app_id) ON DELETE CASCADE
            )`,
            
            // MCP工具表
            `CREATE TABLE IF NOT EXISTS mcp_tools (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tool_name TEXT NOT NULL UNIQUE,
                description TEXT,
                type TEXT,
                status TEXT,
                config TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,
            
            // 智能体能力表
            `CREATE TABLE IF NOT EXISTS agent_capabilities (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              agent_id VARCHAR(255) NOT NULL,
              capability_type VARCHAR(20) NOT NULL CHECK (capability_type IN ('mcp_tool', 'sub_agent')),
              target_id VARCHAR(255) NOT NULL,
              target_name VARCHAR(255) NOT NULL,
              config TEXT, -- JSON存储
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (agent_id) REFERENCES agents(agent_id) ON DELETE CASCADE
            )`,
            
            // 输入源配置表
            `CREATE TABLE IF NOT EXISTS input_sources (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              source_name VARCHAR(255) NOT NULL,
              source_type VARCHAR(20) NOT NULL CHECK (source_type IN ('http_endpoint', 'webhook')),
              endpoint VARCHAR(255) UNIQUE NOT NULL,
              agent_id VARCHAR(255) NOT NULL,
              config TEXT, -- JSON存储
              status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (agent_id) REFERENCES agents(agent_id) ON DELETE CASCADE
            )`,
            
            // 输出配置表
            `CREATE TABLE IF NOT EXISTS output_configs (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              config_name VARCHAR(255) UNIQUE NOT NULL,
              description TEXT,
              output_type VARCHAR(20) NOT NULL CHECK (output_type IN ('vika_datasheet', 'vika_record')),
              vika_space_id VARCHAR(255) NOT NULL,
              vika_datasheet_id VARCHAR(255),
              vika_space_name TEXT,
              vika_datasheet_name TEXT,
              vika_record_id TEXT,
              field_mapping TEXT, -- JSON存储
              status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,
            
            // 任务表 (已修正重复字段)
            `CREATE TABLE IF NOT EXISTS tasks (
              id VARCHAR(255) PRIMARY KEY NOT NULL,
              agent_id VARCHAR(255),
              source_id VARCHAR(255),
              input_data TEXT, -- JSON: { "input": "...", "context": {...} }
              status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'stopped', 'delegated')),
              result TEXT, -- JSON 存储最终结果
              error TEXT,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              started_at DATETIME,
              finished_at DATETIME,
              parent_task_id INTEGER,
              FOREIGN KEY (parent_task_id) REFERENCES tasks(id) ON DELETE CASCADE,
              FOREIGN KEY (agent_id) REFERENCES agents(agent_id) ON DELETE SET NULL,
              FOREIGN KEY (source_id) REFERENCES input_sources(id) ON DELETE SET NULL
            )`,

            // 任务步骤表
            `CREATE TABLE IF NOT EXISTS task_steps (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              task_id VARCHAR(255) NOT NULL,
              step_id VARCHAR(255) NOT NULL,
              agent_id INTEGER,
              agent_name VARCHAR(255),
              input TEXT,
              context TEXT, -- JSON
              response TEXT, -- JSON
              parsed_actions TEXT, -- JSON
              action_results TEXT, -- JSON
              status VARCHAR(20) DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
              error TEXT,
              started_at DATETIME,
              finished_at DATETIME,
              UNIQUE (task_id, step_id),
              FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
            )`,
            
            // 维格表杆塔信息缓存
            `CREATE TABLE IF NOT EXISTS vika_tower_cache (
              tower_name TEXT UNIQUE,
              tower_record_id TEXT
            )`
          ];

          const indexes = [
            'CREATE INDEX IF NOT EXISTS idx_agents_app_id ON agents(app_id)',
            'CREATE INDEX IF NOT EXISTS idx_agent_capabilities_agent_id ON agent_capabilities(agent_id)',
            'CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)',
            'CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at)',
            'CREATE INDEX IF NOT EXISTS idx_task_steps_task_id ON task_steps(task_id)',
            'CREATE INDEX IF NOT EXISTS idx_input_sources_endpoint ON input_sources(endpoint)',
            'CREATE INDEX IF NOT EXISTS idx_mcp_tools_tool_name ON mcp_tools(tool_name)',
            'CREATE INDEX IF NOT EXISTS idx_vika_tower_cache_tower_name ON vika_tower_cache(tower_name)'
          ];

          for (const sql of tables) {
            await runQuery(sql);
          }
          logger.info('所有数据表创建/验证成功');

          for (const sql of indexes) {
            await runQuery(sql);
          }
          logger.info('所有索引创建/验证成功');
          
          logger.info('数据库初始化完成');
          resolve(dbInstance); // 数据库初始化成功后解析 Promise
        } catch (initError) {
          logger.error('数据库初始化过程中发生错误', { error: initError.message });
          reject(initError); // 初始化失败时拒绝 Promise
        }
      });
    });
  });
}

module.exports = {
  db: dbInstance,
  initPromise: dbInitializedPromise
};
