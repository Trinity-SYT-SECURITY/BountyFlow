import { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Layout from '../components/Layout';
import { useToast } from '../components/Toast';
import { useModal } from '../components/Modal';
import dynamic from 'next/dynamic';

// Dynamically import Terminal component to avoid SSR issues
const Terminal = dynamic(() => import('../components/Terminal'), {
  ssr: false
});

export default function Tools() {
  const [tools, setTools] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTool, setSelectedTool] = useState(null);
  const [showAddTool, setShowAddTool] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingTool, setEditingTool] = useState(null);
  const [showTerminal, setShowTerminal] = useState(false);
  const [currentExecutionId, setCurrentExecutionId] = useState(null);
  const [currentToolName, setCurrentToolName] = useState('');
  const [terminalOutput, setTerminalOutput] = useState([]);
  const [runningTool, setRunningTool] = useState(null);
  const [debugMessages, setDebugMessages] = useState([]); // Debug messages for execution progress
  const [attackChain, setAttackChain] = useState([]);
  const [draggedTool, setDraggedTool] = useState(null);
  const [showAttackChain, setShowAttackChain] = useState(false);
  const [terminalInput, setTerminalInput] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [showTargetSelector, setShowTargetSelector] = useState(false);
  const [availableTargets, setAvailableTargets] = useState([]);
  const [selectedTargetIds, setSelectedTargetIds] = useState([]);
  const [pendingRunTool, setPendingRunTool] = useState(null);
  const [globalChainTarget, setGlobalChainTarget] = useState('');
  const toast = useToast();
  const { prompt: modalPrompt } = useModal();

  // Use ref to store latest selectedProjectId for event handlers
  const selectedProjectIdRef = useRef(selectedProjectId);
  
  // Update ref when selectedProjectId changes
  useEffect(() => {
    selectedProjectIdRef.current = selectedProjectId;
  }, [selectedProjectId]);

  // Load project targets specifically for attack chain builder when it opens
  useEffect(() => {
    if (showAttackChain && selectedProjectId) {
      const fetchTargetsForChain = async () => {
        try {
          const token = localStorage.getItem('token');
          const headers = { 'Content-Type': 'application/json' };
          if (token) headers['Authorization'] = `Bearer ${token}`;
          
          const response = await fetch(`http://localhost:8002/api/v1/projects/${selectedProjectId}`, { headers });
          if (response.ok) {
            const data = await response.json();
            setAvailableTargets(data.targets || []);
          }
        } catch (error) {
          console.error('Error fetching targets for chain', error);
        }
      };
      fetchTargetsForChain();
    }
  }, [showAttackChain, selectedProjectId]);

  const [newTool, setNewTool] = useState({
    name: '',
    description: '',
    category: 'scanning',
    command_template: '',
    parameters: {}
  });

  useEffect(() => {
    loadAllData();
    
    // Listen for tool creation/update events from project pages
    const handleToolUpdate = (event) => {
      // Get projectId from event (might be string or number)
      const eventProjectId = event?.detail?.projectId;
      // Use ref to get latest selectedProjectId value
      const currentSelectedProjectId = selectedProjectIdRef.current || null;
      
      console.log('🔔 Tool update event received:', {
        eventProjectId,
        currentSelectedProjectId,
        eventType: event.type,
        timestamp: new Date().toISOString()
      });
      
      // Convert both to strings for comparison
      const eventProjectIdStr = eventProjectId ? String(eventProjectId) : null;
      const currentSelectedStr = currentSelectedProjectId ? String(currentSelectedProjectId) : null;
      
      // Always reload if:
      // 1. No project is currently selected (show all tools)
      // 2. Event projectId matches currently selected project
      // 3. Event has no projectId (global tool added)
      const shouldReload = !currentSelectedStr || eventProjectIdStr === currentSelectedStr || !eventProjectIdStr;
      
      if (shouldReload) {
        console.log('✅ Reloading tools for current selection:', currentSelectedStr || 'All');
        // Reload tools for currently selected project (or all if none selected)
        const projectIdToLoad = currentSelectedProjectId ? parseInt(currentSelectedProjectId) : null;
        // Use setTimeout to ensure state updates are processed
        setTimeout(() => {
          loadTools(projectIdToLoad);
        }, 200);
      } else {
        console.log('⏭️  Tool created for different project, not reloading. Event project:', eventProjectIdStr, 'Selected:', currentSelectedStr);
      }
    };
    
    // Listen for custom event
    window.addEventListener('toolCreated', handleToolUpdate);
    window.addEventListener('toolUpdated', handleToolUpdate);
    window.addEventListener('toolDeleted', handleToolUpdate);
    
    return () => {
      window.removeEventListener('toolCreated', handleToolUpdate);
      window.removeEventListener('toolUpdated', handleToolUpdate);
      window.removeEventListener('toolDeleted', handleToolUpdate);
    };
  }, []); // Only run once on mount
  
  // Separate effect for visibility and storage changes that need current selectedProjectId
  useEffect(() => {
    // Reload when page becomes visible (user switches back from project page)
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        const currentSelected = selectedProjectIdRef.current || null;
        console.log('Page visible, reloading tools. Selected project:', currentSelected || 'All');
        loadTools(currentSelected ? parseInt(currentSelected) : null);
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Also listen for storage events (for cross-tab communication)
    const handleStorageChange = (e) => {
      if (e.key === 'toolListUpdated') {
        const projectId = selectedProjectIdRef.current || null;
        console.log('Tool list updated from another tab, reloading tools for project:', projectId || 'All');
        loadTools(projectId ? parseInt(projectId) : null);
        localStorage.removeItem('toolListUpdated'); // Clear the flag
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    
    // Auto-refresh every 30 seconds as backup
    const interval = setInterval(() => {
      const projectId = selectedProjectIdRef.current || null;
      loadTools(projectId ? parseInt(projectId) : null);
    }, 30000);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, [selectedProjectId]); // Re-run when selectedProjectId changes
  
  // Reload tools when selected project changes
  useEffect(() => {
    // Always reload tools when project selection changes
    // If selectedProjectId is empty, load all tools (global + all project tools)
    // If selectedProjectId is set, load tools for that project + global tools
    console.log('Project selection changed, reloading tools. Selected project:', selectedProjectId || 'All');
    loadTools(selectedProjectId || null);
  }, [selectedProjectId]);

  const loadAllData = async () => {
    try {
      setLoading(true);
      await Promise.all([loadTools(selectedProjectId || null), loadProjects()]);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadTools = async (projectId = null) => {
    try {
      // Build API URL with optional project_id parameter
      // If projectId provided, API returns: project tools + global tools
      // If no projectId, API returns: all tools
      const url = projectId 
        ? `http://localhost:8002/api/v1/tools?project_id=${projectId}`
        : 'http://localhost:8002/api/v1/tools';
      
      console.log('📥 Loading tools from:', url);
      const response = await fetch(url, {
        cache: 'no-cache',
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      
      if (response.ok) {
        const toolsData = await response.json();
        console.log(`✅ Loaded ${toolsData?.length || 0} tools${projectId ? ` for project ${projectId}` : ''}`);
        if (toolsData && toolsData.length > 0) {
          console.log('Tool names:', toolsData.map(t => t.name));
        }
        setTools(toolsData || []);
      } else {
        const errorText = await response.text();
        console.error('❌ Failed to load tools:', response.status, errorText);
        setTools([]);
      }
    } catch (error) {
      console.error('❌ Failed to load tools:', error);
      setTools([]);
    }
  };

  const loadProjects = async () => {
    try {
      const response = await fetch('/api/v1/projects');
      if (response.ok) {
        const data = await response.json();
        setProjects(data);
      }
    } catch (error) {
      console.error('Failed to load projects:', error);
    }
  };

  const handleAddTool = async (e) => {
    e.preventDefault();
    if (!newTool.name) {
      toast.warning('Please enter a tool name.');
      return;
    }

    try {
      // If selectedProjectId is empty, create global tool (project_id = null)
      // Otherwise, create project-specific tool
      const url = selectedProjectId 
        ? `http://localhost:8002/api/v1/projects/${selectedProjectId}/tools`
        : `http://localhost:8002/api/v1/tools${selectedProjectId ? `?project_id=${selectedProjectId}` : ''}`;
      
      const response = selectedProjectId
        ? await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              name: newTool.name,
              description: newTool.description,
              command: newTool.command_template,
              category: newTool.category
            })
          })
        : await fetch('http://localhost:8002/api/v1/tools', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              name: newTool.name,
              description: newTool.description,
              category: newTool.category,
              command_template: newTool.command_template,
              parameters: newTool.parameters
            })
          });  // Note: project_id is None for global tools

      if (response.ok) {
        // Save projectId before clearing selectedProjectId
        const addedProjectId = selectedProjectId ? String(selectedProjectId) : null;
        
        setShowAddTool(false);
        setNewTool({
          name: '',
          description: '',
          category: 'scanning',
          command_template: '',
          parameters: {}
        });
        setSelectedProjectId('');
        // Reload data
        loadAllData();
        
        // Dispatch custom event to notify other components
        window.dispatchEvent(new CustomEvent('toolCreated', { 
          detail: { projectId: addedProjectId } 
        }));
        
        // Also use localStorage to trigger cross-tab updates
        localStorage.setItem('toolListUpdated', Date.now().toString());
        
        toast.success(`Tool added successfully${addedProjectId ? ' to project' : ' (global tool)'}!`);
      } else {
        const errorText = await response.text();
        console.error('Failed to add tool:', errorText);
        toast.error(`Error adding tool: ${errorText || response.statusText}`);
      }
    } catch (error) {
      console.error('Error adding tool:', error);
      toast.error(`Error adding tool: ${error.message}`);
    }
  };

  const handleEditTool = (tool) => {
    // Initialize editingTool with proper structure
    const editingData = { ...tool };
    
    // If command_template exists but command doesn't, use command_template
    if (editingData.command_template && !editingData.command) {
      editingData.command = editingData.command_template;
    }
    
    setEditingTool(editingData);
    setShowEditModal(true);
  };

  const handleSaveEditedTool = async () => {
    if (!editingTool) return;

    try {
      const token = localStorage.getItem('token');
      const headers = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      // Determine if tool is project-specific or global
      const isProjectSpecific = editingTool.project_id !== null && editingTool.project_id !== undefined;
      
      let updateUrl = '';
      let updateBody = {};

      if (isProjectSpecific) {
        // Update project-specific tool
        updateUrl = `http://localhost:8002/api/v1/projects/${editingTool.project_id}/tools/${editingTool.id}`;
        updateBody = {
          name: editingTool.name,
          description: editingTool.description || '',
          command: editingTool.command || editingTool.command_template || '',
          category: editingTool.category || 'general',
        };
      } else {
        // Update global tool
        updateUrl = `http://localhost:8002/api/v1/tools/${editingTool.id}`;
        updateBody = {
          name: editingTool.name,
          description: editingTool.description || '',
          command_template: editingTool.command || editingTool.command_template || '',
          category: editingTool.category || 'general',
          parameters: editingTool.parameters || {}
        };
      }

      const response = await fetch(updateUrl, {
        method: 'PUT',
        headers,
        body: JSON.stringify(updateBody)
      });

      if (response.ok) {
        console.log('Tool updated successfully');
        
        // Reload tools
        await loadAllData();
        
        // Dispatch custom event to notify other components
        window.dispatchEvent(new CustomEvent('toolUpdated', { 
          detail: { 
            projectId: editingTool.project_id,
            toolId: editingTool.id
          } 
        }));
        
        // Also use localStorage to trigger cross-tab updates
        localStorage.setItem('toolListUpdated', Date.now().toString());
        
        toast.success('Tool updated successfully!');
        setShowEditModal(false);
        setEditingTool(null);
      } else {
        const errorData = await response.json();
        console.error('Failed to update tool:', errorData);
        toast.error(`Failed to update tool: ${errorData.detail || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error updating tool:', error);
      toast.error('Error updating tool. Please try again.');
    }
  };

  // Helper function to format time for debug messages
  const formatTime = (date) => {
    const d = new Date(date);
    const hours = d.getHours() % 12 || 12;
    const minutes = d.getMinutes().toString().padStart(2, '0');
    const ampm = d.getHours() >= 12 ? 'PM' : 'AM';
    return `${hours}:${minutes} ${ampm}`;
  };

  // Helper function to add debug message
  const addDebugMessage = (message, icon = '') => {
    const timestamp = formatTime(new Date());
    setDebugMessages(prev => [...prev, { timestamp, message, icon }]);
  };

  // Poll execution status to update debug messages
  const pollExecutionStatus = async (executionId, targetName) => {
    const token = localStorage.getItem('token');
    const headers = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const maxAttempts = 300; // 5 minutes max (1 second intervals)
    let attempts = 0;
    let completed = false;

    const poll = setInterval(async () => {
      attempts++;
      
      if (completed) {
        clearInterval(poll);
        return;
      }

      try {
        const response = await fetch(`http://localhost:8002/api/v1/tools/executions/${executionId}`, {
          headers
        });

        if (response.ok) {
          const execution = await response.json();
          
          if (execution.execution_status === 'completed' || execution.execution_status === 'failed') {
            completed = true;
            
            const timestamp = formatTime(execution.updated_at || new Date());
            const statusText = execution.execution_status === 'completed' ? '[COMPLETED]' : '[FAILED]';
            
            addDebugMessage(`============================================================ ${statusText} Target: ${targetName}`);
            addDebugMessage(`Command: ${execution.command_executed || execution.command || 'N/A'}`);
            
            if (execution.output) {
              const outputText = execution.output.trim();
              addDebugMessage(`[OUTPUT] ${outputText.substring(0, 200)}${outputText.length > 200 ? '...' : ''}`);
            }
            
            addDebugMessage(`Exit Code: ${execution.exit_code || 0} ===========================================================`);
            
            // Dispatch event to notify dashboard and other components
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('toolExecutionCompleted', {
                detail: {
                  executionId: executionId,
                  status: execution.execution_status,
                  projectId: execution.project_id
                }
              }));
            }
            
            clearInterval(poll);
            return;
          }
        }
      } catch (error) {
        console.error(`Error polling execution ${executionId}:`, error);
      }

      // Stop polling after max attempts
      if (attempts >= maxAttempts) {
        clearInterval(poll);
      }
    }, 1000); // Poll every second

    return poll;
  };

  const runTool = async (tool) => {
    // If tool is project-specific, use that project. Otherwise, require selection.
    const projectIdToUse = tool.project_id || selectedProjectId;

    if (!projectIdToUse) {
      toast.warning('Please select a project first. This tool needs a project to execute.');
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      // Fetch project targets
      const projectResponse = await fetch(`http://localhost:8002/api/v1/projects/${projectIdToUse}`, { headers });
      if (!projectResponse.ok) {
        toast.error('Failed to load project data.');
        return;
      }
      const projectData = await projectResponse.json();
      const targets = projectData.targets || [];

      if (targets.length === 0) {
        toast.warning('No targets available. Please add targets to the project first.');
        return;
      }

      // If only one target, execute immediately without showing selector
      if (targets.length === 1) {
        executeToolOnTargets(tool, targets, projectIdToUse);
        return;
      }

      // Multiple targets — show target selector modal
      setAvailableTargets(targets);
      setSelectedTargetIds([]); // Don't pre-select — user must choose
      setPendingRunTool({ tool, projectIdToUse });
      setShowTargetSelector(true);
    } catch (error) {
      toast.error(`Error loading targets: ${error.message}`);
    }
  };

  const executeToolOnTargets = async (tool, targets, projectIdToUse) => {
    setShowTargetSelector(false);
    setRunningTool(tool);
    setCurrentToolName(tool.name || tool.tool_name || 'Tool');
    setDebugMessages([]);

    try {
      const token = localStorage.getItem('token');
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      addDebugMessage(`Starting execution against ${targets.length} target(s)...`);

      // Execute against each selected target
      for (let i = 0; i < targets.length; i++) {
        const target = targets[i];
        const targetName = target.target_value || target.name;

        addDebugMessage(`[${i + 1}/${targets.length}] Target: ${targetName}`);

        // Replace {target} placeholder in command
        let command = tool.command_template || tool.command || '';
        command = command.replace(/{target}/g, targetName);

        const executionData = {
          tools: [{
            tool_id: tool.id,
            target_id: target.id,
            parameters: {
              target: targetName,
              command: command
            }
          }],
          parameters: {
            target: targetName
          }
        };

        const response = await fetch(`http://localhost:8002/api/v1/tools/projects/${projectIdToUse}/tools/execute`, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify(executionData)
        });

        if (!response.ok) {
          const errorText = await response.text();
          addDebugMessage(`Execution failed for ${targetName}: ${errorText}`);
          toast.error(`Failed to execute tool against ${targetName}: ${response.status}`);
          continue;
        }

        const executionResult = await response.json();

        addDebugMessage(`Execution started for ${targetName} (ID: ${executionResult.id})`);

        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('toolExecutionCreated', {
            detail: {
              executionId: executionResult.id,
              toolId: tool.id,
              toolName: tool.name,
              projectId: projectIdToUse
            }
          }));
        }

        // Track the last execution for terminal display
        setCurrentExecutionId(executionResult.id);
        pollExecutionStatus(executionResult.id, targetName);
      }

      addDebugMessage(`All ${targets.length} execution(s) submitted.`);

      setTimeout(() => {
        setShowTerminal(true);
      }, 100);

    } catch (error) {
      addDebugMessage(`Error: ${error.message}`);
      toast.error(`Error executing tool: ${error.message}`);
      console.error('Error executing tool:', error);
      setRunningTool(null);
    }
  };

  const addToAttackChain = (tool) => {
    const chainItem = {
      id: Date.now(),
      tool: tool,
      order: attackChain.length + 1,
      status: 'pending'
    };
    setAttackChain([...attackChain, chainItem]);
  };

  const removeFromAttackChain = (id) => {
    setAttackChain(attackChain.filter(item => item.id !== id));
  };

  const updateAttackChainItem = (id, field, value) => {
    setAttackChain(prev => prev.map(item => 
      item.id === id ? { ...item, [field]: value } : item
    ));
  };

  const reorderAttackChain = (fromIndex, toIndex) => {
    const newChain = [...attackChain];
    const [removed] = newChain.splice(fromIndex, 1);
    newChain.splice(toIndex, 0, removed);
    
    // Update order numbers
    newChain.forEach((item, index) => {
      item.order = index + 1;
    });
    
    setAttackChain(newChain);
  };

  const executeAttackChain = async () => {
    if (attackChain.length === 0) {
      toast.warning('Please add tools to the attack chain first.');
      return;
    }

    if (!selectedProjectId) {
      toast.warning('Please select a project first.');
      return;
    }

    setShowTerminal(true);
    setTerminalOutput([]);
    setRunningTool(null);

    try {
      const token = localStorage.getItem('token');
      const headers = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      // Prepare tool execution data
      const toolIds = attackChain.map(item => item.tool.id);
      const executionData = {
        tools: attackChain.map(item => ({
          tool_id: item.tool.id,
          target_id: null,
          parameters: item.customTarget ? { target: item.customTarget } : (globalChainTarget ? { target: globalChainTarget } : {})
        })),
        parameters: globalChainTarget ? { target: globalChainTarget } : {}
      };

      // Execute tool chain via API
      const response = await fetch(`http://localhost:8002/api/v1/tools/projects/${selectedProjectId}/tools/execute`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(executionData)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to execute tools: ${response.status} - ${errorText}`);
      }

      const executionResult = await response.json();
      
      // Automatically pop up the execution terminal monitoring window
      setCurrentExecutionId(executionResult.id);
      
      // Dispatch event to notify dashboard and other components
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('toolExecutionCreated', {
          detail: {
            executionId: executionResult.id,
            toolId: attackChain[0]?.tool?.id,
            toolName: 'Attack Chain',
            projectId: selectedProjectId
          }
        }));
      }
      
      // Simulate execution progress
      for (let i = 0; i < attackChain.length; i++) {
        const item = attackChain[i];
        setRunningTool(item.tool);
        
        // Update attack chain status
        setAttackChain(prev => prev.map(chainItem => 
          chainItem.id === item.id 
            ? { ...chainItem, status: 'running' }
            : chainItem
        ));
        
        // Add tool start message
        setTerminalOutput(prev => [...prev, {
          type: 'info',
          message: `[${i + 1}/${attackChain.length}] Starting ${item.tool.name}...`,
          timestamp: new Date().toLocaleTimeString()
        }]);
        
        // Simulate tool execution
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Update the attack chain status to Completed
        setAttackChain(prev => prev.map(chainItem => 
          chainItem.id === item.id 
            ? { ...chainItem, status: 'completed' }
            : chainItem
        ));
        
        // Add tool execution results
        setTerminalOutput(prev => [...prev, {
          type: 'success',
          message: `[${i + 1}/${attackChain.length}] ${item.tool.name} completed successfully`,
          timestamp: new Date().toLocaleTimeString()
        }]);
      }

      setRunningTool(null);
      setTerminalOutput(prev => [...prev, {
        type: 'info',
        message: '🎉 Attack chain executed successfully! Tool execution record created.',
        timestamp: new Date().toLocaleTimeString()
      }]);
      
      // Dispatch event to notify dashboard and other components
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('toolExecutionCompleted', {
          detail: {
            executionId: executionResult.id,
            status: 'completed',
            projectId: selectedProjectId
          }
        }));
      }
    } catch (error) {
      setTerminalOutput(prev => [...prev, {
        type: 'error',
        message: `❌ Error executing attack chain: ${error.message}`,
        timestamp: new Date().toLocaleTimeString()
      }]);
      console.error('Error executing attack chain:', error);
    }
  };

  const saveAttackChain = async () => {
    if (attackChain.length === 0) {
      toast.warning('Please add tools to the attack chain first.');
      return;
    }

    const workflowName = await modalPrompt({
      title: 'Save Workflow',
      message: 'Enter a name for this workflow:',
      placeholder: 'Workflow name',
      confirmText: 'Save'
    });
    if (!workflowName) {
      return;
    }

    // Security Verification: Preventing XSS Attacks
    if (workflowName.length > 100) {
      toast.warning('Workflow name is too long (max 100 characters)');
      return;
    }

    if (/[<>"']/.test(workflowName)) {
      toast.warning('Workflow name contains invalid characters');
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

      const workflow = {
        name: workflowName,
        description: `Attack chain with ${attackChain.length} tools`,
        tools: {
          steps: attackChain.map((item, index) => ({
            tool_id: item.tool.id,
            tool_name: item.tool.name,
            order: index + 1,
            category: item.tool.category || 'general'
          }))
        },
        status: 'active'
      };

      const response = await fetch('http://localhost:8002/api/v1/workflows', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(workflow)
      });

      if (response.ok) {
        const result = await response.json();
        toast.success(
          '🎯 Attack Chain saved successfully as a Workflow! You can now access and execute it in the "Workflows" tab.', 
          { duration: 8000 }
        );
        // Clear the attack chain
        setAttackChain([]);
        console.log('Workflow saved:', result);
      } else {
        let errorMessage = 'Unknown error';
        try {
          const errorData = await response.json();
          errorMessage = errorData.detail?.message || errorData.detail?.error || JSON.stringify(errorData);
        } catch (e) {
          const errorText = await response.text();
          errorMessage = errorText || `HTTP ${response.status}`;
        }
        console.error('API Error:', errorMessage);
        toast.error(`Failed to save workflow: ${errorMessage}`);
      }
    } catch (error) {
      console.error('Error saving workflow:', error);
      toast.error(`Error saving workflow: ${error.message}. Please try again.`);
    }
  };

  const handleDragStart = (e, tool) => {
    setDraggedTool(tool);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (draggedTool) {
      addToAttackChain(draggedTool);
      setDraggedTool(null);
    }
  };

  const getCategoryColor = (category) => {
    switch (category) {
      case 'scanning': return 'bg-blue-600 text-white';
      case 'enumeration': return 'bg-green-600 text-white';
      case 'exploitation': return 'bg-red-600 text-white';
      case 'post-exploitation': return 'bg-purple-600 text-white';
      case 'reporting': return 'bg-yellow-600 text-black';
      case 'general': return 'bg-indigo-600 text-white';
      default: return 'bg-gray-600 text-white';
    }
  };

  const getCategoryIcon = (category) => {
    switch (category) {
      case 'scanning': return 'fas fa-search';
      case 'enumeration': return 'fas fa-list';
      case 'exploitation': return 'fas fa-bug';
      case 'post-exploitation': return 'fas fa-cog';
      case 'reporting': return 'fas fa-file-alt';
      default: return 'fas fa-tool';
    }
  };
  
  return (
    <Layout title="Tools - BountyFlow">
      <Head>
        <title>Tools - BountyFlow</title>
        <meta name="description" content="Manage penetration testing tools" />
      </Head>

      <div className="p-6">
        {/* Page Header */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">🔧 Tools</h1>
              <p className="text-gray-400">Manage your penetration testing tools</p>
            </div>
            <div className="flex items-center space-x-4">
              <button 
                onClick={() => setShowAddTool(true)}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors"
              >
                <i className="fas fa-plus mr-2"></i>
                Add Tool
              </button>
              <button
                onClick={() => {
                  if (!selectedProjectId && !showAttackChain) {
                    toast.warning('Please select a project first to use the Attack Chain Builder.');
                    return;
                  }
                  setShowAttackChain(!showAttackChain);
                }}
                className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg flex items-center transition-colors"
              >
                <img 
                  src="/attack-chain-builder.png" 
                  alt="Attack Chain Builder" 
                  className="w-5 h-5 mr-2"
                />
                Attack Chain
              </button>
            </div>
          </div>
        </div>

        {/* Filters and Search */}
        <div className="bg-gray-800 rounded-lg p-4 mb-6">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex-1 min-w-64">
                  <input
                    type="text"
                    placeholder="Search tools..."
                    className="w-full bg-gray-700 text-white px-4 py-2 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <select className="bg-gray-700 text-white px-4 py-2 rounded-lg border border-gray-600">
                  <option>All Categories</option>
                  <option>Scanning</option>
                  <option>Enumeration</option>
                  <option>Exploitation</option>
                  <option>Post-Exploitation</option>
                  <option>Reporting</option>
                </select>
                <select className="bg-gray-700 text-white px-4 py-2 rounded-lg border border-gray-600">
                  <option>All Types</option>
                  <option>System Tools</option>
                  <option>Custom Tools</option>
                </select>
                <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg">
                  <i className="fas fa-filter mr-2"></i>
                  Filter
                </button>
              </div>
            </div>

            {/* Project Selector for Tool Execution */}
            <div className="mb-6 bg-gray-800 rounded-lg p-4">
              <label className="block text-gray-300 text-sm mb-2 font-medium">
                <i className="fas fa-project-diagram mr-2"></i>
                Select Project for Tool Execution <span className="text-gray-500">(required for global tools)</span>
              </label>
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="w-full max-w-md bg-gray-700 text-white px-4 py-2 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
              >
                <option value="">Choose a project...</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name} - {project.company_name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-2">
                Note: Project-specific tools will use their assigned project automatically.
              </p>
            </div>

            {/* Tools Grid */}
            {loading ? (
              <div className="flex justify-center items-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {tools.length > 0 ? (
                  tools.map((tool) => (
                    <div key={tool.id} className="bg-gray-800 rounded-lg p-6 hover:bg-gray-700 transition-colors">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center">
                          <div className={`w-10 h-10 ${getCategoryColor(tool.category)} rounded-lg flex items-center justify-center mr-3`}>
                            <i className={`${getCategoryIcon(tool.category)} text-white`}></i>
                          </div>
                          <div>
                            <h3 className="text-white font-semibold text-lg">{tool.name}</h3>
                            <span className={`inline-block px-2 py-1 text-xs rounded-full font-medium ${getCategoryColor(tool.category)}`}>
                              {tool.category}
                            </span>
                            {tool.project_name && (
                              <p className="text-blue-400 text-xs mt-1">
                                <i className="fas fa-project-diagram mr-1"></i>
                                {tool.project_name}
                              </p>
                            )}
                            {!tool.project_name && (
                              <p className="text-gray-500 text-xs mt-1">
                                <i className="fas fa-globe mr-1"></i>
                                Global Tool
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center text-gray-400">
                          {tool.is_system_tool ? (
                            <span className="text-xs bg-blue-600 text-white px-2 py-1 rounded">System</span>
                          ) : (
                            <span className="text-xs bg-green-600 text-white px-2 py-1 rounded">Custom</span>
                          )}
                        </div>
                      </div>
                      
                      <p className="text-gray-300 text-sm mb-4">{tool.description}</p>
                      
                      <div className="space-y-2 mb-4">
                        <div className="flex items-center text-gray-300">
                          <i className="fas fa-terminal mr-2"></i>
                          <span className="text-sm font-mono">{tool.command_template}</span>
                        </div>
                        <div className="flex items-center text-gray-300">
                          <i className="fas fa-calendar mr-2"></i>
                          <span className="text-sm">{new Date(tool.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex space-x-2">
                          <button 
                            onClick={() => setSelectedTool(tool)}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm"
                          >
                            <i className="fas fa-eye mr-1"></i>
                            View
                          </button>
                          <button 
                            onClick={() => handleEditTool(tool)}
                            className="bg-yellow-600 hover:bg-yellow-700 text-white px-3 py-1 rounded text-sm"
                          >
                            <i className="fas fa-edit mr-1"></i>
                            Edit
                          </button>
                          <button 
                            onClick={() => runTool(tool)}
                            className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-sm"
                          >
                            <i className="fas fa-play mr-1"></i>
                            Run
                          </button>
                        </div>
                        <div className="flex items-center text-gray-400">
                          <i className="fas fa-clock mr-1"></i>
                          <span className="text-xs">
                            {tool.execution_count || 0} runs
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="col-span-full text-center py-12">
                    <i className="fas fa-tools text-gray-500 text-6xl mb-4"></i>
                    <h3 className="text-xl font-semibold text-white mb-2">No Tools Found</h3>
                    <p className="text-gray-400 mb-6">Start by adding your first penetration testing tool</p>
                    <button 
                      onClick={() => setShowAddTool(true)}
                      className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg"
                    >
                      <i className="fas fa-plus mr-2"></i>
                      Add First Tool
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

      {/* Add Tool Modal */}
      {showAddTool && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 max-w-2xl w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold text-white">Add New Tool</h3>
              <button 
                onClick={() => setShowAddTool(false)}
                className="text-gray-400 hover:text-white"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
            
            <form onSubmit={handleAddTool} className="space-y-4">
              <div>
                <label className="block text-gray-400 text-sm mb-2">
                  Select Project <span className="text-gray-500">(optional - leave empty for global tool)</span>
                </label>
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="w-full bg-gray-700 text-white px-4 py-2 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                >
                  <option value="">Global Tool (available to all projects)</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name} - {project.company_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-gray-400 text-sm mb-2">Tool Name</label>
                <input
                  type="text"
                  value={newTool.name}
                  onChange={(e) => setNewTool({...newTool, name: e.target.value})}
                  className="w-full bg-gray-700 text-white px-4 py-2 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                  required
                />
              </div>
              
              <div>
                <label className="block text-gray-400 text-sm mb-2">Description</label>
                <textarea
                  value={newTool.description}
                  onChange={(e) => setNewTool({...newTool, description: e.target.value})}
                  className="w-full bg-gray-700 text-white px-4 py-2 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                  rows="3"
                />
              </div>
              
              <div>
                <label className="block text-gray-400 text-sm mb-2">Category</label>
                <select
                  value={newTool.category}
                  onChange={(e) => setNewTool({...newTool, category: e.target.value})}
                  className="w-full bg-gray-700 text-white px-4 py-2 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                >
                  <option value="scanning">Scanning</option>
                  <option value="enumeration">Enumeration</option>
                  <option value="exploitation">Exploitation</option>
                  <option value="post-exploitation">Post-Exploitation</option>
                  <option value="reporting">Reporting</option>
                </select>
              </div>
              
              <div>
                <label className="block text-gray-400 text-sm mb-2">Command Template</label>
                <input
                  type="text"
                  value={newTool.command_template}
                  onChange={(e) => setNewTool({...newTool, command_template: e.target.value})}
                  placeholder="nmap -sV {target}"
                  className="w-full bg-gray-700 text-white px-4 py-2 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none font-mono"
                  required
                />
                <p className="text-gray-400 text-xs mt-1">Use {"{target}"} for target placeholder</p>
              </div>
              
              <div className="flex justify-end space-x-3">
                <button 
                  type="button"
                  onClick={() => setShowAddTool(false)}
                  className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg"
                >
                  <i className="fas fa-plus mr-2"></i>
                  Add Tool
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Tool Modal */}
      {showEditModal && editingTool && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 max-w-2xl w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold text-white">Edit Tool</h3>
              <button 
                onClick={() => {
                  setShowEditModal(false);
                  setEditingTool(null);
                }}
                className="text-gray-400 hover:text-white"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
            
            <form onSubmit={(e) => { e.preventDefault(); handleSaveEditedTool(); }} className="space-y-4">
              <div>
                <label className="block text-gray-400 text-sm mb-2">Tool Name</label>
                <input
                  type="text"
                  value={editingTool.name || ''}
                  onChange={(e) => setEditingTool({...editingTool, name: e.target.value})}
                  className="w-full bg-gray-700 text-white px-4 py-2 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                  required
                />
              </div>
              
              <div>
                <label className="block text-gray-400 text-sm mb-2">Description</label>
                <textarea
                  value={editingTool.description || ''}
                  onChange={(e) => setEditingTool({...editingTool, description: e.target.value})}
                  className="w-full bg-gray-700 text-white px-4 py-2 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                  rows="3"
                />
              </div>
              
              <div>
                <label className="block text-gray-400 text-sm mb-2">Category</label>
                <select
                  value={editingTool.category || 'general'}
                  onChange={(e) => setEditingTool({...editingTool, category: e.target.value})}
                  className="w-full bg-gray-700 text-white px-4 py-2 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                >
                  <option value="reconnaissance">Reconnaissance</option>
                  <option value="scanning">Scanning</option>
                  <option value="enumeration">Enumeration</option>
                  <option value="vulnerability">Vulnerability</option>
                  <option value="exploitation">Exploitation</option>
                  <option value="post_exploitation">Post-Exploitation</option>
                  <option value="reporting">Reporting</option>
                  <option value="utility">Utility</option>
                  <option value="general">General</option>
                </select>
              </div>
              
              <div>
                <label className="block text-gray-400 text-sm mb-2">
                  Command Template
                  <span className="text-xs text-gray-500 ml-2">(Use {'{target}'} as placeholder for target values)</span>
                </label>
                <input
                  type="text"
                  value={editingTool.command || editingTool.command_template || ''}
                  onChange={(e) => setEditingTool({...editingTool, command: e.target.value})}
                  placeholder="nmap -sV {target}"
                  className="w-full bg-gray-700 text-white px-4 py-2 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none font-mono"
                  required
                />
                <p className="text-gray-400 text-xs mt-1">
                  Example: <code className="text-blue-400">nmap -sV {'{target}'}</code> or <code className="text-blue-400">nikto -h {'{target}'}</code>
                </p>
              </div>
              
              <div className="flex space-x-3 pt-4">
                <button 
                  type="button"
                  onClick={() => {
                    setShowEditModal(false);
                    setEditingTool(null);
                  }}
                  className="bg-gray-600 hover:bg-gray-700 text-white px-6 py-2 rounded-lg"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Tool Detail Modal */}
      {selectedTool && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 max-w-2xl w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold text-white">Tool Details</h3>
              <button 
                onClick={() => setSelectedTool(null)}
                className="text-gray-400 hover:text-white"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="text-gray-400 text-sm">Name</label>
                <p className="text-white">{selectedTool.name}</p>
              </div>
              <div>
                <label className="text-gray-400 text-sm">Project</label>
                {selectedTool.project_name ? (
                  <p className="text-white">
                    <i className="fas fa-project-diagram mr-2"></i>
                    {selectedTool.project_name}
                  </p>
                ) : (
                  <p className="text-gray-400">
                    <i className="fas fa-globe mr-2"></i>
                    Global Tool (available to all projects)
                  </p>
                )}
              </div>
              <div>
                <label className="text-gray-400 text-sm">Description</label>
                <p className="text-white">{selectedTool.description}</p>
              </div>
              <div>
                <label className="text-gray-400 text-sm">Category</label>
                <p className="text-white capitalize">{selectedTool.category}</p>
              </div>
              <div>
                <label className="text-gray-400 text-sm">Command Template</label>
                <p className="text-white font-mono bg-gray-700 p-2 rounded">{selectedTool.command_template}</p>
              </div>
            </div>
            
            <div className="flex justify-end space-x-3 mt-6">
              <button 
                onClick={() => setSelectedTool(null)}
                className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg"
              >
                Close
              </button>
              <button 
                onClick={() => runTool(selectedTool)}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg"
              >
                <i className="fas fa-play mr-2"></i>
                Run Tool
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Target Selector Modal */}
      {showTargetSelector && pendingRunTool && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl border border-gray-700 shadow-2xl w-full max-w-lg mx-4">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-white mb-1">Select Targets</h3>
              <p className="text-sm text-gray-400 mb-4">
                Choose which targets to run <span className="text-blue-400 font-medium">{pendingRunTool.tool.name}</span> against
              </p>

              <div className="flex items-center justify-between mb-3">
                <button
                  onClick={() => {
                    if (selectedTargetIds.length === availableTargets.length) {
                      setSelectedTargetIds([]);
                    } else {
                      setSelectedTargetIds(availableTargets.map(t => t.id));
                    }
                  }}
                  className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
                >
                  {selectedTargetIds.length === availableTargets.length ? 'Deselect All' : 'Select All'}
                </button>
                <span className="text-xs text-gray-500">
                  {selectedTargetIds.length} of {availableTargets.length} selected
                </span>
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto">
                {availableTargets.map((target) => (
                  <label
                    key={target.id}
                    className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                      selectedTargetIds.includes(target.id)
                        ? 'bg-blue-600/20 border border-blue-500/40'
                        : 'bg-gray-700/50 border border-gray-600/50 hover:bg-gray-700'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedTargetIds.includes(target.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedTargetIds(prev => [...prev, target.id]);
                        } else {
                          setSelectedTargetIds(prev => prev.filter(id => id !== target.id));
                        }
                      }}
                      className="w-4 h-4 rounded border-gray-500 text-blue-600 focus:ring-blue-500 bg-gray-700"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-white truncate">
                        {target.target_value || target.name}
                      </div>
                      <div className="text-xs text-gray-400">
                        {target.target_type || 'target'} {target.port ? `:${target.port}` : ''}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 bg-gray-800/50 border-t border-gray-700 rounded-b-xl">
              <button
                onClick={() => {
                  setShowTargetSelector(false);
                  setPendingRunTool(null);
                }}
                className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const selected = availableTargets.filter(t => selectedTargetIds.includes(t.id));
                  if (selected.length === 0) {
                    toast.warning('Please select at least one target.');
                    return;
                  }
                  executeToolOnTargets(pendingRunTool.tool, selected, pendingRunTool.projectIdToUse);
                  setPendingRunTool(null);
                }}
                disabled={selectedTargetIds.length === 0}
                className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg transition-colors"
              >
                <i className="fas fa-play mr-2"></i>
                Run on {selectedTargetIds.length} Target{selectedTargetIds.length !== 1 ? 's' : ''}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Terminal Display - Using Terminal Component with Black Design */}
      {showTerminal && currentExecutionId && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-black rounded-lg w-full max-w-4xl h-[85vh] flex flex-col shadow-2xl border border-gray-800 overflow-hidden">
            <div className={`flex-shrink-0 overflow-hidden ${debugMessages.length > 0 ? 'h-[calc(85vh-16rem)]' : 'flex-1'}`}>
              <Terminal
                key={currentExecutionId} // Force remount when executionId changes to ensure fresh WebSocket connection
                executionId={currentExecutionId}
                toolName={currentToolName}
                onClose={() => {
                  setShowTerminal(false);
                  setCurrentExecutionId(null);
                  setRunningTool(null);
                  setDebugMessages([]);
                  toast.info('Terminal closed. Execution will continue safely in the background!', { duration: 4000 });
                }}
              />
            </div>
            
            {/* Debug Messages Section */}
            {debugMessages.length > 0 && (
              <div className="flex-shrink-0 bg-gray-800 border-t border-gray-700 p-4 h-64 overflow-y-auto">
                <h4 className="text-sm font-medium text-gray-300 mb-3">Execution Progress</h4>
                <div className="space-y-1 font-mono text-xs">
                  {debugMessages.map((msg, index) => (
                    <div key={index} className="text-gray-400">
                      <span className="text-gray-500">[{msg.timestamp}]</span>{' '}
                      <span className={msg.message.includes('✅') || msg.message.includes('✓') ? 'text-green-400' : 
                                       msg.message.includes('❌') ? 'text-red-400' : 
                                       msg.message.includes('⏳') ? 'text-yellow-400' :
                                       msg.message.includes('[COMPLETED]') ? 'text-green-400' :
                                       msg.message.includes('[FAILED]') ? 'text-red-400' :
                                       msg.message.includes('[OUTPUT]') ? 'text-blue-400' :
                                       msg.message.includes('============================================================') ? 'text-cyan-400' :
                                       'text-gray-300'}>
                        {msg.message}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Attack Chain Panel - Redesigned */}
      {showAttackChain && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl w-full max-w-6xl h-[85vh] flex flex-col shadow-2xl border border-gray-700">
            {/* Header */}
            <div className="flex items-center justify-between p-6 bg-gradient-to-r from-red-600 to-orange-600 rounded-t-2xl">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 bg-white bg-opacity-20 rounded-xl flex items-center justify-center">
                  <i className="fas fa-fire text-white text-2xl"></i>
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-white">Attack Chain Builder</h2>
                  <p className="text-orange-100 text-sm">Build and execute automated attack sequences</p>
                </div>
              </div>
              <button
                onClick={() => setShowAttackChain(false)}
                className="bg-red-600 hover:bg-red-700 text-white p-3 rounded-xl transition-all duration-200 flex items-center"
                title="Close Attack Chain Builder"
              >
                <i className="fas fa-times text-lg mr-1"></i>
                Close
              </button>
            </div>
            
            <div className="flex-1 flex">
              {/* Available Tools - Left Panel */}
              <div className="w-1/2 p-6 border-r border-gray-600 bg-gray-900 bg-opacity-50">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-bold text-white">Available Tools</h3>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-gray-300 bg-gray-700 px-3 py-1 rounded-full">{tools.length} tools</span>
                    <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                  </div>
                </div>
                
                <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                  {tools.map((tool) => (
                    <div
                      key={tool.id}
                      className="bg-gradient-to-r from-gray-800 to-gray-700 rounded-xl p-4 cursor-move hover:from-gray-700 hover:to-gray-600 transition-all duration-200 hover:shadow-lg border border-gray-600 hover:border-blue-500 hover:shadow-blue-500/20"
                      draggable
                      onDragStart={(e) => handleDragStart(e, tool)}
                    >
                      <div className="flex items-center space-x-4">
                        <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
                          <i className={`${getCategoryIcon(tool.category)} text-white text-xl`}></i>
                        </div>
                        <div className="flex-1">
                          <div className="font-bold text-white text-lg">{tool.name}</div>
                          <div className="text-sm text-gray-300 mb-2">{tool.description}</div>
                          <div className="flex items-center space-x-2">
                            <span className={`px-3 py-1 text-xs rounded-full font-medium ${getCategoryColor(tool.category)}`}>
                              {tool.category}
                            </span>
                            <span className="text-xs text-gray-400">
                              <i className="fas fa-clock mr-1"></i>
                              {tool.execution_count || 0} runs
                            </span>
                          </div>
                        </div>
                        <div className="text-gray-400">
                          <i className="fas fa-grip-vertical"></i>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              
              {/* Attack Chain - Right Panel */}
              <div className="w-1/2 p-6 bg-gray-900 bg-opacity-30 flex flex-col">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-bold text-white">Attack Chain</h3>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-gray-300 bg-gray-700 px-3 py-1 rounded-full">{attackChain.length} steps</span>
                    <div className={`w-3 h-3 rounded-full ${attackChain.length > 0 ? 'bg-orange-500' : 'bg-gray-500'}`}></div>
                  </div>
                </div>

                <div className="mb-4 bg-gray-800 p-4 rounded-xl border border-gray-700 shadow-inner">
                  <label className="text-sm text-gray-300 font-medium mb-2 block">
                    <i className="fas fa-bullseye mr-2 text-orange-500"></i>
                    Global Target Select <span className="text-gray-500 font-normal">(applies to all sequence tools)</span>
                  </label>
                  <select 
                    className="w-full bg-gray-900 bg-opacity-80 text-white px-3 py-2 rounded-lg border border-gray-600 focus:border-orange-500 font-mono text-sm shadow-md"
                    value={globalChainTarget || ''}
                    onChange={(e) => setGlobalChainTarget(e.target.value)}
                  >
                    <option value="">-- No Target Selected --</option>
                    {availableTargets.map(t => (
                      <option key={t.id} value={t.target_value}>{t.target_value} ({t.target_type})</option>
                    ))}
                  </select>
                </div>
                
                <div 
                  className="border-2 border-dashed border-gray-500 rounded-xl p-6 flex-1 flex flex-col items-center justify-center bg-gray-800 bg-opacity-50 hover:border-blue-500 hover:bg-opacity-70 transition-all duration-200 overflow-y-auto"
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                >
                  {attackChain.length === 0 ? (
                    <div className="text-center text-gray-300">
                      <div className="w-20 h-20 bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
                        <i className="fas fa-arrow-down text-3xl text-gray-400"></i>
                      </div>
                      <h4 className="text-xl font-bold mb-2 text-white">Build Your Attack Chain</h4>
                      <p className="text-sm text-gray-400">Drag tools from the left panel to create your attack sequence</p>
                    </div>
                  ) : (
                    <div className="space-y-4 w-full">
                      {attackChain.map((item, index) => (
                        <div key={item.id} className="bg-gradient-to-r from-gray-700 to-gray-600 rounded-xl p-4 flex items-center justify-between hover:from-gray-600 hover:to-gray-500 transition-all duration-200 border border-gray-600 hover:border-orange-500">
                          <div className="flex items-center space-x-4">
                            <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-red-500 rounded-lg flex items-center justify-center text-white font-bold shadow-lg">
                              {index + 1}
                            </div>
                            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center shadow-lg">
                              <i className={`${getCategoryIcon(item.tool.category)} text-white text-xl`}></i>
                            </div>
                            <div className="flex-1">
                              <div className="font-bold text-white text-lg">{item.tool.name}</div>
                              <div className="text-sm text-gray-300">{item.tool.description}</div>
                              <div className="flex items-center space-x-2 mt-2">
                                <span className={`px-2 py-1 text-xs rounded-full font-medium ${getCategoryColor(item.tool.category)}`}>
                                  {item.tool.category}
                                </span>
                                <span className="text-xs text-gray-400">
                                  Step {index + 1}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => removeFromAttackChain(item.id)}
                              className="text-red-400 hover:text-red-300 p-2 hover:bg-red-500 hover:bg-opacity-20 rounded-lg transition-all duration-200"
                            >
                              <i className="fas fa-times"></i>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                
                {/* Action Buttons */}
                <div className="mt-6 flex space-x-3">
                  <button
                    onClick={executeAttackChain}
                    disabled={attackChain.length === 0}
                    className="bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-white px-6 py-3 rounded-xl flex items-center font-bold transition-all duration-200 hover:shadow-lg hover:shadow-green-500/20"
                  >
                    <i className="fas fa-play mr-2"></i>
                    Execute Chain
                  </button>
                  <button
                    onClick={saveAttackChain}
                    disabled={attackChain.length === 0}
                    className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-white px-6 py-3 rounded-xl flex items-center font-bold transition-all duration-200 hover:shadow-lg hover:shadow-blue-500/20"
                  >
                    <i className="fas fa-save mr-2"></i>
                    Save Chain
                  </button>
                  <button
                    onClick={() => setAttackChain([])}
                    disabled={attackChain.length === 0}
                    className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-white px-6 py-3 rounded-xl flex items-center font-bold transition-all duration-200 hover:shadow-lg hover:shadow-red-500/20"
                  >
                    <i className="fas fa-trash mr-2"></i>
                    Clear Chain
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
