import { useState, useEffect } from 'react';
import Head from 'next/head';

export default function ApiTest() {
  const [testResults, setTestResults] = useState({});
  const [isLoading, setIsLoading] = useState(false);

  const testApi = async (name, url, method = 'GET', body = null) => {
    try {
      setIsLoading(true);
      const options = {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
      };
      
      if (body) {
        options.body = JSON.stringify(body);
      }

      const response = await fetch(url, options);
      const data = await response.json();
      
      setTestResults(prev => ({
        ...prev,
        [name]: {
          status: response.status,
          success: response.ok,
          data: data,
          error: null
        }
      }));
    } catch (error) {
      setTestResults(prev => ({
        ...prev,
        [name]: {
          status: 'ERROR',
          success: false,
          data: null,
          error: error.message
        }
      }));
    } finally {
      setIsLoading(false);
    }
  };

  const runAllTests = async () => {
    await testApi('Health Check', 'http://localhost:8002/health');
    await testApi('Projects List', 'http://localhost:8002/api/v1/projects');
    await testApi('Neo4j Graph (Project 1)', 'http://localhost:8002/api/v1/neo4j/graph/1');
    await testApi('Add Target to Graph', 'http://localhost:8002/api/v1/neo4j/graph/1/target', 'POST', {
      id: 'test_target_1',
      name: 'Test Target',
      type: 'ip',
      ip: '192.168.1.100',
      status: 'active',
      last_scan: new Date().toISOString()
    });
  };

  useEffect(() => {
    runAllTests();
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <Head>
        <title>API Test - BountyFlow</title>
      </Head>

      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">API Connection Test</h1>
        
        <div className="mb-6">
          <button
            onClick={runAllTests}
            disabled={isLoading}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 px-6 py-3 rounded-lg"
          >
            {isLoading ? 'Testing...' : 'Run All Tests'}
          </button>
        </div>

        <div className="space-y-6">
          {Object.entries(testResults).map(([name, result]) => (
            <div key={name} className="bg-gray-800 rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-semibold">{name}</h3>
                <span className={`px-3 py-1 rounded-full text-sm ${
                  result.success ? 'bg-green-600' : 'bg-red-600'
                }`}>
                  {result.success ? 'SUCCESS' : 'FAILED'}
                </span>
              </div>
              
              <div className="space-y-2">
                <div>
                  <strong>Status:</strong> {result.status}
                </div>
                
                {result.error && (
                  <div>
                    <strong>Error:</strong> 
                    <pre className="bg-red-900 p-2 rounded mt-1 text-red-200">
                      {result.error}
                    </pre>
                  </div>
                )}
                
                {result.data && (
                  <div>
                    <strong>Response:</strong>
                    <pre className="bg-gray-700 p-2 rounded mt-1 text-sm overflow-auto">
                      {JSON.stringify(result.data, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 bg-blue-900 rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4">Troubleshooting Guide</h3>
          <div className="space-y-2 text-sm">
            <p><strong>1. Health Check Failed:</strong> Backend not running or wrong port</p>
            <p><strong>2. Projects List Failed:</strong> Database connection issue</p>
            <p><strong>3. Neo4j Graph Failed:</strong> Neo4j service issue (will use mock mode)</p>
            <p><strong>4. Add Target Failed:</strong> API endpoint issue</p>
          </div>
        </div>
      </div>
    </div>
  );
}
