import os
import hashlib
import json

STATE_FILE = ".helix_state.json"

def get_file_hash(filepath: str) -> str:
    """Calculates the MD5 hash of a file's contents to detect changes."""
    hasher = hashlib.md5()
    try:
        with open(filepath, 'rb') as f:
            buf = f.read()
            hasher.update(buf)
        return hasher.hexdigest()
    except Exception:
        return ""

def load_state() -> dict:
    if os.path.exists(STATE_FILE):
        try:
            with open(STATE_FILE, 'r') as f:
                return json.load(f)
        except Exception:
            return {}
    return {}

def save_state(state: dict):
    with open(STATE_FILE, 'w') as f:
        json.dump(state, f, indent=4)

def crawl_repository(root_path: str, target_extension=".py"):
    """Crawls the repo and returns only files that are new or modified."""
    # Updated ignore_dirs based on feedback and common bloat
    ignore_dirs = {
        '.git', '__pycache__', 'node_modules', 'venv', '.venv', 
        '.env', 'temp_repos', 'data', 'models', 'brain'
    }
    state = load_state()
    updated_files = []

    for root, dirs, files in os.walk(root_path):
        # Skip brain/ artifacts directory and other bloat
        dirs[:] = [d for d in dirs if d not in ignore_dirs]
        
        for file in files:
            if file.endswith(target_extension):
                filepath = os.path.join(root, file)
                # Absolute path for consistency
                abs_path = os.path.abspath(filepath)
                current_hash = get_file_hash(abs_path)
                
                # Check if file is new OR if the hash has changed
                if abs_path not in state or state[abs_path] != current_hash:
                    updated_files.append((abs_path, current_hash))
                    
    return updated_files, state
