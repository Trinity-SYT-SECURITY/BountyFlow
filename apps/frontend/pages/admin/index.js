import { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';

export default function AdminDashboard() {
  const router = useRouter();
  const [stats, setStats] = useState(null);
  const [activities, setActivities] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    // Check if user is admin
    const userStr = localStorage.getItem('user');
    if (userStr) {
      const user = JSON.parse(userStr);
      setCurrentUser(user);
      
      if (!user.is_superuser) {
        // Not an admin, redirect to regular dashboard
        router.push('/dashboard');
        return;
      }
    } else {
      // Not logged in
      router.push('/login');
      return;
    }

    // Load admin data
    loadStats();
    loadActivities();
    loadAlerts();
  }, []);

  const loadStats = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:8002/api/v1/admin/dashboard/stats', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  const loadActivities = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:8002/api/v1/admin/dashboard/activity-feed?limit=10', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setActivities(data.activities || []);
      }
    } catch (error) {
      console.error('Error loading activities:', error);
    }
  };

  const loadAlerts = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:8002/api/v1/admin/dashboard/system-alerts', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setAlerts(data.alerts || []);
      }
    } catch (error) {
      console.error('Error loading alerts:', error);
    }
  };

  const handleLogout = () => {
    localStorage.clear();
    sessionStorage.clear();
    router.push('/login');
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
      'tool_executed': '🔧'
    };
    return iconMap[action] || '📋';
  };

  if (!currentUser || !currentUser.is_superuser) {
    return null; // Will redirect
  }

  return (
    <div className="min-h-screen bg-gray-900">
      <Head>
        <title>Admin Dashboard - BountyFlow</title>
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
              className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium"
            >
              📊 Dashboard
            </Link>
            <Link 
              href="/admin/users"
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors"
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
        {/* Statistics Cards */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {/* Users Card */}
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Total Users</p>
                  <p className="text-3xl font-bold text-white">{stats.users.total}</p>
                  <p className="text-green-400 text-sm mt-1">
                    +{stats.users.new_30d} this month
                  </p>
                </div>
                <div className="text-4xl">👥</div>
              </div>
              <div className="mt-4 pt-4 border-t border-gray-700">
                <p className="text-sm text-gray-400">
                  Active: <span className="text-white">{stats.users.active}</span> | 
                  Inactive: <span className="text-white">{stats.users.inactive}</span>
                </p>
              </div>
            </div>

            {/* Projects Card */}
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Total Projects</p>
                  <p className="text-3xl font-bold text-white">{stats.projects.total}</p>
                  <p className="text-green-400 text-sm mt-1">
                    +{stats.projects.new_30d} this month
                  </p>
                </div>
                <div className="text-4xl">📁</div>
              </div>
              <div className="mt-4 pt-4 border-t border-gray-700">
                <p className="text-sm text-gray-400">
                  Active: <span className="text-white">{stats.projects.active}</span> | 
                  Completed: <span className="text-white">{stats.projects.completed}</span>
                </p>
              </div>
            </div>

            {/* Targets Card */}
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Total Targets</p>
                  <p className="text-3xl font-bold text-white">{stats.targets.total}</p>
                  <p className="text-gray-500 text-sm mt-1">All projects</p>
                </div>
                <div className="text-4xl">🎯</div>
              </div>
            </div>

            {/* Findings Card */}
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Total Findings</p>
                  <p className="text-3xl font-bold text-white">{stats.findings.total}</p>
                  <p className="text-red-400 text-sm mt-1">
                    🔴 {stats.findings.by_severity.critical} Critical
                  </p>
                </div>
                <div className="text-4xl">🔍</div>
              </div>
              <div className="mt-4 pt-4 border-t border-gray-700 text-xs text-gray-400">
                <span className="text-red-400">{stats.findings.by_severity.critical} C</span> | 
                <span className="text-orange-400"> {stats.findings.by_severity.high} H</span> | 
                <span className="text-yellow-400"> {stats.findings.by_severity.medium} M</span> | 
                <span className="text-blue-400"> {stats.findings.by_severity.low} L</span>
              </div>
            </div>
          </div>
        )}

        {/* Alerts Section */}
        {alerts.length > 0 && (
          <div className="bg-gray-800 rounded-lg p-6 border border-yellow-600 mb-8">
            <h2 className="text-xl font-bold text-white mb-4">⚠️ System Alerts ({alerts.length})</h2>
            <div className="space-y-3">
              {alerts.map((alert, index) => (
                <div key={index} className="bg-gray-700 p-4 rounded-lg border-l-4 border-yellow-500">
                  <p className="text-white font-medium">{alert.message}</p>
                  {alert.action && (
                    <p className="text-gray-400 text-sm mt-1">→ {alert.action}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Activity Feed */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-white">🔥 Real-time Activity Feed</h2>
            <button 
              onClick={loadActivities}
              className="text-sm text-purple-400 hover:text-purple-300"
            >
              🔄 Refresh
            </button>
          </div>
          <div className="space-y-3">
            {activities.length === 0 ? (
              <p className="text-gray-400 text-center py-8">No recent activities</p>
            ) : (
              activities.map((activity) => (
                <div key={activity.id} className="bg-gray-700 p-4 rounded-lg flex items-start space-x-3">
                  <div className="text-2xl">{getActionIcon(activity.action)}</div>
                  <div className="flex-1">
                    <p className="text-white">
                      <span className="font-semibold">{activity.user.username}</span>
                      {' '}
                      <span className="text-gray-400">{activity.action.replace(/_/g, ' ')}</span>
                    </p>
                    <p className="text-gray-500 text-sm">{activity.time_ago}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  );
}


