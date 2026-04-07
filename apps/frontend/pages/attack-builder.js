import { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import Link from 'next/link';

export default function AttackBuilder() {
  const [attackFlows, setAttackFlows] = useState([]);
  const [selectedFlow, setSelectedFlow] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [draggedNode, setDraggedNode] = useState(null);
  const [nodes, setNodes] = useState([]);
  const [connections, setConnections] = useState([]);
  const [aiSuggestions, setAiSuggestions] = useState([]);
  const [showAiPanel, setShowAiPanel] = useState(false);
  const canvasRef = useRef(null);

  // Attack flow templates
  const attackTemplates = [
    {
      id: 'recon',
      name: 'Reconnaissance',
      type: 'recon',
      icon: '🔍',
      inputs: 0,
      outputs: 1,
      color: '#3B82F6',
      description: 'Gather information about target'
    },
    {
      id: 'scan',
      name: 'Port Scan',
      type: 'scan',
      icon: '🎯',
      inputs: 1,
      outputs: 1,
      color: '#F59E0B',
      description: 'Scan for open ports and services'
    },
    {
      id: 'vuln',
      name: 'Vulnerability Assessment',
      type: 'vuln',
      icon: '⚠️',
      inputs: 1,
      outputs: 1,
      color: '#EF4444',
      description: 'Identify security vulnerabilities'
    },
    {
      id: 'exploit',
      name: 'Exploitation',
      type: 'exploit',
      icon: '💥',
      inputs: 1,
      outputs: 1,
      color: '#DC2626',
      description: 'Exploit identified vulnerabilities'
    },
    {
      id: 'privesc',
      name: 'Privilege Escalation',
      type: 'privesc',
      icon: '⬆️',
      inputs: 1,
      outputs: 1,
      color: '#7C3AED',
      description: 'Escalate privileges on compromised system'
    },
    {
      id: 'pivot',
      name: 'Lateral Movement',
      type: 'pivot',
      icon: '🔄',
      inputs: 1,
      outputs: 1,
      color: '#059669',
      description: 'Move laterally through network'
    },
    {
      id: 'persist',
      name: 'Persistence',
      type: 'persist',
      icon: '🔒',
      inputs: 1,
      outputs: 1,
      color: '#0891B2',
      description: 'Maintain access to compromised systems'
    },
    {
      id: 'exfil',
      name: 'Data Exfiltration',
      type: 'exfil',
      icon: '📤',
      inputs: 1,
      outputs: 0,
      color: '#BE185D',
      description: 'Extract sensitive data from target'
    }
  ];

  useEffect(() => {
    loadAttackFlows();
    initializeCanvas();
  }, []);

  const loadAttackFlows = () => {
    // Mock data - in real app, fetch from API
    const mockFlows = [
      {
        id: 1,
        name: "Web Application Attack Chain",
        description: "Complete web application penetration testing workflow",
        nodes: [
          { id: 'n1', template: 'recon', x: 100, y: 100, title: 'Target Recon' },
          { id: 'n2', template: 'scan', x: 300, y: 100, title: 'Port Scan' },
          { id: 'n3', template: 'vuln', x: 500, y: 100, title: 'Vuln Scan' },
          { id: 'n4', template: 'exploit', x: 700, y: 100, title: 'Web Exploit' },
          { id: 'n5', template: 'privesc', x: 900, y: 100, title: 'Priv Esc' }
        ],
        connections: [
          { from: 'n1', to: 'n2' },
          { from: 'n2', to: 'n3' },
          { from: 'n3', to: 'n4' },
          { from: 'n4', to: 'n5' }
        ],
        severity: 8,
        plausibility: 7,
        risk: 9,
        status: 'active',
        created: '2025-01-11 14:30:00'
      },
      {
        id: 2,
        name: "Network Pivot Attack",
        description: "Lateral movement through network segments",
        nodes: [
          { id: 'n1', template: 'recon', x: 100, y: 100, title: 'Network Map' },
          { id: 'n2', template: 'scan', x: 300, y: 100, title: 'Host Discovery' },
          { id: 'n3', template: 'exploit', x: 500, y: 100, title: 'Initial Access' },
          { id: 'n4', template: 'pivot', x: 700, y: 100, title: 'Lateral Move' },
          { id: 'n5', template: 'persist', x: 900, y: 100, title: 'Maintain Access' }
        ],
        connections: [
          { from: 'n1', to: 'n2' },
          { from: 'n2', to: 'n3' },
          { from: 'n3', to: 'n4' },
          { from: 'n4', to: 'n5' }
        ],
        severity: 9,
        plausibility: 6,
        risk: 8,
        status: 'planning',
        created: '2025-01-11 12:15:00'
      }
    ];
    
    setAttackFlows(mockFlows);
  };

  const initializeCanvas = () => {
    // Initialize canvas for drag and drop functionality
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.addEventListener('dragover', handleDragOver);
      canvas.addEventListener('drop', handleDrop);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const templateId = e.dataTransfer.getData('text/plain');
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    addNodeToCanvas(templateId, x, y);
  };

  const addNodeToCanvas = (templateId, x, y) => {
    const template = attackTemplates.find(t => t.id === templateId);
    if (template) {
      const newNode = {
        id: `node_${Date.now()}`,
        template: templateId,
        x: x - 50,
        y: y - 25,
        title: template.name
      };
      setNodes([...nodes, newNode]);
    }
  };

  const handleNodeDrag = (nodeId, newX, newY) => {
    setNodes(nodes.map(node => 
      node.id === nodeId ? { ...node, x: newX, y: newY } : node
    ));
  };

  const createConnection = (fromNode, toNode) => {
    const newConnection = {
      id: `conn_${Date.now()}`,
      from: fromNode,
      to: toNode
    };
    setConnections([...connections, newConnection]);
  };

  const getAiSuggestions = async (currentFlow) => {
    // Mock AI suggestions based on current flow
    const suggestions = [
      {
        id: 1,
        type: 'next_step',
        title: 'Add Vulnerability Scanner',
        description: 'Based on your port scan results, consider adding a vulnerability scanner to identify specific security issues.',
        confidence: 85,
        action: 'add_node',
        nodeType: 'vuln'
      },
      {
        id: 2,
        type: 'optimization',
        title: 'Parallel Execution',
        description: 'You can run reconnaissance and scanning in parallel to save time.',
        confidence: 92,
        action: 'optimize_flow'
      },
      {
        id: 3,
        type: 'security',
        title: 'Add Persistence Layer',
        description: 'Consider adding persistence mechanisms to maintain access after initial compromise.',
        confidence: 78,
        action: 'add_node',
        nodeType: 'persist'
      }
    ];
    
    setAiSuggestions(suggestions);
    setShowAiPanel(true);
  };

  const applyAiSuggestion = (suggestion) => {
    if (suggestion.action === 'add_node') {
      const template = attackTemplates.find(t => t.id === suggestion.nodeType);
      if (template) {
        const newNode = {
          id: `node_${Date.now()}`,
          template: suggestion.nodeType,
          x: 400,
          y: 200,
          title: template.name
        };
        setNodes([...nodes, newNode]);
      }
    }
    setShowAiPanel(false);
  };

  const getNodeColor = (templateId) => {
    const template = attackTemplates.find(t => t.id === templateId);
    return template ? template.color : '#6B7280';
  };

  const getNodeIcon = (templateId) => {
    const template = attackTemplates.find(t => t.id === templateId);
    return template ? template.icon : '📋';
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <Head>
        <title>Attack Flow Builder - BountyFlow</title>
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
          <div className="flex space-x-2">
            <button
              onClick={() => createConnection('n1', 'n2')}
              className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg"
            >
              Auto Layout
            </button>
            <button
              onClick={() => getAiSuggestions(selectedFlow)}
              className="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded-lg"
            >
              AI Suggestions
            </button>
            <button className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg">
              Save Flow
            </button>
          </div>
        </div>
      </div>

      <div className="flex h-screen">
        {/* Attack Flow Canvas */}
        <div className="flex-1 relative">
          <div className="absolute inset-0 bg-gray-800">
            <div
              ref={canvasRef}
              className="w-full h-full relative overflow-hidden"
              style={{ backgroundImage: 'radial-gradient(circle, #374151 1px, transparent 1px)', backgroundSize: '20px 20px' }}
            >
              {/* Render connections */}
              {connections.map((conn) => {
                const fromNode = nodes.find(n => n.id === conn.from);
                const toNode = nodes.find(n => n.id === conn.to);
                if (!fromNode || !toNode) return null;
                
                return (
                  <svg key={conn.id} className="absolute inset-0 pointer-events-none">
                    <line
                      x1={fromNode.x + 50}
                      y1={fromNode.y + 25}
                      x2={toNode.x + 50}
                      y2={toNode.y + 25}
                      stroke="#6B7280"
                      strokeWidth="2"
                      markerEnd="url(#arrowhead)"
                    />
                    <defs>
                      <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                        <polygon points="0 0, 10 3.5, 0 7" fill="#6B7280" />
                      </marker>
                    </defs>
                  </svg>
                );
              })}
              
              {/* Render nodes */}
              {nodes.map((node) => {
                const template = attackTemplates.find(t => t.id === node.template);
                return (
                  <div
                    key={node.id}
                    className="absolute cursor-move"
                    style={{ left: node.x, top: node.y }}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', node.id);
                      setDraggedNode(node);
                    }}
                    onDragEnd={(e) => {
                      const rect = canvasRef.current.getBoundingClientRect();
                      const newX = e.clientX - rect.left - 50;
                      const newY = e.clientY - rect.top - 25;
                      handleNodeDrag(node.id, newX, newY);
                    }}
                  >
                    <div
                      className="w-24 h-12 rounded-lg border-2 border-white shadow-lg flex items-center justify-center text-white font-medium text-sm"
                      style={{ backgroundColor: getNodeColor(node.template) }}
                    >
                      <span className="mr-1">{getNodeIcon(node.template)}</span>
                      <span className="truncate">{node.title}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Sidebar - Attack Templates */}
        <div className="w-80 bg-gray-800 border-l border-gray-700 p-4">
          <h3 className="text-lg font-semibold mb-4">Attack Components</h3>
          
          {/* Template Library */}
          <div className="space-y-2 mb-6">
            <h4 className="text-sm font-medium text-gray-300 mb-3">Drag & Drop Components</h4>
            {attackTemplates.map((template) => (
              <div
                key={template.id}
                className="bg-gray-700 rounded-lg p-3 cursor-move hover:bg-gray-600 transition-colors"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', template.id);
                }}
              >
                <div className="flex items-center space-x-3">
                  <span className="text-lg">{template.icon}</span>
                  <div className="flex-1">
                    <div className="font-medium text-white">{template.name}</div>
                    <div className="text-xs text-gray-400">{template.description}</div>
                  </div>
                  <div className="text-xs text-gray-400">
                    {template.inputs}→{template.outputs}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* AI Panel */}
          {showAiPanel && (
            <div className="mb-6 bg-purple-900 rounded-lg p-4">
              <h4 className="text-sm font-medium text-purple-300 mb-3">AI Suggestions</h4>
              <div className="space-y-2">
                {aiSuggestions.map((suggestion) => (
                  <div key={suggestion.id} className="bg-gray-700 rounded p-2">
                    <div className="text-sm font-medium text-white">{suggestion.title}</div>
                    <div className="text-xs text-gray-400 mb-2">{suggestion.description}</div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-purple-300">
                        Confidence: {suggestion.confidence}%
                      </span>
                      <button
                        onClick={() => applyAiSuggestion(suggestion)}
                        className="text-xs bg-purple-600 hover:bg-purple-700 px-2 py-1 rounded"
                      >
                        Apply
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Flow Controls */}
          <div className="space-y-2">
            <button className="w-full bg-blue-600 hover:bg-blue-700 px-3 py-2 rounded-lg text-sm">
              Clear Canvas
            </button>
            <button className="w-full bg-green-600 hover:bg-green-700 px-3 py-2 rounded-lg text-sm">
              Test Flow
            </button>
            <button className="w-full bg-purple-600 hover:bg-purple-700 px-3 py-2 rounded-lg text-sm">
              AI Optimize
            </button>
            <button className="w-full bg-gray-600 hover:bg-gray-700 px-3 py-2 rounded-lg text-sm">
              Export Flow
            </button>
          </div>
        </div>
      </div>

      {/* AI Suggestions Modal */}
      {showAiPanel && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">AI Attack Flow Suggestions</h2>
              <button
                onClick={() => setShowAiPanel(false)}
                className="text-gray-400 hover:text-white"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
            
            <div className="space-y-4">
              {aiSuggestions.map((suggestion) => (
                <div key={suggestion.id} className="bg-gray-700 rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-medium text-white">{suggestion.title}</h3>
                      <p className="text-sm text-gray-300 mt-1">{suggestion.description}</p>
                      <div className="flex items-center mt-2">
                        <span className="text-xs text-purple-300">
                          Confidence: {suggestion.confidence}%
                        </span>
                        <span className="ml-4 text-xs text-gray-400">
                          Type: {suggestion.type}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => applyAiSuggestion(suggestion)}
                      className="ml-4 bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded-lg text-sm"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


