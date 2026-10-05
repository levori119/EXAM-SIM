import { useEffect, useState, type ComponentType } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ClipboardList, FileUp, GraduationCap, LayoutDashboard, LogOut, Users } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { Avatar } from '../../components/Avatar';
import { OnlineBadge } from '../../components/OnlineBadge';
import { AdminOverview } from './AdminOverview';
import { QuestionBankPage } from './questions/QuestionBankPage';
import { ExamsPage } from './exams/ExamsPage';
import { UsersPage } from './users/UsersPage';

export type AdminSection = 'overview' | 'questions' | 'exams' | 'users';

const NAV: { id: AdminSection; label: string; icon: ComponentType<{ className?: string }> }[] = [
  { id: 'overview', label: 'סקירה', icon: LayoutDashboard },
  { id: 'questions', label: 'טעינת שאלות', icon: FileUp },
  { id: 'exams', label: 'מבחנים', icon: ClipboardList },
  { id: 'users', label: 'משתמשים', icon: Users },
];

const isSection = (value: string): value is AdminSection => NAV.some((n) => n.id === value);

/** Keeps the active section in the URL hash so refresh and back/forward work. */
function useHashSection(): [AdminSection, (s: AdminSection) => void] {
  const read = () => {
    const hash = location.hash.slice(1);
    return isSection(hash) ? hash : 'overview';
  };
  const [section, setSection] = useState<AdminSection>(read);
  useEffect(() => {
    const onHash = () => setSection(read());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return [section, (s) => (location.hash = s)];
}

export function AdminLayout() {
  const { user, logout } = useAuth();
  const [section, navigate] = useHashSection();
  if (!user) return null;

  return (
    <div className="min-h-screen md:flex">
      {/* Sidebar: tablet & desktop */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-e border-slate-200 bg-white md:flex dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-3 px-5 py-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white">
            <GraduationCap className="h-6 w-6" />
          </div>
          <div>
            <div className="font-bold">סימולטור מבחנים</div>
            <div className="text-xs text-slate-500">ניהול מערכת</div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => navigate(id)}
              className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-4 font-medium transition ${
                section === id
                  ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              <Icon className="h-5 w-5" />
              {label}
            </button>
          ))}
        </nav>
        <div className="border-t border-slate-200 p-4 dark:border-slate-800">
          <div className="mb-3 flex items-center gap-3">
            <Avatar name={user.displayName} color={user.avatarColor} size="sm" />
            <div className="min-w-0">
              <div className="truncate font-semibold">{user.displayName}</div>
              <OnlineBadge />
            </div>
          </div>
          <button
            onClick={logout}
            className="flex min-h-12 w-full items-center gap-2 rounded-xl px-4 font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <LogOut className="h-5 w-5" />
            יציאה
          </button>
        </div>
      </aside>

      {/* Top bar: mobile */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-slate-200 bg-white/90 px-4 py-2 backdrop-blur md:hidden dark:border-slate-800 dark:bg-slate-900/90">
        <div className="flex items-center gap-2">
          <Avatar name={user.displayName} color={user.avatarColor} size="sm" />
          <span className="font-semibold">{user.displayName}</span>
        </div>
        <div className="flex items-center gap-1">
          <OnlineBadge />
          <button onClick={logout} className="flex h-12 w-12 items-center justify-center rounded-xl text-slate-500" aria-label="יציאה">
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </header>

      <main className="min-w-0 flex-1 px-4 py-6 pb-28 md:px-8 md:pb-8">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={section}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className="mx-auto max-w-6xl"
          >
            {section === 'overview' && <AdminOverview onNavigate={navigate} />}
            {section === 'questions' && <QuestionBankPage />}
            {section === 'exams' && <ExamsPage />}
            {section === 'users' && <UsersPage />}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Bottom tabs: mobile */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden dark:border-slate-800 dark:bg-slate-900/95">
        {NAV.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => navigate(id)}
            className={`flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-medium ${
              section === id ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <Icon className="h-6 w-6" />
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}
