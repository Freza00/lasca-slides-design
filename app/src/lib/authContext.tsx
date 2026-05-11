'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';

export interface AuthUser {
  id: number;
  email: string;
  displayName: string | null;
  sourceGroup: string | null;
  loginCode: string | null;
}

export interface AuthState {
  user: AuthUser | null;
  token: string | null;
  daysLeft: number;
  flags: Record<string, string>;
  loading: boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthState>({
  user: null, token: null, daysLeft: 7,
  flags: {}, loading: true, logout: () => {},
});

export function useAuth(): AuthState {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [daysLeft, setDaysLeft] = useState(7);
  const [flags, setFlags] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const logout = useCallback(() => {
    localStorage.removeItem('lasca-session');
    setUser(null);
    setToken(null);
    window.location.href = '/register';
  }, []);

  const refreshSession = useCallback(async (activeToken: string) => {
    const res = await fetch('/api/auth/validate', {
      headers: { Authorization: `Bearer ${activeToken}` },
    });
    const data = await res.json();
    if (data.valid) {
      setUser(data.user);
      setDaysLeft(data.daysLeft);
      setFlags(data.flags ?? {});
    } else {
      localStorage.removeItem('lasca-session');
      setToken(null);
      setUser(null);
    }
  }, []);

  // Validate on mount
  useEffect(() => {
    const savedToken = localStorage.getItem('lasca-session');
    if (!savedToken) {
      setLoading(false);
      return;
    }
    setToken(savedToken);

    refreshSession(savedToken)
      .catch(() => {
        // Network error — keep token, let user retry
      })
      .finally(() => setLoading(false));

    const refresh = () => {
      void refreshSession(savedToken).catch(() => {
        // Ignore background refresh failures; the current UI can keep going.
      });
    };

    const intervalId = window.setInterval(refresh, 60_000);
    window.addEventListener('focus', refresh);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refresh);
    };
  }, [refreshSession]);

  return (
    <AuthContext.Provider value={{
      user, token, daysLeft, flags, loading, logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
}
