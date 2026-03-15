"""
Helix — Demo Script

This script demonstrates the full pipeline:
1. Connect to Neo4j (graph) and Qdrant (vectors)
2. Build a sample code knowledge graph in Neo4j
3. Generate embeddings via Google Gemini and store in Qdrant
4. Run a semantic search to prove it works

Run: python main.py
"""

from dotenv import load_dotenv

load_dotenv()  # Load .env variables before anything else

from core import GraphMemory, VectorMemory, Embedder


def main():
    print("=" * 60)
    print("  🧬 HELIX — Autonomous Living Repository")
    print("=" * 60)
    print()

    # ── Step 1: Connect to databases ─────────────────────────────

    print("📡 Connecting to databases...")
    print()

    graph = GraphMemory()
    if graph.verify_connection():
        print("  ✅ Neo4j (Graph Memory)    — connected")
    else:
        print("  ❌ Neo4j — FAILED. Is the container running?")
        return

    vector = VectorMemory()
    if vector.verify_connection():
        print("  ✅ Qdrant (Vector Memory)  — connected")
    else:
        print("  ❌ Qdrant — FAILED. Is the container running?")
        return

    embedder = Embedder()
    print("  ✅ Google Gemini Embedder  — ready")
    print()

    # ── Step 2: Build a sample code graph in Neo4j ───────────────

    print("🕸️  Building sample code graph in Neo4j...")
    print()

    # Clear any previous demo data
    graph.clear_all()

    # Create nodes representing code elements
    nodes = [
        ("Module", "bio_utils", {"docstring": "Utility module for bioinformatics operations"}),
        ("Class", "DNAProcessor", {"docstring": "Processes source sequence data"}),
        ("Function", "align_sequences", {"docstring": "Aligns two source sequences using Needleman-Wunsch"}),
        ("Function", "read_fasta", {"docstring": "Reads sequences from a FASTA file"}),
        ("Function", "calculate_gc_content", {"docstring": "Calculates GC content percentage of a source sequence"}),
        ("Module", "data_pipeline", {"docstring": "Data ingestion and transformation pipeline"}),
        ("Function", "fetch_ncbi_data", {"docstring": "Fetches genomic data from NCBI database"}),
    ]

    for label, name, props in nodes:
        graph.create_node(label, name, **props)
        print(f"  + [{label}] {name}")

    print()

    # Create relationships between nodes
    relationships = [
        ("bio_utils", "DNAProcessor", "CONTAINS"),
        ("DNAProcessor", "align_sequences", "HAS_METHOD"),
        ("DNAProcessor", "read_fasta", "HAS_METHOD"),
        ("DNAProcessor", "calculate_gc_content", "HAS_METHOD"),
        ("align_sequences", "read_fasta", "CALLS"),
        ("data_pipeline", "fetch_ncbi_data", "CONTAINS"),
        ("fetch_ncbi_data", "DNAProcessor", "USES"),
    ]

    for from_name, to_name, rel in relationships:
        graph.create_relationship(from_name, to_name, rel)
        print(f"  🔗 {from_name} —[{rel}]→ {to_name}")

    print()

    # Query connections
    print("  🔍 What is source codeProcessor connected to?")
    connections = graph.get_connections("DNAProcessor")
    for conn in connections:
        arrow = "→" if conn["direction"] == "outgoing" else "←"
        print(f"     {arrow} [{conn['relationship']}] {conn['connected_node']}")

    print()

    # ── Step 3: Generate embeddings and store in Qdrant ──────────

    print("🧠 Generating embeddings and storing in Qdrant...")
    print()

    # Create the vector collection
    vector.create_collection()

    # Prepare the texts to embed (using docstrings as the semantic content)
    code_items = [
        {"name": "align_sequences", "type": "function", "text": "Aligns two source sequences using Needleman-Wunsch algorithm"},
        {"name": "read_fasta", "type": "function", "text": "Reads and parses sequences from a FASTA format file"},
        {"name": "calculate_gc_content", "type": "function", "text": "Calculates the GC nucleotide content percentage of a source sequence"},
        {"name": "fetch_ncbi_data", "type": "function", "text": "Fetches genomic data from the NCBI online database"},
        {"name": "DNAProcessor", "type": "class", "text": "A class that processes source sequence data for bioinformatics analysis"},
        {"name": "bio_utils", "type": "module", "text": "Utility module for bioinformatics operations and source code analysis"},
        {"name": "data_pipeline", "type": "module", "text": "Data ingestion and transformation pipeline for genomic data"},
    ]

    texts = [item["text"] for item in code_items]
    metadatas = [{"name": item["name"], "type": item["type"], "description": item["text"]} for item in code_items]

    # Batch embed all texts
    vectors = embedder.embed_batch(texts)
    print(f"  📐 Generated {len(vectors)} embeddings (dimension: {len(vectors[0])})")

    # Store in Qdrant
    ids = vector.add_batch(vectors, metadatas)
    print(f"  💾 Stored {len(ids)} vectors in Qdrant")
    print()

    # ── Step 4: Semantic Search Demo ─────────────────────────────

    print("🔎 Running semantic search demo...")
    print()

    queries = [
        "How do I compare two genetic sequences?",
        "Where can I download genomic data from the internet?",
        "What handles file reading for biological data?",
    ]

    for query in queries:
        print(f'  Query: "{query}"')
        query_vec = embedder.embed(query)
        results = vector.search(query_vec, top_k=3)
        for i, r in enumerate(results, 1):
            print(f"    {i}. {r['metadata']['name']} (score: {r['score']:.3f}) — {r['metadata']['description']}")
        print()

    # ── Summary ──────────────────────────────────────────────────

    info = vector.get_collection_info()
    all_nodes = graph.get_all_nodes()

    print("=" * 60)
    print("  📊 HELIX STATUS")
    print("=" * 60)
    print(f"  Neo4j  : {len(all_nodes)} nodes in graph")
    print(f"  Qdrant : {info['points_count']} vectors stored")
    print()
    print("  🌐 Neo4j Dashboard  → http://localhost:7474")
    print("     Run: MATCH (n)-[r]->(m) RETURN n, r, m")
    print("  🌐 Qdrant Dashboard → http://localhost:6333/dashboard")
    print()
    print("  🧬 Helix is alive.")
    print("=" * 60)

    graph.close()


if __name__ == "__main__":
    main()
