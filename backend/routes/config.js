const express = require('express');
const router = express.Router();
const { globalConfig } = require('../config/globalConfig');
const { switchEnvironment, getCurrentEnvironment } = require('../config/environment');
const vikaService = require('../services/vikaService');
const CSGClient = require('../services/csgClient');
const logger = require('../utils/logger');
const csgClient = require('../services/csgClient');

// 获取完整配置
router.get('/', async (req, res) => {
  logger.info('GET /api/v1/config - 收到请求');
  try {
    const config = globalConfig.getAll();
    const currentEnv = getCurrentEnvironment();
    
    logger.info('GET /api/v1/config - 操作成功');
    res.json({
      success: true,
      data: {
        ...config,
        currentEnvironment: currentEnv.name,
        environmentDescription: currentEnv.description
      }
    });
  } catch (error) {
    logger.error('获取配置失败', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '获取配置失败',
      error: error.message
    });
  }
});

// 更新配置
router.put('/', async (req, res) => {
  logger.info('PUT /api/v1/config - 收到请求', { body: req.body });
  try {
    const newConfig = req.body;
    
    // 验证配置
    const tempConfig = { ...globalConfig.getAll(), ...newConfig };
    const validation = globalConfig.validate();
    
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: '配置验证失败',
        errors: validation.errors
      });
    }
    
    // 更新配置
    const success = globalConfig.update(newConfig);
    
    if (success) {
      logger.info('PUT /api/v1/config - 操作成功');
      res.json({
        success: true,
        message: '配置更新成功'
      });
    } else {
      logger.error('配置保存失败');
      res.status(500).json({
        success: false,
        message: '配置保存失败'
      });
    }
  } catch (error) {
    logger.error('更新配置失败', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '更新配置失败',
      error: error.message
    });
  }
});

// 获取特定配置项
router.get('/:path', async (req, res) => {
  const configPath = req.params.path.replace(/-/g, '.');
  logger.info(`GET /api/v1/config/${configPath} - 收到请求`, { params: req.params });
  try {
    const value = globalConfig.get(configPath);
    
    if (value !== undefined) {
      logger.info(`GET /api/v1/config/${configPath} - 操作成功`);
      res.json({
        success: true,
        data: value
      });
    } else {
      logger.warn(`GET /api/v1/config/${configPath} - 未找到配置路径`);
      res.status(404).json({
        success: false,
        message: '配置项不存在'
      });
    }
  } catch (error) {
    logger.error(`获取配置项失败，路径: ${configPath}`, { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '获取配置项失败',
      error: error.message
    });
  }
});

// 设置特定配置项
router.put('/:path', async (req, res) => {
  const configPath = req.params.path.replace(/-/g, '.');
  logger.info(`PUT /api/v1/config/${configPath} - 收到请求`, { params: req.params, body: req.body });
  try {
    const { value } = req.body;
    
    const success = globalConfig.set(configPath, value);
    
    if (success) {
      logger.info(`PUT /api/v1/config/${configPath} - 操作成功`);
      res.json({
        success: true,
        message: '配置项更新成功'
      });
    } else {
      logger.error(`配置项保存失败，路径: ${configPath}`);
      res.status(500).json({
        success: false,
        message: '配置项保存失败'
      });
    }
  } catch (error) {
    logger.error(`设置配置项失败，路径: ${configPath}`, { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '设置配置项失败',
      error: error.message
    });
  }
});

// 切换运行环境
router.post('/environment', async (req, res) => {
  const { environment } = req.body;
  logger.info('POST /api/v1/config/environment - 收到请求', { body: req.body });
  try {
    
    if (!environment || !['test', 'production'].includes(environment)) {
      return res.status(400).json({
        success: false,
        message: '无效的环境参数'
      });
    }
    
    const success = switchEnvironment(environment);
    
    if (success) {
      // 更新全局配置中的环境设置
      globalConfig.set('system.environment', environment);
      
      logger.info(`POST /api/v1/config/environment - 操作成功，已切换到 ${environment}`);
      res.json({
        success: true,
        message: `环境已切换到: ${environment}`,
        currentEnvironment: getCurrentEnvironment()
      });
    } else {
      res.status(500).json({
        success: false,
        message: '环境切换失败'
      });
    }
  } catch (error) {
    logger.error('切换环境失败', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '切换环境失败',
      error: error.message
    });
  }
});

// 测试维格表连接
router.post('/test/vika', async (req, res) => {
  logger.info('POST /api/v1/config/test/vika - 收到请求');
  try {
    const result = await vikaService.testConnection();
    
    logger.info('POST /api/v1/config/test/vika - 操作成功');
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('维格表连接测试失败', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '维格表连接测试失败',
      error: error.message
    });
  }
});

// 测试智能体连接
router.post('/test/agent', async (req, res) => {
  const { agentId } = req.body;
  logger.info('POST /api/v1/config/test/agent - 收到请求', { body: req.body });
  try {

    if (!agentId) {
      return res.status(400).json({
        success: false,
        message: '缺少 agentId 参数',
      });
    }

    const currentEnv = getCurrentEnvironment();
    const platformConfig = globalConfig.get(`agentPlatform.${currentEnv.name}`);

    if (!platformConfig) {
      return res.status(400).json({
        success: false,
        message: `缺少 ${currentEnv.name} 环境的智能体平台配置`,
      });
    }

    const agentObject = {
      agent_id: agentId,
      base_url: platformConfig.apiBase,
      environment_type: currentEnv.name,
    };

    if (currentEnv.name === 'production') {
      agentObject.app_id = platformConfig.appId;
      agentObject.app_secret = platformConfig.appSecret;
    } else {
      agentObject.api_key = platformConfig.apiKey;
      agentObject.model = platformConfig.model;
    }

    const result = await csgClient.testConnection(agentObject);

    logger.info(`POST /api/v1/config/test/agent - 操作成功，agentId: ${agentId}`);
    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('智能体连接测试失败', { agentId, error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '智能体连接测试失败',
      error: error.message,
    });
  }
});

// 获取维格表空间站配置
router.get('/vika/spaces/:spaceId', async (req, res) => {
  const { spaceId } = req.params;
  logger.info(`GET /api/v1/config/vika/spaces/${spaceId} - 收到请求`, { params: req.params });
  try {
    const result = await vikaService.getSpaceConfiguration(spaceId);
    
    logger.info(`GET /api/v1/config/vika/spaces/${spaceId} - 操作成功`);
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error(`获取维格表空间站配置失败，spaceId: ${spaceId}`, { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '获取维格表空间站配置失败',
      error: error.message
    });
  }
});

// 清除维格表缓存
router.delete('/cache/vika', async (req, res) => {
  const { pattern } = req.query;
  logger.info('DELETE /api/v1/config/cache/vika - 收到请求', { query: req.query });
  try {
    vikaService.clearCache(pattern);
    
    logger.info('DELETE /api/v1/config/cache/vika - 操作成功');
    res.json({
      success: true,
      message: '维格表缓存已清除'
    });
  } catch (error) {
    logger.error('清除维格表缓存失败', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '清除维格表缓存失败',
      error: error.message
    });
  }
});

// 重置为默认配置
router.post('/reset', async (req, res) => {
  logger.info('POST /api/v1/config/reset - 收到请求');
  try {
    const success = globalConfig.reset();
    
    if (success) {
      logger.info('POST /api/v1/config/reset - 操作成功');
      res.json({
        success: true,
        message: '配置已重置为默认值'
      });
    } else {
      logger.error('配置重置失败');
      res.status(500).json({
        success: false,
        message: '配置重置失败'
      });
    }
  } catch (error) {
    logger.error('重置配置失败', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '重置配置失败',
      error: error.message
    });
  }
});

// 验证当前配置
router.get('/validate', async (req, res) => {
  logger.info('GET /api/v1/config/validate - 收到请求');
  try {
    const validation = globalConfig.validate();
    
    logger.info('GET /api/v1/config/validate - 操作成功');
    res.json({
      success: true,
      data: validation
    });
  } catch (error) {
    logger.error('配置验证失败', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '配置验证失败',
      error: error.message
    });
  }
});

module.exports = router;