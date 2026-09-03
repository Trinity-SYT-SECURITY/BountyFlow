import { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import Link from 'next/link';

export default function NetworkGraph() {
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [graphData, setGraphData] = useState({
    servers: [],
    users: [],
    relationships: []
  });
  const svgRef = useRef(null);

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    if (selectedProject) loadGraphData();
  }, [selectedProject]);

  const loadProjects = async () => {
    try {
      const response = await fetch('http://localhost:8002/api/v1/projects');
      if (!response.ok) return;
      const data = await response.json();
      setProjects(data);
      if (data.length > 0) setSelectedProject(data[0]);
    } catch (error) {
      console.error('Failed to load projects:', error);
    }
  };

  const loadGraphData = async () => {
    // The four servers, four users and their relationships used to be literals
    // in this function, so the page looked the same on every instance. It now
    // reads the project's knowledge graph and derives the network view from it.
    if (!selectedProject) return;
    try {
      const response = await fetch(
        `http://localhost:8002/api/v1/neo4j/graph/${selectedProject.id}`);
      if (!response.ok) {
        setGraphData({ servers: [], users: [], relationships: [] });
        setNodes([]);
        setEdges([]);
        return;
      }
      const payload = await response.json();
      const data = toNetworkView(payload);
      setGraphData(data);
      generateGraphNodes(data);
    } catch (error) {
      console.error('Failed to load graph data:', error);
      setGraphData({ servers: [], users: [], relationships: [] });
      setNodes([]);
      setEdges([]);
    }
  };

  /* The graph API returns typed nodes and relationships; this page thinks in
     servers, users and the links between them. Targets and servers both become
     hosts, everything else is dropped from this particular view. */
  const toNetworkView = (payload) => {
    const nodes = payload.nodes || [];
    const relationships = payload.relationships || [];
    const isHost = (n) => ['server', 'target'].includes((n.type || '').toLowerCase());
    const isUser = (n) => (n.type || '').toLowerCase() === 'user';

    const servers = nodes.filter(isHost).map((n) => ({
      id: n.id,
      name: n.label,
      ip: n.properties?.ip || n.properties?.target_value || n.label,
      type: (n.properties?.type || 'host'),
      status: n.properties?.status || 'accessible',
      ports: n.properties?.open_ports || n.properties?.ports || []
    }));

    const users = nodes.filter(isUser).map((n) => ({
      id: n.id,
      username: n.label,
      server_id: n.properties?.server_id || null,
      privilege: n.properties?.privilege || n.properties?.privilege_level || 'user',
      status: n.properties?.status || 'accessible'
    }));

    return {
      servers,
      users,
      relationships: relationships.map((r) => ({
        from: r.from ?? r.source,
        to: r.to ?? r.target,
        type: r.type,
        status: r.properties?.status || 'active'
      }))
    };
  };

  const generateGraphNodes = (data) => {
    const nodes = [];
    const edges = [];

    // Add server nodes
    data.servers.forEach(server => {
      nodes.push({
        id: server.id,
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
        id: user.id,
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
        from: rel.from,
        to: rel.to,
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
            <select
              value={selectedProject?.id || ''}
              onChange={(e) => setSelectedProject(
                projects.find(p => p.id === parseInt(e.target.value)) || null)}
              className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm"
            >
              {projects.length === 0 && <option value="">No projects</option>}
              {projects.map(project => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
            </select>
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


