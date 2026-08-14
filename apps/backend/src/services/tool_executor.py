"""
Tool execution service for BountyFlow

Handles safe execution of pentesting tools with proper isolation and monitoring
"""

import asyncio
import logging
import subprocess
import tempfile
import os
import json
import uuid
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

logger = logging.getLogger(__name__)

@dataclass
class ToolExecutionContext:
    """Context for tool execution"""
    tool_id: int
    project_id: int
    target_id: Optional[int]
    user_id: int
    parameters: Dict[str, Any]
    execution_id: str
    working_directory: str

@dataclass
class ToolExecutionResult:
    """Result of tool execution"""
    success: bool
    exit_code: int
    stdout: str
    stderr: str
    execution_time: float
    output_files: List[str]
    metadata: Dict[str, Any]

class ToolExecutor:
    """Main tool execution service"""

    def __init__(self):
        self.active_executions = {}
        self.execution_timeout = 300  # 5 minutes default timeout

    async def execute_tool_chain(
        self,
        project_id: int,
        tool_chain: List[Dict[str, Any]],
        user_id: int,
        global_parameters: Dict[str, Any] = None
    ) -> Dict[str, Any]:
        """Execute a chain of tools"""
        execution_id = str(uuid.uuid4())
        results = {}
        start_time = datetime.utcnow()

        try:
            for i, tool_config in enumerate(tool_chain):
                tool_id = tool_config.get("tool_id")
                target_id = tool_config.get("target_id")
                parameters = {**global_parameters, **tool_config.get("parameters", {})}

                # Execute individual tool
                result = await self.execute_single_tool(
                    ToolExecutionContext(
                        tool_id=tool_id,
                        project_id=project_id,
                        target_id=target_id,
                        user_id=user_id,
                        parameters=parameters,
                        execution_id=f"{execution_id}_{i}",
                        working_directory=f"/tmp/bountyflow/{execution_id}"
                    )
                )

                results[f"tool_{tool_id}"] = {
                    "success": result.success,
                    "exit_code": result.exit_code,
                    "execution_time": result.execution_time,
                    "output_files": result.output_files
                }

                # Stop chain if tool failed and chain is configured to stop on failure
                if not result.success and tool_config.get("stop_on_failure", False):
                    break

        except Exception as e:
            logger.error(f"Tool chain execution failed: {str(e)}")
            results["error"] = str(e)

        return {
            "execution_id": execution_id,
            "start_time": start_time.isoformat(),
            "results": results,
            "total_tools": len(tool_chain)
        }

    async def execute_single_tool(self, context: ToolExecutionContext) -> ToolExecutionResult:
        """Execute a single tool safely"""
        start_time = asyncio.get_event_loop().time()

        # Create working directory
        os.makedirs(context.working_directory, exist_ok=True)

        try:
            # Get tool configuration (simplified - would fetch from database)
            tool_config = await self.get_tool_config(context.tool_id)

            # Build command
            command = self.build_command(tool_config, context)

            # Execute command safely
            result = await self.execute_command_safely(command, context)

            # Parse results
            metadata = self.parse_tool_output(result.stdout, result.stderr, tool_config)

            return ToolExecutionResult(
                success=result.exit_code == 0,
                exit_code=result.exit_code,
                stdout=result.stdout,
                stderr=result.stderr,
                execution_time=asyncio.get_event_loop().time() - start_time,
                output_files=result.output_files,
                metadata=metadata
            )

        except Exception as e:
            logger.error(f"Tool execution failed: {str(e)}")
            return ToolExecutionResult(
                success=False,
                exit_code=-1,
                stdout="",
                stderr=str(e),
                execution_time=asyncio.get_event_loop().time() - start_time,
                output_files=[],
                metadata={"error": str(e)}
            )

    async def get_tool_config(self, tool_id: int) -> Dict[str, Any]:
        """Get tool configuration from database"""
        # TODO: Implement database lookup
        # For now, return a sample configuration
        return {
            "id": tool_id,
            "name": "nmap",
            "command_template": "nmap -sV -O {target} -oN {output_file}",
            "parameters": {
                "target": {"type": "string", "required": True},
                "output_file": {"type": "string", "required": True}
            },
            "category": "scanning",
            "timeout": 300
        }

    def build_command(self, tool_config: Dict[str, Any], context: ToolExecutionContext) -> str:
        """Build the actual command to execute"""
        template = tool_config["command_template"]

        # Replace parameters
        for param_name, param_config in tool_config["parameters"].items():
            value = context.parameters.get(param_name, "")
            template = template.replace(f"{{{param_name}}}", str(value))

        # Replace context variables
        replacements = {
            "{target}": context.parameters.get("target", ""),
            "{project_id}": str(context.project_id),
            "{execution_id}": context.execution_id,
            "{working_dir}": context.working_directory,
            "{output_file}": f"{context.working_directory}/output.txt"
        }

        for placeholder, value in replacements.items():
            template = template.replace(placeholder, value)

        return template

    async def execute_command_safely(
        self,
        command: str,
        context: ToolExecutionContext
    ) -> subprocess.CompletedProcess:
        """Execute command in a safe environment"""

        # Create a restricted environment
        env = os.environ.copy()
        env['PATH'] = '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'

        # Add some restrictions
        env['TMPDIR'] = context.working_directory
        env['HOME'] = context.working_directory

        try:
            # Execute with timeout
            result = await asyncio.wait_for(
                asyncio.get_event_loop().run_in_executor(
                    None,
                    lambda: subprocess.run(
                        command,
                        shell=True,
                        capture_output=True,
                        text=True,
                        cwd=context.working_directory,
                        env=env,
                        timeout=self.execution_timeout
                    )
                ),
                timeout=self.execution_timeout
            )

            return result

        except asyncio.TimeoutError:
            raise Exception(f"Tool execution timed out after {self.execution_timeout} seconds")

    def parse_tool_output(
        self,
        stdout: str,
        stderr: str,
        tool_config: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Parse tool output and extract useful information"""
        metadata = {
            "tool_name": tool_config["name"],
            "category": tool_config["category"],
            "timestamp": datetime.utcnow().isoformat()
        }

        # Tool-specific parsing logic would go here
        if tool_config["name"] == "nmap":
            metadata.update(self.parse_nmap_output(stdout))

        return metadata

    def parse_nmap_output(self, output: str) -> Dict[str, Any]:
        """Parse nmap output for useful information"""
        findings = {
            "open_ports": [],
            "services": [],
            "os_info": None
        }

        # Simple parsing - in production, use a proper nmap parser
        lines = output.split('\n')
        for line in lines:
            if 'open' in line and 'tcp' in line:
                findings["open_ports"].append(line.strip())

        return findings

    async def cleanup_execution(self, execution_id: str):
        """Clean up after tool execution"""
        working_dir = f"/tmp/bountyflow/{execution_id}"

        try:
            import shutil
            if os.path.exists(working_dir):
                shutil.rmtree(working_dir)
                logger.info(f"Cleaned up execution directory: {working_dir}")
        except Exception as e:
            logger.warning(f"Failed to cleanup execution directory: {str(e)}")

    def validate_tool_parameters(self, tool_config: Dict[str, Any], parameters: Dict[str, Any]) -> bool:
        """Validate tool parameters"""
        required_params = [
            name for name, config in tool_config["parameters"].items()
            if config.get("required", False)
        ]

        for param in required_params:
            if param not in parameters:
                return False

        return True


