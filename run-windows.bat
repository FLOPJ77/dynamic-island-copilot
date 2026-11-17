@echo off
setlocal enabledelayedexpansion

echo ========================================================
echo   Dynamic Island Copilot - Windows Dev Launcher
echo ========================================================
echo.

:: 1. Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not found in PATH!
    echo Please install Node.js (v18+) from https://nodejs.org
    pause
    exit /b 1
)

:: 2. Check Rust & Cargo
if exist "%USERPROFILE%\.cargo\bin" (
    set "PATH=%USERPROFILE%\.cargo\bin;!PATH!"
)

where cargo >nul 2>nul
if !errorlevel! neq 0 (
    echo [ERROR] Rust / Cargo is not found in PATH!
    echo Please install Rust via rustup from https://rustup.rs
    echo (Make sure to select 'C++ Build Tools' when prompted by Visual Studio Installer)
    pause
    exit /b 1
)

:: 3. Check npm dependencies
if not exist "node_modules\" (
    echo [INFO] Installing npm dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] npm install failed.
        pause
        exit /b 1
    )
)

echo.
echo [OK] Environment ready! Launching Dynamic Island in Dev mode...
echo [INFO] Window will attach to the top-center of your screen.
echo [INFO] Press Ctrl+C in this terminal window to stop the app.
echo.

taskkill /F /IM dynamic-island-copilot.exe >nul 2>&1
ping 127.0.0.1 -n 2 >nul

call npm run tauri dev

pause
