#!/usr/bin/env python3
"""
Kill processes using specific ports
"""

import sys
import subprocess
import platform

def kill_port_windows(port):
    """Kill process on Windows"""
    try:
        # Find process using the port
        result = subprocess.run(
            f'netstat -ano | findstr :{port}',
            shell=True,
            capture_output=True,
            text=True
        )
        
        if not result.stdout.strip():
            print(f"❌ No process found using port {port}")
            return False
        
        # Extract PID
        pids = set()
        for line in result.stdout.strip().split('\n'):
            parts = line.split()
            if len(parts) >= 5:
                pid = parts[-1]
                if pid.isdigit():
                    pids.add(pid)
        
        if not pids:
            print(f"❌ Could not find PID for port {port}")
            return False
        
        # Kill processes
        killed = False
        for pid in pids:
            try:
                subprocess.run(f'taskkill /PID {pid} /F', shell=True, check=True)
                print(f"✅ Killed process {pid} using port {port}")
                killed = True
            except subprocess.CalledProcessError as e:
                print(f"⚠️  Failed to kill process {pid}: {e}")
        
        return killed
    
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

def kill_port_unix(port):
    """Kill process on Unix-like systems (Linux, macOS)"""
    try:
        # Find process using the port
        result = subprocess.run(
            f'lsof -ti:{port}',
            shell=True,
            capture_output=True,
            text=True
        )
        
        if not result.stdout.strip():
            print(f"❌ No process found using port {port}")
            return False
        
        # Extract PIDs
        pids = result.stdout.strip().split('\n')
        
        # Kill processes
        killed = False
        for pid in pids:
            if pid.strip():
                try:
                    subprocess.run(f'kill -9 {pid}', shell=True, check=True)
                    print(f"✅ Killed process {pid} using port {port}")
                    killed = True
                except subprocess.CalledProcessError as e:
                    print(f"⚠️  Failed to kill process {pid}: {e}")
        
        return killed
    
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

def main():
    if len(sys.argv) < 2:
        print("Usage: python kill-port.py <port> [port2] [port3] ...")
        print("Example: python kill-port.py 3000 8002")
        sys.exit(1)
    
    ports = sys.argv[1:]
    system = platform.system().lower()
    
    print(f"🔍 Killing processes on ports: {', '.join(ports)}")
    print(f"🖥️  System: {system}")
    print("=" * 50)
    
    success = False
    for port in ports:
        try:
            port_num = int(port)
            print(f"\n📡 Checking port {port_num}...")
            
            if system == 'windows':
                result = kill_port_windows(port_num)
            else:
                result = kill_port_unix(port_num)
            
            if result:
                success = True
        
        except ValueError:
            print(f"❌ Invalid port number: {port}")
    
    if success:
        print("\n✅ Port cleanup completed!")
    else:
        print("\n⚠️  No processes were killed. Ports may already be free.")

if __name__ == "__main__":
    main()

