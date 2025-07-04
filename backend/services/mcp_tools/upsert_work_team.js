const vikaService = require('../vikaService.js');
const logger = require('../../utils/logger');
const { globalConfig } = require('../../config/globalConfig');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// 定义维格表常量
const PERSONNEL_SHEET_ID = 'dstfkxc0U2LTbjpERq';
const TEAM_SHEET_ID = 'dstqX2E8uyNVYaURrQ';

// 定义所需字段的常量名，便于维护和修改
const FIELD_NAMES = {
    PERSONNEL_NAME: '名字',
    TEAM_LEADER: '小组长',
    TEAM_MEMBERS: '小组成员',
    TEAM_DRIVER: '驾驶员',
    TEAM_STATUS: '小组状态',
    VEHICLE_PLATE: '车牌号',
    TASKS_TODAY: '今日完成',
    PLANS_TOMORROW: '明日计划',
    DAILY_REPORT: '日报记录'
};

/**
 * 辅助函数：获取并验证所有需要的字段是否存在于维格表中。
 * @returns {Promise<Object>} 一个包含所有已验证字段名的对象。
 */
async function getAndVerifyFields() {
    logger.debug('发送到维格表的请求 (getAndVerifyFields):', { personnelSheetId: PERSONNEL_SHEET_ID, teamSheetId: TEAM_SHEET_ID });
    const rateLimitQPS = globalConfig.get('vika.rateLimitQPS') || 2; // 默认为2
    const requestDelay = 1000 / rateLimitQPS;

    const personnelFieldsRes = await vikaService.getFields(PERSONNEL_SHEET_ID);
    logger.info(`成功获取人员表字段，将根据QPS(${rateLimitQPS})设置等待 ${requestDelay.toFixed(0)}ms 后继续...`);
    await delay(requestDelay);
    const teamFieldsRes = await vikaService.getFields(TEAM_SHEET_ID);
    
    logger.debug('从维格表收到的响应 (getAndVerifyFields):', { personnelFieldsRes, teamFieldsRes });
    if (!personnelFieldsRes.success || !teamFieldsRes.success) {
        const personnelError = !personnelFieldsRes.success ? `人员表: ${personnelFieldsRes.error}` : '';
        const teamError = !teamFieldsRes.success ? `小组表: ${teamFieldsRes.error}` : '';
        throw new Error(`无法获取维格表字段定义。${personnelError} ${teamError}`.trim());
    }

    const personnelFields = personnelFieldsRes.data;
    const teamFields = teamFieldsRes.data;

    if (!personnelFields || !teamFields) {
        throw new Error('无法从维格表响应中获取有效的字段列表。');
    }

    const findField = (response, fieldName, sheetName) => {
      const field = response.find(f => f.name === fieldName);
      if (!field) {
        throw new Error(`在维格表 "${sheetName}" 的字段列表中未找到名为 "${fieldName}" 的字段。请检查维格表配置。`);
      }
      return field.name;
    };

    // 返回一个包含所有已验证字段名的对象
    return {
        personnelName: findField(personnelFields, FIELD_NAMES.PERSONNEL_NAME, '人员表'),
        teamLeader: findField(teamFields, FIELD_NAMES.TEAM_LEADER, '小组表'),
        teamMembers: findField(teamFields, FIELD_NAMES.TEAM_MEMBERS, '小组表'),
        teamDriver: findField(teamFields, FIELD_NAMES.TEAM_DRIVER, '小组表'),
        teamStatus: findField(teamFields, FIELD_NAMES.TEAM_STATUS, '小组表'),
        vehiclePlate: findField(teamFields, FIELD_NAMES.VEHICLE_PLATE, '小组表'),
        tasksToday: findField(teamFields, FIELD_NAMES.TASKS_TODAY, '小组表'),
        plansTomorrow: findField(teamFields, FIELD_NAMES.PLANS_TOMORROW, '小组表'),
        dailyReport: findField(teamFields, FIELD_NAMES.DAILY_REPORT, '小组表'),
    };
}

/**
 * 辅助函数：批量将人员姓名转换为 recordID
 * @param {string[]} names - 人员姓名数组
 * @param {string} personnelNameField - 已验证的人员表中的“姓名”字段名
 * @returns {Promise<Object>} - 姓名到 recordID 的映射
 */
async function batchGetPersonRecordIds(names, personnelNameField) {
    logger.debug(`[batchGetPersonRecordIds] 收到待处理的姓名列表: ${JSON.stringify(names)}`);
    // 过滤掉无效的或空的人员姓名，然后去重
    const uniqueNames = [...new Set(names)].filter(Boolean);
    
    if (uniqueNames.length === 0) {
        logger.warn('[batchGetPersonRecordIds] 过滤后没有有效的姓名可供查询，返回空映射。');
        return {};
    }

    const formula = "OR(" + uniqueNames.map(name => `{${personnelNameField}}="${name}"`).join(",") + ")";
    logger.debug('发送到维格表的请求数据 (batchGetPersonRecordIds):', { datasheetId: PERSONNEL_SHEET_ID, params: { filterByFormula: formula } });
    const response = await vikaService.getRecords(PERSONNEL_SHEET_ID, { filterByFormula: formula });
    logger.debug('从维格表收到的响应 (batchGetPersonRecordIds):', response);

    if (!response.success) {
        throw new Error(`查询人员表失败: ${response.error}`);
    }

    const nameMap = {};
    if (response.data) {
        response.data.records.forEach(record => {
            const nameFromVika = record.fields[personnelNameField];
            if (nameFromVika) {
                // 对数据库返回的名字和用于匹配的键都进行trim
                nameMap[nameFromVika.trim()] = record.recordId;
            }
        });
    }

    const notFoundNames = uniqueNames.filter(name => !nameMap[name.trim()]);
    if (notFoundNames.length > 0) {
        throw new Error(`以下人员未在人员表中找到: ${notFoundNames.join(', ')}`);
    }
    return nameMap;
}

/**
 * @name 更新或创建小组记录 (Upsert)
 * @description 根据小组信息，在“小组表”中执行“有则更新，无则创建”操作。此工具会自动发现并验证所需的字段，确保操作的准确性。
 * @param {object} params - 参数对象
 * @param {object} params - 参数对象
 * @param {string} params.leader_name - 组长姓名
 * @param {string[]} [params.member_names=[]] - 组员姓名列表
 * @param {string} params.driver_name - 驾驶员姓名
 * @param {string} params.vehicle_plate - 车牌号
 * @param {string} params.tasks_today - 今日完成任务
 * @param {string} params.plans_tomorrow - 明日计划
 * @param {string} [params.dailyReportRecordId=null] - 关联的日报记录的recordID
 * @returns {Promise<object>} - 包含被操作记录ID的对象
 */
async function upsert_work_team({ leader_name, member_names = [], driver_name, vehicle_plate, tasks_today, plans_tomorrow, dailyReportRecordId = null }) {
    try {
        // 步骤 1: 动态获取并验证字段
        const verifiedFields = await getAndVerifyFields();

        // 步骤 2: 使用组长姓名查找现有小组
        if (!leader_name) {
            throw new Error("输入信息中必须包含组长姓名 (leader_name)。");
        }
        const formula = `AND(COUNTIF({${verifiedFields.teamLeader}}, "${leader_name}"), {${verifiedFields.teamStatus}}="活跃中")`;
        logger.debug('发送到维格表的请求数据 (查找小组通过姓名):', { datasheetId: TEAM_SHEET_ID, params: { filterByFormula: formula } });
        const existingTeamsRes = await vikaService.getRecords(TEAM_SHEET_ID, { filterByFormula: formula });
        logger.debug('从维格表收到的响应 (查找小组通过姓名):', existingTeamsRes);

        if (!existingTeamsRes.success) {
            throw new Error(`通过组长姓名查找小组失败: ${existingTeamsRes.error}`);
        }

        const existingTeams = existingTeamsRes.data || [];
        let teamRecordId = null;

        if (existingTeams.length > 0) {
            if (existingTeams.length > 1) {
                logger.warn(`数据一致性警告：找到多个以'${leader_name}'为组长的活跃小组。将只处理第一条记录。Record IDs: ${existingTeams.map(r => r.recordId).join(', ')}`);
            }
            teamRecordId = existingTeams[0].recordId;
        }

        // 步骤 3: 获取所有相关人员的 Record ID
        const allNames = [leader_name, driver_name, ...member_names].filter(Boolean);
        const nameToRecordIdMap = await batchGetPersonRecordIds(allNames, verifiedFields.personnelName);
        
        const leaderRecordId = nameToRecordIdMap[leader_name.trim()];
        const memberRecordIds = member_names.map(name => nameToRecordIdMap[name.trim()]).filter(Boolean);
        const driverRecordId = driver_name ? nameToRecordIdMap[driver_name.trim()] : null;

        // 步骤 4: 准备要写入的数据
        const fieldsToUpsert = {
            [verifiedFields.teamLeader]: [leaderRecordId],
            [verifiedFields.teamMembers]: memberRecordIds,
            [verifiedFields.teamDriver]: driverRecordId ? [driverRecordId] : [],
            [verifiedFields.teamStatus]: '活跃中',
            [verifiedFields.vehiclePlate]: vehicle_plate,
            [verifiedFields.tasksToday]: tasks_today,
            [verifiedFields.plansTomorrow]: plans_tomorrow,
            [verifiedFields.dailyReport]: dailyReportRecordId ? [dailyReportRecordId] : [],
        };

        // 步骤 5: 决策与执行 (Upsert)
        let result_record_id;
        if (teamRecordId) {
            // 更新前，先比对数据，避免不必要的操作
            const existingRecord = existingTeams[0].fields;
            const changedFields = {};

            // 比较单值字段
            if (fieldsToUpsert[verifiedFields.vehiclePlate] !== existingRecord[verifiedFields.vehiclePlate]) {
                const newValue = fieldsToUpsert[verifiedFields.vehiclePlate];
                changedFields[verifiedFields.vehiclePlate] = newValue === undefined ? null : newValue;
            }
            if (fieldsToUpsert[verifiedFields.tasksToday] !== existingRecord[verifiedFields.tasksToday]) {
                const newValue = fieldsToUpsert[verifiedFields.tasksToday];
                changedFields[verifiedFields.tasksToday] = newValue === undefined ? null : newValue;
            }
            if (fieldsToUpsert[verifiedFields.plansTomorrow] !== existingRecord[verifiedFields.plansTomorrow]) {
                const newValue = fieldsToUpsert[verifiedFields.plansTomorrow];
                changedFields[verifiedFields.plansTomorrow] = newValue === undefined ? null : newValue;
            }

            // 比较多值关联字段（例如：小组成员）
            const compareLinkFields = (newIds, oldIds) => {
                if (!oldIds) oldIds = [];
                const sortedNew = [...newIds].sort().join(',');
                const sortedOld = [...oldIds].sort().join(',');
                return sortedNew !== sortedOld;
            };

            if (compareLinkFields(fieldsToUpsert[verifiedFields.teamLeader], existingRecord[verifiedFields.teamLeader])) {
                changedFields[verifiedFields.teamLeader] = fieldsToUpsert[verifiedFields.teamLeader];
            }
            if (compareLinkFields(fieldsToUpsert[verifiedFields.teamMembers], existingRecord[verifiedFields.teamMembers])) {
                changedFields[verifiedFields.teamMembers] = fieldsToUpsert[verifiedFields.teamMembers];
            }
            if (compareLinkFields(fieldsToUpsert[verifiedFields.teamDriver], existingRecord[verifiedFields.teamDriver])) {
                changedFields[verifiedFields.teamDriver] = fieldsToUpsert[verifiedFields.teamDriver];
            }
            
            // 比较日报记录
            if (compareLinkFields(fieldsToUpsert[verifiedFields.dailyReport], existingRecord[verifiedFields.dailyReport])) {
                changedFields[verifiedFields.dailyReport] = fieldsToUpsert[verifiedFields.dailyReport];
            }

            // 关键修复：只有在检测到实际字段变更时才执行更新操作。
            if (Object.keys(changedFields).length > 0) {
                logger.info('检测到小组数据有变更，将执行更新操作。', { changedFields });
                const updateRes = await vikaService.updateRecord(TEAM_SHEET_ID, teamRecordId, changedFields);
                logger.debug('从维格表收到的更新响应:', updateRes);
                if (!updateRes.success) {
                    throw new Error(`更新小组失败: ${updateRes.error}`);
                }
            } else {
                // 如果没有检测到变更，则记录日志并跳过更新，以避免发送空请求。
                logger.info('小组数据与维格表记录一致，无需更新，跳过操作。');
            }
            result_record_id = teamRecordId;
        } else {
            // 创建
            logger.debug('发送到维格表的创建请求数据:', { datasheetId: TEAM_SHEET_ID, data: fieldsToUpsert });
            const createRes = await vikaService.createRecord(TEAM_SHEET_ID, fieldsToUpsert);
            logger.debug('从维格表收到的创建响应:', createRes);
            if (!createRes.success) {
                throw new Error(`创建小组失败: ${createRes.error}`);
            }
            result_record_id = createRes.data[0].recordId;
        }

        // 步骤 6: 返回结果
        return { team_record_id: result_record_id };

    } catch (error) {
        logger.error('在 upsert_work_team 中发生错误:', { message: error.message, stack: error.stack });
        // 向上层抛出错误，以便调用者可以捕获并处理
        throw error;
    }
}

module.exports = {
    name: 'upsert_work_team',
    func: upsert_work_team,
    doc: {
        name: '更新或创建小组记录 (Upsert)',
        description: '根据小组信息，在“小组表”中执行“有则更新，无则创建”操作。此工具会自动发现并验证所需的字段，确保操作的准确性。',
        input: {
            type: 'object',
            properties: {
                leader_name: {
                    type: 'string',
                    description: '小组的负责人姓名。'
                },
                member_names: {
                    type: 'array',
                    items: { type: 'string' },
                    description: '小组的成员姓名列表。',
                    default: []
                },
                driver_name: {
                    type: 'string',
                    description: '驾驶员姓名。'
                },
                vehicle_plate: {
                    type: 'string',
                    description: '车辆的车牌号码。'
                },
                tasks_today: {
                    type: 'string',
                    description: '今日完成的工作任务描述。'
                },
                plans_tomorrow: {
                    type: 'string',
                    description: '明日的工作计划描述。'
                },
                dailyReportRecordId: {
                    type: 'string',
                    description: '关联的日报记录的recordID。'
                }
            },
            required: ['leader_name', 'tasks_today', 'plans_tomorrow']
        },
        output: {
            type: 'object',
            properties: {
                team_record_id: {
                    type: 'string',
                    description: '被操作（更新或创建）的小组记录的 recordID。'
                }
            }
        }
    }
};