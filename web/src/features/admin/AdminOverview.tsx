import type { ComponentType } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, ClipboardList, FileQuestion, FileUp, UserPlus, Users } from 'lucide-react';
import { db } from '../../db/db';
import { PageHeader } from '../../components/PageHeader';
import type { AdminSection } from './AdminLayout';

export function AdminOverview({ onNavigate }: { onNavigate: (s: AdminSection) => void }) {
  const stats = useLiveQuery(async () => {
    const [questions, unanswered, exams, published, users] = await Promise.all([
      db.questions.count(),
      db.questions.filter((q) => q.correctIndex === null).count(),
      db.exams.count(),
      db.exams.filter((e) => e.published).count(),
      db.users.count(),
    ]);
    return { questions, unanswered, exams, published, users };
  });

  return (
    <>
      <PageHeader title="לוח ניהול" subtitle="ניהול בנק השאלות, המבחנים והמשתמשים במערכת" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon={FileQuestion} label="שאלות בבנק" value={stats?.questions} onClick={() => onNavigate('questions')} />
        <StatCard
          icon={ClipboardList}
          label="מבחנים"
          value={stats?.exams}
          detail={stats && `${stats.published} מפורסמים`}
          onClick={() => onNavigate('exams')}
        />
        <StatCard icon={Users} label="משתמשים" value={stats?.users} onClick={() => onNavigate('users')} />
      </div>

      {!!stats?.unanswered && (
        <button
          onClick={() => onNavigate('questions')}
          className="mt-4 flex min-h-12 w-full items-center gap-3 rounded-2xl bg-amber-50 px-4 py-3 text-start text-amber-800 dark:bg-amber-500/10 dark:text-amber-300"
        >
          <AlertTriangle className="h-5 w-5 shrink-0" />
          {stats.unanswered} שאלות ללא תשובה נכונה מסומנת — הן לא ייכללו במבחנים עד שתסמנו אותן.
        </button>
      )}

      <h2 className="mb-3 mt-8 text-lg font-semibold">פעולות מהירות</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <QuickAction icon={FileUp} title="טעינת קובץ שאלות" text="PDF או קובץ טקסט" onClick={() => onNavigate('questions')} />
        <QuickAction icon={ClipboardList} title="יצירת מבחן" text="תרגול או מבחן מסכם" onClick={() => onNavigate('exams')} />
        <QuickAction icon={UserPlus} title="הוספת משתמש" text="נבחן או מנהל" onClick={() => onNavigate('users')} />
      </div>
    </>
  );
}

type Icon = ComponentType<{ className?: string }>;

function StatCard({ icon: Icon, label, value, detail, onClick }: { icon: Icon; label: string; value?: number; detail?: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 text-start transition hover:border-indigo-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-500/40"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
        <Icon className="h-6 w-6" />
      </div>
      <div>
        <div className="text-3xl font-bold tabular-nums">{value ?? '–'}</div>
        <div className="text-sm text-slate-500 dark:text-slate-400">
          {label}
          {detail && ` · ${detail}`}
        </div>
      </div>
    </button>
  );
}

function QuickAction({ icon: Icon, title, text, onClick }: { icon: Icon; title: string; text: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex min-h-20 items-center gap-3 rounded-2xl bg-gradient-to-l from-indigo-600 to-indigo-500 p-4 text-start text-white shadow-lg shadow-indigo-600/20 transition hover:brightness-110 active:scale-[0.98]"
    >
      <Icon className="h-7 w-7 shrink-0" />
      <div>
        <div className="font-semibold">{title}</div>
        <div className="text-sm text-indigo-100">{text}</div>
      </div>
    </button>
  );
}
