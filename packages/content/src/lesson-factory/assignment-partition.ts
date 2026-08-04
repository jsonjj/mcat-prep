import { createHash } from 'node:crypto';

export type AssignmentTeamId = 'primary' | 'team-A' | 'team-B';

export interface AssignmentPartitionInput {
  readonly manifestText: string;
  readonly assignmentSchemaText: string;
  readonly proofSchemaText: string;
  readonly sharedVocabularySchemaText: string;
  readonly taskPacketSchemaText: string;
  readonly deadlineProfileText: string;
  readonly releasePolicyText: string;
  readonly ownerSourceUseReceiptText: string;
  readonly sourceManifestPath: string;
  readonly assignmentSchemaPath: string;
  readonly proofSchemaPath: string;
  readonly sharedVocabularySchemaPath: string;
  readonly taskPacketSchemaPath: string;
  readonly deadlineProfilePath: string;
  readonly releasePolicyPath: string;
  readonly ownerSourceUseReceiptPath: string;
  readonly createdAt: string;
  readonly deadlineProfileRef: string;
  readonly releasePolicyRef: string;
  readonly rubricIdentity: {
    readonly rubric_path: string;
    readonly rubric_version: string;
    readonly rubric_sha256: string;
  };
}

export interface AssignmentManifestRow {
  readonly lane_id: string;
  readonly lesson_id: string;
  readonly task_packet_ref: string;
  readonly output_directory: string;
  readonly max_revision_cycles: number;
  readonly required_human_review_roles: readonly string[];
}

export interface AssignmentManifest {
  readonly contract_id: string;
  readonly contract_version: string;
  readonly assignment_id: string;
  readonly created_at: string;
  readonly deadline_profile_ref: string;
  readonly release_policy_ref: string;
  readonly rubric_identity: AssignmentPartitionInput['rubricIdentity'];
  readonly assignments: readonly AssignmentManifestRow[];
  readonly nonclaims: Readonly<Record<string, false>>;
}

export interface AssignmentProofRow {
  readonly lesson_id: string;
  readonly display_label: string;
  readonly source_section_bucket: string;
  readonly slug: string;
  readonly output_path: string;
  readonly assignment_id: string;
  readonly team_id: AssignmentTeamId;
  readonly lane_id: string;
}

export interface AssignmentAllocationArtifact {
  readonly teamId: AssignmentTeamId;
  readonly laneId: string;
  readonly assignmentId: string;
  readonly rows: readonly AssignmentProofRow[];
}

export interface TeamAssignmentArtifact extends AssignmentAllocationArtifact {
  readonly manifest: AssignmentManifest;
  readonly bytes: string;
  readonly contentSha256: string;
  readonly fileSha256: string;
}

export interface AssignmentPartitionProof {
  readonly contract_id: 'lesson-factory.assignment-partition-proof';
  readonly contract_version: '2.0.0';
  readonly run_id: string;
  readonly created_at: string;
  readonly deadline_profile_ref: string;
  readonly release_policy_ref: string;
  readonly source_use_receipt_ref: string;
  readonly rubric_identity: AssignmentPartitionInput['rubricIdentity'];
  readonly source_manifest: {
    readonly path: string;
    readonly content_sha256: string;
    readonly file_sha256: string;
    readonly canonical_lesson_count: number;
    readonly remaining_lesson_count: number;
  };
  readonly assignment_schema: {
    readonly path: string;
    readonly contract_id: string;
    readonly contract_version: string;
    readonly content_sha256: string;
    readonly file_sha256: string;
    readonly shared_vocabulary_file_sha256: string;
  };
  readonly proof_schema: {
    readonly path: string;
    readonly contract_id: 'lesson-factory.assignment-partition-proof';
    readonly contract_version: '2.0.0';
    readonly content_sha256: string;
    readonly file_sha256: string;
  };
  readonly packet_authorities: {
    readonly shared_vocabulary_schema: AuthorityPin;
    readonly task_packet_schema: AuthorityPin;
    readonly deadline_profile: AuthorityPin & {
      readonly profile_id: string;
      readonly profile_version: string;
    };
    readonly release_policy: AuthorityPin & {
      readonly policy_id: string;
      readonly policy_version: string;
    };
    readonly owner_source_use_receipt: AuthorityPin & {
      readonly receipt_id: string;
    };
  };
  readonly authoring_scope: {
    readonly disposition: 'AUTHORING_GENERATION_ONLY';
    readonly canonical_lesson_count: 114;
    readonly generation_lesson_count: 111;
    readonly excluded_existing_lesson_count: 3;
    readonly generation_rows_disjoint_from_exclusions: true;
    readonly generation_rows_union_exclusions_equals_canonical: true;
  };
  readonly excluded_existing_lesson_ids: readonly string[];
  readonly capacities: Readonly<Record<AssignmentTeamId, number>>;
  readonly algorithm: {
    readonly bucket_key: 'sorted source_sections joined with +';
    readonly initial_apportionment: 'largest remainder';
    readonly reconciliation: 'minimum proportional distortion';
    readonly tie_breakers: readonly ['bucket', 'lesson_id', 'team order'];
  };
  readonly assignments: readonly {
    readonly team_id: AssignmentTeamId;
    readonly lane_id: string;
    readonly assignment_id: string;
    readonly assignment_file: string;
    readonly count: number;
    readonly subject_distribution: Readonly<Record<string, number>>;
    readonly rows: readonly AssignmentProofRow[];
  }[];
  readonly invariants: {
    readonly pairwise_disjoint: true;
    readonly union_equals_remaining: true;
    readonly existing_three_excluded: true;
    readonly rows_union_exclusions_equals_canonical: true;
    readonly unique_slugs: true;
    readonly unique_output_paths: true;
    readonly proof_schema_valid: true;
  };
  readonly allocation_content_sha256: string;
}

export interface AssignmentAllocationResult {
  readonly allocations: readonly AssignmentAllocationArtifact[];
  /** Backward-compatible name for callers that consumed WP-02 before finalization split. */
  readonly assignments: readonly AssignmentAllocationArtifact[];
  readonly proof: AssignmentPartitionProof;
  readonly proofBytes: string;
  readonly files: Readonly<Record<string, string>>;
  readonly allocationContentSha256: string;
  readonly outputSetSha256: string;
}

export type AssignmentPartitionResult = AssignmentAllocationResult;

interface AuthorityPin {
  readonly path: string;
  readonly contract_id: string;
  readonly contract_version: string;
  readonly content_sha256: string;
  readonly file_sha256: string;
}

export interface AssignmentProofParserInput {
  readonly allocationProof: unknown;
  readonly manifestText: string;
  readonly assignmentSchemaText: string;
  readonly proofSchemaText: string;
  readonly sharedVocabularySchemaText: string;
  readonly taskPacketSchemaText: string;
  readonly deadlineProfileText: string;
  readonly releasePolicyText: string;
  readonly ownerSourceUseReceiptText: string;
}

export interface ParsedAssignmentPartitionProof {
  readonly proof: AssignmentPartitionProof;
  readonly generationRows: readonly AssignmentProofRow[];
  readonly excludedExistingLessonIds: readonly string[];
}

export interface AssignmentFinalizationInput extends AssignmentProofParserInput {
  readonly packetRefs: Readonly<Record<string, string>>;
}

export interface AssignmentFinalizationResult {
  readonly assignments: readonly TeamAssignmentArtifact[];
  readonly files: Readonly<Record<string, string>>;
  readonly assignmentSetContentSha256: string;
  readonly outputSetSha256: string;
}

interface TeamSpec {
  readonly teamId: AssignmentTeamId;
  readonly laneId: string;
  readonly capacity: number;
  readonly file: string;
}

interface CanonicalLesson {
  readonly lessonId: string;
  readonly displayLabel: string;
  readonly bucket: string;
}

interface BucketAllocation {
  readonly bucket: string;
  readonly size: number;
  readonly byTeam: Record<AssignmentTeamId, CanonicalLesson[]>;
}

type JsonObject = Record<string, unknown>;
type JsonSchema = boolean | JsonObject;

const CANONICAL_LESSON_COUNT = 114;
const REMAINING_LESSON_COUNT = 111;
const ASSIGNMENT_ID_PREFIX = 'lesson-factory-deadline-2026-08-03-assignment-';

export const EXISTING_LESSON_IDS = ['V3-LES-130923', 'V3-LES-789208', 'V3-LES-844372'] as const;

const TEAM_SPECS: readonly TeamSpec[] = [
  {
    teamId: 'primary',
    laneId: 'lane-01',
    capacity: 51,
    file: 'content/lesson-factory/assignments/primary-51.json',
  },
  {
    teamId: 'team-A',
    laneId: 'lane-02',
    capacity: 30,
    file: 'content/lesson-factory/assignments/team-A-30.json',
  },
  {
    teamId: 'team-B',
    laneId: 'lane-03',
    capacity: 30,
    file: 'content/lesson-factory/assignments/team-B-30.json',
  },
] as const;

const PROOF_FILE = 'content/lesson-factory/assignments/partition-proof.json';

const REQUIRED_HUMAN_REVIEW_ROLES = [
  'PRODUCT_PEDAGOGY_OWNER',
  'DOMAIN_CONSTRUCT_SME',
  'ACCESSIBILITY_REVIEWER',
  'NOVICE_WALKTHROUGH_REVIEWER',
  'PLATFORM_RELIABILITY_REVIEWER',
  'INDEPENDENT_BLIND_SOLVER',
  'RIGHTS_REVIEWER',
] as const;

const NONCLAIMS = {
  official_rubric_pass: false,
  human_approved: false,
  release_approved: false,
  efficacy_established: false,
  mastery_calibrated: false,
  readiness_validated: false,
  learner_validated: false,
  publication_safe: false,
  production_published: false,
} as const;

const SCHEMA_ANNOTATIONS = new Set([
  '$schema',
  '$id',
  '$defs',
  '$comment',
  'title',
  'description',
  'x_contract_id',
  'x_contract_version',
]);

const SUPPORTED_SCHEMA_ASSERTIONS = new Set([
  '$ref',
  'type',
  'enum',
  'const',
  'properties',
  'required',
  'additionalProperties',
  'propertyNames',
  'minProperties',
  'maxProperties',
  'items',
  'minItems',
  'maxItems',
  'uniqueItems',
  'minLength',
  'maxLength',
  'pattern',
  'minimum',
  'maximum',
  'allOf',
  'not',
]);

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sha256Hex(text: string): string {
  return createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }
  const record = value as JsonObject;
  return `{${Object.keys(record)
    .sort(compareText)
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`;
}

function serializedJson(value: unknown): string {
  const lines = `${JSON.stringify(value, null, 2)}\n`.split('\n');
  const formatted: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const opening = /^(\s*)("[^"]+": )\[$/.exec(line);
    if (opening !== null) {
      const values: string[] = [];
      let cursor = index + 1;
      while (cursor < lines.length) {
        const item = /^\s+("(?:[^"\\]|\\.)*"),?$/.exec(lines[cursor]!);
        if (item === null) break;
        values.push(item[1]!);
        cursor += 1;
      }
      const closing = /^(\s*)\](,?)$/.exec(lines[cursor] ?? '');
      const candidate =
        closing === null ? '' : `${opening[1]}${opening[2]}[${values.join(', ')}]${closing[2]}`;
      if (values.length > 0 && candidate.length <= 100) {
        formatted.push(candidate);
        index = cursor;
        continue;
      }
    }
    formatted.push(line);
  }

  return formatted.join('\n');
}

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseJsonObject(text: string, label: string): JsonObject {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${String(error)}`);
  }
  if (!isObject(parsed)) {
    throw new Error(`${label} must contain a JSON object`);
  }
  return parsed;
}

function schemaType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (Number.isInteger(value)) return 'integer';
  return typeof value;
}

function schemaId(schema: JsonObject, label: string): string {
  if (typeof schema.$id !== 'string' || schema.$id.length === 0) {
    throw new Error(`${label} must declare a non-empty $id`);
  }
  return schema.$id;
}

function escapePointer(segment: string): string {
  return segment.replace(/~/g, '~0').replace(/\//g, '~1');
}

function resolveSchemaRef(
  ref: string,
  baseId: string,
  registry: ReadonlyMap<string, JsonObject>,
): { readonly schema: JsonSchema; readonly baseId: string } {
  const hashIndex = ref.indexOf('#');
  const uri = hashIndex === -1 ? ref : ref.slice(0, hashIndex);
  const fragment = hashIndex === -1 ? '' : ref.slice(hashIndex + 1);
  const targetId = uri === '' ? baseId : new URL(uri, baseId).href;
  const document = registry.get(targetId);
  if (document === undefined) {
    throw new Error(`assignment schema has an unresolvable $ref "${ref}"`);
  }
  if (fragment === '') return { schema: document, baseId: targetId };
  if (!fragment.startsWith('/')) {
    throw new Error(`assignment schema has an unsupported $ref fragment "${ref}"`);
  }
  let target: unknown = document;
  for (const encodedSegment of fragment.slice(1).split('/')) {
    const segment = encodedSegment.replace(/~1/g, '/').replace(/~0/g, '~');
    if (!isObject(target) || !(segment in target)) {
      throw new Error(`assignment schema has an unresolvable $ref "${ref}"`);
    }
    target = target[segment];
  }
  if (typeof target !== 'boolean' && !isObject(target)) {
    throw new Error(`assignment schema $ref "${ref}" does not resolve to a schema`);
  }
  return { schema: target, baseId: targetId };
}

function validateSchemaNode(
  schema: JsonSchema,
  data: unknown,
  baseId: string,
  registry: ReadonlyMap<string, JsonObject>,
  path: string,
  errors: string[],
): void {
  if (schema === true) return;
  if (schema === false) {
    errors.push(`${path}: schema rejects every value`);
    return;
  }

  for (const keyword of Object.keys(schema)) {
    if (!SCHEMA_ANNOTATIONS.has(keyword) && !SUPPORTED_SCHEMA_ASSERTIONS.has(keyword)) {
      throw new Error(
        `assignment schema uses unsupported keyword "${keyword}" at ${path}; refusing to validate partially`,
      );
    }
  }

  if (typeof schema.$ref === 'string') {
    const target = resolveSchemaRef(schema.$ref, baseId, registry);
    validateSchemaNode(target.schema, data, target.baseId, registry, path, errors);
  } else if (schema.$ref !== undefined) {
    throw new Error(`assignment schema has a non-string $ref at ${path}`);
  }

  if (schema.allOf !== undefined) {
    if (!Array.isArray(schema.allOf)) {
      throw new Error(`assignment schema has invalid allOf at ${path}`);
    }
    for (const branch of schema.allOf) {
      if (typeof branch !== 'boolean' && !isObject(branch)) {
        throw new Error(`assignment schema has an invalid allOf branch at ${path}`);
      }
      validateSchemaNode(branch, data, baseId, registry, path, errors);
    }
  }

  if (schema.not !== undefined) {
    if (typeof schema.not !== 'boolean' && !isObject(schema.not)) {
      throw new Error(`assignment schema has invalid not at ${path}`);
    }
    const branchErrors: string[] = [];
    validateSchemaNode(schema.not, data, baseId, registry, path, branchErrors);
    if (branchErrors.length === 0) {
      errors.push(`${path}: value matches a forbidden \`not\` schema`);
    }
  }

  if (schema.type !== undefined) {
    const expectedTypes = Array.isArray(schema.type) ? schema.type : [schema.type];
    const actualType = schemaType(data);
    const matches = expectedTypes.some(
      (candidate) =>
        candidate === actualType || (candidate === 'number' && actualType === 'integer'),
    );
    if (!matches) {
      errors.push(
        `${path}: expected type ${expectedTypes.map(String).join('|')} but found ${actualType}`,
      );
      return;
    }
  }

  if (schema.const !== undefined && canonicalJson(data) !== canonicalJson(schema.const)) {
    errors.push(`${path}: value does not match schema const`);
  }

  if (
    Array.isArray(schema.enum) &&
    !schema.enum.map((value) => canonicalJson(value)).includes(canonicalJson(data))
  ) {
    errors.push(`${path}: value is not in schema enum`);
  }

  if (typeof data === 'string') {
    if (typeof schema.minLength === 'number' && data.length < schema.minLength) {
      errors.push(`${path}: string is shorter than minLength ${schema.minLength}`);
    }
    if (typeof schema.maxLength === 'number' && data.length > schema.maxLength) {
      errors.push(`${path}: string is longer than maxLength ${schema.maxLength}`);
    }
    if (typeof schema.pattern === 'string' && !new RegExp(schema.pattern, 'u').test(data)) {
      errors.push(`${path}: string does not match pattern ${schema.pattern}`);
    }
  }

  if (typeof data === 'number') {
    if (typeof schema.minimum === 'number' && data < schema.minimum) {
      errors.push(`${path}: number is less than minimum ${schema.minimum}`);
    }
    if (typeof schema.maximum === 'number' && data > schema.maximum) {
      errors.push(`${path}: number is greater than maximum ${schema.maximum}`);
    }
  }

  if (Array.isArray(data)) {
    if (typeof schema.minItems === 'number' && data.length < schema.minItems) {
      errors.push(`${path}: array has fewer than ${schema.minItems} items`);
    }
    if (typeof schema.maxItems === 'number' && data.length > schema.maxItems) {
      errors.push(`${path}: array has more than ${schema.maxItems} items`);
    }
    if (schema.uniqueItems === true) {
      const seen = new Set<string>();
      for (const item of data) {
        const canonical = canonicalJson(item);
        if (seen.has(canonical)) errors.push(`${path}: array contains a duplicate item`);
        seen.add(canonical);
      }
    }
    if (schema.items !== undefined) {
      if (typeof schema.items !== 'boolean' && !isObject(schema.items)) {
        throw new Error(`assignment schema has invalid items at ${path}`);
      }
      data.forEach((item, index) => {
        validateSchemaNode(
          schema.items as JsonSchema,
          item,
          baseId,
          registry,
          `${path}/${index}`,
          errors,
        );
      });
    }
  }

  if (isObject(data)) {
    const properties = schema.properties;
    if (properties !== undefined && !isObject(properties)) {
      throw new Error(`assignment schema has invalid properties at ${path}`);
    }
    if (schema.required !== undefined && !Array.isArray(schema.required)) {
      throw new Error(`assignment schema has invalid required list at ${path}`);
    }
    if (Array.isArray(schema.required)) {
      for (const required of schema.required) {
        if (typeof required !== 'string') {
          throw new Error(`assignment schema has a non-string required property at ${path}`);
        }
        if (!(required in data)) {
          errors.push(`${path}: required property "${required}" is missing`);
        }
      }
    }
    const keys = Object.keys(data);
    if (typeof schema.minProperties === 'number' && keys.length < schema.minProperties) {
      errors.push(`${path}: object has fewer than ${schema.minProperties} properties`);
    }
    if (typeof schema.maxProperties === 'number' && keys.length > schema.maxProperties) {
      errors.push(`${path}: object has more than ${schema.maxProperties} properties`);
    }
    const propertySchemas = isObject(properties) ? properties : {};
    for (const [key, value] of Object.entries(data)) {
      if (schema.propertyNames !== undefined) {
        if (typeof schema.propertyNames !== 'boolean' && !isObject(schema.propertyNames)) {
          throw new Error(`assignment schema has invalid propertyNames at ${path}`);
        }
        validateSchemaNode(
          schema.propertyNames,
          key,
          baseId,
          registry,
          `${path}/${escapePointer(key)}<name>`,
          errors,
        );
      }
      const childSchema = propertySchemas[key];
      if (childSchema !== undefined) {
        if (typeof childSchema !== 'boolean' && !isObject(childSchema)) {
          throw new Error(`assignment schema property ${path}/${escapePointer(key)} is invalid`);
        }
        validateSchemaNode(
          childSchema,
          value,
          baseId,
          registry,
          `${path}/${escapePointer(key)}`,
          errors,
        );
      } else if (schema.additionalProperties === false) {
        errors.push(`${path}: additional property "${key}" is not allowed`);
      } else if (
        schema.additionalProperties !== undefined &&
        schema.additionalProperties !== true
      ) {
        if (
          typeof schema.additionalProperties !== 'boolean' &&
          !isObject(schema.additionalProperties)
        ) {
          throw new Error(`assignment schema has invalid additionalProperties at ${path}`);
        }
        validateSchemaNode(
          schema.additionalProperties as JsonSchema,
          value,
          baseId,
          registry,
          `${path}/${escapePointer(key)}`,
          errors,
        );
      }
    }
  }
}

function validateDocument(
  document: unknown,
  schemaText: string,
  sharedVocabularySchemaText: string,
  schemaLabel: string,
): string[] {
  const primarySchema = parseJsonObject(schemaText, schemaLabel);
  const sharedSchema = parseJsonObject(
    sharedVocabularySchemaText,
    'WP-01 shared-vocabulary schema',
  );
  const primarySchemaId = schemaId(primarySchema, schemaLabel);
  const sharedSchemaId = schemaId(sharedSchema, 'WP-01 shared-vocabulary schema');
  const registry = new Map<string, JsonObject>([
    [primarySchemaId, primarySchema],
    [sharedSchemaId, sharedSchema],
  ]);
  const errors: string[] = [];
  validateSchemaNode(primarySchema, document, primarySchemaId, registry, '<root>', errors);
  return errors;
}

export function validateAssignmentManifest(
  document: unknown,
  assignmentSchemaText: string,
  sharedVocabularySchemaText: string,
): string[] {
  return validateDocument(
    document,
    assignmentSchemaText,
    sharedVocabularySchemaText,
    'WP-01 assignment-manifest schema',
  );
}

export function validateAssignmentPartitionProof(
  document: unknown,
  proofSchemaText: string,
  sharedVocabularySchemaText: string,
): string[] {
  return validateDocument(
    document,
    proofSchemaText,
    sharedVocabularySchemaText,
    'WP-02 assignment-partition-proof schema',
  );
}

function canonicalLessons(manifestText: string): {
  readonly manifest: JsonObject;
  readonly lessons: readonly CanonicalLesson[];
} {
  const manifest = parseJsonObject(manifestText, 'curriculum manifest');
  const curriculum = manifest.curriculum;
  if (!isObject(curriculum) || !Array.isArray(curriculum.lessons)) {
    throw new Error('curriculum manifest must contain curriculum.lessons as an array');
  }
  if (curriculum.lessons.length !== CANONICAL_LESSON_COUNT) {
    throw new Error(
      `expected exactly 114 canonical lesson rows at curriculum.lessons; found ${curriculum.lessons.length}`,
    );
  }

  const seenIds = new Set<string>();
  const lessons: CanonicalLesson[] = curriculum.lessons.map((rawRow, index) => {
    if (!isObject(rawRow)) {
      throw new Error(`curriculum.lessons[${index}] must be an object`);
    }
    const lessonId = rawRow.lesson_id;
    if (typeof lessonId !== 'string' || lessonId.trim() === '') {
      throw new Error(`curriculum.lessons[${index}] must have a non-empty lesson_id`);
    }
    if (!/^V3-LES-[0-9]{6}$/.test(lessonId)) {
      throw new Error(`curriculum.lessons[${index}] has non-canonical lesson_id ${lessonId}`);
    }
    if (seenIds.has(lessonId)) {
      throw new Error(`duplicate lesson_id ${lessonId} in curriculum.lessons`);
    }
    seenIds.add(lessonId);

    const displayLabel = rawRow.canonical_display_label;
    if (typeof displayLabel !== 'string' || displayLabel.trim() === '') {
      throw new Error(`curriculum.lessons[${index}] must have a non-empty canonical_display_label`);
    }

    const sourceSections = rawRow.source_sections;
    if (!Array.isArray(sourceSections) || sourceSections.length === 0) {
      throw new Error(`curriculum.lessons[${index}] must have non-empty source_sections`);
    }
    const normalizedSections = sourceSections.map((section, sectionIndex) => {
      if (typeof section !== 'string' || section.trim() === '') {
        throw new Error(
          `curriculum.lessons[${index}].source_sections[${sectionIndex}] must be non-empty`,
        );
      }
      return section.trim();
    });
    if (new Set(normalizedSections).size !== normalizedSections.length) {
      throw new Error(`curriculum.lessons[${index}] has duplicate source_sections`);
    }

    return {
      lessonId,
      displayLabel: displayLabel.trim(),
      bucket: [...normalizedSections].sort(compareText).join('+'),
    };
  });

  for (const existingId of EXISTING_LESSON_IDS) {
    if (!seenIds.has(existingId)) {
      throw new Error(`existing lesson ID ${existingId} is not canonical in curriculum.lessons`);
    }
  }
  const remaining = lessons.filter(
    (lesson) => !EXISTING_LESSON_IDS.includes(lesson.lessonId as never),
  );
  if (remaining.length !== REMAINING_LESSON_COUNT) {
    throw new Error(
      `expected exactly 111 lessons after excluding the existing three; found ${remaining.length}`,
    );
  }
  return { manifest, lessons: remaining };
}

function initialBucketAllocations(lessons: readonly CanonicalLesson[]): BucketAllocation[] {
  const byBucket = new Map<string, CanonicalLesson[]>();
  for (const lesson of lessons) {
    const bucket = byBucket.get(lesson.bucket) ?? [];
    bucket.push(lesson);
    byBucket.set(lesson.bucket, bucket);
  }

  return [...byBucket.entries()]
    .sort(([left], [right]) => compareText(left, right))
    .map(([bucket, bucketLessons]) => {
      const sortedLessons = [...bucketLessons].sort((left, right) =>
        compareText(left.lessonId, right.lessonId),
      );
      const counts: Record<AssignmentTeamId, number> = {
        primary: 0,
        'team-A': 0,
        'team-B': 0,
      };
      const remainders = TEAM_SPECS.map((team, teamOrder) => {
        const numerator = sortedLessons.length * team.capacity;
        counts[team.teamId] = Math.floor(numerator / REMAINING_LESSON_COUNT);
        return {
          team,
          teamOrder,
          remainder: numerator % REMAINING_LESSON_COUNT,
        };
      });
      const extras = sortedLessons.length - Object.values(counts).reduce((sum, n) => sum + n, 0);
      remainders
        .sort((left, right) => right.remainder - left.remainder || left.teamOrder - right.teamOrder)
        .slice(0, extras)
        .forEach(({ team }) => {
          counts[team.teamId] += 1;
        });

      let offset = 0;
      const byTeam: Record<AssignmentTeamId, CanonicalLesson[]> = {
        primary: [],
        'team-A': [],
        'team-B': [],
      };
      for (const team of TEAM_SPECS) {
        const end = offset + counts[team.teamId];
        byTeam[team.teamId] = sortedLessons.slice(offset, end);
        offset = end;
      }
      return { bucket, size: sortedLessons.length, byTeam };
    });
}

function allocationTotals(
  allocations: readonly BucketAllocation[],
): Record<AssignmentTeamId, number> {
  const totals: Record<AssignmentTeamId, number> = {
    primary: 0,
    'team-A': 0,
    'team-B': 0,
  };
  for (const allocation of allocations) {
    for (const team of TEAM_SPECS) {
      totals[team.teamId] += allocation.byTeam[team.teamId].length;
    }
  }
  return totals;
}

function absoluteQuotaError(count: number, bucketSize: number, capacity: number): number {
  return Math.abs(count * REMAINING_LESSON_COUNT - bucketSize * capacity);
}

function reconcileCapacities(allocations: BucketAllocation[]): void {
  const totals = allocationTotals(allocations);
  let moves = 0;

  while (TEAM_SPECS.some((team) => totals[team.teamId] !== team.capacity)) {
    const over = TEAM_SPECS.filter((team) => totals[team.teamId] > team.capacity);
    const under = TEAM_SPECS.filter((team) => totals[team.teamId] < team.capacity);
    if (over.length === 0 || under.length === 0 || moves >= REMAINING_LESSON_COUNT) {
      throw new Error('capacity mismatch cannot be reconciled');
    }

    const candidates: {
      allocation: BucketAllocation;
      source: TeamSpec;
      destination: TeamSpec;
      lesson: CanonicalLesson;
      deltaNumerator: number;
      deltaDenominator: number;
      sourceOrder: number;
      destinationOrder: number;
    }[] = [];

    for (const allocation of allocations) {
      for (const source of over) {
        const sourceOrder = TEAM_SPECS.indexOf(source);
        for (const lesson of allocation.byTeam[source.teamId]) {
          for (const destination of under) {
            const destinationOrder = TEAM_SPECS.indexOf(destination);
            const sourceCount = allocation.byTeam[source.teamId].length;
            const destinationCount = allocation.byTeam[destination.teamId].length;
            const before =
              absoluteQuotaError(sourceCount, allocation.size, source.capacity) +
              absoluteQuotaError(destinationCount, allocation.size, destination.capacity);
            const after =
              absoluteQuotaError(sourceCount - 1, allocation.size, source.capacity) +
              absoluteQuotaError(destinationCount + 1, allocation.size, destination.capacity);
            candidates.push({
              allocation,
              source,
              destination,
              lesson,
              deltaNumerator: after - before,
              deltaDenominator: allocation.size,
              sourceOrder,
              destinationOrder,
            });
          }
        }
      }
    }

    candidates.sort((left, right) => {
      const distortionComparison =
        left.deltaNumerator * right.deltaDenominator - right.deltaNumerator * left.deltaDenominator;
      return (
        distortionComparison ||
        compareText(left.allocation.bucket, right.allocation.bucket) ||
        compareText(left.lesson.lessonId, right.lesson.lessonId) ||
        left.sourceOrder - right.sourceOrder ||
        left.destinationOrder - right.destinationOrder
      );
    });

    const selected = candidates[0];
    if (selected === undefined) {
      throw new Error('capacity mismatch has no deterministic reconciliation move');
    }
    const sourceRows = selected.allocation.byTeam[selected.source.teamId];
    const sourceIndex = sourceRows.findIndex(
      (lesson) => lesson.lessonId === selected.lesson.lessonId,
    );
    if (sourceIndex < 0) throw new Error('reconciliation selected a missing lesson');
    sourceRows.splice(sourceIndex, 1);
    selected.allocation.byTeam[selected.destination.teamId].push(selected.lesson);
    selected.allocation.byTeam[selected.destination.teamId].sort((left, right) =>
      compareText(left.lessonId, right.lessonId),
    );
    totals[selected.source.teamId] -= 1;
    totals[selected.destination.teamId] += 1;
    moves += 1;
  }

  for (const team of TEAM_SPECS) {
    if (totals[team.teamId] !== team.capacity) {
      throw new Error(
        `capacity mismatch for ${team.teamId}: expected ${team.capacity}, found ${totals[team.teamId]}`,
      );
    }
  }

  for (const allocation of allocations) {
    for (const team of TEAM_SPECS) {
      const actual = allocation.byTeam[team.teamId].length;
      const ideal = (allocation.size * team.capacity) / REMAINING_LESSON_COUNT;
      if (Math.abs(actual - ideal) > 1) {
        throw new Error(
          `subject-bucket proportional bound exceeded for ${allocation.bucket}/${team.teamId}`,
        );
      }
    }
  }
}

function assignedLessons(
  allocations: readonly BucketAllocation[],
  teamId: AssignmentTeamId,
): CanonicalLesson[] {
  return allocations
    .flatMap((allocation) => allocation.byTeam[teamId])
    .sort((left, right) => compareText(left.lessonId, right.lessonId));
}

function assertPartitionInvariants(
  allocations: readonly BucketAllocation[],
  remainingLessons: readonly CanonicalLesson[],
): void {
  const sets = TEAM_SPECS.map(
    (team) => new Set(assignedLessons(allocations, team.teamId).map((lesson) => lesson.lessonId)),
  );
  for (let left = 0; left < sets.length; left += 1) {
    for (let right = left + 1; right < sets.length; right += 1) {
      if ([...sets[left]!].some((lessonId) => sets[right]!.has(lessonId))) {
        throw new Error('assignment sets are not pairwise disjoint');
      }
    }
  }
  const union = new Set(sets.flatMap((set) => [...set]));
  const expected = [...remainingLessons].map((lesson) => lesson.lessonId).sort(compareText);
  if (union.size !== REMAINING_LESSON_COUNT) {
    throw new Error(`assignment union must contain exactly 111 lessons; found ${union.size}`);
  }
  if ([...union].sort(compareText).some((lessonId, index) => lessonId !== expected[index])) {
    throw new Error('assignment union does not equal the 111 remaining canonical lesson IDs');
  }
  if (EXISTING_LESSON_IDS.some((lessonId) => union.has(lessonId))) {
    throw new Error('assignment union includes an existing lesson ID');
  }
}

function assignmentId(team: TeamSpec): string {
  const number = TEAM_SPECS.indexOf(team) + 1;
  return `${ASSIGNMENT_ID_PREFIX}${String(number).padStart(2, '0')}`;
}

function createAllocationArtifact(
  allocations: readonly BucketAllocation[],
  team: TeamSpec,
): AssignmentAllocationArtifact {
  const id = assignmentId(team);
  const rows = assignedLessons(allocations, team.teamId).map((lesson) => {
    const slug = lesson.lessonId.toLowerCase();
    const outputPath = `.tmp/lesson-factory/${team.laneId}/${slug}`;
    return {
      lesson_id: lesson.lessonId,
      display_label: lesson.displayLabel,
      source_section_bucket: lesson.bucket,
      slug,
      output_path: outputPath,
      assignment_id: id,
      team_id: team.teamId,
      lane_id: team.laneId,
    } satisfies AssignmentProofRow;
  });

  return {
    teamId: team.teamId,
    laneId: team.laneId,
    assignmentId: id,
    rows,
  };
}

function exactContract(
  schema: JsonObject,
  expectedId: string,
  expectedVersion: string,
  label: string,
): void {
  if (schema.x_contract_id !== expectedId) {
    throw new Error(`${label} is incompatible: x_contract_id must be ${expectedId}`);
  }
  if (schema.x_contract_version !== expectedVersion) {
    throw new Error(`${label} is incompatible: x_contract_version must be ${expectedVersion}`);
  }
}

function exactDocumentContract(
  document: JsonObject,
  expectedId: string,
  expectedVersion: string,
  label: string,
): void {
  if (document.contract_id !== expectedId || document.contract_version !== expectedVersion) {
    throw new Error(
      `${label} is incompatible: expected ${expectedId} ${expectedVersion}, found ${String(
        document.contract_id,
      )} ${String(document.contract_version)}`,
    );
  }
}

function authorityPin(
  path: string,
  document: JsonObject,
  text: string,
  contractId: string,
  contractVersion: string,
): AuthorityPin {
  return {
    path,
    contract_id: contractId,
    contract_version: contractVersion,
    content_sha256: sha256Hex(canonicalJson(document)),
    file_sha256: sha256Hex(text),
  };
}

export function createAssignmentAllocation(
  input: AssignmentPartitionInput,
): AssignmentAllocationResult {
  if (TEAM_SPECS.reduce((sum, team) => sum + team.capacity, 0) !== REMAINING_LESSON_COUNT) {
    throw new Error('configured assignment capacities must sum to exactly 111');
  }
  if (
    TEAM_SPECS[0]?.capacity !== 51 ||
    TEAM_SPECS[1]?.capacity !== 30 ||
    TEAM_SPECS[2]?.capacity !== 30
  ) {
    throw new Error('configured assignment capacities must be exactly 51/30/30');
  }

  const { manifest, lessons } = canonicalLessons(input.manifestText);
  const assignmentSchema = parseJsonObject(
    input.assignmentSchemaText,
    'WP-01 assignment-manifest schema',
  );
  const proofSchema = parseJsonObject(
    input.proofSchemaText,
    'WP-02 assignment-partition-proof schema',
  );
  const sharedVocabularySchema = parseJsonObject(
    input.sharedVocabularySchemaText,
    'WP-01 shared-vocabulary schema',
  );
  const taskPacketSchema = parseJsonObject(
    input.taskPacketSchemaText,
    'WP-01 task-source-packet schema',
  );
  const deadlineProfile = parseJsonObject(input.deadlineProfileText, 'WP-01 deadline profile');
  const releasePolicy = parseJsonObject(input.releasePolicyText, 'WP-01 release policy');
  const ownerSourceUseReceipt = parseJsonObject(
    input.ownerSourceUseReceiptText,
    'WP-01 owner source-use receipt',
  );
  exactContract(
    assignmentSchema,
    'lesson-factory.assignment-manifest',
    '3.0.0',
    'WP-01 assignment schema',
  );
  exactContract(
    proofSchema,
    'lesson-factory.assignment-partition-proof',
    '2.0.0',
    'WP-02 proof schema',
  );
  exactContract(
    sharedVocabularySchema,
    'lesson-factory.shared-vocabulary',
    '5.0.0',
    'WP-01 shared vocabulary',
  );
  exactContract(
    taskPacketSchema,
    'lesson-factory.task-source-packet',
    '5.0.0',
    'WP-01 task packet schema',
  );
  exactDocumentContract(
    deadlineProfile,
    'lesson-factory.deadline-profile',
    '7.0.0',
    'WP-01 deadline profile',
  );
  exactDocumentContract(
    releasePolicy,
    'lesson-factory.release-policy',
    '3.0.0',
    'WP-01 release policy',
  );
  exactDocumentContract(
    ownerSourceUseReceipt,
    'lesson-factory.owner-source-use-receipt',
    '2.0.0',
    'WP-01 owner source-use receipt',
  );
  const expectedDeadlineProfileRef = `profile:${input.deadlineProfilePath}#sha256:${sha256Hex(
    input.deadlineProfileText,
  )}`;
  const expectedReleasePolicyRef = `policy:${input.releasePolicyPath}#sha256:${sha256Hex(
    input.releasePolicyText,
  )}`;
  if (
    input.createdAt !== deadlineProfile.frozen_at ||
    input.deadlineProfileRef !== expectedDeadlineProfileRef ||
    input.releasePolicyRef !== expectedReleasePolicyRef ||
    deadlineProfile.release_policy_ref !== expectedReleasePolicyRef ||
    canonicalJson(input.rubricIdentity) !== canonicalJson(deadlineProfile.rubric_identity)
  ) {
    throw new Error('WP-02 allocation inputs do not match the exact current deadline authorities');
  }

  const allocations = initialBucketAllocations(lessons);
  reconcileCapacities(allocations);
  assertPartitionInvariants(allocations, lessons);

  const assignmentGroups = TEAM_SPECS.map((team) => createAllocationArtifact(allocations, team));

  const allRows = assignmentGroups.flatMap((assignment) => assignment.rows);
  const slugs = new Set(allRows.map((row) => row.slug));
  const outputPaths = new Set(allRows.map((row) => row.output_path));
  if (slugs.size !== REMAINING_LESSON_COUNT) {
    throw new Error(`assignment rows contain duplicate slugs; found ${slugs.size} unique`);
  }
  if (outputPaths.size !== REMAINING_LESSON_COUNT) {
    throw new Error(
      `assignment rows contain duplicate output paths; found ${outputPaths.size} unique`,
    );
  }

  const capacities = Object.fromEntries(
    TEAM_SPECS.map((team) => [team.teamId, team.capacity]),
  ) as Record<AssignmentTeamId, number>;
  const proofAssignments = assignmentGroups.map((assignment) => {
    const subjectDistribution: Record<string, number> = {};
    for (const allocation of allocations) {
      subjectDistribution[allocation.bucket] = allocation.byTeam[assignment.teamId].length;
    }
    return {
      team_id: assignment.teamId,
      lane_id: assignment.laneId,
      assignment_id: assignment.assignmentId,
      assignment_file: TEAM_SPECS.find((team) => team.teamId === assignment.teamId)!.file,
      count: assignment.rows.length,
      subject_distribution: subjectDistribution,
      rows: assignment.rows,
    };
  });
  const allocationContentSha256 = sha256Hex(canonicalJson(proofAssignments));
  const proof: AssignmentPartitionProof = {
    contract_id: 'lesson-factory.assignment-partition-proof',
    contract_version: '2.0.0',
    run_id: String(deadlineProfile.profile_id),
    created_at: input.createdAt,
    deadline_profile_ref: input.deadlineProfileRef,
    release_policy_ref: input.releasePolicyRef,
    source_use_receipt_ref: `source-use-receipt:${
      input.ownerSourceUseReceiptPath
    }#sha256:${sha256Hex(input.ownerSourceUseReceiptText)}`,
    rubric_identity: { ...input.rubricIdentity },
    source_manifest: {
      path: input.sourceManifestPath,
      content_sha256: sha256Hex(canonicalJson(manifest)),
      file_sha256: sha256Hex(input.manifestText),
      canonical_lesson_count: CANONICAL_LESSON_COUNT,
      remaining_lesson_count: REMAINING_LESSON_COUNT,
    },
    assignment_schema: {
      path: input.assignmentSchemaPath,
      contract_id: 'lesson-factory.assignment-manifest',
      contract_version: '3.0.0',
      content_sha256: sha256Hex(canonicalJson(assignmentSchema)),
      file_sha256: sha256Hex(input.assignmentSchemaText),
      shared_vocabulary_file_sha256: sha256Hex(input.sharedVocabularySchemaText),
    },
    proof_schema: {
      path: input.proofSchemaPath,
      contract_id: 'lesson-factory.assignment-partition-proof',
      contract_version: '2.0.0',
      content_sha256: sha256Hex(canonicalJson(proofSchema)),
      file_sha256: sha256Hex(input.proofSchemaText),
    },
    packet_authorities: {
      shared_vocabulary_schema: authorityPin(
        input.sharedVocabularySchemaPath,
        sharedVocabularySchema,
        input.sharedVocabularySchemaText,
        'lesson-factory.shared-vocabulary',
        '5.0.0',
      ),
      task_packet_schema: authorityPin(
        input.taskPacketSchemaPath,
        taskPacketSchema,
        input.taskPacketSchemaText,
        'lesson-factory.task-source-packet',
        '5.0.0',
      ),
      deadline_profile: {
        ...authorityPin(
          input.deadlineProfilePath,
          deadlineProfile,
          input.deadlineProfileText,
          'lesson-factory.deadline-profile',
          '7.0.0',
        ),
        profile_id: String(deadlineProfile.profile_id),
        profile_version: String(deadlineProfile.profile_version),
      },
      release_policy: {
        ...authorityPin(
          input.releasePolicyPath,
          releasePolicy,
          input.releasePolicyText,
          'lesson-factory.release-policy',
          '3.0.0',
        ),
        policy_id: String(releasePolicy.policy_id),
        policy_version: String(releasePolicy.policy_version),
      },
      owner_source_use_receipt: {
        ...authorityPin(
          input.ownerSourceUseReceiptPath,
          ownerSourceUseReceipt,
          input.ownerSourceUseReceiptText,
          'lesson-factory.owner-source-use-receipt',
          '2.0.0',
        ),
        receipt_id: String(ownerSourceUseReceipt.receipt_id),
      },
    },
    authoring_scope: {
      disposition: 'AUTHORING_GENERATION_ONLY',
      canonical_lesson_count: 114,
      generation_lesson_count: 111,
      excluded_existing_lesson_count: 3,
      generation_rows_disjoint_from_exclusions: true,
      generation_rows_union_exclusions_equals_canonical: true,
    },
    excluded_existing_lesson_ids: [...EXISTING_LESSON_IDS],
    capacities,
    algorithm: {
      bucket_key: 'sorted source_sections joined with +',
      initial_apportionment: 'largest remainder',
      reconciliation: 'minimum proportional distortion',
      tie_breakers: ['bucket', 'lesson_id', 'team order'],
    },
    assignments: proofAssignments,
    invariants: {
      pairwise_disjoint: true,
      union_equals_remaining: true,
      existing_three_excluded: true,
      rows_union_exclusions_equals_canonical: true,
      unique_slugs: true,
      unique_output_paths: true,
      proof_schema_valid: true,
    },
    allocation_content_sha256: allocationContentSha256,
  };
  const validationErrors = validateAssignmentPartitionProof(
    proof,
    input.proofSchemaText,
    input.sharedVocabularySchemaText,
  );
  if (validationErrors.length > 0) {
    throw new Error(
      `WP-02 assignment partition proof schema validation failed:\n${validationErrors.join('\n')}`,
    );
  }
  const proofBytes = serializedJson(proof);
  const files = { [PROOF_FILE]: proofBytes };

  return {
    allocations: assignmentGroups,
    assignments: assignmentGroups,
    proof,
    proofBytes,
    files,
    allocationContentSha256,
    outputSetSha256: sha256Hex(canonicalJson(files)),
  };
}

export function createAssignmentPartition(
  input: AssignmentPartitionInput,
): AssignmentPartitionResult {
  return createAssignmentAllocation(input);
}

export function parseAssignmentPartitionProof(
  input: AssignmentProofParserInput,
): ParsedAssignmentPartitionProof {
  const validationErrors = validateAssignmentPartitionProof(
    input.allocationProof,
    input.proofSchemaText,
    input.sharedVocabularySchemaText,
  );
  if (validationErrors.length > 0) {
    throw new Error(
      `WP-02 assignment partition proof schema validation failed:\n${validationErrors.join('\n')}`,
    );
  }
  const proof = input.allocationProof as AssignmentPartitionProof;
  const assignmentSchema = parseJsonObject(
    input.assignmentSchemaText,
    'WP-01 assignment-manifest schema',
  );
  const proofSchema = parseJsonObject(
    input.proofSchemaText,
    'WP-02 assignment-partition-proof schema',
  );
  const sharedVocabularySchema = parseJsonObject(
    input.sharedVocabularySchemaText,
    'WP-01 shared-vocabulary schema',
  );
  const taskPacketSchema = parseJsonObject(
    input.taskPacketSchemaText,
    'WP-01 task-source-packet schema',
  );
  const deadlineProfile = parseJsonObject(input.deadlineProfileText, 'WP-01 deadline profile');
  const releasePolicy = parseJsonObject(input.releasePolicyText, 'WP-01 release policy');
  const ownerSourceUseReceipt = parseJsonObject(
    input.ownerSourceUseReceiptText,
    'WP-01 owner source-use receipt',
  );
  const { manifest, lessons } = canonicalLessons(input.manifestText);
  exactContract(
    assignmentSchema,
    'lesson-factory.assignment-manifest',
    '3.0.0',
    'WP-01 assignment schema',
  );
  exactContract(
    proofSchema,
    'lesson-factory.assignment-partition-proof',
    '2.0.0',
    'WP-02 proof schema',
  );
  exactContract(
    sharedVocabularySchema,
    'lesson-factory.shared-vocabulary',
    '5.0.0',
    'WP-01 shared vocabulary',
  );
  exactContract(
    taskPacketSchema,
    'lesson-factory.task-source-packet',
    '5.0.0',
    'WP-01 task packet schema',
  );
  exactDocumentContract(
    deadlineProfile,
    'lesson-factory.deadline-profile',
    '7.0.0',
    'WP-01 deadline profile',
  );
  exactDocumentContract(
    releasePolicy,
    'lesson-factory.release-policy',
    '3.0.0',
    'WP-01 release policy',
  );
  exactDocumentContract(
    ownerSourceUseReceipt,
    'lesson-factory.owner-source-use-receipt',
    '2.0.0',
    'WP-01 owner source-use receipt',
  );
  const expectedDeadlineRef = `profile:${
    proof.packet_authorities.deadline_profile.path
  }#sha256:${sha256Hex(input.deadlineProfileText)}`;
  const expectedPolicyRef = `policy:${
    proof.packet_authorities.release_policy.path
  }#sha256:${sha256Hex(input.releasePolicyText)}`;
  const expectedReceiptRef = `source-use-receipt:${
    proof.packet_authorities.owner_source_use_receipt.path
  }#sha256:${sha256Hex(input.ownerSourceUseReceiptText)}`;
  const expectedAuthorities: AssignmentPartitionProof['packet_authorities'] = {
    shared_vocabulary_schema: authorityPin(
      proof.packet_authorities.shared_vocabulary_schema.path,
      sharedVocabularySchema,
      input.sharedVocabularySchemaText,
      'lesson-factory.shared-vocabulary',
      '5.0.0',
    ),
    task_packet_schema: authorityPin(
      proof.packet_authorities.task_packet_schema.path,
      taskPacketSchema,
      input.taskPacketSchemaText,
      'lesson-factory.task-source-packet',
      '5.0.0',
    ),
    deadline_profile: {
      ...authorityPin(
        proof.packet_authorities.deadline_profile.path,
        deadlineProfile,
        input.deadlineProfileText,
        'lesson-factory.deadline-profile',
        '7.0.0',
      ),
      profile_id: String(deadlineProfile.profile_id),
      profile_version: String(deadlineProfile.profile_version),
    },
    release_policy: {
      ...authorityPin(
        proof.packet_authorities.release_policy.path,
        releasePolicy,
        input.releasePolicyText,
        'lesson-factory.release-policy',
        '3.0.0',
      ),
      policy_id: String(releasePolicy.policy_id),
      policy_version: String(releasePolicy.policy_version),
    },
    owner_source_use_receipt: {
      ...authorityPin(
        proof.packet_authorities.owner_source_use_receipt.path,
        ownerSourceUseReceipt,
        input.ownerSourceUseReceiptText,
        'lesson-factory.owner-source-use-receipt',
        '2.0.0',
      ),
      receipt_id: String(ownerSourceUseReceipt.receipt_id),
    },
  };
  if (
    proof.run_id !== deadlineProfile.profile_id ||
    proof.created_at !== deadlineProfile.frozen_at ||
    proof.deadline_profile_ref !== expectedDeadlineRef ||
    proof.release_policy_ref !== expectedPolicyRef ||
    proof.source_use_receipt_ref !== expectedReceiptRef ||
    deadlineProfile.release_policy_ref !== expectedPolicyRef ||
    canonicalJson(proof.rubric_identity) !== canonicalJson(deadlineProfile.rubric_identity) ||
    proof.source_manifest.content_sha256 !== sha256Hex(canonicalJson(manifest)) ||
    proof.source_manifest.file_sha256 !== sha256Hex(input.manifestText) ||
    proof.assignment_schema.content_sha256 !== sha256Hex(canonicalJson(assignmentSchema)) ||
    proof.assignment_schema.file_sha256 !== sha256Hex(input.assignmentSchemaText) ||
    proof.assignment_schema.shared_vocabulary_file_sha256 !==
      sha256Hex(input.sharedVocabularySchemaText) ||
    proof.proof_schema.content_sha256 !== sha256Hex(canonicalJson(proofSchema)) ||
    proof.proof_schema.file_sha256 !== sha256Hex(input.proofSchemaText) ||
    canonicalJson(proof.packet_authorities) !== canonicalJson(expectedAuthorities)
  ) {
    throw new Error(
      'allocation proof authority pins do not match the supplied packet-v5 contract bytes',
    );
  }

  if (canonicalJson(proof.excluded_existing_lesson_ids) !== canonicalJson(EXISTING_LESSON_IDS)) {
    throw new Error('allocation proof existing-corpus exclusion scope has drifted');
  }

  const allocationBuckets = initialBucketAllocations(lessons);
  reconcileCapacities(allocationBuckets);
  assertPartitionInvariants(allocationBuckets, lessons);
  const expectedArtifacts = TEAM_SPECS.map((team) =>
    createAllocationArtifact(allocationBuckets, team),
  );
  const expectedAssignments: AssignmentPartitionProof['assignments'] = expectedArtifacts.map(
    (assignment) => {
      const subjectDistribution: Record<string, number> = {};
      for (const allocation of allocationBuckets) {
        subjectDistribution[allocation.bucket] = allocation.byTeam[assignment.teamId].length;
      }
      return {
        team_id: assignment.teamId,
        lane_id: assignment.laneId,
        assignment_id: assignment.assignmentId,
        assignment_file: TEAM_SPECS.find((team) => team.teamId === assignment.teamId)!.file,
        count: assignment.rows.length,
        subject_distribution: subjectDistribution,
        rows: assignment.rows,
      };
    },
  );
  if (canonicalJson(proof.assignments) !== canonicalJson(expectedAssignments)) {
    throw new Error(
      'allocation proof rows do not preserve the deterministic 51/30/30 lane membership',
    );
  }
  if (proof.allocation_content_sha256 !== sha256Hex(canonicalJson(expectedAssignments))) {
    throw new Error('allocation proof content hash does not match its canonical assignment rows');
  }

  const seenLessons = new Set<string>();
  const seenOutputs = new Set<string>();
  for (const [index, team] of TEAM_SPECS.entries()) {
    const group = proof.assignments[index];
    if (
      group === undefined ||
      group.team_id !== team.teamId ||
      group.lane_id !== team.laneId ||
      group.assignment_id !== assignmentId(team) ||
      group.assignment_file !== team.file ||
      group.count !== team.capacity ||
      group.rows.length !== team.capacity
    ) {
      throw new Error(`allocation proof group ${index} does not match configured 51/30/30 lanes`);
    }
    for (const row of group.rows) {
      if (
        row.team_id !== team.teamId ||
        row.lane_id !== team.laneId ||
        row.assignment_id !== assignmentId(team) ||
        row.slug !== row.lesson_id.toLowerCase() ||
        row.output_path !== `.tmp/lesson-factory/${team.laneId}/${row.slug}`
      ) {
        throw new Error(`allocation proof row ${row.lesson_id} has inconsistent pinned identities`);
      }
      if (seenLessons.has(row.lesson_id) || seenOutputs.has(row.output_path)) {
        throw new Error(`allocation proof contains duplicate row identity ${row.lesson_id}`);
      }
      seenLessons.add(row.lesson_id);
      seenOutputs.add(row.output_path);
    }
  }
  if (
    proof.assignments.length !== TEAM_SPECS.length ||
    seenLessons.size !== REMAINING_LESSON_COUNT ||
    EXISTING_LESSON_IDS.some((lessonId) => seenLessons.has(lessonId))
  ) {
    throw new Error('allocation proof does not preserve the canonical 111-lesson union');
  }
  const canonicalIds = new Set(
    ((manifest.curriculum as JsonObject).lessons as JsonObject[]).map((row) =>
      String(row.lesson_id),
    ),
  );
  const scopeIds = new Set([...seenLessons, ...proof.excluded_existing_lesson_ids]);
  if (
    scopeIds.size !== CANONICAL_LESSON_COUNT ||
    [...scopeIds].some((lessonId) => !canonicalIds.has(lessonId))
  ) {
    throw new Error(
      'allocation proof generation rows and existing-corpus exclusions do not close all 114 lessons',
    );
  }
  return {
    proof,
    generationRows: proof.assignments.flatMap((assignment) => assignment.rows),
    excludedExistingLessonIds: [...proof.excluded_existing_lesson_ids],
  };
}

function verifiedProof(input: AssignmentFinalizationInput): AssignmentPartitionProof {
  return parseAssignmentPartitionProof(input).proof;
}

function finalizedTeamArtifact(
  input: AssignmentFinalizationInput,
  proof: AssignmentPartitionProof,
  team: TeamSpec,
  group: AssignmentPartitionProof['assignments'][number],
): TeamAssignmentArtifact {
  const rows = group.rows;
  const manifest: AssignmentManifest = {
    contract_id: proof.assignment_schema.contract_id,
    contract_version: proof.assignment_schema.contract_version,
    assignment_id: group.assignment_id,
    created_at: proof.created_at,
    deadline_profile_ref: proof.deadline_profile_ref,
    release_policy_ref: proof.release_policy_ref,
    rubric_identity: { ...proof.rubric_identity },
    assignments: rows.map((row) => {
      const taskPacketRef = input.packetRefs[row.lesson_id];
      if (taskPacketRef === undefined) {
        throw new Error(`missing packet reference for ${row.lesson_id}`);
      }
      const expectedPrefix = `packet:${team.laneId}/${row.slug}#sha256:`;
      if (!taskPacketRef.startsWith(expectedPrefix)) {
        throw new Error(
          `packet reference for ${row.lesson_id} must pin ${team.laneId}/${row.slug}`,
        );
      }
      return {
        lane_id: team.laneId,
        lesson_id: row.lesson_id,
        task_packet_ref: taskPacketRef,
        output_directory: row.output_path,
        max_revision_cycles: 3,
        required_human_review_roles: [...REQUIRED_HUMAN_REVIEW_ROLES],
      };
    }),
    nonclaims: { ...NONCLAIMS },
  };
  const validationErrors = validateAssignmentManifest(
    manifest,
    input.assignmentSchemaText,
    input.sharedVocabularySchemaText,
  );
  if (validationErrors.length > 0) {
    throw new Error(
      `packet reference or WP-01 assignment manifest schema validation failed for ${team.teamId}:\n${validationErrors.join('\n')}`,
    );
  }
  const bytes = serializedJson(manifest);
  return {
    teamId: team.teamId,
    laneId: team.laneId,
    assignmentId: group.assignment_id,
    manifest,
    rows,
    bytes,
    contentSha256: sha256Hex(canonicalJson(manifest)),
    fileSha256: sha256Hex(bytes),
  };
}

export function finalizeAssignmentManifests(
  input: AssignmentFinalizationInput,
): AssignmentFinalizationResult {
  const proof = verifiedProof(input);
  const expectedLessonIds = new Set(
    proof.assignments.flatMap((assignment) => assignment.rows.map((row) => row.lesson_id)),
  );
  for (const lessonId of expectedLessonIds) {
    if (!(lessonId in input.packetRefs)) {
      throw new Error(`missing packet reference for ${lessonId}`);
    }
  }
  const unexpected = Object.keys(input.packetRefs)
    .filter((lessonId) => !expectedLessonIds.has(lessonId))
    .sort(compareText);
  if (unexpected.length > 0) {
    throw new Error(`packet reference map contains unexpected lesson ID ${unexpected[0]}`);
  }

  const assignments = TEAM_SPECS.map((team, index) =>
    finalizedTeamArtifact(input, proof, team, proof.assignments[index]!),
  );
  const files = Object.fromEntries(
    assignments.map((assignment, index) => [TEAM_SPECS[index]!.file, assignment.bytes]),
  );
  const assignmentSet = Object.fromEntries(
    assignments.map((assignment) => [assignment.teamId, assignment.manifest]),
  );
  return {
    assignments,
    files,
    assignmentSetContentSha256: sha256Hex(canonicalJson(assignmentSet)),
    outputSetSha256: sha256Hex(canonicalJson(files)),
  };
}
