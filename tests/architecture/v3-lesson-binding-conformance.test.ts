import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  EventIdSchema,
  IdempotencyKeySchema,
  LearnerIdSchema,
} from '../../packages/contracts/src/ids';
import { UtcTimestampSchema } from '../../packages/contracts/src/time';
import { LessonRuntimeResponseFactsSchema } from '../../packages/contracts/src/lesson-observation';
import { EvidenceRecordSchema } from '../../packages/domain/src/evidence';
import {
  adaptLessonResponse,
  parseAuthoredLessonBinding,
  unrecognizedAuthoredBindingKeys,
} from '../../packages/domain/src/lesson-response-adapter';
import { LESSON_TO_CLUSTER } from '../../packages/content/src/data/v3-cluster-map.data';

/**
 * Real-artifact conformance for the lesson → mastery seam.
 *
 * This test deliberately owns no normalization of its own. It calls exactly the
 * production entry points — `parseAuthoredLessonBinding` and
 * `adaptLessonResponse` in `@mcat/domain` — so passing here means the shipping
 * code path handles these lessons, not that some test-local normalizer could.
 */

type JsonRecord = Record<string, unknown>;

interface LessonArtifact {
  readonly artifactVersion: string;
  readonly bindings: readonly JsonRecord[];
  readonly id: string;
  readonly path: string;
}

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const workspaceRoot = join(repoRoot, '..');

/** Every discovered lesson must contribute at least this many bindings in total. */
const MINIMUM_TOTAL_BINDINGS = 115;

const OBSERVATION_ID = '9c0ffee0-0000-4000-8000-000000000001';
const EVIDENCE_ID = '9c0ffee0-0000-4000-8000-000000000002';
const EVENT_ID = EventIdSchema.parse('9c0ffee0-0000-4000-8000-000000000003');
const LEARNER_ID = LearnerIdSchema.parse('9c0ffee0-0000-4000-8000-000000000004');
const IDEMPOTENCY_KEY = IdempotencyKeySchema.parse('9c0ffee0-0000-4000-8000-000000000005');
const OCCURRED_AT = '2026-07-27T12:00:00.000Z';

const asRecord = (value: unknown): JsonRecord | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : undefined;

function findLessonScripts(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return findLessonScripts(path);
    return entry.name === 'lesson-script.json' ? [path] : [];
  });
}

function loadLesson(path: string): LessonArtifact {
  const envelope = asRecord(JSON.parse(readFileSync(path, 'utf8'))) ?? {};
  const payload = asRecord(envelope.payload) ?? {};
  const bindings = Array.isArray(payload.question_evidence_plan)
    ? payload.question_evidence_plan.flatMap((binding) => {
        const record = asRecord(binding);
        return record ? [record] : [];
      })
    : [];
  const id = typeof payload.lesson_id === 'string' ? payload.lesson_id : path;
  const artifactVersion =
    typeof envelope.artifact_version === 'string' ? envelope.artifact_version : 'unknown-artifact';

  return { artifactVersion, bindings, id, path };
}

function summarizeBreakdown(breakdown: ReadonlyMap<string, number>): string {
  return [...breakdown.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([field, count]) => `  ${count}x ${field}`)
    .join('\n');
}

const lessonRoots = [
  join(repoRoot, 'content', 'lessons'),
  join(workspaceRoot, 'research', 'mcat-curriculum-architecture-v3', 'lesson-authoring-drafts'),
];
const lessons = lessonRoots.flatMap(findLessonScripts).sort().map(loadLesson);

describe('V3 lesson binding conformance', () => {
  it('discovers every lesson artifact on disk', () => {
    expect(lessons.length).toBeGreaterThanOrEqual(3);
    expect([...new Set(lessons.map((lesson) => lesson.id))]).toEqual(
      expect.arrayContaining(['V3-LES-130923', 'V3-LES-789208', 'V3-LES-844372']),
    );
  });

  it('loads a non-vacuous corpus of bindings', () => {
    // Guards the per-lesson assertions below, which would otherwise pass
    // trivially if an artifact stopped yielding bindings.
    for (const lesson of lessons) {
      expect(lesson.bindings.length, `${lesson.id} loaded no bindings`).toBeGreaterThan(0);
    }
    const total = lessons.reduce((sum, lesson) => sum + lesson.bindings.length, 0);
    expect(total).toBeGreaterThanOrEqual(MINIMUM_TOTAL_BINDINGS);
  });

  for (const lesson of lessons) {
    it(`parses every binding and builds evidence where measurable: ${lesson.id}`, () => {
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

        for (const authorKey of unrecognizedAuthoredBindingKeys(raw)) {
          addFailure(`author.${authorKey}`, `${bindingId}: unrecognized author key`);
        }

        const parsed = parseAuthoredLessonBinding(
          { lessonId: lesson.id, artifactVersion: lesson.artifactVersion },
          raw,
        );
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
          scoring: { scoringValid: true, serverItemVersion: 1, outcome: 'correct' },
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
      // Every current V3 binding normalizes to instructional-only, so no lesson
      // on disk may move BKT yet. This is the fail-closed default made visible.
      expect(qualifiedBktObservations).toBe(0);
    });
  }
});
