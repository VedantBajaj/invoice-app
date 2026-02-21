@echo off
REM Invoice System - Start Server (Windows)
cd /d "%~dp0"
echo Starting Invoice System on http://0.0.0.0:8090
echo Admin UI: http://localhost:8090/_/
echo Press Ctrl+C to stop
pocketbase.exe serve --http=0.0.0.0:8090
pause
