import { db, type Difficulty, type Question } from '../db/db';
import type { UploadResult } from '../ingest/buildUpload';
import { compressImage } from '../ingest/images';

export interface QuestionDraft {
  text: string;
  options: string[];
  correctIndex: number | null;
  topic: string;
  difficulty: Difficulty;
  explanation: string;
  imageIds: string[];
}

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: 'קל',
  medium: 'בינוני',
  hard: 'קשה',
};

export const UNCATEGORIZED = 'כללי';

export function emptyDraft(topic = ''): QuestionDraft {
  return { text: '', options: ['', '', '', ''], correctIndex: null, topic, difficulty: 'medium', explanation: '', imageIds: [] };
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
    imageIds: [...new Set(draft.imageIds)],
  };
}

/** Saves a reviewed upload: source documents, compressed images and questions, atomically. */
export async function saveUpload(upload: UploadResult, uploadedBy: string): Promise<void> {
  const now = Date.now();
  const docs = upload.files.map(({ file, role }) => ({ id: crypto.randomUUID(), file, role }));
  const primaryId = (docs.find((d) => d.role === 'questions') ?? docs[0])?.id ?? null;

  await db.transaction('rw', db.documents, db.questions, db.media, async () => {
    await db.documents.bulkAdd(
      docs.map(({ id, file }) => ({
        id,
        name: file.name,
        mimeType: file.type,
        size: file.size,
        blob: file,
        uploadedBy,
        createdAt: now,
        questionCount: id === primaryId ? upload.items.length : 0,
      })),
    );
    await db.media.bulkAdd(
      upload.media.map((m) => ({
        id: m.id,
        documentId: primaryId,
        name: m.name,
        mimeType: m.blob.type,
        blob: m.blob,
        createdAt: now,
      })),
    );
    await db.questions.bulkAdd(
      upload.items.map(({ draft }) => ({
        id: crypto.randomUUID(),
        documentId: primaryId,
        ...normalize(draft),
        createdAt: now,
        updatedAt: now,
        pendingSync: 1 as const,
      })),
    );
  });
}

/** Stores a single image added from the question editor; returns its media id. */
export async function addMedia(file: File, documentId: string | null): Promise<string> {
  const id = crypto.randomUUID();
  const blob = await compressImage(file);
  await db.media.add({ id, documentId, name: file.name, mimeType: blob.type, blob, createdAt: Date.now() });
  return id;
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
  await db.transaction('rw', db.documents, db.questions, db.media, async () => {
    if (withQuestions) {
      await db.questions.where('documentId').equals(id).delete();
      await db.media.where('documentId').equals(id).delete();
    } else {
      await db.questions.where('documentId').equals(id).modify({ documentId: null });
      await db.media.where('documentId').equals(id).modify({ documentId: null });
    }
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
    imageIds: [...(q.imageIds ?? [])],
  };
}
