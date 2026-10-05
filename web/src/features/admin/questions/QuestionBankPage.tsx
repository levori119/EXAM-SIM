import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { FilePlus2, FileUp, FolderOpen, GitMerge, Image as ImageIcon, Link2, List, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { db, type Question } from '../../../db/db';
import { addFilesToUpload, EMPTY_UPLOAD, type UploadResult } from '../../../ingest/buildUpload';
import {
  addMedia,
  addQuestion,
  deleteQuestion,
  DIFFICULTY_LABELS,
  emptyDraft,
  toDraft,
  updateQuestion,
  validateDraft,
  type QuestionDraft,
} from '../../../services/questionBank';
import { deleteSet, listSetSummaries, mergeSet, relinkSet, renameSet, type SetSummary } from '../../../services/questionSets';
import { ConfirmDialog, Modal } from '../../../components/Modal';
import { EmptyState, PageHeader } from '../../../components/PageHeader';
import { IconButton } from '../../../components/IconButton';
import { Button, ErrorText, inputClass, SelectField, TextField } from '../../../components/fields';
import { QuestionEditor } from './QuestionEditor';
import { UPLOAD_ACCEPT, UploadReviewDialog } from './UploadReviewDialog';

type Editing = { id: string | null; setId: string; draft: QuestionDraft } | null;
type Deleting = { kind: 'question'; question: Question } | { kind: 'set'; set: SetSummary } | null;
type PendingUpload = { result: UploadResult; setName?: string } | null;

export function QuestionBankPage() {
  const sets = useLiveQuery(listSetSummaries);
  const questions = useLiveQuery(() => db.questions.orderBy('createdAt').toArray());
  const setNames = new Map((sets ?? []).map((s) => [s.id, s.name]));

  const [upload, setUpload] = useState<PendingUpload>(null);
  const [processing, setProcessing] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<Deleting>(null);
  const [renaming, setRenaming] = useState<SetSummary | null>(null);
  const [merging, setMerging] = useState<SetSummary | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const relink = async (set: SetSummary) => {
    const added = await relinkSet(set.id);
    setToast(added ? `שויכו ${added} תמונות לשאלות ב"${set.name}".` : `לא נמצאו תמונות חדשות לשיוך ב"${set.name}".`);
  };

  const [setFilter, setSetFilter] = useState('');
  const [query, setQuery] = useState('');
  const [onlyUnanswered, setOnlyUnanswered] = useState(false);
  const questionsRef = useRef<HTMLElement>(null);

  const handleFiles = async (files: File[], setName?: string) => {
    setUploadError(null);
    setProcessing(files.length === 1 ? files[0].name : `${files.length} קבצים`);
    try {
      setUpload({ result: await addFilesToUpload(EMPTY_UPLOAD, files), setName });
    } catch (err) {
      setUploadError(`קריאת הקבצים נכשלה: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setProcessing(null);
    }
  };

  const showQuestionsOf = (setId: string) => {
    setSetFilter(setId);
    questionsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const q = query.trim().toLowerCase();
  const visible = (questions ?? []).filter(
    (x) =>
      (!setFilter || x.setId === setFilter) &&
      (!onlyUnanswered || x.correctIndex === null) &&
      (!q || x.text.toLowerCase().includes(q) || x.options.some((o) => o.toLowerCase().includes(q))),
  );

  return (
    <>
      <PageHeader
        title="שאלונים ובנק שאלות"
        subtitle="כל העלאה (שאלות + מפתח תשובות + איורים) נשמרת כשאלון בעל שם — נושא נפרד שאפשר לשלב במבחנים ובתרגולים"
        actions={
          sets?.length ? (
            <Button onClick={() => setEditing({ id: null, setId: setFilter || sets[0].id, draft: emptyDraft() })}>
              <Plus className="h-5 w-5" /> שאלה ידנית
            </Button>
          ) : undefined
        }
      />

      <UploadZone processing={processing} onFiles={(files) => handleFiles(files)} />
      <div className="mt-2">
        <ErrorText message={uploadError} />
      </div>

      {/* Questionnaires */}
      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">שאלונים {sets && <span className="text-slate-400">({sets.length})</span>}</h2>
        {sets?.length === 0 ? (
          <EmptyState icon={<FolderOpen className="h-10 w-10" />} title="עדיין אין שאלונים">
            העלו קובץ שאלות כדי ליצור את השאלון הראשון.
          </EmptyState>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sets?.map((set) => (
              <SetCard
                key={set.id}
                set={set}
                selected={setFilter === set.id}
                onShow={() => showQuestionsOf(set.id)}
                onAddFiles={(files) => handleFiles(files, set.name)}
                onRename={() => setRenaming(set)}
                onRelink={() => relink(set)}
                onMerge={sets.length > 1 ? () => setMerging(set) : undefined}
                onDelete={() => setDeleting({ kind: 'set', set })}
              />
            ))}
          </ul>
        )}
      </section>

      {/* Questions */}
      {!!questions?.length && (
        <section ref={questionsRef} className="mt-8 scroll-mt-4">
          <h2 className="mb-3 text-lg font-semibold">שאלות</h2>
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto h-5 w-5 text-slate-400" />
              <input className={`${inputClass} ps-10`} placeholder="חיפוש בשאלות" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <select className={`${inputClass} sm:w-56`} value={setFilter} onChange={(e) => setSetFilter(e.target.value)}>
              <option value="">כל השאלונים</option>
              {sets?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <label className="flex min-h-12 items-center gap-2 px-2 text-sm">
              <input type="checkbox" className="h-5 w-5 accent-indigo-600" checked={onlyUnanswered} onChange={(e) => setOnlyUnanswered(e.target.checked)} />
              ללא תשובה נכונה
            </label>
          </div>

          <ul className="space-y-2">
            {visible.map((question) => (
              <li key={question.id} className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 font-medium" dir="auto">{question.text}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                    {!setFilter && <Chip tone="set">{setNames.get(question.setId)}</Chip>}
                    <Chip>{DIFFICULTY_LABELS[question.difficulty]}</Chip>
                    <Chip>{question.options.length} תשובות</Chip>
                    {question.imageIds?.length > 0 && <Chip>🖼 {question.imageIds.length}</Chip>}
                    {question.correctIndex === null ? (
                      <Chip tone="warn">חסרה תשובה נכונה</Chip>
                    ) : (
                      <Chip tone="ok">
                        <span className="line-clamp-1" dir="auto">✓ {question.options[question.correctIndex]}</span>
                      </Chip>
                    )}
                  </div>
                </div>
                <IconButton label="עריכה" onClick={() => setEditing({ id: question.id, setId: question.setId, draft: toDraft(question) })}>
                  <Pencil className="h-5 w-5" />
                </IconButton>
                <IconButton label="מחיקה" danger onClick={() => setDeleting({ kind: 'question', question })}>
                  <Trash2 className="h-5 w-5" />
                </IconButton>
              </li>
            ))}
            {!visible.length && <li className="py-8 text-center text-slate-500">אין שאלות שתואמות לסינון.</li>}
          </ul>
        </section>
      )}

      <UploadReviewDialog initial={upload?.result ?? null} setName={upload?.setName} onClose={() => setUpload(null)} />
      <QuestionDialog editing={editing} sets={sets ?? []} onChange={setEditing} />
      <RenameDialog set={renaming} onClose={() => setRenaming(null)} />
      <MergeDialog
        source={merging}
        sets={sets ?? []}
        onClose={() => setMerging(null)}
        onMerged={(target, added) => setToast(`השאלון אוחד לתוך "${target}"${added ? ` ושויכו ${added} תמונות לשאלות` : ''}.`)}
      />
      {toast && (
        <div role="status" className="fixed inset-x-4 bottom-24 z-50 mx-auto max-w-md rounded-2xl bg-slate-900 px-4 py-3 text-center text-white shadow-xl md:bottom-6 dark:bg-slate-100 dark:text-slate-900">
          {toast}
        </div>
      )}
      <ConfirmDialog
        open={!!deleting}
        title={deleting?.kind === 'set' ? 'מחיקת שאלון' : 'מחיקת שאלה'}
        message={
          deleting?.kind === 'set'
            ? `למחוק את השאלון "${deleting.set.name}" על ${deleting.set.questionCount} השאלות, הקבצים והתמונות שלו? הוא יוסר גם ממבחנים שמשתמשים בו.`
            : 'למחוק את השאלה מבנק השאלות?'
        }
        onConfirm={() =>
          deleting?.kind === 'set'
            ? deleteSet(deleting.set.id).then(() => setSetFilter((f) => (f === deleting.set.id ? '' : f)))
            : deleting?.kind === 'question'
              ? deleteQuestion(deleting.question.id)
              : undefined
        }
        onClose={() => setDeleting(null)}
      />
    </>
  );
}

function SetCard({
  set,
  selected,
  onShow,
  onAddFiles,
  onRename,
  onRelink,
  onMerge,
  onDelete,
}: {
  set: SetSummary;
  selected: boolean;
  onShow: () => void;
  onAddFiles: (files: File[]) => void;
  onRename: () => void;
  onRelink: () => void;
  onMerge?: () => void;
  onDelete: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const unanswered = set.questionCount - set.answerableCount;
  return (
    <li
      className={`flex flex-col rounded-2xl border bg-white p-4 dark:bg-slate-900 ${
        selected ? 'border-indigo-400 ring-2 ring-indigo-500/20' : 'border-slate-200 dark:border-slate-800'
      }`}
    >
      <div className="flex items-start gap-2">
        <FolderOpen className="mt-0.5 h-5 w-5 shrink-0 text-indigo-500" />
        <h3 className="min-w-0 flex-1 font-semibold" dir="auto">{set.name}</h3>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
        <Chip>{set.questionCount} שאלות</Chip>
        {unanswered > 0 && <Chip tone="warn">{unanswered} ללא תשובה</Chip>}
        {set.imageCount > 0 && (
          <Chip>
            <ImageIcon className="inline h-3 w-3" /> {set.imageCount}
          </Chip>
        )}
      </div>
      {set.documentNames.length > 0 && (
        <p className="mt-2 line-clamp-2 text-xs text-slate-500" dir="auto" title={set.documentNames.join(', ')}>
          {set.documentNames.join(' · ')}
        </p>
      )}
      <div className="mt-auto flex flex-wrap items-center gap-0.5 pt-3">
        <IconButton label="הצגת השאלות" onClick={onShow}>
          <List className="h-5 w-5" />
        </IconButton>
        <IconButton label="הוספת קבצים לשאלון (תמונות / מפתח תשובות)" onClick={() => fileRef.current?.click()}>
          <FilePlus2 className="h-5 w-5" />
        </IconButton>
        <IconButton label="שיוך תמונות לשאלות מחדש" onClick={onRelink}>
          <Link2 className="h-5 w-5" />
        </IconButton>
        {onMerge && (
          <IconButton label="מיזוג לשאלון אחר" onClick={onMerge}>
            <GitMerge className="h-5 w-5" />
          </IconButton>
        )}
        <IconButton label="שינוי שם" onClick={onRename}>
          <Pencil className="h-5 w-5" />
        </IconButton>
        <IconButton label="מחיקת שאלון" danger onClick={onDelete}>
          <Trash2 className="h-5 w-5" />
        </IconButton>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept={UPLOAD_ACCEPT}
          className="hidden"
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = '';
            if (files.length) onAddFiles(files);
          }}
        />
      </div>
    </li>
  );
}

function Chip({ children, tone }: { children: ReactNode; tone?: 'ok' | 'warn' | 'set' }) {
  const toneClass =
    tone === 'ok'
      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
      : tone === 'warn'
        ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300'
        : tone === 'set'
          ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300'
          : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
  return <span className={`max-w-60 truncate rounded-full px-2.5 py-1 ${toneClass}`}>{children}</span>;
}

function UploadZone({ processing, onFiles }: { processing: string | null; onFiles: (files: File[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length) onFiles([...e.dataTransfer.files]);
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={`flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed px-6 py-10 text-center transition ${
        dragging ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10' : 'border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900'
      }`}
    >
      {processing ? (
        <>
          <span className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
          <p className="font-medium">מעבד את {processing}…</p>
        </>
      ) : (
        <>
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
            <FileUp className="h-7 w-7" />
          </div>
          <div>
            <p className="font-semibold">שאלון חדש — גררו לכאן קבצים</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              קובץ שאלות (PDF / Word / טקסט) + תמונות ותרשימים + קובץ מפתח תשובות — אפשר כמה יחד
            </p>
          </div>
          <Button variant="primary" onClick={() => inputRef.current?.click()}>
            בחירת קבצים
          </Button>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={UPLOAD_ACCEPT}
            className="hidden"
            onChange={(e) => {
              const files = [...(e.target.files ?? [])];
              e.target.value = '';
              if (files.length) onFiles(files);
            }}
          />
        </>
      )}
    </div>
  );
}

function RenameDialog({ set, onClose }: { set: SetSummary | null; onClose: () => void }) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!set) return;
    setName(set.name);
    setError(null);
  }, [set]);

  const save = async () => {
    if (!set) return;
    setBusy(true);
    try {
      await renameSet(set.id, name);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'השמירה נכשלה.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={!!set}
      title="שינוי שם שאלון"
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
      <div className="space-y-3">
        <TextField id="rename-set" label="שם השאלון" value={name} onChange={(e) => setName(e.target.value)} />
        <ErrorText message={error} />
      </div>
    </Modal>
  );
}

function MergeDialog({
  source,
  sets,
  onClose,
  onMerged,
}: {
  source: SetSummary | null;
  sets: SetSummary[];
  onClose: () => void;
  onMerged: (targetName: string, linksAdded: number) => void;
}) {
  const targets = sets.filter((s) => s.id !== source?.id);
  const [targetId, setTargetId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!source) return;
    setTargetId(sets.find((s) => s.id !== source.id)?.id ?? '');
    setError(null);
  }, [source, sets]);

  const merge = async () => {
    if (!source || !targetId) return;
    setBusy(true);
    try {
      const added = await mergeSet(source.id, targetId);
      onMerged(targets.find((t) => t.id === targetId)?.name ?? '', added);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'המיזוג נכשל.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={!!source}
      title={`מיזוג "${source?.name ?? ''}"`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            ביטול
          </Button>
          <Button variant="primary" loading={busy} disabled={!targetId} onClick={merge}>
            מיזוג
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          כל השאלות, הקבצים והתמונות של "{source?.name}" יעברו לשאלון שתבחרו, והתמונות ישויכו אוטומטית לשאלות שמפנות
          אליהן (למשל "picture 36" ← "תמונה 36"). השאלון "{source?.name}" יימחק.
        </p>
        <SelectField id="merge-target" label="לאיזה שאלון למזג?" value={targetId} onChange={(e) => setTargetId(e.target.value)}>
          {targets.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.questionCount} שאלות)
            </option>
          ))}
        </SelectField>
        <ErrorText message={error} />
      </div>
    </Modal>
  );
}

function QuestionDialog({ editing, sets, onChange }: { editing: Editing; sets: SetSummary[]; onChange: (e: Editing) => void }) {
  const setId = editing?.setId ?? '';
  const attachedKey = editing?.draft.imageIds.join(',') ?? '';
  // Images of the same questionnaire, plus whatever is attached already.
  const pool = useLiveQuery(async () => {
    if (!editing) return [];
    const [fromSet, attached] = await Promise.all([
      setId ? db.media.where('setId').equals(setId).toArray() : [],
      db.media.bulkGet(editing.draft.imageIds),
    ]);
    const all = new Map([...fromSet, ...attached.filter((m) => !!m)].map((m) => [m.id, m]));
    return [...all.values()];
  }, [!!editing, setId, attachedKey]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const close = () => {
    setError(null);
    onChange(null);
  };

  const save = async () => {
    if (!editing) return;
    const problem = validateDraft(editing.draft);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    try {
      if (editing.id) await updateQuestion(editing.id, editing.setId, editing.draft);
      else await addQuestion(editing.setId, editing.draft);
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'השמירה נכשלה.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={!!editing}
      title={editing?.id ? 'עריכת שאלה' : 'שאלה חדשה'}
      onClose={close}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            ביטול
          </Button>
          <Button variant="primary" loading={busy} onClick={save}>
            שמירה
          </Button>
        </>
      }
    >
      {editing && (
        <div className="space-y-4">
          <SelectField id="question-set" label="שאלון" value={editing.setId} onChange={(e) => onChange({ ...editing, setId: e.target.value })}>
            {sets.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </SelectField>
          <QuestionEditor
            idPrefix="edit"
            draft={editing.draft}
            media={{ pool: pool ?? [], onUpload: (file) => addMedia(file, editing.setId) }}
            onChange={(draft) => onChange({ ...editing, draft })}
          />
        </div>
      )}
      <div className="mt-4">
        <ErrorText message={error} />
      </div>
    </Modal>
  );
}
