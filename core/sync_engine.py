import os
from core.graph_memory import GraphMemory
from core.shadow_engine import generate_shadow_doc

graph = GraphMemory()

def run_helix_sync_sequence(payload: dict):
    """
    Biological Sync Flow: Detect -> Re-Map -> Re-Document.
    When a webhook push event occurs, we find affected files and trigger Shadow Docs.
    """
    commits = payload.get('commits', [])
    if not commits:
        print("No commits in payload.")
        return
        
    added_files = []
    modified_files = []
    
    for commit in commits:
        added_files.extend(commit.get('added', []))
        modified_files.extend(commit.get('modified', []))
        
    repo_name = payload.get('repository', {}).get('name', '')
    if not repo_name:
        repo_name = payload.get('repository', {}).get('full_name', '').split('/')[-1]
        
    local_repo_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "temp_repos", repo_name)
    
    all_changed_files = list(set(added_files + modified_files))
    print(f"🧬 Syncing {len(all_changed_files)} changed files for {repo_name}...")
    
    if os.path.exists(local_repo_path):
        # Only re-dissect if we already have the repo cloned
        try:
            from core.harvester import ingest_project
            # Step 1: Dissect & Update Neo4j Knowledge Graph
            print(f"Re-mapping nervous system for {repo_name}...")
            ingest_project(local_repo_path)
            
            # Step 2: Regenerate Shadow Docs for impacted nodes in changed files
            for file_path in all_changed_files:
                full_path = os.path.join(local_repo_path, file_path)
                with graph.driver.session() as session:
                    # Find functions/classes in this file
                    result = session.run("MATCH (n) WHERE n.file_path = $fp RETURN n.name as name", fp=full_path)
                    nodes = [r['name'] for r in result]
                    
                    # We limit to 3 nodes per file to avoid rate limits during demo
                    for node in nodes[:3]:
                        print(f"Writing Shadow Doc for {node}...")
                        generate_shadow_doc(node)
                        
            print("✅ Sync sequence complete. Organism stabilized.")
        except Exception as e:
            print(f"❌ Error during sync sequence: {e}")
    else:
        print(f"Repository {repo_name} not found locally. Skipping sync.")
