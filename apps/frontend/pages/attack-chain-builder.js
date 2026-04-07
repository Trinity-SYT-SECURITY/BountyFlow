import { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useToast } from '../components/Toast';

export default function AttackChainBuilder() {
  const toast = useToast();
  const [selectedProject, setSelectedProject] = useState(null);
  const [projects, setProjects] = useState([]);
  const [attackChains, setAttackChains] = useState([]);
  const [currentChain, setCurrentChain] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [draggedNode, setDraggedNode] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newChainName, setNewChainName] = useState('');
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
      loadAttackChains();
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

  const loadAttackChains = async () => {
    if (!selectedProject) return;
    
    try {
      setIsLoading(true);
      // Fetch attack chains from API
      const response = await fetch(`http://localhost:8002/api/v1/attack-chains/${selectedProject.id}`);
      if (response.ok) {
        const data = await response.json();
        setAttackChains(data);
        if (data.length > 0) {
          setCurrentChain(data[0]);
        }
      } else {
        setAttackChains([]);
      }
    } catch (error) {
      console.error('Failed to load attack chains:', error);
      setAttackChains([]);
    } finally {
      setIsLoading(false);
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
    setSelectedNode(node);
  };

  const handleNodeDragStart = (node, event) => {
    setDraggedNode(node);
    setIsDragging(true);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', JSON.stringify(node));
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
      setCurrentChain(prev => ({
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
    event.dataTransfer.dropEffect = 'move';
  };

  const handleAddChain = () => {
    setShowAddModal(true);
  };

  const handleSaveChain = () => {
    if (!newChainName.trim()) return;
    
    const newChain = {
      id: Math.max(...attackChains.map(c => c.id)) + 1,
      name: newChainName,
      description: 'New attack chain',
      severity: severity,
      plausibility: plausibility,
      risk: risk,
      nodes: [],
      connections: []
    };
    
    setAttackChains([...attackChains, newChain]);
    setCurrentChain(newChain);
    setShowAddModal(false);
    setNewChainName('');
  };

  const handleDeleteChain = (chainId) => {
    setAttackChains(attackChains.filter(c => c.id !== chainId));
    if (currentChain?.id === chainId) {
      setCurrentChain(attackChains.length > 1 ? attackChains[0] : null);
    }
  };

  const handleSaveChanges = () => {
    // In a real implementation, save changes to backend
    toast.success('Attack chain saved successfully!');
  };

  const handleDeleteNode = (nodeId) => {
    if (!currentChain) return;
    
    const updatedChain = {
      ...currentChain,
      nodes: currentChain.nodes.filter(n => n.id !== nodeId),
      connections: currentChain.connections.filter(c => c.from !== nodeId && c.to !== nodeId)
    };
    
    setCurrentChain(updatedChain);
    setSelectedNode(null);
  };

  const handleAddNode = (template) => {
    if (!currentChain) return;
    
    const newNode = {
      id: `node_${Date.now()}`,
      type: template.type,
      title: template.title,
      x: Math.random() * 600 + 100,
      y: Math.random() * 400 + 100,
      inputs: template.inputs || 1,
      outputs: template.outputs || 1
    };
    
    setCurrentChain(prev => ({
      ...prev,
      nodes: [...prev.nodes, newNode]
    }));
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <Head>
        <title>Attack Chain Builder - BountyFlow</title>
      </Head>

      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Link href="/dashboard" className="text-blue-400 hover:text-blue-300">
              ← Back to Dashboard
            </Link>
            <h1 className="text-2xl font-bold">Attack Chain Builder</h1>
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
                onClick={handleAddChain}
                className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg"
              >
                New Chain
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
          {/* Attack Chain Canvas */}
          <div className="flex-1 relative">
            <div className="absolute inset-0 bg-gray-800">
              <svg 
                ref={canvasRef}
                width="100%" 
                height="100%" 
                className="absolute inset-0"
                onDrop={handleCanvasDrop}
                onDragOver={handleCanvasDragOver}
              >
                {/* Render relationships */}
                {currentChain?.connections.map((conn, index) => {
                  const fromNode = currentChain.nodes.find(n => n.id === conn.from);
                  const toNode = currentChain.nodes.find(n => n.id === conn.to);
                  if (!fromNode || !toNode) return null;
                  
                  return (
                    <g key={index}>
                      <line
                        x1={fromNode.x + 60}
                        y1={fromNode.y + 30}
                        x2={toNode.x}
                        y2={toNode.y + 30}
                        stroke="#6B7280"
                        strokeWidth="2"
                        markerEnd="url(#arrowhead)"
                      />
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
                {currentChain?.nodes.map((node) => (
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
                      className="cursor-pointer hover:opacity-80"
                      onClick={() => handleNodeClick(node)}
                      onMouseDown={(e) => handleNodeDragStart(node, e)}
                      onMouseUp={handleNodeDragEnd}
                      draggable
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

          {/* Attack Chain Selector */}
          <div className="w-80 bg-gray-800 border-l border-gray-700 p-4">
            <h3 className="text-lg font-semibold mb-4">Attack Chains</h3>
            
            <div className="space-y-2 mb-6">
              {attackChains.map((chain) => (
                <div
                  key={chain.id}
                  className={`p-3 rounded-lg cursor-pointer ${
                    currentChain?.id === chain.id ? 'bg-blue-600' : 'bg-gray-700'
                  }`}
                  onClick={() => setCurrentChain(chain)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium">{chain.name}</h4>
                      <p className="text-sm text-gray-300">{chain.description}</p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteChain(chain.id);
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
                      <span className="text-sm">{template.title}</span>
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
                    </div>
                    <button
                      onClick={() => handleDeleteNode(selectedNode.id)}
                      className="mt-2 bg-red-600 hover:bg-red-700 px-3 py-1 rounded text-sm"
                    >
                      Delete Node
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
          
          {currentChain && (
            <div className="space-y-6">
              {/* Severity */}
              <div>
                <h4 className="text-sm font-medium text-gray-300 mb-3">Severity</h4>
                <div className="flex space-x-1">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((level) => (
                    <div
                      key={level}
                      className={`w-6 h-6 rounded cursor-pointer ${
                        currentChain.severity >= level ? 'bg-red-500' : 'bg-gray-600'
                      }`}
                      onClick={() => {
                        const updatedChain = { ...currentChain, severity: level };
                        setCurrentChain(updatedChain);
                        setAttackChains(attackChains.map(c => c.id === currentChain.id ? updatedChain : c));
                      }}
                    />
                  ))}
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  {currentChain.severity}/10
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
                        currentChain.plausibility >= level ? 'bg-yellow-500' : 'bg-gray-600'
                      }`}
                      onClick={() => {
                        const updatedChain = { ...currentChain, plausibility: level };
                        setCurrentChain(updatedChain);
                        setAttackChains(attackChains.map(c => c.id === currentChain.id ? updatedChain : c));
                      }}
                    />
                  ))}
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  {currentChain.plausibility}/10
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
                        currentChain.risk >= level ? 'bg-orange-500' : 'bg-gray-600'
                      }`}
                      onClick={() => {
                        const updatedChain = { ...currentChain, risk: level };
                        setCurrentChain(updatedChain);
                        setAttackChains(attackChains.map(c => c.id === currentChain.id ? updatedChain : c));
                      }}
                    />
                  ))}
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  {currentChain.risk}/10
                </div>
              </div>

              {/* Risk Summary */}
              <div className="bg-gray-700 rounded-lg p-3">
                <h4 className="text-sm font-medium text-gray-300 mb-2">Risk Summary</h4>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>Overall Risk:</span>
                    <span className={`font-medium ${
                      currentChain.risk >= 8 ? 'text-red-400' :
                      currentChain.risk >= 6 ? 'text-yellow-400' :
                      'text-green-400'
                    }`}>
                      {currentChain.risk >= 8 ? 'High' :
                       currentChain.risk >= 6 ? 'Medium' : 'Low'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Severity:</span>
                    <span className="text-red-400">{currentChain.severity}/10</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Plausibility:</span>
                    <span className="text-yellow-400">{currentChain.plausibility}/10</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add Chain Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Create New Attack Chain</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Chain Name</label>
                <input
                  type="text"
                  value={newChainName}
                  onChange={(e) => setNewChainName(e.target.value)}
                  className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                  placeholder="Enter attack chain name"
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
                onClick={handleSaveChain}
                className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg"
              >
                Create Chain
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
            <p className="text-white">Loading attack chains...</p>
          </div>
        </div>
      )}
    </div>
  );
}