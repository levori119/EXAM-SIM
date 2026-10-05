import Dexie, { type EntityTable, type Table } from 'dexie';

export type UserRole = 'admin' | 'examinee';

export interface LocalUser {
  id: string;
  username: string; // lower-cased, unique
  displayName: string;
  role: UserRole;
  avatarColor: string;
  passwordHash: string; // base64 PBKDF2-SHA256
  salt: string; // base64
  createdAt: number;
  updatedAt: number;
  lastLoginAt: number | null;
  /** Set when the record changed locally and has not yet been pushed to the server. */
  pendingSync: 0 | 1;
}

/**
 * A named questionnaire: the questions, answer key and figures uploaded together.
 * It is the unit admins mix when building exams and practice rounds.
 */
export interface QuestionSet {
  id: string;
  name: string;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  pendingSync: 0 | 1;
}

/** An uploaded source file (PDF, image, text) kept for offline viewing and re-parsing. */
export interface SourceDocument {
  id: string;
  setId: string;
  name: string;
  mimeType: string;
  size: number;
  blob: Blob;
  uploadedBy: string;
  createdAt: number;
  questionCount: number;
}

export type Difficulty = 'easy' | 'medium' | 'hard';

export interface Question {
  id: string;
  setId: string;
  documentId: string | null;
  text: string;
  options: string[];
  /** null until an admin confirms the correct answer. */
  correctIndex: number | null;
  difficulty: Difficulty;
  explanation: string;
  /** Attached diagrams/figures, ids into `media`. */
  imageIds: string[];
  /** The question's number in its source file, for linking files added later ("36.png", answer keys). */
  sourceNumber?: number | null;
  createdAt: number;
  updatedAt: number;
  pendingSync: 0 | 1;
}

/** A compressed image (diagram, figure) that questions can reference. */
export interface MediaFile {
  id: string;
  setId: string | null;
  documentId: string | null;
  name: string;
  mimeType: string;
  blob: Blob;
  createdAt: number;
}

export interface Favorite {
  userId: string;
  questionId: string;
  createdAt: number;
}

export type RevealMode = 'immediate' | 'end';

export interface PracticeSettings {
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  reveal: RevealMode;
}

export interface PracticeSession {
  id: string;
  userId: string;
  title: string;
  settings: PracticeSettings;
  questionIds: string[];
  /** questionId → chosen option index (in the question's original option order), null = skipped. */
  answers: Record<string, number | null>;
  correctCount: number;
  startedAt: number;
  finishedAt: number;
  pendingSync: 0 | 1;
}

export type ExamMode = 'practice' | 'final';

/** How a mix of questionnaires splits the total: evenly, by questionnaire size, or hand-picked counts. */
export type Distribution = 'equal' | 'proportional' | 'custom';

export interface SetQuota {
  setId: string;
  count: number;
}

export interface Exam {
  id: string;
  title: string;
  description: string;
  mode: ExamMode;
  /** null = no time limit. */
  durationMinutes: number | null;
  /** Total questions; always the sum of `composition` counts. */
  questionCount: number;
  composition: SetQuota[];
  distribution: Distribution;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  published: boolean;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  pendingSync: 0 | 1;
}

export const db = new Dexie('exam-sim') as Dexie & {
  users: EntityTable<LocalUser, 'id'>;
  questionSets: EntityTable<QuestionSet, 'id'>;
  documents: EntityTable<SourceDocument, 'id'>;
  questions: EntityTable<Question, 'id'>;
  exams: EntityTable<Exam, 'id'>;
  media: EntityTable<MediaFile, 'id'>;
  favorites: Table<Favorite, [string, string]>;
  practiceSessions: EntityTable<PracticeSession, 'id'>;
};

db.version(1).stores({
  users: 'id, &username, role, lastLoginAt, pendingSync',
});

db.version(2).stores({
  documents: 'id, createdAt',
  questions: 'id, documentId, topic, createdAt, pendingSync',
  exams: 'id, published, createdAt, pendingSync',
});

db.version(3)
  .stores({
    media: 'id, documentId',
    favorites: '[userId+questionId], userId',
    practiceSessions: 'id, userId, finishedAt, pendingSync',
  })
  .upgrade((tx) =>
    tx
      .table('questions')
      .toCollection()
      .modify((q: Partial<Question>) => {
        q.imageIds ??= [];
      }),
  );

/** v4: topics become named questionnaires; exams switch from topic lists to per-questionnaire quotas. */
db.version(4)
  .stores({
    questionSets: 'id, &name, createdAt',
    documents: 'id, setId, createdAt',
    questions: 'id, setId, documentId, createdAt, pendingSync',
    media: 'id, setId, documentId',
  })
  .upgrade(async (tx) => {
    const now = Date.now();
    const setIdByName = new Map<string, string>();
    const ensureSet = async (name: string) => {
      const clean = name.trim() || 'כללי';
      let id = setIdByName.get(clean);
      if (!id) {
        id = crypto.randomUUID();
        setIdByName.set(clean, id);
        await tx.table('questionSets').add({ id, name: clean, createdBy: '', createdAt: now, updatedAt: now, pendingSync: 1 });
      }
      return id;
    };

    const setByDocument = new Map<string, string>();
    const questions = await tx.table('questions').toArray();
    for (const q of questions) {
      q.setId = await ensureSet(q.topic ?? '');
      delete q.topic;
      if (q.documentId) setByDocument.set(q.documentId, q.setId);
      await tx.table('questions').put(q);
    }
    for (const d of await tx.table('documents').toArray()) {
      d.setId = setByDocument.get(d.id) ?? (await ensureSet(d.name.replace(/\.[^.]+$/, '')));
      setByDocument.set(d.id, d.setId);
      await tx.table('documents').put(d);
    }
    await tx
      .table('media')
      .toCollection()
      .modify((m: Partial<MediaFile>) => {
        m.setId = (m.documentId && setByDocument.get(m.documentId)) || null;
      });

    // Old exams listed topics (empty = all); turn them into proportional quotas.
    const answerable = new Map<string, number>();
    for (const q of questions) if (q.correctIndex !== null) answerable.set(q.setId, (answerable.get(q.setId) ?? 0) + 1);
    for (const e of await tx.table('exams').toArray()) {
      const topics: string[] = e.topics ?? [];
      const setIds = topics.length ? topics.map((t) => setIdByName.get(t)).filter((x): x is string => !!x) : [...answerable.keys()];
      const pool = setIds.reduce((sum, id) => sum + (answerable.get(id) ?? 0), 0) || 1;
      e.composition = setIds.map((setId) => ({ setId, count: Math.round((e.questionCount * (answerable.get(setId) ?? 0)) / pool) }));
      e.questionCount = e.composition.reduce((sum: number, c: SetQuota) => sum + c.count, 0);
      e.distribution = 'proportional';
      delete e.topics;
      await tx.table('exams').put(e);
    }
  });
