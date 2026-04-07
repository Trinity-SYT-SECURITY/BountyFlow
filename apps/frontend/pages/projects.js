import { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useToast } from '../components/Toast';

export default function Projects() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState(null);
  const [newProject, setNewProject] = useState({
    name: '',
    description: '',
    company_name: '',
    target_scope: '',
    out_of_scope: ''
  });

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      setLoading(true);
      const response = await fetch('http://localhost:8002/api/v1/projects');
      if (response.ok) {
        const data = await response.json();
        setProjects(data);
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

  const handleCreateProject = async () => {
    try {
      // Convert scope strings to arrays
      const targetScopeArray = newProject.target_scope
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);
      
      const outOfScopeArray = newProject.out_of_scope
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);

      // Prepare data for API (backend expects Dict format)
      const projectData = {
        name: newProject.name,
        description: newProject.description || null,
        company_name: newProject.company_name || null,
        target_scope: {
          in_scope: targetScopeArray
        },
        out_of_scope: {
          out_of_scope: outOfScopeArray
        }
      };

      const response = await fetch('http://localhost:8002/api/v1/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(projectData),
      });

      if (response.ok) {
        const createdProject = await response.json();
        setProjects([...projects, createdProject]);
        setShowCreateModal(false);
        setNewProject({ 
          name: '', 
          description: '', 
          company_name: '', 
          target_scope: '',
          out_of_scope: ''
        });
        toast.success('Project created successfully!');
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error('Failed to create project:', errorData);
        toast.error(`Failed to create project: ${errorData.detail || 'Please try again.'}`);
      }
    } catch (error) {
      console.error('Error creating project:', error);
      toast.error('Error creating project. Please try again.');
    }
  };

  const handleDeleteProject = async (projectId) => {
    try {
      const response = await fetch(`http://localhost:8002/api/v1/projects/${projectId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setShowDeleteModal(false);
        setProjectToDelete(null);
        loadProjects();
        toast.success('Project deleted successfully!');
      } else {
        toast.error('Failed to delete project. Please try again.');
      }
    } catch (error) {
      console.error('Error deleting project:', error);
      toast.error('Error deleting project. Please try again.');
    }
  };

  const confirmDelete = (project) => {
    setProjectToDelete(project);
    setShowDeleteModal(true);
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <Head>
        <title>Projects - BountyFlow</title>
      </Head>

      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Link href="/dashboard" className="text-blue-400 hover:text-blue-300">
              ← Back to Dashboard
            </Link>
            <h1 className="text-2xl font-bold">Projects</h1>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg font-medium"
          >
            Create New Project
          </button>
        </div>
      </div>

      {/* Projects Grid */}
      <div className="p-6">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
            <span className="ml-3 text-gray-400">Loading projects...</span>
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-gray-400 text-lg mb-4">No projects found</div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg font-medium"
            >
              Create Your First Project
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map((project) => (
              <div key={project.id} className="bg-gray-800 rounded-lg border border-gray-700 p-6 hover:border-blue-500 transition-colors">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-xl font-semibold text-white">{project.name}</h3>
                    <p className="text-gray-400 text-sm">{project.company_name || 'No Company'}</p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                    project.status === 'active' 
                      ? 'bg-green-900 text-green-300' 
                      : 'bg-gray-700 text-gray-300'
                  }`}>
                    {project.status || 'Unknown'}
                  </span>
                </div>
                
                <p className="text-gray-300 text-sm mb-4">{project.description || 'No description'}</p>
                
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-400">{project.targets_count || 0}</div>
                    <div className="text-xs text-gray-400">Targets</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-orange-400">{project.findings_count || 0}</div>
                    <div className="text-xs text-gray-400">Findings</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-400">{project.tools_count || 0}</div>
                    <div className="text-xs text-gray-400">Tools</div>
                  </div>
                </div>
                
                <div className="flex space-x-2">
                  <Link 
                    href={`/projects/${project.id}`}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-center py-2 rounded-lg text-sm font-medium"
                  >
                    Open
                  </Link>
                  <button 
                    onClick={() => confirmDelete(project)}
                    className="px-3 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-sm"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Project Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Create New Project</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Project Name</label>
                <input
                  type="text"
                  value={newProject.name}
                  onChange={(e) => setNewProject({...newProject, name: e.target.value})}
                  className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                  placeholder="Enter project name"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Company</label>
                <input
                  type="text"
                  value={newProject.company_name}
                  onChange={(e) => setNewProject({...newProject, company_name: e.target.value})}
                  className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                  placeholder="Enter company name"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Description</label>
                <textarea
                  value={newProject.description}
                  onChange={(e) => setNewProject({...newProject, description: e.target.value})}
                  className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                  rows="3"
                  placeholder="Enter project description"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Target Scope
                  <span className="text-xs text-gray-400 ml-2">(one per line)</span>
                </label>
                <textarea
                  value={newProject.target_scope}
                  onChange={(e) => setNewProject({...newProject, target_scope: e.target.value})}
                  className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none font-mono text-sm"
                  rows="4"
                  placeholder="192.168.1.0/24&#10;example.com&#10;*.example.com&#10;10.0.0.1-10.0.0.255"
                />
                <p className="text-xs text-gray-400 mt-1">Enter authorized targets (IPs, domains, CIDR ranges). One per line.</p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Out of Scope
                  <span className="text-xs text-gray-400 ml-2">(one per line)</span>
                </label>
                <textarea
                  value={newProject.out_of_scope}
                  onChange={(e) => setNewProject({...newProject, out_of_scope: e.target.value})}
                  className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none font-mono text-sm"
                  rows="3"
                  placeholder="admin.example.com&#10;192.168.1.1&#10;*.google.com"
                />
                <p className="text-xs text-gray-400 mt-1">Enter excluded targets. One per line.</p>
              </div>
            </div>
            
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateProject}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg"
              >
                Create Project
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && projectToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4 text-red-400">Delete Project</h2>
            <p className="text-gray-300 mb-6">
              Are you sure you want to delete "{projectToDelete.name}"? This action cannot be undone.
            </p>
            
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteProject(projectToDelete.id)}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
