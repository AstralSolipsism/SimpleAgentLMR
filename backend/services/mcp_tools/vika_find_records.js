const vikaService = require('../vikaService.js');
const logger = require('../../utils/logger');
const globalConfig = require('../../config/globalConfig');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const apiDelay = 1000 / (globalConfig.vika_qps || 2);

/**
 * @name 查找维格表记录
 * [原子操作] 根据指定的过滤条件在维格表中查找记录。
 * @param {object} params - 参数对象。
 * @param {string} params.sheet_id - 维格表数据表的 ID。
 * @param {string} params.filter_by_formula - 用于过滤记录的公式。
 * @returns {Promise<object>} - vikaService.getRecords 的原始响应。
 */
async function vika_find_records({ sheet_id, filter_by_formula }) {
    try {
        await sleep(apiDelay);
        const params = { filterByFormula: filter_by_formula };
        logger.debug('向维格表发送请求 (getRecords)', { 数据表ID: sheet_id, 参数: params });
        const response = await vikaService.getRecords(sheet_id, params);
        logger.debug('从维格表收到响应 (getRecords)', response.data);
        return response;
    } catch (error) {
        logger.error('在 vika_find_records 中发生错误:', { message: error.message, stack: error.stack });
        throw error;
    }
}

vika_find_records.doc = '[原子操作] 根据指定的过滤条件在维格表中查找记录。参数: { sheet_id: string, filter_by_formula: string }';

module.exports = {
    name: 'vika_find_records',
    func: vika_find_records,
};