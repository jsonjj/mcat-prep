/**
 * Topic-level spaced-recall schedule (client-side, demo).
 *
 * This applies the shared FSRS-4.5 scheduler (`@mcat/policies`) at the grain of
 * the 15 skill *clusters* (topics), seeded from the diagnostic result. It is a
 * deliberate demo simplification: the canonical design keeps FSRS state on exact
 * memory objects, not whole topics, and persists it server-side. Here we key one
 * review state per cluster and persist to `localStorage` so the recall loop is
 * demoable without the (currently stubbed) authority/Postgres review projections.
 *
 * FSRS only decides *when* a topic returns for review; it never awards mastery.
 */
import {
  ATLAS_LESSON_CLUSTER,
  CLUSTER_INFO,
  SKILL_CLUSTERS,
  toUtc,
  type ReviewRating,
  type SkillCluster,
  type UtcTimestamp,
} from '@mcat/contracts';
import { UNLOCK_WEIGHT, schedule, type ReviewState } from '@mcat/policies';
import { APP_NATIVE_LESSONS } from '../app-native';
import type { DiagnosticClassification, DiagnosticResultView } from './diagnostic-client';

// v2: topics now seed as due-now (v1 seeded them a day out, which left the
// recall queue empty right after placement).
const STORAGE_KEY = 'mc.recall.schedule.v2';
const CONFIRMING_KEY = 'mc.recall.confirming.v1';
const DAY_MS = 86_400_000;

/**
 * How "overdue" a freshly-seeded topic looks, by seed rating. Every seeded topic
 * is due immediately (a date in the past) so the learner has something to recall
 * right after placement; weaker reads look more overdue so they surface first.
 * FSRS takes over the real cadence after the first self-rating.
 */
const SEED_OVERDUE_DAYS: Record<ReviewRating, number> = {
  again: 4,
  hard: 3,
  good: 2,
  easy: 1,
};

function seedState(rating: ReviewRating, now: UtcTimestamp): ReviewState {
  const state = schedule(null, rating, now);
  return {
    ...state,
    due: toUtc(new Date(Date.parse(now) - SEED_OVERDUE_DAYS[rating] * DAY_MS)),
  };
}

type ClusterSchedule = Partial<Record<SkillCluster, ReviewState>>;

/**
 * Diagnostic classification → initial FSRS rating. Weaker reads schedule sooner
 * (as if the first "review" went badly); confident reads schedule further out.
 */
const SEED_RATING: Record<DiagnosticClassification, ReviewRating> = {
  likely_weak: 'again',
  unresolved: 'hard',
  unsampled: 'hard',
  provisionally_ready: 'good',
};

/** cluster → playable pilot-lesson slug, for the "Study this topic" affordance. */
const LESSON_SLUG_BY_CLUSTER: Partial<Record<SkillCluster, string>> = (() => {
  const map: Partial<Record<SkillCluster, string>> = {};
  for (const entry of APP_NATIVE_LESSONS) {
    const cluster = ATLAS_LESSON_CLUSTER[entry.script.id] ?? null;
    if (cluster) map[cluster] = entry.script.slug;
  }
  return map;
})();

export function lessonSlugForCluster(cluster: SkillCluster): string | null {
  return LESSON_SLUG_BY_CLUSTER[cluster] ?? null;
}

function load(): ClusterSchedule {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as ClusterSchedule) : {};
  } catch {
    return {};
  }
}

function save(sched: ClusterSchedule): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sched));
  } catch {
    /* storage unavailable — schedule stays in memory for this view only */
  }
}

export function isSeeded(): boolean {
  return Object.keys(load()).length > 0;
}

/**
 * Seed the schedule once. If a diagnostic result is available, seed every cluster
 * from its classification; otherwise (diagnostic skipped) seed a neutral schedule
 * so the recall loop is still demoable. Idempotent: a non-empty schedule is left
 * untouched.
 */
export function ensureSeeded(result: DiagnosticResultView | null): void {
  if (isSeeded()) return;
  const now = toUtc(new Date());
  const sched: ClusterSchedule = {};
  if (result && result.perCluster.length > 0) {
    for (const signal of result.perCluster) {
      sched[signal.cluster as SkillCluster] = seedState(SEED_RATING[signal.classification], now);
    }
  } else {
    for (const cluster of SKILL_CLUSTERS) {
      sched[cluster] = seedState('hard', now);
    }
  }
  save(sched);
  // Cluster ids arrive over the wire as plain strings; keep only ones we know.
  const known = new Set<string>(SKILL_CLUSTERS);
  saveConfirming(
    (result?.stillConfirming ?? [])
      .map((s) => s.cluster)
      .filter((c): c is SkillCluster => known.has(c)),
  );
}

/**
 * Clusters the diagnostic could not settle, which the results screen promises to
 * "quietly check during your first week". Honouring that promise is what makes
 * a short diagnostic defensible: the reads it could not finish get resolved by
 * ordinary recall rather than by making the learner sit a longer test.
 *
 * A cluster stays flagged until it has actually been recalled once, at which
 * point it has been confirmed and the flag is dropped.
 */
function loadConfirming(): Set<SkillCluster> {
  try {
    const raw = localStorage.getItem(CONFIRMING_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? new Set(parsed as SkillCluster[]) : new Set();
  } catch {
    return new Set();
  }
}

function saveConfirming(clusters: readonly SkillCluster[]): void {
  try {
    localStorage.setItem(CONFIRMING_KEY, JSON.stringify(clusters));
  } catch {
    // Storage unavailable (private mode); confirmation flags are non-essential.
  }
}

export interface RecallTopic {
  cluster: SkillCluster;
  title: string;
  tested: string;
  dueAtMs: number;
  isDue: boolean;
  dueLabel: string;
  lessonSlug: string | null;
  reps: number;
  /** Diagnostic left this read unsettled; this session quietly confirms it. */
  confirming: boolean;
}

function dueLabel(dueAtMs: number, nowMs: number): string {
  const ms = dueAtMs - nowMs;
  if (ms <= 0) return 'Due now';
  const days = Math.round(ms / 86_400_000);
  if (days <= 0) return 'Due today';
  if (days === 1) return 'in 1 day';
  if (days < 30) return `in ${days} days`;
  const months = Math.round(days / 30);
  return months === 1 ? 'in 1 month' : `in ${months} months`;
}

/** All scheduled topics, soonest-due first, then by prerequisite leverage. */
export function listTopics(nowMs: number = Date.now()): RecallTopic[] {
  const sched = load();
  const confirming = loadConfirming();
  const topics: RecallTopic[] = [];
  for (const cluster of SKILL_CLUSTERS) {
    const state = sched[cluster];
    if (!state) continue;
    const dueAtMs = Date.parse(state.due);
    topics.push({
      cluster,
      title: CLUSTER_INFO[cluster].title,
      tested: CLUSTER_INFO[cluster].tested,
      dueAtMs,
      isDue: dueAtMs <= nowMs,
      dueLabel: dueLabel(dueAtMs, nowMs),
      lessonSlug: lessonSlugForCluster(cluster),
      reps: state.reps,
      confirming: confirming.has(cluster) && state.reps === 0,
    });
  }
  topics.sort((a, b) => {
    if (a.dueAtMs !== b.dueAtMs) return a.dueAtMs - b.dueAtMs;
    // Unsettled reads come before equally-due settled ones: confirming them is
    // what closes the gap the diagnostic left open.
    if (a.confirming !== b.confirming) return a.confirming ? -1 : 1;
    const lev = (UNLOCK_WEIGHT[b.cluster] ?? 0) - (UNLOCK_WEIGHT[a.cluster] ?? 0);
    if (lev !== 0) return lev;
    return SKILL_CLUSTERS.indexOf(a.cluster) - SKILL_CLUSTERS.indexOf(b.cluster);
  });
  return topics;
}

/** Clusters still awaiting their week-1 confirmation check. */
export function pendingConfirmations(): SkillCluster[] {
  return listTopics().filter((t) => t.confirming).map((t) => t.cluster);
}

/** Record a self-rated recall for one topic and reschedule it. Returns the fresh list. */
export function rateTopic(cluster: SkillCluster, rating: ReviewRating): RecallTopic[] {
  const sched = load();
  sched[cluster] = schedule(sched[cluster] ?? null, rating, toUtc(new Date()));
  save(sched);
  return listTopics();
}
