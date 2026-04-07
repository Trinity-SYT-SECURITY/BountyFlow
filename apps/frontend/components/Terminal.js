import { useEffect, useRef, useState } from 'react';

// Lazy load xterm.js only on client side to avoid SSR issues
let XTerm, FitAddon, WebLinksAddon;
let xtermLoaded = false;

const loadXterm = async () => {
  if (typeof window === 'undefined' || xtermLoaded) return;
  
  try {
    // Use dynamic imports for better Next.js compatibility
    const xtermModule = await import('@xterm/xterm');
    const fitAddonModule = await import('@xterm/addon-fit');
    const webLinksAddonModule = await import('@xterm/addon-web-links');
    
    XTerm = xtermModule.Terminal;
    FitAddon = fitAddonModule.FitAddon;
    WebLinksAddon = webLinksAddonModule.WebLinksAddon;
    
    // CSS will be loaded by Next.js
    // We'll handle CSS import separately if needed
    
    xtermLoaded = true;
  } catch (error) {
    console.error('Failed to load xterm.js:', error);
  }
};

export default function Terminal({ executionId, toolName, onClose }) {
  const terminalRef = useRef(null);
  const terminalInstanceRef = useRef(null);
  const websocketRef = useRef(null);
  const fitAddonRef = useRef(null);
  const currentLineRef = useRef('');
  const isInteractiveModeRef = useRef(false);
  const executionStartTimeRef = useRef(null); // Track execution start time for timing display
  const [isConnected, setIsConnected] = useState(false);
  const [executionStatus, setExecutionStatus] = useState('connecting');
  const lastPolledOutputRef = useRef(''); // Track last polled output to avoid duplicates
  const pollingIntervalRef = useRef(null); // Track polling interval for cleanup
  const displayedOutputLengthRef = useRef(0); // Track how much output has been displayed (from WebSocket or polling)
  const websocketActiveRef = useRef(false); // Track if WebSocket is actively receiving data
  const lastWebSocketOutputTimeRef = useRef(0); // Track when we last received WebSocket output
  
  // Monitor WebSocket connection status periodically
  useEffect(() => {
    const checkConnectionStatus = () => {
      if (websocketRef.current) {
        const ws = websocketRef.current;
        const isOpen = ws.readyState === WebSocket.OPEN;
        setIsConnected(isOpen);
      } else {
        setIsConnected(false);
      }
    };
    
    // Check immediately and then periodically
    checkConnectionStatus();
    const interval = setInterval(checkConnectionStatus, 1000); // Check every second
    
    return () => clearInterval(interval);
  }, [executionId]);

  // Poll execution output to get immediate updates (like debug messages section)
  useEffect(() => {
    if (!executionId || typeof window === 'undefined') return;
    
    const cleanOutput = (text) => {
      if (!text) return '';
      // Remove ANSI escape sequences that might cause issues
      let cleaned = text.replace(/\x1b\[[0-9;]*m/g, '');
      // Normalize line endings (convertEol on xterm handles \n → \r\n)
      cleaned = cleaned.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      return cleaned;
    };
    
    const pollExecutionOutput = async () => {
      const terminal = terminalInstanceRef.current;
      if (!terminal) return;
      
      // Skip polling if WebSocket is actively receiving data (within last 2 seconds)
      const timeSinceLastWebSocket = Date.now() - lastWebSocketOutputTimeRef.current;
      if (websocketActiveRef.current && timeSinceLastWebSocket < 2000) {
        // WebSocket is active, don't poll to avoid duplicates
        return;
      }
      
      try {
        const token = localStorage.getItem('token');
        const headers = {
          'Content-Type': 'application/json',
        };
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
        
        const response = await fetch(`http://localhost:8002/api/v1/tools/executions/${executionId}`, {
          headers
        });
        
        if (response.ok) {
          const execution = await response.json();
          
          // Update execution status
          if (execution.execution_status) {
            setExecutionStatus(execution.execution_status);
          }
          
          // Get current output
          let currentOutput = '';
          if (execution.output) {
            currentOutput += cleanOutput(execution.output);
          }
          if (execution.error_output) {
            const cleanedError = cleanOutput(execution.error_output);
            if (currentOutput && !currentOutput.endsWith('\n')) {
              currentOutput += '\n';
            }
            currentOutput += cleanedError;
          }
          
          // Only display new output that hasn't been shown yet
          // Compare against what's actually been displayed (not just last polled)
          // Only poll if WebSocket hasn't been active recently
          if (currentOutput && currentOutput.length > displayedOutputLengthRef.current) {
            const newOutput = currentOutput.substring(displayedOutputLengthRef.current);
            
            if (newOutput) {
              // Write only the new portion to avoid duplicates with WebSocket output
              terminal.write(newOutput);
              displayedOutputLengthRef.current = currentOutput.length;
              lastPolledOutputRef.current = currentOutput;
              
              // Force scroll to bottom
              try {
                requestAnimationFrame(() => {
                  if (terminal && terminal.buffer && terminal.buffer.active) {
                    const lineCount = terminal.buffer.active.length;
                    if (lineCount > 0) {
                      terminal.scrollToLine(lineCount - 1);
                    }
                  }
                });
              } catch (e) {
                // Ignore scroll errors
              }
            }
          }
          
          // Stop polling if execution is completed
          if (execution.execution_status === 'completed' || execution.execution_status === 'failed') {
            if (pollingIntervalRef.current) {
              clearInterval(pollingIntervalRef.current);
              pollingIntervalRef.current = null;
            }
            // Mark WebSocket as inactive since execution is done
            websocketActiveRef.current = false;
          }
        }
      } catch (error) {
        console.error('Error polling execution output:', error);
      }
    };
    
    // Wait for terminal to be initialized before starting to poll
    const checkTerminalAndPoll = () => {
      const terminal = terminalInstanceRef.current;
      if (!terminal) {
        // Terminal not ready yet, retry after a short delay
        setTimeout(checkTerminalAndPoll, 100);
        return;
      }
      
      // Poll immediately, then every second (same as debug messages)
      pollExecutionOutput();
      pollingIntervalRef.current = setInterval(pollExecutionOutput, 1000);
    };
    
    // Start checking for terminal and polling
    checkTerminalAndPoll();
    
    // Cleanup
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      lastPolledOutputRef.current = '';
      displayedOutputLengthRef.current = 0;
      websocketActiveRef.current = false;
      lastWebSocketOutputTimeRef.current = 0;
    };
  }, [executionId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    // Ensure we have a valid executionId before proceeding
    if (!executionId) {
      console.warn('[Terminal] No executionId provided, skipping initialization');
      return;
    }
    
    // Define initializeTerminal function first so it can be called by initTerminal
    const initializeTerminal = () => {
      if (!terminalRef.current || !XTerm || !FitAddon || !WebLinksAddon) {
        console.error('[Terminal] Cannot initialize: missing dependencies');
        return;
      }

      // Initialize terminal - black background with white text, green prompt
      const terminal = new XTerm({
      fontSize: 13,
      fontFamily: '"Fira Code", "Consolas", "Monaco", "DejaVu Sans Mono", monospace',
      theme: {
        background: '#000000',  // Pure black background
        foreground: '#ffffff',  // White text (readable)
        cursor: '#00ff00',      // Green blinking cursor (Kali style)
        cursorAccent: '#000000',
        selection: '#333333',   // Dark gray selection
        black: '#000000',
        red: '#ff0000',         // Bright red
        green: '#00ff00',       // Bright green (for prompts)
        yellow: '#ffff00',      // Bright yellow
        blue: '#0088ff',        // Bright blue
        magenta: '#ff00ff',     // Bright magenta
        cyan: '#00ffff',        // Bright cyan
        white: '#ffffff',       // White
        brightBlack: '#555555',
        brightRed: '#ff5555',
        brightGreen: '#55ff55', // Bright green
        brightYellow: '#ffff55',
        brightBlue: '#5555ff',
        brightMagenta: '#ff55ff',
        brightCyan: '#55ffff',
        brightWhite: '#ffffff',
      },
      convertEol: true,    // Convert \n to \r\n — prevents staircase rendering of CLI output
      cursorBlink: false,  // Disable cursor blink for read-only
      cursorStyle: 'block',
      lineHeight: 1.1,
      tabStopWidth: 8,     // Standard terminal tab width for CLI output alignment
      disableStdin: true,  // CRITICAL: Disable input - terminal is read-only
      allowProposedApi: true, // Allow newer APIs
      fontWeight: 'normal',
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(webLinksAddon);
    terminal.open(terminalRef.current);

    // Fit terminal to container
    fitAddon.fit();
    
    // Focus the terminal so it can receive input
    terminal.focus();

    terminalInstanceRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // Terminal is read-only - no input handler needed
    // Removed input handling code since disableStdin: true
    
    // Focus terminal for scrolling/viewing purposes only (not for input)
    setTimeout(() => {
      terminal.focus();
    }, 100);

    // Helper function to clean output (remove labels but preserve CLI formatting)
    const cleanOutput = (text) => {
      if (!text) return '';

      // Remove [STDERR] and [STDOUT] labels
      let cleaned = text.replace(/\[STDERR\]/gi, '').replace(/\[STDOUT\]/gi, '');

      // Normalize line endings (convertEol on xterm handles \n → \r\n)
      cleaned = cleaned.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

      // Remove trailing whitespace from each line (but preserve newlines)
      cleaned = cleaned.replace(/[ \t]+$/gm, '');

      // Remove excessive newlines (more than 2 consecutive)
      cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

      return cleaned;
    };

    // Show execution header and shell prompt IMMEDIATELY - don't wait for anything
    // This makes the terminal look interactive right away
    const showInitialShell = async () => {
      // Show header immediately with basic info
      terminal.writeln('\x1b[32m========================================\x1b[0m');
      terminal.writeln(`\x1b[32m[EXECUTION #${executionId}]\x1b[0m \x1b[33m${toolName || 'Tool'}\x1b[0m`);
      terminal.writeln(`\x1b[32mStart Time:\x1b[0m \x1b[33m${new Date().toLocaleString()}\x1b[0m`);
      terminal.writeln(`\x1b[32mStatus:\x1b[0m \x1b[33mstarting\x1b[0m`);
      
      // Fetch command details in background (non-blocking)
      try {
        const response = await fetch(`http://localhost:8002/api/v1/tools/executions/${executionId}`);
        if (response.ok) {
          const details = await response.json();
          
          // Update status
          setExecutionStatus(details.execution_status || 'running');
          
          // Update start time if available
          if (details.created_at) {
            const startTime = new Date(details.created_at).toLocaleString();
            // Replace the start time line (we'll just continue, the command will show below)
            executionStartTimeRef.current = new Date(details.created_at).getTime();
          } else {
            executionStartTimeRef.current = Date.now();
          }
          
          // Show command immediately if available
          const cmd = details.command_executed || details.command;
          if (cmd) {
            // Update the Status line
            terminal.write(`\x1b[32mStatus:\x1b[0m \x1b[33m${details.execution_status || 'running'}\x1b[0m\r\n`);
            terminal.writeln(`\x1b[32mCommand:\x1b[0m \x1b[0m${cmd}\x1b[0m`);
            terminal.writeln('\x1b[32m========================================\x1b[0m');
            terminal.writeln('');
            
            // Show command with prompt format (read-only terminal, visual prompt only)
            terminal.writeln(`\x1b[32mattacker@bountyflow\x1b[0m:\x1b[36m~\x1b[0m$ \x1b[0m${cmd}\x1b[0m`);
          } else {
            // No command yet - show header and wait for command via WebSocket
            terminal.writeln('\x1b[32m========================================\x1b[0m');
            terminal.writeln('');
            terminal.writeln(`\x1b[32mattacker@bountyflow\x1b[0m:\x1b[36m~\x1b[0m$ \x1b[0m`);
          }
          
          // If already completed, show stored output immediately
          if (details.execution_status === 'completed' || details.execution_status === 'failed') {
            let combinedOutput = '';
            if (details.output) {
              combinedOutput += cleanOutput(details.output);
            }
            if (details.error_output) {
              const cleanedError = cleanOutput(details.error_output);
              if (combinedOutput && !combinedOutput.endsWith('\n')) {
                combinedOutput += '\n';
              }
              combinedOutput += '\x1b[31m' + cleanedError + '\x1b[0m';
            }
            
            if (combinedOutput) {
              // Track the output length to prevent duplicates from polling
              displayedOutputLengthRef.current = combinedOutput.length;
              lastPolledOutputRef.current = combinedOutput;
              
              terminal.write(combinedOutput);
              if (!combinedOutput.endsWith('\n')) {
                terminal.writeln('');
              }
            }
            
            // Show end time
            const endTime = details.updated_at ? new Date(details.updated_at).toLocaleString() : new Date().toLocaleString();
            terminal.writeln('');
            terminal.writeln('\x1b[32m========================================\x1b[0m');
            terminal.writeln(`\x1b[32mEnd Time:\x1b[0m \x1b[33m${endTime}\x1b[0m`);
            if (details.created_at && details.updated_at) {
              const startTimeMs = new Date(details.created_at).getTime();
              const endTimeMs = new Date(details.updated_at).getTime();
              const duration = ((endTimeMs - startTimeMs) / 1000).toFixed(2);
              const timeStr = duration < 60 ? `${duration}s` : `${(duration/60).toFixed(2)}m`;
              terminal.writeln(`\x1b[32mDuration:\x1b[0m \x1b[33m${timeStr}\x1b[0m`);
              terminal.writeln(`\x1b[32mExit Code:\x1b[0m \x1b[33m${details.exit_code || 0}\x1b[0m`);
            }
            terminal.writeln('\x1b[32m========================================\x1b[0m');
            terminal.writeln('');
          }
        }
      } catch (error) {
        console.error('Error fetching execution details:', error);
        // Continue anyway - show header even if fetch fails
        terminal.writeln('\x1b[32m========================================\x1b[0m');
        terminal.writeln('');
      }
    };
    
    // Show shell IMMEDIATELY when terminal opens (don't wait for WebSocket or any async operations)
    // Use setTimeout with 0 to ensure it happens after terminal is fully initialized
    setTimeout(() => {
      showInitialShell();
    }, 0);
    
    const loadStoredOutput = async () => {
      // This is now just for connecting WebSocket - shell is already shown
      return false; // Always connect WebSocket for interactive mode
    };

      // Always connect WebSocket for interactive mode (even for completed executions)
      loadStoredOutput().then(loaded => {
        // Improved WebSocket connection with better retry logic
        let retryCount = 0;
        const maxRetries = 5;
        const retryDelay = 1000; // Start with 1 second
        let overallTimeout;
        
        const connectWebSocket = () => {
          const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
          // Get auth token from localStorage
          const token = localStorage.getItem('token');
          // WebSocket path includes /api/v1 prefix from router
          let wsUrl = `${wsProtocol}//localhost:8002/api/v1/ws/execution/${executionId}`;
          if (token) {
            wsUrl += `?token=${encodeURIComponent(token)}`;
          }
          
          // Close existing connection if any
          if (websocketRef.current && websocketRef.current.readyState !== WebSocket.CLOSED) {
            try {
              websocketRef.current.close();
            } catch (e) {
              // Ignore errors when closing
            }
          }
          
          try {
            // Set overall maximum timeout (30 seconds total) - only set once
            if (!overallTimeout) {
              overallTimeout = setTimeout(() => {
                if (retryCount >= maxRetries || (websocketRef.current?.readyState !== WebSocket.OPEN)) {
                  console.error('WebSocket connection exceeded maximum timeout');
                  setExecutionStatus('failed');
                  setIsConnected(false);
                  terminal.writeln('\x1b[31m[ERROR] Connection timeout. Please check if the execution exists and try again.\x1b[0m');
                  if (websocketRef.current && websocketRef.current.readyState !== WebSocket.CLOSED) {
                    try {
                      websocketRef.current.close();
                    } catch (e) {
                      // Ignore
                    }
                  }
                }
              }, 30000); // 30 second overall timeout
            }
            
            const ws = new WebSocket(wsUrl);
            websocketRef.current = ws;
            
            // Set a timeout for connection
            const connectTimeout = setTimeout(() => {
              if (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.CLOSED) {
                console.warn(`WebSocket connection timeout (attempt ${retryCount + 1}/${maxRetries}), retrying...`);
                try {
                  ws.close();
                } catch (e) {
                  // Ignore
                }
                
                if (retryCount < maxRetries) {
                  retryCount++;
                  setTimeout(connectWebSocket, retryDelay * retryCount);
                } else {
                  console.error('WebSocket connection failed after max retries');
                  setExecutionStatus('failed');
                  setIsConnected(false);
                  terminal.writeln('\x1b[31m[ERROR] Failed to connect WebSocket after multiple attempts\x1b[0m');
                }
              }
            }, 5000); // 5 second timeout
            
            ws.onopen = () => {
              clearTimeout(connectTimeout);
              clearTimeout(overallTimeout);
              retryCount = 0; // Reset retry count on success
              console.log('WebSocket connected successfully');
              setIsConnected(true); // Update connection status immediately
              websocketActiveRef.current = true; // Mark WebSocket as active
              lastWebSocketOutputTimeRef.current = Date.now(); // Update last output time
              setupWebSocketHandlers(ws, terminal);
            };
            
            ws.onerror = (error) => {
              clearTimeout(connectTimeout);
              console.error('WebSocket connection error:', error);
              setIsConnected(false); // Update status on error
              
              // Retry with exponential backoff
              if (retryCount < maxRetries) {
                retryCount++;
                const delay = retryDelay * Math.pow(2, retryCount - 1); // Exponential backoff
                console.log(`Retrying WebSocket connection in ${delay}ms (attempt ${retryCount}/${maxRetries})`);
                setTimeout(() => {
                  if (websocketRef.current?.readyState !== WebSocket.OPEN && 
                      websocketRef.current?.readyState !== WebSocket.CONNECTING) {
                    connectWebSocket();
                  }
                }, delay);
              } else {
                // Max retries reached
                clearTimeout(overallTimeout);
                setExecutionStatus('failed');
                setIsConnected(false);
                terminal.writeln('\x1b[31m[ERROR] WebSocket connection failed. Please check backend connection.\x1b[0m');
              }
            };
            
            ws.onclose = (event) => {
              clearTimeout(connectTimeout);
              setIsConnected(false); // Update status on close
              
              // If not a clean close and we haven't exceeded retries, try to reconnect
              if (!event.wasClean && retryCount < maxRetries) {
                console.log(`WebSocket closed unexpectedly, reconnecting... (attempt ${retryCount + 1}/${maxRetries})`);
                retryCount++;
                setTimeout(connectWebSocket, retryDelay * retryCount);
              } else if (event.wasClean) {
                // Clean close means user intentionally disconnected
                console.log('WebSocket closed cleanly');
                setIsConnected(false);
              }
            };
            
          } catch (error) {
            console.error('Failed to create WebSocket:', error);
            // Retry after delay
            if (retryCount < maxRetries) {
              retryCount++;
              setTimeout(connectWebSocket, retryDelay * retryCount);
            } else {
              // Max retries reached in catch block
              clearTimeout(overallTimeout);
              setExecutionStatus('failed');
              setIsConnected(false);
              terminal.writeln('\x1b[31m[ERROR] Failed to create WebSocket connection.\x1b[0m');
            }
          }
        };
        
        // Wait a bit before connecting to ensure execution is ready
        // Reduced delay for faster connection and real-time streaming
        setTimeout(connectWebSocket, loaded ? 50 : 300);  // Faster connection for real-time output
      });
    }; // End of initializeTerminal function
    
    // Load xterm.js first, then wait for DOM element to be ready
    loadXterm().then(() => {
      // Wait for DOM element to be ready
      const initTerminal = () => {
        if (!terminalRef.current) {
          console.log('[Terminal] Terminal ref not ready, retrying...');
          setTimeout(initTerminal, 50);
          return;
        }
        
        if (!XTerm || !FitAddon || !WebLinksAddon) {
          console.log('[Terminal] xterm.js not loaded, retrying...');
          setTimeout(initTerminal, 100);
          return;
        }
        
        // Terminal is ready to initialize
        initializeTerminal();
      };
      
      initTerminal();
    }).catch(error => {
      console.error('[Terminal] Failed to load xterm.js:', error);
    });
    
    const setupWebSocketHandlers = (ws, term) => {
      let commandShown = false;
      let interactiveCommandCount = 0; // Track interactive commands for unique execution IDs

      // Override the onopen that was set during connection
      ws.onopen = () => {
        console.log('WebSocket opened in setupWebSocketHandlers');
        setIsConnected(true);
        setExecutionStatus('running');
        
        // Mark WebSocket as active
        websocketActiveRef.current = true;
        lastWebSocketOutputTimeRef.current = Date.now();
        
        // Terminal is read-only - no interactive mode needed
        isInteractiveModeRef.current = false;
        console.log('WebSocket connected - streaming output');
        
        // Focus terminal for viewing/scrolling purposes
        if (term) {
          term.focus();
        }
        
        // Shell is already shown - WebSocket is just for streaming output
        // If command wasn't shown yet, check for it in status message
        commandShown = true; // Assume it's already shown from initial shell
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          
          // Debug logging for output messages (can help diagnose streaming issues)
          if (message.type === 'execution_output') {
            console.log('[Terminal] Received output:', {
              length: message.output?.length || 0,
              preview: message.output?.substring(0, 50),
              type: message.output_type
            });
          }
          
          if (message.type === 'execution_status') {
            setExecutionStatus(message.status);
            
            // If we get a command in the status message and haven't shown it yet, update it
            if (message.metadata?.command && !commandShown) {
              // Command wasn't shown yet - update the header and show it
              // This is a fallback if the initial fetch didn't have the command
              term.writeln(`\x1b[32mCommand:\x1b[0m \x1b[0m${message.metadata.command}\x1b[0m`);
              term.writeln('\x1b[32m========================================\x1b[0m');
              term.writeln('');
              term.writeln(`\x1b[32mattacker@bountyflow\x1b[0m:\x1b[36m~\x1b[0m$ \x1b[0m${message.metadata.command}\x1b[0m`);
              commandShown = true;
              executionStartTimeRef.current = Date.now();
            }
            
            if (message.status === 'completed' || message.status === 'failed') {
              // Mark WebSocket as inactive since execution is done
              websocketActiveRef.current = false;
              
              // Stop polling immediately to prevent duplicate output
              if (pollingIntervalRef.current) {
                clearInterval(pollingIntervalRef.current);
                pollingIntervalRef.current = null;
              }
              
              // Show end time info (only for initial tool execution, not interactive commands)
              if (executionStartTimeRef.current && commandShown) {
                // This is the initial tool execution completing (commandShown means it was the initial execution)
                const endTime = new Date().toLocaleString();
                const duration = ((Date.now() - executionStartTimeRef.current) / 1000).toFixed(2);
                const timeStr = duration < 60 ? `${duration}s` : `${(duration/60).toFixed(2)}m`;
                const exitCode = message.metadata?.exit_code || 0;
                
                term.writeln('');
                term.writeln('\x1b[32m========================================\x1b[0m');
                term.writeln(`\x1b[32mEnd Time:\x1b[0m \x1b[33m${endTime}\x1b[0m`);
                term.writeln(`\x1b[32mDuration:\x1b[0m \x1b[33m${timeStr}\x1b[0m`);
                term.writeln(`\x1b[32mExit Code:\x1b[0m \x1b[33m${exitCode}\x1b[0m`);
                term.writeln('\x1b[32m========================================\x1b[0m');
                term.writeln('');
                
                executionStartTimeRef.current = null;
              } else if (executionStartTimeRef.current) {
                // Execution completed - clear timer
                executionStartTimeRef.current = null;
              }
              
              // Terminal is read-only - no prompt needed
              isInteractiveModeRef.current = false;
            }
          } else if (message.type === 'execution_output') {
            // Write output IMMEDIATELY as it streams in (real-time line by line)
            let outputText = message.output || '';
            
            // Check if this is the timing/completion message from backend
            const isTimingMessage = outputText.includes('[INFO] Command completed in');
            const isStartMessage = outputText.includes('[INFO] Starting command execution');
            const isInfoMessage = outputText.includes('[INFO]');
            
            if (isInfoMessage && isTimingMessage) {
              // Skip completion timing messages - we handle timing in the status handler
              if (executionStartTimeRef.current) {
                executionStartTimeRef.current = null;
              }
              // Skip displaying the message itself
            } else if (isStartMessage || isInfoMessage) {
              // Skip other INFO messages - they're verbose
              // Don't display them
            } else {
              // Regular output - stream it immediately character by character for real-time feel
              // Don't wait, write as soon as we receive it
              const cleaned = cleanOutput(outputText);
              
              // Mark WebSocket as active and update last output time
              websocketActiveRef.current = true;
              lastWebSocketOutputTimeRef.current = Date.now();
              
              // Track output length for deduplication with polling
              // Use the cleaned length (without ANSI codes) for accurate comparison
              displayedOutputLengthRef.current += cleaned.length;
              
              // Write output immediately without waiting
              // Use write() instead of writeln() to avoid extra newlines and ensure streaming
              if (message.output_type === 'stderr') {
                term.write('\x1b[31m' + cleaned + '\x1b[0m');
              } else {
                term.write(cleaned);
              }
              
              // Force terminal to scroll to bottom when new output arrives
              // This ensures user sees the latest output in real-time
              try {
                // xterm.js scrolls automatically when writing, but we can ensure it
                // Use requestAnimationFrame to ensure DOM updates are visible
                requestAnimationFrame(() => {
                  if (term && term.buffer && term.buffer.active) {
                    const lineCount = term.buffer.active.length;
                    if (lineCount > 0) {
                      term.scrollToLine(lineCount - 1);
                    }
                  }
                });
              } catch (e) {
                // Ignore scroll errors, output is still written
                console.debug('[Terminal] Scroll error (non-critical):', e);
              }
            }
          } else if (message.type === 'pong') {
            // Keep-alive response - do nothing
            return;
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      // Input handler is already attached when terminal was initialized above
      // No need to reattach it here

      ws.onerror = (error) => {
        // Don't show error in terminal immediately - might be a timing issue
        // Errors during connection setup are handled by the connection retry logic
        // Only log to console for debugging
        console.error('WebSocket error:', error);
      };

      ws.onclose = (event) => {
        console.log(`WebSocket closed for execution ${executionId}, wasClean: ${event.wasClean}, code: ${event.code}, reason: ${event.reason}`);
        
        setIsConnected(false); // Update status immediately
        websocketActiveRef.current = false; // Mark WebSocket as inactive
        
        // If it was a clean close (user closed terminal), don't reconnect
        if (event.wasClean && event.code === 1000) {
          console.log(`WebSocket closed cleanly by user for execution ${executionId}`);
          isInteractiveModeRef.current = false;
          return;
        }
        
        // Unexpected close - try to reconnect for streaming output
        console.log(`WebSocket closed unexpectedly, attempting to reconnect for execution ${executionId}`);
        
        // Reconnect for interactive commands (connection will be kept alive by backend)
        const reconnectWebSocket = () => {
          // Don't reconnect if component is unmounting or user closed terminal
          if (!websocketRef.current || websocketRef.current.readyState === WebSocket.CLOSED) {
            // Only reconnect if we don't have an active connection
            try {
              const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
              const token = localStorage.getItem('token');
              let wsUrl = `${wsProtocol}//localhost:8002/api/v1/ws/execution/${executionId}`;
              if (token) {
                wsUrl += `?token=${encodeURIComponent(token)}`;
              }
              
              console.log(`Reconnecting WebSocket to ${wsUrl}`);
              setIsConnected(false); // Set to disconnected while reconnecting
              const newWs = new WebSocket(wsUrl);
              websocketRef.current = newWs;
              
              // Set up basic handlers first
              newWs.onopen = () => {
                console.log('WebSocket reconnected successfully');
                setIsConnected(true); // Update status on successful reconnection
                isInteractiveModeRef.current = false; // Read-only terminal
                setupWebSocketHandlers(newWs, term);
              };
              
              newWs.onerror = (err) => {
                console.error('Reconnection error:', err);
                setIsConnected(false); // Update status on reconnection error
                // Retry reconnection
                setTimeout(reconnectWebSocket, 2000);
              };
              
              newWs.onclose = (closeEvent) => {
                setIsConnected(false); // Update status on reconnection close
                // If not a clean close, try to reconnect again
                if (!closeEvent.wasClean || closeEvent.code !== 1000) {
                  console.log('Reconnected WebSocket closed, retrying...');
                  setTimeout(reconnectWebSocket, 2000);
                }
              };
            } catch (err) {
              console.error('Failed to reconnect WebSocket:', err);
              // Try one more time after delay
              setTimeout(reconnectWebSocket, 2000);
            }
          }
        };
        
        // Reconnect immediately for streaming output (don't wait)
        setTimeout(reconnectWebSocket, 500);
      };
    };

    // Handle window resize
    const handleResize = () => {
      if (fitAddonRef.current) {
        fitAddonRef.current.fit();
      }
    };

    window.addEventListener('resize', handleResize);

    // Cleanup - only close WebSocket when component unmounts (user closes terminal)
    return () => {
      window.removeEventListener('resize', handleResize);
      // Close WebSocket when component unmounts (user explicitly closed terminal)
      if (websocketRef.current) {
        try {
          // Send close frame cleanly
          if (websocketRef.current.readyState === WebSocket.OPEN || 
              websocketRef.current.readyState === WebSocket.CONNECTING) {
            websocketRef.current.close(1000, 'Terminal closed by user');
          }
        } catch (e) {
          // Ignore errors during cleanup
        }
        websocketRef.current = null;
      }
      if (terminalInstanceRef.current) {
        terminalInstanceRef.current.dispose();
      }
    };
  }, [executionId, toolName, executionStatus]);

  return (
    <div className="flex flex-col h-full bg-gray-900">
      {/* Terminal Header with Drag Handle - App theme gray */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-800 border-b border-gray-700 cursor-move">
        <div className="flex items-center gap-3 flex-1">
          {/* Drag Handle */}
          <div className="flex flex-col gap-1 cursor-grab active:cursor-grabbing">
            <div className="w-6 h-0.5 bg-gray-500"></div>
            <div className="w-6 h-0.5 bg-gray-500"></div>
            <div className="w-6 h-0.5 bg-gray-500"></div>
          </div>
          <div className="flex gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500"></div>
            <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
            <div className="w-3 h-3 rounded-full bg-green-500"></div>
          </div>
          <div>
            <span className="text-sm font-medium text-gray-300">{toolName}</span>
            <span className="text-xs text-gray-500 ml-2">Execution #{executionId}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-gray-500'}`}></div>
            <span className={`text-xs ${isConnected ? 'text-green-400' : 'text-gray-500'}`}>
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          {executionStatus && (
            <span className={`text-xs px-2 py-1 rounded ${
              executionStatus === 'running' ? 'bg-yellow-900 text-yellow-300' :
              executionStatus === 'completed' ? 'bg-green-900 text-green-300' :
              executionStatus === 'failed' ? 'bg-red-900 text-red-300' :
              executionStatus === 'connecting' ? 'bg-blue-900 text-blue-300' :
              'bg-gray-700 text-gray-300'
            }`}>
              {executionStatus === 'connecting' ? 'CONNECTING...' : executionStatus.toUpperCase()}
            </span>
          )}
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-lg ml-2 transition-colors"
            title="Close terminal"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Terminal Container */}
      <div 
        className="flex-1 p-2 overflow-hidden"
        onClick={() => {
          // Focus terminal when clicking on container (for scrolling/viewing)
          if (terminalInstanceRef.current) {
            terminalInstanceRef.current.focus();
          }
        }}
        onMouseDown={(e) => {
          // Also focus on mouse down for better UX
          if (terminalInstanceRef.current && e.target === e.currentTarget) {
            terminalInstanceRef.current.focus();
          }
        }}
        tabIndex={0}
        style={{ outline: 'none' }}
      >
        <div ref={terminalRef} className="w-full h-full" style={{ outline: 'none' }} />
      </div>

      {/* Terminal Footer - App theme gray */}
      <div className="px-4 py-2 bg-gray-800 border-t border-gray-700 text-xs text-gray-500">
        <div className="flex items-center justify-between">
          <div>
            <span className="mr-4">Terminal output streaming</span>
            <span>Click ✕ or drag down to close</span>
          </div>
          <div>
            {executionStatus === 'completed' || executionStatus === 'failed' ? (
              <span className="text-gray-400">Execution finished</span>
            ) : (
              <span className="text-yellow-400">Executing...</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

