import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Course } from '../db/db';
import { useAuth } from '../auth/AuthContext';

interface CourseState {
  /** undefined while loading. */
  courses: Course[] | undefined;
  course: Course | null;
  courseId: string | null;
  setCourseId: (id: string) => void;
}

const CourseContext = createContext<CourseState | null>(null);

const storageKey = (userId: string) => `exam-sim:course:${userId}`;

/** The course everything on screen belongs to; remembered per user on this device. */
export function CourseProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const courses = useLiveQuery(() => db.courses.orderBy('createdAt').toArray());
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    setSelected(user ? localStorage.getItem(storageKey(user.id)) : null);
  }, [user]);

  const setCourseId = useCallback(
    (id: string) => {
      setSelected(id);
      if (user) localStorage.setItem(storageKey(user.id), id);
    },
    [user],
  );

  // Fall back to the first course when nothing (or a deleted course) is selected.
  const course = courses?.find((c) => c.id === selected) ?? courses?.[0] ?? null;

  const value = useMemo(
    () => ({ courses, course, courseId: course?.id ?? null, setCourseId }),
    [courses, course, setCourseId],
  );
  return <CourseContext.Provider value={value}>{children}</CourseContext.Provider>;
}

export function useCourse(): CourseState {
  const ctx = useContext(CourseContext);
  if (!ctx) throw new Error('useCourse must be used inside <CourseProvider>');
  return ctx;
}
