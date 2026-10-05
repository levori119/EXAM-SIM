import { db, type PracticeSettings, type Question, type SetQuota } from '../db/db';
import { pickQuestions } from './composition';

export type PracticeSource =
  | { kind: 'mix'; quotas: SetQuota[] }
  | { kind: 'favorites' }
  | { kind: 'exam'; examId: string }
  | { kind: 'ids'; ids: string[] };

export interface PracticeItem {
  questionId: string;
  /** Display position → original option index. */
  optionOrder: number[];
}

export interface PracticeRound {
  title: string;
  settings: PracticeSettings;
  items: PracticeItem[];
  startedAt: number;
}

/** questionId → chosen original option index. */
export type Answers = Record<string, number>;

export const DEFAULT_SETTINGS: PracticeSettings = { shuffleQuestions: true, shuffleOptions: false, reveal: 'immediate' };

export function shuffle<T>(items: readonly T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const answerable = (q: Question | undefined): q is Question => !!q && q.correctIndex !== null && q.options.length >= 2;

/** All answerable questions for a source (before count limits and shuffling). */
export async function loadSourceQuestions(source: PracticeSource, userId: string): Promise<Question[]> {
  switch (source.kind) {
    case 'mix':
      return pickQuestions(source.quotas);
    case 'favorites': {
      const favs = await db.favorites.where('userId').equals(userId).sortBy('createdAt');
      return (await db.questions.bulkGet(favs.map((f) => f.questionId))).filter(answerable);
    }
    case 'exam': {
      const exam = await db.exams.get(source.examId);
      return exam ? pickQuestions(exam.composition) : [];
    }
    case 'ids':
      return (await db.questions.bulkGet(source.ids)).filter(answerable);
  }
}

export function buildRound(questions: Question[], settings: PracticeSettings, title: string, count?: number): PracticeRound {
  let pool = settings.shuffleQuestions ? shuffle(questions) : questions;
  if (count && count < pool.length) {
    // A random subset even when the order is kept, so repeated rounds vary.
    const picked = new Set(shuffle(pool.map((q) => q.id)).slice(0, count));
    pool = pool.filter((q) => picked.has(q.id));
  }
  return {
    title,
    settings,
    startedAt: Date.now(),
    items: pool.map((q) => {
      const order = q.options.map((_, i) => i);
      return { questionId: q.id, optionOrder: settings.shuffleOptions ? shuffle(order) : order };
    }),
  };
}

export async function toggleFavorite(userId: string, questionId: string): Promise<void> {
  const key: [string, string] = [userId, questionId];
  if (await db.favorites.get(key)) await db.favorites.delete(key);
  else await db.favorites.put({ userId, questionId, createdAt: Date.now() });
}

export function scoreRound(round: PracticeRound, answers: Answers, questions: Map<string, Question>) {
  let correct = 0;
  const wrongIds: string[] = [];
  for (const { questionId } of round.items) {
    if (answers[questionId] === questions.get(questionId)?.correctIndex) correct++;
    else wrongIds.push(questionId); // unanswered counts as wrong
  }
  return { correct, total: round.items.length, wrongIds };
}

export async function savePracticeSession(userId: string, round: PracticeRound, answers: Answers, correctCount: number) {
  await db.practiceSessions.add({
    id: crypto.randomUUID(),
    userId,
    title: round.title,
    settings: round.settings,
    questionIds: round.items.map((i) => i.questionId),
    answers: Object.fromEntries(round.items.map(({ questionId }) => [questionId, answers[questionId] ?? null])),
    correctCount,
    startedAt: round.startedAt,
    finishedAt: Date.now(),
    pendingSync: 1,
  });
}
