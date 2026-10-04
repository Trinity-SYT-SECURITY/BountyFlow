import { useEffect, useState } from 'react';
import { useToast } from './Toast';

/**
 * Who is on this project, what each of them has done, and what nobody has taken.
 *
 * This is the answer to "assign the same engagement to B, C and D, and make
 * sure they do not repeat each other". Membership is what gives the three of
 * them sight of everything; the per-member counts and the unclaimed total are
 * what stop two people scanning the same host.
 *
 * Only an owner sees the controls — the middleware refuses the writes anyway,
 * so showing them to an editor would only produce a 403 they cannot act on.
 */
const ROLE_STYLE = {
  owner: 'bg-purple-900/60 text-purple-200',
  editor: 'bg-blue-900/60 text-blue-200',
  viewer: 'bg-gray-700 text-gray-300',
};

export default function TeamPanel({ projectId, currentUser, onChange }) {
  const toast = useToast();
  const [team, setTeam] = useState(null);
  const [users, setUsers] = useState([]);
  const [selected, setSelected] = useState([]);
  const [role, setRole] = useState('editor');
  const [isBusy, setIsBusy] = useState(false);

  const load = async () => {
    try {
      const response = await fetch(
        `http://localhost:8002/api/v1/projects/${projectId}/team`);
      if (!response.ok) return;
      setTeam(await response.json());
    } catch (e) {
      console.error('Failed to load the team:', e);
    }
  };

  useEffect(() => {
    if (!projectId) return;
    load();
    fetch('http://localhost:8002/api/v1/auth/users?limit=200')
      .then(r => (r.ok ? r.json() : []))
      .then(setUsers)
      .catch(() => setUsers([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const myRole = team?.members?.find(
    m => m.username === currentUser?.username)?.role;
  const canManage = myRole === 'owner' || currentUser?.is_superuser;

  const assign = async () => {
    if (!selected.length) return;
    setIsBusy(true);
    try {
      const response = await fetch(
        `http://localhost:8002/api/v1/projects/${projectId}/members/bulk`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ usernames: selected, role }),
        });
      const data = await response.json();
      if (!response.ok) {
        toast.error(data.detail || 'Could not assign');
        return;
      }
      const parts = [];
      if (data.added.length) parts.push(`added ${data.added.join(', ')}`);
      if (data.already_members.length) {
        parts.push(`${data.already_members.join(', ')} already on it`);
      }
      toast.success(parts.join('; ') || 'Nothing to do');
      setSelected([]);
      await load();
      onChange?.();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setIsBusy(false);
    }
  };

  const changeRole = async (userId, nextRole) => {
    try {
      const response = await fetch(
        `http://localhost:8002/api/v1/projects/${projectId}/members/${userId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: nextRole }),
        });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        toast.error(data.detail || 'Could not change the role');
        return;
      }
      await load();
      onChange?.();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const remove = async (member) => {
    try {
      const response = await fetch(
        `http://localhost:8002/api/v1/projects/${projectId}/members/${member.user_id}`,
        { method: 'DELETE' });
      if (!response.ok && response.status !== 204) {
        const data = await response.json().catch(() => ({}));
        toast.error(data.detail || 'Could not remove');
        return;
      }
      toast.success(`Removed ${member.username}`);
      await load();
      onChange?.();
    } catch (e) {
      toast.error(e.message);
    }
  };

  if (!team) {
    return (
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 text-gray-400 text-sm">
        Loading the team…
      </div>
    );
  }

  const candidates = users.filter(
    u => !team.members.some(m => m.user_id === u.id));

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
      <div className="px-4 py-3 bg-gray-700/40 flex items-center justify-between">
        <h3 className="font-semibold text-white">Team</h3>
        <span className="text-xs text-gray-400">
          {team.targets.claimed}/{team.targets.total} targets claimed
          {team.targets.unclaimed > 0 && (
            <span className="text-yellow-400"> · {team.targets.unclaimed} free</span>
          )}
        </span>
      </div>

      <div className="divide-y divide-gray-700">
        {team.members.map(member => (
          <div key={member.user_id}
               className="px-4 py-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-white text-sm">
                {member.username}
                {member.is_creator && (
                  <span className="ml-2 text-xs text-gray-500">creator</span>
                )}
              </div>
              <div className="text-gray-400 text-xs mt-0.5">
                {member.targets_claimed} claimed · {member.tool_executions} tool runs ·{' '}
                {member.findings_recorded} findings
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {canManage && !member.is_creator ? (
                <select
                  value={member.role}
                  onChange={(e) => changeRole(member.user_id, e.target.value)}
                  className="bg-gray-900 text-white text-xs px-2 py-1 rounded border border-gray-600"
                >
                  <option value="owner">owner</option>
                  <option value="editor">editor</option>
                  <option value="viewer">viewer</option>
                </select>
              ) : (
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                  ROLE_STYLE[member.role] || ROLE_STYLE.viewer}`}>
                  {member.role}
                </span>
              )}
              {canManage && !member.is_creator && (
                <button onClick={() => remove(member)}
                        className="text-red-400 hover:text-red-300 text-xs"
                        title="Remove from this project">
                  remove
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {canManage && (
        <div className="px-4 py-3 border-t border-gray-700">
          <div className="text-xs text-gray-400 mb-2">
            Assign this project to others. They see everything on it — targets,
            findings, tools, the graph and the reports.
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              multiple
              value={selected}
              onChange={(e) => setSelected(
                Array.from(e.target.selectedOptions, o => o.value))}
              className="bg-gray-900 text-white text-sm px-2 py-1 rounded border border-gray-600 min-w-[12rem]"
              size={Math.min(4, Math.max(2, candidates.length))}
            >
              {candidates.map(u => (
                <option key={u.id} value={u.username}>{u.username}</option>
              ))}
            </select>
            <select value={role} onChange={(e) => setRole(e.target.value)}
                    className="bg-gray-900 text-white text-sm px-2 py-1.5 rounded border border-gray-600">
              <option value="editor">editor — can do the work</option>
              <option value="viewer">viewer — read only</option>
              <option value="owner">owner — can manage the team</option>
            </select>
            <button
              onClick={assign}
              disabled={isBusy || !selected.length}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 px-3 py-1.5 rounded text-white text-sm"
            >
              {isBusy ? 'Assigning…' : `Assign ${selected.length || ''}`.trim()}
            </button>
          </div>
        </div>
      )}

      {team.recent_activity.length > 0 && (
        <div className="px-4 py-3 border-t border-gray-700">
          <div className="text-xs text-gray-400 mb-2">
            Recent activity — what has already been tried
          </div>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {team.recent_activity.map(a => (
              <div key={a.id} className="text-xs">
                <span className="text-gray-500">
                  {a.timestamp ? new Date(a.timestamp).toLocaleString() : ''}
                </span>{' '}
                <span className="text-gray-300">{a.tool_name}</span>
                {a.summary && <span className="text-gray-500"> — {a.summary}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
