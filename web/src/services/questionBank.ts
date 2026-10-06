import { db, type Difficulty, type Question } from '../db/db';
import type { UploadResult } from '../ingest/buildUpload';
import { assignImages, compressImage, linkText } from '../ingest/images';
import { findOrCreateSet, findSetByName } from './questionSets';

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
 * Links between an upload and what its questionnaire already holds: new pictures for saved
 * questions ("picture 36" uploaded before its pictures file), and saved pictures for new questions.
 */
async function crossLinks(setId: string, upload: UploadResult) {
  const [savedQuestions, savedMedia] = await Promise.all([
    db.questions.where('setId').equals(setId).toArray(),
    db.media.where('setId').equals(setId).toArray(),
  ]);
  const questions = [
    ...savedQuestions.map((q) => ({ text: linkText(q.text, q.options), number: q.sourceNumber ?? null })),
    ...upload.items.map((i) => ({ text: linkText(i.draft.text, i.draft.options), number: i.number })),
  ];
  const assigned = assignImages(questions, [...savedMedia, ...upload.media]);
  const newMediaIds = new Set(upload.media.map((m) => m.id));
  const savedMediaIds = new Set(savedMedia.map((m) => m.id));

  const savedUpdates = savedQuestions
    .map((q, i) => ({ q, add: assigned[i].filter((id) => newMediaIds.has(id) && !q.imageIds.includes(id)) }))
    .filter((u) => u.add.length);
  const newItemExtras = upload.items.map((item, i) =>
    assigned[savedQuestions.length + i].filter((id) => savedMediaIds.has(id) && !item.draft.imageIds.includes(id)),
  );
  return { savedUpdates, newItemExtras };
}

/**
 * A pictures-only upload belongs with the questions that reference it: finds the questionnaire
 * whose questions mention the most of these pictures ("picture 36" ↔ "תמונה 36").
 */
export async function suggestSetForMedia(upload: UploadResult, courseId: string): Promise<{ name: string; questions: number } | null> {
  if (!upload.media.length || upload.items.length) return null;
  const [sets, questions] = await Promise.all([db.questionSets.where('courseId').equals(courseId).toArray(), db.questions.toArray()]);
  let best: { name: string; questions: number } | null = null;
  for (const set of sets) {
    const qs = questions.filter((q) => q.setId === set.id);
    const assigned = assignImages(
      qs.map((q) => ({ text: linkText(q.text, q.options), number: q.sourceNumber ?? null })),
      upload.media,
    );
    const linked = assigned.filter((ids) => ids.length).length;
    if (linked && (!best || linked > best.questions)) best = { name: set.name, questions: linked };
  }
  return best;
}

/** For the review screen: how many links to an existing questionnaire's content saving will add. */
export async function previewCrossLinks(setName: string, courseId: string, upload: UploadResult): Promise<number> {
  const set = await findSetByName(setName, courseId);
  if (!set) return 0;
  const { savedUpdates, newItemExtras } = await crossLinks(set.id, upload);
  return savedUpdates.reduce((s, u) => s + u.add.length, 0) + newItemExtras.reduce((s, x) => s + x.length, 0);
}

/**
 * Saves a reviewed upload into the questionnaire called `setName` (created if new):
 * source documents, compressed images and questions, atomically — and links pictures
 * to questions already saved in that questionnaire.
 */
export async function saveUpload(upload: UploadResult, setName: string, courseId: string, uploadedBy: string): Promise<string> {
  const setId = await findOrCreateSet(setName, courseId, uploadedBy);
  const { savedUpdates, newItemExtras } = await crossLinks(setId, upload);
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
      upload.items.map(({ draft, number }, i) => ({
        id: crypto.randomUUID(),
        setId,
        documentId: primaryId,
        ...normalize({ ...draft, imageIds: [...draft.imageIds, ...newItemExtras[i]] }),
        sourceNumber: number,
        createdAt: now + i, // keeps file order when sorting by createdAt
        updatedAt: now,
        pendingSync: 1 as const,
      })),
    );
    for (const { q, add } of savedUpdates) {
      await db.questions.update(q.id, { imageIds: [...q.imageIds, ...add], updatedAt: now, pendingSync: 1 });
    }
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
