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

export const db = new Dexie('exam-sim') as Dexie & {
  users: EntityTable<LocalUser, 'id'>;
};

db.version(1).stores({
  users: 'id, &username, role, lastLoginAt, pendingSync',
});
