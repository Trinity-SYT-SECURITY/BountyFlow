import { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';

export default function Findings() {
  const [findings, setFindings] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedFinding, setSelectedFinding] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [newFinding, setNewFinding] = useState({
    title: '',
    description: '',
    severity: 'medium',
    status: 'open',
    discovered_at: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    try {
      setLoading(true);
      await Promise.all([loadFindings(), loadProjects()]);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadFindings = async () => {
    try {
      // Get findings from all projects
      const projectsResponse = await fetch('http://localhost:8002/api/v1/projects');
      if (projectsResponse.ok) {
        const projectsData = await projectsResponse.json();
        const allFindings = [];

        for (const project of projectsData) {
          if (project.findings && project.findings.length > 0) {
            // Add project information for each finding
            const findingsWithProject = project.findings.map(finding => ({
              ...finding,
              project_id: project.id,
              project_name: project.name,
              project_company: project.company_name
            }));
            allFindings.push(...findingsWithProject);
          }
        }

        setFindings(allFindings);
      }
    } catch (error) {
      console.error('Failed to load findings:', error);
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

  const handleAddFinding = async () => {
    if (!selectedProjectId || !newFinding.title) return;

    try {
      const response = await fetch(`http://localhost:8002/api/v1/projects/${selectedProjectId}/findings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: newFinding.title,
          description: newFinding.description,
          severity: newFinding.severity,
          status: newFinding.status,
          discovered_at: newFinding.discovered_at
        })
      });

      if (response.ok) {
        setShowAddModal(false);
        setNewFinding({
          title: '',
          description: '',
          severity: 'medium',
          status: 'open',
          discovered_at: new Date().toISOString().split('T')[0]
        });
        setSelectedProjectId('');
        // Reload data
        loadAllData();
      }
    } catch (error) {
      console.error('Failed to add finding:', error);
    }
  };

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'critical': return 'bg-red-900 text-red-300';
      case 'high': return 'bg-orange-900 text-orange-300';
      case 'medium': return 'bg-yellow-900 text-yellow-300';
      case 'low': return 'bg-green-900 text-green-300';
      case 'info': return 'bg-blue-900 text-blue-300';
      default: return 'bg-gray-900 text-gray-300';
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'open': return 'bg-red-900 text-red-300';
      case 'in_progress': return 'bg-yellow-900 text-yellow-300';
      case 'resolved': return 'bg-green-900 text-green-300';
      case 'closed': return 'bg-gray-900 text-gray-300';
      default: return 'bg-gray-900 text-gray-300';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'open': return 'fas fa-exclamation-circle';
      case 'in_progress': return 'fas fa-clock';
      case 'resolved': return 'fas fa-check-circle';
      case 'closed': return 'fas fa-times-circle';
      default: return 'fas fa-question-circle';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-white">Loading findings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900">
      <Head>
        <title>Findings - BountyFlow</title>
      </Head>

      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Link href="/dashboard" className="text-blue-400 hover:text-blue-300">
              ← Back to Dashboard
            </Link>
            <h1 className="text-2xl font-bold">Findings</h1>
            <span className="bg-gray-700 text-gray-300 px-3 py-1 rounded-full text-sm">
              {findings.length} findings
            </span>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg flex items-center space-x-2"
          >
            <i className="fas fa-plus"></i>
            <span>Add Finding</span>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {findings.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-gray-400 text-6xl mb-4">
              <i className="fas fa-search"></i>
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">No Findings Found</h3>
            <p className="text-gray-400 mb-6">Start by adding findings to your projects or create a new finding here.</p>
            <button
              onClick={() => setShowAddModal(true)}
              className="bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-lg"
            >
              Add First Finding
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {findings.map((finding) => (
              <div
                key={finding.id}
                className="bg-gray-800 rounded-lg border border-gray-700 p-6 hover:border-blue-500 transition-colors cursor-pointer"
                onClick={() => setSelectedFinding(finding)}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-white mb-2">{finding.title}</h3>
                    <p className="text-gray-300 text-sm mb-3 line-clamp-2">{finding.description}</p>
                    <div className="flex items-center space-x-2 mb-2">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getSeverityColor(finding.severity)}`}>
                        {finding.severity?.toUpperCase()}
                      </span>
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getStatusColor(finding.status)}`}>
                        {finding.status?.replace('_', ' ').toUpperCase()}
                      </span>
                    </div>
                    <p className="text-blue-400 text-xs mt-1">
                      <i className="fas fa-project-diagram mr-1"></i>
                      {finding.project_name} - {finding.project_company}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center justify-between text-sm text-gray-400">
                  <div className="flex items-center">
                    <i className="fas fa-calendar mr-1"></i>
                    <span>{new Date(finding.discovered_at).toLocaleDateString()}</span>
                  </div>
                  <div className="flex items-center">
                    <i className={`${getStatusIcon(finding.status)} mr-1`}></i>
                    <span className="text-xs">
                      Project: {finding.project_name}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Finding Details Modal */}
      {selectedFinding && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold">{selectedFinding.title}</h3>
              <button
                onClick={() => setSelectedFinding(null)}
                className="text-gray-400 hover:text-white"
              >
                <i className="fas fa-times text-xl"></i>
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-gray-400 text-sm">Description</label>
                <p className="text-white mt-1">{selectedFinding.description}</p>
              </div>
              <div>
                <label className="text-gray-400 text-sm">Project</label>
                <p className="text-white">{selectedFinding.project_name} - {selectedFinding.project_company}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-gray-400 text-sm">Severity</label>
                  <p className="text-white">{selectedFinding.severity?.toUpperCase()}</p>
                </div>
                <div>
                  <label className="text-gray-400 text-sm">Status</label>
                  <p className="text-white">{selectedFinding.status?.replace('_', ' ').toUpperCase()}</p>
                </div>
              </div>
              <div>
                <label className="text-gray-400 text-sm">Discovered At</label>
                <p className="text-white">{new Date(selectedFinding.discovered_at).toLocaleDateString()}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Finding Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Add New Finding</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Project</label>
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                >
                  <option value="">Select a project</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name} - {project.company_name}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Title</label>
                <input
                  type="text"
                  value={newFinding.title}
                  onChange={(e) => setNewFinding({...newFinding, title: e.target.value})}
                  className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                  placeholder="Enter finding title"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Description</label>
                <textarea
                  value={newFinding.description}
                  onChange={(e) => setNewFinding({...newFinding, description: e.target.value})}
                  className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                  rows="3"
                  placeholder="Enter finding description"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Severity</label>
                  <select
                    value={newFinding.severity}
                    onChange={(e) => setNewFinding({...newFinding, severity: e.target.value})}
                    className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                  >
                    <option value="info">Info</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Status</label>
                  <select
                    value={newFinding.status}
                    onChange={(e) => setNewFinding({...newFinding, status: e.target.value})}
                    className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                  >
                    <option value="open">Open</option>
                    <option value="in_progress">In Progress</option>
                    <option value="resolved">Resolved</option>
                    <option value="closed">Closed</option>
                  </select>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Discovered At</label>
                <input
                  type="date"
                  value={newFinding.discovered_at}
                  onChange={(e) => setNewFinding({...newFinding, discovered_at: e.target.value})}
                  className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
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
                onClick={handleAddFinding}
                className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg"
              >
                Add Finding
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
