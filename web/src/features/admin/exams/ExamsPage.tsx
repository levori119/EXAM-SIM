import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, ClipboardList, Clock, Copy, Eye, EyeOff, Pencil, Plus, Shuffle, Trash2 } from 'lucide-react';
import { db, type Exam, type ExamMode } from '../../../db/db';
import { useAuth } from '../../../auth/AuthContext';
import { topicCounts } from '../../../services/questionBank';
import {
  deleteExam,
  emptyExamDraft,
  MODE_LABELS,
  saveExam,
  setExamPublished,
  validateExam,
  type ExamDraft,
} from '../../../services/exams';
import { ConfirmDialog, Modal } from '../../../components/Modal';
import { EmptyState, PageHeader } from '../../../components/PageHeader';
import { IconButton } from '../../../components/IconButton';
import { Button, ErrorText, inputClass, TextAreaField, TextField, Toggle } from '../../../components/fields';

type Editing = { id: string | null; draft: ExamDraft } | null;

const toDraft = ({ title, description, mode, durationMinutes, questionCount, topics, shuffleQuestions, shuffleOptions, published }: Exam): ExamDraft => ({
  title,
  description,
  mode,
  durationMinutes,
  questionCount,
  topics: [...topics],
  shuffleQuestions,
  shuffleOptions,
  published,
});

/** Questions available to an exam drawing from `topics` (empty = all). */
const availableFor = (counts: Map<string, number>, topics: string[]) =>
  (topics.length ? topics : [...counts.keys()]).reduce((sum, t) => sum + (counts.get(t) ?? 0), 0);

export function ExamsPage() {
  const exams = useLiveQuery(() => db.exams.orderBy('createdAt').reverse().toArray());
  const counts = useLiveQuery(topicCounts) ?? new Map<string, number>();
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<Exam | null>(null);

  const totalReady = availableFor(counts, []);

  return (
    <>
      <PageHeader
        title="יצירת וניהול מבחנים"
        subtitle={`${totalReady} שאלות מוכנות בבנק (עם תשובה נכונה)`}
        actions={
          <Button variant="primary" onClick={() => setEditing({ id: null, draft: emptyExamDraft() })}>
            <Plus className="h-5 w-5" /> מבחן חדש
          </Button>
        }
      />

      {exams?.length === 0 ? (
        <EmptyState icon={<ClipboardList className="h-10 w-10" />} title="עדיין אין מבחנים">
          {totalReady ? 'צרו מבחן תרגול או מבחן מסכם מתוך בנק השאלות.' : 'קודם טענו שאלות לבנק השאלות, ואז צרו מבחן.'}
        </EmptyState>
      ) : (
        <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {exams?.map((exam) => {
            const available = availableFor(counts, exam.topics);
            return (
              <li key={exam.id} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-lg font-semibold" dir="auto">{exam.title}</h3>
                    {exam.description && <p className="line-clamp-2 text-sm text-slate-500 dark:text-slate-400" dir="auto">{exam.description}</p>}
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
                      exam.mode === 'final'
                        ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300'
                        : 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300'
                    }`}
                  >
                    {MODE_LABELS[exam.mode]}
                  </span>
                </div>

                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600 dark:text-slate-300">
                  <span>{exam.questionCount} שאלות</span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    {exam.durationMinutes ? `${exam.durationMinutes} דק׳` : 'ללא הגבלת זמן'}
                  </span>
                  {(exam.shuffleQuestions || exam.shuffleOptions) && (
                    <span className="inline-flex items-center gap-1">
                      <Shuffle className="h-4 w-4" /> ערבוב
                    </span>
                  )}
                  <span>{exam.topics.length ? exam.topics.join(', ') : 'כל הנושאים'}</span>
                </div>

                {available < exam.questionCount && (
                  <p className="mt-3 flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    זמינות רק {available} שאלות בנושאים שנבחרו
                  </p>
                )}

                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
                  <button
                    onClick={() => setExamPublished(exam.id, !exam.published)}
                    className={`inline-flex min-h-12 items-center gap-2 rounded-xl px-3 text-sm font-semibold ${
                      exam.published
                        ? 'text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-500/10'
                        : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    {exam.published ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
                    {exam.published ? 'מפורסם לנבחנים' : 'טיוטה — לחצו לפרסום'}
                  </button>
                  <div className="flex">
                    <IconButton label="עריכה" onClick={() => setEditing({ id: exam.id, draft: toDraft(exam) })}>
                      <Pencil className="h-5 w-5" />
                    </IconButton>
                    <IconButton
                      label="שכפול"
                      onClick={() => setEditing({ id: null, draft: { ...toDraft(exam), title: `${exam.title} (עותק)`, published: false } })}
                    >
                      <Copy className="h-5 w-5" />
                    </IconButton>
                    <IconButton label="מחיקה" danger onClick={() => setDeleting(exam)}>
                      <Trash2 className="h-5 w-5" />
                    </IconButton>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ExamDialog editing={editing} counts={counts} onChange={setEditing} />
      <ConfirmDialog
        open={!!deleting}
        title="מחיקת מבחן"
        message={`למחוק את המבחן "${deleting?.title ?? ''}"?`}
        onConfirm={() => (deleting ? deleteExam(deleting.id) : undefined)}
        onClose={() => setDeleting(null)}
      />
    </>
  );
}

function ExamDialog({
  editing,
  counts,
  onChange,
}: {
  editing: Editing;
  counts: Map<string, number>;
  onChange: (e: Editing) => void;
}) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOpen = !!editing;
  useEffect(() => setError(null), [isOpen, editing?.id]);

  if (!editing) return <Modal open={false} title="" onClose={() => onChange(null)}>{null}</Modal>;

  const { draft } = editing;
  const set = <K extends keyof ExamDraft>(key: K, value: ExamDraft[K]) =>
    onChange({ ...editing, draft: { ...draft, [key]: value } });
  const available = availableFor(counts, draft.topics);
  const topics = [...counts.keys()].sort((a, b) => a.localeCompare(b, 'he'));

  const setMode = (mode: ExamMode) =>
    onChange({
      ...editing,
      draft: { ...draft, mode, durationMinutes: mode === 'final' ? (draft.durationMinutes ?? 60) : draft.durationMinutes },
    });

  const toggleTopic = (topic: string) =>
    set('topics', draft.topics.includes(topic) ? draft.topics.filter((t) => t !== topic) : [...draft.topics, topic]);

  const save = async () => {
    const problem = validateExam(draft, available);
    if (problem) {
      setError(problem);
      return;
    }
    if (!user) return;
    setBusy(true);
    try {
      await saveExam(editing.id, draft, user.id);
      onChange(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'השמירה נכשלה.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      size="lg"
      title={editing.id ? 'עריכת מבחן' : 'מבחן חדש'}
      onClose={() => onChange(null)}
      footer={
        <>
          <Button variant="ghost" onClick={() => onChange(null)}>
            ביטול
          </Button>
          <Button variant="primary" loading={busy} onClick={save}>
            שמירה
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <TextField id="exam-title" label="שם המבחן" value={draft.title} onChange={(e) => set('title', e.target.value)} required />
        <TextAreaField id="exam-description" label="תיאור / הנחיות לנבחן" value={draft.description} onChange={(e) => set('description', e.target.value)} />

        <div>
          <span className="mb-1.5 block text-sm font-medium text-slate-600 dark:text-slate-300">סוג</span>
          <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1 dark:bg-slate-800">
            {(['practice', 'final'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setMode(mode)}
                className={`min-h-12 rounded-xl px-3 text-start transition ${
                  draft.mode === mode ? 'bg-white shadow dark:bg-slate-900' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <div className="font-semibold">{MODE_LABELS[mode]}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {mode === 'practice' ? 'משוב מיידי והסברים' : 'טיימר, ללא משוב, הגשה אחת'}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5" htmlFor="exam-count">
            <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
              מספר שאלות <span className="font-normal text-slate-400">(זמינות: {available})</span>
            </span>
            <input
              id="exam-count"
              type="number"
              inputMode="numeric"
              min={1}
              max={available || undefined}
              className={inputClass}
              value={draft.questionCount || ''}
              onChange={(e) => set('questionCount', Number(e.target.value))}
            />
          </label>
          <label className="block space-y-1.5" htmlFor="exam-duration">
            <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
              זמן (דקות) {draft.mode === 'practice' && <span className="font-normal text-slate-400">— ריק = ללא הגבלה</span>}
            </span>
            <input
              id="exam-duration"
              type="number"
              inputMode="numeric"
              min={1}
              className={inputClass}
              value={draft.durationMinutes ?? ''}
              onChange={(e) => set('durationMinutes', e.target.value ? Number(e.target.value) : null)}
            />
          </label>
        </div>

        <div>
          <span className="mb-1.5 block text-sm font-medium text-slate-600 dark:text-slate-300">
            נושאים <span className="font-normal text-slate-400">— ללא בחירה = כל הנושאים</span>
          </span>
          {topics.length ? (
            <div className="flex flex-wrap gap-2">
              {topics.map((topic) => {
                const selected = draft.topics.includes(topic);
                return (
                  <button
                    key={topic}
                    type="button"
                    onClick={() => toggleTopic(topic)}
                    aria-pressed={selected}
                    className={`min-h-12 rounded-xl border px-4 text-sm font-medium transition ${
                      selected
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300'
                        : 'border-slate-300 hover:border-indigo-300 dark:border-slate-700'
                    }`}
                  >
                    {topic} <span className="text-slate-400">({counts.get(topic)})</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-slate-500">אין עדיין שאלות עם תשובה נכונה בבנק.</p>
          )}
        </div>

        <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 px-4 dark:divide-slate-800 dark:border-slate-800">
          <Toggle label="ערבוב סדר השאלות" checked={draft.shuffleQuestions} onChange={(v) => set('shuffleQuestions', v)} />
          <Toggle label="ערבוב סדר התשובות" checked={draft.shuffleOptions} onChange={(v) => set('shuffleOptions', v)} />
          <Toggle
            label="פרסום לנבחנים"
            hint="מבחן שאינו מפורסם נשמר כטיוטה"
            checked={draft.published}
            onChange={(v) => set('published', v)}
          />
        </div>

        <ErrorText message={error} />
      </div>
    </Modal>
  );
}
