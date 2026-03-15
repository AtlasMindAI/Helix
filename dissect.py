import sys
import os
import time
from dotenv import load_dotenv
load_dotenv()

from parsers.python_parser import PythonParser
from core.graph_memory import GraphMemory
from core.vector_memory import VectorMemory
from core.embeddings import Embedder

def _get_file_hash(path: str) -> str:
    import hashlib
    try:
        with open(path, "rb") as f:
            return hashlib.md5(f.read()).hexdigest()
    except Exception:
        return ""

def dissect(target_path: str, repo_url: str = ""):
    """
    SOTA: Codebase as a Living Organism (Metabolic Mapping)
    Research: "Biomimicry: A Super Systems Metaphor for Transforming Software Development"
    Validation: Implements the 'Metabolism' concept by treating repository updates as 
    homeostatic corrections, ensuring only deltas are processed to maintain system equilibrium.
    """
    print("=" * 60)
    print(f"🔬 HELIX DISSECTION ENGINE — Scanning: {target_path}")
    print("=" * 60)
    
    # metabolism.json: Local hash store for delta-ingestion
    metabolism_path = os.path.join(os.getcwd(), "metadata", "metabolism.json")
    os.makedirs(os.path.dirname(metabolism_path), exist_ok=True)
    metabolism = {}
    if os.path.exists(metabolism_path):
        import json
        try:
            with open(metabolism_path, "r") as f:
                metabolism = json.load(f)
        except Exception:
            metabolism = {}

    # 1. Connect to Memory Systems
    graph = GraphMemory()
    if not graph.verify_connection():
        print("❌ Neo4j not reachable.")
        return
        
    vector = VectorMemory()
    if not vector.verify_connection():
        print("❌ Qdrant not reachable.")
        return

    try:
        embedder = Embedder()
        print("✅ Connected to Memory Systems\n")
    except (ValueError, ImportError, ModuleNotFoundError) as e:
        print(f"⚠️  Embedder initialization failed: {e}")
        print("💡 Ingestion will continue without vector embeddings.")
        embedder = None

    # --- SOTA: Homeostatic Reset ---
    # Ensure collections are ready and repository node exists
    repo_name = repo_url.split('/')[-1] if repo_url else os.path.basename(os.path.abspath(target_path))
    print(f"📦 Ensuring Repository node '{repo_name}' exists...")
    graph.create_node("Repository", repo_name, url=repo_url, path=target_path, timestamp=time.time())
    
    if embedder:
        vector.create_collection(vector_size=embedder.dimension)
    else:
        # Fallback reset if no embedder
        vector.create_collection()

    # 2. Parse Directory
    parser = PythonParser()
    all_python_files = []
    for root, _, files in os.walk(target_path):
        for f in files:
            if f.endswith(".py"):
                all_python_files.append(os.path.join(root, f))

    changed_files = []
    for fp in all_python_files:
        current_hash = _get_file_hash(fp)
        if fp not in metabolism or metabolism[fp] != current_hash:
            changed_files.append(fp)
            metabolism[fp] = current_hash

    if not changed_files:
        """
        SOTA: Delta-Ingestion Efficiency
        Research: "Efficient Handling of Incremental Updates in Large-Scale Knowledge Graphs"
        Validation: Proves that stable nodes do not require re-analysis, drastically 
        reducing the computational cost and LLM token usage during 'Mutation' cycles.
        """
        print("✨ Organism is stable. No changes detected (Delta Ingestion Active).")
        
        # --- SOTA: Structural Repair (Re-linking) ---
        # Even if files haven't changed, ensure they are linked to the repository node
        # This fixes 'orphaned' nodes from interrupted or previous-version ingests.
        print(f"🔗 Ensuring structural integrity: Re-linking modules to '{repo_name}'...")
        with graph.driver.session() as session:
            session.run(
                "MATCH (m:Module) WHERE m.file_path STARTS WITH $path "
                "MATCH (r:Repository {name: $repo_name}) "
                "MERGE (m)-[:BELONGS_TO]->(r)",
                path=target_path, repo_name=repo_name
            )
        return

    print(f"🧬 Detected {len(changed_files)} changed files. Re-mapping nervous system...")
    
    # Parse only changed files
    modules = []
    for fp in changed_files:
        try:
            mod = parser.parse_file(fp)
            if mod:
                modules.append(mod)
        except Exception as e:
            print(f"  ❌ Failed to parse {fp}: {e}")

    if not modules:
        print("❌ No valid modules parsed from changes.")
        return

    print(f"🕸️  Injecting {len(modules)} modules into Graph & Vector Memory...")
    
    # We'll collect all metadata for batch vector insertion
    all_embeddings_text = []
    all_embeddings_meta = []

    for mod in modules:
        # Cleanup old nodes for this file before re-injecting
        graph.delete_by_file(mod.file_path)

        # --- Graph Injection ---
        graph.create_node("Module", mod.name, file_path=mod.file_path, docstring=mod.docstring)
        graph.create_relationship(mod.name, repo_name, "BELONGS_TO")
        
        if embedder:
            all_embeddings_text.append(mod.docstring or f"Python module: {mod.name}")
            all_embeddings_meta.append({
                "name": mod.name,
                "type": "Module",
                "file_path": mod.file_path,
                "description": mod.docstring or ""
            })

        for cls in mod.classes:
            graph.create_node("Class", cls.name, docstring=cls.docstring, file_path=mod.file_path, 
                               line_start=cls.line_start, line_end=cls.line_end)
            graph.create_relationship(cls.name, mod.name, "DEFINED_IN")
            
            if embedder:
                all_embeddings_text.append(cls.docstring or f"Python class: {cls.name}")
                all_embeddings_meta.append({
                    "name": cls.name,
                    "type": "Class",
                    "file_path": mod.file_path,
                    "description": cls.docstring or ""
                })

            for base in cls.bases:
                graph.create_node("Class", base)
                graph.create_relationship(cls.name, base, "EXTENDS")
            
            for method in cls.methods:
                method_name = f"{cls.name}.{method.name}"
                graph.create_node("Function", method_name, docstring=method.docstring, 
                                  args=", ".join(method.args), file_path=mod.file_path,
                                  line_start=method.line_start, line_end=method.line_end)
                graph.create_relationship(method_name, cls.name, "HAS_METHOD")
                graph.create_relationship(method_name, mod.name, "DEFINED_IN")
                
                if embedder:
                    all_embeddings_text.append(method.docstring or f"Method {method.name} in class {cls.name}")
                    all_embeddings_meta.append({
                        "name": method_name,
                        "type": "Function",
                        "file_path": mod.file_path,
                        "description": method.docstring or ""
                    })

        for func in mod.functions:
            graph.create_node("Function", func.name, docstring=func.docstring, 
                               args=", ".join(func.args), file_path=mod.file_path,
                                line_start=func.line_start, line_end=func.line_end)
            graph.create_relationship(func.name, mod.name, "DEFINED_IN")
            
            if embedder:
                all_embeddings_text.append(func.docstring or f"Python function: {func.name}")
                all_embeddings_meta.append({
                    "name": func.name,
                    "type": "Function",
                    "file_path": mod.file_path,
                    "description": func.docstring or ""
                })

    # --- Vector Injection (Batch with Semantic Cache) ---
    if embedder and all_embeddings_text:
        print(f"🧠 Processing {len(all_embeddings_text)} embeddings...")
        vector.create_collection(vector_size=embedder.dimension)
        
        # Embedder internals now handle caching
        vectors = embedder.embed_batch(all_embeddings_text)
        vector.add_batch(vectors, all_embeddings_meta)
    
    # --- Structural Homeostasis ---
    # If it was an empty or small repo, we still want to show it's active
    if not modules:
        print("ℹ️  No Python modules found. Repository node created in Graph Memory.")

    # Save metabolism state
    with open(metabolism_path, "w") as f:
        import json
        json.dump(metabolism, f)

    print("\n" + "=" * 60)
    print(f"✅ Delta dissection complete. Parsed {len(modules)} modules.")
    print("=" * 60)
    graph.close()

if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else "."
    dissect(target)
