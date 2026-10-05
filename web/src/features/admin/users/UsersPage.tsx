import { useEffect, useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { KeyRound, Pencil, Search, ShieldCheck, Trash2, UserPlus } from 'lucide-react';
import type { UserRole } from '../../../db/db';
import { useAuth } from '../../../auth/AuthContext';
import {
  createUser,
  deleteUser,
  listUsers,
  MIN_PASSWORD_LENGTH,
  resetPassword,
  updateUser,
  type PublicUser,
} from '../../../auth/userService';
import { Avatar } from '../../../components/Avatar';
import { IconButton } from '../../../components/IconButton';
import { ConfirmDialog, Modal } from '../../../components/Modal';
import { PageHeader } from '../../../components/PageHeader';
import { Button, ErrorText, inputClass, PasswordField, SelectField, TextField } from '../../../components/fields';

const ROLE_LABELS: Record<UserRole, string> = { admin: 'מנהל', examinee: 'נבחן' };

const dateFormat = new Intl.DateTimeFormat('he-IL', { dateStyle: 'short', timeStyle: 'short' });

type Dialog =
  | { kind: 'create' }
  | { kind: 'edit'; user: PublicUser }
  | { kind: 'password'; user: PublicUser }
  | { kind: 'delete'; user: PublicUser }
  | null;

export function UsersPage() {
  const { user: me } = useAuth();
  const users = useLiveQuery(listUsers);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all');
  const [dialog, setDialog] = useState<Dialog>(null);
  const close = () => setDialog(null);

  const q = query.trim().toLowerCase();
  const visible = (users ?? []).filter(
    (u) =>
      (roleFilter === 'all' || u.role === roleFilter) &&
      (!q || u.displayName.toLowerCase().includes(q) || u.username.includes(q)),
  );

  return (
    <>
      <PageHeader
        title="ניהול משתמשים"
        subtitle={users ? `${users.length} משתמשים במכשיר זה` : undefined}
        actions={
          <Button variant="primary" onClick={() => setDialog({ kind: 'create' })}>
            <UserPlus className="h-5 w-5" />
            משתמש חדש
          </Button>
        }
      />

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto h-5 w-5 text-slate-400" />
          <input
            className={`${inputClass} ps-10`}
            placeholder="חיפוש לפי שם או שם משתמש"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select className={`${inputClass} sm:w-44`} value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as UserRole | 'all')}>
          <option value="all">כל התפקידים</option>
          <option value="admin">מנהלים</option>
          <option value="examinee">נבחנים</option>
        </select>
      </div>

      <ul className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
        {visible.map((u) => (
          <li key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <Avatar name={u.displayName} color={u.avatarColor} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 font-semibold">
                <span className="truncate">{u.displayName}</span>
                {u.id === me?.id && <span className="rounded-full bg-slate-100 px-2 text-xs font-normal dark:bg-slate-800">את/ה</span>}
              </div>
              <div className="text-sm text-slate-500 dark:text-slate-400" dir="auto">
                <span dir="ltr">@{u.username}</span>
                {' · '}
                {u.lastLoginAt ? `כניסה אחרונה ${dateFormat.format(u.lastLoginAt)}` : 'טרם נכנס/ה'}
              </div>
            </div>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${
                u.role === 'admin'
                  ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300'
                  : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              {u.role === 'admin' && <ShieldCheck className="h-3.5 w-3.5" />}
              {ROLE_LABELS[u.role]}
            </span>
            <div className="flex">
              <IconButton label="עריכה" onClick={() => setDialog({ kind: 'edit', user: u })}>
                <Pencil className="h-5 w-5" />
              </IconButton>
              <IconButton label="איפוס סיסמה" onClick={() => setDialog({ kind: 'password', user: u })}>
                <KeyRound className="h-5 w-5" />
              </IconButton>
              <IconButton
                label="מחיקה"
                danger
                disabled={u.id === me?.id}
                onClick={() => setDialog({ kind: 'delete', user: u })}
              >
                <Trash2 className="h-5 w-5" />
              </IconButton>
            </div>
          </li>
        ))}
        {users && !visible.length && <li className="px-4 py-10 text-center text-slate-500">לא נמצאו משתמשים.</li>}
      </ul>

      <CreateUserDialog open={dialog?.kind === 'create'} onClose={close} />
      <EditUserDialog user={dialog?.kind === 'edit' ? dialog.user : null} onClose={close} />
      <ResetPasswordDialog user={dialog?.kind === 'password' ? dialog.user : null} onClose={close} />
      <ConfirmDialog
        open={dialog?.kind === 'delete'}
        title="מחיקת משתמש"
        message={
          dialog?.kind === 'delete' && (
            <>
              למחוק את <b>{dialog.user.displayName}</b>? הפעולה אינה ניתנת לביטול.
            </>
          )
        }
        onConfirm={() => (dialog?.kind === 'delete' ? deleteUser(dialog.user.id) : undefined)}
        onClose={close}
      />
    </>
  );
}

/** Shared submit/error/busy handling for the dialogs below. */
function useSubmit(action: () => Promise<void>, onDone: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await action();
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'הפעולה נכשלה.');
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, setError, submit };
}

function CreateUserDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('examinee');
  const { busy, error, setError, submit } = useSubmit(
    () => createUser({ displayName, username, password, role }).then(() => undefined),
    onClose,
  );

  useEffect(() => {
    if (!open) return;
    setDisplayName('');
    setUsername('');
    setPassword('');
    setRole('examinee');
    setError(null);
  }, [open, setError]);

  return (
    <Modal
      open={open}
      title="משתמש חדש"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            ביטול
          </Button>
          <Button variant="primary" type="submit" form="create-user-form" loading={busy}>
            יצירה
          </Button>
        </>
      }
    >
      <form id="create-user-form" onSubmit={submit} className="space-y-4">
        <TextField id="cu-name" label="שם מלא" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
        <TextField
          id="cu-username"
          label="שם משתמש"
          dir="ltr"
          autoCapitalize="none"
          spellCheck={false}
          autoComplete="off"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
        <PasswordField
          id="cu-password"
          label={`סיסמה ראשונית (לפחות ${MIN_PASSWORD_LENGTH} תווים)`}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <SelectField id="cu-role" label="תפקיד" value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
          <option value="examinee">נבחן</option>
          <option value="admin">מנהל</option>
        </SelectField>
        <ErrorText message={error} />
      </form>
    </Modal>
  );
}

function EditUserDialog({ user, onClose }: { user: PublicUser | null; onClose: () => void }) {
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<UserRole>('examinee');
  const { busy, error, setError, submit } = useSubmit(
    () => (user ? updateUser(user.id, { displayName, role }) : Promise.resolve()),
    onClose,
  );

  useEffect(() => {
    if (!user) return;
    setDisplayName(user.displayName);
    setRole(user.role);
    setError(null);
  }, [user, setError]);

  return (
    <Modal
      open={!!user}
      title="עריכת משתמש"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            ביטול
          </Button>
          <Button variant="primary" type="submit" form="edit-user-form" loading={busy}>
            שמירה
          </Button>
        </>
      }
    >
      <form id="edit-user-form" onSubmit={submit} className="space-y-4">
        <TextField id="eu-name" label="שם מלא" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
        <SelectField id="eu-role" label="תפקיד" value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
          <option value="examinee">נבחן</option>
          <option value="admin">מנהל</option>
        </SelectField>
        <ErrorText message={error} />
      </form>
    </Modal>
  );
}

function ResetPasswordDialog({ user, onClose }: { user: PublicUser | null; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const { busy, error, setError, submit } = useSubmit(
    () => (user ? resetPassword(user.id, password) : Promise.resolve()),
    onClose,
  );

  useEffect(() => {
    if (!user) return;
    setPassword('');
    setError(null);
  }, [user, setError]);

  return (
    <Modal
      open={!!user}
      title={`איפוס סיסמה — ${user?.displayName ?? ''}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            ביטול
          </Button>
          <Button variant="primary" type="submit" form="reset-password-form" loading={busy}>
            עדכון סיסמה
          </Button>
        </>
      }
    >
      <form id="reset-password-form" onSubmit={submit} className="space-y-4">
        <PasswordField
          id="rp-password"
          label={`סיסמה חדשה (לפחות ${MIN_PASSWORD_LENGTH} תווים)`}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <ErrorText message={error} />
      </form>
    </Modal>
  );
}
