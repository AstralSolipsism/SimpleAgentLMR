const cron = require('node-cron');
const axios = require('axios');
const { globalConfig } = require('../config/globalConfig');
const logger = require('../utils/logger');

class Scheduler {
  start() {
    const autoSyncEnabled = globalConfig.get('vika.autoSyncEnabled');

    if (!autoSyncEnabled) {
      logger.info('Scheduler: Auto sync is disabled in the global configuration.');
      return;
    }

    const syncTime = globalConfig.get('vika.syncTime') || '03:00';
    const [hour, minute] = syncTime.split(':');
    const cronExpression = `${minute} ${hour} * * *`;

    cron.schedule(cronExpression, async () => {
      logger.info('Scheduler: Checking sync conditions...');

      const now = Date.now();
      const lastSyncTimestamp = globalConfig.get('vika.lastSyncTimestamp') || 0;
      const syncIntervalDays = globalConfig.get('vika.syncIntervalDays') || 1;
      const intervalMillis = syncIntervalDays * 24 * 60 * 60 * 1000;

      if (now - lastSyncTimestamp < intervalMillis) {
        logger.info(`Scheduler: Sync interval not reached. Skipping this run.`);
        return;
      }

      logger.info('Scheduler: Starting scheduled task...');
      const port = globalConfig.get('system.port');
      if (!port) {
        logger.error('Scheduler: Port not found in config. Task cannot run.');
        return;
      }

      const url = `http://localhost:${port}/api/sync/towers`;
      logger.info(`Scheduler: Triggering sync task at ${url}`);

      try {
        const response = await axios.post(url);
        logger.info(`Scheduler: Task completed successfully. Response status: ${response.status}`);
        
        // 更新时间戳
        globalConfig.set('vika.lastSyncTimestamp', now);
        logger.info(`Scheduler: Updated lastSyncTimestamp to ${now}`);

      } catch (error) {
        logger.error(`Scheduler: Task failed. Error: ${error.message}`);
      }
    });

    logger.info(`Scheduler: Service started and task scheduled for ${syncTime} daily.`);
  }
}

module.exports = new Scheduler();