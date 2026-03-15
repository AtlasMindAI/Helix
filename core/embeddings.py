"""
Helix Embeddings — Pluggable Embedding Wrapper

Converts code/text into vector representations (lists of numbers)
that capture the *meaning* of the content, enabling semantic search.

Providers:
  - Google Gemini (default)
  - OpenAI-compatible (vLLM/Ollama/Qwen endpoint)
  - FastEmbed (lightweight local/offline)
"""

import os


class Embedder:
    """Generates vector embeddings from text using configured provider."""

    def __init__(self, api_key: str | None = None):
        provider = os.getenv("EMBEDDING_PROVIDER", "google").strip().lower()
        self.provider = provider

        if provider == "cohere":
            import cohere
            key = api_key or os.getenv("COHERE_API_KEY")
            if not key:
                raise ValueError("COHERE_API_KEY not found. Set it for Cohere embeddings or EMBEDDING_PROVIDER=fastembed.")
            self.client = cohere.Client(api_key=key)
            self.provider = "cohere"
        
        elif provider in {"fastembed", "fast", "local"}:
            from fastembed import TextEmbedding
            model_name = os.getenv("EMBEDDING_MODEL", "BAAI/bge-small-en-v1.5")
            self.client = TextEmbedding(model_name)
            self.provider = "fastembed"

        else:
            from google import genai
            key = api_key or os.getenv("GOOGLE_API_KEY")
            if not key:
                raise ValueError("GOOGLE_API_KEY not found. Set it for Gemini embeddings or EMBEDDING_PROVIDER=fastembed.")
            self.client = genai.Client(api_key=key)
            self.provider = "google"
        
        # SOTA: Semantic Cache
        # Research: "Semantic Caching for LLMs" (Dataquest/Upstash/Medium)
        # Validation: Reduces redundant LLM invocations by similarity-based lookups, 
        # ensuring the "Visual Metabolism" stays energy-efficient.
        self.cache_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "metadata", "semantic_cache.json")
        os.makedirs(os.path.dirname(self.cache_path), exist_ok=True)
        self.cache = {}
        if os.path.exists(self.cache_path):
            try:
                import json
                with open(self.cache_path, "r") as f:
                    self.cache = json.load(f)
            except Exception:
                self.cache = {}

    @property
    def dimension(self) -> int:
        """Return the vector dimension for the current provider/model."""
        if self.provider == "cohere":
            return 1024
        elif self.provider == "fastembed":
            # BAAI/bge-small-en-v1.5 is 384
            return 384
        elif self.provider in {"openai", "qwen"}:
            return 1536
        else:
            # gemini-embedding-001 is 768 or 3072 depending on version, 
            # here we assume 3072 as previously used.
            return 3072

    def _save_cache(self):
        import json
        with open(self.cache_path, "w") as f:
            json.dump(self.cache, f)

    def _get_hash(self, text: str) -> str:
        import hashlib
        return hashlib.md5(text.encode()).hexdigest()

    def embed(self, text: str) -> list[float]:
        """
        Convert a single piece of text into a vector.

        Args:
            text: The code snippet, docstring, or description to embed.

        Returns:
            A list of floats representing the semantic meaning.
        """
        text_hash = self._get_hash(text)
        if text_hash in self.cache:
            return self.cache[text_hash]

        # ... existing logic ...
        if self.provider in {"sbert", "sentence-transformers", "local"}:
            vec = self.client.encode(text).tolist()
        elif self.provider in {"fastembed", "fast", "local-fast"}:
            vec = list(self.client.embed([text]))[0].tolist()
        elif self.provider in {"openai", "qwen", "openai-compatible"}:
            vec = self.client.embed_query(text)
        elif self.provider == "cohere":
            # Cohere API v2 (Client.embed)
            response = self.client.embed(
                texts=[text],
                model=os.getenv("EMBEDDING_MODEL", "embed-english-v3.0"),
                input_type="search_document"
            )
            vec = response.embeddings[0]
        else:
            result = self.client.models.embed_content(
                model="gemini-embedding-001",
                contents=text,
            )
            vec = result.embeddings[0].values

        self.cache[text_hash] = vec
        self._save_cache()
        return vec

    def embed_batch(self, texts: list[str]) -> list[list[float]]:
        """
        Convert multiple texts into vectors in one API call (more efficient).

        Args:
            texts: List of code snippets or descriptions to embed.

        Returns:
            List of vectors, one per input text.
        """
        if self.provider in {"sbert", "sentence-transformers", "local"}:
            return [vec.tolist() for vec in self.client.encode(texts, batch_size=32, convert_to_numpy=True)]

        if self.provider in {"fastembed", "fast", "local-fast"}:
            return [vec.tolist() for vec in self.client.embed(texts)]

        if self.provider in {"openai", "qwen", "openai-compatible"}:
            return self.client.embed_documents(texts)

        if self.provider == "cohere":
            # Cohere batch embedding
            response = self.client.embed(
                texts=texts,
                model=os.getenv("EMBEDDING_MODEL", "embed-english-v3.0"),
                input_type="search_document"
            )
            return response.embeddings

        # SOTA: Resilient Adaptive Batching
        # Research: "Exponential Backoff and Jitter in Distributed Systems" (AWS)
        # Validation: Ensures ingestion persistence by handling rate limits (429) gracefully,
        # allowing massive repositories to be 'digested' without manual intervention.
        import time
        chunk_size = 20  # Ultra-conservative chunk size
        all_vectors = []
        
        for i in range(0, len(texts), chunk_size):
            chunk = texts[i : i + chunk_size]
            max_retries = 10  # More retries for tight quotas
            for attempt in range(max_retries):
                try:
                    result = self.client.models.embed_content(
                        model="gemini-embedding-001",
                        contents=chunk,
                    )
                    all_vectors.extend([e.values for e in result.embeddings])
                    break
                except Exception as e:
                    # Check for rate limit errors (429)
                    error_msg = str(e).upper()
                    if ("RESOURCE_EXHAUSTED" in error_msg or "QUOTA" in error_msg or "429" in error_msg) and attempt < max_retries - 1:
                        # Exponential backoff: 3, 5, 9, 17, 33...
                        wait_time = (2 ** (attempt + 1)) + 1
                        print(f"⚠️  Quota hit ({attempt+1}/{max_retries}). Retrying in {wait_time}s...")
                        time.sleep(wait_time)
                    else:
                        raise e
            
            # Metabolic pause to respect free-tier rate limits (approx 15-20 RPM)
            if i + chunk_size < len(texts):
                time.sleep(4.0)
            
        return all_vectors
