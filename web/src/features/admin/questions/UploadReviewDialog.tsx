import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileKey, FilePlus2, FileText, Image as ImageIcon, Info, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../../../auth/AuthContext';
import { Modal } from '../../../components/Modal';
import { Button, ErrorText, inputClass } from '../../../components/fields';
import { emptyDraft, saveUpload } from '../../../services/questionBank';
import { addFilesToUpload, type FileRole, type UploadResult } from '../../../ingest/buildUpload';
import { compressImage } from '../../../ingest/images';
import { QuestionEditor, TOPICS_DATALIST_ID } from './QuestionEditor';

export const UPLOAD_ACCEPT = '.pdf,.txt,.md,application/pdf,text/plain,image/*';

const ROLE_LABEL: Record<FileRole, string> = {
  questions: 'שאלות',
  answers: 'מפתח תשובות',
  image: 'תמונה',
  unreadable: 'לא זוהה',
};

/** Human-in-the-loop check of auto-detected questions, answers and images before they enter the bank. */
export function UploadReviewDialog({ initial, onClose }: { initial: UploadResult | null; onClose: () => void }) {
  const { user } = useAuth();
  const [upload, setUpload] = useState<UploadResult | null>(initial);
  const [bulkTopic, setBulkTopic] = useState('');
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const moreFilesRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setUpload(initial);
    setBulkTopic('');
    setError(null);
  }, [initial]);

  const items = upload?.items ?? [];
  const unanswered = items.filter((i) => i.draft.correctIndex === null).length;

  const updateItems = (fn: (items: UploadResult['items']) => UploadResult['items']) =>
    setUpload((u) => (u ? { ...u, items: fn(u.items) } : u));

  const applyTopic = (topic: string) => {
    setBulkTopic(topic);
    updateItems((is) => is.map((i) => ({ ...i, draft: { ...i.draft, topic } })));
  };

  const addMoreFiles = async (files: FileList | null) => {
    if (!files?.length || !upload) return;
    setAdding(true);
    setError(null);
    try {
      const next = await addFilesToUpload(upload, [...files]);
      if (bulkTopic) next.items = next.items.map((i) => (i.draft.topic ? i : { ...i, draft: { ...i.draft, topic: bulkTopic } }));
      setUpload(next);
    } catch (err) {
      setError(`קריאת הקבצים נכשלה: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setAdding(false);
    }
  };

  /** Images uploaded from a single question's editor join the shared pool. */
  const uploadImage = async (file: File) => {
    const media = { id: crypto.randomUUID(), name: file.name, blob: await compressImage(file) };
    setUpload((u) => (u ? { ...u, media: [...u.media, media] } : u));
    return media.id;
  };

  const save = async () => {
    if (!upload || !user) return;
    const broken = items.findIndex((i) => !i.draft.text.trim() || i.draft.options.filter((o) => o.trim()).length < 2);
    if (broken >= 0) {
      setError(`בשאלה ${broken + 1} חסר נוסח או שיש פחות משתי תשובות.`);
      return;
    }
    setBusy(true);
    try {
      await saveUpload(upload, user.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'השמירה נכשלה.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={!!initial}
      size="lg"
      title="בדיקת קבצים ושאלות"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            ביטול
          </Button>
          <Button variant="primary" loading={busy} disabled={adding} onClick={save}>
            {items.length ? `שמירת ${items.length} שאלות` : 'שמירת הקבצים בלבד'}
          </Button>
        </>
      }
    >
      {upload && (
        <>
          {/* Files in this upload */}
          <div className="mb-4 rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold">קבצים</span>
              <Button variant="ghost" loading={adding} onClick={() => moreFilesRef.current?.click()}>
                <FilePlus2 className="h-5 w-5" /> הוספת תמונות / מפתח תשובות
              </Button>
              <input
                ref={moreFilesRef}
                type="file"
                multiple
                accept={UPLOAD_ACCEPT}
                className="hidden"
                onChange={(e) => {
                  void addMoreFiles(e.target.files);
                  e.target.value = '';
                }}
              />
            </div>
            <ul className="flex flex-wrap gap-2 text-sm">
              {upload.files.map(({ file, role }, i) => (
                <li key={i} className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 dark:bg-slate-800">
                  {role === 'answers' ? <FileKey className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                  <span className="max-w-48 truncate" dir="auto">{file.name}</span>
                  <span className={role === 'unreadable' ? 'text-amber-600' : 'text-slate-500'}>· {ROLE_LABEL[role]}</span>
                </li>
              ))}
              {upload.media.length > 0 && (
                <li className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 dark:bg-slate-800">
                  <ImageIcon className="h-4 w-4" /> {upload.media.length} תמונות
                </li>
              )}
            </ul>
            {upload.notices.length > 0 && (
              <ul className="mt-3 space-y-1 text-sm text-slate-600 dark:text-slate-300">
                {upload.notices.map((n, i) => (
                  <li key={i} className="flex gap-2">
                    <Info className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500" />
                    {n}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {items.length > 0 ? (
            <div className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/50">
              <div className="flex-1 text-sm">
                <div className="font-semibold">זוהו {items.length} שאלות</div>
                <div className={unanswered ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400'}>
                  {unanswered ? (
                    `${unanswered} ללא תשובה נכונה — סמנו אותן או הוסיפו קובץ מפתח תשובות`
                  ) : (
                    <span className="inline-flex items-center gap-1">
                      <CheckCircle2 className="h-4 w-4" /> לכל השאלות זוהתה תשובה נכונה
                    </span>
                  )}
                </div>
              </div>
              <label className="block w-full space-y-1 sm:w-56">
                <span className="text-sm text-slate-500">נושא לכל השאלות</span>
                <input list={TOPICS_DATALIST_ID} className={inputClass} value={bulkTopic} onChange={(e) => applyTopic(e.target.value)} />
              </label>
            </div>
          ) : (
            <p className="mb-4 flex gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              לא זוהו שאלות. ניתן להוסיף שאלות ידנית או לשמור את הקבצים בלבד.
            </p>
          )}

          <ol className="space-y-4">
            {items.map((item, i) => (
              <li
                key={i}
                className={`rounded-2xl border p-4 ${
                  item.draft.correctIndex === null ? 'border-amber-300 dark:border-amber-500/40' : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-semibold text-slate-500">
                    שאלה {i + 1}
                    {item.number !== null && item.number !== i + 1 && <span className="font-normal"> (מס׳ {item.number} בקובץ)</span>}
                  </span>
                  <button
                    type="button"
                    onClick={() => updateItems((is) => is.filter((_, j) => j !== i))}
                    className="flex h-10 items-center gap-1 rounded-lg px-2 text-sm text-slate-400 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" /> הסרה
                  </button>
                </div>
                <QuestionEditor
                  compact
                  idPrefix={`review-${i}`}
                  draft={item.draft}
                  media={{ pool: upload.media, onUpload: uploadImage }}
                  onChange={(draft) => updateItems((is) => is.map((x, j) => (j === i ? { ...x, draft } : x)))}
                />
              </li>
            ))}
          </ol>

          <Button
            variant="ghost"
            className="mt-4"
            onClick={() => updateItems((is) => [...is, { number: null, draft: emptyDraft(bulkTopic) }])}
          >
            <Plus className="h-5 w-5" /> הוספת שאלה ידנית
          </Button>
          <div className="mt-4">
            <ErrorText message={error} />
          </div>
        </>
      )}
    </Modal>
  );
}
