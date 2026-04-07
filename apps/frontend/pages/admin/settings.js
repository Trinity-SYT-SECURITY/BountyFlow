import { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useToast } from '../../components/Toast';

export default function AdminSettings() {
  const router = useRouter();
  const toast = useToast();
  const [currentUser, setCurrentUser] = useState(null);
  const [activeTab, setActiveTab] = useState('security');
  const [securitySettings, setSecuritySettings] = useState(null);
  const [systemSettings, setSystemSettings] = useState(null);

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

    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const token = localStorage.getItem('token');
      
      // Load security settings
      const securityResponse = await fetch('http://localhost:8002/api/v1/admin/settings/security', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (securityResponse.ok) {
        const data = await securityResponse.json();
        setSecuritySettings(data);
      }

      // Load system settings
      const systemResponse = await fetch('http://localhost:8002/api/v1/admin/settings/system', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (systemResponse.ok) {
        const data = await systemResponse.json();
        setSystemSettings(data);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  };

  const handleSaveSecuritySettings = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:8002/api/v1/admin/settings/security', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(securitySettings)
      });

      if (response.ok) {
        toast.success('Security settings saved successfully!');
      } else {
        toast.error('Error saving security settings');
      }
    } catch (error) {
      console.error('Error saving security settings:', error);
      toast.error('Error saving security settings');
    }
  };

  const handleSaveSystemSettings = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:8002/api/v1/admin/settings/system', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(systemSettings)
      });

      if (response.ok) {
        toast.success('System settings saved successfully!');
      } else {
        toast.error('Error saving system settings');
      }
    } catch (error) {
      console.error('Error saving system settings:', error);
      toast.error('Error saving system settings');
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
        <title>Settings - Admin - BountyFlow</title>
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
            <Link href="/admin/audit-logs" className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors">
              📜 Audit Logs
            </Link>
            <Link href="/admin/settings" className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium">
              ⚙️ Settings
            </Link>
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-white">System Settings</h2>
          <p className="text-gray-400">Configure platform-wide settings</p>
        </div>

        {/* Tabs */}
        <div className="flex space-x-2 mb-6">
          <button
            onClick={() => setActiveTab('security')}
            className={`px-6 py-3 rounded-lg font-medium ${
              activeTab === 'security'
                ? 'bg-purple-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            🔐 Security
          </button>
          <button
            onClick={() => setActiveTab('system')}
            className={`px-6 py-3 rounded-lg font-medium ${
              activeTab === 'system'
                ? 'bg-purple-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            ⚙️ System
          </button>
        </div>

        {/* Security Settings */}
        {activeTab === 'security' && securitySettings && (
          <div className="bg-gray-800 rounded-lg p-8 border border-gray-700">
            <h3 className="text-xl font-bold text-white mb-6">Security Settings</h3>
            
            <div className="space-y-6">
              <div>
                <h4 className="text-lg font-semibold text-white mb-4">Password Policy</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-gray-400 text-sm mb-2">Minimum Length</label>
                    <input
                      type="number"
                      value={securitySettings.password_min_length}
                      onChange={(e) => setSecuritySettings({
                        ...securitySettings,
                        password_min_length: parseInt(e.target.value)
                      })}
                      className="w-full bg-gray-700 text-white px-4 py-2 rounded-lg border border-gray-600"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="flex items-center space-x-2 text-gray-400">
                      <input
                        type="checkbox"
                        checked={securitySettings.password_require_uppercase}
                        onChange={(e) => setSecuritySettings({
                          ...securitySettings,
                          password_require_uppercase: e.target.checked
                        })}
                        className="w-4 h-4"
                      />
                      <span>Require Uppercase</span>
                    </label>
                    <label className="flex items-center space-x-2 text-gray-400">
                      <input
                        type="checkbox"
                        checked={securitySettings.password_require_numbers}
                        onChange={(e) => setSecuritySettings({
                          ...securitySettings,
                          password_require_numbers: e.target.checked
                        })}
                        className="w-4 h-4"
                      />
                      <span>Require Numbers</span>
                    </label>
                    <label className="flex items-center space-x-2 text-gray-400">
                      <input
                        type="checkbox"
                        checked={securitySettings.password_require_symbols}
                        onChange={(e) => setSecuritySettings({
                          ...securitySettings,
                          password_require_symbols: e.target.checked
                        })}
                        className="w-4 h-4"
                      />
                      <span>Require Symbols</span>
                    </label>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-lg font-semibold text-white mb-4">Session Management</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-gray-400 text-sm mb-2">Session Timeout (minutes)</label>
                    <input
                      type="number"
                      value={securitySettings.session_timeout_minutes}
                      onChange={(e) => setSecuritySettings({
                        ...securitySettings,
                        session_timeout_minutes: parseInt(e.target.value)
                      })}
                      className="w-full bg-gray-700 text-white px-4 py-2 rounded-lg border border-gray-600"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-400 text-sm mb-2">Max Concurrent Sessions</label>
                    <input
                      type="number"
                      value={securitySettings.max_concurrent_sessions}
                      onChange={(e) => setSecuritySettings({
                        ...securitySettings,
                        max_concurrent_sessions: parseInt(e.target.value)
                      })}
                      className="w-full bg-gray-700 text-white px-4 py-2 rounded-lg border border-gray-600"
                    />
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-lg font-semibold text-white mb-4">Login Security</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-gray-400 text-sm mb-2">Max Failed Login Attempts</label>
                    <input
                      type="number"
                      value={securitySettings.max_failed_login_attempts}
                      onChange={(e) => setSecuritySettings({
                        ...securitySettings,
                        max_failed_login_attempts: parseInt(e.target.value)
                      })}
                      className="w-full bg-gray-700 text-white px-4 py-2 rounded-lg border border-gray-600"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-400 text-sm mb-2">Lockout Duration (minutes)</label>
                    <input
                      type="number"
                      value={securitySettings.lockout_duration_minutes}
                      onChange={(e) => setSecuritySettings({
                        ...securitySettings,
                        lockout_duration_minutes: parseInt(e.target.value)
                      })}
                      className="w-full bg-gray-700 text-white px-4 py-2 rounded-lg border border-gray-600"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-4 mt-8">
              <button
                onClick={loadSettings}
                className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
              >
                Reset
              </button>
              <button
                onClick={handleSaveSecuritySettings}
                className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg"
              >
                Save Security Settings
              </button>
            </div>
          </div>
        )}

        {/* System Settings */}
        {activeTab === 'system' && systemSettings && (
          <div className="bg-gray-800 rounded-lg p-8 border border-gray-700">
            <h3 className="text-xl font-bold text-white mb-6">System Settings</h3>
            
            <div className="space-y-6">
              <div>
                <label className="block text-gray-400 text-sm mb-2">Platform Name</label>
                <input
                  type="text"
                  value={systemSettings.platform_name}
                  onChange={(e) => setSystemSettings({
                    ...systemSettings,
                    platform_name: e.target.value
                  })}
                  className="w-full bg-gray-700 text-white px-4 py-2 rounded-lg border border-gray-600"
                />
              </div>
              <div>
                <label className="block text-gray-400 text-sm mb-2">Timezone</label>
                <select
                  value={systemSettings.timezone}
                  onChange={(e) => setSystemSettings({
                    ...systemSettings,
                    timezone: e.target.value
                  })}
                  className="w-full bg-gray-700 text-white px-4 py-2 rounded-lg border border-gray-600"
                >
                  <option value="UTC">UTC</option>
                  <option value="America/New_York">America/New_York</option>
                  <option value="Europe/London">Europe/London</option>
                  <option value="Asia/Tokyo">Asia/Tokyo</option>
                  <option value="Asia/Shanghai">Asia/Shanghai</option>
                </select>
              </div>
              <div>
                <label className="block text-gray-400 text-sm mb-2">Default Language</label>
                <select
                  value={systemSettings.default_language}
                  onChange={(e) => setSystemSettings({
                    ...systemSettings,
                    default_language: e.target.value
                  })}
                  className="w-full bg-gray-700 text-white px-4 py-2 rounded-lg border border-gray-600"
                >
                  <option value="en">English</option>
                  <option value="zh">Chinese</option>
                  <option value="ja">Japanese</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end space-x-4 mt-8">
              <button
                onClick={loadSettings}
                className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
              >
                Reset
              </button>
              <button
                onClick={handleSaveSystemSettings}
                className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg"
              >
                Save System Settings
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}


