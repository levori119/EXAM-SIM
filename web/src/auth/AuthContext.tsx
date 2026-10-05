import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
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
  const [sessionId, setSessionId] = useState(() => localStorage.getItem(SESSION_KEY));

  // Live: edits to the signed-in user (name, role) show up immediately.
  // The result is tagged with its session id because useLiveQuery keeps returning
  // the previous session's result until the new query resolves.
  const result = useLiveQuery(
    async () => ({ sessionId, user: sessionId ? ((await getUser(sessionId)) ?? null) : null }),
    [sessionId],
  );
  const current = result?.sessionId === sessionId ? result : undefined;
  const user = current?.user;

  const logout = useCallback(() => {
    localStorage.removeItem(SESSION_KEY);
    setSessionId(null);
  }, []);

  // The signed-in user was deleted.
  useEffect(() => {
    if (sessionId && current && current.user === null) logout();
  }, [sessionId, current, logout]);

  const login = useCallback(async (userId: string, password: string) => {
    const u = await verifyLogin(userId, password);
    localStorage.setItem(SESSION_KEY, u.id);
    setSessionId(u.id);
  }, []);

  const value = useMemo(
    () => ({ user: user ?? null, restoring: user === undefined, login, logout }),
    [user, login, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
