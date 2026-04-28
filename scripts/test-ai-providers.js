require('dotenv').config();
const axios = require('axios');
const config = require('../config');

async function testProvider(name, url, apiKey, model) {
  try {
    const res = await axios.post(url, {
      model,
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Say hello in one word.' },
      ],
    }, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    });
    console.log(`✅ ${name} (${model}):`, res.data.choices?.[0]?.message?.content);
    return true;
  } catch (e) {
    console.error(`❌ ${name} (${model}):`, e.response?.data?.error?.message || e.message);
    return false;
  }
}

async function main() {
  const baseUrl = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
  
  // Test configured providers
  if (config.ai.doubao.apiKey) {
    await testProvider('doubao-configured', baseUrl, config.ai.doubao.apiKey, config.ai.doubao.model);
  }
  if (config.ai.deepseek.apiKey) {
    await testProvider('deepseek-configured', baseUrl, config.ai.deepseek.apiKey, config.ai.deepseek.model);
  }
  if (config.ai.moonshot.apiKey) {
    await testProvider('moonshot', config.ai.moonshot.baseUrl + '/chat/completions', config.ai.moonshot.apiKey, 'moonshot-v1-8k');
  }
  
  // Test alternative doubao models
  const altModels = [
    'doubao-1.5-pro-32k-250115',
    'doubao-pro-256k-241115',
    'doubao-lite-4k-240515',
    'doubao-1.5-lite-32k-250115',
  ];
  
  for (const model of altModels) {
    await testProvider('doubao-alt', baseUrl, config.ai.doubao.apiKey, model);
  }
}

main();
