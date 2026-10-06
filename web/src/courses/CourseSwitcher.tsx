import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown, Settings2 } from 'lucide-react';
import { useCourse } from './CourseContext';

/** Shows the current course and switches between courses. `onManage` adds a link to course management. */
export function CourseSwitcher({ onManage, compact }: { onManage?: () => void; compact?: boolean }) {
  const { courses, course, setCourseId } = useCourse();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [open]);

  if (!courses) return null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={`flex min-h-12 w-full items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-start transition hover:border-indigo-300 dark:border-slate-700 dark:bg-slate-800/60 ${compact ? 'py-1' : 'py-2'}`}
      >
        <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: course?.color ?? '#94a3b8' }} />
        <span className="min-w-0 flex-1">
          {!compact && <span className="block text-xs text-slate-500 dark:text-slate-400">קורס</span>}
          <span className="block truncate font-semibold" dir="auto">{course?.name ?? 'אין קורס'}</span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.ul
            role="listbox"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="absolute inset-x-0 top-full z-40 mt-1 max-h-80 min-w-56 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-900"
          >
            {courses.map((c) => (
              <li key={c.id}>
                <button
                  role="option"
                  aria-selected={c.id === course?.id}
                  onClick={() => {
                    setCourseId(c.id);
                    setOpen(false);
                  }}
                  className="flex min-h-12 w-full items-center gap-2 rounded-xl px-3 text-start hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: c.color }} />
                  <span className="min-w-0 flex-1 truncate" dir="auto">{c.name}</span>
                  {c.id === course?.id && <Check className="h-4 w-4 text-indigo-600" />}
                </button>
              </li>
            ))}
            {!courses.length && <li className="px-3 py-3 text-sm text-slate-500">עדיין אין קורסים</li>}
            {onManage && (
              <li className="mt-1 border-t border-slate-100 pt-1 dark:border-slate-800">
                <button
                  onClick={() => {
                    onManage();
                    setOpen(false);
                  }}
                  className="flex min-h-12 w-full items-center gap-2 rounded-xl px-3 text-start font-medium text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-500/10"
                >
                  <Settings2 className="h-4 w-4" /> ניהול קורסים
                </button>
              </li>
            )}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
