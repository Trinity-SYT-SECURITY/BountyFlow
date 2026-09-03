import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useToast } from '../components/Toast';

/**
 * Export a project's data.
 *
 * This page used to list three exports written into the source ("Project Data
 * Export", "Vulnerability Report", "Network Scan Results"), claim Jira and
 * GitHub were connected, and offer a "Create Export" button that pushed a row
 * into React state and produced no file. It now downloads the project from
 * /api/v1/projects/{id}/export.
 */
const FORMATS = [
  { value: 'json', label: 'JSON', hint: 'Everything, structured — for tooling and re-import.' },
  { value: 'csv', label: 'CSV', hint: 'One flat table of targets, findings, assets and runs.' },
];

export default function Export() {
  const toast = useToast();
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [format, setFormat] = useState('json');
  const [summary, setSummary] = useState(null);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    if (selectedProject) loadSummary();
  }, [selectedProject]);

  const loadProjects = async () => {
    try {
      const response = await fetch('http://localhost:8002/api/v1/projects');
      if (!response.ok) return;
      const data = await response.json();
      setProjects(data);
      if (data.length > 0) setSelectedProject(data[0]);
    } catch (error) {
      console.error('Failed to load projects:', error);
    }
  };

  /* Show what the file will contain before it is downloaded, read from the
     same endpoint that produces it. */
  const loadSummary = async () => {
    try {
      const response = await fetch(
        `http://localhost:8002/api/v1/projects/${selectedProject.id}/export?format=json`);
      if (!response.ok) {
        setSummary(null);
        return;
      }
      const data = await response.json();
      setSummary({
        targets: data.targets?.length || 0,
        findings: data.findings?.length || 0,
        discovered_users: data.discovered_users?.length || 0,
        discovered_files: data.discovered_files?.length || 0,
        tool_executions: data.tool_executions?.length || 0,
      });
    } catch (error) {
      console.error('Failed to summarise the export:', error);
      setSummary(null);
    }
  };

  const handleExport = async () => {
    if (!selectedProject) return;
    setIsExporting(true);
    try {
      const response = await fetch(
        `http://localhost:8002/api/v1/projects/${selectedProject.id}/export?format=${format}`);
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        toast.error(`Export failed: ${detail.detail || response.statusText}`);
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${selectedProject.name.replace(/[^\w.-]+/g, '_')}.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success('Export downloaded');
    } catch (error) {
      toast.error(`Export failed: ${error.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  const rows = summary
    ? [
        ['Targets', summary.targets],
        ['Findings', summary.findings],
        ['Discovered users', summary.discovered_users],
        ['Discovered files', summary.discovered_files],
        ['Tool executions', summary.tool_executions],
      ]
    : [];

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <Head>
        <title>Export - BountyFlow</title>
      </Head>

      <div className="bg-gray-800 border-b border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Link href="/dashboard" className="text-blue-400 hover:text-blue-300">
              ← Back to Dashboard
            </Link>
            <h1 className="text-2xl font-bold">Export</h1>
          </div>
          <select
            value={selectedProject?.id || ''}
            onChange={(e) => setSelectedProject(
              projects.find(p => p.id === parseInt(e.target.value)) || null)}
            className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm"
          >
            {projects.length === 0 && <option value="">No projects</option>}
            {projects.map(project => (
              <option key={project.id} value={project.id}>{project.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="p-6 max-w-3xl">
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">What will be exported</h2>
          {selectedProject ? (
            <table className="w-full text-sm">
              <tbody className="divide-y divide-gray-700">
                {rows.map(([label, count]) => (
                  <tr key={label}>
                    <td className="py-2 text-gray-400">{label}</td>
                    <td className="py-2 text-right text-white font-medium">{count}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td className="py-2 text-gray-400" colSpan={2}>
                      Nothing recorded against this project yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          ) : (
            <p className="text-gray-400 text-sm">Select a project to export.</p>
          )}
        </div>

        <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
          <h2 className="text-lg font-semibold mb-4">Format</h2>
          <div className="space-y-3 mb-6">
            {FORMATS.map((option) => (
              <label key={option.value} className="flex items-start space-x-3 cursor-pointer">
                <input
                  type="radio"
                  name="format"
                  value={option.value}
                  checked={format === option.value}
                  onChange={() => setFormat(option.value)}
                  className="mt-1"
                />
                <span>
                  <span className="text-white font-medium">{option.label}</span>
                  <span className="block text-gray-400 text-sm">{option.hint}</span>
                </span>
              </label>
            ))}
          </div>

          <button
            onClick={handleExport}
            disabled={!selectedProject || isExporting}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed px-4 py-2 rounded-lg font-medium"
          >
            {isExporting ? 'Preparing…' : 'Download export'}
          </button>

          <p className="text-gray-500 text-xs mt-4">
            Formatted reports — Markdown, HTML and PDF, with AI-written sections —
            are generated on the <Link href="/reports" className="text-blue-400 hover:text-blue-300">Reports</Link> page.
          </p>
        </div>
      </div>
    </div>
  );
}
