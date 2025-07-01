// 引入依赖
const vikaService = require('../vikaService.js');
const logger = require('../../utils/logger');
const { func: getTowerIdsFromLocalDb } = require('./localDbSearch.js');

// 数据表 ID
const TASK_EXECUTION_DATASHEET_ID = 'dst6CHzHSSAwzeXiRD'; // 任务执行总表
const TASK_PLAN_DATASHEET_ID = 'dstkM8Mqk1BdG4y1Ls';     // 任务计划表

// 字段名常量
const FIELD_NAMES = {
    // 任务执行表中的字段
    COMPLETED_TOWERS: '已完成塔',
    UNCOMPLETED_TOWERS: '未完成塔',
    COMPLETED_TEAM: '完成小组',
    LINKED_DAILY_REPORT: '关联日报完成情况',
    CURRENT_STATUS: '当前状态',
    TASK_PLAN: '任务计划', // 指向“任务计划表”的关联字段

    // 任务计划表中的字段
    TASK_EXECUTION_LINK: '任务执行表' // 指向“任务执行表”的关联字段
};

/**
 * @name 更新任务执行状态
 * @description 根据“任务计划ID”自动查找或创建“任务执行记录”，并更新其状态。此工具封装了计划与执行的关联逻辑，简化了调用。
 * @param {object} params - 参数对象
 * @param {string} params.task_record_id - “任务计划表”中的记录ID (将被用于查找或创建执行记录)。
 * @param {string[] | string} params.completed_towers - 一个包含已完成杆塔【名称】的数组或JSON数组字符串。
 * @param {string} params.team_record_id - 完成任务的小组在“班组表”中的 recordID。
 * @param {string} params.daily_report_record_id - 本次任务关联的“日报池”记录的 recordID。
 * @returns {Promise<object>} - 包含操作结果的对象
 */
async function update_task_execution_status({
    task_record_id, // 此ID现在是“任务计划ID”
    completed_towers,
    team_record_id,
    daily_report_record_id
}) {
    try {
        const task_plan_id = task_record_id; // 语义上重命名以提高清晰度
        let execution_record_id;

        // 步骤 1: 根据任务计划ID，直接从“任务计划表”获取记录，并检查其关联的“任务执行记录”
        logger.info(`开始处理任务计划ID: ${task_plan_id}`);
        const planRecordResponse = await vikaService.getRecord(TASK_PLAN_DATASHEET_ID, task_plan_id);

        if (!planRecordResponse.success) {
            throw new Error(`从“任务计划表”获取记录(ID: ${task_plan_id})失败: ${planRecordResponse.error}`);
        }

        const planRecordFields = planRecordResponse.data.fields;
        const linkedExecutionIds = planRecordFields[FIELD_NAMES.TASK_EXECUTION_LINK] || [];

        if (linkedExecutionIds.length > 0) {
            // a. 如果已有关联的执行记录，直接使用第一个
            execution_record_id = linkedExecutionIds[0];
            logger.info(`从任务计划中找到已存在的任务执行记录，ID: ${execution_record_id}`);
        } else {
            // b. 如果没有关联的执行记录，则创建一个新的，并建立双向链接
            logger.info(`未找到关联的任务执行记录，将为计划 ${task_plan_id} 创建新记录。`);
            
            const createExecData = { fields: { [FIELD_NAMES.TASK_PLAN]: [task_plan_id] } };
            const createExecResponse = await vikaService.createRecord(TASK_EXECUTION_DATASHEET_ID, createExecData);
            if (!createExecResponse.success || !createExecResponse.data.records || createExecResponse.data.records.length === 0) {
                throw new Error(`创建新的任务执行记录失败: ${createExecResponse.error || '未知错误'}`);
            }
            execution_record_id = createExecResponse.data.records[0].id;
            logger.info(`成功创建新的任务执行记录，ID: ${execution_record_id}`);

            const updatePlanData = { [FIELD_NAMES.TASK_EXECUTION_LINK]: [execution_record_id] };
            const updatePlanResponse = await vikaService.updateRecord(TASK_PLAN_DATASHEET_ID, task_plan_id, updatePlanData);
            if (!updatePlanResponse.success) {
                logger.warn(`无法将新的执行记录ID更新回任务计划(ID: ${task_plan_id})。错误: ${updatePlanResponse.error}`);
            } else {
                logger.info(`成功将执行记录ID ${execution_record_id} 链接回任务计划 ${task_plan_id}`);
            }
        }

        // 步骤 2: 解析并验证输入
        let completedTowerNames;
        if (typeof completed_towers === 'string') {
            try {
                completedTowerNames = JSON.parse(completed_towers);
            } catch (e) {
                throw new Error('输入参数 completed_towers 如果是字符串，必须是有效的JSON数组格式。');
            }
        } else if (Array.isArray(completed_towers)) {
            completedTowerNames = completed_towers;
        } else {
            throw new Error('输入参数 completed_towers 必须是数组或有效的JSON数组字符串。');
        }

        // 步骤 3: 使用 localDbSearch 将塔名转换为 Record IDs
        logger.info(`开始从本地数据库查询塔的Record IDs: ${JSON.stringify(completedTowerNames)}`);
        const towerIdMap = await getTowerIdsFromLocalDb({ tower_names: completedTowerNames });

        const completedTowerIds = [];
        const notFoundNames = [];

        completedTowerNames.forEach(name => {
            const recordId = towerIdMap[name];
            if (recordId) {
                completedTowerIds.push(recordId);
            } else {
                notFoundNames.push(name);
            }
        });

        if (notFoundNames.length > 0) {
            logger.error(`严重警告：在本地缓存中未找到以下杆塔，它们将被忽略: ${notFoundNames.join(', ')}`);
        }
        logger.info(`成功将 ${completedTowerIds.length} 个塔名转换为 Record IDs。`);

        // 步骤 4: 读取记录现有数据 (Read)
        const response = await vikaService.getRecord(TASK_EXECUTION_DATASHEET_ID, execution_record_id);
        if (!response.success) {
            throw new Error(`获取任务记录(ID: ${execution_record_id})失败: ${response.error}`);
        }
        const currentFields = response.data.fields;
        
        const currentUncompletedIds = currentFields[FIELD_NAMES.UNCOMPLETED_TOWERS] || [];
        const currentCompletedIds = currentFields[FIELD_NAMES.COMPLETED_TOWERS] || [];

        // 步骤 5: 计算新的链接字段值 (Modify)
        const newCompletedSet = new Set([...currentCompletedIds, ...completedTowerIds]);
        const uncompletedSet = new Set(currentUncompletedIds);
        completedTowerIds.forEach(id => uncompletedSet.delete(id));
        const newUncompletedList = Array.from(uncompletedSet);

        // 步骤 6: 构建更新对象
        const fieldsToUpdate = {
            [FIELD_NAMES.COMPLETED_TOWERS]: Array.from(newCompletedSet),
            [FIELD_NAMES.UNCOMPLETED_TOWERS]: newUncompletedList,
            [FIELD_NAMES.COMPLETED_TEAM]: [team_record_id],
            [FIELD_NAMES.LINKED_DAILY_REPORT]: [daily_report_record_id]
        };

        // 步骤 7: 根据业务规则更新“当前状态”
        if (newUncompletedList.length === 0) {
            fieldsToUpdate[FIELD_NAMES.CURRENT_STATUS] = '已完成';
            logger.info(`任务(ID: ${execution_record_id})的所有杆塔均已完成，状态将更新为“已完成”。`);
        }

        // 步骤 8: 执行更新 (Write)
        const updateResponse = await vikaService.updateRecord(TASK_EXECUTION_DATASHEET_ID, execution_record_id, fieldsToUpdate);
        if (!updateResponse.success) {
            throw new Error(`更新维格表记录(ID: ${execution_record_id})失败: ${updateResponse.error}`);
        }

        // 步骤 9: 返回成功结果
        logger.info(`成功更新任务执行记录(ID: ${execution_record_id})。`);
        return {
            success: true,
            updated_record_id: execution_record_id
        };

    } catch (error) {
        // 步骤 10: 统一错误处理
        logger.error(`在 update_task_execution_status 工具中发生错误: ${error.message}`, { stack: error.stack });
        throw error;
    }
}

module.exports = {
    name: 'update_task_execution_status',
    func: update_task_execution_status,
    doc: {
        name: '更新任务执行状态',
        description: '根据“任务计划ID”自动查找或创建“任务执行记录”，并更新其状态。此工具封装了计划与执行的关联逻辑，简化了调用。',
        input: {
            type: 'object',
            properties: {
                task_record_id: {
                    type: 'string',
                    description: '“任务计划表”中的记录ID (将被用于查找或创建执行记录)。',
                    example: 'rec14TuLVi2Qt'
                },
                completed_towers: {
                    type: 'array',
                    items: { type: 'string' },
                    description: '一个包含已完成杆塔【名称】的数组或JSON数组字符串。',
                    example: '["塔名1", "塔名2"]'
                },
                team_record_id: {
                    type: 'string',
                    description: '完成任务的小组在“班组表”中的 recordID。',
                    example: 'rec1HuAnoJzXd'
                },
                daily_report_record_id: {
                    type: 'string',
                    description: '本次任务关联的“日报池”记录的 recordID。',
                    example: 'recHpoVncwv2S'
                }
            },
            required: ['task_record_id', 'completed_towers', 'team_record_id', 'daily_report_record_id']
        },
        output: {
            type: 'object',
            properties: {
                success: {
                    type: 'boolean',
                    description: '操作是否成功。'
                },
                updated_record_id: {
                    type: 'string',
                    description: '被成功更新的任务执行记录的 recordID。'
                }
            }
        }
    }
};