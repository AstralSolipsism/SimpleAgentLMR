const vikaService = require('../vikaService.js');
const logger = require('../../utils/logger');
const globalConfig = require('../../config/globalConfig');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const apiDelay = 1000 / (globalConfig.vika_qps || 2);

/**
 * @name 创建维格表记录
 * [原子操作] 在维格表中创建一条新记录。
 * @param {object} params - 参数对象。
 * @param {string} params.sheet_id - 维格表数据表的 ID。
 * @param {object} params.fields - 要创建的记录的字段数据。
 * @returns {Promise<object>} - vikaService.createRecord 的原始响应。
 */
async function vika_create_record({ sheet_id, fields }) {
    try {
        await sleep(apiDelay);
        logger.debug('向维格表发送请求 (createRecord)', { 数据表ID: sheet_id, 字段: fields });
        const response = await vikaService.createRecord(sheet_id, fields);
        logger.debug('从维格表收到响应 (createRecord)', response.data);
        return response;
    } catch (error) {
        logger.error('在 vika_create_record 中发生错误:', { message: error.message, stack: error.stack });
        throw error;
    }
}

vika_create_record.doc = '[原子操作] 在维格表中创建一条新记录。参数: { sheet_id: string, fields: object }';

module.exports = {
    name: 'vika_create_record',
    func: vika_create_record,
};