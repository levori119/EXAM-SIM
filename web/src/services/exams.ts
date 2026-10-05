import { db, type Exam, type ExamMode } from '../db/db';

export type ExamDraft = Pick<
  Exam,
  'title' | 'description' | 'mode' | 'durationMinutes' | 'questionCount' | 'topics' | 'shuffleQuestions' | 'shuffleOptions' | 'published'
>;

export const MODE_LABELS: Record<ExamMode, string> = {
  practice: 'תרגול',
  final: 'מבחן מסכם',
};

export function emptyExamDraft(): ExamDraft {
  return {
    title: '',
    description: '',
    mode: 'practice',
    durationMinutes: null,
    questionCount: 10,
    topics: [],
    shuffleQuestions: true,
    shuffleOptions: true,
    published: false,
  };
}

/** Returns an error message, or null if the draft can be saved. */
export function validateExam(draft: ExamDraft, available: number): string | null {
  if (!draft.title.trim()) return 'יש להזין שם למבחן.';
  if (draft.questionCount < 1) return 'יש לבחור לפחות שאלה אחת.';
  if (draft.questionCount > available) return `יש רק ${available} שאלות זמינות בנושאים שנבחרו.`;
  if (draft.mode === 'final' && !draft.durationMinutes) return 'מבחן מסכם חייב מגבלת זמן.';
  return null;
}

export async function saveExam(id: string | null, draft: ExamDraft, userId: string): Promise<void> {
  const now = Date.now();
  const data = { ...draft, title: draft.title.trim(), description: draft.description.trim() };
  if (id) {
    await db.exams.update(id, { ...data, updatedAt: now, pendingSync: 1 });
  } else {
    await db.exams.add({ id: crypto.randomUUID(), ...data, createdBy: userId, createdAt: now, updatedAt: now, pendingSync: 1 });
  }
}

export async function setExamPublished(id: string, published: boolean): Promise<void> {
  await db.exams.update(id, { published, updatedAt: Date.now(), pendingSync: 1 });
}

export async function deleteExam(id: string): Promise<void> {
  await db.exams.delete(id);
}
