from dataclasses import dataclass, field
from typing import List, Optional

@dataclass
class ParsedImport:
    module: str
    names: List[str] = field(default_factory=list)
    line: int = 0

@dataclass
class ParsedFunction:
    name: str
    docstring: str = ""
    args: List[str] = field(default_factory=list)
    line_start: int = 0
    line_end: int = 0

@dataclass
class ParsedClass:
    name: str
    docstring: str = ""
    bases: List[str] = field(default_factory=list)
    methods: List[ParsedFunction] = field(default_factory=list)
    line_start: int = 0
    line_end: int = 0

@dataclass
class ParsedModule:
    file_path: str
    name: str
    docstring: str = ""
    imports: List[ParsedImport] = field(default_factory=list)
    classes: List[ParsedClass] = field(default_factory=list)
    functions: List[ParsedFunction] = field(default_factory=list)
