import os
from typing import Dict, Any

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

from core.graph_memory import GraphMemory
from core.llm_provider import get_chat_model

graph = GraphMemory()

def get_shadow_llm():
    try:
        return get_chat_model(temperature=0.2)
    except Exception:
        return None

def generate_shadow_doc(entity_name: str) -> str:
    """
    Generates clinical 'Shadow Documentation' for a node using Graph RAG.
    Queries Neo4j for the full context (upstream, downstream, internal structure),
    generates the markdown manual, and saves it directly back to the Neo4j node.
    """
    llm = get_shadow_llm()
    if not llm:
        return "Error: LLM not configured. Shadow Documentation requires the LLM."
        
    print(f"🧬 Generating Shadow Doc for {entity_name}...")
    
    # Step 1: Get the connections and context from Neo4j
    connections = graph.get_connections(entity_name)
    
    # Also fetch the node details (docstring, args, file_path)
    with graph.driver.session() as session:
        result = session.run("MATCH (n) WHERE n.name = $name RETURN n, labels(n)[0] AS type", name=entity_name).single()
        
    if not result:
        return f"Entity {entity_name} not found in the organism."
    
    node = result["n"]
    node_type = result["type"]
    
    hierarchy = (
        f"Type: {node_type}\n"
        f"File: {node.get('file_path')}\n"
        f"Arguments: {node.get('args')}\n"
        f"Original Docstring: {node.get('docstring')}"
    )
    
    relations_text = []
    for conn in connections:
        relations_text.append(f"- {conn['direction']} {conn['relationship']} with {conn['connected_node']}")
    
    # Get the blast radius to include systemic risks
    try:
        impacts = graph.get_blast_radius(entity_name)
        impact_count = len(impacts) if impacts else 0
    except:
        impact_count = "Unknown"
        
    prompt = f"""
    Analyze this biological code entity: {entity_name}.
    We use a Cyber-Bio codebase metaphor.

    Structure: 
    {hierarchy}
    
    Interactions (The Nervous System): 
    {chr(10).join(relations_text)}
    
    Blast Radius size: {impact_count} downstream nodes affected if this code breaks.
    
    Write a 'Clinical' documentation entry. It must strictly follow this structure:
    Avoid big titles. Use bolding for sections. Use extremely professional, precise language without marketing fluff.
    
    **Systemic Role**
    What is its biological role in the app based on its name, docstring, and interactions? 
    
    **Metabolic Path**
    What data does it consume (upstream inputs/args) and what does it produce/trigger (downstream outputs/calls)?
    
    **Systemic Risk**
    If this 'organelle' fails or is modified, what is the 'Blast Radius' impact? State it clinically.
    """
    
    response = llm.invoke(prompt)
    doc_text = response.content
    
    # Step 2: Save the shadow doc directly back into the Neo4j node
    with graph.driver.session() as session:
        session.run("MATCH (n {name: $name}) SET n.shadow_doc = $doc", name=entity_name, doc=doc_text)
        
    return doc_text
