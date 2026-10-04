import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Layout from '../components/Layout';

/**
 * What is waiting on you, across every engagement you are on.
 *
 * When one person puts three others on a project, each of them needs a single
 * place that answers "what am I meant to be doing" without opening every
 * project in turn.
 */
const ROLE_STYLE = {
  owner: 'bg-purple-900/60 text-purple-200',
  editor: 'bg-blue-900/60 text-blue-200',
  viewer: 'bg-gray-700 text-gray-300',
};

export default function MyWork() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const response = await fetch('http://localhost:8002/api/v1/my/assignments');
        if (!response.ok) {
          const detail = await response.json().catch(() => ({}));
          setError(detail.detail || response.statusText);
          return;
        }
        setData(await response.json());
      } catch (e) {
        setError(e.message);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  return (
    <Layout>
      <Head><title>My Work - BountyFlow</title></Head>

      <div className="p-6">
        <h1 className="text-2xl font-bold text-white mb-1">My Work</h1>
        <p className="text-gray-400 text-sm mb-6">
          Every project you are on, and the targets claimed for you on each.
        </p>

        {isLoading && <p className="text-gray-400 text-sm">Loading…</p>}

        {error && (
          <div className="bg-red-900/40 border border-red-700 text-red-200 rounded-lg p-3 text-sm">
            {error}
          </div>
        )}

        {data && data.projects.length === 0 && (
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 text-gray-400 text-sm">
            You are not on any project yet. Create one from{' '}
            <Link href="/projects" className="text-blue-400 hover:text-blue-300">Projects</Link>,
            or ask an owner to add you to theirs.
          </div>
        )}

        {data && data.projects.length > 0 && (
          <>
            <div className="text-gray-400 text-sm mb-4">
              {data.projects.length} project{data.projects.length === 1 ? '' : 's'},{' '}
              {data.total_assigned_targets} target
              {data.total_assigned_targets === 1 ? '' : 's'} claimed for you.
            </div>

            <div className="space-y-4">
              {data.projects.map(project => (
                <div key={project.project_id}
                     className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
                  <div className="px-4 py-3 flex items-center justify-between bg-gray-700/40">
                    <div className="flex items-center gap-3">
                      <Link href={`/projects/${project.project_id}`}
                            className="text-white font-medium hover:text-blue-400">
                        {project.project_name}
                      </Link>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        ROLE_STYLE[project.role] || ROLE_STYLE.viewer}`}>
                        {project.role}
                      </span>
                      <span className="text-xs text-gray-400">{project.status}</span>
                    </div>
                    <span className="text-xs text-gray-400">
                      {project.assigned_targets.length} claimed
                    </span>
                  </div>

                  {project.assigned_targets.length === 0 ? (
                    <div className="px-4 py-3 text-gray-500 text-sm">
                      Nothing claimed for you here.{' '}
                      <Link href={`/projects/${project.project_id}`}
                            className="text-blue-400 hover:text-blue-300">
                        Open the project
                      </Link>{' '}
                      to take a target.
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-700">
                      {project.assigned_targets.map(target => (
                        <div key={target.id}
                             className="px-4 py-2 flex items-center justify-between">
                          <span className="text-sm text-white">{target.target_value}</span>
                          <span className="text-xs text-gray-400">{target.status}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
