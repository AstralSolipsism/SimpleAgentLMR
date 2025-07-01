const vikaService = require('../vikaService.js');
const logger = require('../../utils/logger');

async function find_task_ids({ task_category, team_name }) {
  try {
    // 直接使用班组名称和任务类别构建正确的COUNTIF公式
    const formula = `AND({任务类型}="${task_category}", COUNTIF({班组}, "${team_name}"))`;
    const TASK_PLAN_DATASHEET_ID = 'dstkM8Mqk1BdG4y1Ls'; // 任务计划表

    logger.info(`使用新公式查询任务计划表: ${formula}`);
    logger.debug(`向维格表发送请求 (find_task_ids)`, { 数据表ID: TASK_PLAN_DATASHEET_ID, 参数: { filterByFormula: formula } });

    const response = await vikaService.getRecords(TASK_PLAN_DATASHEET_ID, {
      filterByFormula: formula,
    });

    const records = response.data;
    logger.debug(`从维格表收到响应 (find_task_ids)`, records);

    if (!records || records.length === 0) {
      logger.warn(`在任务计划表中未找到类别为 "${task_category}" 且班组为 "${team_name}" 的任务。`);
      return [];
    }

    const taskIds = records.map((record) => record.recordId);
    logger.info(`成功为班组 "${team_name}" 找到以下任务ID: ${taskIds.join(', ')}`);
    return taskIds;

  } catch (error) {
    logger.error(`在 find_task_ids 工具中发生错误: 查询任务计划表失败: ${error.message}`, { error });
    throw new Error(`查询任务计划表失败: ${error.message}`);
  }
}

module.exports = {
    name: 'find_task_ids',
    func: find_task_ids,
    doc: {
        name: '查找任务ID',
        description: '根据任务类型和班组名称，在“任务计划总表”中查询匹配的任务记录ID。',
        input: {
            type: 'object',
            properties: {
                task_category: {
                    type: 'string',
                    description: '要查询的任务类型，例如："无人机巡视"。',
                    example: '无人机巡视'
                },
                team_name: {
                    type: 'string',
                    description: '执行任务的班组的全名，例如："线路1班"。',
                    example: '线路1班'
                }
            },
            required: ['task_category', 'team_name']
        },
        output: {
            type: 'array',
            items: {
                type: 'string'
            },
            description: '找到的任务记录ID列表。'
        }
    }
};