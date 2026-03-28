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

:: 删除旧的用户数据目录（清除所有缓存和登录信息）
echo Cleaning old data...
if exist "%USER_DIR%" (
    rmdir /s /q "%USER_DIR%"
)
mkdir "%USER_DIR%"

:: 启动 Chrome（带清除缓存参数）
echo Starting Chrome with clean cache...
"C:\Program Files\Google\Chrome\Application\chrome.exe" ^
    --remote-debugging-port=%PORT% ^
    --user-data-dir="%USER_DIR%" ^
    --disable-cache ^
    --disable-application-cache ^
    --disable-offline-load-stale-cache ^
    --disk-cache-size=0 ^
    --media-cache-size=0 ^
    --aggressive-cache-discard ^
    --clear-data-reduction-proxy-data ^
    --no-first-run ^
    --disable-default-apps ^
    --disable-extensions ^
    --disable-sync ^
    --disable-web-security ^
    --disable-features=IsolateOrigins,site-per-process

:: Chrome 关闭后清理
echo.
echo Chrome closed, cleaning up...
rmdir /s /q "%USER_DIR%" > nul 2>&1
echo Done.
