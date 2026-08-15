import { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Layout from '../components/Layout';
import { useToast } from '../components/Toast';
import { useModal } from '../components/Modal';

export default function Reports() {
  const router = useRouter();
  const [reports, setReports] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showExecutionModal, setShowExecutionModal] = useState(false);
  const [availableExecutions, setAvailableExecutions] = useState([]);
  const [availableFindings, setAvailableFindings] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [generating, setGenerating] = useState(false);
  const toast = useToast();
  const { confirm } = useModal();

  const [newReport, setNewReport] = useState({
    title: '',
    report_type: 'executive',
    include_all_executions: false,
    include_all_findings: false,
    selected_executions: [],
    selected_findings: []
  });

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    if (selectedProjectId) {
      loadReports(selectedProjectId);
    }
  }, [selectedProjectId]);

  const loadProjects = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch('http://localhost:8002/api/v1/projects', {
        headers
      });
      
      if (response.ok) {
        const data = await response.json();
        setProjects(data);
        if (data.length > 0 && !selectedProjectId) {
          setSelectedProjectId(String(data[0].id));
        }
      } else {
        console.error('Failed to load projects:', response.status);
      }
    } catch (error) {
      console.error('Error loading projects:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadReports = async (projectId) => {
    if (!projectId) {
      setReports([]);
      return;
    }
    
    try {
      const token = localStorage.getItem('token');
      const headers = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`http://localhost:8002/api/v1/reports/project/${projectId}`, {
        headers
      });
      
      if (response.ok) {
        const data = await response.json();
        setReports(data || []);
      } else {
        const errorText = await response.text();
        console.error('Failed to load reports:', response.status, errorText);
        setReports([]);
      }
    } catch (error) {
      console.error('Error loading reports:', error);
      setReports([]);
    }
  };

  const handleGenerateReport = async () => {
    if (!selectedProjectId || !newReport.title.trim()) {
      toast.warning('Please select a project and enter a report title');
      return;
    }

    setGenerating(true);
    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('project_id', String(selectedProjectId));
      formData.append('title', newReport.title);
      formData.append('report_type', newReport.report_type);
      formData.append('include_all_executions', String(newReport.include_all_executions));
      formData.append('include_all_findings', String(newReport.include_all_findings));
      
      if (newReport.selected_executions.length > 0) {
        formData.append('execution_ids', JSON.stringify(newReport.selected_executions));
      }
      if (newReport.selected_findings.length > 0) {
        formData.append('finding_ids', JSON.stringify(newReport.selected_findings));
      }

      const headers = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch('http://localhost:8002/api/v1/reports/generate', {
        method: 'POST',
        headers,
        body: formData
      });

      if (response.ok) {
        const report = await response.json();
        setShowCreateModal(false);
        setNewReport({
          title: '',
          report_type: 'executive',
          include_all_executions: false,
          include_all_findings: false,
          selected_executions: [],
          selected_findings: []
        });
        // Redirect to editor
        router.push(`/reports/${report.id}`);
      } else {
        const error = await response.json();
        toast.error(`Failed to generate report: ${error.detail || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error generating report:', error);
      toast.error(`Error: ${error.message}`);
    } finally {
      setGenerating(false);
    }
  };

  const loadAvailableExecutions = async () => {
    if (!selectedProjectId) return;
    
    try {
      const token = localStorage.getItem('token');
      const headers = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      // Get executions from tools API (for initial load before report is created)
      const response = await fetch(
        `http://localhost:8002/api/v1/tools/projects/${selectedProjectId}/tools/executions`,
        { headers }
      );
      
      if (response.ok) {
        const data = await response.json();
        // Format to match what report editor expects
        setAvailableExecutions(data.map(exec => ({
          id: exec.id,
          command_executed: exec.command_executed || 'N/A',
          output_preview: (exec.output || '').substring(0, 200),
          start_time: exec.start_time,
          included: false
        })));
      }
    } catch (error) {
      console.error('Error loading executions:', error);
    }
  };

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'completed':
      case 'final':
      case 'published': return 'bg-green-900 text-green-300';
      case 'draft': return 'bg-yellow-900 text-yellow-300';
      case 'generating': return 'bg-blue-900 text-blue-300';
      default: return 'bg-gray-700 text-gray-300';
    }
  };

  const getTypeColor = (type) => {
    switch (type?.toLowerCase()) {
      case 'executive': return 'bg-purple-900 text-purple-300';
      case 'technical': return 'bg-blue-900 text-blue-300';
      case 'compliance': return 'bg-green-900 text-green-300';
      default: return 'bg-gray-700 text-gray-300';
    }
  };

  return (
    <Layout>
      <Head>
        <title>Reports - BountyFlow</title>
      </Head>

      <div className="min-h-screen bg-gray-900 text-white">
        {/* Header */}
        <div className="bg-gray-800 border-b border-gray-700 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <h1 className="text-2xl font-bold">Reports</h1>
            </div>
            <div className="flex items-center space-x-4">
              {projects.length > 0 ? (
                <>
                  <select
                    value={selectedProjectId || ''}
                    onChange={(e) => {
                      const projectId = e.target.value;
                      setSelectedProjectId(projectId);
                      if (projectId) {
                        loadReports(projectId);
                      }
                    }}
                    className="bg-gray-700 text-white px-4 py-2 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none min-w-[200px]"
                  >
                    <option value="">Select Project</option>
                    {projects.map(project => (
                      <option key={project.id} value={String(project.id)}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => {
                      if (!selectedProjectId) {
                        toast.warning('Please select a project first');
                        return;
                      }
                      loadAvailableExecutions();
                      setShowCreateModal(true);
                    }}
                    disabled={!selectedProjectId}
                    className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed px-4 py-2 rounded-lg font-medium"
                  >
                    Generate Report
                  </button>
                </>
              ) : (
                <div className="text-gray-400 text-sm">
                  {loading ? 'Loading projects...' : 'No projects available. Create a project first.'}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Reports Grid */}
        <div className="p-6">
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
              <p className="mt-4 text-gray-400">Loading reports...</p>
            </div>
          ) : reports.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-400 text-lg">No reports found for this project</p>
              <p className="text-gray-500 text-sm mt-2">Generate a new report to get started</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {reports.map((report) => (
                <div key={report.id} className="bg-gray-800 rounded-lg border border-gray-700 p-6 hover:border-blue-500 transition-colors">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h3 className="text-xl font-semibold text-white mb-1">{report.title}</h3>
                      <p className="text-gray-400 text-sm capitalize">{report.report_type || 'Executive'}</p>
                    </div>
                    <div className="flex space-x-2 ml-2">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(report.status)}`}>
                        {report.status || 'Draft'}
                      </span>
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${getTypeColor(report.report_type)}`}>
                        {report.report_type || 'Executive'}
                      </span>
                    </div>
                  </div>
                  
                  <div className="space-y-2 mb-4">
                    {report.generated_at && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Generated:</span>
                        <span className="text-white">
                          {new Date(report.generated_at).toLocaleDateString()}
                        </span>
                      </div>
                    )}
                    {report.markdown_preview && (
                      <p className="text-gray-400 text-xs line-clamp-2 mt-2">
                        {report.markdown_preview}
                      </p>
                    )}
                  </div>
                  
                  <div className="flex space-x-2">
                    {report.status === 'final' || report.status === 'published' ? (
                      <>
                        <button 
                          onClick={() => router.push(`/reports/${report.id}?export=pdf`)}
                          className="flex-1 bg-green-600 hover:bg-green-700 py-2 rounded-lg text-sm font-medium"
                        >
                          Download
                        </button>
                        <button 
                          onClick={() => router.push(`/reports/${report.id}`)}
                          className="px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm"
                        >
                          View
                        </button>
                      </>
                    ) : (
                      <>
                        <button 
                          onClick={() => router.push(`/reports/${report.id}`)}
                          className="flex-1 bg-blue-600 hover:bg-blue-700 py-2 rounded-lg text-sm font-medium"
                        >
                          Edit
                        </button>
                      </>
                    )}
                    <button 
                      onClick={() => {
                        const doDelete = async () => {
                          const confirmed = await confirm({
                            title: 'Delete Report',
                            message: 'Are you sure you want to delete this report? This action cannot be undone.',
                            confirmText: 'Delete',
                            variant: 'danger'
                          });
                          if (confirmed) {
                            // TODO: Implement delete
                          }
                        };
                        doDelete();
                      }}
                      className="px-3 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-sm"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Create Report Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <h2 className="text-xl font-bold mb-4 text-white">Generate New Report with AI</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Report Title</label>
                  <input
                    type="text"
                    value={newReport.title}
                    onChange={(e) => setNewReport({...newReport, title: e.target.value})}
                    className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                    placeholder="Enter report title"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Report Type</label>
                  <select
                    value={newReport.report_type}
                    onChange={(e) => setNewReport({...newReport, report_type: e.target.value})}
                    className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                  >
                    <option value="executive">Executive Summary</option>
                    <option value="technical">Technical Report</option>
                    <option value="compliance">Compliance Report</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="flex items-center space-x-2 text-gray-300">
                    <input
                      type="checkbox"
                      checked={newReport.include_all_executions}
                      onChange={(e) => setNewReport({...newReport, include_all_executions: e.target.checked})}
                      className="rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
                    />
                    <span>Include all tool executions</span>
                  </label>
                  <label className="flex items-center space-x-2 text-gray-300">
                    <input
                      type="checkbox"
                      checked={newReport.include_all_findings}
                      onChange={(e) => setNewReport({...newReport, include_all_findings: e.target.checked})}
                      className="rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
                    />
                    <span>Include all findings</span>
                  </label>
                </div>

                {(!newReport.include_all_executions || !newReport.include_all_findings) && (
                  <div className="text-sm text-gray-400">
                    <p>💡 Tip: You can add specific executions or findings after generating the report.</p>
                  </div>
                )}
              </div>
              
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={() => {
                    setShowCreateModal(false);
                    setNewReport({
                      title: '',
                      report_type: 'executive',
                      include_all_executions: false,
                      include_all_findings: false,
                      selected_executions: [],
                      selected_findings: []
                    });
                  }}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={handleGenerateReport}
                  disabled={generating}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {generating ? 'Generating...' : 'Generate with AI'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
