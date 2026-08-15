import { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Layout from '../components/Layout';
import { useToast } from '../components/Toast';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';

export default function Recommendations() {
  const toast = useToast();
  const [recommendations, setRecommendations] = useState([]);
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [isLoadingAnalysis, setIsLoadingAnalysis] = useState(false);
  const [isLoadingRecs, setIsLoadingRecs] = useState(false);
  const [expandedRecs, setExpandedRecs] = useState({});

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    if (selectedProject) {
      setAiAnalysis(null);
      setRecommendations([]);
      loadRecommendations(selectedProject.id);
      loadAiAnalysis(selectedProject.id);
    }
  }, [selectedProject]);

  const loadProjects = async () => {
    try {
      const response = await fetch('http://localhost:8002/api/v1/projects');
      if (response.ok) {
        const data = await response.json();
        setProjects(data);
        if (data.length > 0 && !selectedProject) {
          setSelectedProject(data[0]);
        }
      } else {
        setProjects([]);
      }
    } catch (error) {
      console.error('Failed to load projects:', error);
      setProjects([]);
    }
  };

  const loadRecommendations = async (projectId) => {
    try {
      setIsLoadingRecs(true);
      const response = await fetch(`http://localhost:8002/api/v1/ai/recommendations?project_id=${projectId}`);
      if (response.ok) {
        const data = await response.json();
        setRecommendations(Array.isArray(data) ? data : []);
      } else {
        setRecommendations([]);
      }
    } catch (error) {
      console.error('Failed to load recommendations:', error);
      setRecommendations([]);
    } finally {
      setIsLoadingRecs(false);
    }
  };

  const loadAiAnalysis = async (projectId) => {
    try {
      setIsLoadingAnalysis(true);
      const response = await fetch(`http://localhost:8002/api/v1/ai/analysis?project_id=${projectId}`);
      if (response.ok) {
        const data = await response.json();
        if (data && !data.error) {
          setAiAnalysis(data);
        } else {
          setAiAnalysis(null);
          if (data?.error) {
            toast.warning(`Analysis: ${data.error}`);
          }
        }
      } else {
        setAiAnalysis(null);
      }
    } catch (error) {
      console.error('Failed to load AI analysis:', error);
      setAiAnalysis(null);
    } finally {
      setIsLoadingAnalysis(false);
    }
  };

  const runFullAnalysis = async () => {
    if (!selectedProject) return;
    toast.info('Running AI analysis...');
    setAiAnalysis(null);
    setRecommendations([]);
    setExpandedRecs({});
    await Promise.all([
      loadAiAnalysis(selectedProject.id),
      loadRecommendations(selectedProject.id)
    ]);
    toast.success('Analysis complete');
  };

  const toggleRecExpanded = (id) => {
    setExpandedRecs(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const getRiskBadge = (level) => {
    const l = (level || '').toLowerCase();
    if (l === 'critical') return { cls: 'bg-red-600 text-white border-red-500', label: 'CRITICAL' };
    if (l === 'high') return { cls: 'bg-red-500 text-white border-red-400', label: 'HIGH' };
    if (l === 'medium') return { cls: 'bg-yellow-500 text-white border-yellow-400', label: 'MEDIUM' };
    if (l === 'low') return { cls: 'bg-green-500 text-white border-green-400', label: 'LOW' };
    return { cls: 'bg-gray-500 text-white border-gray-400', label: level || 'UNKNOWN' };
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'Critical': return 'bg-red-600 text-white border border-red-500';
      case 'High': return 'bg-red-500 text-white border border-red-400';
      case 'Medium': return 'bg-yellow-500 text-white border border-yellow-400';
      case 'Low': return 'bg-green-500 text-white border border-green-400';
      default: return 'bg-gray-500 text-white border border-gray-400';
    }
  };

  const getConfidenceColor = (confidence) => {
    if (confidence >= 80) return 'text-green-400';
    if (confidence >= 60) return 'text-yellow-400';
    return 'text-red-400';
  };

  // Build structured insights with per-item severity from AI response
  const getStructuredInsights = () => {
    if (!aiAnalysis) return [];
    const insights = [];

    // Key vulnerabilities — each has its own severity from AI
    const vulns = Array.isArray(aiAnalysis.key_vulnerabilities) ? aiAnalysis.key_vulnerabilities : [];
    vulns.forEach((v, i) => {
      if (typeof v === 'string') {
        insights.push({ type: 'Vulnerability', severity: 'High', content: v, detail: null, id: `vuln-${i}` });
      } else if (v && typeof v === 'object') {
        insights.push({
          type: 'Vulnerability',
          severity: v.severity || 'High',
          content: v.finding || v.name || JSON.stringify(v),
          detail: v.impact || null,
          id: `vuln-${i}`
        });
      }
    });

    // Attack paths — each has its own severity from AI
    const paths = Array.isArray(aiAnalysis.attack_paths) ? aiAnalysis.attack_paths : [];
    paths.forEach((p, i) => {
      if (typeof p === 'string') {
        insights.push({ type: 'Attack Path', severity: 'High', content: p, detail: null, id: `path-${i}` });
      } else if (p && typeof p === 'object') {
        insights.push({
          type: 'Attack Path',
          severity: p.severity || 'High',
          content: p.path || p.name || JSON.stringify(p),
          detail: p.likelihood ? `Likelihood: ${p.likelihood}` : null,
          id: `path-${i}`
        });
      }
    });

    // Fallback for old format
    if (insights.length === 0) {
      const fallback = Array.isArray(aiAnalysis.insights) ? aiAnalysis.insights : [];
      fallback.forEach((item, i) => {
        if (item) insights.push({ type: 'Insight', severity: 'Medium', content: typeof item === 'string' ? item : JSON.stringify(item), detail: null, id: `insight-${i}` });
      });
    }

    return insights;
  };

  const getInsightStyle = (type) => {
    switch (type) {
      case 'Vulnerability': return { icon: '🔴', border: 'border-l-red-500', bg: 'bg-red-900/10' };
      case 'Attack Path': return { icon: '⚔️', border: 'border-l-orange-500', bg: 'bg-orange-900/10' };
      default: return { icon: '💡', border: 'border-l-gray-500', bg: 'bg-gray-900/10' };
    }
  };

  const isLoading = isLoadingAnalysis || isLoadingRecs;
  const structuredInsights = getStructuredInsights();
  const riskBadge = aiAnalysis?.risk_level ? getRiskBadge(aiAnalysis.risk_level) : null;

  return (
    <Layout title="AI Recommendations - BountyFlow">
      <Head>
        <title>AI Recommendations - BountyFlow</title>
      </Head>

      <div className="p-6">
        {/* Page Header */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">AI Recommendations</h1>
              <p className="text-gray-400">AI-powered attack strategies and security analysis</p>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <label className="text-sm font-medium text-gray-300">Project:</label>
                <select
                  value={selectedProject?.id || ''}
                  onChange={(e) => {
                    const project = projects.find(p => p.id === parseInt(e.target.value));
                    setSelectedProject(project);
                  }}
                  className="bg-gray-700 text-white px-3 py-2 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                >
                  <option value="">Select Project</option>
                  {projects.map(project => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={runFullAnalysis}
                disabled={!selectedProject || isLoading}
                className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed px-5 py-2 rounded-lg flex items-center space-x-2 transition"
              >
                {isLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Analyzing...</span>
                  </>
                ) : (
                  <span>Run Analysis</span>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: AI Analysis */}
          <div className="bg-gray-800 rounded-lg flex flex-col max-h-[calc(100vh-220px)]">
            <div className="p-6 pb-3 flex-shrink-0 flex items-center justify-between border-b border-gray-700">
              <h2 className="text-xl font-semibold text-white">AI Analysis</h2>
              {riskBadge && (
                <span className={`px-3 py-1 rounded text-xs font-bold border ${riskBadge.cls}`}>
                  {riskBadge.label}
                </span>
              )}
            </div>

            <div className="p-6 pt-4 overflow-y-auto min-h-0 flex-1">
              {isLoadingAnalysis ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500 mb-3"></div>
                  <span className="text-gray-400 text-sm">Running AI analysis...</span>
                </div>
              ) : aiAnalysis ? (
                <div className="space-y-3">
                  {/* Overall Assessment */}
                  {aiAnalysis.overall_assessment && (
                    <div className="bg-gray-700 rounded-lg p-4 border-l-4 border-l-purple-500">
                      <h3 className="text-xs font-medium text-purple-300 uppercase tracking-wide mb-2">Overall Assessment</h3>
                      <div className="text-sm text-gray-300 markdown-content">
                        <ReactMarkdown rehypePlugins={[rehypeHighlight]}>
                          {aiAnalysis.overall_assessment}
                        </ReactMarkdown>
                      </div>
                    </div>
                  )}

                  {/* Structured Insights with per-item severity */}
                  {structuredInsights.map((insight) => {
                    const style = getInsightStyle(insight.type);
                    const badge = getRiskBadge(insight.severity);
                    return (
                      <div key={insight.id} className={`rounded-lg p-4 border-l-4 ${style.border} ${style.bg} bg-gray-700`}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center space-x-2">
                            <span>{style.icon}</span>
                            <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">{insight.type}</span>
                          </div>
                          <span className={`px-2 py-0.5 rounded text-xs font-semibold border ${badge.cls}`}>
                            {badge.label}
                          </span>
                        </div>
                        <div className="text-sm text-gray-300 markdown-content">
                          <ReactMarkdown rehypePlugins={[rehypeHighlight]}>
                            {insight.content}
                          </ReactMarkdown>
                        </div>
                        {insight.detail && (
                          <p className="text-xs text-gray-500 mt-2 italic">{insight.detail}</p>
                        )}
                      </div>
                    );
                  })}

                  {!aiAnalysis.overall_assessment && structuredInsights.length === 0 && (
                    <div className="text-center py-6 text-gray-400 text-sm">
                      Analysis returned no structured insights
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="text-gray-500 text-4xl mb-4">🔍</div>
                  <p className="text-gray-400">No analysis available</p>
                  <p className="text-sm text-gray-500 mt-1">Click "Run Analysis" to generate insights</p>
                </div>
              )}
            </div>
          </div>

          {/* Right: AI Recommendations */}
          <div className="bg-gray-800 rounded-lg flex flex-col max-h-[calc(100vh-220px)]">
            <div className="p-6 pb-3 flex-shrink-0 border-b border-gray-700">
              <h2 className="text-xl font-semibold text-white">AI Recommendations</h2>
            </div>

            <div className="p-6 pt-4 overflow-y-auto min-h-0 flex-1">
              {/* Remediation & Next Steps from AI Analysis */}
              {aiAnalysis && (
                <div className="space-y-3 mb-4">
                  {Array.isArray(aiAnalysis.remediation_priority) && aiAnalysis.remediation_priority.length > 0 && (
                    <div className="bg-gray-700 rounded-lg p-4 border-l-4 border-l-blue-500">
                      <h3 className="text-xs font-medium text-blue-300 uppercase tracking-wide mb-2">Remediation Priority</h3>
                      <ul className="space-y-1.5">
                        {aiAnalysis.remediation_priority.map((item, i) => (
                          <li key={i} className="text-sm text-gray-300 flex items-start space-x-2">
                            <span className="text-blue-400 mt-0.5 flex-shrink-0">&#8227;</span>
                            <div className="markdown-content flex-1">
                              <ReactMarkdown rehypePlugins={[rehypeHighlight]}>
                                {typeof item === 'string' ? item : JSON.stringify(item)}
                              </ReactMarkdown>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {Array.isArray(aiAnalysis.next_steps) && aiAnalysis.next_steps.length > 0 && (
                    <div className="bg-gray-700 rounded-lg p-4 border-l-4 border-l-green-500">
                      <h3 className="text-xs font-medium text-green-300 uppercase tracking-wide mb-2">Next Steps</h3>
                      <ul className="space-y-1.5">
                        {aiAnalysis.next_steps.map((item, i) => (
                          <li key={i} className="text-sm text-gray-300 flex items-start space-x-2">
                            <span className="text-green-400 mt-0.5 flex-shrink-0">&#8227;</span>
                            <div className="markdown-content flex-1">
                              <ReactMarkdown rehypePlugins={[rehypeHighlight]}>
                                {typeof item === 'string' ? item : JSON.stringify(item)}
                              </ReactMarkdown>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {isLoadingRecs ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mb-3"></div>
                  <span className="text-gray-400 text-sm">Generating recommendations...</span>
                </div>
              ) : recommendations.length > 0 ? (
                <div className="space-y-3">
                  {recommendations.map((rec, idx) => {
                    const recId = rec.id || idx;
                    const isExpanded = expandedRecs[recId];
                    const hasDetails = (rec.commands && rec.commands.length > 0) ||
                      (rec.payloads && rec.payloads.length > 0) ||
                      rec.expected_output || rec.next_steps ||
                      rec.platform_guidance || rec.rationale;

                    return (
                      <div key={recId} className="bg-gray-700 rounded-lg overflow-hidden">
                        {/* Summary */}
                        <div
                          className={`p-4 ${hasDetails ? 'cursor-pointer hover:bg-gray-600/50' : ''} transition`}
                          onClick={() => hasDetails && toggleRecExpanded(recId)}
                        >
                          <div className="flex items-start justify-between mb-1">
                            <div className="flex items-start space-x-2 flex-1 min-w-0">
                              {hasDetails && (
                                <span className="text-gray-400 text-xs mt-1 flex-shrink-0">{isExpanded ? '▼' : '▶'}</span>
                              )}
                              <h3 className="font-medium text-white text-sm">{rec.title}</h3>
                            </div>
                            <span className={`px-2 py-0.5 rounded text-xs flex-shrink-0 ml-2 ${getPriorityColor(rec.priority)}`}>
                              {rec.priority}
                            </span>
                          </div>
                          <p className="text-sm text-gray-300 mt-1 ml-5">{rec.description}</p>
                          <div className="flex items-center flex-wrap gap-2 ml-5 mt-2">
                            {rec.category && (
                              <span className="text-xs text-gray-400">{rec.category}</span>
                            )}
                            {rec.confidence != null && (
                              <span className={`text-xs ${getConfidenceColor(rec.confidence)}`}>
                                {rec.confidence}% confidence
                              </span>
                            )}
                            {rec.tools && rec.tools.length > 0 && rec.tools.map((tool, i) => (
                              <span key={i} className="bg-blue-600/30 text-blue-300 px-1.5 py-0.5 rounded text-xs">
                                {tool}
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Expanded Details */}
                        {isExpanded && hasDetails && (
                          <div className="px-4 pb-4 space-y-3 border-t border-gray-600 pt-3 ml-5">
                            {rec.commands && rec.commands.length > 0 && (
                              <div>
                                <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Commands</h4>
                                <div className="space-y-1">
                                  {rec.commands.map((cmd, i) => (
                                    <pre key={i} className="bg-gray-900 rounded p-2 text-xs text-green-300 font-mono overflow-x-auto">
                                      <code>{cmd}</code>
                                    </pre>
                                  ))}
                                </div>
                              </div>
                            )}

                            {rec.payloads && rec.payloads.length > 0 && (
                              <div>
                                <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Payloads</h4>
                                <div className="space-y-1">
                                  {rec.payloads.map((payload, i) => (
                                    <pre key={i} className="bg-gray-900 rounded p-2 text-xs text-yellow-300 font-mono overflow-x-auto">
                                      <code>{payload}</code>
                                    </pre>
                                  ))}
                                </div>
                              </div>
                            )}

                            {rec.expected_output && (
                              <div>
                                <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Expected Output</h4>
                                <div className="text-sm text-gray-300 markdown-content bg-gray-800 rounded p-2">
                                  <ReactMarkdown rehypePlugins={[rehypeHighlight]}>
                                    {rec.expected_output}
                                  </ReactMarkdown>
                                </div>
                              </div>
                            )}

                            {rec.next_steps && (
                              <div>
                                <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Next Steps</h4>
                                <div className="text-sm text-gray-300 markdown-content bg-gray-800 rounded p-2">
                                  <ReactMarkdown rehypePlugins={[rehypeHighlight]}>
                                    {typeof rec.next_steps === 'string' ? rec.next_steps : rec.next_steps.join('\n')}
                                  </ReactMarkdown>
                                </div>
                              </div>
                            )}

                            {rec.platform_guidance && (
                              <div>
                                <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Platform Guidance</h4>
                                <div className="text-sm text-blue-300 bg-blue-900/20 border border-blue-800 rounded p-2">
                                  <ReactMarkdown rehypePlugins={[rehypeHighlight]}>
                                    {rec.platform_guidance}
                                  </ReactMarkdown>
                                </div>
                              </div>
                            )}

                            {rec.rationale && (
                              <div>
                                <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Rationale</h4>
                                <div className="text-sm text-gray-300 markdown-content">
                                  <ReactMarkdown rehypePlugins={[rehypeHighlight]}>
                                    {rec.rationale}
                                  </ReactMarkdown>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="text-gray-500 text-4xl mb-4">⚔️</div>
                  <p className="text-gray-400">No recommendations available</p>
                  <p className="text-sm text-gray-500 mt-1">Click "Run Analysis" to generate recommendations</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <style jsx global>{`
        .markdown-content {
          font-size: 0.875rem;
          line-height: 1.5;
          overflow-wrap: break-word;
          word-break: break-word;
        }
        .markdown-content p {
          margin-bottom: 0.5rem;
        }
        .markdown-content code {
          background-color: rgba(0, 0, 0, 0.3);
          padding: 0.125rem 0.25rem;
          border-radius: 0.25rem;
          font-family: 'Courier New', monospace;
          font-size: 0.8rem;
        }
        .markdown-content pre {
          background-color: rgba(0, 0, 0, 0.5);
          padding: 0.75rem;
          border-radius: 0.375rem;
          overflow-x: auto;
          margin: 0.5rem 0;
        }
        .markdown-content pre code {
          background: none;
          padding: 0;
        }
        .markdown-content ul, .markdown-content ol {
          margin-left: 1.25rem;
          margin-bottom: 0.5rem;
        }
        .markdown-content li {
          margin-bottom: 0.25rem;
        }
        .markdown-content strong {
          font-weight: 600;
          color: #93c5fd;
        }
        .markdown-content h1, .markdown-content h2, .markdown-content h3 {
          font-weight: 600;
          margin-top: 0.75rem;
          margin-bottom: 0.5rem;
        }
        .markdown-content h1 { font-size: 1.25rem; }
        .markdown-content h2 { font-size: 1.1rem; }
        .markdown-content h3 { font-size: 1rem; }
        .markdown-content blockquote {
          border-left: 3px solid #4b5563;
          padding-left: 0.75rem;
          margin: 0.5rem 0;
          font-style: italic;
        }
      `}</style>
    </Layout>
  );
}
