import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useModal } from './Modal';

export default function Header({ title = 'BountyFlow', showBackButton = false, backUrl = '/dashboard' }) {
  const router = useRouter();
  const { confirm } = useModal();
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    // Load user info from localStorage
    if (typeof window !== 'undefined') {
      const storedUser = localStorage.getItem('user');
      if (storedUser) {
        try {
          setCurrentUser(JSON.parse(storedUser));
        } catch (e) {
          setCurrentUser({ username: 'test_user' });
        }
      } else {
        setCurrentUser({ username: 'test_user' });
      }
    }
  }, []);

  const handleLogout = async () => {
    const confirmed = await confirm({
      title: 'Confirm Logout',
      message: 'Are you sure you want to logout?',
      confirmText: 'Logout',
      cancelText: 'Cancel',
      variant: 'danger'
    });

    if (confirmed) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('selectedProjectId');
        localStorage.removeItem('authToken');
        sessionStorage.clear();
      }
      router.push('/login');
    }
  };

  return (
    <header className="bg-gray-800 shadow-lg border-b border-gray-700">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-4">
          <div className="flex items-center space-x-4">
            {showBackButton && (
              <Link 
                href={backUrl}
                className="text-blue-400 hover:text-blue-300 transition-colors"
              >
                ← Back
              </Link>
            )}
            <div className="flex items-center">
              <Link href="/dashboard">
                <h1 className="text-2xl font-bold text-white cursor-pointer hover:text-blue-400 transition-colors">
                  {title}
                </h1>
              </Link>
              <span className="ml-3 px-3 py-1 bg-green-600 text-white text-sm rounded-full">
                Professional Edition
              </span>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            <div className="text-sm text-gray-300">
              Welcome, <span className="font-semibold text-white">{currentUser?.username || 'User'}</span>
            </div>
            <button 
              onClick={handleLogout}
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm transition-colors flex items-center space-x-2"
              title="Logout from BountyFlow"
            >
              <span>🚪</span>
              <span>Logout</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}


