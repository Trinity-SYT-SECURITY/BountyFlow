import { useState, useEffect } from 'react';
import Head from 'next/head';
import Layout from '../components/Layout';
import { useToast } from '../components/Toast';
import { useModal } from '../components/Modal';

export default function Files() {
  const [files, setFiles] = useState([]);
  const [projects, setProjects] = useState([]);
  const [targets, setTargets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [filterProject, setFilterProject] = useState('');
  const [filterType, setFilterType] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const toast = useToast();
  const { confirm } = useModal();

  const [newFile, setNewFile] = useState({
    project_id: '',
    target_id: '',
    filename: '',
    file_path: '',
    file_type: 'document',
    file_size: '',
    file_hash: '',
    content_preview: '',
    content_analysis: '',
    source: 'manual',
    severity: 'info',
    notes: '',
    tags: '',
    is_sensitive: 'false'
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadFiles(),
        loadProjects(),
        loadTargets()
      ]);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadFiles = async () => {
    try {
      const response = await fetch('http://localhost:8002/api/v1/discovered-files');
      if (response.ok) {
        const data = await response.json();
        setFiles(data);
      }
    } catch (error) {
      console.error('Failed to load files:', error);
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

  const loadTargets = async () => {
    try {
      const projectsResponse = await fetch('http://localhost:8002/api/v1/projects');
      if (projectsResponse.ok) {
        const projectsData = await projectsResponse.json();
        const allTargets = [];
        for (const project of projectsData) {
          if (project.targets) {
            allTargets.push(...project.targets.map(target => ({
              ...target,
              project_name: project.name
            })));
          }
        }
        setTargets(allTargets);
      }
    } catch (error) {
      console.error('Failed to load targets:', error);
    }
  };

  const handleAddFile = async () => {
    try {
      const response = await fetch(`http://localhost:8002/api/v1/projects/${newFile.project_id}/discovered-files`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...newFile,
          project_id: parseInt(newFile.project_id),
          target_id: newFile.target_id ? parseInt(newFile.target_id) : null,
          file_size: newFile.file_size ? parseInt(newFile.file_size) : null,
          tags: newFile.tags ? newFile.tags.split(',').map(tag => tag.trim()) : []
        })
      });

      if (response.ok) {
        setShowAddModal(false);
        setNewFile({
          project_id: '',
          target_id: '',
          filename: '',
          file_path: '',
          file_type: 'document',
          file_size: '',
          file_hash: '',
          content_preview: '',
          content_analysis: '',
          source: 'manual',
          severity: 'info',
          notes: '',
          tags: '',
          is_sensitive: 'false'
        });
        loadFiles();

        // Notify other pages (like knowledge graph) that project data has been updated
        window.dispatchEvent(new CustomEvent('projectDataUpdated', {
          detail: {
            projectId: parseInt(newFile.project_id),
            updatedItemType: 'files',
            action: 'created'
          }
        }));
      } else {
        const errorData = await response.json();
        console.error('Failed to add file:', errorData);
        toast.error(`Failed to add file: ${errorData.detail || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Failed to add file:', error);
      toast.error('Failed to add file. Please try again.');
    }
  };

  const handleEditFile = async () => {
    try {
      const response = await fetch(`http://localhost:8002/api/v1/projects/${selectedFile.project_id}/discovered-files/${selectedFile.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filename: selectedFile.filename,
          file_path: selectedFile.file_path,
          file_type: selectedFile.file_type,
          file_size: selectedFile.file_size ? parseInt(selectedFile.file_size) : null,
          file_hash: selectedFile.file_hash,
          content_preview: selectedFile.content_preview,
          content_analysis: selectedFile.content_analysis,
          source: selectedFile.source,
          severity: selectedFile.severity,
          notes: selectedFile.notes,
          tags: selectedFile.tags,
          is_sensitive: selectedFile.is_sensitive,
          target_id: selectedFile.target_id ? parseInt(selectedFile.target_id) : null
        })
      });

      if (response.ok) {
        setShowEditModal(false);
        setSelectedFile(null);
        loadFiles();

        // Notify other pages (like knowledge graph) that project data has been updated
        window.dispatchEvent(new CustomEvent('projectDataUpdated', {
          detail: {
            projectId: selectedFile.project_id,
            updatedItemType: 'files',
            updatedItemId: selectedFile.id,
            action: 'updated'
          }
        }));
      } else {
        const errorData = await response.json();
        console.error('Failed to update file:', errorData);
        toast.error(`Failed to update file: ${errorData.detail || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Failed to update file:', error);
      toast.error('Failed to update file. Please try again.');
    }
  };

  const handleDeleteFile = async (fileId, projectId) => {
    const confirmed = await confirm({
      title: 'Delete File',
      message: 'Are you sure you want to delete this file? This action cannot be undone.',
      confirmText: 'Delete',
      variant: 'danger'
    });
    if (!confirmed) {
      return;
    }

    try {
      const response = await fetch(`http://localhost:8002/api/v1/projects/${projectId}/discovered-files/${fileId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        loadFiles();

        // Notify other pages (like knowledge graph) that project data has been updated
        window.dispatchEvent(new CustomEvent('projectDataUpdated', {
          detail: {
            projectId: parseInt(projectId),
            updatedItemType: 'files',
            updatedItemId: fileId,
            action: 'deleted'
          }
        }));
      } else {
        const errorData = await response.json();
        console.error('Failed to delete file:', errorData);
        toast.error(`Failed to delete file: ${errorData.detail || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Failed to delete file:', error);
      toast.error('Failed to delete file. Please try again.');
    }
  };

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'critical': return 'bg-red-600 text-white';
      case 'high': return 'bg-red-500 text-white';
      case 'medium': return 'bg-yellow-500 text-white';
      case 'low': return 'bg-green-500 text-white';
      case 'info': return 'bg-blue-500 text-white';
      default: return 'bg-gray-500 text-white';
    }
  };

  const getFileTypeIcon = (fileType) => {
    switch (fileType) {
      case 'document': return '📄';
      case 'image': return '🖼️';
      case 'script': return '📜';
      case 'config': return '⚙️';
      case 'log': return '📋';
      case 'database': return '🗄️';
      default: return '📁';
    }
  };

  const filteredFiles = files.filter(file => {
    const matchesProject = !filterProject || file.project_name === filterProject;
    const matchesType = !filterType || file.file_type === filterType;
    const matchesSearch = !searchQuery || 
      file.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
      file.file_path.toLowerCase().includes(searchQuery.toLowerCase());
    
    return matchesProject && matchesType && matchesSearch;
  });

  if (loading) {
    return (
      <Layout>
        <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500 mx-auto"></div>
            <p className="mt-4 text-gray-400">Loading files...</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
    <div className="min-h-screen bg-gray-900 text-white">
      <Head>
          <title>Discovered Files - BountyFlow</title>
      </Head>

        <div className="container mx-auto px-4 py-8">
      {/* Header */}
          <div className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-3xl font-bold text-white">Discovered Files</h1>
              <p className="text-gray-400 mt-2">Files found during penetration testing</p>
            </div>
            <button
              onClick={() => setShowAddModal(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium"
            >
              Add File
            </button>
          </div>

          {/* Filters */}
          <div className="bg-gray-800 rounded-lg p-6 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Project</label>
                <select
                  value={filterProject}
                  onChange={(e) => setFilterProject(e.target.value)}
                  className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                >
                  <option value="">All Projects</option>
                  {projects.map(project => (
                    <option key={project.id} value={project.name}>{project.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">File Type</label>
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                >
                  <option value="">All Types</option>
                  <option value="document">Document</option>
                  <option value="image">Image</option>
                  <option value="script">Script</option>
                  <option value="config">Config</option>
                  <option value="log">Log</option>
                  <option value="database">Database</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Search</label>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search files..."
                  className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                />
              </div>
              <div className="flex items-end">
          <button
                  onClick={() => {
                    setFilterProject('');
                    setFilterType('');
                    setSearchQuery('');
                  }}
                  className="w-full bg-gray-600 hover:bg-gray-500 text-white px-4 py-2 rounded-lg"
                >
                  Clear Filters
          </button>
              </div>
        </div>
      </div>

      {/* Files Table */}
          <div className="bg-gray-800 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
              <table className="min-w-full">
              <thead className="bg-gray-700">
                <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">File</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Project</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Target</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Type</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Size</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Severity</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Discovered</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                  {filteredFiles.map((file) => (
                  <tr key={file.id} className="hover:bg-gray-700">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                          <span className="text-2xl mr-3">{getFileTypeIcon(file.file_type)}</span>
                          <div>
                            <div className="text-sm font-medium text-white">{file.filename}</div>
                            <div className="text-xs text-gray-400 truncate max-w-xs">{file.file_path}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                        {file.project_name || 'Unknown'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                        {file.target_value ? (
                          <div>
                            <div className="text-white">{file.target_value}</div>
                            <div className="text-xs text-gray-400">{file.target_type}</div>
                        </div>
                        ) : (
                          <span className="text-gray-500">No target assigned</span>
                        )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                        {file.file_type}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                        {file.file_size ? `${(file.file_size / 1024).toFixed(1)} KB` : 'Unknown'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getSeverityColor(file.severity)}`}>
                          {file.severity}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                        {new Date(file.discovered_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        <button 
                            onClick={() => {
                              setSelectedFile(file);
                              setShowEditModal(true);
                            }}
                            className="text-blue-400 hover:text-blue-300"
                        >
                          Edit
                        </button>
                        <button 
                            onClick={() => handleDeleteFile(file.id, file.project_id)}
                          className="text-red-400 hover:text-red-300"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

          {filteredFiles.length === 0 && (
            <div className="text-center py-12">
              <div className="text-gray-400 text-lg">No files found</div>
              <p className="text-gray-500 mt-2">Try adjusting your filters or add a new file</p>
            </div>
          )}
      </div>

        {/* Add File Modal */}
        {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <h2 className="text-xl font-bold text-white mb-4">Add New File</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Project</label>
                  <select
                    value={newFile.project_id}
                    onChange={(e) => setNewFile({...newFile, project_id: e.target.value})}
                    className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                    required
                  >
                    <option value="">Select Project</option>
                    {projects.map(project => (
                      <option key={project.id} value={project.id}>{project.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Target</label>
                  <select
                    value={newFile.target_id}
                    onChange={(e) => setNewFile({...newFile, target_id: e.target.value})}
                    className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                  >
                    <option value="">Select Target</option>
                    {targets.filter(target => target.project_id == newFile.project_id).map(target => (
                      <option key={target.id} value={target.id}>
                        {target.target_value} ({target.target_type})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Filename</label>
                  <input
                    type="text"
                    value={newFile.filename}
                    onChange={(e) => setNewFile({...newFile, filename: e.target.value})}
                    className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                    placeholder="config.php"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">File Path</label>
                  <input
                    type="text"
                    value={newFile.file_path}
                    onChange={(e) => setNewFile({...newFile, file_path: e.target.value})}
                    className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                    placeholder="/var/www/html/config.php"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">File Type</label>
                  <select
                    value={newFile.file_type}
                    onChange={(e) => setNewFile({...newFile, file_type: e.target.value})}
                    className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                  >
                    <option value="document">Document</option>
                    <option value="image">Image</option>
                    <option value="script">Script</option>
                    <option value="config">Config</option>
                    <option value="log">Log</option>
                    <option value="database">Database</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">File Size (bytes)</label>
                  <input
                    type="number"
                    value={newFile.file_size}
                    onChange={(e) => setNewFile({...newFile, file_size: e.target.value})}
                    className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                    placeholder="1024"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">File Hash</label>
                  <input
                    type="text"
                    value={newFile.file_hash}
                    onChange={(e) => setNewFile({...newFile, file_hash: e.target.value})}
                    className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                    placeholder="md5:abc123..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Source</label>
                  <select
                    value={newFile.source}
                    onChange={(e) => setNewFile({...newFile, source: e.target.value})}
                    className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                  >
                    <option value="manual">Manual</option>
                    <option value="scan">Scan</option>
                    <option value="tool">Tool</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Severity</label>
                  <select
                    value={newFile.severity}
                    onChange={(e) => setNewFile({...newFile, severity: e.target.value})}
                    className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                  >
                    <option value="info">Info</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Is Sensitive</label>
                  <select
                    value={newFile.is_sensitive}
                    onChange={(e) => setNewFile({...newFile, is_sensitive: e.target.value})}
                    className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                  >
                    <option value="false">No</option>
                    <option value="true">Yes</option>
                  </select>
                </div>
              <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Tags (comma-separated)</label>
                <input
                    type="text"
                    value={newFile.tags}
                    onChange={(e) => setNewFile({...newFile, tags: e.target.value})}
                    className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                    placeholder="config, sensitive, backup"
                  />
                </div>
              </div>
              
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-300 mb-2">Content Preview</label>
                <textarea
                  value={newFile.content_preview}
                  onChange={(e) => setNewFile({...newFile, content_preview: e.target.value})}
                  className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                  rows="3"
                  placeholder="First few lines of file content..."
                />
              </div>
              
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-300 mb-2">Content Analysis</label>
                <textarea
                  value={newFile.content_analysis}
                  onChange={(e) => setNewFile({...newFile, content_analysis: e.target.value})}
                  className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                  rows="3"
                  placeholder="Analysis of file content and potential security implications..."
                />
              </div>
              
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-300 mb-2">Notes</label>
                <textarea
                  value={newFile.notes}
                  onChange={(e) => setNewFile({...newFile, notes: e.target.value})}
                  className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                  rows="2"
                  placeholder="Additional notes about this file..."
                />
            </div>
            
            <div className="flex justify-end space-x-3 mt-6">
              <button
                  onClick={() => setShowAddModal(false)}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg"
              >
                Cancel
              </button>
                <button
                  onClick={handleAddFile}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg"
                >
                  Add File
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit File Modal */}
      {showEditModal && selectedFile && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <h2 className="text-xl font-bold text-white mb-4">Edit File</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Filename</label>
                  <input
                    type="text"
                    value={selectedFile.filename}
                    onChange={(e) => setSelectedFile({...selectedFile, filename: e.target.value})}
                    className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">File Path</label>
                  <input
                    type="text"
                    value={selectedFile.file_path}
                    onChange={(e) => setSelectedFile({...selectedFile, file_path: e.target.value})}
                    className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">File Type</label>
                  <select
                    value={selectedFile.file_type}
                    onChange={(e) => setSelectedFile({...selectedFile, file_type: e.target.value})}
                    className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                  >
                    <option value="document">Document</option>
                    <option value="image">Image</option>
                    <option value="script">Script</option>
                    <option value="config">Config</option>
                    <option value="log">Log</option>
                    <option value="database">Database</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">File Size (bytes)</label>
                  <input
                    type="number"
                    value={selectedFile.file_size || ''}
                    onChange={(e) => setSelectedFile({...selectedFile, file_size: e.target.value})}
                    className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                  />
                </div>
              <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">File Hash</label>
                <input
                  type="text"
                    value={selectedFile.file_hash || ''}
                    onChange={(e) => setSelectedFile({...selectedFile, file_hash: e.target.value})}
                    className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Source</label>
                  <select
                    value={selectedFile.source}
                    onChange={(e) => setSelectedFile({...selectedFile, source: e.target.value})}
                    className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                  >
                    <option value="manual">Manual</option>
                    <option value="scan">Scan</option>
                    <option value="tool">Tool</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Severity</label>
                  <select
                    value={selectedFile.severity}
                    onChange={(e) => setSelectedFile({...selectedFile, severity: e.target.value})}
                    className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                  >
                    <option value="info">Info</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Is Sensitive</label>
                  <select
                    value={selectedFile.is_sensitive}
                    onChange={(e) => setSelectedFile({...selectedFile, is_sensitive: e.target.value})}
                    className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                  >
                    <option value="false">No</option>
                    <option value="true">Yes</option>
                  </select>
                </div>
              </div>
              
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-300 mb-2">Content Preview</label>
                <textarea
                  value={selectedFile.content_preview || ''}
                  onChange={(e) => setSelectedFile({...selectedFile, content_preview: e.target.value})}
                  className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                  rows="3"
                />
              </div>
              
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-300 mb-2">Content Analysis</label>
                <textarea
                  value={selectedFile.content_analysis || ''}
                  onChange={(e) => setSelectedFile({...selectedFile, content_analysis: e.target.value})}
                  className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                  rows="3"
                />
              </div>
              
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-300 mb-2">Notes</label>
                <textarea
                  value={selectedFile.notes || ''}
                  onChange={(e) => setSelectedFile({...selectedFile, notes: e.target.value})}
                  className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                  rows="2"
                />
            </div>
            
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowEditModal(false)}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg"
              >
                Cancel
              </button>
              <button
                  onClick={handleEditFile}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg"
              >
                Update File
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </Layout>
  );
}