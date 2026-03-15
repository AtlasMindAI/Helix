import os
from typing import List, Dict, Any
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))
import time

from langgraph.prebuilt import create_react_agent
from langchain_core.prompts import SystemMessagePromptTemplate
from langchain_core.messages import SystemMessage
from langchain_core.tools import tool

from core.graph_memory import GraphMemory
from core.vector_memory import VectorMemory
from core.embeddings import Embedder
from core.llm_provider import get_chat_model


# Initialize databases
graph = GraphMemory()
vector = VectorMemory()
try:
    embedder = Embedder()
except ValueError:
    embedder = None
    print("⚠️  Embeddings not configured — semantic search tool disabled")


@tool
def search_code_semantics(query: str) -> str:
    """
    Searches the codebase for logic related to the natural language query using Semantic Vector Search.
    Use this when you need to find code that implements a specific functionality or concept,
    but you don't know the exact function or class name.
    
    Args:
        query: The natural language question or description of what you are looking for.
        
    Returns:
        Information about the top matching code elements, including their type, signature, and relevance score.
    """
    if not embedder:
        return "Error: Embedding model not configured."
        
    query_vec = embedder.embed(query)
    results = vector.search(query_vec, top_k=5)
    
    if not results:
        return f"No semantic matches found for '{query}'"
        
    formatted = [f"Semantic Search Results for: '{query}':"]
    for i, r in enumerate(results, 1):
        meta = r["metadata"]
        formatted.append(
            f"{i}. [{meta['type']}] {meta['name']} (Score: {r['score']:.2f})\n"
            f"   Description/Docstring: {meta['description'][:200]}...\n"
            f"   File: {meta['file_path']}"
        )
        
    return "\n\n".join(formatted)


@tool
def get_entity_details(entity_name: str) -> str:
    """
    Retrieves the exact code structure details for a specific function, class, or module from the Knowledge Graph.
    Use this when you know the name of an entity and need to see its docstring, 
    arguments, file location, and line numbers.
    
    Args:
        entity_name: The exact name of the function, class, or module (e.g., 'align_sequences' or 'PythonParser').
    """
    with graph.driver.session() as session:
        result = session.run(
            "MATCH (n) WHERE n.name = $name RETURN n, labels(n)[0] AS type",
            name=entity_name
        ).single()
        
    if not result:
        return f"Entity '{entity_name}' not found in the Knowledge Graph."
        
    node = result["n"]
    node_type = result["type"]
    
    details = [f"[{node_type}] {entity_name}"]
    if node.get("file_path"):
        details.append(f"File: {node.get('file_path')} (Lines {node.get('line_start', '?')}-{node.get('line_end', '?')})")
    if node.get("args"):
        details.append(f"Arguments: {node.get('args')}")
    if node.get("docstring"):
        details.append(f"Docstring: {node.get('docstring')}")
        
    return "\n".join(details)


@tool
def analyze_blast_radius(entity_name: str) -> str:
    """
    Performs a 'Blast Radius' dependency analysis on a target function or class using the Knowledge Graph.
    Use this to understand what happens if a specific entity is modified or deleted.
    It returns everything that CALLS, DEPENDS_ON, or EXTENDS the target entity.
    
    Args:
        entity_name: The exact name of the function, class, or module to analyze.
    """
    with graph.driver.session() as session:
        # What calls/depends on this? (Incoming relationships)
        incoming = session.run(
            "MATCH (a)-[r]->(b) WHERE b.name = $name RETURN a.name AS dependent, type(r) AS rel_type, labels(a)[0] AS type",
            name=entity_name
        )
        
        # What does this call/depend on? (Outgoing relationships)
        outgoing = session.run(
            "MATCH (a)-[r]->(b) WHERE a.name = $name RETURN b.name AS dependency, type(r) AS rel_type, labels(b)[0] AS type",
            name=entity_name
        )
        
        inc_list = list(incoming)
        out_list = list(outgoing)

    if not inc_list and not out_list:
        return f"No dependency information found for '{entity_name}' in the graph. Either it's isolated or doesn't exist."

    report = [f"Blast Radius Analysis for: {entity_name}\n"]
    
    if inc_list:
        report.append("⚠️ INCOMING DEPENDENCIES (These will break if you change this entity):")
        for r in inc_list:
            report.append(f"  - [{r['type']}] {r['dependent']} --[{r['rel_type']}]--> {entity_name}")
    else:
        report.append("✅ No incoming dependencies detected (Safe to modify/delete).")
        
    report.append("")
    
    if out_list:
        report.append("🔗 OUTGOING DEPENDENCIES (This entity relies on these):")
        for r in out_list:
            report.append(f"  - {entity_name} --[{r['rel_type']}]--> [{r['type']}] {r['dependency']}")
            
    return "\n".join(report)


@tool
def simulate_impact(entity_name: str) -> str:
    """
    Predicts which parts of the system will break if a specific function, class, or module is changed.
    Calculates the 'Blast Radius' by recursively traversing the dependency graph up to 5 levels deep.
    
    Args:
        entity_name: The exact name of the code element being changed.
        
    Returns:
        A clinical risk assessment detailing Direct Impacts, Secondary Waves, and Systemic Risks.
    """
    try:
        affected = graph.get_blast_radius(entity_name)
    except AttributeError:
        # Fallback if get_blast_radius isn't available
        return f"Error: Impact simulation algorithm is not fully loaded in GraphMemory."
        
    if not affected:
        return f"Simulation Complete: Changing '{entity_name}' has 0 downstream dependencies. It is safe to modify."
        
    direct = [n for n in affected if n["distance"] == 1]
    secondary = [n for n in affected if 2 <= n["distance"] <= 3]
    systemic = [n for n in affected if n["distance"] >= 4]
    
    report = [f"🚨 BLAST RADIUS SIMULATION: '{entity_name}' 🚨"]
    report.append(f"Total Affected Nodes: {len(affected)}")
    
    if direct:
        report.append(f"\n[🔴 HIGH RISK] DIRECT IMPACT (1 Hop) - Immediate Breakage Likely:")
        for n in direct:
            report.append(f"  - [{n['type']}] {n['affected_node']}")
            
    if secondary:
        report.append(f"\n[🟡 MEDIUM RISK] SECONDARY WAVE (2-3 Hops) - Potential Side Effects:")
        for n in secondary:
            report.append(f"  - [{n['type']}] {n['affected_node']} (Distance: {n['distance']})")
            
    if systemic:
        report.append(f"\n[🟢 LOW RISK] SYSTEMIC DRIFT (4+ Hops) - Architectural Impact:")
        for n in systemic:
            report.append(f"  - [{n['type']}] {n['affected_node']} (Distance: {n['distance']})")
            
    return "\n".join(report)


# Create the Agent Brain
def init_agent():
    """Initializes the Reasoning Agent with tools and system prompt."""
    
    llm = get_chat_model(temperature=0.1)
    
    tools = [search_code_semantics, get_entity_details, analyze_blast_radius, simulate_impact]
    
    system_message = SystemMessage(content="""You are Helix, the Cyber-Bio Source Code AI.
You are a highly intelligent codebase navigation agent. You have direct access to a codebase's 
'Brain' (Semantic Qdrant Vectors) and its 'Nervous System' (Neo4j Graph Dependencies).

When answering a user's question, follow this reasoning pattern:
1. If asked about a general concept or functionality, use `search_code_semantics` to find relevant code entities.
2. If asked about a specific function/class, use `get_entity_details` to read exactly what it does.
3. If asked "what happens if I change/modify X", use `simulate_impact` for a deep risk simulation.
4. If asked about immediate neighbors (incoming/outgoing), use `analyze_blast_radius`.
5. Synthesize the results into a concise, highly accurate, professional 'cyber-bio' styled response.

Don't just list the tool output — explain *how things connect*.
If code is missing, say so. Do not guess or hallucinate code.""")
    
    # create_react_agent in langgraph does the orchestration automatically
    agent_executor = create_react_agent(llm, tools, prompt=system_message)
    
    return agent_executor


# ------------------------------------------------------------------------------
# 5. Agent Invocation
# ------------------------------------------------------------------------------

def query_agent(prompt: str) -> str:
    """Entry point for the Chatbot API to interact with the agent."""
    agent = init_agent()
    
    try:
        inputs = {"messages": [("user", prompt)]}
        response = agent.invoke(inputs)
        return response["messages"][-1].content
    except Exception as e:
        return f"Error executing agent query: {str(e)}"
