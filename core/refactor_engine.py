import ast
import astor
import os
import subprocess
from typing import Tuple

def _extract_code_block(new_code: str) -> str:
    stripped = new_code.strip()
    if stripped.startswith("```") and stripped.count("```") >= 2:
        lines = stripped.splitlines()
        if lines[0].startswith("```") and lines[-1].startswith("```"):
            return "\n".join(lines[1:-1]).strip()
    return new_code.strip()

def apply_patch(file_path: str, entity_name: str, new_code: str, root_dir: str | None = None) -> Tuple[bool, str]:
    """
    SOTA: Code Patchs (Surgical Program Repair)
    Research: "RepairAgent: An Autonomous, LLM-Based Agent for Program Repair" (ICSE 2025)
    Validation: Implements the 'Digital Guardian' concept by autonomously executing 
    surgical code replacements validated by AST transformations.
    """
    if not entity_name.strip():
        return False, "Patch rejected: empty entity name."

    working_root = root_dir or os.getcwd()
    full_path = os.path.join(working_root, file_path)
    
    try:
        with open(full_path, "r") as f:
            original_source = f.read()
        tree = ast.parse(original_source)
    except Exception as exc:
        return False, f"Patch rejected: failed to parse source ({exc})."

    candidate_code = _extract_code_block(new_code)
    try:
        candidate_tree = ast.parse(candidate_code)
    except Exception as exc:
        return False, f"Patch rejected: invalid proposal syntax ({exc})."

    if not candidate_tree.body:
        return False, "Patch rejected: empty proposal."

    candidate_node = candidate_tree.body[0]
    if not isinstance(candidate_node, (ast.FunctionDef, ast.ClassDef)):
        return False, "Patch rejected: proposal must be a function or class definition."
    if candidate_node.name != entity_name:
        return False, "Patch rejected: proposal name does not match target entity."

    # Create a Transformer
    class AutoFixTransformer(ast.NodeTransformer):
        def __init__(self):
            self.replaced = False

        def visit_FunctionDef(self, node):
            if node.name == entity_name:
                self.replaced = True
                return candidate_node
            return node
            
        def visit_ClassDef(self, node):
            if node.name == entity_name:
                self.replaced = True
                return candidate_node
            return node

    transformer = AutoFixTransformer()
    new_tree = transformer.visit(tree)
    ast.fix_missing_locations(new_tree)

    if not transformer.replaced:
        return False, "Patch rejected: target entity not found in file."

    # Convert AST back to source code
    modified_code = astor.to_source(new_tree)

    try:
        ast.parse(modified_code)
    except Exception as exc:
        return False, f"Patch rejected: invalid transformed code ({exc})."

    with open(full_path, "w") as f:
        f.write(modified_code)

    test_cmd = os.getenv("MUTATION_TEST_COMMAND", "").strip()
    if test_cmd:
        timeout = int(os.getenv("MUTATION_TEST_TIMEOUT_SECONDS", "300"))
        result = subprocess.run(
            test_cmd,
            shell=True,
            cwd=working_root,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        if result.returncode != 0:
            with open(full_path, "w") as f:
                f.write(original_source)
            return False, "Patch rejected: validation command failed."
    
    return True, "Patch applied."

if __name__ == "__main__":
    # Test
    test_file = "test_evolve.py"
    if os.path.exists(test_file):
        print(f"🧬 Testing AutoFix on {test_file}...")
        test_code = "def biology():\n    print('Optimized Life')"
        success, message = apply_patch(test_file, "biology", test_code)
        print(f"{'✅' if success else '❌'} {message}")
