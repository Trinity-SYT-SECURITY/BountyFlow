import { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useToast } from '../../components/Toast';
import { useModal } from '../../components/Modal';

export default function AdminProjects() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState(null);
  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]);
  const toast = useToast();
  const { confirm, prompt } = useModal();

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      const user = JSON.parse(userStr);
      setCurrentUser(user);
      if (!user.is_superuser) {
        router.push('/dashboard');
        return;
      }
    } else {
      router.push('/login');
      return;
    }

    loadProjects();
    loadUsers();
  }, []);

  const loadProjects = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:8002/api/v1/admin/projects?limit=100', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setProjects(data.projects || []);
      }
    } catch (error) {
      console.error('Error loading projects:', error);
    }
  };

  const loadUsers = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:8002/api/v1/admin/users?limit=100', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setUsers(data);
      }
    } catch (error) {
      console.error('Error loading users:', error);
    }
  };

  const handleTransferProject = async (projectId, projectName) => {
    const newOwnerId = await prompt({
      title: 'Transfer Project',
      message: 'Enter the new owner user ID:',
      placeholder: 'User ID',
      confirmText: 'Transfer'
    });
    if (!newOwnerId) return;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`http://localhost:8002/api/v1/admin/projects/${projectId}/transfer?new_owner_id=${newOwnerId}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        toast.success(`Project "${projectName}" transferred successfully!`);
        loadProjects();
      } else {
        const error = await response.json();
        toast.error(`Error: ${error.detail}`);
      }
    } catch (error) {
      console.error('Error transferring project:', error);
      toast.error('Error transferring project');
    }
  };

  const handleDeleteProject = async (projectId, projectName) => {
    const confirmed = await confirm({
      title: 'Delete Project',
      message: `Are you sure you want to delete project "${projectName}"? This action cannot be undone.`,
      confirmText: 'Delete',
      variant: 'danger'
    });
    if (!confirmed) return;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`http://localhost:8002/api/v1/admin/projects/${projectId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        toast.success('Project deleted successfully!');
        loadProjects();
      } else {
        toast.error('Error deleting project');
      }
    } catch (error) {
      console.error('Error deleting project:', error);
      toast.error('Error deleting project');
    }
  };

  const handleLogout = () => {
    localStorage.clear();
    sessionStorage.clear();
    router.push('/login');
  };

  if (!currentUser || !currentUser.is_superuser) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-900">
      <Head>
        <title>All Projects - Admin - BountyFlow</title>
      </Head>

      <header className="bg-gray-800 border-b-4 border-purple-600 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-4">
              <h1 className="text-2xl font-bold text-white flex items-center">
                🛡️ BountyFlow <span className="ml-2 px-3 py-1 bg-purple-600 text-sm rounded-full">Admin Panel</span>
              </h1>
            </div>
            <div className="flex items-center space-x-4">
              <div className="text-sm text-gray-300">
                Welcome, <span className="font-semibold text-white">{currentUser?.username}</span>
                <span className="ml-2 px-2 py-0.5 bg-purple-600 text-xs rounded-full">Admin</span>
              </div>
              <button 
                onClick={handleLogout}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm transition-colors"
              >
                🚪 Logout
              </button>
            </div>
          </div>

          <nav className="flex space-x-1 pb-4">
            <Link href="/admin" className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors">
              📊 Dashboard
            </Link>
            <Link href="/admin/users" className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors">
              👥 Users
            </Link>
            <Link href="/admin/projects" className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium">
              📁 Projects
            </Link>
            <Link href="/admin/audit-logs" className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors">
              📜 Audit Logs
            </Link>
            <Link href="/admin/settings" className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors">
              ⚙️ Settings
            </Link>
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-white">All Projects</h2>
          <p className="text-gray-400">View and manage projects across all users</p>
        </div>

        <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Project Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Owner</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Targets</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Created</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {projects.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-6 py-8 text-center text-gray-400">No projects found</td>
                </tr>
              ) : (
                projects.map((project) => (
                  <tr key={project.id} className="hover:bg-gray-700">
                    <td className="px-6 py-4">
                      <div className="text-white font-medium">{project.name}</div>
                      {project.description && (
                        <div className="text-gray-400 text-sm">{project.description.substring(0, 60)}...</div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-white">{project.owner.username}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        project.status === 'active' ? 'bg-green-600' : 'bg-gray-600'
                      } text-white`}>
                        {project.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-white">{project.target_count}</td>
                    <td className="px-6 py-4 text-gray-400 text-sm">
                      {new Date(project.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-right space-x-2">
                      <Link
                        href={`/projects/${project.id}`}
                        className="text-blue-400 hover:text-blue-300 text-sm"
                      >
                        View
                      </Link>
                      <button
                        onClick={() => handleTransferProject(project.id, project.name)}
                        className="text-yellow-400 hover:text-yellow-300 text-sm"
                      >
                        Transfer
                      </button>
                      <button
                        onClick={() => handleDeleteProject(project.id, project.name)}
                        className="text-red-400 hover:text-red-300 text-sm"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 text-gray-400 text-sm">
          Total: {projects.length} projects
        </div>
      </main>
    </div>
  );
}


