class TaskStatusService {
  constructor() {
    this.tasks = new Map(); // traceId -> { status, message, result, error, createdAt }
  }

  create(traceId, meta = {}) {
    this.tasks.set(traceId, { status: '进行中', message: 'Task started', ...meta, createdAt: Date.now() });
  }

  update(traceId, updates) {
    const task = this.tasks.get(traceId);
    if (task) {
      Object.assign(task, updates, { updatedAt: Date.now() });
    }
  }

  get(traceId) {
    return this.tasks.get(traceId) || null;
  }

  list(limit = 50) {
    return Array.from(this.tasks.entries())
      .sort((a, b) => b[1].createdAt - a[1].createdAt)
      .slice(0, limit)
      .map(([traceId, task]) => ({ traceId, ...task }));
  }

  // 自动清理 24 小时前的任务
  cleanup() {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    for (const [traceId, task] of this.tasks) {
      if (task.createdAt < cutoff) {
        this.tasks.delete(traceId);
      }
    }
  }
}

module.exports = new TaskStatusService();

setInterval(() => module.exports.cleanup(), 10 * 60 * 1000);
