import { describe, expect, it } from 'vitest';
import {
  EventIdSchema,
  IdempotencyKeySchema,
  LearnerIdSchema,
} from '../../packages/contracts/src/ids';
import { UtcTimestampSchema } from '../../packages/contracts/src/time';
import { LessonRuntimeResponseFactsSchema } from '../../packages/contracts/src/lesson-observation';
import { ChangeDimensionSchema, EvidenceRecordSchema } from '../../packages/domain/src/evidence';
import {
  adaptLessonResponse,
  parseAuthoredLessonBinding,
  unrecognizedAuthoredBindingKeys,
} from '../../packages/domain/src/lesson-response-adapter';
import { LESSON_TO_CLUSTER } from '../../packages/content/src/data/v3-cluster-map.data';
import {
  EXPECTED_LESSON_BINDINGS,
  EXPECTED_LESSON_IDS,
  EXPECTED_TOTAL_BINDINGS,
  lessonById,
  lessonCorpus,
  lessonCorpusDiagnostic,
  missingLessonIds,
  type LessonArtifact,
} from './lesson-corpus';

/**
 * Real-artifact conformance for the lesson → mastery seam.
 *
 * This test deliberately owns no normalization of its own. It calls exactly the
 * production entry points — `parseAuthoredLessonBinding` and
 * `adaptLessonResponse` in `@mcat/domain` — so passing here means the shipping
 * code path handles these lessons, not that some test-local normalizer could.
 *
 * Discovery is NOT owned here either: `./lesson-corpus` is the single mechanism
 * both this suite and `lesson-mastery-integration.test.ts` use. This file used to
 * walk a hardcoded out-of-repo path with an unguarded `readdirSync`, so a clean
 * checkout — where two of the three lessons genuinely do not exist — got a raw
 * `ENOENT` during collection instead of an explanation.
 *
 * The per-lesson blocks below are generated from the EXPECTED ids, not from
 * whatever discovery happened to find. That is deliberate: generating them from
 * the discovered set meant a missing artifact silently produced no test at all,
 * so the suite went green having checked two thirds of the corpus, or none of it.
 */

/**
 * Bindings expected to qualify for BKT on this synthetic all-independent
 * response, by lesson id. `0` for a lesson not listed: every binding still
 * normalizes to instructional-only, the fail-closed default.
 *
 * `V3-LES-130923` carries 6 — its `CHANGED_EXIT` terminal checks (one initial
 * plus one re-entry per KC, across 3 KCs) declare `candidate_evidence_modes:
 * ['TRANSFER']` and a `reasoning_operation`, per `changed-task-license`.
 * `NEAR_EXIT` was deliberately left instructional, so it contributes 0.
 * `V3-LES-844372` carries 6 by the identical rule: its three changed-task KCs
 * (GRAPH/SYS/LOG) each license one initial `CHANGED_EXIT` plus its `CHANGED`
 * re-entry — the latter authored as a `REPAIR_CONFIRMATION` role with a
 * `CHANGED_TASK` exit function, which the production adapter qualifies on
 * `candidate_evidence_modes` + `reasoning_operation`, never on the role label.
 * `NEAR_EXIT` and every instructional stage stay ineligible, contributing 0.
 * `V3-LES-789208` is still unlicensed here (contributes 0) pending its own
 * changed-task pass. All three lessons are vendored in-repo under
 * `content/lessons/` since Phase 2 — none live outside the repository.
 */
const EXPECTED_QUALIFIED_BKT_OBSERVATIONS: Readonly<Record<string, number>> = {
  'V3-LES-130923': 6,
  'V3-LES-844372': 6,
};

// The whole catalog is expected to move exactly this many qualified BKT
// observations. Pinned as an explicit literal (not derived from the map above)
// so licensing a lesson — or a per-lesson pin drifting — forces a conscious
// edit to this catalog-wide total as well.
const EXPECTED_CATALOG_TOTAL = 12;

const OBSERVATION_ID = '9c0ffee0-0000-4000-8000-000000000001';
const EVIDENCE_ID = '9c0ffee0-0000-4000-8000-000000000002';
const EVENT_ID = EventIdSchema.parse('9c0ffee0-0000-4000-8000-000000000003');
const LEARNER_ID = LearnerIdSchema.parse('9c0ffee0-0000-4000-8000-000000000004');
const IDEMPOTENCY_KEY = IdempotencyKeySchema.parse('9c0ffee0-0000-4000-8000-000000000005');
const OCCURRED_AT = '2026-07-27T12:00:00.000Z';

function summarizeBreakdown(breakdown: ReadonlyMap<string, number>): string {
  return [...breakdown.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([field, count]) => `  ${count}x ${field}`)
    .join('\n');
}

/**
 * The artifact for `lessonId`, or a loud named failure.
 *
 * Reached from inside a named `it`, so an absent artifact fails THAT test rather
 * than deleting it. Nothing here is skippable.
 */
function requireLesson(lessonId: string): LessonArtifact {
  const lesson = lessonById(lessonId);
  expect(lesson, lessonCorpusDiagnostic(`conformance for ${lessonId}`)).toBeDefined();
  return lesson as LessonArtifact;
}

/**
 * Every lesson that gets a conformance block: the three expected ones always,
 * plus anything else discovery found so a newly added artifact is covered on the
 * day it lands rather than whenever someone remembers to list it.
 */
const CONFORMANCE_LESSON_IDS: readonly string[] = [
  ...EXPECTED_LESSON_IDS,
  ...lessonCorpus()
    .map((lesson) => lesson.id)
    .filter((id) => !EXPECTED_LESSON_IDS.includes(id)),
];

describe('V3 lesson binding conformance', () => {
  it('discovers every expected lesson artifact, or names the ones it could not', () => {
    expect(missingLessonIds(), lessonCorpusDiagnostic('corpus discovery')).toEqual([]);
    expect(lessonCorpus().map((lesson) => lesson.id)).toEqual(
      expect.arrayContaining([...EXPECTED_LESSON_IDS]),
    );
    // A block per expected lesson exists no matter what discovery returned, so a
    // missing artifact cannot quietly reduce the number of tests that run.
    expect(CONFORMANCE_LESSON_IDS.length).toBeGreaterThanOrEqual(EXPECTED_LESSON_IDS.length);
  });

  it('loads exactly the pinned corpus of bindings', () => {
    // Exact, not a floor: this is the assertion that makes every per-lesson check
    // below non-vacuous, so a count that drifts has to be looked at rather than
    // absorbed. 42 + 40 + 33 = 115.
    let total = 0;
    for (const lessonId of EXPECTED_LESSON_IDS) {
      const lesson = requireLesson(lessonId);
      const expected = EXPECTED_LESSON_BINDINGS[lessonId] as number;
      expect(
        lesson.bindings.length,
        `${lessonId} yielded ${lesson.bindings.length} bindings, expected exactly ${expected} ` +
          `(resolved from ${lesson.source})`,
      ).toBe(expected);
      total += lesson.bindings.length;
    }
    expect(total).toBe(EXPECTED_TOTAL_BINDINGS);
  });

  it('carries no authored change dimensions, and no prose that could stand in for them', () => {
    // `EvidenceRecord.changeDimensions` reaches the transfer recipe slot, which
    // needs TWO DISTINCT canonical dimensions to be satisfied. The adapter maps
    // it faithfully from the authored `changed_dimensions` array — and nothing
    // authors that array, so every evidence record production has ever written
    // carries `[]` and `CHANGE_DIMENSION_GAP` is permanent. Measured here, at
    // the authoring end, because that is where the missing thing is missing.
    //
    // The plural key is NOT the singular `changed_dimension` the artifacts do
    // author. That one is reviewed prose and lands in `changedDimensionDetail`;
    // contract §7 forbids parsing it into the canonical array, and the numbers
    // below are why that rule is right rather than merely cautious. The three
    // lessons author the field at three incompatible granularities — free
    // phrases, single words, SCREAMING_SNAKE labels — and across all 115
    // bindings exactly ONE distinct value is a canonical dimension. A slot
    // needing two distinct values could not be filled from this prose even by a
    // mapping that took every exact match and inferred nothing.
    //
    // THIS TEST IS EXPECTED TO FAIL WHEN AUTHORING LANDS, and that is its job.
    // It is the falsifier for the aspirational fixtures in
    // `packages/policies/src/policies.test.ts`, which hand-write dimensions that
    // no artifact produces. When these numbers move, those fixtures stop being
    // aspirational and their label has to be revisited.
    expect(missingLessonIds(), lessonCorpusDiagnostic('change-dimension authoring')).toEqual([]);

    const canonical = new Set<string>(ChangeDimensionSchema.options);
    const authoredDimensions = new Map<string, number>();
    const prose = new Map<string, number>();
    let parsedBindings = 0;

    for (const lessonId of EXPECTED_LESSON_IDS) {
      const lesson = requireLesson(lessonId);
      for (const raw of lesson.bindings) {
        const parsed = parseAuthoredLessonBinding(
          { lessonId: lesson.id, artifactVersion: lesson.artifactVersion },
          raw,
        );
        if (parsed.status !== 'parsed') continue;
        parsedBindings += 1;
        for (const dimension of parsed.binding.changedDimensions) {
          authoredDimensions.set(dimension, (authoredDimensions.get(dimension) ?? 0) + 1);
        }
        const detail = parsed.binding.changedDimensionDetail;
        if (typeof detail === 'string' && detail !== '') {
          prose.set(detail, (prose.get(detail) ?? 0) + 1);
        }
      }
    }

    // Non-vacuity first: a corpus that stopped parsing would satisfy every
    // "nothing authors this" claim below by finding nothing at all.
    expect(parsedBindings).toBe(EXPECTED_TOTAL_BINDINGS);
    expect(prose.size).toBeGreaterThan(0);

    expect(
      [...authoredDimensions.keys()],
      'no lesson authors `changed_dimensions`, so no evidence record can carry one; if this ' +
        'fails, authoring has landed and the aspirational label in policies.test.ts is stale',
    ).toEqual([]);

    const usableFromProse = [...prose.keys()].filter((value) => canonical.has(value));
    expect(
      usableFromProse.length,
      'the transfer slot needs 2 distinct canonical dimensions; mapping the prose field by ' +
        `exact match yields ${usableFromProse.length} across the whole corpus ` +
        `(${JSON.stringify(usableFromProse)}), so the prose is not a stand-in for the array`,
    ).toBeLessThan(2);
  });

  for (const lessonId of CONFORMANCE_LESSON_IDS) {
    it(`parses every binding and builds evidence where measurable: ${lessonId}`, () => {
      const lesson = requireLesson(lessonId);
      const breakdown = new Map<string, number>();
      const samples = new Map<string, string>();
      let parsedBindings = 0;
      let measurableBindings = 0;
      let evidenceRecords = 0;
      let qualifiedBktObservations = 0;

      const addFailure = (field: string, sample: string): void => {
        breakdown.set(field, (breakdown.get(field) ?? 0) + 1);
        samples.set(field, samples.get(field) ?? sample);
      };

      for (const raw of lesson.bindings) {
        const bindingId =
          typeof raw.item_binding_id === 'string'
            ? raw.item_binding_id
            : '(missing item_binding_id)';

        const parsed = parseAuthoredLessonBinding(
          { lessonId: lesson.id, artifactVersion: lesson.artifactVersion },
          raw,
        );

        // Read off the production parse result, not recomputed here, so the
        // build fails the moment an authored key stops being mapped.
        for (const authorKey of parsed.unrecognizedKeys) {
          addFailure(`author.${authorKey}`, `${bindingId}: unrecognized author key`);
        }
        expect(parsed.unrecognizedKeys, bindingId).toEqual(unrecognizedAuthoredBindingKeys(raw));
        if (parsed.status === 'invalid') {
          for (const issue of parsed.issues) {
            addFailure(
              `binding.${issue.path.join('.') || '(root)'}`,
              `${bindingId}: ${issue.message}`,
            );
          }
          continue;
        }

        parsedBindings += 1;
        const binding = parsed.binding;

        const cluster = LESSON_TO_CLUSTER[lesson.id];
        if (!cluster) {
          addFailure('evidence.cluster', `${bindingId}: no resolved LESSON_TO_CLUSTER entry`);
          continue;
        }

        const bindingVersion = binding.bindingVersion ?? lesson.artifactVersion;
        const questionId =
          binding.measurementKind === 'MEASURABLE' ? binding.questionId : binding.itemBindingId;

        const adaptation = adaptLessonResponse({
          binding,
          response: LessonRuntimeResponseFactsSchema.parse({
            questionId,
            itemBindingId: binding.itemBindingId,
            bindingVersion,
            attemptIndex: 1,
            isRetry: false,
            isDiagnosticRetry: false,
            response: { kind: 'MULTIPLE_CHOICE', chosenChoiceId: 'conformance-choice' },
            omitted: false,
            elapsedMs: 30_000,
            answerChanges: 0,
            assistanceLevel: 'A0',
            contentBearingHintUsed: false,
            revealUsed: false,
            occurredAt: OCCURRED_AT,
          }),
          scoring: {
            scoringValid: true,
            serverItemVersion: 1,
            outcome: 'correct',
            protectedScoring: false,
          },
          identity: {
            observationId: OBSERVATION_ID,
            eventId: EVENT_ID,
            learnerId: LEARNER_ID,
            idempotencyKey: IDEMPOTENCY_KEY,
            evidenceId: EVIDENCE_ID,
          },
          cluster,
          envelopeBindingVersion: lesson.artifactVersion,
          acceptedAt: UtcTimestampSchema.parse(OCCURRED_AT),
          sequence: 1,
          contentRelease: 'conformance',
          policies: [],
        });

        if (binding.measurementKind === 'NON_MEASURABLE') {
          if (adaptation.status !== 'not_measurable' || adaptation.evidence !== null) {
            addFailure('exposition.leaked', `${bindingId}: exposition produced an attempt record`);
          }
          continue;
        }

        measurableBindings += 1;
        if (adaptation.evidence === null) {
          addFailure('evidence.(absent)', `${bindingId}: adapter produced no evidence record`);
          continue;
        }

        const evidence = EvidenceRecordSchema.safeParse(adaptation.evidence);
        if (!evidence.success) {
          for (const issue of evidence.error.issues) {
            addFailure(
              `evidence.${issue.path.join('.') || '(root)'}`,
              `${bindingId}: ${issue.message}`,
            );
          }
          continue;
        }
        evidenceRecords += 1;
        if (adaptation.qualification.status === 'qualified') qualifiedBktObservations += 1;
      }

      const failures = [...breakdown.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(
          ([field, count]) => `${count}x ${field}\n    e.g. ${samples.get(field) ?? 'no sample'}`,
        );

      expect(
        failures,
        [
          `${lesson.id}: ${parsedBindings}/${lesson.bindings.length} bindings parsed`,
          `${measurableBindings} measurable bindings, ${evidenceRecords} evidence records, ${qualifiedBktObservations} BKT observations`,
          'Failures by field:',
          summarizeBreakdown(breakdown),
          ...failures,
        ].join('\n'),
      ).toEqual([]);
      expect(lesson.bindings.length).toBeGreaterThan(0);
      expect(parsedBindings).toBe(lesson.bindings.length);
      expect(evidenceRecords).toBe(measurableBindings);
      expect(measurableBindings).toBeGreaterThan(0);
      // Exact, not a floor, for the same reason as the binding-count pin above:
      // a licensed lesson that silently qualified fewer (or more) bindings than
      // its CHANGED_EXIT terminal checks would be a defect worth seeing named,
      // not absorbed into a `toBeGreaterThan` that only ever moves one way.
      expect(qualifiedBktObservations).toBe(EXPECTED_QUALIFIED_BKT_OBSERVATIONS[lessonId] ?? 0);
    });
  }

  it('pins the catalog-wide qualified-observation total, and only for real lessons', () => {
    const pinnedTotal = Object.values(EXPECTED_QUALIFIED_BKT_OBSERVATIONS).reduce((a, b) => a + b, 0);
    expect(pinnedTotal, 'sum of per-lesson pins must match the reviewed catalog total').toBe(
      EXPECTED_CATALOG_TOTAL,
    );
    // A pin may only name a lesson the corpus actually discovers, so a renamed
    // or retired lesson can never leave a silently-satisfied entry behind.
    for (const pinnedId of Object.keys(EXPECTED_QUALIFIED_BKT_OBSERVATIONS)) {
      expect(CONFORMANCE_LESSON_IDS, `${pinnedId} must be a discovered lesson`).toContain(pinnedId);
    }
  });
});
