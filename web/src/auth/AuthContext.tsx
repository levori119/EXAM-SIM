import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getUser, verifyLogin, type PublicUser } from './userService';

const SESSION_KEY = 'exam-sim:session';

interface AuthState {
  user: PublicUser | null;
  /** True while the stored session is being restored on startup. */
  restoring: boolean;
  login: (userId: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [restoring, setRestoring] = useState(true);

  useEffect(() => {
    const storedId = localStorage.getItem(SESSION_KEY);
    if (!storedId) {
      setRestoring(false);
      return;
    }
    getUser(storedId)
      .then((u) => {
        if (u) setUser(u);
        else localStorage.removeItem(SESSION_KEY);
      })
      .finally(() => setRestoring(false));
  }, []);

  const login = useCallback(async (userId: string, password: string) => {
    const u = await verifyLogin(userId, password);
    localStorage.setItem(SESSION_KEY, u.id);
    setUser(u);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(SESSION_KEY);
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, restoring, login, logout }), [user, restoring, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
