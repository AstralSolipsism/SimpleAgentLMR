const vikaService = require('../vikaService.js');
const logger = require('../../utils/logger');
const globalConfig = require('../../config/globalConfig');

// 速率控制辅助函数
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const apiDelay = 1000 / (globalConfig.vika_qps || 2); // 使用配置值，如果不存在则默认为2QPS

/**
 * [原子操作] 获取指定维格表数据表的字段列表。
 * @param {object} params - 参数对象。
 * @param {string} params.sheet_id - 维格表数据表的 ID。
 * @returns {Promise<object>} - vikaService.getFields 的原始响应。
 */
async function vika_get_fields({ sheet_id }) {
    try {
        await sleep(apiDelay);
        return await vikaService.getFields(sheet_id);
    } catch (error) {
        logger.error('在 vika_get_fields 中发生错误:', { message: error.message, stack: error.stack });
        throw error;
    }
}

/**
 * [原子操作] 根据指定的过滤条件在维格表中查找记录。
 * @param {object} params - 参数对象。
 * @param {string} params.sheet_id - 维格表数据表的 ID。
 * @param {string} params.filter_by_formula - 用于过滤记录的公式。
 * @returns {Promise<object>} - vikaService.getRecords 的原始响应。
 */
async function vika_find_records({ sheet_id, filter_by_formula }) {
    try {
        await sleep(apiDelay);
        return await vikaService.getRecords(sheet_id, { filterByFormula: filter_by_formula });
    } catch (error) {
        logger.error('在 vika_find_records 中发生错误:', { message: error.message, stack: error.stack });
        throw error;
    }
}

/**
 * [原子操作] 在维格表中创建一条新记录。
 * @param {object} params - 参数对象。
 * @param {string} params.sheet_id - 维格表数据表的 ID。
 * @param {object} params.fields - 要创建的记录的字段数据。
 * @returns {Promise<object>} - vikaService.createRecord 的原始响应。
 */
async function vika_create_record({ sheet_id, fields }) {
    try {
        await sleep(apiDelay);
        return await vikaService.createRecord(sheet_id, fields);
    } catch (error) {
        logger.error('在 vika_create_record 中发生错误:', { message: error.message, stack: error.stack });
        throw error;
    }
}

/**
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
        return await vikaService.updateRecord(sheet_id, record_id, fields);
    } catch (error) {
        logger.error('在 vika_update_record 中发生错误:', { message: error.message, stack: error.stack });
        throw error;
    }
}

// --- 文档字符串 ---
vika_get_fields.doc = '[原子操作] 获取指定维格表数据表的字段列表。参数: { sheet_id: string }';
vika_find_records.doc = '[原子操作] 根据指定的过滤条件在维格表中查找记录。参数: { sheet_id: string, filter_by_formula: string }';
vika_create_record.doc = '[原子操作] 在维格表中创建一条新记录。参数: { sheet_id: string, fields: object }';
vika_update_record.doc = '[原子操作] 更新维格表中的一条现有记录。参数: { sheet_id: string, record_id: string, fields: object }';

// --- 导出 ---
module.exports = {
    vika_get_fields,
    vika_find_records,
    vika_create_record,
    vika_update_record,
};