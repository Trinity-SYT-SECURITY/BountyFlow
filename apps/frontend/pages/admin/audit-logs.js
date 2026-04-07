import { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';

export default function AdminAuditLogs() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState(null);
  const [logs, setLogs] = useState([]);
  const [statistics, setStatistics] = useState(null);
  const [days, setDays] = useState(7);

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

    loadLogs();
    loadStatistics();
  }, [days]);

  const loadLogs = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`http://localhost:8002/api/v1/admin/audit-logs?days=${days}&limit=100`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setLogs(data.logs || []);
      }
    } catch (error) {
      console.error('Error loading logs:', error);
    }
  };

  const loadStatistics = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`http://localhost:8002/api/v1/admin/audit-logs/statistics?days=${days}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setStatistics(data);
      }
    } catch (error) {
      console.error('Error loading statistics:', error);
    }
  };

  const getActionIcon = (action) => {
    const iconMap = {
      'login': '🔓',
      'login_failed': '❌',
      'project_created': '📁',
      'project_updated': '📝',
      'user_created': '👤',
      'user_updated': '✏️',
      'user_deleted': '🗑️',
      'finding_submitted': '🔍',
      'tool_executed': '🔧',
      'password_reset': '🔑',
      'project_ownership_transferred': '🔄'
    };
    return iconMap[action] || '📋';
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
        <title>Audit Logs - Admin - BountyFlow</title>
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
            <Link href="/admin/projects" className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors">
              📁 Projects
            </Link>
            <Link href="/admin/audit-logs" className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium">
              📜 Audit Logs
            </Link>
            <Link href="/admin/settings" className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors">
              ⚙️ Settings
            </Link>
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-bold text-white">Audit Logs</h2>
            <p className="text-gray-400">Track all user activities and system events</p>
          </div>
          <select
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value))}
            className="bg-gray-800 text-white px-4 py-2 rounded-lg border border-gray-700"
          >
            <option value={1}>Last 24 hours</option>
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </div>

        {/* Statistics */}
        {statistics && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <p className="text-gray-400 text-sm">Total Actions</p>
              <p className="text-3xl font-bold text-white">{statistics.total_actions}</p>
              <p className="text-gray-500 text-sm mt-1">Last {statistics.period_days} days</p>
            </div>
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <p className="text-gray-400 text-sm">Failed Logins</p>
              <p className="text-3xl font-bold text-red-400">{statistics.failed_logins}</p>
              <p className="text-gray-500 text-sm mt-1">{statistics.failed_logins > 10 ? '⚠️ High alert' : 'Normal'}</p>
            </div>
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <p className="text-gray-400 text-sm">Most Active User</p>
              <p className="text-xl font-bold text-white">
                {statistics.most_active_users[0]?.username || 'N/A'}
              </p>
              <p className="text-gray-500 text-sm mt-1">
                {statistics.most_active_users[0]?.action_count || 0} actions
              </p>
            </div>
          </div>
        )}

        {/* Logs Table */}
        <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Time</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">User</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Action</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Entity</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-6 py-8 text-center text-gray-400">No logs found</td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-700">
                    <td className="px-6 py-4 text-gray-400 text-sm whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-white">{log.user.username}</td>
                    <td className="px-6 py-4">
                      <span className="flex items-center space-x-2">
                        <span>{getActionIcon(log.action)}</span>
                        <span className="text-white">{log.action.replace(/_/g, ' ')}</span>
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-400">{log.entity_type || 'N/A'}</td>
                    <td className="px-6 py-4 text-gray-400 text-sm">
                      {log.details && Object.keys(log.details).length > 0
                        ? JSON.stringify(log.details).substring(0, 50) + '...'
                        : 'No details'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 text-gray-400 text-sm">
          Showing {logs.length} log entries
        </div>
      </main>
    </div>
  );
}


