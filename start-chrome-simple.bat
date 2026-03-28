@echo off

set PORT=62030
set "USER_DIR=C:\chrome-debug"

:: 检查端口
echo Checking port %PORT%...
netstat -an | find ":%PORT% " | find "LISTENING" > nul
if %errorlevel% equ 0 (
    echo Port %PORT% is in use, killing Chrome...
    taskkill /F /IM chrome.exe > nul 2>&1
    timeout /t 2 > nul
)

:: 创建目录
if not exist "%USER_DIR%" mkdir "%USER_DIR%"

:: 启动 Chrome（直接启动，不使用 start 命令）
echo Starting Chrome...
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=%PORT% --user-data-dir="%USER_DIR%"

:: Chrome 关闭后清理
echo.
echo Chrome closed, cleaning up...
rmdir /s /q "%USER_DIR%" > nul 2>&1
echo Done.
