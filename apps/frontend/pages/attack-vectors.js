import { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';

export default function AttackVectors() {
  const [attackVectors, setAttackVectors] = useState([
    {
      id: 1,
      name: "SQL Injection Chain",
      description: "Multi-stage SQL injection attack vector",
      severity: 8,
      plausibility: 7,
      risk: 9,
      status: "active",
      steps: [
        { id: 1, name: "Reconnaissance", type: "recon", completed: true },
        { id: 2, name: "Vulnerability Discovery", type: "vuln", completed: true },
        { id: 3, name: "Exploitation", type: "exploit", completed: false },
        { id: 4, name: "Privilege Escalation", type: "privesc", completed: false }
      ],
      targets: ["192.168.1.1", "app.example.com"],
      created: "2025-01-11 14:30:00"
    },
    {
      id: 2,
      name: "XSS to RCE",
      description: "Cross-site scripting leading to remote code execution",
      severity: 6,
      plausibility: 8,
      risk: 7,
      status: "active",
      steps: [
        { id: 1, name: "XSS Discovery", type: "vuln", completed: true },
        { id: 2, name: "Payload Crafting", type: "craft", completed: false },
        { id: 3, name: "Execution", type: "exploit", completed: false }
      ],
      targets: ["app.example.com"],
      created: "2025-01-11 12:15:00"
    },
    {
      id: 3,
      name: "Network Pivot",
      description: "Lateral movement through network segments",
      severity: 9,
      plausibility: 6,
      risk: 8,
      status: "planning",
      steps: [
        { id: 1, name: "Network Mapping", type: "recon", completed: false },
        { id: 2, name: "Credential Harvesting", type: "harvest", completed: false },
        { id: 3, name: "Lateral Movement", type: "pivot", completed: false }
      ],
      targets: ["192.168.1.0/24"],
      created: "2025-01-11 10:45:00"
    }
  ]);

  const [selectedVector, setSelectedVector] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newVector, setNewVector] = useState({
    name: '',
    description: '',
    severity: 5,
    plausibility: 5,
    risk: 5
  });

  const getSeverityColor = (severity) => {
    if (severity >= 8) return 'bg-red-900 text-red-300';
    if (severity >= 6) return 'bg-orange-900 text-orange-300';
    if (severity >= 4) return 'bg-yellow-900 text-yellow-300';
    return 'bg-green-900 text-green-300';
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return 'bg-green-900 text-green-300';
      case 'planning': return 'bg-blue-900 text-blue-300';
      case 'completed': return 'bg-gray-700 text-gray-300';
      case 'failed': return 'bg-red-900 text-red-300';
      default: return 'bg-gray-700 text-gray-300';
    }
  };

  const getStepIcon = (type) => {
    switch (type) {
      case 'recon': return '🔍';
      case 'vuln': return '🎯';
      case 'exploit': return '💥';
      case 'privesc': return '⬆️';
      case 'craft': return '🛠️';
      case 'harvest': return '🌾';
      case 'pivot': return '🔄';
      default: return '📋';
    }
  };

  const createVector = () => {
    const vector = {
      id: attackVectors.length + 1,
      ...newVector,
      status: 'planning',
      steps: [],
      targets: [],
      created: new Date().toLocaleString()
    };
    setAttackVectors([...attackVectors, vector]);
    setShowCreateModal(false);
    setNewVector({ name: '', description: '', severity: 5, plausibility: 5, risk: 5 });
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <Head>
        <title>Attack Vectors - BountyFlow</title>
      </Head>

      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Link href="/dashboard" className="text-blue-400 hover:text-blue-300">
              ← Back to Dashboard
            </Link>
            <h1 className="text-2xl font-bold">Attack Vectors</h1>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg font-medium"
          >
            Create Vector
          </button>
        </div>
      </div>

      <div className="p-6">
        {/* Attack Vectors Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {attackVectors.map((vector) => (
            <div key={vector.id} className="bg-gray-800 rounded-lg border border-gray-700 p-6 hover:border-blue-500 transition-colors">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-xl font-semibold text-white">{vector.name}</h3>
                  <p className="text-gray-400 text-sm">{vector.description}</p>
                </div>
                <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(vector.status)}`}>
                  {vector.status}
                </span>
              </div>
              
              {/* Severity/Plausibility/Risk Graphs */}
              <div className="space-y-3 mb-4">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-400">Severity</span>
                    <span className="text-white">{vector.severity}/10</span>
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-2">
                    <div 
                      className={`h-2 rounded-full ${
                        vector.severity >= 8 ? 'bg-red-500' :
                        vector.severity >= 6 ? 'bg-orange-500' :
                        vector.severity >= 4 ? 'bg-yellow-500' : 'bg-green-500'
                      }`}
                      style={{ width: `${vector.severity * 10}%` }}
                    ></div>
                  </div>
                </div>
                
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-400">Plausibility</span>
                    <span className="text-white">{vector.plausibility}/10</span>
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-2">
                    <div 
                      className={`h-2 rounded-full ${
                        vector.plausibility >= 8 ? 'bg-green-500' :
                        vector.plausibility >= 6 ? 'bg-blue-500' :
                        vector.plausibility >= 4 ? 'bg-yellow-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${vector.plausibility * 10}%` }}
                    ></div>
                  </div>
                </div>
                
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-400">Risk</span>
                    <span className="text-white">{vector.risk}/10</span>
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-2">
                    <div 
                      className={`h-2 rounded-full ${
                        vector.risk >= 8 ? 'bg-red-500' :
                        vector.risk >= 6 ? 'bg-orange-500' :
                        vector.risk >= 4 ? 'bg-yellow-500' : 'bg-green-500'
                      }`}
                      style={{ width: `${vector.risk * 10}%` }}
                    ></div>
                  </div>
                </div>
              </div>
              
              {/* Attack Steps */}
              <div className="mb-4">
                <h4 className="text-sm font-medium text-gray-300 mb-2">Attack Steps</h4>
                <div className="space-y-1">
                  {vector.steps.map((step, index) => (
                    <div key={step.id} className="flex items-center space-x-2">
                      <span className="text-sm">{getStepIcon(step.type)}</span>
                      <span className={`text-sm ${step.completed ? 'text-green-400' : 'text-gray-400'}`}>
                        {step.name}
                      </span>
                      {step.completed && <span className="text-green-400">✓</span>}
                    </div>
                  ))}
                </div>
              </div>
              
              {/* Targets */}
              <div className="mb-4">
                <h4 className="text-sm font-medium text-gray-300 mb-2">Targets</h4>
                <div className="flex flex-wrap gap-1">
                  {vector.targets.map((target, index) => (
                    <span key={index} className="px-2 py-1 bg-blue-900 text-blue-300 text-xs rounded">
                      {target}
                    </span>
                  ))}
                </div>
              </div>
              
              <div className="flex space-x-2">
                <button 
                  onClick={() => setSelectedVector(vector)}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 py-2 rounded-lg text-sm font-medium"
                >
                  View Details
                </button>
                <button className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm">
                  Edit
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Vector Details Modal */}
      {selectedVector && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold">{selectedVector.name}</h2>
              <button
                onClick={() => setSelectedVector(null)}
                className="text-gray-400 hover:text-white"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Attack Flow Visualization */}
              <div className="bg-gray-700 rounded-lg p-4">
                <h3 className="text-lg font-semibold mb-4">Attack Flow</h3>
                <div className="space-y-3">
                  {selectedVector.steps.map((step, index) => (
                    <div key={step.id} className="flex items-center space-x-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        step.completed ? 'bg-green-600' : 'bg-gray-600'
                      }`}>
                        <span className="text-sm">{index + 1}</span>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <span>{getStepIcon(step.type)}</span>
                          <span className="font-medium">{step.name}</span>
                          {step.completed && <span className="text-green-400">✓</span>}
                        </div>
                        <div className="text-sm text-gray-400 capitalize">{step.type}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              
              {/* Metrics */}
              <div className="space-y-4">
                <div className="bg-gray-700 rounded-lg p-4">
                  <h3 className="text-lg font-semibold mb-4">Risk Assessment</h3>
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between text-sm mb-2">
                        <span>Severity</span>
                        <span>{selectedVector.severity}/10</span>
                      </div>
                      <div className="w-full bg-gray-600 rounded-full h-3">
                        <div 
                          className="bg-red-500 h-3 rounded-full"
                          style={{ width: `${selectedVector.severity * 10}%` }}
                        ></div>
                      </div>
                    </div>
                    
                    <div>
                      <div className="flex justify-between text-sm mb-2">
                        <span>Plausibility</span>
                        <span>{selectedVector.plausibility}/10</span>
                      </div>
                      <div className="w-full bg-gray-600 rounded-full h-3">
                        <div 
                          className="bg-blue-500 h-3 rounded-full"
                          style={{ width: `${selectedVector.plausibility * 10}%` }}
                        ></div>
                      </div>
                    </div>
                    
                    <div>
                      <div className="flex justify-between text-sm mb-2">
                        <span>Risk</span>
                        <span>{selectedVector.risk}/10</span>
                      </div>
                      <div className="w-full bg-gray-600 rounded-full h-3">
                        <div 
                          className="bg-orange-500 h-3 rounded-full"
                          style={{ width: `${selectedVector.risk * 10}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="bg-gray-700 rounded-lg p-4">
                  <h3 className="text-lg font-semibold mb-4">Actions</h3>
                  <div className="space-y-2">
                    <button className="w-full bg-green-600 hover:bg-green-700 py-2 rounded-lg">
                      Execute Attack
                    </button>
                    <button className="w-full bg-blue-600 hover:bg-blue-700 py-2 rounded-lg">
                      Edit Vector
                    </button>
                    <button className="w-full bg-purple-600 hover:bg-purple-700 py-2 rounded-lg">
                      Generate Report
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Vector Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Create Attack Vector</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Vector Name</label>
                <input
                  type="text"
                  value={newVector.name}
                  onChange={(e) => setNewVector({...newVector, name: e.target.value})}
                  className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                  placeholder="Enter vector name"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Description</label>
                <textarea
                  value={newVector.description}
                  onChange={(e) => setNewVector({...newVector, description: e.target.value})}
                  className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                  rows="3"
                  placeholder="Enter vector description"
                />
              </div>
              
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Severity</label>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    value={newVector.severity}
                    onChange={(e) => setNewVector({...newVector, severity: parseInt(e.target.value)})}
                    className="w-full"
                  />
                  <div className="text-center text-sm text-gray-400">{newVector.severity}/10</div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Plausibility</label>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    value={newVector.plausibility}
                    onChange={(e) => setNewVector({...newVector, plausibility: parseInt(e.target.value)})}
                    className="w-full"
                  />
                  <div className="text-center text-sm text-gray-400">{newVector.plausibility}/10</div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Risk</label>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    value={newVector.risk}
                    onChange={(e) => setNewVector({...newVector, risk: parseInt(e.target.value)})}
                    className="w-full"
                  />
                  <div className="text-center text-sm text-gray-400">{newVector.risk}/10</div>
                </div>
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
                onClick={createVector}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg"
              >
                Create Vector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


