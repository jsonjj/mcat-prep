import { Outlet } from 'react-router-dom';
import { SkipLink } from '@mcat/ui-web';

/**
 * Distraction-free layout for active lessons. Access decisions live above this
 * shell in AppAccessGate; lesson-local screens own pause, skip, and terminal exits.
 */
export function FocusedLessonShell() {
  return (
    <div className="mc-focused-lesson-shell">
      <SkipLink targetId="focused-lesson-main" />
      <header className="mc-focused-lesson-shell__header">
        <div className="mc-brand">
          <span className="mc-brand__mark" aria-hidden="true" />
          <span className="mc-brand__name">MCAT Mastery</span>
          <span className="mc-focused-lesson-shell__context">Lesson</span>
        </div>
      </header>
      <main id="focused-lesson-main" className="mc-focused-lesson-shell__main" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  );
}
