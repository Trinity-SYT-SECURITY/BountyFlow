import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import Layout from '../components/Layout';
import dynamic from 'next/dynamic';

// Dynamically import chart component to avoid SSR issues
const Chart = dynamic(() => import('react-apexcharts'), { ssr: false });

export default function Dashboard() {
  const router = useRouter();
  const [summaryStats, setSummaryStats] = useState(null);
  const [findingsTrend, setFindingsTrend] = useState(null);
  const [attacksByCategory, setAttacksByCategory] = useState(null);
  const [toolExecutions, setToolExecutions] = useState(null);
  const [performanceMetrics, setPerformanceMetrics] = useState(null);
  const [mitreCoverage, setMitreCoverage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  // Define loadAllData before useEffect
  const loadAllData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

      // Load all data in parallel
      const [
        statsRes, findingsRes, attacksRes, executionsRes, projectsRes,
        metricsRes, mitreRes
      ] = await Promise.all([
        fetch('http://localhost:8002/api/v1/admin/dashboard/summary-stats', { headers }),
        fetch('http://localhost:8002/api/v1/admin/dashboard/chart-data/findings-trend?days=30', { headers }),
        fetch('http://localhost:8002/api/v1/admin/dashboard/chart-data/attacks-by-category', { headers }),
        fetch('http://localhost:8002/api/v1/admin/dashboard/chart-data/tool-executions?days=30', { headers }),
        fetch('http://localhost:8002/api/v1/projects', { headers }),
        fetch('http://localhost:8002/api/v1/admin/dashboard/performance-metrics', { headers }),
        fetch('http://localhost:8002/api/v1/admin/dashboard/mitre-coverage', { headers })
      ]);

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setSummaryStats(statsData);
        console.log('Summary stats loaded:', statsData);
      } else {
        console.error('Failed to load summary stats:', statsRes.status, await statsRes.text());
      }

      if (findingsRes.ok) {
        const findingsData = await findingsRes.json();
        setFindingsTrend(findingsData);
        console.log('Findings trend loaded:', findingsData);
        console.log('Findings trend series:', findingsData.series);
        console.log('Findings trend data points:', findingsData.series?.[0]?.data?.length || 0);
      } else {
        const errorText = await findingsRes.text();
        console.error('Failed to load findings trend:', findingsRes.status, errorText);
        // Set empty data structure
        setFindingsTrend({ series: [{ name: "Findings Discovered", data: [] }] });
      }

      if (attacksRes.ok) {
        const attacksData = await attacksRes.json();
        setAttacksByCategory(attacksData);
        console.log('Attacks by category loaded:', attacksData);
        console.log('Attack categories:', attacksData.categories);
        console.log('Attack data:', attacksData.data);
      } else {
        const errorText = await attacksRes.text();
        console.error('Failed to load attacks by category:', attacksRes.status, errorText);
        // Set empty data structure
        setAttacksByCategory({ categories: [], data: [], total: 0 });
      }

      if (executionsRes.ok) {
        const executionsData = await executionsRes.json();
        setToolExecutions(executionsData);
        console.log('Tool executions loaded:', executionsData);
        console.log('Tool executions series:', executionsData.series);
        console.log('Tool executions data points:', executionsData.series?.[0]?.data?.length || 0);
      } else {
        const errorText = await executionsRes.text();
        console.error('Failed to load tool executions:', executionsRes.status, errorText);
        // Set empty data structure
        setToolExecutions({ series: [{ name: "Tool Executions", data: [] }] });
      }

      if (projectsRes.ok) {
        const projectsData = await projectsRes.json();
        setProjects(projectsData);
      }

      if (metricsRes.ok) {
        const metricsData = await metricsRes.json();
        setPerformanceMetrics(metricsData);
      }

      if (mitreRes.ok) {
        const mitreData = await mitreRes.json();
        setMitreCoverage(mitreData);
      }
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Check authentication
    const token = localStorage.getItem('token');
    if (!token) {
      // No token, redirect to login
      router.push('/login?redirect=/dashboard');
      return;
    }

    // Token exists, set auth as checked
    setAuthChecked(true);
    
    const userStr = localStorage.getItem('user');
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        setCurrentUser(user);
      } catch (e) {
        console.error('Error parsing user data:', e);
      }
    }
    
    loadAllData();
    // Auto-refresh every 30 seconds
    const interval = setInterval(loadAllData, 30000);
    
    // Listen for tool execution events from other pages
    const handleToolExecutionCreated = () => {
      console.log('📊 Dashboard: Tool execution created event received, refreshing data...');
      loadAllData();
    };
    
    const handleToolExecutionCompleted = () => {
      console.log('📊 Dashboard: Tool execution completed event received, refreshing data...');
      loadAllData();
    };
    
    window.addEventListener('toolExecutionCreated', handleToolExecutionCreated);
    window.addEventListener('toolExecutionCompleted', handleToolExecutionCompleted);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('toolExecutionCreated', handleToolExecutionCreated);
      window.removeEventListener('toolExecutionCompleted', handleToolExecutionCompleted);
    };
  }, [router]);

  // Show loading while checking auth
  if (!authChecked) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p>Checking authentication...</p>
        </div>
      </div>
    );
  }

  // Chart configurations
  const findingsChartOptions = {
    chart: {
      type: 'area',
      height: 350,
      toolbar: { show: false },
      zoom: { enabled: false }
    },
    dataLabels: { enabled: false },
    stroke: { curve: 'smooth', width: 2 },
    fill: {
      type: 'gradient',
      gradient: {
        shadeIntensity: 1,
        opacityFrom: 0.7,
        opacityTo: 0.3,
        stops: [0, 100]
      }
    },
    xaxis: {
      type: 'datetime',
      labels: { style: { colors: '#9CA3AF' } }
    },
    yaxis: {
      labels: { style: { colors: '#9CA3AF' } }
    },
    theme: { mode: 'dark' },
    colors: ['#3B82F6'],
    grid: { borderColor: '#374151' }
  };

  const attacksChartOptions = {
    chart: {
      type: 'bar',
      height: 350,
      horizontal: true,
      toolbar: { show: false }
    },
    plotOptions: {
      bar: {
        borderRadius: 4,
        horizontal: true
      }
    },
    dataLabels: { enabled: true },
    xaxis: {
      categories: attacksByCategory?.categories || [],
      labels: { style: { colors: '#9CA3AF' } }
    },
    yaxis: {
      labels: { style: { colors: '#9CA3AF' } }
    },
    theme: { mode: 'dark' },
    colors: ['#EF4444', '#F59E0B', '#10B981', '#8B5CF6', '#3B82F6'],
    grid: { borderColor: '#374151' }
  };

  const executionsChartOptions = {
    chart: {
      type: 'line',
      height: 350,
      toolbar: { show: false }
    },
    dataLabels: { enabled: false },
    stroke: { curve: 'smooth', width: 3 },
    xaxis: {
      type: 'datetime',
      labels: { style: { colors: '#9CA3AF' } }
    },
    yaxis: {
      labels: { style: { colors: '#9CA3AF' } }
    },
    theme: { mode: 'dark' },
    colors: ['#10B981'],
    grid: { borderColor: '#374151' }
  };

  // Performance metrics donut chart options
  const getPerformanceDonutOptions = (label, color) => ({
    chart: {
      type: 'donut',
      height: 250
    },
    labels: [label, 'Remaining'],
    colors: [color, '#374151'],
    dataLabels: {
      enabled: true,
      formatter: function (val) {
        const num = typeof val === 'number' ? val : parseFloat(val) || 0;
        return num.toFixed(1) + "%"
      },
      style: {
        colors: ['#FFFFFF']
      }
    },
    plotOptions: {
      pie: {
        donut: {
          size: '75%',
          labels: {
            show: true,
            name: {
              show: true,
              fontSize: '16px',
              color: '#9CA3AF'
            },
            value: {
              show: true,
              fontSize: '24px',
              fontWeight: 'bold',
              color: '#FFFFFF',
              formatter: function (val) {
                const num = typeof val === 'number' ? val : parseFloat(val) || 0;
                return num.toFixed(1) + "%"
              }
            }
          }
        }
      }
    },
    theme: { mode: 'dark' },
    legend: { show: false }
  });


  if (loading) {
    return (
      <Layout title="Dashboard - BountyFlow">
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-gray-400">Loading dashboard...</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Dashboard - BountyFlow">
      <Head>
        <title>Dashboard - BountyFlow</title>
      </Head>

      <div className="p-6">
      {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-white mb-2">
            🎯 Dashboard Overview
          </h1>
          <p className="text-gray-400">
            Welcome back{currentUser ? `, ${currentUser.username}` : ''}! Monitor your penetration testing activities and insights.
          </p>
        </div>

        {/* KPI Cards - Similar to OpenAEV */}
        {summaryStats && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {/* Projects Card */}
            <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-6 border border-gray-700 shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center overflow-hidden">
                  <img src="/icon/project.png" alt="Projects" className="w-full h-full object-cover" />
                </div>
                <div className={`px-2 py-1 rounded text-xs font-semibold ${
                  summaryStats.projects.growth_24h > 0 
                    ? 'bg-green-500/20 text-green-400' 
                    : summaryStats.projects.growth_24h < 0
                    ? 'bg-red-500/20 text-red-400'
                    : 'bg-gray-700 text-gray-400'
                }`}>
                  {summaryStats.projects.growth_24h > 0 
                    ? `+${summaryStats.projects.growth_24h}` 
                    : summaryStats.projects.growth_24h < 0
                    ? `${summaryStats.projects.growth_24h}`
                    : '0'} (24h)
                </div>
              </div>
              <div>
                <p className="text-3xl font-bold text-white mb-1">{summaryStats.projects.total}</p>
                <p className="text-sm text-gray-400">Projects</p>
              </div>
            </div>

            {/* Targets Card */}
            <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-6 border border-gray-700 shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 bg-red-600 rounded-lg flex items-center justify-center overflow-hidden">
                  <img src="/icon/Targets.png" alt="Targets" className="w-full h-full object-cover" />
                </div>
                <div className="px-2 py-1 rounded text-xs font-semibold bg-gray-700 text-gray-400">
                  All Time
                </div>
              </div>
              <div>
                <p className="text-3xl font-bold text-white mb-1">{summaryStats.targets.total}</p>
                <p className="text-sm text-gray-400">Targets</p>
              </div>
            </div>

            {/* Findings Card */}
            <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-6 border border-gray-700 shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 bg-yellow-600 rounded-lg flex items-center justify-center overflow-hidden">
                  <img src="/icon/Findings.png" alt="Findings" className="w-full h-full object-cover" />
          </div>
                <div className={`px-2 py-1 rounded text-xs font-semibold ${
                  summaryStats.findings.growth_24h > 0 
                    ? 'bg-green-500/20 text-green-400' 
                    : summaryStats.findings.growth_24h < 0
                    ? 'bg-red-500/20 text-red-400'
                    : 'bg-gray-700 text-gray-400'
                }`}>
                  {summaryStats.findings.growth_24h > 0 
                    ? `+${summaryStats.findings.growth_24h}` 
                    : summaryStats.findings.growth_24h < 0
                    ? `${summaryStats.findings.growth_24h}`
                    : '0'} (24h)
        </div>
              </div>
              <div>
                <p className="text-3xl font-bold text-white mb-1">{summaryStats.findings.total}</p>
                <p className="text-sm text-gray-400">Findings</p>
              </div>
              </div>
              
            {/* Tool Executions Card */}
            <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-6 border border-gray-700 shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 bg-purple-600 rounded-lg flex items-center justify-center overflow-hidden">
                  <img src="/icon/ToolExecutions.png" alt="Tool Executions" className="w-full h-full object-cover" />
                </div>
                <div className={`px-2 py-1 rounded text-xs font-semibold ${
                  summaryStats.tool_executions.growth_24h > 0 
                    ? 'bg-green-500/20 text-green-400' 
                    : summaryStats.tool_executions.growth_24h < 0
                    ? 'bg-red-500/20 text-red-400'
                    : 'bg-gray-700 text-gray-400'
                }`}>
                  {summaryStats.tool_executions.growth_24h > 0 
                    ? `+${summaryStats.tool_executions.growth_24h}` 
                    : summaryStats.tool_executions.growth_24h < 0
                    ? `${summaryStats.tool_executions.growth_24h}`
                    : '0'} (24h)
                </div>
              </div>
              <div>
                <p className="text-3xl font-bold text-white mb-1">{summaryStats.tool_executions.total}</p>
                <p className="text-sm text-gray-400">Tool Executions</p>
              </div>
            </div>
          </div>
        )}

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Findings Trend Chart */}
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-white">Findings Trend</h3>
              <span className="text-sm text-gray-400">Last 30 days</span>
            </div>
            {findingsTrend && findingsTrend.series && findingsTrend.series.length > 0 && findingsTrend.series[0]?.data ? (
              <>
                <Chart
                  options={findingsChartOptions}
                  series={findingsTrend.series}
                  type="area"
                  height={350}
                />
                {findingsTrend.total_all_time !== undefined && (
                  <div className="mt-2 text-xs text-gray-400 text-center">
                    {findingsTrend.total_findings} findings in last 30 days | {findingsTrend.total_all_time} total findings
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-[350px] text-gray-400">
                <i className="fas fa-chart-area text-4xl mb-2 opacity-50"></i>
                <p>No findings data available</p>
                {findingsTrend && (
                  <p className="text-xs mt-1 text-gray-500">
                    {findingsTrend.series?.[0]?.data?.length === 0 ? 'No findings in the last 30 days' : 'Loading...'}
                  </p>
                )}
                {!findingsTrend && (
                  <p className="text-xs mt-1 text-red-400">Failed to load data. Check console for errors.</p>
                )}
                </div>
            )}
              </div>
              
          {/* Tool Executions Chart */}
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-white">Tool Executions</h3>
              <span className="text-sm text-gray-400">Last 30 days</span>
            </div>
            {toolExecutions && toolExecutions.series && toolExecutions.series.length > 0 && toolExecutions.series[0]?.data ? (
              <>
                <Chart
                  options={executionsChartOptions}
                  series={toolExecutions.series}
                  type="line"
                  height={350}
                />
                {toolExecutions.total_all_time !== undefined && (
                  <div className="mt-2 text-xs text-gray-400 text-center">
                    {toolExecutions.total} executions in last 30 days | {toolExecutions.total_all_time} total executions
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-[350px] text-gray-400">
                <i className="fas fa-chart-line text-4xl mb-2 opacity-50"></i>
                <p>No tool execution data available</p>
                {toolExecutions && (
                  <p className="text-xs mt-1 text-gray-500">
                    {toolExecutions.series?.[0]?.data?.length === 0 ? 'No executions in the last 30 days' : 'Loading...'}
                  </p>
                )}
                {!toolExecutions && (
                  <p className="text-xs mt-1 text-red-400">Failed to load data. Check console for errors.</p>
                )}
              </div>
            )}
          </div>
            </div>

        {/* Performance Metrics Overview - Similar to OpenAEV */}
        {performanceMetrics && (
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 mb-8">
            <h3 className="text-xl font-bold text-white mb-6">Performance Overview</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Prevention */}
              <div className="text-center">
                <div className="mb-4">
                  <Chart
                    options={getPerformanceDonutOptions('Prevention', '#EF4444')}
                    series={[performanceMetrics.prevention, 100 - performanceMetrics.prevention]}
                    type="donut"
                    height={250}
                  />
                  </div>
                <div className="flex items-center justify-center mb-2">
                  <i className="fas fa-shield-alt text-red-500 text-2xl mr-2"></i>
                  <h4 className="text-lg font-semibold text-white">Prevention</h4>
                </div>
                <p className="text-gray-400 text-sm">{performanceMetrics.medium_low} medium/low findings</p>
              </div>
              
              {/* Detection */}
              <div className="text-center">
                <div className="mb-4">
                  <Chart
                    options={getPerformanceDonutOptions('Detection', '#F59E0B')}
                    series={[performanceMetrics.detection, 100 - performanceMetrics.detection]}
                    type="donut"
                    height={250}
                  />
                  </div>
                <div className="flex items-center justify-center mb-2">
                  <i className="fas fa-eye text-yellow-500 text-2xl mr-2"></i>
                  <h4 className="text-lg font-semibold text-white">Detection</h4>
                </div>
                <p className="text-gray-400 text-sm">{performanceMetrics.critical_high} critical/high detected</p>
              </div>
              
              {/* Human Response */}
              <div className="text-center">
                <div className="mb-4">
                  <Chart
                    options={getPerformanceDonutOptions('Human Response', '#10B981')}
                    series={[performanceMetrics.human_response, 100 - performanceMetrics.human_response]}
                    type="donut"
                    height={250}
                  />
                  </div>
                <div className="flex items-center justify-center mb-2">
                  <i className="fas fa-user text-green-500 text-2xl mr-2"></i>
                  <h4 className="text-lg font-semibold text-white">Human Response</h4>
                </div>
                <p className="text-gray-400 text-sm">{performanceMetrics.tool_executions} tool executions</p>
              </div>
            </div>
          </div>
        )}

        {/* Attack Categories Chart */}
        {attacksByCategory && attacksByCategory.data && attacksByCategory.data.length > 0 && (
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 mb-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-white">Top Attack Patterns</h3>
              <span className="text-sm text-gray-400">By Category</span>
                </div>
            <Chart
              options={attacksChartOptions}
              series={[{ name: 'Attacks', data: attacksByCategory.data }]}
              type="bar"
              height={350}
            />
              </div>
        )}

        {/* MITRE ATT&CK Coverage */}
        {mitreCoverage && mitreCoverage.phases && (
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 mb-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-white">MITRE ATT&CK Coverage</h3>
              <span className="text-sm text-gray-400">{mitreCoverage.total_techniques} techniques across {mitreCoverage.phases.filter(p => p.count > 0).length} phases</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              {mitreCoverage.phases.map((phase) => {
                const severityColor = phase.count > 0
                  ? phase.techniques.some(t => t.severity === 'critical') ? 'bg-red-600'
                  : phase.techniques.some(t => t.severity === 'high') ? 'bg-orange-600'
                  : 'bg-blue-600'
                  : 'bg-gray-600';
                return (
                <div key={phase.phase} className={`bg-gray-700 rounded-lg p-4 ${phase.count === 0 ? 'opacity-50' : ''}`}>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-semibold text-white">{phase.phase}</h4>
                    <span className={`text-xs ${severityColor} text-white px-2 py-1 rounded`}>{phase.count}</span>
                  </div>
                  <div className="space-y-1">
                    {phase.techniques.slice(0, 3).map((tech, idx) => (
                      <div key={idx} className="text-xs text-gray-400 truncate" title={tech.title}>
                        <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${
                          tech.severity === 'critical' ? 'bg-red-500' :
                          tech.severity === 'high' ? 'bg-orange-500' :
                          tech.severity === 'medium' ? 'bg-yellow-500' : 'bg-gray-500'
                        }`}></span>
                        {tech.title}
                      </div>
                    ))}
                    {phase.count > 3 && (
                      <div className="text-xs text-gray-500">+{phase.count - 3} more</div>
                    )}
                    {phase.count === 0 && (
                      <div className="text-xs text-gray-500 italic">No coverage</div>
                    )}
                  </div>
                </div>
                );
              })}
            </div>
          </div>
        )}


        {/* Recent Projects */}
        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-white">Recent Projects</h3>
            <Link href="/projects" className="text-blue-400 hover:text-blue-300 text-sm">
              View All →
                </Link>
              </div>
              
              {projects.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {projects.slice(0, 6).map((project) => (
                <Link key={project.id} href={`/projects/${project.id}`}>
                  <div className="bg-gray-700 rounded-lg p-4 hover:bg-gray-600 transition-colors cursor-pointer">
                    <div className="flex items-start justify-between mb-2">
                      <h4 className="text-white font-semibold">{project.name}</h4>
                      <span className={`text-xs px-2 py-1 rounded ${
                        project.status === 'active' ? 'bg-green-600' : 'bg-gray-600'
                      } text-white`}>
                          {project.status}
                        </span>
                    </div>
                    <p className="text-gray-400 text-sm mb-3 line-clamp-2">{project.description}</p>
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>
                        <i className="fas fa-bullseye mr-1"></i>
                        {project.target_count || 0} targets
                      </span>
                      <span>
                        <i className="fas fa-calendar mr-1"></i>
                        {new Date(project.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                </Link>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <i className="fas fa-folder-open text-gray-500 text-4xl mb-4"></i>
              <p className="text-gray-400 mb-4">No projects found</p>
              <Link href="/projects" className="inline-block bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg">
                    Create Your First Project
              </Link>
                </div>
              )}
            </div>
          </div>
    </Layout>
  );
}
