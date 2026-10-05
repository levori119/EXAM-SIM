import { db, type LocalUser, type UserRole } from '../db/db';
import { generateSalt, hashPassword, safeEqual } from './crypto';

export type PublicUser = Omit<LocalUser, 'passwordHash' | 'salt'>;

export const AVATAR_COLORS = [
  '#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#14b8a6',
];

export const MIN_PASSWORD_LENGTH = 4;

export class AuthError extends Error {}

export function toPublicUser({ passwordHash: _h, salt: _s, ...user }: LocalUser): PublicUser {
  return user;
}

export async function listUsers(): Promise<PublicUser[]> {
  const users = await db.users.toArray();
  // Most recently used first, then alphabetically.
  users.sort(
    (a, b) =>
      (b.lastLoginAt ?? 0) - (a.lastLoginAt ?? 0) ||
      a.displayName.localeCompare(b.displayName, 'he'),
  );
  return users.map(toPublicUser);
}

export async function hasAnyUser(): Promise<boolean> {
  return (await db.users.count()) > 0;
}

export interface CreateUserInput {
  username: string;
  displayName: string;
  password: string;
  role: UserRole;
}

export async function createUser(input: CreateUserInput): Promise<PublicUser> {
  const username = input.username.trim().toLowerCase();
  const displayName = input.displayName.trim() || input.username.trim();

  if (!/^[\p{L}\p{N}._-]{2,32}$/u.test(username)) {
    throw new AuthError('שם משתמש: 2–32 תווים, אותיות/ספרות/נקודה/מקף בלבד.');
  }
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    throw new AuthError(`הסיסמה חייבת להכיל לפחות ${MIN_PASSWORD_LENGTH} תווים.`);
  }
  if (await db.users.where('username').equals(username).count()) {
    throw new AuthError('שם המשתמש כבר קיים.');
  }

  const salt = generateSalt();
  const now = Date.now();
  const user: LocalUser = {
    id: crypto.randomUUID(),
    username,
    displayName,
    role: input.role,
    avatarColor: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
    passwordHash: await hashPassword(input.password, salt),
    salt,
    createdAt: now,
    updatedAt: now,
    lastLoginAt: null,
    pendingSync: 1,
  };
  await db.users.add(user);
  return toPublicUser(user);
}

export async function verifyLogin(userId: string, password: string): Promise<PublicUser> {
  const user = await db.users.get(userId);
  if (!user) throw new AuthError('המשתמש לא נמצא.');

  const hash = await hashPassword(password, user.salt);
  if (!safeEqual(hash, user.passwordHash)) throw new AuthError('סיסמה שגויה.');

  const now = Date.now();
  await db.users.update(userId, { lastLoginAt: now, updatedAt: now, pendingSync: 1 });
  return toPublicUser({ ...user, lastLoginAt: now, updatedAt: now, pendingSync: 1 });
}

export async function getUser(userId: string): Promise<PublicUser | undefined> {
  const user = await db.users.get(userId);
  return user && toPublicUser(user);
}
