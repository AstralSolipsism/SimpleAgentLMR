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
<<<<<<< HEAD
 * @name 杆塔ID本地查询
=======
>>>>>>> 30fd47290ae29c499b6b7eb7e416a81c8299d309
 * 从本地数据库缓存中，根据一组杆塔的全名，高效地查询并返回它们对应的维格表 recordID。
 * @param {object} params - 参数对象。
 * @param {string[]} params.tower_names - 需要查询的杆塔名称数组。
 * @returns {Promise<object>} - 一个将 tower_name 映射到 tower_record_id 的对象。
 */
async function get_tower_ids_from_local_db({ tower_names }) {
    if (!tower_names || tower_names.length === 0) {
        return {};
    }
    try {
        const placeholders = tower_names.map(() => '?').join(',');
        const sql = `SELECT tower_name, tower_record_id FROM vika_tower_cache WHERE tower_name IN (${placeholders})`;
        const rows = await dbAll(sql, tower_names);
        
        const resultMap = {};
        for (const row of rows) {
            resultMap[row.tower_name] = row.tower_record_id;
        }
        
        // 对于在数据库中没有找到的名称，返回 null
        for (const name of tower_names) {
            if (!resultMap.hasOwnProperty(name)) {
                resultMap[name] = null;
            }
        }
        
        return resultMap;
    } catch (error) {
        logger.error('在 get_tower_ids_from_local_db 中发生严重错误:', { message: error.message, stack: error.stack });
        throw error;
    }
}

get_tower_ids_from_local_db.doc = '从本地数据库缓存中，根据一组杆塔的全名，高效地查询并返回它们对应的维格表 recordID。输入一个名称数组，返回一个名称到ID的映射对象。';

<<<<<<< HEAD
get_tower_ids_from_local_db.displayName = '杆塔ID本地查询';
module.exports = {
    name: 'local_db_search',
    func: get_tower_ids_from_local_db,
=======
module.exports = {
    get_tower_ids_from_local_db,
>>>>>>> 30fd47290ae29c499b6b7eb7e416a81c8299d309
};