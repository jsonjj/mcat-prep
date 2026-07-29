import { CLUSTER_INFO, SKILL_CLUSTERS, type Section, type SkillCluster } from '@mcat/contracts';
import {
  assertNoProtectedFields,
  buildDiagnosticBank,
  type DiagnosticItem,
  type LearnerSafeV7Question,
} from '@mcat/content';
import { fcForLesson, type DiagnosticCandidate, type FormItem } from '@mcat/policies';
import { loadPulledCorpus } from './db-pull';

/**
 * Server-side diagnostic bank. Built once from the v7 fixture corpus. This module
 * is the ONLY place the protected answer key lives on the server; the learner-safe
 * views it hands out cannot represent a key or explanation.
 *
 * It runs exclusively inside the Vite dev/preview middleware (Node) — it is never
 * imported by the browser bundle, so `@mcat/content` (and any answer material)
 * never crosses the client boundary.
 */

/** A learner-safe question view for the browser. No key, no explanations. */
export interface DiagnosticItemView {
  id: string;
  section: Section;
  sectionTitle: string;
  cluster: SkillCluster;
  clusterTitle: string;
  clusterTested: string;
  passage: string;
  stem: string;
  choices: { id: 'A' | 'B' | 'C' | 'D'; text: string }[];
}

const SECTION_TITLE: Readonly<Record<Section, string>> = {
  cp: 'Chemical & Physical Foundations',
  cars: 'Critical Analysis & Reasoning',
  bb: 'Biological & Biochemical Foundations',
  ps: 'Psychological & Social Foundations',
};

// ---------------------------------------------------------------------------
// Real bank loader (production_candidate corpus pulled from Postgres).
//
// Maps the gitignored local pull (read by ./db-pull) into diagnostic items. If
// the pull is absent or malformed, the bank falls back to the synthetic fixture
// so the app still runs. Answer material stays server-side (Node-only module).
// ---------------------------------------------------------------------------

const DB_SECTION_TO_V7: Readonly<Record<string, LearnerSafeV7Question['section']>> = {
  cp: 'CP',
  bb: 'BB',
  ps: 'PS',
  cars: 'CARS',
  cross_section: 'CROSS_SECTION',
};

/** status values treated as diagnostic-eligible (the corpus ships as candidates). */
const ELIGIBLE_STATUS = new Set(['production_candidate', 'published']);
const VALID_CLUSTERS = new Set<string>(SKILL_CLUSTERS);

function loadPulledBank(): DiagnosticItem[] | null {
  try {
    const corpus = loadPulledCorpus();
    if (corpus === null) return null;

    const items: DiagnosticItem[] = [];
    for (const q of corpus.questions) {
      const key = corpus.protectedById.get(q.question_id);
      const c = q.cluster;
      const choices = q.choices;
      if (
        key === undefined ||
        c === null ||
        !VALID_CLUSTERS.has(c) ||
        choices === null ||
        !(choices.A && choices.B && choices.C && choices.D)
      ) {
        continue;
      }
      const cluster = c as SkillCluster;
      const safe: LearnerSafeV7Question = {
        id: q.question_id,
        section: DB_SECTION_TO_V7[q.section] ?? 'CROSS_SECTION',
        subject: q.subject ?? null,
        primary_skill: q.primary_skill ?? null,
        family_id: q.family_id ?? null,
        stem: q.stem,
        passage: q.passage ?? '',
        choices: { A: choices.A, B: choices.B, C: choices.C, D: choices.D },
        assets: [],
      };
      // Defense in depth: never let answer material reach the learner-safe view.
      assertNoProtectedFields(safe, `diagnostic-db:${safe.id}`);
      items.push({
        safe,
        protected: { id: q.question_id, correct_answer: key.correct_answer, explanations: key.explanations },
        cluster,
        section: CLUSTER_INFO[cluster].section,
        lessonId: q.lesson_id ?? null,
        familyId: q.family_id ?? `fam-${q.question_id}`,
        dokLevel: q.dok_level ?? undefined,
        eligible: ELIGIBLE_STATUS.has(q.status ?? ''),
        routedViaAdapter: true,
      });
    }
    return items.length > 0 ? items : null;
  } catch {
    return null;
  }
}

/** Prefer the real pulled corpus; fall back to the synthetic fixture. */
export function loadDiagnosticBankItems(): DiagnosticItem[] {
  return loadPulledBank() ?? buildDiagnosticBank();
}

/** Server-side reveal for a recall attempt: correctness plus explanation. */
export interface RecallGrade {
  correct: boolean;
  correctChoiceId: 'A' | 'B' | 'C' | 'D';
  explanation: string;
}

/**
 * How much of the bank the diagnostic's reporting axis can actually see.
 *
 * The diagnostic measures the 10 Foundational Concepts, and a question reaches a
 * concept only through its lesson. Items in FC-untagged lessons — the whole
 * reasoning and CARS bank — are therefore not deliverable by it. They are
 * counted here rather than dropped silently, because "the form is short" and
 * "a third of the bank is unreachable" look identical from downstream.
 */
export interface DiagnosticBankScope {
  eligible: number;
  inScope: number;
  outOfScope: number;
  /** Skill clusters the excluded items belong to, with counts. */
  outOfScopeByCluster: Record<string, number>;
}

export class DiagnosticBank {
  private readonly items: DiagnosticItem[];
  private readonly byId = new Map<string, DiagnosticItem>();
  private readonly eligibleByCluster = new Map<SkillCluster, DiagnosticItem[]>();
  private readonly bucketById = new Map<string, string>();
  readonly candidates: DiagnosticCandidate[];
  /**
   * Every eligible item the reporting axis can place, as the multistage planner
   * wants them. Out-of-scope items are absent, so no code path downstream has to
   * remember to filter them out.
   */
  readonly formItems: FormItem[];
  readonly scope: DiagnosticBankScope;

  constructor(items: DiagnosticItem[] = loadDiagnosticBankItems()) {
    this.items = items;
    const outOfScopeByCluster: Record<string, number> = {};
    let eligible = 0;
    this.formItems = [];
    for (const item of items) {
      this.byId.set(item.safe.id, item);
      const bucketId = fcForLesson(item.lessonId);
      if (bucketId !== null) this.bucketById.set(item.safe.id, bucketId);
      if (!item.eligible) continue;
      eligible += 1;
      const pool = this.eligibleByCluster.get(item.cluster);
      if (pool) pool.push(item);
      else this.eligibleByCluster.set(item.cluster, [item]);
      if (bucketId === null) {
        outOfScopeByCluster[item.cluster] = (outOfScopeByCluster[item.cluster] ?? 0) + 1;
        continue;
      }
      // DOK is the difficulty proxy until calibration exists; an untagged item is
      // treated as mid-difficulty rather than dropped, since dropping would bias
      // assembly toward whichever buckets happen to be fully tagged.
      this.formItems.push({ questionId: item.safe.id, bucketId, dokLevel: item.dokLevel ?? 2 });
    }
    this.scope = {
      eligible,
      inScope: this.formItems.length,
      outOfScope: eligible - this.formItems.length,
      outOfScopeByCluster,
    };
    this.candidates = items.map((item) => ({
      questionId: item.safe.id,
      cluster: item.cluster,
      section: item.section,
      familyId: item.familyId,
      format: 'discrete_mcq',
      eligible: item.eligible,
      ...(item.dokLevel !== undefined ? { dokLevel: item.dokLevel } : {}),
    }));
  }

  /** The number of eligible items — used as a stable progress denominator. */
  get eligibleCount(): number {
    return this.items.filter((item) => item.eligible).length;
  }

  has(questionId: string): boolean {
    return this.byId.has(questionId);
  }

  /** Learner-safe view for delivery. Choices as an ordered A–D list for the UI. */
  view(questionId: string): DiagnosticItemView | null {
    const item = this.byId.get(questionId);
    if (!item) return null;
    const info = CLUSTER_INFO[item.cluster];
    const { choices } = item.safe;
    return {
      id: item.safe.id,
      section: item.section,
      sectionTitle: SECTION_TITLE[item.section],
      cluster: item.cluster,
      clusterTitle: info.title,
      clusterTested: info.tested,
      passage: item.safe.passage,
      stem: item.safe.stem,
      choices: (['A', 'B', 'C', 'D'] as const).map((id) => ({ id, text: choices[id] })),
    };
  }

  /**
   * SERVER-ONLY scoring. Returns whether the choice matches the protected key.
   * The result of this call is never returned to the browser per-item (the plan
   * gives no per-item reveal); only aggregate cluster signals are surfaced.
   */
  score(questionId: string, choiceId: string | null): boolean {
    const item = this.byId.get(questionId);
    if (!item) return false;
    return choiceId !== null && choiceId === item.protected.correct_answer;
  }

  /** The reporting bucket for an item, or null when the axis cannot see it. */
  bucket(questionId: string): string | null {
    return this.bucketById.get(questionId) ?? null;
  }

  placement(
    questionId: string,
  ): {
    bucketId: string;
    cluster: SkillCluster;
    section: Section;
    familyId: string;
    dokLevel: number | undefined;
  } | null {
    const item = this.byId.get(questionId);
    const bucketId = this.bucketById.get(item?.safe.id ?? '');
    if (!item || bucketId === undefined) return null;
    return {
      bucketId,
      cluster: item.cluster,
      section: item.section,
      familyId: item.familyId,
      dokLevel: item.dokLevel,
    };
  }

  /** How many eligible items back a cluster (0 → the topic can't be quizzed). */
  eligibleCountForCluster(cluster: SkillCluster): number {
    return this.eligibleByCluster.get(cluster)?.length ?? 0;
  }

  /**
   * A random eligible learner-safe question for a cluster, avoiding recently
   * served ids when possible. Returns null when the cluster has no eligible
   * items (e.g. PS1 in the fixture bank).
   */
  viewByCluster(cluster: SkillCluster, exclude: ReadonlySet<string> = new Set()): DiagnosticItemView | null {
    const pool = this.eligibleByCluster.get(cluster);
    if (!pool || pool.length === 0) return null;
    const fresh = pool.filter((item) => !exclude.has(item.safe.id));
    const from = fresh.length > 0 ? fresh : pool;
    const pick = from[Math.floor(Math.random() * from.length)]!;
    return this.view(pick.safe.id);
  }

  /**
   * SERVER-ONLY grading with reveal. Unlike the diagnostic (which never echoes
   * per-item correctness), recall is a study loop: after the learner commits an
   * answer we return whether it was right, the correct choice, and the
   * explanation for the option they picked (falling back to the key's).
   */
  grade(questionId: string, choiceId: 'A' | 'B' | 'C' | 'D' | null): RecallGrade | null {
    const item = this.byId.get(questionId);
    if (!item) return null;
    const correctChoiceId = item.protected.correct_answer;
    const explanations = item.protected.explanations;
    const explanation =
      (choiceId !== null ? explanations[choiceId] : undefined) ??
      explanations[correctChoiceId] ??
      '';
    return {
      correct: choiceId !== null && choiceId === correctChoiceId,
      correctChoiceId,
      explanation,
    };
  }
}

/** Process-wide singleton bank for the dev/preview server. */
export const diagnosticBank = new DiagnosticBank();

// Stated once at boot. The exclusion is intended, but an axis change that
// silently shrinks the deliverable pool is exactly the failure this accounting
// exists to catch, so it is announced rather than left to be discovered.
console.warn(
  `[diagnostic] bank scope: ${diagnosticBank.scope.inScope} of ${diagnosticBank.scope.eligible} eligible items ` +
    `are on the reporting axis; ${diagnosticBank.scope.outOfScope} excluded (no foundational concept) — ` +
    Object.entries(diagnosticBank.scope.outOfScopeByCluster)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([cluster, n]) => `${cluster}:${n}`)
      .join(' '),
);
