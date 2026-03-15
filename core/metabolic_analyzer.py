import os
import networkx as nx
import community as community_louvain
from neo4j import GraphDatabase
from dotenv import load_dotenv

# Load environment variables
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

class MetabolicAnalyzer:
    def __init__(self):
        uri = os.getenv("NEO4J_URI", "bolt://localhost:7687")
        user = os.getenv("NEO4J_USER", "neo4j")
        password = os.getenv("NEO4J_PASSWORD", "password")
        self.driver = GraphDatabase.driver(uri, auth=(user, password))

    def close(self):
        self.driver.close()

    def run_community_detection(self):
        """
        Extracts the graph topology, runs Louvain clustering, 
        and updates Neo4j with community assignments.
        """
        print("🧬 Initiating Metabolic Scan: Extracting Code Topology...")
        
        with self.driver.session() as session:
            # 1. Fetch all relationships
            result = session.run("MATCH (a)-[r]->(b) RETURN a.name AS source, b.name AS target")
            edges = [(record["source"], record["target"]) for record in result]

            if not edges:
                print("⚠️ No relationships found in the graph. Metabolics scan aborted.")
                return

            # 2. Build NetworkX graph
            G = nx.Graph() # Louvain works on undirected graphs
            G.add_edges_from(edges)

            print(f"📡 Analyzing {G.number_of_nodes()} nodes and {G.number_of_edges()} links...")

            # 3. Run Louvain Clustering (Functional Organelles)
            partition = community_louvain.best_partition(G)
            communities_count = len(set(partition.values()))
            print(f"✨ Found {communities_count} discrete metabolic organelles (communities).")

            # 4. Run PageRank Centrality (Architectural Authority)
            # Higher score = higher architectural importance
            print("🏆 Calculating PageRank Centrality (Architectural Anchors)...")
            pagerank_scores = nx.pagerank(G, alpha=0.85)

            # 5. Write back to Neo4j
            print("💾 Writing metabolic metadata to the Knowledge Graph...")
            
            # Combine scores into a single batch update
            batch_data = [
                {
                    "name": name, 
                    "community": int(partition.get(name, 0)),
                    "pagerank": float(pagerank_scores.get(name, 0.0))
                } 
                for name in G.nodes()
            ]
            
            session.run("""
                UNWIND $data AS item
                MATCH (n) WHERE n.name = item.name
                SET n.community = item.community,
                    n.pagerank = item.pagerank
            """, data=batch_data)

        print("✅ Metabolics Scan Complete: Codebase partitioned into functional organelles with Architectural Authority levels.")

if __name__ == "__main__":
    analyzer = MetabolicAnalyzer()
    try:
        analyzer.run_community_detection()
    finally:
        analyzer.close()
