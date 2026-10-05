import { db, type Exam, type ExamMode } from '../db/db';
import { quotaTotal } from './composition';

export type ExamDraft = Pick<
  Exam,
  | 'title'
  | 'description'
  | 'mode'
  | 'durationMinutes'
  | 'questionCount'
  | 'composition'
  | 'distribution'
  | 'shuffleQuestions'
  | 'shuffleOptions'
  | 'published'
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
    questionCount: 0,
    composition: [],
    distribution: 'proportional',
    shuffleQuestions: true,
    shuffleOptions: true,
    published: false,
  };
}

/** Returns an error message, or null if the draft can be saved. */
export function validateExam(draft: ExamDraft, available: Map<string, number>, setNames: Map<string, string>): string | null {
  if (!draft.title.trim()) return 'יש להזין שם למבחן.';
  if (!draft.composition.length) return 'יש לבחור לפחות שאלון אחד.';
  if (quotaTotal(draft.composition) < 1) return 'יש לבחור לפחות שאלה אחת.';
  const over = draft.composition.find((c) => c.count > (available.get(c.setId) ?? 0));
  if (over) return `בשאלון "${setNames.get(over.setId) ?? ''}" יש רק ${available.get(over.setId) ?? 0} שאלות זמינות.`;
  if (draft.mode === 'final' && !draft.durationMinutes) return 'מבחן מסכם חייב מגבלת זמן.';
  return null;
}

export async function saveExam(id: string | null, draft: ExamDraft, userId: string): Promise<void> {
  const now = Date.now();
  const composition = draft.composition.filter((c) => c.count > 0);
  const data = {
    ...draft,
    composition,
    questionCount: quotaTotal(composition),
    title: draft.title.trim(),
    description: draft.description.trim(),
  };
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
