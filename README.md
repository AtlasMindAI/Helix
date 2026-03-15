# Helix
Helix: The first Autonomous Living Repository. Agentic Graph RAG and WASM execution to simulate, predict, and autonomously evolve codebases.

## Flow Guide
If you feel lost on first open, use the in-app Flow Guide to follow the recommended path from ingestion → exploration → analysis → swarm actions. It auto-opens once per device and can be reopened from `Settings` in the Ghost Dock.

## LLM Providers (Gemini or Qwen)
Helix supports Google Gemini and OpenAI-compatible endpoints (Qwen, vLLM, Ollama, LM Studio).

### Switch to Qwen (OpenAI-compatible)
Set these environment variables in `.env`:

```bash
LLM_PROVIDER=qwen
QWEN_BASE_URL=http://localhost:8000/v1
QWEN_MODEL=Qwen/Qwen3.5-397B-A17B  # or your locally served Qwen model id
QWEN_API_KEY=dummy
```

### Embeddings with Qwen/OpenAI-compatible
```bash
EMBEDDING_PROVIDER=qwen
EMBEDDING_MODEL=your-embedding-model
QWEN_BASE_URL=http://localhost:8000/v1
QWEN_API_KEY=dummy
```

If you leave `LLM_PROVIDER` unset, Helix defaults to Gemini (set `GOOGLE_API_KEY` and optionally `GEMINI_MODEL`).


## System Architecture
Helix is organized into four layers:
1. **Ingestion & Indexing**: parses repositories, builds AST metadata, and populates the graph/vector stores.
2. **Knowledge Core**: Neo4j holds dependency graphs; Qdrant stores embeddings for semantic search.
3. **Agentic Reasoning**: the Immune Swarm runs multi-step analysis, proposes mutations, and streams logs over WebSockets.
4. **Spatial UI**: the 3D graph, overlays, and Ghost Dock provide progressive disclosure and guided workflows.
