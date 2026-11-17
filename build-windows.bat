@echo off
setlocal enabledelayedexpansion

echo ========================================================
echo   Dynamic Island Copilot - Production Release Build
echo ========================================================
echo.

:: Ensure no old instance is running and locking the binary
taskkill /F /IM dynamic-island-copilot.exe >nul 2>nul

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is required to build. Install from https://nodejs.org
    pause
    exit /b 1
)

:: Ensure Cargo/Rust is in PATH
if exist "%USERPROFILE%\.cargo\bin" (
    set "PATH=%USERPROFILE%\.cargo\bin;!PATH!"
)

where cargo >nul 2>nul
if !errorlevel! neq 0 (
    echo [ERROR] Cargo is required to build. Install from https://rustup.rs
    pause
    exit /b 1
)

if not exist "node_modules\" (
    echo [INFO] Installing npm packages...
    call npm install
)

echo [INFO] Compiling production release binaries...
call npx @tauri-apps/cli build

if !errorlevel! equ 0 (
    echo.
    echo ========================================================
    echo [SUCCESS] Production build complete!
    copy /y "src-tauri\target\release\dynamic-island-copilot.exe" "dynamic-island-copilot.exe" >nul 2>nul
    echo Binary executable location:
    echo   src-tauri\target\release\dynamic-island-copilot.exe
    echo Installer bundle location:
    echo   src-tauri\target\release\bundle\
    echo ========================================================
) else (
    echo.
    echo [ERROR] Build failed. Check the compiler logs above.
)

pause
