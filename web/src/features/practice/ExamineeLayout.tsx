import { GraduationCap, LogOut } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { Avatar } from '../../components/Avatar';
import { OnlineBadge } from '../../components/OnlineBadge';
import { PracticeArea } from './PracticeArea';
import { CourseSwitcher } from '../../courses/CourseSwitcher';
import { useCourse } from '../../courses/CourseContext';

export function ExamineeLayout() {
  const { user, logout } = useAuth();
  const { courses } = useCourse();
  if (!user) return null;
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2">
          <div className="flex items-center gap-3">
            <div className="hidden h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white sm:flex">
              <GraduationCap className="h-6 w-6" />
            </div>
            <Avatar name={user.displayName} color={user.avatarColor} size="sm" />
            <span className="hidden font-semibold sm:inline">{user.displayName}</span>
            {(courses?.length ?? 0) > 1 && (
              <div className="w-44 sm:w-60">
                <CourseSwitcher compact />
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <OnlineBadge />
            <button
              onClick={logout}
              className="inline-flex min-h-12 items-center gap-2 rounded-xl px-3 font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <LogOut className="h-5 w-5" />
              <span className="hidden sm:inline">יציאה</span>
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 pb-28 md:pb-8">
        <PracticeArea />
      </main>
    </div>
  );
}
