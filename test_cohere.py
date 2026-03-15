import os
from core.embeddings import Embedder
from dotenv import load_dotenv

load_dotenv()

def test_cohere():
    print(f"Provider: {os.getenv('EMBEDDING_PROVIDER')}")
    try:
        embedder = Embedder()
        print(f"Initialized with provider: {embedder.provider}")
        
        text = "Hello Helix, test Cohere embeddings."
        vector = embedder.embed(text)
        print(f"Single vector success! Length: {len(vector)}")
        
        batch = ["First text", "Second text"]
        vectors = embedder.embed_batch(batch)
        print(f"Batch success! Count: {len(vectors)}")
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_cohere()
