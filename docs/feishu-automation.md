# 飞书自动化按钮配置

## 概述

系统支持通过飞书多维表格的"自动化"功能，将按钮点击事件发送到 Webhook，从而触发数据同步、周报生成、复盘报告生成等操作。

## Webhook 地址格式

假设服务部署在 `https://your-domain.com`，则 Webhook 地址为：

- **数据同步**: `POST https://your-domain.com/webhook/sync/{recordId}?token={WEBHOOK_SECRET}`
- **生成周报**: `POST https://your-domain.com/webhook/weekly/{recordId}?token={WEBHOOK_SECRET}`
- **生成复盘报告**: `POST https://your-domain.com/webhook/review/{recordId}?token={WEBHOOK_SECRET}`

其中：
- `{recordId}`: 项目管理表中的记录序号（如 1, 2, 3）
- `{WEBHOOK_SECRET}`: 环境变量中配置的 `WEBHOOK_SECRET`

## 飞书自动化配置步骤

### 1. 创建自动化流程

1. 打开飞书多维表格（项目管理表）
2. 点击右上角「自动化」按钮
3. 选择「创建自动化流程」
4. 触发条件选择「当记录满足条件时」或「按钮被点击时」

### 2. 配置触发条件

如果选择按钮触发：
- 在表格中添加一个「按钮」字段
- 设置按钮文本为「同步数据」/「生成周报」/「生成复盘」
- 在自动化流程中选择该按钮作为触发条件

### 3. 配置执行动作

添加执行动作「发送 HTTP 请求」：

- **请求方法**: POST
- **请求地址**: `https://your-domain.com/webhook/sync/{{record.序号}}?token=your-secret`
- **请求头**: `Content-Type: application/json`
- **请求体**: （可选，留空即可）

### 4. 保存并启用

保存自动化流程，并确保状态为「已启用」。

## 字段映射

在 HTTP 请求地址中，可以使用飞书自动化提供的变量：

| 变量 | 说明 |
|------|------|
| `{{record.序号}}` | 记录序号（用于标识项目） |
| `{{record.项目名称}}` | 项目名称 |
| `{{record.表格ID}}` | 项目规划总表 ID |

## 安全说明

- 务必配置 `WEBHOOK_SECRET`，防止未授权访问
- 建议使用 HTTPS 部署服务
- 不要将 Webhook 地址暴露给不可信的第三方

## 示例

### 同步数据按钮

```
POST https://api.example.com/webhook/sync/{{record.序号}}?token=mysecret123
```

### 生成周报按钮

```
POST https://api.example.com/webhook/weekly/{{record.序号}}?token=mysecret123
```

### 生成复盘报告按钮

```
POST https://api.example.com/webhook/review/{{record.序号}}?token=mysecret123
```
