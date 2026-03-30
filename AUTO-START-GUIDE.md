# 完全自动方案 - 使用说明

## 架构

```
飞书表格 → 点击按钮 → 服务器 Webhook → WebSocket 服务器 → 本地代理 → 启动 Chrome
```

## 组件

| 组件 | 位置 | 功能 |
|------|------|------|
| `ws-server.js` | 服务器 (101.43.54.252) | WebSocket 服务器，接收 webhook 请求 |
| `local-agent.js` | 本地电脑 | 常驻程序，接收命令启动 Chrome |
| `webhook-forwarder.js` | 服务器 | 修改后支持自动启动 Chrome |

## 安装步骤

### 1. 服务器端（已配置）

```bash
# 启动 WebSocket 服务器
pm2 start ws-server.js --name ws-server

# 重启 webhook-forwarder
pm2 restart webhook-forwarder
```

### 2. 本地端（你的电脑）

#### 安装 Node.js
1. 下载：https://nodejs.org/ （LTS 版本）
2. 安装（一直下一步）

#### 安装依赖
```bash
# 在 auto-comment-assistant 目录
npm install ws
```

#### 启动本地代理
```bash
node local-agent.js
```

或者创建开机启动：

**Windows 开机启动：**
1. 创建 `start-agent.vbs`：
```vbs
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "node C:\path\to\auto-comment-assistant\local-agent.js", 0, False
Set WshShell = Nothing
```
2. 把 vbs 文件放到 `C:\Users\你的用户名\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup`

## 使用流程

### 首次使用（每个序号）

1. **确保本地代理在运行**（右下角应该有 node 进程）

2. **飞书表格填写**：
   - 序号：1
   - 产品名称：测试
   - 产品链接：任意链接
   - 评论话术：测试评论

3. **点击"去评论"按钮**

4. **系统自动执行**：
   - 服务器发现 Chrome 未连接
   - 通过 WebSocket 通知本地代理
   - 本地代理启动 Chrome
   - 等待 Chrome 就绪
   - 执行评论

5. **手动登录**（首次）
   - Chrome 启动后会打开抖音
   - 手动登录账号
   - 关闭 Chrome（登录态已保存）

### 后续使用

1. 飞书表格填写数据
2. 点击"去评论"按钮
3. **全自动执行**，无需手动操作

## 端口说明

| 服务 | 端口 | 说明 |
|------|------|------|
| WebSocket | 3003 | 本地代理连接 |
| HTTP API | 3004 | 查询状态、发送命令 |
| Webhook | 3001 | 接收飞书请求 |
| Chrome SSH | 62001-62050 | 连接本地 Chrome |

## 故障排查

### 本地代理无法连接服务器
- 检查服务器防火墙：`ufw allow 3003`
- 检查服务器安全组：放行 3003 端口

### Chrome 启动失败
- 检查 `start-chrome-by-index.bat` 路径是否正确
- 检查 Chrome 安装路径
- 手动运行脚本测试

### 评论执行失败
- 检查 SSH 隧道是否建立
- 检查 Chrome 是否已登录
- 查看服务器日志：`pm2 logs webhook-forwarder`

## 文件清单

```
auto-comment-assistant/
├── ws-server.js          # WebSocket 服务器（服务器运行）
├── local-agent.js        # 本地代理（你的电脑运行）
├── webhook-forwarder.js  # 已修改支持自动启动
├── start-chrome-by-index.bat  # 启动 Chrome 脚本
└── AUTO-START-GUIDE.md   # 本说明
```
