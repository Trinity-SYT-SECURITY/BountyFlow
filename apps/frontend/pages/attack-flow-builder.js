import { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useToast } from '../components/Toast';

export default function AttackFlowBuilder() {
  const toast = useToast();
  const [selectedProject, setSelectedProject] = useState(null);
  const [projects, setProjects] = useState([]);
  const [attackFlows, setAttackFlows] = useState([]);
  const [currentFlow, setCurrentFlow] = useState(null);
  const [selectedOperator, setSelectedOperator] = useState(null);
  const [draggedOperator, setDraggedOperator] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newFlowName, setNewFlowName] = useState('');
  const [severity, setSeverity] = useState(5);
  const [plausibility, setPlausibility] = useState(5);
  const [risk, setRisk] = useState(5);
  const [isLoading, setIsLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [flowchartData, setFlowchartData] = useState({ operators: {}, links: {} });
  const canvasRef = useRef(null);
  const flowchartRef = useRef(null);

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    if (selectedProject) {
      loadAttackFlows();
    }
  }, [selectedProject]);

  useEffect(() => {
    if (currentFlow && canvasRef.current) {
      initializeFlowchart();
    }
  }, [currentFlow]);

  const loadProjects = async () => {
    try {
      const response = await fetch('http://localhost:8002/api/v1/projects');
      if (response.ok) {
        const data = await response.json();
        setProjects(data);
        if (data.length > 0) {
          setSelectedProject(data[0]);
        }
      } else {
        setProjects([]);
      }
    } catch (error) {
      console.error('Failed to load projects:', error);
      setProjects([]);
    }
  };

  const loadAttackFlows = async () => {
    if (!selectedProject) return;
    
    try {
      setIsLoading(true);
      // Fetch attack flows from API
      const response = await fetch(`http://localhost:8002/api/v1/attack-flows/${selectedProject.id}`);
      if (response.ok) {
        const data = await response.json();
        setAttackFlows(data);
        if (data.length > 0) {
          setCurrentFlow(data[0]);
        }
      } else {
        setAttackFlows([]);
      }
    } catch (error) {
      console.error('Failed to load attack flows:', error);
      setAttackFlows([]);
    } finally {
      setIsLoading(false);
    }
  };

  const initializeFlowchart = () => {
    if (!canvasRef.current) return;

    // Initialize flowchart data
    const data = currentFlow?.flowchartData || {
      operators: {},
      links: {}
    };

    setFlowchartData(data);

    // Initialize jQuery flowchart (simulated with React)
    initializeFlowchartCanvas();
  };

  const initializeFlowchartCanvas = () => {
    // Simulate jQuery flowchart initialization
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Clear existing content
    canvas.innerHTML = '';

    // Create flowchart container
    const flowchartContainer = document.createElement('div');
    flowchartContainer.className = 'flowchart-container';
    flowchartContainer.style.cssText = `
      width: 100%;
      height: 100%;
      position: relative;
      background: #1f2937;
      border: 2px dashed #374151;
      border-radius: 8px;
    `;

    // Add operators from data
    Object.entries(flowchartData.operators).forEach(([operatorId, operatorData]) => {
      createOperatorElement(operatorId, operatorData, flowchartContainer);
    });

    // Add links between operators
    Object.entries(flowchartData.links).forEach(([linkId, linkData]) => {
      createLinkElement(linkId, linkData, flowchartContainer);
    });

    canvas.appendChild(flowchartContainer);
  };

  const createOperatorElement = (operatorId, operatorData, container) => {
    const operator = document.createElement('div');
    operator.className = 'flowchart-operator flowchart-default-operator';
    operator.id = operatorId;
    operator.style.cssText = `
      position: absolute;
      top: ${operatorData.top}px;
      left: ${operatorData.left}px;
      width: 140px;
      min-width: 140px;
      background: ${getOperatorColor(operatorData.properties.type)};
      border: 2px solid #374151;
      border-radius: 8px;
      padding: 10px;
      cursor: move;
      user-select: none;
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);
    `;

    // Operator title
    const title = document.createElement('div');
    title.className = 'flowchart-operator-title';
    title.textContent = operatorData.properties.title;
    title.style.cssText = `
      font-weight: bold;
      color: white;
      margin-bottom: 8px;
      text-align: center;
    `;

    // Inputs and outputs
    const inputsOutputs = document.createElement('div');
    inputsOutputs.className = 'flowchart-operator-inputs-outputs';
    inputsOutputs.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
    `;

    // Inputs
    const inputs = document.createElement('div');
    inputs.className = 'flowchart-operator-inputs';
    inputs.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 4px;
    `;

    Object.entries(operatorData.properties.inputs || {}).forEach(([inputId, inputData]) => {
      const input = document.createElement('div');
      input.className = 'flowchart-operator-connector';
      input.style.cssText = `
        width: 12px;
        height: 12px;
        background: #10b981;
        border-radius: 50%;
        border: 2px solid white;
        cursor: pointer;
      `;
      input.title = inputData.label;
      inputs.appendChild(input);
    });

    // Outputs
    const outputs = document.createElement('div');
    outputs.className = 'flowchart-operator-outputs';
    outputs.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 4px;
    `;

    Object.entries(operatorData.properties.outputs || {}).forEach(([outputId, outputData]) => {
      const output = document.createElement('div');
      output.className = 'flowchart-operator-connector';
      output.style.cssText = `
        width: 12px;
        height: 12px;
        background: #ef4444;
        border-radius: 50%;
        border: 2px solid white;
        cursor: pointer;
      `;
      output.title = outputData.label;
      outputs.appendChild(output);
    });

    inputsOutputs.appendChild(inputs);
    inputsOutputs.appendChild(outputs);

    operator.appendChild(title);
    operator.appendChild(inputsOutputs);

    // Add drag functionality
    operator.addEventListener('mousedown', (e) => handleOperatorDragStart(e, operatorId));
    operator.addEventListener('click', (e) => handleOperatorClick(e, operatorId));

    container.appendChild(operator);
  };

  const createLinkElement = (linkId, linkData, container) => {
    const fromOperator = flowchartData.operators[linkData.fromOperator];
    const toOperator = flowchartData.operators[linkData.toOperator];
    
    if (!fromOperator || !toOperator) return;

    const link = document.createElement('div');
    link.className = 'flowchart-link';
    link.id = linkId;
    link.style.cssText = `
      position: absolute;
      top: ${Math.min(fromOperator.top, toOperator.top)}px;
      left: ${Math.min(fromOperator.left, toOperator.left)}px;
      width: ${Math.abs(toOperator.left - fromOperator.left)}px;
      height: ${Math.abs(toOperator.top - fromOperator.top)}px;
      pointer-events: none;
    `;

    const line = document.createElement('div');
    line.style.cssText = `
      position: absolute;
      top: 50%;
      left: 0;
      width: 100%;
      height: 2px;
      background: ${linkData.color || '#6b7280'};
      transform: translateY(-50%);
    `;

    link.appendChild(line);
    container.appendChild(link);
  };

  const getOperatorColor = (type) => {
    switch (type) {
      case 'recon': return '#3b82f6'; // Blue
      case 'scan': return '#f59e0b'; // Yellow
      case 'vuln': return '#ef4444'; // Red
      case 'exploit': return '#8b5cf6'; // Purple
      case 'post': return '#10b981'; // Green
      default: return '#6b7280'; // Gray
    }
  };

  const getOperatorIcon = (type) => {
    switch (type) {
      case 'recon': return '🔍';
      case 'scan': return '📡';
      case 'vuln': return '⚠️';
      case 'exploit': return '💥';
      case 'post': return '🎯';
      default: return '📋';
    }
  };

  const handleOperatorDragStart = (e, operatorId) => {
    setDraggedOperator(operatorId);
    setIsDragging(true);
    
    const operator = e.target.closest('.flowchart-operator');
    if (operator) {
      operator.style.zIndex = '1000';
      operator.style.opacity = '0.8';
    }
  };

  const handleOperatorClick = (e, operatorId) => {
    e.stopPropagation();
    setSelectedOperator(flowchartData.operators[operatorId]);
  };

  const handleCanvasDrop = (e) => {
    e.preventDefault();
    if (draggedOperator) {
      const rect = canvasRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      // Update operator position
      setFlowchartData(prev => ({
        ...prev,
        operators: {
          ...prev.operators,
          [draggedOperator]: {
            ...prev.operators[draggedOperator],
            top: y - 20,
            left: x - 70
          }
        }
      }));
    }
  };

  const handleCanvasDragOver = (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  };

  const handleAddFlow = () => {
    setShowAddModal(true);
  };

  const handleSaveFlow = () => {
    if (!newFlowName.trim()) return;
    
    const newFlow = {
      id: Math.max(...attackFlows.map(f => f.id), 0) + 1,
      name: newFlowName,
      description: 'New attack flow',
      severity: severity,
      plausibility: plausibility,
      risk: risk,
      flowchartData: { operators: {}, links: {} }
    };
    
    setAttackFlows([...attackFlows, newFlow]);
    setCurrentFlow(newFlow);
    setShowAddModal(false);
    setNewFlowName('');
  };

  const handleDeleteFlow = (flowId) => {
    setAttackFlows(attackFlows.filter(f => f.id !== flowId));
    if (currentFlow?.id === flowId) {
      setCurrentFlow(attackFlows.length > 1 ? attackFlows[0] : null);
    }
  };

  const handleSaveChanges = () => {
    // In a real implementation, save changes to backend
    toast.success('Attack flow saved successfully!');
  };

  const handleAddOperator = (template) => {
    if (!currentFlow) return;
    
    const operatorId = `operator_${Date.now()}`;
    const newOperator = {
      top: Math.random() * 400 + 100,
      left: Math.random() * 600 + 100,
      properties: {
        title: template.title,
        type: template.type,
        inputs: template.inputs || {},
        outputs: template.outputs || {}
      }
    };
    
    setFlowchartData(prev => ({
      ...prev,
      operators: {
        ...prev.operators,
        [operatorId]: newOperator
      }
    }));
  };

  const handleDeleteOperator = (operatorId) => {
    setFlowchartData(prev => {
      const newOperators = { ...prev.operators };
      delete newOperators[operatorId];
      return {
        ...prev,
        operators: newOperators
      };
    });
    setSelectedOperator(null);
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <Head>
        <title>Attack Flow Builder - BountyFlow</title>
        <style jsx>{`
          .flowchart-container {
            width: 100%;
            height: 100%;
            position: relative;
            background: #1f2937;
            border: 2px dashed #374151;
            border-radius: 8px;
            min-height: 500px;
          }
          
          .flowchart-operator {
            position: absolute;
            width: 140px;
            min-width: 140px;
            background: #374151;
            border: 2px solid #6b7280;
            border-radius: 8px;
            padding: 10px;
            cursor: move;
            user-select: none;
            box-shadow: 0 2px 4px rgba(0,0,0,0.3);
            transition: all 0.2s ease;
          }
          
          .flowchart-operator:hover {
            border-color: #fbbf24;
            box-shadow: 0 4px 8px rgba(0,0,0,0.4);
          }
          
          .flowchart-operator.selected {
            border-color: #fbbf24;
            box-shadow: 0 0 0 2px rgba(251, 191, 36, 0.3);
          }
          
          .flowchart-operator-title {
            font-weight: bold;
            color: white;
            margin-bottom: 8px;
            text-align: center;
            font-size: 12px;
          }
          
          .flowchart-operator-inputs-outputs {
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          
          .flowchart-operator-connector {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            border: 2px solid white;
            cursor: pointer;
            transition: all 0.2s ease;
          }
          
          .flowchart-operator-connector:hover {
            transform: scale(1.2);
          }
          
          .flowchart-link {
            position: absolute;
            pointer-events: none;
          }
          
          .flowchart-link-line {
            position: absolute;
            top: 50%;
            left: 0;
            width: 100%;
            height: 2px;
            background: #6b7280;
            transform: translateY(-50%);
          }
        `}</style>
      </Head>

      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Link href="/dashboard" className="text-blue-400 hover:text-blue-300">
              ← Back to Dashboard
            </Link>
            <h1 className="text-2xl font-bold">Attack Flow Builder</h1>
          </div>
          <div className="flex items-center space-x-4">
            {/* Project Selector */}
            <div className="flex items-center space-x-2">
              <label className="text-sm text-gray-300">Project:</label>
              <select
                value={selectedProject?.id || ''}
                onChange={(e) => {
                  const project = projects.find(p => p.id === parseInt(e.target.value));
                  setSelectedProject(project);
                }}
                className="bg-gray-700 text-white px-3 py-2 rounded-lg"
              >
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>
            
            <div className="flex space-x-2">
              <button
                onClick={handleAddFlow}
                className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg"
              >
                New Flow
              </button>
              <button
                onClick={handleSaveChanges}
                className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex h-screen">
        {/* Main Content */}
        <div className="flex-1 flex">
          {/* Attack Flow Canvas */}
          <div className="flex-1 relative">
            <div className="absolute inset-0 bg-gray-800">
              <div 
                ref={canvasRef}
                className="flowchart-container"
                onDrop={handleCanvasDrop}
                onDragOver={handleCanvasDragOver}
                onClick={() => setSelectedOperator(null)}
              >
                {/* Flowchart will be rendered here */}
              </div>
            </div>
          </div>

          {/* Attack Flow Selector */}
          <div className="w-80 bg-gray-800 border-l border-gray-700 p-4">
            <h3 className="text-lg font-semibold mb-4">Attack Flows</h3>
            
            <div className="space-y-2 mb-6">
              {attackFlows.map((flow) => (
                <div
                  key={flow.id}
                  className={`p-3 rounded-lg cursor-pointer ${
                    currentFlow?.id === flow.id ? 'bg-blue-600' : 'bg-gray-700'
                  }`}
                  onClick={() => setCurrentFlow(flow)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium">{flow.name}</h4>
                      <p className="text-sm text-gray-300">{flow.description}</p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteFlow(flow.id);
                      }}
                      className="text-red-400 hover:text-red-300"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Operator Templates */}
            <div className="mb-6">
              <h4 className="text-sm font-medium text-gray-300 mb-3">Operator Templates</h4>
              <div className="space-y-2">
                {[
                  { type: 'recon', title: 'Reconnaissance', icon: '🔍', inputs: {}, outputs: { output_1: { label: 'Output 1' } } },
                  { type: 'scan', title: 'Port Scan', icon: '📡', inputs: { input_1: { label: 'Input 1' } }, outputs: { output_1: { label: 'Output 1' } } },
                  { type: 'vuln', title: 'Vulnerability', icon: '⚠️', inputs: { input_1: { label: 'Input 1' } }, outputs: { output_1: { label: 'Output 1' } } },
                  { type: 'exploit', title: 'Exploit', icon: '💥', inputs: { input_1: { label: 'Input 1' } }, outputs: { output_1: { label: 'Output 1' } } },
                  { type: 'post', title: 'Post-Exploit', icon: '🎯', inputs: { input_1: { label: 'Input 1' } }, outputs: {} }
                ].map((template) => (
                  <div
                    key={template.type}
                    className="bg-gray-700 p-3 rounded-lg cursor-pointer hover:bg-gray-600"
                    onClick={() => handleAddOperator(template)}
                  >
                    <div className="flex items-center space-x-2">
                      <span className="text-lg">{template.icon}</span>
                      <span className="text-sm">{template.title}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Selected Operator Properties */}
            {selectedOperator && (
              <div className="mb-6">
                <h4 className="text-sm font-medium text-gray-300 mb-3">Operator Properties</h4>
                <div className="bg-gray-700 rounded-lg p-3">
                  <div className="text-sm">
                    <div className="font-medium text-white flex items-center space-x-2">
                      <span>{getOperatorIcon(selectedOperator.properties.type)}</span>
                      <span>{selectedOperator.properties.title}</span>
                    </div>
                    <div className="text-gray-400 mt-2">
                      <div>Type: {selectedOperator.properties.type}</div>
                      <div>Inputs: {Object.keys(selectedOperator.properties.inputs || {}).length}</div>
                      <div>Outputs: {Object.keys(selectedOperator.properties.outputs || {}).length}</div>
                    </div>
                    <button
                      onClick={() => handleDeleteOperator(Object.keys(flowchartData.operators).find(id => flowchartData.operators[id] === selectedOperator))}
                      className="mt-2 bg-red-600 hover:bg-red-700 px-3 py-1 rounded text-sm"
                    >
                      Delete Operator
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Risk Assessment Panel */}
        <div className="w-80 bg-gray-800 border-l border-gray-700 p-4">
          <h3 className="text-lg font-semibold mb-4">Risk Assessment</h3>
          
          {currentFlow && (
            <div className="space-y-6">
              {/* Severity */}
              <div>
                <h4 className="text-sm font-medium text-gray-300 mb-3">Severity</h4>
                <div className="flex space-x-1">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((level) => (
                    <div
                      key={level}
                      className={`w-6 h-6 rounded cursor-pointer ${
                        currentFlow.severity >= level ? 'bg-red-500' : 'bg-gray-600'
                      }`}
                      onClick={() => {
                        const updatedFlow = { ...currentFlow, severity: level };
                        setCurrentFlow(updatedFlow);
                        setAttackFlows(attackFlows.map(f => f.id === currentFlow.id ? updatedFlow : f));
                      }}
                    />
                  ))}
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  {currentFlow.severity}/10
                </div>
              </div>

              {/* Plausibility */}
              <div>
                <h4 className="text-sm font-medium text-gray-300 mb-3">Plausibility</h4>
                <div className="flex space-x-1">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((level) => (
                    <div
                      key={level}
                      className={`w-6 h-6 rounded cursor-pointer ${
                        currentFlow.plausibility >= level ? 'bg-yellow-500' : 'bg-gray-600'
                      }`}
                      onClick={() => {
                        const updatedFlow = { ...currentFlow, plausibility: level };
                        setCurrentFlow(updatedFlow);
                        setAttackFlows(attackFlows.map(f => f.id === currentFlow.id ? updatedFlow : f));
                      }}
                    />
                  ))}
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  {currentFlow.plausibility}/10
                </div>
              </div>

              {/* Risk */}
              <div>
                <h4 className="text-sm font-medium text-gray-300 mb-3">Risk</h4>
                <div className="flex space-x-1">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((level) => (
                    <div
                      key={level}
                      className={`w-6 h-6 rounded cursor-pointer ${
                        currentFlow.risk >= level ? 'bg-orange-500' : 'bg-gray-600'
                      }`}
                      onClick={() => {
                        const updatedFlow = { ...currentFlow, risk: level };
                        setCurrentFlow(updatedFlow);
                        setAttackFlows(attackFlows.map(f => f.id === currentFlow.id ? updatedFlow : f));
                      }}
                    />
                  ))}
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  {currentFlow.risk}/10
                </div>
              </div>

              {/* Risk Summary */}
              <div className="bg-gray-700 rounded-lg p-3">
                <h4 className="text-sm font-medium text-gray-300 mb-2">Risk Summary</h4>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>Overall Risk:</span>
                    <span className={`font-medium ${
                      currentFlow.risk >= 8 ? 'text-red-400' :
                      currentFlow.risk >= 6 ? 'text-yellow-400' :
                      'text-green-400'
                    }`}>
                      {currentFlow.risk >= 8 ? 'High' :
                       currentFlow.risk >= 6 ? 'Medium' : 'Low'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Severity:</span>
                    <span className="text-red-400">{currentFlow.severity}/10</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Plausibility:</span>
                    <span className="text-yellow-400">{currentFlow.plausibility}/10</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add Flow Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Create New Attack Flow</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Flow Name</label>
                <input
                  type="text"
                  value={newFlowName}
                  onChange={(e) => setNewFlowName(e.target.value)}
                  className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                  placeholder="Enter attack flow name"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Initial Severity</label>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={severity}
                  onChange={(e) => setSeverity(parseInt(e.target.value))}
                  className="w-full"
                />
                <div className="text-sm text-gray-400">{severity}/10</div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Initial Plausibility</label>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={plausibility}
                  onChange={(e) => setPlausibility(parseInt(e.target.value))}
                  className="w-full"
                />
                <div className="text-sm text-gray-400">{plausibility}/10</div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Initial Risk</label>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={risk}
                  onChange={(e) => setRisk(parseInt(e.target.value))}
                  className="w-full"
                />
                <div className="text-sm text-gray-400">{risk}/10</div>
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 text-gray-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveFlow}
                className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg"
              >
                Create Flow
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loading Overlay */}
      {isLoading && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-white">Loading attack flows...</p>
          </div>
        </div>
      )}
    </div>
  );
}


