import { useEffect, useState } from 'react';
import Head from 'next/head';
import Layout from '../components/Layout';
import { useToast } from '../components/Toast';

/**
 * Account settings. Today that means API keys.
 *
 * A key is what lets tooling — the MCP server, a script, a CI job — act as you
 * without holding your password. It is shown once, on creation, and stored
 * hashed.
 */
export default function Settings() {
  const toast = useToast();
  const [keys, setKeys] = useState([]);
  const [name, setName] = useState('');
  const [issued, setIssued] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = async () => {
    try {
      const response = await fetch('http://localhost:8002/api/v1/auth/api-keys');
      if (!response.ok) return;
      const data = await response.json();
      setKeys(data.keys || []);
    } catch (e) {
      console.error('Failed to load API keys:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const create = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      const response = await fetch('http://localhost:8002/api/v1/auth/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await response.json();
      if (!response.ok) {
        toast.error(data.detail || 'Could not create the key');
        return;
      }
      setIssued(data);
      setName('');
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const revoke = async (key) => {
    try {
      const response = await fetch(
        `http://localhost:8002/api/v1/auth/api-keys/${key.id}`, { method: 'DELETE' });
      if (!response.ok && response.status !== 204) {
        const data = await response.json().catch(() => ({}));
        toast.error(data.detail || 'Could not revoke the key');
        return;
      }
      toast.success(`Revoked "${key.name}"`);
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <Layout>
      <Head><title>Settings - BountyFlow</title></Head>

      <div className="p-6 max-w-4xl">
        <h1 className="text-2xl font-bold text-white mb-1">Settings</h1>
        <p className="text-gray-400 text-sm mb-6">API keys for tooling.</p>

        <div className="bg-gray-800 rounded-lg border border-gray-700 p-5 mb-6">
          <h2 className="text-lg font-semibold text-white mb-2">API keys</h2>
          <p className="text-gray-400 text-sm mb-4">
            A key acts as you: the projects you can see are the projects it can
            see, and everything it does is recorded under your name. Revoking it
            takes effect immediately. Used by the{' '}
            <span className="text-gray-300">BountyFlow MCP server</span> so a model
            can read an engagement and record what it finds.
          </p>

          <form onSubmit={create} className="flex gap-2 mb-5">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="What is this key for? e.g. MCP on my laptop"
              className="flex-1 bg-gray-900 text-white px-3 py-2 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none text-sm"
            />
            <button type="submit"
                    className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg text-white text-sm font-medium">
              Create key
            </button>
          </form>

          {issued && (
            <div className="bg-green-900/30 border border-green-700 rounded-lg p-4 mb-5">
              <div className="text-green-200 text-sm font-medium mb-2">
                Copy this now — it cannot be shown again.
              </div>
              <code className="block bg-gray-900 text-green-300 text-xs p-3 rounded break-all">
                {issued.key}
              </code>
              <button
                onClick={() => { setIssued(null); }}
                className="mt-3 text-xs text-gray-400 hover:text-white"
              >
                I have copied it
              </button>
            </div>
          )}

          {isLoading ? (
            <p className="text-gray-400 text-sm">Loading…</p>
          ) : keys.length === 0 ? (
            <p className="text-gray-500 text-sm">No keys yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 text-xs uppercase">
                  <th className="py-2">Name</th>
                  <th className="py-2">Prefix</th>
                  <th className="py-2">Created</th>
                  <th className="py-2">Last used</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {keys.map(key => (
                  <tr key={key.id} className={key.active ? '' : 'opacity-50'}>
                    <td className="py-2 text-white">{key.name}</td>
                    <td className="py-2 text-gray-400 font-mono text-xs">{key.prefix}…</td>
                    <td className="py-2 text-gray-400 text-xs">
                      {key.created_at ? new Date(key.created_at).toLocaleDateString() : '—'}
                    </td>
                    <td className="py-2 text-gray-400 text-xs">
                      {key.last_used_at
                        ? new Date(key.last_used_at).toLocaleString()
                        : 'never'}
                    </td>
                    <td className="py-2 text-right">
                      {key.active ? (
                        <button onClick={() => revoke(key)}
                                className="text-red-400 hover:text-red-300 text-xs">
                          Revoke
                        </button>
                      ) : (
                        <span className="text-gray-500 text-xs">revoked</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="bg-gray-800 rounded-lg border border-gray-700 p-5">
          <h2 className="text-lg font-semibold text-white mb-2">Using a key with MCP</h2>
          <pre className="bg-gray-900 text-gray-300 text-xs p-3 rounded overflow-x-auto">
{`claude mcp add bountyflow \\
  --env BOUNTYFLOW_URL=http://localhost:8002 \\
  --env BOUNTYFLOW_API_KEY=bf_your_key \\
  -- python /path/to/BountyFlow-main/mcp/bountyflow_mcp.py`}
          </pre>
          <p className="text-gray-500 text-xs mt-3">
            The server can read your engagements and record targets, findings and
            notes. It cannot run tools or delete anything.
          </p>
        </div>
      </div>
    </Layout>
  );
}
