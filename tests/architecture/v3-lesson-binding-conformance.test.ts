import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { LessonItemBindingSchema } from '../../packages/contracts/src/lesson-observation';
import { EvidenceRecordSchema } from '../../packages/domain/src/evidence';
import { LESSON_TO_CLUSTER } from '../../packages/content/src/data/v3-cluster-map.data';

type JsonRecord = Record<string, unknown>;

interface LessonArtifact {
  readonly artifactVersion: string;
  readonly bindings: readonly JsonRecord[];
  readonly id: string;
  readonly path: string;
}

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const workspaceRoot = join(repoRoot, '..');

const EVIDENCE_MODE_ALIASES: Readonly<Record<string, readonly string[]>> = {
  INSTRUCTION_TELEMETRY_ONLY: ['INSTRUCTIONAL'],
  NON_EXIT_INSTRUCTIONAL_ONLY: ['INSTRUCTIONAL'],
  INSTRUCTIONAL_ONLY: ['INSTRUCTIONAL'],
  INSTRUCTIONAL_EXIT_ONLY: ['INSTRUCTIONAL'],
};

const AUTHOR_BINDING_KEYS = new Set([
  'activity_id',
  'activity_role',
  'answer_authority_ref',
  'assistance_available',
  'assistance_state',
  'binding_version',
  'candidate_evidence_modes',
  'changed_dimension',
  'changed_dimension_detail',
  'changed_dimensions',
  'construct_preserving_change',
  'decisive_cue_id',
  'distractor_lineage_id',
  'evidence_eligibility',
  'exact_reentry_for',
  'exit_function',
  'feedback_release',
  'feedback_release_point',
  'first_attempt_immutable',
  'first_attempt_policy',
  'freshness_divergence',
  'freshness_policy',
  'freshness_rule',
  'hint_availability',
  'hint_policy',
  'hint_reveal_availability',
  'invalid_item_behavior',
  'invalid_item_policy',
  'item_binding_id',
  'item_version',
  'learner_operation',
  'learner_safe_item_ref',
  'learner_safe_projection',
  'learner_safe_projection_ref',
  'learner_safe_prompt_ref',
  'near_or_changed_function',
  'omission_behavior',
  'omission_policy',
  'primary_kc_id',
  'publication_eligibility',
  'question_id',
  'rationale_authority_ref',
  'reasoning_operation',
  'representation_family_id',
  'representation_id',
  'response_feature_routes',
  'response_mode',
  'retry_behavior',
  'retry_policy',
  'reveal_availability',
  'reveal_behavior',
  'scope_operation_tags',
  'secondary_kc_mappings',
  'secondary_kc_refs',
  'semantic_family_id',
  'semantic_structure',
  'server_answer_authority_ref',
  'server_only_answer_authority_ref',
  'server_rationale_authority_ref',
  'server_scoring_authority_ref',
  'solution_path_lineage_id',
  'stimulus_lineage',
  'stimulus_lineage_id',
]);

const asRecord = (value: unknown): JsonRecord | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : undefined;

const pick = (record: JsonRecord, ...keys: readonly string[]): unknown => {
  for (const key of keys) {
    if (record[key] !== undefined) return record[key];
  }
  return undefined;
};

const setIfDefined = (target: JsonRecord, key: string, value: unknown): void => {
  if (value !== undefined) target[key] = value;
};

const asStringArray = (value: unknown): unknown => {
  if (Array.isArray(value)) return value;
  return typeof value === 'string' ? [value] : undefined;
};

const normalizeCandidateModes = (value: unknown): unknown => {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return undefined;
  return EVIDENCE_MODE_ALIASES[value] ?? [value];
};

const normalizeProjection = (value: unknown): unknown => {
  const raw = asRecord(value);
  if (!raw) return value;

  const projection: JsonRecord = {};
  for (const [key, nestedValue] of Object.entries(raw)) {
    const normalizedKey = key === 'representation_id' ? 'representationId' : key;
    if (key !== 'choices' || !Array.isArray(nestedValue)) {
      projection[normalizedKey] = nestedValue;
      continue;
    }

    projection.choices = nestedValue.map((choice) => {
      const rawChoice = asRecord(choice);
      if (!rawChoice) return choice;
      return { ...rawChoice };
    });
  }
  return projection;
};

const normalizeResponseFeatureRoutes = (value: unknown): unknown => {
  if (!Array.isArray(value)) return value;
  return value.map((route) => {
    const rawRoute = asRecord(route);
    if (!rawRoute) return route;
    const normalized: JsonRecord = {};
    for (const [key, nestedValue] of Object.entries(rawRoute)) {
      const normalizedKey =
        key === 'response_option_index'
          ? 'responseOptionIndex'
          : key === 'response_field_id'
            ? 'responseFieldId'
            : key === 'response_feature_id'
              ? 'responseFeatureId'
              : key === 'response_pattern_id'
                ? 'responsePatternId'
                : key === 'route_kind'
                  ? 'routeKind'
                  : key === 'repair_feature_id'
                    ? 'repairFeatureId'
                    : key;
      normalized[normalizedKey] = nestedValue;
    }
    return normalized;
  });
};

const normalizeFreshnessDivergence = (value: unknown): unknown => {
  const raw = asRecord(value);
  if (!raw) return value;

  const normalized: JsonRecord = {};
  for (const [key, nestedValue] of Object.entries(raw)) {
    const normalizedKey =
      key === 'changed_from_item_binding_id'
        ? 'changedFromItemBindingId'
        : key === 'stimulus_difference'
          ? 'stimulusDifference'
          : key === 'solution_path_difference'
            ? 'solutionPathDifference'
            : key === 'distractor_difference'
              ? 'distractorDifference'
              : key;
    normalized[normalizedKey] = nestedValue;
  }
  return normalized;
};

function normalizeBinding(
  lesson: LessonArtifact,
  raw: JsonRecord,
): { readonly measurementKind: 'MEASURABLE' | 'NON_MEASURABLE'; readonly value: JsonRecord } {
  const measurementKind =
    raw.activity_role === 'WORKED_EXAMPLE' &&
    raw.first_attempt_policy === 'NOT_APPLICABLE_WORKED_REASONING'
      ? 'NON_MEASURABLE'
      : 'MEASURABLE';
  const value: JsonRecord = {
    measurementKind,
    lessonId: lesson.id,
  };

  setIfDefined(value, 'itemBindingId', raw.item_binding_id);
  setIfDefined(
    value,
    'bindingVersion',
    pick(raw, 'binding_version', 'item_version') ?? lesson.artifactVersion,
  );
  setIfDefined(value, 'primaryKcId', raw.primary_kc_id);
  setIfDefined(
    value,
    'secondaryKcMappings',
    pick(raw, 'secondary_kc_mappings', 'secondary_kc_refs') ?? [],
  );
  setIfDefined(value, 'secondaryKcRefs', raw.secondary_kc_refs);
  setIfDefined(value, 'activityRole', raw.activity_role);
  setIfDefined(value, 'semanticFamilyId', raw.semantic_family_id);

  const lineage = pick(raw, 'stimulus_lineage_id', 'stimulus_lineage');
  setIfDefined(
    value,
    'stimulusLineageId',
    asRecord(lineage)?.lineage_id === undefined ? lineage : asRecord(lineage)?.lineage_id,
  );

  setIfDefined(
    value,
    'authoredAssistanceAffordances',
    asStringArray(
      pick(raw, 'assistance_available', 'assistance_state', 'authored_assistance_level'),
    ),
  );
  setIfDefined(
    value,
    'candidateEvidenceModes',
    normalizeCandidateModes(pick(raw, 'candidate_evidence_modes', 'evidence_eligibility')),
  );
  setIfDefined(value, 'reasoningOperation', raw.reasoning_operation);
  setIfDefined(value, 'dokLevel', raw.dok_level);
  setIfDefined(value, 'representationId', raw.representation_id);
  setIfDefined(value, 'representationFamilyId', raw.representation_family_id);
  setIfDefined(value, 'changedDimensions', raw.changed_dimensions ?? []);

  const changedDimensionDetail =
    pick(raw, 'changed_dimension_detail', 'changed_dimension') ??
    asRecord(raw.construct_preserving_change)?.changed_dimension;
  setIfDefined(
    value,
    'changedDimensionDetail',
    changedDimensionDetail === null ? undefined : changedDimensionDetail,
  );
  setIfDefined(value, 'learnerOperation', raw.learner_operation);
  setIfDefined(value, 'semanticStructure', raw.semantic_structure);
  setIfDefined(
    value,
    'learnerSafeItemRef',
    normalizeProjection(
      pick(
        raw,
        'learner_safe_item_ref',
        'learner_safe_projection_ref',
        'learner_safe_projection',
        'learner_safe_prompt_ref',
      ),
    ),
  );

  setIfDefined(
    value,
    'hintPolicy',
    pick(
      raw,
      'hint_policy',
      'hint_availability',
      'hint_reveal_availability',
      'reveal_availability',
    ),
  );
  setIfDefined(value, 'feedbackRelease', pick(raw, 'feedback_release', 'feedback_release_point'));
  setIfDefined(value, 'omissionPolicy', pick(raw, 'omission_policy', 'omission_behavior'));
  setIfDefined(value, 'retryPolicy', pick(raw, 'retry_policy', 'retry_behavior'));
  setIfDefined(
    value,
    'invalidItemPolicy',
    pick(raw, 'invalid_item_policy', 'invalid_item_behavior'),
  );
  setIfDefined(value, 'exitFunction', pick(raw, 'exit_function', 'near_or_changed_function'));
  setIfDefined(value, 'freshnessPolicy', pick(raw, 'freshness_policy', 'freshness_rule'));
  setIfDefined(value, 'publicationEligibility', raw.publication_eligibility);
  setIfDefined(value, 'solutionPathLineageId', raw.solution_path_lineage_id);
  setIfDefined(value, 'decisiveCueId', raw.decisive_cue_id);
  setIfDefined(value, 'distractorLineageId', raw.distractor_lineage_id);
  setIfDefined(
    value,
    'responseFeatureRoutes',
    normalizeResponseFeatureRoutes(raw.response_feature_routes),
  );
  setIfDefined(value, 'exactReentryFor', raw.exact_reentry_for);
  setIfDefined(value, 'scopeOperationTags', raw.scope_operation_tags);
  setIfDefined(
    value,
    'freshnessDivergence',
    normalizeFreshnessDivergence(raw.freshness_divergence),
  );
  setIfDefined(value, 'responseMode', raw.response_mode);

  if (measurementKind === 'MEASURABLE') {
    setIfDefined(value, 'questionId', pick(raw, 'question_id', 'item_binding_id'));
    setIfDefined(value, 'activityId', raw.activity_id);
    const immutable =
      raw.first_attempt_immutable === true || raw.first_attempt_policy === 'IMMUTABLE';
    if (immutable) value.firstAttemptImmutable = true;
    setIfDefined(
      value,
      'serverScoringAuthorityRef',
      pick(
        raw,
        'server_scoring_authority_ref',
        'server_only_answer_authority_ref',
        'server_answer_authority_ref',
        'answer_authority_ref',
      ) ?? undefined,
    );
    setIfDefined(
      value,
      'serverRationaleAuthorityRef',
      pick(raw, 'server_rationale_authority_ref', 'rationale_authority_ref') ?? undefined,
    );
  }

  return { measurementKind, value };
}

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

  for (const lesson of lessons) {
    it(`parses every binding and builds evidence where measurable: ${lesson.id}`, () => {
      const breakdown = new Map<string, number>();
      const samples = new Map<string, string>();
      let parsedBindings = 0;
      let measurableBindings = 0;
      let evidenceRecords = 0;

      const addFailure = (field: string, sample: string): void => {
        breakdown.set(field, (breakdown.get(field) ?? 0) + 1);
        samples.set(field, samples.get(field) ?? sample);
      };

      for (const raw of lesson.bindings) {
        const bindingId =
          typeof raw.item_binding_id === 'string'
            ? raw.item_binding_id
            : '(missing item_binding_id)';
        for (const authorKey of Object.keys(raw)) {
          if (!AUTHOR_BINDING_KEYS.has(authorKey)) {
            addFailure(`author.${authorKey}`, `${bindingId}: unrecognized author key`);
          }
        }

        const normalized = normalizeBinding(lesson, raw);
        const parsed = LessonItemBindingSchema.safeParse(normalized.value);
        if (!parsed.success) {
          for (const issue of parsed.error.issues) {
            addFailure(
              `binding.${issue.path.join('.') || '(root)'}`,
              `${bindingId}: ${issue.message}`,
            );
          }
          continue;
        }

        parsedBindings += 1;
        if (normalized.measurementKind === 'NON_MEASURABLE') continue;
        measurableBindings += 1;

        const cluster = LESSON_TO_CLUSTER[lesson.id];
        if (!cluster) {
          addFailure('evidence.cluster', `${bindingId}: no resolved LESSON_TO_CLUSTER entry`);
          continue;
        }

        const evidence = EvidenceRecordSchema.safeParse({
          evidenceId: '11111111-1111-4111-8111-111111111111',
          skillId: normalized.value.primaryKcId,
          cluster,
          kind: 'instruction',
          independent: false,
          assistanceLevel: 'A0',
          contentBearingHint: false,
          questionId: normalized.value.questionId,
          itemVersion: 1,
          familyId: normalized.value.semanticFamilyId,
          changeDimensions: normalized.value.changedDimensions,
          conditions: {
            mixed: false,
            passage: false,
            timed: false,
            protected: false,
            accommodations: [],
          },
          outcome: 'omitted',
          valid: true,
          occurredAt: '2026-07-27T12:00:00.000Z',
          sequence: 1,
          contentRelease: 'conformance',
          policies: [],
        });
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
          `${measurableBindings} measurable bindings, ${evidenceRecords} evidence records`,
          'Failures by field:',
          summarizeBreakdown(breakdown),
          ...failures,
        ].join('\n'),
      ).toEqual([]);
      expect(parsedBindings).toBe(lesson.bindings.length);
      expect(evidenceRecords).toBe(measurableBindings);
    });
  }
});
