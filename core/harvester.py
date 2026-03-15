import os
from git import Repo # pip install GitPython
import sys

# Add parent dir to path to import dissect
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dissect import dissect as ingest_project

def fetch_and_index_repo(repo_url):
    local_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "temp_repos", repo_url.split('/')[-1])
    
    # 1. Clone the repository
    if not os.path.exists(local_path):
        print(f"Cloning {repo_url}...")
        os.makedirs(os.path.dirname(local_path), exist_ok=True)
        Repo.clone_from(repo_url, local_path)
    else:
        print(f"Repo already exists at {local_path}, skipping clone.")
    
    # 2. Trigger the Day 4 Ingestion Pipeline
    print("Beginning system dissection...")
    ingest_project(local_path, repo_url=repo_url)
    
    return {"status": "Success", "path": local_path, "repo": repo_url.split('/')[-1]}
