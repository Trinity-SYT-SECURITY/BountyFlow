import { useState, useEffect } from 'react';
import Head from 'next/head';
import Layout from '../components/Layout';
import { useToast } from '../components/Toast';

export default function Targets() {
  const [targets, setTargets] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTarget, setSelectedTarget] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingTarget, setEditingTarget] = useState(null);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [scanningTargets, setScanningTargets] = useState(new Set()); // Track which targets are being scanned
  const [scanResults, setScanResults] = useState({}); // Store scan results by target ID
  const [newTarget, setNewTarget] = useState({
    target_type: 'ip',
    target_value: '',
    priority: 'medium',
    notes: ''
  });

  const toast = useToast();

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    try {
      setLoading(true);
      await Promise.all([loadTargets(), loadProjects()]);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadTargets = async () => {
    try {
      // Get all project targets
      const projectsResponse = await fetch('http://localhost:8002/api/v1/projects');
      if (projectsResponse.ok) {
        const projectsData = await projectsResponse.json();
        const allTargets = [];

        for (const project of projectsData) {
          if (project.targets && project.targets.length > 0) {
            // Add project information for each target
            const targetsWithProject = project.targets.map(target => ({
              ...target,
              project_id: project.id,
              project_name: project.name,
              project_company: project.company_name
            }));
            allTargets.push(...targetsWithProject);
          }
        }

        setTargets(allTargets);
      }
    } catch (error) {
      console.error('Failed to load targets:', error);
    }
  };

  const loadProjects = async () => {
    try {
      const response = await fetch('http://localhost:8002/api/v1/projects');
      if (response.ok) {
        const data = await response.json();
        setProjects(data);
      }
    } catch (error) {
      console.error('Failed to load projects:', error);
    }
  };

  const handleAddTarget = async () => {
    if (!selectedProjectId || !newTarget.target_value) return;

    try {
      const response = await fetch(`http://localhost:8002/api/v1/projects/${selectedProjectId}/targets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          target_type: newTarget.target_type,
          target_value: newTarget.target_value,
          priority: newTarget.priority === 'medium' ? 5 : (newTarget.priority === 'high' ? 8 : 3),
          notes: newTarget.notes
        })
      });

      if (response.ok) {
        setShowAddModal(false);
        setNewTarget({
          target_type: 'ip',
          target_value: '',
          priority: 'medium',
          notes: ''
        });
        setSelectedProjectId('');
        // Reload data
        loadAllData();
      } else {
        toast.error('Failed to add target. Please try again.');
      }
    } catch (error) {
      console.error('Error adding target:', error);
      toast.error('Error adding target. Please try again.');
    }
  };

  const handleSaveEditedTarget = async () => {
    if (!editingTarget || !editingTarget.project_id) return;

    try {
      const response = await fetch(`http://localhost:8002/api/v1/projects/${editingTarget.project_id}/targets/${editingTarget.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          target_type: editingTarget.target_type,
          target_value: editingTarget.target_value,
          priority: editingTarget.priority === 'medium' ? 5 : (editingTarget.priority === 'high' ? 8 : 3),
          notes: editingTarget.notes
        })
      });

      if (response.ok) {
        setShowEditModal(false);
        setEditingTarget(null);
        loadAllData();
        // Refresh selected target if it's the one being edited
        if (selectedTarget && selectedTarget.id === editingTarget.id) {
          setTimeout(async () => {
            const projectsResponse = await fetch('http://localhost:8002/api/v1/projects');
            if (projectsResponse.ok) {
              const projectsData = await projectsResponse.json();
              for (const project of projectsData) {
                if (project.targets) {
                  const updated = project.targets.find(t => t.id === editingTarget.id);
                  if (updated) {
                    setSelectedTarget({
                      ...updated,
                      project_id: project.id,
                      project_name: project.name,
                      project_company: project.company_name
                    });
                    break;
                  }
                }
              }
            }
          }, 200);
        }
        toast.success('Target updated successfully!');
      } else {
        const errorData = await response.json();
        console.error('Failed to update target:', errorData);
        toast.error(`Failed to update target: ${errorData.detail || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error updating target:', error);
      toast.error('Error updating target. Please try again.');
    }
  };

  const handleScanTarget = async (target) => {
    if (scanningTargets.has(target.id)) {
      return; // Already scanning
    }
    
    try {
      setScanningTargets(prev => new Set(prev).add(target.id));
      
      const token = localStorage.getItem('token');
      const response = await fetch(
        `http://localhost:8002/api/v1/projects/${target.project_id}/targets/${target.id}/scan`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token && { 'Authorization': `Bearer ${token}` })
          }
        }
      );
      
      if (response.ok) {
        const result = await response.json();
        
        if (!result) {
          console.error('Scan response is null or empty');
          toast.warning('Scan completed but received invalid response. Please refresh the page.');
          return;
        }
        
        // Store scan results
        if (result && result.scan_result) {
          setScanResults(prev => ({
            ...prev,
            [target.id]: result.scan_result
          }));
        }
        // Wait a moment for backend to commit the changes
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Update selectedTarget FIRST if it's the same target being scanned (before reloading)
        if (selectedTarget && selectedTarget.id === target.id) {
          // Fetch updated target data immediately
          try {
            const token = localStorage.getItem('token');
            const headers = {};
            if (token) {
              headers['Authorization'] = `Bearer ${token}`;
            }
            const projectResponse = await fetch(`http://localhost:8002/api/v1/projects/${target.project_id}`, { headers });
            if (projectResponse.ok) {
              const projectData = await projectResponse.json();
              const updatedTarget = projectData.targets?.find(t => t.id === target.id);
              if (updatedTarget) {
                setSelectedTarget({
                  ...updatedTarget,
                  project_id: projectData.id,
                  project_name: projectData.name,
                  project_company: projectData.company_name
                });
              }
            }
          } catch (error) {
            console.error('Failed to refresh selected target:', error);
          }
        }
        
        // Reload targets to show updated status
        await loadTargets();
        
        // Show visual feedback
        if (result && result.online !== undefined) {
          if (result.online) {
            // Success - target is online
            console.log(`✅ ${target.target_value} is online`);
          } else {
            // Target is offline
            console.log(`❌ ${target.target_value} is offline`);
          }
        }
      } else {
        let errorMessage = 'Unknown error';
        try {
          const error = await response.json();
          errorMessage = error.detail || error.message || JSON.stringify(error);
        } catch (e) {
          errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        }
        console.error('Scan failed:', errorMessage);
        toast.error(`Scan failed: ${errorMessage}`);
      }
    } catch (error) {
      console.error('Error scanning target:', error);
      toast.error(`Error scanning target: ${error.message || 'Please try again.'}`);
    } finally {
      setScanningTargets(prev => {
        const newSet = new Set(prev);
        newSet.delete(target.id);
        return newSet;
      });
    }
  };

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'active': return 'bg-green-600';
      case 'offline': return 'bg-red-600';
      case 'online': return 'bg-green-500';
      case 'compromised': return 'bg-red-600';
      case 'scanned': return 'bg-blue-600';
      case 'scanning': return 'bg-yellow-500 animate-pulse';
      case 'pending': return 'bg-yellow-600';
      case 'error': return 'bg-red-700';
      default: return 'bg-gray-600';
    }
  };
  
  const getConnectivityIcon = (status, isScanning) => {
    if (isScanning) {
      return 'fas fa-spinner fa-spin';
    }
    switch (status?.toLowerCase()) {
      case 'active':
      case 'online':
        return 'fas fa-check-circle text-green-400';
      case 'offline':
        return 'fas fa-times-circle text-red-400';
      case 'scanning':
        return 'fas fa-spinner fa-spin text-yellow-400';
      default:
        return 'fas fa-question-circle text-gray-400';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'active': return 'fas fa-check-circle';
      case 'compromised': return 'fas fa-exclamation-triangle';
      case 'scanned': return 'fas fa-search';
      case 'pending': return 'fas fa-clock';
      default: return 'fas fa-question';
    }
  };

  return (
    <Layout title="Targets - BountyFlow">
      <Head>
        <title>Targets - BountyFlow</title>
        <meta name="description" content="Manage penetration testing targets" />
      </Head>

      <div className="p-6">
        {/* Page Header */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">🎯 Targets</h1>
              <p className="text-gray-400">Manage all your penetration testing targets</p>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setShowAddModal(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
              >
                <i className="fas fa-plus mr-2"></i>
                Add Target
              </button>
              <button className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors">
                <i className="fas fa-upload mr-2"></i>
                Import
              </button>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto">
            {/* Filters and Search */}
            <div className="bg-gray-800 rounded-lg p-4 mb-6">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex-1 min-w-64">
                  <input
                    type="text"
                    placeholder="Search targets..."
                    className="w-full bg-gray-700 text-white px-4 py-2 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <select className="bg-gray-700 text-white px-4 py-2 rounded-lg border border-gray-600">
                  <option>All Status</option>
                  <option>Active</option>
                  <option>Compromised</option>
                  <option>Scanned</option>
                  <option>Pending</option>
                </select>
                <select className="bg-gray-700 text-white px-4 py-2 rounded-lg border border-gray-600">
                  <option>All Types</option>
                  <option>IP Address</option>
                  <option>Domain</option>
                  <option>Subdomain</option>
                  <option>URL</option>
                </select>
                <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg">
                  <i className="fas fa-filter mr-2"></i>
                  Filter
                </button>
              </div>
            </div>

            {/* Targets Grid */}
            {loading ? (
              <div className="flex justify-center items-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {targets.length > 0 ? (
                  targets.map((target) => (
                    <div key={target.id} className="bg-gray-800 rounded-lg p-6 hover:bg-gray-700 transition-colors">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-white font-semibold text-lg">{target.target_value}</h3>
                            <i className={getConnectivityIcon(target.status, scanningTargets.has(target.id))}></i>
                          </div>
                          <p className="text-gray-400 text-sm">{target.target_type?.toUpperCase()}</p>
                          <p className="text-blue-400 text-xs mt-1">
                            <i className="fas fa-project-diagram mr-1"></i>
                            {target.project_name} - {target.project_company}
                          </p>
                        </div>
                        <div className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(target.status)} ${
                          scanningTargets.has(target.id) ? 'animate-pulse' : ''
                        }`}>
                          {scanningTargets.has(target.id) ? (
                            <span className="flex items-center">
                              <i className="fas fa-spinner fa-spin mr-1"></i>
                              Scanning...
                            </span>
                          ) : (
                            target.status || 'pending'
                          )}
                        </div>
                      </div>

                      <div className="space-y-2 mb-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center text-gray-300">
                            <i className="fas fa-globe mr-2"></i>
                            <span className="text-sm">{target.target_value}</span>
                          </div>
                          {/* Connectivity Status Badge */}
                          {target.status && (
                            <div className={`px-2 py-0.5 rounded text-xs font-medium ${
                              target.status === 'active' || target.status === 'online'
                                ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                                : target.status === 'offline'
                                ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                                : target.status === 'scanning'
                                ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 animate-pulse'
                                : 'bg-gray-500/20 text-gray-400 border border-gray-500/30'
                            }`}>
                              {target.status === 'active' || target.status === 'online' ? '🟢 Online' :
                               target.status === 'offline' ? '🔴 Offline' :
                               target.status === 'scanning' ? '🟡 Scanning...' :
                               target.status || 'Pending'}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center text-gray-300">
                          <i className="fas fa-tag mr-2"></i>
                          <span className="text-sm">{target.target_type?.toUpperCase()}</span>
                        </div>
                        <div className="flex items-center text-gray-300">
                          <i className="fas fa-star mr-2"></i>
                          <span className="text-sm">Priority: {target.priority}</span>
                        </div>
                        <div className="flex items-center text-gray-300">
                          <i className="fas fa-calendar mr-2"></i>
                          <span className="text-sm">{new Date(target.created_at).toLocaleDateString()}</span>
                        </div>
                        {target.last_scan && (
                          <div className="flex items-center text-gray-300">
                            <i className="fas fa-search mr-2"></i>
                            <span className="text-sm">Last Scan: {new Date(target.last_scan).toLocaleString()}</span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex space-x-2">
                          <button
                            onClick={() => setSelectedTarget(target)}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded text-sm transition-colors"
                          >
                            <i className="fas fa-eye mr-1"></i>
                            View
                          </button>
                          <button
                            onClick={() => {
                              setEditingTarget({...target});
                              setShowEditModal(true);
                            }}
                            className="bg-yellow-600 hover:bg-yellow-700 text-white px-3 py-1.5 rounded text-sm transition-colors"
                          >
                            <i className="fas fa-edit mr-1"></i>
                            Edit
                          </button>
                          <button
                            onClick={() => handleScanTarget(target)}
                            disabled={scanningTargets.has(target.id)}
                            className={`${
                              scanningTargets.has(target.id)
                                ? 'bg-gray-600 cursor-not-allowed opacity-50'
                                : 'bg-green-600 hover:bg-green-700'
                            } text-white px-3 py-1.5 rounded text-sm transition-colors flex items-center`}
                          >
                            {scanningTargets.has(target.id) ? (
                              <>
                                <i className="fas fa-spinner fa-spin mr-1"></i>
                                Scanning...
                              </>
                            ) : (
                              <>
                                <i className="fas fa-satellite-dish mr-1"></i>
                                Scan
                              </>
                            )}
                          </button>
                        </div>
                        <div className="flex items-center text-gray-400">
                          <i className={`${getStatusIcon(target.status)} mr-1`}></i>
                          <span className="text-xs">
                            Project: {target.project_name}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="col-span-full text-center py-12">
                    <i className="fas fa-server text-gray-500 text-6xl mb-4"></i>
                    <h3 className="text-xl font-semibold text-white mb-2">No Targets Found</h3>
                    <p className="text-gray-400 mb-6">Start by adding your first target to begin penetration testing</p>
                    <button
                      onClick={() => setShowAddModal(true)}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg"
                    >
                      <i className="fas fa-plus mr-2"></i>
                      Add First Target
                    </button>
                  </div>
                )}
              </div>
            )}
        </div>
      </div>

      {/* Target Detail Modal */}
      {selectedTarget && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg max-w-2xl w-full mx-4 flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center p-6 border-b border-gray-700 flex-shrink-0">
              <h3 className="text-xl font-semibold text-white">Target Details</h3>
              <button 
                onClick={() => setSelectedTarget(null)}
                className="text-gray-400 hover:text-white"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
            
            <div className="overflow-y-auto p-6 space-y-4">
              <div>
                <label className="text-gray-400 text-sm">Target Value</label>
                <p className="text-white">{selectedTarget.target_value}</p>
              </div>
              <div>
                <label className="text-gray-400 text-sm">Type</label>
                <p className="text-white">{selectedTarget.target_type?.toUpperCase()}</p>
              </div>
              <div>
                <label className="text-gray-400 text-sm">Status</label>
                <p className="text-white">{selectedTarget.status}</p>
              </div>
              <div>
                <label className="text-gray-400 text-sm">Priority</label>
                <p className="text-white">{selectedTarget.priority}</p>
              </div>
              <div>
                <label className="text-gray-400 text-sm">Project</label>
                <p className="text-white">{selectedTarget.project_name} - {selectedTarget.project_company}</p>
              </div>
              
              {/* Scan Results - from dedicated scan_results field or in-memory scanResults */}
              {(() => {
                // Prefer structured scan_results from DB, fall back to in-memory scan results
                const scan = selectedTarget.scan_results || scanResults[selectedTarget.id];

                if (!scan) {
                  // Legacy fallback: check notes for old [Scan ...] format
                  const hasLegacyScan = selectedTarget.notes && selectedTarget.notes.includes('[Scan');
                  if (hasLegacyScan) {
                    const scanLines = selectedTarget.notes.split('\n').filter(line => line.trim().includes('[Scan'));
                    const lastScanLine = scanLines.length > 0 ? scanLines[scanLines.length - 1].trim() : null;
                    const scanMatch = lastScanLine?.match(/\[Scan\s+([^\]]+)\].*?Ping:\s*([✓✗]).*?Port\s+80:\s*([✓✗]).*?Port\s+443:\s*([✓✗])/);
                    if (scanMatch) {
                      return (
                        <div className="bg-gray-900 rounded-lg p-4 border border-gray-700">
                          <label className="text-gray-400 text-sm mb-3 block">Last Scan Result <span className="text-gray-600 text-xs">(legacy)</span></label>
                          <p className="text-gray-500 text-xs mb-3">{scanMatch[1]}</p>
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-white text-sm">Ping (Reachability)</span>
                              <span className={scanMatch[2] === '✓' ? 'text-green-400' : 'text-red-400'}>
                                {scanMatch[2] === '✓' ? '✓ Reachable' : '✗ Not Reachable'}
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-white text-sm">Port 80 (HTTP)</span>
                              <span className={scanMatch[3] === '✓' ? 'text-green-400' : 'text-red-400'}>
                                {scanMatch[3] === '✓' ? '✓ Open' : '✗ Closed/Filtered'}
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-white text-sm">Port 443 (HTTPS)</span>
                              <span className={scanMatch[4] === '✓' ? 'text-green-400' : 'text-red-400'}>
                                {scanMatch[4] === '✓' ? '✓ Open' : '✗ Closed/Filtered'}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    }
                  }

                  return (
                    <div className="bg-gray-900 rounded-lg p-4 border border-gray-700">
                      <label className="text-gray-400 text-sm mb-3 block">Last Scan Result</label>
                      <p className="text-gray-500 text-sm">Not scanned yet</p>
                    </div>
                  );
                }

                return (
                  <div className="bg-gray-900 rounded-lg p-4 border border-gray-700">
                    <label className="text-gray-400 text-sm mb-3 block">Last Scan Result</label>
                    <div>
                      {scan.scanned_at && (
                        <p className="text-gray-500 text-xs mb-3">{new Date(scan.scanned_at).toLocaleString()}</p>
                      )}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-white text-sm">Ping (Reachability)</span>
                          <span className={scan.ping?.reachable ? 'text-green-400' : 'text-red-400'}>
                            {scan.ping?.reachable ? '✓ Reachable' : '✗ Not Reachable'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-white text-sm">Port 80 (HTTP)</span>
                          <span className={scan.port_80?.open ? 'text-green-400' : 'text-red-400'}>
                            {scan.port_80?.open ? `✓ Open${scan.port_80.response_time ? ` (${scan.port_80.response_time})` : ''}` : '✗ Closed/Filtered'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-white text-sm">Port 443 (HTTPS)</span>
                          <span className={scan.port_443?.open ? 'text-green-400' : 'text-red-400'}>
                            {scan.port_443?.open ? `✓ Open${scan.port_443.response_time ? ` (${scan.port_443.response_time})` : ''}` : '✗ Closed/Filtered'}
                          </span>
                        </div>
                        {(scan.http_check?.reachable || scan.http_check?.error) && (
                          <div className="flex items-center justify-between">
                            <span className="text-white text-sm">HTTP Check</span>
                            <span className={scan.http_check?.reachable ? 'text-green-400' : 'text-red-400'}>
                              {scan.http_check?.reachable
                                ? `✓ OK${scan.http_check.status_code ? ` (${scan.http_check.status_code})` : ''}${scan.http_check.response_time ? ` ${scan.http_check.response_time}` : ''}`
                                : '✗ Failed'}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Notes - clean, no scan data mixed in */}
              {selectedTarget.notes && (
                <div>
                  <label className="text-gray-400 text-sm">Notes</label>
                  <p className="text-white whitespace-pre-wrap">{selectedTarget.notes}</p>
                </div>
              )}
              
              {!selectedTarget.notes && (
                <div>
                  <label className="text-gray-400 text-sm">Notes</label>
                  <p className="text-white">No notes provided</p>
                </div>
              )}
              <div>
                <label className="text-gray-400 text-sm">Created At</label>
                <p className="text-white">{new Date(selectedTarget.created_at).toLocaleString()}</p>
              </div>
            </div>
            
            <div className="flex justify-end space-x-3 p-6 border-t border-gray-700 flex-shrink-0">
              <button 
                onClick={() => setSelectedTarget(null)}
                className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg transition-colors"
              >
                Close
              </button>
              <button
                onClick={() => {
                  if (selectedTarget) {
                    handleScanTarget(selectedTarget);
                  }
                }}
                disabled={selectedTarget && scanningTargets.has(selectedTarget.id)}
                className={`${
                  selectedTarget && scanningTargets.has(selectedTarget.id)
                    ? 'bg-gray-600 cursor-not-allowed opacity-50'
                    : 'bg-green-600 hover:bg-green-700'
                } text-white px-4 py-2 rounded-lg transition-colors flex items-center`}
              >
                {selectedTarget && scanningTargets.has(selectedTarget.id) ? (
                  <>
                    <i className="fas fa-spinner fa-spin mr-2"></i>
                    Scanning...
                  </>
                ) : (
                  <>
                    <i className="fas fa-satellite-dish mr-2"></i>
                    Start Scan
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Target Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Add New Target</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Select Project</label>
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                >
                  <option value="">Choose a project...</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name} - {project.company_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Target Value</label>
                <input
                  type="text"
                  value={newTarget.target_value}
                  onChange={(e) => setNewTarget({...newTarget, target_value: e.target.value})}
                  className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                  placeholder="Enter target value (IP or domain)"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Type</label>
                <select
                  value={newTarget.target_type}
                  onChange={(e) => setNewTarget({...newTarget, target_type: e.target.value})}
                  className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                >
                  <option value="ip">IP Address</option>
                  <option value="domain">Domain</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Priority</label>
                <select
                  value={newTarget.priority}
                  onChange={(e) => setNewTarget({...newTarget, priority: e.target.value})}
                  className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Notes</label>
                <textarea
                  value={newTarget.notes}
                  onChange={(e) => setNewTarget({...newTarget, notes: e.target.value})}
                  className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                  rows="3"
                  placeholder="Enter notes"
                />
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
                onClick={handleAddTarget}
                className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg"
              >
                Add Target
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Target Modal */}
      {showEditModal && editingTarget && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-gray-700">
              <h3 className="text-lg font-semibold text-white">Edit Target</h3>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Target Value</label>
                  <input
                    type="text"
                    value={editingTarget.target_value || ''}
                    onChange={(e) => setEditingTarget({...editingTarget, target_value: e.target.value})}
                    className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                    placeholder="Enter target value (IP or domain)"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Type</label>
                  <select
                    value={editingTarget.target_type || 'ip'}
                    onChange={(e) => setEditingTarget({...editingTarget, target_type: e.target.value})}
                    className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                  >
                    <option value="ip">IP</option>
                    <option value="domain">Domain</option>
                    <option value="subdomain">Subdomain</option>
                    <option value="url">URL</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Priority</label>
                  <select
                    value={
                      typeof editingTarget.priority === 'number' 
                        ? (editingTarget.priority === 5 ? 'medium' : (editingTarget.priority >= 8 ? 'high' : 'low'))
                        : (editingTarget.priority || 'medium')
                    }
                    onChange={(e) => {
                      const priorityValue = e.target.value === 'medium' ? 5 : (e.target.value === 'high' ? 8 : 3);
                      setEditingTarget({...editingTarget, priority: priorityValue});
                    }}
                    className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Notes</label>
                  <textarea
                    value={editingTarget.notes || ''}
                    onChange={(e) => setEditingTarget({...editingTarget, notes: e.target.value})}
                    className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                    rows="4"
                    placeholder="Enter notes"
                  />
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-gray-700 flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setEditingTarget(null);
                }}
                className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEditedTarget}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
