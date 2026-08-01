import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@mcat/ui-web';
import type { LessonMasteryView } from '@mcat/contracts';
import {
  CURRICULUM_PHASES,
  type CurriculumLesson,
  type CurriculumModule,
  type CurriculumPhase,
} from '../data/curriculum-v3.generated';
import {
  useMasteryLessons,
  useNormalizedLessonStatus,
  useStartVectorLesson,
  useVectorLessonStatus,
} from '../app/queries';
import { lessonById, type RegisteredLesson } from '../app/lesson-catalog';
import { MasteryRing } from '../components/MasteryRing';

/**
 * Curriculum — a calm map of the whole V3 path with the real catalog launchable.
 *
 * It renders straight from the checked-in learner-safe manifest
 * (`curriculum-v3.generated`): five ordered phases, their modules, the lessons
 * inside each module, and the knowledge components each lesson will teach.
 * WHICH lessons are actually servable is the registration manifest's call
 * (`../app/lesson-catalog`), the app's single source of servability: a registered
 * lesson gets a server-authoritative Start/Continue seam (L1 on its bespoke vector
 * runtime, L2/L3 on the shared normalized engine); every other lesson remains
 * visibly disabled. Numbering is shown because teaching order is real, not
 * decorative. Every module uses the same disclosure, including zero-lesson
 * integration/revisit modules.
 *
 * Each lesson row carries a compact teal mastery ring, joined by lesson id to the
 * real per-lesson readout (`useMasteryLessons` → `GET /v1/progress/lessons`). That
 * readout is a KC-rollup DISPLAY MEAN, not a probability of mastery, so it is
 * labelled "Mastery" and never compared to a threshold. The endpoint returns a row
 * ONLY for lessons that carry practice evidence: a lesson with no row (un-practiced,
 * or a "Coming soon" placeholder) shows a neutral "Not started" ring with no
 * percentage, never a fabricated 0%.
 *
 * Each module header rolls those per-lesson means up into the SECTION'S average
 * mastery (`moduleAverageMasteryPct`), shown in the collapsible header so it is
 * visible while the section is COLLAPSED. It is the mean of `pL` over only the
 * lessons that carry evidence — un-practiced lessons are EXCLUDED from the mean,
 * never counted as 0, so a section that is mostly placeholders is not dragged to
 * near-zero — and a section with no evidence at all shows the same neutral "Not
 * started" ring the lessons use, never a fabricated 0%.
 */

const CARS_LANE = 'CARS_PARALLEL';
const CARS_MARKER = 'CARS · parallel practice';
const PANEL_ID = 'mc-curriculum-panel';

const tabId = (phaseId: string): string => `mc-curriculum-tab-${phaseId}`;

/** lesson_id → its phase index + containing module id, for `?lesson=` deep-links. */
const LESSON_LOCATION: Record<string, { phaseIndex: number; moduleId: string }> = (() => {
  const map: Record<string, { phaseIndex: number; moduleId: string }> = {};
  CURRICULUM_PHASES.forEach((phase, phaseIndex) => {
    for (const mod of phase.modules)
      for (const lesson of mod.lessons) map[lesson.id] = { phaseIndex, moduleId: mod.id };
  });
  return map;
})();
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

/**
 * A module's average mastery: the MEAN of `pL` over its lessons that carry a real
 * mastery row, as a rounded percent. Lessons with no row (un-practiced, or a
 * "Coming soon" placeholder) are EXCLUDED from the mean rather than folded in as
 * 0 — averaging placeholders as zero would drag every mostly-unstarted section to
 * near-zero. Returns null when NO lesson in the module carries a row, so the
 * header shows a neutral "Not started" instead of a fabricated 0%. `pL` is a
 * KC-rollup display mean, so the result is a mastery readout and is never compared
 * to a threshold.
 */
function moduleAverageMasteryPct(
  module: CurriculumModule,
  masteryByLesson: ReadonlyMap<string, LessonMasteryView>,
): number | null {
  let sum = 0;
  let scored = 0;
  for (const lesson of module.lessons) {
    const entry = masteryByLesson.get(lesson.id);
    if (entry === undefined) continue;
    sum += entry.pL;
    scored += 1;
  }
  return scored > 0 ? Math.round((sum / scored) * 100) : null;
}

export function Curriculum() {
  const phaseCount = CURRICULUM_PHASES.length;
  const [activeIndex, setActiveIndex] = useState(0);
  const activePhase = CURRICULUM_PHASES[activeIndex] ?? CURRICULUM_PHASES[0];
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // Real per-lesson mastery, keyed by lesson id. `getMasteryLessons` returns a row
  // only for lessons with practice evidence, so a lesson absent from this map is
  // un-practiced and its ring renders the neutral "Not started" state.
  const masteryLessons = useMasteryLessons();
  const masteryByLesson = useMemo(() => {
    const map = new Map<string, LessonMasteryView>();
    for (const entry of masteryLessons.data ?? []) map.set(entry.lessonId, entry);
    return map;
  }, [masteryLessons.data]);
  const [openModuleIds, setOpenModuleIds] = useState<ReadonlySet<string>>(
    () => new Set([firstModuleId(activePhase)]),
  );

  // Deep-link support: /app/curriculum?lesson=<id> opens that lesson's phase + module
  // and scrolls to it (e.g. from Practice's "Needs the most review").
  const [searchParams] = useSearchParams();
  const targetLessonId = searchParams.get('lesson');
  useEffect(() => {
    if (!targetLessonId) return;
    const loc = LESSON_LOCATION[targetLessonId];
    if (!loc) return;
    setActiveIndex(loc.phaseIndex);
    setOpenModuleIds((previous) => new Set([...previous, loc.moduleId]));
    const timer = setTimeout(() => {
      document
        .getElementById(`mc-curriculum-lesson-${targetLessonId}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 150);
    return () => clearTimeout(timer);
  }, [targetLessonId]);

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
              highlightLessonId={targetLessonId}
              masteryByLesson={masteryByLesson}
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
  highlightLessonId,
  masteryByLesson,
}: {
  module: CurriculumModule;
  open: boolean;
  onToggle: (id: string) => void;
  highlightLessonId?: string | null;
  masteryByLesson: ReadonlyMap<string, LessonMasteryView>;
}) {
  const isCars = module.lane === CARS_LANE;
  const hasLessons = module.lessons.length > 0;
  const regionId = `mc-curriculum-region-${module.id}`;
  const headingId = `mc-curriculum-modhead-${module.id}`;
  // The section's average mastery, surfaced in the header so it reads while
  // collapsed. Only lesson-bearing modules can carry a mean; a zero-lesson
  // integration/revisit module already states "No new lessons" and gets none.
  const avgMasteryPct = moduleAverageMasteryPct(module, masteryByLesson);

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
          {hasLessons ? <ModuleMasteryRing pct={avgMasteryPct} /> : null}
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
                <LessonCard
                  lesson={lesson}
                  highlighted={lesson.id === highlightLessonId}
                  mastery={masteryByLesson.get(lesson.id)}
                />
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

function LessonCard({
  lesson,
  mastery,
  highlighted = false,
}: {
  lesson: CurriculumLesson;
  mastery?: LessonMasteryView;
  highlighted?: boolean;
}) {
  const ordinal = String(lesson.position).padStart(3, '0');
  const kcCount = lesson.kcs.length;
  const titleId = `mc-curriculum-lesson-${lesson.id}`;
  const registered = lessonById(lesson.id);
  return (
    <article
      className={`mc-curriculum__lesson${highlighted ? ' mc-curriculum__lesson--highlight' : ''}`}
      aria-labelledby={titleId}
    >
      <div className="mc-curriculum__lesson-main">
        <span className="mc-curriculum__ordinal" aria-hidden="true">
          {ordinal}
        </span>
        <div className="mc-curriculum__lesson-body">
          <h4 id={titleId} className="mc-curriculum__lesson-title">
            <span className="mc-visually-hidden">Lesson {lesson.position}: </span>
            {lesson.shortTitle}
          </h4>
          {/* Collapsed by default so the row stays slim; the KC count rides the
              accessible name while the visible link stays uncluttered. */}
          <details className="mc-curriculum__kc">
            <summary
              className="mc-curriculum__kc-summary"
              aria-label={`What you'll learn (${kcCount})`}
            >
              <span className="mc-curriculum__kc-label">What you'll learn</span>
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
      <div className="mc-curriculum__lesson-aside">
        <LessonMasteryRing mastery={mastery} />
        <div className="mc-curriculum__lesson-foot">
          {registered === undefined ? (
            <UnavailableLessonAction lesson={lesson} />
          ) : registered.runtime === 'vector' ? (
            <TargetLessonAction lesson={lesson} />
          ) : (
            <CatalogLessonAction lesson={lesson} registered={registered} />
          )}
        </div>
      </div>
    </article>
  );
}

/**
 * The lesson's mastery ring, joined by id to the real KC-rollup readout. A lesson
 * WITH practice evidence shows the teal ring and its rounded percent under a
 * "Mastery" caption (`pL` is a display mean, so it is never compared to a
 * threshold); a lesson with no evidence — un-practiced, or a "Coming soon"
 * placeholder — shows a muted, dashed "Not started" ring carrying no number, so an
 * un-started lesson is never dressed up as a fabricated 0%. The ring itself is
 * decorative (aria-hidden); the value is exposed to assistive tech as text beside
 * it.
 */
function LessonMasteryRing({ mastery }: { mastery?: LessonMasteryView }) {
  if (mastery === undefined) {
    return (
      <div className="mc-curriculum__mastery mc-curriculum__mastery--empty">
        <svg className="mc-ring mc-ring--ghost" viewBox="0 0 100 100" aria-hidden="true">
          <circle className="mc-ring__track mc-ring__track--ghost" cx="50" cy="50" r="42" />
          <circle className="mc-ring__arc mc-ring__arc--ghost" cx="50" cy="50" r="42" />
        </svg>
        <span className="mc-curriculum__mastery-cap">Not started</span>
      </div>
    );
  }
  const pct = Math.round(mastery.pL * 100);
  return (
    <div className="mc-curriculum__mastery">
      <div className="mc-curriculum__ring">
        <MasteryRing pct={pct} />
      </div>
      <span className="mc-curriculum__mastery-cap" aria-hidden="true">
        Mastery
      </span>
      <span className="mc-visually-hidden">{pct}% mastery</span>
    </div>
  );
}

/**
 * The module's average mastery, surfaced in the collapsible header so it stays
 * visible while the section is COLLAPSED. It reuses the shared teal MasteryRing at
 * a compact header size and captions it "avg mastery"; the value is a display mean
 * (`moduleAverageMasteryPct`), so it is never compared to a threshold. When no
 * lesson in the module carries evidence (`pct === null`) it shows the same neutral
 * "Not started" ghost ring the lessons use, carrying no number — never a
 * fabricated 0%. The ring is decorative (aria-hidden); the reading is exposed to
 * assistive tech as text and rides the header button's accessible name.
 */
function ModuleMasteryRing({ pct }: { pct: number | null }) {
  if (pct === null) {
    return (
      <span className="mc-curriculum__modmastery mc-curriculum__modmastery--empty">
        <svg className="mc-ring mc-ring--ghost" viewBox="0 0 100 100" aria-hidden="true">
          <circle className="mc-ring__track mc-ring__track--ghost" cx="50" cy="50" r="42" />
          <circle className="mc-ring__arc mc-ring__arc--ghost" cx="50" cy="50" r="42" />
        </svg>
        <span className="mc-curriculum__modmastery-cap" aria-hidden="true">
          Not started
        </span>
        <span className="mc-visually-hidden">Section not started</span>
      </span>
    );
  }
  return (
    <span className="mc-curriculum__modmastery">
      <span className="mc-curriculum__modmastery-ring" aria-hidden="true">
        <MasteryRing pct={pct} />
      </span>
      <span className="mc-curriculum__modmastery-cap" aria-hidden="true">
        avg mastery
      </span>
      <span className="mc-visually-hidden">Section average mastery {pct}%</span>
    </span>
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
        size="md"
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
        <Button variant="secondary" size="md" onClick={() => void status.refetch()}>
          Try again
        </Button>
      </>
    );
  }

  return (
    <>
      <span className="mc-visually-hidden" id={statusId}>
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
          size="md"
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

/**
 * The launch affordance for a normalized-engine catalog lesson (L2/L3). Like the
 * vector target above it reads the server's honest availability, but WHICH lesson
 * runs is fixed by the manifest route, and the shared player auto-starts/resumes on
 * mount — so this navigates straight to the registered route rather than issuing a
 * bespoke start command. In local dev the synthetic authority reports UNAVAILABLE
 * (as it does for L1), so the button is truthfully disabled until the persisted
 * authority serves the run.
 */
function CatalogLessonAction({
  lesson,
  registered,
}: {
  lesson: CurriculumLesson;
  registered: RegisteredLesson;
}) {
  const navigate = useNavigate();
  const status = useNormalizedLessonStatus(registered.slug);
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

  if (status.isError) {
    return (
      <>
        <span className="mc-curriculum__launch-error" id={statusId} role="alert">
          Couldn&apos;t check this lesson.
        </span>
        <Button variant="secondary" size="md" onClick={() => void status.refetch()}>
          Try again
        </Button>
      </>
    );
  }

  return (
    <>
      <span className="mc-visually-hidden" id={statusId}>
        {status.isLoading ? 'Checking availability' : badge}
      </span>
      <div className="mc-curriculum__launch">
        <Button
          variant="primary"
          size="md"
          disabled={
            status.isLoading ||
            status.data?.availability === 'UNAVAILABLE' ||
            status.data?.actionLabel === null
          }
          aria-label={`${label} ${lesson.shortTitle}`}
          aria-describedby={statusId}
          onClick={() => navigate(registered.routePath)}
        >
          {label}
        </Button>
      </div>
    </>
  );
}
