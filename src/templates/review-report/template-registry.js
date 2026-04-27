const logger = require('../../utils/logger');

class TemplateRegistry {
  constructor() {
    this.templates = new Map();
    this.register('终末地', require('./zhongmodi-template'));
    this.register('星铁', require('./xingtie-template'));
  }

  register(name, template) {
    this.templates.set(name, template);
  }

  get(name) {
    const template = this.templates.get(name);
    if (!template) {
      logger.warn('Template not found, using default', { name });
      return this.templates.get('终末地');
    }
    return template;
  }

  list() {
    return Array.from(this.templates.keys());
  }
}

module.exports = new TemplateRegistry();
