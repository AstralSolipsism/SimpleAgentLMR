const vikaService = require('../vikaService.js');
const logger = require('../../utils/logger');
const globalConfig = require('../../config/globalConfig');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const apiDelay = 1000 / (globalConfig.vika_qps || 2);

/**
 * @name 删除维格表记录
 * [原子操作] 删除维格表中的一条指定记录。
 * @param {object} params - 参数对象。
 * @param {string} params.sheet_id - 维格表数据表的 ID。
 * @param {string} params.record_id - 要删除的记录的 ID。
 * @returns {Promise<object>} - vikaService.deleteRecord 的原始响应。
 */
async function vika_delete_record({ sheet_id, record_id }) {
    try {
        await sleep(apiDelay);
        logger.debug('向维格表发送请求 (deleteRecord)', { 数据表ID: sheet_id, 记录ID: record_id });
        const response = await vikaService.deleteRecord(sheet_id, record_id);
        logger.debug('从维格表收到响应 (deleteRecord)', response.data);
        return response;
    } catch (error) {
        logger.error('在 vika_delete_record 中发生错误:', { message: error.message, stack: error.stack });
        throw error;
    }
}

vika_delete_record.doc = '[原子操作] 删除维格表中的一条指定记录。参数: { sheet_id: string, record_id: string }';

module.exports = {
    name: 'vika_delete_record',
    func: vika_delete_record,
};