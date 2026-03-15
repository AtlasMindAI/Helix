"""
Helix Vector Memory — Qdrant Connector

Stores and searches vector embeddings of code/text.
This enables *semantic search* — finding code by what it MEANS,
not just by keyword matching.

Example: Search "DNA sequence alignment" and find `align_sequences()`
even if those exact words never appear in the code.
"""

import os
import uuid
from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance,
    PointStruct,
    VectorParams,
)


class VectorMemory:
    """Manages semantic vector storage in Qdrant."""

    def __init__(
        self,
        host: str | None = None,
        port: int | None = None,
        collection_name: str = "code_dna",
    ):
        """
        Connect to Qdrant.

        Args:
            host: Qdrant host (default: from QDRANT_HOST env var or 'localhost')
            port: Qdrant port (default: from QDRANT_PORT env var or 6333)
            collection_name: Name of the default collection to use.
        """
        self.host = host or os.getenv("QDRANT_HOST", "localhost")
        self.port = port or int(os.getenv("QDRANT_PORT", "6333"))
        self.collection_name = collection_name
        self.client = QdrantClient(host=self.host, port=self.port)

    def verify_connection(self) -> bool:
        """Check if Qdrant is reachable."""
        try:
            self.client.get_collections()
            return True
        except Exception:
            return False

    # ── Collection Management ────────────────────────────────────────

    def create_collection(
        self, vector_size: int = 3072, collection_name: str | None = None
    ):
        """
        Create a vector collection if it doesn't already exist.
        If it exists with a different vector size, recreate it.

        Args:
            vector_size: Dimension of the vectors (3072 for gemini-embedding-2).
            collection_name: Override the default collection name.
        """
        name = collection_name or self.collection_name
        existing = [c.name for c in self.client.get_collections().collections]
        if name in existing:
            info = self.client.get_collection(name)
            current_size = info.config.params.vectors.size
            if current_size != vector_size:
                self.client.delete_collection(name)
            else:
                return
        self.client.create_collection(
            collection_name=name,
            vectors_config=VectorParams(
                size=vector_size, distance=Distance.COSINE
            ),
        )

    # ── Store Vectors ────────────────────────────────────────────────

    def add(
        self,
        vector: list[float],
        metadata: dict,
        collection_name: str | None = None,
    ) -> str:
        """
        Store a single vector with its metadata.

        Args:
            vector: The embedding vector (list of floats).
            metadata: Info about what this vector represents, e.g.:
                {"name": "align_sequences", "type": "function", "code": "def align..."}
            collection_name: Override the default collection name.

        Returns:
            The ID of the stored point.
        """
        name = collection_name or self.collection_name
        point_id = str(uuid.uuid4())
        self.client.upsert(
            collection_name=name,
            points=[
                PointStruct(
                    id=point_id,
                    vector=vector,
                    payload=metadata,
                )
            ],
        )
        return point_id

    def add_batch(
        self,
        vectors: list[list[float]],
        metadatas: list[dict],
        collection_name: str | None = None,
    ) -> list[str]:
        """
        Store multiple vectors at once (more efficient).

        Args:
            vectors: List of embedding vectors.
            metadatas: List of metadata dicts, one per vector.
            collection_name: Override the default collection name.

        Returns:
            List of IDs for the stored points.
        """
        name = collection_name or self.collection_name
        ids = [str(uuid.uuid4()) for _ in vectors]
        points = [
            PointStruct(id=pid, vector=vec, payload=meta)
            for pid, vec, meta in zip(ids, vectors, metadatas)
        ]
        self.client.upsert(collection_name=name, points=points)
        return ids

    # ── Semantic Search ──────────────────────────────────────────────

    def search(
        self,
        query_vector: list[float],
        top_k: int = 5,
        collection_name: str | None = None,
    ) -> list[dict]:
        """
        Find the most semantically similar items to a query vector.

        Args:
            query_vector: The embedding of your search query.
            top_k: Number of results to return.
            collection_name: Override the default collection name.

        Returns:
            List of dicts with 'score' (similarity) and 'metadata'.

        Example:
            results = vector_memory.search(embedder.embed("DNA alignment"))
            # → [{"score": 0.94, "metadata": {"name": "align_sequences", ...}}, ...]
        """
        name = collection_name or self.collection_name
        hits = self.client.query_points(
            collection_name=name,
            query=query_vector,
            limit=top_k,
        ).points
        return [
            {"score": hit.score, "metadata": hit.payload}
            for hit in hits
        ]

    def delete_by_file(self, file_path: str, collection_name: str | None = None):
        """Delete all points associated with a specific file path."""
        name = collection_name or self.collection_name
        from qdrant_client.models import Filter, FieldCondition, MatchValue
        self.client.delete(
            collection_name=name,
            points_selector=Filter(
                must=[
                    FieldCondition(
                        key="file_path",
                        match=MatchValue(value=file_path),
                    )
                ]
            ),
        )

    def get_collection_info(self, collection_name: str | None = None) -> dict:
        """Get info about a collection (vector count, config, etc.)."""
        name = collection_name or self.collection_name
        info = self.client.get_collection(name)
        return {
            "name": name,
            "points_count": info.points_count,
            "status": info.status.value,
        }
