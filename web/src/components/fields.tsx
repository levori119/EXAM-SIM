import {
  forwardRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

export const inputClass =
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

export function TextAreaField({ label, id, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
  return (
    <label htmlFor={id} className="block space-y-1.5">
      <span className="text-sm font-medium text-slate-600 dark:text-slate-300">{label}</span>
      <textarea id={id} rows={3} className={`${inputClass} py-3`} {...rest} />
    </label>
  );
}

export function SelectField({
  label,
  id,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  return (
    <label htmlFor={id} className="block space-y-1.5">
      <span className="text-sm font-medium text-slate-600 dark:text-slate-300">{label}</span>
      <select id={id} className={inputClass} {...rest}>
        {children}
      </select>
    </label>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: string;
}) {
  return (
    <label className="flex min-h-12 cursor-pointer items-center justify-between gap-4">
      <span>
        <span className="block font-medium">{label}</span>
        {hint && <span className="block text-xs text-slate-500 dark:text-slate-400">{hint}</span>}
      </span>
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="relative h-7 w-12 shrink-0 rounded-full bg-slate-300 transition after:absolute after:top-1 after:start-1 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:bg-indigo-600 peer-checked:after:translate-x-[-1.25rem] peer-focus-visible:ring-4 peer-focus-visible:ring-indigo-500/30 dark:bg-slate-700" />
    </label>
  );
}

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

const variantClass: Record<Variant, string> = {
  primary: 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-sm',
  secondary:
    'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800',
  danger: 'bg-red-600 text-white hover:bg-red-500',
  ghost: 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
};

export function Button({
  variant = 'secondary',
  loading,
  disabled,
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button
      type="button"
      {...rest}
      disabled={loading || disabled}
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${variantClass[variant]} ${className}`}
    >
      {loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current/30 border-t-current" />}
      {children}
    </button>
  );
}
