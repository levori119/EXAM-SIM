import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../../../auth/AuthContext';
import { Modal } from '../../../components/Modal';
import { Button, ErrorText, inputClass } from '../../../components/fields';
import { emptyDraft, saveDocumentWithQuestions, type QuestionDraft } from '../../../services/questionBank';
import { QuestionEditor, TOPICS_DATALIST_ID } from './QuestionEditor';

export interface UploadResult {
  file: File;
  drafts: QuestionDraft[];
  /** Why automatic detection produced nothing, if it didn't. */
  notice: string | null;
}

/** Human-in-the-loop check of auto-detected questions before they enter the bank. */
export function UploadReviewDialog({ result, onClose }: { result: UploadResult | null; onClose: () => void }) {
  const { user } = useAuth();
  const [drafts, setDrafts] = useState<QuestionDraft[]>([]);
  const [bulkTopic, setBulkTopic] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!result) return;
    setDrafts(result.drafts);
    setBulkTopic('');
    setError(null);
  }, [result]);

  const unanswered = drafts.filter((d) => d.correctIndex === null).length;

  const applyTopic = (topic: string) => {
    setBulkTopic(topic);
    setDrafts((ds) => ds.map((d) => ({ ...d, topic })));
  };

  const save = async () => {
    if (!result || !user) return;
    const broken = drafts.findIndex((d) => !d.text.trim() || d.options.filter((o) => o.trim()).length < 2);
    if (broken >= 0) {
      setError(`בשאלה ${broken + 1} חסר נוסח או שיש פחות משתי תשובות.`);
      return;
    }
    setBusy(true);
    try {
      await saveDocumentWithQuestions(result.file, user.id, drafts);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'השמירה נכשלה.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={!!result}
      size="lg"
      title={`בדיקת שאלות — ${result?.file.name ?? ''}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            ביטול
          </Button>
          <Button variant="primary" loading={busy} onClick={save}>
            {drafts.length ? `שמירת ${drafts.length} שאלות` : 'שמירת הקובץ בלבד'}
          </Button>
        </>
      }
    >
      {result?.notice && (
        <p className="mb-4 flex gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          {result.notice}
        </p>
      )}

      {drafts.length > 0 && (
        <div className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/50">
          <div className="flex-1 text-sm">
            <div className="font-semibold">זוהו {drafts.length} שאלות</div>
            <div className={unanswered ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400'}>
              {unanswered ? (
                `${unanswered} ללא תשובה נכונה — סמנו אותן כדי שייכללו במבחנים`
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
      )}

      <ol className="space-y-4">
        {drafts.map((draft, i) => (
          <li
            key={i}
            className={`rounded-2xl border p-4 ${
              draft.correctIndex === null
                ? 'border-amber-300 dark:border-amber-500/40'
                : 'border-slate-200 dark:border-slate-800'
            }`}
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="font-semibold text-slate-500">שאלה {i + 1}</span>
              <button
                type="button"
                onClick={() => setDrafts((ds) => ds.filter((_, j) => j !== i))}
                className="flex h-10 items-center gap-1 rounded-lg px-2 text-sm text-slate-400 hover:text-red-600"
              >
                <Trash2 className="h-4 w-4" /> הסרה
              </button>
            </div>
            <QuestionEditor
              compact
              idPrefix={`review-${i}`}
              draft={draft}
              onChange={(d) => setDrafts((ds) => ds.map((x, j) => (j === i ? d : x)))}
            />
          </li>
        ))}
      </ol>

      <Button variant="ghost" className="mt-4" onClick={() => setDrafts((ds) => [...ds, emptyDraft(bulkTopic)])}>
        <Plus className="h-5 w-5" /> הוספת שאלה ידנית
      </Button>
      <div className="mt-4">
        <ErrorText message={error} />
      </div>
    </Modal>
  );
}
