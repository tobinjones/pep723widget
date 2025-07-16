#!/usr/bin/env python3
"""
Debug script to test pep723widget server extension functionality.
Run this script to check if the extension is properly installed and working.
"""

import subprocess
import sys
import json

def check_extension_list():
    """Check if the extension is in the installed list"""
    print("🔍 Checking installed server extensions...")
    try:
        result = subprocess.run([sys.executable, "-m", "jupyter", "server", "extension", "list"], 
                              capture_output=True, text=True)
        print("STDOUT:", result.stdout)
        if result.stderr:
            print("STDERR:", result.stderr)
        
        if "pep723widget" in result.stdout:
            print("✅ pep723widget found in server extensions")
        else:
            print("❌ pep723widget NOT found in server extensions")
            
    except Exception as e:
        print(f"❌ Error checking extensions: {e}")

def check_uv_availability():
    """Check if uv is available"""
    print("\n🔍 Checking uv availability...")
    try:
        import uv
        uv_bin = uv.find_uv_bin()
        print(f"✅ uv found at: {uv_bin}")
        
        # Test uv version
        result = subprocess.run([uv_bin, "--version"], capture_output=True, text=True)
        print(f"✅ uv version: {result.stdout.strip()}")
        
    except ImportError:
        print("❌ uv module not available - try: pip install uv")
    except Exception as e:
        print(f"❌ Error with uv: {e}")

def check_dependencies():
    """Check if required dependencies are available"""
    print("\n🔍 Checking Python dependencies...")
    required = ["tornado", "jupyter_server", "uv"]
    
    for pkg in required:
        try:
            __import__(pkg)
            print(f"✅ {pkg} available")
        except ImportError:
            print(f"❌ {pkg} not available")

def test_handler_import():
    """Test if handlers can be imported"""
    print("\n🔍 Testing handler imports...")
    try:
        from pep723widget.handlers import GetTreeHandler, AddDependencyHandler, setup_handlers
        print("✅ All handlers imported successfully")
    except Exception as e:
        print(f"❌ Error importing handlers: {e}")

def test_basic_server_startup():
    """Test basic server startup"""
    print("\n🔍 Testing basic server functionality...")
    try:
        # This is a basic test - in production you'd want to start a test server
        from jupyter_server.serverapp import ServerApp
        print("✅ jupyter_server imports successfully")
        
        # Test extension loading function
        from pep723widget import _load_jupyter_server_extension
        print("✅ Extension loading function available")
        
    except Exception as e:
        print(f"❌ Error with server startup: {e}")

def main():
    print("🚀 PEP 723 Widget Debug Script")
    print("=" * 50)
    
    check_extension_list()
    check_dependencies()
    check_uv_availability() 
    test_handler_import()
    test_basic_server_startup()
    
    print("\n" + "=" * 50)
    print("🔧 If you're still getting 500 errors, check:")
    print("1. Jupyter server logs for detailed error messages")
    print("2. Make sure the extension is properly installed: pip install -e .")
    print("3. Restart JupyterLab completely after installation")
    print("4. Check that uv is available in the server environment")
    print("5. Look for the new debug messages in server logs")

if __name__ == "__main__":
    main()