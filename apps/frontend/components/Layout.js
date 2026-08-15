import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';

export default function Layout({ children, title = "BountyFlow" }) {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [backendStatus, setBackendStatus] = useState('checking'); // 'connected', 'disconnected', 'checking'
  const [aiProvider, setAiProvider] = useState('');
  const [availableProviders, setAvailableProviders] = useState([]);

  useEffect(() => {
    // Load user from localStorage
    const userStr = localStorage.getItem('user');
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        setCurrentUser(user);
      } catch (e) {
        console.error('Failed to parse user:', e);
      }
    }

    // Load sidebar state from localStorage
    const savedSidebarState = localStorage.getItem('sidebarCollapsed');
    if (savedSidebarState !== null) {
      setSidebarCollapsed(savedSidebarState === 'true');
    }
  }, []);

  // Load AI provider settings
  useEffect(() => {
    const loadAIProviders = async () => {
      try {
        const [modelsRes, activeRes] = await Promise.all([
          fetch('http://localhost:8002/api/v1/ai/models'),
          fetch('http://localhost:8002/api/v1/ai/active-provider')
        ]);
        if (modelsRes.ok) {
          const data = await modelsRes.json();
          const configured = data.available || [];
          setAvailableProviders(configured);
        }
        if (activeRes.ok) {
          const data = await activeRes.json();
          setAiProvider(data.active || '');
        }
      } catch (e) {
        console.error('Failed to load AI providers:', e);
      }
    };
    loadAIProviders();
  }, []);

  const handleProviderChange = async (provider) => {
    try {
      const res = await fetch(`http://localhost:8002/api/v1/ai/active-provider?provider=${encodeURIComponent(provider)}`, {
        method: 'POST'
      });
      if (res.ok) {
        const data = await res.json();
        const newProvider = data.active || provider;
        setAiProvider(newProvider);
        // Notify AI chatbot and other components about the global provider change
        window.dispatchEvent(new CustomEvent('aiProviderChanged', { detail: { provider: newProvider } }));
      }
    } catch (e) {
      console.error('Failed to set AI provider:', e);
    }
  };

  const providerLabels = {
    gemini: 'Gemini',
    openai: 'GPT-4',
    anthropic: 'Claude',
  };

  // Check backend connection status
  useEffect(() => {
    const checkBackendStatus = async () => {
      try {
        // Create AbortController for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout
        
        const response = await fetch('http://localhost:8002/health', {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
          setBackendStatus('connected');
        } else {
          setBackendStatus('disconnected');
        }
      } catch (error) {
        setBackendStatus('disconnected');
      }
    };

    // Check immediately
    checkBackendStatus();

    // Check every 10 seconds
    const interval = setInterval(checkBackendStatus, 10000);

    return () => clearInterval(interval);
  }, []);

  const toggleSidebar = () => {
    const newState = !sidebarCollapsed;
    setSidebarCollapsed(newState);
    localStorage.setItem('sidebarCollapsed', newState.toString());
  };

  const handleLogout = () => {
    localStorage.clear();
    sessionStorage.clear();
    router.push('/login');
  };

  const isActive = (path) => {
    return router.pathname === path || router.pathname.startsWith(path + '/');
  };

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-gray-800 border-b border-gray-700 shadow-lg">
        <div className="flex justify-between items-center h-14 px-4">
          <div className="flex items-center space-x-3">
            <button
              onClick={toggleSidebar}
              className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
              title={sidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
            >
              <i className={`fas ${sidebarCollapsed ? 'fa-bars' : 'fa-chevron-left'} text-sm`}></i>
            </button>
            <Link href="/dashboard" className="text-lg font-bold text-white hover:text-blue-400 transition-colors">
              BountyFlow
            </Link>
            <span className="px-2 py-0.5 bg-green-600/80 text-white text-xs font-medium rounded-full">
              Pro
            </span>
            <div className="flex items-center space-x-1.5 ml-2">
              <div className={`h-2 w-2 rounded-full ${
                backendStatus === 'connected' ? 'bg-green-500' :
                backendStatus === 'disconnected' ? 'bg-red-500' :
                'bg-yellow-500 animate-pulse'
              }`}></div>
              <span className="text-xs text-gray-500">
                {backendStatus === 'connected' ? 'Connected' :
                 backendStatus === 'disconnected' ? 'Disconnected' :
                 'Checking...'}
              </span>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            {/* AI Provider Selector */}
            {availableProviders.length > 0 && (
              <div className="flex items-center space-x-1.5">
                <span className="text-xs text-gray-500">AI:</span>
                <select
                  value={aiProvider}
                  onChange={(e) => handleProviderChange(e.target.value)}
                  className="bg-gray-700 text-gray-200 text-xs px-2 py-1 rounded border border-gray-600 focus:border-blue-500 focus:outline-none cursor-pointer"
                >
                  {availableProviders.map(p => (
                    <option key={p} value={p}>{providerLabels[p] || p}</option>
                  ))}
                </select>
              </div>
            )}
            <span className="text-sm text-gray-400">
              {currentUser?.username || 'User'}
            </span>
            {currentUser?.is_superuser && (
              <Link
                href="/admin"
                className="px-3 py-1.5 bg-purple-600/80 hover:bg-purple-600 text-white text-xs font-medium rounded-lg transition-colors"
              >
                Admin
              </Link>
            )}
            <button
              onClick={handleLogout}
              className="px-3 py-1.5 bg-gray-700 hover:bg-red-600 text-gray-300 hover:text-white text-xs font-medium rounded-lg transition-colors"
              title="Logout"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="flex" style={{ height: 'calc(100vh - 3.5rem)' }}>
        {/* Sidebar Navigation */}
        <nav
          className={`bg-gray-800 border-r border-gray-700 overflow-y-auto transition-all duration-300 ease-in-out ${
            sidebarCollapsed ? 'w-14' : 'w-56'
          }`}
        >
          <div className={`py-3 ${sidebarCollapsed ? 'px-2' : 'px-3'}`}>
            <div className="space-y-2">
              {/* Penetration Testing Section */}
              {!sidebarCollapsed && (
                <div className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2 mt-2">
                  Penetration Testing
                </div>
              )}
              
              <Link 
                href="/dashboard" 
                className={`flex items-center ${sidebarCollapsed ? 'justify-center px-2' : 'px-3'} py-2 rounded-lg transition-colors ${
                  isActive('/dashboard') 
                    ? 'text-white bg-blue-600' 
                    : 'text-gray-300 hover:text-white hover:bg-gray-700'
                }`}
                title={sidebarCollapsed ? "Dashboard" : ""}
              >
                <i className={`fas fa-tachometer-alt ${sidebarCollapsed ? '' : 'mr-3'} w-4`}></i>
                {!sidebarCollapsed && <span>Dashboard</span>}
              </Link>

              <Link 
                href="/projects" 
                className={`flex items-center ${sidebarCollapsed ? 'justify-center px-2' : 'px-3'} py-2 rounded-lg transition-colors ${
                  isActive('/projects') 
                    ? 'text-white bg-blue-600' 
                    : 'text-gray-300 hover:text-white hover:bg-gray-700'
                }`}
                title={sidebarCollapsed ? "Projects" : ""}
              >
                <i className={`fas fa-project-diagram ${sidebarCollapsed ? '' : 'mr-3'} w-4`}></i>
                {!sidebarCollapsed && <span>Projects</span>}
              </Link>

              <Link 
                href="/targets" 
                className={`flex items-center ${sidebarCollapsed ? 'justify-center px-2' : 'px-3'} py-2 rounded-lg transition-colors ${
                  isActive('/targets') 
                    ? 'text-white bg-blue-600' 
                    : 'text-gray-300 hover:text-white hover:bg-gray-700'
                }`}
                title={sidebarCollapsed ? "Targets" : ""}
              >
                <i className={`fas fa-server ${sidebarCollapsed ? '' : 'mr-3'} w-4`}></i>
                {!sidebarCollapsed && <span>Targets</span>}
              </Link>

              <Link 
                href="/discovered-users" 
                className={`flex items-center ${sidebarCollapsed ? 'justify-center px-2' : 'px-3'} py-2 rounded-lg transition-colors ${
                  isActive('/discovered-users') || isActive('/users')
                    ? 'text-white bg-blue-600' 
                    : 'text-gray-300 hover:text-white hover:bg-gray-700'
                }`}
                title={sidebarCollapsed ? "Discovered Users" : ""}
              >
                <i className={`fas fa-users ${sidebarCollapsed ? '' : 'mr-3'} w-4`}></i>
                {!sidebarCollapsed && <span>Discovered Users</span>}
              </Link>

              <Link 
                href="/files" 
                className={`flex items-center ${sidebarCollapsed ? 'justify-center px-2' : 'px-3'} py-2 rounded-lg transition-colors ${
                  isActive('/files') 
                    ? 'text-white bg-blue-600' 
                    : 'text-gray-300 hover:text-white hover:bg-gray-700'
                }`}
                title={sidebarCollapsed ? "Files" : ""}
              >
                <i className={`fas fa-folder ${sidebarCollapsed ? '' : 'mr-3'} w-4`}></i>
                {!sidebarCollapsed && <span>Files</span>}
              </Link>

              {/* Attack & Analysis Section */}
              {!sidebarCollapsed && (
                <div className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2 mt-6">
                  Attack & Analysis
                </div>
              )}

              <Link 
                href="/vectors" 
                className={`flex items-center ${sidebarCollapsed ? 'justify-center px-2' : 'px-3'} py-2 rounded-lg transition-colors ${
                  isActive('/vectors') 
                    ? 'text-white bg-blue-600' 
                    : 'text-gray-300 hover:text-white hover:bg-gray-700'
                }`}
                title={sidebarCollapsed ? "Attack Vectors" : ""}
              >
                <i className={`fas fa-bullseye ${sidebarCollapsed ? '' : 'mr-3'} w-4`}></i>
                {!sidebarCollapsed && <span>Attack Vectors</span>}
              </Link>

              <Link 
                href="/tools" 
                className={`flex items-center ${sidebarCollapsed ? 'justify-center px-2' : 'px-3'} py-2 rounded-lg transition-colors ${
                  isActive('/tools') 
                    ? 'text-white bg-blue-600' 
                    : 'text-gray-300 hover:text-white hover:bg-gray-700'
                }`}
                title={sidebarCollapsed ? "Tools" : ""}
              >
                <i className={`fas fa-tools ${sidebarCollapsed ? '' : 'mr-3'} w-4`}></i>
                {!sidebarCollapsed && <span>Tools</span>}
              </Link>

              <Link 
                href="/workflows" 
                className={`flex items-center ${sidebarCollapsed ? 'justify-center px-2' : 'px-3'} py-2 rounded-lg transition-colors ${
                  isActive('/workflows') 
                    ? 'text-white bg-blue-600' 
                    : 'text-gray-300 hover:text-white hover:bg-gray-700'
                }`}
                title={sidebarCollapsed ? "Workflows" : ""}
              >
                <i className={`fas fa-sitemap ${sidebarCollapsed ? '' : 'mr-3'} w-4`}></i>
                {!sidebarCollapsed && <span>Workflows</span>}
              </Link>

              <Link 
                href="/knowledge-graph" 
                className={`flex items-center ${sidebarCollapsed ? 'justify-center px-2' : 'px-3'} py-2 rounded-lg transition-colors ${
                  isActive('/knowledge-graph') 
                    ? 'text-white bg-blue-600' 
                    : 'text-gray-300 hover:text-white hover:bg-gray-700'
                }`}
                title={sidebarCollapsed ? "Security Relationship Map" : ""}
              >
                <i className={`fas fa-project-diagram ${sidebarCollapsed ? '' : 'mr-3'} w-4`}></i>
                {!sidebarCollapsed && <span>Security Relationship Map</span>}
              </Link>

              {/* AI & Intelligence Section */}
              {!sidebarCollapsed && (
                <div className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2 mt-6">
                  AI & Intelligence
                </div>
              )}

              <Link 
                href="/recommendations" 
                className={`flex items-center ${sidebarCollapsed ? 'justify-center px-2' : 'px-3'} py-2 rounded-lg transition-colors ${
                  isActive('/recommendations') 
                    ? 'text-white bg-blue-600' 
                    : 'text-gray-300 hover:text-white hover:bg-gray-700'
                }`}
                title={sidebarCollapsed ? "AI Recommendations" : ""}
              >
                <i className={`fas fa-brain ${sidebarCollapsed ? '' : 'mr-3'} w-4`}></i>
                {!sidebarCollapsed && <span>AI Recommendations</span>}
              </Link>

              <Link 
                href="/scope" 
                className={`flex items-center ${sidebarCollapsed ? 'justify-center px-2' : 'px-3'} py-2 rounded-lg transition-colors ${
                  isActive('/scope') 
                    ? 'text-white bg-blue-600' 
                    : 'text-gray-300 hover:text-white hover:bg-gray-700'
                }`}
                title={sidebarCollapsed ? "Scope Management" : ""}
              >
                <i className={`fas fa-shield-alt ${sidebarCollapsed ? '' : 'mr-3'} w-4`}></i>
                {!sidebarCollapsed && <span>Scope Management</span>}
              </Link>

              {/* Reports & Export Section */}
              {!sidebarCollapsed && (
                <div className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2 mt-6">
                  Reports & Export
                </div>
              )}

              <Link 
                href="/reports" 
                className={`flex items-center ${sidebarCollapsed ? 'justify-center px-2' : 'px-3'} py-2 rounded-lg transition-colors ${
                  isActive('/reports') 
                    ? 'text-white bg-blue-600' 
                    : 'text-gray-300 hover:text-white hover:bg-gray-700'
                }`}
                title={sidebarCollapsed ? "Reports" : ""}
              >
                <i className={`fas fa-file-alt ${sidebarCollapsed ? '' : 'mr-3'} w-4`}></i>
                {!sidebarCollapsed && <span>Reports</span>}
              </Link>

              <Link 
                href="/export" 
                className={`flex items-center ${sidebarCollapsed ? 'justify-center px-2' : 'px-3'} py-2 rounded-lg transition-colors ${
                  isActive('/export') 
                    ? 'text-white bg-blue-600' 
                    : 'text-gray-300 hover:text-white hover:bg-gray-700'
                }`}
                title={sidebarCollapsed ? "Export Data" : ""}
              >
                <i className={`fas fa-download ${sidebarCollapsed ? '' : 'mr-3'} w-4`}></i>
                {!sidebarCollapsed && <span>Export Data</span>}
              </Link>
            </div>
          </div>
        </nav>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

