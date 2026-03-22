@echo off
setlocal enabledelayedexpansion
title Antigravity Phone Connect

:: Navigate to project root (one level up from startup_scripts/)
cd /d "%~dp0.."

:: Check for .env file
if not exist ".env" (
    if exist ".env.example" (
        echo [INFO] .env file not found. Creating from .env.example...
        copy .env.example .env >nul
        echo [SUCCESS] .env created from template!
        echo [ACTION] Please update .env if you wish to change defaults.
        echo.
    )
)

echo ===================================================
echo   Antigravity Phone Connect Launcher
echo ===================================================
echo.

echo [STARTING] Launching Antigravity with debug port 9000...
start "" antigravity --remote-debugging-port=9000 2>nul
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

echo [STARTING] Launching via Unified Launcher...
start "" python startup_scripts/launcher.py --mode local

:: 7. Auto-close when done
exit

