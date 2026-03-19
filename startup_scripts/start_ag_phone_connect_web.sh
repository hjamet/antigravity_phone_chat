#!/bin/bash

# Navigate to project root (one level up from startup_scripts/)
cd "$(dirname "$0")/.."

echo "==================================================="
echo "  Antigravity Phone Connect - WEB ACCESS MODE"
echo "==================================================="
echo

# 0. Aggressive Cleanup
echo "[0/2] Cleaning up orphans..."
pkill -f "node server.js" &> /dev/null
pkill -f "cloudflared" &> /dev/null
# Cleanup by port (Linux/Mac)
if command -v lsof &> /dev/null; then
    lsof -ti:3000 | xargs kill -9 &> /dev/null
fi

# 1. Ensure dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "[INFO] Installing Node.js dependencies..."
    npm install
fi

# 2. Check Node.js
if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js is not installed."
    exit 1
fi

# 3. Check Python
if ! command -v python3 &> /dev/null; then
    echo "[ERROR] Python 3 is not installed."
    exit 1
fi

# 4. Check cloudflared
if ! command -v cloudflared &> /dev/null; then
    echo "[ERROR] cloudflared is not installed."
    echo "   Install from: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
    exit 1
fi

# 5. Check for .env file
if [ ! -f ".env" ]; then
    echo "[WARNING] .env file not found. This is required for Web Access."
    echo
    if [ -f ".env.example" ]; then
        echo "[INFO] Creating .env from .env.example..."
        cp .env.example .env
        echo "[SUCCESS] .env created from template!"
        echo "[ACTION] Please open .env and update it with your Cloudflare Tunnel ID and public URL."
        exit 0
    else
        echo "[ERROR] .env.example not found. Cannot create .env template."
        exit 1
    fi
fi
echo "[INFO] .env configuration found."

# 6. Launch Antigravity
echo "[INFO] Starting Antigravity with debug port 9000..."
antigravity --remote-debugging-port=9000 &
echo -n "[INFO] Waiting for editor to become ready..."
sleep 5
echo " Done."

if ! lsof -i:9000 > /dev/null; then
    echo
    echo "[ERROR] Antigravity failed to open debug port 9000."
    echo "[ERROR] This happens when another instance of Antigravity is already running."
    echo "[ERROR] Please close ALL Antigravity windows entirely, then run this script again."
    exit 1
fi

# 7. Launch everything via Python
echo "[1/1] Launching Antigravity Phone Connect..."
echo "(This will start both the server and the Cloudflare tunnel)"
python3 startup_scripts/launcher.py --mode web

# 7. Auto-close when done
exit 0
