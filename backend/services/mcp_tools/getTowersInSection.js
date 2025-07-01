const { db } = require('../../database/init.js');
const logger = require('../../utils/logger');

// 辅助函数，将回调风格的db.all调用Promise化
const dbAll = (sql, params) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => {
    if (err) {
      logger.error('本地数据库查询失败:', { sql, params, error: err.message });
      reject(err);
    } else {
      resolve(rows);
    }
  });
});

/**
 * @name 查询区段内所有杆塔
 * @description 根据起始杆塔和终止杆塔的名称，查询并返回该区段内的所有杆塔信息。
 * @param {object} params - 参数对象。
 * @param {string} params.start_tower_name - 起始杆塔的全名。
 * @param {string} params.end_tower_name - 终止杆塔的全名。
 * @returns {Promise<object[]>} - 一个包含区段内所有杆塔信息的对象数组。
 */
async function get_towers_in_section({ start_tower_name, end_tower_name }) {
    if (!start_tower_name || !end_tower_name) {
        throw new Error('必须同时提供起始杆塔和终止杆塔的名称。');
    }

    try {
        // 1. 获取起始和终止杆塔的线路名称和杆塔序号
        const towerInfoSql = `
            SELECT line_name, tower_number
            FROM vika_tower_cache
            WHERE tower_name IN (?, ?)
        `;
        const towerInfos = await dbAll(towerInfoSql, [start_tower_name, end_tower_name]);

        if (towerInfos.length < 2) {
            throw new Error('一个或两个指定的杆塔名称在数据库中不存在。');
        }

        const [info1, info2] = towerInfos;
        if (info1.line_name !== info2.line_name) {
            throw new Error('起始和终止杆塔必须属于同一条线路。');
        }

        const lineName = info1.line_name;
        const number1 = parseInt(info1.tower_number, 10);
        const number2 = parseInt(info2.tower_number, 10);

        // 2. 确定查询的序号范围
        const startNumber = Math.min(number1, number2);
        const endNumber = Math.max(number1, number2);

        // 3. 查询该范围内的所有杆塔
        const sectionSql = `
            SELECT *
            FROM vika_tower_cache
            WHERE line_name = ? AND CAST(tower_number AS INTEGER) >= ? AND CAST(tower_number AS INTEGER) <= ?
            ORDER BY CAST(tower_number AS INTEGER) ASC
        `;
        const sectionTowers = await dbAll(sectionSql, [lineName, startNumber, endNumber]);

        return sectionTowers;
    } catch (error) {
        logger.error('在 get_towers_in_section 中发生严重错误:', { message: error.message, stack: error.stack });
        throw error;
    }
}

get_towers_in_section.doc = '根据起始和终止杆塔的杆塔全名，查询并返回该区段内的所有杆塔信息。能够自动处理输入杆塔名称的顺序。';
get_towers_in_section.displayName = '查询区段内所有杆塔';

module.exports = {
    name: 'get_towers_in_section',
    func: get_towers_in_section,
    config: {
        "displayName": "查询区段内所有杆塔",
        "params": [
            {
                "name": "start_tower_name",
                "type": "string",
                "label": "起始杆塔",
                "required": true,
                "description": "区段的起始杆塔全名"
            },
            {
                "name": "end_tower_name",
                "type": "string",
                "label": "终止杆塔",
                "required": true,
                "description": "区段的终止杆塔全名"
            }
        ]
    }
};