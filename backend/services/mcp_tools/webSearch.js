const axios = require('axios');
const { globalConfig } = require('../../config/globalConfig');
const logger = require('../../utils/logger');

module.exports = {
  name: 'web_search',
  description: '执行网页搜索，返回搜索结果。',
  handler: async function(params) {
    const { query } = params;
    if (!query) {
      throw new Error('搜索查询(query)不能为空');
    }

    const apiKey = globalConfig.get('services.serperApiKey');
    if (!apiKey) {
      logger.error('Serper API key未配置');
      throw new Error('搜索服务未配置API密钥，无法执行搜索。');
    }

    const url = 'https://google.serper.dev/search';
    const data = JSON.stringify({
      q: query
    });

    const config = {
      method: 'post',
      url: url,
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json'
      },
      data: data
    };

    try {
      logger.info(`正在使用Serper执行网页搜索: "${query}"`);
      const response = await axios(config);
      
      // 提取关键信息并返回一个简洁的字符串
      if (response.data && response.data.organic) {
        const results = response.data.organic.map(item =>
          `标题: ${item.title}\n链接: ${item.link}\n摘要: ${item.snippet}`
        ).slice(0, 5); // 只取前5个结果
        
        return results.join('\n\n---\n\n');
      }
      
      return '未找到相关的搜索结果。';

    } catch (error) {
      logger.error('网页搜索失败', { error: error.message });
      if (error.response) {
        logger.error('Serper API 响应错误', { status: error.response.status, data: error.response.data });
      }
      throw new Error(`执行网页搜索时发生错误: ${error.message}`);
    }
  }
};