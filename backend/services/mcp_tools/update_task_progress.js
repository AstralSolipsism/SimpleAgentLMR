const vikaService = require('../vikaService.js');
const logger = require('../../utils/logger');

// 定义维格表常量
const TASK_SHEET_ID = 'dst1bl0XUeRrJBLeP4';
const TEAM_SHEET_ID = 'dstqX2E8uyNVYaURrQ'; // 作业小组表ID

// 定义所需字段的常量名
const FIELD_NAMES = {
    TEAM_NAME: '班组名称',
    TASK_TYPE: '任务类型',
    UNCOMPLETED: '未完成',
    COMPLETED: '已完成',
    UNPLANNED: '计划外完成',
    WORK_TEAM_LINK: '完成小组',
    TASK_LINK: '任务表', // 在“作业小组”表中关联“任务表”的字段
    DAILY_REPORT_LINK: '日报记录' // 在“任务表”中关联“日报记录”的字段
};

/**
 * @name 更新任务进度
 * @description 根据班组名称和任务类型，更新任务的完成状态，并将杆塔从未完成列表移动到已完成或计划外完成列表。
 * @param {object} params - 参数对象
 * @param {string} params.workTeamName - 班组的名称。
 * @param {Array<{taskName: string, towerRecordIds: string[]}>} params.tasks - 一个任务数组。
 * @param {string|null} [params.workTeamRecordId=null] - 可选的班组记录ID，用于关联“完成小组”字段。
 * @param {string|null} [params.dailyReportRecordId=null] - 可选的日报记录ID，用于将任务关联到日报。
 * @returns {Promise<object>} - 包含操作结果的对象。
 */
async function updateTaskProgress({ workTeamName, tasks, workTeamRecordId = null, dailyReportRecordId = null }) {
    if (!workTeamName || !tasks || !Array.isArray(tasks) || tasks.length === 0) {
        throw new Error("输入参数无效: 'workTeamName' 和 'tasks' 数组不能为空。");
    }

    const results = [];
    let successCount = 0;
    let failedCount = 0;
    const taskRecordIdsToBackfill = []; // 用于收集所有需要回填的任务记录ID

    for (const task of tasks) {
        const { taskName, towerRecordIds } = task;
        if (!taskName || !towerRecordIds || !Array.isArray(towerRecordIds)) {
            logger.warn(`跳过无效的任务对象: ${JSON.stringify(task)}`);
            failedCount++;
            results.push({
                taskName,
                status: 'skipped',
                reason: '任务对象格式无效'
            });
            continue;
        }

        try {
            // 1. 查找唯一的任务记录
            const formula = `AND({${FIELD_NAMES.TEAM_NAME}}='${workTeamName}', {${FIELD_NAMES.TASK_TYPE}}='${taskName}')`;
            logger.debug(`正在查询任务记录: workTeamName='${workTeamName}', taskName='${taskName}'`);
            const findResponse = await vikaService.getRecords(TASK_SHEET_ID, { filterByFormula: formula });

            if (!findResponse.success || !findResponse.data || findResponse.data.length === 0) {
                throw new Error(`未找到匹配的任务记录。错误: ${findResponse.error || '记录不存在'}`);
            }
            if (findResponse.data.length > 1) {
                logger.warn(`找到多条匹配的任务记录，将只处理第一条。查询条件: ${formula}`);
            }

            const taskRecord = findResponse.data[0];
            const taskRecordId = taskRecord.recordId;
            const fields = taskRecord.fields;

            // 如果提供了 workTeamRecordId，则收集任务记录ID用于后续批量回填
            if (workTeamRecordId) {
                taskRecordIdsToBackfill.push(taskRecordId);
            }

            // 2. 获取当前字段值
            const uncompletedIds = fields[FIELD_NAMES.UNCOMPLETED] || [];
            const completedIds = fields[FIELD_NAMES.COMPLETED] || [];
            const unplannedIds = fields[FIELD_NAMES.UNPLANNED] || [];
            
            logger.debug(`任务 '${taskName}' 的初始状态: 未完成(${uncompletedIds.length}), 已完成(${completedIds.length}), 计划外(${unplannedIds.length})`);

            // 3. 处理 towerRecordIds
            for (const towerId of towerRecordIds) {
                const indexInUncompleted = uncompletedIds.indexOf(towerId);
                if (indexInUncompleted > -1) {
                    // 从“未完成”移动到“已完成”
                    uncompletedIds.splice(indexInUncompleted, 1);
                    if (!completedIds.includes(towerId)) {
                        completedIds.push(towerId);
                    }
                } else {
                    // 添加到“计划外完成”
                    if (!unplannedIds.includes(towerId)) {
                        unplannedIds.push(towerId);
                    }
                }
            }
            
            logger.debug(`任务 '${taskName}' 的更新后状态: 未完成(${uncompletedIds.length}), 已完成(${completedIds.length}), 计划外(${unplannedIds.length})`);

            // 4. 更新记录
            const updatedFields = {
                [FIELD_NAMES.UNCOMPLETED]: uncompletedIds,
                [FIELD_NAMES.COMPLETED]: completedIds,
                [FIELD_NAMES.UNPLANNED]: unplannedIds,
            };

            // 如果提供了 workTeamRecordId，则将其添加到更新负载中
            if (workTeamRecordId) {
                // 注意：这里假设一个任务只由一个小组完成，所以直接覆盖
                updatedFields[FIELD_NAMES.WORK_TEAM_LINK] = [workTeamRecordId];
            }

            // 如果提供了 dailyReportRecordId，则以追加的方式将其添加到更新负载中
            if (dailyReportRecordId) {
                const existingReportIds = fields[FIELD_NAMES.DAILY_REPORT_LINK] || [];
                const updatedReportIds = [...new Set([...existingReportIds, dailyReportRecordId])];
                updatedFields[FIELD_NAMES.DAILY_REPORT_LINK] = updatedReportIds;
            }

            // 过滤掉值为空数组的字段
            Object.keys(updatedFields).forEach(key => {
                if (Array.isArray(updatedFields[key]) && updatedFields[key].length === 0) {
                    delete updatedFields[key];
                }
            });

            let updateResponse = { success: true }; // 默认成功，以防没有字段需要更新
            if (Object.keys(updatedFields).length > 0) {
                 updateResponse = await vikaService.updateRecord(TASK_SHEET_ID, taskRecordId, updatedFields);
            } else {
                logger.info(`任务 '${taskName}' 没有需要更新的字段，跳过 Vika 更新。`);
            }

            if (!updateResponse.success) {
                throw new Error(`更新Vika记录失败: ${updateResponse.error}`);
            }
            
            successCount++;
            results.push({
                taskName,
                status: 'success',
                recordId: taskRecordId,
                summary: `已完成: ${completedIds.length}, 计划外: ${unplannedIds.length}`
            });

        } catch (error) {
            logger.error(`处理任务 '${taskName}' 失败:`, { message: error.message, stack: error.stack });
            failedCount++;
            results.push({
                taskName,
                status: 'failed',
                reason: error.message
            });
        }
    }

    // 5. 在循环结束后，如果提供了 workTeamRecordId 并且有需要回填的任务，则执行批量回填
    if (workTeamRecordId && taskRecordIdsToBackfill.length > 0) {
        try {
            await backfillTaskToWorkTeam(workTeamRecordId, taskRecordIdsToBackfill);
            logger.info(`成功将 ${taskRecordIdsToBackfill.length} 个任务回填到作业小组 [${workTeamRecordId}]`);
        } catch (backfillError) {
            // 回填失败不应中断主流程，但需要记录警告
            logger.warn(`批量回填任务到作业小组失败: ${backfillError.message}`, { workTeamRecordId, taskRecordIds: taskRecordIdsToBackfill });
        }
    }

    const finalResult = {
        message: `任务处理完成。成功: ${successCount}, 失败: ${failedCount}。`,
        results
    };
    
    if (failedCount > 0) {
        // 如果有任何失败，则整个操作视为部分成功，并抛出错误以通知调用者
        const error = new Error(finalResult.message);
        error.details = results;
        throw error;
    }

    return finalResult;
}

updateTaskProgress.doc = '根据班组和任务信息，更新维格表中任务的完成状态，将杆塔ID从“未完成”列表移动到“已完成”或“计划外完成”列表。';

/**
 * 将一批任务记录ID批量回填到作业小组记录中，采用追加方式。
 * @param {string} workTeamRecordId - 作业小组的记录ID。
 * @param {string[]} taskRecordIds - 要关联的任务记录ID数组。
 */
async function backfillTaskToWorkTeam(workTeamRecordId, taskRecordIds) {
    if (!taskRecordIds || taskRecordIds.length === 0) {
        logger.info("没有需要回填的任务ID，跳过操作。");
        return;
    }

    // 1. 读取作业小组的当前记录
    const teamRecordResponse = await vikaService.getRecords(TEAM_SHEET_ID, {
        recordIds: [workTeamRecordId],
        fieldKey: 'name' // 使用字段名获取数据
    });

    if (!teamRecordResponse.success || !teamRecordResponse.data || teamRecordResponse.data.length === 0) {
        throw new Error(`无法找到ID为 [${workTeamRecordId}] 的作业小组记录。`);
    }

    const teamRecord = teamRecordResponse.data[0];
    const existingTaskIds = teamRecord.fields[FIELD_NAMES.TASK_LINK] || [];

    // 2. 合并新的任务ID列表并去重
    const updatedTaskIds = [...new Set([...existingTaskIds, ...taskRecordIds])];

    // 3. 检查是否有实际变化，避免不必要的API调用
    const sortedNew = [...updatedTaskIds].sort().join(',');
    const sortedOld = [...existingTaskIds].sort().join(',');

    if (sortedNew === sortedOld) {
        logger.info(`作业小组 [${workTeamRecordId}] 的任务列表已包含所有待回填的任务，无需更新。`);
        return; // 提前返回
    }

    // 4. 更新作业小组记录
    const updatePayload = {
        [FIELD_NAMES.TASK_LINK]: updatedTaskIds
    };

    // 与此文件中原有的更新逻辑保持一致：过滤掉值为空数组的字段
    if (Array.isArray(updatePayload[FIELD_NAMES.TASK_LINK]) && updatePayload[FIELD_NAMES.TASK_LINK].length === 0) {
        delete updatePayload[FIELD_NAMES.TASK_LINK];
    }

    // 与此文件中原有的更新逻辑保持一致：仅在有字段需要更新时才调用API
    if (Object.keys(updatePayload).length > 0) {
        const updateResponse = await vikaService.updateRecord(TEAM_SHEET_ID, workTeamRecordId, updatePayload);
        if (!updateResponse.success) {
            throw new Error(`更新作业小组 [${workTeamRecordId}] 的任务列表失败: ${updateResponse.error}`);
        }
    } else {
        logger.info(`作业小组 [${workTeamRecordId}] 的任务列表没有需要更新的字段，跳过 Vika 更新。`);
    }
}


module.exports = {
    name: 'update_task_progress',
    func: updateTaskProgress,
};