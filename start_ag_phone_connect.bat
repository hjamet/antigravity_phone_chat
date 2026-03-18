@echo off
setlocal enabledelayedexpansion
title Antigravity Phone Connect

:: Navigate to the script's directory
cd /d "%~dp0"

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
start "" antigravity --remote-debugging-port=9000
echo ^| set /p="[INFO] Waiting for editor to become ready..."
timeout /t 5 >nul
echo Done.

netstat -aon ^| findstr :9000 ^| findstr LISTENING >nul
if "%ERRORLEVEL%" neq "0" (
    echo.
    echo [ERROR] Antigravity failed to open debug port 9000.
    echo [ERROR] This happens when another instance of Antigravity is already running.
    echo [ERROR] Please close ALL Antigravity windows entirely, then run this script again.
    pause
    exit /b
)

echo [STARTING] Launching via Unified Launcher...
python launcher.py --mode local

:: Keep window open if server crashes
echo.
echo [INFO] Server stopped. Press any key to exit.
pause >nul

