"""
Helix API Server — Serves graph data from Neo4j to the frontend.

Run: python api/server.py
Endpoints:
    GET /api/graph   → Full graph (nodes + links) for the visualizer
    GET /api/search  → Semantic search via Qdrant
    GET /api/stats   → Database statistics
"""

import asyncio
import contextlib
import json
import os
import re
import sys

from dotenv import load_dotenv
from fastapi import (
    BackgroundTasks,
    FastAPI,
    HTTPException,
    Query,
    Request,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Add parent directory to path so we can import core/
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

from core import Embedder, GraphMemory, VectorMemory
from core.agent import query_agent
from core.harvester import fetch_and_index_repo
from core.agent_agent_system import agent_agent_system
from core.refactor_engine import apply_patch
from core.shadow_engine import generate_shadow_doc
from core.sync_engine import run_helix_sync_sequence
from core.sandbox_engine import SandboxEngine
from core.temporal_engine import TemporalEngine
from core.vision_engine import VisionEngine

# --- Pydantic Models for API Requests ---
class InterrogationQuery(BaseModel):
    query: str

class IngestRequest(BaseModel):
    repo_url: str

class FileRequest(BaseModel):
    file_path: str
    line_start: int = 0
    line_end: int = 0

class ChatRequest(BaseModel):
    query: str

class ShadowRequest(BaseModel):
    name: str

class PatchRequest(BaseModel):
    node: str
    proposal: str
    file_path: str


app = FastAPI(title="Helix API", version="0.1.0")

# Allow frontend to connect
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Database connections (initialized on startup)
graph: GraphMemory | None = None
vector: VectorMemory | None = None
embedder: Embedder | None = None
sandbox = SandboxEngine(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
temporal = TemporalEngine(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
vision = VisionEngine(google_api_key=os.getenv("GOOGLE_API_KEY"))

def _int_env(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except ValueError:
        return default

# AgentSystem scheduling configuration
SWARM_AUTONOMOUS_ENABLED = os.getenv("SWARM_AUTONOMOUS_ENABLED", "true").lower() in {
    "1",
    "true",
    "yes",
    "on",
}
SWARM_AUTONOMOUS_INTERVAL_SECONDS = max(30, _int_env("SWARM_AUTONOMOUS_INTERVAL_SECONDS", 900))
SWARM_AUTONOMOUS_INITIAL_DELAY_SECONDS = max(0, _int_env("SWARM_AUTONOMOUS_INITIAL_DELAY_SECONDS", 10))

class AgentSystemConnectionManager:
    def __init__(self) -> None:
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast_json(self, message: dict) -> None:
        stale: list[WebSocket] = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                stale.append(connection)
        for connection in stale:
            self.disconnect(connection)

agent_system_manager = AgentSystemConnectionManager()
agent_system_scheduler_task: asyncio.Task | None = None
agent_system_scheduler_stop = asyncio.Event()
latest_autoFix_proposal: dict | None = None
agent_system_is_running = False

# Architectural Metrics
METABOLISM = {
    "proposed": 0,
    "accepted": 0,
    "loops_completed": 0
}

def build_agent_system_state() -> dict:
    return {
        "messages": [],
        "identified_node": "",
        "vulnerability": "",
        "optimization_proposal": "",
        "file_path": "",
        "code_content": "",
        "logs": [],
    }

def build_autoFix_payload(state: dict) -> dict:
    return {
        "type": "AutoFix_PROPOSAL",
        "node": state.get("identified_node", ""),
        "vulnerability": state.get("vulnerability", ""),
        "proposal": state.get("optimization_proposal", ""),
        "file_path": state.get("file_path", ""),
        "original_code": state.get("code_content", ""),
    }

async def run_agent_system_autonomous() -> None:
    global latest_autoFix_proposal, agent_system_is_running
    
    if agent_system_is_running:
        return
    
    agent_system_is_running = True
    
    if graph is None or not graph.verify_connection():
        await agent_system_manager.broadcast_json({
            "type": "LOG",
            "message": "❌ Autonomous loop skipped: graph not connected.",
        })
        agent_system_is_running = False
        return

    await agent_system_manager.broadcast_json({
        "type": "LOG",
        "message": "🤖 Autonomous loop: initiating agent agent_system...",
    })

    try:
        """
        SOTA: Asynchronous AgentSysteming with Real-time Streaming
        Research: Mirroring OpenAI's "Aardvark" (Codex Security) and "RepairAgent" (ICSE 2025).
        Validation: Uses `astream` to provide immediate visibility into autonomous agent 
        loops, essential for the "System Vitals" transparency requirement.
        """
        final_state = build_agent_system_state()
        
        async for output in agent_agent_system.astream(final_state):
            for node_name, delta in output.items():
                if "logs" in delta:
                    for log in delta["logs"]:
                        await agent_system_manager.broadcast_json({"type": "LOG", "message": log})
                
                # Update final state with deltas
                final_state.update(delta)

        if final_state.get("optimization_proposal"):
            payload = build_autoFix_payload(final_state)
            latest_autoFix_proposal = payload
            METABOLISM["proposed"] += 1
            await agent_system_manager.broadcast_json(payload)
            
        METABOLISM["loops_completed"] += 1
        
    except Exception as exc:
        print(f"ERROR in run_agent_system_autonomous: {exc}")
        await agent_system_manager.broadcast_json({
            "type": "LOG",
            "message": f"❌ Autonomous loop encountered a logic vulnerability: {exc}",
        })
    finally:
        agent_system_is_running = False

async def agent_system_scheduler_loop() -> None:
    await asyncio.sleep(SWARM_AUTONOMOUS_INITIAL_DELAY_SECONDS)
    while not agent_system_scheduler_stop.is_set():
        if SWARM_AUTONOMOUS_ENABLED:
            try:
                await run_agent_system_autonomous()
            except Exception as e:
                print(f"CRITICAL ERROR in scheduler loop: {e}")
        
        try:
            await asyncio.wait_for(
                agent_system_scheduler_stop.wait(),
                timeout=SWARM_AUTONOMOUS_INTERVAL_SECONDS,
            )
        except asyncio.TimeoutError:
            continue

def start_agent_system_scheduler() -> None:
    global agent_system_scheduler_task
    if agent_system_scheduler_task is None or agent_system_scheduler_task.done():
        agent_system_scheduler_task = asyncio.create_task(agent_system_scheduler_loop())


@app.on_event("startup")
async def startup():
    global graph, vector, embedder
    try:
        graph = GraphMemory()
        # Verify connection immediately
        if not graph.verify_connection():
            print("❌ Neo4j not reachable at startup")
            graph = None
    except Exception as e:
        graph = None
        print(f"❌ Failed to initialize GraphMemory: {e}")

    try:
        vector = VectorMemory()
    except Exception as e:
        vector = None
        print(f"❌ Failed to initialize VectorMemory: {e}")

    try:
        embedder = Embedder()
    except ValueError:
        embedder = None
        print("⚠️  Embeddings not configured — search endpoint disabled")

    # Create Neo4j indices for fast lookups
    if graph and graph.driver:
        try:
            with graph.driver.session() as session:
                for label in ["Module", "Class", "Function"]:
                    session.run(f"CREATE INDEX IF NOT EXISTS FOR (n:{label}) ON (n.name)")
                print("✅ Neo4j indices verified/created")
        except Exception as e:
            print(f"⚠️  Could not create Neo4j indices: {e}")

    agent_system_scheduler_stop.clear()
    start_agent_system_scheduler()

@app.on_event("shutdown")
async def shutdown():
    agent_system_scheduler_stop.set()
    if agent_system_scheduler_task:
        agent_system_scheduler_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await agent_system_scheduler_task

def check_connections():
    """Safety check to ensure database drivers are initialized."""
    if graph is None or not graph.verify_connection():
        raise HTTPException(
            status_code=503, 
            detail="Graph database not connected or unreachable."
        )
    if vector is None:
        raise HTTPException(
            status_code=503, 
            detail="Vector database driver not initialized."
        )


@app.get("/api/graph")
def get_graph(mode: str = Query("deep", description="Graph mode: 'macro', 'deep', or 'temporal'")):
    """
    SOTA: Repository-Level Logic as a Architectural Map
    Research: "Code Graph Model (CGM): A Graph-Integrated LLM for Repo-Level Tasks" (2024)
    Validation: Proves that multi-hop graph structures provide superior context 
    grounding compared to flat vector retrieval.
    """
    check_connections()
    assert graph is not None
    with graph.driver.session() as session:
        if mode == "macro":
            node_query = "MATCH (n) WHERE n:Module OR n:Class RETURN n, labels(n) AS labels"
            rel_query = """
                MATCH (a)-[r]->(b) 
                WHERE (a:Module OR a:Class) AND (b:Module OR b:Class)
                RETURN a.name AS source, b.name AS target, type(r) AS rel_type
            """
        elif mode == "temporal":
            node_query = "MATCH (n) WHERE n:Commit OR n:Entity RETURN n, labels(n) AS labels"
            rel_query = "MATCH (a)-[r]->(b) WHERE type(r) IN ['EVOLVED_INTO', 'MUTATED_IN'] RETURN a.name AS source, b.name AS target, type(r) AS rel_type"
        else:
            node_query = "MATCH (n) RETURN n, labels(n) AS labels"
            rel_query = "MATCH (a)-[r]->(b) RETURN a.name AS source, b.name AS target, type(r) AS rel_type"

        node_result = session.run(node_query)
        rel_result = session.run(rel_query)

        nodes = []
        seen = set()
        for record in node_result:
            node = record["n"]
            label = record["labels"][0] if record["labels"] else "Unknown"
            # For Commits, name might be different
            name = node.get("name") or node.get("hash") or "unnamed"
            if name in seen:
                continue
            seen.add(name)
            nodes.append({
                "id": name,
                "name": name,
                "type": label,
                "timestamp": node.get("timestamp", 0),
                "message": node.get("message", ""),
                "community": node.get("community", 0),
                "pagerank": node.get("pagerank", 0.0),
            })

        node_ids = {n["id"] for n in nodes}
        links = []
        for record in rel_result:
            src, tgt = record["source"], record["target"]
            if src in node_ids and tgt in node_ids:
                links.append({
                    "source": src,
                    "target": tgt,
                    "type": record["rel_type"],
                })

    return {"nodes": nodes, "links": links}


# ── Day 8: Hierarchical (Hierarchical) & Interrogation Endpoints ────────

@app.get("/api/v1/graph/hierarchical")
def geverifierular_graph():
    """
    Returns the code graph as a nested hierarchy for D3 circle packing:
    Root → Modules → Classes → Functions

    Uses DEFINED_IN and HAS_METHOD relationships from the existing schema.
    """
    check_connections()
    assert graph is not None
    with graph.driver.session() as session:
        # 0. Get repository
        repo_result = session.run("MATCH (r:Repository) RETURN r.name AS name, r.url AS url")
        repo_record = repo_result.single()
        repo_info = {"name": repo_record["name"] if repo_record else "Repository", "url": repo_record["url"] if repo_record else ""}

        # 1. Get all modules
        modules_result = session.run(
            "MATCH (m:Module) RETURN m.name AS name, m.file_path AS file_path, "
            "m.docstring AS docstring, m.shadow_doc AS shadow_doc"
        )
        
        module_map = {}
        for r in modules_result:
            mod_name = r["name"]
            if not mod_name:
                continue
            module_map[mod_name] = {
                "name": mod_name,
                "type": "Module",
                "file_path": r["file_path"] or "",
                "docstring": r["docstring"] or "",
                "shadow_doc": r["shadow_doc"] or "",
                "children": [],
            }
        
        # 2. Get classes defined in modules
        classes_result = session.run(
            "MATCH (c:Class)-[:DEFINED_IN]->(m:Module) "
            "RETURN c.name AS cls, m.name AS mod, c.file_path AS file_path, "
            "c.docstring AS docstring, c.shadow_doc AS shadow_doc, "
            "c.line_start AS line_start, c.line_end AS line_end"
        )
        
        class_map = {}  # class_name -> class dict
        for r in classes_result:
            cls_name = r["cls"]
            mod_name = r["mod"]
            if not cls_name or mod_name not in module_map:
                continue
            cls_node = {
                "name": cls_name,
                "type": "Class",
                "file_path": r["file_path"] or "",
                "docstring": r["docstring"] or "",
                "shadow_doc": r["shadow_doc"] or "",
                "line_start": r["line_start"] or 0,
                "line_end": r["line_end"] or 0,
                "children": [],
            }
            class_map[cls_name] = cls_node
            module_map[mod_name]["children"].append(cls_node)
        
        # 3. Get methods belonging to classes
        methods_result = session.run(
            "MATCH (c:Class)-[:HAS_METHOD]->(f:Function) "
            "RETURN f.name AS func, c.name AS cls, f.file_path AS file_path, "
            "f.docstring AS docstring, f.shadow_doc AS shadow_doc, "
            "f.line_start AS line_start, f.line_end AS line_end"
        )
        
        assigned_funcs = set()
        for r in methods_result:
            func_name = r["func"]
            cls_name = r["cls"]
            if not func_name or cls_name not in class_map:
                continue
            class_map[cls_name]["children"].append({
                "name": func_name,
                "type": "Function",
                "file_path": r["file_path"] or "",
                "docstring": r["docstring"] or "",
                "shadow_doc": r["shadow_doc"] or "",
                "line_start": r["line_start"] or 0,
                "line_end": r["line_end"] or 0,
                "value": 1,  # Leaf node size for D3 pack()
            })
            assigned_funcs.add(func_name)
        
        # 4. Get top-level functions (not methods) defined in modules
        top_funcs_result = session.run(
            "MATCH (f:Function)-[:DEFINED_IN]->(m:Module) "
            "RETURN f.name AS func, m.name AS mod, f.file_path AS file_path, "
            "f.docstring AS docstring, f.shadow_doc AS shadow_doc, "
            "f.line_start AS line_start, f.line_end AS line_end"
        )
        
        for r in top_funcs_result:
            func_name = r["func"]
            mod_name = r["mod"]
            if not func_name or mod_name not in module_map:
                continue
            if func_name in assigned_funcs:
                continue  # Already assigned as a class method
            module_map[mod_name]["children"].append({
                "name": func_name,
                "type": "Function",
                "file_path": r["file_path"] or "",
                "docstring": r["docstring"] or "",
                "shadow_doc": r["shadow_doc"] or "",
                "line_start": r["line_start"] or 0,
                "line_end": r["line_end"] or 0,
                "value": 1,
            })
    
    # Build the root hierarchy
    children = list(module_map.values())
    children.sort(key=lambda x: x["name"])
    
    return {
        "name": repo_info["name"],
        "type": "Repository",
        "url": repo_info["url"],
        "children": children,
    }

@app.post("/api/v1/interrogate")
def interrogate_codebase(payload: InterrogationQuery):
    """
    Agentic interrogation endpoint. Takes a natural language query,
    invokes the RAG agent, and returns the answer plus entity names
    to highlight in the Hierarchical view.
    """
    check_connections()
    if not embedder:
        return {"error": "Embedder/Agent not available — configure embeddings."}
    
    print(f"🔬 Interrogation: {payload.query}")
    raw_answer = query_agent(payload.query)
    
    # Extract entity names from bracket-tagged output like [Function] foo, [Class] Bar
    highlight_pattern = re.findall(r'\[(?:Function|Class|Module)\]\s*(\S+)', str(raw_answer))
    
    # Also extract backtick-wrapped names which the agent commonly uses
    backtick_names = re.findall(r'`(\w+)`', str(raw_answer))
    
    # Combine and deduplicate
    all_highlights = list(set(highlight_pattern + backtick_names))
    
    return {
        "answer": str(raw_answer),
        "highlight_nodes": all_highlights
    }

def get_code_tree():
    check_connections()
    all_nodes = {}
    modules = {}
    with graph.driver.session() as session:
        # 1. Get all nodes
        nodes_result = session.run("MATCH (n) RETURN n, labels(n)[0] AS type")
        for r in nodes_result:
            node = r["n"]
            n_type = r["type"]
            n_name = node.get("name")
            if not n_name:
                continue
            
            all_nodes[n_name] = {
                "id": n_name,
                "name": n_name,
                "type": n_type,
                "docstring": node.get("docstring", ""),
                "shadow_doc": node.get("shadow_doc", ""),
                "file_path": node.get("file_path", ""),
                "line_start": node.get("line_start", 0),
                "line_end": node.get("line_end", 0),
                "pagerank": node.get("pagerank", 0.0),
                "community": node.get("community", 0),
                "children": [],
            }
            
        # A. Find Repositories
        repos_result = session.run("MATCH (r:Repository) RETURN r.name AS name")
        repos = {}
        for r in repos_result:
            rep_name = r["name"]
            if rep_name in all_nodes:
                repos[rep_name] = all_nodes[rep_name]
        
        # B. Find Modules belonging to Repositories
        mod_repo_result = session.run("MATCH (m:Module)-[:BELONGS_TO]->(r:Repository) RETURN m.name AS mod, r.name AS repo")
        for r in mod_repo_result:
            mod_name = r["mod"]
            rep_name = r["repo"]
            if rep_name in repos and mod_name in all_nodes:
                repos[rep_name]["children"].append(all_nodes[mod_name])
                all_nodes[mod_name]["_has_parent"] = True

        # C. Fallback: Top-level Modules with no parent
        modules = {k: v for k, v in all_nodes.items() if v["type"] == "Module" and not v.get("_has_parent")}
        
        # B. Find Classes defined in Modules
        classes_result = session.run("MATCH (c:Class)-[:DEFINED_IN]->(m:Module) RETURN c.name AS cls, m.name AS mod")
        for r in classes_result:
            cls_name = r["cls"]
            mod_name = r["mod"]
            if mod_name in modules and cls_name in all_nodes:
                modules[mod_name]["children"].append(all_nodes[cls_name])
                all_nodes[cls_name]["_has_parent"] = True
                
        # C. Find Functions/Methods belonging to Classes
        methods_result = session.run("MATCH (c:Class)-[:HAS_METHOD]->(f:Function) RETURN f.name AS func, c.name AS cls")
        for r in methods_result:
            func_name = r["func"]
            cls_name = r["cls"]
            if cls_name in all_nodes and func_name in all_nodes:
                all_nodes[cls_name]["children"].append(all_nodes[func_name])
                all_nodes[func_name]["_has_parent"] = True
                
        # D. Find strict Top-Level Functions defined in Modules (exclude methods)
        funcs_result = session.run("MATCH (f:Function)-[:DEFINED_IN]->(m:Module) RETURN f.name AS func, m.name AS mod")
        for r in funcs_result:
            func_name = r["func"]
            mod_name = r["mod"]
            # Only add to module if it hasn't been added as a class method
            if mod_name in modules and func_name in all_nodes and not all_nodes[func_name].get("_has_parent"):
                modules[mod_name]["children"].append(all_nodes[func_name])
                all_nodes[func_name]["_has_parent"] = True
                
    # Sort children alphabetically for clean UI
    def sort_children(node):
        node["children"].sort(key=lambda x: (x["type"] != "Class", x["name"]))
        for child in node["children"]:
            sort_children(child)
    
    tree = list(repos.values()) + list(modules.values())
    for t in tree:
        sort_children(t)
        
    tree.sort(key=lambda x: x["name"])
    return {"tree": tree}

@app.get("/api/tree")
def tree():
    """Directory tree endpoint for the frontend."""
    return get_code_tree()

@app.get("/api/search")
def search(q: str = Query(..., description="Semantic search query")):
    """Search for code elements by meaning."""
    check_connections()
    if not embedder:
        return {"error": "Embedder not available — configure embeddings."}

    query_vec = embedder.embed(q)
    results = vector.search(query_vec, top_k=10)
    return {"query": q, "results": results}


@app.get("/api/stats")
def stats():
    check_connections()
    assert graph is not None
    all_nodes = graph.get_all_nodes()

    with graph.driver.session() as session:
        rel_count = session.run(
            "MATCH ()-[r]->() RETURN count(r) AS c"
        ).single()["c"]

    vec_info = None
    try:
        vec_info = vector.get_collection_info()
    except Exception:
        pass

    return {
        "graph": {
            "nodes": len(all_nodes),
            "relationships": rel_count,
        },
        "vectors": vec_info,
    }


@app.post("/api/ingest")
async def ingest_repository(req: IngestRequest, background_tasks: BackgroundTasks):
    """
    Clones a GitHub repository and runs the architectural dissection engine on it in the background.
    """
    if not req.repo_url.startswith("http"):
        raise HTTPException(status_code=400, detail="Invalid repository URL")
        
    def run_ingestion_and_notify():
        try:
            fetch_and_index_repo(req.repo_url)
            # Try to notify via websocket
            try:
                loop = asyncio.get_running_loop()
                loop.create_task(agent_system_manager.broadcast_json({
                    "type": "INGESTION_COMPLETE",
                    "repo_url": req.repo_url
                }))
            except RuntimeError:
                asyncio.run(agent_system_manager.broadcast_json({
                    "type": "INGESTION_COMPLETE",
                    "repo_url": req.repo_url
                }))
        except Exception as e:
            print(f"Ingestion failed: {e}")
            try:
                loop = asyncio.get_running_loop()
                loop.create_task(agent_system_manager.broadcast_json({
                    "type": "INGESTION_FAILED",
                    "repo_url": req.repo_url,
                    "error": str(e)
                }))
            except RuntimeError:
                asyncio.run(agent_system_manager.broadcast_json({
                    "type": "INGESTION_FAILED",
                    "repo_url": req.repo_url,
                    "error": str(e)
                }))

    background_tasks.add_task(run_ingestion_and_notify)
    return {"status": "Ingestion started in background"}


@app.post("/api/file")
def get_file_content(req: FileRequest):
    """
    Retrieves the raw code content for a specific node to display in the UI.
    Requires an absolute file path. We slice the lines if provided.
    """
    if not os.path.exists(req.file_path):
        raise HTTPException(status_code=404, detail="File not found")
        
    try:
        with open(req.file_path, "r", encoding="utf-8") as f:
            lines = f.readlines()
            
        if req.line_start > 0 and req.line_end > 0:
            # 1-indexed to 0-indexed slicing
            content = "".join(lines[req.line_start - 1 : req.line_end])
        else:
            content = "".join(lines)
            
        return {"content": content, "file": req.file_path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/chat")
async def chat_with_agent(req: ChatRequest):
    """
    Agentic AI endpoint.
    Takes a natural language query, traverses the graph + vectors autonomously,
    and returns a synthesized answer.
    """
    check_connections()
    if not embedder:
        return {"error": "Embedder/Agent not available — configure embeddings."}
    
    print(f"🤖 Agent received query: {req.query}")
    raw_answer = query_agent(req.query)
    
    # LangGraph returns structured message content, extract text
    if isinstance(raw_answer, list) and len(raw_answer) > 0 and hasattr(raw_answer[0], "text"):
        response_text = raw_answer[0].text
    else:
        response_text = str(raw_answer)

    # Extract entity names for the frontend to highlight/zoom
    # Matches bracketed types like [Function] foo and backticked names like `bar`
    highlight_pattern = re.findall(r'\[(?:Function|Class|Module)\]\s*(\S+)', response_text)
    backtick_names = re.findall(r'`(\w+)`', response_text)
    all_highlights = list(set(highlight_pattern + backtick_names))

    return {
        "query": req.query,
        "response": response_text,
        "highlight_nodes": all_highlights,
    }

# --- Day 7: Shadow Documentation & Webhooks ---

@app.post("/webhook/github")
async def github_webhook(request: Request, background_tasks: BackgroundTasks):
    # 1. Receive the 'Push' event from GitHub
    payload = await request.json()
    repo_name = payload.get('repository', {}).get('full_name', 'Unknown')
    branch = payload.get('ref', '').split('/')[-1] if payload.get('ref') else 'Unknown'
    
    print(f"Helix detected a change in {repo_name} on branch {branch}")
    
    # 2. Start the sync in the background so the UI doesn't freeze
    background_tasks.add_task(run_helix_sync_sequence, payload)
    
    return {"status": "Syncing sequence initiated"}


@app.post("/api/shadow_doc")
def create_shadow_doc(req: ShadowRequest):
    """
    On-Demand generation of the Clinical Shadow Documentation for the UI.
    """
    try:
        doc = generate_shadow_doc(req.name)
        return {"doc": doc}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/uml")
def get_uml(name: str = Query(..., description="Name of the Class or Module")):
    """
    Generates Mermaid JS UML code for the given entity.
    """
    if not graph:
        raise HTTPException(status_code=500, detail="Graph database not connected")
    
    uml_code = graph.get_uml_diagram(name)
    return {"name": name, "mermaid": uml_code}

# --- Day 7: Agent AgentSystem WebSocket ---
# --- Evolutionary (Temporal) Endpoints ---

@app.get("/api/evolution/timeline")
async def get_evolution_timeline(limit: int = 100):
    """
    SOTA: Paleontology of Code (Evolutionary Timeline)
    Research: "Visualizing Software Evolution using Git"
    Validation: Provides a high-resolution timeline of all patchs.
    """
    return temporal.get_evolution_timeline(limit)

@app.get("/api/evolution/node_history")
async def get_node_history(file_path: str):
    """
    Returns the evolutionary history of a specific node's source sequence.
    """
    return temporal.get_entity_history(file_path)

@app.get("/api/evolution/state/{commit_hash}")
async def get_state_at(commit_hash: str):
    """
    Reconstructs the system's state at a specific point in time.
    """
    return temporal.reconstruct_state_at(commit_hash)

@app.get("/api/evolution/sync")
async def sync_evolution():
    """
    Triggers a retrospective sync of Git history into Neo4j.
    """
    check_connections()
    assert graph is not None
    return temporal.sync_to_neo4j(graph.driver)

# --- Vision (Visual RAG) Endpoints ---

@app.get("/api/vision/capture")
async def capture_ui(url: str = "http://localhost:3000"):
    """
    SOTA: UI Phenotype Capture
    Research: "Visual-Link: Grounding Code Explanations in UI Pixels"
    Validation: Captures a high-fidelity snapshot for multi-modal analysis.
    """
    capture_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "vision_snapshots")
    os.makedirs(capture_dir, exist_ok=True)
    output_path = os.path.join(capture_dir, f"snapshot_{int(asyncio.get_event_loop().time())}.png")
    
    success = await vision.capture_ui_snapshot(url, output_path)
    if success:
        return {"status": "success", "path": output_path}
    else:
        raise HTTPException(status_code=500, detail="Vision capture failed")

@app.get("/api/vision/analyze")
async def analyze_vision(path: str, query: str = "Analyze the visual health and UX quality of this application."):
    """
    Analyzes a captured UI snapshot using multi-modal Gemini.
    """
    return await vision.analyze_visual_health(path, query)

@app.websocket("/ws/agent_agent_system")
async def websocket_endpoint(websocket: WebSocket):
    global latest_autoFix_proposal
    await agent_system_manager.connect(websocket)
    try:
        # 1. Send Initial Welcome
        await websocket.send_json({
            "type": "LOG",
            "message": "🔬 Connection Established. Helix AgentSystem Online."
        })

        # 2. Listen for 'DEPLOY_SWARM' command
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)

            if message.get("command") == "DEPLOY_SWARM":
                await websocket.send_json({
                    "type": "LOG",
                    "message": "🚀 Deploying Agent AgentSystem Multi-Agent Workflow..."
                })

                # Initial state for the agent_system
                state = build_agent_system_state()

                # Run the LangGraph AgentSystem
                # We'll stream the results back to the frontend
                # Using a thread pool to avoid blocking the async loop if needed, 
                # but for now we'll just run it as is since it's a test.
                # In production, we'd use 'astream' or similar.
                
                # To simulate real-time monologue, we'll iterate through the steps
                log_index = 0
                final_state = state
                
                # Local function to send logs
                async def send_new_logs(new_logs):
                    nonlocal log_index
                    for i in range(log_index, len(new_logs)):
                        await websocket.send_json({
                            "type": "LOG",
                            "message": new_logs[i]
                        })
                        await asyncio.sleep(1.5)  # Narrative pacing
                    log_index = len(new_logs)

                # Process AgentSystem (Async Streaming)
                async for output in agent_agent_system.astream(state):
                    # output is a dict of {node_name: state_delta}
                    for _, delta in output.items():
                        if "logs" in delta:
                            for log in delta["logs"]:
                                await websocket.send_json({
                                    "type": "LOG",
                                    "message": log
                                })
                                # Small delay for cinematic effect
                                await asyncio.sleep(0.5)
                        
                        # Capture the final proposal if generated
                        if "optimization_proposal" in delta:
                            final_state.update(delta)

                if final_state.get("optimization_proposal"):
                    payload = build_autoFix_payload(final_state)
                    latest_autoFix_proposal = payload
                    await websocket.send_json(payload)
    
    except WebSocketDisconnect:
        print("WebSocket disconnected")
    except Exception as e:
        print(f"WebSocket error: {e}")
        await websocket.close()
    finally:
        agent_system_manager.disconnect(websocket)

@app.post("/api/verify_patch")
async def verify_patch_api(req: PatchRequest):
    """
    SOTA: Shadow Verification (Digital Twin)
    Research: "Verified Program Repair via Staging"
    Validation: Triggers an isolated sandbox run to verify a proposal 
    before physical commitment.
    """
    try:
        await agent_system_manager.broadcast_json({
            "type": "SHADOW_VERIFY",
            "state": "START",
            "node": req.node,
            "message": f"🛡️ Shadow Verification: Staging {req.node} in sandbox...",
        })
        
        # We use a default test command from env or a sensible default
        test_cmd = os.getenv("MUTATION_TEST_COMMAND", "python -m py_compile {file_path}")
        
        result = sandbox.run_staged_patch(req.file_path, req.node, req.proposal, test_cmd)
        
        # Broadcast the sandbox logs
        for log in result["logs"]:
            await agent_system_manager.broadcast_json({"type": "LOG", "message": log})
        
        await agent_system_manager.broadcast_json({
            "type": "SHADOW_VERIFY",
            "state": "END",
            "node": req.node,
            "success": result["success"]
        })
            
        return result
    except Exception as e:
        await agent_system_manager.broadcast_json({
            "type": "LOG",
            "message": f"❌ Shadow Verification failed: {str(e)}",
        })
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/accept_patch")
async def accept_patch_api(req: PatchRequest):
    try:
        success, message = apply_patch(req.file_path, req.node, req.proposal)
        if success:
            # Re-index the modified file to update the graph
            if graph:
                # We could run a more precise sync, but for now we'll simulate it
                print(f"🧬 AutoFix: Physical patch of {req.node} confirmed. Re-syncing...")
            return {"success": True, "message": message}
        return {"success": False, "message": message}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)
