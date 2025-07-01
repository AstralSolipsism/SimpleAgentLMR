/**
 * MCP工具管理器
 * 负责管理和调用MCP工具
 */

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const { db } = require('../database/init.js');

/**
 * MCP工具管理器类
 */
class MCPManager {
  constructor() {
    this.localTools = new Map(); // 本地工具缓存
    this._initializePromise = null; // 用于存储初始化Promise，避免重复初始化
  }

  /**
   * 初始化MCP管理器，动态加载所有本地工具
   * 确保只初始化一次
   */
<<<<<<< HEAD
      async initialize() {
        if (this._initializePromise) {
          return this._initializePromise;
        }
    
        this._initializePromise = (async () => {
          try {
            // 1. 从文件系统加载本地工具
            await this.registerLocalTools();
            const localToolNames = new Set(this.localTools.keys());
            logger.info(`Found ${localToolNames.size} tools from local file system.`);
    
            // 2. 从数据库获取已注册的工具
            const dbToolNames = await new Promise((resolve, reject) => {
              db.all('SELECT tool_name FROM mcp_tools WHERE type = ?', ['local'], (err, rows) => {
                if (err) {
                  logger.error('Failed to query tools from database.', { error: err.message });
                  return reject(err);
                }
                resolve(new Set(rows.map(row => row.tool_name)));
              });
            });
            logger.info(`Found ${dbToolNames.size} tools in the database.`);
    
            // 3. 计算需要添加和删除的工具
            const toolsToAdd = [...localToolNames].filter(name => !dbToolNames.has(name));
            const toolsToRemove = [...dbToolNames].filter(name => !localToolNames.has(name));
    
            if (toolsToAdd.length === 0 && toolsToRemove.length === 0) {
              logger.info('Tool database is already in sync with the file system.');
            } else {
                logger.info(`Tools to add: ${toolsToAdd.length} (${toolsToAdd.join(', ')})`);
                logger.info(`Tools to remove: ${toolsToRemove.length} (${toolsToRemove.join(', ')})`);
        
                const dbPromises = [];
        
                // 4a. 为需要添加的工具创建插入Promise
                toolsToAdd.forEach(toolName => {
                  const tool = this.localTools.get(toolName);
                  const sql = `
                    INSERT INTO mcp_tools (tool_name, display_name, description, type, status, config)
                    VALUES (?, ?, ?, ?, ?, ?)
                  `;
                  const params = [
                    tool.name,
                    tool.displayName,
                    tool.description || `一个名为 ${tool.name} 的工具`,
                    'local',
                    'active',
                    JSON.stringify(tool.config || {}),
                  ];
                  dbPromises.push(new Promise((resolve, reject) => {
                    db.run(sql, params, (err) => {
                      if (err) {
                        logger.error(`Failed to insert tool: ${toolName}`, { error: err.message });
                        return reject(err);
                      }
                      logger.info(`Tool '${toolName}' inserted into database.`);
                      resolve();
                    });
                  }));
                });
        
                // 4b. 为需要删除的工具创建删除Promise
                toolsToRemove.forEach(toolName => {
                  const sql = 'DELETE FROM mcp_tools WHERE tool_name = ?';
                  dbPromises.push(new Promise((resolve, reject) => {
                    db.run(sql, [toolName], (err) => {
                      if (err) {
                        logger.error(`Failed to delete tool: ${toolName}`, { error: err.message });
                        return reject(err);
                      }
                      logger.info(`Tool '${toolName}' removed from database.`);
                      resolve();
                    });
                  }));
                });
        
                // 5. 并行执行所有数据库操作
                await Promise.all(dbPromises);
                logger.info('Database synchronization for tools is complete.');
            }
            
            // 6. 清理 agent_capabilities 表中的孤立记录 (新增步骤)
            await this._cleanOrphanedAgentCapabilities();
            
            logger.info('MCP Manager initialized successfully.');
          } catch (error) {
            logger.error('MCP Manager initialization failed', { error: error.message });
            this._initializePromise = null;
            throw error;
          }
        })();
        return this._initializePromise;
      }
=======
  async initialize() {
    if (this._initializePromise) {
      return this._initializePromise;
    }

    this._initializePromise = (async () => {
      try {
        // 1. 从文件系统加载本地工具
        await this.registerLocalTools();
        const localToolNames = new Set(this.localTools.keys());
        logger.info(`Found ${localToolNames.size} tools from local file system.`);

        // 2. 从数据库获取已注册的工具
        const dbToolNames = await new Promise((resolve, reject) => {
          db.all('SELECT tool_name FROM mcp_tools WHERE type = ?', ['local'], (err, rows) => {
            if (err) {
              logger.error('Failed to query tools from database.', { error: err.message });
              return reject(err);
            }
            resolve(new Set(rows.map(row => row.tool_name)));
          });
        });
        logger.info(`Found ${dbToolNames.size} tools in the database.`);

        // 3. 计算需要添加和删除的工具
        const toolsToAdd = [...localToolNames].filter(name => !dbToolNames.has(name));
        const toolsToRemove = [...dbToolNames].filter(name => !localToolNames.has(name));

        if (toolsToAdd.length === 0 && toolsToRemove.length === 0) {
          logger.info('Tool database is already in sync with the file system.');
        } else {
            logger.info(`Tools to add: ${toolsToAdd.length} (${toolsToAdd.join(', ')})`);
            logger.info(`Tools to remove: ${toolsToRemove.length} (${toolsToRemove.join(', ')})`);
    
            const dbPromises = [];
    
            // 4a. 为需要添加的工具创建插入Promise
            toolsToAdd.forEach(toolName => {
              const tool = this.localTools.get(toolName);
              const sql = `
                INSERT INTO mcp_tools (tool_name, description, type, status, config)
                VALUES (?, ?, ?, ?, ?)
              `;
              const params = [
                tool.name,
                tool.description || `一个名为 ${tool.name} 的工具`,
                'local',
                'active',
                JSON.stringify(tool.config || {}),
              ];
              dbPromises.push(new Promise((resolve, reject) => {
                db.run(sql, params, (err) => {
                  if (err) {
                    logger.error(`Failed to insert tool: ${toolName}`, { error: err.message });
                    return reject(err);
                  }
                  logger.info(`Tool '${toolName}' inserted into database.`);
                  resolve();
                });
              }));
            });
    
            // 4b. 为需要删除的工具创建删除Promise
            toolsToRemove.forEach(toolName => {
              const sql = 'DELETE FROM mcp_tools WHERE tool_name = ?';
              dbPromises.push(new Promise((resolve, reject) => {
                db.run(sql, [toolName], (err) => {
                  if (err) {
                    logger.error(`Failed to delete tool: ${toolName}`, { error: err.message });
                    return reject(err);
                  }
                  logger.info(`Tool '${toolName}' removed from database.`);
                  resolve();
                });
              }));
            });
    
            // 5. 并行执行所有数据库操作
            await Promise.all(dbPromises);
            logger.info('Database synchronization for tools is complete.');
        }
        
        logger.info('MCP Manager initialized successfully.');
      } catch (error) {
        logger.error('MCP Manager initialization failed', { error: error.message });
        this._initializePromise = null;
        throw error;
      }
    })();
    return this._initializePromise;
  }
>>>>>>> 30fd47290ae29c499b6b7eb7e416a81c8299d309

  /**
   * 注册单个工具，包括缓存和数据库同步
   * @param {string} toolName - 工具名称
   * @param {object} tool - 工具对象，包含 name, description, handler
   */
  registerTool(toolName, tool) {
    this.localTools.set(toolName, tool);
    logger.info(`[信息] 已加载工具到内存: ${toolName}`);
  }

  /**
   * 从mcp_tools目录动态加载并注册所有本地工具
   */
<<<<<<< HEAD
  /**
   * 从mcp_tools目录动态加载并注册所有本地工具。
   * 新版本能够健壮地处理多种模块导出模式。
   */
  async registerLocalTools() {
    const toolsDir = path.join(__dirname, 'mcp_tools');
    logger.info(`开始从目录加载本地工具: ${toolsDir}`);

    try {
      const toolFiles = fs.readdirSync(toolsDir).filter(file => path.extname(file) === '.js');
      logger.info(`在工具目录中找到 ${toolFiles.length} 个JS文件: [${toolFiles.join(', ')}]`);

      for (const fileName of toolFiles) {
        const toolPath = path.join(toolsDir, fileName);
        try {
          // 动态加载工具模块
          const requiredModule = require(toolPath);

          // 检查模块是否为有效对象
          if (typeof requiredModule !== 'object' || requiredModule === null) {
            logger.warn(`跳过无效的工具文件 (非对象导出): ${fileName}`);
            continue;
          }

          // 统一处理单工具文件，兼容 { name, handler } 和 { name, func } 模式
          if (typeof requiredModule.name === 'string') {
            const handler = requiredModule.handler || requiredModule.func;

            if (typeof handler === 'function') {
              const fileContent = fs.readFileSync(toolPath, 'utf8');
              
              // 从JSDoc解析元数据
              const nameMatch = fileContent.match(/@name\s+(.*)/);
              const displayName = nameMatch ? nameMatch[1].trim() : handler.displayName || requiredModule.name;
              
              const descriptionMatch = fileContent.match(/@description\s+(.*)/);
              let description = descriptionMatch ? descriptionMatch[1].trim() : null;
              if (!description) {
                description = handler.doc || `一个名为 ${requiredModule.name} 的工具。`;
              }

              const toolObject = {
                name: requiredModule.name,
                displayName: displayName,
                description: description,
                handler: handler,
                config: requiredModule.config || {}
              };

              this.registerTool(toolObject.name, toolObject);

            } else {
              logger.warn(`跳过工具 '${requiredModule.name}' (无效的handler/func): ${fileName}`);
            }
          }
          // 兼容 { tool1, tool2 } 模式
          else {
            let registeredInFile = 0;
            for (const toolName in requiredModule) {
              const toolFunction = requiredModule[toolName];
              if (typeof toolFunction === 'function') {
                
                const toolObject = {
                  name: toolName,
                  displayName: toolFunction.displayName || toolName, // 优先使用函数上的displayName属性
                  description: toolFunction.doc || `一个名为 ${toolName} 的工具。`,
                  handler: toolFunction,
                  config: toolFunction.config || {}
                };
                this.registerTool(toolName, toolObject);
                registeredInFile++;
              }
            }
            if (registeredInFile === 0) {
                logger.warn(`在 ${fileName} 中未找到可注册的工具函数。`);
            }
          }

        } catch (error) {
          logger.error(`从文件 ${fileName} 加载工具失败`, {
            error: error.message,
            stack: error.stack
          });
        }
      }
    } catch (error) {
      logger.error(`读取工具目录失败: ${toolsDir}`, {
        error: error.message,
        stack: error.stack
      });
      throw error; // 向上抛出异常，以便初始化过程可以捕获它
    }
    logger.info('所有本地工具加载完成。');
=======
  async registerLocalTools() {
    const toolsDir = path.join(__dirname, 'mcp_tools');
    try {
      const toolFiles = fs.readdirSync(toolsDir);

      for (const fileName of toolFiles) {
        console.log(`[MCP扫描] 发现文件: ${fileName}`);
        if (path.extname(fileName) === '.js') {
          const toolPath = path.join(toolsDir, fileName);
          try {
            const requiredModule = require(toolPath);
            
            // 情况一: 模块导出一个标准的单一工具对象
            if (requiredModule && typeof requiredModule.name === 'string' && typeof requiredModule.handler === 'function') {
              this.registerTool(requiredModule.name, requiredModule);
            }
            // 情况二: 模块导出一个包含多个函数的对象
            else if (typeof requiredModule === 'object' && requiredModule !== null) {
              for (const toolName in requiredModule) {
                if (typeof requiredModule[toolName] === 'function') {
                  const toolObject = {
                    name: toolName,
                    // 优先使用函数上的文档字符串作为描述
                    description: requiredModule[toolName].doc || `一个用于 ${toolName} 的工具`,
                    handler: requiredModule[toolName]
                  };
                  this.registerTool(toolName, toolObject);
                }
              }
            } else {
              logger.warn(`无法从 ${fileName} 加载工具: 格式无效。`);
            }
          } catch (error) {
            logger.error(`从 ${fileName} 加载工具失败`, { error: error.message });
          }
        }
      }
    } catch (error) {
      logger.error(`读取工具目录失败: ${toolsDir}`, { error: error.message });
      throw error;
    }
>>>>>>> 30fd47290ae29c499b6b7eb7e416a81c8299d309
  }

  /**
   * 调用工具
   */
  async callTool(toolName, params = {}) {
    // 确保管理器已初始化
    if (!this._initializePromise) {
      throw new Error('MCP Manager has not been initialized. Call initialize() first.');
    }
    await this._initializePromise; // 等待初始化完成

    const tool = this.localTools.get(toolName);
    if (!tool) {
      throw new Error(`Tool ${toolName} does not exist or is not registered.`);
    }

    try {
      logger.info('尝试调用工具', { toolName: toolName, params });
      const result = await tool.handler(params);
      logger.info('工具执行成功', {
        toolName: toolName,
        resultType: typeof result,
      });
      return result;
    } catch (error) {
      logger.error('工具执行失败', {
        toolName: toolName,
        params,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * 获取工具列表
   */
  getAvailableTools() {
    const tools = [];
    for (const [name, tool] of this.localTools.entries()) {
      tools.push({
        name: tool.name,
        description: tool.description,
        type: 'local',
      });
    }
    return tools;
  }

  /**
   * 获取工具详情
   */
  getToolDetails(toolName) {
    const tool = this.localTools.get(toolName);
    if (!tool) {
      return null;
    }
    return {
      name: tool.name,
      description: tool.description,
      config: tool.config, // 假设工具模块可以导出配置
      type: 'local',
    };
  }

  /**
   * 重新加载工具
   */
  async reloadTools() {
    this.localTools.clear();
    this._initializePromise = null; // 重置初始化状态
    await this.initialize(); // 重新初始化
    logger.info('MCP tools reloaded successfully.');
  }

<<<<<<< HEAD
  /**
   * 清理 agent_capabilities 表中的孤立记录
   * 这些记录指向的 mcp_tools 工具已被删除
   * @private
   */
  async _cleanOrphanedAgentCapabilities() {
    logger.info('Starting cleanup of orphaned agent capabilities...');
    const sql = `
      DELETE FROM agent_capabilities
      WHERE
        capability_type = 'mcp_tool' AND
        target_id NOT IN (SELECT tool_name FROM mcp_tools);
    `;

    return new Promise((resolve, reject) => {
      db.run(sql, function(err) {
        if (err) {
          logger.error('Failed to clean up orphaned agent capabilities', { error: err.message });
          return reject(err);
        }
        if (this.changes > 0) {
          logger.info(`Successfully cleaned up ${this.changes} orphaned agent capabilities.`);
        } else {
          logger.info('No orphaned agent capabilities found to clean up.');
        }
        resolve({ cleanedCount: this.changes });
      });
    });
  }

=======
>>>>>>> 30fd47290ae29c499b6b7eb7e416a81c8299d309
  /**
   * 获取工具统计信息
   */
  getStats() {
    return {
      initialized: this.initialized,
      totalTools: this.localTools.size,
      toolNames: Array.from(this.localTools.keys()),
      lastReloadTime: this.lastReloadTime || null, // lastReloadTime需要被设置
    };
  }
}

// 创建全局MCP管理器实例
const mcpManager = new MCPManager();

module.exports = mcpManager;
