import { lazy, Suspense, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ATLAS_LESSON_CLUSTER,
  ATLAS_REGION_GROUPS,
  CLUSTER_INFO,
  type LessonMasteryView,
  type SkillCluster,
} from '@mcat/contracts';
import { baseStateRank, type BaseMasteryState } from '@mcat/domain';
import { detectCapabilities } from '@mcat/platform-web';
import { Button } from '@mcat/ui-web';
import { CURRICULUM_PHASES } from '../data/curriculum-v3.generated';
import { useMasteryLessons } from '../app/queries';
import { BrainAtlas } from './BrainAtlas';
import type { AtlasRegion } from './BrainScene';

const BrainScene = lazy(() => import('./BrainScene'));

/**
 * A lesson counts as mastered — and so contributes to its region filling — once its
 * BKT `P(L)` crosses the mastery threshold. The mastery signal is now per-lesson
 * (`useMasteryLessons`), so each region reflects the actual lessons the learner has
 * mastered; unpracticed lessons stay dark.
 */
const MASTERED_RANK = baseStateRank('independent');

/**
 * Provisional lesson unlock: a lesson is "unlocked" once its global teaching-order
 * rank is within this many positions of the mastered frontier — so a starter set is
 * unlocked on day one (nodes read yellow) and more open as lessons are mastered.
 * This is the stand-in until the authored prerequisite map lands; then `locked` will
 * come straight from it (unlocked = all prerequisites mastered).
 */
const UNLOCK_WINDOW = 12;
/** BKT prior P(L) for an unpracticed but unlocked lesson — the yellow end of the fade. */
const PRIOR_PL = 0.2;

/** Map a lesson's BKT `P(L)` readout to the atlas's display state. */
function lessonStateFromPL(entry: LessonMasteryView | undefined): BaseMasteryState {
  if (!entry) return 'not_assessed';
  return entry.mastered ? 'independent' : 'learning';
}

const brainPartLabel = (part: string) => part.replace(/_/g, ' ');

/**
 * lesson_id → teaching-order + module context, read from the checked-in curriculum
 * manifest (the same source the Curriculum tab renders). Used to label and order
 * the region's lessons in the tap panel — no new data, no network.
 */
interface LessonMeta {
  shortTitle: string;
  position: number;
  moduleId: string;
  moduleTitle: string;
  moduleOrder: number;
  phaseOrder: number;
}
const LESSON_META: Record<string, LessonMeta> = (() => {
  const map: Record<string, LessonMeta> = {};
  for (const phase of CURRICULUM_PHASES) {
    for (const mod of phase.modules) {
      for (const lesson of mod.lessons) {
        map[lesson.id] = {
          shortTitle: lesson.shortTitle,
          position: lesson.position,
          moduleId: mod.id,
          moduleTitle: mod.title,
          moduleOrder: mod.order,
          phaseOrder: phase.order,
        };
      }
    }
  }
  return map;
})();

type LessonStatusKey = 'done' | 'progress' | 'todo';
function lessonStatus(state: BaseMasteryState): { key: LessonStatusKey; label: string; glyph: string } {
  const rank = baseStateRank(state);
  if (rank >= MASTERED_RANK) return { key: 'done', label: 'Done', glyph: '●' };
  if (rank >= 1) return { key: 'progress', label: 'In progress', glyph: '◐' };
  return { key: 'todo', label: 'Not started', glyph: '○' };
}

interface RegionLessonRow {
  id: string;
  title: string;
  state: BaseMasteryState;
}
interface RegionLessonGroup {
  moduleId: string;
  moduleTitle: string;
  lessons: RegionLessonRow[];
}

/** Region's lessons in teaching order, grouped by their curriculum module. */
function lessonGroupsFor(region: AtlasRegion): RegionLessonGroup[] {
  const enriched = region.lessons.map((l) => {
    const meta = LESSON_META[l.id];
    return {
      id: l.id,
      title: meta?.shortTitle ?? l.title,
      state: l.state,
      position: meta?.position ?? Number.MAX_SAFE_INTEGER,
      moduleId: meta?.moduleId ?? '~',
      moduleTitle: meta?.moduleTitle ?? 'Other lessons',
      moduleOrder: meta?.moduleOrder ?? 999,
      phaseOrder: meta?.phaseOrder ?? 999,
    };
  });
  enriched.sort(
    (a, b) => a.phaseOrder - b.phaseOrder || a.moduleOrder - b.moduleOrder || a.position - b.position,
  );
  const groups: RegionLessonGroup[] = [];
  for (const row of enriched) {
    let group = groups.find((g) => g.moduleId === row.moduleId);
    if (!group) {
      group = { moduleId: row.moduleId, moduleTitle: row.moduleTitle, lessons: [] };
      groups.push(group);
    }
    group.lessons.push({ id: row.id, title: row.title, state: row.state });
  }
  return groups;
}

/**
 * variant "home": a full, decorative, spinnable brain (opaque real model) — the
 * aspirational hero, unchanged.
 * variant "progress": the Evidence Atlas — the translucent real brain split into
 * the 15 anatomical lesson-groups. Each region shows one dot per lesson and snaps
 * to a solid glowing-green fill once every lesson in it is mastered. Tapping a
 * region lists its lessons.
 */
export function EvidenceAtlas({ variant = 'progress' }: { variant?: 'home' | 'progress' } = {}) {
  const navigate = useNavigate();
  const lessonMastery = useMasteryLessons();
  const caps = useMemo(() => detectCapabilities(), []);
  const [selected, setSelected] = useState<string | null>(null);
  const isHome = variant === 'home';

  // Per-lesson BKT P(L), keyed by lesson id — the real mastery signal that drives
  // which brain nodes light up. Unpracticed lessons have no entry and stay dark.
  const lessonById = useMemo(
    () => new Map((lessonMastery.data ?? []).map((l) => [l.lessonId, l] as const)),
    [lessonMastery.data],
  );
  const masteredLessonCount = useMemo(
    () => (lessonMastery.data ?? []).filter((l) => l.mastered).length,
    [lessonMastery.data],
  );

  // Global teaching-order rank for every atlas lesson (phase → module → position),
  // used by the provisional unlock frontier. Stable across renders.
  const lessonRank = useMemo(() => {
    const ranked = ATLAS_REGION_GROUPS.flatMap((rg) => rg.lessons.map((l) => l.lesson_id))
      .map((id) => ({ id, meta: LESSON_META[id] }))
      .sort(
        (a, b) =>
          (a.meta?.phaseOrder ?? 999) - (b.meta?.phaseOrder ?? 999) ||
          (a.meta?.moduleOrder ?? 999) - (b.meta?.moduleOrder ?? 999) ||
          (a.meta?.position ?? Number.MAX_SAFE_INTEGER) -
            (b.meta?.position ?? Number.MAX_SAFE_INTEGER),
      );
    const map = new Map<string, number>();
    ranked.forEach((r, i) => map.set(r.id, i));
    return map;
  }, []);

  const regions: AtlasRegion[] = useMemo(
    () =>
      ATLAS_REGION_GROUPS.map((rg) => {
        let masteredCount = 0;
        const lessons = rg.lessons.map((l) => {
          const entry = lessonById.get(l.lesson_id);
          const state: BaseMasteryState = isHome ? 'strong' : lessonStateFromPL(entry);
          const mastered = baseStateRank(state) >= MASTERED_RANK;
          if (mastered) masteredCount += 1;
          const pL = isHome ? 1 : (entry?.pL ?? PRIOR_PL);
          // Unlocked when mastered, already touched (has a mastery entry), or within the
          // teaching-order frontier. Only genuinely locked lessons read grey.
          const rank = lessonRank.get(l.lesson_id) ?? Number.MAX_SAFE_INTEGER;
          const locked = isHome
            ? false
            : !(mastered || entry !== undefined || rank < masteredLessonCount + UNLOCK_WINDOW);
          return { id: l.lesson_id, title: l.title, state, mastered, locked, pL };
        });
        const tapLessonId = (lessons.find((l) => !l.mastered) ?? lessons[0])?.id;
        const tapCluster = (tapLessonId ? ATLAS_LESSON_CLUSTER[tapLessonId] : undefined) ?? 'BB1';
        return {
          id: rg.region_id,
          name: rg.name,
          brainPart: rg.brain_part,
          hemisphere: rg.hemisphere,
          areaShare: rg.area_share,
          lessons,
          masteredCount,
          complete: rg.lesson_count > 0 && masteredCount === rg.lesson_count,
          tapCluster,
        };
      }),
    [lessonById, isHome, lessonRank, masteredLessonCount],
  );

  const sel = selected ? (regions.find((r) => r.id === selected) ?? null) : null;
  const selCluster = sel ? (sel.tapCluster as SkillCluster) : null;
  const groups = useMemo(() => (sel ? lessonGroupsFor(sel) : []), [sel]);

  if (!caps.webgl) {
    return (
      <div className={`mc-atlas mc-atlas--${variant}`}>
        <BrainAtlas glowing={isHome ? 6 : masteredLessonCount} />
        {!isHome ? (
          <p className="mc-atlas__hint mc-muted mc-fineprint">
            Interactive 3D needs WebGL — showing the calm still view. Everything is also on the Skills
            list.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className={`mc-atlas mc-atlas--${variant}`}>
      <Suspense fallback={<BrainAtlas glowing={isHome ? 6 : masteredLessonCount} />}>
        <BrainScene
          regions={regions}
          reducedMotion={caps.reducedMotion}
          selected={selected}
          interactive={!isHome}
          onSelect={setSelected}
        />
      </Suspense>
      <p className="mc-atlas__hint mc-muted mc-fineprint" aria-hidden="true">
        {isHome ? 'Drag to spin' : 'Drag to rotate · tap a region for its lessons'}
      </p>
      {!isHome && sel ? (
        <div className="mc-atlas__panel" role="status" aria-live="polite" key={sel.id}>
          <div className="mc-atlas__paneltop">
            <div>
              <span className="mc-upnext__eyebrow">
                {sel.id} · {brainPartLabel(sel.brainPart)}
                {sel.hemisphere !== 'midline' ? ` · ${sel.hemisphere}` : ''}
              </span>
              <p className="mc-atlas__paneltitle">{sel.name}</p>
              <p className="mc-muted mc-fineprint">
                {sel.masteredCount} of {sel.lessons.length} lessons mastered
                {sel.complete ? ' · complete' : ''}
              </p>
            </div>
            <button
              type="button"
              className="mc-atlas__panelclose"
              onClick={() => setSelected(null)}
              aria-label="Close region details"
            >
              ×
            </button>
          </div>

          <div className="mc-atlas__lessons">
            {groups.map((group) => (
              <section key={group.moduleId} className="mc-atlas__lgroup">
                <p className="mc-atlas__lgroup-head">{group.moduleTitle}</p>
                <ul className="mc-atlas__llist">
                  {group.lessons.map((lesson) => {
                    const status = lessonStatus(lesson.state);
                    return (
                      <li key={lesson.id} className="mc-atlas__lesson">
                        <span
                          className={`mc-atlas__lstatus mc-atlas__lstatus--${status.key}`}
                          aria-hidden="true"
                        >
                          {status.glyph}
                        </span>
                        <span className="mc-atlas__ltitle">{lesson.title}</span>
                        <span className={`mc-atlas__lstate mc-atlas__lstate--${status.key}`}>
                          {status.label}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>

          {selCluster ? (
            <Button variant="secondary" onClick={() => navigate(`/app/skills/${selCluster}`)}>
              {sel.complete ? 'Review' : 'Practice'} {CLUSTER_INFO[selCluster].title}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
