import { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';

export default function Scope() {
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [scope, setScope] = useState({
    inScope: [],
    outOfScope: [],
    discovered: []
  });
  const [loading, setLoading] = useState(true);

  const [showAddModal, setShowAddModal] = useState(false);
  const [newTarget, setNewTarget] = useState({
    target: '',
    type: 'IP',
    scope: 'inScope'
  });

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    if (selectedProject) {
      loadProjectScope(selectedProject.id);
    }
  }, [selectedProject]);

  const loadProjects = async () => {
    try {
      setLoading(true);
      const response = await fetch('http://localhost:8002/api/v1/projects');
      if (response.ok) {
        const data = await response.json();
        setProjects(data);
        if (data.length > 0) {
          setSelectedProject(data[0]);
        }
      } else {
        console.error('Failed to load projects');
        setProjects([]);
      }
    } catch (error) {
      console.error('Error loading projects:', error);
      setProjects([]);
    } finally {
      setLoading(false);
    }
  };

  const loadProjectScope = async (projectId) => {
    try {
      const response = await fetch(`http://localhost:8002/api/v1/projects/${projectId}`);
      if (response.ok) {
        const project = await response.json();
        
        // Convert project scope data to scope format
        // Assuming 'out_of_scope' is under 'target_scope' (fixed potential naming inconsistency)
        const inScope = project.target_scope?.in_scope?.map((target, index) => ({
          id: `in_${index}`,
          target: target,
          type: getTargetType(target),
          status: "Active"
        })) || [];
        
        const outOfScope = project.target_scope?.out_of_scope?.map((target, index) => ({
          id: `out_${index}`,
          target: target,
          type: getTargetType(target),
          status: "Excluded",
          reason: "Out of scope"
        })) || [];
        
        setScope({
          inScope,
          outOfScope,
          discovered: [] // Discovered targets would come from targets table
        });
      } else {
        console.error('Failed to load project scope');
      }
    } catch (error) {
      console.error('Error loading project scope:', error);
    }
  };

  const getTargetType = (target) => {
    // Improved logic to better distinguish types
    if (/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(\/\d{1,2})?/.test(target)) {
      return target.includes('/') ? 'Network' : 'IP';
    }
    if (target.includes('*')) {
      return 'Domain'; // Wildcard domain
    }
    if (target.includes('.')) {
      return 'Domain'; // Regular domain
    }
    return 'IP'; // Fallback
  };

  const handleAddTarget = () => {
    // Generate unique ID
    const allTargets = [...scope.inScope, ...scope.outOfScope, ...scope.discovered];
    const maxId = allTargets.length > 0 ? Math.max(...allTargets.map(t => parseInt(t.id.split('_')[1]) || 0)) : 0;
    
    const target = {
      id: `${newTarget.scope}_${maxId + 1}`,
      ...newTarget,
      status: newTarget.scope === 'inScope' ? 'Active' : 'Excluded',
      confidence: newTarget.scope === 'discovered' ? Math.floor(Math.random() * 30) + 70 : null
    };

    if (newTarget.scope === 'inScope') {
      setScope({...scope, inScope: [...scope.inScope, target]});
    } else if (newTarget.scope === 'outOfScope') {
      setScope({...scope, outOfScope: [...scope.outOfScope, target]});
    } else {
      setScope({...scope, discovered: [...scope.discovered, target]});
    }

    setShowAddModal(false);
    setNewTarget({ target: '', type: 'IP', scope: 'inScope' });
  };

  const moveToScope = (target, newScope) => {
    // Remove from current scope
    const updatedScope = { ...scope };
    if (target.status === 'Active') {
      updatedScope.inScope = updatedScope.inScope.filter(t => t.id !== target.id);
    } else if (target.status === 'Excluded') {
      updatedScope.outOfScope = updatedScope.outOfScope.filter(t => t.id !== target.id);
    } else {
      updatedScope.discovered = updatedScope.discovered.filter(t => t.id !== target.id);
    }

    // Add to new scope
    const updatedTarget = { ...target };
    if (newScope === 'inScope') {
      updatedTarget.status = 'Active';
      updatedScope.inScope = [...updatedScope.inScope, updatedTarget];
    } else if (newScope === 'outOfScope') {
      updatedTarget.status = 'Excluded';
      updatedScope.outOfScope = [...updatedScope.outOfScope, updatedTarget];
    }

    setScope(updatedScope);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Active': return 'bg-green-900 text-green-300';
      case 'Excluded': return 'bg-red-900 text-red-300';
      case 'Discovered': return 'bg-blue-900 text-blue-300';
      default: return 'bg-gray-700 text-gray-300';
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <Head>
        <title>Scope Management - BountyFlow</title>
      </Head>

      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Link href="/dashboard" className="text-blue-400 hover:text-blue-300">
              ← Back to Dashboard
            </Link>
            <h1 className="text-2xl font-bold">Scope Management</h1>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg font-medium"
          >
            Add Target
          </button>
        </div>
      </div>

      <div className="p-6">
        {/* Project Selector */}
        {loading ? (
          <div className="mb-6 p-4 bg-gray-800 rounded-lg">
            <p className="text-gray-400">Loading projects...</p>
          </div>
        ) : (
          <div className="mb-6 p-4 bg-gray-800 rounded-lg">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Select Project
            </label>
            <select
              value={selectedProject?.id || ''}
              onChange={(e) => {
                const project = projects.find(p => p.id === parseInt(e.target.value));
                setSelectedProject(project);
              }}
              className="w-full md:w-64 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select a project...</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name} ({project.company_name})
                </option>
              ))}
            </select>
            {selectedProject && (
              <div className="mt-2 text-sm text-gray-400">
                <p><strong>Company:</strong> {selectedProject.company_name}</p>
                <p><strong>Description:</strong> {selectedProject.description || 'No description'}</p>
              </div>
            )}
          </div>
        )}

        {/* Show content only if project is selected */}
        {!selectedProject ? (
          <div className="text-center py-12">
            <div className="text-gray-400 text-lg">
              {projects.length === 0 ? 'No projects found. Create a project first.' : 'Please select a project to view its scope.'}
            </div>
          </div>
        ) : (
          <>
            {/* Scope Statistics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-white">In Scope</h3>
                    <p className="text-3xl font-bold text-green-400">{scope.inScope.length}</p>
                  </div>
                  <div className="w-12 h-12 bg-green-600 rounded-full flex items-center justify-center">
                    <span className="text-white font-bold">✓</span>
                  </div>
                </div>
              </div>
              
              <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-white">Out of Scope</h3>
                    <p className="text-3xl font-bold text-red-400">{scope.outOfScope.length}</p>
                  </div>
                  <div className="w-12 h-12 bg-red-600 rounded-full flex items-center justify-center">
                    <span className="text-white font-bold">✗</span>
                  </div>
                </div>
              </div>
              
              <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-white">Discovered</h3>
                    <p className="text-3xl font-bold text-blue-400">{scope.discovered.length}</p>
                  </div>
                  <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center">
                    <span className="text-white font-bold">?</span>
                  </div>
                </div>
              </div>
            </div>

            {/* In Scope Targets */}
            <div className="mb-8">
              <h2 className="text-xl font-semibold mb-4 text-green-400">In Scope Targets</h2>
              <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-700">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Target</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Type</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Status</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700">
                      {scope.inScope.map((target) => (
                        <tr key={target.id} className="hover:bg-gray-700">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-white">{target.target}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="px-2 py-1 text-xs font-medium bg-gray-700 text-gray-300 rounded-full">
                              {target.type}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(target.status)}`}>
                              {target.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                            <div className="flex space-x-2">
                              <button 
                                onClick={() => moveToScope(target, 'outOfScope')}
                                className="text-red-400 hover:text-red-300"
                              >
                                Move to Out of Scope
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Out of Scope Targets */}
            <div className="mb-8">
              <h2 className="text-xl font-semibold mb-4 text-red-400">Out of Scope Targets</h2>
              <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-700">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Target</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Type</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Reason</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700">
                      {scope.outOfScope.map((target) => (
                        <tr key={target.id} className="hover:bg-gray-700">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-white">{target.target}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="px-2 py-1 text-xs font-medium bg-gray-700 text-gray-300 rounded-full">
                              {target.type}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-300">{target.reason}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                            <div className="flex space-x-2">
                              <button 
                                onClick={() => moveToScope(target, 'inScope')}
                                className="text-green-400 hover:text-green-300"
                              >
                                Move to In Scope
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Discovered Targets */}
            <div className="mb-8">
              <h2 className="text-xl font-semibold mb-4 text-blue-400">Discovered Targets</h2>
              <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-700">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Target</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Type</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Confidence</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700">
                      {scope.discovered.map((target) => (
                        <tr key={target.id} className="hover:bg-gray-700">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-white">{target.target}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="px-2 py-1 text-xs font-medium bg-gray-700 text-gray-300 rounded-full">
                              {target.type}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <div className="w-16 bg-gray-700 rounded-full h-2 mr-2">
                                <div 
                                  className="bg-blue-600 h-2 rounded-full"
                                  style={{ width: `${target.confidence}%` }}
                                ></div>
                              </div>
                              <span className="text-sm text-blue-400">{target.confidence}%</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                            <div className="flex space-x-2">
                              <button 
                                onClick={() => moveToScope(target, 'inScope')}
                                className="text-green-400 hover:text-green-300"
                              >
                                Add to In Scope
                              </button>
                              <button 
                                onClick={() => moveToScope(target, 'outOfScope')}
                                className="text-red-400 hover:text-red-300"
                              >
                                Exclude
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Add Target Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Add Target</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Target</label>
                <input
                  type="text"
                  value={newTarget.target}
                  onChange={(e) => setNewTarget({...newTarget, target: e.target.value})}
                  className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                  placeholder="192.168.1.1 or *.example.com"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Type</label>
                <select
                  value={newTarget.type}
                  onChange={(e) => setNewTarget({...newTarget, type: e.target.value})}
                  className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                >
                  <option value="IP">IP Address</option>
                  <option value="Domain">Domain</option>
                  <option value="Subdomain">Subdomain</option>
                  <option value="Network">Network Range</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Scope</label>
                <select
                  value={newTarget.scope}
                  onChange={(e) => setNewTarget({...newTarget, scope: e.target.value})}
                  className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                >
                  <option value="inScope">In Scope</option>
                  <option value="outOfScope">Out of Scope</option>
                </select>
              </div>
            </div>
            
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleAddTarget}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg"
              >
                Add Target
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}