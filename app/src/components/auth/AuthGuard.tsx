'use client';

import { useAuth } from '@/lib/authContext';

const BG = '#faf9f5';
const MUTED = '#b0aea5';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  // Dev mode: skip auth entirely so you can develop without an invite code
  if (process.env.NODE_ENV === 'development') {
    return <>{children}</>;
  }

  // Loading state
  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', background: BG, display: 'flex',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ color: MUTED, fontSize: 14 }}>Loading...</div>
      </div>
    );
  }

  // Not logged in → redirect to register
  if (!user) {
    if (typeof window !== 'undefined') window.location.href = '/register';
    return null;
  }

  return <>{children}</>;
}
