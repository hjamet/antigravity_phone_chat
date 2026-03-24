import sys
import subprocess
import time
import random
import string
import os
import socket
import argparse
import logging

# -----------------------------------------------------------------------------
# Dependency Management
# -----------------------------------------------------------------------------
def check_dependencies():
    """Checks and installs required Python packages."""
    needed = ["python-dotenv", "qrcode"]
    installed = []
    
    # Check what is missing
    for pkg in needed:
        try:
            if pkg == "python-dotenv": from dotenv import load_dotenv
            elif pkg == "qrcode": import qrcode
            installed.append(pkg)
        except ImportError:
            pass

    missing = [pkg for pkg in needed if pkg not in installed]
    
    if missing:
        print(f"📦 Installing missing dependencies: {', '.join(missing)}...")
        try:
            subprocess.check_call([sys.executable, "-m", "pip", "install"] + missing)
            print("✅ Dependencies installed.\n")
        except Exception as e:
            print(f"❌ Failed to install dependencies: {e}")
            sys.exit(1)

def check_node_environment():
    """Checks for Node.js and installs npm dependencies if needed."""
    # 1. Check if Node is installed
    try:
        subprocess.check_call(["node", "--version"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except (FileNotFoundError, subprocess.CalledProcessError):
        print("❌ Error: Node.js is not installed. Please install it from https://nodejs.org/")
        sys.exit(1)

    # 2. Check for node_modules
    if not os.path.exists("node_modules"):
        print("📦 'node_modules' missing. Installing Node.js dependencies...")
        try:
            # shell=True often needed on Windows for npm. On *nix, 'npm' usually works directly if in PATH.
            is_windows = sys.platform == "win32"
            subprocess.check_call(["npm", "install"], shell=is_windows)
            print("✅ Node dependencies installed.\n")
        except Exception as e:
            print(f"❌ Failed to run 'npm install': {e}")
            sys.exit(1)

# -----------------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------------
def get_local_ip():
    """Robustly determines the local LAN IP address."""
    s = None
    try:
        # Connect to a public DNS server (doesn't actually send data)
        # This forces the OS to determine the correct outgoing interface
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        IP = s.getsockname()[0]
    except Exception:
        IP = '127.0.0.1'
    finally:
        s.close()
    return IP

def generate_passcode():
    """Generates a 6-digit passcode."""
    return ''.join(random.choices(string.digits, k=6))

def print_qr(url):
    """Generates and prints a QR code to the terminal."""
    import qrcode
    qr = qrcode.QRCode(version=1, box_size=1, border=1)
    qr.add_data(url)
    qr.make(fit=True)
    # Using 'ANSI' implies standard block characters which work in most terminals
    # invert=True is often needed for dark terminals (white blocks on black bg)
    qr.print_ascii(invert=True)

def check_cloudflared():
    """Checks if cloudflared is installed and available in PATH."""
    try:
        subprocess.check_call(
            ["cloudflared", "--version"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )
        return True
    except (FileNotFoundError, subprocess.CalledProcessError):
        return False

def start_cloudflare_tunnel(tunnel_id, config_path=None, token=None):
    """Starts a Cloudflare named tunnel via subprocess.
    
    Args:
        tunnel_id: The Cloudflare tunnel UUID to run.
        config_path: Optional path to a custom cloudflared config file (provides ingress rules).
        token: Optional tunnel token for auth (avoids needing local credentials file).
    
    Returns:
        The subprocess.Popen process handle.
    """
    cmd = ["cloudflared", "tunnel"]
    if config_path:
        cmd.extend(["--config", config_path])
    cmd.append("run")
    if token:
        cmd.extend(["--token", token])
    else:
        cmd.append(tunnel_id)
    
    # Redirect cloudflared output to log file
    log_file = open("cloudflared_log.txt", "w")
    process = subprocess.Popen(
        cmd,
        stdout=log_file,
        stderr=subprocess.STDOUT
    )
    
    return process, log_file

# -----------------------------------------------------------------------------
# Main Execution
# -----------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(description="Antigravity Phone Connect Launcher")
    parser.add_argument('--mode', choices=['local', 'web'], default='web', help="Mode to run in: 'local' (WiFi) or 'web' (Internet)")
    args = parser.parse_args()

    # 1. Setup Environment
    check_dependencies()
    check_node_environment()
    
    from dotenv import load_dotenv
    
    # Load .env if it exists
    load_dotenv()
    
    # Setup App Password
    passcode = os.environ.get('APP_PASSWORD')
    if not passcode:
        passcode = generate_passcode()
        os.environ['APP_PASSWORD'] = passcode # Set for child process
        print(f"⚠️  No APP_PASSWORD in .env. Using temporary: {passcode}")

    # 2. Start Node.js Server (Common to both modes)
    print(f"🚀 Starting Antigravity Server ({args.mode.upper()} mode)...")
    
    # Clean up old logs
    with open("server_log.txt", "w") as f:
        f.write(f"--- Server Started at {time.ctime()} ---\n")

    node_cmd = ["node", "server.js"]
    node_process = None
    cloudflared_process = None
    cloudflared_log = None
    
    try:
        # Redirect stdout/stderr to file
        log_file = open("server_log.txt", "a")
        if sys.platform == "win32":
            # On Windows, using shell=True can help with path resolution but makes killing harder.
            # We'll use shell=False and rely on PATH.
            node_process = subprocess.Popen(node_cmd, stdout=log_file, stderr=log_file, env=os.environ.copy())
        else:
            node_process = subprocess.Popen(node_cmd, stdout=log_file, stderr=log_file, env=os.environ.copy())
            
        time.sleep(2) # Give it a moment to crash if it's going to
        if node_process.poll() is not None:
            print("❌ Server failed to start immediately. Check server_log.txt.")
            sys.exit(1)
            
    except Exception as e:
        print(f"❌ Failed to launch node: {e}")
        sys.exit(1)

    # 3. Mode Specific Logic
    final_url = ""
    
    try:
        if args.mode == 'local':
            ip = get_local_ip()
            port = os.environ.get('PORT', '3000')
            
            # Detect HTTPS
            protocol = "http"
            if os.path.exists('certs/server.key') and os.path.exists('certs/server.cert'):
                protocol = "https"
            
            final_url = f"{protocol}://{ip}:{port}"
            
            print("\n" + "="*50)
            print(f"📡 LOCAL WIFI ACCESS")
            print("="*50)
            print(f"🔗 URL: {final_url}")
            print(f"🔑 Passcode: Not required for local WiFi (Auto-detected)")
            
            print("\n📱 Scan this QR Code to connect:")
            print_qr(final_url)

            print("-" * 50)
            print("📝 Steps to Connect:")
            print("1. Ensure your phone is on the SAME Wi-Fi network as this computer.")
            print("2. Open your phone's Camera app or a QR scanner.")
            print("3. Scan the code above OR manually type the URL into your browser.")
            print("4. You should be connected automatically!")
            
        elif args.mode == 'web':
            # Check cloudflared is installed
            if not check_cloudflared():
                print("❌ Error: 'cloudflared' is not installed or not in PATH.")
                print("   Install it from: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/")
                sys.exit(1)
            
            # Read tunnel configuration from .env
            tunnel_id = os.environ.get('CLOUDFLARE_TUNNEL_ID')
            tunnel_token = os.environ.get('CLOUDFLARE_TUNNEL_TOKEN')
            public_url = os.environ.get('TUNNEL_PUBLIC_URL')
            
            if not tunnel_id and not tunnel_token:
                print("❌ Error: CLOUDFLARE_TUNNEL_ID or CLOUDFLARE_TUNNEL_TOKEN not set in .env")
                print("   Run 'cloudflared tunnel list' to find your tunnel ID.")
                print("   Run 'cloudflared tunnel token <name>' to get the token.")
                sys.exit(1)
            
            if not public_url:
                print("❌ Error: TUNNEL_PUBLIC_URL not set in .env")
                print("   Set this to your tunnel's public domain (e.g., https://your-domain.example.com)")
                sys.exit(1)
            
            # Use project-local config if available (provides ingress rules without touching global config)
            config_path = None
            if os.path.exists("cloudflared_config.yml"):
                config_path = os.path.abspath("cloudflared_config.yml")
            
            mode_info = []
            if config_path:
                mode_info.append(f"config: {os.path.basename(config_path)}")
            if tunnel_token:
                mode_info.append("token auth")
            mode_str = f" ({', '.join(mode_info)})" if mode_info else ""
            print(f"⏳ Starting Cloudflare Tunnel{mode_str}...")
            
            cloudflared_process, cloudflared_log = start_cloudflare_tunnel(
                tunnel_id, config_path=config_path, token=tunnel_token
            )
            
            # Give cloudflared time to establish connection
            time.sleep(3)
            
            if cloudflared_process.poll() is not None:
                print("❌ Cloudflare Tunnel failed to start. Check cloudflared_log.txt.")
                sys.exit(1)
            
            print("✅ Cloudflare Tunnel connected!")
            
            # Magic URL with password
            final_url = f"{public_url}?key={passcode}"
            
            print("\n" + "="*50)
            print(f"   🌍 GLOBAL WEB ACCESS")
            print("="*50)
            print(f"🔗 URL: {public_url}")
            print(f"🔑 Passcode: {passcode}")
            
            print("\n📱 Scan this Magic QR Code (Auto-Login):")
            print_qr(final_url)

            print("-" * 50)
            print("📝 Steps to Connect:")
            print("1. Switch your phone to Mobile Data or use any network.")
            print("2. Open your phone's Camera app or a QR scanner.")
            print("3. Scan the code above to auto-login.")
            print(f"4. Or visit {public_url}")
            print(f"5. Enter passcode: {passcode}")
            print("6. You should be connected automatically!")

        print("="*50)
        print("✅ Server is running in background. Logs -> server_log.txt")
        print("⌨️  Press Ctrl+C to stop.")
        
        # Keep alive loop
        last_log_pos = 0
        cdp_warning_shown = False
        
        while True:
            time.sleep(1)
            
            # Check process status
            if node_process.poll() is not None:
                print("\n❌ Server process died unexpectedly!")
                sys.exit(1)
            
            # Check cloudflared process if in web mode
            if args.mode == 'web' and cloudflared_process and cloudflared_process.poll() is not None:
                print("\n❌ Cloudflare Tunnel process died unexpectedly! Check cloudflared_log.txt.")
                sys.exit(1)
                
            # Monitor logs for errors
            try:
                if os.path.exists("server_log.txt"):
                    with open("server_log.txt", "r", encoding='utf-8', errors='ignore') as f:
                        f.seek(last_log_pos)
                        new_lines = f.read().splitlines()
                        last_log_pos = f.tell()
                        
                        for line in new_lines:
                            if "CDP not found" in line and not cdp_warning_shown:
                                print("\n" + "!"*50)
                                print("❌ ERROR: Antigravity Editor Not Detected!")
                                print("!"*50)
                                print("   The server cannot see your editor.")
                                print("   1. Close Antigravity.")
                                print("   2. Re-open it with the debug flag:")
                                print("      antigravity . --remote-debugging-port=9000")
                                print("   3. Or use the 'Open with Antigravity (Debug)' context menu.")
                                print("!"*50 + "\n")
                                cdp_warning_shown = True
            except Exception:
                pass

    except KeyboardInterrupt:
        print("\n\n👋 Shutting down...")
    except Exception as e:
        print(f"\n❌ Error: {e}")
    finally:
        # Cleanup
        try:
            if node_process:
                node_process.terminate()
                try:
                    node_process.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    node_process.kill()
            
            if cloudflared_process:
                cloudflared_process.terminate()
                try:
                    cloudflared_process.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    cloudflared_process.kill()
                print("✅ Cloudflare Tunnel stopped.")
        except:
            pass
        
        if 'log_file' in locals() and log_file:
            log_file.close()
        
        if cloudflared_log:
            cloudflared_log.close()
        
        sys.exit(0)

if __name__ == "__main__":
    main()
