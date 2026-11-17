@echo off
echo Closing Dynamic Island Copilot...
taskkill /F /IM dynamic-island-copilot.exe >nul 2>nul
if %errorlevel% equ 0 (
    echo [OK] Dynamic Island closed successfully.
) else (
    echo [INFO] Dynamic Island is not currently running.
)
timeout /t 2 >nul
