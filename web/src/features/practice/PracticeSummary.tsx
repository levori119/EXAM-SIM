import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Home, RotateCcw, Star, X, XCircle } from 'lucide-react';
import type { Question } from '../../db/db';
import { scoreRound, type Answers, type PracticeRound } from '../../services/practice';
import { Button } from '../../components/fields';
import { FavoriteButton, useFavoriteIds } from './PracticeRunner';

type Filter = 'all' | 'wrong' | 'favorites';

interface Props {
  round: PracticeRound;
  questions: Map<string, Question>;
  answers: Answers;
  onRetry: (title: string, questionIds: string[]) => void;
  onHome: () => void;
}

export function PracticeSummary({ round, questions, answers, onRetry, onHome }: Props) {
  const favorites = useFavoriteIds();
  const [filter, setFilter] = useState<Filter>('all');
  const { correct, total, wrongIds } = useMemo(() => scoreRound(round, answers, questions), [round, answers, questions]);
  const pct = Math.round((correct / Math.max(1, total)) * 100);

  const roundIds = round.items.map((i) => i.questionId);
  const favoriteIds = roundIds.filter((id) => favorites.has(id));
  const wrongOrFavorite = roundIds.filter((id) => wrongIds.includes(id) || favorites.has(id));

  const visible = roundIds.filter(
    (id) => filter === 'all' || (filter === 'wrong' ? wrongIds.includes(id) : favorites.has(id)),
  );

  return (
    <div className="mx-auto max-w-3xl">
      {/* Score */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="mb-6 flex flex-col items-center gap-2 rounded-3xl border border-slate-200 bg-white p-6 text-center dark:border-slate-800 dark:bg-slate-900"
      >
        <ScoreRing pct={pct} />
        <h1 className="text-2xl font-bold">{pct >= 80 ? 'כל הכבוד!' : pct >= 55 ? 'יפה, ממשיכים להתאמן' : 'שווה לחזור על החומר'}</h1>
        <p className="text-slate-500 dark:text-slate-400">
          {correct} תשובות נכונות מתוך {total} · {round.title}
        </p>
      </motion.div>

      {/* Retry options */}
      <section className="mb-8 rounded-3xl border border-indigo-200 bg-indigo-50/60 p-5 dark:border-indigo-500/30 dark:bg-indigo-500/5">
        <h2 className="mb-1 flex items-center gap-2 font-semibold">
          <RotateCcw className="h-5 w-5 text-indigo-500" /> לחולל שאלון חדש?
        </h2>
        <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">תרגול חוזר רק על השאלות שצריך לחזק.</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Button variant="primary" disabled={!wrongIds.length} onClick={() => onRetry(`${round.title} — שגויות`, wrongIds)}>
            <XCircle className="h-5 w-5" /> רק השגויות ({wrongIds.length})
          </Button>
          <Button disabled={!favoriteIds.length} onClick={() => onRetry(`${round.title} — מסומנות`, favoriteIds)}>
            <Star className="h-5 w-5" /> רק המסומנות ({favoriteIds.length})
          </Button>
          <Button
            disabled={!wrongOrFavorite.length}
            onClick={() => onRetry(`${round.title} — שגויות ומסומנות`, wrongOrFavorite)}
          >
            שגויות + מסומנות ({wrongOrFavorite.length})
          </Button>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button variant="ghost" onClick={() => onRetry(round.title, roundIds)}>
            <RotateCcw className="h-5 w-5" /> כל השאלות שוב
          </Button>
          <Button variant="ghost" onClick={onHome}>
            <Home className="h-5 w-5" /> חזרה לתרגולים
          </Button>
        </div>
      </section>

      {/* Review */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">סקירת תשובות</h2>
        <div className="flex rounded-xl bg-slate-100 p-1 text-sm dark:bg-slate-800">
          {(
            [
              ['all', `הכול (${total})`],
              ['wrong', `שגויות (${wrongIds.length})`],
              ['favorites', `מסומנות (${favoriteIds.length})`],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className={`min-h-10 rounded-lg px-3 font-medium ${filter === value ? 'bg-white shadow dark:bg-slate-900' : 'text-slate-500'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <ol className="space-y-3">
        {visible.map((id) => {
          const q = questions.get(id)!;
          const chosen = answers[id];
          const ok = chosen === q.correctIndex;
          const number = roundIds.indexOf(id) + 1;
          return (
            <li
              key={id}
              className={`rounded-2xl border-s-4 bg-white p-4 dark:bg-slate-900 ${ok ? 'border-emerald-500' : 'border-red-500'}`}
            >
              <div className="flex items-start gap-2">
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white ${ok ? 'bg-emerald-500' : 'bg-red-500'}`}
                >
                  {ok ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                </span>
                <p className="flex-1 font-medium" dir="auto">
                  <span className="text-slate-400">{number}. </span>
                  {q.text}
                </p>
                <FavoriteButton questionId={id} favorite={favorites.has(id)} size="sm" />
              </div>
              <div className="mt-2 space-y-1 ps-9 text-sm">
                {!ok && (
                  <div className="text-red-700 dark:text-red-400" dir="auto">
                    התשובה שלך: {chosen === undefined ? 'לא נענתה' : q.options[chosen]}
                  </div>
                )}
                <div className="text-emerald-700 dark:text-emerald-400" dir="auto">
                  התשובה הנכונה: {q.options[q.correctIndex!]}
                </div>
                {!ok && q.explanation && (
                  <div className="text-slate-600 dark:text-slate-300" dir="auto">
                    💡 {q.explanation}
                  </div>
                )}
              </div>
            </li>
          );
        })}
        {!visible.length && <li className="py-8 text-center text-slate-500">אין שאלות בסינון הזה.</li>}
      </ol>
    </div>
  );
}

function ScoreRing({ pct }: { pct: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const color = pct >= 80 ? '#10b981' : pct >= 55 ? '#f59e0b' : '#ef4444';
  return (
    <div className="relative h-36 w-36">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" strokeWidth="10" className="stroke-slate-200 dark:stroke-slate-800" />
        <motion.circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          strokeWidth="10"
          strokeLinecap="round"
          stroke={color}
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - pct / 100) }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-3xl font-bold tabular-nums">{pct}%</div>
    </div>
  );
}
