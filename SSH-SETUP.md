# SSH 免密登录配置

## 检查现有密钥

在本地 CMD 运行：
```batch
dir %USERPROFILE%\.ssh\
```

看是否有 `id_rsa` 或 `id_ed25519` 文件。

## 生成密钥（如果没有）

```batch
ssh-keygen -t ed25519 -C "your_email@example.com"
```

一路回车，使用默认路径。

## 复制公钥到服务器

```batch
ssh-copy-id root@101.43.54.252
```

或者手动复制：
```batch
type %USERPROFILE%\.ssh\id_ed25519.pub | ssh root@101.43.54.252 "cat >> ~/.ssh/authorized_keys"
```

## 测试免密登录

```batch
ssh root@101.43.54.252
```

应该不需要密码直接登录。

## 测试反向隧道

```batch
ssh -R 62002:localhost:9002 root@101.43.54.252 -N
```

保持这个窗口运行，然后在服务器测试：
```bash
curl http://localhost:62002/json/version
```

如果能看到 Chrome 的调试信息，说明隧道建立成功。
