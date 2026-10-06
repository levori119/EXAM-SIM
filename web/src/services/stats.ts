import { db, type Question } from '../db/db';

export interface QuestionStat {
  questionId: string;
  attempts: number;
  correct: number;
  wrong: number;
  /** Result of the most recent attempt. */
  lastCorrect: boolean;
  lastAt: number;
}

export interface SetStat {
  setId: string;
  name: string;
  /** Answerable questions in the questionnaire. */
  questions: number;
  /** Distinct questions answered at least once. */
  covered: number;
  attempts: number;
  correct: number;
  mistakes: number;
}

/**
 * A question counts as a "common mistake" when it was answered wrong and either the latest
 * attempt was wrong too, or it's wrong at least half the time — once learned, it drops off.
 */
export const isCommonMistake = (s: QuestionStat) => s.wrong > 0 && (!s.lastCorrect || s.wrong / s.attempts >= 0.5);

/**
 * Per-question results from finished practice rounds. `userId` null = everyone (admin view).
 * Skipped questions are not attempts. Scored against the question's current correct answer.
 */
export async function questionStats(userId: string | null): Promise<Map<string, QuestionStat>> {
  const sessions = userId
    ? await db.practiceSessions.where('userId').equals(userId).sortBy('finishedAt')
    : await db.practiceSessions.orderBy('finishedAt').toArray();
  const questions = new Map((await db.questions.toArray()).map((q) => [q.id, q]));
  const stats = new Map<string, QuestionStat>();
  for (const session of sessions) {
    for (const [questionId, answer] of Object.entries(session.answers)) {
      const q = questions.get(questionId);
      if (answer === null || !q || q.correctIndex === null) continue;
      const ok = answer === q.correctIndex;
      const s = stats.get(questionId) ?? { questionId, attempts: 0, correct: 0, wrong: 0, lastCorrect: ok, lastAt: 0 };
      s.attempts++;
      if (ok) s.correct++;
      else s.wrong++;
      s.lastCorrect = ok;
      s.lastAt = session.finishedAt;
      stats.set(questionId, s);
    }
  }
  return stats;
}

export async function setStats(
  userId: string | null,
  courseId: string,
): Promise<{ sets: SetStat[]; byQuestion: Map<string, QuestionStat>; questions: Question[] }> {
  const [allStats, sets, allQuestions] = await Promise.all([
    questionStats(userId),
    db.questionSets.where('courseId').equals(courseId).toArray(),
    db.questions.toArray(),
  ]);
  // Only this course's questions count.
  const setIds = new Set(sets.map((s) => s.id));
  const questions = allQuestions.filter((q) => setIds.has(q.setId));
  const byQuestion = new Map([...allStats].filter(([qid]) => questions.some((q) => q.id === qid)));
  const result = sets
    .map((set) => {
      const qs = questions.filter((q) => q.setId === set.id && q.correctIndex !== null);
      const st = qs.map((q) => byQuestion.get(q.id)).filter((s): s is QuestionStat => !!s);
      return {
        setId: set.id,
        name: set.name,
        questions: qs.length,
        covered: st.length,
        attempts: st.reduce((a, s) => a + s.attempts, 0),
        correct: st.reduce((a, s) => a + s.correct, 0),
        mistakes: st.filter(isCommonMistake).length,
      };
    })
    .filter((s) => s.questions > 0)
    .sort((a, b) => a.name.localeCompare(b.name, 'he'));
  return { sets: result, byQuestion, questions };
}

/** Ids of the questions belonging to a course. */
export async function courseQuestionIds(courseId: string): Promise<Set<string>> {
  const setIds = await db.questionSets.where('courseId').equals(courseId).primaryKeys();
  return new Set(await db.questions.where('setId').anyOf(setIds).primaryKeys());
}

/** The user's common mistakes in a course, most-missed first. */
export async function commonMistakeIds(userId: string, courseId: string): Promise<string[]> {
  const inCourse = await courseQuestionIds(courseId);
  return [...(await questionStats(userId)).values()]
    .filter((s) => inCourse.has(s.questionId))
    .filter(isCommonMistake)
    .sort((a, b) => b.wrong - a.wrong || b.wrong / b.attempts - a.wrong / a.attempts)
    .map((s) => s.questionId);
}
