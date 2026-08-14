from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from ..services.websocket_service import websocket_manager
from ..middleware.auth import get_current_user
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

@router.websocket("/ws/{project_id}")
async def websocket_endpoint(websocket: WebSocket, project_id: int):
    """WebSocket endpoint for real-time graph updates"""
    await websocket_manager.connect(websocket, project_id)
    
    try:
        while True:
            # Keep the connection active
            data = await websocket.receive_text()
            logger.info(f"Received message from project {project_id}: {data}")
            
            # Here you can process the messages sent by the client
            # For example: node position updates, graph operations, etc.
            
    except WebSocketDisconnect:
        websocket_manager.disconnect(websocket, project_id)
        logger.info(f"WebSocket disconnected for project {project_id}")
    except Exception as e:
        logger.error(f"WebSocket error for project {project_id}: {e}")
        websocket_manager.disconnect(websocket, project_id)


@router.websocket("/ws/execution/{execution_id}")
async def execution_websocket_endpoint(websocket: WebSocket, execution_id: int):
    """WebSocket endpoint for real-time tool execution streaming with interactive command support"""
    # CRITICAL: Accept WebSocket IMMEDIATELY - must be first operation
    # Do NOT access query_params, headers, or do ANY operations before accept()
    await websocket.accept()
    logger.info(f"WebSocket connection accepted for execution_id: {execution_id}")
    
    from ..models.database import async_session
    from ..models.models import ToolExecution
    from sqlalchemy import select
    import json
    import asyncio
    import platform
    from ..services.command_executor import CommandExecutor
    
    # Now we can safely access query parameters and headers (after accept)
    token = None
    
    # Try to get token from query parameters
    try:
        token = websocket.query_params.get("token") if websocket.query_params else None
        # Try to get token from headers if not in query
        if not token and websocket.headers:
            auth_header = websocket.headers.get("authorization", "")
            if auth_header.startswith("Bearer "):
                token = auth_header.replace("Bearer ", "")
    except Exception as e:
        logger.warning(f"Error reading token from WebSocket: {e}")
    
    # Validate token if provided (but don't reject connection if invalid - for dev)
    user = None
    if token:
        try:
            from jose import jwt
            from ..middleware.auth import SECRET_KEY, ALGORITHM
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            user = {"username": payload.get("sub"), "user_id": payload.get("user_id")}
            logger.info(f"WebSocket authenticated as user: {user['username']}")
        except Exception as e:
            logger.warning(f"WebSocket token validation failed: {e}")
            # For development, allow connection even with invalid token
    
    await websocket_manager.connect_execution(websocket, execution_id)
    
    # Get project_id from execution for context
    async with async_session() as db:
        result = await db.execute(select(ToolExecution).where(ToolExecution.id == execution_id))
        execution = result.scalar_one_or_none()
        project_id = execution.project_id if execution else None
    
    command_executor = CommandExecutor(execution_id, project_id, websocket)
    
    try:
        while True:
            # Keep the connection alive and handle any client messages
            data = await websocket.receive_text()
            logger.info(f"[WebSocket] Raw message received for execution {execution_id}: {repr(data[:200])}")
            try:
                message = json.loads(data)
                message_type = message.get("type")
                logger.info(f"[WebSocket] Parsed message - type: '{message_type}', keys: {list(message.keys())}, command field: '{message.get('command', 'NOT_FOUND')}'")
                
                # Handle command type
                if message_type == "command" or (not message_type and "command" in message):
                    # Also handle case where type might be missing but command exists
                    if not message_type and "command" in message:
                        logger.warning(f"[WebSocket] Message missing 'type' field, but has 'command', treating as command")
                    message_type = "command"
                
                if message_type == "command":
                    # Handle interactive command execution
                    command = message.get("command", "").strip()
                    logger.info(f"[WebSocket] Received command from execution {execution_id}: '{command}'")
                    if command:
                        try:
                            logger.info(f"[WebSocket] Calling execute_command for execution {execution_id}")
                            await command_executor.execute_command(command)
                            logger.info(f"[WebSocket] Command execution completed for execution {execution_id}")
                        except Exception as e:
                            logger.error(f"[WebSocket] Error executing command for execution {execution_id}: {e}", exc_info=True)
                            # Try to send error back to client
                            try:
                                error_msg = f"Error executing command: {str(e)}\n"
                                await websocket_manager.send_execution_output(
                                    execution_id,
                                    f'\x1b[31m{error_msg}\x1b[0m',
                                    'stderr'
                                )
                            except Exception as send_err:
                                logger.error(f"[WebSocket] Failed to send error message: {send_err}")
                    else:
                        logger.warning(f"[WebSocket] Empty command received for execution {execution_id}")
                elif message_type == "ping":
                    # Keep-alive ping
                    logger.debug(f"[WebSocket] Received ping from execution {execution_id}")
                    await websocket.send_text(json.dumps({"type": "pong"}))
                else:
                    logger.info(f"[WebSocket] Unknown message type '{message_type}' from execution {execution_id}: {data}")
                    
            except json.JSONDecodeError as e:
                # Legacy: treat raw text as command
                logger.warning(f"[WebSocket] Failed to parse JSON, treating as legacy command: {e}")
                command = data.strip()
                if command:
                    logger.info(f"[WebSocket] Received legacy command from execution {execution_id}: {command}")
                    try:
                        await command_executor.execute_command(command)
                    except Exception as exec_err:
                        logger.error(f"[WebSocket] Error executing legacy command: {exec_err}", exc_info=True)
            except Exception as parse_err:
                # Catch any other parsing errors
                logger.error(f"[WebSocket] Unexpected error parsing message from execution {execution_id}: {parse_err}", exc_info=True)
            
    except WebSocketDisconnect:
        websocket_manager.disconnect_execution(execution_id)
        logger.info(f"Execution WebSocket disconnected for execution_id: {execution_id}")
    except Exception as e:
        logger.error(f"Execution WebSocket error for execution_id {execution_id}: {e}", exc_info=True)
        websocket_manager.disconnect_execution(execution_id)
    finally:
        await command_executor.cleanup()

