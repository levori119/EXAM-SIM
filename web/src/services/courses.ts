import { COURSE_COLORS, db, type Course } from '../db/db';
import { deleteSet } from './questionSets';

export interface CourseSummary extends Course {
  questionnaires: number;
  questions: number;
  exams: number;
  materials: number;
}

export const normalizeCourseName = (name: string) => name.trim().replace(/\s+/g, ' ');

export async function listCourseSummaries(): Promise<CourseSummary[]> {
  const [courses, sets, questions, exams, materials] = await Promise.all([
    db.courses.toArray(),
    db.questionSets.toArray(),
    db.questions.toArray(),
    db.exams.toArray(),
    db.materials.toArray(),
  ]);
  return courses
    .map((c) => {
      const setIds = new Set(sets.filter((s) => s.courseId === c.id).map((s) => s.id));
      return {
        ...c,
        questionnaires: setIds.size,
        questions: questions.filter((q) => setIds.has(q.setId)).length,
        exams: exams.filter((e) => e.courseId === c.id).length,
        materials: materials.filter((m) => m.courseId === c.id).length,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'he'));
}

export interface CourseDraft {
  name: string;
  description: string;
  color: string;
}

async function assertUniqueName(name: string, id: string | null) {
  const clash = await db.courses.where('name').equals(name).first();
  if (clash && clash.id !== id) throw new Error('כבר קיים קורס בשם הזה.');
}

export async function createCourse(draft: CourseDraft, userId: string): Promise<string> {
  const name = normalizeCourseName(draft.name);
  if (!name) throw new Error('יש לתת שם לקורס.');
  await assertUniqueName(name, null);
  const now = Date.now();
  const id = crypto.randomUUID();
  const color = draft.color || COURSE_COLORS[(await db.courses.count()) % COURSE_COLORS.length];
  await db.courses.add({ id, name, description: draft.description.trim(), color, createdBy: userId, createdAt: now, updatedAt: now, pendingSync: 1 });
  return id;
}

export async function updateCourse(id: string, draft: CourseDraft): Promise<void> {
  const name = normalizeCourseName(draft.name);
  if (!name) throw new Error('יש לתת שם לקורס.');
  await assertUniqueName(name, id);
  await db.courses.update(id, { name, description: draft.description.trim(), color: draft.color, updatedAt: Date.now(), pendingSync: 1 });
}

/** Deletes a course with everything in it: questionnaires (and their questions), exams, materials, practice history. */
export async function deleteCourse(id: string): Promise<void> {
  for (const set of await db.questionSets.where('courseId').equals(id).toArray()) await deleteSet(set.id);
  await db.transaction('rw', [db.courses, db.exams, db.materials, db.practiceSessions, db.savedPractices], async () => {
    await db.exams.where('courseId').equals(id).delete();
    await db.materials.where('courseId').equals(id).delete();
    await db.practiceSessions.where('courseId').equals(id).delete();
    await db.savedPractices.where('courseId').equals(id).delete();
    await db.courses.delete(id);
  });
}
