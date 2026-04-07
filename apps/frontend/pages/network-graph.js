import { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import Link from 'next/link';

export default function NetworkGraph() {
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [graphData, setGraphData] = useState({
    servers: [],
    users: [],
    relationships: []
  });
  const svgRef = useRef(null);

  useEffect(() => {
    loadGraphData();
  }, []);

  const loadGraphData = () => {
    // Mock data - in real app, fetch from Neo4j
    const mockData = {
      servers: [
        { id: 1, name: "Web Server", ip: "192.168.1.10", type: "web", status: "compromised", ports: [80, 443, 22] },
        { id: 2, name: "Database Server", ip: "192.168.1.20", type: "database", status: "accessible", ports: [3306, 22] },
        { id: 3, name: "File Server", ip: "192.168.1.30", type: "fileserver", status: "accessible", ports: [21, 22, 445] },
        { id: 4, name: "Domain Controller", ip: "192.168.1.1", type: "dc", status: "target", ports: [88, 389, 636] }
      ],
      users: [
        { id: 1, username: "admin", server_id: 1, privilege: "root", status: "compromised" },
        { id: 2, username: "dbuser", server_id: 2, privilege: "user", status: "compromised" },
        { id: 3, username: "guest", server_id: 3, privilege: "guest", status: "accessible" },
        { id: 4, username: "administrator", server_id: 4, privilege: "admin", status: "target" }
      ],
      relationships: [
        { from: 1, to: 2, type: "database_connection", status: "active" },
        { from: 1, to: 3, type: "file_access", status: "active" },
        { from: 2, to: 4, type: "ldap_query", status: "attempted" },
        { from: 3, to: 4, type: "smb_enum", status: "successful" }
      ]
    };

    setGraphData(mockData);
    generateGraphNodes(mockData);
  };

  const generateGraphNodes = (data) => {
    const nodes = [];
    const edges = [];

    // Add server nodes
    data.servers.forEach(server => {
      nodes.push({
        id: `server_${server.id}`,
        type: 'server',
        label: server.name,
        ip: server.ip,
        status: server.status,
        ports: server.ports,
        x: Math.random() * 400 + 100,
        y: Math.random() * 300 + 100
      });
    });

    // Add user nodes
    data.users.forEach(user => {
      const server = data.servers.find(s => s.id === user.server_id);
      nodes.push({
        id: `user_${user.id}`,
        type: 'user',
        label: user.username,
        privilege: user.privilege,
        status: user.status,
        server_id: user.server_id,
        x: Math.random() * 200 + 200,
        y: Math.random() * 200 + 200
      });
    });

    // Add relationship edges
    data.relationships.forEach(rel => {
      edges.push({
        id: `edge_${rel.from}_${rel.to}`,
        from: `server_${rel.from}`,
        to: `server_${rel.to}`,
        type: rel.type,
        status: rel.status
      });
    });

    setNodes(nodes);
    setEdges(edges);
  };

  const getNodeColor = (node) => {
    if (node.type === 'server') {
      switch (node.status) {
        case 'compromised': return '#ef4444';
        case 'accessible': return '#f59e0b';
        case 'target': return '#3b82f6';
        default: return '#6b7280';
      }
    } else {
      switch (node.status) {
        case 'compromised': return '#ef4444';
        case 'accessible': return '#f59e0b';
        case 'target': return '#3b82f6';
        default: return '#6b7280';
      }
    }
  };

  const getEdgeColor = (edge) => {
    switch (edge.status) {
      case 'active': return '#10b981';
      case 'successful': return '#3b82f6';
      case 'attempted': return '#f59e0b';
      case 'failed': return '#ef4444';
      default: return '#6b7280';
    }
  };

  const handleNodeClick = (node) => {
    setSelectedNode(node);
  };

  const getNodeIcon = (node) => {
    if (node.type === 'server') {
      switch (node.status) {
        case 'compromised': return '💀';
        case 'accessible': return '🔓';
        case 'target': return '🎯';
        default: return '🖥️';
      }
    } else {
      switch (node.privilege) {
        case 'root': return '👑';
        case 'admin': return '🔑';
        case 'user': return '👤';
        case 'guest': return '👥';
        default: return '👤';
      }
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <Head>
        <title>Network Graph - BountyFlow</title>
      </Head>

      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Link href="/dashboard" className="text-blue-400 hover:text-blue-300">
              ← Back to Dashboard
            </Link>
            <h1 className="text-2xl font-bold">Network Graph</h1>
          </div>
          <div className="flex space-x-2">
            <button className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg">
              Auto Layout
            </button>
            <button className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg">
              Export
            </button>
          </div>
        </div>
      </div>

      <div className="flex h-screen">
        {/* Graph Visualization */}
        <div className="flex-1 relative">
          <div className="absolute inset-0 bg-gray-800">
            <svg 
              ref={svgRef}
              width="100%" 
              height="100%" 
              className="absolute inset-0 cursor-pointer"
            >
              {/* Render edges */}
              {edges.map((edge) => {
                const fromNode = nodes.find(n => n.id === edge.from);
                const toNode = nodes.find(n => n.id === edge.to);
                if (!fromNode || !toNode) return null;
                
                return (
                  <g key={edge.id}>
                    <line
                      x1={fromNode.x}
                      y1={fromNode.y}
                      x2={toNode.x}
                      y2={toNode.y}
                      stroke={getEdgeColor(edge)}
                      strokeWidth="2"
                      strokeDasharray={edge.status === 'attempted' ? '5,5' : '0'}
                    />
                    <text
                      x={(fromNode.x + toNode.x) / 2}
                      y={(fromNode.y + toNode.y) / 2 - 5}
                      fill="#9CA3AF"
                      fontSize="10"
                      textAnchor="middle"
                    >
                      {edge.type.replace('_', ' ')}
                    </text>
                  </g>
                );
              })}
              
              {/* Render nodes */}
              {nodes.map((node) => (
                <g key={node.id}>
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r="25"
                    fill={getNodeColor(node)}
                    stroke={selectedNode?.id === node.id ? "#FBBF24" : "#374151"}
                    strokeWidth={selectedNode?.id === node.id ? "3" : "2"}
                    className="cursor-pointer hover:r-30"
                    onClick={() => handleNodeClick(node)}
                  />
                  <text
                    x={node.x}
                    y={node.y - 35}
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
          <h3 className="text-lg font-semibold mb-4">Graph Controls</h3>
          
          {/* Node Types Legend */}
          <div className="mb-6">
            <h4 className="text-sm font-medium text-gray-300 mb-3">Node Types</h4>
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <span className="text-sm text-gray-300">Compromised</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                <span className="text-sm text-gray-300">Accessible</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                <span className="text-sm text-gray-300">Target</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 rounded-full bg-gray-500"></div>
                <span className="text-sm text-gray-300">Unknown</span>
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
                    {selectedNode.type === 'server' ? (
                      <>
                        <div>IP: {selectedNode.ip}</div>
                        <div>Status: {selectedNode.status}</div>
                        <div>Ports: {selectedNode.ports?.join(', ')}</div>
                      </>
                    ) : (
                      <>
                        <div>Privilege: {selectedNode.privilege}</div>
                        <div>Status: {selectedNode.status}</div>
                        <div>Server: {selectedNode.server_id}</div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Graph Stats */}
          <div className="mb-6">
            <h4 className="text-sm font-medium text-gray-300 mb-3">Graph Statistics</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Servers:</span>
                <span className="text-white">{graphData.servers.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Users:</span>
                <span className="text-white">{graphData.users.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Connections:</span>
                <span className="text-white">{graphData.relationships.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Compromised:</span>
                <span className="text-red-400">
                  {nodes.filter(n => n.status === 'compromised').length}
                </span>
              </div>
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
    </div>
  );
}


