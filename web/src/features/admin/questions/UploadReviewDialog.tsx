import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../db/db';
import { AlertTriangle, CheckCircle2, FileKey, FilePlus2, FileText, Image as ImageIcon, Info, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../../../auth/AuthContext';
import { Modal } from '../../../components/Modal';
import { Button, ErrorText, inputClass } from '../../../components/fields';
import { emptyDraft, previewCrossLinks, saveUpload } from '../../../services/questionBank';
import { addFilesToUpload, type FileRole, type UploadResult } from '../../../ingest/buildUpload';
import { compressImage } from '../../../ingest/images';
import { normalizeSetName } from '../../../services/questionSets';
import { QuestionEditor } from './QuestionEditor';

export const UPLOAD_ACCEPT = '.pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,image/*';

const ROLE_LABEL: Record<FileRole, string> = {
  questions: 'שאלות',
  answers: 'מפתח תשובות',
  figures: 'תמונות',
  image: 'תמונה',
  unreadable: 'לא זוהה',
};

const defaultName = (upload: UploadResult) => {
  const main = upload.files.find((f) => f.role === 'questions') ?? upload.files[0];
  return main ? main.file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() : '';
};

/** Human-in-the-loop check of auto-detected questions, answers and images before they enter the bank. */
export function UploadReviewDialog({
  initial,
  setName: fixedSetName,
  onClose,
}: {
  initial: UploadResult | null;
  /** Adding files to an existing questionnaire: its name, locked. */
  setName?: string;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const [upload, setUpload] = useState<UploadResult | null>(initial);
  const [setName, setSetName] = useState('');
  const existingNames = useLiveQuery(async () => (await db.questionSets.toArray()).map((s) => s.name)) ?? [];
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const moreFilesRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setUpload(initial);
    setSetName(fixedSetName ?? (initial ? defaultName(initial) : ''));
    setError(null);
  }, [initial, fixedSetName]);

  const appending = existingNames.includes(normalizeSetName(setName));

  // When adding to an existing questionnaire, pictures also link to its saved questions (and vice versa).
  const [crossLinkCount, setCrossLinkCount] = useState(0);
  useEffect(() => {
    if (!upload || !appending) {
      setCrossLinkCount(0);
      return;
    }
    let cancelled = false;
    void previewCrossLinks(setName, upload).then((n) => !cancelled && setCrossLinkCount(n));
    return () => {
      cancelled = true;
    };
  }, [upload, setName, appending]);

  const items = upload?.items ?? [];
  const unanswered = items.filter((i) => i.draft.correctIndex === null).length;

  const updateItems = (fn: (items: UploadResult['items']) => UploadResult['items']) =>
    setUpload((u) => (u ? { ...u, items: fn(u.items) } : u));

  const addMoreFiles = async (files: FileList | null) => {
    if (!files?.length || !upload) return;
    setAdding(true);
    setError(null);
    try {
      setUpload(await addFilesToUpload(upload, [...files]));
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
    if (!normalizeSetName(setName)) {
      setError('יש לתת שם לשאלון.');
      return;
    }
    const broken = items.findIndex((i) => !i.draft.text.trim() || i.draft.options.filter((o) => o.trim()).length < 2);
    if (broken >= 0) {
      setError(`בשאלה ${broken + 1} חסר נוסח או שיש פחות משתי תשובות.`);
      return;
    }
    setBusy(true);
    try {
      await saveUpload(upload, setName, user.id);
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
      title={fixedSetName ? `הוספה לשאלון — ${fixedSetName}` : 'שאלון חדש — בדיקת קבצים ושאלות'}
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
          {/* Questionnaire name */}
          <label className="mb-4 block space-y-1.5" htmlFor="upload-set-name">
            <span className="font-semibold">שם השאלון</span>
            <input
              id="upload-set-name"
              list="question-set-names"
              className={inputClass}
              placeholder="לדוגמה: מבוא לרשתות — פרק 2"
              value={setName}
              disabled={!!fixedSetName}
              onChange={(e) => setSetName(e.target.value)}
              required
            />
            <datalist id="question-set-names">
              {existingNames.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
            <span className="block text-xs text-slate-500 dark:text-slate-400">
              {appending
                ? `קיים שאלון בשם הזה — השאלות, התמונות ומפתח התשובות יתווספו אליו.${
                    crossLinkCount ? ` ${crossLinkCount} תמונות ישויכו לשאלות שכבר שמורות בשאלון.` : ''
                  }`
                : 'כל שאלון (שאלות + תשובות + איורים) הוא נושא נפרד שאפשר לשלב במבחנים ובתרגולים.'}
            </span>
          </label>

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
                  {role === 'answers' ? <FileKey className="h-4 w-4" /> : role === 'figures' ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
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
            onClick={() => updateItems((is) => [...is, { number: null, draft: emptyDraft() }])}
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
