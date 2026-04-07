"""
Workflow engine for BountyFlow

Provides n8n-like functionality for creating and executing tool workflows
"""

import logging
import json
from typing import Dict, List, Optional, Any, Callable
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum

logger = logging.getLogger(__name__)

class NodeType(str, Enum):
    """Types of workflow nodes"""
    TOOL = "tool"
    CONDITION = "condition"
    LOOP = "loop"
    PARALLEL = "parallel"
    MERGE = "merge"
    START = "start"
    END = "end"

class ExecutionStatus(str, Enum):
    """Workflow execution status"""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"

@dataclass
class WorkflowNode:
    """Represents a node in the workflow"""
    id: str
    type: NodeType
    name: str
    parameters: Dict[str, Any] = field(default_factory=dict)
    position: Dict[str, float] = field(default_factory=dict)  # x, y coordinates
    connections: List[str] = field(default_factory=list)  # Connected node IDs

@dataclass
class WorkflowExecution:
    """Represents a workflow execution"""
    id: str
    workflow_id: str
    status: ExecutionStatus
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    results: Dict[str, Any] = field(default_factory=dict)
    current_node: Optional[str] = None

class WorkflowEngine:
    """Main workflow engine"""

    def __init__(self):
        self.workflows = {}
        self.executions = {}
        self.node_handlers = {
            NodeType.TOOL: self.execute_tool_node,
            NodeType.CONDITION: self.execute_condition_node,
            NodeType.LOOP: self.execute_loop_node,
            NodeType.PARALLEL: self.execute_parallel_node,
            NodeType.MERGE: self.execute_merge_node,
        }

    def create_workflow(self, name: str, description: str = "") -> str:
        """Create a new workflow"""
        workflow_id = f"workflow_{len(self.workflows) + 1}"

        self.workflows[workflow_id] = {
            "id": workflow_id,
            "name": name,
            "description": description,
            "nodes": {},
            "connections": [],
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat()
        }

        logger.info(f"Created workflow: {workflow_id}")
        return workflow_id

    def add_node(self, workflow_id: str, node: WorkflowNode) -> bool:
        """Add a node to a workflow"""
        if workflow_id not in self.workflows:
            return False

        self.workflows[workflow_id]["nodes"][node.id] = node.__dict__
        self.workflows[workflow_id]["updated_at"] = datetime.utcnow().isoformat()

        logger.info(f"Added node {node.id} to workflow {workflow_id}")
        return True

    def remove_node(self, workflow_id: str, node_id: str) -> bool:
        """Remove a node from a workflow"""
        if workflow_id not in self.workflows or node_id not in self.workflows[workflow_id]["nodes"]:
            return False

        # Remove node and its connections
        del self.workflows[workflow_id]["nodes"][node_id]

        # Remove connections involving this node
        self.workflows[workflow_id]["connections"] = [
            conn for conn in self.workflows[workflow_id]["connections"]
            if node_id not in conn
        ]

        self.workflows[workflow_id]["updated_at"] = datetime.utcnow().isoformat()
        return True

    def connect_nodes(self, workflow_id: str, source_id: str, target_id: str) -> bool:
        """Connect two nodes in a workflow"""
        if workflow_id not in self.workflows:
            return False

        if source_id not in self.workflows[workflow_id]["nodes"]:
            return False

        if target_id not in self.workflows[workflow_id]["nodes"]:
            return False

        # Check if connection already exists
        for conn in self.workflows[workflow_id]["connections"]:
            if conn[0] == source_id and conn[1] == target_id:
                return True  # Already connected

        self.workflows[workflow_id]["connections"].append([source_id, target_id])
        self.workflows[workflow_id]["updated_at"] = datetime.utcnow().isoformat()

        # Update node connections
        source_node = self.workflows[workflow_id]["nodes"][source_id]
        if target_id not in source_node["connections"]:
            source_node["connections"].append(target_id)

        return True

    def get_workflow(self, workflow_id: str) -> Optional[Dict[str, Any]]:
        """Get a workflow by ID"""
        return self.workflows.get(workflow_id)

    def list_workflows(self) -> List[Dict[str, Any]]:
        """List all workflows"""
        return list(self.workflows.values())

    async def execute_workflow(
        self,
        workflow_id: str,
        project_id: int,
        user_id: int,
        parameters: Dict[str, Any] = None
    ) -> str:
        """Execute a workflow"""
        if workflow_id not in self.workflows:
            raise ValueError(f"Workflow {workflow_id} not found")

        execution_id = f"exec_{workflow_id}_{len(self.executions) + 1}"

        execution = WorkflowExecution(
            id=execution_id,
            workflow_id=workflow_id,
            status=ExecutionStatus.PENDING
        )

        self.executions[execution_id] = execution

        # Execute in background
        asyncio.create_task(
            self._execute_workflow_async(execution_id, project_id, user_id, parameters or {})
        )

        return execution_id

    async def _execute_workflow_async(
        self,
        execution_id: str,
        project_id: int,
        user_id: int,
        parameters: Dict[str, Any]
    ):
        """Execute workflow asynchronously"""
        execution = self.executions[execution_id]
        execution.status = ExecutionStatus.RUNNING
        execution.start_time = datetime.utcnow()

        try:
            workflow = self.workflows[execution.workflow_id]

            # Find start node
            start_nodes = [
                node_id for node_id, node in workflow["nodes"].items()
                if node["type"] == NodeType.START
            ]

            if not start_nodes:
                raise ValueError("No start node found in workflow")

            # Execute workflow starting from start node
            await self._execute_from_node(
                execution_id, start_nodes[0], project_id, user_id, parameters
            )

            execution.status = ExecutionStatus.COMPLETED

        except Exception as e:
            logger.error(f"Workflow execution failed: {str(e)}")
            execution.status = ExecutionStatus.FAILED
            execution.results["error"] = str(e)

        finally:
            execution.end_time = datetime.utcnow()

    async def _execute_from_node(
        self,
        execution_id: str,
        node_id: str,
        project_id: int,
        user_id: int,
        parameters: Dict[str, Any]
    ):
        """Execute workflow from a specific node"""
        execution = self.executions[execution_id]
        workflow = self.workflows[execution.workflow_id]

        if node_id not in workflow["nodes"]:
            raise ValueError(f"Node {node_id} not found")

        execution.current_node = node_id
        node = workflow["nodes"][node_id]

        # Execute node
        result = await self.node_handlers[NodeType(node["type"])](
            execution_id, node, project_id, user_id, parameters
        )

        execution.results[node_id] = result

        # Continue to next nodes if execution was successful
        if result.get("success", False):
            next_nodes = self._get_next_nodes(workflow, node_id)

            for next_node_id in next_nodes:
                await self._execute_from_node(
                    execution_id, next_node_id, project_id, user_id, parameters
                )

    def _get_next_nodes(self, workflow: Dict[str, Any], node_id: str) -> List[str]:
        """Get next nodes connected to the current node"""
        next_nodes = []

        for connection in workflow["connections"]:
            if connection[0] == node_id:
                next_nodes.append(connection[1])

        return next_nodes

    async def execute_tool_node(
        self,
        execution_id: str,
        node: Dict[str, Any],
        project_id: int,
        user_id: int,
        parameters: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Execute a tool node"""
        from .tool_executor import ToolExecutor

        tool_executor = ToolExecutor()

        # Get tool configuration
        tool_id = node["parameters"].get("tool_id")
        if not tool_id:
            return {"success": False, "error": "No tool_id specified"}

        # Execute tool
        context = ToolExecutionContext(
            tool_id=tool_id,
            project_id=project_id,
            target_id=node["parameters"].get("target_id"),
            user_id=user_id,
            parameters={**parameters, **node["parameters"]},
            execution_id=execution_id,
            working_directory=f"/tmp/bountyflow/{execution_id}"
        )

        result = await tool_executor.execute_single_tool(context)

        return {
            "success": result.success,
            "exit_code": result.exit_code,
            "execution_time": result.execution_time,
            "output": result.stdout,
            "error": result.stderr,
            "metadata": result.metadata
        }

    async def execute_condition_node(
        self,
        execution_id: str,
        node: Dict[str, Any],
        project_id: int,
        user_id: int,
        parameters: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Execute a condition node"""
        # Evaluate condition based on previous results
        condition = node["parameters"].get("condition", "")

        # Simple condition evaluation (can be extended)
        if "success" in parameters and parameters["success"]:
            return {"success": True, "condition_met": True}
        else:
            return {"success": True, "condition_met": False}

    async def execute_loop_node(
        self,
        execution_id: str,
        node: Dict[str, Any],
        project_id: int,
        user_id: int,
        parameters: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Execute a loop node"""
        # Simplified loop implementation
        max_iterations = node["parameters"].get("max_iterations", 3)
        results = []

        for i in range(max_iterations):
            # Execute child nodes
            child_results = await self._execute_child_nodes(
                execution_id, node, project_id, user_id, parameters
            )
            results.append(child_results)

        return {"success": True, "iterations": len(results), "results": results}

    async def execute_parallel_node(
        self,
        execution_id: str,
        node: Dict[str, Any],
        project_id: int,
        user_id: int,
        parameters: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Execute a parallel node"""
        # Execute multiple branches in parallel
        tasks = []

        for child_node_id in self._get_child_nodes(node):
            task = self._execute_from_node(
                execution_id, child_node_id, project_id, user_id, parameters
            )
            tasks.append(task)

        results = await asyncio.gather(*tasks, return_exceptions=True)

        return {"success": True, "parallel_results": results}

    async def execute_merge_node(
        self,
        execution_id: str,
        node: Dict[str, Any],
        project_id: int,
        user_id: int,
        parameters: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Execute a merge node"""
        # Merge results from multiple branches
        merged_data = {}

        # Collect data from previous nodes
        for prev_node_id in self._get_previous_nodes(node):
            if prev_node_id in parameters:
                merged_data.update(parameters[prev_node_id])

        return {"success": True, "merged_data": merged_data}

    def _get_child_nodes(self, node: Dict[str, Any]) -> List[str]:
        """Get child nodes of a node"""
        # This would be implemented based on the workflow structure
        return []

    def _get_previous_nodes(self, node: Dict[str, Any]) -> List[str]:
        """Get previous nodes of a node"""
        # This would be implemented based on the workflow structure
        return []

    async def _execute_child_nodes(
        self,
        execution_id: str,
        node: Dict[str, Any],
        project_id: int,
        user_id: int,
        parameters: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Execute child nodes of a node"""
        # Simplified implementation
        return {"success": True}

    def get_execution_status(self, execution_id: str) -> Optional[WorkflowExecution]:
        """Get execution status"""
        return self.executions.get(execution_id)

    def cancel_execution(self, execution_id: str) -> bool:
        """Cancel a running execution"""
        if execution_id in self.executions:
            self.executions[execution_id].status = ExecutionStatus.CANCELLED
            return True
        return False


