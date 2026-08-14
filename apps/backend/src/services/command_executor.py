"""
Command executor service for interactive terminal commands
Provides secure command execution with output streaming via WebSocket
"""
import asyncio
import platform
import logging
from typing import Optional
from fastapi import WebSocket
from ..services.websocket_service import websocket_manager
import json

logger = logging.getLogger(__name__)

class CommandExecutor:
    """Handles interactive command execution with security checks"""
    
    # Dangerous commands that should be blocked
    DANGEROUS_COMMANDS = [
        'rm -rf /',
        'format',
        'del /f /s /q',
        'mkfs',
        'dd if=/dev/zero',
    ]
    
    # Commands that are allowed (if using whitelist mode)
    ALLOWED_COMMANDS = [
        'ls', 'pwd', 'cd', 'cat', 'grep', 'find', 'which',
        'whoami', 'hostname', 'uname', 'echo', 'ps', 'netstat',
        'nmap', 'nikto', 'sqlmap', 'gobuster', 'ffuf', 'curl', 'wget',
        'python', 'python3', 'pip', 'pip3',
        'git', 'ssh', 'scp', 'rsync',
        'ping', 'dig', 'nslookup', 'host',
        'head', 'tail', 'less', 'more',
    ]
    
    def __init__(self, execution_id: int, project_id: Optional[int], websocket: WebSocket):
        self.execution_id = execution_id
        self.project_id = project_id
        self.websocket = websocket
        self.active_processes = []
        self.working_directory = None  # Could track cwd per session
    
    def validate_command(self, command: str) -> tuple[bool, str]:
        """
        Validate command for security
        Returns (is_valid, error_message)
        """
        if not command or not command.strip():
            return False, "Empty command"
        
        command_lower = command.lower().strip()
        
        # Check for dangerous commands
        for dangerous in self.DANGEROUS_COMMANDS:
            if dangerous in command_lower:
                return False, f"Command blocked: Contains dangerous pattern '{dangerous}'"
        
        # Basic validation - allow most commands but log them
        # In production, you might want stricter controls
        
        # Check for suspicious patterns
        suspicious_patterns = [
            '> /dev/sd',  # Writing to block devices
            '| nc ',  # Netcat bind shell
            '| bash -i',  # Interactive bash
            '$(',  # Command substitution (could be risky)
            '`',   # Backticks (could be risky)
        ]
        
        for pattern in suspicious_patterns:
            if pattern in command:
                logger.warning(f"Suspicious command pattern detected: {pattern} in command: {command}")
                # Allow but log - adjust based on your security needs
        
        return True, ""
    
    async def execute_command(self, command: str):
        """Execute a command and stream output via WebSocket"""
        import time
        start_time = time.time()
        logger.info(f"[CommandExecutor] Starting execution for command: {command[:100]}")
        
        # Don't send start notification for interactive commands - keep it clean
        # Only initial tool execution shows start info
        
        # Validate command
        is_valid, error_msg = self.validate_command(command)
        if not is_valid:
            error_output = f"Error: {error_msg}\n"
            logger.warning(f"[CommandExecutor] Command validation failed: {error_msg}")
            await websocket_manager.send_execution_output(
                self.execution_id,
                f'\x1b[31m{error_output}\x1b[0m',
                'stderr'
            )
            # Show prompt again
            await websocket_manager.send_execution_output(
                self.execution_id,
                '\x1b[32mattacker\x1b[0m@\x1b[33mbountyflow\x1b[0m\x1b[37m$ \x1b[0m',
                'stdout'
            )
            return
        
        # Log command execution for audit
        logger.info(f"[CommandExecutor] Executing interactive command for execution {self.execution_id}: {command[:100]}")
        
        # Send command echo (already displayed by terminal, but ensure it's there)
        try:
            # Execute command based on OS
            system = platform.system().lower()
            
            # Prepare environment with unbuffered output
            import os
            env = os.environ.copy()
            env['PYTHONUNBUFFERED'] = '1'
            env['UNBUFFERED'] = '1'
            
            if system == 'windows':
                process = await asyncio.create_subprocess_shell(
                    command,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                    shell=True,
                    executable='cmd.exe',
                    cwd=self.working_directory,
                    env=env,
                    bufsize=0  # Unbuffered
                )
            else:
                # Linux/Mac - use script command or unbuffer to force unbuffered output
                import shlex
                
                wrapped_command = None
                
                # Try script command first (most reliable for pseudo-terminal)
                try:
                    check_script = await asyncio.create_subprocess_shell(
                        'which script > /dev/null 2>&1',
                        shell=True
                    )
                    await check_script.wait()
                    if check_script.returncode == 0:
                        # Use script with -q (quiet) and -c to execute command
                        # macOS uses different syntax than Linux
                        if platform.system().lower() == 'darwin':
                            # macOS
                            wrapped_command = f"script -q /dev/null {shlex.quote(command)}"
                        else:
                            # Linux
                            wrapped_command = f"script -q -f -c {shlex.quote(command)} /dev/null"
                except:
                    pass
                
                # If script didn't work, try unbuffer
                if not wrapped_command:
                    try:
                        check_unbuffer = await asyncio.create_subprocess_shell(
                            'which unbuffer > /dev/null 2>&1',
                            shell=True
                        )
                        await check_unbuffer.wait()
                        if check_unbuffer.returncode == 0:
                            wrapped_command = f"unbuffer sh -c {shlex.quote(command)}"
                    except:
                        pass
                
                # If unbuffer didn't work, try stdbuf
                if not wrapped_command:
                    try:
                        check_stdbuf = await asyncio.create_subprocess_shell(
                            'which stdbuf > /dev/null 2>&1',
                            shell=True
                        )
                        await check_stdbuf.wait()
                        if check_stdbuf.returncode == 0:
                            wrapped_command = f"stdbuf -oL -eL bash -c {shlex.quote(command)}"
                    except:
                        pass
                
                # Final fallback: execute directly without wrapper (simplest approach)
                if not wrapped_command:
                    wrapped_command = command
                
                logger.info(f"[CommandExecutor] Executing command: {wrapped_command[:100]}")
                
                # Execute the wrapped command (use shell=True to execute the wrapped command string)
                process = await asyncio.create_subprocess_shell(
                    wrapped_command,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                    shell=True,  # Use shell to execute the wrapped command
                    cwd=self.working_directory,
                    env=env,
                    bufsize=0  # Unbuffered
                )
                
                logger.info(f"[CommandExecutor] Process created with PID: {process.pid}")
            
            self.active_processes.append(process)
            
            # Stream output in real-time (line-by-line for better responsiveness)
            async def read_stream(stream, stream_type):
                """Read from stream line-by-line and send via WebSocket in real-time"""
                buffer = b''
                try:
                    while True:
                        # Read small chunks (64 bytes) to get data as soon as available
                        # This balances responsiveness with efficiency
                        chunk = await stream.read(64)
                        if not chunk:
                            # Flush any remaining buffer
                            if buffer:
                                decoded = buffer.decode('utf-8', errors='ignore')
                                # Strip trailing whitespace from final buffer (spaces/tabs, but keep newlines)
                                decoded = decoded.rstrip(' \t')
                                # Add newline if there's content but no trailing newline
                                if decoded and not decoded.endswith('\n'):
                                    decoded += '\n'
                                if decoded:
                                    logger.debug(f"[CommandExecutor] Sending final buffer: {decoded[:50]}")
                                    await websocket_manager.send_execution_output(
                                        self.execution_id,
                                        decoded,
                                        stream_type
                                    )
                            break
                        
                        buffer += chunk
                        # When we hit a newline or buffer gets large, send it
                        while b'\n' in buffer or len(buffer) >= 256:
                            if b'\n' in buffer:
                                # Complete line available - send it immediately
                                parts = buffer.split(b'\n', 1)
                                line = parts[0] + b'\n'
                                buffer = parts[1]
                                decoded = line.decode('utf-8', errors='ignore')
                                # Send all lines including empty ones (newlines are important for formatting)
                                logger.debug(f"[CommandExecutor] Sending line ({stream_type}): {repr(decoded[:50])}")
                                try:
                                    await websocket_manager.send_execution_output(
                                        self.execution_id,
                                        decoded,
                                        stream_type
                                    )
                                except Exception as send_error:
                                    logger.error(f"[CommandExecutor] Failed to send line: {send_error}", exc_info=True)
                                    break  # Stop reading if we can't send
                            elif len(buffer) >= 256:
                                # Buffer is getting large, send what we have so far
                                decoded = buffer.decode('utf-8', errors='ignore')
                                # Send all chunks including empty ones
                                logger.debug(f"[CommandExecutor] Sending chunk ({stream_type}): {repr(decoded[:50])}")
                                try:
                                    await websocket_manager.send_execution_output(
                                        self.execution_id,
                                        decoded,
                                        stream_type
                                    )
                                except Exception as send_error:
                                    logger.error(f"[CommandExecutor] Failed to send chunk: {send_error}", exc_info=True)
                                    break  # Stop reading if we can't send
                                buffer = b''
                                break
                except Exception as e:
                    logger.error(f"[CommandExecutor] Error reading stream {stream_type}: {e}", exc_info=True)
            
            # Read stdout and stderr concurrently
            logger.info(f"[CommandExecutor] Starting to read stdout/stderr streams for PID {process.pid}")
            
            # Create tasks to read streams
            stdout_task = asyncio.create_task(read_stream(process.stdout, 'stdout'))
            stderr_task = asyncio.create_task(read_stream(process.stderr, 'stderr'))
            
            # Wait for both streams to finish with timeout protection
            try:
                # Use asyncio.wait_for to prevent hanging forever
                await asyncio.wait_for(
                    asyncio.gather(stdout_task, stderr_task, return_exceptions=True),
                    timeout=300  # 5 minute timeout
                )
                logger.info(f"[CommandExecutor] Stream reading completed for PID {process.pid}")
            except asyncio.TimeoutError:
                logger.warning(f"[CommandExecutor] Stream reading timeout for PID {process.pid}")
                stdout_task.cancel()
                stderr_task.cancel()
            except Exception as e:
                logger.error(f"[CommandExecutor] Error reading streams: {e}", exc_info=True)
            
            # Wait for process to complete
            try:
                exit_code = await process.wait()
                logger.info(f"[CommandExecutor] Process completed with exit code: {exit_code}")
            except Exception as e:
                logger.error(f"[CommandExecutor] Error waiting for process: {e}", exc_info=True)
                exit_code = -1
            
            # Remove from active processes
            if process in self.active_processes:
                self.active_processes.remove(process)
            
            # Calculate execution time
            end_time = time.time()
            execution_time = end_time - start_time
            
            # Show prompt again after command completes (ensure newline before prompt)
            logger.info(f"[CommandExecutor] Sending prompt after command completion")
            try:
                # Don't send completion timing message - frontend handles it
                # Just send a newline and the prompt
                await websocket_manager.send_execution_output(
                    self.execution_id,
                    '\r\n\x1b[32mattacker\x1b[0m@\x1b[33mbountyflow\x1b[0m\x1b[37m$ \x1b[0m',
                    'stdout'
                )
                logger.info(f"[CommandExecutor] Prompt sent successfully")
            except Exception as e:
                logger.error(f"[CommandExecutor] Error sending prompt: {e}", exc_info=True)
            
            logger.info(f"[CommandExecutor] Command executed with exit code {exit_code} in {execution_time:.2f}s: {command[:50]}")
            
        except Exception as e:
            logger.error(f"[CommandExecutor] Error executing command '{command}': {e}", exc_info=True)
            error_output = f"Error executing command: {str(e)}\n"
            try:
                await websocket_manager.send_execution_output(
                    self.execution_id,
                    f'\x1b[31m{error_output}\x1b[0m',
                    'stderr'
                )
                # Show prompt again
                await websocket_manager.send_execution_output(
                    self.execution_id,
                    '\x1b[32mattacker\x1b[0m@\x1b[33mbountyflow\x1b[0m\x1b[37m$ \x1b[0m',
                    'stdout'
                )
            except Exception as send_error:
                logger.error(f"[CommandExecutor] Error sending error message: {send_error}", exc_info=True)
    
    async def cleanup(self):
        """Cleanup active processes"""
        for process in self.active_processes:
            try:
                if process.returncode is None:
                    process.terminate()
                    await asyncio.wait_for(process.wait(), timeout=5)
            except asyncio.TimeoutError:
                process.kill()
            except Exception as e:
                logger.error(f"Error cleaning up process: {e}")

