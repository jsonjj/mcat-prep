import type { Section, SkillCluster } from '@mcat/contracts';
import { CLUSTER_INFO } from '@mcat/contracts';
import { QuestionSchema, type Question as V7Question } from '../schema';
import {
  assertNoProtectedFields,
  compileV7Question,
  type LearnerSafeV7Question,
  type ProtectedV7Payload,
} from '../compile';
import { resolveV7Placement } from '../v7-cluster-map';
import {
  CLUSTER_LESSON,
  CLUSTER_V7_SECTION,
  DIAGNOSTIC_DRAFTS,
  type DiagnosticDraft,
} from './fixture-bank.data';

/**
 * v7 diagnostic bank builder.
 *
 * Splits every item into a LEARNER-SAFE half (shippable to the browser) and a
 * PROTECTED half (answer key + explanations, server-only). Routing/coverage is
 * derived through the production `resolveV7Placement` adapter; a documented
 * fallback (`cluster_hint`) covers the one cluster the pinned V3 registry does
 * not yet map to a lesson (PS1).
 */

export const DIAGNOSTIC_CONTENT_RELEASE = 'diagnostic-synthetic-v1';

/** One built diagnostic item: safe payload + protected key + resolved placement. */
export interface DiagnosticItem {
  safe: LearnerSafeV7Question;
  protected: ProtectedV7Payload;
  cluster: SkillCluster;
  section: Section;
  familyId: string;
  dokLevel: number | undefined;
  /** reviewed + published + diagnostic-eligible + not protected/test-only for delivery. */
  eligible: boolean;
  /** True when the adapter resolved the cluster; false when the hint fallback was used. */
  routedViaAdapter: boolean;
}

/** Turn one draft into a canonical v7 record (server-side, answer-bearing). */
function draftToV7(draft: DiagnosticDraft, index: number): V7Question {
  const lessonId = CLUSTER_LESSON[draft.cluster];
  const raw = {
    schema_version: 'v7',
    id: `diag-${draft.cluster.toLowerCase()}-${draft.family}-${String(index).padStart(3, '0')}`,
    section: CLUSTER_V7_SECTION[draft.cluster],
    stem: draft.stem,
    passage: draft.passage ?? '',
    choices: draft.choices,
    correct_answer: draft.correct,
    explanations: draft.explanations,
    family_id: `fam-${draft.cluster.toLowerCase()}-${draft.family}`,
    dok_level: draft.dok ?? 2,
    ...(lessonId ? { lesson_id: lessonId } : {}),
    // Explicit fallback tag for clusters the registry does not yet map (PS1).
    cluster_hint: draft.cluster,
    // Delivery/eligibility bookkeeping (kept permissively by the schema).
    status: 'published',
    diagnostic_eligible: true,
    test_only: true,
    pool: 'diagnostic',
    content_release: DIAGNOSTIC_CONTENT_RELEASE,
    assets: [],
  };
  return QuestionSchema.parse(raw);
}

const isEligible = (q: V7Question): boolean =>
  q.status === 'published' &&
  (q as { diagnostic_eligible?: unknown }).diagnostic_eligible === true &&
  (q as { pool?: unknown }).pool !== 'protected';

/**
 * Build the diagnostic bank from drafts (defaults to the synthetic fixture).
 * Throws if any learner-safe payload would leak a protected field.
 */
export function buildDiagnosticBank(
  drafts: readonly DiagnosticDraft[] = DIAGNOSTIC_DRAFTS,
): DiagnosticItem[] {
  return drafts.map((draft, index) => {
    const q = draftToV7(draft, index);
    const compiled = compileV7Question(q);
    // Defense in depth: never let a protected field reach the safe surface.
    assertNoProtectedFields(compiled.safe, `diagnostic:${compiled.safe.id}`);

    const placement = resolveV7Placement({
      section: q.section,
      primary_kc_id: q.primary_kc_id,
      lesson_id: q.lesson_id,
      primary_skill: q.primary_skill,
    });
    const hint = (q as { cluster_hint?: SkillCluster }).cluster_hint;
    const cluster = placement.cluster ?? hint ?? null;
    if (cluster === null) {
      throw new Error(`Diagnostic item ${q.id} could not be placed into a cluster.`);
    }

    return {
      safe: compiled.safe,
      protected: compiled.protected,
      cluster,
      // Section is the cluster's authoritative rollup (keeps section-floor
      // accounting coherent for cross-section reasoning clusters R1–R3).
      section: CLUSTER_INFO[cluster].section,
      familyId: q.family_id ?? `fam-${q.id}`,
      dokLevel: q.dok_level,
      eligible: isEligible(q),
      routedViaAdapter: placement.cluster !== null,
    };
  });
}
