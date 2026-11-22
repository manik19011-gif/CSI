@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js was not found. Install Node.js 22 or newer from https://nodejs.org/
  echo Reopen this file after installation.
  pause
  exit /b 1
)
for /f "delims=. tokens=1" %%V in ('node -p "process.versions.node"') do set NODE_MAJOR=%%V
if %NODE_MAJOR% LSS 22 (
  echo Node.js 22 or newer is required. Current version:
  node -v
  pause
  exit /b 1
)
echo.
echo ====================================================
echo   CSI BENNETT WEBSITE - LOCAL SERVER
echo ====================================================
echo Open http://localhost:3000 in your browser.
echo Keep this window open while using the site.
echo Admin setup (optional): setup-admin-windows.bat
echo Press Ctrl+C here to stop.
echo.
node --experimental-sqlite server.js
echo.
echo The server stopped. Review any error shown above.
pause
