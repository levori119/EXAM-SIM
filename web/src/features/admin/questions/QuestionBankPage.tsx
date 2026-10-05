import { useRef, useState, type DragEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { FileText, FileUp, Image as ImageIcon, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { db, type Question, type SourceDocument } from '../../../db/db';
import { addFilesToUpload, EMPTY_UPLOAD, type UploadResult } from '../../../ingest/buildUpload';
import {
  addMedia,
  addQuestion,
  deleteDocument,
  deleteQuestion,
  DIFFICULTY_LABELS,
  emptyDraft,
  toDraft,
  updateQuestion,
  validateDraft,
  type QuestionDraft,
} from '../../../services/questionBank';
import { ConfirmDialog, Modal } from '../../../components/Modal';
import { EmptyState, PageHeader } from '../../../components/PageHeader';
import { IconButton } from '../../../components/IconButton';
import { Button, ErrorText, inputClass } from '../../../components/fields';
import { QuestionEditor, TopicsDatalist } from './QuestionEditor';
import { UPLOAD_ACCEPT, UploadReviewDialog } from './UploadReviewDialog';

const sizeFormat = (bytes: number) => (bytes > 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.ceil(bytes / 1e3)} KB`);
const dateFormat = new Intl.DateTimeFormat('he-IL', { dateStyle: 'short' });

type Editing = { id: string | null; documentId: string | null; draft: QuestionDraft } | null;
type Deleting = { kind: 'question'; question: Question } | { kind: 'document'; doc: SourceDocument } | null;

export function QuestionBankPage() {
  const questions = useLiveQuery(() => db.questions.orderBy('createdAt').reverse().toArray());
  const documents = useLiveQuery(() => db.documents.orderBy('createdAt').reverse().toArray());
  const topics = [...new Set((questions ?? []).map((q) => q.topic))].sort((a, b) => a.localeCompare(b, 'he'));

  const [upload, setUpload] = useState<UploadResult | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<Deleting>(null);

  const [query, setQuery] = useState('');
  const [topicFilter, setTopicFilter] = useState('');
  const [onlyUnanswered, setOnlyUnanswered] = useState(false);

  const handleFiles = async (files: File[]) => {
    setUploadError(null);
    setProcessing(files.length === 1 ? files[0].name : `${files.length} קבצים`);
    try {
      setUpload(await addFilesToUpload(EMPTY_UPLOAD, files));
    } catch (err) {
      setUploadError(`קריאת הקבצים נכשלה: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setProcessing(null);
    }
  };

  const q = query.trim().toLowerCase();
  const visible = (questions ?? []).filter(
    (x) =>
      (!topicFilter || x.topic === topicFilter) &&
      (!onlyUnanswered || x.correctIndex === null) &&
      (!q || x.text.toLowerCase().includes(q) || x.options.some((o) => o.toLowerCase().includes(q))),
  );

  return (
    <>
      <PageHeader
        title="טעינת שאלות ובנק שאלות"
        subtitle="העלו קובץ שאלות (PDF / טקסט), ואם יש — גם תמונות וקובץ מפתח תשובות נפרד"
        actions={
          <Button variant="secondary" onClick={() => setEditing({ id: null, documentId: null, draft: emptyDraft(topicFilter) })}>
            <Plus className="h-5 w-5" /> שאלה ידנית
          </Button>
        }
      />
      <TopicsDatalist topics={topics} />

      <UploadZone processing={processing} onFiles={handleFiles} />
      <div className="mt-2">
        <ErrorText message={uploadError} />
      </div>

      {!!documents?.length && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-semibold">קבצים שהועלו</h2>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {documents.map((doc) => (
              <li key={doc.id} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 dark:bg-slate-800">
                  {doc.mimeType.startsWith('image/') ? <ImageIcon className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium" dir="auto">{doc.name}</div>
                  <div className="text-xs text-slate-500">
                    {doc.questionCount} שאלות · {sizeFormat(doc.size)} · {dateFormat.format(doc.createdAt)}
                  </div>
                </div>
                <IconButton label="מחיקת קובץ" danger onClick={() => setDeleting({ kind: 'document', doc })}>
                  <Trash2 className="h-5 w-5" />
                </IconButton>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">בנק השאלות {questions && <span className="text-slate-400">({questions.length})</span>}</h2>

        {questions?.length === 0 ? (
          <EmptyState icon={<FileUp className="h-10 w-10" />} title="בנק השאלות ריק">
            העלו קובץ שאלות או הוסיפו שאלה ידנית כדי להתחיל.
          </EmptyState>
        ) : (
          <>
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto h-5 w-5 text-slate-400" />
                <input className={`${inputClass} ps-10`} placeholder="חיפוש בשאלות" value={query} onChange={(e) => setQuery(e.target.value)} />
              </div>
              <select className={`${inputClass} sm:w-48`} value={topicFilter} onChange={(e) => setTopicFilter(e.target.value)}>
                <option value="">כל הנושאים</option>
                {topics.map((t) => (
                  <option key={t} value={t}>
                    {t}
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
                      <Chip>{question.topic}</Chip>
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
                  <IconButton label="עריכה" onClick={() => setEditing({ id: question.id, documentId: question.documentId, draft: toDraft(question) })}>
                    <Pencil className="h-5 w-5" />
                  </IconButton>
                  <IconButton label="מחיקה" danger onClick={() => setDeleting({ kind: 'question', question })}>
                    <Trash2 className="h-5 w-5" />
                  </IconButton>
                </li>
              ))}
              {questions && !visible.length && <li className="py-8 text-center text-slate-500">אין שאלות שתואמות לסינון.</li>}
            </ul>
          </>
        )}
      </section>

      <UploadReviewDialog initial={upload} onClose={() => setUpload(null)} />
      <QuestionDialog editing={editing} onChange={setEditing} />
      <ConfirmDialog
        open={!!deleting}
        title={deleting?.kind === 'document' ? 'מחיקת קובץ' : 'מחיקת שאלה'}
        message={
          deleting?.kind === 'document'
            ? `למחוק את "${deleting.doc.name}" ואת ${deleting.doc.questionCount} השאלות שנטענו ממנו?`
            : 'למחוק את השאלה מבנק השאלות?'
        }
        onConfirm={() =>
          deleting?.kind === 'document'
            ? deleteDocument(deleting.doc.id, true)
            : deleting?.kind === 'question'
              ? deleteQuestion(deleting.question.id)
              : undefined
        }
        onClose={() => setDeleting(null)}
      />
    </>
  );
}

function Chip({ children, tone }: { children: React.ReactNode; tone?: 'ok' | 'warn' }) {
  const toneClass =
    tone === 'ok'
      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
      : tone === 'warn'
        ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300'
        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
  return <span className={`max-w-60 rounded-full px-2.5 py-1 ${toneClass}`}>{children}</span>;
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
        dragging
          ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10'
          : 'border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900'
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
            <p className="font-semibold">גררו לכאן קבצים</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              קובץ שאלות (PDF / טקסט) + תמונות ותרשימים + קובץ מפתח תשובות — אפשר כמה יחד
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

function QuestionDialog({ editing, onChange }: { editing: Editing; onChange: (e: Editing) => void }) {
  const documentId = editing?.documentId ?? null;
  const attachedKey = editing?.draft.imageIds.join(',') ?? '';
  // Images from the same source upload, plus whatever is attached already.
  const pool = useLiveQuery(async () => {
    if (!editing) return [];
    const [fromDoc, attached] = await Promise.all([
      documentId ? db.media.where('documentId').equals(documentId).toArray() : [],
      db.media.bulkGet(editing.draft.imageIds),
    ]);
    const all = new Map([...fromDoc, ...attached.filter((m) => !!m)].map((m) => [m.id, m]));
    return [...all.values()];
  }, [!!editing, documentId, attachedKey]);
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
      if (editing.id) await updateQuestion(editing.id, editing.draft);
      else await addQuestion(editing.draft);
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
        <QuestionEditor
          idPrefix="edit"
          draft={editing.draft}
          media={{ pool: pool ?? [], onUpload: (file) => addMedia(file, documentId) }}
          onChange={(draft) => onChange({ ...editing, draft })}
        />
      )}
      <div className="mt-4">
        <ErrorText message={error} />
      </div>
    </Modal>
  );
}
