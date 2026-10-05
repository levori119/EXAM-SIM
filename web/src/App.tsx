import { LogOut } from 'lucide-react';
import { useAuth } from './auth/AuthContext';
import { LoginScreen } from './features/login/LoginScreen';
import { Avatar } from './components/Avatar';
import { OnlineBadge } from './components/OnlineBadge';

export function App() {
  const { user, restoring, logout } = useAuth();

  if (restoring) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <span className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
      </div>
    );
  }

  if (!user) return <LoginScreen />;

  // Placeholder home until the dashboard is built.
  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between gap-4 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <Avatar name={user.displayName} color={user.avatarColor} />
          <div>
            <div className="font-semibold">{user.displayName}</div>
            <div className="text-xs text-slate-500">{user.role === 'admin' ? 'מנהל' : 'נבחן'}</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <OnlineBadge />
          <button
            onClick={logout}
            className="inline-flex min-h-12 items-center gap-2 rounded-xl px-4 font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <LogOut className="h-5 w-5" />
            יציאה
          </button>
        </div>
      </header>
      <main className="p-6 text-center text-slate-500">ברוך הבא! מסך הבית ייבנה בהמשך.</main>
    </div>
  );
}
