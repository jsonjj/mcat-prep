/**
 * Where the lesson channel stops, and why.
 *
 * `669fbcf` made `mastered` a two-part claim: `P(L) >= 0.95` AND an
 * `independent`-tier evidence warrant on every required KC. `e579779` licensed
 * the six `CHANGED_EXIT` bindings in `V3-LES-130923`, which is every
 * BKT-eligible lesson binding that exists. This file measures what those two
 * commits together make reachable from lessons ALONE, through the real runtime,
 * the real adapter and the real warrant policy.
 *
 * THE ANSWER IS THAT LESSON-ONLY MASTERY IS UNREACHABLE, and the reason is one
 * specific mismatch rather than a shortfall of quantity:
 *
 *   - the capability half IS reachable — repeated correct exits carry `P(L)`
 *     over the cut, slowly, exactly as the raised guess intends;
 *   - the warrant half is NOT, because every recipe in `EVIDENCE_CONFIG` opens
 *     with `{ kind: 'independent', minFamilies: 2 }`, and the lesson channel
 *     emits no `independent`-kind record at all. All six licensed bindings
 *     declare `TRANSFER`, so they resolve to `kind: 'transfer'`, which fills a
 *     different slot in a recipe whose first slot is still empty.
 *
 * So the ceiling is `learning`, no matter how many times a learner succeeds.
 *
 * TWO THINGS THIS FILE DELIBERATELY DOES NOT BLAME.
 *
 * `isRetry` is not the blocker. It reads as the obvious suspect — the re-entry
 * exit is the second of the two required families, and
 * `isIndependentAdministration` returns false whenever `isRetry` is set — but
 * the runtime commits the re-entry as a DISTINCT item with its own binding and
 * its own `semantic_family_id`, never as a second attempt at the initial, so
 * `isRetry` is false when it reaches the adapter. That is asserted below rather
 * than assumed, because it is a property a future retry-semantics change could
 * silently take away, and taking it away would remove the second family too.
 *
 * Family diversity is not the blocker either. Both families are administered,
 * both are independent administrations, and both produce evidence. They are
 * simply the wrong KIND for the slot that gates the claim.
 *
 * NOT A DEAD END. Practice writes `kind: 'independent'` and does clear the gate
 * — see `packages/authority-core/src/lesson-discounting.test.ts`, "writes
 * independent evidence". The constraint is that a lesson cannot finish the job
 * by itself, not that the job cannot be finished.
 *
 * AND THERE IS A SECOND WALL BEHIND THE FIRST. Suppose the independence slot
 * were filled tomorrow, from practice or from a relabelling. The transfer slot
 * asks for two distinct `changeDimensions` as well as two families, and every
 * evidence record this system writes carries `changeDimensions: []` — six sites
 * in `authority.ts` and the practice writer hardcode the empty array, and the
 * lesson adapter copies an authored array that no lesson authors (measured in
 * `v3-lesson-binding-conformance.test.ts`, "carries no authored change
 * dimensions"). So `CHANGE_DIMENSION_GAP` is not a gap a learner can close; it
 * is a permanent reason code, and the last `describe` below measures that with
 * the independence slot handed to it rather than argued about.
 *
 * The two walls are independent and neither hides the other, which is worth
 * being precise about because it is easy to over-claim here. `retained` and
 * `strong` were ALREADY unreachable through their `delayed` slot, which has no
 * producer at all (`key-docs/roadmap-todo.md`, "The delayed-check scheduler"),
 * so empty dimensions cost no published tier that was not already lost. What
 * they cost is `independent_corroborated_by_transfer` — the stronger route to
 * the `independent` tier — and the honesty of every gap report that names
 * transfer as something still to be earned.
 */
import { clusterForLesson, orderedKcsForLesson } from '@mcat/content';
import { describe, expect, it } from 'vitest';
import {
  EventIdSchema,
  IdempotencyKeySchema,
  LearnerIdSchema,
} from '../../packages/contracts/src/ids';
import { UtcTimestampSchema, type UtcTimestamp } from '../../packages/contracts/src/time';
import {
  isMasteryEligible,
  type ChangeDimension,
  type EvidenceRecord,
} from '../../packages/domain/src/evidence';
import { adaptLessonResponse } from '../../packages/domain/src/lesson-response-adapter';
import type { EvidenceQualityTier } from '../../packages/domain/src/mastery';
import { BKT_CONFIG, bktConfigForSource, bktUpdate } from '../../packages/policies/src/bkt';
import { initialMemoryState } from '../../packages/policies/src/forgetting';
import { difficultyB, slip } from '../../packages/policies/src/irt';
import {
  isLessonRollupAvailable,
  MASTERY_WARRANT_MIN_TIER,
  rollUpLessonMastery,
} from '../../packages/policies/src/lesson-rollup';
import { EVIDENCE_CONFIG, evaluateEvidence } from '../../packages/policies/src/mastery-policy';
import { VECTOR_LESSON_PROTECTED_ANSWERS } from '../../services/lambdas/learner-api/src/vector-lesson-protected';
import {
  vectorLessonResponseSubmission,
  vectorLessonResponseSubmissions,
} from '../../services/lambdas/learner-api/src/vector-lesson-response-source';
import {
  applyVectorLessonAction,
  createVectorLessonRun,
  renderVectorLessonRun,
  type VectorLessonResponseRecord,
  type VectorLessonRun,
} from '../../services/lambdas/learner-api/src/vector-lesson-runtime';

const LESSON_ID = 'V3-LES-130923';
const NOW = UtcTimestampSchema.parse('2026-07-29T18:00:00.000Z');

/** The three `CHANGED_EXIT` pairs: the only BKT-eligible bindings in the repo. */
const INITIAL_EXITS = [
  'vtr-vec-changed-exit-initial',
  'vtr-trig-changed-exit-initial',
  'vtr-dir-changed-exit-initial',
] as const;
const REENTRY_EXITS = [
  'vtr-vec-changed-exit-reentry',
  'vtr-trig-changed-exit-reentry',
  'vtr-dir-changed-exit-reentry',
] as const;

type Submission = ReturnType<typeof vectorLessonResponseSubmission>;

/**
 * A committed response record shaped the way the runtime writes one. Used only
 * where a binding needs reading without walking the lesson to reach it.
 */
const committedRecord = (itemId: string): VectorLessonResponseRecord => ({
  responseId: `response-${itemId}`,
  itemId,
  itemVersion: 'internal-draft-1',
  itemFamilyId: `fam-${itemId}`,
  kcId: 'V3-KC-866848' as const,
  activityRole: 'CHANGED_EXIT' as const,
  observedScaffoldDisplayed: false,
  observedSupportOffered: false,
  observedSupportRequested: false,
  observedAnswerRevealed: false,
  firstAttempt: true,
  choiceId: 'A' as const,
  correct: true,
  omissionType: null,
  observedResponseFeatures: [],
  committedAt: NOW as UtcTimestamp,
  feedbackState: 'AUTHORIZED_AFTER_COMMITMENT' as const,
});

const identity = (n: number) => ({
  observationId: `9c0ffee0-0000-4000-8000-${String(n).padStart(12, '0')}`,
  eventId: EventIdSchema.parse(`9c0ffee0-0000-4000-8001-${String(n).padStart(12, '0')}`),
  learnerId: LearnerIdSchema.parse('9c0ffee0-0000-4000-8000-000000000003'),
  idempotencyKey: IdempotencyKeySchema.parse(
    `9c0ffee0-0000-4000-8002-${String(n).padStart(12, '0')}`,
  ),
  evidenceId: `9c0ffee0-0000-4000-8003-${String(n).padStart(12, '0')}`,
});

function adapt(submission: Submission, sequence: number) {
  const cluster = clusterForLesson(submission.lessonId);
  if (cluster === null) throw new Error(`${submission.lessonId} has no cluster`);
  return adaptLessonResponse({
    binding: submission.binding,
    response: submission.response,
    scoring: submission.scoring,
    identity: identity(sequence),
    cluster,
    envelopeBindingVersion: submission.envelopeBindingVersion,
    acceptedAt: NOW,
    sequence,
    contentRelease: 'lesson-mastery-reachability',
    policies: [],
  });
}

const token = (run: VectorLessonRun): string => renderVectorLessonRun(run).screen.screenToken;

/**
 * Walk the whole lesson through the real state machine, answering every item
 * correctly except the ones named in `wrongOn`.
 *
 * The failure set is the parameter that matters: the re-entry exit is only
 * administered after its initial exit was MISSED, so a clean walk and a walk
 * that misses the initial exits reach disjoint halves of each `CHANGED_EXIT`
 * pair. Only their union shows what a learner could ever accumulate.
 */
function walkLesson(wrongOn: ReadonlySet<string> = new Set()): {
  readonly run: VectorLessonRun;
  readonly submissions: readonly Submission[];
} {
  let run = createVectorLessonRun({ now: NOW });
  const submissions: Submission[] = [];

  for (let guard = 0; guard < 400 && run.status === 'IN_PROGRESS'; guard += 1) {
    const before = run;
    const itemId = run.currentItemId;
    if (itemId === null) {
      run = applyVectorLessonAction(
        run,
        { runId: run.runId, screenToken: token(run), action: { type: 'CONTINUE' } },
        NOW,
      );
    } else {
      const correctChoiceId = VECTOR_LESSON_PROTECTED_ANSWERS[itemId]?.correctChoiceId;
      if (correctChoiceId === undefined) throw new Error(`${itemId} has no scoring authority`);
      const chosen = wrongOn.has(itemId)
        ? ((['A', 'B', 'C', 'D'] as const).find((id) => id !== correctChoiceId) ?? 'A')
        : correctChoiceId;
      run = applyVectorLessonAction(
        run,
        {
          runId: run.runId,
          screenToken: token(run),
          action: { type: 'SUBMIT_RESPONSE', choiceId: chosen },
        },
        NOW,
      );
    }
    submissions.push(...vectorLessonResponseSubmissions(before, run));
  }

  if (run.status !== 'DELIVERY_COMPLETE') {
    throw new Error(`the walk did not finish the lesson: ${run.status}`);
  }
  return { run, submissions };
}

/** Every evidence record a walk produces, in commit order. */
const evidenceFrom = (submissions: readonly Submission[]): EvidenceRecord[] =>
  submissions.flatMap((submission, index) => {
    const evidence = adapt(submission, index + 1).evidence;
    return evidence === null ? [] : [evidence];
  });

const bySkill = (records: readonly EvidenceRecord[]): Map<string, EvidenceRecord[]> => {
  const grouped = new Map<string, EvidenceRecord[]>();
  for (const record of records) {
    grouped.set(record.skillId, [...(grouped.get(record.skillId) ?? []), record]);
  }
  return grouped;
};

const warrantTiers = (records: readonly EvidenceRecord[]): Map<string, EvidenceQualityTier> => {
  const tiers = new Map<string, EvidenceQualityTier>();
  for (const [skillId, forSkill] of bySkill(records)) {
    tiers.set(skillId, evaluateEvidence({ skillId, records: forSkill, now: NOW }).evidenceQuality);
  }
  return tiers;
};

/**
 * Everything the lesson channel can ever put on a learner's record: a clean
 * walk plus a walk that misses every initial exit. No third path exists — the
 * `CHANGED_EXIT` pair has exactly two members and the runtime reaches the
 * second only by failing the first.
 */
const lessonChannelEvidence = (): EvidenceRecord[] => [
  ...evidenceFrom(walkLesson().submissions),
  ...evidenceFrom(walkLesson(new Set(INITIAL_EXITS)).submissions),
];

/**
 * A skill's two transfer families as production wrote them, plus an independence
 * slot handed over so it cannot be what is blocking.
 *
 * The independence records are copies of the same two transfer records with ONLY
 * `kind` changed — the same single-variable move the `describe` above uses, so
 * every other field is still exactly what the runtime produced, `[]` dimensions
 * included.
 *
 * `isMasteryEligible` is applied first because `evaluateEvidence` applies it
 * first: the miss-every-initial walk contributes INCORRECT records, and building
 * on those would measure that filter instead of the dimensions. One record per
 * family, so the family count is the slot's own arithmetic rather than an
 * accident of how many walks reached the same item.
 */
function transferPairWithIndependenceSupplied(): {
  readonly skillId: string;
  readonly records: EvidenceRecord[];
} {
  const eligible = lessonChannelEvidence().filter(isMasteryEligible);
  for (const [skillId, forSkill] of bySkill(eligible)) {
    const byFamily = new Map<string, EvidenceRecord>();
    for (const record of forSkill) {
      if (record.kind === 'transfer' && !byFamily.has(record.familyId)) {
        byFamily.set(record.familyId, record);
      }
    }
    const transfer = [...byFamily.values()].slice(0, 2);
    if (transfer.length < 2) continue;
    return {
      skillId,
      records: [
        ...transfer,
        ...transfer.map((record) => ({ ...record, kind: 'independent' as const })),
      ],
    };
  }
  throw new Error('no skill has two eligible transfer families; the measurement below is vacuous');
}

describe('lesson-only mastery reachability', () => {
  describe('the retry axis is not the blocker', () => {
    it('commits the re-entry exit as its own item, never as a retry of the initial', () => {
      const { submissions } = walkLesson(new Set(INITIAL_EXITS));
      const administered = submissions.map((submission) => submission.response.itemBindingId);

      // Both halves of every pair really were administered in this one walk.
      for (const itemId of [...INITIAL_EXITS, ...REENTRY_EXITS]) {
        expect(administered, itemId).toContain(itemId);
      }

      // The load-bearing fact. `vector-lesson-response-source.ts` emits
      // `isRetry: false` as a literal because a re-entry is a different item,
      // not a second attempt — so `isIndependentAdministration` is never
      // refused on retry grounds, and the second family stays reachable. If a
      // future change makes the re-entry a retry, this fails here first.
      for (const submission of submissions) {
        expect(submission.response.isRetry, submission.response.itemBindingId).toBe(false);
        expect(submission.response.isDiagnosticRetry, submission.response.itemBindingId).toBe(
          false,
        );
        expect(submission.response.attemptIndex, submission.response.itemBindingId).toBe(1);
      }

      // And the two halves are genuinely two families, which is what the
      // `minFamilies: 2` slots count.
      const families = new Set(
        submissions
          .filter((submission) => submission.binding?.activityRole === 'CHANGED_EXIT')
          .map((submission) => submission.binding?.semanticFamilyId),
      );
      expect(families.size).toBe(6);
    });

    it('records both exits of a pair as independent administrations', () => {
      const records = evidenceFrom(walkLesson(new Set(INITIAL_EXITS)).submissions);
      const exits = records.filter((record) =>
        [...INITIAL_EXITS, ...REENTRY_EXITS].includes(
          record.questionId as (typeof INITIAL_EXITS)[number],
        ),
      );

      expect(exits).toHaveLength(6);
      expect(exits.every((record) => record.independent)).toBe(true);
      expect(exits.every((record) => record.assistanceLevel === 'A0')).toBe(true);
      expect(exits.every((record) => !record.contentBearingHint)).toBe(true);
    });
  });

  describe('the warrant half is the blocker', () => {
    it('emits no independent-kind evidence from the lesson channel, on any path', () => {
      const records = lessonChannelEvidence();
      const kinds = new Set(records.map((record) => record.kind));

      // Exactly two kinds, and `independent` is not one of them. Stated as an
      // exact set: a floor would tolerate `independent` appearing, which is the
      // one change that would make this whole file's conclusion wrong.
      expect(kinds).toEqual(new Set(['instruction', 'transfer']));

      // The upstream cause, pinned where an authoring change would hit it. All
      // six licensed bindings declare `TRANSFER` and nothing else, so
      // `deriveEvidenceKind` can only ever resolve `transfer` for them.
      const declared = new Set(
        [...INITIAL_EXITS, ...REENTRY_EXITS].flatMap(
          (itemId) =>
            vectorLessonResponseSubmission(committedRecord(itemId)).binding
              ?.candidateEvidenceModes ?? [],
        ),
      );
      expect(declared).toEqual(new Set(['TRANSFER']));
    });

    it('leaves the independence slot open on every KC, so no recipe is satisfied', () => {
      // Every recipe opens with the same slot, so an empty `independent` slot
      // is not one route closed — it is all of them.
      expect(
        EVIDENCE_CONFIG.recipes.every((recipe) =>
          recipe.slots.some((slot) => slot.kind === 'independent' && slot.minFamilies === 2),
        ),
      ).toBe(true);

      const records = lessonChannelEvidence();
      for (const [skillId, forSkill] of bySkill(records)) {
        const evaluated = evaluateEvidence({ skillId, records: forSkill, now: NOW });
        expect(evaluated.evidenceQuality, skillId).toBe('learning');
        expect(evaluated.satisfiedSlots, skillId).toEqual([]);
        expect(
          evaluated.missingSlots.map((gap) => gap.kind),
          skillId,
        ).toContain('independent');
      }
    });

    it('withholds `mastered` from a lesson-only learner even at P(L) = 1', () => {
      const requiredKcIds = orderedKcsForLesson(LESSON_ID);
      expect(requiredKcIds).not.toBeNull();

      // The capability half is handed its best possible value, so the only
      // thing this can be measuring is the warrant.
      const kcStates = Object.fromEntries(
        (requiredKcIds ?? []).map((kcId) => [kcId, initialMemoryState(1)]),
      );
      const tiers = warrantTiers(lessonChannelEvidence());

      const rollup = rollUpLessonMastery({
        lessonId: LESSON_ID,
        requiredKcIds,
        kcStates,
        kcEvidenceQuality: Object.fromEntries(tiers),
        now: NOW,
      });

      expect(isLessonRollupAvailable(rollup)).toBe(true);
      if (!isLessonRollupAvailable(rollup)) return;
      expect(rollup.view.pL).toBe(1);
      expect(rollup.view.mastered).toBe(false);
      expect(rollup.view.members.some((member) => member.evidenceSufficient)).toBe(false);
    });
  });

  describe('the boundary is the evidence kind, and nothing else', () => {
    it('clears the gate the moment the same records are the independent kind', () => {
      // Same walks, same families, same outcomes, same independence, same
      // count — only `kind` changes. If this fails, the diagnosis above is
      // wrong and something else is also blocking.
      const relabelled = lessonChannelEvidence().map((record) =>
        record.kind === 'transfer' ? { ...record, kind: 'independent' as const } : record,
      );
      const tiers = warrantTiers(relabelled);

      expect(MASTERY_WARRANT_MIN_TIER).toBe('independent');
      expect([...tiers.values()]).toEqual(['independent', 'independent', 'independent']);

      const requiredKcIds = orderedKcsForLesson(LESSON_ID);
      const rollup = rollUpLessonMastery({
        lessonId: LESSON_ID,
        requiredKcIds,
        kcStates: Object.fromEntries(
          (requiredKcIds ?? []).map((kcId) => [kcId, initialMemoryState(1)]),
        ),
        kcEvidenceQuality: Object.fromEntries(tiers),
        now: NOW,
      });
      expect(isLessonRollupAvailable(rollup) && rollup.view.mastered).toBe(true);
    });
  });

  describe('the transfer slot is blocked a second time, by data that is never written', () => {
    it('writes an empty change-dimension array on every record it produces', () => {
      const records = lessonChannelEvidence();

      // Stated over every record rather than sampled, and paired with a count,
      // because "all of them" is only meaningful if there were some.
      expect(records.length).toBeGreaterThan(0);
      expect(records.filter((record) => record.changeDimensions.length > 0)).toEqual([]);
    });

    it('reports CHANGE_DIMENSION_GAP with the families it asks for already present', () => {
      const { skillId, records } = transferPairWithIndependenceSupplied();
      const evaluated = evaluateEvidence({ skillId, records, now: NOW });
      const transferGap = evaluated.missingSlots.find((gap) => gap.kind === 'transfer');

      // Family diversity satisfied, dimensions the only thing outstanding. That
      // is the whole finding: the slot is not under-earned, it is unearnable.
      expect(transferGap?.observedFamilies).toBe(2);
      expect(transferGap?.reasons).toEqual(['CHANGE_DIMENSION_GAP']);
      expect(evaluated.satisfiedSlots.map((slot) => slot.kind)).toEqual(['independent']);
    });

    it('clears that gap the moment two distinct dimensions exist, and only then', () => {
      // The counterfactual, isolating the one variable. The one-distinct case is
      // included deliberately: it proves the slot counts DISTINCT values, so a
      // future authoring pass that labels everything `representation` would buy
      // nothing, and a coarser test would not say so.
      const { skillId, records } = transferPairWithIndependenceSupplied();
      const labelled = (dimensions: readonly ChangeDimension[]) => {
        let index = 0;
        return evaluateEvidence({
          skillId,
          records: records.map((record) =>
            record.kind === 'transfer'
              ? { ...record, changeDimensions: [dimensions[index++] as ChangeDimension] }
              : record,
          ),
          now: NOW,
        });
      };

      const oneDistinct = labelled(['representation', 'representation']);
      expect(oneDistinct.missingSlots.find((gap) => gap.kind === 'transfer')?.reasons).toEqual([
        'CHANGE_DIMENSION_GAP',
      ]);

      const twoDistinct = labelled(['representation', 'domain_context']);
      expect(twoDistinct.missingSlots.find((gap) => gap.kind === 'transfer')).toBeUndefined();
      expect(twoDistinct.satisfiedSlots.map((slot) => slot.kind)).toEqual([
        'independent',
        'transfer',
      ]);
    });

    it('leaves `retained` and `strong` blocked anyway, so the cost is stated correctly', () => {
      // Guards against over-claiming. Even with the transfer slot satisfied,
      // both higher tiers stay out of reach on their `delayed` slot, which has
      // no producer at all. Populating dimensions would not deliver a tier; it
      // would deliver an honest gap report and one stronger route to
      // `independent`. If this ever fails, a delayed producer has landed and the
      // roadmap entry it belongs to is stale.
      const dimensionOnly = EVIDENCE_CONFIG.recipes.filter(
        (recipe) =>
          recipe.slots.some((slot) => slot.changeDimensions !== undefined) &&
          !recipe.slots.some((slot) => slot.minDelayHours !== undefined),
      );
      expect(dimensionOnly.map((recipe) => recipe.name)).toEqual([
        'independent_corroborated_by_transfer',
      ]);
      expect(dimensionOnly.map((recipe) => recipe.target)).toEqual(['independent']);

      for (const recipe of EVIDENCE_CONFIG.recipes) {
        if (recipe.target === 'retained' || recipe.target === 'strong') {
          expect(
            recipe.slots.some((slot) => slot.minDelayHours !== undefined),
            recipe.name,
          ).toBe(true);
        }
      }
    });
  });

  describe('the capability half, by contrast, is reachable', () => {
    it('carries P(L) over the cut on repeated correct exits, so only the warrant is missing', () => {
      // Named so the finding cannot be misread as "lessons move nothing". They
      // move the estimate all the way; they cannot warrant the claim.
      const cfg = bktConfigForSource('lesson_response');
      const itemSlip = slip(difficultyB({ dokLevel: 2, attempts: 0, correct: 0 }));

      let pL = BKT_CONFIG.priorPL0;
      let exits = 0;
      while (pL < BKT_CONFIG.masteryThreshold && exits < 100) {
        pL = bktUpdate(pL, { correct: true, slip: itemSlip }, cfg);
        exits += 1;
      }

      expect(pL).toBeGreaterThanOrEqual(BKT_CONFIG.masteryThreshold);
      expect(exits).toBe(5);
    });
  });
});
