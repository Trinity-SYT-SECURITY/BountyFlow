import { useEffect } from 'react';
import { useRouter } from 'next/router';

/**
 * This page redirects to /attack-flow-builder.
 *
 * Context:
 * Both routes were titled "Attack Flow Builder" and drew the same canvas. This
 * one never called the backend at all: flows lived in React state and were
 * gone on reload. /attack-flow-builder is the real one — it loads and saves
 * through /api/v1/attack-flows.
 *
 * Both routes are linked from the UI, so this stays as a redirect rather than
 * being deleted.
 */
export default function AttackBuilder() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/attack-flow-builder');
  }, [router]);

  return null;
}
