const express = require('express');
const router = express.Router();
const { globalConfig } = require('../config/globalConfig');
const { switchEnvironment, getCurrentEnvironment } = require('../config/environment');
const vikaService = require('../services/vikaService');
const CSGClient = require('../services/csgClient');
const logger = require('../utils/logger');
const csgClient = new CSGClient();

// 获取完整配置
router.get('/', async (req, res) => {
  try {
    const config = globalConfig.getAll();
    const currentEnv = getCurrentEnvironment();
    
    res.json({
      success: true,
      data: {
        ...config,
        currentEnvironment: currentEnv.name,
        environmentDescription: currentEnv.description
      }
    });
  } catch (error) {
    logger.error('获取配置失败:', error);
    res.status(500).json({
      success: false,
      message: '获取配置失败',
      error: error.message
    });
  }
});

// 更新配置
router.put('/', async (req, res) => {
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
      logger.info('配置更新成功', { newConfig });
      res.json({
        success: true,
        message: '配置更新成功'
      });
    } else {
      res.status(500).json({
        success: false,
        message: '配置保存失败'
      });
    }
  } catch (error) {
    logger.error('更新配置失败:', error);
    res.status(500).json({
      success: false,
      message: '更新配置失败',
      error: error.message
    });
  }
});

// 获取特定配置项
router.get('/:path', async (req, res) => {
  try {
    const configPath = req.params.path.replace(/-/g, '.');
    const value = globalConfig.get(configPath);
    
    if (value !== undefined) {
      res.json({
        success: true,
        data: value
      });
    } else {
      res.status(404).json({
        success: false,
        message: '配置项不存在'
      });
    }
  } catch (error) {
    logger.error('获取配置项失败:', error);
    res.status(500).json({
      success: false,
      message: '获取配置项失败',
      error: error.message
    });
  }
});

// 设置特定配置项
router.put('/:path', async (req, res) => {
  try {
    const configPath = req.params.path.replace(/-/g, '.');
    const { value } = req.body;
    
    const success = globalConfig.set(configPath, value);
    
    if (success) {
      logger.info(`配置项更新成功: ${configPath}`, { value });
      res.json({
        success: true,
        message: '配置项更新成功'
      });
    } else {
      res.status(500).json({
        success: false,
        message: '配置项保存失败'
      });
    }
  } catch (error) {
    logger.error('设置配置项失败:', error);
    res.status(500).json({
      success: false,
      message: '设置配置项失败',
      error: error.message
    });
  }
});

// 切换运行环境
router.post('/environment', async (req, res) => {
  try {
    const { environment } = req.body;
    
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
      
      logger.info(`环境切换成功: ${environment}`);
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
    logger.error('切换环境失败:', error);
    res.status(500).json({
      success: false,
      message: '切换环境失败',
      error: error.message
    });
  }
});

// 测试维格表连接
router.post('/test/vika', async (req, res) => {
  try {
    const result = await vikaService.testConnection();
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('维格表连接测试失败:', error);
    res.status(500).json({
      success: false,
      message: '维格表连接测试失败',
      error: error.message
    });
  }
});

// 测试智能体连接
router.post('/test/agent', async (req, res) => {
  try {
    const { agentId, appId, appSecret } = req.body;
    
    if (!agentId) {
      return res.status(400).json({
        success: false,
        message: '缺少agentId参数'
      });
    }
    
    let appKey = null;
    if (appId && appSecret) {
      appKey = await csgClient.getAppKey(appId, appSecret);
    }
    
    const result = await csgClient.testConnection(agentId, appKey);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('智能体连接测试失败:', error);
    res.status(500).json({
      success: false,
      message: '智能体连接测试失败',
      error: error.message
    });
  }
});

// 获取维格表空间站配置
router.get('/vika/spaces/:spaceId', async (req, res) => {
  try {
    const { spaceId } = req.params;
    const result = await vikaService.getSpaceConfiguration(spaceId);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('获取维格表空间站配置失败:', error);
    res.status(500).json({
      success: false,
      message: '获取维格表空间站配置失败',
      error: error.message
    });
  }
});

// 清除维格表缓存
router.delete('/cache/vika', async (req, res) => {
  try {
    const { pattern } = req.query;
    vikaService.clearCache(pattern);
    
    res.json({
      success: true,
      message: '维格表缓存已清除'
    });
  } catch (error) {
    logger.error('清除维格表缓存失败:', error);
    res.status(500).json({
      success: false,
      message: '清除维格表缓存失败',
      error: error.message
    });
  }
});

// 重置为默认配置
router.post('/reset', async (req, res) => {
  try {
    const success = globalConfig.reset();
    
    if (success) {
      logger.info('配置已重置为默认值');
      res.json({
        success: true,
        message: '配置已重置为默认值'
      });
    } else {
      res.status(500).json({
        success: false,
        message: '配置重置失败'
      });
    }
  } catch (error) {
    logger.error('重置配置失败:', error);
    res.status(500).json({
      success: false,
      message: '重置配置失败',
      error: error.message
    });
  }
});

// 验证当前配置
router.get('/validate', async (req, res) => {
  try {
    const validation = globalConfig.validate();
    
    res.json({
      success: true,
      data: validation
    });
  } catch (error) {
    logger.error('配置验证失败:', error);
    res.status(500).json({
      success: false,
      message: '配置验证失败',
      error: error.message
    });
  }
});

module.exports = router;