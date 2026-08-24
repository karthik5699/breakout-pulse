# -*- coding: utf-8 -*-
import os
import sys
import subprocess
import time
import webbrowser

def main():
    base_dir = os.path.abspath(os.path.dirname(__file__))
    frontend_dir = os.path.join(base_dir, "frontend")
    backend_dir = os.path.join(base_dir, "backend")

    print("""
============================================================
 BreakoutPulse - 52-Week High & ATH Momentum Screener
   NSE Equities | Small & Midcap Alpha | TradingView Charts
============================================================
    """)

    # Check if frontend is built
    dist_dir = os.path.join(frontend_dir, "dist")
    if not os.path.exists(dist_dir):
        print("[*] First run: Building modern frontend interface...")
        try:
            subprocess.run(["npm", "install"], cwd=frontend_dir, check=True)
            subprocess.run(["npm", "run", "build"], cwd=frontend_dir, check=True)
            print("[+] Frontend built successfully.")
        except Exception as e:
            print("[!] Note: Frontend build skipped (" + str(e) + "). Starting backend API server.")

    print("\n[+] Starting Screener Server on http://localhost:8000 ...")
    print("Press Ctrl+C to stop.\n")

    # Start uvicorn server
    try:
        import uvicorn
        uvicorn.run("backend.app.main:app", host="0.0.0.0", port=8000, reload=False)
    except KeyboardInterrupt:
        print("\nScreener server stopped.")

if __name__ == "__main__":
    main()
