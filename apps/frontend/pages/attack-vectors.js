import { useEffect } from 'react';
import { useRouter } from 'next/router';

/**
 * This page redirects to /vectors.
 *
 * Context:
 * /attack-vectors and /vectors were two takes on the same screen. This one
 * shipped with its attack vectors written into the source — "SQL Injection
 * Chain", "XSS to RCE" and their steps — so it always looked populated and
 * never showed anything from the engagement. /vectors is the real one: it
 * loads the project's attack vectors from /api/v1/attack-vectors and saves
 * back to it.
 *
 * Both routes are linked from the UI, so this stays as a redirect rather than
 * being deleted.
 */
export default function AttackVectors() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/vectors');
  }, [router]);

  return null;
}
