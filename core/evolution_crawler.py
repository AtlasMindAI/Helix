import os
import git
from datetime import datetime
from neo4j import GraphDatabase
from dotenv import load_dotenv
from core.ast_parser import extract_entities_from_code

# Load environment variables
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

class EvolutionCrawler:
    def __init__(self, repo_path: str):
        self.repo_path = repo_path
        self.repo = git.Repo(repo_path)
        
        uri = os.getenv("NEO4J_URI", "bolt://localhost:7687")
        user = os.getenv("NEO4J_USER", "neo4j")
        password = os.getenv("NEO4J_PASSWORD", "password")
        self.driver = GraphDatabase.driver(uri, auth=(user, password))

    def close(self):
        self.driver.close()

    def map_evolution(self, branch="main", limit=50):
        print(f"🧬 Booting 4D Temporal Crawler on {branch}...")
        
        # Get the history of commits, from oldest to newest
        try:
            commits = list(self.repo.iter_commits(branch, max_count=limit))
        except Exception as e:
            print(f"❌ Error accessing branch {branch}: {e}")
            # Try to find current branch if main/master fails
            active_branch = self.repo.active_branch.name
            print(f"🕒 Retrying with active branch: {active_branch}")
            commits = list(self.repo.iter_commits(active_branch, max_count=limit))
            
        commits.reverse() 
        
        previous_commit_hash = None
        
        with self.driver.session() as session:
            for commit in commits:
                commit_hash = commit.hexsha
                timestamp = commit.committed_date
                dt_object = datetime.fromtimestamp(timestamp).isoformat()
                
                print(f"   -> Excavating Generation: {commit_hash[:7]} ({dt_object})")
                
                # 1. Create the Fossil Record (Commit Node)
                session.run(
                    """
                    MERGE (c:Commit {hash: $hash})
                    SET c.message = $msg, c.timestamp = $ts, c.date = $dt, c.type = 'Commit', c.name = $short_hash
                    """,
                    hash=commit_hash, msg=commit.message.strip(), ts=timestamp, dt=dt_object, short_hash=f"Commit:{commit_hash[:7]}"
                )
                
                # 2. Link the Timeline (Parent -> Child generation)
                if previous_commit_hash:
                    session.run(
                        """
                        MATCH (prev:Commit {hash: $prev_hash}), (curr:Commit {hash: $curr_hash})
                        MERGE (prev)-[:EVOLVED_INTO]->(curr)
                        """,
                        prev_hash=previous_commit_hash, curr_hash=commit_hash
                    )
                    
                # 3. Extract the DNA at this exact moment in time
                # We look at the files that were modified in this specific commit
                if commit.parents:
                    diffs = commit.parents[0].diff(commit)
                else:
                    # Initial commit handling
                    diffs = commit.diff(git.NULL_TREE)

                for diff in diffs:
                    # diff.b_path is the "after" path
                    target_path = diff.b_path or diff.a_path
                    if target_path and target_path.endswith('.py'):
                        # Retrieve the file's content AT THIS EXACT COMMIT
                        try:
                            file_blob = commit.tree / target_path
                            source_code = file_blob.data_stream.read().decode('utf-8', errors='ignore')
                            
                            # Use our Day 4 AST parser to find the entities (functions/classes)
                            entities = extract_entities_from_code(source_code)
                            filename = os.path.basename(target_path)
                            
                            # Link the mutated entities to the timeline
                            for ent in entities:
                                session.run(
                                    """
                                    MATCH (c:Commit {hash: $hash})
                                    MERGE (f:Entity {name: $name})
                                    ON CREATE SET f.type = $type, f.file_path = $file
                                    MERGE (f)-[:MUTATED_IN {change_type: $change}]->(c)
                                    """,
                                    hash=commit_hash, name=ent['name'], type=ent['type'], file=target_path, change=diff.change_type
                                )
                        except Exception as e:
                            # Skip if file was deleted or other issues
                            continue
                            
                previous_commit_hash = commit_hash
            
        print("✅ Temporal Mapping Complete. The organism has a memory.")

if __name__ == "__main__":
    crawler = EvolutionCrawler(".")
    try:
        crawler.map_evolution(limit=30)
    finally:
        crawler.close()
