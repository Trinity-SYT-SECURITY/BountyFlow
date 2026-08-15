import { useState, useEffect } from 'react';
import Head from 'next/head';
import Layout from '../components/Layout';
import { useToast } from '../components/Toast';

export default function DiscoveredUsers() {
  const [discoveredUsers, setDiscoveredUsers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [targets, setTargets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [filterProject, setFilterProject] = useState('');
  const [filterSource, setFilterSource] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const [newUser, setNewUser] = useState({
    project_id: '',
    target_id: '',
    username: '',
    full_name: '',
    email: '',
    password_plaintext: '',
    domain: '',
    privilege_level: 'user',
    account_status: 'active',
    source: 'manual',
    notes: '',
    severity: 'info'
  });

  const toast = useToast();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadDiscoveredUsers(),
        loadProjects(),
        loadTargets()
      ]);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadDiscoveredUsers = async () => {
    try {
      const response = await fetch('http://localhost:8002/api/v1/discovered-users');
      if (response.ok) {
        const data = await response.json();
        setDiscoveredUsers(data);
      }
    } catch (error) {
      console.error('Failed to load discovered users:', error);
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
          if (project.targets && project.targets.length > 0) {
            const targetsWithProject = project.targets.map(target => ({
              ...target,
              project_id: project.id,
              project_name: project.name
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

  const handleAddUser = async () => {
    if (!newUser.project_id || !newUser.username) {
      toast.warning('Please fill in required fields (Project and Username)');
      return;
    }

    try {
      const response = await fetch('http://localhost:8002/api/v1/discovered-users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser)
      });

      if (response.ok) {
        setShowAddModal(false);
        setNewUser({
          project_id: '',
          target_id: '',
          username: '',
          full_name: '',
          email: '',
          password_plaintext: '',
          domain: '',
          privilege_level: 'user',
          account_status: 'active',
          source: 'manual',
          notes: '',
          severity: 'info'
        });
        loadDiscoveredUsers();

        // Notify other pages (like knowledge graph) that project data has been updated
        window.dispatchEvent(new CustomEvent('projectDataUpdated', {
          detail: {
            projectId: parseInt(newUser.project_id),
            updatedItemType: 'users',
            action: 'created'
          }
        }));
      } else {
        toast.error('Failed to add discovered user');
      }
    } catch (error) {
      console.error('Error adding user:', error);
      toast.error('Error adding user');
    }
  };

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'critical': return 'bg-red-600';
      case 'high': return 'bg-orange-600';
      case 'medium': return 'bg-yellow-600';
      case 'low': return 'bg-blue-600';
      default: return 'bg-gray-600';
    }
  };

  const getPrivilegeBadge = (level) => {
    const colors = {
      'admin': 'bg-red-500',
      'root': 'bg-red-600',
      'system': 'bg-purple-600',
      'user': 'bg-blue-500',
      'guest': 'bg-gray-500'
    };
    return colors[level] || 'bg-gray-500';
  };

  const filteredUsers = discoveredUsers.filter(user => {
    const matchesProject = !filterProject || user.project_id.toString() === filterProject;
    const matchesSource = !filterSource || user.source === filterSource;
    const matchesSearch = !searchQuery || 
      user.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (user.email && user.email.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (user.domain && user.domain.toLowerCase().includes(searchQuery.toLowerCase()));
    
    return matchesProject && matchesSource && matchesSearch;
  });

  return (
    <Layout title="Discovered Users - BountyFlow">
      <Head>
        <title>Discovered Users - BountyFlow</title>
        <meta name="description" content="Users discovered during penetration testing" />
      </Head>

      <div className="p-6">
        {/* Page Header */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">👤 Discovered Users</h1>
              <p className="text-gray-400">Users found during penetration testing operations</p>
              <p className="text-sm text-gray-500 mt-1">
                These users are recorded in the knowledge graph to track relationships between targets
              </p>
            </div>
            <button
              onClick={() => setShowAddModal(true)}
              className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg transition-colors"
            >
              <i className="fas fa-plus mr-2"></i>
              Add Discovered User
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-gray-800 rounded-lg p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <input
                type="text"
                placeholder="🔍 Search username, email, domain..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-gray-700 text-white px-4 py-2 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <select
                value={filterProject}
                onChange={(e) => setFilterProject(e.target.value)}
                className="w-full bg-gray-700 text-white px-4 py-2 rounded-lg border border-gray-600"
              >
                <option value="">All Projects</option>
                {projects.map(project => (
                  <option key={project.id} value={project.id}>{project.name}</option>
                ))}
              </select>
            </div>
            <div>
              <select
                value={filterSource}
                onChange={(e) => setFilterSource(e.target.value)}
                className="w-full bg-gray-700 text-white px-4 py-2 rounded-lg border border-gray-600"
              >
                <option value="">All Sources</option>
                <option value="ldap">LDAP/AD</option>
                <option value="database">Database</option>
                <option value="file">File</option>
                <option value="web">Web Application</option>
                <option value="smb">SMB Share</option>
                <option value="manual">Manual Entry</option>
              </select>
            </div>
            <div>
              <button
                onClick={() => {
                  setFilterProject('');
                  setFilterSource('');
                  setSearchQuery('');
                }}
                className="w-full bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg"
              >
                Clear Filters
              </button>
            </div>
          </div>
        </div>

        {/* Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-gray-400 text-sm mb-1">Total Users</div>
            <div className="text-3xl font-bold text-white">{discoveredUsers.length}</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-gray-400 text-sm mb-1">Admin/Privileged</div>
            <div className="text-3xl font-bold text-red-500">
              {discoveredUsers.filter(u => ['admin', 'root', 'system'].includes(u.privilege_level)).length}
            </div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-gray-400 text-sm mb-1">With Credentials</div>
            <div className="text-3xl font-bold text-yellow-500">
              {discoveredUsers.filter(u => u.password_plaintext || u.password_hash).length}
            </div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-gray-400 text-sm mb-1">Unique Domains</div>
            <div className="text-3xl font-bold text-blue-500">
              {new Set(discoveredUsers.map(u => u.domain).filter(Boolean)).size}
            </div>
          </div>
        </div>

        {/* Users Table */}
        {loading ? (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
          </div>
        ) : filteredUsers.length > 0 ? (
          <div className="bg-gray-800 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">User</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Domain/System</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Privilege</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Credentials</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Source</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Project</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-700 transition-colors">
                    <td className="px-6 py-4">
                      <div>
                        <div className="text-white font-medium">{user.username}</div>
                        {user.full_name && (
                          <div className="text-gray-400 text-sm">{user.full_name}</div>
                        )}
                        {user.email && (
                          <div className="text-blue-400 text-sm">{user.email}</div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-white">{user.domain || '-'}</div>
                      <div className="text-gray-400 text-xs">{user.account_status}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full text-white ${getPrivilegeBadge(user.privilege_level)}`}>
                        {user.privilege_level}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {user.password_plaintext ? (
                        <div className="text-green-400 text-sm">
                          <i className="fas fa-check-circle mr-1"></i>
                          Plaintext
                        </div>
                      ) : user.password_hash ? (
                        <div className="text-yellow-400 text-sm">
                          <i className="fas fa-key mr-1"></i>
                          Hash
                        </div>
                      ) : (
                        <div className="text-gray-500 text-sm">None</div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-gray-300 text-sm">{user.source}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-blue-400 text-sm">
                        {projects.find(p => p.id === user.project_id)?.name || `Project ${user.project_id}`}
                      </div>
                      {user.target_id && (
                        <div className="text-gray-500 text-xs">
                          Target: {targets.find(t => t.id === user.target_id)?.target_value || user.target_id}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => setSelectedUser(user)}
                        className="text-blue-400 hover:text-blue-300 mr-3"
                      >
                        <i className="fas fa-eye mr-1"></i>
                        Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="bg-gray-800 rounded-lg p-12 text-center">
            <div className="text-gray-500 text-6xl mb-4">
              <i className="fas fa-user-secret"></i>
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">No Discovered Users</h3>
            <p className="text-gray-400 mb-6">
              Start by adding users discovered during your penetration testing
            </p>
            <button
              onClick={() => setShowAddModal(true)}
              className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg"
            >
              <i className="fas fa-plus mr-2"></i>
              Add First User
            </button>
          </div>
        )}
      </div>

      {/* Add User Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-2xl mx-4 my-8">
            <h3 className="text-xl font-semibold text-white mb-4">Add Discovered User</h3>

            <div className="grid grid-cols-2 gap-4 max-h-[70vh] overflow-y-auto pr-2">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-300 mb-2">Project *</label>
                <select
                  value={newUser.project_id}
                  onChange={(e) => setNewUser({...newUser, project_id: e.target.value})}
                  className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                  required
                >
                  <option value="">Select project...</option>
                  {projects.map(project => (
                    <option key={project.id} value={project.id}>{project.name}</option>
                  ))}
                </select>
              </div>

              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-300 mb-2">Target (Optional)</label>
                <select
                  value={newUser.target_id}
                  onChange={(e) => setNewUser({...newUser, target_id: e.target.value})}
                  className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                >
                  <option value="">No specific target</option>
                  {targets
                    .filter(t => t.project_id.toString() === newUser.project_id)
                    .map(target => (
                      <option key={target.id} value={target.id}>
                        {target.target_value}
                      </option>
                    ))
                  }
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Username *</label>
                <input
                  type="text"
                  value={newUser.username}
                  onChange={(e) => setNewUser({...newUser, username: e.target.value})}
                  className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                  placeholder="john.doe"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Full Name</label>
                <input
                  type="text"
                  value={newUser.full_name}
                  onChange={(e) => setNewUser({...newUser, full_name: e.target.value})}
                  className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                  placeholder="John Doe"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Email</label>
                <input
                  type="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser({...newUser, email: e.target.value})}
                  className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                  placeholder="john.doe@company.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Domain/System</label>
                <input
                  type="text"
                  value={newUser.domain}
                  onChange={(e) => setNewUser({...newUser, domain: e.target.value})}
                  className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                  placeholder="CORP.LOCAL or 10.0.0.5"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Password (if found)</label>
                <input
                  type="text"
                  value={newUser.password_plaintext}
                  onChange={(e) => setNewUser({...newUser, password_plaintext: e.target.value})}
                  className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                  placeholder="Leave empty if not found"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Privilege Level</label>
                <select
                  value={newUser.privilege_level}
                  onChange={(e) => setNewUser({...newUser, privilege_level: e.target.value})}
                  className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                  <option value="root">Root</option>
                  <option value="system">System</option>
                  <option value="guest">Guest</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Account Status</label>
                <select
                  value={newUser.account_status}
                  onChange={(e) => setNewUser({...newUser, account_status: e.target.value})}
                  className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                >
                  <option value="active">Active</option>
                  <option value="disabled">Disabled</option>
                  <option value="locked">Locked</option>
                  <option value="expired">Expired</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Source</label>
                <select
                  value={newUser.source}
                  onChange={(e) => setNewUser({...newUser, source: e.target.value})}
                  className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                >
                  <option value="manual">Manual Entry</option>
                  <option value="ldap">LDAP/Active Directory</option>
                  <option value="database">Database</option>
                  <option value="file">Configuration File</option>
                  <option value="web">Web Application</option>
                  <option value="smb">SMB Share</option>
                  <option value="api">API</option>
                </select>
              </div>

              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-300 mb-2">Notes</label>
                <textarea
                  value={newUser.notes}
                  onChange={(e) => setNewUser({...newUser, notes: e.target.value})}
                  className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg"
                  rows="3"
                  placeholder="Additional information about this user..."
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
                onClick={handleAddUser}
                className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg text-white"
              >
                Add User
              </button>
            </div>
          </div>
        </div>
      )}

      {/* User Detail Modal */}
      {selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold text-white">User Details</h3>
              <button 
                onClick={() => setSelectedUser(null)}
                className="text-gray-400 hover:text-white"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-gray-400 text-sm">Username</label>
                  <p className="text-white font-medium">{selectedUser.username}</p>
                </div>
                <div>
                  <label className="text-gray-400 text-sm">Full Name</label>
                  <p className="text-white">{selectedUser.full_name || '-'}</p>
                </div>
                <div>
                  <label className="text-gray-400 text-sm">Email</label>
                  <p className="text-white">{selectedUser.email || '-'}</p>
                </div>
                <div>
                  <label className="text-gray-400 text-sm">Domain/System</label>
                  <p className="text-white">{selectedUser.domain || '-'}</p>
                </div>
                <div>
                  <label className="text-gray-400 text-sm">Privilege Level</label>
                  <p>
                    <span className={`px-2 py-1 text-xs font-medium rounded-full text-white ${getPrivilegeBadge(selectedUser.privilege_level)}`}>
                      {selectedUser.privilege_level}
                    </span>
                  </p>
                </div>
                <div>
                  <label className="text-gray-400 text-sm">Account Status</label>
                  <p className="text-white">{selectedUser.account_status}</p>
                </div>
                <div>
                  <label className="text-gray-400 text-sm">Source</label>
                  <p className="text-white">{selectedUser.source}</p>
                </div>
                <div>
                  <label className="text-gray-400 text-sm">Severity</label>
                  <p>
                    <span className={`px-2 py-1 text-xs font-medium rounded-full text-white ${getSeverityColor(selectedUser.severity)}`}>
                      {selectedUser.severity}
                    </span>
                  </p>
                </div>
              </div>

              {selectedUser.password_plaintext && (
                <div className="bg-yellow-900 bg-opacity-30 border border-yellow-600 rounded-lg p-4">
                  <label className="text-yellow-400 text-sm font-medium flex items-center mb-2">
                    <i className="fas fa-exclamation-triangle mr-2"></i>
                    Password Found (Plaintext)
                  </label>
                  <p className="text-white font-mono bg-gray-900 p-2 rounded">{selectedUser.password_plaintext}</p>
                </div>
              )}

              {selectedUser.password_hash && (
                <div>
                  <label className="text-gray-400 text-sm">Password Hash</label>
                  <p className="text-white font-mono text-xs bg-gray-900 p-2 rounded break-all">{selectedUser.password_hash}</p>
                </div>
              )}

              {selectedUser.notes && (
                <div>
                  <label className="text-gray-400 text-sm">Notes</label>
                  <p className="text-white whitespace-pre-wrap">{selectedUser.notes}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-gray-400 text-sm">Created</label>
                  <p className="text-white text-sm">{new Date(selectedUser.created_at).toLocaleString()}</p>
                </div>
                <div>
                  <label className="text-gray-400 text-sm">Updated</label>
                  <p className="text-white text-sm">{new Date(selectedUser.updated_at).toLocaleString()}</p>
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <button 
                onClick={() => setSelectedUser(null)}
                className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
