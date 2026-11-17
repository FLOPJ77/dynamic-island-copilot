@echo off
setlocal enabledelayedexpansion

echo ========================================================
echo   Dynamic Island Copilot - Clean and Rebuild
echo ========================================================
echo.

:: Ensure Cargo/Rust is in PATH
if exist "%USERPROFILE%\.cargo\bin" (
    set "PATH=%USERPROFILE%\.cargo\bin;!PATH!"
)

:: Check Cargo
where cargo >nul 2>nul
if !errorlevel! neq 0 (
    echo [ERROR] Cargo is required to build. Install from https://rustup.rs
    pause
    exit /b 1
)

:: 1. Terminate running instances
echo [1/4] Closing running app instance...
taskkill /F /IM dynamic-island-copilot.exe >nul 2>nul

:: 2. Check and install npm dependencies if missing
if not exist "node_modules\" (
    echo [2/4] Installing missing npm packages...
    call npm install
) else (
    echo [2/4] Dependencies verified.
)

:: 3. Clean old dist and release binary
echo [3/4] Cleaning old build files...
if exist "dist\" rmdir /s /q "dist"
if exist "src-tauri\target\release\dynamic-island-copilot.exe" (
    del /f /q "src-tauri\target\release\dynamic-island-copilot.exe" >nul 2>nul
)

:: 4. Rebuild with latest code
echo [4/4] Compiling fresh build with latest updates...
call npx @tauri-apps/cli build --no-bundle

if !errorlevel! equ 0 (
    echo.
    echo ========================================================
    echo [SUCCESS] Rebuild complete!
    copy /y "src-tauri\target\release\dynamic-island-copilot.exe" "dynamic-island-copilot.exe" >nul 2>nul
    echo Launching updated Dynamic Island...
    start "" "src-tauri\target\release\dynamic-island-copilot.exe"
    echo ========================================================
) else (
    echo.
    echo [ERROR] Build failed. Check the compiler logs above.
    pause
)
