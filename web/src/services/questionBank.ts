import { db, type Difficulty, type Question } from '../db/db';

export interface QuestionDraft {
  text: string;
  options: string[];
  correctIndex: number | null;
  topic: string;
  difficulty: Difficulty;
  explanation: string;
}

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: 'קל',
  medium: 'בינוני',
  hard: 'קשה',
};

export const UNCATEGORIZED = 'כללי';

export function emptyDraft(topic = ''): QuestionDraft {
  return { text: '', options: ['', '', '', ''], correctIndex: null, topic, difficulty: 'medium', explanation: '' };
}

/** Returns an error message, or null if the draft can be saved. */
export function validateDraft(draft: QuestionDraft): string | null {
  if (!draft.text.trim()) return 'חסר נוסח שאלה.';
  const filled = draft.options.filter((o) => o.trim());
  if (filled.length < 2) return 'נדרשות לפחות שתי תשובות.';
  if (draft.correctIndex === null || !draft.options[draft.correctIndex]?.trim()) return 'יש לסמן תשובה נכונה.';
  return null;
}

function normalize(draft: QuestionDraft) {
  // Remove empty options while keeping the correct answer pointing at the same option.
  const correctText = draft.correctIndex !== null ? draft.options[draft.correctIndex]?.trim() : '';
  const options = draft.options.map((o) => o.trim()).filter(Boolean);
  return {
    text: draft.text.trim(),
    options,
    correctIndex: correctText ? options.indexOf(correctText) : null,
    topic: draft.topic.trim() || UNCATEGORIZED,
    difficulty: draft.difficulty,
    explanation: draft.explanation.trim(),
  };
}

export async function saveDocumentWithQuestions(
  file: File,
  uploadedBy: string,
  drafts: QuestionDraft[],
): Promise<void> {
  const now = Date.now();
  const documentId = crypto.randomUUID();
  await db.transaction('rw', db.documents, db.questions, async () => {
    await db.documents.add({
      id: documentId,
      name: file.name,
      mimeType: file.type,
      size: file.size,
      blob: file,
      uploadedBy,
      createdAt: now,
      questionCount: drafts.length,
    });
    await db.questions.bulkAdd(
      drafts.map((d) => ({
        id: crypto.randomUUID(),
        documentId,
        ...normalize(d),
        createdAt: now,
        updatedAt: now,
        pendingSync: 1 as const,
      })),
    );
  });
}

export async function addQuestion(draft: QuestionDraft): Promise<void> {
  const now = Date.now();
  await db.questions.add({
    id: crypto.randomUUID(),
    documentId: null,
    ...normalize(draft),
    createdAt: now,
    updatedAt: now,
    pendingSync: 1,
  });
}

export async function updateQuestion(id: string, draft: QuestionDraft): Promise<void> {
  await db.questions.update(id, { ...normalize(draft), updatedAt: Date.now(), pendingSync: 1 });
}

export async function deleteQuestion(id: string): Promise<void> {
  await db.questions.delete(id);
}

export async function deleteDocument(id: string, withQuestions: boolean): Promise<void> {
  await db.transaction('rw', db.documents, db.questions, async () => {
    if (withQuestions) await db.questions.where('documentId').equals(id).delete();
    else await db.questions.where('documentId').equals(id).modify({ documentId: null });
    await db.documents.delete(id);
  });
}

/** Topic name → number of questions that have a confirmed correct answer. */
export async function topicCounts(): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  await db.questions.each((q: Question) => {
    if (q.correctIndex === null) return;
    counts.set(q.topic, (counts.get(q.topic) ?? 0) + 1);
  });
  return counts;
}

export function toDraft(q: Question): QuestionDraft {
  return {
    text: q.text,
    options: [...q.options],
    correctIndex: q.correctIndex,
    topic: q.topic,
    difficulty: q.difficulty,
    explanation: q.explanation,
  };
}
