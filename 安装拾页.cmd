@echo off
setlocal
cd /d "%~dp0"

echo [1/3] Checking Node.js...
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found. Install Node.js 20.9 or newer:
  echo https://nodejs.org/
  goto :failed
)

node -e "const v=process.versions.node.split('.').map(Number);if(v[0]<20)process.exit(1);if(v[0]===20&&v[1]<9)process.exit(1)"
if errorlevel 1 goto :failed

echo [2/3] Installing locked dependencies...
call npm ci
if errorlevel 1 (
  echo [ERROR] Dependency installation failed. Check the network and retry.
  goto :failed
)

echo [3/3] Building Shiye...
call npm run build
if errorlevel 1 (
  echo [ERROR] Build failed. Keep the error text shown above.
  goto :failed
)

echo.
echo Installation complete. Run shiye.cmd ui or double-click the Shiye console launcher.
if /i "%~1"=="--no-pause" exit /b 0
pause
exit /b 0

:failed
echo.
echo Installation did not complete.
if /i "%~1"=="--no-pause" exit /b 1
pause
exit /b 1
