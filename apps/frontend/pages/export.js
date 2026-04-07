import { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';

export default function Export() {
  const [exports, setExports] = useState([
    {
      id: 1,
      name: "Project Data Export",
      type: "JSON",
      status: "Completed",
      size: "2.3 MB",
      created: "2025-01-11 14:30:00",
      items: 150
    },
    {
      id: 2,
      name: "Vulnerability Report",
      type: "PDF",
      status: "Completed",
      size: "1.8 MB",
      created: "2025-01-11 12:15:00",
      items: 25
    },
    {
      id: 3,
      name: "Network Scan Results",
      type: "XML",
      status: "Processing",
      size: "0 MB",
      created: "2025-01-11 15:45:00",
      items: 0
    }
  ]);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newExport, setNewExport] = useState({
    name: '',
    type: 'JSON',
    scope: 'All Data',
    format: 'Standard'
  });

  const [integrations] = useState([
    { name: "Jira", status: "Connected", icon: "🔗" },
    { name: "GitHub", status: "Connected", icon: "🐙" },
    { name: "Slack", status: "Disconnected", icon: "💬" },
    { name: "Microsoft Teams", status: "Disconnected", icon: "👥" }
  ]);

  const handleCreateExport = () => {
    const exportItem = {
      id: exports.length + 1,
      ...newExport,
      status: 'Processing',
      size: '0 MB',
      created: new Date().toLocaleString(),
      items: 0
    };
    setExports([exportItem, ...exports]);
    setShowCreateModal(false);
    setNewExport({ name: '', type: 'JSON', scope: 'All Data', format: 'Standard' });
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Completed': return 'bg-green-900 text-green-300';
      case 'Processing': return 'bg-blue-900 text-blue-300';
      case 'Failed': return 'bg-red-900 text-red-300';
      default: return 'bg-gray-700 text-gray-300';
    }
  };

  const getTypeColor = (type) => {
    switch (type) {
      case 'JSON': return 'bg-yellow-900 text-yellow-300';
      case 'PDF': return 'bg-red-900 text-red-300';
      case 'XML': return 'bg-green-900 text-green-300';
      case 'CSV': return 'bg-blue-900 text-blue-300';
      default: return 'bg-gray-700 text-gray-300';
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <Head>
        <title>Export & Integration - BountyFlow</title>
      </Head>

      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Link href="/dashboard" className="text-blue-400 hover:text-blue-300">
              ← Back to Dashboard
            </Link>
            <h1 className="text-2xl font-bold">Export & Integration</h1>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg font-medium"
          >
            Create Export
          </button>
        </div>
      </div>

      <div className="p-6">
        {/* Export History */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4">Export History</h2>
          <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Type</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Size</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Items</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Created</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {exports.map((exportItem) => (
                    <tr key={exportItem.id} className="hover:bg-gray-700">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-white">{exportItem.name}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getTypeColor(exportItem.type)}`}>
                          {exportItem.type}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(exportItem.status)}`}>
                          {exportItem.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                        {exportItem.size}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                        {exportItem.items}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                        {exportItem.created}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex space-x-2">
                          {exportItem.status === 'Completed' && (
                            <button className="text-blue-400 hover:text-blue-300">Download</button>
                          )}
                          <button className="text-red-400 hover:text-red-300">Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Integration Status */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4">External Integrations</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {integrations.map((integration, index) => (
              <div key={index} className="bg-gray-800 rounded-lg border border-gray-700 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    <span className="text-2xl">{integration.icon}</span>
                    <span className="font-medium text-white">{integration.name}</span>
                  </div>
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                    integration.status === 'Connected' 
                      ? 'bg-green-900 text-green-300' 
                      : 'bg-gray-700 text-gray-300'
                  }`}>
                    {integration.status}
                  </span>
                </div>
                <button className={`w-full py-2 rounded-lg text-sm font-medium ${
                  integration.status === 'Connected'
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}>
                  {integration.status === 'Connected' ? 'Disconnect' : 'Connect'}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Export Templates */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4">Export Templates</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
              <h3 className="text-lg font-semibold text-white mb-2">Standard Export</h3>
              <p className="text-gray-400 text-sm mb-4">Basic data export in JSON format</p>
              <button className="w-full bg-blue-600 hover:bg-blue-700 py-2 rounded-lg text-sm font-medium">
                Use Template
              </button>
            </div>
            
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
              <h3 className="text-lg font-semibold text-white mb-2">OWASP Report</h3>
              <p className="text-gray-400 text-sm mb-4">OWASP-compliant vulnerability report</p>
              <button className="w-full bg-green-600 hover:bg-green-700 py-2 rounded-lg text-sm font-medium">
                Use Template
              </button>
            </div>
            
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
              <h3 className="text-lg font-semibold text-white mb-2">Custom Format</h3>
              <p className="text-gray-400 text-sm mb-4">Create your own export format</p>
              <button className="w-full bg-purple-600 hover:bg-purple-700 py-2 rounded-lg text-sm font-medium">
                Create Custom
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Create Export Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Create Export</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Export Name</label>
                <input
                  type="text"
                  value={newExport.name}
                  onChange={(e) => setNewExport({...newExport, name: e.target.value})}
                  className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                  placeholder="Enter export name"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Export Type</label>
                <select
                  value={newExport.type}
                  onChange={(e) => setNewExport({...newExport, type: e.target.value})}
                  className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                >
                  <option value="JSON">JSON</option>
                  <option value="PDF">PDF</option>
                  <option value="XML">XML</option>
                  <option value="CSV">CSV</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Data Scope</label>
                <select
                  value={newExport.scope}
                  onChange={(e) => setNewExport({...newExport, scope: e.target.value})}
                  className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                >
                  <option value="All Data">All Data</option>
                  <option value="Current Project">Current Project</option>
                  <option value="Vulnerabilities Only">Vulnerabilities Only</option>
                  <option value="Network Data">Network Data</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Format</label>
                <select
                  value={newExport.format}
                  onChange={(e) => setNewExport({...newExport, format: e.target.value})}
                  className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                >
                  <option value="Standard">Standard</option>
                  <option value="OWASP">OWASP</option>
                  <option value="Custom">Custom</option>
                </select>
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
                onClick={handleCreateExport}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg"
              >
                Create Export
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


