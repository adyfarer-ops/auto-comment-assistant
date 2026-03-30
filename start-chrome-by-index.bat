@echo off
set INDEX=%1
set LOCAL_PORT=%2
set SSH_PORT=%3
set USER_DATA_DIR=%4

echo [BAT] ========================================
echo [BAT] Starting Chrome %INDEX%
echo [BAT] Local Port: %LOCAL_PORT%
echo [BAT] SSH Port: %SSH_PORT%
echo [BAT] User Data: %USER_DATA_DIR%
echo [BAT] ========================================

:: 关闭该序号的 Chrome
echo [BAT] Step 1: Killing existing Chrome...
taskkill /F /IM chrome.exe /FI "WINDOWTITLE eq Chrome*%USER_DATA_DIR%*" 2>nul
timeout /t 2 >nul

:: 确保用户数据目录存在
if not exist "C:\chrome_profiles\%USER_DATA_DIR%" (
  echo [BAT] Creating user data directory: C:\chrome_profiles\%USER_DATA_DIR%
  mkdir "C:\chrome_profiles\%USER_DATA_DIR%"
)

:: 关闭该序号的 SSH 隧道（本地和远程）
echo [BAT] Step 2: Killing existing SSH tunnel...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :%SSH_PORT%') do (
  echo [BAT] Killing local SSH PID %%a
  taskkill /F /PID %%a 2>nul
)
timeout /t 2 >nul

:: 通过 SSH 清理服务器端的端口占用
echo [BAT] Step 2b: Cleaning up server port %SSH_PORT%...
ssh -o ConnectTimeout=5 -o BatchMode=yes root@101.43.54.252 "lsof -ti:%SSH_PORT% | xargs -r kill -9 2>/dev/null; echo 'Server port cleaned'" 2>nul
timeout /t 2 >nul

:: 启动 Chrome
echo [BAT] Step 3: Starting Chrome...
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" ^
  --remote-debugging-port=%LOCAL_PORT% ^
  --user-data-dir="C:\chrome_profiles\%USER_DATA_DIR%" ^
  --window-name="%USER_DATA_DIR%" ^
  --no-first-run ^
  --no-default-browser-check

:: 等待 Chrome 启动
echo [BAT] Step 4: Waiting for Chrome to start...
timeout /t 5 >nul

:: 检查 Chrome 是否成功启动
echo [BAT] Step 5: Checking if Chrome is running on port %LOCAL_PORT%...
netstat -an | findstr ":%LOCAL_PORT%"
if errorlevel 1 (
  echo [BAT] ERROR: Chrome is not listening on port %LOCAL_PORT%
  exit /b 1
)
echo [BAT] Chrome is running on port %LOCAL_PORT%

:: 建立 SSH 隧道（使用 0.0.0.0 绑定，带自动重试）
echo [BAT] Step 6: Creating SSH tunnel...

:: 先测试 SSH 连接
echo [BAT] Testing SSH connection...
ssh -o ConnectTimeout=5 -o BatchMode=yes root@101.43.54.252 echo "SSH OK"
if errorlevel 1 (
  echo [BAT] ERROR: Cannot connect to server via SSH
  exit /b 1
)

:: 尝试建立隧道（最多3次）
set /a tunnel_attempts=0
:tunnel_retry
set /a tunnel_attempts+=1
echo [BAT] Establishing reverse tunnel (attempt %tunnel_attempts%/3)...

:: 先清理服务器端口
ssh -o ConnectTimeout=5 -o BatchMode=yes root@101.43.54.252 "lsof -ti:%SSH_PORT% 2>/dev/null | xargs -r kill -9 2>/dev/null; sleep 1; echo 'Port cleaned'" 2>nul

start "SSH Tunnel %INDEX%" ssh -R 0.0.0.0:%SSH_PORT%:127.0.0.1:%LOCAL_PORT% root@101.43.54.252 -N -o GatewayPorts=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -o BatchMode=yes

:: 等待隧道建立
echo [BAT] Waiting for tunnel to establish...
timeout /t 8 >nul

:: 检查隧道是否建立
echo [BAT] Checking if tunnel is established...
netstat -an | findstr ":%SSH_PORT%" >nul
if errorlevel 1 (
  echo [BAT] Tunnel not established on attempt %tunnel_attempts%
  if %tunnel_attempts% lss 3 (
    echo [BAT] Retrying after cleanup...
    :: 杀死之前的 SSH 进程
    taskkill /F /FI "WINDOWTITLE eq SSH Tunnel %INDEX%" 2>nul
    timeout /t 2 >nul
    goto tunnel_retry
  ) else (
    echo [BAT] ERROR: Failed to establish SSH tunnel after 3 attempts
    exit /b 1
  )
) else (
  echo [BAT] SSH tunnel successfully established on port %SSH_PORT%
)

echo [BAT] ========================================
echo [BAT] Chrome %INDEX% startup complete!
echo [BAT] Local: http://localhost:%LOCAL_PORT%
echo [BAT] Remote: http://101.43.54.252:%SSH_PORT%
echo [BAT] ========================================

:: 等待更长时间确保隧道稳定
timeout /t 3 >nul

:: 自动关闭 CMD 窗口
exit
