import { Check } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Distribution } from '../db/db';
import {
  answerableCounts,
  computeQuotas,
  DISTRIBUTION_HINTS,
  DISTRIBUTION_LABELS,
  quotaTotal,
  type MixValue,
} from '../services/composition';
import { inputClass } from './fields';
import { useCourse } from '../courses/CourseContext';

export interface MixSet {
  id: string;
  name: string;
  available: number;
}

/** The course's questionnaires that have at least one answerable question (live). undefined while loading. */
export function useMixSets(): MixSet[] | undefined {
  const { courseId } = useCourse();
  return useLiveQuery(async () => {
    const [sets, counts] = await Promise.all([db.questionSets.where('courseId').equals(courseId ?? '').toArray(), answerableCounts()]);
    return sets
      .map((s) => ({ id: s.id, name: s.name, available: counts.get(s.id) ?? 0 }))
      .filter((s) => s.available > 0)
      .sort((a, b) => a.name.localeCompare(b.name, 'he'));
  }, [courseId]);
}

const COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6', '#ef4444'];

/**
 * Pick one or more questionnaires and how many questions each contributes:
 * equal split, proportional to size, or a hand-set count per questionnaire.
 */
export function QuestionMixPicker({ sets, value, onChange }: { sets: MixSet[]; value: MixValue; onChange: (v: MixValue) => void }) {
  const available = new Map(sets.map((s) => [s.id, s.available]));
  const quotas = computeQuotas(value, available);
  const countOf = new Map(quotas.map((q) => [q.setId, q.count]));
  const total = quotaTotal(quotas);
  const maxTotal = value.setIds.reduce((s, id) => s + (available.get(id) ?? 0), 0);
  const colorOf = (id: string) => COLORS[sets.findIndex((s) => s.id === id) % COLORS.length];

  const toggle = (id: string) => {
    const on = value.setIds.includes(id);
    const setIds = on ? value.setIds.filter((x) => x !== id) : [...value.setIds, id];
    const custom = { ...value.custom };
    if (!on && custom[id] === undefined) custom[id] = Math.min(10, available.get(id) ?? 0);
    onChange({ ...value, setIds, custom });
  };

  const setDistribution = (distribution: Distribution) => {
    // Switching to manual starts from the current split, so nothing jumps.
    const custom = distribution === 'custom' ? Object.fromEntries(quotas.map((q) => [q.setId, q.count])) : value.custom;
    const total = distribution === 'custom' ? value.total : Math.max(value.total, 0) || quotaTotal(quotas);
    onChange({ ...value, distribution, custom, total });
  };

  const allSelected = sets.length > 0 && sets.every((s) => value.setIds.includes(s.id));

  if (!sets.length) {
    return <p className="text-sm text-slate-500">אין עדיין שאלונים עם שאלות שסומנה להן תשובה נכונה.</p>;
  }

  return (
    <div className="space-y-4">
      {/* Questionnaires */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-sm font-medium text-slate-600 dark:text-slate-300">שאלונים</span>
          <button
            type="button"
            className="min-h-10 rounded-lg px-2 text-sm font-medium text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-500/10"
            onClick={() => onChange({ ...value, setIds: allSelected ? [] : sets.map((s) => s.id) })}
          >
            {allSelected ? 'ניקוי בחירה' : 'בחירת הכול'}
          </button>
        </div>
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
          {sets.map((set) => {
            const on = value.setIds.includes(set.id);
            const count = countOf.get(set.id) ?? 0;
            const pct = total ? Math.round((count / total) * 100) : 0;
            return (
              <li key={set.id} className={`flex min-h-14 items-center gap-3 px-3 py-2 ${on ? '' : 'opacity-70'}`}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => toggle(set.id)}
                  className="flex min-h-12 min-w-0 flex-1 items-center gap-3 text-start"
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 ${on ? 'border-transparent text-white' : 'border-slate-300 dark:border-slate-600'}`}
                    style={on ? { backgroundColor: colorOf(set.id) } : undefined}
                  >
                    {on && <Check className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium" dir="auto">{set.name}</span>
                    <span className="block text-xs text-slate-500">{set.available} שאלות זמינות</span>
                  </span>
                </button>
                {on &&
                  (value.distribution === 'custom' ? (
                    <div className="w-20 shrink-0">
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={set.available}
                        aria-label={`מספר שאלות מ${set.name}`}
                        className={`${inputClass} px-2 text-center`}
                        value={value.custom[set.id] ?? ''}
                        onChange={(e) => onChange({ ...value, custom: { ...value.custom, [set.id]: Number(e.target.value) } })}
                      />
                    </div>
                  ) : (
                    <span className="w-20 shrink-0 text-center font-semibold tabular-nums">{count}</span>
                  ))}
                {on && <span className="w-12 shrink-0 text-end text-sm tabular-nums text-slate-500">{pct}%</span>}
              </li>
            );
          })}
        </ul>
      </div>

      {value.setIds.length > 0 && (
        <>
          {/* Distribution */}
          <div>
            <span className="mb-1.5 block text-sm font-medium text-slate-600 dark:text-slate-300">יחס בין השאלונים</span>
            <div className="grid grid-cols-3 gap-1 rounded-2xl bg-slate-100 p-1 dark:bg-slate-800">
              {(Object.keys(DISTRIBUTION_LABELS) as Distribution[]).map((d) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={value.distribution === d}
                  onClick={() => setDistribution(d)}
                  className={`min-h-12 rounded-xl px-2 text-sm transition ${
                    value.distribution === d ? 'bg-white font-semibold shadow dark:bg-slate-900' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  {DISTRIBUTION_LABELS[d]}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-slate-500">{DISTRIBUTION_HINTS[value.distribution]}</p>
          </div>

          {/* Total */}
          <div className="flex flex-wrap items-end gap-3">
            {value.distribution !== 'custom' ? (
              <label className="block flex-1 space-y-1.5" htmlFor="mix-total">
                <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
                  סה״כ שאלות <span className="font-normal text-slate-400">(עד {maxTotal})</span>
                </span>
                <div className="flex gap-2">
                  <input
                    id="mix-total"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={maxTotal}
                    className={inputClass}
                    value={value.total || ''}
                    onChange={(e) => onChange({ ...value, total: Number(e.target.value) })}
                  />
                  {value.total !== maxTotal && (
                    <button
                      type="button"
                      onClick={() => onChange({ ...value, total: maxTotal })}
                      className="min-h-12 shrink-0 rounded-xl px-3 text-sm font-medium text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-500/10"
                    >
                      הכול
                    </button>
                  )}
                </div>
              </label>
            ) : (
              <div className="flex-1 text-sm text-slate-600 dark:text-slate-300">
                סה״כ: <b className="tabular-nums">{total}</b> שאלות
              </div>
            )}
          </div>
          {value.distribution !== 'custom' && value.total > total && (
            <p className="text-xs text-amber-600">נבחרו {total} שאלות — אין מספיק שאלות זמינות בשאלונים שנבחרו.</p>
          )}

          {/* Ratio bar */}
          {total > 0 && (
            <div className="flex h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" aria-hidden>
              {quotas
                .filter((q) => q.count > 0)
                .map((q) => (
                  <div key={q.setId} style={{ width: `${(q.count / total) * 100}%`, backgroundColor: colorOf(q.setId) }} />
                ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
