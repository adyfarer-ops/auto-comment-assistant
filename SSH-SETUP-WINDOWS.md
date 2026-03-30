# Windows SSH 免密登录配置

## 1. 生成密钥（如果还没有）

```batch
ssh-keygen -t ed25519 -C "your_email@example.com"
```
一路回车，使用默认路径。

## 2. 手动复制公钥到服务器

**先查看公钥内容：**
```batch
type %USERPROFILE%\.ssh\id_ed25519.pub
```

**然后手动复制到服务器：**

方法 A - 使用 ssh 命令：
```batch
type %USERPROFILE%\.ssh\id_ed25519.pub | ssh root@101.43.54.252 "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys && chmod 700 ~/.ssh"
```

方法 B - 手动步骤：
1. 登录服务器：`ssh root@101.43.54.252`
2. 输入密码登录
3. 执行：
   ```bash
   mkdir -p ~/.ssh
   chmod 700 ~/.ssh
   ```
4. 把本地公钥内容粘贴到服务器的 `~/.ssh/authorized_keys` 文件
5. 执行：`chmod 600 ~/.ssh/authorized_keys`

## 3. 测试免密登录

```batch
ssh root@101.43.54.252
```
应该不需要密码直接登录。

## 4. 配置 SSH 客户端（可选）

创建/编辑 `%USERPROFILE%\.ssh\config` 文件，添加：
```
Host auto-comment
    HostName 101.43.54.252
    User root
    IdentityFile ~/.ssh/id_ed25519
    ServerAliveInterval 60
    ServerAliveCountMax 3
```

然后可以用 `ssh auto-comment` 快速连接。

## 5. 测试反向隧道

```batch
ssh -R 62002:localhost:9002 root@101.43.54.252 -N
```

保持这个窗口运行，然后在服务器测试：
```bash
curl http://localhost:62002/json/version
```

如果能看到 Chrome 的调试信息，说明隧道建立成功。
