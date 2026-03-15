import ast
import os
from pathlib import Path
from typing import List, Optional

from .models import ParsedModule, ParsedClass, ParsedFunction, ParsedImport

class PythonParser:
    """The Dissection Engine: Extracts anatomy from Python source."""

    def __init__(self):
        self.ignore_dirs = {"__pycache__", ".git", "venv", ".venv", "temp_repos", "data", "models"}

    def parse_file(self, file_path: str) -> Optional[ParsedModule]:
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                source = f.read()
            tree = ast.parse(source)
        except Exception:
            return None

        module = ParsedModule(
            file_path=file_path,
            name=Path(file_path).stem,
            docstring=ast.get_docstring(tree) or ""
        )

        for node in ast.iter_child_nodes(tree):
            if isinstance(node, (ast.Import, ast.ImportFrom)):
                module.imports.extend(self._extract_imports(node))
            elif isinstance(node, ast.FunctionDef):
                module.functions.append(self._extract_function(node))
            elif isinstance(node, ast.ClassDef):
                module.classes.append(self._extract_class(node))

        return module

    def _extract_imports(self, node) -> List[ParsedImport]:
        imports = []
        if isinstance(node, ast.Import):
            for n in node.names:
                imports.append(ParsedImport(module=n.name, names=[n.asname or n.name], line=node.lineno))
        elif isinstance(node, ast.ImportFrom):
            names = [n.name for n in node.names]
            imports.append(ParsedImport(module=node.module or "", names=names, line=node.lineno))
        return imports

    def _extract_function(self, node: ast.FunctionDef) -> ParsedFunction:
        return ParsedFunction(
            name=node.name,
            docstring=ast.get_docstring(node) or "",
            args=[arg.arg for arg in node.args.args],
            line_start=node.lineno,
            line_end=node.end_lineno or node.lineno
        )

    def _extract_class(self, node: ast.ClassDef) -> ParsedClass:
        bases = []
        for base in node.bases:
            if isinstance(base, ast.Name):
                bases.append(base.id)
            elif isinstance(base, ast.Attribute):
                bases.append(ast.unparse(base))

        methods = []
        for child in node.body:
            if isinstance(child, ast.FunctionDef):
                methods.append(self._extract_function(child))

        return ParsedClass(
            name=node.name,
            docstring=ast.get_docstring(node) or "",
            bases=bases,
            methods=methods,
            line_start=node.lineno,
            line_end=node.end_lineno or node.lineno
        )

    def parse_directory(self, path: str) -> List[ParsedModule]:
        modules = []
        for root, dirs, files in os.walk(path):
            dirs[:] = [d for d in dirs if d not in self.ignore_dirs]
            for file in files:
                if file.endswith(".py"):
                    full_path = os.path.join(root, file)
                    mod = self.parse_file(full_path)
                    if mod:
                        modules.append(mod)
        return modules
