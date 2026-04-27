const { HttpsProxyAgent } = require('https-proxy-agent');
const config = require('../../config');

function createProxyAgent() {
  if (config.proxy.httpsProxy) {
    return new HttpsProxyAgent(config.proxy.httpsProxy);
  }
  return undefined;
}

module.exports = { createProxyAgent };
