import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowRight, GraduationCap, ShieldCheck, UserPlus } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { createUser, listUsers, MIN_PASSWORD_LENGTH, type PublicUser } from '../../auth/userService';
import { Avatar } from '../../components/Avatar';
import { OnlineBadge } from '../../components/OnlineBadge';
import { ErrorText, PasswordField, PrimaryButton, TextField } from '../../components/fields';

type View = { kind: 'pick' } | { kind: 'password'; user: PublicUser } | { kind: 'create'; firstRun: boolean };

const slide = {
  initial: { opacity: 0, x: -24 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 24 },
  transition: { duration: 0.2, ease: 'easeOut' },
} as const;

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : 'שגיאה לא צפויה.');

export function LoginScreen() {
  // Re-runs automatically whenever the users table changes.
  const users = useLiveQuery(listUsers);
  const [view, setView] = useState<View>({ kind: 'pick' });

  const firstRun = users !== undefined && users.length === 0;
  const effectiveView: View = firstRun ? { kind: 'create', firstRun: true } : view;

  return (
    <div className="relative isolate flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-br from-indigo-100 via-slate-50 to-sky-100 dark:from-indigo-950/60 dark:via-slate-950 dark:to-sky-950/40" />
      <div className="pointer-events-none absolute -top-32 -start-32 -z-10 h-96 w-96 rounded-full bg-indigo-400/20 blur-3xl" />

      <div className="w-full max-w-3xl">
        <header className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-xl shadow-indigo-600/30">
            <GraduationCap className="h-9 w-9" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">סימולטור מבחנים</h1>
          <OnlineBadge />
        </header>

        <main className="rounded-3xl border border-slate-200/70 bg-white/80 p-6 shadow-xl backdrop-blur sm:p-8 dark:border-slate-800 dark:bg-slate-900/70">
          {users === undefined ? (
            <div className="flex justify-center py-16">
              <span className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
            </div>
          ) : (
            <AnimatePresence mode="wait" initial={false}>
              {effectiveView.kind === 'pick' && (
                <motion.div key="pick" {...slide}>
                  <UserPicker
                    users={users}
                    onPick={(user) => setView({ kind: 'password', user })}
                    onCreate={() => setView({ kind: 'create', firstRun: false })}
                  />
                </motion.div>
              )}
              {effectiveView.kind === 'password' && (
                <motion.div key={`pw-${effectiveView.user.id}`} {...slide}>
                  <PasswordStep user={effectiveView.user} onBack={() => setView({ kind: 'pick' })} />
                </motion.div>
              )}
              {effectiveView.kind === 'create' && (
                <motion.div key="create" {...slide}>
                  <CreateUserForm
                    firstRun={effectiveView.firstRun}
                    onBack={() => setView({ kind: 'pick' })}
                    onCreated={(user) => setView({ kind: 'password', user })}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </main>
      </div>
    </div>
  );
}

function UserPicker({
  users,
  onPick,
  onCreate,
}: {
  users: PublicUser[];
  onPick: (user: PublicUser) => void;
  onCreate: () => void;
}) {
  return (
    <section>
      <h2 className="mb-6 text-center text-xl font-semibold">מי נבחן היום?</h2>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {users.map((user) => (
          <li key={user.id}>
            <button
              onClick={() => onPick(user)}
              className="group flex min-h-40 w-full flex-col items-center justify-center gap-3 rounded-2xl border border-transparent p-4 transition hover:border-indigo-200 hover:bg-indigo-50 focus-visible:border-indigo-400 focus-visible:outline-none active:scale-[0.97] dark:hover:border-indigo-500/30 dark:hover:bg-indigo-500/10"
            >
              <div className="transition group-hover:scale-105">
                <Avatar name={user.displayName} color={user.avatarColor} />
              </div>
              <div className="text-center">
                <div className="line-clamp-1 font-semibold">{user.displayName}</div>
                <div className="flex items-center justify-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                  {user.role === 'admin' && <ShieldCheck className="h-3.5 w-3.5" />}
                  {user.role === 'admin' ? 'מנהל' : 'נבחן'}
                </div>
              </div>
            </button>
          </li>
        ))}
        <li>
          <button
            onClick={onCreate}
            className="flex min-h-40 w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-slate-300 p-4 text-slate-500 transition hover:border-indigo-400 hover:text-indigo-600 active:scale-[0.97] dark:border-slate-700 dark:text-slate-400 dark:hover:border-indigo-400 dark:hover:text-indigo-300"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
              <UserPlus className="h-7 w-7" />
            </div>
            <span className="font-semibold">משתמש חדש</span>
          </button>
        </li>
      </ul>
    </section>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mb-4 inline-flex min-h-12 items-center gap-2 rounded-xl px-3 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
    >
      <ArrowRight className="h-4 w-4" />
      חזרה
    </button>
  );
}

function PasswordStep({ user, onBack }: { user: PublicUser; onBack: () => void }) {
  const { login } = useAuth();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => inputRef.current?.focus(), []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await login(user.id, password);
    } catch (err) {
      setError(errorMessage(err));
      setAttempt((n) => n + 1);
      setPassword('');
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  return (
    <section className="mx-auto max-w-sm">
      <BackButton onClick={onBack} />
      <div className="mb-6 flex flex-col items-center gap-3">
        <Avatar name={user.displayName} color={user.avatarColor} size="lg" />
        <h2 className="text-xl font-semibold">שלום, {user.displayName}</h2>
      </div>
      {/* Keying on the attempt count replays the shake on every failed login. */}
      <motion.form
        key={attempt}
        onSubmit={submit}
        className="space-y-4"
        initial={attempt ? { x: 0 } : false}
        animate={attempt ? { x: [0, -10, 10, -6, 6, 0] } : undefined}
        transition={{ duration: 0.35 }}
      >
        <PasswordField
          ref={inputRef}
          id="login-password"
          label="סיסמה"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <ErrorText message={error} />
        <PrimaryButton type="submit" loading={loading} disabled={!password}>
          כניסה
        </PrimaryButton>
      </motion.form>
    </section>
  );
}

function CreateUserForm({
  firstRun,
  onBack,
  onCreated,
}: {
  firstRun: boolean;
  onBack: () => void;
  onCreated: (user: PublicUser) => void;
}) {
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError('הסיסמאות אינן תואמות.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // The first account on a device becomes its administrator.
      const user = await createUser({ displayName, username, password, role: firstRun ? 'admin' : 'examinee' });
      onCreated(user);
    } catch (err) {
      setError(errorMessage(err));
      setLoading(false);
    }
  };

  return (
    <section className="mx-auto max-w-sm">
      {!firstRun && <BackButton onClick={onBack} />}
      <div className="mb-6 text-center">
        <h2 className="text-xl font-semibold">{firstRun ? 'ברוכים הבאים! צרו חשבון מנהל' : 'יצירת משתמש חדש'}</h2>
        {firstRun && (
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            החשבון הראשון במכשיר הוא חשבון המנהל.
          </p>
        )}
      </div>
      <form onSubmit={submit} className="space-y-4">
        <TextField
          id="new-display-name"
          label="שם מלא"
          autoComplete="name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          required
        />
        <TextField
          id="new-username"
          label="שם משתמש"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          dir="ltr"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
        <PasswordField
          id="new-password"
          label={`סיסמה (לפחות ${MIN_PASSWORD_LENGTH} תווים)`}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <PasswordField
          id="new-password-confirm"
          label="אימות סיסמה"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
        />
        <ErrorText message={error} />
        <PrimaryButton type="submit" loading={loading}>
          יצירת משתמש
        </PrimaryButton>
      </form>
    </section>
  );
}
