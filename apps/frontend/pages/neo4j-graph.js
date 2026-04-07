import { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import Link from 'next/link';

export default function Neo4jGraph() {
  const [graphData, setGraphData] = useState({
    nodes: [],
    relationships: []
  });
  const [selectedNode, setSelectedNode] = useState(null);
  const [aiInsights, setAiInsights] = useState([]);
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [graphStats, setGraphStats] = useState({
    totalNodes: 0,
    totalRelationships: 0,
    compromisedNodes: 0,
    criticalPaths: 0
  });
  const canvasRef = useRef(null);

  useEffect(() => {
    loadGraphData();
  }, []);

  const loadGraphData = async () => {
    try {
      // Mock Neo4j data - in real app, fetch from Neo4j API
      const mockData = {
        nodes: [
          {
            id: 'user_1',
            type: 'User',
            label: 'admin',
            properties: {
              username: 'admin',
              privilege: 'root',
              status: 'compromised',
              lastLogin: '2025-01-11 14:30:00',
              passwordHash: 'hash123'
            },
            x: 200,
            y: 150
          },
          {
            id: 'user_2',
            type: 'User',
            label: 'dbuser',
            properties: {
              username: 'dbuser',
              privilege: 'user',
              status: 'compromised',
              lastLogin: '2025-01-11 12:15:00',
              passwordHash: 'hash456'
            },
            x: 400,
            y: 150
          },
          {
            id: 'server_1',
            type: 'Server',
            label: 'Web Server',
            properties: {
              ip: '192.168.1.10',
              hostname: 'web-server',
              os: 'Linux',
              status: 'compromised',
              openPorts: [80, 443, 22],
              lastScan: '2025-01-11 14:30:00'
            },
            x: 200,
            y: 300
          },
          {
            id: 'server_2',
            type: 'Server',
            label: 'Database Server',
            properties: {
              ip: '192.168.1.20',
              hostname: 'db-server',
              os: 'Linux',
              status: 'accessible',
              openPorts: [3306, 22],
              lastScan: '2025-01-11 12:15:00'
            },
            x: 400,
            y: 300
          },
          {
            id: 'server_3',
            type: 'Server',
            label: 'File Server',
            properties: {
              ip: '192.168.1.30',
              hostname: 'file-server',
              os: 'Windows',
              status: 'target',
              openPorts: [21, 445, 22],
              lastScan: '2025-01-11 10:45:00'
            },
            x: 600,
            y: 300
          },
          {
            id: 'server_4',
            type: 'Server',
            label: 'Domain Controller',
            properties: {
              ip: '192.168.1.1',
              hostname: 'dc-server',
              os: 'Windows Server',
              status: 'target',
              openPorts: [88, 389, 636],
              lastScan: '2025-01-11 09:30:00'
            },
            x: 300,
            y: 450
          }
        ],
        relationships: [
          {
            id: 'rel_1',
            type: 'HAS_ACCESS',
            from: 'user_1',
            to: 'server_1',
            properties: {
              method: 'SSH',
              timestamp: '2025-01-11 14:30:00',
              privilege: 'root'
            }
          },
          {
            id: 'rel_2',
            type: 'HAS_ACCESS',
            from: 'user_2',
            to: 'server_2',
            properties: {
              method: 'Database',
              timestamp: '2025-01-11 12:15:00',
              privilege: 'user'
            }
          },
          {
            id: 'rel_3',
            type: 'NETWORK_CONNECTION',
            from: 'server_1',
            to: 'server_2',
            properties: {
              protocol: 'TCP',
              port: 3306,
              status: 'active'
            }
          },
          {
            id: 'rel_4',
            type: 'NETWORK_CONNECTION',
            from: 'server_1',
            to: 'server_3',
            properties: {
              protocol: 'SMB',
              port: 445,
              status: 'active'
            }
          },
          {
            id: 'rel_5',
            type: 'LDAP_QUERY',
            from: 'server_2',
            to: 'server_4',
            properties: {
              query: 'user enumeration',
              timestamp: '2025-01-11 11:00:00'
            }
          }
        ]
      };

      setGraphData(mockData);
      calculateGraphStats(mockData);
      generateAiInsights(mockData);
    } catch (error) {
      console.error('Failed to load graph data:', error);
    }
  };

  const calculateGraphStats = (data) => {
    const stats = {
      totalNodes: data.nodes.length,
      totalRelationships: data.relationships.length,
      compromisedNodes: data.nodes.filter(node => 
        node.properties.status === 'compromised'
      ).length,
      criticalPaths: data.relationships.filter(rel => 
        rel.type === 'HAS_ACCESS' && rel.properties.privilege === 'root'
      ).length
    };
    setGraphStats(stats);
  };

  const generateAiInsights = (data) => {
    const insights = [
      {
        id: 1,
        type: 'security',
        title: 'Critical Privilege Escalation Path',
        description: 'Admin user has root access to web server. Consider lateral movement to database server.',
        confidence: 95,
        severity: 'high',
        nodes: ['user_1', 'server_1']
      },
      {
        id: 2,
        type: 'network',
        title: 'Network Pivot Opportunity',
        description: 'Web server has active connections to file server via SMB. Potential for lateral movement.',
        confidence: 87,
        severity: 'medium',
        nodes: ['server_1', 'server_3']
      },
      {
        id: 3,
        type: 'recon',
        title: 'LDAP Enumeration Detected',
        description: 'Database server is querying domain controller. Possible user enumeration attack.',
        confidence: 92,
        severity: 'high',
        nodes: ['server_2', 'server_4']
      }
    ];
    setAiInsights(insights);
  };

  const getNodeColor = (node) => {
    if (node.type === 'User') {
      switch (node.properties.status) {
        case 'compromised': return '#EF4444';
        case 'accessible': return '#F59E0B';
        case 'target': return '#3B82F6';
        default: return '#6B7280';
      }
    } else {
      switch (node.properties.status) {
        case 'compromised': return '#EF4444';
        case 'accessible': return '#F59E0B';
        case 'target': return '#3B82F6';
        default: return '#6B7280';
      }
    }
  };

  const getNodeIcon = (node) => {
    if (node.type === 'User') {
      switch (node.properties.privilege) {
        case 'root': return '👑';
        case 'admin': return '🔑';
        case 'user': return '👤';
        default: return '👤';
      }
    } else {
      switch (node.properties.os) {
        case 'Linux': return '🐧';
        case 'Windows': return '🪟';
        case 'Windows Server': return '🖥️';
        default: return '🖥️';
      }
    }
  };

  const getRelationshipColor = (rel) => {
    switch (rel.type) {
      case 'HAS_ACCESS': return '#10B981';
      case 'NETWORK_CONNECTION': return '#3B82F6';
      case 'LDAP_QUERY': return '#F59E0B';
      default: return '#6B7280';
    }
  };

  const handleNodeClick = (node) => {
    setSelectedNode(node);
  };

  const applyAiInsight = (insight) => {
    // Highlight nodes mentioned in the insight
    const highlightedNodes = insight.nodes;
    // In a real implementation, you would highlight these nodes
    console.log('Applying AI insight:', insight);
    setShowAiPanel(false);
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <Head>
        <title>Neo4j Graph - BountyFlow</title>
      </Head>

      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Link href="/dashboard" className="text-blue-400 hover:text-blue-300">
              ← Back to Dashboard
            </Link>
            <h1 className="text-2xl font-bold">Neo4j Graph Analysis</h1>
          </div>
          <div className="flex space-x-2">
            <button
              onClick={() => setShowAiPanel(true)}
              className="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded-lg"
            >
              AI Insights
            </button>
            <button className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg">
              Auto Layout
            </button>
            <button className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg">
              Export Graph
            </button>
          </div>
        </div>
      </div>

      <div className="flex h-screen">
        {/* Graph Visualization */}
        <div className="flex-1 relative">
          <div className="absolute inset-0 bg-gray-800">
            <svg 
              ref={canvasRef}
              width="100%" 
              height="100%" 
              className="absolute inset-0"
            >
              {/* Render relationships */}
              {graphData.relationships.map((rel) => {
                const fromNode = graphData.nodes.find(n => n.id === rel.from);
                const toNode = graphData.nodes.find(n => n.id === rel.to);
                if (!fromNode || !toNode) return null;
                
                return (
                  <g key={rel.id}>
                    <line
                      x1={fromNode.x}
                      y1={fromNode.y}
                      x2={toNode.x}
                      y2={toNode.y}
                      stroke={getRelationshipColor(rel)}
                      strokeWidth="2"
                      strokeDasharray={rel.type === 'LDAP_QUERY' ? '5,5' : '0'}
                    />
                    <text
                      x={(fromNode.x + toNode.x) / 2}
                      y={(fromNode.y + toNode.y) / 2 - 5}
                      fill="#9CA3AF"
                      fontSize="10"
                      textAnchor="middle"
                    >
                      {rel.type.replace('_', ' ')}
                    </text>
                  </g>
                );
              })}
              
              {/* Render nodes */}
              {graphData.nodes.map((node) => (
                <g key={node.id}>
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r="30"
                    fill={getNodeColor(node)}
                    stroke={selectedNode?.id === node.id ? "#FBBF24" : "#374151"}
                    strokeWidth={selectedNode?.id === node.id ? "3" : "2"}
                    className="cursor-pointer hover:r-35"
                    onClick={() => handleNodeClick(node)}
                  />
                  <text
                    x={node.x}
                    y={node.y - 40}
                    fill="white"
                    fontSize="12"
                    textAnchor="middle"
                    className="pointer-events-none"
                  >
                    {getNodeIcon(node)}
                  </text>
                  <text
                    x={node.x}
                    y={node.y + 5}
                    fill="white"
                    fontSize="10"
                    textAnchor="middle"
                    className="pointer-events-none"
                  >
                    {node.label}
                  </text>
                </g>
              ))}
            </svg>
          </div>
        </div>

        {/* Sidebar */}
        <div className="w-80 bg-gray-800 border-l border-gray-700 p-4">
          <h3 className="text-lg font-semibold mb-4">Graph Analysis</h3>
          
          {/* Graph Statistics */}
          <div className="mb-6">
            <h4 className="text-sm font-medium text-gray-300 mb-3">Statistics</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Total Nodes:</span>
                <span className="text-white">{graphStats.totalNodes}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Relationships:</span>
                <span className="text-white">{graphStats.totalRelationships}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Compromised:</span>
                <span className="text-red-400">{graphStats.compromisedNodes}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Critical Paths:</span>
                <span className="text-yellow-400">{graphStats.criticalPaths}</span>
              </div>
            </div>
          </div>

          {/* Selected Node Info */}
          {selectedNode && (
            <div className="mb-6">
              <h4 className="text-sm font-medium text-gray-300 mb-3">Selected Node</h4>
              <div className="bg-gray-700 rounded-lg p-3">
                <div className="text-sm">
                  <div className="font-medium text-white flex items-center space-x-2">
                    <span>{getNodeIcon(selectedNode)}</span>
                    <span>{selectedNode.label}</span>
                  </div>
                  <div className="text-gray-400 mt-2">
                    <div>Type: {selectedNode.type}</div>
                    <div>Status: {selectedNode.properties.status}</div>
                    {selectedNode.type === 'User' ? (
                      <>
                        <div>Privilege: {selectedNode.properties.privilege}</div>
                        <div>Last Login: {selectedNode.properties.lastLogin}</div>
                      </>
                    ) : (
                      <>
                        <div>IP: {selectedNode.properties.ip}</div>
                        <div>OS: {selectedNode.properties.os}</div>
                        <div>Ports: {selectedNode.properties.openPorts?.join(', ')}</div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* AI Insights */}
          <div className="mb-6">
            <h4 className="text-sm font-medium text-gray-300 mb-3">AI Insights</h4>
            <div className="space-y-2">
              {aiInsights.slice(0, 3).map((insight) => (
                <div key={insight.id} className="bg-gray-700 rounded p-2">
                  <div className="text-sm font-medium text-white">{insight.title}</div>
                  <div className="text-xs text-gray-400 mb-1">{insight.description}</div>
                  <div className="flex items-center justify-between">
                    <span className={`text-xs px-2 py-1 rounded ${
                      insight.severity === 'high' ? 'bg-red-900 text-red-300' :
                      insight.severity === 'medium' ? 'bg-yellow-900 text-yellow-300' :
                      'bg-green-900 text-green-300'
                    }`}>
                      {insight.severity}
                    </span>
                    <span className="text-xs text-purple-300">
                      {insight.confidence}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-2">
            <button className="w-full bg-blue-600 hover:bg-blue-700 px-3 py-2 rounded-lg text-sm">
              Add Node
            </button>
            <button className="w-full bg-green-600 hover:bg-green-700 px-3 py-2 rounded-lg text-sm">
              Auto Layout
            </button>
            <button className="w-full bg-purple-600 hover:bg-purple-700 px-3 py-2 rounded-lg text-sm">
              AI Analysis
            </button>
            <button className="w-full bg-gray-600 hover:bg-gray-700 px-3 py-2 rounded-lg text-sm">
              Export Graph
            </button>
          </div>
        </div>
      </div>

      {/* AI Insights Modal */}
      {showAiPanel && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">AI Graph Insights</h2>
              <button
                onClick={() => setShowAiPanel(false)}
                className="text-gray-400 hover:text-white"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
            
            <div className="space-y-4">
              {aiInsights.map((insight) => (
                <div key={insight.id} className="bg-gray-700 rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-medium text-white">{insight.title}</h3>
                      <p className="text-sm text-gray-300 mt-1">{insight.description}</p>
                      <div className="flex items-center mt-2">
                        <span className={`text-xs px-2 py-1 rounded mr-2 ${
                          insight.severity === 'high' ? 'bg-red-900 text-red-300' :
                          insight.severity === 'medium' ? 'bg-yellow-900 text-yellow-300' :
                          'bg-green-900 text-green-300'
                        }`}>
                          {insight.severity}
                        </span>
                        <span className="text-xs text-purple-300">
                          Confidence: {insight.confidence}%
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => applyAiInsight(insight)}
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


