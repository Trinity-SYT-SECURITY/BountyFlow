import { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Layout from '../components/Layout';
import { useToast } from '../components/Toast';
import { useModal } from '../components/Modal';

export default function Workflows() {
  const [workflows, setWorkflows] = useState([]);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedWorkflow, setSelectedWorkflow] = useState(null);
  const [newWorkflow, setNewWorkflow] = useState({
    name: '',
    description: '',
    steps: []
  });

  const [availableTools, setAvailableTools] = useState([]);
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [showProjectSelectionModal, setShowProjectSelectionModal] = useState(false);
  const [pendingWorkflow, setPendingWorkflow] = useState(null);
  const [selectedProjectForExecution, setSelectedProjectForExecution] = useState(null);
  const [showTargetSelector, setShowTargetSelector] = useState(false);
  const [availableTargets, setAvailableTargets] = useState([]);
  const [selectedTargetIds, setSelectedTargetIds] = useState([]);
  const [pendingExecutionProjectId, setPendingExecutionProjectId] = useState(null);
  const [showExecutionHistoryModal, setShowExecutionHistoryModal] = useState(false);
  const [executionHistory, setExecutionHistory] = useState([]);
  const [filteredWorkflowId, setFilteredWorkflowId] = useState(null);

  const toast = useToast();
  const { confirm } = useModal();

  useEffect(() => {
    loadProjects();
    loadWorkflows();
    loadExecutionHistory();
  }, []);

  const loadExecutionHistory = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const response = await fetch('http://localhost:8002/api/v1/workflows/executions/history?limit=50', { headers });
      if (response.ok) {
        const data = await response.json();
        setExecutionHistory(Array.isArray(data) ? data : []);
        return;
      }
    } catch (error) {
      console.warn('Failed to load execution history from API, falling back to localStorage:', error);
    }
    // Fallback to localStorage
    try {
      const history = localStorage.getItem('workflowExecutionHistory');
      if (history) {
        const parsedHistory = JSON.parse(history);
        setExecutionHistory(Array.isArray(parsedHistory) ? parsedHistory : []);
      } else {
        setExecutionHistory([]);
      }
    } catch (error) {
      console.error('Failed to load execution history:', error);
      setExecutionHistory([]);
    }
  };

  const saveExecutionHistory = async (executionData) => {
    // Save to API (persistent)
    try {
      const token = localStorage.getItem('token');
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const response = await fetch('http://localhost:8002/api/v1/workflows/executions/history', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          workflow_id: parseInt(executionData.workflowId),
          project_id: executionData.projectId ? parseInt(executionData.projectId) : null,
          project_name: executionData.projectName || null,
          target_name: executionData.targetName || null,
          target_ids: executionData.targetIds || null,
          status: executionData.status || 'completed',
          start_time: executionData.startTime || null,
          end_time: executionData.endTime || new Date().toISOString(),
          execution_results: executionData.executionResults || [],
          summary: executionData.summary || null
        })
      });

      if (response.ok) {
        // Reload from API to get the full list
        await loadExecutionHistory();
        return;
      }
    } catch (error) {
      console.warn('Failed to save to API, falling back to localStorage:', error);
    }

    // Fallback to localStorage
    try {
      const history = JSON.parse(localStorage.getItem('workflowExecutionHistory') || '[]');
      history.unshift({
        ...executionData,
        timestamp: new Date().toISOString(),
        id: Date.now()
      });
      const limitedHistory = history.slice(0, 50);
      localStorage.setItem('workflowExecutionHistory', JSON.stringify(limitedHistory));
      setExecutionHistory(limitedHistory);
    } catch (error) {
      console.error('Failed to save execution history:', error);
    }
  };

  const loadWorkflows = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch('http://localhost:8002/api/v1/workflows', { headers });
      if (response.ok) {
        const data = await response.json();
        // Transform data to match frontend format
        const transformedWorkflows = Array.isArray(data) ? data.map(wf => {
          // Extract tools/steps from different possible formats
          let tools = [];
          if (wf.tools) {
            if (wf.tools.steps && Array.isArray(wf.tools.steps)) {
              tools = wf.tools.steps;
            } else if (Array.isArray(wf.tools)) {
              tools = wf.tools;
            }
          }
          
          return {
            id: wf.id,
            name: wf.name,
            description: wf.description || '',
            status: wf.status || 'Active',
            created_at: wf.created_at,
            updated_at: wf.updated_at,
            project_id: wf.project_id || null,
            tools: tools
          };
        }) : [];
        setWorkflows(transformedWorkflows);
      } else {
        const errorText = await response.text();
        console.error('Failed to load workflows:', response.status, errorText);
        setWorkflows([]); // Set empty array on error
      }
    } catch (error) {
      console.error('Failed to load workflows:', error);
      setWorkflows([]); // Set empty array on error
    }
  };

  const loadProjects = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const response = await fetch('http://localhost:8002/api/v1/projects', { headers });
      if (response.ok) {
        const data = await response.json();
        setProjects(data);
        if (data.length > 0) {
          setSelectedProject(data[0]);
          loadTools(data[0].id);
        }
      } else {
        console.error('Failed to load projects:', response.status, await response.text());
      }
    } catch (error) {
      console.error('Failed to load projects:', error);
    }
  };

  const loadTools = async (projectId) => {
    try {
      const token = localStorage.getItem('token');
      const headers = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const response = await fetch(`http://localhost:8002/api/v1/tools?project_id=${projectId}`, { headers });
      if (response.ok) {
        const tools = await response.json();
        setAvailableTools(tools);
      }
    } catch (error) {
      console.error('Failed to load tools:', error);
    }
  };

  const handleCreateWorkflow = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = {
        'Content-Type': 'application/json'
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      // Filter out any steps with invalid tool names
      const validSteps = newWorkflow.steps.filter(step => step && step.tool && step.tool.trim() !== '');
      
      const workflowData = {
        name: newWorkflow.name,
        description: newWorkflow.description,
        tools: { steps: validSteps },
        status: 'active'
      };

      console.log('📝 Creating workflow:', workflowData);
      const response = await fetch('http://localhost:8002/api/v1/workflows', {
        method: 'POST',
        headers,
        body: JSON.stringify(workflowData)
      });

      if (response.ok) {
        console.log('✅ Workflow created successfully');
        setShowCreateModal(false);
        setNewWorkflow({ name: '', description: '', steps: [] });
        // Reload workflows from backend
        await loadWorkflows();
      } else {
        const errorText = await response.text();
        console.error('❌ Failed to create workflow:', response.status, errorText);
        toast.error(`Failed to create workflow: ${response.status} ${errorText}`);
      }
    } catch (error) {
      console.error('❌ Error creating workflow:', error);
      toast.error(`Error creating workflow: ${error.message}`);
    }
  };

  const handleEditWorkflow = (workflow) => {
    setSelectedWorkflow(workflow);
    setShowEditModal(true);
  };

  const handleDeleteWorkflow = async (workflowId) => {
    const confirmed = await confirm({
      title: 'Delete Workflow',
      message: 'Are you sure you want to delete this workflow? This action cannot be undone.',
      confirmText: 'Delete',
      variant: 'danger'
    });
    if (!confirmed) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const headers = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      console.log(`🗑️  Deleting workflow ${workflowId}...`);
      const response = await fetch(`http://localhost:8002/api/v1/workflows/${workflowId}`, {
        method: 'DELETE',
        headers
      });

      if (response.ok || response.status === 204) {
        console.log('✅ Workflow deleted successfully');
        // Reload workflows from backend
        await loadWorkflows();
      } else {
        const errorText = await response.text();
        console.error('❌ Failed to delete workflow:', response.status, errorText);
        toast.error(`Failed to delete workflow: ${response.status} ${errorText}`);
      }
    } catch (error) {
      console.error('❌ Error deleting workflow:', error);
      toast.error(`Error deleting workflow: ${error.message}`);
    }
  };

  const handleUpdateWorkflow = async (updatedWorkflow) => {
    try {
      const token = localStorage.getItem('token');
      const headers = {
        'Content-Type': 'application/json'
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const workflowData = {
        name: updatedWorkflow.name,
        description: updatedWorkflow.description || '',
        tools: updatedWorkflow.tools ? { steps: updatedWorkflow.tools } : {},
        status: updatedWorkflow.status || 'active'
      };

      console.log(`📝 Updating workflow ${updatedWorkflow.id}:`, workflowData);
      const response = await fetch(`http://localhost:8002/api/v1/workflows/${updatedWorkflow.id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(workflowData)
      });

      if (response.ok) {
        console.log('✅ Workflow updated successfully');
        setShowEditModal(false);
        setSelectedWorkflow(null);
        // Reload workflows from backend
        await loadWorkflows();
      } else {
        const errorText = await response.text();
        console.error('❌ Failed to update workflow:', response.status, errorText);
        toast.error(`Failed to update workflow: ${response.status} ${errorText}`);
      }
    } catch (error) {
      console.error('❌ Error updating workflow:', error);
      toast.error(`Error updating workflow: ${error.message}`);
    }
  };

  const addStep = (tool) => {
    setNewWorkflow({
      ...newWorkflow,
      steps: [...newWorkflow.steps, { tool: tool.name, order: newWorkflow.steps.length + 1 }]
    });
  };

  const addEditStep = (tool) => {
    if (!selectedWorkflow) return;
    const currentSteps = selectedWorkflow.tools || [];
    setSelectedWorkflow({
      ...selectedWorkflow,
      tools: [...currentSteps, { tool: tool.name, tool_id: tool.id, category: tool.category, order: currentSteps.length + 1 }]
    });
  };

  const handleRunWorkflow = async (workflow, projectIdOverride = null) => {
    if (!workflow.tools || workflow.tools.length === 0) {
      toast.warning('This workflow has no tools to execute.');
      return;
    }

    // Get project ID - show modal if workflow doesn't have one
    let projectId = projectIdOverride || workflow.project_id;
    if (!projectId) {
      // Reload projects if empty (in case they weren't loaded yet)
      let availableProjects = projects;
      if (availableProjects.length === 0) {
        try {
          const token = localStorage.getItem('token');
          const headers = {};
          if (token) {
            headers['Authorization'] = `Bearer ${token}`;
          }
          const response = await fetch('http://localhost:8002/api/v1/projects', { headers });
          if (response.ok) {
            availableProjects = await response.json();
            setProjects(availableProjects);
          }
        } catch (error) {
          console.error('Failed to reload projects:', error);
        }
      }

      if (availableProjects.length === 0) {
        toast.warning('Please create a project first before running workflows.');
        return;
      }

      // Show modal for project selection
      setPendingWorkflow(workflow);
      setShowProjectSelectionModal(true);
      return;
    }

    // Execute workflow with the project ID
    await executeWorkflow(workflow, projectId);
  };

  const executeWorkflow = async (workflow, projectId) => {

    try {
      const token = localStorage.getItem('token');
      const headers = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      // Get project details to fetch targets
      const projectResponse = await fetch(`http://localhost:8002/api/v1/projects/${projectId}`, { headers });
      if (!projectResponse.ok) {
        if (projectResponse.status === 404) {
          toast.error('Project not found. Please select a valid project.');
        } else {
          throw new Error(`Failed to fetch project details: ${projectResponse.statusText}`);
        }
        return;
      }
      const projectData = await projectResponse.json();

      if (!projectData) {
        toast.error('Invalid project data received. Please try again.');
        return;
      }

      const targets = projectData.targets || [];

      if (targets.length === 0) {
        toast.warning('No targets available for this project. Please add targets first.');
        return;
      }

      // If multiple targets, show target selector
      if (targets.length > 1) {
        setAvailableTargets(targets);
        setSelectedTargetIds([]);
        setPendingWorkflow(workflow);
        setPendingExecutionProjectId(projectId);
        setShowTargetSelector(true);
        return;
      }

      // Single target — execute directly
      await executeWorkflowOnTargets(workflow, projectId, targets);
    } catch (error) {
      console.error('Error preparing workflow execution:', error);
      toast.error(`Failed to prepare workflow: ${error.message || 'Unknown error'}`);
    }
  };

  const executeWorkflowOnTargets = async (workflow, projectId, targets) => {
    setShowTargetSelector(false);

    try {
      const token = localStorage.getItem('token');
      const headers = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      // Fetch project name for display
      let projectName = `Project ${projectId}`;
      try {
        const projRes = await fetch(`http://localhost:8002/api/v1/projects/${projectId}`, { headers });
        if (projRes.ok) {
          const projData = await projRes.json();
          projectName = projData.name || projectName;
        }
      } catch (e) { /* use fallback name */ }

      const target = targets[0];
      const targetName = target.target_value || target.name;

      // Create execution window with improved styling
      const terminalWindow = window.open('', '_blank', 'width=1200,height=800,scrollbars=yes,resizable=yes');
      
      if (!terminalWindow) {
        toast.warning('Please allow popups to run workflows.');
        return;
      }
      
      terminalWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Workflow Execution: ${workflow.name}</title>
          <script src="https://cdn.tailwindcss.com"></script>
          <style>
            body { 
              background: #111827; 
              color: #f3f4f6; 
              font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
              margin: 0;
              padding: 0;
            }
            .tool-output {
              max-height: 300px;
              overflow-y: auto;
              background: #1f2937;
              border: 1px solid #374151;
              border-radius: 6px;
              padding: 12px;
              font-family: 'Courier New', monospace;
              font-size: 12px;
              white-space: pre-wrap;
              word-wrap: break-word;
            }
            .tool-output::-webkit-scrollbar {
              width: 8px;
            }
            .tool-output::-webkit-scrollbar-track {
              background: #1f2937;
            }
            .tool-output::-webkit-scrollbar-thumb {
              background: #4b5563;
              border-radius: 4px;
            }
            .tool-output::-webkit-scrollbar-thumb:hover {
              background: #6b7280;
            }
          </style>
        </head>
        <body class="bg-gray-900">
          <div class="bg-gray-800 border-b border-gray-700 px-6 py-4">
            <div class="flex items-center justify-between">
              <div>
                <h1 class="text-2xl font-bold text-white">Workflow Execution: ${workflow.name}</h1>
                <p class="text-sm text-gray-400 mt-1">Project: ${projectName} | Target: ${targetName}</p>
              </div>
              <button onclick="window.close()" class="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors">
                Close
              </button>
            </div>
          </div>
          <div class="p-6" id="workflow-output"></div>
        </body>
        </html>
      `);
      terminalWindow.document.close();

      // Wait for document to be ready before accessing elements
      const waitForElement = (callback) => {
        const checkElement = () => {
          const output = terminalWindow.document.getElementById('workflow-output');
          if (output) {
            callback(output);
          } else {
            setTimeout(checkElement, 10);
          }
        };
        checkElement();
      };

      // Wait for the output element to be available
      await new Promise((resolve) => {
        waitForElement((output) => {
          resolve(output);
        });
      });

      const output = terminalWindow.document.getElementById('workflow-output');
      
      if (!output) {
        console.error('Failed to find workflow-output element');
        terminalWindow.close();
        return;
      }
      
      // Fetch all tools for the project to get command templates
      const toolsResponse = await fetch(`http://localhost:8002/api/v1/tools?project_id=${projectId}`, { headers });
      let availableTools = [];
      if (toolsResponse.ok) {
        availableTools = await toolsResponse.json();
      }

      // Validate that all tools in workflow exist
      // Tools in workflow can be: { tool: "name", order: 1 } or { id: 1, name: "name" } or just a string
      const missingTools = [];
      const toolMapping = []; // Map workflow tools to available tools
      
      for (let i = 0; i < workflow.tools.length; i++) {
        const tool = workflow.tools[i];
        
        // Extract tool name/identifier from different possible formats
        let toolName = null;
        let toolId = null;
        
        if (typeof tool === 'string') {
          toolName = tool;
        } else if (tool.tool) {
          // Format: { tool: "name", order: 1 }
          toolName = tool.tool;
        } else if (tool.name) {
          toolName = tool.name;
          toolId = tool.id || tool.tool_id;
        } else if (tool.tool_name) {
          toolName = tool.tool_name;
          toolId = tool.id || tool.tool_id;
        }
        
        // Try to find tool by ID first (if available), then by name
        let toolDetails = null;
        if (toolId) {
          toolDetails = availableTools.find(t => t.id === toolId || t.id === parseInt(toolId));
        }
        if (!toolDetails && toolName) {
          toolDetails = availableTools.find(t => 
            t.name === toolName || 
            t.name?.toLowerCase() === toolName?.toLowerCase()
          );
        }
        
        if (!toolDetails) {
          missingTools.push(toolName || `Tool ${i + 1}`);
        } else {
          toolMapping.push({
            workflowTool: tool,
            toolDetails: toolDetails,
            toolName: toolName || toolDetails.name,
            toolId: toolDetails.id
          });
        }
      }

      if (missingTools.length > 0) {
        toast.error(`The following tools are not available in this project: ${missingTools.join(', ')}. Please ensure all tools in the workflow are added to the project.`);
        terminalWindow.close();
        return;
      }

      // Execute each tool in the workflow sequentially
      const executionStartTime = new Date().toISOString();
      const executionResults = [];
      for (let i = 0; i < toolMapping.length; i++) {
        const { toolDetails, toolName, toolId } = toolMapping[i];
        
        if (!toolDetails) {
          console.error(`Tool not found in available tools`);
          executionResults.push({
            toolName: toolName || `Tool ${i + 1}`,
            status: 'failed',
            error: 'Tool not found in project'
          });
          continue;
        }
        
        const commandTemplate = toolDetails.command_template || toolDetails.command || '';
        
        if (!commandTemplate) {
          console.warn(`Tool ${toolName} has no command template`);
        }
        
        // Create tool execution card
        const toolCard = terminalWindow.document.createElement('div');
        toolCard.className = 'bg-gray-800 rounded-lg p-4 mb-4 border border-gray-700';
        toolCard.innerHTML = `
          <div class="flex items-center justify-between mb-3">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold">
                ${i + 1}
              </div>
              <div>
                <h3 class="text-lg font-semibold text-white">${toolName}</h3>
                <p class="text-sm text-gray-400">Tool ${i + 1} of ${workflow.tools.length}</p>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <div class="w-3 h-3 rounded-full bg-yellow-500 animate-pulse"></div>
              <span class="text-sm text-yellow-400">Running...</span>
            </div>
          </div>
          <div class="mt-3">
            <button onclick="const output = this.nextElementSibling; output.classList.toggle('hidden'); this.querySelector('.toggle-text').textContent = output.classList.contains('hidden') ? '▼' : '▲';" class="text-sm text-blue-400 hover:text-blue-300 mb-2">
              <span class="toggle-text">▼</span> View Output
            </button>
            <div class="tool-output hidden" id="output-${i}">Waiting for output...</div>
          </div>
        `;
        
        // Ensure output element still exists before appending
        const currentOutput = terminalWindow.document.getElementById('workflow-output');
        if (currentOutput) {
          currentOutput.appendChild(toolCard);
          terminalWindow.scrollTo(0, terminalWindow.document.body.scrollHeight);
        } else {
          console.error('Output element not found when trying to append tool card');
        }

        // Build command from tool template
        const command = commandTemplate.replace(/{target}/g, targetName);

        // Execute tool via backend API
        try {
          const executionData = {
            tools: [{
              tool_id: toolId,
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

          const response = await fetch(`http://localhost:8002/api/v1/tools/projects/${projectId}/tools/execute`, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(executionData)
          });

          if (!response.ok) {
            throw new Error(`Failed to execute tool: ${response.statusText}`);
          }

          const executionResult = await response.json();
          const executionId = executionResult.id;

          // Poll for execution status and output
          const outputDiv = toolCard.querySelector(`#output-${i}`);
          let completed = false;
          const maxAttempts = 300; // 5 minutes max
          let attempts = 0;

          const pollExecution = setInterval(async () => {
            attempts++;
            if (completed || attempts >= maxAttempts) {
              clearInterval(pollExecution);
              return;
            }

            try {
              const statusResponse = await fetch(`http://localhost:8002/api/v1/tools/executions/${executionId}`, { headers });
              if (statusResponse.ok) {
                const execution = await statusResponse.json();
                
                // Update output in real-time
                if (execution.output) {
                  outputDiv.textContent = execution.output;
                  outputDiv.classList.remove('hidden');
                }

                if (execution.execution_status === 'completed' || execution.execution_status === 'failed') {
                  completed = true;
                  clearInterval(pollExecution);
                  
                  // Update status indicator
                  const statusDiv = toolCard.querySelector('.flex.items-center.gap-2');
                  statusDiv.innerHTML = `
                    <div class="w-3 h-3 rounded-full ${execution.execution_status === 'completed' ? 'bg-green-500' : 'bg-red-500'}"></div>
                    <span class="text-sm ${execution.execution_status === 'completed' ? 'text-green-400' : 'text-red-400'}">
                      ${execution.execution_status === 'completed' ? 'Completed' : 'Failed'}
                    </span>
                  `;

                  // Show final output
                  if (execution.output) {
                    outputDiv.textContent = execution.output;
                    outputDiv.classList.remove('hidden');
                  }

                  executionResults.push({
                    toolName,
                    command: command || '',
                    status: execution.execution_status,
                    executionId: execution.id,
                    output: execution.output || '',
                    error_output: execution.error_output || ''
                  });
                }
              }
            } catch (error) {
              console.error(`Error polling execution ${executionId}:`, error);
            }
          }, 1000); // Poll every second

          // Wait for this tool to complete before moving to next
          while (!completed && attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }

        } catch (error) {
          console.error(`Error executing tool ${toolName}:`, error);
          const statusDiv = toolCard.querySelector('.flex.items-center.gap-2');
          statusDiv.innerHTML = `
            <div class="w-3 h-3 rounded-full bg-red-500"></div>
            <span class="text-sm text-red-400">Error: ${error.message}</span>
          `;
          executionResults.push({
            toolName,
            status: 'failed',
            error: error.message
          });
        }
      }
      
      // Show completion summary
      // Ensure output element still exists before appending summary
      const finalOutput = terminalWindow.document.getElementById('workflow-output');
      if (!finalOutput) {
        console.error('Output element not found when trying to append summary');
        return;
      }
      
      const summaryCard = terminalWindow.document.createElement('div');
      summaryCard.className = 'bg-gray-800 rounded-lg p-6 mt-4 border border-gray-700';
      const successCount = executionResults.filter(r => r.status === 'completed').length;
      const failedCount = executionResults.filter(r => r.status === 'failed').length;
      summaryCard.innerHTML = `
        <h2 class="text-xl font-bold text-white mb-4">Execution Summary</h2>
        <div class="grid grid-cols-3 gap-4 mb-4">
          <div class="bg-gray-700 rounded-lg p-4">
            <div class="text-2xl font-bold text-white">${toolMapping.length}</div>
            <div class="text-sm text-gray-400">Total Tools</div>
          </div>
          <div class="bg-green-900 rounded-lg p-4">
            <div class="text-2xl font-bold text-green-400">${successCount}</div>
            <div class="text-sm text-gray-400">Completed</div>
          </div>
          <div class="bg-red-900 rounded-lg p-4">
            <div class="text-2xl font-bold text-red-400">${failedCount}</div>
            <div class="text-sm text-gray-400">Failed</div>
          </div>
        </div>
        <div class="text-green-400 font-semibold">🎉 Workflow "${workflow.name}" execution completed!</div>
      `;
      
      // Double-check finalOutput exists before appending
      const checkOutput = terminalWindow.document.getElementById('workflow-output');
      if (checkOutput) {
        checkOutput.appendChild(summaryCard);
        terminalWindow.scrollTo(0, terminalWindow.document.body.scrollHeight);
      } else {
        console.error('Output element not found when trying to append summary card');
      }

      // Save execution history after a short delay to ensure DOM is fully rendered
      setTimeout(() => {
        try {
          const executionEndTime = new Date().toISOString();
          const hasFailures = executionResults.some(r => r.status === 'failed');
          saveExecutionHistory({
            workflowId: workflow.id,
            workflowName: workflow.name,
            projectId: projectId,
            projectName: projectName,
            targetName: targetName,
            targetIds: selectedTargetIds.length > 0 ? selectedTargetIds : null,
            executionResults: executionResults,
            startTime: executionStartTime,
            endTime: executionEndTime,
            status: hasFailures ? 'failed' : 'completed',
            summary: `${executionResults.filter(r => r.status === 'completed').length}/${executionResults.length} tools completed`,
            windowContent: terminalWindow.document.documentElement.outerHTML,
            timestamp: executionEndTime
          });
        } catch (error) {
          console.error('Failed to save execution history:', error);
        }
      }, 500);
      
    } catch (error) {
      console.error('Error running workflow:', error);
      toast.error('Error running workflow: ' + error.message);
    }
  };

  const viewExecutionHistory = (execution) => {
    // If we have the original terminal HTML, use it directly
    if (execution.windowContent) {
      const historyWindow = window.open('', '_blank', 'width=1200,height=800,scrollbars=yes,resizable=yes');
      historyWindow.document.write(execution.windowContent);
      historyWindow.document.close();
      return;
    }

    // Build a results viewer from structured execution_results data
    const results = execution.execution_results || execution.executionResults || [];
    const wfName = execution.workflow_name || execution.workflowName || 'Workflow';
    const projName = execution.project_name || execution.projectName || 'N/A';
    const tgtName = execution.target_name || execution.targetName || 'N/A';
    const execTime = execution.created_at || execution.timestamp || '';
    const completedCount = execution.completed_steps ?? results.filter(r => r.status === 'completed' || r.status === 'success').length;
    const failedCount = execution.failed_steps ?? results.filter(r => r.status === 'failed' || r.status === 'error').length;
    const totalCount = execution.total_steps ?? results.length;
    const duration = execution.duration_seconds != null ? `${execution.duration_seconds.toFixed(1)}s` : 'N/A';

    const resultCards = results.map((r, i) => {
      const isSuccess = r.status === 'completed' || r.status === 'success';
      const statusColor = isSuccess ? '#22c55e' : '#ef4444';
      const statusBg = isSuccess ? '#14532d' : '#450a0a';
      const statusLabel = isSuccess ? 'Completed' : 'Failed';
      const toolName = r.toolName || r.tool_name || `Step ${i + 1}`;
      const command = r.command || '';
      const output = r.output || '';
      const errorOutput = r.error_output || r.error || '';
      const escapeHtml = (str) => str.replace(/</g, '&lt;').replace(/>/g, '&gt;');

      const commandHtml = command
        ? `<div style="margin-top:8px;">
            <div style="color:#94a3b8;font-size:11px;margin-bottom:4px;font-weight:600;">COMMAND</div>
            <pre style="background:#0f172a;color:#38bdf8;padding:10px;border-radius:6px;font-size:12px;border:1px solid #1e293b;margin:0;">$ ${escapeHtml(command)}</pre>
          </div>`
        : '';

      const outputHtml = output
        ? `<div style="margin-top:8px;">
            <div style="color:#94a3b8;font-size:11px;margin-bottom:4px;font-weight:600;">OUTPUT</div>
            <pre style="background:#0f172a;color:#e2e8f0;padding:10px;border-radius:6px;font-size:12px;white-space:pre-wrap;word-wrap:break-word;max-height:400px;overflow-y:auto;border:1px solid #1e293b;margin:0;">${escapeHtml(output)}</pre>
          </div>`
        : '';

      const errorHtml = errorOutput
        ? `<div style="margin-top:8px;">
            <div style="color:#fca5a5;font-size:11px;margin-bottom:4px;font-weight:600;">ERROR</div>
            <pre style="background:#1a0a0a;color:#fca5a5;padding:10px;border-radius:6px;font-size:12px;white-space:pre-wrap;word-wrap:break-word;max-height:200px;overflow-y:auto;border:1px solid #450a0a;margin:0;">${escapeHtml(errorOutput)}</pre>
          </div>`
        : '';

      return `
        <div style="background:#1e293b;border:1px solid #334155;border-radius:8px;padding:16px;margin-bottom:12px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
            <div style="display:flex;align-items:center;gap:8px;">
              <div style="width:10px;height:10px;border-radius:50%;background:${statusColor};"></div>
              <span style="color:#f1f5f9;font-weight:600;font-size:14px;">${escapeHtml(toolName)}</span>
            </div>
            <span style="background:${statusBg};color:${statusColor};padding:2px 10px;border-radius:12px;font-size:12px;">${statusLabel}</span>
          </div>
          ${commandHtml}
          ${outputHtml}
          ${errorHtml}
        </div>
      `;
    }).join('');

    const html = `<!DOCTYPE html>
<html>
<head><title>Execution: ${wfName}</title></head>
<body style="background:#0f172a;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:24px;margin:0;">
  <div style="max-width:900px;margin:0 auto;">
    <h1 style="color:#f1f5f9;font-size:24px;margin-bottom:4px;">${wfName}</h1>
    <p style="color:#94a3b8;font-size:14px;margin-bottom:24px;">
      Project: ${projName} &bull; Target: ${tgtName} &bull; ${execTime ? new Date(execTime).toLocaleString() : ''} &bull; Duration: ${duration}
    </p>

    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:24px;">
      <div style="background:#1e293b;border-radius:8px;padding:16px;text-align:center;">
        <div style="font-size:28px;font-weight:700;color:#f1f5f9;">${totalCount}</div>
        <div style="font-size:13px;color:#94a3b8;">Total Tools</div>
      </div>
      <div style="background:#14532d;border-radius:8px;padding:16px;text-align:center;">
        <div style="font-size:28px;font-weight:700;color:#22c55e;">${completedCount}</div>
        <div style="font-size:13px;color:#94a3b8;">Completed</div>
      </div>
      <div style="background:#450a0a;border-radius:8px;padding:16px;text-align:center;">
        <div style="font-size:28px;font-weight:700;color:#ef4444;">${failedCount}</div>
        <div style="font-size:13px;color:#94a3b8;">Failed</div>
      </div>
    </div>

    <h2 style="color:#f1f5f9;font-size:18px;margin-bottom:12px;">Tool Results</h2>
    ${resultCards || '<p style="color:#64748b;">No detailed results available.</p>'}
  </div>
</body>
</html>`;

    const historyWindow = window.open('', '_blank', 'width=1200,height=800,scrollbars=yes,resizable=yes');
    historyWindow.document.write(html);
    historyWindow.document.close();
  };

  const getStatusColor = (status) => {
    const statusLower = status?.toLowerCase() || '';
    switch (statusLower) {
      case 'active': return 'bg-green-600 text-white';
      case 'running': return 'bg-blue-600 text-white';
      case 'completed': return 'bg-gray-600 text-white';
      case 'failed': return 'bg-red-600 text-white';
      case 'paused': return 'bg-yellow-600 text-white';
      default: return 'bg-gray-600 text-white';
    }
  };

  return (
    <Layout title="Workflows - BountyFlow">
      <Head>
        <title>Workflows - BountyFlow</title>
      </Head>

      <div className="p-6">
        {/* Page Header */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">🔄 Workflows</h1>
              <p className="text-gray-400">Create and manage automated testing workflows</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={async () => {
                  await loadExecutionHistory();
                  setFilteredWorkflowId(null); // Show all executions
                  setShowExecutionHistoryModal(true);
                }}
                className="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded-lg font-medium text-white"
              >
                View All History
              </button>
              <button
                onClick={() => {
                  // Reset workflow form
                  setNewWorkflow({
                    name: '',
                    description: '',
                    steps: []
                  });
                  // Load tools for the selected project (or first project)
                  if (selectedProject) {
                    loadTools(selectedProject.id);
                  } else if (projects.length > 0) {
                    setSelectedProject(projects[0]);
                    loadTools(projects[0].id);
                  }
                  setShowCreateModal(true);
                }}
                className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg font-medium text-white"
              >
                Create Workflow
              </button>
            </div>
        </div>
      </div>

      {/* Workflows Grid */}
      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {workflows.map((workflow) => (
            <div key={workflow.id} className="bg-gray-800 rounded-lg border border-gray-700 p-6 hover:border-blue-500 transition-colors">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-xl font-semibold text-white">{workflow.name}</h3>
                  <p className="text-gray-400 text-sm">{workflow.description}</p>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(workflow.status)}`}>
                  {workflow.status}
                </span>
              </div>
              
              <div className="space-y-2 mb-4">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Steps:</span>
                  <span className="text-white">{workflow.tools ? workflow.tools.length : 0}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Last Run:</span>
                  <span className="text-white">{workflow.updated_at ? new Date(workflow.updated_at).toLocaleString() : 'Never'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Created:</span>
                  <span className="text-white">{workflow.created_at ? new Date(workflow.created_at).toLocaleString() : 'Unknown'}</span>
                </div>
                {workflow.tools && workflow.tools.length > 0 && (
                  <div className="mt-2">
                    <span className="text-gray-400 text-xs">Tools:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {workflow.tools.slice(0, 3).map((tool, index) => {
                        // Extract tool name from different possible formats
                        let toolName = null;
                        if (typeof tool === 'string') {
                          toolName = tool;
                        } else if (tool && typeof tool === 'object') {
                          // Check for different property names
                          toolName = tool.tool || tool.name || tool.tool_name || tool.toolName;
                        }
                        return (
                          <span key={index} className="bg-gray-700 text-gray-300 px-2 py-1 rounded text-xs">
                            {toolName && toolName.trim() !== '' ? toolName : 'Unknown Tool'}
                          </span>
                        );
                      })}
                      {workflow.tools.length > 3 && (
                        <span className="bg-gray-700 text-gray-300 px-2 py-1 rounded text-xs">
                          +{workflow.tools.length - 3} more
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
              
              <div className="flex space-x-2">
                <button 
                  onClick={() => handleRunWorkflow(workflow)}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 py-2 rounded-lg text-sm font-medium text-white"
                >
                  Run Now
                </button>
                <button
                  onClick={async () => {
                    await loadExecutionHistory();
                    setFilteredWorkflowId(parseInt(workflow.id));
                    setShowExecutionHistoryModal(true);
                  }}
                  className="px-3 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-sm text-white flex items-center gap-2"
                  title="View execution history for this workflow"
                >
                  <i className="fas fa-history"></i>
                  <span>History</span>
                </button>
                <button 
                  onClick={() => handleEditWorkflow(workflow)}
                  className="px-3 py-2 bg-yellow-600 hover:bg-yellow-700 rounded-lg text-sm text-white"
                >
                  Edit
                </button>
                <button 
                  onClick={() => handleDeleteWorkflow(workflow.id)}
                  className="px-3 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-sm text-white"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Create Workflow Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-2xl my-8 max-h-[90vh] flex flex-col">
            <h2 className="text-xl font-bold mb-4 text-white">Create New Workflow</h2>
            
            <div className="space-y-4 overflow-y-auto flex-1 pr-2">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Project (for tool selection)</label>
                <select
                  value={selectedProject?.id || ''}
                  onChange={(e) => {
                    const projectId = parseInt(e.target.value);
                    const project = projects.find(p => p.id === projectId);
                    setSelectedProject(project);
                    if (project) {
                      loadTools(project.id);
                    }
                  }}
                  className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                >
                  {projects.map(project => (
                    <option key={project.id} value={project.id}>
                      {project.name} - {project.company_name}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Workflow Name</label>
                <input
                  type="text"
                  value={newWorkflow.name}
                  onChange={(e) => setNewWorkflow({...newWorkflow, name: e.target.value})}
                  className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                  placeholder="Enter workflow name"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Description</label>
                <textarea
                  value={newWorkflow.description}
                  onChange={(e) => setNewWorkflow({...newWorkflow, description: e.target.value})}
                  className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                  rows="3"
                  placeholder="Enter workflow description"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Available Tools</label>
                {availableTools.length === 0 ? (
                  <p className="text-gray-400 text-sm">No tools available. Please select a project or add tools to a project first.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-2">
                    {availableTools
                      .filter(tool => tool && tool.name && tool.name.trim() !== '')
                      .map((tool) => (
                        <button
                          key={tool.id || `tool-${tool.name}`}
                          onClick={() => addStep(tool)}
                          className="bg-gray-700 hover:bg-gray-600 p-3 rounded-lg text-left"
                        >
                          <div className="font-medium text-white">{tool.name || 'Unnamed Tool'}</div>
                          <div className="text-xs text-gray-400">{tool.description || 'No description'}</div>
                        </button>
                      ))}
                  </div>
                )}
              </div>
              
              {newWorkflow.steps.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Workflow Steps</label>
                  <div className="space-y-2">
                    {newWorkflow.steps
                      .filter(step => step && step.tool && step.tool.trim() !== '')
                      .map((step, index) => (
                        <div key={index} className="flex items-center justify-between bg-gray-700 p-3 rounded-lg">
                          <div className="flex items-center space-x-3">
                            <span className="text-sm font-medium text-blue-400">{index + 1}.</span>
                            <span className="text-white">{step.tool || 'Unknown Tool'}</span>
                          </div>
                          <button
                            onClick={() => {
                              const newSteps = newWorkflow.steps.filter((_, i) => i !== index);
                              setNewWorkflow({...newWorkflow, steps: newSteps});
                            }}
                            className="text-red-400 hover:text-red-300 font-medium"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
            
            <div className="flex justify-end space-x-3 mt-6 pt-4 border-t border-gray-700 flex-shrink-0">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateWorkflow}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white"
              >
                Create Workflow
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Workflow Modal */}
      {showEditModal && selectedWorkflow && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-2xl">
            <h2 className="text-xl font-bold mb-4 text-white">Edit Workflow</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Workflow Name</label>
                <input
                  type="text"
                  value={selectedWorkflow.name}
                  onChange={(e) => setSelectedWorkflow({...selectedWorkflow, name: e.target.value})}
                  className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Description</label>
                <textarea
                  value={selectedWorkflow.description}
                  onChange={(e) => setSelectedWorkflow({...selectedWorkflow, description: e.target.value})}
                  className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                  rows="3"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Status</label>
                <select
                  value={selectedWorkflow.status}
                  onChange={(e) => setSelectedWorkflow({...selectedWorkflow, status: e.target.value})}
                  className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                >
                  <option value="Active">Active</option>
                  <option value="Running">Running</option>
                  <option value="Completed">Completed</option>
                  <option value="Paused">Paused</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Available Tools</label>
                {availableTools.length === 0 ? (
                  <p className="text-gray-400 text-sm">No tools available. Please create tools in a project first.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-2">
                    {availableTools
                      .filter(tool => tool && tool.name && tool.name.trim() !== '')
                      .map((tool) => (
                        <button
                          key={tool.id || `edit-tool-${tool.name}`}
                          onClick={() => addEditStep(tool)}
                          className="bg-gray-700 hover:bg-gray-600 p-3 rounded-lg text-left"
                        >
                          <div className="font-medium text-white">{tool.name || 'Unnamed Tool'}</div>
                          <div className="text-xs text-gray-400 truncate">{tool.description || 'No description'}</div>
                        </button>
                      ))}
                  </div>
                )}
              </div>
              
              {selectedWorkflow.tools && selectedWorkflow.tools.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Workflow Sequence</label>
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                    {selectedWorkflow.tools
                      .filter(step => step && (step.tool || step.name) && (step.tool || step.name).trim() !== '')
                      .map((step, index) => (
                        <div key={`${step.tool || step.name}-${step.order || index}-${Math.random()}`} className="flex items-center justify-between bg-gray-700 p-3 rounded-lg border border-gray-600 hover:border-blue-500 transition-colors">
                          <div className="flex items-center space-x-3">
                            <span className="text-sm font-medium text-orange-400 font-mono w-5">{index + 1}.</span>
                            <span className="text-white font-medium">{step.tool || step.name || 'Unknown Tool'}</span>
                          </div>
                          <div className="flex items-center space-x-4">
                            <div className="flex flex-col space-y-1 bg-gray-800 rounded px-1 py-1">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  if (index === 0) return;
                                  const newSteps = [...selectedWorkflow.tools];
                                  const temp = newSteps[index - 1];
                                  newSteps[index - 1] = newSteps[index];
                                  newSteps[index] = temp;
                                  newSteps.forEach((s, i) => s.order = i + 1);
                                  setSelectedWorkflow({...selectedWorkflow, tools: newSteps});
                                }}
                                disabled={index === 0}
                                className={`text-xs ${index === 0 ? 'text-gray-600 cursor-not-allowed' : 'text-blue-400 hover:text-blue-300'}`}
                                title="Move up"
                              >
                                ▲
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  if (index === selectedWorkflow.tools.length - 1) return;
                                  const newSteps = [...selectedWorkflow.tools];
                                  const temp = newSteps[index + 1];
                                  newSteps[index + 1] = newSteps[index];
                                  newSteps[index] = temp;
                                  newSteps.forEach((s, i) => s.order = i + 1);
                                  setSelectedWorkflow({...selectedWorkflow, tools: newSteps});
                                }}
                                disabled={index === selectedWorkflow.tools.length - 1}
                                className={`text-xs ${index === selectedWorkflow.tools.length - 1 ? 'text-gray-600 cursor-not-allowed' : 'text-blue-400 hover:text-blue-300'}`}
                                title="Move down"
                              >
                                ▼
                              </button>
                            </div>
                            
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const newSteps = selectedWorkflow.tools.filter((_, i) => i !== index);
                                newSteps.forEach((s, i) => s.order = i + 1);
                                setSelectedWorkflow({...selectedWorkflow, tools: newSteps});
                              }}
                              className="w-8 h-8 rounded-full bg-red-900/30 text-red-400 hover:bg-red-800 hover:text-white flex items-center justify-center transition-colors"
                              title="Remove step"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
            
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowEditModal(false)}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white"
              >
                Cancel
              </button>
              <button
                onClick={() => handleUpdateWorkflow(selectedWorkflow)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white"
              >
                Update Workflow
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Project Selection Modal */}
      {showProjectSelectionModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4 text-white">Select Project</h2>
            <p className="text-gray-400 mb-4 text-sm">
              This workflow needs a project to execute. Please select a project:
            </p>

            <div className="space-y-2 mb-6 max-h-64 overflow-y-auto">
              {projects.map((project) => (
                <button
                  key={project.id}
                  onClick={() => setSelectedProjectForExecution(project)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${
                    selectedProjectForExecution?.id === project.id
                      ? 'bg-blue-600 border-blue-500 text-white'
                      : 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  <div className="font-semibold">{project.name}</div>
                  {project.company_name && (
                    <div className="text-sm opacity-75">{project.company_name}</div>
                  )}
                </button>
              ))}
            </div>

            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowProjectSelectionModal(false);
                  setPendingWorkflow(null);
                  setSelectedProjectForExecution(null);
                }}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (selectedProjectForExecution && pendingWorkflow) {
                    setShowProjectSelectionModal(false);
                    const projectId = selectedProjectForExecution.id;
                    const workflow = pendingWorkflow;
                    setSelectedProjectForExecution(null);
                    // Don't clear pendingWorkflow here — executeWorkflow may show
                    // the target selector which needs it
                    await executeWorkflow(workflow, projectId);
                  }
                }}
                disabled={!selectedProjectForExecution}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg text-white"
              >
                Execute
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Target Selection Modal */}
      {showTargetSelector && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-2 text-white">Select Targets</h2>
            <p className="text-gray-400 mb-4 text-sm">
              Choose which targets to run this workflow against:
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
                className="text-xs text-blue-400 hover:text-blue-300"
              >
                {selectedTargetIds.length === availableTargets.length ? 'Deselect All' : 'Select All'}
              </button>
              <span className="text-xs text-gray-500">
                {selectedTargetIds.length} of {availableTargets.length} selected
              </span>
            </div>

            <div className="space-y-2 mb-6 max-h-64 overflow-y-auto">
              {availableTargets.map((target) => (
                <label
                  key={target.id}
                  className={`flex items-center p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedTargetIds.includes(target.id)
                      ? 'bg-blue-600/20 border-blue-500'
                      : 'bg-gray-700 border-gray-600 hover:bg-gray-600'
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
                    className="mr-3 rounded"
                  />
                  <div>
                    <div className="text-white text-sm font-medium">{target.target_value}</div>
                    <div className="text-xs text-gray-400">{target.target_type} &middot; {target.status || 'unknown'}</div>
                  </div>
                </label>
              ))}
            </div>

            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowTargetSelector(false);
                  setPendingWorkflow(null);
                  setPendingExecutionProjectId(null);
                }}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white"
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
                  executeWorkflowOnTargets(pendingWorkflow, pendingExecutionProjectId, selected);
                  setPendingWorkflow(null);
                  setPendingExecutionProjectId(null);
                }}
                disabled={selectedTargetIds.length === 0}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg text-white"
              >
                Run ({selectedTargetIds.length})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Execution History Modal */}
      {showExecutionHistoryModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div className="flex-1">
                <h2 className="text-xl font-bold text-white">
                  {filteredWorkflowId 
                    ? `Execution History - ${workflows.find(w => w.id === filteredWorkflowId)?.name || 'Workflow'}`
                    : 'All Execution History'}
                </h2>
                <p className="text-sm text-gray-400 mt-1">
                  {filteredWorkflowId 
                    ? 'Showing executions for this workflow only'
                    : 'Showing all workflow executions'}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowExecutionHistoryModal(false);
                  setFilteredWorkflowId(null);
                }}
                className="text-gray-400 hover:text-white ml-4"
              >
                ✕
              </button>
            </div>

            {/* Filter Section */}
            <div className="mb-4 flex items-center gap-3">
              <label className="text-sm text-gray-400">Filter by workflow:</label>
              <select
                value={filteredWorkflowId || ''}
                onChange={(e) => setFilteredWorkflowId(e.target.value ? parseInt(e.target.value) : null)}
                className="bg-gray-700 text-white px-3 py-2 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none text-sm"
              >
                <option value="">All Workflows</option>
                {workflows.map((workflow) => (
                  <option key={workflow.id} value={workflow.id}>
                    {workflow.name}
                  </option>
                ))}
              </select>
              {filteredWorkflowId && (
                <button
                  onClick={() => setFilteredWorkflowId(null)}
                  className="text-sm text-blue-400 hover:text-blue-300"
                >
                  Clear Filter
                </button>
              )}
            </div>
            
            <div className="flex-1 overflow-y-auto">
              {executionHistory.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <p>No execution history found.</p>
                  <p className="text-sm mt-2">Run a workflow to see execution history here.</p>
                </div>
              ) : (() => {
                // Filter executions by workflow if filter is set
                // Support both API format (workflow_id) and localStorage format (workflowId)
                const filteredExecutions = filteredWorkflowId
                  ? executionHistory.filter(e => {
                      const wfId = e.workflow_id || e.workflowId;
                      return parseInt(wfId) === parseInt(filteredWorkflowId);
                    })
                  : executionHistory;

                if (filteredExecutions.length === 0) {
                  return (
                    <div className="text-center py-12 text-gray-400">
                      <p>No executions found for this workflow.</p>
                      <p className="text-sm mt-2">Run this workflow to see execution history here.</p>
                    </div>
                  );
                }

                return (
                  <div className="space-y-3">
                    {filteredExecutions.map((execution) => {
                      // Normalize field names (API uses snake_case, localStorage uses camelCase)
                      const wfName = execution.workflow_name || execution.workflowName || 'Unknown';
                      const projName = execution.project_name || execution.projectName || 'N/A';
                      const tgtName = execution.target_name || execution.targetName || 'N/A';
                      const results = execution.execution_results || execution.executionResults || [];
                      const execTime = execution.created_at || execution.timestamp;
                      const execStatus = execution.status || 'completed';
                      const wfId = execution.workflow_id || execution.workflowId;

                      return (
                      <div
                        key={execution.id}
                        className="bg-gray-700 rounded-lg p-4 border border-gray-600 hover:border-blue-500 transition-colors"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h3 className="text-lg font-semibold text-white">{wfName}</h3>
                              <span className={`text-xs px-2 py-1 rounded ${
                                execStatus === 'completed' ? 'bg-green-600 text-white' :
                                execStatus === 'failed' ? 'bg-red-600 text-white' :
                                'bg-gray-600 text-gray-300'
                              }`}>
                                {execStatus}
                              </span>
                              {!filteredWorkflowId && (
                                <span className="text-xs bg-gray-600 text-gray-300 px-2 py-1 rounded">
                                  {workflows.find(w => w.id === wfId || w.id === String(wfId))?.name || 'Unknown'}
                                </span>
                              )}
                            </div>
                            <div className="mt-2 space-y-1 text-sm text-gray-400">
                              <div>Project: {projName}</div>
                              <div>Target: {tgtName}</div>
                              <div>
                                Executed: {execTime ? new Date(execTime).toLocaleString() : 'N/A'}
                              </div>
                              {execution.duration_seconds != null && (
                                <div>Duration: {execution.duration_seconds.toFixed(1)}s</div>
                              )}
                              <div className="flex gap-4 mt-2">
                                <span className="text-green-400">
                                  ✓ {execution.completed_steps ?? results.filter(r => r.status === 'completed' || r.status === 'success').length} Completed
                                </span>
                                <span className="text-red-400">
                                  ✗ {execution.failed_steps ?? results.filter(r => r.status === 'failed' || r.status === 'error').length} Failed
                                </span>
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              viewExecutionHistory(execution);
                              setShowExecutionHistoryModal(false);
                            }}
                            className="ml-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white text-sm"
                          >
                            View
                          </button>
                        </div>
                      </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            <div className="mt-4 flex justify-between items-center">
              <div className="text-sm text-gray-400">
                {(() => {
                  const filtered = filteredWorkflowId
                    ? executionHistory.filter(e => {
                        const wfId = e.workflow_id || e.workflowId;
                        return parseInt(wfId) === parseInt(filteredWorkflowId);
                      })
                    : executionHistory;
                  return `Showing ${filtered.length} of ${executionHistory.length} execution(s)`;
                })()}
              </div>
              <button
                onClick={() => {
                  setShowExecutionHistoryModal(false);
                  setFilteredWorkflowId(null);
                }}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </Layout>
  );
}
