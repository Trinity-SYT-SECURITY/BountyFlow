import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Layout from '../components/Layout';

/**
 * Search across every project you can see.
 *
 * The question this exists for: three hundred engagements, and a host you
 * remember testing but not where. It is not only hosts — the same query runs
 * over findings, credentials, files, tool commands and their output, and
 * report bodies, so a CVE, a username or a fragment of scan output all find
 * their way home.
 */
const TYPES = [
  { value: 'target', label: 'Targets' },
  { value: 'finding', label: 'Findings' },
  { value: 'discovered_user', label: 'Credentials' },
  { value: 'discovered_file', label: 'Files' },
  { value: 'execution', label: 'Tool runs' },
  { value: 'project', label: 'Projects' },
  { value: 'report', label: 'Reports' },
  { value: 'attack_flow', label: 'Attack builders' },
  { value: 'tool', label: 'Tools' },
];

const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'];

export default function Search() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [types, setTypes] = useState([]);
  const [projectId, setProjectId] = useState('');
  const [severity, setSeverity] = useState('');
  const [status, setStatus] = useState('');
  const [targetType, setTargetType] = useState('');
  const [sensitiveOnly, setSensitiveOnly] = useState(false);
  const [since, setSince] = useState('');
  const [until, setUntil] = useState('');
  const [projects, setProjects] = useState([]);
  const [result, setResult] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('http://localhost:8002/api/v1/projects')
      .then(r => (r.ok ? r.json() : []))
      .then(setProjects)
      .catch(() => setProjects([]));
  }, []);

  const run = useCallback(async (overrides = {}) => {
    const q = overrides.q !== undefined ? overrides.q : query;
    setIsSearching(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (types.length) params.set('types', types.join(','));
      if (projectId) params.set('project_id', projectId);
      if (severity) params.set('severity', severity);
      if (status) params.set('status', status);
      if (targetType) params.set('target_type', targetType);
      if (sensitiveOnly) params.set('sensitive_only', 'true');
      if (since) params.set('since', since);
      if (until) params.set('until', until);

      const response = await fetch(
        `http://localhost:8002/api/v1/search?${params.toString()}`);
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        setError(detail.detail || response.statusText);
        setResult(null);
        return;
      }
      setResult(await response.json());
    } catch (e) {
      setError(e.message);
      setResult(null);
    } finally {
      setIsSearching(false);
    }
  }, [query, types, projectId, severity, status, targetType, sensitiveOnly, since, until]);

  // Arriving from the header search box carries the term in the URL.
  useEffect(() => {
    if (!router.isReady) return;
    const q = router.query.q;
    if (typeof q === 'string' && q) {
      setQuery(q);
      run({ q });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, router.query.q]);

  const toggleType = (value) => {
    setTypes(prev => (prev.includes(value)
      ? prev.filter(t => t !== value)
      : [...prev, value]));
  };

  return (
    <Layout>
      <Head><title>Search - BountyFlow</title></Head>

      <div className="p-6">
        <h1 className="text-2xl font-bold text-white mb-1">Search</h1>
        <p className="text-gray-400 text-sm mb-6">
          Across every project you have access to. A hostname, a CVE, a username,
          a port, or a phrase from tool output.
        </p>

        <form
          onSubmit={(e) => { e.preventDefault(); run(); }}
          className="bg-gray-800 rounded-lg border border-gray-700 p-4 mb-6"
        >
          <div className="flex gap-2 mb-4">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. 10.10.0.5, svc_deploy, CVE-2021-44228, /etc/shadow"
              className="flex-1 bg-gray-900 text-white px-4 py-2 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={isSearching}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 px-6 py-2 rounded-lg font-medium text-white"
            >
              {isSearching ? 'Searching…' : 'Search'}
            </button>
          </div>

          <div className="flex flex-wrap gap-2 mb-4">
            {TYPES.map(t => (
              <button
                key={t.value}
                type="button"
                onClick={() => toggleType(t.value)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  types.includes(t.value)
                    ? 'bg-blue-600 border-blue-500 text-white'
                    : 'bg-gray-900 border-gray-600 text-gray-300 hover:border-gray-500'
                }`}
              >
                {t.label}
              </button>
            ))}
            {types.length > 0 && (
              <button type="button" onClick={() => setTypes([])}
                      className="px-3 py-1 text-xs text-gray-400 hover:text-white">
                clear
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <label className="text-xs text-gray-400">
              Project
              <select value={projectId} onChange={(e) => setProjectId(e.target.value)}
                      className="mt-1 w-full bg-gray-900 text-white text-sm px-2 py-1.5 rounded border border-gray-600">
                <option value="">All</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </label>

            <label className="text-xs text-gray-400">
              Severity
              <select value={severity} onChange={(e) => setSeverity(e.target.value)}
                      className="mt-1 w-full bg-gray-900 text-white text-sm px-2 py-1.5 rounded border border-gray-600">
                <option value="">Any</option>
                {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>

            <label className="text-xs text-gray-400">
              Status
              <input value={status} onChange={(e) => setStatus(e.target.value)}
                     placeholder="open, completed…"
                     className="mt-1 w-full bg-gray-900 text-white text-sm px-2 py-1.5 rounded border border-gray-600" />
            </label>

            <label className="text-xs text-gray-400">
              Target type
              <select value={targetType} onChange={(e) => setTargetType(e.target.value)}
                      className="mt-1 w-full bg-gray-900 text-white text-sm px-2 py-1.5 rounded border border-gray-600">
                <option value="">Any</option>
                <option value="domain">domain</option>
                <option value="ip">ip</option>
                <option value="url">url</option>
                <option value="network">network</option>
              </select>
            </label>

            <label className="text-xs text-gray-400">
              From
              <input type="date" value={since} onChange={(e) => setSince(e.target.value)}
                     className="mt-1 w-full bg-gray-900 text-white text-sm px-2 py-1.5 rounded border border-gray-600" />
            </label>

            <label className="text-xs text-gray-400">
              To
              <input type="date" value={until} onChange={(e) => setUntil(e.target.value)}
                     className="mt-1 w-full bg-gray-900 text-white text-sm px-2 py-1.5 rounded border border-gray-600" />
            </label>
          </div>

          <label className="flex items-center gap-2 mt-3 text-xs text-gray-400">
            <input type="checkbox" checked={sensitiveOnly}
                   onChange={(e) => setSensitiveOnly(e.target.checked)} />
            Only files marked sensitive
          </label>
        </form>

        {error && (
          <div className="bg-red-900/40 border border-red-700 text-red-200 rounded-lg p-3 mb-6 text-sm">
            {error}
          </div>
        )}

        {result && <Results result={result} />}

        {!result && !error && (
          <p className="text-gray-500 text-sm">
            Searching {projects.length} project{projects.length === 1 ? '' : 's'}.
          </p>
        )}
      </div>
    </Layout>
  );
}

/* One block per entity type, each row linking back to where the record lives. */
function Results({ result }) {
  const groups = Object.entries(result.results || {}).filter(([, rows]) => rows.length);

  if (!groups.length) {
    return (
      <p className="text-gray-400 text-sm">
        Nothing matched
        {result.query ? <> <span className="text-white">&ldquo;{result.query}&rdquo;</span></> : ''}
        {' '}in {result.searched_projects} project
        {result.searched_projects === 1 ? '' : 's'}.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-gray-400 text-sm">
        {result.total} result{result.total === 1 ? '' : 's'} across{' '}
        {result.searched_projects} project{result.searched_projects === 1 ? '' : 's'}.
      </p>

      {groups.map(([type, rows]) => (
        <div key={type} className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
          <div className="px-4 py-2 bg-gray-700/50 flex items-center justify-between">
            <h2 className="font-semibold text-white text-sm">
              {(TYPES.find(t => t.value === type) || {}).label || type}
            </h2>
            <span className="text-xs text-gray-400">{rows.length}</span>
          </div>
          <div className="divide-y divide-gray-700">
            {rows.map((row) => <Row key={`${type}-${row.id}`} type={type} row={row} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

function Row({ type, row }) {
  const title = row.target_value || row.title || row.name || row.username
    || row.filename || row.command_executed || `#${row.id}`;
  const detail = row.description || row.notes || row.output_excerpt
    || row.excerpt || row.file_path || row.command_template;

  return (
    <div className="px-4 py-3 hover:bg-gray-700/40">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-white text-sm font-medium truncate">{title}</div>
          {detail && (
            <div className="text-gray-400 text-xs mt-0.5 line-clamp-2 break-all">
              {String(detail).slice(0, 240)}
            </div>
          )}
          <div className="flex flex-wrap gap-2 mt-1.5 text-xs">
            {row.severity && (
              <span className="px-2 py-0.5 rounded-full bg-red-900/60 text-red-200">
                {row.severity}
              </span>
            )}
            {row.status && (
              <span className="px-2 py-0.5 rounded-full bg-gray-700 text-gray-300">
                {row.status}
              </span>
            )}
            {row.target_type && (
              <span className="px-2 py-0.5 rounded-full bg-gray-700 text-gray-300">
                {row.target_type}
              </span>
            )}
            {row.is_sensitive && String(row.is_sensitive).toLowerCase() === 'true' && (
              <span className="px-2 py-0.5 rounded-full bg-yellow-900/60 text-yellow-200">
                sensitive
              </span>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          {row.project_id && (
            <Link href={`/projects/${row.project_id}`}
                  className="text-blue-400 hover:text-blue-300 text-xs whitespace-nowrap">
              {row.project_name || `Project ${row.project_id}`} →
            </Link>
          )}
          {row.created_at && (
            <div className="text-gray-500 text-xs mt-1">
              {new Date(row.created_at).toLocaleDateString()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
