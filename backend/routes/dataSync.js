const express = require('express');
const router = express.Router();
const vikaService = require('../services/vikaService');
const { db } = require('../database/init');
const { globalConfig } = require('../config/globalConfig');
const logger = require('../utils/logger');

/**
 * @swagger
 * /api/sync/towers:
 *   post:
 *     summary: Sync tower data from Vika to local cache
 *     description: Fetches all tower records from a specified Vika datasheet, respecting rate limits, and caches them in the local database.
 *     responses:
 *       200:
 *         description: Data synced successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "杆塔数据同步成功，共处理 N 条记录。"
 *       500:
 *         description: Failed to sync data.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "数据同步失败"
 *                 error:
 *                   type: string
 */
router.post('/sync/towers', async (req, res) => {
    const datasheetId = 'dstPBwSGn03MHQSUaz';
    logger.info(`POST /api/v1/sync/towers - 收到请求，datasheet: ${datasheetId}`);
    try {
        const result = await vikaService.getRecords(datasheetId, { fields: ['杆塔全名'] });

        if (!result.success || !result.data || !Array.isArray(result.data.records)) {
            logger.error('从维格表服务获取的数据格式不正确或操作失败。', { result });
            return res.status(500).json({ success: false, message: '获取上游数据失败' });
        }

        const allRecords = result.data.records;

        // 3. 清空并批量插入数据
        try {
            db.run('BEGIN TRANSACTION');
            
            // a. 清空本地缓存
            db.prepare('DELETE FROM vika_tower_cache').run();

            // b. 批量插入数据
            const stmt = db.prepare('INSERT INTO vika_tower_cache (tower_name, tower_record_id) VALUES (?, ?)');
            const insertedTowerNames = new Set();
            for (const record of allRecords) {
                const towerName = record.fields['杆塔全名'];
                if (towerName && !insertedTowerNames.has(towerName)) {
                    stmt.run(towerName, record.recordId);
                    insertedTowerNames.add(towerName);
                }
            }
            stmt.finalize();
            db.run('COMMIT');
        } catch (err) {
            db.run('ROLLBACK');
            throw err; // 将错误继续向上抛出，以便被外层的 try-catch 捕获
        }

        logger.info(`POST /api/v1/sync/towers - 操作成功，从维格表获取了 ${allRecords.length} 条记录，实际插入 ${insertedTowerNames.size} 条唯一记录。`);
        res.status(200).json({
            success: true,
            message: `杆塔数据同步成功，共处理 ${insertedTowerNames.size} 条唯一记录。`
        });

    } catch (error) {
        logger.error('同步杆塔数据时出错', { error: error.message, stack: error.stack });
        res.status(500).json({
            success: false,
            message: '数据同步失败',
            error: error.message
        });
    }
});

module.exports = router;