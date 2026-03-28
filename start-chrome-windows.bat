@echo off
chcp 65001 >nul
REM Windows Chrome 启动脚本 - 使用临时用户数据目录，每次启动都是全新的未登录状态

REM 生成临时用户数据目录
set "TEMP_DIR=%TEMP%\chrome-profile-%RANDOM%"
echo 临时用户目录: %TEMP_DIR%

REM 启动 Chrome 并启用远程调试
start "Chrome Clean Profile" "C:\Program Files\Google\Chrome\Application\chrome.exe" ^
  --remote-debugging-port=62030 ^
  --user-data-dir="%TEMP_DIR%" ^
  --no-first-run ^
  --no-default-browser-check ^
  --disable-default-apps ^
  --disable-extensions ^
  --disable-sync ^
  --disable-web-security ^
  --disable-features=IsolateOrigins,site-per-process ^
  --allow-running-insecure-content ^
  "about:blank"

echo.
echo Chrome 已启动，可以开始执行评论任务了
echo.
echo 注意：关闭 Chrome 后，请手动删除临时目录: %TEMP_DIR%
pause
