require('dotenv').config();
const axios = require('axios');
const config = require('../config');

async function test() {
  const url = 'https://api.henghhengmao.com/api/v1/video/parse';
  const testUrls = [
    'https://www.tiktok.com/@idrila/video/7626722882474888462',
    'https://www.youtube.com/watch?v=o8airYhZgYw',
  ];
  
  for (const videoUrl of testUrls) {
    try {
      const res = await axios.post(url, { url: videoUrl }, {
        headers: {
          Authorization: `Bearer ${config.henghhengmao.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      });
      console.log(`✅ ${videoUrl.slice(0, 50)}:`, res.data.code === 0 ? 'OK' : res.data.msg);
    } catch (e) {
      console.error(`❌ ${videoUrl.slice(0, 50)}:`, e.response?.status, e.message);
    }
  }
}

test();
