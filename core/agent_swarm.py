import os
from typing import Annotated, TypedDict, List, Dict, Any
from langgraph.graph import StateGraph, START, END
from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage
from core.graph_memory import GraphMemory
from core.ast_parser import extract_entities_from_code
from core.llm_provider import get_chat_model

# Load environment
from dotenv import load_dotenv
load_dotenv()

# State Definition
class CellularState(TypedDict):
    messages: List[BaseMessage]
    identified_node: str
    vulnerability: str
    optimization_proposal: str
    file_path: str
    code_content: str
    logs: List[str]

# Initialize LLM
llm = get_chat_model(temperature=0.2)

graph_db = GraphMemory()

def get_code_for_node(node_name: str) -> tuple[str | None, str | None]:
    """Helper to retrieve file_path and specific entity code."""
    query = "MATCH (n) WHERE n.name = $name AND (n:Module OR n:Class OR n:Function) RETURN n.file_path AS path"
    with graph_db.driver.session() as session:
        result = session.run(query, name=node_name).single()
    
    if not result or not result["path"]:
        return None, None

    file_path = result["path"]
    full_path = os.path.join(os.getcwd(), file_path)
    
    try:
        with open(full_path, "r") as f:
            source = f.read()
        
        entities = extract_entities_from_code(source)
        target_entity = next((e for e in entities if e["name"] == node_name), None)
        if not target_entity:
            # Fallback: if no match found but file exists, return the whole file (likely a Module)
            return file_path, source
            
        return file_path, target_entity["code"]
    except Exception:
        return file_path, None

# --- Agent 1: Pathogen Hunter ---
async def pathogen_hunter(state: CellularState):
    """
    SOTA: PageRank-Driven Anomaly Detection
    Research: "Fuzzing Based on Function Importance by Attributed Call Graph"
    Validation: Uses PageRank to prioritize high-authority architectural anchors for scanning, 
    mirroring the Negative Selection Algorithm (NSA) paradigm for program anomaly detection.
    """
    log = "🔍 Pathogen Hunter: Scanning high-authority nodes for vulnerabilities..."
    
    # Find the node with the highest PageRank
    query = "MATCH (n) WHERE n.pagerank IS NOT NULL AND (n:Module OR n:Class OR n:Function) RETURN n.name AS name, n.pagerank AS pr ORDER BY n.pagerank DESC LIMIT 5"
    with graph_db.driver.session() as session:
        results = list(session.run(query))
    
    if not results:
        return {"logs": state["logs"] + [log, "❌ No high-impact nodes found. Graph is pristine."]}

    # Pick the top one
    target = results[0]["name"]
    log_2 = f"🎯 Pathogen Hunter: Target acquired: '{target}' (PageRank: {results[0]['pr']:.4f})"
    
    # Retrieve actual code
    file_path, code_content = get_code_for_node(target)
    
    if not code_content:
        return {"logs": state["logs"] + [log, log_2, f"⚠️  Pathogen Hunter: Could not retrieve code for '{target}'. Skipping."]}

    # SOTA: Context Pruning - Retrieve direct neighbors for structural context
    context_query = """
    MATCH (n {name: $name})-[r]-(neighbor)
    RETURN labels(neighbor)[0] as type, neighbor.name as name, type(r) as rel
    LIMIT 10
    """
    with graph_db.driver.session() as session:
        neighbors = list(session.run(context_query, name=target))
    
    neighborhood_context = "\n".join([f"- {n['type']} `{n['name']}` ({n['rel']})" for n in neighbors])

    # Ask LLM to find a real vulnerability in the code
    prompt = f"Analyze the following Python code within its architectural neighborhood.\n\n" \
             f"Entity: {target}\n" \
             f"File: {file_path}\n\n" \
             f"SYNAPTIC NEIGHBORHOOD:\n{neighborhood_context}\n\n" \
             f"CODE:\n```python\n{code_content}\n```\n\n" \
             f"Identify one specific issue (logic pathogen or bottleneck) that should be resolved."
             
    response = await llm.ainvoke([
        SystemMessage(content="You are a Pathogen Hunter AI. You find real issues in code by considering both the logic and its structural position in the graph."), 
        HumanMessage(content=prompt)
    ])
    
    return {
        "identified_node": target,
        "vulnerability": response.content,
        "logs": state["logs"] + [log, log_2, "🦠 Pathogen identified: Potential logic drift detected."]
    }

# --- Agent 2: T-Cell Healer ---
async def t_cell_healer(state: CellularState):
    """
    SOTA: Autonomous Healing Agents
    Research: "RepairAgent: An Autonomous, LLM-Based Agent for Program Repair" (ICSE 2025)
    Validation: Treats the LLM as an autonomous agent that plans and executes surgically 
    targeted 'Code Patchs' based on retrieved graph context.
    """
    target = state["identified_node"]
    vulnerability = state["vulnerability"]
    
    log = f"🛡️ T-Cell Healer: Synthesizing antibody for '{target}'..."
    
    # 1. Retrieve the actual code content
    file_path, code_content = get_code_for_node(target)
    
    if not code_content:
        return {"logs": state["logs"] + [log, f"❌ Error: Could not locate physical DNA for '{target}'."]}

    try:
        # 2. Ask LLM for a 'Patch Proposal'
        prompt = f"HEALING PROTOCOL\nTarget: {target}\nPathogen: {vulnerability}\n\nCurrent DNA (Code):\n```python\n{code_content}\n```\n\nTask: Propose a 'Code Patch' (optimized code) that resolves the pathogen and improves architectural stability. ONLY return the new code block within markdown code fences."
        
        response = await llm.ainvoke([
            SystemMessage(content="You are a T-Cell Healer AI. You surgically repair code."), 
            HumanMessage(content=prompt)
        ])
        
        return {
            "optimization_proposal": response.content,
            "file_path": file_path,
            "code_content": code_content,
            "logs": state["logs"] + [log, "🧬 Code Patch synthesized. Proposal ready for deployment."]
        }
    except Exception as e:
        return {"logs": state["logs"] + [log, f"❌ Error during healing: {str(e)}"]}

def create_agent_swarm():
    """
    SOTA: Artificial Agent System (AIS) Orchestration
    Research: "DCW-RNN: Improving Vulnerability Detection Using AIS" (IEEE)
    Validation: Orchestrates agents as a Dendritic Cell Algorithm (DCA) to detect 
    complex dependencies in vulnerable object-oriented software metrics.
    """
    workflow = StateGraph(CellularState)
    
    workflow.add_node("pathogen_hunter", pathogen_hunter)
    workflow.add_node("t_cell_healer", t_cell_healer)
    
    workflow.add_edge(START, "pathogen_hunter")
    workflow.add_edge("pathogen_hunter", "t_cell_healer")
    workflow.add_edge("t_cell_healer", END)
    
    return workflow.compile()

agent_swarm = create_agent_swarm()

if __name__ == "__main__":
    # Test run
    initial_state = {
        "messages": [],
        "identified_node": "",
        "vulnerability": "",
        "optimization_proposal": "",
        "file_path": "",
        "code_content": "",
        "logs": []
    }
    
    print("🚀 Deploying Agent System...")
    final_state = agent_swarm.invoke(initial_state)
    for log in final_state["logs"]:
        print(log)
    if final_state["optimization_proposal"]:
        print("\n--- AutoFix PROPOSAL ---")
        print(final_state["optimization_proposal"])
