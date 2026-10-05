import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { BookOpenCheck, ClipboardList, Layers, Star } from 'lucide-react';
import { db, type PracticeSettings, type Question } from '../../db/db';
import { useAuth } from '../../auth/AuthContext';
import { topicCounts } from '../../services/questionBank';
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
import { Button } from '../../components/fields';
import { PracticeSetupDialog, type SetupRequest } from './PracticeSetupDialog';
import { PracticeRunner } from './PracticeRunner';
import { PracticeSummary } from './PracticeSummary';

type Phase =
  | { kind: 'home' }
  | { kind: 'running'; round: PracticeRound; questions: Map<string, Question> }
  | { kind: 'summary'; round: PracticeRound; questions: Map<string, Question>; answers: Answers };

const dateFormat = new Intl.DateTimeFormat('he-IL', { dateStyle: 'short', timeStyle: 'short' });

/** Practice flow: pick a source → choose settings → answer → summary → optional retry round. */
export function PracticeArea() {
  const { user } = useAuth();
  const [phase, setPhase] = useState<Phase>({ kind: 'home' });
  const [setup, setSetup] = useState<SetupRequest | null>(null);
  const [lastSettings, setLastSettings] = useState<PracticeSettings>(DEFAULT_SETTINGS);
  if (!user) return null;

  /** Opens the settings dialog for a source; the round starts from the dialog. */
  const requestRound = async (title: string, source: PracticeSource, defaults?: Partial<PracticeSettings> & { count?: number }) => {
    const questions = await loadSourceQuestions(source, user.id);
    setSetup({
      title,
      questions,
      defaultCount: Math.min(defaults?.count ?? questions.length, questions.length),
      settings: { ...lastSettings, ...defaults },
    });
  };

  const start = (settings: PracticeSettings, count: number) => {
    if (!setup) return;
    setLastSettings(settings);
    const round = buildRound(setup.questions, settings, setup.title, count);
    setPhase({ kind: 'running', round, questions: new Map(setup.questions.map((q) => [q.id, q])) });
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
      {phase.kind === 'home' && <PracticeHome onRequest={requestRound} />}
      {phase.kind === 'running' && (
        <PracticeRunner
          round={phase.round}
          questions={phase.questions}
          onFinish={finish}
          onExit={() => setPhase({ kind: 'home' })}
        />
      )}
      {phase.kind === 'summary' && (
        <PracticeSummary
          round={phase.round}
          questions={phase.questions}
          answers={phase.answers}
          onRetry={(title, ids) => requestRound(title, { kind: 'ids', ids }, phase.round.settings)}
          onHome={() => setPhase({ kind: 'home' })}
        />
      )}
      <PracticeSetupDialog request={setup} onStart={start} onClose={() => setSetup(null)} />
    </>
  );
}

function PracticeHome({
  onRequest,
}: {
  onRequest: (title: string, source: PracticeSource, defaults?: Partial<PracticeSettings> & { count?: number }) => void;
}) {
  const { user } = useAuth();
  const counts = useLiveQuery(topicCounts);
  const favoriteCount = useLiveQuery(() => db.favorites.where('userId').equals(user?.id ?? '').count(), [user?.id]);
  const exams = useLiveQuery(() => db.exams.filter((e) => e.published && e.mode === 'practice').toArray());
  const sessions = useLiveQuery(
    () => db.practiceSessions.where('userId').equals(user?.id ?? '').reverse().sortBy('finishedAt'),
    [user?.id],
  );
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);

  const topics = [...(counts?.keys() ?? [])].sort((a, b) => a.localeCompare(b, 'he'));
  const total = [...(counts?.values() ?? [])].reduce((a, b) => a + b, 0);
  const selectedTotal = selectedTopics.length ? selectedTopics.reduce((s, t) => s + (counts?.get(t) ?? 0), 0) : total;

  if (counts && total === 0) {
    return (
      <>
        <PageHeader title="תרגול" />
        <EmptyState icon={<BookOpenCheck className="h-10 w-10" />} title="אין עדיין שאלות לתרגול">
          מנהל המערכת צריך לטעון שאלות עם תשובות נכונות לבנק השאלות.
        </EmptyState>
      </>
    );
  }

  return (
    <>
      <PageHeader title="תרגול" subtitle={`${total} שאלות זמינות לתרגול`} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Free practice by topic */}
        <section className="rounded-3xl border border-slate-200 bg-white p-5 lg:col-span-2 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold">
            <Layers className="h-5 w-5 text-indigo-500" /> תרגול לפי נושאים
          </h2>
          <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">בחרו נושאים, או השאירו ריק לתרגול על כל הבנק.</p>
          <div className="mb-4 flex flex-wrap gap-2">
            {topics.map((topic) => {
              const on = selectedTopics.includes(topic);
              return (
                <button
                  key={topic}
                  aria-pressed={on}
                  onClick={() => setSelectedTopics((ts) => (on ? ts.filter((t) => t !== topic) : [...ts, topic]))}
                  className={`min-h-12 rounded-xl border px-4 text-sm font-medium transition ${
                    on
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300'
                      : 'border-slate-300 hover:border-indigo-300 dark:border-slate-700'
                  }`}
                >
                  {topic} <span className="text-slate-400">({counts?.get(topic)})</span>
                </button>
              );
            })}
          </div>
          <Button
            variant="primary"
            onClick={() =>
              onRequest(selectedTopics.length ? selectedTopics.join(', ') : 'תרגול כללי', { kind: 'topics', topics: selectedTopics })
            }
          >
            <BookOpenCheck className="h-5 w-5" />
            התחלת תרגול ({selectedTotal} שאלות)
          </Button>
        </section>

        {/* Favorites */}
        <section className="flex flex-col rounded-3xl bg-gradient-to-br from-amber-400 to-orange-500 p-5 text-white shadow-lg shadow-orange-500/20">
          <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold">
            <Star className="h-5 w-5 fill-current" /> השאלות המסומנות שלי
          </h2>
          <p className="mb-4 flex-1 text-sm text-white/85">
            שאלות שסימנתם בכוכב במהלך תרגול, כדי לחזור אליהן.
          </p>
          <div className="mb-3 text-4xl font-bold tabular-nums">{favoriteCount ?? '–'}</div>
          <button
            disabled={!favoriteCount}
            onClick={() => onRequest('השאלות המסומנות', { kind: 'favorites' })}
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
                    onRequest(exam.title, { kind: 'exam', examId: exam.id }, {
                      count: exam.questionCount,
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
