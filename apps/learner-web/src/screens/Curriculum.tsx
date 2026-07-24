import { useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@mcat/ui-web';
import {
  CURRICULUM_PHASES,
  type CurriculumLesson,
  type CurriculumModule,
  type CurriculumPhase,
} from '../data/curriculum-v3.generated';
import { useStartVectorLesson, useVectorLessonStatus } from '../app/queries';

/**
 * Curriculum — a calm map of the whole V3 path with one authorized launch.
 *
 * It renders straight from the checked-in learner-safe manifest
 * (`curriculum-v3.generated`): five ordered phases, their modules, the lessons
 * inside each module, and the knowledge components each lesson will teach.
 * V3-LES-130923 alone adds a server-authoritative Start/Continue seam; every
 * other unavailable lesson remains visibly disabled. Numbering is shown because
 * teaching order is real, not decorative. Every module uses the same disclosure,
 * including zero-lesson integration/revisit modules.
 */

const CARS_LANE = 'CARS_PARALLEL';
const CARS_MARKER = 'CARS · parallel practice';
const PANEL_ID = 'mc-curriculum-panel';
const TARGET_LESSON_ID = 'V3-LES-130923';

const tabId = (phaseId: string): string => `mc-curriculum-tab-${phaseId}`;
const firstModuleId = (phase: CurriculumPhase): string => phase.modules[0]?.id ?? '';

function phaseMeta(phase: CurriculumPhase): string {
  const moduleCount = phase.modules.length;
  if (phase.firstDeliveryLessonCount === 0) {
    const revisits = phase.modules.reduce((sum, module) => sum + module.revisitCount, 0);
    return `No new lessons · ${revisits} revisits across ${moduleCount} modules`;
  }
  const lessonWord = phase.firstDeliveryLessonCount === 1 ? 'lesson' : 'lessons';
  return `${phase.firstDeliveryLessonCount} ${lessonWord} · ${moduleCount} modules`;
}

function moduleCountLabel(module: CurriculumModule): string {
  if (module.lessons.length > 0) {
    return `${module.lessons.length} ${module.lessons.length === 1 ? 'lesson' : 'lessons'}`;
  }
  return module.revisitCount > 0 ? `${module.revisitCount} revisits` : 'No new lessons';
}

function moduleNote(module: CurriculumModule): string {
  return module.revisitCount > 0
    ? `Revisits ${module.revisitCount} earlier lessons for cumulative review — no new lesson is introduced here.`
    : 'An integration point that connects ideas from earlier modules — no new lesson is introduced here.';
}

export function Curriculum() {
  const phaseCount = CURRICULUM_PHASES.length;
  const [activeIndex, setActiveIndex] = useState(0);
  const activePhase = CURRICULUM_PHASES[activeIndex] ?? CURRICULUM_PHASES[0];
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [openModuleIds, setOpenModuleIds] = useState<ReadonlySet<string>>(
    () => new Set([firstModuleId(activePhase)]),
  );

  const selectPhase = (index: number): void => {
    const phase = CURRICULUM_PHASES[index];
    if (!phase) return;
    tabRefs.current[index]?.focus();
    if (index === activeIndex) return;
    setActiveIndex(index);
    // A fresh phase opens with its first module expanded; the learner keeps
    // full control to close it or open others.
    setOpenModuleIds(new Set([firstModuleId(phase)]));
  };

  // Automatic-activation tablist: selection follows focus (ARIA APG pattern).
  // Arrows wrap around the ends; Home/End jump to the first/last phase.
  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    switch (event.key) {
      case 'ArrowRight':
        event.preventDefault();
        selectPhase((activeIndex + 1) % phaseCount);
        break;
      case 'ArrowLeft':
        event.preventDefault();
        selectPhase((activeIndex - 1 + phaseCount) % phaseCount);
        break;
      case 'Home':
        event.preventDefault();
        selectPhase(0);
        break;
      case 'End':
        event.preventDefault();
        selectPhase(phaseCount - 1);
        break;
      default:
        break;
    }
  };

  const toggleModule = (id: string): void => {
    setOpenModuleIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="mc-curriculum">
      <header className="mc-curriculum__head">
        <h1 className="mc-h1">Curriculum</h1>
        <p className="mc-muted">
          The full path, in teaching order. Browse each phase to see the modules and lessons it
          covers.
        </p>
      </header>

      <div className="mc-curriculum__path">
        <div
          className="mc-curriculum__steps"
          role="tablist"
          aria-label="Curriculum phases"
          aria-orientation="horizontal"
        >
          {CURRICULUM_PHASES.map((phase, index) => {
            const selected = index === activeIndex;
            return (
              <button
                key={phase.id}
                ref={(element) => {
                  tabRefs.current[index] = element;
                }}
                type="button"
                role="tab"
                id={tabId(phase.id)}
                aria-selected={selected}
                aria-controls={PANEL_ID}
                tabIndex={selected ? 0 : -1}
                className={`mc-curriculum__step${selected ? ' mc-curriculum__step--active' : ''}`}
                onClick={() => selectPhase(index)}
                onKeyDown={onTabKeyDown}
              >
                <span className="mc-curriculum__step-node">
                  <span className="mc-curriculum__step-num">{phase.order}</span>
                </span>
                <span className="mc-curriculum__step-label">{phase.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <section
        id={PANEL_ID}
        role="tabpanel"
        aria-labelledby={tabId(activePhase.id)}
        className="mc-curriculum__panel"
      >
        <header className="mc-curriculum__phase">
          <p className="mc-curriculum__phase-step">
            Phase {activePhase.order} of {phaseCount}
          </p>
          <h2 className="mc-curriculum__phase-title">{activePhase.label}</h2>
          <p className="mc-muted mc-curriculum__phase-sub">{activePhase.title}</p>
          <p className="mc-curriculum__phase-meta">{phaseMeta(activePhase)}</p>
        </header>

        <div className="mc-curriculum__modules">
          {activePhase.modules.map((module) => (
            <ModuleSection
              key={module.id}
              module={module}
              open={openModuleIds.has(module.id)}
              onToggle={toggleModule}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function ModuleSection({
  module,
  open,
  onToggle,
}: {
  module: CurriculumModule;
  open: boolean;
  onToggle: (id: string) => void;
}) {
  const isCars = module.lane === CARS_LANE;
  const hasLessons = module.lessons.length > 0;
  const regionId = `mc-curriculum-region-${module.id}`;
  const headingId = `mc-curriculum-modhead-${module.id}`;

  return (
    <section className="mc-curriculum__module">
      <h3 className="mc-curriculum__module-h">
        <button
          type="button"
          id={headingId}
          className="mc-curriculum__module-toggle"
          aria-expanded={open}
          aria-controls={regionId}
          onClick={() => onToggle(module.id)}
        >
          <span className="mc-curriculum__module-titles">
            <span className="mc-curriculum__module-title">{module.title}</span>
            <span className="mc-curriculum__module-count">{moduleCountLabel(module)}</span>
          </span>
          {isCars ? <span className="mc-curriculum__lane">{CARS_MARKER}</span> : null}
          <span className="mc-curriculum__chev" aria-hidden="true" />
        </button>
      </h3>
      <div
        id={regionId}
        className="mc-curriculum__region"
        role="group"
        aria-labelledby={headingId}
        hidden={!open}
      >
        {hasLessons ? (
          <ol className="mc-curriculum__lessons">
            {module.lessons.map((lesson) => (
              <li key={lesson.id}>
                <LessonCard lesson={lesson} />
              </li>
            ))}
          </ol>
        ) : (
          <p className="mc-curriculum__note">{moduleNote(module)}</p>
        )}
      </div>
    </section>
  );
}

function LessonCard({ lesson }: { lesson: CurriculumLesson }) {
  const ordinal = String(lesson.position).padStart(3, '0');
  const kcCount = lesson.kcs.length;
  const titleId = `mc-curriculum-lesson-${lesson.id}`;
  const isTarget = lesson.id === TARGET_LESSON_ID;
  return (
    <article className="mc-curriculum__lesson" aria-labelledby={titleId}>
      <div className="mc-curriculum__lesson-main">
        <span className="mc-curriculum__ordinal" aria-hidden="true">
          {ordinal}
        </span>
        <div className="mc-curriculum__lesson-body">
          <h4 id={titleId} className="mc-curriculum__lesson-title">
            <span className="mc-visually-hidden">Lesson {lesson.position}: </span>
            {lesson.shortTitle}
          </h4>
          <details className="mc-curriculum__kc">
            <summary className="mc-curriculum__kc-summary">
              <span className="mc-curriculum__kc-label">What you'll learn ({kcCount})</span>
              <span className="mc-curriculum__kc-chev" aria-hidden="true" />
            </summary>
            <ol className="mc-curriculum__kc-list">
              {lesson.kcs.map((kc) => (
                <li key={kc.id} className="mc-curriculum__kc-item">
                  {kc.label}
                </li>
              ))}
            </ol>
          </details>
        </div>
      </div>
      <div className="mc-curriculum__lesson-foot">
        {isTarget ? (
          <TargetLessonAction lesson={lesson} />
        ) : (
          <UnavailableLessonAction lesson={lesson} />
        )}
      </div>
    </article>
  );
}

function UnavailableLessonAction({ lesson }: { lesson: CurriculumLesson }) {
  const soonId = `mc-curriculum-soon-${lesson.id}`;
  return (
    <>
      <span className="mc-curriculum__soon" id={soonId}>
        Coming soon
      </span>
      <Button
        variant="secondary"
        size="lg"
        disabled
        aria-label={`Start ${lesson.shortTitle}`}
        aria-describedby={soonId}
      >
        Start
      </Button>
    </>
  );
}

function TargetLessonAction({ lesson }: { lesson: CurriculumLesson }) {
  const navigate = useNavigate();
  const status = useVectorLessonStatus();
  const startLesson = useStartVectorLesson();
  const statusId = `mc-curriculum-status-${lesson.id}`;

  const label = status.data?.actionLabel ?? 'Unavailable';
  const badge =
    status.data?.availability === 'UNAVAILABLE'
      ? 'Unavailable'
      : status.data?.runState === 'BLOCKED'
        ? 'Needs support'
        : status.data?.runState === 'PAUSED'
          ? 'Paused'
          : status.data?.runState === 'IN_PROGRESS'
            ? 'In progress'
            : status.data?.runState === 'DELIVERY_COMPLETE'
              ? 'Lesson finished'
              : 'Available now';

  const startOrResume = async (): Promise<void> => {
    try {
      const accepted = await startLesson.mutateAsync();
      navigate(accepted.path);
    } catch {
      await status.refetch();
    }
  };

  if (status.isError) {
    return (
      <>
        <span className="mc-curriculum__launch-error" id={statusId} role="alert">
          Couldn&apos;t check this lesson.
        </span>
        <Button variant="secondary" size="lg" onClick={() => void status.refetch()}>
          Try again
        </Button>
      </>
    );
  }

  return (
    <>
      <span className="mc-curriculum__available" id={statusId}>
        {status.isLoading ? 'Checking availability' : badge}
      </span>
      <div className="mc-curriculum__launch">
        {startLesson.isError ? (
          <span className="mc-curriculum__launch-error" role="alert">
            Start wasn&apos;t accepted. Try again.
          </span>
        ) : null}
        <Button
          variant="primary"
          size="lg"
          disabled={
            status.isLoading ||
            startLesson.isPending ||
            status.data?.availability === 'UNAVAILABLE' ||
            status.data?.actionLabel === null
          }
          aria-label={`${label} ${lesson.shortTitle}`}
          aria-describedby={statusId}
          onClick={() => void startOrResume()}
        >
          {startLesson.isPending ? 'Opening…' : label}
        </Button>
      </div>
    </>
  );
}
