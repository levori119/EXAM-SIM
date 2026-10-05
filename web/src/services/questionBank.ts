import { db, type Difficulty, type Question } from '../db/db';
import type { UploadResult } from '../ingest/buildUpload';
import { compressImage } from '../ingest/images';
import { findOrCreateSet } from './questionSets';

export interface QuestionDraft {
  text: string;
  options: string[];
  correctIndex: number | null;
  difficulty: Difficulty;
  explanation: string;
  imageIds: string[];
}

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: 'קל',
  medium: 'בינוני',
  hard: 'קשה',
};

export function emptyDraft(): QuestionDraft {
  return { text: '', options: ['', '', '', ''], correctIndex: null, difficulty: 'medium', explanation: '', imageIds: [] };
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
    difficulty: draft.difficulty,
    explanation: draft.explanation.trim(),
    imageIds: [...new Set(draft.imageIds)],
  };
}

/**
 * Saves a reviewed upload into the questionnaire called `setName` (created if new):
 * source documents, compressed images and questions, atomically.
 */
export async function saveUpload(upload: UploadResult, setName: string, uploadedBy: string): Promise<string> {
  const setId = await findOrCreateSet(setName, uploadedBy);
  const now = Date.now();
  const docs = upload.files.map(({ file, role }) => ({ id: crypto.randomUUID(), file, role }));
  const primaryId = (docs.find((d) => d.role === 'questions') ?? docs[0])?.id ?? null;

  await db.transaction('rw', db.documents, db.questions, db.media, async () => {
    await db.documents.bulkAdd(
      docs.map(({ id, file }) => ({
        id,
        setId,
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
        setId,
        documentId: primaryId,
        name: m.name,
        mimeType: m.blob.type,
        blob: m.blob,
        createdAt: now,
      })),
    );
    await db.questions.bulkAdd(
      upload.items.map(({ draft }, i) => ({
        id: crypto.randomUUID(),
        setId,
        documentId: primaryId,
        ...normalize(draft),
        createdAt: now + i, // keeps file order when sorting by createdAt
        updatedAt: now,
        pendingSync: 1 as const,
      })),
    );
  });
  return setId;
}

/** Stores a single image added from the question editor; returns its media id. */
export async function addMedia(file: File, setId: string | null): Promise<string> {
  const id = crypto.randomUUID();
  const blob = await compressImage(file);
  await db.media.add({ id, setId, documentId: null, name: file.name, mimeType: blob.type, blob, createdAt: Date.now() });
  return id;
}

export async function addQuestion(setId: string, draft: QuestionDraft): Promise<void> {
  const now = Date.now();
  await db.questions.add({
    id: crypto.randomUUID(),
    setId,
    documentId: null,
    ...normalize(draft),
    createdAt: now,
    updatedAt: now,
    pendingSync: 1,
  });
}

export async function updateQuestion(id: string, setId: string, draft: QuestionDraft): Promise<void> {
  await db.questions.update(id, { setId, ...normalize(draft), updatedAt: Date.now(), pendingSync: 1 });
}

export async function deleteQuestion(id: string): Promise<void> {
  await db.questions.delete(id);
}

export function toDraft(q: Question): QuestionDraft {
  return {
    text: q.text,
    options: [...q.options],
    correctIndex: q.correctIndex,
    difficulty: q.difficulty,
    explanation: q.explanation,
    imageIds: [...(q.imageIds ?? [])],
  };
}
