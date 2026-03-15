import os
import sys
from dotenv import load_dotenv

# Add parent directory to path to import core/
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
load_dotenv()

from core.vector_memory import VectorMemory
from core.graph_memory import GraphMemory
from core.embeddings import Embedder

class HelixSearch:
    def __init__(self):
        self.graph = GraphMemory()
        self.vector = VectorMemory() # Default to 'code_dna'
        self.embedder = Embedder()

    def semantic_search(self, query: str, top_k: int = 3):
        print(f"\n🔍 Semantic Search: '{query}'")
        print("-" * 60)
        
        # 1. Generate embedding for query
        query_vec = self.embedder.embed(query)
        
        # 2. Search Qdrant
        results = self.vector.search(query_vec, top_k=top_k)
        
        if not results:
            return []

        search_results = []
        for i, res in enumerate(results, 1):
            meta = res["metadata"]
            search_results.append({
                "index": i,
                "name": meta.get("name"),
                "type": meta.get("type", "Unknown"),
                "score": res["score"],
                "description": meta.get("description", "No description available."),
                "file_path": meta.get("file_path", "")
            })
        return search_results

    def close(self):
        self.graph.close()

if __name__ == "__main__":
    searcher = HelixSearch()
    query = sys.argv[1] if len(sys.argv) > 1 else "How to parse python nodes?"
    
    print(f"\n🔍 Semantic Search: '{query}'")
    print("-" * 60)
    
    results = searcher.semantic_search(query)
    if not results:
        print("No matching DNA sequences found.")
    else:
        for res in results:
            print(f"{res['index']}. [{res['type']}] {res['name']} (Score: {res['score']:.2f})")
            print(f"   🧬 Role: {res['description'][:150]}...")
            print()
            
    searcher.close()
