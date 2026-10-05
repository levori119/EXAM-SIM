import { useEffect, useState } from 'react';
import { Eye, Flag } from 'lucide-react';
import type { PracticeSettings, Question, RevealMode, SetQuota } from '../../db/db';
import { computeQuotas, quotaTotal, type MixValue } from '../../services/composition';
import { Modal } from '../../components/Modal';
import { QuestionMixPicker, useMixSets } from '../../components/QuestionMixPicker';
import { Button, inputClass, Toggle } from '../../components/fields';

/** A practice round either mixes questionnaires, or works on a fixed list (favorites, retry, practice exam). */
export type SetupRequest =
  | { kind: 'mix'; title: string; mix: MixValue; settings: PracticeSettings }
  | { kind: 'fixed'; title: string; questions: Question[]; defaultCount: number; settings: PracticeSettings };

export type SetupResult =
  | { kind: 'mix'; title: string; quotas: SetQuota[]; settings: PracticeSettings }
  | { kind: 'fixed'; title: string; questions: Question[]; count: number; settings: PracticeSettings };

const REVEAL_OPTIONS: { value: RevealMode; label: string; hint: string; icon: typeof Eye }[] = [
  { value: 'immediate', label: 'מיד אחרי כל תשובה', hint: 'רואים מיד אם צדקתם + הסבר', icon: Eye },
  { value: 'end', label: 'בסיום התרגול', hint: 'כמו מבחן — אפשר לשנות תשובות עד ההגשה', icon: Flag },
];

/** Asks the practice options before every round. */
export function PracticeSetupDialog({
  request,
  onStart,
  onClose,
}: {
  request: SetupRequest | null;
  onStart: (result: SetupResult) => void;
  onClose: () => void;
}) {
  const sets = useMixSets() ?? [];
  const [settings, setSettings] = useState<PracticeSettings>({ shuffleQuestions: true, shuffleOptions: false, reveal: 'immediate' });
  const [count, setCount] = useState(0);
  const [mix, setMix] = useState<MixValue>({ setIds: [], distribution: 'proportional', total: 20, custom: {} });

  useEffect(() => {
    if (!request) return;
    setSettings(request.settings);
    if (request.kind === 'mix') setMix(request.mix);
    else setCount(request.defaultCount);
  }, [request]);

  const set = <K extends keyof PracticeSettings>(key: K, value: PracticeSettings[K]) => setSettings((s) => ({ ...s, [key]: value }));

  const available = new Map(sets.map((s) => [s.id, s.available]));
  const quotas = computeQuotas(mix, available);
  const mixTotal = quotaTotal(quotas);
  const fixedAvailable = request?.kind === 'fixed' ? request.questions.length : 0;
  const valid = request?.kind === 'mix' ? mixTotal >= 1 : count >= 1 && count <= fixedAvailable;

  const title =
    request?.kind === 'mix'
      ? mix.setIds.map((id) => sets.find((s) => s.id === id)?.name).filter(Boolean).join(' + ') || 'תרגול'
      : (request?.title ?? '');

  const start = () => {
    if (!request) return;
    if (request.kind === 'mix') onStart({ kind: 'mix', title, quotas: quotas.filter((q) => q.count > 0), settings });
    else onStart({ kind: 'fixed', title: request.title, questions: request.questions, count, settings });
  };

  return (
    <Modal
      open={!!request}
      size={request?.kind === 'mix' ? 'lg' : 'md'}
      title={request?.kind === 'mix' ? 'תרגול חדש' : `הגדרות תרגול — ${request?.title ?? ''}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            ביטול
          </Button>
          <Button variant="primary" disabled={!valid} onClick={start}>
            התחלה ({request?.kind === 'mix' ? mixTotal : count} שאלות)
          </Button>
        </>
      }
    >
      {request?.kind === 'fixed' && fixedAvailable === 0 ? (
        <p className="text-slate-500">אין שאלות זמינות לתרגול הזה.</p>
      ) : (
        <div className="space-y-5">
          {request?.kind === 'mix' ? (
            <section className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
              <h3 className="mb-3 font-semibold">על אילו שאלונים לתרגל?</h3>
              <QuestionMixPicker sets={sets} value={mix} onChange={setMix} />
            </section>
          ) : (
            <label className="block space-y-1.5" htmlFor="practice-count">
              <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
                מספר שאלות <span className="font-normal text-slate-400">(מתוך {fixedAvailable})</span>
              </span>
              <div className="flex items-center gap-2">
                <input
                  id="practice-count"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={fixedAvailable}
                  className={inputClass}
                  value={count || ''}
                  onChange={(e) => setCount(Number(e.target.value))}
                />
                {count !== fixedAvailable && (
                  <Button variant="ghost" onClick={() => setCount(fixedAvailable)}>
                    הכול
                  </Button>
                )}
              </div>
            </label>
          )}

          <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 px-4 dark:divide-slate-800 dark:border-slate-800">
            <Toggle
              label="לערבב את סדר השאלות?"
              hint={request?.kind === 'mix' ? 'כבוי = לפי השאלונים, לפי הסדר בקובץ' : undefined}
              checked={settings.shuffleQuestions}
              onChange={(v) => set('shuffleQuestions', v)}
            />
            <Toggle
              label="לערבב את סדר התשובות?"
              hint="סדר האפשרויות בכל שאלה ישתנה"
              checked={settings.shuffleOptions}
              onChange={(v) => set('shuffleOptions', v)}
            />
          </div>

          <fieldset>
            <legend className="mb-2 text-sm font-medium text-slate-600 dark:text-slate-300">מתי להציג את התשובה הנכונה?</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {REVEAL_OPTIONS.map(({ value, label, hint, icon: Icon }) => {
                const on = settings.reveal === value;
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set('reveal', value)}
                    className={`flex min-h-16 items-start gap-3 rounded-2xl border-2 p-3 text-start transition ${
                      on ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10' : 'border-slate-200 hover:border-indigo-300 dark:border-slate-700'
                    }`}
                  >
                    <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${on ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'}`} />
                    <span>
                      <span className="block font-semibold">{label}</span>
                      <span className="block text-xs text-slate-500 dark:text-slate-400">{hint}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>
        </div>
      )}
    </Modal>
  );
}
