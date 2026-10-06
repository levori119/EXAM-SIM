import { GraduationCap } from 'lucide-react';
import { EmptyState } from '../../../components/PageHeader';
import { Button } from '../../../components/fields';

/** Shown on course-scoped pages until the first course exists. */
export function NoCourse() {
  return (
    <EmptyState icon={<GraduationCap className="h-10 w-10" />} title="עדיין אין קורסים">
      <p className="mb-4">כל שאלון, מבחן וחומר לימוד שייך לקורס. צרו קורס ראשון כדי להתחיל.</p>
      <Button variant="primary" onClick={() => (location.hash = 'courses')}>
        מעבר לניהול קורסים
      </Button>
    </EmptyState>
  );
}
