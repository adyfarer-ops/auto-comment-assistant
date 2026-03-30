@echo off
set INDEX=%1
set LOCAL_PORT=%2
set SSH_PORT=%3
set USER_DATA_DIR=%4

:: 关闭该序号的 Chrome
taskkill /F /IM chrome.exe /FI "WINDOWTITLE eq Chrome*%USER_DATA_DIR%*" 2>nul

:: 等待
timeout /t 2 >nul

:: 启动 Chrome
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" ^
  --remote-debugging-port=%LOCAL_PORT% ^
  --user-data-dir="C:\chrome_profiles\%USER_DATA_DIR%" ^
  --window-name="%USER_DATA_DIR%"

:: 等待
timeout /t 3 >nul

:: 关闭该序号的 SSH
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :%SSH_PORT%') do taskkill /F /PID %%a 2>nul

:: 建立 SSH 隧道
start "" ssh -R %SSH_PORT%:localhost:%LOCAL_PORT% root@101.43.54.252 -N

echo Chrome %INDEX% started on local:%LOCAL_PORT% ssh:%SSH_PORT%
