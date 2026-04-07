import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';
import { useToast } from '../components/Toast';
import { useModal } from '../components/Modal';

export default function SecurityRelationshipMap() {
  const toast = useToast();
  const { confirm: modalConfirm } = useModal();
  const router = useRouter();
  const [selectedProject, setSelectedProject] = useState(null);
  const [projects, setProjects] = useState([]);
  const [graphData, setGraphData] = useState({
    nodes: [],
    relationships: []
  });
  const [selectedNode, setSelectedNode] = useState(null);
  const [focusedNodeId, setFocusedNodeId] = useState(null);
  const [aiInsights, setAiInsights] = useState([]);
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [graphStats, setGraphStats] = useState({
    totalNodes: 0,
    totalRelationships: 0,
    compromisedNodes: 0,
    criticalPaths: 0
  });
  const [isLoading, setIsLoading] = useState(false);
  // const [autoRefresh, setAutoRefresh] = useState(true); // Removed - no auto refresh
  const [draggedNode, setDraggedNode] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [wsConnection, setWsConnection] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const canvasRef = useRef(null);
  const graphDataRef = useRef({ nodes: [], relationships: [] });

  useEffect(() => {
    loadProjects();
  }, []);

  // Auto refresh removed - users can manually refresh using the refresh button
  // useEffect(() => {
  //   if (autoRefresh && selectedProject) {
  //     const interval = setInterval(() => {
  //       loadGraphData(true);
  //     }, 30000);
  //     return () => clearInterval(interval);
  //   }
  // }, [autoRefresh, selectedProject]);

  // WebSocket connection management
  useEffect(() => {
    if (selectedProject) {
      // Create WebSocket connection
      const ws = new WebSocket(`ws://localhost:8002/ws/${selectedProject.id}`);
      
      ws.onopen = () => {
        console.log('WebSocket connected for project:', selectedProject.id);
        setWsConnection(ws);
      };
      
      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          handleWebSocketMessage(message);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };
      
      ws.onclose = () => {
        console.log('WebSocket disconnected');
        setWsConnection(null);
      };
      
      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        // Don't show error, because WebSocket is an optional feature
      };
      
      return () => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
      };
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

  // Strip markdown formatting for preview text
  const stripMarkdown = (text) => {
    if (!text) return '';
    return text
      // Remove headers (### Header)
      .replace(/#{1,6}\s+/g, '')
      // Remove bold (**text** or __text__)
      .replace(/(\*\*|__)(.*?)\1/g, '$2')
      // Remove italic (*text* or _text_)
      .replace(/(\*|_)(.*?)\1/g, '$2')
      // Remove inline code (`code`)
      .replace(/`([^`]+)`/g, '$1')
      // Remove code blocks (```code```)
      .replace(/```[\s\S]*?```/g, '[code]')
      // Remove links [text](url)
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
      // Remove images ![alt](url)
      .replace(/!\[([^\]]*)\]\([^\)]+\)/g, '')
      // Remove horizontal rules (---)
      .replace(/^[-*_]{3,}$/gm, '')
      // Remove blockquotes (>)
      .replace(/^\s*>\s*/gm, '')
      // Remove list markers (- or * or 1.)
      .replace(/^\s*[-*+]\s+/gm, '')
      .replace(/^\s*\d+\.\s+/gm, '')
      // Remove extra whitespace
      .replace(/\n\s*\n/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const loadGraphData = async (preserveRelationships = false, forceRefresh = false) => {
    if (!selectedProject) {
      console.log('No project selected, cannot load graph data');
      return;
    }
    
    try {
      setIsLoading(true);
      console.log('Loading graph data for project:', selectedProject.id, forceRefresh ? '(force refresh)' : '');
      
      // Clear existing data first
      if (forceRefresh) {
        setGraphData({ nodes: [], relationships: [] });
        graphDataRef.current = { nodes: [], relationships: [] };
      }
      
      // Use force_refresh parameter to bypass backend cache
      const url = forceRefresh
        ? `http://localhost:8002/api/v1/neo4j/graph/${selectedProject.id}?force_refresh=true`
        : `http://localhost:8002/api/v1/neo4j/graph/${selectedProject.id}`;
      
      // Use the dedicated Knowledge Graph API that reads from database
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      if (response.ok) {
        const graphApiData = await response.json();
        console.log('Fetched graph data from API:', graphApiData);
        
        // Transform API response
        const rawNodes = (graphApiData.nodes || []);
        const rawEdges = (graphApiData.links || graphApiData.relationships || []);

        // --- Step 1: Dedup targets + merge IP nodes into matching targets ---
        const idRemap = {};
        const targetsByLabel = new Map(); // label_lower -> canonical target node
        const parsedNodes = [];

        // First pass: collect unique targets
        rawNodes.forEach((node, index) => {
          const type = (node.type || '').toLowerCase();
          const label = (node.label || node.name || '').toLowerCase().trim();
          if (type === 'target') {
            if (targetsByLabel.has(label)) {
              idRemap[node.id] = targetsByLabel.get(label).id;
            } else {
              const n = {
                id: node.id, type: node.type,
                label: node.label || node.name || 'Unknown',
                x: node.x || 100 + (index % 5) * 200,
                y: node.y || 100 + Math.floor(index / 5) * 150,
                properties: node.properties || {}
              };
              targetsByLabel.set(label, n);
              parsedNodes.push(n);
            }
          }
        });

        // Second pass: non-targets — merge ip_address/host into matching target
        rawNodes.forEach((node, index) => {
          const type = (node.type || '').toLowerCase();
          if (type === 'target') return; // already handled
          const label = (node.label || node.name || '').toLowerCase().trim();
          if ((type === 'ip_address' || type === 'host' || type === 'ip') && targetsByLabel.has(label)) {
            // This IP matches a target — merge into the target
            idRemap[node.id] = targetsByLabel.get(label).id;
            return;
          }
          parsedNodes.push({
            id: node.id, type: node.type,
            label: node.label || node.name || 'Unknown',
            x: node.x || 100 + (index % 5) * 200,
            y: node.y || 100 + Math.floor(index / 5) * 150,
            properties: node.properties || {}
          });
        });

        // --- Step 2: Apply remap to edges, build adjacency ---
        const adj = {}; // nodeId -> Set of connected nodeIds
        const remappedEdges = [];
        rawEdges.forEach(link => {
          const fromId = idRemap[link.from] || link.from;
          const toId = idRemap[link.to] || link.to;
          if (fromId === toId) return;
          remappedEdges.push({ ...link, from: fromId, to: toId });
          if (!adj[fromId]) adj[fromId] = new Set();
          if (!adj[toId]) adj[toId] = new Set();
          adj[fromId].add(toId);
          adj[toId].add(fromId);
        });

        // --- Step 3: BFS from each target to find owned nodes ---
        const nodeOwner = {}; // nodeId -> targetId
        const targetIds = [...targetsByLabel.values()].map(t => t.id);
        targetIds.forEach(tid => {
          nodeOwner[tid] = tid;
          const queue = [tid];
          const visited = new Set([tid]);
          while (queue.length > 0) {
            const curr = queue.shift();
            (adj[curr] || []).forEach(neighbor => {
              if (visited.has(neighbor)) return;
              if (targetIds.includes(neighbor)) return; // don't cross into another target
              if (nodeOwner[neighbor] && nodeOwner[neighbor] !== tid) return; // already owned by another target
              visited.add(neighbor);
              nodeOwner[neighbor] = tid;
              queue.push(neighbor);
            });
          }
        });

        // --- Step 4: Per-target dedup (same type+label under same target = merge) ---
        const perTargetSeen = {}; // targetId -> Map("type|label" -> canonicalNodeId)
        targetIds.forEach(tid => { perTargetSeen[tid] = new Map(); });

        const finalNodes = [];
        const parsedById = {};
        parsedNodes.forEach(n => { parsedById[n.id] = n; });

        // Add targets first
        parsedNodes.forEach(n => {
          if (targetIds.includes(n.id)) finalNodes.push(n);
        });

        // Add non-targets with per-target dedup
        parsedNodes.forEach(n => {
          if (targetIds.includes(n.id)) return;
          const owner = nodeOwner[n.id];
          if (!owner) {
            // Orphan — keep as-is
            finalNodes.push(n);
            return;
          }
          const type = (n.type || '').toLowerCase();
          const label = n.label.toLowerCase().trim();
          const dedupKey = `${type}|${label}`;
          const targetSeen = perTargetSeen[owner];

          if (targetSeen && targetSeen.has(dedupKey)) {
            // Duplicate under this target — remap to canonical
            idRemap[n.id] = targetSeen.get(dedupKey);
          } else {
            if (targetSeen) targetSeen.set(dedupKey, n.id);
            finalNodes.push(n);
          }
        });

        const nodes = finalNodes;
        const nodeIdSet = new Set(nodes.map(n => n.id));

        // --- Step 5: Final edge list — apply all remaps, dedup by node pair, combine labels ---
        const edgeMap = new Map(); // "fromId|toId" -> edge object
        remappedEdges.forEach(link => {
          const fromId = idRemap[link.from] || link.from;
          const toId = idRemap[link.to] || link.to;
          if (fromId === toId) return;
          if (!nodeIdSet.has(fromId) || !nodeIdSet.has(toId)) return;

          // Block cross-target edges
          const fromOwner = nodeOwner[fromId];
          const toOwner = nodeOwner[toId];
          if (fromOwner && toOwner && fromOwner !== toOwner) return;

          // Normalize redundant edge types
          const normalizeType = (t) => {
            const s = (t || 'related').toLowerCase().replace(/_/g, ' ');
            // Map redundant types to canonical form
            if (s.includes('open port') || s === 'has port') return 'has port';
            if (s.includes('run') && s.includes('service')) return 'runs service';
            if (s.includes('listen') && s.includes('on')) return 'listens on';
            if (s.includes('has service')) return 'has service';
            return s;
          };

          const pairKey = `${fromId}|${toId}`;
          const normalizedType = normalizeType(link.type);
          if (edgeMap.has(pairKey)) {
            const existing = edgeMap.get(pairKey);
            const existingLabels = existing.label.split(', ');
            if (!existingLabels.includes(normalizedType)) {
              existing.label = existingLabels.concat(normalizedType).join(', ');
            }
          } else {
            edgeMap.set(pairKey, {
              id: link.id, from: fromId, to: toId,
              type: link.type || 'related',
              label: normalizedType,
              properties: link.properties || {}
            });
          }
        });
        const relationships = Array.from(edgeMap.values());

        // --- Step 6: Tree layout — follow actual edges per target group ---
        const H_SPACING = 180;
        const V_SPACING = 90;
        const GROUP_GAP = 100;
        const START_X = 100;
        const START_Y = 80;

        const nodeMap = {};
        nodes.forEach(n => { nodeMap[n.id] = n; });

        // Build directed adjacency from relationships (parent -> children)
        const childrenEdges = {}; // parentId -> [childId]
        relationships.forEach(r => {
          // Edges go from -> to; from is parent
          if (!childrenEdges[r.from]) childrenEdges[r.from] = [];
          childrenEdges[r.from].push(r.to);
        });

        let cursorY = START_Y;
        const positioned = new Set();

        // For each target, BFS tree layout following edges
        targetIds.forEach((tid) => {
          const tNode = nodeMap[tid];
          if (!tNode) return;

          // BFS to build levels
          const levels = [[tid]];
          const visited = new Set([tid]);
          let frontier = [tid];

          while (frontier.length > 0) {
            const nextLevel = [];
            frontier.forEach(parentId => {
              (childrenEdges[parentId] || []).forEach(childId => {
                if (visited.has(childId)) return;
                if (!nodeMap[childId]) return;
                // Only include nodes owned by this target
                if (nodeOwner[childId] && nodeOwner[childId] !== tid) return;
                visited.add(childId);
                nextLevel.push(childId);
              });
            });
            if (nextLevel.length > 0) {
              levels.push(nextLevel);
              frontier = nextLevel;
            } else {
              break;
            }
          }

          // Also add any owned nodes not reached by edges (orphans within this target)
          const unreached = [];
          nodes.forEach(n => {
            if (nodeOwner[n.id] === tid && !visited.has(n.id) && n.id !== tid) {
              unreached.push(n.id);
            }
          });
          if (unreached.length > 0) levels.push(unreached);

          // Find widest level to calculate total group width
          const maxWidth = Math.max(...levels.map(l => l.length));
          const groupWidth = (maxWidth - 1) * H_SPACING;

          // Position each level
          levels.forEach((level, depth) => {
            const levelWidth = (level.length - 1) * H_SPACING;
            const offsetX = START_X + (groupWidth - levelWidth) / 2; // center under parent
            level.forEach((nodeId, idx) => {
              const n = nodeMap[nodeId];
              if (!n) return;
              n.x = offsetX + idx * H_SPACING;
              n.y = cursorY + depth * V_SPACING;
              positioned.add(nodeId);
            });
          });

          cursorY += levels.length * V_SPACING + GROUP_GAP;
        });

        // Orphans (no target owner) below everything
        const orphans = nodes.filter(n => !positioned.has(n.id));
        if (orphans.length > 0) {
          const maxPerRow = 4;
          orphans.forEach((n, idx) => {
            n.x = START_X + (idx % maxPerRow) * H_SPACING;
            n.y = cursorY + Math.floor(idx / maxPerRow) * V_SPACING;
          });
        }

        console.log(`Nodes: ${rawNodes.length} raw -> ${nodes.length} final`);
        console.log(`Relationships: ${rawEdges.length} raw -> ${relationships.length} final`);
          
          const newGraphData = { nodes, relationships };
          setGraphData(newGraphData);
        graphDataRef.current = newGraphData;
        
        // Force re-render by updating state
        setTimeout(() => {
          setGraphData({ ...newGraphData });
        }, 100);
        
          setGraphStats({
            totalNodes: nodes.length,
            totalRelationships: relationships.length,
          compromisedNodes: nodes.filter(n => n.properties?.status === 'compromised').length,
          criticalPaths: relationships.filter(r => r.type === 'attack_path').length
          });
        
          generateAiInsights(newGraphData);
        } else {
        console.error('Failed to fetch graph data:', response.status);
        // Fallback to empty data if API fails
        setGraphData({ nodes: [], relationships: [] });
        setGraphStats({ totalNodes: 0, totalRelationships: 0, compromisedNodes: 0, criticalPaths: 0 });
        setAiInsights([]);
      }
    } catch (error) {
      console.error('Failed to load graph data:', error);
      setGraphData({ nodes: [], relationships: [] });
      setGraphStats({ totalNodes: 0, totalRelationships: 0, compromisedNodes: 0, criticalPaths: 0 });
      setAiInsights([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Initial load when project changes - MUST be after loadGraphData definition
  useEffect(() => {
    if (selectedProject) {
      console.log(`📊 Initial load for project ${selectedProject.id}`);
      loadGraphData(false, false); // Initial load
    }
  }, [selectedProject?.id]); // Only depend on project ID

  // Listen for project data changes and auto-refresh - MUST be after loadGraphData definition
  useEffect(() => {
    if (!selectedProject) return;

    const handleProjectUpdate = (event) => {
      const { projectId, updatedItemType, action } = event.detail || {};
      const currentProjectId = selectedProject?.id;
      
      console.log(`🔄 Project data updated event received:`, {
        projectId,
        updatedItemType,
        action,
        currentProject: currentProjectId,
        timestamp: new Date().toLocaleTimeString()
      });

      // Check if event is for current project - use strict comparison with type coercion
      const projectIdMatch = projectId && currentProjectId && (
        projectId == currentProjectId || 
        parseInt(projectId) == parseInt(currentProjectId) ||
        String(projectId) === String(currentProjectId)
      );

      if (projectIdMatch) {
        console.log(`✅ Auto-refreshing knowledge graph for ${updatedItemType} ${action}...`);

        // Clear cache and force refresh immediately
        setTimeout(() => {
          console.log('🚀 Loading fresh graph data with force refresh...');
          // Double-check project still matches before loading
          if (selectedProject && (
            !projectId || 
            projectId == selectedProject.id || 
            parseInt(projectId) == selectedProject.id ||
            String(projectId) === String(selectedProject.id)
          )) {
            loadGraphData(false, true); // Force refresh from backend, don't preserve relationships
          } else {
            console.log('⚠️ Project changed during delay, skipping refresh');
          }
        }, 300); // Reduced delay for faster response
      } else if (projectId) {
        console.log(`⚠️ Event for different project (${projectId}) vs current (${currentProjectId})`);
      } else {
        console.log(`⚠️ Event missing projectId, refreshing anyway for safety`);
        // Refresh anyway if projectId is missing (might be a general update)
        setTimeout(() => {
          if (selectedProject) {
            loadGraphData(false, true);
          }
        }, 300);
      }
    };

    // Listen for custom events from other pages
    console.log(`📡 Setting up project data update listener for project ${selectedProject.id}...`);
    window.addEventListener('projectDataUpdated', handleProjectUpdate);

    // Also add a manual refresh listener for any data changes
    const handleManualRefresh = () => {
      if (selectedProject) {
        console.log('🔄 Manual refresh triggered');
        loadGraphData(false, true);
      }
    };

    // Listen for any custom refresh events
    window.addEventListener('knowledgeGraphRefresh', handleManualRefresh);

    return () => {
      console.log('🧹 Cleaning up project data update listener...');
      window.removeEventListener('projectDataUpdated', handleProjectUpdate);
      window.removeEventListener('knowledgeGraphRefresh', handleManualRefresh);
    };
  }, [selectedProject?.id]); // Only depend on project ID - loadGraphData is accessible via closure

  const generateAiInsights = async (data) => {
    if (!selectedProject || data.nodes.length === 0) {
      setAiInsights([]);
      return;
    }

    try {
      // Call AI service to analyze knowledge graph
      const response = await fetch('http://localhost:8002/api/v1/ai/analyze-knowledge-graph', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          project_id: selectedProject.id,
          graph_data: {
            nodes: data.nodes,
            relationships: data.relationships
          }
        })
      });

      if (response.ok) {
        const result = await response.json();
        setAiInsights(result.insights || []);
      } else {
        // Fallback to basic insights if AI fails
        generateBasicInsights(data);
      }
    } catch (error) {
      console.error('Failed to generate AI insights:', error);
      // Fallback to basic insights
      generateBasicInsights(data);
    }
  };

  const generateBasicInsights = (data) => {
    // Fallback: Generate basic insights based on graph data
    const insights = [];
    
    if (data.nodes.length > 0) {
      insights.push({
        id: 1,
        type: 'info',
        title: 'Graph Overview',
        description: `Knowledge graph contains ${data.nodes.length} nodes and ${data.relationships.length} relationships. AI analysis available when connected.`,
        confidence: 1.0
      });
    }
    
    const compromisedNodes = data.nodes.filter(n => n.properties?.status === 'compromised');
    if (compromisedNodes.length > 0) {
      insights.push({
        id: 2,
        type: 'warning',
        title: 'Compromised Assets',
        description: `${compromisedNodes.length} compromised nodes detected in the graph`,
        confidence: 0.95
      });
    }
    
    setAiInsights(insights);
  };

  const handleWebSocketMessage = (message) => {
    console.log('Received WebSocket message:', message);
    
    switch (message.type) {
      case 'node_added':
        // New node added to the graph
        const newNode = {
          id: message.node.id,
          type: message.node.type || 'Unknown',
          label: message.node.label || message.node.id,
          properties: message.node.properties || {},
          x: Math.random() * 800 + 100,
          y: Math.random() * 600 + 100
        };
        
        setGraphData(prev => ({
          ...prev,
          nodes: [...prev.nodes, newNode]
        }));
        
        // Update statistics
        setGraphStats(prev => ({
          ...prev,
          totalNodes: prev.totalNodes + 1
        }));
        
        // Regenerate AI insights
        generateAiInsights({
          ...graphData,
          nodes: [...graphData.nodes, newNode]
        });
        
        break;
        
      case 'node_updated':
        // Node updated
        setGraphData(prev => ({
          ...prev,
          nodes: prev.nodes.map(node => 
            node.id === message.node.id 
              ? { ...node, ...message.node }
              : node
          )
        }));
        break;
        
      case 'relationship_added':
        // New relationship added to the graph
        const newRelationship = {
          id: message.relationship.id,
          type: message.relationship.type,
          from: message.relationship.from,
          to: message.relationship.to,
          properties: message.relationship.properties || {}
        };
        
        setGraphData(prev => ({
          ...prev,
          relationships: [...prev.relationships, newRelationship]
        }));
        
        // Update statistics
        setGraphStats(prev => ({
          ...prev,
          totalRelationships: prev.totalRelationships + 1
        }));
        break;
        
      case 'graph_update':
        // Full graph update
        loadGraphData();
        break;
        
      default:
        console.log('Unknown message type:', message.type);
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

  const handleNodeMouseDown = (node, event) => {
    if (event.button === 0) { // Left mouse button
      setDraggedNode(node);
      setIsDragging(true);
    }
  };

  const handleNodeMouseMove = (event) => {
    if (isDragging && draggedNode && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      // Convert screen coords to graph coords (accounting for pan and zoom)
      const x = (event.clientX - rect.left - pan.x) / zoom;
      const y = (event.clientY - rect.top - pan.y) / zoom;

      setGraphData(prev => ({
        ...prev,
        nodes: prev.nodes.map(node =>
          node.id === draggedNode.id
            ? { ...node, x, y }
            : node
        )
      }));
    }
  };

  const handleNodeMouseUp = () => {
    setDraggedNode(null);
    setIsDragging(false);
  };

  const handleNodeClick = (node) => {
    if (isDragging) return;
    setSelectedNode(node);
    setFocusedNodeId(node.id);
  };

  // Compute full path from focused node back to root target + direct children
  const { focusedConnectedNodes, focusedEdges } = useMemo(() => {
    if (!focusedNodeId) return { focusedConnectedNodes: null, focusedEdges: null };

    const rels = graphData.relationships;
    const nodes = graphData.nodes;

    // Build adjacency: parent -> children (from -> to) and reverse
    const parentOf = {}; // childId -> parentId (from edges: from is parent)
    const childrenOf = {}; // parentId -> [childIds]
    rels.forEach(r => {
      if (!childrenOf[r.from]) childrenOf[r.from] = [];
      childrenOf[r.from].push(r.to);
      // First parent wins (for path back to root)
      if (!parentOf[r.to]) parentOf[r.to] = r.from;
    });

    const connected = new Set([focusedNodeId]);
    const edgeIndices = new Set();

    // Walk UP to root target
    let current = focusedNodeId;
    while (parentOf[current]) {
      const parent = parentOf[current];
      connected.add(parent);
      // Find the edge index for this parent->current link
      rels.forEach((r, i) => {
        if (r.from === parent && r.to === current) edgeIndices.add(i);
      });
      current = parent;
    }

    // Walk DOWN: include direct children of focused node
    (childrenOf[focusedNodeId] || []).forEach(childId => {
      connected.add(childId);
      rels.forEach((r, i) => {
        if (r.from === focusedNodeId && r.to === childId) edgeIndices.add(i);
      });
    });

    // Also include direct sibling edges (same parent's other children are NOT included,
    // but edges directly touching focusedNodeId are)
    rels.forEach((r, i) => {
      if (r.from === focusedNodeId || r.to === focusedNodeId) {
        connected.add(r.from);
        connected.add(r.to);
        edgeIndices.add(i);
      }
    });

    return { focusedConnectedNodes: connected, focusedEdges: edgeIndices };
  }, [focusedNodeId, graphData.relationships, graphData.nodes]);

  const handleCreateRelationship = (fromNode, toNode) => {
    const newRelationship = {
      id: `rel_${Date.now()}`,
      from: fromNode.id,
      to: toNode.id,
      type: 'connected',
      label: 'related'
    };
    
    setGraphData(prev => ({
      ...prev,
      relationships: [...prev.relationships, newRelationship]
    }));
  };

  const handleAutoConnectNodes = async () => {
    if (!selectedProject) return;
    
    try {
      console.log('Starting auto-connect for project:', selectedProject.id);
      
      // First, get the latest project data (not cached)
      const projectResponse = await fetch(`http://localhost:8002/api/v1/projects/${selectedProject.id}`);
      if (!projectResponse.ok) {
        throw new Error('Failed to fetch project data');
      }
      const projectData = await projectResponse.json();
      console.log('Latest project data:', projectData);
      
      // Then get current graph data with force refresh
      const graphResponse = await fetch(`http://localhost:8002/api/v1/neo4j/graph/${selectedProject.id}?force_refresh=true`);
      if (!graphResponse.ok) {
        throw new Error('Failed to fetch graph data');
      }
      const graphData = await graphResponse.json();
      console.log('Current graph data:', graphData);
      
          const newRelationships = [];
      const currentNodes = graphData.nodes || [];
      const currentRelationships = graphData.links || graphData.relationships || [];
      
      console.log('Current nodes:', currentNodes.length);
      console.log('Current relationships:', currentRelationships.length);
      
      // Get existing relationship IDs to avoid duplicates
      const existingRelIds = new Set(currentRelationships.map(rel => rel.id));
      
      // 1. Connect users to targets based on latest project data
      const userNodes = currentNodes.filter(node => node.type === 'User');
      const targetNodes = currentNodes.filter(node => node.type === 'Target');
      
      console.log('User nodes:', userNodes.length);
      console.log('Target nodes:', targetNodes.length);
      console.log('Latest project users:', projectData.users?.length || 0);
      console.log('Latest project targets:', projectData.targets?.length || 0);
      
      // Use latest project data to create relationships
      if (projectData.users) {
        projectData.users.forEach(projectUser => {
          console.log('Processing project user:', projectUser);
          if (projectUser.target_id) {
            console.log(`Project user ${projectUser.username} has target_id: ${projectUser.target_id}`);
            
            // Find corresponding KG user node
            const kgUserNode = userNodes.find(u => 
              u.properties?.discovered_user_id === projectUser.id || 
              u.properties?.username === projectUser.username
            );
            
            // Find corresponding KG target node
            const kgTargetNode = targetNodes.find(t => 
              t.properties?.target_id === projectUser.target_id ||
              t.target_id === projectUser.target_id
            );
            
            if (kgUserNode && kgTargetNode) {
              const relId = `user_${kgUserNode.id}_target_${kgTargetNode.id}`;
              if (!existingRelIds.has(relId)) {
                  newRelationships.push({
                  id: relId,
                  from: kgUserNode.id,
                  to: kgTargetNode.id,
                  type: 'found_on',
                  label: 'Found on'
                });
                console.log(`Added relationship: User ${kgUserNode.id} -> Target ${kgTargetNode.id}`);
              } else {
                console.log(`Relationship already exists: User ${kgUserNode.id} -> Target ${kgTargetNode.id}`);
              }
            } else {
              console.log(`Could not find KG nodes for user ${projectUser.username} -> target ${projectUser.target_id}`);
            }
          }
        });
      }
      
      // 2. Connect findings to targets based on latest project data
      const findingNodes = currentNodes.filter(node => node.type === 'Finding');
      
      console.log('Finding nodes:', findingNodes.length);
      console.log('Latest project findings:', projectData.findings?.length || 0);
      
      if (projectData.findings) {
        projectData.findings.forEach(projectFinding => {
          console.log('Processing project finding:', projectFinding);
          if (projectFinding.target_id) {
            console.log(`Project finding ${projectFinding.title} has target_id: ${projectFinding.target_id}`);
            
            // Find corresponding KG finding node
            const kgFindingNode = findingNodes.find(f => 
              f.properties?.finding_id === projectFinding.id || 
              f.properties?.title === projectFinding.title
            );
            
            // Find corresponding KG target node
            const kgTargetNode = targetNodes.find(t => 
              t.properties?.target_id === projectFinding.target_id ||
              t.target_id === projectFinding.target_id
            );
            
            if (kgFindingNode && kgTargetNode) {
              const relId = `finding_${kgFindingNode.id}_target_${kgTargetNode.id}`;
              if (!existingRelIds.has(relId)) {
                  newRelationships.push({
                  id: relId,
                  from: kgFindingNode.id,
                  to: kgTargetNode.id,
                  type: 'affects',
                  label: 'Affects'
                });
                console.log(`Added relationship: Finding ${kgFindingNode.id} -> Target ${kgTargetNode.id}`);
              } else {
                console.log(`Relationship already exists: Finding ${kgFindingNode.id} -> Target ${kgTargetNode.id}`);
              }
            } else {
              console.log(`Could not find KG nodes for finding ${projectFinding.title} -> target ${projectFinding.target_id}`);
                }
              }
            });
      }
      
      // 3. Connect files to targets based on latest project data
      const fileNodes = currentNodes.filter(node => node.type === 'File');
      
      console.log('File nodes:', fileNodes.length);
      console.log('Latest project files:', projectData.discovered_files?.length || 0);
      
      if (projectData.discovered_files) {
        projectData.discovered_files.forEach(projectFile => {
          console.log('Processing project file:', projectFile);
          if (projectFile.target_id) {
            console.log(`Project file ${projectFile.filename} has target_id: ${projectFile.target_id}`);
            
            // Find corresponding KG file node
            const kgFileNode = fileNodes.find(f => 
              f.properties?.discovered_file_id === projectFile.id || 
              f.properties?.filename === projectFile.filename
            );
            
            // Find corresponding KG target node
            const kgTargetNode = targetNodes.find(t => 
              t.properties?.target_id === projectFile.target_id ||
              t.target_id === projectFile.target_id
            );
            
            if (kgFileNode && kgTargetNode) {
              const relId = `file_${kgFileNode.id}_target_${kgTargetNode.id}`;
              if (!existingRelIds.has(relId)) {
                  newRelationships.push({
                  id: relId,
                  from: kgFileNode.id,
                  to: kgTargetNode.id,
                  type: 'discovered_on',
                  label: 'Discovered on'
                });
                console.log(`Added relationship: File ${kgFileNode.id} -> Target ${kgTargetNode.id}`);
              } else {
                console.log(`Relationship already exists: File ${kgFileNode.id} -> Target ${kgTargetNode.id}`);
              }
            } else {
              console.log(`Could not find KG nodes for file ${projectFile.filename} -> target ${projectFile.target_id}`);
                }
              }
            });
      }
          
      console.log('New relationships to add:', newRelationships.length);
      
      // Persist relationships to backend, then update local state
      if (newRelationships.length > 0) {
        const token = localStorage.getItem('token');
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        let persisted = 0;
        for (const rel of newRelationships) {
          try {
            const res = await fetch(
              `http://localhost:8002/api/v1/neo4j/graph/${selectedProject.id}/relationship?from_node=${encodeURIComponent(rel.from)}&to_node=${encodeURIComponent(rel.to)}&relationship_type=${encodeURIComponent(rel.type)}`,
              { method: 'POST', headers }
            );
            if (res.ok) persisted++;
            else console.warn(`Failed to persist relationship ${rel.id}:`, res.status);
          } catch (err) {
            console.warn(`Failed to persist relationship ${rel.id}:`, err);
          }
        }

        console.log(`${persisted}/${newRelationships.length} relationships persisted to backend`);

        // Reload graph from backend to get the persisted state
        await loadGraphData(true, true);

        toast.success(`Auto-connect completed! Added ${persisted} new relationships.`);
      } else {
        console.log('No new relationships to add');
        toast.info('No new relationships found. All possible connections already exist.');
      }
    } catch (error) {
    console.error('Auto-connect failed:', error);
    toast.error('Auto-connect failed: ' + error.message);
    }
  };

  const handleCanvasDrop = (event) => {
    event.preventDefault();
    if (draggedNode) {
      const rect = canvasRef.current.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      
      // Update node position
      setGraphData(prev => ({
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

  const handleExportGraph = () => {
    // Export graph data
    const dataStr = JSON.stringify(graphData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `graph_${selectedProject?.name || 'unknown'}_${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleAutoLayout = () => {
    // Implement hierarchical layout
    if (graphData.nodes.length > 0) {
      const nodes = [...graphData.nodes];
      
      // Group nodes by type for hierarchical layout
      const nodeTypes = {
        'Target': [],
        'User': [],
        'Finding': [],
        'Tool': [],
        'Vulnerability': []
      };
      
      nodes.forEach(node => {
        if (nodeTypes[node.type]) {
          nodeTypes[node.type].push(node);
        }
      });
      
      // Calculate positions using hierarchical layout
      const updatedNodes = [];
      let currentY = 100;
      const layerSpacing = 400;
      const nodeSpacing = 200;
      
      // Layer 1: Targets (top)
      nodeTypes['Target'].forEach((node, index) => {
        updatedNodes.push({
        ...node,
          x: 200 + (index * nodeSpacing),
          y: currentY,
          layer: 1
        });
      });
      
      if (nodeTypes['Target'].length > 0) currentY += layerSpacing;
      
      // Layer 2: Users (below targets)
      nodeTypes['User'].forEach((node, index) => {
        updatedNodes.push({
          ...node,
          x: 200 + (index * nodeSpacing),
          y: currentY,
          layer: 2
        });
      });
      
      if (nodeTypes['User'].length > 0) currentY += layerSpacing;
      
      // Layer 3: Findings (below users)
      nodeTypes['Finding'].forEach((node, index) => {
        updatedNodes.push({
          ...node,
          x: 200 + (index * nodeSpacing),
          y: currentY,
          layer: 3
        });
      });
      
      if (nodeTypes['Finding'].length > 0) currentY += layerSpacing;
      
      // Layer 4: Tools (bottom)
      nodeTypes['Tool'].forEach((node, index) => {
        updatedNodes.push({
          ...node,
          x: 200 + (index * nodeSpacing),
          y: currentY,
          layer: 4
        });
      });
      
      // Handle other node types
      nodes.forEach(node => {
        if (!['Target', 'User', 'Finding', 'Tool'].includes(node.type)) {
          const existingNode = updatedNodes.find(n => n.id === node.id);
          if (!existingNode) {
            updatedNodes.push({
              ...node,
              x: 200 + (updatedNodes.length * nodeSpacing),
              y: currentY + layerSpacing,
              layer: 5
            });
          }
        }
      });
      
      setGraphData({
        ...graphData,
        nodes: updatedNodes
      });
      
      console.log('Hierarchical layout applied');
    }
  };

  const getNodeColor = (node) => {
    switch (node.type) {
      case 'User':
        return node.properties?.status === 'compromised' ? '#EF4444' : '#3B82F6';
      case 'Server':
        return node.properties?.status === 'compromised' ? '#EF4444' : '#10B981';
      case 'Target':
        return '#F59E0B'; // Yellow
      case 'Finding':
        return '#EF4444'; // Red
      case 'Tool':
        return '#8B5CF6'; // Purple
      default:
        return '#6B7280'; // Gray
    }
  };

  const getNodeIcon = (node) => {
    switch (node.type) {
      case 'User':
        return '👤';
      case 'Server':
        return '🖥️';
      case 'Target':
        return '🎯';
      case 'Finding':
        return '🔍';
      case 'Tool':
        return '🛠️';
      default:
        return '📋';
    }
  };

  const getRelationshipColor = (relationship) => {
    switch (relationship.type) {
      case 'same_type': return '#10B981'; // Green
      case 'discovered_from': return '#EF4444'; // Red
      case 'scans': return '#F59E0B'; // Yellow
      case 'produces': return '#8B5CF6'; // Purple
      case 'affects': return '#EF4444'; // Red (same as discovered_from)
      case 'found_on': return '#EF4444'; // Red
      case 'enables': return '#8B5CF6'; // Purple
      case 'originates_from': return '#10B981'; // Green
      case 'targets': return '#F59E0B'; // Yellow
      case 'discovered': return '#10B981'; // Green - Fix discovered color
      default: 
        console.log('Unknown relationship type:', relationship.type);
        return '#10B981'; // Change to green instead of gray
    }
  };

  const getRelationshipStyle = (relationship) => {
    switch (relationship.type) {
      case 'same_type': return { strokeWidth: '2', strokeDasharray: '5,5' }; // Dashed line
      case 'discovered_from': return { strokeWidth: '4', strokeDasharray: '8,4' }; // Thick dashed line
      case 'scans': return { strokeWidth: '3', strokeDasharray: '6,3' }; // Medium dashed line
      case 'produces': return { strokeWidth: '2', strokeDasharray: '10,5' }; // Different dash pattern
      case 'affects': return { strokeWidth: '4', strokeDasharray: '8,4' }; // Thick dashed line
      case 'found_on': return { strokeWidth: '4', strokeDasharray: '8,4' }; // Thick dashed line
      case 'enables': return { strokeWidth: '2', strokeDasharray: '10,5' }; // Different dash pattern
      case 'originates_from': return { strokeWidth: '2', strokeDasharray: '5,5' }; // Dashed line
      case 'targets': return { strokeWidth: '3', strokeDasharray: '6,3' }; // Medium dashed line
      case 'discovered': return { strokeWidth: '3', strokeDasharray: '6,3' }; // Medium dashed line
      default: return { strokeWidth: '3', strokeDasharray: '6,3' }; // Medium dashed line
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <Head>
        <title>Security Relationship Map - BountyFlow</title>
      </Head>

      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Link href="/dashboard" className="text-blue-400 hover:text-blue-300">
              ← Back to Dashboard
            </Link>
            <h1 className="text-2xl font-bold">Security Relationship Map</h1>
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
            
            {/* Auto Refresh Toggle - Removed (manual refresh only) */}
            {/* <div className="flex items-center space-x-2">
              <label className="text-sm text-gray-300">Auto Refresh:</label>
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="w-4 h-4"
              />
            </div> */}
            
            <div className="flex space-x-2">
              <button
                onClick={() => loadGraphData(true, true)}
                className="bg-orange-600 hover:bg-orange-700 px-4 py-2 rounded-lg"
                disabled={isLoading}
              >
                {isLoading ? 'Loading...' : '🔄 Refresh'}
              </button>
              <button
                onClick={() => setShowAiPanel(true)}
                className="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded-lg"
              >
                AI Insights
              </button>
              <button
                onClick={handleAutoLayout}
                className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg"
              >
                Auto Layout
              </button>
              <button
                onClick={handleAutoConnectNodes}
                className="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded-lg"
              >
                Auto Connect by Data
              </button>
              <button
                onClick={() => {
                  if (graphData.nodes.length === 0) return;
                  // Calculate bounding box of all nodes
                  const xs = graphData.nodes.map(n => n.x || 0);
                  const ys = graphData.nodes.map(n => n.y || 0);
                  const minX = Math.min(...xs) - 50;
                  const minY = Math.min(...ys) - 50;
                  const maxX = Math.max(...xs) + 50;
                  const maxY = Math.max(...ys) + 50;
                  const graphW = maxX - minX;
                  const graphH = maxY - minY;
                  const rect = canvasRef.current?.getBoundingClientRect();
                  if (!rect) return;
                  const scaleX = rect.width / graphW;
                  const scaleY = rect.height / graphH;
                  const newZoom = Math.min(scaleX, scaleY, 2) * 0.9;
                  const centerX = (minX + maxX) / 2;
                  const centerY = (minY + maxY) / 2;
                  setZoom(newZoom);
                  setPan({
                    x: rect.width / 2 - centerX * newZoom,
                    y: rect.height / 2 - centerY * newZoom
                  });
                }}
                className="bg-teal-600 hover:bg-teal-700 px-4 py-2 rounded-lg"
              >
                Fit All
              </button>
              <button
                onClick={handleExportGraph}
                className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg"
              >
                Export Graph
              </button>
              <button
                onClick={() => {
                  console.log('Current graph data:', graphData);
                  console.log('Current project:', selectedProject);
                  console.log('Nodes count:', graphData.nodes.length);
                  console.log('Relationships count:', graphData.relationships.length);
                }}
                className="bg-yellow-600 hover:bg-yellow-700 px-4 py-2 rounded-lg"
              >
                Debug
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex h-screen">
        {/* Left Panel - Graph Stats & Quick Preview */}
        <div className="w-80 bg-gray-800 border-r border-gray-700 p-4 overflow-y-auto">
          <div className="space-y-6">
            {/* Graph Statistics */}
            <div>
              <h3 className="text-lg font-semibold mb-4">Graph Statistics</h3>
              <div className="space-y-3">
                <div className="bg-gray-700 rounded-lg p-3">
                  <div className="flex justify-between">
                    <span className="text-gray-300">Total Nodes</span>
                    <span className="text-white font-semibold">{graphStats.totalNodes}</span>
                  </div>
                </div>
                <div className="bg-gray-700 rounded-lg p-3">
                  <div className="flex justify-between">
                    <span className="text-gray-300">Relationships</span>
                    <span className="text-white font-semibold">{graphStats.totalRelationships}</span>
                  </div>
                </div>
                <div className="bg-gray-700 rounded-lg p-3">
                  <div className="flex justify-between">
                    <span className="text-gray-300">Compromised</span>
                    <span className="text-red-400 font-semibold">{graphStats.compromisedNodes}</span>
                  </div>
                </div>
                <div className="bg-gray-700 rounded-lg p-3">
                  <div className="flex justify-between">
                    <span className="text-gray-300">Critical Paths</span>
                    <span className="text-yellow-400 font-semibold">{graphStats.criticalPaths}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* AI Insights - Click button in toolbar to view full analysis */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">AI Insights</h3>
                {aiInsights.length > 0 && (
                  <span className="text-xs px-2 py-1 bg-purple-600 rounded-full">
                    {aiInsights.length}
                  </span>
                )}
                    </div>
              {aiInsights.length === 0 ? (
                <div className="bg-gray-700 rounded-lg p-4 text-center">
                  <div className="text-3xl mb-2">🤖</div>
                  <p className="text-xs text-gray-400 mb-3">No insights yet</p>
                  <button
                    onClick={() => setShowAiPanel(true)}
                    className="text-xs bg-purple-600 hover:bg-purple-700 px-3 py-1.5 rounded transition"
                  >
                    Generate AI Analysis
                  </button>
                  </div>
              ) : (
                <div className="space-y-2">
                  {aiInsights.slice(0, 2).map((insight) => {
                    const cleanDescription = stripMarkdown(insight.description);
                    const preview = cleanDescription.length > 80 
                      ? cleanDescription.substring(0, 80) + '...' 
                      : cleanDescription;
                    
                    return (
                      <div key={insight.id} className="bg-gray-700 rounded-lg p-3 hover:bg-gray-600 cursor-pointer transition" onClick={() => setShowAiPanel(true)}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm">
                            {insight.type === 'critical' ? '🔴' :
                             insight.type === 'warning' ? '⚠️' :
                             insight.type === 'success' ? '✅' : '💡'}
                          </span>
                          <span className="text-xs font-medium text-white truncate flex-1">{insight.title}</span>
              </div>
                        <p className="text-xs text-gray-400 line-clamp-2">{preview}</p>
                      </div>
                    );
                  })}
                  {aiInsights.length > 2 && (
                    <button
                      onClick={() => setShowAiPanel(true)}
                      className="w-full text-xs text-purple-400 hover:text-purple-300 py-2 transition"
                    >
                      View all {aiInsights.length} insights →
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Node Templates */}
            <div>
              <h3 className="text-lg font-semibold mb-4">Node Templates</h3>
              <div className="space-y-2">
                <div className="bg-gray-700 rounded-lg p-3 cursor-pointer hover:bg-gray-600">
                  <div className="flex items-center space-x-2">
                    <span className="text-lg">👤</span>
                    <span className="text-sm">User Node</span>
                  </div>
                </div>
                <div className="bg-gray-700 rounded-lg p-3 cursor-pointer hover:bg-gray-600">
                  <div className="flex items-center space-x-2">
                    <span className="text-lg">🎯</span>
                    <span className="text-sm">Target Node</span>
                  </div>
                </div>
                <div className="bg-gray-700 rounded-lg p-3 cursor-pointer hover:bg-gray-600">
                  <div className="flex items-center space-x-2">
                    <span className="text-lg">🔍</span>
                    <span className="text-sm">Finding Node</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Relationship Legend */}
            <div className="mb-6">
              <h4 className="text-sm font-medium text-gray-300 mb-3">Relationship Types</h4>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-1 bg-red-500" style={{borderTop: '2px dashed #EF4444'}}></div>
                  <span className="text-xs text-gray-400">Found On</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-1 bg-red-500" style={{borderTop: '2px dashed #EF4444'}}></div>
                  <span className="text-xs text-gray-400">Affects</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-0.5 bg-yellow-500" style={{borderTop: '2px dashed #F59E0B'}}></div>
                  <span className="text-xs text-gray-400">Scans</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-1 bg-green-500" style={{borderTop: '2px dashed #10B981'}}></div>
                  <span className="text-xs text-gray-400">Discovered</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Graph Visualization */}
        <div className="flex-1 relative">
          {/* Zoom controls overlay */}
          <div className="absolute top-3 right-3 z-10 flex flex-col items-center gap-1 bg-gray-900/80 rounded-lg p-1.5">
            <button onClick={() => setZoom(z => Math.min(5, z * 1.3))} className="text-gray-300 hover:text-white hover:bg-gray-700 w-7 h-7 rounded flex items-center justify-center text-lg font-bold">+</button>
            <span className="text-gray-400 text-xs">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom(z => Math.max(0.05, z * 0.7))} className="text-gray-300 hover:text-white hover:bg-gray-700 w-7 h-7 rounded flex items-center justify-center text-lg font-bold">-</button>
            <div className="border-t border-gray-600 w-full my-0.5"></div>
            <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} className="text-gray-400 hover:text-white hover:bg-gray-700 w-7 h-7 rounded flex items-center justify-center text-xs" title="Reset view">1:1</button>
          </div>
          <div className="absolute inset-0 bg-gray-800">
            <svg
              ref={canvasRef}
              width="100%"
              height="100%"
              className="absolute inset-0"
              onDrop={handleCanvasDrop}
              onDragOver={handleCanvasDragOver}
              onMouseMove={(e) => {
                if (isPanning) {
                  setPan(prev => ({
                    x: prev.x + (e.clientX - panStart.x),
                    y: prev.y + (e.clientY - panStart.y)
                  }));
                  setPanStart({ x: e.clientX, y: e.clientY });
                } else {
                  handleNodeMouseMove(e);
                }
              }}
              onMouseUp={(e) => {
                if (isPanning) {
                  setIsPanning(false);
                } else {
                  handleNodeMouseUp(e);
                }
              }}
              onMouseDown={(e) => {
                // Left-click on empty canvas area to pan (not on a node)
                if (e.target === canvasRef.current || e.target.tagName === 'svg') {
                  e.preventDefault();
                  setIsPanning(true);
                  setPanStart({ x: e.clientX, y: e.clientY });
                  setFocusedNodeId(null);
                  setSelectedNode(null);
                }
              }}
              onContextMenu={(e) => e.preventDefault()}
              style={{ cursor: isPanning ? 'grabbing' : isDragging ? 'move' : 'grab' }}
            >
              <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
              {/* Render relationships */}
              {graphData.relationships.map((rel, index) => {
                const fromNode = graphData.nodes.find(n => n.id === rel.from);
                const toNode = graphData.nodes.find(n => n.id === rel.to);
                if (!fromNode || !toNode) return null;

                const fromX = fromNode.x || 0;
                const fromY = fromNode.y || 0;
                const toX = toNode.x || 0;
                const toY = toNode.y || 0;

                const isHighlighted = focusedEdges ? focusedEdges.has(index) : true;
                const dimmed = focusedNodeId && !isHighlighted;

                return (
                  <g key={index} style={{ opacity: dimmed ? 0.12 : 1, transition: 'opacity 0.2s' }}>
                    <line
                      x1={fromX}
                      y1={fromY}
                      x2={toX}
                      y2={toY}
                      stroke={dimmed ? '#4B5563' : getRelationshipColor(rel)}
                      strokeWidth={isHighlighted && focusedNodeId ? "3" : (getRelationshipStyle(rel).strokeWidth || "2")}
                      strokeDasharray={getRelationshipStyle(rel).strokeDasharray}
                      markerEnd={dimmed ? "url(#arrowhead-dim)" : "url(#arrowhead)"}
                    />
                    <text
                      x={(fromX + toX) / 2}
                      y={(fromY + toY) / 2 - 5}
                      fill={dimmed ? '#4B5563' : '#FFFFFF'}
                      fontSize="10"
                      textAnchor="middle"
                      className="pointer-events-none"
                      style={{
                        textShadow: dimmed ? 'none' : '1px 1px 2px rgba(0,0,0,0.8)',
                        fontWeight: 'bold'
                      }}
                    >
                      {rel.label}
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
                <marker
                  id="arrowhead-dim"
                  markerWidth="10"
                  markerHeight="7"
                  refX="9"
                  refY="3.5"
                  orient="auto"
                >
                  <polygon
                    points="0 0, 10 3.5, 0 7"
                    fill="#374151"
                  />
                </marker>
              </defs>
              
              {/* Render nodes */}
              {graphData.nodes.map((node, index) => {
                const nodeX = node.x || (200 + (index % 4) * 200);
                const nodeY = node.y || (200 + Math.floor(index / 4) * 150);

                const isConnected = focusedConnectedNodes ? focusedConnectedNodes.has(node.id) : true;
                const dimmed = focusedNodeId && !isConnected;
                const isFocused = focusedNodeId === node.id;

                return (
                  <g key={node.id} style={{ opacity: dimmed ? 0.15 : 1, transition: 'opacity 0.2s' }}>
                  <circle
                    cx={nodeX}
                    cy={nodeY}
                    r={isFocused ? 28 : 25}
                    fill={dimmed ? '#374151' : getNodeColor(node)}
                    stroke={isFocused ? "#FBBF24" : selectedNode?.id === node.id ? "#FBBF24" : dimmed ? "#1F2937" : "#374151"}
                    strokeWidth={isFocused ? "3" : selectedNode?.id === node.id ? "3" : "2"}
                    className="cursor-move hover:opacity-80"
                    onClick={() => handleNodeClick(node)}
                    onMouseDown={(e) => handleNodeMouseDown(node, e)}
                    style={{ userSelect: 'none' }}
                  />
                    <text
                      x={nodeX}
                      y={nodeY}
                      fill={dimmed ? '#4B5563' : 'white'}
                      fontSize="16"
                      textAnchor="middle"
                      className="pointer-events-none"
                      dy="5"
                    >
                      {getNodeIcon(node)}
                    </text>
                    <text
                      x={nodeX}
                      y={nodeY + 35}
                      fill={dimmed ? '#4B5563' : 'white'}
                      fontSize="12"
                      textAnchor="middle"
                      className="pointer-events-none"
                    >
                      {node.label || node.id}
                    </text>
                  </g>
                );
              })}
              </g>
            </svg>
          </div>
        </div>

        {/* Right Panel - Node Details */}
        <div className="w-80 bg-gray-800 border-l border-gray-700 p-4">
          {selectedNode ? (
            <div>
              <h3 className="text-lg font-semibold mb-4">Node Details</h3>
              <div className="bg-gray-700 rounded-lg p-4">
                <div className="space-y-3">
                  <div>
                    <label className="text-sm text-gray-300">ID</label>
                    <p className="text-white font-mono text-sm">{selectedNode.id}</p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-300">Type</label>
                    <p className="text-white">{selectedNode.type}</p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-300">Label</label>
                    <p className="text-white">{selectedNode.label}</p>
                  </div>
                  {selectedNode.properties && (
                    <div>
                      <label className="text-sm text-gray-300">Properties</label>
                      <div className="mt-2 space-y-1">
                        {Object.entries(selectedNode.properties).map(([key, value]) => (
                          <div key={key} className="flex justify-between text-sm">
                            <span className="text-gray-400">{key}:</span>
                            <span className="text-white">{String(value)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div>
              <h3 className="text-lg font-semibold mb-4">Node Details</h3>
              <div className="bg-gray-700 rounded-lg p-4 text-center">
                <p className="text-gray-400">Click on a node to view details</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* AI Insights Modal */}
      {showAiPanel && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-gray-800 rounded-lg w-full max-w-4xl max-h-[90vh] flex flex-col my-8">
            <div className="flex items-center justify-between p-6 pb-4 border-b border-gray-700 flex-shrink-0">
              <h3 className="text-xl font-semibold">🤖 AI Knowledge Graph Analysis</h3>
              <button
                onClick={() => setShowAiPanel(false)}
                className="text-gray-400 hover:text-white text-2xl"
              >
                ✕
              </button>
            </div>

            {/* Scrollable content area */}
            <div className="overflow-y-auto flex-1 min-h-0 p-6">
            {aiInsights.length === 0 ? (
              <div className="bg-gray-700 rounded-lg p-8 text-center">
                <div className="text-4xl mb-4">🔍</div>
                <p className="text-gray-300 mb-2">Analyzing knowledge graph...</p>
                <p className="text-sm text-gray-400">AI is analyzing nodes, relationships, and attack paths</p>
              </div>
            ) : (
            <div className="space-y-4">
              {aiInsights.map((insight) => (
                  <div key={insight.id} className={`rounded-lg p-5 border-l-4 ${
                    insight.type === 'critical' ? 'bg-red-900/20 border-red-500' :
                    insight.type === 'warning' ? 'bg-yellow-900/20 border-yellow-500' :
                    insight.type === 'success' ? 'bg-green-900/20 border-green-500' :
                    'bg-blue-900/20 border-blue-500'
                  }`}>
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2 flex-1">
                        <span className="text-2xl">
                          {insight.type === 'critical' ? '🔴' :
                           insight.type === 'warning' ? '⚠️' :
                           insight.type === 'success' ? '✅' : '💡'}
                        </span>
                        <h4 className="font-semibold text-lg text-white">{insight.title}</h4>
                  </div>
                      <span className="text-sm px-3 py-1 rounded-full bg-gray-700 text-gray-300">
                        {Math.round((insight.confidence || 0.8) * 100)}% confidence
                      </span>
                </div>

                    <div className="markdown-content text-gray-200 mb-3">
                      <ReactMarkdown rehypePlugins={[rehypeHighlight]}>
                        {insight.description}
                      </ReactMarkdown>
                    </div>

                    {insight.affected_nodes && insight.affected_nodes.length > 0 && (
                      <div className="mb-3">
                        <p className="text-xs text-gray-400 mb-2">Affected Nodes:</p>
                        <div className="flex flex-wrap gap-2">
                          {insight.affected_nodes.map((node, idx) => (
                            <span key={idx} className="text-xs px-2 py-1 bg-gray-700 rounded">
                              {node}
                            </span>
              ))}
            </div>
                      </div>
                    )}

                    {insight.attack_path && (
                      <div className="mb-3 p-3 bg-gray-900/50 rounded">
                        <p className="text-xs text-gray-400 mb-1">Attack Path:</p>
                        <code className="text-sm text-yellow-300">{insight.attack_path}</code>
                      </div>
                    )}

                    {insight.recommendations && insight.recommendations.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-700">
                        <p className="text-sm font-medium text-gray-300 mb-2">📋 Recommended Actions:</p>
                        <div className="space-y-2 text-sm text-gray-300">
                          {insight.recommendations.map((rec, idx) => (
                            <div key={idx} className="flex items-start gap-2">
                              <span className="text-blue-400 mt-1 flex-shrink-0">→</span>
                              <div className="flex-1 markdown-content">
                                <ReactMarkdown rehypePlugins={[rehypeHighlight]}>
                                  {rec}
                                </ReactMarkdown>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            </div>

            {/* Fixed footer */}
            <div className="flex justify-between items-center p-6 pt-4 border-t border-gray-700 flex-shrink-0">
              <p className="text-xs text-gray-400">
                AI analyzed {graphData.nodes.length} nodes and {graphData.relationships.length} relationships
              </p>
              <button
                onClick={() => setShowAiPanel(false)}
                className="bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded-lg transition"
              >
                Close
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
            <p className="text-white">Loading graph data...</p>
          </div>
        </div>
      )}

      <style jsx global>{`
        .markdown-content {
          font-size: 0.875rem;
          line-height: 1.5;
        }
        .markdown-content p {
          margin-bottom: 0.5rem;
        }
        .markdown-content code {
          background-color: rgba(0, 0, 0, 0.3);
          padding: 0.125rem 0.25rem;
          border-radius: 0.25rem;
          font-family: 'Courier New', monospace;
          font-size: 0.8rem;
        }
        .markdown-content pre {
          background-color: rgba(0, 0, 0, 0.5);
          padding: 0.75rem;
          border-radius: 0.375rem;
          overflow-x: auto;
          margin: 0.5rem 0;
        }
        .markdown-content pre code {
          background: none;
          padding: 0;
        }
        .markdown-content ul, .markdown-content ol {
          margin-left: 1.25rem;
          margin-bottom: 0.5rem;
        }
        .markdown-content li {
          margin-bottom: 0.25rem;
        }
        .markdown-content strong {
          font-weight: 600;
          color: #93c5fd;
        }
        .markdown-content h1, .markdown-content h2, .markdown-content h3 {
          font-weight: 600;
          margin-top: 0.75rem;
          margin-bottom: 0.5rem;
        }
        .markdown-content h1 { font-size: 1.25rem; }
        .markdown-content h2 { font-size: 1.1rem; }
        .markdown-content h3 { font-size: 1rem; }
        .markdown-content blockquote {
          border-left: 3px solid #4b5563;
          padding-left: 0.75rem;
          margin: 0.5rem 0;
          font-style: italic;
        }
        .markdown-content a {
          color: #60a5fa;
          text-decoration: underline;
        }
        .markdown-content a:hover {
          color: #93c5fd;
        }
      `}</style>
    </div>
  );
}