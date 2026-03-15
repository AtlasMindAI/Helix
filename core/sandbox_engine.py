import os
import shutil
import tempfile
import subprocess
from typing import Tuple, Dict, Any
from core.mutation_engine import apply_mutation as raw_apply_mutation

class SandboxEngine:
    """
    SOTA: Digital Twin Staging (Sandbox Engine)
    Research: "Safe Execution Environments for Autonomous Software Repair"
    Validation: Provides an isolated filesystem environment to verify mutations 
    before committing them to the organism's primary DNA.
    """
    def __init__(self, workspace_root: str):
        self.workspace_root = workspace_root

    def create_sandbox(self) -> str:
        """Creates a temporary clone of the workspace excluding heavy non-code artifacts."""
        temp_dir = tempfile.mkdtemp(prefix="helix_sandbox_")
        
        def ignore_patterns(path, names):
            return {
                'node_modules', '.git', '.cache', '__pycache__', 
                '.pytest_cache', 'venv', '.env', 'metadata', 'brain'
            }

        # Clone workspace into sandbox
        shutil.copytree(self.workspace_root, temp_dir, ignore=ignore_patterns, dirs_exist_ok=True)
        return temp_dir

    def run_staged_mutation(self, file_path: str, entity_name: str, proposal: str, test_command: str) -> Dict[str, Any]:
        """
        Executes a mutation in a sandboxed environment and returns the stability metrics.
        """
        sandbox_path = self.create_sandbox()
        stability_score = 0.0
        logs = []
        success = False

        try:
            rel_file_path = os.path.relpath(file_path, self.workspace_root)
            logs.append(f"🛠️ Sandbox: Created Digital Twin at {sandbox_path}")
            
            # 1. Apply mutation in sandbox using the flexible mutation engine
            logs.append(f"🧬 Sandbox: Applying mutation to {entity_name} in {rel_file_path}...")
            # Note: We pass the relative path and the sandbox root to apply_mutation
            mutation_success, msg = raw_apply_mutation(rel_file_path, entity_name, proposal, root_dir=sandbox_path)
            
            if not mutation_success:
                logs.append(f"❌ Sandbox: Mutation application failed: {msg}")
                return {
                    "success": False,
                    "stability_score": 0.0,
                    "logs": logs,
                    "sandbox_path": sandbox_path
                }

            logs.append(f"✅ Sandbox: Mutation applied successfully.")

            # 2. Run Validation in Sandbox
            if test_command:
                logs.append(f"🧪 Sandbox: Running verification: `{test_command}`")
                process = subprocess.run(
                    test_command, 
                    shell=True, 
                    cwd=sandbox_path, 
                    capture_output=True, 
                    text=True,
                    timeout=300
                )
                
                logs.append(f"📊 Sandbox stdout:\n{process.stdout}")
                if process.stderr:
                    logs.append(f"⚠️ Sandbox stderr:\n{process.stderr}")

                if process.returncode == 0:
                    success = True
                    stability_score = 1.0
                    logs.append("✅ Sandbox: Mutation verified. System stable.")
                else:
                    success = False
                    stability_score = 0.0
                    logs.append(f"❌ Sandbox: Verification failed (Exit Code {process.returncode}).")
            else:
                # No test command provided, assume success if it compiled (Mutation engine already check AST)
                success = True
                stability_score = 0.5 # Neutral score without tests
                logs.append("⚠️ Sandbox: No test command provided. Compiler-only verification passed.")

        except Exception as e:
            logs.append(f"❌ Sandbox critical error: {str(e)}")
            stability_score = 0.0
        finally:
            # We keep the sandbox path in the returned dict for debugging and potential promotion
            pass

        return {
            "success": success,
            "stability_score": stability_score,
            "logs": logs,
            "sandbox_path": sandbox_path
        }

if __name__ == "__main__":
    # Test
    engine = SandboxEngine(os.getcwd())
    print(engine.run_staged_mutation(__file__, "dummy", "pass", "echo 'hi'"))
