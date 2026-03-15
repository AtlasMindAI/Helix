import os
import subprocess
from typing import List, Dict, Any
from datetime import datetime

class TemporalEngine:
    """
    SOTA: Temporal Morphogenesis (Time-Travel)
    Research: "Software Evolution as a Biological Process"
    Validation: Reconstructs the evolutionary timeline of the organism 
    using Git history, enabling retrospective analysis and delta-tracking.
    """
    def __init__(self, workspace_root: str):
        self.workspace_root = workspace_root
        print(f"🧬 TemporalEngine initialized at: {self.workspace_root}")

    def get_evolution_timeline(self, limit: int = 100) -> List[Dict[str, Any]]:
        """
        Parses git history into a serialized evolutionary timeline.
        """
        try:
            print(f"🕒 Temporal: Extracting timeline from {self.workspace_root}...")
            # Using a safer delimiter and avoiding shell=True issues with pipe chars
            cmd = ["git", "log", "--pretty=format:%H||%at||%an||%s", "-n", str(limit)]
            result = subprocess.run(
                cmd, 
                cwd=self.workspace_root, 
                capture_output=True, 
                text=True
            )
            
            if result.returncode != 0:
                print(f"❌ Git log failed: {result.stderr}")
                return []

            print(f"🕒 Temporal: Raw output length: {len(result.stdout)}")
            commits = []
            for line in result.stdout.strip().split("\n"):
                if not line: continue
                parts = line.split("||")
                if len(parts) < 4: continue
                
                commits.append({
                    "hash": parts[0],
                    "timestamp": int(parts[1]),
                    "author": parts[2],
                    "message": parts[3]
                })
            
            print(f"✅ Extracted {len(commits)} commits.")
            return commits
        except Exception as e:
            print(f"❌ Temporal Error: {e}")
            return []

    def reconstruct_state_at(self, commit_hash: str) -> Dict[str, Any]:
        """
        Retrieves the structural state of the organism at a specific point in time.
        Note: This is a heavy operation. For now, it returns the changed files in that commit.
        """
        try:
            cmd = ["git", "show", "--name-only", "--pretty=format:", commit_hash]
            result = subprocess.run(
                " ".join(cmd), 
                shell=True, 
                cwd=self.workspace_root, 
                capture_output=True, 
                text=True
            )
            
            files = [f for f in result.stdout.strip().split("\n") if f]
            return {
                "hash": commit_hash,
                "affected_files": files
            }
        except Exception as e:
            return {"error": str(e)}

    def get_entity_history(self, file_path: str) -> List[Dict[str, Any]]:
        """
        Returns the mutation history for a specific DNA sequence (file).
        """
        try:
            rel_path = os.path.relpath(file_path, self.workspace_root)
            cmd = ["git", "log", "--pretty=format:%H|%at|%s", "--", rel_path]
            result = subprocess.run(
                " ".join(cmd), 
                shell=True, 
                cwd=self.workspace_root, 
                capture_output=True, 
                text=True
            )
            
            history = []
            for line in result.stdout.strip().split("\n"):
                if not line: continue
                parts = line.split("|", 2)
                if len(parts) < 3: continue
                history.append({
                    "hash": parts[0],
                    "timestamp": int(parts[1]),
                    "message": parts[2]
                })
            return history
        except Exception as e:
            return []

    def sync_to_neo4j(self, graph_driver) -> Dict[str, Any]:
        """
        Pushes extracted git history into Neo4j for graph visualization.
        """
        commits = self.get_evolution_timeline(limit=500)
        sync_count = 0
        
        with graph_driver.session() as session:
            # Create Commit nodes and relationships
            for i, commit in enumerate(commits):
                session.run("""
                    MERGE (c:Commit {hash: $hash})
                    SET c.name = $hash,
                        c.timestamp = $timestamp,
                        c.author = $author,
                        c.message = $message
                """, hash=commit["hash"], timestamp=commit["timestamp"], author=commit["author"], message=commit["message"])
                
                # Link to previous commit (evolutionary chain)
                if i < len(commits) - 1:
                    session.run("""
                        MATCH (c:Commit {hash: $current}), (p:Commit {hash: $prev})
                        MERGE (p)-[:EVOLVED_INTO]->(c)
                    """, current=commit["hash"], prev=commits[i+1]["hash"])
                
                sync_count += 1
                
        return {"status": "success", "commits_synced": sync_count}
