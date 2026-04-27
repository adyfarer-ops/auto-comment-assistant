const logger = require('../utils/logger');

class SyncQueue {
  constructor() {
    this.queue = [];
    this.running = false;
  }

  enqueue(key, taskFn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ key, taskFn, resolve, reject });
      this._process();
    });
  }

  _process() {
    if (this.running || this.queue.length === 0) {
      return;
    }

    const { key, taskFn, resolve, reject } = this.queue.shift();
    this.running = true;

    logger.info('Sync queue processing', { key, queued: this.queue.length });

    Promise.resolve()
      .then(() => taskFn())
      .then(resolve)
      .catch(reject)
      .finally(() => {
        this.running = false;
        setImmediate(() => this._process());
      });
  }
}

module.exports = new SyncQueue();
