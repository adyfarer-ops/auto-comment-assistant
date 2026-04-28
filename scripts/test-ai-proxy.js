require('dotenv').config();
const axios = require('axios');
const config = require('../config');
const { createProxyAgent } = require('../src/utils/proxy');

async function testWithProxy() {
  const agent = createProxyAgent();
  const url = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
  
  try {
    const res = await axios.post(url, {
      model: config.ai.deepseek.model,
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Say hello in one word.' },
      ],
    }, {
      headers: {
        Authorization: `Bearer ${config.ai.deepseek.apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
      httpsAgent: agent,
    });
    console.log('✅ With proxy:', res.data.choices?.[0]?.message?.content);
  } catch (e) {
    console.error('❌ With proxy:', e.response?.data?.error?.message || e.message);
  }
}

async function testWithoutProxy() {
  const url = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
  
  try {
    const res = await axios.post(url, {
      model: config.ai.deepseek.model,
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Say hello in one word.' },
      ],
    }, {
      headers: {
        Authorization: `Bearer ${config.ai.deepseek.apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    });
    console.log('✅ Without proxy:', res.data.choices?.[0]?.message?.content);
  } catch (e) {
    console.error('❌ Without proxy:', e.response?.data?.error?.message || e.message);
  }
}

async function main() {
  await testWithoutProxy();
  await testWithProxy();
}

main();
