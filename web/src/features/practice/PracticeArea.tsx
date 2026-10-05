import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { BookOpenCheck, ClipboardList, FolderOpen, Layers, Star } from 'lucide-react';
import { db, type PracticeSettings, type Question } from '../../db/db';
import { useAuth } from '../../auth/AuthContext';
import { pickQuestions, type MixValue } from '../../services/composition';
import {
  buildRound,
  DEFAULT_SETTINGS,
  loadSourceQuestions,
  savePracticeSession,
  scoreRound,
  type Answers,
  type PracticeRound,
  type PracticeSource,
} from '../../services/practice';
import { EmptyState, PageHeader } from '../../components/PageHeader';
import { useMixSets } from '../../components/QuestionMixPicker';
import { Button } from '../../components/fields';
import { PracticeSetupDialog, type SetupRequest, type SetupResult } from './PracticeSetupDialog';
import { PracticeRunner } from './PracticeRunner';
import { PracticeSummary } from './PracticeSummary';

type Phase =
  | { kind: 'home' }
  | { kind: 'running'; round: PracticeRound; questions: Map<string, Question> }
  | { kind: 'summary'; round: PracticeRound; questions: Map<string, Question>; answers: Answers };

const dateFormat = new Intl.DateTimeFormat('he-IL', { dateStyle: 'short', timeStyle: 'short' });

type FixedDefaults = Partial<PracticeSettings> & { count?: number };

/** Practice flow: pick questionnaires (or a fixed list) → choose settings → answer → summary → optional retry round. */
export function PracticeArea() {
  const { user } = useAuth();
  const [phase, setPhase] = useState<Phase>({ kind: 'home' });
  const [setup, setSetup] = useState<SetupRequest | null>(null);
  const [lastSettings, setLastSettings] = useState<PracticeSettings>(DEFAULT_SETTINGS);
  if (!user) return null;

  const requestMix = (setIds: string[], total: number) =>
    setSetup({ kind: 'mix', title: '', settings: lastSettings, mix: { setIds, distribution: 'proportional', total, custom: {} } satisfies MixValue });

  const requestFixed = async (title: string, source: PracticeSource, defaults?: FixedDefaults) => {
    const questions = await loadSourceQuestions(source, user.id);
    setSetup({
      kind: 'fixed',
      title,
      questions,
      defaultCount: Math.min(defaults?.count ?? questions.length, questions.length),
      settings: { ...lastSettings, ...defaults },
    });
  };

  const start = async (result: SetupResult) => {
    setLastSettings(result.settings);
    const round =
      result.kind === 'mix'
        ? buildRound(await pickQuestions(result.quotas), result.settings, result.title)
        : buildRound(result.questions, result.settings, result.title, result.count);
    const ids = new Set(round.items.map((i) => i.questionId));
    const all = result.kind === 'mix' ? await db.questions.bulkGet([...ids]) : result.questions;
    const questions = new Map(all.filter((q): q is Question => !!q && ids.has(q.id)).map((q) => [q.id, q]));
    setPhase({ kind: 'running', round, questions });
    setSetup(null);
  };

  const finish = async (answers: Answers) => {
    if (phase.kind !== 'running') return;
    const { correct } = scoreRound(phase.round, answers, phase.questions);
    await savePracticeSession(user.id, phase.round, answers, correct);
    setPhase({ kind: 'summary', round: phase.round, questions: phase.questions, answers });
  };

  return (
    <>
      {phase.kind === 'home' && <PracticeHome onMix={requestMix} onFixed={requestFixed} />}
      {phase.kind === 'running' && (
        <PracticeRunner round={phase.round} questions={phase.questions} onFinish={finish} onExit={() => setPhase({ kind: 'home' })} />
      )}
      {phase.kind === 'summary' && (
        <PracticeSummary
          round={phase.round}
          questions={phase.questions}
          answers={phase.answers}
          onRetry={(title, ids) => requestFixed(title, { kind: 'ids', ids }, phase.round.settings)}
          onHome={() => setPhase({ kind: 'home' })}
        />
      )}
      <PracticeSetupDialog request={setup} onStart={start} onClose={() => setSetup(null)} />
    </>
  );
}

function PracticeHome({
  onMix,
  onFixed,
}: {
  onMix: (setIds: string[], total: number) => void;
  onFixed: (title: string, source: PracticeSource, defaults?: FixedDefaults) => void;
}) {
  const { user } = useAuth();
  const sets = useMixSets();
  const favoriteCount = useLiveQuery(() => db.favorites.where('userId').equals(user?.id ?? '').count(), [user?.id]);
  const exams = useLiveQuery(() => db.exams.filter((e) => e.published && e.mode === 'practice').toArray());
  const sessions = useLiveQuery(() => db.practiceSessions.where('userId').equals(user?.id ?? '').reverse().sortBy('finishedAt'), [user?.id]);

  const total = (sets ?? []).reduce((s, x) => s + x.available, 0);

  if (sets && total === 0) {
    return (
      <>
        <PageHeader title="תרגול" />
        <EmptyState icon={<BookOpenCheck className="h-10 w-10" />} title="אין עדיין שאלות לתרגול">
          מנהל המערכת צריך לטעון שאלונים עם תשובות נכונות.
        </EmptyState>
      </>
    );
  }

  return (
    <>
      <PageHeader title="תרגול" subtitle={sets ? `${total} שאלות ב-${sets.length} שאלונים` : undefined} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Questionnaires */}
        <section className="rounded-3xl border border-slate-200 bg-white p-5 lg:col-span-2 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <Layers className="h-5 w-5 text-indigo-500" /> תרגול משאלונים
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">שאלון אחד, או שילוב של כמה שאלונים ביחס שתבחרו.</p>
            </div>
            <Button variant="primary" onClick={() => onMix((sets ?? []).map((s) => s.id), Math.min(20, total))}>
              <BookOpenCheck className="h-5 w-5" /> תרגול משולב
            </Button>
          </div>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {sets?.map((set) => (
              <li key={set.id}>
                <button
                  onClick={() => onMix([set.id], set.available)}
                  className="flex min-h-16 w-full items-center gap-3 rounded-2xl border border-slate-200 p-3 text-start transition hover:border-indigo-300 hover:bg-indigo-50/50 dark:border-slate-700 dark:hover:bg-indigo-500/5"
                >
                  <FolderOpen className="h-6 w-6 shrink-0 text-indigo-500" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold" dir="auto">{set.name}</span>
                    <span className="block text-xs text-slate-500">{set.available} שאלות</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        {/* Favorites */}
        <section className="flex flex-col rounded-3xl bg-gradient-to-br from-amber-400 to-orange-500 p-5 text-white shadow-lg shadow-orange-500/20">
          <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold">
            <Star className="h-5 w-5 fill-current" /> השאלות המסומנות שלי
          </h2>
          <p className="mb-4 flex-1 text-sm text-white/85">שאלות שסימנתם בכוכב במהלך תרגול, כדי לחזור אליהן.</p>
          <div className="mb-3 text-4xl font-bold tabular-nums">{favoriteCount ?? '–'}</div>
          <button
            disabled={!favoriteCount}
            onClick={() => onFixed('השאלות המסומנות', { kind: 'favorites' })}
            className="min-h-12 rounded-xl bg-white/95 px-4 font-semibold text-orange-600 transition hover:bg-white disabled:opacity-50"
          >
            תרגול על המסומנות
          </button>
        </section>
      </div>

      {!!exams?.length && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-semibold">מבחני תרגול</h2>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {exams.map((exam) => (
              <li key={exam.id}>
                <button
                  onClick={() =>
                    onFixed(exam.title, { kind: 'exam', examId: exam.id }, {
                      shuffleQuestions: exam.shuffleQuestions,
                      shuffleOptions: exam.shuffleOptions,
                    })
                  }
                  className="flex min-h-20 w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-start transition hover:border-indigo-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
                >
                  <ClipboardList className="h-8 w-8 shrink-0 text-indigo-500" />
                  <div className="min-w-0">
                    <div className="truncate font-semibold" dir="auto">{exam.title}</div>
                    <div className="text-sm text-slate-500">{exam.questionCount} שאלות</div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!!sessions?.length && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-semibold">תרגולים אחרונים</h2>
          <ul className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
            {sessions.slice(0, 8).map((s) => {
              const pct = Math.round((s.correctCount / Math.max(1, s.questionIds.length)) * 100);
              return (
                <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium" dir="auto">{s.title}</div>
                    <div className="text-xs text-slate-500">{dateFormat.format(s.finishedAt)}</div>
                  </div>
                  <div className="text-sm tabular-nums text-slate-500">
                    {s.correctCount}/{s.questionIds.length}
                  </div>
                  <div
                    className={`w-14 rounded-full py-1 text-center text-sm font-semibold tabular-nums ${
                      pct >= 80
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                        : pct >= 55
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
                          : 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300'
                    }`}
                  >
                    {pct}%
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}
