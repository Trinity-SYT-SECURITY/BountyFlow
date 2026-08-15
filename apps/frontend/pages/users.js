import { useEffect } from 'react';
import { useRouter } from 'next/router';

/**
 * This page redirects to /discovered-users
 * 
 * Context:
 * The /users route was originally for platform user management,
 * but according to the user's requirements, the "Users" navigation
 * should refer to "Discovered Users" (users found during penetration tests),
 * not platform system users.
 * 
 * Platform user management is now handled by the Admin panel at /admin/users
 */
export default function Users() {
  const router = useRouter();
  
  useEffect(() => {
    // Redirect to discovered-users page
    router.replace('/discovered-users');
  }, [router]);
  
  return null;
}
