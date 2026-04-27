const cron = require('node-cron');
const logger = require('./logger');

class Scheduler {
  constructor() {
    this.tasks = [];
  }

  start(name, schedule, handler) {
    if (!cron.validate(schedule)) {
      logger.error('Invalid cron schedule', { name, schedule });
      return;
    }

    const task = cron.schedule(schedule, async () => {
      logger.info(`Cron task started: ${name}`);
      try {
        await handler();
        logger.info(`Cron task completed: ${name}`);
      } catch (error) {
        logger.error(`Cron task failed: ${name}`, { error: error.message });
      }
    }, {
      scheduled: true,
      timezone: 'Asia/Shanghai',
    });

    this.tasks.push({ name, task });
    logger.info(`Scheduled task registered`, { name, schedule });
  }

  stopAll() {
    this.tasks.forEach(({ name, task }) => {
      task.stop();
      logger.info(`Scheduled task stopped`, { name });
    });
    this.tasks = [];
  }
}

module.exports = new Scheduler();
