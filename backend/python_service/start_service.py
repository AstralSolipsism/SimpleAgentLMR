#!/usr/bin/env python3
"""
维格表Python微服务启动脚本
用于启动FastAPI服务
"""

import os
import sys
import subprocess
import signal
import time
from pathlib import Path

def check_dependencies():
    """检查依赖是否已安装"""
    try:
        import fastapi
        import uvicorn
        import astral_vika
        print("成功: 所有依赖已安装")
        return True
    except ImportError as e:
        print(f"错误: 缺少依赖: {e}")
        print("请运行: pip install -r requirements.txt")
        return False

def install_dependencies():
    """安装依赖"""
    print("正在安装依赖...")
    try:
        subprocess.check_call([
            sys.executable, '-m', 'pip', 'install', 
            '-r', 'requirements.txt'
        ])
        print("成功: 依赖安装完成")
        return True
    except subprocess.CalledProcessError as e:
        print(f"错误: 依赖安装失败: {e}")
        return False

def start_service(host="127.0.0.1", port=5001, reload=False):
    """启动服务"""
    print(f"正在启动维格表API服务...")
    print(f"地址: http://{host}:{port}")
    print(f"文档: http://{host}:{port}/docs")
    print("按 Ctrl+C 停止服务")
    
    try:
        import uvicorn
        uvicorn.run(
            "vika_api_server:app",
            host=host,
            port=port,
            reload=reload,
            log_level="info"
        )
    except KeyboardInterrupt:
        print("\n服务已停止")
    except Exception as e:
        print(f"启动服务失败: {e}")
        sys.exit(1)

def main():
    """主函数"""
    import argparse
    
    parser = argparse.ArgumentParser(description="维格表API微服务")
    parser.add_argument("--host", default="127.0.0.1", help="监听地址")
    parser.add_argument("--port", type=int, default=5001, help="监听端口")
    parser.add_argument("--reload", action="store_true", help="开发模式，自动重载")
    parser.add_argument("--install-deps", action="store_true", help="安装依赖")
    
    args = parser.parse_args()
    
    # 切换到脚本目录
    script_dir = Path(__file__).parent
    os.chdir(script_dir)
    
    if args.install_deps:
        if not install_dependencies():
            sys.exit(1)
    
    if not check_dependencies():
        print("尝试自动安装依赖...")
        if not install_dependencies():
            sys.exit(1)
    
    start_service(args.host, args.port, args.reload)

if __name__ == "__main__":
    main()