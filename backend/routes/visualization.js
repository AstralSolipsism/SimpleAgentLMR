/**
 * 可视化数据路由
 */

const express = require('express');
const router = express.Router();
const db = require('../database/init');
const logger = require('../utils/logger');
const { asyncErrorHandler } = require('../middleware/errorHandler');
const { getSystemInfo } = require('../utils/systemInfo');
const vikaService = require('../services/vikaService');
const CSGClient = require('../services/csgClient');
const { getCurrentEnvironment } = require('../config/environment');

const csgClient = new CSGClient();

/**
 * 获取智能体网络图数据
 */
router.get('/network', asyncErrorHandler(async (req, res) => {
  
  try {
    // 获取所有应用
    const applications = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM applications WHERE status = "active"', [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    // 获取所有智能体
    const agents = await new Promise((resolve, reject) => {
      const sql = `
        SELECT a.*, app.app_name
        FROM agents a
        LEFT JOIN applications app ON a.app_id = app.app_id
        WHERE a.status = 'active'
      `;
      db.all(sql, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    // 获取智能体能力关系
    const capabilities = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM agent_capabilities', [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    // 获取输入源
    const inputSources = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM input_sources WHERE status = "active"', [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    // 获取MCP工具
    const mcpTools = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM mcp_tools WHERE status = "active"', [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    
    // 构建网络图数据
    const nodes = [];
    const links = [];
    
    // 添加应用节点
    applications.forEach(app => {
      nodes.push({
        id: `app_${app.app_id}`,
        type: 'application',
        name: app.app_name,
        data: app,
        group: 'applications'
      });
    });
    
    // 添加智能体节点
    agents.forEach(agent => {
      nodes.push({
        id: `agent_${agent.agent_id}`,
        type: 'agent',
        name: agent.agent_name,
        data: agent,
        group: agent.app_id
      });
      
      // 添加智能体到应用的连接
      links.push({
        source: `app_${agent.app_id}`,
        target: `agent_${agent.agent_id}`,
        type: 'contains',
        label: '包含'
      });
    });
    
    // 添加MCP工具节点
    mcpTools.forEach(tool => {
      nodes.push({
        id: `mcp_${tool.tool_name}`,
        type: 'mcp_tool',
        name: tool.tool_name,
        data: tool,
        group: 'mcp_tools'
      });
    });
    
    // 添加输入源节点
    inputSources.forEach(source => {
      nodes.push({
        id: `input_${source.endpoint}`,
        type: 'input_source',
        name: source.source_name,
        data: source,
        group: 'input_sources'
      });
      
      // 添加输入源到智能体的连接
      links.push({
        source: `input_${source.endpoint}`,
        target: `agent_${source.agent_id}`,
        type: 'triggers',
        label: '触发'
      });
    });
    
    // 添加智能体能力连接
    capabilities.forEach(cap => {
      if (cap.capability_type === 'mcp_tool') {
        links.push({
          source: `agent_${cap.agent_id}`,
          target: `mcp_${cap.target_id}`,
          type: 'uses',
          label: '使用'
        });
      } else if (cap.capability_type === 'sub_agent') {
        links.push({
          source: `agent_${cap.agent_id}`,
          target: `agent_${cap.target_id}`,
          type: 'delegates',
          label: '委派'
        });
      }
    });
    
    res.json({
      success: true,
      code: 200,
      message: '获取智能体网络图数据成功',
      data: {
        nodes,
        links,
        stats: {
          applications: applications.length,
          agents: agents.length,
          mcp_tools: mcpTools.length,
          input_sources: inputSources.length,
          connections: links.length
        }
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('获取智能体网络图数据失败', { error: error.message });
    throw error;
  }
}));

/**
 * 获取系统统计数据
 */
router.get('/stats', asyncErrorHandler(async (req, res) => {
  
  try {
    // 获取各种统计数据
    const stats = {};
    
    // 应用统计
    stats.applications = await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as total, SUM(CASE WHEN status="active" THEN 1 ELSE 0 END) as active FROM applications', [], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    // 智能体统计
    stats.agents = await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as total, SUM(CASE WHEN status="active" THEN 1 ELSE 0 END) as active FROM agents', [], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    // 任务统计
    stats.tasks = await new Promise((resolve, reject) => {
      const sql = `
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) as failed,
          SUM(CASE WHEN status IN ('pending', 'running') THEN 1 ELSE 0 END) as active
        FROM tasks
      `;
      db.get(sql, [], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    // 今日任务统计
    stats.tasks_today = await new Promise((resolve, reject) => {
      const sql = `
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) as failed
        FROM tasks 
        WHERE date(started_at) = date('now')
      `;
      db.get(sql, [], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    // MCP工具统计
    stats.mcp_tools = await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as total, SUM(CASE WHEN status="active" THEN 1 ELSE 0 END) as active FROM mcp_tools', [], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    // 输入源统计
    stats.input_sources = await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as total, SUM(CASE WHEN status="active" THEN 1 ELSE 0 END) as active FROM input_sources', [], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    // 最近任务趋势
    stats.recent_tasks = await new Promise((resolve, reject) => {
      const sql = `
        SELECT 
          date(started_at) as date,
          COUNT(*) as count,
          SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) as failed
        FROM tasks 
        WHERE started_at >= date('now', '-7 days')
        GROUP BY date(started_at)
        ORDER BY date
      `;
      db.all(sql, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    // 智能体使用频率
    stats.agent_usage = await new Promise((resolve, reject) => {
      const sql = `
        SELECT 
          a.agent_name,
          a.agent_id,
          COUNT(te.id) as task_count,
          SUM(CASE WHEN te.status='completed' THEN 1 ELSE 0 END) as completed_count
        FROM agents a
        LEFT JOIN tasks te ON a.agent_id = te.current_agent_id
        WHERE a.status = 'active'
        GROUP BY a.agent_id, a.agent_name
        ORDER BY task_count DESC
        LIMIT 10
      `;
      db.all(sql, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    
    res.json({
      success: true,
      code: 200,
      message: '获取系统统计数据成功',
      data: stats,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('获取系统统计数据失败', { error: error.message });
    throw error;
  }
}));

/**
 * 获取任务执行趋势
 */
router.get('/trends/tasks', asyncErrorHandler(async (req, res) => {
  const { days = 30 } = req.query;
  
  try {
    const trends = await new Promise((resolve, reject) => {
      const sql = `
        SELECT 
          date(started_at) as date,
          COUNT(*) as total,
          SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) as failed,
          SUM(CASE WHEN status IN ('pending', 'running') THEN 1 ELSE 0 END) as active,
          AVG(
            CASE 
              WHEN completed_at IS NOT NULL AND started_at IS NOT NULL 
              THEN (julianday(completed_at) - julianday(started_at)) * 24 * 60 * 60 
              ELSE NULL 
            END
          ) as avg_duration_seconds
        FROM tasks 
        WHERE started_at >= date('now', '-' || ? || ' days')
        GROUP BY date(started_at)
        ORDER BY date
      `;
      
      db.all(sql, [days], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    
    res.json({
      success: true,
      code: 200,
      message: '获取任务执行趋势成功',
      data: {
        period_days: days,
        trends
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('获取任务执行趋势失败', { error: error.message });
    throw error;
  }
}));

/**
 * 获取实时监控数据
 */
router.get('/realtime', asyncErrorHandler(async (req, res) => {
  
  try {
    // 获取当前活跃任务
    const activeTasks = await new Promise((resolve, reject) => {
      const sql = `
        SELECT te.task_id, te.status, te.started_at, a.agent_name
        FROM tasks te
        LEFT JOIN agents a ON te.current_agent_id = a.agent_id
        WHERE te.status IN ('pending', 'running')
        ORDER BY te.started_at DESC
        LIMIT 10
      `;
      
      db.all(sql, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    // 获取最近完成的任务
    const recentCompleted = await new Promise((resolve, reject) => {
      const sql = `
        SELECT te.task_id, te.status, te.completed_at, a.agent_name
        FROM tasks te
        LEFT JOIN agents a ON te.current_agent_id = a.agent_id
        WHERE te.status IN ('completed', 'failed') AND te.completed_at >= datetime('now', '-1 hour')
        ORDER BY te.completed_at DESC
        LIMIT 5
      `;
      
      db.all(sql, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    // 获取系统负载信息
    const systemLoad = {
      active_tasks: activeTasks.length,
      cpu_usage: process.cpuUsage(),
      memory_usage: process.memoryUsage(),
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    };
    
    
    res.json({
      success: true,
      code: 200,
      message: '获取实时监控数据成功',
      data: {
        active_tasks: activeTasks,
        recent_completed: recentCompleted,
        system_load: systemLoad
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('获取实时监控数据失败', { error: error.message });
    throw error;
  }
}));

// 辅助函数：获取最近任务列表 (已修复，与 tasks.js 保持绝对一致)
const getRecentTasks = () => new Promise((resolve) => {
    const sql = `
        SELECT t.*, ins.source_name
        FROM tasks t
        LEFT JOIN input_sources ins ON t.source_id = ins.id
        ORDER BY t.created_at DESC
        LIMIT 10
    `;
    db.all(sql, [], (err, rows) => {
        if (err) {
            logger.error('Failed to fetch recent tasks', { error: err.message });
            // 即使查询失败也返回错误对象，而不是让整个接口失败
            resolve({ error: 'Failed to fetch recent tasks', details: err.message });
        } else {
            // 模仿 tasks.js 的处理逻辑，确保数据结构完全一致
            const processedTasks = rows.map(task => ({
                ...task,
                input_data: task.input_data ? JSON.parse(task.input_data) : null,
                result: task.result ? JSON.parse(task.result) : null,
            }));
            resolve(processedTasks);
        }
    });
});

// 仪表盘核心数据API (分层SWR缓存策略)
let localDataCache = { data: null, timestamp: 0 };
let networkDataCache = { data: null, timestamp: 0 };

const LOCAL_CACHE_TTL = 5000;     // 本地数据缓存5秒
const NETWORK_CACHE_TTL = 600000; // 网络数据缓存10分钟

// 后台刷新本地数据的函数
async function refreshLocalDataCache() {
    try {
        logger.info('Background refreshing local dashboard data...');
        const [systemLoad, recentTasks] = await Promise.all([
            getSystemInfo().catch(err => ({ error: 'System Info Error', details: err.message })),
            getRecentTasks()
        ]);
        localDataCache = {
            data: { systemLoad, recentTasks },
            timestamp: Date.now()
        };
        logger.info('Local data cache refresh successful.');
    } catch (error) {
        logger.error('Failed to refresh local data cache:', { message: error.message });
    }
}

// 后台刷新网络数据的函数
async function refreshNetworkDataCache() {
    try {
        logger.info('Background refreshing network dashboard data...');
        const [vikaStatus, csgStatus] = await Promise.all([
            vikaService.healthCheck().catch(err => ({ status: 'error', error: 'Vika Health Check Error', details: err.message })),
            csgClient.healthCheck().catch(err => ({ status: 'error', error: 'CSG Health Check Error', details: err.message }))
        ]);
        networkDataCache = {
            data: { vika: vikaStatus, csg: csgStatus },
            timestamp: Date.now()
        };
        logger.info('Network data cache refresh successful.');
    } catch (error) {
        logger.error('Failed to refresh network data cache:', { message: error.message });
    }
}

router.get('/stats/dashboard', async (req, res) => {
    const now = Date.now();

    // 1. 首次加载处理：确保首次响应有完整数据
    if (!localDataCache.data || !networkDataCache.data) {
        logger.info('Initial data fetch required for dashboard.');
        try {
            const initialFetches = [];
            if (!localDataCache.data) initialFetches.push(refreshLocalDataCache());
            if (!networkDataCache.data) initialFetches.push(refreshNetworkDataCache());
            await Promise.all(initialFetches);
        } catch (error) {
            logger.error('Error during initial fetch of dashboard stats:', { message: error.message });
            return res.status(500).json({
                success: false,
                error: 'Failed to fetch initial dashboard statistics',
                details: error.message
            });
        }
    }

    // 2. 组合并立即返回缓存数据
    const currentEnv = getCurrentEnvironment();
    const responsePayload = {
        success: true,
        data: {
            ...localDataCache.data,
            servicesStatus: networkDataCache.data,
            currentEnvironment: {
                name: currentEnv.name,
                description: currentEnv.description,
            }
        }
    };
    res.json(responsePayload);
    logger.info('Served dashboard stats from composite cache.');

    // 3. 在后台独立触发过期缓存的更新
    if (now - localDataCache.timestamp > LOCAL_CACHE_TTL) {
        refreshLocalDataCache(); // "Fire and forget"
    }
    if (now - networkDataCache.timestamp > NETWORK_CACHE_TTL) {
        refreshNetworkDataCache(); // "Fire and forget"
    }
});

module.exports = router;
