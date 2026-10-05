import Dexie, { type EntityTable } from 'dexie';

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
  createdAt: number;
  updatedAt: number;
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
};

db.version(1).stores({
  users: 'id, &username, role, lastLoginAt, pendingSync',
});

db.version(2).stores({
  documents: 'id, createdAt',
  questions: 'id, documentId, topic, createdAt, pendingSync',
  exams: 'id, published, createdAt, pendingSync',
});
