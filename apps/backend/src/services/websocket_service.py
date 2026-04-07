from fastapi import WebSocket
from typing import List, Dict, Any
import json
import logging

logger = logging.getLogger(__name__)

class WebSocketManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self.project_connections: Dict[int, List[WebSocket]] = {}
        self.execution_connections: Dict[int, WebSocket] = {}  # execution_id -> WebSocket
    
    async def connect(self, websocket: WebSocket, project_id: int = None):
        await websocket.accept()
        self.active_connections.append(websocket)
        
        if project_id:
            if project_id not in self.project_connections:
                self.project_connections[project_id] = []
            self.project_connections[project_id].append(websocket)
        
        logger.info(f"WebSocket connected. Total connections: {len(self.active_connections)}")
    
    def disconnect(self, websocket: WebSocket, project_id: int = None):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        
        if project_id and project_id in self.project_connections:
            if websocket in self.project_connections[project_id]:
                self.project_connections[project_id].remove(websocket)
        
        logger.info(f"WebSocket disconnected. Total connections: {len(self.active_connections)}")
    
    async def send_personal_message(self, message: str, websocket: WebSocket):
        try:
            await websocket.send_text(message)
        except Exception as e:
            logger.error(f"Failed to send personal message: {e}")
    
    async def broadcast_to_project(self, project_id: int, message: Dict[str, Any]):
        """Broadcast message to all connections for a specific project"""
        if project_id in self.project_connections:
            message_str = json.dumps(message)
            disconnected = []
            
            for websocket in self.project_connections[project_id]:
                try:
                    await websocket.send_text(message_str)
                except Exception as e:
                    logger.error(f"Failed to send message to project {project_id}: {e}")
                    disconnected.append(websocket)
            
            # Clean up disconnected connections
            for websocket in disconnected:
                self.disconnect(websocket, project_id)
    
    async def broadcast_graph_update(self, project_id: int, update_type: str, data: Dict[str, Any]):
        """Broadcast knowledge graph update message"""
        message = {
            "type": "graph_update",
            "project_id": project_id,
            "update_type": update_type,
            "data": data,
            "timestamp": data.get("timestamp")
        }
        
        await self.broadcast_to_project(project_id, message)
        logger.info(f"Broadcasted graph update for project {project_id}: {update_type}")
    
    async def broadcast_node_added(self, project_id: int, node_data: Dict[str, Any]):
        """Broadcast node added message"""
        message = {
            "type": "node_added",
            "project_id": project_id,
            "node": node_data,
            "timestamp": node_data.get("timestamp")
        }
        
        await self.broadcast_to_project(project_id, message)
        logger.info(f"Broadcasted node added for project {project_id}: {node_data.get('id')}")
    
    async def broadcast_node_updated(self, project_id: int, node_data: Dict[str, Any]):
        """Broadcast node updated message"""
        message = {
            "type": "node_updated",
            "project_id": project_id,
            "node": node_data,
            "timestamp": node_data.get("timestamp")
        }
        
        await self.broadcast_to_project(project_id, message)
        logger.info(f"Broadcasted node updated for project {project_id}: {node_data.get('id')}")
    
    async def broadcast_relationship_added(self, project_id: int, relationship_data: Dict[str, Any]):
        """Broadcast relationship added message"""
        message = {
            "type": "relationship_added",
            "project_id": project_id,
            "relationship": relationship_data,
            "timestamp": relationship_data.get("timestamp")
        }
        
        await self.broadcast_to_project(project_id, message)
        logger.info(f"Broadcasted relationship added for project {project_id}: {relationship_data.get('id')}")
    
    async def connect_execution(self, websocket: WebSocket, execution_id: int):
        """Connect a WebSocket for tool execution streaming"""
        # Note: websocket.accept() must be called in the route handler before calling this method
        # This method just registers the connection in our manager
        self.execution_connections[execution_id] = websocket
        logger.info(f"Execution WebSocket connected for execution_id: {execution_id}")
    
    def disconnect_execution(self, execution_id: int):
        """Disconnect a WebSocket for tool execution"""
        if execution_id in self.execution_connections:
            del self.execution_connections[execution_id]
            logger.info(f"Execution WebSocket disconnected for execution_id: {execution_id}")
    
    async def send_execution_output(self, execution_id: int, output: str, output_type: str = "stdout"):
        """Send output to execution WebSocket"""
        if execution_id not in self.execution_connections:
            logger.warning(f"[WebSocketManager] No WebSocket connection found for execution_id: {execution_id}")
            return
        
        websocket = self.execution_connections[execution_id]
        
        # Check if WebSocket is still open (FastAPI uses client_state enum)
        try:
            # FastAPI WebSocket states: 0=CONNECTING, 1=CONNECTED, 2=DISCONNECTED
            if hasattr(websocket, 'client_state'):
                state_value = websocket.client_state.value if hasattr(websocket.client_state, 'value') else websocket.client_state
                if state_value != 1:  # Not CONNECTED
                    logger.warning(f"[WebSocketManager] WebSocket for execution_id {execution_id} is not in CONNECTED state (state: {state_value})")
                    return
        except Exception as e:
            # If we can't check state, try to send anyway
            logger.debug(f"[WebSocketManager] Could not check WebSocket state: {e}")
        
        try:
            message = {
                "type": "execution_output",
                "execution_id": execution_id,
                "output": output,
                "output_type": output_type  # stdout or stderr
            }
            message_str = json.dumps(message)
            logger.debug(f"[WebSocketManager] Sending output to execution {execution_id}: {output[:50]}... (type: {output_type})")
            await websocket.send_text(message_str)
        except Exception as e:
            logger.error(f"[WebSocketManager] Failed to send execution output for {execution_id}: {e}", exc_info=True)
            # Don't disconnect immediately - might be a transient error
            # Only disconnect if it's a connection error
            if "closed" in str(e).lower() or "disconnect" in str(e).lower():
                logger.warning(f"[WebSocketManager] WebSocket appears closed, disconnecting execution {execution_id}")
                self.disconnect_execution(execution_id)
    
    async def send_execution_status(self, execution_id: int, status: str, metadata: Dict[str, Any] = None):
        """Send execution status update"""
        if execution_id in self.execution_connections:
            try:
                message = {
                    "type": "execution_status",
                    "execution_id": execution_id,
                    "status": status,
                    "metadata": metadata or {}
                }
                await self.execution_connections[execution_id].send_text(json.dumps(message))
            except Exception as e:
                logger.error(f"Failed to send execution status for {execution_id}: {e}")
                self.disconnect_execution(execution_id)

# Global WebSocket manager instance
websocket_manager = WebSocketManager()


