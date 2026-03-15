import os
import sys
import time
from dotenv import load_dotenv

# Ensure local imports work
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
load_dotenv()

from core.crawler import crawl_repository, save_state
from core.ast_parser import extract_entities_from_code
from core.graph_memory import GraphMemory
from core.vector_memory import VectorMemory
from core.embeddings import Embedder

def ingest_project(project_path: str):
    print("\n" + "=" * 60)
    print("🧬 HELIX MASTER SYNC — Initializing Nervous System...")
    print("=" * 60)

    graph = GraphMemory()
    vector = VectorMemory()
    embedder = Embedder()
    
    # 1. Crawl for new/modified DNA
    files_to_process, state = crawl_repository(project_path)
    
    if not files_to_process:
        print("\n⚡ Codebase is unchanged. Helix heartbeat is stable.")
        return

    print(f"\n🕸️  Detected {len(files_to_process)} updated modules.")
    
    all_embeddings_text = []
    all_metadata = []
    processed_files = []

    # 2. Extract and Prepare
    for filepath, file_hash in files_to_process:
        filename = os.path.basename(filepath)
        rel_path = os.path.relpath(filepath, project_path)
        
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                source_code = f.read()
            
            entities = extract_entities_from_code(source_code)
            
            # File Node
            graph.create_node("Module", filename, path=rel_path, hash=file_hash)
            
            # Queue for embedding
            all_embeddings_text.append(source_code) # Module level
            all_metadata.append({
                "name": filename,
                "type": "Module",
                "path": rel_path,
                "description": f"Module {filename} containing {len(entities)} entities."
            })

            for ent in entities:
                # Inject structure into Neo4j
                graph.create_node(ent["type"], ent["name"], 
                                  path=rel_path, 
                                  docstring=ent["docstring"])
                graph.create_relationship(ent["name"], filename, "DEFINED_IN")
                
                # Queue for embedding
                all_embeddings_text.append(ent["code"])
                all_metadata.append({
                    "name": ent["name"],
                    "type": ent["type"],
                    "path": rel_path,
                    "description": ent["docstring"] or f"{ent['type']} {ent['name']} defined in {filename}"
                })
            
            processed_files.append((filepath, file_hash))

        except Exception as e:
            print(f"❌ Error processing {filename}: {e}")

    # 3. Batch Embed and Store (with Rate Limiting)
    print(f"\n🧠 Generating {len(all_embeddings_text)} embeddings...")
    chunk_size = 50
    for i in range(0, len(all_embeddings_text), chunk_size):
        text_chunk = all_embeddings_text[i : i + chunk_size]
        meta_chunk = all_metadata[i : i + chunk_size]
        
        try:
            vectors = embedder.embed_batch(text_chunk)
            vector.add_batch(vectors, meta_chunk)
            print(f"  💾 Processed {i + len(text_chunk)} / {len(all_embeddings_text)}")
            
            if i + chunk_size < len(all_embeddings_text):
                print("  ⏳ Respecting Gemini Rate Limits: Sleeping for 60s...")
                time.sleep(60)
        except Exception as e:
            print(f"❌ Embedding error: {e}")
            break

    # 4. Finalize State
    for filepath, file_hash in processed_files:
        state[filepath] = file_hash
    save_state(state)
    
    print("\n✅ Ingestion complete. Neural link established.")

if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else "."
    ingest_project(target)
