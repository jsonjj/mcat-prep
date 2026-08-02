import { useEffect, useMemo, useRef, type ReactNode, type Ref } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@mcat/ui-web';
import {
  ATLAS_LESSON_CLUSTER,
  CLUSTER_INFO,
  SKILL_CLUSTERS,
  type CarsReadinessLabel,
  type CarsReadinessView,
  type LessonMasteryView,
  type MasteryMapEntry,
  type Section,
  type SkillCluster,
} from '@mcat/contracts';
import {
  CURRICULUM_PHASES,
  CURRICULUM_STATS,
  type CurriculumLesson,
  type CurriculumModule,
  type CurriculumPhase,
} from '../data/curriculum-v3.generated';
import {
  useCarsReadiness,
  useMasteryLessons,
  useMasteryMap,
  useNormalizedLessonStatus,
  useStartVectorLesson,
  useVectorLessonStatus,
} from '../app/queries';
import { lessonById, type RegisteredLesson } from '../app/lesson-catalog';
import { HIGH_MASTERY_PCT, MasteryRing } from '../components/MasteryRing';

/**
 * Curriculum — a zoomable, self-similar map of the whole V3 path, browsable through
 * TWO lenses over the SAME lessons and KCs:
 *
 *   - By Phase   (default): Path → Phase → Module → Lesson → KC, teaching order.
 *   - By Subject:           Subject → Section → Cluster → Lesson → KC, taxonomy order.
 *
 * Every screen is the SAME shape, scoped one level deeper. A breadcrumb + "Zoom
 * out" walk back up; a responsive two-up grid of CHILD cards walks down. Each card
 * carries a rolled-up teal mastery ring (the KC-rollup DISPLAY MEAN, `pL`, never
 * compared to a threshold), a small count, and a MINI HEAT-STRIP previewing the
 * level below it. Drill state lives in the URL so a view is shareable and
 * back-button friendly:
 *   - phase lens: `?phase=` / `?module=` / `?lesson=` (and the bare `?lesson=`
 *     deep-link Practice sends for "needs the most review", resolved through the
 *     reverse index to that lesson's detail);
 *   - subject lens: `?lens=subject` + `?section=` / `?cluster=` / `?lesson=`.
 * The lens toggle switches between the two top levels and is reflected in the URL.
 *
 * The colour language is CAPABILITY end to end above the deepest level, so a
 * card's ring and the tiles previewing its children can never contradict:
 *   - The teal RING shows capability as a rounded percent (`pL`, the arithmetic
 *     mean of a node's evidenced lessons). A node with no evidenced lesson shows
 *     a neutral "Not started" ghost ring carrying no number — never a fabricated
 *     0% — because un-practiced lessons are EXCLUDED from the mean rather than
 *     folded in as zero. Phase / module / section / cluster rollups all compute
 *     this the same way (`lessonMeanPct`).
 *   - The MINI HEAT-STRIP colours each tile by the SAME capability the child's
 *     ring shows (`capabilityBand`): one tile per child (phase→modules,
 *     module→lessons, section→clusters, cluster→lessons), green when the child is
 *     on track, amber while in progress, grey when it has no evidence yet. The
 *     green/amber cut is the ring's own `HIGH_MASTERY_PCT`, so the tiles and the
 *     rings agree by construction — a display band only, never a threshold verdict
 *     and never a claim.
 *   - Only the DEEPEST level speaks evidence FRESHNESS from the warrant
 *     (`useMasteryMap`, `refreshNeeded`): the per-skill KC chips (Fresh / Due for
 *     review / Not started) and the lesson card's per-KC skills strip that
 *     previews them. Per-KC capability is not exposed, so that actionable
 *     per-skill readout stays the honest signal there.
 *
 * CARS is the deliberate exception. CARS capability is tracked as reading
 * READINESS (an IRT ability, `useCarsReadiness`), not per-KC BKT, so its lessons
 * carry no `pL`. Rather than fabricate a 0% mastery ring for the CARS SECTION, its
 * ring surfaces that readiness — a teal arc filled to the overall readiness with a
 * qualitative word (Building / Approaching / On-track), never a scaled number.
 * Per-cluster readiness has no source (the three sub-skills don't map to CA1/CA2),
 * so CARS clusters honestly show the neutral "Not started" ghost ring.
 *
 * WHICH lessons are actually servable is the registration manifest's call
 * (`../app/lesson-catalog`): a registered lesson gets a server-authoritative
 * Start/Continue seam (L1 on its bespoke vector runtime, L2/L3 on the shared
 * normalized engine); every other lesson stays visibly disabled ("Coming soon").
 * Numbering is shown because teaching order is real, not decorative.
 */

const CARS_LANE = 'CARS_PARALLEL';
const CARS_MARKER = 'CARS · parallel practice';
const CURRICULUM_PATH = '/app/curriculum';

/** Learner-facing section names (both lenses). */
const SECTION_LABEL: Readonly<Record<Section, string>> = {
  cp: 'Chem/Phys',
  cars: 'CARS',
  bb: 'Bio/Biochem',
  ps: 'Psych/Soc',
};

/** L1 subject order the learner sees, per the product brief. */
const SECTION_ORDER: readonly Section[] = ['bb', 'cp', 'ps', 'cars'];

/** The qualitative CARS readiness word (mirrors the Progress gauge; never a score). */
const READINESS_WORD: Readonly<Record<CarsReadinessLabel, string>> = {
  building: 'Building',
  approaching: 'Approaching',
  on_track: 'On-track',
};

const isSection = (value: string): value is Section =>
  value === 'cp' || value === 'cars' || value === 'bb' || value === 'ps';
const isSkillCluster = (value: string): value is SkillCluster =>
  (SKILL_CLUSTERS as readonly string[]).includes(value);

/**
 * Reverse indices so a URL param resolves straight to its node and ancestors,
 * plus the flat lesson list that backs the overall (path-level) rollup. Built in
 * one pass. `LESSON_LOCATION` keeps the `?lesson=` deep-link (Practice →
 * Curriculum) working: the id resolves to its phase + module so the whole
 * breadcrumb trail is derivable from the lesson alone.
 */
const ALL_LESSONS: CurriculumLesson[] = [];
const PHASE_BY_ID: Record<string, CurriculumPhase> = {};
const MODULE_LOCATION: Record<string, { phase: CurriculumPhase; module: CurriculumModule }> = {};
const LESSON_LOCATION: Record<
  string,
  { phase: CurriculumPhase; module: CurriculumModule; lesson: CurriculumLesson }
> = {};
for (const phase of CURRICULUM_PHASES) {
  PHASE_BY_ID[phase.id] = phase;
  for (const module of phase.modules) {
    MODULE_LOCATION[module.id] = { phase, module };
    for (const lesson of module.lessons) {
      LESSON_LOCATION[lesson.id] = { phase, module, lesson };
      ALL_LESSONS.push(lesson);
    }
  }
}

/**
 * The SAME lessons, re-indexed by the subject taxonomy for the By Subject lens.
 * The cluster of a lesson is the checked-in `ATLAS_LESSON_CLUSTER` (a pure
 * contracts map, baked from the content package's canonical lesson→cluster
 * binding — this browser screen never imports server content), and each cluster's
 * section is `CLUSTER_INFO`. Lessons keep teaching order within a cluster because
 * `ALL_LESSONS` is already in that order. A cluster with no first-delivery lesson
 * (e.g. PS1) simply never appears, so a section's cluster list and counts are
 * exactly what the curriculum contains.
 */
const CLUSTER_LESSONS: Partial<Record<SkillCluster, CurriculumLesson[]>> = {};
const SECTION_LESSONS: Record<Section, CurriculumLesson[]> = { cp: [], cars: [], bb: [], ps: [] };
for (const lesson of ALL_LESSONS) {
  const cluster = ATLAS_LESSON_CLUSTER[lesson.id];
  if (cluster === undefined) continue;
  (CLUSTER_LESSONS[cluster] ??= []).push(lesson);
  SECTION_LESSONS[CLUSTER_INFO[cluster].section].push(lesson);
}
/** Clusters that actually carry lessons, per section, in canonical schema order. */
const SECTION_CLUSTERS: Record<Section, SkillCluster[]> = { cp: [], cars: [], bb: [], ps: [] };
for (const cluster of SKILL_CLUSTERS) {
  if ((CLUSTER_LESSONS[cluster]?.length ?? 0) === 0) continue;
  SECTION_CLUSTERS[CLUSTER_INFO[cluster].section].push(cluster);
}

/** Build the shareable `/app/curriculum?…` href for a level of either lens. */
function hrefFor(scope: {
  lens?: 'subject';
  phase?: string;
  module?: string;
  lesson?: string;
  section?: Section;
  cluster?: SkillCluster;
}): string {
  const search = new URLSearchParams();
  if (scope.lens === 'subject') search.set('lens', 'subject');
  if (scope.section) search.set('section', scope.section);
  if (scope.cluster) search.set('cluster', scope.cluster);
  if (scope.phase) search.set('phase', scope.phase);
  if (scope.module) search.set('module', scope.module);
  if (scope.lesson) search.set('lesson', scope.lesson);
  const query = search.toString();
  return query ? `${CURRICULUM_PATH}?${query}` : CURRICULUM_PATH;
}

function phaseMeta(phase: CurriculumPhase): string {
  const moduleCount = phase.modules.length;
  if (phase.firstDeliveryLessonCount === 0) {
    const revisits = phase.modules.reduce((sum, module) => sum + module.revisitCount, 0);
    return `No new lessons · ${revisits} revisits`;
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

function sectionCountLabel(section: Section): string {
  const clusters = SECTION_CLUSTERS[section].length;
  const lessons = SECTION_LESSONS[section].length;
  return `${clusters} ${clusters === 1 ? 'cluster' : 'clusters'} · ${lessons} ${lessons === 1 ? 'lesson' : 'lessons'}`;
}

function clusterCountLabel(cluster: SkillCluster): string {
  const lessons = CLUSTER_LESSONS[cluster]?.length ?? 0;
  return `${lessons} ${lessons === 1 ? 'lesson' : 'lessons'}`;
}

// ---- Rollups -------------------------------------------------------------
// Capability (the teal ring AND the heat-strip tiles) comes from the per-lesson
// mean of `pL`, banded for display by `capabilityBand`. Freshness (the deepest
// per-skill KC chips + the lesson card's per-KC skills strip) comes from the
// evidence warrant. They are separate questions, computed by separate functions
// and never merged.

/**
 * A node's average mastery: the MEAN of `pL` over the lessons that carry a real
 * mastery row, as a rounded percent. Lessons with no row (un-practiced, or a
 * "Coming soon" placeholder) are EXCLUDED from the mean rather than folded in as
 * 0 — averaging placeholders as zero would drag every mostly-unstarted node to
 * near-zero. Returns null when NO lesson carries a row, so the ring shows a
 * neutral "Not started" instead of a fabricated 0%. `pL` is a KC-rollup display
 * mean, so the result is a readout and is never compared to a threshold.
 */
function lessonMeanPct(
  lessons: readonly CurriculumLesson[],
  masteryByLesson: ReadonlyMap<string, LessonMasteryView>,
): number | null {
  let sum = 0;
  let scored = 0;
  for (const lesson of lessons) {
    const entry = masteryByLesson.get(lesson.id);
    if (entry === undefined) continue;
    sum += entry.pL;
    scored += 1;
  }
  return scored > 0 ? Math.round((sum / scored) * 100) : null;
}

const moduleAverageMasteryPct = (
  module: CurriculumModule,
  masteryByLesson: ReadonlyMap<string, LessonMasteryView>,
): number | null => lessonMeanPct(module.lessons, masteryByLesson);

const phaseAverageMasteryPct = (
  phase: CurriculumPhase,
  masteryByLesson: ReadonlyMap<string, LessonMasteryView>,
): number | null =>
  lessonMeanPct(
    phase.modules.flatMap((module) => module.lessons),
    masteryByLesson,
  );

const clusterAverageMasteryPct = (
  cluster: SkillCluster,
  masteryByLesson: ReadonlyMap<string, LessonMasteryView>,
): number | null => lessonMeanPct(CLUSTER_LESSONS[cluster] ?? [], masteryByLesson);

/**
 * A lesson's capability percent — the SAME value its ring shows: the rounded `pL`
 * display mean, or null when the lesson carries no evidence row (un-practiced, or
 * a "Coming soon" placeholder). Null so the tile/ring reads a neutral "Not
 * started" rather than a fabricated 0%.
 */
const lessonPct = (
  lesson: CurriculumLesson,
  masteryByLesson: ReadonlyMap<string, LessonMasteryView>,
): number | null => {
  const entry = masteryByLesson.get(lesson.id);
  return entry === undefined ? null : Math.round(entry.pL * 100);
};

/**
 * A cluster's capability percent for BOTH its ring and the section heat-strip tile
 * that previews it, so the two never disagree. CARS clusters have no per-cluster
 * capability source (reading ability is IRT readiness, not a per-KC mean), so they
 * stay null — a neutral "Not started" tile/ring, never a fabricated number.
 */
const clusterCapabilityPct = (
  cluster: SkillCluster,
  masteryByLesson: ReadonlyMap<string, LessonMasteryView>,
): number | null =>
  CLUSTER_INFO[cluster].section === 'cars'
    ? null
    : clusterAverageMasteryPct(cluster, masteryByLesson);

/**
 * The presentation band a display value falls in — the ONE place green/amber/grey
 * is decided for both the heat-strip tiles and (via the ring) the rings, so a
 * card's ring and its children's tiles agree BY CONSTRUCTION. The green/amber cut
 * is the ring's own `HIGH_MASTERY_PCT` (imported, not re-declared). This is a
 * DISPLAY band only: it is never compared to the capability cut and makes no
 * mastery claim, and null (no evidence) is the grey "Not started" tile, never a
 * fabricated 0%. CARS carries no `pL`, so its tiles pass null here and stay grey.
 */
type DisplayBand = 'ontrack' | 'inprogress' | 'none';

function capabilityBand(pct: number | null): DisplayBand {
  if (pct === null) return 'none';
  return pct >= HIGH_MASTERY_PCT ? 'ontrack' : 'inprogress';
}

/** Grey until something starts; green only when EVERY child is on track; amber in between. */
function rollupBand(children: readonly DisplayBand[]): DisplayBand {
  if (children.length === 0 || children.every((child) => child === 'none')) return 'none';
  if (children.every((child) => child === 'ontrack')) return 'ontrack';
  return 'inprogress';
}

/** The legend wording for a display band (the same three words the legend shows). */
function bandLabel(band: DisplayBand): string {
  return band === 'ontrack' ? 'On track' : band === 'inprogress' ? 'In progress' : 'Not started';
}

/**
 * The status of one KC. Prefer the real per-KC evidence warrant (`useMasteryMap`,
 * keyed by KC id) so the real engine keeps genuine per-skill detail: "due" when a
 * rep is needed (`refreshNeeded`), "fresh" when it carries eligible supporting
 * evidence. When the warrant is SILENT for this KC — no eligible evidence yet, or
 * the simulator's map simply doesn't cover it — fall back to the containing
 * lesson's own DISPLAY BAND, the same one its capability ring shows
 * (`capabilityBand`), so a lesson whose ring reads on-track never shows its own
 * skills as "not started" beneath it. This is a display band only, never a `pL`
 * threshold and never a claim.
 */
type Freshness = 'fresh' | 'due' | 'none';

function kcStatus(
  kcId: string,
  pct: number | null,
  warrantByKc: ReadonlyMap<string, MasteryMapEntry>,
): Freshness {
  const warrant = warrantByKc.get(kcId);
  if (warrant?.refreshNeeded) return 'due';
  if (warrant && warrant.supportingEvidenceIds.length > 0) return 'fresh';
  return capabilityBand(pct) === 'ontrack' ? 'fresh' : 'none';
}

/**
 * Warrant freshness expressed in the SAME display band as capability, so the
 * lesson card's per-KC skills strip can share the `HeatStrip` tile vocabulary. It
 * is the only place freshness feeds a tile — the deepest, per-skill level, where
 * per-KC capability is not exposed and the warrant is the honest signal.
 */
const freshnessBand = (freshness: Freshness): DisplayBand =>
  freshness === 'fresh' ? 'ontrack' : freshness === 'due' ? 'inprogress' : 'none';

function masteryPhrase(pct: number | null): string {
  return pct === null ? 'Not started' : `Mastery ${pct} percent`;
}

function carsReadinessPhrase(readiness: CarsReadinessView | undefined): string {
  return readiness === undefined
    ? 'Not started'
    : `Reading readiness ${READINESS_WORD[readiness.label]}`;
}

// ---- Drill state ---------------------------------------------------------

type Located =
  | { lens: 'phase'; level: 'path' }
  | { lens: 'phase'; level: 'phase'; phase: CurriculumPhase }
  | { lens: 'phase'; level: 'module'; phase: CurriculumPhase; module: CurriculumModule }
  | {
      lens: 'phase';
      level: 'lesson';
      phase: CurriculumPhase;
      module: CurriculumModule;
      lesson: CurriculumLesson;
    }
  | { lens: 'subject'; level: 'subjects' }
  | { lens: 'subject'; level: 'section'; section: Section }
  | { lens: 'subject'; level: 'cluster'; section: Section; cluster: SkillCluster }
  | {
      lens: 'subject';
      level: 'lesson';
      section: Section;
      cluster: SkillCluster;
      phase: CurriculumPhase;
      module: CurriculumModule;
      lesson: CurriculumLesson;
    };

type Crumb = { label: string; to?: string };

export function Curriculum() {
  const [searchParams] = useSearchParams();
  const lessonParam = searchParams.get('lesson');
  const moduleParam = searchParams.get('module');
  const phaseParam = searchParams.get('phase');
  const sectionParam = searchParams.get('section');
  const clusterParam = searchParams.get('cluster');
  const lens: 'phase' | 'subject' = searchParams.get('lens') === 'subject' ? 'subject' : 'phase';

  // Real per-lesson mastery (capability) and per-KC warrant (freshness), joined
  // by id below. `useMasteryLessons` returns a row only for lessons with practice
  // evidence, so a lesson absent from the map is un-practiced. CARS reading
  // ability is a separate IRT readout, read here for the By Subject CARS card.
  const masteryLessons = useMasteryLessons();
  const masteryMap = useMasteryMap();
  const carsReadiness = useCarsReadiness();
  const masteryByLesson = useMemo(() => {
    const map = new Map<string, LessonMasteryView>();
    for (const entry of masteryLessons.data ?? []) map.set(entry.lessonId, entry);
    return map;
  }, [masteryLessons.data]);
  const warrantByKc = useMemo(() => {
    const map = new Map<string, MasteryMapEntry>();
    for (const entry of masteryMap.data ?? []) map.set(entry.skillId, entry);
    return map;
  }, [masteryMap.data]);

  const located: Located = useMemo(() => {
    if (lens === 'subject') {
      if (lessonParam) {
        const loc = LESSON_LOCATION[lessonParam];
        const cluster = loc ? ATLAS_LESSON_CLUSTER[loc.lesson.id] : undefined;
        if (loc && cluster) {
          return {
            lens: 'subject',
            level: 'lesson',
            section: CLUSTER_INFO[cluster].section,
            cluster,
            phase: loc.phase,
            module: loc.module,
            lesson: loc.lesson,
          };
        }
      }
      if (
        clusterParam &&
        isSkillCluster(clusterParam) &&
        (CLUSTER_LESSONS[clusterParam]?.length ?? 0) > 0
      ) {
        return {
          lens: 'subject',
          level: 'cluster',
          section: CLUSTER_INFO[clusterParam].section,
          cluster: clusterParam,
        };
      }
      if (sectionParam && isSection(sectionParam)) {
        return { lens: 'subject', level: 'section', section: sectionParam };
      }
      return { lens: 'subject', level: 'subjects' };
    }
    if (lessonParam) {
      const loc = LESSON_LOCATION[lessonParam];
      if (loc)
        return {
          lens: 'phase',
          level: 'lesson',
          phase: loc.phase,
          module: loc.module,
          lesson: loc.lesson,
        };
    }
    if (moduleParam) {
      const loc = MODULE_LOCATION[moduleParam];
      if (loc) return { lens: 'phase', level: 'module', phase: loc.phase, module: loc.module };
    }
    if (phaseParam) {
      const phase = PHASE_BY_ID[phaseParam];
      if (phase) return { lens: 'phase', level: 'phase', phase };
    }
    return { lens: 'phase', level: 'path' };
  }, [lens, lessonParam, moduleParam, phaseParam, sectionParam, clusterParam]);

  // Focus management: on a zoom (level change), move focus to the new node's
  // heading so keyboard/screen-reader users land where the content changed. The
  // first render is skipped so the page never steals focus on load.
  const headingRef = useRef<HTMLHeadingElement>(null);
  const isFirstRender = useRef(true);
  const levelKey = (() => {
    switch (located.level) {
      case 'path':
        return 'path';
      case 'phase':
        return `phase:${located.phase.id}`;
      case 'module':
        return `module:${located.module.id}`;
      case 'subjects':
        return 'subjects';
      case 'section':
        return `section:${located.section}`;
      case 'cluster':
        return `cluster:${located.cluster}`;
      case 'lesson':
        return `lesson:${located.lens}:${located.lesson.id}`;
    }
  })();
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [levelKey]);

  const trail = useMemo<Crumb[]>(() => {
    if (located.lens === 'subject') {
      const root: Crumb = { label: 'Curriculum', to: hrefFor({ lens: 'subject' }) };
      switch (located.level) {
        case 'subjects':
          return [{ label: 'Curriculum' }];
        case 'section':
          return [root, { label: SECTION_LABEL[located.section] }];
        case 'cluster':
          return [
            root,
            {
              label: SECTION_LABEL[located.section],
              to: hrefFor({ lens: 'subject', section: located.section }),
            },
            { label: `${located.cluster} ${CLUSTER_INFO[located.cluster].title}` },
          ];
        case 'lesson':
          return [
            root,
            {
              label: SECTION_LABEL[located.section],
              to: hrefFor({ lens: 'subject', section: located.section }),
            },
            {
              label: `${located.cluster} ${CLUSTER_INFO[located.cluster].title}`,
              to: hrefFor({ lens: 'subject', section: located.section, cluster: located.cluster }),
            },
            { label: located.lesson.shortTitle },
          ];
      }
    }
    const root: Crumb = { label: 'Curriculum', to: hrefFor({}) };
    switch (located.level) {
      case 'path':
        return [{ label: 'Curriculum' }];
      case 'phase':
        return [root, { label: located.phase.label }];
      case 'module':
        return [
          root,
          { label: located.phase.label, to: hrefFor({ phase: located.phase.id }) },
          { label: located.module.title },
        ];
      case 'lesson':
        return [
          root,
          { label: located.phase.label, to: hrefFor({ phase: located.phase.id }) },
          {
            label: located.module.title,
            to: hrefFor({ phase: located.phase.id, module: located.module.id }),
          },
          { label: located.lesson.shortTitle },
        ];
    }
  }, [located]);

  const parentHref: string | null = useMemo(() => {
    switch (located.level) {
      case 'path':
      case 'subjects':
        return null;
      case 'phase':
        return hrefFor({});
      case 'module':
        return hrefFor({ phase: located.phase.id });
      case 'section':
        return hrefFor({ lens: 'subject' });
      case 'cluster':
        return hrefFor({ lens: 'subject', section: located.section });
      case 'lesson':
        return located.lens === 'subject'
          ? hrefFor({ lens: 'subject', section: located.section, cluster: located.cluster })
          : hrefFor({ phase: located.phase.id, module: located.module.id });
    }
  }, [located]);

  const isTopLevel = located.level === 'path' || located.level === 'subjects';

  return (
    <div className="mc-curriculum">
      <header className="mc-curriculum__head">
        <h1 className="mc-h1">Curriculum</h1>
      </header>

      {!isTopLevel ? (
        <div className="mc-curriculum__bar">
          <Breadcrumb trail={trail} />
          {parentHref !== null ? (
            <Link className="mc-curriculum__zoomout" to={parentHref}>
              <span className="mc-curriculum__zoomout-icon" aria-hidden="true" />
              Zoom out
            </Link>
          ) : null}
        </div>
      ) : null}

      {isTopLevel ? <LensToggle lens={lens} /> : null}

      {located.lens === 'phase' ? (
        located.level === 'path' ? (
          <PathLevel headingRef={headingRef} masteryByLesson={masteryByLesson} />
        ) : located.level === 'phase' ? (
          <PhaseLevel
            phase={located.phase}
            headingRef={headingRef}
            masteryByLesson={masteryByLesson}
          />
        ) : located.level === 'module' ? (
          <ModuleLevel
            phase={located.phase}
            module={located.module}
            headingRef={headingRef}
            masteryByLesson={masteryByLesson}
            warrantByKc={warrantByKc}
          />
        ) : (
          <LessonDetail
            phase={located.phase}
            module={located.module}
            lesson={located.lesson}
            lens="phase"
            headingRef={headingRef}
            mastery={masteryByLesson.get(located.lesson.id)}
            warrantByKc={warrantByKc}
          />
        )
      ) : located.level === 'subjects' ? (
        <SubjectsLevel
          headingRef={headingRef}
          masteryByLesson={masteryByLesson}
          carsReadiness={carsReadiness.data}
        />
      ) : located.level === 'section' ? (
        <SectionLevel
          section={located.section}
          headingRef={headingRef}
          masteryByLesson={masteryByLesson}
          carsReadiness={carsReadiness.data}
        />
      ) : located.level === 'cluster' ? (
        <ClusterLevel
          section={located.section}
          cluster={located.cluster}
          headingRef={headingRef}
          masteryByLesson={masteryByLesson}
          warrantByKc={warrantByKc}
        />
      ) : (
        <LessonDetail
          phase={located.phase}
          module={located.module}
          lesson={located.lesson}
          lens="subject"
          headingRef={headingRef}
          mastery={masteryByLesson.get(located.lesson.id)}
          warrantByKc={warrantByKc}
        />
      )}
    </div>
  );
}

// ---- Phase-lens level views ----------------------------------------------

function PathLevel({
  headingRef,
  masteryByLesson,
}: {
  headingRef: Ref<HTMLHeadingElement>;
  masteryByLesson: ReadonlyMap<string, LessonMasteryView>;
}) {
  const overallPct = lessonMeanPct(ALL_LESSONS, masteryByLesson);
  return (
    <section className="mc-curriculum__level" aria-labelledby="mc-curriculum-node-title">
      <NodeHeader
        headingRef={headingRef}
        headingId="mc-curriculum-node-title"
        title="The full path"
        subtitle={`${CURRICULUM_STATS.firstDeliveryLessons} lessons across ${CURRICULUM_STATS.phases} phases, in teaching order`}
        ring={<RingBlock pct={overallPct} caption="Overall" />}
      />
      <Legend />
      <ul className="mc-curriculum__grid">
        {CURRICULUM_PHASES.map((phase) => {
          const pct = phaseAverageMasteryPct(phase, masteryByLesson);
          // One tile per child MODULE, coloured by the module's OWN capability
          // rollup — the same value its ring shows — so the strip previews the
          // level below in the same colour language as the rings.
          const heat = phase.modules.map((module) =>
            capabilityBand(moduleAverageMasteryPct(module, masteryByLesson)),
          );
          const status = rollupBand(heat);
          return (
            <li key={phase.id}>
              <ZoomCard
                to={hrefFor({ phase: phase.id })}
                titleId={`mc-curriculum-phase-${phase.id}`}
                eyebrow={`Phase ${phase.order}`}
                title={phase.label}
                subtitle={phase.title}
                count={phaseMeta(phase)}
                ring={<RingBlock pct={pct} caption="Phase" showCaption={false} />}
                heat={heat}
                heatLabel="Modules"
                ariaLabel={`Open ${phase.label}. ${phaseMeta(phase)}. ${masteryPhrase(pct)}. ${bandLabel(status)}.`}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function PhaseLevel({
  phase,
  headingRef,
  masteryByLesson,
}: {
  phase: CurriculumPhase;
  headingRef: Ref<HTMLHeadingElement>;
  masteryByLesson: ReadonlyMap<string, LessonMasteryView>;
}) {
  const pct = phaseAverageMasteryPct(phase, masteryByLesson);
  return (
    <section className="mc-curriculum__level" aria-labelledby="mc-curriculum-node-title">
      <NodeHeader
        headingRef={headingRef}
        headingId="mc-curriculum-node-title"
        eyebrow={`Phase ${phase.order} of ${CURRICULUM_STATS.phases}`}
        title={phase.label}
        subtitle={phase.title}
        ring={<RingBlock pct={pct} caption="Phase" />}
      />
      <Legend />
      <ul className="mc-curriculum__grid">
        {phase.modules.map((module) =>
          module.lessons.length > 0 ? (
            <li key={module.id}>
              <ModuleCard phase={phase} module={module} masteryByLesson={masteryByLesson} />
            </li>
          ) : (
            <li key={module.id}>
              <ReviewCard module={module} />
            </li>
          ),
        )}
      </ul>
    </section>
  );
}

function ModuleLevel({
  phase,
  module,
  headingRef,
  masteryByLesson,
  warrantByKc,
}: {
  phase: CurriculumPhase;
  module: CurriculumModule;
  headingRef: Ref<HTMLHeadingElement>;
  masteryByLesson: ReadonlyMap<string, LessonMasteryView>;
  warrantByKc: ReadonlyMap<string, MasteryMapEntry>;
}) {
  const pct = moduleAverageMasteryPct(module, masteryByLesson);
  const isCars = module.lane === CARS_LANE;
  return (
    <section className="mc-curriculum__level" aria-labelledby="mc-curriculum-node-title">
      <NodeHeader
        headingRef={headingRef}
        headingId="mc-curriculum-node-title"
        eyebrow={`${phase.label} · Module ${module.order}`}
        title={module.title}
        badge={
          isCars ? (
            <span className="mc-curriculum__badge mc-curriculum__badge--cars">
              <span className="mc-curriculum__badge-book" aria-hidden="true" />
              Parallel practice
              <span className="mc-visually-hidden"> — {CARS_MARKER}</span>
            </span>
          ) : undefined
        }
        ring={<RingBlock pct={pct} caption="Module" />}
      />
      {module.lessons.length > 0 ? (
        <>
          <Legend />
          <ul className="mc-curriculum__grid">
            {module.lessons.map((lesson) => (
              <li key={lesson.id}>
                <LessonCard
                  phase={phase}
                  module={module}
                  lesson={lesson}
                  lens="phase"
                  mastery={masteryByLesson.get(lesson.id)}
                  warrantByKc={warrantByKc}
                />
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mc-curriculum__note">{moduleNote(module)}</p>
      )}
    </section>
  );
}

// ---- Subject-lens level views --------------------------------------------

function SubjectsLevel({
  headingRef,
  masteryByLesson,
  carsReadiness,
}: {
  headingRef: Ref<HTMLHeadingElement>;
  masteryByLesson: ReadonlyMap<string, LessonMasteryView>;
  carsReadiness: CarsReadinessView | undefined;
}) {
  const overallPct = lessonMeanPct(ALL_LESSONS, masteryByLesson);
  return (
    <section className="mc-curriculum__level" aria-labelledby="mc-curriculum-node-title">
      <NodeHeader
        headingRef={headingRef}
        headingId="mc-curriculum-node-title"
        title="By subject"
        subtitle={`${CURRICULUM_STATS.firstDeliveryLessons} lessons grouped by MCAT section and skill cluster`}
        ring={<RingBlock pct={overallPct} caption="Overall" />}
      />
      <Legend />
      <ul className="mc-curriculum__grid">
        {SECTION_ORDER.map((section) => (
          <li key={section}>
            <SectionCard
              section={section}
              masteryByLesson={masteryByLesson}
              carsReadiness={carsReadiness}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function SectionLevel({
  section,
  headingRef,
  masteryByLesson,
  carsReadiness,
}: {
  section: Section;
  headingRef: Ref<HTMLHeadingElement>;
  masteryByLesson: ReadonlyMap<string, LessonMasteryView>;
  carsReadiness: CarsReadinessView | undefined;
}) {
  const isCars = section === 'cars';
  const pct = isCars ? null : lessonMeanPct(SECTION_LESSONS[section], masteryByLesson);
  return (
    <section className="mc-curriculum__level" aria-labelledby="mc-curriculum-node-title">
      <NodeHeader
        headingRef={headingRef}
        headingId="mc-curriculum-node-title"
        eyebrow="Subject"
        title={SECTION_LABEL[section]}
        subtitle={
          isCars
            ? 'Reading ability is tracked as readiness, not per-lesson mastery.'
            : sectionCountLabel(section)
        }
        ring={
          isCars ? (
            <ReadinessRing readiness={carsReadiness} />
          ) : (
            <RingBlock pct={pct} caption="Section" />
          )
        }
      />
      <Legend />
      <ul className="mc-curriculum__grid">
        {SECTION_CLUSTERS[section].map((cluster) => (
          <li key={cluster}>
            <ClusterCard cluster={cluster} masteryByLesson={masteryByLesson} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function ClusterLevel({
  section,
  cluster,
  headingRef,
  masteryByLesson,
  warrantByKc,
}: {
  section: Section;
  cluster: SkillCluster;
  headingRef: Ref<HTMLHeadingElement>;
  masteryByLesson: ReadonlyMap<string, LessonMasteryView>;
  warrantByKc: ReadonlyMap<string, MasteryMapEntry>;
}) {
  const info = CLUSTER_INFO[cluster];
  const lessons = CLUSTER_LESSONS[cluster] ?? [];
  // CARS clusters have no per-cluster capability source, so their ring stays the
  // neutral "Not started" ghost rather than a fabricated mean (`clusterCapabilityPct`).
  const pct = clusterCapabilityPct(cluster, masteryByLesson);
  return (
    <section className="mc-curriculum__level" aria-labelledby="mc-curriculum-node-title">
      <NodeHeader
        headingRef={headingRef}
        headingId="mc-curriculum-node-title"
        eyebrow={`${SECTION_LABEL[section]} · ${cluster}`}
        title={info.title}
        subtitle={info.tested}
        ring={<RingBlock pct={pct} caption="Cluster" />}
      />
      <Legend />
      <ul className="mc-curriculum__grid">
        {lessons.map((lesson) => {
          const loc = LESSON_LOCATION[lesson.id];
          return (
            <li key={lesson.id}>
              <LessonCard
                phase={loc.phase}
                module={loc.module}
                lesson={lesson}
                lens="subject"
                mastery={masteryByLesson.get(lesson.id)}
                warrantByKc={warrantByKc}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ---- Lesson detail (L4, shared by both lenses) ---------------------------

function LessonDetail({
  phase,
  module,
  lesson,
  lens,
  headingRef,
  mastery,
  warrantByKc,
}: {
  phase: CurriculumPhase;
  module: CurriculumModule;
  lesson: CurriculumLesson;
  lens: 'phase' | 'subject';
  headingRef: Ref<HTMLHeadingElement>;
  mastery?: LessonMasteryView;
  warrantByKc: ReadonlyMap<string, MasteryMapEntry>;
}) {
  const pct = mastery === undefined ? null : Math.round(mastery.pL * 100);
  const ordinal = String(lesson.position).padStart(3, '0');
  const cluster: SkillCluster | null = ATLAS_LESSON_CLUSTER[lesson.id] ?? mastery?.cluster ?? null;
  const info = cluster ? CLUSTER_INFO[cluster] : null;
  return (
    <section className="mc-curriculum__level" aria-labelledby="mc-curriculum-node-title">
      <header className="mc-curriculum__node mc-curriculum__detail-head">
        <div className="mc-curriculum__node-titles">
          <p className="mc-curriculum__node-eyebrow">
            Lesson {ordinal} · {phase.label} · {module.title}
          </p>
          <h2
            className="mc-curriculum__node-title"
            id="mc-curriculum-node-title"
            tabIndex={-1}
            ref={headingRef}
          >
            {lesson.shortTitle}
          </h2>
          {info ? (
            <p className="mc-curriculum__cluster">
              <span className="mc-curriculum__cluster-chip">
                {cluster} · {info.title} · {SECTION_LABEL[info.section]}
              </span>
            </p>
          ) : null}
        </div>
        <RingBlock pct={pct} caption="Lesson" />
      </header>

      <div className="mc-curriculum__detail-actions">
        <LaunchAction lesson={lesson} />
      </div>

      <ol className="mc-curriculum__kcs">
        {lesson.kcs.map((kc) => (
          <li key={kc.id} className="mc-curriculum__kcrow">
            <span className="mc-curriculum__kcrow-label">{kc.label}</span>
            <StatusChip freshness={kcStatus(kc.id, pct, warrantByKc)} />
          </li>
        ))}
      </ol>
      <p className="mc-curriculum__kc-caption mc-muted">
        Per-skill status comes from your practice evidence.
        {lens === 'subject' && info ? ` This lesson sits in ${info.title}.` : ''}
      </p>
    </section>
  );
}

// ---- Cards & shared pieces ------------------------------------------------

function ModuleCard({
  phase,
  module,
  masteryByLesson,
}: {
  phase: CurriculumPhase;
  module: CurriculumModule;
  masteryByLesson: ReadonlyMap<string, LessonMasteryView>;
}) {
  const pct = moduleAverageMasteryPct(module, masteryByLesson);
  // One tile per child LESSON, coloured by the lesson's OWN capability (the value
  // its ring shows), so the strip agrees with the rings one level down.
  const heat = module.lessons.map((lesson) => capabilityBand(lessonPct(lesson, masteryByLesson)));
  const status = rollupBand(heat);
  const isCars = module.lane === CARS_LANE;
  const carsAria = isCars ? ` ${CARS_MARKER}.` : '';
  return (
    <ZoomCard
      to={hrefFor({ phase: phase.id, module: module.id })}
      titleId={`mc-curriculum-module-${module.id}`}
      title={module.title}
      count={moduleCountLabel(module)}
      ring={<RingBlock pct={pct} caption="Module" showCaption={false} />}
      heat={heat}
      heatLabel="Lessons"
      accentClass={isCars ? 'mc-curriculum__card--cars' : undefined}
      badge={
        isCars ? (
          <span className="mc-curriculum__badge mc-curriculum__badge--cars">
            <span className="mc-curriculum__badge-book" aria-hidden="true" />
            Parallel practice
          </span>
        ) : undefined
      }
      ariaLabel={`Open ${module.title}. ${moduleCountLabel(module)}. ${masteryPhrase(pct)}. ${bandLabel(status)}.${carsAria}`}
    />
  );
}

function SectionCard({
  section,
  masteryByLesson,
  carsReadiness,
}: {
  section: Section;
  masteryByLesson: ReadonlyMap<string, LessonMasteryView>;
  carsReadiness: CarsReadinessView | undefined;
}) {
  const isCars = section === 'cars';
  // One tile per child CLUSTER, coloured by the cluster's OWN capability rollup
  // (`clusterCapabilityPct`, null → grey for CARS), matching each cluster's ring.
  const heat = SECTION_CLUSTERS[section].map((cluster) =>
    capabilityBand(clusterCapabilityPct(cluster, masteryByLesson)),
  );
  const status = rollupBand(heat);
  const pct = isCars ? null : lessonMeanPct(SECTION_LESSONS[section], masteryByLesson);
  const label = SECTION_LABEL[section];
  const count = sectionCountLabel(section);
  const capability = isCars ? carsReadinessPhrase(carsReadiness) : masteryPhrase(pct);
  return (
    <ZoomCard
      to={hrefFor({ lens: 'subject', section })}
      titleId={`mc-curriculum-section-${section}`}
      title={label}
      count={count}
      ring={
        isCars ? (
          <ReadinessRing readiness={carsReadiness} />
        ) : (
          <RingBlock pct={pct} caption="Section" showCaption={false} />
        )
      }
      heat={heat}
      heatLabel="Clusters"
      accentClass={isCars ? 'mc-curriculum__card--cars' : undefined}
      ariaLabel={`Open ${label}. ${count}. ${capability}. ${bandLabel(status)}.`}
    />
  );
}

function ClusterCard({
  cluster,
  masteryByLesson,
}: {
  cluster: SkillCluster;
  masteryByLesson: ReadonlyMap<string, LessonMasteryView>;
}) {
  const info = CLUSTER_INFO[cluster];
  const lessons = CLUSTER_LESSONS[cluster] ?? [];
  // One tile per child LESSON, coloured by the lesson's OWN capability; CARS
  // lessons carry no `pL`, so those tiles are null → grey, matching the ghost ring.
  const heat = lessons.map((lesson) => capabilityBand(lessonPct(lesson, masteryByLesson)));
  const status = rollupBand(heat);
  const pct = clusterCapabilityPct(cluster, masteryByLesson);
  const count = clusterCountLabel(cluster);
  return (
    <ZoomCard
      to={hrefFor({ lens: 'subject', section: info.section, cluster })}
      titleId={`mc-curriculum-cluster-${cluster}`}
      eyebrow={cluster}
      title={info.title}
      subtitle={info.tested}
      count={count}
      ring={<RingBlock pct={pct} caption="Cluster" showCaption={false} />}
      heat={heat}
      heatLabel="Lessons"
      ariaLabel={`Open ${cluster} ${info.title}. ${count}. ${masteryPhrase(pct)}. ${bandLabel(status)}.`}
    />
  );
}

/**
 * A drillable child card (phases, lesson-bearing modules, subject sections, and
 * clusters). The whole card is one link (the title, stretched over the card by
 * CSS) so a click anywhere zooms in; the ring, count and heat-strip are
 * decorative supplements to the link's explicit accessible name.
 */
function ZoomCard({
  to,
  titleId,
  eyebrow,
  title,
  subtitle,
  count,
  ring,
  heat,
  heatLabel,
  ariaLabel,
  accentClass,
  badge,
}: {
  to: string;
  titleId: string;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  count: string;
  ring: ReactNode;
  heat: readonly DisplayBand[];
  heatLabel: string;
  ariaLabel: string;
  accentClass?: string;
  badge?: ReactNode;
}) {
  return (
    <article
      className={`mc-curriculum__card mc-curriculum__card--zoom${accentClass ? ` ${accentClass}` : ''}`}
      aria-labelledby={titleId}
    >
      <div className="mc-curriculum__card-top">
        <div className="mc-curriculum__card-heading">
          {eyebrow ? <p className="mc-curriculum__card-eyebrow">{eyebrow}</p> : null}
          <h3 className="mc-curriculum__card-title" id={titleId}>
            <Link className="mc-curriculum__card-link" to={to} aria-label={ariaLabel}>
              {title}
            </Link>
            <span className="mc-curriculum__card-chev" aria-hidden="true" />
          </h3>
          {subtitle ? <p className="mc-curriculum__card-sub">{subtitle}</p> : null}
          <p className="mc-curriculum__card-count">{count}</p>
        </div>
        {ring}
      </div>
      {badge ? <div className="mc-curriculum__card-badge">{badge}</div> : null}
      <HeatStrip items={heat} label={heatLabel} />
    </article>
  );
}

/**
 * A zero-lesson module (a Phase-5 revisit synthesis or an earlier integration
 * point). It introduces no new lesson, so it is a distinct dashed card with a
 * recycle glyph and no Start — informational in v1, stating exactly what it
 * revisits from the manifest's integer count.
 */
function ReviewCard({ module }: { module: CurriculumModule }) {
  const titleId = `mc-curriculum-review-${module.id}`;
  return (
    <article className="mc-curriculum__card mc-curriculum__card--review" aria-labelledby={titleId}>
      <div className="mc-curriculum__card-heading">
        <span className="mc-curriculum__review-icon" aria-hidden="true" />
        <h3 className="mc-curriculum__card-title" id={titleId}>
          {module.title}
        </h3>
        <p className="mc-curriculum__card-count">{moduleCountLabel(module)}</p>
      </div>
      <p className="mc-curriculum__note">{moduleNote(module)}</p>
    </article>
  );
}

/**
 * A lesson card — the launch level, shared by both lenses. Unlike the zoom cards
 * it has its own controls (the KC disclosure and the server-authoritative
 * Start/Continue), so the card is NOT one big link: the title links into the
 * lesson's KC detail (staying in the current lens) while the launch action stays
 * a sibling button.
 */
function LessonCard({
  phase,
  module,
  lesson,
  lens,
  mastery,
  warrantByKc,
}: {
  phase: CurriculumPhase;
  module: CurriculumModule;
  lesson: CurriculumLesson;
  lens: 'phase' | 'subject';
  mastery?: LessonMasteryView;
  warrantByKc: ReadonlyMap<string, MasteryMapEntry>;
}) {
  const ordinal = String(lesson.position).padStart(3, '0');
  const kcCount = lesson.kcs.length;
  const titleId = `mc-curriculum-lesson-${lesson.id}`;
  const pct = mastery === undefined ? null : Math.round(mastery.pL * 100);
  // The deepest strip: one tile per KC. Per-KC CAPABILITY is not exposed, so this
  // strip previews the actionable per-skill warrant FRESHNESS, in the shared tile
  // display band (`freshnessBand`). It matches the KC chips on the lesson detail.
  const heat = lesson.kcs.map((kc) => freshnessBand(kcStatus(kc.id, pct, warrantByKc)));
  const to =
    lens === 'subject'
      ? hrefFor({ lens: 'subject', lesson: lesson.id })
      : hrefFor({ phase: phase.id, module: module.id, lesson: lesson.id });
  return (
    <article className="mc-curriculum__card mc-curriculum__lessoncard" aria-labelledby={titleId}>
      <div className="mc-curriculum__card-top">
        <div className="mc-curriculum__card-heading">
          <span className="mc-curriculum__ordinal" aria-hidden="true">
            {ordinal}
          </span>
          <h3 className="mc-curriculum__card-title" id={titleId}>
            <span className="mc-visually-hidden">Lesson {lesson.position}: </span>
            <Link
              className="mc-curriculum__card-link mc-curriculum__card-link--inline"
              to={to}
              aria-label={`Open ${lesson.shortTitle} skills`}
            >
              {lesson.shortTitle}
            </Link>
          </h3>
        </div>
        <RingBlock pct={pct} caption="Lesson" showCaption={false} />
      </div>

      <details className="mc-curriculum__kc">
        <summary
          className="mc-curriculum__kc-summary"
          aria-label={`What you'll learn (${kcCount})`}
        >
          <span className="mc-curriculum__kc-label">What you&apos;ll learn ({kcCount})</span>
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

      <HeatStrip items={heat} label="Skills" />

      <div className="mc-curriculum__lessoncard-foot">
        <LaunchAction lesson={lesson} />
      </div>
    </article>
  );
}

function Breadcrumb({ trail }: { trail: readonly Crumb[] }) {
  return (
    <nav className="mc-curriculum__crumbs" aria-label="Breadcrumb">
      <ol className="mc-curriculum__crumbs-list">
        {trail.map((crumb, index) => {
          const isLast = index === trail.length - 1;
          return (
            <li key={`${crumb.label}-${index}`} className="mc-curriculum__crumb">
              {crumb.to && !isLast ? (
                <Link className="mc-curriculum__crumb-link" to={crumb.to}>
                  {crumb.label}
                </Link>
              ) : (
                <span className="mc-curriculum__crumb-current" aria-current="page">
                  {crumb.label}
                </span>
              )}
              {!isLast ? (
                <span className="mc-curriculum__crumb-sep" aria-hidden="true">
                  ›
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * Lens toggle — a segmented pill switching the top level between the phase and
 * subject maps. Both options are real: each navigates to the other lens's top
 * level, so the choice is reflected in (and shareable through) the URL.
 */
function LensToggle({ lens }: { lens: 'phase' | 'subject' }) {
  const navigate = useNavigate();
  return (
    <div className="mc-curriculum__lens" role="group" aria-label="Browse the curriculum by">
      <button
        type="button"
        className={`mc-curriculum__lens-btn${lens === 'phase' ? ' mc-curriculum__lens-btn--active' : ''}`}
        aria-pressed={lens === 'phase'}
        onClick={() => navigate(hrefFor({}))}
      >
        By Phase
      </button>
      <button
        type="button"
        className={`mc-curriculum__lens-btn${lens === 'subject' ? ' mc-curriculum__lens-btn--active' : ''}`}
        aria-pressed={lens === 'subject'}
        onClick={() => navigate(hrefFor({ lens: 'subject' }))}
      >
        By Subject
      </button>
    </div>
  );
}

function Legend() {
  return (
    <ul className="mc-curriculum__legend" aria-label="What the colours mean">
      <li className="mc-curriculum__legend-item">
        <span
          className="mc-curriculum__legend-dot mc-curriculum__legend-dot--ontrack"
          aria-hidden="true"
        />
        On track
      </li>
      <li className="mc-curriculum__legend-item">
        <span
          className="mc-curriculum__legend-dot mc-curriculum__legend-dot--inprogress"
          aria-hidden="true"
        />
        In progress
      </li>
      <li className="mc-curriculum__legend-item">
        <span
          className="mc-curriculum__legend-dot mc-curriculum__legend-dot--none"
          aria-hidden="true"
        />
        Not started
      </li>
    </ul>
  );
}

function NodeHeader({
  eyebrow,
  title,
  subtitle,
  badge,
  ring,
  headingRef,
  headingId,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  ring: ReactNode;
  headingRef: Ref<HTMLHeadingElement>;
  headingId: string;
}) {
  return (
    <header className="mc-curriculum__node">
      <div className="mc-curriculum__node-titles">
        {eyebrow ? <p className="mc-curriculum__node-eyebrow">{eyebrow}</p> : null}
        <h2 className="mc-curriculum__node-title" id={headingId} tabIndex={-1} ref={headingRef}>
          {title}
        </h2>
        {subtitle ? <p className="mc-muted mc-curriculum__node-sub">{subtitle}</p> : null}
        {badge ? <div className="mc-curriculum__node-badge">{badge}</div> : null}
      </div>
      {ring}
    </header>
  );
}

/**
 * A rolled-up mastery ring. With evidence it reuses the shared teal MasteryRing
 * (its rounded percent rides inside); with none it shows the muted "Not started"
 * ghost ring carrying no number, so an un-started node is never dressed up as a
 * fabricated 0%. The ring is decorative (aria-hidden); the reading is exposed to
 * assistive tech as text beside it. `showCaption` is false on the dense child
 * cards (the percent inside the ring is enough there) and true on node headers.
 */
function RingBlock({
  pct,
  caption,
  showCaption = true,
}: {
  pct: number | null;
  caption: string;
  showCaption?: boolean;
}) {
  if (pct === null) {
    return (
      <span className="mc-curriculum__ring mc-curriculum__ring--empty">
        <svg className="mc-ring mc-ring--ghost" viewBox="0 0 100 100" aria-hidden="true">
          <circle className="mc-ring__track mc-ring__track--ghost" cx="50" cy="50" r="42" />
          <circle className="mc-ring__arc mc-ring__arc--ghost" cx="50" cy="50" r="42" />
        </svg>
        <span className="mc-curriculum__ring-cap" aria-hidden="true">
          Not started
        </span>
        <span className="mc-visually-hidden">{caption}: not started</span>
      </span>
    );
  }
  return (
    <span className="mc-curriculum__ring">
      <span className="mc-curriculum__ring-svg" aria-hidden="true">
        <MasteryRing pct={pct} />
      </span>
      {showCaption ? (
        <span className="mc-curriculum__ring-cap" aria-hidden="true">
          {caption}
        </span>
      ) : null}
      <span className="mc-visually-hidden">
        {caption}: {pct}% mastery
      </span>
    </span>
  );
}

/**
 * The CARS reading-readiness ring for the By Subject CARS section. CARS is an IRT
 * ability, not per-KC BKT, so there is no `pL` mean to show and a 0% would be a
 * fabrication. Instead the arc fills to the overall readiness fraction and the
 * caption is the qualitative word (Building / Approaching / On-track) — the same
 * language the Progress gauge uses, and deliberately NOT a scaled score. Before
 * the readout loads it falls back to the neutral "Not started" ghost.
 */
function ReadinessRing({ readiness }: { readiness: CarsReadinessView | undefined }) {
  if (readiness === undefined) {
    return (
      <span className="mc-curriculum__ring mc-curriculum__ring--empty">
        <svg className="mc-ring mc-ring--ghost" viewBox="0 0 100 100" aria-hidden="true">
          <circle className="mc-ring__track mc-ring__track--ghost" cx="50" cy="50" r="42" />
          <circle className="mc-ring__arc mc-ring__arc--ghost" cx="50" cy="50" r="42" />
        </svg>
        <span className="mc-curriculum__ring-cap" aria-hidden="true">
          Not started
        </span>
        <span className="mc-visually-hidden">Reading readiness: not started</span>
      </span>
    );
  }
  const word = READINESS_WORD[readiness.label];
  const r = 42;
  const circumference = 2 * Math.PI * r;
  const filled = Math.max(0, Math.min(1, readiness.overallPct));
  const offset = circumference * (1 - filled);
  return (
    <span className="mc-curriculum__ring mc-curriculum__ring--readiness">
      <span className="mc-curriculum__ring-svg" aria-hidden="true">
        <svg className="mc-ring" viewBox="0 0 100 100" role="img" aria-hidden="true">
          <circle className="mc-ring__track" cx="50" cy="50" r={r} />
          <circle
            className="mc-ring__arc mc-ring__arc--high"
            cx="50"
            cy="50"
            r={r}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            transform="rotate(-90 50 50)"
          />
        </svg>
      </span>
      <span className="mc-curriculum__ring-cap" aria-hidden="true">
        {word}
      </span>
      <span className="mc-visually-hidden">Reading readiness: {word}</span>
    </span>
  );
}

/**
 * A row of tiny tiles previewing the level below a card, one tile per child in
 * the shared display band (green on track / amber in progress / grey not started).
 * The rollup cards feed it each child's CAPABILITY band (so it matches the rings);
 * the lesson card feeds it each KC's warrant-freshness band. It is a single
 * labelled image to assistive tech (the per-tile squares are decorative) so the
 * breakdown is spoken once, cleanly, rather than tile by tile.
 */
function HeatStrip({ items, label }: { items: readonly DisplayBand[]; label: string }) {
  if (items.length === 0) return null;
  let ontrack = 0;
  let inprogress = 0;
  let none = 0;
  for (const item of items) {
    if (item === 'ontrack') ontrack += 1;
    else if (item === 'inprogress') inprogress += 1;
    else none += 1;
  }
  return (
    <span
      className="mc-curriculum__heat"
      role="img"
      aria-label={`${label}: ${ontrack} on track, ${inprogress} in progress, ${none} not started`}
    >
      {items.map((item, index) => (
        <span
          key={index}
          className={`mc-curriculum__heat-tile mc-curriculum__heat-tile--${item}`}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}

/** A KC's qualitative status chip — warrant freshness, never a number. */
function StatusChip({ freshness }: { freshness: Freshness }) {
  const label =
    freshness === 'fresh' ? 'Fresh' : freshness === 'due' ? 'Due for review' : 'Not started';
  return <span className={`mc-curriculum__chip mc-curriculum__chip--${freshness}`}>{label}</span>;
}

// ---- Launch seam (server-authoritative; reused unchanged) -----------------
// WHICH lesson is servable is the registration manifest's call; the three
// actions below encode honest server availability and are shared by the lesson
// card (L3) and the lesson detail (L4).

function LaunchAction({ lesson }: { lesson: CurriculumLesson }) {
  const registered = lessonById(lesson.id);
  return registered === undefined ? (
    <UnavailableLessonAction lesson={lesson} />
  ) : registered.runtime === 'vector' ? (
    <TargetLessonAction lesson={lesson} />
  ) : (
    <CatalogLessonAction lesson={lesson} registered={registered} />
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
