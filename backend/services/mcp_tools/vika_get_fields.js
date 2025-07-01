const vikaService = require('../vikaService.js');
const logger = require('../../utils/logger');
const globalConfig = require('../../config/globalConfig');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const apiDelay = 1000 / (globalConfig.vika_qps || 2);

/**
 * @name 获取维格表字段
 * [原子操作] 获取指定维格表数据表的字段列表。
 * @param {object} params - 参数对象。
 * @param {string} params.sheet_id - 维格表数据表的 ID。
 * @returns {Promise<object>} - vikaService.getFields 的原始响应。
 */
async function vika_get_fields({ sheet_id }) {
    try {
        await sleep(apiDelay);
        logger.debug('向维格表发送请求 (getFields)', { 数据表ID: sheet_id });
        const response = await vikaService.getFields(sheet_id);
        logger.debug('从维格表收到响应 (getFields)', response.data);
        return response;
    } catch (error) {
        logger.error('在 vika_get_fields 中发生错误:', { message: error.message, stack: error.stack });
        throw error;
    }
}

vika_get_fields.doc = '[原子操作] 获取指定维格表数据表的字段列表。参数: { sheet_id: string }';

module.exports = {
    name: 'vika_get_fields',
    func: vika_get_fields,
};