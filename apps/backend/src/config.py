"""
Configuration management for BountyFlow
"""
import configparser
import os
from pathlib import Path

def get_config():
    """Load configuration file"""
    config = configparser.ConfigParser()

    # Get project root directory
    current_dir = Path(__file__).parent
    project_root = current_dir.parent.parent.parent
    config_file = project_root / "config.ini"

    if config_file.exists():
        config.read(config_file)
    else:
        # If configuration file doesn't exist, use default values
        config.add_section('server')
        config.set('server', 'backend_host', '0.0.0.0')
        config.set('server', 'backend_port', '8002')
        config.set('server', 'backend_url', 'http://localhost:8002')
        config.set('server', 'frontend_port', '3000')
        config.set('server', 'frontend_url', 'http://localhost:3000')
        config.set('server', 'database_url', 'sqlite:///./bountyflow.db')
        config.set('server', 'debug', 'true')
        config.set('server', 'reload', 'true')

    return config

def get_backend_config():
    """Get backend configuration"""
    config = get_config()
    return {
        'host': config.get('server', 'backend_host', fallback='0.0.0.0'),
        'port': int(config.get('server', 'backend_port', fallback=8002)),
        'url': config.get('server', 'backend_url', fallback='http://localhost:8002'),
        'debug': config.getboolean('server', 'debug', fallback=True),
        'reload': config.getboolean('server', 'reload', fallback=True)
    }

def get_frontend_config():
    """Get frontend configuration"""
    config = get_config()
    return {
        'port': int(config.get('server', 'frontend_port', fallback=3000)),
        'url': config.get('server', 'frontend_url', fallback='http://localhost:3000'),
        'backend_url': config.get('server', 'backend_url', fallback='http://localhost:8002')
    }
