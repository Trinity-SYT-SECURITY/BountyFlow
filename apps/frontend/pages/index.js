import { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';

export default function Home() {
  const [systemStatus, setSystemStatus] = useState({
    backend: false,
    database: false,
    neo4j: false,
    redis: false
  });

  useEffect(() => {
    checkSystemStatus();
  }, []);

  const checkSystemStatus = async () => {
    try {
      const response = await fetch('http://localhost:8002/health');
      if (response.ok) {
        setSystemStatus(prev => ({ ...prev, backend: true }));
      }
    } catch (error) {
      console.error('Backend health check failed:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900">
      <Head>
        <title>BountyFlow - Professional Penetration Testing Platform</title>
        <meta name="description" content="Professional penetration testing and bug bounty management platform" />
        <link rel="icon" href="/favicon.ico" />
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" />
      </Head>

      {/* Header */}
      <header className="bg-gray-800 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-white">BountyFlow</h1>
              <span className="ml-3 px-3 py-1 bg-green-600 text-white text-sm rounded-full">
                Professional Edition
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          {/* Hero Section */}
          <div className="text-center mb-12">
            <h2 className="text-5xl font-bold text-white mb-4">
              Professional Penetration Testing Platform
            </h2>
            <p className="text-xl text-gray-300 mb-8 max-w-3xl mx-auto">
              Streamline your penetration testing workflow with AI-powered recommendations, 
              knowledge graph visualization, automated tool execution, and comprehensive reporting.
            </p>
            <div className="flex justify-center space-x-4">
              <Link href="/login" className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg text-lg">
                <i className="fas fa-sign-in-alt mr-2"></i>
                Sign In to Access Platform
              </Link>
              <Link href="/register" className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-8 py-3 rounded-lg text-lg">
                <i className="fas fa-user-plus mr-2"></i>
                Get Started
              </Link>
            </div>
          </div>

          {/* Features Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-12">
            <div className="bg-gray-800 rounded-lg p-6">
              <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center mb-4">
                <i className="fas fa-brain text-white text-xl"></i>
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">AI Recommendations</h3>
              <p className="text-gray-300">
                Get intelligent suggestions for next steps based on your findings and current attack surface.
              </p>
            </div>

            <div className="bg-gray-800 rounded-lg p-6">
              <div className="w-12 h-12 bg-green-600 rounded-lg flex items-center justify-center mb-4">
                <i className="fas fa-project-diagram text-white text-xl"></i>
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Security Relationship Map</h3>
              <p className="text-gray-300">
                Visualize relationships between targets, users, vulnerabilities, and attack paths.
              </p>
            </div>

            <div className="bg-gray-800 rounded-lg p-6">
              <div className="w-12 h-12 bg-purple-600 rounded-lg flex items-center justify-center mb-4">
                <i className="fas fa-tools text-white text-xl"></i>
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Tool Automation</h3>
              <p className="text-gray-300">
                Automate tool execution with custom workflows and intelligent sequencing.
              </p>
            </div>

            <div className="bg-gray-800 rounded-lg p-6">
              <div className="w-12 h-12 bg-red-600 rounded-lg flex items-center justify-center mb-4">
                <i className="fas fa-shield-alt text-white text-xl"></i>
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Scope Management</h3>
              <p className="text-gray-300">
                Define and enforce testing boundaries with automatic scope validation.
              </p>
            </div>

            <div className="bg-gray-800 rounded-lg p-6">
              <div className="w-12 h-12 bg-yellow-600 rounded-lg flex items-center justify-center mb-4">
                <i className="fas fa-file-alt text-white text-xl"></i>
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Smart Reporting</h3>
              <p className="text-gray-300">
                Generate comprehensive reports with AI-assisted analysis and recommendations.
              </p>
            </div>

            <div className="bg-gray-800 rounded-lg p-6">
              <div className="w-12 h-12 bg-indigo-600 rounded-lg flex items-center justify-center mb-4">
                <i className="fas fa-users text-white text-xl"></i>
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Team Collaboration</h3>
              <p className="text-gray-300">
                Collaborate with team members on complex penetration testing projects.
              </p>
            </div>
          </div>

          {/* System Status */}
          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-xl font-semibold text-white mb-4">System Status</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className={`text-3xl font-bold ${systemStatus.backend ? 'text-green-500' : 'text-red-500'}`}>
                  {systemStatus.backend ? '✓' : '✗'}
                </div>
                <div className="text-sm text-gray-300">Backend API</div>
                <div className="text-xs text-gray-500">Port 8002</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-green-500">✓</div>
                <div className="text-sm text-gray-300">Frontend App</div>
                <div className="text-xs text-gray-500">Port 3000</div>
              </div>
              <div className="text-center">
                <div className={`text-3xl font-bold ${systemStatus.database ? 'text-green-500' : 'text-yellow-500'}`}>
                  {systemStatus.database ? '✓' : '○'}
                </div>
                <div className="text-sm text-gray-300">Database</div>
                <div className="text-xs text-gray-500">SQLite</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-green-500">✓</div>
                <div className="text-sm text-gray-300">Authentication</div>
                <div className="text-xs text-gray-500">JWT Ready</div>
              </div>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}