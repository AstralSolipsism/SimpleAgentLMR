/**
 * MCP工具管理器
 * 负责管理和调用MCP工具
 */

const { getDatabase } = require('../database/init');
const logger = require('../utils/logger');
const { vikaService } = require('./vikaService');
const config = require('../config/config');

/**
 * MCP工具管理器类
 */
class MCPManager {
  constructor() {
    this.tools = new Map(); // 本地工具缓存
    this.initialized = false;
  }
  
  /**
   * 初始化MCP管理器
   */
  async initialize() {
    try {
      await this.loadTools();
      this.initialized = true;
      logger.info('MCP管理器初始化成功');
    } catch (error) {
      logger.error('MCP管理器初始化失败', { error: error.message });
      throw error;
    }
  }
  
  /**
   * 加载工具
   */
  async loadTools() {
    const db = getDatabase();
    
    try {
      const tools = await new Promise((resolve, reject) => {
        db.all('SELECT * FROM mcp_tools WHERE status = "active"', [], (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
      
      // 注册本地工具
      for (const tool of tools) {
        if (tool.tool_type === 'local') {
          await this.registerLocalTool(tool);
        }
      }
      
      logger.info('MCP工具加载完成', { count: tools.length });
      
    } finally {
      db.close();
    }
  }
  
  /**
   * 注册本地工具
   */
  async registerLocalTool(toolConfig) {
    try {
      const config = toolConfig.config ? JSON.parse(toolConfig.config) : {};
      
      switch (toolConfig.tool_name) {
        case 'astral_vika':
          this.tools.set('astral_vika', {
            name: 'astral_vika',
            description: '维格表操作工具',
            handler: this.vikaToolHandler.bind(this),
            config
          });
          break;
          
        case 'web_search':
          this.tools.set('web_search', {
            name: 'web_search',
            description: '网页搜索工具',
            handler: this.webSearchHandler.bind(this),
            config
          });
          break;
          
        case 'file_operations':
          this.tools.set('file_operations', {
            name: 'file_operations',
            description: '文件操作工具',
            handler: this.fileOperationsHandler.bind(this),
            config
          });
          break;
          
        default:
          logger.warn('未知的本地工具类型', { tool: toolConfig.tool_name });
      }
      
    } catch (error) {
      logger.error('注册本地工具失败', { 
        tool: toolConfig.tool_name, 
        error: error.message 
      });
    }
  }
  
  /**
   * 调用工具
   */
  async callTool(toolName, params = {}) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    const tool = this.tools.get(toolName);
    if (!tool) {
      throw new Error(`工具 ${toolName} 不存在或未注册`);
    }
    
    try {
      logger.debug('调用MCP工具', { tool: toolName, params });
      
      const result = await tool.handler(params, tool.config);
      
      logger.debug('MCP工具调用成功', { 
        tool: toolName, 
        resultType: typeof result 
      });
      
      return result;
      
    } catch (error) {
      logger.error('MCP工具调用失败', { 
        tool: toolName, 
        params, 
        error: error.message 
      });
      throw error;
    }
  }
  
  /**
   * 维格表工具处理器
   */
  async vikaToolHandler(params, toolConfig) {
    const { action, datasheet_id, record_id, data, options = {} } = params;
    
    switch (action) {
      case 'create_record':
        if (!datasheet_id || !data) {
          throw new Error('创建记录需要datasheet_id和data参数');
        }
        return await vikaService.createRecord(datasheet_id, data, options.fieldMapping);
        
      case 'update_record':
        if (!datasheet_id || !record_id || !data) {
          throw new Error('更新记录需要datasheet_id、record_id和data参数');
        }
        return await vikaService.updateRecord(datasheet_id, record_id, data, options.fieldMapping);
        
      case 'get_records':
        if (!datasheet_id) {
          throw new Error('获取记录需要datasheet_id参数');
        }
        return await vikaService.getRecords(datasheet_id, options);
        
      case 'get_fields':
        if (!datasheet_id) {
          throw new Error('获取字段需要datasheet_id参数');
        }
        return await vikaService.getDatasheetFields(datasheet_id);
        
      case 'get_datasheets':
        const spaceId = options.space_id || toolConfig.spaceId;
        return await vikaService.getDatasheets(spaceId);
        
      default:
        throw new Error(`不支持的维格表操作: ${action}`);
    }
  }
  
  /**
   * 网页搜索工具处理器
   */
  async webSearchHandler(params, toolConfig) {
    const { query, num_results = 10, search_type = 'web' } = params;
    
    if (!query) {
      throw new Error('搜索查询不能为空');
    }
    
    // 这里可以集成实际的搜索API
    // 由于是内网环境，可能需要使用内部搜索服务
    logger.info('执行网页搜索', { query, num_results, search_type });
    
    // 模拟搜索结果
    return {
      query,
      results: [
        {
          title: '搜索结果示例',
          url: 'http://example.com',
          snippet: '这是一个搜索结果的摘要',
          source: 'internal_search'
        }
      ],
      total: 1,
      search_time: new Date().toISOString()
    };
  }
  
  /**
   * 文件操作工具处理器
   */
  async fileOperationsHandler(params, toolConfig) {
    const { action, file_path, content, options = {} } = params;
    const fs = require('fs').promises;
    const path = require('path');
    
    // 安全检查：限制文件操作在特定目录内
    const allowedDir = path.join(__dirname, '../temp');
    const fullPath = path.resolve(allowedDir, file_path || '');
    
    if (!fullPath.startsWith(allowedDir)) {
      throw new Error('文件路径不在允许的目录范围内');
    }
    
    switch (action) {
      case 'read':
        try {
          const content = await fs.readFile(fullPath, 'utf-8');
          return { content, path: file_path };
        } catch (error) {
          throw new Error(`读取文件失败: ${error.message}`);
        }
        
      case 'write':
        if (!content) {
          throw new Error('写入文件需要content参数');
        }
        try {
          // 确保目录存在
          await fs.mkdir(path.dirname(fullPath), { recursive: true });
          await fs.writeFile(fullPath, content, 'utf-8');
          return { success: true, path: file_path };
        } catch (error) {
          throw new Error(`写入文件失败: ${error.message}`);
        }
        
      case 'list':
        try {
          const files = await fs.readdir(fullPath);
          return { files, path: file_path };
        } catch (error) {
          throw new Error(`列出文件失败: ${error.message}`);
        }
        
      case 'delete':
        try {
          await fs.unlink(fullPath);
          return { success: true, path: file_path };
        } catch (error) {
          throw new Error(`删除文件失败: ${error.message}`);
        }
        
      default:
        throw new Error(`不支持的文件操作: ${action}`);
    }
  }
  
  /**
   * 获取工具列表
   */
  getAvailableTools() {
    const tools = [];
    
    for (const [name, tool] of this.tools.entries()) {
      tools.push({
        name: tool.name,
        description: tool.description,
        type: 'local'
      });
    }
    
    return tools;
  }
  
  /**
   * 获取工具详情
   */
  getToolDetails(toolName) {
    const tool = this.tools.get(toolName);
    if (!tool) {
      return null;
    }
    
    return {
      name: tool.name,
      description: tool.description,
      config: tool.config,
      type: 'local'
    };
  }
  
  /**
   * 重新加载工具
   */
  async reloadTools() {
    this.tools.clear();
    await this.loadTools();
    logger.info('MCP工具重新加载完成');
  }
  
  /**
   * 验证工具参数
   */
  validateToolParams(toolName, params) {
    const tool = this.tools.get(toolName);
    if (!tool) {
      throw new Error(`工具 ${toolName} 不存在`);
    }
    
    // 这里可以添加具体的参数验证逻辑
    // 基于工具类型和配置进行验证
    
    return true;
  }
  
  /**
   * 获取工具统计信息
   */
  getStats() {
    return {
      initialized: this.initialized,
      totalTools: this.tools.size,
      toolNames: Array.from(this.tools.keys()),
      lastReloadTime: this.lastReloadTime || null
    };
  }
}

// 创建全局MCP管理器实例
const mcpManager = new MCPManager();

module.exports = mcpManager;
