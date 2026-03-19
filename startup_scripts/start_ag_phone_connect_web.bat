@echo off
setlocal enabledelayedexpansion
title Antigravity Phone Connect - WEB MODE

:: Navigate to project root (one level up from startup_scripts/)
cd /d "%~dp0.."

echo ===================================================
echo   Antigravity Phone Connect - WEB ACCESS MODE
echo ===================================================
echo.

:: 0. Aggressive Cleanup (Clear any stuck processes from previous runs)
echo [0/2] Cleaning up orphans...
taskkill /f /im node.exe /fi "WINDOWTITLE eq AG_SERVER_PROC*" >nul 2>&1
taskkill /f /im cloudflared.exe >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING') do taskkill /f /pid %%a >nul 2>&1

:: 1. Ensure dependencies are installed
if not exist "node_modules" (
    echo [INFO] Installing Node.js dependencies...
    call npm install
)

:: 2. Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js missing.
    pause
    exit /b
)

:: 3. Check Python
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Python missing. Required for the web tunnel.
    pause
    exit /b
)

:: 4. Check cloudflared
where cloudflared >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] cloudflared missing. Install from: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
    pause
    exit /b
)

:: 5. Check for .env file
if exist ".env" goto ENV_FOUND
if exist "%~dp0.env" goto ENV_FOUND

echo [WARNING] .env file not found. This is required for Web Access.
echo.

if exist ".env.example" (
    echo [INFO] Creating .env from .env.example...
    copy .env.example .env >nul
    echo [SUCCESS] .env created from template!
    echo [ACTION] Please open .env and update it with your Cloudflare Tunnel ID and public URL.
    pause
    exit /b
) else (
    echo [ERROR] .env.example not found. Cannot create .env template.
    pause
    exit /b
)

:ENV_FOUND
echo [INFO] .env configuration found.

:: 6. Launch Antigravity
echo [INFO] Starting Antigravity with debug port 9000...
start "" antigravity --remote-debugging-port=9000
<nul set /p="[INFO] Waiting for editor to become ready..."
ping 127.0.0.1 -n 6 >nul
echo Done.

netstat -aon | findstr :9000 | findstr LISTENING >nul
if "%ERRORLEVEL%" neq "0" (
    echo.
    echo [ERROR] Antigravity failed to open debug port 9000.
    echo [ERROR] This happens when another instance of Antigravity is already running.
    echo [ERROR] Please close ALL Antigravity windows entirely, then run this script again.
    pause
    exit /b
)

:: 7. Launch everything via Python
echo [1/1] Launching Antigravity Phone Connect...
echo (This will start both the server and the Cloudflare tunnel)
python startup_scripts/launcher.py --mode web

:: 7. Auto-close when done
exit
