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

/** An uploaded source file (PDF, image, text) kept for offline viewing and re-parsing. */
export interface SourceDocument {
  id: string;
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
  documentId: string | null;
  text: string;
  options: string[];
  /** null until an admin confirms the correct answer. */
  correctIndex: number | null;
  topic: string;
  difficulty: Difficulty;
  explanation: string;
  /** Attached diagrams/figures, ids into `media`. */
  imageIds: string[];
  createdAt: number;
  updatedAt: number;
  pendingSync: 0 | 1;
}

/** A compressed image (diagram, figure) that questions can reference. */
export interface MediaFile {
  id: string;
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

export interface Exam {
  id: string;
  title: string;
  description: string;
  mode: ExamMode;
  /** null = no time limit. */
  durationMinutes: number | null;
  questionCount: number;
  /** Empty = draw from every topic. */
  topics: string[];
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
