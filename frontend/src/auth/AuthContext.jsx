import React from 'react';
import { api } from '../services/api';

const AuthCtx = React.createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  // hydrate session on first load
  React.useEffect(() => {
    (async () => {
      try {
        const { user } = await api('/auth/me');
        setUser(user);
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = async ({ emailOrUsername, password }) => {
    const res = await api('/auth/login', {
      method: 'POST',
      body: { emailOrUsername, password },
    });
    // cookie is already set by server; we keep user in state for UI
    setUser(res.user);
    return res.user;
  };

  const logout = async () => {
    await api('/auth/logout', { method: 'POST' });
    setUser(null);
  };

  const value = React.useMemo(() => ({ user, loading, login, logout }), [user, loading]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = React.useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
