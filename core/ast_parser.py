import ast

def extract_entities_from_code(source_code: str):
    """
    Parses Python code into an AST and extracts isolated function and class blocks.
    Uses ast.get_source_segment which is available in Python 3.8+.
    """
    try:
        tree = ast.parse(source_code)
    except Exception:
        return [] # Skip files with broken syntax

    entities = []
    for node in ast.walk(tree):
        # Extract isolated Functions
        if isinstance(node, ast.FunctionDef):
            try:
                func_code = ast.get_source_segment(source_code, node)
                entities.append({
                    "type": "Function",
                    "name": node.name,
                    "code": func_code,
                    "docstring": ast.get_docstring(node) or ""
                })
            except Exception:
                continue
        
        # Extract isolated Classes
        elif isinstance(node, ast.ClassDef):
            try:
                class_code = ast.get_source_segment(source_code, node)
                entities.append({
                    "type": "Class",
                    "name": node.name,
                    "code": class_code,
                    "docstring": ast.get_docstring(node) or ""
                })
            except Exception:
                continue
            
    return entities
