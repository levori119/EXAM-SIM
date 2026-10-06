import { Fragment, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { BarChart3, Check, ChevronDown, RotateCcw, X } from 'lucide-react';
import { db } from '../../db/db';
import { useAuth } from '../../auth/AuthContext';
import { isCommonMistake, setStats, type QuestionStat, type SetStat } from '../../services/stats';
import { EmptyState, PageHeader } from '../../components/PageHeader';
import { inputClass } from '../../components/fields';
import { FavoriteButton, useFavoriteIds } from './PracticeRunner';
import { useCourse } from '../../courses/CourseContext';

const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);

/** Practice statistics per questionnaire and per question. Admins can look at everyone or one user. */
export function StatsView({ onPractice }: { onPractice: (title: string, questionIds: string[]) => void }) {
  const { user } = useAuth();
  const { courseId } = useCourse();
  const isAdmin = user?.role === 'admin';
  const users = useLiveQuery(() => (isAdmin ? db.users.toArray() : []), [isAdmin]);
  const [scope, setScope] = useState<string>(isAdmin ? 'all' : (user?.id ?? ''));
  const userId = scope === 'all' ? null : scope;
  const viewingSelf = userId === user?.id;

  const data = useLiveQuery(async () => {
    const [stats, sessions] = await Promise.all([
      setStats(userId, courseId ?? ''),
      db.practiceSessions
        .where('courseId')
        .equals(courseId ?? '')
        .filter((s) => !userId || s.userId === userId)
        .count(),
    ]);
    return { ...stats, sessions };
  }, [userId, courseId]);
  const [open, setOpen] = useState<string | null>(null);

  const all = data ? [...data.byQuestion.values()] : [];
  const attempts = all.reduce((a, s) => a + s.attempts, 0);
  const correct = all.reduce((a, s) => a + s.correct, 0);
  const mistakes = all.filter(isCommonMistake).length;

  return (
    <>
      <PageHeader
        title="סטטיסטיקה"
        subtitle="הצלחה לפי שאלון ולפי שאלה, מתוך התרגולים שהושלמו"
        actions={
          isAdmin && (
            <select aria-label="משתמש" className={`${inputClass} w-56`} value={scope} onChange={(e) => setScope(e.target.value)}>
              <option value="all">כל המשתמשים</option>
              {users?.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.displayName}
                  {u.id === user?.id ? ' (אני)' : ''}
                </option>
              ))}
            </select>
          )
        }
      />

      {data && data.sessions === 0 ? (
        <EmptyState icon={<BarChart3 className="h-10 w-10" />} title="אין עדיין נתונים">
          הסטטיסטיקה מתעדכנת בכל פעם שמסיימים תרגול.
        </EmptyState>
      ) : (
        <>
          {/* Headline numbers */}
          <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatTile label="תרגולים שהושלמו" value={data?.sessions} />
            <StatTile label="תשובות" value={data ? attempts : undefined} detail={data ? `${data.byQuestion.size} שאלות שונות` : undefined} />
            <StatTile label="הצלחה כוללת" value={data ? `${pct(correct, attempts)}%` : undefined} detail={data ? `${correct} נכונות` : undefined} />
            <StatTile label="טעויות נפוצות" value={data ? mistakes : undefined} detail="שאלות לחיזוק" />
          </div>

          {/* Per questionnaire */}
          <h2 className="mb-3 text-lg font-semibold">לפי שאלון</h2>
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <tr className="text-start">
                  <th className="px-4 py-3 text-start font-medium">שאלון</th>
                  <th className="px-4 py-3 text-start font-medium">כיסוי</th>
                  <th className="px-4 py-3 text-start font-medium">הצלחה</th>
                  <th className="px-4 py-3 text-start font-medium">תשובות</th>
                  <th className="px-4 py-3 text-start font-medium">טעויות נפוצות</th>
                  <th className="px-2 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {data?.sets.map((set) => {
                  const expanded = open === set.setId;
                  const setMistakeIds = data.questions
                    .filter((q) => q.setId === set.setId)
                    .filter((q) => {
                      const s = data.byQuestion.get(q.id);
                      return s && isCommonMistake(s);
                    })
                    .map((q) => q.id);
                  return (
                    <Fragment key={set.setId}>
                      <tr className="align-middle">
                        <td className="px-4 py-3">
                          <button
                            onClick={() => setOpen(expanded ? null : set.setId)}
                            aria-expanded={expanded}
                            className="flex min-h-10 items-center gap-2 text-start font-semibold"
                          >
                            <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition ${expanded ? 'rotate-180' : ''}`} />
                            <span dir="auto">{set.name}</span>
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <Meter value={pct(set.covered, set.questions)} label={`${set.covered}/${set.questions}`} />
                        </td>
                        <td className="px-4 py-3">
                          {set.attempts ? <Meter value={pct(set.correct, set.attempts)} label={`${pct(set.correct, set.attempts)}%`} /> : <span className="text-slate-400">—</span>}
                        </td>
                        <td className="px-4 py-3 tabular-nums">{set.attempts}</td>
                        <td className="px-4 py-3 tabular-nums">{set.mistakes}</td>
                        <td className="px-2 py-3 text-end">
                          {viewingSelf && setMistakeIds.length > 0 && (
                            <button
                              onClick={() => onPractice(`${set.name} — טעויות נפוצות`, setMistakeIds)}
                              className="inline-flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded-xl px-3 font-medium text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-500/10"
                            >
                              <RotateCcw className="h-4 w-4" /> תרגול טעויות
                            </button>
                          )}
                        </td>
                      </tr>
                      {expanded && (
                        <tr>
                          <td colSpan={6} className="bg-slate-50 px-2 py-3 sm:px-4 dark:bg-slate-950/40">
                            <QuestionBreakdown set={set} data={data} favoritesEnabled={viewingSelf} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

function StatTile({ label, value, detail }: { label: string; value: number | string | undefined; detail?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="text-sm text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-1 text-3xl font-bold tabular-nums">{value ?? '–'}</div>
      {detail && <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{detail}</div>}
    </div>
  );
}

/** A single-hue bar with its value written next to it (the number carries the meaning, not the color). */
function Meter({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex items-center gap-2" title={label}>
      <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-indigo-500" style={{ width: `${value}%` }} />
      </div>
      <span className="tabular-nums text-slate-700 dark:text-slate-300">{label}</span>
    </div>
  );
}

type Filter = 'all' | 'answered' | 'mistakes' | 'unanswered';

function QuestionBreakdown({
  set,
  data,
  favoritesEnabled,
}: {
  set: SetStat;
  data: { byQuestion: Map<string, QuestionStat>; questions: { id: string; setId: string; text: string; correctIndex: number | null; sourceNumber?: number | null }[] };
  favoritesEnabled: boolean;
}) {
  const favorites = useFavoriteIds();
  const [filter, setFilter] = useState<Filter>('answered');
  const rows = data.questions
    .filter((q) => q.setId === set.setId && q.correctIndex !== null)
    .map((q) => ({ q, s: data.byQuestion.get(q.id) }))
    .filter(({ s }) =>
      filter === 'all' ? true : filter === 'answered' ? !!s : filter === 'mistakes' ? !!s && isCommonMistake(s) : !s,
    )
    // Weakest first.
    .sort((a, b) => (b.s ? b.s.wrong / b.s.attempts : -1) - (a.s ? a.s.wrong / a.s.attempts : -1) || (b.s?.wrong ?? 0) - (a.s?.wrong ?? 0));

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1 rounded-xl bg-white p-1 text-sm dark:bg-slate-900">
        {(
          [
            ['answered', 'נענו'],
            ['mistakes', 'טעויות נפוצות'],
            ['unanswered', 'טרם נענו'],
            ['all', 'הכול'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            className={`min-h-10 rounded-lg px-3 font-medium ${filter === value ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300' : 'text-slate-500'}`}
          >
            {label}
          </button>
        ))}
      </div>
      <ul className="max-h-[28rem] space-y-1.5 overflow-y-auto">
        {rows.map(({ q, s }) => (
          <li key={q.id} className="flex items-center gap-3 rounded-xl bg-white px-3 py-2 dark:bg-slate-900">
            <p className="line-clamp-2 min-w-0 flex-1" dir="auto">
              {q.sourceNumber != null && <span className="text-slate-400">{q.sourceNumber}. </span>}
              {q.text}
            </p>
            {s ? (
              <>
                <span className="w-20 shrink-0 text-center tabular-nums text-slate-600 dark:text-slate-300" title="נכונות / ניסיונות">
                  {s.correct}/{s.attempts}
                </span>
                <span className="w-12 shrink-0 text-center font-semibold tabular-nums">{pct(s.correct, s.attempts)}%</span>
                <span
                  className={`inline-flex w-24 shrink-0 items-center gap-1 text-xs ${s.lastCorrect ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}
                >
                  {s.lastCorrect ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                  {s.lastCorrect ? 'אחרונה נכונה' : 'אחרונה שגויה'}
                </span>
              </>
            ) : (
              <span className="w-56 shrink-0 text-center text-xs text-slate-400">טרם נענתה</span>
            )}
            {favoritesEnabled && <FavoriteButton questionId={q.id} favorite={favorites.has(q.id)} size="sm" />}
          </li>
        ))}
        {!rows.length && <li className="py-6 text-center text-slate-500">אין שאלות בסינון הזה.</li>}
      </ul>
    </div>
  );
}
