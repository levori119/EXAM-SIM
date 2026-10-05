import { Check, Plus, X } from 'lucide-react';
import type { Difficulty } from '../../../db/db';
import { DIFFICULTY_LABELS, type QuestionDraft } from '../../../services/questionBank';
import { inputClass } from '../../../components/fields';

const OPTION_LETTERS = 'אבגדהוזח';
export const MAX_OPTIONS = OPTION_LETTERS.length;
export const TOPICS_DATALIST_ID = 'question-topics';

interface Props {
  draft: QuestionDraft;
  onChange: (draft: QuestionDraft) => void;
  /** Hides explanation & difficulty to keep the bulk-review list compact. */
  compact?: boolean;
  idPrefix: string;
}

export function QuestionEditor({ draft, onChange, compact, idPrefix }: Props) {
  const set = <K extends keyof QuestionDraft>(key: K, value: QuestionDraft[K]) => onChange({ ...draft, [key]: value });

  const setOption = (index: number, value: string) =>
    set('options', draft.options.map((o, i) => (i === index ? value : o)));

  const removeOption = (index: number) => {
    const options = draft.options.filter((_, i) => i !== index);
    let correctIndex = draft.correctIndex;
    if (correctIndex === index) correctIndex = null;
    else if (correctIndex !== null && correctIndex > index) correctIndex--;
    onChange({ ...draft, options, correctIndex });
  };

  return (
    <div className="space-y-3">
      <textarea
        aria-label="נוסח השאלה"
        className={`${inputClass} py-3 font-medium`}
        rows={compact ? 2 : 3}
        placeholder="נוסח השאלה"
        value={draft.text}
        onChange={(e) => set('text', e.target.value)}
      />

      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm text-slate-500 dark:text-slate-400">תשובות — לחצו על העיגול לסימון התשובה הנכונה</legend>
        {draft.options.map((option, i) => {
          const correct = draft.correctIndex === i;
          return (
            <div key={i} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => set('correctIndex', correct ? null : i)}
                aria-pressed={correct}
                aria-label={`סימון תשובה ${OPTION_LETTERS[i]} כנכונה`}
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 font-bold transition ${
                  correct
                    ? 'border-emerald-500 bg-emerald-500 text-white'
                    : 'border-slate-300 text-slate-500 hover:border-emerald-400 dark:border-slate-600'
                }`}
              >
                {correct ? <Check className="h-5 w-5" /> : OPTION_LETTERS[i]}
              </button>
              <input
                aria-label={`תשובה ${OPTION_LETTERS[i]}`}
                className={`${inputClass} ${correct ? 'border-emerald-400 dark:border-emerald-600' : ''}`}
                value={option}
                onChange={(e) => setOption(i, e.target.value)}
              />
              <button
                type="button"
                onClick={() => removeOption(i)}
                disabled={draft.options.length <= 2}
                aria-label="הסרת תשובה"
                className="flex h-12 w-10 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:text-red-600 disabled:opacity-30"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
        {draft.options.length < MAX_OPTIONS && (
          <button
            type="button"
            onClick={() => set('options', [...draft.options, ''])}
            className="inline-flex min-h-12 items-center gap-2 rounded-xl px-3 text-sm font-medium text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-500/10"
          >
            <Plus className="h-4 w-4" />
            הוספת תשובה
          </button>
        )}
      </fieldset>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block space-y-1.5" htmlFor={`${idPrefix}-topic`}>
          <span className="text-sm text-slate-500 dark:text-slate-400">נושא</span>
          <input
            id={`${idPrefix}-topic`}
            list={TOPICS_DATALIST_ID}
            className={inputClass}
            placeholder="כללי"
            value={draft.topic}
            onChange={(e) => set('topic', e.target.value)}
          />
        </label>
        {!compact && (
          <label className="block space-y-1.5" htmlFor={`${idPrefix}-difficulty`}>
            <span className="text-sm text-slate-500 dark:text-slate-400">רמת קושי</span>
            <select
              id={`${idPrefix}-difficulty`}
              className={inputClass}
              value={draft.difficulty}
              onChange={(e) => set('difficulty', e.target.value as Difficulty)}
            >
              {Object.entries(DIFFICULTY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {!compact && (
        <label className="block space-y-1.5" htmlFor={`${idPrefix}-explanation`}>
          <span className="text-sm text-slate-500 dark:text-slate-400">הסבר (מוצג במצב תרגול)</span>
          <textarea
            id={`${idPrefix}-explanation`}
            className={`${inputClass} py-3`}
            rows={2}
            value={draft.explanation}
            onChange={(e) => set('explanation', e.target.value)}
          />
        </label>
      )}
    </div>
  );
}

export function TopicsDatalist({ topics }: { topics: string[] }) {
  return (
    <datalist id={TOPICS_DATALIST_ID}>
      {topics.map((t) => (
        <option key={t} value={t} />
      ))}
    </datalist>
  );
}
