import type { ButtonHTMLAttributes } from 'react';

export function IconButton({
  label,
  danger,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; danger?: boolean }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      {...rest}
      className={`flex h-12 w-12 items-center justify-center rounded-xl text-slate-500 transition disabled:pointer-events-none disabled:opacity-30 dark:text-slate-400 ${
        danger ? 'hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10' : 'hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-100'
      }`}
    >
      {children}
    </button>
  );
}
