@echo off
cd /d "%~dp0"
echo Starting Dynamic Island Copilot...

:: Close any lingering background instance so WebView2 does not lock
taskkill /F /IM dynamic-island-copilot.exe >nul 2>&1
ping 127.0.0.1 -n 2 >nul

if exist "%~dp0dynamic-island-copilot.exe" (
    start "" "%~dp0dynamic-island-copilot.exe"
    exit /b 0
)

if exist "src-tauri\target\release\dynamic-island-copilot.exe" (
    start "" "src-tauri\target\release\dynamic-island-copilot.exe"
    exit
)

if exist "src-tauri\target\debug\dynamic-island-copilot.exe" (
    start "" "src-tauri\target\debug\dynamic-island-copilot.exe"
    exit
)

echo [ERROR] Compiled app not found!
echo Please double-click 'build-windows.bat' first to build the executable.
echo.
pause
