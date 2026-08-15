import { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useToast } from '../../components/Toast';
import { useModal } from '../../components/Modal';

export default function AdminUsers() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterRole, setFilterRole] = useState('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [newUser, setNewUser] = useState({
    username: '',
    email: '',
    password: '',
    full_name: '',
    is_superuser: false,
    is_active: true
  });
  const toast = useToast();
  const { confirm, prompt } = useModal();

  useEffect(() => {
    // Check if user is admin
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

    loadUsers();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [users, searchTerm, filterStatus, filterRole]);

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

  const applyFilters = () => {
    let filtered = [...users];

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(u => 
        u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.email.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Status filter
    if (filterStatus !== 'all') {
      filtered = filtered.filter(u => u.is_active === (filterStatus === 'active'));
    }

    // Role filter
    if (filterRole !== 'all') {
      filtered = filtered.filter(u => u.is_superuser === (filterRole === 'admin'));
    }

    setFilteredUsers(filtered);
  };

  const handleCreateUser = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:8002/api/v1/admin/users', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(newUser)
      });

      if (response.ok) {
        toast.success('User created successfully!');
        setShowCreateModal(false);
        setNewUser({
          username: '',
          email: '',
          password: '',
          full_name: '',
          is_superuser: false,
          is_active: true
        });
        loadUsers();
      } else {
        const error = await response.json();
        toast.error(`Error: ${error.detail}`);
      }
    } catch (error) {
      console.error('Error creating user:', error);
      toast.error('Error creating user');
    }
  };

  const handleUpdateUser = async () => {
    if (!selectedUser) return;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`http://localhost:8002/api/v1/admin/users/${selectedUser.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: selectedUser.email,
          full_name: selectedUser.full_name,
          is_superuser: selectedUser.is_superuser,
          is_active: selectedUser.is_active
        })
      });

      if (response.ok) {
        toast.success('User updated successfully!');
        setShowEditModal(false);
        setSelectedUser(null);
        loadUsers();
      } else {
        const error = await response.json();
        toast.error(`Error: ${error.detail}`);
      }
    } catch (error) {
      console.error('Error updating user:', error);
      toast.error('Error updating user');
    }
  };

  const handleResetPassword = async (userId) => {
    const newPassword = await prompt({
      title: 'Reset Password',
      message: 'Enter new password for user:',
      placeholder: 'New password',
      inputType: 'password',
      confirmText: 'Reset Password'
    });
    if (!newPassword) return;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`http://localhost:8002/api/v1/admin/users/${userId}/reset-password`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ new_password: newPassword })
      });

      if (response.ok) {
        toast.success('Password reset successfully!');
      } else {
        toast.error('Error resetting password');
      }
    } catch (error) {
      console.error('Error resetting password:', error);
      toast.error('Error resetting password');
    }
  };

  const handleDeleteUser = async (userId, username) => {
    const firstConfirm = await confirm({
      title: 'Delete User',
      message: `Are you sure you want to delete user "${username}"? This action cannot be undone.`,
      confirmText: 'Delete User',
      variant: 'danger'
    });
    if (!firstConfirm) return;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`http://localhost:8002/api/v1/admin/users/${userId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        toast.success('User deleted successfully!');
        loadUsers();
      } else {
        const error = await response.json();
        toast.error(`Error: ${error.detail}`);
      }
    } catch (error) {
      console.error('Error deleting user:', error);
      toast.error('Error deleting user');
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
        <title>User Management - Admin - BountyFlow</title>
      </Head>

      {/* Admin Header */}
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

          {/* Admin Navigation */}
          <nav className="flex space-x-1 pb-4">
            <Link 
              href="/admin"
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors"
            >
              📊 Dashboard
            </Link>
            <Link 
              href="/admin/users"
              className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium"
            >
              👥 Users
            </Link>
            <Link 
              href="/admin/projects"
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors"
            >
              📁 Projects
            </Link>
            <Link 
              href="/admin/audit-logs"
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors"
            >
              📜 Audit Logs
            </Link>
            <Link 
              href="/admin/settings"
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors"
            >
              ⚙️ Settings
            </Link>
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-bold text-white">User Management</h2>
            <p className="text-gray-400">Manage all platform users</p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg font-medium"
          >
            + Create User
          </button>
        </div>

        {/* Filters */}
        <div className="bg-gray-800 rounded-lg p-4 mb-6 border border-gray-700">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <input
              type="text"
              placeholder="Search username or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-gray-700 text-white px-4 py-2 rounded-lg border border-gray-600 focus:outline-none focus:border-purple-500"
            />
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="bg-gray-700 text-white px-4 py-2 rounded-lg border border-gray-600 focus:outline-none focus:border-purple-500"
            >
              <option value="all">All Status</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
            </select>
            <select
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
              className="bg-gray-700 text-white px-4 py-2 rounded-lg border border-gray-600 focus:outline-none focus:border-purple-500"
            >
              <option value="all">All Roles</option>
              <option value="admin">Admins Only</option>
              <option value="user">Users Only</option>
            </select>
            <button
              onClick={() => {
                setSearchTerm('');
                setFilterStatus('all');
                setFilterRole('all');
              }}
              className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg"
            >
              Reset Filters
            </button>
          </div>
        </div>

        {/* Users Table */}
        <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">User</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Role</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Projects</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Last Activity</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-6 py-8 text-center text-gray-400">
                    No users found
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-700">
                    <td className="px-6 py-4">
                      <div>
                        <div className="text-white font-medium">{user.username}</div>
                        <div className="text-gray-400 text-sm">{user.email}</div>
                        {user.full_name && (
                          <div className="text-gray-500 text-xs">{user.full_name}</div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {user.is_superuser ? (
                        <span className="px-2 py-1 bg-purple-600 text-white text-xs rounded-full">Admin</span>
                      ) : (
                        <span className="px-2 py-1 bg-gray-600 text-white text-xs rounded-full">User</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {user.is_active ? (
                        <span className="px-2 py-1 bg-green-600 text-white text-xs rounded-full">Active</span>
                      ) : (
                        <span className="px-2 py-1 bg-red-600 text-white text-xs rounded-full">Inactive</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-white">{user.project_count}</td>
                    <td className="px-6 py-4 text-gray-400 text-sm">
                      {user.last_activity ? new Date(user.last_activity).toLocaleDateString() : 'Never'}
                    </td>
                    <td className="px-6 py-4 text-right space-x-2">
                      <button
                        onClick={() => {
                          setSelectedUser(user);
                          setShowEditModal(true);
                        }}
                        className="text-blue-400 hover:text-blue-300 text-sm"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleResetPassword(user.id)}
                        className="text-yellow-400 hover:text-yellow-300 text-sm"
                      >
                        Reset Pwd
                      </button>
                      {user.id !== currentUser.id && (
                        <button
                          onClick={() => handleDeleteUser(user.id, user.username)}
                          className="text-red-400 hover:text-red-300 text-sm"
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 text-gray-400 text-sm">
          Showing {filteredUsers.length} of {users.length} users
        </div>
      </main>

      {/* Create User Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-8 max-w-md w-full border border-gray-700">
            <h3 className="text-2xl font-bold text-white mb-6">Create New User</h3>
            <div className="space-y-4">
              <input
                type="text"
                placeholder="Username *"
                value={newUser.username}
                onChange={(e) => setNewUser({...newUser, username: e.target.value})}
                className="w-full bg-gray-700 text-white px-4 py-2 rounded-lg border border-gray-600"
              />
              <input
                type="email"
                placeholder="Email *"
                value={newUser.email}
                onChange={(e) => setNewUser({...newUser, email: e.target.value})}
                className="w-full bg-gray-700 text-white px-4 py-2 rounded-lg border border-gray-600"
              />
              <input
                type="password"
                placeholder="Password *"
                value={newUser.password}
                onChange={(e) => setNewUser({...newUser, password: e.target.value})}
                className="w-full bg-gray-700 text-white px-4 py-2 rounded-lg border border-gray-600"
              />
              <input
                type="text"
                placeholder="Full Name (optional)"
                value={newUser.full_name}
                onChange={(e) => setNewUser({...newUser, full_name: e.target.value})}
                className="w-full bg-gray-700 text-white px-4 py-2 rounded-lg border border-gray-600"
              />
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="is_superuser"
                  checked={newUser.is_superuser}
                  onChange={(e) => setNewUser({...newUser, is_superuser: e.target.checked})}
                  className="w-4 h-4"
                />
                <label htmlFor="is_superuser" className="text-white">Is Admin (Superuser)</label>
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={newUser.is_active}
                  onChange={(e) => setNewUser({...newUser, is_active: e.target.checked})}
                  className="w-4 h-4"
                />
                <label htmlFor="is_active" className="text-white">Is Active</label>
              </div>
            </div>
            <div className="flex justify-end space-x-4 mt-6">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateUser}
                className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg"
              >
                Create User
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {showEditModal && selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-8 max-w-md w-full border border-gray-700">
            <h3 className="text-2xl font-bold text-white mb-6">Edit User: {selectedUser.username}</h3>
            <div className="space-y-4">
              <input
                type="email"
                placeholder="Email"
                value={selectedUser.email}
                onChange={(e) => setSelectedUser({...selectedUser, email: e.target.value})}
                className="w-full bg-gray-700 text-white px-4 py-2 rounded-lg border border-gray-600"
              />
              <input
                type="text"
                placeholder="Full Name"
                value={selectedUser.full_name || ''}
                onChange={(e) => setSelectedUser({...selectedUser, full_name: e.target.value})}
                className="w-full bg-gray-700 text-white px-4 py-2 rounded-lg border border-gray-600"
              />
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="edit_is_superuser"
                  checked={selectedUser.is_superuser}
                  onChange={(e) => setSelectedUser({...selectedUser, is_superuser: e.target.checked})}
                  className="w-4 h-4"
                />
                <label htmlFor="edit_is_superuser" className="text-white">Is Admin (Superuser)</label>
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="edit_is_active"
                  checked={selectedUser.is_active}
                  onChange={(e) => setSelectedUser({...selectedUser, is_active: e.target.checked})}
                  className="w-4 h-4"
                />
                <label htmlFor="edit_is_active" className="text-white">Is Active</label>
              </div>
            </div>
            <div className="flex justify-end space-x-4 mt-6">
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setSelectedUser(null);
                }}
                className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateUser}
                className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

