const vikaService = require('../vikaService.js');
const logger = require('../../utils/logger');
const globalConfig = require('../../config/globalConfig');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const apiDelay = 1000 / (globalConfig.vika_qps || 2);

/**
 * @name 更新维格表记录
 * [原子操作] 更新维格表中的一条现有记录。
 * @param {object} params - 参数对象。
 * @param {string} params.sheet_id - 维格表数据表的 ID。
 * @param {string} params.record_id - 要更新的记录的 ID。
 * @param {object} params.fields - 要更新的字段数据。
 * @returns {Promise<object>} - vikaService.updateRecord 的原始响应。
 */
async function vika_update_record({ sheet_id, record_id, fields }) {
    try {
        await sleep(apiDelay);
        logger.debug('向维格表发送请求 (updateRecord)', { 数据表ID: sheet_id, 记录ID: record_id, 字段: fields });
        const response = await vikaService.updateRecord(sheet_id, record_id, fields);
        logger.debug('从维格表收到响应 (updateRecord)', response.data);
        return response;
    } catch (error) {
        logger.error('在 vika_update_record 中发生错误:', { message: error.message, stack: error.stack });
        throw error;
    }
}

vika_update_record.doc = '[原子操作] 更新维格表中的一条现有记录。参数: { sheet_id: string, record_id: string, fields: object }';

module.exports = {
    name: 'vika_update_record',
    func: vika_update_record,
};