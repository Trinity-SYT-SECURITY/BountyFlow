/**
 * The three builder pages — attack vectors, chains and flows — store the same
 * record and differ only in which prefix they talk to. They used to keep
 * everything in React state and call a backend route that did not exist, so
 * anything built on them was gone on reload.
 *
 * `installApiClient` already rewrites these URLs to same-origin and attaches
 * the bearer token, so plain fetch is all that is needed here.
 */
const BASE = 'http://localhost:8002/api/v1';

/** kind: 'attack-vectors' | 'attack-chains' | 'attack-flows' */
export function attackFlowApi(kind) {
  const root = `${BASE}/${kind}`;

  const parse = async (res, fallback) => {
    if (!res.ok) {
      let detail = res.statusText;
      try {
        detail = (await res.json()).detail || detail;
      } catch {
        /* a body that is not JSON tells us nothing extra */
      }
      throw new Error(detail);
    }
    return res.status === 204 ? fallback : res.json();
  };

  return {
    async list(projectId) {
      return parse(await fetch(`${root}/${projectId}`), []);
    },

    async create(projectId, record) {
      return parse(await fetch(root, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, ...record }),
      }));
    },

    async update(id, record) {
      return parse(await fetch(`${root}/item/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record),
      }));
    },

    async remove(id) {
      return parse(await fetch(`${root}/item/${id}`, { method: 'DELETE' }), null);
    },
  };
}
