"""
Helix Graph Memory — Neo4j Connector

Stores and queries the *structural relationships* in a codebase:
  - Which classes exist
  - Which functions belong to which class
  - What calls what
  - What imports what

Think of it as a living mind-map of your code.
"""

import os
from neo4j import GraphDatabase


class GraphMemory:
    """Manages the code knowledge graph in Neo4j."""

    def __init__(
        self,
        uri: str | None = None,
        user: str | None = None,
        password: str | None = None,
    ):
        """
        Connect to Neo4j.

        Args:
            uri: Bolt URI (default: from NEO4J_URI env var or bolt://localhost:7687)
            user: Username (default: from NEO4J_USER env var or 'neo4j')
            password: Password (default: from NEO4J_PASSWORD env var or 'password123')
        """
        self.uri = uri or os.getenv("NEO4J_URI", "bolt://localhost:7687")
        self.user = user or os.getenv("NEO4J_USER", "neo4j")
        self.password = password or os.getenv("NEO4J_PASSWORD", "password123")
        self.driver = GraphDatabase.driver(self.uri, auth=(self.user, self.password))

    def close(self):
        """Close the connection."""
        self.driver.close()

    def verify_connection(self) -> bool:
        """Check if Neo4j is reachable."""
        try:
            self.driver.verify_connectivity()
            return True
        except Exception:
            return False

    # ── Node Operations ──────────────────────────────────────────────

    def create_node(self, label: str, name: str, **properties) -> dict:
        """
        Create a node in the graph.

        Args:
            label: The type of node (e.g., "Class", "Function", "Module")
            name: The name of the code element
            **properties: Any extra metadata (e.g., docstring, file_path, line_number)

        Returns:
            The created node as a dict.

        Example:
            graph.create_node("Function", "align_sequences", docstring="Aligns two DNA sequences")
        """
        props = {"name": name, **properties}
        prop_string = ", ".join(f"{k}: ${k}" for k in props)
        query = f"MERGE (n:{label} {{name: $name}}) SET n += {{{prop_string}}} RETURN n"
        with self.driver.session() as session:
            result = session.run(query, **props)
            record = result.single()
            return dict(record["n"]) if record else {}

    # ── Relationship Operations ──────────────────────────────────────

    def create_relationship(
        self,
        from_name: str,
        to_name: str,
        relationship: str,
        **properties,
    ) -> bool:
        """
        Create a relationship between two existing nodes.

        Args:
            from_name: Name of the source node
            to_name: Name of the target node
            relationship: Type of relationship (e.g., "CALLS", "CONTAINS", "IMPORTS")
            **properties: Extra metadata on the relationship

        Returns:
            True if the relationship was created.

        Example:
            graph.create_relationship("DNAProcessor", "align_sequences", "CONTAINS")
        """
        prop_string = ""
        if properties:
            props = ", ".join(f"{k}: ${k}" for k in properties)
            prop_string = f" {{{props}}}"

        query = (
            f"MATCH (a {{name: $from_name}}), (b {{name: $to_name}}) "
            f"CREATE (a)-[r:{relationship}{prop_string}]->(b) "
            f"RETURN r"
        )
        with self.driver.session() as session:
            result = session.run(
                query, from_name=from_name, to_name=to_name, **properties
            )
            return result.single() is not None

    # ── Query Operations ─────────────────────────────────────────────

    def get_connections(self, name: str) -> list[dict]:
        """
        Find everything connected to a given node.

        Args:
            name: Name of the node to query.

        Returns:
            List of dicts with 'relationship', 'direction', and 'connected_node'.

        Example:
            graph.get_connections("DNAProcessor")
            # → [{"relationship": "CONTAINS", "direction": "outgoing", "connected_node": "align_sequences"}, ...]
        """
        query = """
        MATCH (n {name: $name})-[r]->(m)
        RETURN type(r) AS relationship, 'outgoing' AS direction, m.name AS connected_node
        UNION
        MATCH (n {name: $name})<-[r]-(m)
        RETURN type(r) AS relationship, 'incoming' AS direction, m.name AS connected_node
        """
        with self.driver.session() as session:
            result = session.run(query, name=name)
            return [dict(record) for record in result]

    def get_blast_radius(self, name: str) -> list[dict]:
        """
        Calculates the Blast Radius (downstream impact) of changing a node.
        Finds everything that depends on or calls the target, up to 5 levels deep.
        
        Args:
            name: Name of the node to simulate changing.
            
        Returns:
            List of dicts containing 'affected_node', 'type', and 'distance'.
        """
        query = """
        MATCH (start {name: $name})
        MATCH path = (start)<-[:CALLS|DEPENDS_ON|EXTENDS*1..5]-(downstream)
        RETURN downstream.name AS affected_node, 
               labels(downstream)[0] AS type, 
               length(path) AS distance
        ORDER BY distance ASC
        """
        with self.driver.session() as session:
            result = session.run(query, name=name)
            # Use dictionary to deduplicate (keep shortest distance if multiple paths)
            impact_map = {}
            for record in result:
                node = record["affected_node"]
                dist = record["distance"]
                if node not in impact_map or dist < impact_map[node]["distance"]:
                    impact_map[node] = {
                        "affected_node": node,
                        "type": record["type"],
                        "distance": dist
                    }
            return list(impact_map.values())

    def get_all_nodes(self) -> list[dict]:
        """Return all nodes in the graph."""
        query = "MATCH (n) RETURN n"
        with self.driver.session() as session:
            result = session.run(query)
            return [dict(record["n"]) for record in result]

    def get_all_function_names(self) -> set[str]:
        """Return a set of all function/method names for relationship resolution."""
        query = "MATCH (n:Function) RETURN n.name as name"
        with self.driver.session() as session:
            result = session.run(query)
            return {r["name"] for r in result}

    def get_uml_diagram(self, name: str) -> str:
        """
        Generates a Mermaid JS UML class diagram string for a Module or Class.
        """
        with self.driver.session() as session:
            # Check if it's a Module or a Class
            result = session.run("MATCH (n {name: $name}) RETURN labels(n)[0] AS type", name=name)
            record = result.single()
            if not record:
                return "classDiagram\n  class Error[\"Node not found\"]"
            
            node_type = record["type"]
            mermaid_lines = ["classDiagram", "  direction BT"] # Bottom to Top for inheritance
            
            if node_type == "Class":
                self._append_class_to_mermaid(session, name, mermaid_lines, seen_classes=set())
            elif node_type == "Module":
                # Get all classes in the module
                cls_result = session.run(
                    "MATCH (c:Class)-[:DEFINED_IN]->(m:Module {name: $name}) RETURN c.name AS cls",
                    name=name
                )
                seen_classes = set()
                for r in cls_result:
                    self._append_class_to_mermaid(session, r["cls"], mermaid_lines, seen_classes)
            
            if len(mermaid_lines) <= 2:
                return "classDiagram\n  class Info[\"No classes found in this module\"]"
                
            return "\n".join(mermaid_lines)

    def _append_class_to_mermaid(self, session, class_name, lines, seen_classes):
        if class_name in seen_classes:
            return
        seen_classes.add(class_name)
        
        # Get methods
        methods_result = session.run(
            "MATCH (c:Class {name: $name})-[:HAS_METHOD]->(f:Function) RETURN f.name AS func",
            name=class_name
        )
        lines.append(f"  class {class_name} {{")
        for r in methods_result:
            lines.append(f"    +{r['func']}()")
        lines.append("  }")
        
        # Get inheritance
        bases_result = session.run(
            "MATCH (c:Class {name: $name})-[:EXTENDS]->(b) RETURN b.name AS base",
            name=class_name
        )
        for r in bases_result:
            base_name = r["base"]
            lines.append(f"  {base_name} <|-- {class_name}")
            # Also try to add the base class definition if it exists in our graph
            self._append_class_to_mermaid(session, base_name, lines, seen_classes)

    def delete_by_file(self, file_path: str):
        """Delete all nodes and relationships associated with a specific file path."""
        query = "MATCH (n) WHERE n.file_path = $file_path DETACH DELETE n"
        with self.driver.session() as session:
            session.run(query, file_path=file_path)

    def clear_all(self):
        """Delete all nodes and relationships. Use with caution!"""
        with self.driver.session() as session:
            session.run("MATCH (n) DETACH DELETE n")
