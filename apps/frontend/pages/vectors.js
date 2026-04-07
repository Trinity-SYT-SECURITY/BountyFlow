import { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Layout from '../components/Layout';
import { useToast } from '../components/Toast';

export default function Vectors() {
  const toast = useToast();
  const [selectedProject, setSelectedProject] = useState(null);
  const [projects, setProjects] = useState([]);
  const [attackVectors, setAttackVectors] = useState([]);
  const [currentVector, setCurrentVector] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [draggedNode, setDraggedNode] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showNodeEditModal, setShowNodeEditModal] = useState(false);
  const [connectionMode, setConnectionMode] = useState(false);
  const [connectionStart, setConnectionStart] = useState(null);
  const [availableData, setAvailableData] = useState({
    targets: [],
    findings: [],
    tools: []
  });
  const [newVectorName, setNewVectorName] = useState('');
  const [severity, setSeverity] = useState(5);
  const [plausibility, setPlausibility] = useState(5);
  const [risk, setRisk] = useState(5);
  const [isLoading, setIsLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const canvasRef = useRef(null);

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    if (selectedProject) {
      loadAttackVectors();
      loadAvailableData();
    }
  }, [selectedProject]);

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

  const loadAttackVectors = async () => {
    if (!selectedProject) return;
    
    try {
      setIsLoading(true);
      // Fetch attack vectors from API
      const response = await fetch(`http://localhost:8002/api/v1/attack-vectors/${selectedProject.id}`);
      if (response.ok) {
        const data = await response.json();
        setAttackVectors(data);
        if (data.length > 0) {
          setCurrentVector(data[0]);
        }
      } else {
        setAttackVectors([]);
      }
    } catch (error) {
      console.error('Failed to load attack vectors:', error);
      setAttackVectors([]);
    } finally {
      setIsLoading(false);
    }
  };

  const loadAvailableData = async () => {
    if (!selectedProject) return;
    
    try {
      const response = await fetch('http://localhost:8002/api/v1/projects');
      if (response.ok) {
        const projects = await response.json();
        const currentProject = projects.find(p => p.id === selectedProject.id);
        if (currentProject) {
          setAvailableData({
            targets: currentProject.targets || [],
            findings: currentProject.findings || [],
            tools: currentProject.tools || []
          });
        }
      }
    } catch (error) {
      console.error('Failed to load available data:', error);
    }
  };

  const getNodeColor = (type) => {
    switch (type) {
      case 'recon': return '#3B82F6'; // Blue
      case 'scan': return '#F59E0B'; // Yellow
      case 'vuln': return '#EF4444'; // Red
      case 'exploit': return '#8B5CF6'; // Purple
      case 'post': return '#10B981'; // Green
      default: return '#6B7280'; // Gray
    }
  };

  const getNodeIcon = (type) => {
    switch (type) {
      case 'recon': return '🔍';
      case 'scan': return '📡';
      case 'vuln': return '⚠️';
      case 'exploit': return '💥';
      case 'post': return '🎯';
      default: return '📋';
    }
  };

  const handleNodeClick = (node) => {
    if (connectionMode && connectionStart) {
      // Create connection
      handleCreateConnection(connectionStart.id, node.id);
      setConnectionMode(false);
      setConnectionStart(null);
    } else {
      setSelectedNode(node);
    }
  };

  const handleNodeDragStart = (node, event) => {
    setDraggedNode(node);
    setIsDragging(true);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', JSON.stringify(node));
    }
  };

  const handleNodeDragEnd = () => {
    setDraggedNode(null);
    setIsDragging(false);
  };

  const handleCanvasDrop = (event) => {
    event.preventDefault();
    if (draggedNode) {
      const rect = canvasRef.current.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      
      // Update node position
      setCurrentVector(prev => ({
        ...prev,
        nodes: prev.nodes.map(node => 
          node.id === draggedNode.id 
            ? { ...node, x, y }
            : node
        )
      }));
    }
  };

  const handleCanvasDragOver = (event) => {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  };

  const handleNodeMouseDown = (node, event) => {
    if (event.button === 0) { // Left mouse button
      setDraggedNode(node);
      setIsDragging(true);
    }
  };

  const handleNodeMouseMove = (event) => {
    if (isDragging && draggedNode && currentVector) {
      const rect = canvasRef.current.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      
      setCurrentVector(prev => ({
        ...prev,
        nodes: prev.nodes.map(node => 
          node.id === draggedNode.id 
            ? { ...node, x: Math.max(0, Math.min(x, rect.width - 120)), y: Math.max(0, Math.min(y, rect.height - 60)) }
            : node
        )
      }));
    }
  };

  const handleNodeMouseUp = () => {
    setDraggedNode(null);
    setIsDragging(false);
  };

  const handleCreateConnection = (fromNodeId, toNodeId) => {
    if (!currentVector) return;
    
    const fromNode = currentVector.nodes.find(n => n.id === fromNodeId);
    const toNode = currentVector.nodes.find(n => n.id === toNodeId);
    
    // Determine the connection type based on the node type
    let connectionType = 'sequence';
    let connectionLabel = 'Connected';
    
    if (fromNode && toNode) {
      if (fromNode.type === 'recon' && toNode.type === 'scan') {
        connectionType = 'data_flow';
        connectionLabel = 'Data Flow';
      } else if (fromNode.type === 'scan' && toNode.type === 'exploit') {
        connectionType = 'dependency';
        connectionLabel = 'Dependency';
      } else if (fromNode.type === 'exploit' && toNode.type === 'post') {
        connectionType = 'sequence';
        connectionLabel = 'Sequence';
      }
    }
    
    const newConnection = {
      id: `conn_${Date.now()}`,
      from: fromNodeId,
      to: toNodeId,
      type: connectionType,
      label: connectionLabel
    };
    
    setCurrentVector(prev => ({
      ...prev,
      connections: [...prev.connections, newConnection]
    }));
  };

  const handleStartConnection = (node) => {
    setConnectionMode(true);
    setConnectionStart(node);
  };

  const handleCancelConnection = () => {
    setConnectionMode(false);
    setConnectionStart(null);
  };

  const handleEditNode = (node) => {
    setSelectedNode(node);
    setShowNodeEditModal(true);
  };

  const handleUpdateNode = (nodeId, nodeData) => {
    setCurrentVector(prev => ({
      ...prev,
      nodes: prev.nodes.map(node => 
        node.id === nodeId 
          ? { ...node, ...nodeData }
          : node
      )
    }));
    setShowNodeEditModal(false);
  };

  const handleAddVector = () => {
    setShowAddModal(true);
  };

  const handleSaveVector = () => {
    if (!newVectorName.trim()) return;
    
    const newVector = {
      id: Math.max(...attackVectors.map(v => v.id)) + 1,
      name: newVectorName,
      description: 'New attack vector',
      severity: severity,
      plausibility: plausibility,
      risk: risk,
      nodes: [],
      connections: []
    };
    
    setAttackVectors([...attackVectors, newVector]);
    setCurrentVector(newVector);
    setShowAddModal(false);
    setNewVectorName('');
  };

  const handleDeleteVector = (vectorId) => {
    setAttackVectors(attackVectors.filter(v => v.id !== vectorId));
    if (currentVector?.id === vectorId) {
      setCurrentVector(attackVectors.length > 1 ? attackVectors[0] : null);
    }
  };

  const handleSaveChanges = () => {
    // In a real implementation, save changes to backend
    toast.success('Attack vector saved successfully!');
  };

  const handleDeleteNode = (nodeId) => {
    if (!currentVector) return;
    
    const updatedVector = {
      ...currentVector,
      nodes: currentVector.nodes.filter(n => n.id !== nodeId),
      connections: currentVector.connections.filter(c => c.from !== nodeId && c.to !== nodeId)
    };
    
    setCurrentVector(updatedVector);
    setSelectedNode(null);
  };

  const handleAddNode = (template) => {
    if (!currentVector) return;
    
    const newNode = {
      id: `node_${Date.now()}`,
      type: template.type,
      title: template.title,
      x: Math.random() * 600 + 100,
      y: Math.random() * 400 + 100,
      inputs: template.inputs || 1,
      outputs: template.outputs || 1
    };
    
    setCurrentVector(prev => ({
      ...prev,
      nodes: [...prev.nodes, newNode]
    }));
  };

  return (
    <Layout title="Attack Vectors - BountyFlow">
      <Head>
        <title>Attack Vectors - BountyFlow</title>
      </Head>

      <div className="p-6">
        {/* Page Header */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">🎯 Attack Vectors</h1>
              <p className="text-gray-400">Visualize and manage attack paths</p>
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
                onClick={handleAddVector}
                className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg"
              >
                New Vector
              </button>
              <button
                onClick={() => setConnectionMode(!connectionMode)}
                className={`px-4 py-2 rounded-lg ${
                  connectionMode 
                    ? 'bg-red-600 hover:bg-red-700' 
                    : 'bg-yellow-600 hover:bg-yellow-700'
                }`}
              >
                {connectionMode ? 'Cancel Connection' : 'Connect Nodes'}
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
          {/* Attack Vector Canvas */}
          <div className="flex-1 relative">
            <div className="absolute inset-0 bg-gray-800">
              <svg 
                ref={canvasRef}
                width="100%" 
                height="100%" 
                className="absolute inset-0"
                onDrop={handleCanvasDrop}
                onDragOver={handleCanvasDragOver}
                onMouseMove={handleNodeMouseMove}
                onMouseUp={handleNodeMouseUp}
              >
                {/* Render relationships */}
                {currentVector?.connections.map((conn, index) => {
                  const fromNode = currentVector.nodes.find(n => n.id === conn.from);
                  const toNode = currentVector.nodes.find(n => n.id === conn.to);
                  if (!fromNode || !toNode) return null;
                  
                  // Set color and style based on line type
                  const getConnectionColor = (connection) => {
                    if (connection.type === 'data_flow') return '#3B82F6'; // Blue
                    if (connection.type === 'dependency') return '#F59E0B'; // Yellow
                    if (connection.type === 'sequence') return '#10B981'; // Green
                    return '#8B5CF6'; // Purple (default)
                  };
                  
                  const getConnectionStyle = (connection) => {
                    if (connection.type === 'data_flow') return { strokeWidth: '3', strokeDasharray: '5,5' };
                    if (connection.type === 'dependency') return { strokeWidth: '2', strokeDasharray: '10,5' };
                    if (connection.type === 'sequence') return { strokeWidth: '2' };
                    return { strokeWidth: '2' };
                  };
                  
                  const color = getConnectionColor(conn);
                  const style = getConnectionStyle(conn);
                  
                  return (
                    <g key={index}>
                      <line
                        x1={fromNode.x + 60}
                        y1={fromNode.y + 30}
                        x2={toNode.x}
                        y2={toNode.y + 30}
                        stroke={color}
                        strokeWidth={style.strokeWidth}
                        strokeDasharray={style.strokeDasharray}
                        markerEnd="url(#arrowhead)"
                        opacity="0.8"
                        className="drop-shadow-lg"
                      />
                      {/* Connection label */}
                      <text
                        x={(fromNode.x + toNode.x) / 2}
                        y={(fromNode.y + toNode.y) / 2 - 5}
                        fill={color}
                        fontSize="10"
                        textAnchor="middle"
                        className="pointer-events-none font-medium"
                      >
                        {conn.label || 'Connected'}
                      </text>
                    </g>
                  );
                })}
                
                {/* Arrow marker definition */}
                <defs>
                  <marker
                    id="arrowhead"
                    markerWidth="10"
                    markerHeight="7"
                    refX="9"
                    refY="3.5"
                    orient="auto"
                  >
                    <polygon
                      points="0 0, 10 3.5, 0 7"
                      fill="#6B7280"
                    />
                  </marker>
                </defs>
                
                {/* Render nodes */}
                {currentVector?.nodes.map((node) => (
                  <g key={node.id}>
                    <rect
                      x={node.x}
                      y={node.y}
                      width="120"
                      height="60"
                      rx="8"
                      fill={getNodeColor(node.type)}
                      stroke={selectedNode?.id === node.id ? "#FBBF24" : "#374151"}
                      strokeWidth={selectedNode?.id === node.id ? "3" : "2"}
                      className="cursor-move hover:opacity-80"
                      onClick={() => handleNodeClick(node)}
                      onMouseDown={(e) => handleNodeMouseDown(node, e)}
                      style={{ userSelect: 'none' }}
                    />
                    <text
                      x={node.x + 60}
                      y={node.y + 25}
                      fill="white"
                      fontSize="16"
                      textAnchor="middle"
                      className="pointer-events-none"
                    >
                      {getNodeIcon(node.type)}
                    </text>
                    <text
                      x={node.x + 60}
                      y={node.y + 45}
                      fill="white"
                      fontSize="10"
                      textAnchor="middle"
                      className="pointer-events-none"
                    >
                      {node.title}
                    </text>
                  </g>
                ))}
              </svg>
            </div>
          </div>

          {/* Attack Vector Selector */}
          <div className="w-80 bg-gray-800 border-l border-gray-700 p-4">
            <h3 className="text-lg font-semibold mb-4 text-white">Attack Vectors</h3>
            
            <div className="space-y-2 mb-6">
              {attackVectors.map((vector) => (
                <div
                  key={vector.id}
                  className={`p-3 rounded-lg cursor-pointer ${
                    currentVector?.id === vector.id ? 'bg-blue-600' : 'bg-gray-700'
                  }`}
                  onClick={() => setCurrentVector(vector)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium text-white">{vector.name}</h4>
                      <p className="text-sm text-gray-300">{vector.description}</p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteVector(vector.id);
                      }}
                      className="text-red-400 hover:text-red-300"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Node Templates */}
            <div className="mb-6">
              <h4 className="text-sm font-medium text-gray-300 mb-3">Node Templates</h4>
              <div className="space-y-2">
                {[
                  { type: 'recon', title: 'Recon', icon: '🔍', inputs: 0, outputs: 1 },
                  { type: 'scan', title: 'Scan', icon: '📡', inputs: 1, outputs: 1 },
                  { type: 'vuln', title: 'Vuln', icon: '⚠️', inputs: 1, outputs: 1 },
                  { type: 'exploit', title: 'Exploit', icon: '💥', inputs: 1, outputs: 1 },
                  { type: 'post', title: 'Post', icon: '🎯', inputs: 1, outputs: 0 }
                ].map((template) => (
                  <div
                    key={template.type}
                    className="bg-gray-700 p-3 rounded-lg cursor-pointer hover:bg-gray-600"
                    onClick={() => handleAddNode(template)}
                  >
                    <div className="flex items-center space-x-2">
                      <span className="text-lg">{template.icon}</span>
                      <span className="text-sm text-white">{template.title}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Selected Node Properties */}
            {selectedNode && (
              <div className="mb-6">
                <h4 className="text-sm font-medium text-gray-300 mb-3">Node Properties</h4>
                <div className="bg-gray-700 rounded-lg p-3">
                  <div className="text-sm">
                    <div className="font-medium text-white flex items-center space-x-2">
                      <span>{getNodeIcon(selectedNode.type)}</span>
                      <span>{selectedNode.title}</span>
                    </div>
                    <div className="text-gray-400 mt-2">
                      <div>Type: {selectedNode.type}</div>
                      <div>Inputs: {selectedNode.inputs}</div>
                      <div>Outputs: {selectedNode.outputs}</div>
                      {selectedNode.data && (
                        <div className="mt-2">
                          <div className="text-white font-medium">Linked Data:</div>
                          <div className="text-gray-300 text-xs">
                            {selectedNode.data.type}: {selectedNode.data.name}
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="flex space-x-2 mt-3">
                      <button
                        onClick={() => handleEditNode(selectedNode)}
                        className="bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded text-sm"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleStartConnection(selectedNode)}
                        className="bg-yellow-600 hover:bg-yellow-700 px-3 py-1 rounded text-sm"
                      >
                        Connect
                      </button>
                      <button
                        onClick={() => handleDeleteNode(selectedNode.id)}
                        className="bg-red-600 hover:bg-red-700 px-3 py-1 rounded text-sm"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Risk Assessment Panel */}
        <div className="w-80 bg-gray-800 border-l border-gray-700 p-4">
          <h3 className="text-lg font-semibold mb-4 text-white">Risk Assessment</h3>
          
          {currentVector && (
            <div className="space-y-6">
              {/* Severity */}
              <div>
                <h4 className="text-sm font-medium text-gray-300 mb-3">Severity</h4>
                <div className="flex space-x-1">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((level) => (
                    <div
                      key={level}
                      className={`w-6 h-6 rounded cursor-pointer ${
                        currentVector.severity >= level ? 'bg-red-500' : 'bg-gray-600'
                      }`}
                      onClick={() => {
                        const updatedVector = { ...currentVector, severity: level };
                        setCurrentVector(updatedVector);
                        setAttackVectors(attackVectors.map(v => v.id === currentVector.id ? updatedVector : v));
                      }}
                    />
                  ))}
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  {currentVector.severity}/10
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
                        currentVector.plausibility >= level ? 'bg-yellow-500' : 'bg-gray-600'
                      }`}
                      onClick={() => {
                        const updatedVector = { ...currentVector, plausibility: level };
                        setCurrentVector(updatedVector);
                        setAttackVectors(attackVectors.map(v => v.id === currentVector.id ? updatedVector : v));
                      }}
                    />
                  ))}
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  {currentVector.plausibility}/10
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
                        currentVector.risk >= level ? 'bg-orange-500' : 'bg-gray-600'
                      }`}
                      onClick={() => {
                        const updatedVector = { ...currentVector, risk: level };
                        setCurrentVector(updatedVector);
                        setAttackVectors(attackVectors.map(v => v.id === currentVector.id ? updatedVector : v));
                      }}
                    />
                  ))}
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  {currentVector.risk}/10
                </div>
              </div>

              {/* Risk Summary */}
              <div className="bg-gray-700 rounded-lg p-3">
                <h4 className="text-sm font-medium text-gray-300 mb-2">Risk Summary</h4>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-300">Overall Risk:</span>
                    <span className={`font-medium ${
                      currentVector.risk >= 8 ? 'text-red-400' :
                      currentVector.risk >= 6 ? 'text-yellow-400' :
                      'text-green-400'
                    }`}>
                      {currentVector.risk >= 8 ? 'High' :
                       currentVector.risk >= 6 ? 'Medium' : 'Low'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Severity:</span>
                    <span className="text-red-400">{currentVector.severity}/10</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Plausibility:</span>
                    <span className="text-yellow-400">{currentVector.plausibility}/10</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add Vector Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4 text-white">Create New Attack Vector</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Vector Name</label>
                <input
                  type="text"
                  value={newVectorName}
                  onChange={(e) => setNewVectorName(e.target.value)}
                  className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                  placeholder="Enter attack vector name"
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
                onClick={handleSaveVector}
                className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg"
              >
                Create Vector
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Node Edit Modal */}
      {showNodeEditModal && selectedNode && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4 text-white">Edit Node</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Node Title</label>
                <input
                  type="text"
                  value={selectedNode.title}
                  onChange={(e) => setSelectedNode({...selectedNode, title: e.target.value})}
                  className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Link to Data</label>
                <select
                  value={selectedNode.data?.type || ''}
                  onChange={(e) => {
                    const dataType = e.target.value;
                    if (dataType) {
                      setSelectedNode({
                        ...selectedNode,
                        data: { type: dataType, name: '', id: '' }
                      });
                    } else {
                      setSelectedNode({
                        ...selectedNode,
                        data: null
                      });
                    }
                  }}
                  className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                >
                  <option value="">No data linked</option>
                  <option value="target">Target</option>
                  <option value="finding">Finding</option>
                  <option value="tool">Tool</option>
                </select>
              </div>
              
              {selectedNode.data && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Select {selectedNode.data.type}
                  </label>
                  <select
                    value={selectedNode.data.id || ''}
                    onChange={(e) => {
                      const selectedId = e.target.value;
                      const selectedItem = availableData[selectedNode.data.type + 's'].find(item => item.id == selectedId);
                      setSelectedNode({
                        ...selectedNode,
                        data: {
                          ...selectedNode.data,
                          id: selectedId,
                          name: selectedItem ? selectedItem.name || selectedItem.title || selectedItem.target_value : ''
                        }
                      });
                    }}
                    className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">Select {selectedNode.data.type}</option>
                    {availableData[selectedNode.data.type + 's'].map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name || item.title || item.target_value}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowNodeEditModal(false)}
                className="px-4 py-2 text-gray-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={() => handleUpdateNode(selectedNode.id, selectedNode)}
                className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg"
              >
                Update Node
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
            <p className="text-white">Loading attack vectors...</p>
          </div>
        </div>
      )}
      </div>
    </Layout>
  );
}