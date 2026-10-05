import { forwardRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes } from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

const inputClass =
  'min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base outline-none transition ' +
  'focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/20 ' +
  'dark:border-slate-700 dark:bg-slate-900 dark:focus:border-indigo-400';

export const TextField = forwardRef<HTMLInputElement, FieldProps>(({ label, id, ...rest }, ref) => (
  <label htmlFor={id} className="block space-y-1.5">
    <span className="text-sm font-medium text-slate-600 dark:text-slate-300">{label}</span>
    <input ref={ref} id={id} className={inputClass} {...rest} />
  </label>
));

export const PasswordField = forwardRef<HTMLInputElement, FieldProps>(({ label, id, ...rest }, ref) => {
  const [visible, setVisible] = useState(false);
  return (
    <label htmlFor={id} className="block space-y-1.5">
      <span className="text-sm font-medium text-slate-600 dark:text-slate-300">{label}</span>
      <div className="relative">
        <input ref={ref} id={id} type={visible ? 'text' : 'password'} className={`${inputClass} pe-12`} {...rest} />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute inset-y-0 end-0 flex w-12 items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          aria-label={visible ? 'הסתר סיסמה' : 'הצג סיסמה'}
        >
          {visible ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
        </button>
      </div>
    </label>
  );
});

export function PrimaryButton({ children, loading, disabled, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={loading || disabled}
      className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 text-base font-semibold text-white shadow-lg shadow-indigo-600/25 transition hover:bg-indigo-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {loading && <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
      {children}
    </button>
  );
}

export function ErrorText({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
      {message}
    </p>
  );
}
