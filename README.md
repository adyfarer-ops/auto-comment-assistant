# Feishu Project Agent

飞书项目规划助手 - 自动抓取 TikTok、YouTube、Instagram、X(Twitter) 等 11 个平台的数据，同步到飞书多维表格，并自动生成周报、复盘报告及 AI 运营建议。

## 技术栈

- Node.js + Express
- TikHub API + YouTube Data API v3
- 飞书多维表格（Bitable）+ Docx API
- Moonshot / DeepSeek AI

## 快速开始

```bash
# 安装依赖
npm install

# 配置环境变量
cp .env.example .env
# 编辑 .env 填入飞书凭证、API Key 等

# 开发模式
npm run dev

# 生产模式（PM2）
npm run pm2:start
```

## API 接口

### 项目
- `GET /api/projects` - 项目列表
- `GET /api/projects/:recordId` - 项目详情
- `GET /api/projects/:recordId/accounts` - 项目账号列表

### 同步
- `POST /api/sync/:recordId` - 触发项目数据同步

### 报告
- `POST /api/reports/weekly/:recordId` - 生成周报
- `POST /api/reports/review/:recordId` - 生成复盘报告

### AI
- `POST /api/ai/suggestions/:recordId` - 生成 AI 运营建议

### Webhook（飞书按钮触发）
- `POST /webhook/sync/:recordId`
- `POST /webhook/weekly/:recordId`
- `POST /webhook/review/:recordId`

## 项目结构

```
src/
  app.js                 # Express 入口
  routes/                # API 路由
  services/              # 业务服务
  middleware/            # 中间件
  utils/                 # 工具函数
config/                  # 配置文件
tests/                   # 测试文件
scripts/                 # 部署脚本
```

## 环境变量

| 变量 | 说明 |
|------|------|
| FEISHU_APP_ID | 飞书应用 ID（操作表格） |
| FEISHU_APP_SECRET | 飞书应用 Secret |
| TIKHUB_API_KEY | TikHub API Key |
| YOUTUBE_API_KEY | YouTube Data API Key |
| MOONSHOT_API_KEY | Moonshot API Key |
| HTTPS_PROXY | 代理地址 |
