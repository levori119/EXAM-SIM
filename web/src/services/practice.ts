import { db, type PracticeSettings, type Question, type SetQuota } from '../db/db';
import { pickQuestions } from './composition';
import { commonMistakeIds, courseQuestionIds } from './stats';

export type PracticeSource =
  | { kind: 'mix'; quotas: SetQuota[] }
  | { kind: 'favorites' }
  | { kind: 'mistakes' }
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
export async function loadSourceQuestions(source: PracticeSource, userId: string, courseId: string): Promise<Question[]> {
  switch (source.kind) {
    case 'mix':
      return pickQuestions(source.quotas);
    case 'favorites': {
      const favs = await db.favorites.where('userId').equals(userId).sortBy('createdAt');
      const inCourse = await courseQuestionIds(courseId);
      return (await db.questions.bulkGet(favs.map((f) => f.questionId).filter((id) => inCourse.has(id)))).filter(answerable);
    }
    case 'mistakes':
      return (await db.questions.bulkGet(await commonMistakeIds(userId, courseId))).filter(answerable);
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

export async function savePracticeSession(userId: string, courseId: string, round: PracticeRound, answers: Answers, correctCount: number) {
  await db.practiceSessions.add({
    id: crypto.randomUUID(),
    userId,
    courseId,
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

const savedNameFormat = new Intl.DateTimeFormat('he-IL', { dateStyle: 'short', timeStyle: 'short' });

/** Default name for a saved practice: the questionnaire name plus date and time. */
export const defaultSavedName = (round: PracticeRound) => `${round.title} ${savedNameFormat.format(Date.now())}`;

/** Saves (or overwrites) an in-progress round so it can be resumed later. Returns its id. */
export async function savePracticeProgress(
  id: string | null,
  userId: string,
  courseId: string,
  name: string,
  round: PracticeRound,
  answers: Answers,
  index: number,
): Promise<string> {
  const savedId = id ?? crypto.randomUUID();
  await db.savedPractices.put({
    id: savedId,
    userId,
    courseId,
    name: name.trim() || defaultSavedName(round),
    round: { title: round.title, settings: round.settings, items: round.items, startedAt: round.startedAt },
    answers,
    index,
    savedAt: Date.now(),
  });
  return savedId;
}

export async function deleteSavedPractice(id: string): Promise<void> {
  await db.savedPractices.delete(id);
}

/** Loads a saved round; questions deleted since are dropped. */
export async function loadSavedPractice(id: string) {
  const saved = await db.savedPractices.get(id);
  if (!saved) return null;
  const qs = (await db.questions.bulkGet(saved.round.items.map((i) => i.questionId))).filter(answerable);
  const questions = new Map(qs.map((q) => [q.id, q]));
  const items = saved.round.items.filter((i) => questions.has(i.questionId));
  if (!items.length) return null;
  return {
    saved,
    round: { ...saved.round, items } as PracticeRound,
    questions,
    answers: Object.fromEntries(Object.entries(saved.answers).filter(([qid]) => questions.has(qid))) as Answers,
    index: Math.min(saved.index, items.length - 1),
  };
}
