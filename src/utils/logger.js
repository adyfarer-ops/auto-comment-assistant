const config = require('../../config');

function log(level, message, meta = {}) {
  const timestamp = new Date().toISOString();
  const entry = { timestamp, level, message, ...meta };

  if (config.nodeEnv === 'production') {
    console.log(JSON.stringify(entry));
  } else {
    console.log(`[${timestamp}] ${level.toUpperCase()}: ${message}`, Object.keys(meta).length ? meta : '');
  }
}

module.exports = {
  info: (msg, meta) => log('info', msg, meta),
  warn: (msg, meta) => log('warn', msg, meta),
  error: (msg, meta) => log('error', msg, meta),
  debug: (msg, meta) => log('debug', msg, meta),
};
