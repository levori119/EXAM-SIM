import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Check, GraduationCap, Pencil, Plus, Trash2 } from 'lucide-react';
import { COURSE_COLORS } from '../../../db/db';
import { useAuth } from '../../../auth/AuthContext';
import { useCourse } from '../../../courses/CourseContext';
import { createCourse, deleteCourse, listCourseSummaries, updateCourse, type CourseDraft, type CourseSummary } from '../../../services/courses';
import { ConfirmDialog, Modal } from '../../../components/Modal';
import { EmptyState, PageHeader } from '../../../components/PageHeader';
import { IconButton } from '../../../components/IconButton';
import { Button, ErrorText, TextAreaField, TextField } from '../../../components/fields';

type Editing = { id: string | null; draft: CourseDraft } | null;

export function CoursesPage() {
  const { courseId, setCourseId } = useCourse();
  const courses = useLiveQuery(listCourseSummaries);
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<CourseSummary | null>(null);

  const open = (id: string) => {
    setCourseId(id);
    location.hash = 'overview';
  };

  return (
    <>
      <PageHeader
        title="קורסים"
        subtitle="כל קורס מכיל שאלונים, מבחנים, תרגולים וחומרי לימוד משלו"
        actions={
          <Button variant="primary" onClick={() => setEditing({ id: null, draft: { name: '', description: '', color: '' } })}>
            <Plus className="h-5 w-5" /> קורס חדש
          </Button>
        }
      />

      {courses?.length === 0 ? (
        <EmptyState icon={<GraduationCap className="h-10 w-10" />} title="עדיין אין קורסים">
          צרו קורס ראשון — למשל "משיט 30 — ימאות".
        </EmptyState>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses?.map((c) => {
            const current = c.id === courseId;
            return (
              <li
                key={c.id}
                className={`flex flex-col overflow-hidden rounded-2xl border bg-white dark:bg-slate-900 ${
                  current ? 'border-indigo-400 ring-2 ring-indigo-500/20' : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                <div className="h-2" style={{ backgroundColor: c.color }} />
                <div className="flex flex-1 flex-col p-4">
                  <div className="flex items-start gap-2">
                    <h3 className="min-w-0 flex-1 text-lg font-semibold" dir="auto">{c.name}</h3>
                    {current && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
                        <Check className="h-3 w-3" /> נוכחי
                      </span>
                    )}
                  </div>
                  {c.description && <p className="mt-1 line-clamp-2 text-sm text-slate-500 dark:text-slate-400" dir="auto">{c.description}</p>}
                  <dl className="mt-3 grid grid-cols-4 gap-2 text-center">
                    {(
                      [
                        ['שאלונים', c.questionnaires],
                        ['שאלות', c.questions],
                        ['מבחנים', c.exams],
                        ['חומרים', c.materials],
                      ] as const
                    ).map(([label, value]) => (
                      <div key={label} className="rounded-xl bg-slate-50 py-2 dark:bg-slate-800/60">
                        <dd className="text-lg font-bold tabular-nums">{value}</dd>
                        <dt className="text-xs text-slate-500 dark:text-slate-400">{label}</dt>
                      </div>
                    ))}
                  </dl>
                  <div className="mt-auto flex items-center gap-1 pt-4">
                    <Button variant={current ? 'secondary' : 'primary'} className="flex-1" onClick={() => open(c.id)}>
                      כניסה לקורס
                    </Button>
                    <IconButton label="עריכה" onClick={() => setEditing({ id: c.id, draft: { name: c.name, description: c.description, color: c.color } })}>
                      <Pencil className="h-5 w-5" />
                    </IconButton>
                    <IconButton label="מחיקה" danger onClick={() => setDeleting(c)}>
                      <Trash2 className="h-5 w-5" />
                    </IconButton>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <CourseDialog editing={editing} onClose={() => setEditing(null)} onCreated={(id) => setCourseId(id)} />
      <ConfirmDialog
        open={!!deleting}
        title="מחיקת קורס"
        message={
          deleting && (
            <>
              למחוק את הקורס <b>{deleting.name}</b> וכל מה שבו — {deleting.questionnaires} שאלונים ({deleting.questions} שאלות), {deleting.exams}{' '}
              מבחנים, {deleting.materials} חומרי לימוד והיסטוריית התרגולים? הפעולה אינה ניתנת לביטול.
            </>
          )
        }
        onConfirm={() => (deleting ? deleteCourse(deleting.id) : undefined)}
        onClose={() => setDeleting(null)}
      />
    </>
  );
}

function CourseDialog({ editing, onClose, onCreated }: { editing: Editing; onClose: () => void; onCreated: (id: string) => void }) {
  const { user } = useAuth();
  const [draft, setDraft] = useState<CourseDraft>({ name: '', description: '', color: COURSE_COLORS[0] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!editing) return;
    setDraft({ ...editing.draft, color: editing.draft.color || COURSE_COLORS[0] });
    setError(null);
  }, [editing]);

  const save = async () => {
    if (!editing || !user) return;
    setBusy(true);
    try {
      if (editing.id) await updateCourse(editing.id, draft);
      else onCreated(await createCourse(draft, user.id));
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'השמירה נכשלה.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={!!editing}
      title={editing?.id ? 'עריכת קורס' : 'קורס חדש'}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            ביטול
          </Button>
          <Button variant="primary" loading={busy} onClick={save}>
            שמירה
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <TextField id="course-name" label="שם הקורס" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required />
        <TextAreaField
          id="course-description"
          label="תיאור (לא חובה)"
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
        />
        <div>
          <span className="mb-1.5 block text-sm font-medium text-slate-600 dark:text-slate-300">צבע</span>
          <div className="flex flex-wrap gap-2">
            {COURSE_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                aria-label={`צבע ${color}`}
                aria-pressed={draft.color === color}
                onClick={() => setDraft({ ...draft, color })}
                className={`h-10 w-10 rounded-full ring-offset-2 transition dark:ring-offset-slate-900 ${draft.color === color ? 'ring-2 ring-slate-900 dark:ring-white' : ''}`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </div>
        <ErrorText message={error} />
      </div>
    </Modal>
  );
}
