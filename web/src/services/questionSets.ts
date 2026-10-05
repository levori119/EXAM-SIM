import { db, type QuestionSet } from '../db/db';
import { assignImages, linkText } from '../ingest/images';

export interface SetSummary extends QuestionSet {
  questionCount: number;
  answerableCount: number;
  imageCount: number;
  documentNames: string[];
}

export const normalizeSetName = (name: string) => name.trim().replace(/\s+/g, ' ');

export async function listSetSummaries(): Promise<SetSummary[]> {
  const [sets, questions, documents, media] = await Promise.all([
    db.questionSets.toArray(),
    db.questions.toArray(),
    db.documents.toArray(),
    db.media.toArray(),
  ]);
  return sets
    .map((set) => {
      const qs = questions.filter((q) => q.setId === set.id);
      return {
        ...set,
        questionCount: qs.length,
        answerableCount: qs.filter((q) => q.correctIndex !== null).length,
        imageCount: media.filter((m) => m.setId === set.id).length,
        documentNames: documents.filter((d) => d.setId === set.id).map((d) => d.name),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'he'));
}

export async function findSetByName(name: string): Promise<QuestionSet | undefined> {
  return db.questionSets.where('name').equals(normalizeSetName(name)).first();
}

/** Returns the questionnaire with this name, creating it if needed. */
export async function findOrCreateSet(name: string, userId: string): Promise<string> {
  const clean = normalizeSetName(name);
  if (!clean) throw new Error('יש לתת שם לשאלון.');
  const existing = await findSetByName(clean);
  if (existing) return existing.id;
  const now = Date.now();
  const id = crypto.randomUUID();
  await db.questionSets.add({ id, name: clean, createdBy: userId, createdAt: now, updatedAt: now, pendingSync: 1 });
  return id;
}

export async function renameSet(id: string, name: string): Promise<void> {
  const clean = normalizeSetName(name);
  if (!clean) throw new Error('יש לתת שם לשאלון.');
  const clash = await findSetByName(clean);
  if (clash && clash.id !== id) throw new Error('כבר קיים שאלון בשם הזה.');
  await db.questionSets.update(id, { name: clean, updatedAt: Date.now(), pendingSync: 1 });
}

/** Deletes a questionnaire with its questions, files and images, and drops it from exams. */
export async function deleteSet(id: string): Promise<void> {
  await db.transaction('rw', [db.questionSets, db.questions, db.documents, db.media, db.exams, db.favorites], async () => {
    const questionIds = await db.questions.where('setId').equals(id).primaryKeys();
    await db.questions.bulkDelete(questionIds);
    await db.favorites.filter((f) => questionIds.includes(f.questionId)).delete();
    await db.documents.where('setId').equals(id).delete();
    await db.media.where('setId').equals(id).delete();
    await db.exams.toCollection().modify((exam) => {
      if (!exam.composition.some((c) => c.setId === id)) return;
      exam.composition = exam.composition.filter((c) => c.setId !== id);
      exam.questionCount = exam.composition.reduce((s, c) => s + c.count, 0);
      exam.updatedAt = Date.now();
      exam.pendingSync = 1;
    });
    await db.questionSets.delete(id);
  });
}

/**
 * Re-runs automatic picture linking inside a questionnaire (adds missing links, never removes).
 * Returns how many links were added.
 */
export async function relinkSet(setId: string): Promise<number> {
  const [questions, media] = await Promise.all([
    db.questions.where('setId').equals(setId).sortBy('createdAt'),
    db.media.where('setId').equals(setId).toArray(),
  ]);
  const assigned = assignImages(
    questions.map((q) => ({ text: linkText(q.text, q.options), number: q.sourceNumber ?? null })),
    media,
  );
  let added = 0;
  const now = Date.now();
  await db.transaction('rw', db.questions, async () => {
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const missing = assigned[i].filter((id) => !q.imageIds.includes(id));
      if (!missing.length) continue;
      added += missing.length;
      await db.questions.update(q.id, { imageIds: [...q.imageIds, ...missing], updatedAt: now, pendingSync: 1 });
    }
  });
  return added;
}

/**
 * Moves everything from one questionnaire into another (questions, files, pictures, exam quotas),
 * deletes the empty source and links the combined pictures. Returns links added.
 */
export async function mergeSet(sourceId: string, targetId: string): Promise<number> {
  if (sourceId === targetId) return 0;
  const now = Date.now();
  await db.transaction('rw', [db.questionSets, db.questions, db.documents, db.media, db.exams], async () => {
    await db.questions.where('setId').equals(sourceId).modify({ setId: targetId, updatedAt: now, pendingSync: 1 });
    await db.documents.where('setId').equals(sourceId).modify({ setId: targetId });
    await db.media.where('setId').equals(sourceId).modify({ setId: targetId });
    await db.exams.toCollection().modify((exam) => {
      const from = exam.composition.find((c) => c.setId === sourceId);
      if (!from) return;
      const into = exam.composition.find((c) => c.setId === targetId);
      if (into) into.count += from.count;
      else exam.composition.push({ setId: targetId, count: from.count });
      exam.composition = exam.composition.filter((c) => c.setId !== sourceId);
      exam.updatedAt = now;
      exam.pendingSync = 1;
    });
    await db.questionSets.delete(sourceId);
  });
  return relinkSet(targetId);
}
