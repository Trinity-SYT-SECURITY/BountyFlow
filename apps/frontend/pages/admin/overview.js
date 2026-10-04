import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Layout from '../../components/Layout';
import { useToast } from '../../components/Toast';

/**
 * Every project on the instance, its team, and how far along it is.
 *
 * A superuser is on no project and may open all of them, which is the whole
 * point of this screen: what is everyone working on, who is free, and which
 * engagements have targets nobody has taken.
 */
const ROLE_STYLE = {
  owner: 'bg-purple-900/60 text-purple-200',
  editor: 'bg-blue-900/60 text-blue-200',
  viewer: 'bg-gray-700 text-gray-300',
};

export default function AdminOverview() {
  const toast = useToast();
  const [overview, setOverview] = useState(null);
  const [load, setLoad] = useState(null);
  const [users, setUsers] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [assignTo, setAssignTo] = useState({});
  const [error, setError] = useState(null);

  const refresh = async () => {
    try {
      const [o, l, u] = await Promise.all([
        fetch('http://localhost:8002/api/v1/admin/overview'),
        fetch('http://localhost:8002/api/v1/admin/team-load'),
        fetch('http://localhost:8002/api/v1/admin/users'),
      ]);
      if (!o.ok) {
        setError(o.status === 403
          ? 'This page is for administrators.'
          : `Could not load the overview (${o.status})`);
        return;
      }
      setOverview(await o.json());
      if (l.ok) setLoad(await l.json());
      if (u.ok) setUsers(await u.json());
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => { refresh(); }, []);

  const assign = async (projectId) => {
    const username = assignTo[projectId]?.username;
    const role = assignTo[projectId]?.role || 'editor';
    if (!username) return;
    try {
      const response = await fetch(
        `http://localhost:8002/api/v1/admin/projects/${projectId}/members`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ usernames: [username], role }),
        });
      const data = await response.json();
      if (!response.ok) {
        toast.error(data.detail || 'Could not assign');
        return;
      }
      toast.success(
        data.added.length
          ? `Added ${data.added.join(', ')} as ${role}`
          : `Updated ${data.role_updated.join(', ') || username} to ${role}`);
      setAssignTo(prev => ({ ...prev, [projectId]: { username: '', role } }));
      refresh();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const remove = async (projectId, userId, username) => {
    try {
      const response = await fetch(
        `http://localhost:8002/api/v1/admin/projects/${projectId}/members/${userId}`,
        { method: 'DELETE' });
      if (!response.ok && response.status !== 204) {
        const data = await response.json().catch(() => ({}));
        toast.error(data.detail || 'Could not remove');
        return;
      }
      toast.success(`Removed ${username}`);
      refresh();
    } catch (e) {
      toast.error(e.message);
    }
  };

  return (
    <Layout>
      <Head><title>All Projects - Admin - BountyFlow</title></Head>

      <div className="p-6">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-2xl font-bold text-white">All Projects</h1>
          <Link href="/admin" className="text-blue-400 hover:text-blue-300 text-sm">
            ← Admin dashboard
          </Link>
        </div>
        <p className="text-gray-400 text-sm mb-6">
          Every engagement on this instance, who is on it, and what is left.
        </p>

        {error && (
          <div className="bg-red-900/40 border border-red-700 text-red-200 rounded-lg p-3 text-sm">
            {error}
          </div>
        )}

        {overview && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {[
              ['Projects', overview.totals.projects],
              ['Targets', overview.totals.targets],
              ['Findings', overview.totals.findings],
              ['Tool runs', overview.totals.tool_executions],
            ].map(([label, value]) => (
              <div key={label} className="bg-gray-800 rounded-lg border border-gray-700 p-4">
                <div className="text-gray-400 text-xs uppercase">{label}</div>
                <div className="text-2xl font-bold text-white">{value}</div>
              </div>
            ))}
          </div>
        )}

        {load && (
          <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden mb-6">
            <div className="px-4 py-2 bg-gray-700/50 font-semibold text-white text-sm">
              Who is on what
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-gray-400 text-xs uppercase">
                  <tr>
                    <th className="px-4 py-2">User</th>
                    <th className="px-4 py-2">Created</th>
                    <th className="px-4 py-2">Assigned</th>
                    <th className="px-4 py-2">Targets claimed</th>
                    <th className="px-4 py-2">Tool runs</th>
                    <th className="px-4 py-2">Findings</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {load.users.map(u => (
                    <tr key={u.user_id} className={u.is_active ? '' : 'opacity-50'}>
                      <td className="px-4 py-2 text-white">
                        {u.username}
                        {u.is_superuser && (
                          <span className="ml-2 px-1.5 py-0.5 bg-purple-900/60 text-purple-200 text-xs rounded">
                            admin
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-gray-300">{u.projects_created}</td>
                      <td className="px-4 py-2 text-gray-300">{u.projects_assigned}</td>
                      <td className="px-4 py-2 text-gray-300">{u.targets_claimed}</td>
                      <td className="px-4 py-2 text-gray-300">{u.tool_executions}</td>
                      <td className="px-4 py-2 text-gray-300">{u.findings_recorded}</td>
                      <td className="px-4 py-2 text-right">
                        <Link href={`/admin/users`} className="text-blue-400 hover:text-blue-300 text-xs">
                          manage
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {overview && (
          <div className="space-y-3">
            {overview.projects.map(project => (
              <div key={project.id}
                   className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
                <button
                  onClick={() => setExpanded(expanded === project.id ? null : project.id)}
                  className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-700/40 text-left"
                >
                  <div className="min-w-0">
                    <div className="text-white font-medium">
                      {project.name}
                      <span className="ml-2 text-xs text-gray-400">{project.status}</span>
                    </div>
                    <div className="text-gray-400 text-xs mt-0.5">
                      owner {project.owner || '—'} · {project.team_size} on the team ·{' '}
                      {project.counts.targets} targets ({project.unclaimed_targets} unclaimed) ·{' '}
                      {project.counts.findings} findings · {project.counts.tool_executions} runs
                    </div>
                  </div>
                  <span className="text-gray-400 text-xs shrink-0 ml-4">
                    {expanded === project.id ? 'hide' : 'team'}
                  </span>
                </button>

                {expanded === project.id && (
                  <div className="px-4 pb-4 border-t border-gray-700 pt-3">
                    <div className="flex flex-wrap gap-2 mb-4">
                      {project.team.map(member => (
                        <span key={member.user_id}
                              className="inline-flex items-center gap-2 bg-gray-900 border border-gray-700 rounded-full px-3 py-1 text-xs">
                          <span className="text-white">{member.username}</span>
                          <span className={`px-1.5 py-0.5 rounded-full ${
                            ROLE_STYLE[member.role] || ROLE_STYLE.viewer}`}>
                            {member.role}
                          </span>
                          {member.user_id !== project.created_by && (
                            <button
                              onClick={() => remove(project.id, member.user_id, member.username)}
                              className="text-red-400 hover:text-red-300"
                              title="Remove from this project"
                            >
                              ×
                            </button>
                          )}
                        </span>
                      ))}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={assignTo[project.id]?.username || ''}
                        onChange={(e) => setAssignTo(prev => ({
                          ...prev,
                          [project.id]: { ...prev[project.id], username: e.target.value },
                        }))}
                        className="bg-gray-900 text-white text-sm px-2 py-1.5 rounded border border-gray-600"
                      >
                        <option value="">Add someone…</option>
                        {users
                          .filter(u => !project.team.some(m => m.user_id === u.id))
                          .map(u => (
                            <option key={u.id} value={u.username}>{u.username}</option>
                          ))}
                      </select>
                      <select
                        value={assignTo[project.id]?.role || 'editor'}
                        onChange={(e) => setAssignTo(prev => ({
                          ...prev,
                          [project.id]: { ...prev[project.id], role: e.target.value },
                        }))}
                        className="bg-gray-900 text-white text-sm px-2 py-1.5 rounded border border-gray-600"
                      >
                        <option value="editor">editor</option>
                        <option value="viewer">viewer</option>
                        <option value="owner">owner</option>
                      </select>
                      <button
                        onClick={() => assign(project.id)}
                        className="bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded text-white text-sm"
                      >
                        Assign
                      </button>
                      <Link href={`/projects/${project.id}`}
                            className="text-blue-400 hover:text-blue-300 text-sm ml-auto">
                        Open project →
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
