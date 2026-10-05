import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { BarChart3, BookOpenCheck, ClipboardList, FolderOpen, Layers, Play, RotateCcw, Star, Trash2 } from 'lucide-react';
import { db, type PracticeSettings, type Question } from '../../db/db';
import { useAuth } from '../../auth/AuthContext';
import { pickQuestions, type MixValue } from '../../services/composition';
import {
  buildRound,
  DEFAULT_SETTINGS,
  deleteSavedPractice,
  loadSavedPractice,
  loadSourceQuestions,
  savePracticeProgress,
  savePracticeSession,
  scoreRound,
  type Answers,
  type PracticeRound,
  type PracticeSource,
} from '../../services/practice';
import { commonMistakeIds } from '../../services/stats';
import { EmptyState, PageHeader } from '../../components/PageHeader';
import { useMixSets } from '../../components/QuestionMixPicker';
import { IconButton } from '../../components/IconButton';
import { ConfirmDialog } from '../../components/Modal';
import { Button } from '../../components/fields';
import { PracticeSetupDialog, type SetupRequest, type SetupResult } from './PracticeSetupDialog';
import { PracticeRunner } from './PracticeRunner';
import { PracticeSummary } from './PracticeSummary';
import { StatsView } from './StatsView';

type Running = {
  kind: 'running';
  round: PracticeRound;
  questions: Map<string, Question>;
  /** Set when the round was saved / resumed, so saving again overwrites it. */
  savedId?: string;
  savedName?: string;
  initialAnswers?: Answers;
  initialIndex?: number;
};

type Phase =
  | { kind: 'home' }
  | Running
  | { kind: 'summary'; round: PracticeRound; questions: Map<string, Question>; answers: Answers };

type Tab = 'practice' | 'stats';

const dateFormat = new Intl.DateTimeFormat('he-IL', { dateStyle: 'short', timeStyle: 'short' });

type FixedDefaults = Partial<PracticeSettings> & { count?: number };

/** Practice flow: pick questionnaires (or a fixed list) → choose settings → answer → summary → optional retry round. */
export function PracticeArea() {
  const { user } = useAuth();
  const [phase, setPhase] = useState<Phase>({ kind: 'home' });
  const [tab, setTab] = useState<Tab>('practice');
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

  const resume = async (id: string) => {
    const loaded = await loadSavedPractice(id);
    if (!loaded) return;
    setPhase({
      kind: 'running',
      round: loaded.round,
      questions: loaded.questions,
      savedId: id,
      savedName: loaded.saved.name,
      initialAnswers: loaded.answers,
      initialIndex: loaded.index,
    });
  };

  const save = async (name: string, answers: Answers, index: number) => {
    if (phase.kind !== 'running') return;
    const savedId = await savePracticeProgress(phase.savedId ?? null, user.id, name, phase.round, answers, index);
    setPhase({ ...phase, savedId, savedName: name.trim() || phase.savedName, initialAnswers: answers, initialIndex: index });
  };

  const finish = async (answers: Answers) => {
    if (phase.kind !== 'running') return;
    const { correct } = scoreRound(phase.round, answers, phase.questions);
    await savePracticeSession(user.id, phase.round, answers, correct);
    // A finished round no longer needs its saved progress.
    if (phase.savedId) await deleteSavedPractice(phase.savedId);
    setPhase({ kind: 'summary', round: phase.round, questions: phase.questions, answers });
  };

  return (
    <>
      {phase.kind === 'home' && (
        <>
          <div className="mb-6 inline-flex rounded-2xl bg-slate-100 p-1 dark:bg-slate-800" role="tablist">
            {(
              [
                ['practice', 'תרגול', BookOpenCheck],
                ['stats', 'סטטיסטיקה', BarChart3],
              ] as const
            ).map(([value, label, Icon]) => (
              <button
                key={value}
                role="tab"
                aria-selected={tab === value}
                onClick={() => setTab(value)}
                className={`inline-flex min-h-12 items-center gap-2 rounded-xl px-5 font-semibold transition ${
                  tab === value ? 'bg-white shadow dark:bg-slate-900' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <Icon className="h-5 w-5" />
                {label}
              </button>
            ))}
          </div>
          {tab === 'practice' ? (
            <PracticeHome onMix={requestMix} onFixed={requestFixed} onResume={resume} />
          ) : (
            <StatsView onPractice={(title, ids) => requestFixed(title, { kind: 'ids', ids })} />
          )}
        </>
      )}
      {phase.kind === 'running' && (
        <PracticeRunner
          key={phase.round.startedAt}
          round={phase.round}
          questions={phase.questions}
          initialAnswers={phase.initialAnswers}
          initialIndex={phase.initialIndex}
          savedName={phase.savedName}
          onFinish={finish}
          onSave={save}
          onExit={() => setPhase({ kind: 'home' })}
        />
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
  onResume,
}: {
  onMix: (setIds: string[], total: number) => void;
  onFixed: (title: string, source: PracticeSource, defaults?: FixedDefaults) => void;
  onResume: (id: string) => void;
}) {
  const { user } = useAuth();
  const userId = user?.id ?? '';
  const sets = useMixSets();
  const favoriteCount = useLiveQuery(() => db.favorites.where('userId').equals(userId).count(), [userId]);
  const mistakeCount = useLiveQuery(async () => (await commonMistakeIds(userId)).length, [userId]);
  const exams = useLiveQuery(() => db.exams.filter((e) => e.published && e.mode === 'practice').toArray());
  const sessions = useLiveQuery(() => db.practiceSessions.where('userId').equals(userId).reverse().sortBy('finishedAt'), [userId]);
  const saved = useLiveQuery(() => db.savedPractices.where('userId').equals(userId).reverse().sortBy('savedAt'), [userId]);
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null);

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

      {/* Saved practices */}
      {!!saved?.length && (
        <section className="mb-6">
          <h2 className="mb-3 text-lg font-semibold">תרגולים שמורים</h2>
          <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {saved.map((s) => {
              const answered = Object.keys(s.answers).length;
              const totalItems = s.round.items.length;
              return (
                <li key={s.id} className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                  <button onClick={() => onResume(s.id)} className="flex min-h-12 min-w-0 flex-1 items-center gap-3 text-start">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
                      <Play className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold" dir="auto">{s.name}</span>
                      <span className="block text-xs text-slate-500">
                        {answered}/{totalItems} נענו · עצרתם בשאלה {s.index + 1}
                      </span>
                      <span className="block text-xs text-slate-400">נשמר {dateFormat.format(s.savedAt)}</span>
                      <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <span className="block h-full rounded-full bg-indigo-500" style={{ width: `${(answered / totalItems) * 100}%` }} />
                      </span>
                    </span>
                  </button>
                  <IconButton label="מחיקת התרגול השמור" danger onClick={() => setDeleting({ id: s.id, name: s.name })}>
                    <Trash2 className="h-5 w-5" />
                  </IconButton>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Questionnaires */}
        <section className="rounded-3xl border border-slate-200 bg-white p-5 lg:col-span-2 lg:row-span-2 dark:border-slate-800 dark:bg-slate-900">
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
        <FocusCard
          tone="amber"
          icon={<Star className="h-5 w-5 fill-current" />}
          title="השאלות המסומנות שלי"
          text="שאלות שסימנתם בכוכב במהלך תרגול."
          count={favoriteCount}
          action="תרגול על המסומנות"
          onClick={() => onFixed('השאלות המסומנות', { kind: 'favorites' })}
        />

        {/* Common mistakes */}
        <FocusCard
          tone="rose"
          icon={<RotateCcw className="h-5 w-5" />}
          title="טעויות נפוצות"
          text="שאלות שטעיתם בהן שוב ושוב, או בפעם האחרונה. כשתענו נכון הן ירדו מהרשימה."
          count={mistakeCount}
          action="תרגול על הטעויות"
          onClick={() => onFixed('טעויות נפוצות', { kind: 'mistakes' })}
        />
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
                  <div className="w-14 text-center text-sm font-semibold tabular-nums">{pct}%</div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <ConfirmDialog
        open={!!deleting}
        title="מחיקת תרגול שמור"
        message={`למחוק את "${deleting?.name ?? ''}"? ההתקדמות בו תאבד.`}
        onConfirm={() => (deleting ? deleteSavedPractice(deleting.id) : undefined)}
        onClose={() => setDeleting(null)}
      />
    </>
  );
}

function FocusCard({
  tone,
  icon,
  title,
  text,
  count,
  action,
  onClick,
}: {
  tone: 'amber' | 'rose';
  icon: React.ReactNode;
  title: string;
  text: string;
  count: number | undefined;
  action: string;
  onClick: () => void;
}) {
  const bg = tone === 'amber' ? 'from-amber-400 to-orange-500 shadow-orange-500/20' : 'from-rose-500 to-pink-600 shadow-rose-500/20';
  const fg = tone === 'amber' ? 'text-orange-600' : 'text-rose-600';
  return (
    <section className={`flex flex-col rounded-3xl bg-gradient-to-br p-5 text-white shadow-lg ${bg}`}>
      <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold">
        {icon} {title}
      </h2>
      <p className="mb-3 flex-1 text-sm text-white/85">{text}</p>
      <div className="mb-3 text-4xl font-bold tabular-nums">{count ?? '–'}</div>
      <button
        disabled={!count}
        onClick={onClick}
        className={`min-h-12 rounded-xl bg-white/95 px-4 font-semibold transition hover:bg-white disabled:opacity-50 ${fg}`}
      >
        {action}
      </button>
    </section>
  );
}
