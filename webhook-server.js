// Auto-Comment Assistant Webhook 服务
// 直接接收飞书按钮点击并执行浏览器自动化

const express = require('express');
const { handleCommentTask } = require('./comment-handler');

const app = express();
const PORT = 3002; // 使用不同端口避免冲突

// 中间件
app.use(express.json({ strict: false }));
app.use(express.urlencoded({ extended: true }));

// CORS
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  next();
});

// 健康检查
app.get('/', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'Auto-Comment Assistant Webhook',
    agent: 'auto-comment-assistant'
  });
});

// 评论接口
app.post('/comment', async (req, res) => {
  try {
    console.log('\n📥 收到评论请求');
    console.log('Body:', req.body);
    
    const data = req.body;
    
    // 立即返回响应，避免飞书超时
    res.json({
      code: 0,
      msg: 'success',
      data: { message: '任务已接收，正在处理...' }
    });
    
    // 异步执行任务
    handleCommentTask(data).then(result => {
      console.log('任务执行结果:', result);
    }).catch(err => {
      console.error('任务执行失败:', err);
    });
    
  } catch (error) {
    console.error('❌ 处理请求失败:', error.message);
    res.status(400).json({ code: -1, msg: error.message });
  }
});

// 启动服务器
app.listen(PORT, '0.0.0.0', () => {
  console.log('========================================');
  console.log('🤖 Auto-Comment Assistant Webhook 服务');
  console.log('========================================');
  console.log(`📡 监听地址: http://0.0.0.0:${PORT}`);
  console.log(`🌐 Webhook 地址: http://101.43.54.252:${PORT}/comment`);
  console.log('🎯 功能: 接收飞书按钮点击 → 执行浏览器自动化');
  console.log('========================================');
  console.log('\n⏳ 等待接收请求...\n');
});
