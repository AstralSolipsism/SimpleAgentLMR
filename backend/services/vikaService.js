const axios = require('axios');
const { globalConfig } = require('../config/globalConfig');
const logger = require('../utils/logger');

const healthCache = {
 lastCheck: 0,
 data: null,
 cacheDuration: 30000, // 30秒缓存
};

/**
* 维格表服务 - 重构版本
 * 使用HTTP客户端模式调用Python微服务，解决子进程性能问题
 */
class VikaService {
  constructor() {
    this.pythonServiceUrl = 'http://127.0.0.1:5001';
    this.apiClient = null;
    this.cache = new Map();
    this.cacheTimeout = 3600000; // 1小时缓存过期
    this.initialized = false;
    
    this.initService();
  }
  
  // 初始化服务
  async initService() {
    this.sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    const config = this.getConfig();
    this.apiDelay = 1000 / (config.rateLimitQPS || 2);
    
    try {
      // 创建axios实例
      this.apiClient = axios.create({
        baseURL: this.pythonServiceUrl,
        timeout: 300000, // 增加超时时间到5分钟
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      // 添加请求拦截器用于日志
      this.apiClient.interceptors.request.use(
        (config) => {
          const requestInfo = {
            method: config.method?.toUpperCase(),
            url: config.url,
            data: config.data,
          };
          logger.debug(`[VIKA_REQUEST_DEBUG] Request PARAMS: ${JSON.stringify(requestInfo)}`);
          return config;
        },
        (error) => {
          logger.error('维格表API请求失败:', error);
          return Promise.reject(error);
        }
      );
      
      // 添加响应拦截器
      this.apiClient.interceptors.response.use(
        (response) => {
          logger.debug(`[VIKA_RESPONSE_DEBUG] Response DATA: ${JSON.stringify(response.data)}`);
          return response;
        },
        (error) => {
          logger.error('维格表API响应错误:', {
            status: error.response?.status,
            data: error.response?.data,
            message: error.message
          });
          return Promise.reject(error);
        }
      );
      
      // 初始化Python服务配置
      await this.initializePythonService();
      
      logger.info('维格表服务初始化完成');
    } catch (error) {
      logger.error('维格表服务初始化失败:', error);
      throw error;
    }
  }
  
  // 初始化Python服务配置
  async initializePythonService() {
    const maxRetries = 5;
    const retryDelay = 2000; // 2 seconds

    for (let i = 0; i < maxRetries; i++) {
      try {
        const config = this.getConfig();
        
        const response = await this.apiClient.post('/config', {
          user_token: config.userToken,
          api_base: config.apiBase,
          rate_limit_qps: config.rateLimitQPS
        });
        
        if (response.data.success) {
          this.initialized = true;
          logger.info('Python维格表服务配置成功');
          return; // Success, exit the function
        } else {
          throw new Error('Python服务返回配置失败');
        }
        
      } catch (error) {
        if (error.code === 'ECONNREFUSED' && i < maxRetries - 1) {
          logger.warn(`Python服务连接失败，将在 ${retryDelay / 1000} 秒后重试... (${i + 1}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        } else {
          logger.error('Python服务配置失败:', error);
          throw error; // Rethrow after final attempt or for other errors
        }
      }
    }
  }
  
  // 获取配置
  getConfig() {
    return {
      userToken: globalConfig.get('vika.userToken'),
      apiBase: globalConfig.get('vika.apiBase'),
      spaceId: globalConfig.get('vika.spaceId'),
      rateLimitQPS: globalConfig.get('vika.rateLimitQPS') || 2
    };
  }
  
  // 确保服务已初始化
  async ensureInitialized() {
    if (!this.initialized) {
      await this.initializePythonService();
    }
  }
  
  // 处理API响应
  handleApiResponse(response, operation) {
    if (response.data.success) {
      logger.info(`维格表操作成功: ${operation}`);
      return {
        success: true,
        data: response.data.data,
        fromCache: response.data.from_cache || false
      };
    } else {
      logger.error(`维格表操作失败: ${operation}`, { error: response.data.error });
      return {
        success: false,
        error: response.data.error || '操作失败'
      };
    }
  }
  
  // 创建记录
  async createRecord(datasheetId, fields) {
    logger.info('正在向维格表创建记录', { datasheetId });
    try {
      await this.sleep(this.apiDelay);
      await this.ensureInitialized();
      
      logger.debug('发送到维格表的请求', { datasheet_id: datasheetId, records: [{ fields }] });
      const response = await this.apiClient.post('/records', {
        datasheet_id: datasheetId,
        records: [{ fields }]
      });
      
      const result = this.handleApiResponse(response, `创建记录: ${datasheetId}`);
      
      if (result.success) {
        // 清除相关缓存
        this.clearCache(`records:${datasheetId}`);
      }
      
      return result;
      
    } catch (error) {
      logger.error(`创建记录失败: ${datasheetId}`, { error: error.message });
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  // 批量创建记录
  async createRecords(datasheetId, recordsData) {
    logger.info('正在向维格表批量创建记录', { datasheetId });
    try {
      await this.sleep(this.apiDelay);
      await this.ensureInitialized();
      
      const records = recordsData.map(data => ({ fields: data }));
      
      logger.debug('发送到维格表的请求', { datasheet_id: datasheetId, records: records });
      const response = await this.apiClient.post('/records', {
        datasheet_id: datasheetId,
        records: records
      });
      
      const result = this.handleApiResponse(response, `批量创建记录: ${datasheetId}`);
      
      if (result.success) {
        this.clearCache(`records:${datasheetId}`);
      }
      
      return result;
      
    } catch (error) {
      logger.error(`批量创建记录失败: ${datasheetId}`, { error: error.message });
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  // 获取记录
  async getRecord(datasheetId, recordId) {
    logger.info('正在从维格表获取单条记录', { datasheetId, recordId });
    try {
      await this.sleep(this.apiDelay);
      await this.ensureInitialized();
      
      logger.debug('发送到维格表的请求', { datasheetId, recordId });
      const response = await this.apiClient.get(`/records/${datasheetId}/${recordId}`);
      
      return this.handleApiResponse(response, `获取记录: ${datasheetId}/${recordId}`);
      
    } catch (error) {
      logger.error(`获取记录失败: ${datasheetId}/${recordId}`, { error: error.message });
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  // 更新记录
  async updateRecord(datasheetId, recordId, fields) {
    logger.info('正在更新维格表中的记录', { datasheetId, recordId });
    try {
      await this.sleep(this.apiDelay);
      await this.ensureInitialized();
      
      logger.debug('发送到维格表的请求', { datasheet_id: datasheetId, record_id: recordId, fields: fields });
      const response = await this.apiClient.patch(`/records/${datasheetId}`, {
        records: [{
          record_id: recordId,
          fields: fields
        }]
      });
      
      const result = this.handleApiResponse(response, `更新记录: ${datasheetId}/${recordId}`);
      
      if (result.success) {
        // 清除相关缓存
        this.clearCache(`record:${datasheetId}:${recordId}`);
        this.clearCache(`records:${datasheetId}`);
      }
      
      return result;
      
    } catch (error) {
      logger.error(`更新记录失败: ${datasheetId}/${recordId}`, { error: error.message });
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  // 删除记录
  async deleteRecord(datasheetId, recordId) {
    logger.info('正在删除维格表中的记录', { datasheetId, recordId });
    try {
      await this.sleep(this.apiDelay);
      await this.ensureInitialized();
      
      logger.debug('发送到维格表的请求', { datasheetId, recordId });
      const response = await this.apiClient.delete(`/records/${datasheetId}/${recordId}`);
      
      const result = this.handleApiResponse(response, `删除记录: ${datasheetId}/${recordId}`);
      
      if (result.success) {
        // 清除相关缓存
        this.clearCache(`record:${datasheetId}:${recordId}`);
        this.clearCache(`records:${datasheetId}`);
      }
      
      return result;
      
    } catch (error) {
      logger.error(`删除记录失败: ${datasheetId}/${recordId}`, { error: error.message });
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  // 获取记录列表
  async getRecords(datasheetId, params = {}) {
    logger.info('正在从维格表获取记录列表', { datasheetId, params });
    try {
      await this.sleep(this.apiDelay);
      await this.ensureInitialized();

      // **手动构建URL查询字符串**
      const searchParams = new URLSearchParams();

      // 映射并添加参数
      if (params.viewId) searchParams.append('view_id', params.viewId);
      if (params.pageSize) searchParams.append('page_size', params.pageSize);
      if (params.pageToken) searchParams.append('page_token', params.pageToken);
      if (params.filterByFormula) searchParams.append('filter_formula', params.filterByFormula);
      if (params.fields) {
        // 如果 fields 是数组，则用逗号连接
        if (Array.isArray(params.fields)) {
          searchParams.append('fields', params.fields.join(','));
        } else {
          searchParams.append('fields', params.fields);
        }
      }
      
      const queryString = searchParams.toString();
      const url = `/records/${datasheetId}${queryString ? `?${queryString}` : ''}`;
      
      logger.debug(`[VIKA_GET_RECORDS] Manually constructed URL: ${url}`);

      // **使用手动构建的URL，移除params配置**
      const response = await this.apiClient.get(url);

      return this.handleApiResponse(response, `获取记录列表: ${datasheetId}`);

    } catch (error) {
      logger.error(`获取记录列表失败: ${datasheetId}`, { error: error.message });
      return {
        success: false,
        error: error.message,
      };
    }
  }
  
  // 获取空间站信息
  async getSpaceInfo(spaceId) {
    const cacheKey = `spaceInfo:${spaceId}`;
    if (this.cache.has(cacheKey)) {
      const cachedData = this.cache.get(cacheKey);
      logger.info(`从缓存中获取空间站信息: ${spaceId}`);
      return { success: true, data: cachedData, fromCache: true };
    }

    try {
      await this.sleep(this.apiDelay);
      await this.ensureInitialized();
      
      const response = await this.apiClient.get(`/spaces/${spaceId}`);
      const result = this.handleApiResponse(response, `获取空间站信息: ${spaceId}`);
      
      if (result.success) {
        this.cache.set(cacheKey, result.data);
      }
      
      return result;
      
    } catch (error) {
      logger.error(`获取空间站信息失败: ${spaceId}`, { error: error.message });
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  // 获取空间站列表
  async getSpaces() {
    const cacheKey = 'spaces';
    if (this.cache.has(cacheKey)) {
      const cachedData = this.cache.get(cacheKey);
      logger.info('从缓存中获取空间站列表');
      return { success: true, data: cachedData, fromCache: true };
    }

    try {
      await this.sleep(this.apiDelay);
      await this.ensureInitialized();
      
      const response = await this.apiClient.get('/spaces');
      const result = this.handleApiResponse(response, '获取空间站列表');

      if (result.success) {
        this.cache.set(cacheKey, result.data);
      }
      
      return result;
      
    } catch (error) {
      logger.error('获取空间站列表失败', { error: error.message });
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  // 获取数据表列表
  async getDatasheets(spaceId) {
    const cacheKey = `datasheets:${spaceId}`;
    if (this.cache.has(cacheKey)) {
      const cachedData = this.cache.get(cacheKey);
      logger.info(`从缓存中获取数据表列表: ${spaceId}`);
      return { success: true, data: cachedData, fromCache: true };
    }

    try {
      await this.sleep(this.apiDelay);
      await this.ensureInitialized();
      
      const response = await this.apiClient.get(`/spaces/${spaceId}/datasheets`);
      const result = this.handleApiResponse(response, `获取数据表列表: ${spaceId}`);

      if (result.success) {
        this.cache.set(cacheKey, result.data);
      }
      
      return result;
      
    } catch (error) {
      logger.error(`获取数据表列表失败: ${spaceId}`, { error: error.message });
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  // 获取视图列表
  async getViews(datasheetId) {
    try {
      await this.sleep(this.apiDelay);
      await this.ensureInitialized();
      
      const response = await this.apiClient.get(`/datasheets/${datasheetId}/views`);
      
      return this.handleApiResponse(response, `获取视图列表: ${datasheetId}`);
      
    } catch (error) {
      logger.error(`获取视图列表失败: ${datasheetId}`, { error: error.message });
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  // 获取字段信息
  async getFields(datasheetId) {
    const cacheKey = `fields:${datasheetId}`;
    if (this.cache.has(cacheKey)) {
      const cachedData = this.cache.get(cacheKey);
      logger.info(`从缓存中获取字段信息: ${datasheetId}`);
      return { success: true, data: cachedData, fromCache: true };
    }

    try {
      await this.sleep(this.apiDelay);
      await this.ensureInitialized();
      
      const response = await this.apiClient.get(`/datasheets/${datasheetId}/fields`);
      const result = this.handleApiResponse(response, `获取字段信息: ${datasheetId}`);

      if (result.success) {
        this.cache.set(cacheKey, result.data);
      }
      
      return result;
      
    } catch (error) {
      logger.error(`获取字段信息失败: ${datasheetId}`, { error: error.message });
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  // 获取完整的空间站配置信息（解决N+1查询问题）
  async getSpaceConfiguration(spaceId) {
    const cacheKey = `spaceConfiguration:${spaceId}`;
    if (this.cache.has(cacheKey)) {
      const cachedData = this.cache.get(cacheKey);
      logger.info(`从缓存中获取空间站配置: ${spaceId}`);
      return { success: true, data: cachedData, fromCache: true };
    }

    try {
      await this.sleep(this.apiDelay);
      await this.ensureInitialized();
      
      const response = await this.apiClient.get(`/spaces/${spaceId}/configuration`);
      const result = this.handleApiResponse(response, `获取空间站配置: ${spaceId}`);

      if (result.success) {
        this.cache.set(cacheKey, result.data);
      }
      
      return result;
      
    } catch (error) {
      logger.error(`获取空间站配置失败: ${spaceId}`, { error: error.message });
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  // 批量操作
  async batchOperations(operations) {
    try {
      await this.sleep(this.apiDelay);
      await this.ensureInitialized();
      
      const response = await this.apiClient.post('/batch', {
        operations: operations
      });
      
      const result = this.handleApiResponse(response, '批量操作');
      
      if (result.success) {
        // 清除所有缓存，因为批量操作可能影响多个数据表
        await this.clearAllCache();
      }
      
      return result;
      
    } catch (error) {
      logger.error('批量操作失败', { error: error.message });
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  // 清除缓存（本地缓存 + Python服务缓存）
  clearCache(pattern = null) {
    // 清除本地缓存
    if (pattern) {
      for (const key of this.cache.keys()) {
        if (key.includes(pattern)) {
          this.cache.delete(key);
        }
      }
    } else {
      this.cache.clear();
    }
    
    // 清除Python服务缓存
    this.clearPythonServiceCache(pattern);
    
    logger.info('维格表缓存已清除', { pattern });
  }
  
  // 清除Python服务缓存
  async clearPythonServiceCache(pattern = null) {
    try {
      if (this.apiClient) {
        const params = pattern ? `?pattern=${encodeURIComponent(pattern)}` : '';
        await this.apiClient.delete(`/cache${params}`);
      }
    } catch (error) {
      logger.error('清除Python服务缓存失败:', error);
    }
  }
  
  // 清除所有缓存
  async clearAllCache() {
    try {
      this.cache.clear();
      
      if (this.apiClient) {
        await this.apiClient.delete('/cache');
      }
      
      logger.info('所有维格表缓存已清除');
    } catch (error) {
      logger.error('清除所有缓存失败:', error);
    }
  }
  
  // 获取缓存统计
  async getCacheStats() {
    try {
      let pythonStats = null;
      
      if (this.apiClient) {
        const response = await this.apiClient.get('/cache/stats');
        if (response.data.success) {
          pythonStats = response.data.data;
        }
      }
      
      return {
        success: true,
        data: {
          local_cache_size: this.cache.size,
          python_service_stats: pythonStats,
          service_initialized: this.initialized
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  // 测试连接
  async testConnection() {
    try {
      await this.sleep(this.apiDelay);
      // 测试Python服务连接
      const healthResponse = await this.apiClient.get('/health');
      
      if (!healthResponse.data.status || healthResponse.data.status !== 'healthy') {
        throw new Error('Python服务不健康');
      }
      
      // 测试维格表API连接
      const config = this.getConfig();
      const spaceInfo = await this.getSpaceInfo(config.spaceId);
      
      if (spaceInfo.success) {
        return {
          success: true,
          message: '维格表连接成功',
          data: {
            python_service: healthResponse.data,
            vika_api: spaceInfo.data
          }
        };
      } else {
        return {
          success: false,
          message: `维格表连接失败: ${spaceInfo.error}`
        };
      }
    } catch (error) {
      return {
        success: false,
        message: `维格表连接失败: ${error.message}`
      };
    }
  }
  
  // 健康检查（带缓存）
  async healthCheck() {
    const now = Date.now();
    if (now - healthCache.lastCheck < healthCache.cacheDuration && healthCache.data) {
      return { success: true, data: healthCache.data, fromCache: true };
    }

    try {
      await this.sleep(this.apiDelay);
      await this.ensureInitialized();
      const response = await this.apiClient.get('/health');
      
      if (response.data && response.data.status === 'healthy') {
        const healthStatus = {
          status: 'ok',
          service: 'VikaService',
          dependency: 'PythonVikaServer',
          details: response.data,
        };
        healthCache.data = healthStatus;
        healthCache.lastCheck = now;
        return { success: true, data: healthStatus };
      } else {
        throw new Error(response.data.error || 'Unknown error from Python service');
      }
    } catch (error) {
      const errorStatus = {
        status: 'error',
        service: 'VikaService',
        dependency: 'PythonVikaServer',
        error: error.message,
      };
      // 注意：即使失败也缓存结果，以防止在短时间内重复请求失败的服务
      healthCache.data = errorStatus;
      healthCache.lastCheck = now;
      return { success: false, data: errorStatus };
    }
  }
  
  // 重新配置Python服务
  async reconfigurePythonService() {
    try {
      await this.sleep(this.apiDelay);
      this.initialized = false;
      await this.initializePythonService();
      return {
        success: true,
        message: 'Python服务重新配置成功'
      };
    } catch (error) {
      return {
        success: false,
        error: `Python服务重新配置失败: ${error.message}`
      };
    }
  }
}

module.exports = new VikaService();