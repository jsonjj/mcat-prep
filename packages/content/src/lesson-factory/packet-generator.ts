import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  admitTaskSourcePacketV5,
  canonicalJson,
  diagnoseTaskSourcePacketV5,
  type TaskSourcePacketV5AdmissionDiagnostic,
  type TaskSourcePacketV5AdmissionResult,
} from '@mcat/content/lesson-factory/admission';

type JsonObject = Record<string, unknown>;
type JsonSchema = boolean | JsonObject;

export type PacketStatus = 'READY' | 'BLOCKED';

export type PacketBlockCode =
  | 'ASSIGNMENT_IDENTITY_MISMATCH'
  | 'DUPLICATE_ASSIGNMENT_IDENTITY'
  | 'DUPLICATE_LESSON_ID'
  | 'INPUT_HASH_MISMATCH'
  | 'PROHIBITED_RAW_SOURCE_TEXT'
  | 'PROHIBITED_SOURCE'
  | 'PREREQUISITE_RELATION_UNRESOLVED'
  | 'REQUIRED_DECISION_UNRESOLVED'
  | 'REQUIRED_KC_UNRESOLVED'
  | 'REQUIRED_SEQUENCE_RELATION_UNRESOLVED'
  | 'SOURCE_MAPPING_CONTRADICTION'
  | 'SOURCE_MAPPING_MISSING'
  | 'SOURCE_OCCURRENCE_MISSING'
  | 'SOURCE_RIGHTS_UNCLEARED'
  | 'SOURCE_SUMMARY_MISSING'
  | 'UNKNOWN_LESSON_ID'
  | 'WP01_CANONICAL_ADMISSION_FAILED'
  | 'WP01_SCHEMA_CANONICAL_ID_INCOMPATIBLE'
  | 'WP01_SCHEMA_VALIDATION_FAILED';

export interface PacketBlockReason {
  readonly code: PacketBlockCode;
  readonly path: string;
  readonly message: string;
}

export interface PacketRequest {
  readonly lessonId: string;
  readonly requestId: string;
}

export interface PacketSourcePaths {
  readonly assignmentProof: string;
  readonly ownerSourceUseReceipt: string;
  readonly curriculumManifest: string;
  readonly sourceCrosswalk: string;
  readonly researchRegistry: string;
  readonly taskPacketSchema: string;
  readonly sharedVocabularySchema: string;
  readonly deadlineProfile: string;
  readonly releasePolicy: string;
  readonly rubric: string;
}

export interface PacketGeneratorSources {
  readonly allocationProofText: string;
  readonly ownerSourceUseReceiptText: string;
  readonly curriculumManifestText: string;
  readonly sourceCrosswalkText: string;
  readonly researchRegistryText: string;
  readonly taskPacketSchemaText: string;
  readonly sharedVocabularySchemaText: string;
  readonly deadlineProfileText: string;
  readonly releasePolicyText: string;
  readonly rubricText: string;
  readonly paths: PacketSourcePaths;
  readonly expectedHashes: Readonly<
    Record<
      keyof PacketSourcePaths,
      {
        readonly fileSha256: string;
        readonly contentSha256: string;
      }
    >
  >;
}

export interface PacketGeneratorInput {
  readonly sources: PacketGeneratorSources;
  readonly request: PacketRequest;
}

export interface RightsSafeSourceOccurrence {
  readonly sourceOccurrenceId: string;
  readonly occurrenceKind: string;
  readonly sourceId: string;
  readonly sourceClass: 'REPOSITORY' | 'PUBLIC_PRIMARY_RESEARCH' | 'PRIVATE_COMPARISON';
  readonly officialPath: readonly string[];
  readonly officialTopic: string | null;
  readonly printedPages: readonly number[];
  readonly sourceAnchorIds: readonly string[];
  readonly derivedSummary: string | null;
  readonly scopeStatus: string | null;
  readonly authorityStatus: {
    readonly source: string;
    readonly presentDayAuthorityRefreshed: boolean;
  };
  readonly rightsStatus: 'PENDING' | 'PERMITTED' | 'RESTRICTED' | 'PROHIBITED';
  readonly derivedFieldsOnly: true;
  readonly permittedUse: readonly string[];
  readonly permissionReceiptRefs: readonly string[];
  readonly sourceUseReceiptRef: string | null;
}

export interface PacketSourceMappingAudit {
  readonly mappingId: string;
  readonly relation: string;
  readonly sourceOccurrenceIds: readonly string[];
}

export interface PacketKcAudit {
  readonly kcId: string;
  readonly label: string;
  readonly competency: string;
  readonly scopeIn: readonly string[];
  readonly scopeOut: readonly string[];
  readonly representations: readonly string[];
  readonly reasoningOperation: string;
  readonly sourceSetStatus:
    | 'EXACT_SOURCE'
    | 'MULTI_SOURCE_CORROBORATED'
    | 'BOUNDED_SOURCE_SET'
    | 'UNRESOLVED';
  readonly sourceMappings: readonly PacketSourceMappingAudit[];
  readonly sourceOccurrences: readonly RightsSafeSourceOccurrence[];
}

export interface PacketHoldAudit {
  readonly holdId: string;
  readonly issue: string;
  readonly type: string;
  readonly classification:
    | 'CONTEXTUAL_NONBLOCKING'
    | 'SAFE_INTERIM_DEFAULT'
    | 'BLOCKING_UNRESOLVED';
  readonly safeInterimCode: string;
  readonly safeInterimBehavior: string;
  readonly nonclaim: string;
  readonly blocksAuthoring: boolean;
}

export interface PacketInputHash {
  readonly path: string;
  readonly fileSha256: string;
  readonly contentSha256: string;
}

export interface PacketAttachmentAudit {
  readonly id: string;
  readonly kind: 'CAPSTONE' | 'EXTENSION' | 'SUPPORT';
  readonly ownerLessonId: string;
  readonly hostScope:
    | { readonly kind: 'LESSON' }
    | { readonly kind: 'SINGLE_KC'; readonly kcId: string }
    | { readonly kind: 'MULTI_KC'; readonly kcIds: readonly string[] }
    | { readonly kind: 'CAPSTONE'; readonly capstoneIds: readonly string[] }
    | { readonly kind: 'SECONDARY_APPLICATION'; readonly primaryLessonId: string };
  readonly declaredHostCoreIds: readonly string[];
  readonly hostCoreMembershipStatus: 'RESOLVED' | 'MISMATCH_PROVISIONAL';
  readonly creditsKcEvidence: boolean;
  readonly relationIds: readonly string[];
  readonly relationClass:
    | 'FIRST_DELIVERY'
    | 'REVISIT'
    | 'CAPSTONE_PLACEMENT'
    | 'HELD_ATTACHMENT'
    | 'LESSON_INTERNAL';
  readonly relationDirection: 'ATTACHMENT_TO_LESSON' | 'LESSON_TO_ATTACHMENT';
  readonly requiredDelivery: boolean;
  readonly lineageNonclaim?: string;
  readonly correctionRequiredAfterDeadline?: true;
}

export interface PacketPrerequisiteAudit {
  readonly lessonId: string;
  readonly relationIds: readonly string[];
  readonly sourceKcIds: readonly string[];
  readonly taughtAtSequencePosition: number;
}

export interface PacketAudit {
  readonly packetId: string;
  readonly assignmentId: string;
  readonly teamId: string;
  readonly laneId: string;
  readonly lessonId: string;
  readonly canonicalSlug: string;
  readonly inputHashes: Readonly<Record<keyof PacketSourcePaths, PacketInputHash>>;
  readonly identity: {
    readonly canonicalTitle: string;
    readonly shortAlias: string;
    readonly lessonType: string;
    readonly groupingId: string;
    readonly sourceSections: readonly string[];
  };
  readonly orderedKcs: readonly PacketKcAudit[];
  readonly prerequisites: {
    readonly hard: readonly PacketPrerequisiteAudit[];
    readonly helpful: readonly {
      readonly lessonId: string;
      readonly relationIds: readonly string[];
    }[];
  };
  readonly placements: {
    readonly phaseIds: readonly string[];
    readonly moduleIds: readonly string[];
    readonly pathwayPositions: readonly {
      readonly pathwayId: string;
      readonly position: number;
      readonly relationIds: readonly string[];
    }[];
    readonly firstDeliveryRelationId: string | null;
    readonly revisitRelationIds: readonly string[];
  };
  readonly attachments: readonly PacketAttachmentAudit[];
  readonly holds: readonly PacketHoldAudit[];
  readonly sourceSanitization: {
    readonly scope: 'SELECTED_PACKET_OCCURRENCES';
    readonly consideredOccurrenceCount: number;
    readonly trustedCanonicalInput: boolean;
    readonly sanitizedRawFieldCount: number;
    readonly excludedHeldClaimCount: number;
    readonly codes: readonly string[];
  };
  readonly adaptivePolicy: {
    readonly bypassAuthorized: false;
    readonly masteryThreshold: null;
    readonly fluencyThreshold: null;
    readonly uncertaintyThreshold: null;
  };
  readonly researchEvidence: {
    readonly registryId: string;
    readonly authority: 'DESIGN_ONLY';
    readonly usedAsDomainFactAuthority: false;
    readonly nonclaim: string;
  };
  readonly releasePolicy: {
    readonly routeScopeCode: string;
    readonly applicableRoutes: readonly string[];
    readonly releasePolicyRef: string;
  };
  readonly dokAuthoring: {
    readonly itemLevelDokLabelsAuthorized: false;
    readonly requirement: string;
  };
  readonly output: {
    readonly outputDirectory: string;
    readonly canonicalTemplatePath: string;
    readonly anchorSetVersion: string;
    readonly maxRevisionCycles: number;
    readonly requiredHandoffFiles: readonly string[];
  };
}

export interface TaskPacketSourceDocument {
  readonly source_id: string;
  readonly source_class: string;
  readonly source_locator: string;
  readonly present_day_authority_refreshed: boolean;
}

export interface TaskSourcePacket {
  readonly [key: string]: unknown;
  readonly ordered_kc_ids: readonly string[];
  readonly source_documents: readonly TaskPacketSourceDocument[];
  readonly applicable_routes: readonly string[];
}

export interface PacketGenerationResult {
  readonly lessonId: string;
  readonly status: PacketStatus;
  readonly scopeClassification: 'IN_SCOPE' | 'OUT_OF_SCOPE_EXISTING' | 'UNRESOLVED';
  readonly blockReasons: readonly PacketBlockReason[];
  readonly audit: PacketAudit;
  readonly packet: TaskSourcePacket | null;
  readonly bytes: string | null;
  readonly packetContentSha256: string | null;
  readonly packetFileSha256: string | null;
  readonly outputPath: string;
  readonly quarantineRecord: TaskSourcePacket | null;
  readonly quarantineBytes: string | null;
  readonly quarantineContentSha256: string | null;
  readonly quarantineFileSha256: string | null;
  readonly quarantinePath: string | null;
  readonly canonicalAdmissionDiagnostic: CanonicalAdmissionDiagnostic | null;
}

export interface CanonicalAdmissionDiagnostic {
  readonly admission: TaskSourcePacketV5AdmissionResult['admission'];
  readonly validator: 'PACKET_SEMANTICS_V1';
  readonly status: 'PASS' | 'FAIL' | 'NOT_RUN';
  readonly errorCount: number;
  readonly stage: TaskSourcePacketV5AdmissionDiagnostic['stage'];
  readonly code: TaskSourcePacketV5AdmissionDiagnostic['code'];
  readonly paths: readonly string[];
  readonly problems: readonly string[];
}

export interface PacketBatchResult {
  readonly results: readonly PacketGenerationResult[];
  readonly readyCount: number;
  readonly blockedCount: number;
  readonly files: Readonly<Record<string, string>>;
  readonly outputSetSha256: string;
}

const INPUT_TEXT_KEYS: Readonly<Record<keyof PacketSourcePaths, keyof PacketGeneratorSources>> = {
  assignmentProof: 'allocationProofText',
  ownerSourceUseReceipt: 'ownerSourceUseReceiptText',
  curriculumManifest: 'curriculumManifestText',
  sourceCrosswalk: 'sourceCrosswalkText',
  researchRegistry: 'researchRegistryText',
  taskPacketSchema: 'taskPacketSchemaText',
  sharedVocabularySchema: 'sharedVocabularySchemaText',
  deadlineProfile: 'deadlineProfileText',
  releasePolicy: 'releasePolicyText',
  rubric: 'rubricText',
};

const ROUTE_UNIVERSE = ['STANDARD', 'CONCISE', 'MISCONCEPTION', 'PREREQUISITE_SUPPORT'] as const;

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

const CONTEXTUAL_HOLD_BEHAVIOR: Readonly<
  Record<string, { readonly code: string; readonly behavior: string; readonly nonclaim: string }>
> = {
  'V3-HOLD-110001': {
    code: 'RECORD_STALE_AUTHORITY_NONCLAIM',
    behavior:
      'Use the supplied 2020 authority ceiling and record that it is not present-day refreshed.',
    nonclaim: 'No present-day AAMC authority refresh or current endorsement is claimed.',
  },
  'V3-HOLD-110003': {
    code: 'PRESERVE_PROVISIONAL_LEARNER_VALIDATION',
    behavior:
      'Preserve the frozen KC, lesson, transfer, remediation, and sequence decisions as provisional.',
    nonclaim: 'The lesson boundary, transfer, remediation, and sequence are not learner-validated.',
  },
  'V3-HOLD-110004': {
    code: 'PRESERVE_CANONICAL_PROVISIONAL_GRAIN',
    behavior:
      'Use the frozen canonical capstone and grouping grain without claiming learner validation.',
    nonclaim: 'Capstone irreducibility and grouping grain are not learner-validated.',
  },
  'V3-HOLD-110005': {
    code: 'PRESERVE_PROVISIONAL_SEQUENCE_AND_REPRESENTATION',
    behavior:
      'Use the frozen hard-edge, representation, and sequence decisions without inventing a threshold.',
    nonclaim: 'Hard-edge necessity, representation readiness, and sequence remain provisional.',
  },
  'V3-HOLD-110007': {
    code: 'PRESERVE_CARS_BOUNDARY_WORKLOAD_NONCLAIM',
    behavior:
      'Use the frozen CARS boundary and workload while retaining the learner-validation nonclaim.',
    nonclaim: 'CARS fragmentation, progression, fading, and workload are not learner-validated.',
  },
  'V3-HOLD-110008': {
    code: 'PRESERVE_CANONICAL_CLASSIFICATION_WITHOUT_VALIDATION_CLAIM',
    behavior:
      'Preserve the canonical knowledge classification while forbidding a ratification or validation claim.',
    nonclaim:
      'Knowledge-type assignments are canonical but not human-ratified or learner-validated.',
  },
  'V3-HOLD-110009': {
    code: 'DISABLE_ADAPTIVE_BYPASS_AND_NULL_THRESHOLDS',
    behavior:
      'Keep adaptive bypass disabled and all numeric mastery, fluency, and uncertainty thresholds null.',
    nonclaim: 'No adaptive bypass or numeric threshold is calibrated or authorized.',
  },
  'V3-HOLD-110011': {
    code: 'PRESERVE_CARS_SCHEDULER_NONCLAIM',
    behavior: 'Do not invent a rolling passage-domain classification rule inside lesson authoring.',
    nonclaim: 'The CARS passage-domain scheduler classification policy is unresolved.',
  },
};

const SAFE_DEFAULT_HOLD_BEHAVIOR: Readonly<
  Record<string, { readonly code: string; readonly behavior: string; readonly nonclaim: string }>
> = {
  'V3-HOLD-110002': {
    code: 'OMIT_AMBIGUOUS_NONREQUIRED_P89_PHRASE',
    behavior:
      'Omit the printed p.89 stem-cell/CNS-regeneration phrase; retain the canonical disorder-classification scope.',
    nonclaim:
      'No permissible depth or clinical interpretation of the omitted p.89 phrase is asserted.',
  },
  'V3-HOLD-110006': {
    code: 'USE_FROZEN_CANONICAL_THREE_KC_BOUNDARY',
    behavior:
      'Use the frozen canonical three-KC lesson boundary; do not invent an alternate boundary or aggregate diagnostic interpretation.',
    nonclaim: 'The three-KC boundary and no-duplicate-state behavior remain learner-unvalidated.',
  },
  'V3-HOLD-110010': {
    code: 'EXCLUDE_DISPUTED_P91_WORDING',
    behavior:
      'Exclude the disputed p.91 wording-specific claim; author the remaining canonical associative-learning scope.',
    nonclaim: 'The disputed p.91 conditional-reinforcement wording is not adjudicated or quoted.',
  },
};

const PROHIBITED_SOURCE_KEYS = new Set([
  'answer_key',
  'answer_options',
  'figure_data',
  'figure_svg',
  'passage_text',
  'question_stem',
  'question_text',
  'raw_aamc_text',
  'raw_passage_text',
  'raw_text',
  'restricted_text',
  'verbatim_quote',
]);

const TRUSTED_CANONICAL_RAW_KEYS = new Set(['exact_text']);

const TRUSTED_CANONICAL_CROSSWALK = {
  path: '../research/mcat-curriculum-architecture-v3/v3-source-crosswalk.json',
  schemaVersion: 'mcat-v3-source-crosswalk-public-1',
  fileSha256: 'a87fd1634a5a9e9dd522293ef98db10b783971f02e0bdfbf558b276cc0b9cea3',
  contentSha256: 'ada7762704e96d5c68dc06f535e284e2c00610f2a616fb03b3f1c1c594126947',
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

const SCHEMA_ASSERTIONS = new Set([
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
  'contains',
  'minItems',
  'maxItems',
  'uniqueItems',
  'minLength',
  'maxLength',
  'pattern',
  'minimum',
  'maximum',
  'allOf',
  'anyOf',
  'oneOf',
  'not',
  'if',
  'then',
  'else',
]);

export const canonicalPacketJson = canonicalJson;

function sha256Hex(text: string): string {
  return createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');
}

function serializedJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function objects(value: unknown): JsonObject[] {
  return Array.isArray(value) ? value.filter(isObject) : [];
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function numbers(value: unknown): number[] {
  return Array.isArray(value)
    ? value.filter((item): item is number => typeof item === 'number' && Number.isFinite(item))
    : [];
}

function nonemptyString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() !== '' ? value : fallback;
}

function parseJsonObject(text: string, label: string): JsonObject {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${String(error)}`);
  }
  if (!isObject(value)) {
    throw new Error(`${label} must contain a JSON object`);
  }
  return value;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function uniqueStrings(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (value !== '' && !seen.has(value)) {
      seen.add(value);
      result.push(value);
    }
  }
  return result;
}

function computeInputHashes(
  sources: PacketGeneratorSources,
  reasons: PacketBlockReason[],
): Record<keyof PacketSourcePaths, PacketInputHash> {
  const result = {} as Record<keyof PacketSourcePaths, PacketInputHash>;
  for (const key of Object.keys(INPUT_TEXT_KEYS) as (keyof PacketSourcePaths)[]) {
    const text = sources[INPUT_TEXT_KEYS[key]] as string;
    const fileSha256 = sha256Hex(text);
    result[key] = {
      path: sources.paths[key],
      fileSha256,
      contentSha256: '',
    };
    const expected = sources.expectedHashes?.[key];
    if (
      expected === undefined ||
      !/^[a-f0-9]{64}$/.test(expected.fileSha256) ||
      !/^[a-f0-9]{64}$/.test(expected.contentSha256)
    ) {
      addReason(
        reasons,
        'INPUT_HASH_MISMATCH',
        `inputs.${key}`,
        `${key} requires explicit 64-character file and canonical-content SHA-256 pins`,
      );
    } else if (expected.fileSha256 !== fileSha256) {
      addReason(
        reasons,
        'INPUT_HASH_MISMATCH',
        `inputs.${key}`,
        `expected ${key} file SHA-256 ${expected.fileSha256} but read ${fileSha256}`,
      );
    }
  }
  return result;
}

function completeInputContentHashes(
  sources: PacketGeneratorSources,
  inputHashes: Record<keyof PacketSourcePaths, PacketInputHash>,
  parsedJson: Readonly<Partial<Record<keyof PacketSourcePaths, JsonObject>>>,
  reasons: PacketBlockReason[],
): void {
  for (const key of Object.keys(INPUT_TEXT_KEYS) as (keyof PacketSourcePaths)[]) {
    const text = sources[INPUT_TEXT_KEYS[key]] as string;
    const parsed = parsedJson[key];
    const contentSha256 =
      parsed === undefined ? sha256Hex(text) : sha256Hex(canonicalPacketJson(parsed));
    inputHashes[key] = { ...inputHashes[key], contentSha256 };
    if (sources.expectedHashes[key].contentSha256 !== contentSha256) {
      addReason(
        reasons,
        'INPUT_HASH_MISMATCH',
        `inputs.${key}`,
        `expected ${key} canonical-content SHA-256 ${sources.expectedHashes[key].contentSha256} but read ${contentSha256}`,
      );
    }
  }
}

function addReason(
  reasons: PacketBlockReason[],
  code: PacketBlockCode,
  path: string,
  message: string,
): void {
  if (
    !reasons.some(
      (reason) => reason.code === code && reason.path === path && reason.message === message,
    )
  ) {
    reasons.push({ code, path, message });
  }
}

interface AllocationIdentity {
  readonly assignmentId: string;
  readonly teamId: string;
  readonly laneId: string;
  readonly outputDirectory: string;
}

function resolveAllocationIdentity(
  proof: JsonObject,
  lessonId: string,
  reasons: PacketBlockReason[],
): AllocationIdentity {
  const matches = objects(proof.assignments).flatMap((assignment) =>
    objects(assignment.rows)
      .filter((row) => row.lesson_id === lessonId)
      .map((row) => ({
        assignment,
        row,
      })),
  );
  const unresolved: AllocationIdentity = {
    assignmentId: '',
    teamId: '',
    laneId: '',
    outputDirectory: '',
  };
  if (matches.length !== 1) {
    addReason(
      reasons,
      'ASSIGNMENT_IDENTITY_MISMATCH',
      `allocation_proof.assignments.rows[lesson_id=${lessonId}]`,
      `lesson ${lessonId} resolves ${matches.length} times in the exact allocation proof`,
    );
    return unresolved;
  }
  const { assignment, row } = matches[0]!;
  const identity: AllocationIdentity = {
    assignmentId: nonemptyString(row.assignment_id),
    teamId: nonemptyString(row.team_id),
    laneId: nonemptyString(row.lane_id),
    outputDirectory: nonemptyString(row.output_path),
  };
  const expectedOutput = `.tmp/lesson-factory/${identity.laneId}/${lessonId.toLowerCase()}`;
  if (
    identity.assignmentId === '' ||
    identity.teamId === '' ||
    !/^lane-[0-9]{2}$/.test(identity.laneId) ||
    identity.outputDirectory !== expectedOutput ||
    identity.assignmentId !== assignment.assignment_id ||
    identity.teamId !== assignment.team_id ||
    identity.laneId !== assignment.lane_id
  ) {
    addReason(
      reasons,
      'ASSIGNMENT_IDENTITY_MISMATCH',
      `allocation_proof.assignments.rows[lesson_id=${lessonId}]`,
      `allocation proof row and parent assignment identity disagree for ${lessonId}`,
    );
  }
  return identity;
}

function emptyAudit(
  sources: PacketGeneratorSources,
  request: PacketRequest,
  allocation: AllocationIdentity,
  inputHashes: Readonly<Record<keyof PacketSourcePaths, PacketInputHash>>,
  researchRegistry: JsonObject,
  releasePolicy: JsonObject,
  deadlineProfile: JsonObject = {},
): PacketAudit {
  const slug = request.lessonId.toLowerCase();
  const releasePolicyRef = `policy:${sources.paths.releasePolicy}#sha256:${inputHashes.releasePolicy.fileSha256}`;
  return {
    packetId: `packet:${allocation.laneId}/${slug}`,
    assignmentId: allocation.assignmentId,
    teamId: allocation.teamId,
    laneId: allocation.laneId,
    lessonId: request.lessonId,
    canonicalSlug: slug,
    inputHashes,
    identity: {
      canonicalTitle: '',
      shortAlias: '',
      lessonType: '',
      groupingId: '',
      sourceSections: [],
    },
    orderedKcs: [],
    prerequisites: { hard: [], helpful: [] },
    placements: {
      phaseIds: [],
      moduleIds: [],
      pathwayPositions: [],
      firstDeliveryRelationId: null,
      revisitRelationIds: [],
    },
    attachments: [],
    holds: [],
    sourceSanitization: {
      scope: 'SELECTED_PACKET_OCCURRENCES',
      consideredOccurrenceCount: 0,
      trustedCanonicalInput: false,
      sanitizedRawFieldCount: 0,
      excludedHeldClaimCount: 0,
      codes: [],
    },
    adaptivePolicy: {
      bypassAuthorized: false,
      masteryThreshold: null,
      fluencyThreshold: null,
      uncertaintyThreshold: null,
    },
    researchEvidence: {
      registryId: 'v3-research-evidence-registry',
      authority: 'DESIGN_ONLY',
      usedAsDomainFactAuthority: false,
      nonclaim: nonemptyString(
        researchRegistry.release_statement,
        'Research evidence is design-only and cannot validate lesson facts, efficacy, mastery, readiness, or learner validity.',
      ),
    },
    releasePolicy: {
      routeScopeCode: nonemptyString(releasePolicy.route_scope_code, 'STANDARD_ONLY'),
      applicableRoutes: strings(releasePolicy.applicable_routes),
      releasePolicyRef,
    },
    dokAuthoring: {
      itemLevelDokLabelsAuthorized: false,
      requirement:
        'Use the authoritative KC competency, scope, representation, and operation evidence; do not invent item-level DOK labels.',
    },
    output: {
      outputDirectory: allocation.outputDirectory,
      canonicalTemplatePath: nonemptyString(
        deadlineProfile.canonical_template_path,
        'docs/lesson-authoring/template/v3-les-000000',
      ),
      anchorSetVersion: `${nonemptyString(
        isObject(deadlineProfile.rubric_identity)
          ? deadlineProfile.rubric_identity.rubric_version
          : undefined,
        '0.9.1',
      )}-candidate`,
      maxRevisionCycles: 2,
      requiredHandoffFiles: [
        'lesson-script.json',
        'kc-coverage-matrix.json',
        'lesson-presentation-plan.json',
        'lesson-quality-report.json',
        'lesson-handoff.json',
      ],
    },
  };
}

function holdAudit(rawHold: JsonObject, holdId: string): PacketHoldAudit {
  const issue = nonemptyString(rawHold.issue, 'Canonical hold remains open.');
  const type = nonemptyString(rawHold.type, 'UNCLASSIFIED_HOLD');
  const safeDefault = SAFE_DEFAULT_HOLD_BEHAVIOR[holdId];
  if (safeDefault !== undefined) {
    return {
      holdId,
      issue,
      type,
      classification: 'SAFE_INTERIM_DEFAULT',
      safeInterimCode: safeDefault.code,
      safeInterimBehavior: safeDefault.behavior,
      nonclaim: safeDefault.nonclaim,
      blocksAuthoring: false,
    };
  }
  const contextual = CONTEXTUAL_HOLD_BEHAVIOR[holdId];
  if (contextual !== undefined) {
    return {
      holdId,
      issue,
      type,
      classification: 'CONTEXTUAL_NONBLOCKING',
      safeInterimCode: contextual.code,
      safeInterimBehavior: contextual.behavior,
      nonclaim: contextual.nonclaim,
      blocksAuthoring: false,
    };
  }
  if (rawHold.learner_evidence_required === true) {
    return {
      holdId,
      issue,
      type,
      classification: 'CONTEXTUAL_NONBLOCKING',
      safeInterimCode: 'PRESERVE_CANONICAL_PROVISIONAL_STATE',
      safeInterimBehavior:
        'Use the frozen canonical decision provisionally and retain the learner-validation nonclaim.',
      nonclaim: 'No learner validation, efficacy, mastery calibration, or readiness is claimed.',
      blocksAuthoring: false,
    };
  }
  return {
    holdId,
    issue,
    type,
    classification: 'BLOCKING_UNRESOLVED',
    safeInterimCode: 'NO_SAFE_INTERIM_DEFAULT',
    safeInterimBehavior: 'Do not author the unresolved required fact.',
    nonclaim: 'No resolution is asserted.',
    blocksAuthoring: true,
  };
}

function applicableHolds(
  manifest: JsonObject,
  curriculum: JsonObject,
  lesson: JsonObject,
): PacketHoldAudit[] {
  const governance = isObject(manifest.governance) ? manifest.governance : {};
  const holdRows =
    objects(governance.holds).length > 0 ? objects(governance.holds) : objects(curriculum.holds);
  const byId = new Map(holdRows.map((hold) => [nonemptyString(hold.hold_id), hold] as const));
  const declaredOpenHoldIds = new Set(strings(governance.open_hold_ids));
  const isOpenHold = (hold: JsonObject): boolean => {
    const holdId = nonemptyString(hold.hold_id);
    if (declaredOpenHoldIds.size > 0) return declaredOpenHoldIds.has(holdId);
    return nonemptyString(hold.status).startsWith('OPEN');
  };
  const lessonEntityIds = new Set([
    nonemptyString(lesson.lesson_id),
    ...strings(lesson.ordered_required_kc_ids),
    ...strings(lesson.capstone_ids),
    ...strings(lesson.extension_ids),
    ...strings(lesson.support_artifact_ids),
  ]);
  const ids = [
    'V3-HOLD-110001',
    'V3-HOLD-110003',
    'V3-HOLD-110005',
    'V3-HOLD-110008',
    'V3-HOLD-110009',
    ...strings(lesson.unresolved_holds),
  ];
  if (strings(lesson.source_sections).includes('CARS')) {
    ids.push('V3-HOLD-110007', 'V3-HOLD-110011');
  }
  for (const hold of holdRows) {
    if (
      isOpenHold(hold) &&
      strings(hold.affected_entity_ids).some((id) => lessonEntityIds.has(id))
    ) {
      ids.push(nonemptyString(hold.hold_id));
    }
  }
  return uniqueStrings(ids)
    .map((holdId) => holdAudit(byId.get(holdId) ?? {}, holdId))
    .sort((left, right) => compareText(left.holdId, right.holdId));
}

interface HoldExecutionPlan {
  readonly excludedSourceClaim: (occurrence: JsonObject) => boolean;
  readonly excludedCount: () => number;
}

const HELD_SOURCE_CLAIM_PATTERNS: Readonly<Record<string, readonly RegExp[]>> = {
  'V3-HOLD-110002': [/stem[\s-]*cell/i, /cns[\s-]*regeneration/i],
  'V3-HOLD-110010': [/conditional[\s-]*reinforcement/i],
  'V3-HOLD-110006': [/alternate[\s-]*boundary/i, /aggregate[\s-]*diagnostic/i],
};

function holdExecutionPlan(
  holds: readonly PacketHoldAudit[],
  curriculum: JsonObject,
  lesson: JsonObject,
  reasons: PacketBlockReason[],
): HoldExecutionPlan {
  const activeHoldIds = new Set(holds.map((hold) => hold.holdId));
  if (activeHoldIds.has('V3-HOLD-110006') && lesson.lesson_id === 'V3-LES-251056') {
    const orderedKcIds = strings(lesson.ordered_required_kc_ids);
    const nestedKcIds = strings(lesson.nested_kc_ids);
    const groupingId = nonemptyString(lesson.owning_cluster_id, nonemptyString(lesson.grouping_id));
    const groupingMatches = objects(curriculum.groupings).filter(
      (grouping) =>
        grouping.grouping_id === groupingId ||
        grouping.cluster_id === groupingId ||
        grouping.id === groupingId,
    );
    const memberKcIds =
      groupingMatches.length === 1 ? strings(groupingMatches[0]!.member_kc_ids) : [];
    if (
      orderedKcIds.length !== 3 ||
      canonicalPacketJson(orderedKcIds) !== canonicalPacketJson(nestedKcIds) ||
      canonicalPacketJson(orderedKcIds) !== canonicalPacketJson(memberKcIds)
    ) {
      addReason(
        reasons,
        'REQUIRED_DECISION_UNRESOLVED',
        `curriculum.lessons[${nonemptyString(lesson.lesson_id)}].ordered_required_kc_ids`,
        'V3-HOLD-110006 requires the frozen canonical three-KC lesson/grouping boundary verbatim',
      );
    }
  }
  const activePatterns = [...activeHoldIds].flatMap(
    (holdId) => HELD_SOURCE_CLAIM_PATTERNS[holdId] ?? [],
  );
  const excludedOccurrenceIds = new Set<string>();
  return {
    excludedSourceClaim: (occurrence) => {
      const projectedClaims = [occurrence.official_topic, occurrence.source_summary].filter(
        (value): value is string => typeof value === 'string',
      );
      const excluded = activePatterns.some((pattern) =>
        projectedClaims.some((claim) => pattern.test(claim)),
      );
      if (excluded) {
        excludedOccurrenceIds.add(
          nonemptyString(
            occurrence.source_occurrence_id,
            `anonymous:${sha256Hex(canonicalPacketJson(projectedClaims))}`,
          ),
        );
      }
      return excluded;
    },
    excludedCount: () => excludedOccurrenceIds.size,
  };
}

function prohibitedSourceKeys(value: JsonObject): string[] {
  return Object.keys(value).filter((key) => PROHIBITED_SOURCE_KEYS.has(key.toLowerCase()));
}

function rawSourceKeys(value: JsonObject): string[] {
  return Object.keys(value).filter((key) => {
    const normalized = key.toLowerCase();
    return PROHIBITED_SOURCE_KEYS.has(normalized) || TRUSTED_CANONICAL_RAW_KEYS.has(normalized);
  });
}

function receiptSourceDecision(receipt: JsonObject, sourceId: string): JsonObject | undefined {
  const matches = objects(receipt.source_decisions).filter(
    (decision) => decision.source_id === sourceId,
  );
  return matches.length === 1 ? matches[0] : undefined;
}

function sourceOccurrenceProjection(
  occurrence: JsonObject,
  authority: JsonObject,
  receiptDecision: JsonObject,
  sourceUseReceiptRef: string,
): RightsSafeSourceOccurrence {
  const sourceId = nonemptyString(occurrence.source_id);
  const sourceClass = receiptDecision.source_class as RightsSafeSourceOccurrence['sourceClass'];
  const allowed = new Set(strings(receiptDecision.derived_field_allowlist));
  const rightsStatus = receiptDecision.usable === true ? 'PERMITTED' : 'PROHIBITED';
  const permittedUse =
    rightsStatus === 'PERMITTED' ? strings(receiptDecision.permitted_use_codes) : [];
  return {
    sourceOccurrenceId: nonemptyString(occurrence.source_occurrence_id),
    occurrenceKind: allowed.has('occurrence_kind')
      ? nonemptyString(occurrence.occurrence_kind, 'UNSPECIFIED_OCCURRENCE')
      : 'UNSPECIFIED_OCCURRENCE',
    sourceId,
    sourceClass,
    officialPath: allowed.has('official_path') ? strings(occurrence.official_path) : [],
    officialTopic:
      allowed.has('official_topic') && typeof occurrence.official_topic === 'string'
        ? occurrence.official_topic
        : null,
    printedPages: allowed.has('printed_pages') ? numbers(occurrence.printed_pages) : [],
    sourceAnchorIds: allowed.has('source_anchor_ids')
      ? uniqueStrings([
          ...strings(occurrence.source_anchor_ids),
          nonemptyString(occurrence.source_anchor_id),
        ])
      : [],
    derivedSummary:
      allowed.has('derived_summary') && typeof occurrence.source_summary === 'string'
        ? occurrence.source_summary
        : null,
    scopeStatus:
      allowed.has('scope_status') && typeof occurrence.scope_status === 'string'
        ? occurrence.scope_status
        : null,
    authorityStatus: {
      source: sourceId,
      presentDayAuthorityRefreshed: authority.present_day_authority_refreshed === true,
    },
    rightsStatus,
    derivedFieldsOnly: true,
    permittedUse,
    permissionReceiptRefs: [],
    sourceUseReceiptRef: rightsStatus === 'PERMITTED' ? sourceUseReceiptRef : null,
  };
}

function mappingOccurrenceIds(mapping: JsonObject): string[] {
  return uniqueStrings([
    ...strings(mapping.direct_source_occurrence_ids),
    ...strings(mapping.source_occurrence_ids),
  ]);
}

function mappingConflict(
  exactMappings: readonly JsonObject[],
): { readonly field: string; readonly values: readonly string[] } | null {
  const selectors: readonly [string, readonly string[]][] = [
    ['scope', ['required_scope', 'canonical_scope']],
    ['operation', ['required_operation', 'operation', 'operation_code']],
    ['terminology', ['terminology', 'required_terminology']],
    ['rights', ['rights_status', 'rights_use_status']],
  ];
  for (const [label, fields] of selectors) {
    const values = new Set<string>();
    for (const mapping of exactMappings) {
      for (const field of fields) {
        const value = mapping[field];
        if (typeof value === 'string' && value.trim() !== '') values.add(value.trim());
      }
    }
    if (values.size > 1) return { field: label, values: [...values].sort(compareText) };
  }
  return null;
}

function mapRequiredKcs(
  curriculum: JsonObject,
  crosswalk: JsonObject,
  lesson: JsonObject,
  holdPlan: HoldExecutionPlan,
  trustedCanonicalInput: boolean,
  sourceUseReceipt: JsonObject,
  sourceUseReceiptRef: string,
  reasons: PacketBlockReason[],
): PacketKcAudit[] {
  const kcRows = objects(curriculum.kcs);
  const mappings = objects(crosswalk.mappings);
  const occurrences = objects(crosswalk.source_occurrences);
  const authority =
    isObject(crosswalk.metadata) && isObject(crosswalk.metadata.authority)
      ? crosswalk.metadata.authority
      : {};
  const occurrenceById = new Map<string, JsonObject>();
  const duplicateOccurrenceIds = new Set<string>();
  for (const occurrence of occurrences) {
    const id = nonemptyString(occurrence.source_occurrence_id);
    if (occurrenceById.has(id)) duplicateOccurrenceIds.add(id);
    else occurrenceById.set(id, occurrence);
  }
  const labels = strings(lesson.nested_kc_labels);
  return strings(lesson.ordered_required_kc_ids).map((kcId, order) => {
    const matches = kcRows.filter((kc) => kc.kc_id === kcId);
    const kc = matches[0] ?? {};
    if (matches.length !== 1) {
      addReason(
        reasons,
        'REQUIRED_KC_UNRESOLVED',
        `curriculum.lessons[${lesson.lesson_id as string}].ordered_required_kc_ids[${order}]`,
        `required KC ${kcId} resolves ${matches.length} times in curriculum.kcs`,
      );
    } else if (kc.owning_lesson_id !== lesson.lesson_id) {
      addReason(
        reasons,
        'REQUIRED_KC_UNRESOLVED',
        `curriculum.kcs[${kcId}].owning_lesson_id`,
        `required KC ${kcId} is not owned by source lesson ${nonemptyString(lesson.lesson_id)}`,
      );
    }
    const directMappings = mappings
      .filter(
        (mapping) =>
          mapping.target_id === kcId &&
          mapping.target_type === 'KC' &&
          (mapping.mapping_role === undefined ||
            mapping.mapping_role === 'direct' ||
            mapping.mapping_role === 'enabling'),
      )
      .sort((left, right) =>
        compareText(nonemptyString(left.mapping_id), nonemptyString(right.mapping_id)),
      );
    if (directMappings.length === 0) {
      addReason(
        reasons,
        'SOURCE_MAPPING_MISSING',
        `/ordered_kc_records/${order}/source_mappings`,
        `required KC ${kcId} has no traceable direct or enabling source mapping`,
      );
    }
    const exactMappings = directMappings.filter((mapping) => mapping.relation === 'exact');
    const conflict = mappingConflict(exactMappings);
    if (conflict !== null) {
      addReason(
        reasons,
        'SOURCE_MAPPING_CONTRADICTION',
        `/ordered_kc_records/${order}/source_mappings`,
        `exact mappings for ${kcId} disagree on ${conflict.field}: ${conflict.values.join(' | ')}`,
      );
    }
    const occurrenceIds = uniqueStrings([
      ...directMappings.flatMap(mappingOccurrenceIds),
      ...strings(kc.direct_source_occurrence_ids),
    ]);
    const safeOccurrences: RightsSafeSourceOccurrence[] = [];
    for (const occurrenceId of occurrenceIds) {
      if (duplicateOccurrenceIds.has(occurrenceId)) {
        addReason(
          reasons,
          'SOURCE_OCCURRENCE_MISSING',
          `source_crosswalk.source_occurrences[${occurrenceId}]`,
          `source occurrence ${occurrenceId} is duplicated`,
        );
        continue;
      }
      const occurrence = occurrenceById.get(occurrenceId);
      if (occurrence === undefined) {
        addReason(
          reasons,
          'SOURCE_OCCURRENCE_MISSING',
          `source_crosswalk.source_occurrences[${occurrenceId}]`,
          `source occurrence ${occurrenceId} does not resolve`,
        );
        continue;
      }
      if (holdPlan.excludedSourceClaim(occurrence)) continue;
      const prohibitedKeys = prohibitedSourceKeys(occurrence);
      const untrustedRawKeys = trustedCanonicalInput ? [] : rawSourceKeys(occurrence);
      const fatalRawKeys = uniqueStrings([...prohibitedKeys, ...untrustedRawKeys]);
      if (fatalRawKeys.length > 0) {
        addReason(
          reasons,
          'PROHIBITED_RAW_SOURCE_TEXT',
          `source_crosswalk.source_occurrences[${occurrenceId}]`,
          `selected source occurrence ${occurrenceId} contains prohibited or untrusted raw fields: ${fatalRawKeys.join(', ')}`,
        );
        continue;
      }
      const sourceId = nonemptyString(occurrence.source_id);
      const receiptDecision = receiptSourceDecision(sourceUseReceipt, sourceId);
      if (receiptDecision === undefined) {
        addReason(
          reasons,
          'SOURCE_RIGHTS_UNCLEARED',
          `source_crosswalk.source_occurrences[${occurrenceId}].source_id`,
          `source ${sourceId || '(missing)'} has no unique exact source-ID decision in the pinned owner receipt`,
        );
        continue;
      }
      const projected = sourceOccurrenceProjection(
        occurrence,
        authority,
        receiptDecision,
        sourceUseReceiptRef,
      );
      if (projected.sourceClass === 'PRIVATE_COMPARISON') {
        addReason(
          reasons,
          'PROHIBITED_SOURCE',
          `source_crosswalk.source_occurrences[${occurrenceId}].source_id`,
          `source ${projected.sourceId} is private or prohibited`,
        );
      }
      if (
        projected.rightsStatus !== 'PERMITTED' ||
        projected.permittedUse.length === 0 ||
        projected.sourceUseReceiptRef === null
      ) {
        addReason(
          reasons,
          'SOURCE_RIGHTS_UNCLEARED',
          `source_crosswalk.source_occurrences[${occurrenceId}].rights_status`,
          `source occurrence ${occurrenceId} is ${projected.rightsStatus}; no agent may grant permission`,
        );
      }
      safeOccurrences.push(projected);
    }
    if (
      occurrenceIds.length === 0 ||
      safeOccurrences.length === 0 ||
      !safeOccurrences.some(
        (occurrence) =>
          (occurrence.derivedSummary !== null && occurrence.derivedSummary.trim() !== '') ||
          (occurrence.officialTopic !== null && occurrence.officialTopic.trim() !== '') ||
          occurrence.officialPath.length > 0 ||
          occurrence.printedPages.length > 0 ||
          occurrence.sourceAnchorIds.length > 0,
      )
    ) {
      addReason(
        reasons,
        'SOURCE_SUMMARY_MISSING',
        `source_crosswalk.source_occurrences[target_id=${kcId}]`,
        `required KC ${kcId} has no rights-safe bounded derived source locator`,
      );
    }
    const reasoningOperation = nonemptyString(
      kc.reasoning_operation,
      nonemptyString(
        kc.operation_code,
        nonemptyString(
          directMappings.find((mapping) => typeof mapping.required_operation === 'string')
            ?.required_operation,
          'AUTHORITATIVE_OPERATION_NOT_SPECIFIED',
        ),
      ),
    );
    return {
      kcId,
      label: nonemptyString(kc.display_label, labels[order] ?? kcId),
      competency: nonemptyString(
        kc.statement_of_competence,
        'Authoritative competency is unresolved.',
      ),
      scopeIn: strings(kc.scope_in),
      scopeOut: strings(kc.scope_out),
      representations: strings(kc.representations),
      reasoningOperation,
      sourceSetStatus:
        conflict !== null || directMappings.length === 0
          ? 'UNRESOLVED'
          : exactMappings.length > 1
            ? 'MULTI_SOURCE_CORROBORATED'
            : exactMappings.length === 1
              ? 'EXACT_SOURCE'
              : 'BOUNDED_SOURCE_SET',
      sourceMappings: directMappings.map((mapping) => ({
        mappingId: nonemptyString(mapping.mapping_id, 'UNIDENTIFIED_MAPPING'),
        relation: nonemptyString(mapping.relation, 'unspecified'),
        sourceOccurrenceIds: mappingOccurrenceIds(mapping),
      })),
      sourceOccurrences: safeOccurrences,
    };
  });
}

function sourceRelationIds(value: unknown): string[] {
  if (!isObject(value)) return [];
  return strings(value.source_relation_ids);
}

type NormalizedRelationClass =
  | 'MODULE_DELIVERY_EVENT'
  | 'MODULE_REVISIT'
  | 'PATHWAY_LESSON_SCOPE'
  | 'PATHWAY_PHASE'
  | 'PHASE_MODULE'
  | 'HELD_NONREQUIRED'
  | 'LESSON_INTERNAL';

interface IndexedNormalizedRelation {
  readonly relationClass: NormalizedRelationClass;
  readonly row: JsonObject;
}

function normalizedRelationIndex(manifest: JsonObject): Map<string, IndexedNormalizedRelation[]> {
  const sequence = isObject(manifest.sequence) ? manifest.sequence : {};
  const normalized = isObject(sequence.normalized_relations) ? sequence.normalized_relations : {};
  const collections: readonly [string, NormalizedRelationClass][] = [
    ['module_delivery_event_relations', 'MODULE_DELIVERY_EVENT'],
    ['module_revisit_relations', 'MODULE_REVISIT'],
    ['pathway_lesson_scope_relations', 'PATHWAY_LESSON_SCOPE'],
    ['pathway_phase_relations', 'PATHWAY_PHASE'],
    ['phase_module_relations', 'PHASE_MODULE'],
    ['held_nonrequired_relations', 'HELD_NONREQUIRED'],
    ['lesson_internal_order_relations', 'LESSON_INTERNAL'],
  ];
  const index = new Map<string, IndexedNormalizedRelation[]>();
  for (const [collection, relationClass] of collections) {
    for (const row of objects(normalized[collection])) {
      const relationId = nonemptyString(row.relation_id);
      if (relationId === '') continue;
      const entries = index.get(relationId) ?? [];
      entries.push({ relationClass, row });
      index.set(relationId, entries);
    }
  }
  return index;
}

function graphEdgeIndex(manifest: JsonObject): Map<string, JsonObject[]> {
  const graph = isObject(manifest.graph) ? manifest.graph : {};
  const index = new Map<string, JsonObject[]>();
  for (const edge of objects(graph.edges)) {
    const edgeId = nonemptyString(edge.edge_id);
    if (edgeId === '') continue;
    index.set(edgeId, [...(index.get(edgeId) ?? []), edge]);
  }
  return index;
}

function packetPlacements(
  manifest: JsonObject,
  lesson: JsonObject,
  reasons: PacketBlockReason[],
): {
  readonly audit: PacketAudit['placements'];
  readonly phases: readonly { readonly phase_id: string; readonly source_relation_ids: string[] }[];
  readonly modules: readonly {
    readonly module_id: string;
    readonly source_relation_ids: string[];
  }[];
  readonly pathways: readonly {
    readonly pathway_id: string;
    readonly source_relation_ids: string[];
  }[];
  readonly positions: readonly {
    readonly scope_id: string;
    readonly position: number;
    readonly source_relation_ids: string[];
  }[];
} {
  const sequence = isObject(manifest.sequence) ? manifest.sequence : {};
  const modules = objects(sequence.modules);
  const phases = objects(sequence.phases);
  const normalized = isObject(sequence.normalized_relations) ? sequence.normalized_relations : {};
  const pathwayRelations = objects(normalized.pathway_lesson_scope_relations);
  const relationIndex = normalizedRelationIndex(manifest);
  const lessonId = nonemptyString(lesson.lesson_id);
  const phasePlacements = strings(lesson.phase_ids).map((phaseId) => {
    const row = phases.find((phase) => phase.phase_id === phaseId);
    const relationIds = sourceRelationIds(row?.placement_projection);
    if (row === undefined || relationIds.length === 0) {
      addReason(
        reasons,
        'REQUIRED_SEQUENCE_RELATION_UNRESOLVED',
        `sequence.phases[${phaseId}]`,
        `phase placement ${phaseId} lacks a source relation`,
      );
    }
    for (const relationId of relationIds) {
      const matches = (relationIndex.get(relationId) ?? []).filter(
        (relation) =>
          relation.relationClass === 'PATHWAY_PHASE' && relation.row.phase_id === phaseId,
      );
      if (matches.length !== 1) {
        addReason(
          reasons,
          'REQUIRED_SEQUENCE_RELATION_UNRESOLVED',
          `sequence.phases[${phaseId}].placement_projection.source_relation_ids`,
          `phase relation ${relationId} does not bind uniquely to ${phaseId} as a pathway-phase relation`,
        );
      }
    }
    return { phase_id: phaseId, source_relation_ids: relationIds };
  });
  const modulePlacements = strings(lesson.module_ids).map((moduleId) => {
    const row = modules.find((module) => module.module_id === moduleId);
    const relationIds = sourceRelationIds(row?.placement_projection);
    const projection = isObject(row?.placement_projection) ? row.placement_projection : {};
    const phaseId = nonemptyString(projection.phase_id);
    if (row === undefined || relationIds.length === 0) {
      addReason(
        reasons,
        'REQUIRED_SEQUENCE_RELATION_UNRESOLVED',
        `sequence.modules[${moduleId}]`,
        `module placement ${moduleId} lacks a source relation`,
      );
    }
    for (const relationId of relationIds) {
      const matches = (relationIndex.get(relationId) ?? []).filter(
        (relation) =>
          relation.relationClass === 'PHASE_MODULE' &&
          relation.row.module_id === moduleId &&
          relation.row.phase_id === phaseId,
      );
      if (matches.length !== 1) {
        addReason(
          reasons,
          'REQUIRED_SEQUENCE_RELATION_UNRESOLVED',
          `sequence.modules[${moduleId}].placement_projection.source_relation_ids`,
          `module relation ${relationId} does not bind uniquely from phase ${phaseId} to ${moduleId}`,
        );
      }
    }
    return { module_id: moduleId, source_relation_ids: relationIds };
  });
  const pathwayPositions = objects(lesson.pathway_positions).map((position) => {
    const pathwayId = nonemptyString(position.pathway_id);
    const authoritativeRelations = pathwayRelations.filter(
      (relation) => relation.lesson_id === lessonId && relation.pathway_id === pathwayId,
    );
    const relationIds = uniqueStrings([
      ...strings(position.source_relation_ids),
      ...authoritativeRelations.map((relation) => nonemptyString(relation.relation_id)),
    ]);
    const numericPosition = position.position;
    if (
      relationIds.length === 0 ||
      typeof numericPosition !== 'number' ||
      !Number.isInteger(numericPosition) ||
      numericPosition < 1
    ) {
      addReason(
        reasons,
        'REQUIRED_SEQUENCE_RELATION_UNRESOLVED',
        `sequence.normalized_relations.pathway_lesson_scope_relations[${lessonId}/${pathwayId}]`,
        `pathway placement ${pathwayId} lacks an authoritative positive position or source relation`,
      );
    }
    for (const relationId of relationIds) {
      const matches = (relationIndex.get(relationId) ?? []).filter(
        (relation) =>
          relation.relationClass === 'PATHWAY_LESSON_SCOPE' &&
          relation.row.lesson_id === lessonId &&
          relation.row.pathway_id === pathwayId,
      );
      if (matches.length !== 1) {
        addReason(
          reasons,
          'REQUIRED_SEQUENCE_RELATION_UNRESOLVED',
          `curriculum.lessons[${lessonId}].pathway_positions[${pathwayId}].source_relation_ids`,
          `pathway relation ${relationId} does not bind uniquely from ${pathwayId} to ${lessonId}`,
        );
      }
    }
    return {
      pathwayId,
      position:
        typeof numericPosition === 'number' && Number.isInteger(numericPosition)
          ? numericPosition
          : 0,
      relationIds,
    };
  });
  const sequenceRefs = isObject(lesson.sequence_relation_refs) ? lesson.sequence_relation_refs : {};
  const internalOrderId = nonemptyString(sequenceRefs.internal_order);
  const internalOrderMatches = (relationIndex.get(internalOrderId) ?? []).filter(
    (relation) =>
      relation.relationClass === 'LESSON_INTERNAL' &&
      relation.row.lesson_id === lessonId &&
      relation.row.grouping_id ===
        nonemptyString(lesson.owning_cluster_id, nonemptyString(lesson.grouping_id)) &&
      canonicalPacketJson(strings(relation.row.ordered_nested_kc_ids)) ===
        canonicalPacketJson(strings(lesson.ordered_required_kc_ids)),
  );
  if (internalOrderId === '' || internalOrderMatches.length !== 1) {
    addReason(
      reasons,
      'REQUIRED_SEQUENCE_RELATION_UNRESOLVED',
      `curriculum.lessons[${lessonId}].sequence_relation_refs.internal_order`,
      `lesson-internal relation ${internalOrderId || '(missing)'} does not resolve uniquely to the exact lesson, grouping, and ordered KC set`,
    );
  }
  const lessonEntitySet = lessonEntityIds(lesson);
  for (const relationId of strings(sequenceRefs.held_nonrequired)) {
    const matches = (relationIndex.get(relationId) ?? []).filter(
      (relation) =>
        relation.relationClass === 'HELD_NONREQUIRED' &&
        lessonEntitySet.has(nonemptyString(relation.row.entity_id)) &&
        relation.row.active_sequence_target === false &&
        relation.row.required_delivery === false,
    );
    if (matches.length !== 1) {
      addReason(
        reasons,
        'REQUIRED_SEQUENCE_RELATION_UNRESOLVED',
        `curriculum.lessons[${lessonId}].sequence_relation_refs.held_nonrequired`,
        `held relation ${relationId} does not resolve uniquely to a nonrequired entity owned by ${lessonId}`,
      );
    }
  }
  const firstDeliveryId =
    typeof sequenceRefs.first_delivery === 'string' ? sequenceRefs.first_delivery : null;
  const firstDeliveryMatches = objects(normalized.module_delivery_event_relations).filter(
    (relation) =>
      relation.relation_id === firstDeliveryId &&
      relation.target_lesson_id === lessonId &&
      relation.placement_kind === 'LESSON_FIRST_DELIVERY' &&
      strings(lesson.module_ids).includes(nonemptyString(relation.module_id)) &&
      strings(lesson.phase_ids).includes(nonemptyString(relation.phase_id)) &&
      relation.internal_order_relation_id === internalOrderId,
  );
  if (firstDeliveryId === null || firstDeliveryMatches.length !== 1) {
    addReason(
      reasons,
      'REQUIRED_SEQUENCE_RELATION_UNRESOLVED',
      `curriculum.lessons[${lessonId}].sequence_relation_refs.first_delivery`,
      `first-delivery relation ${firstDeliveryId ?? '(missing)'} does not resolve uniquely to ${lessonId}`,
    );
  }
  const revisitIds = strings(sequenceRefs.revisits);
  const revisitRows = objects(normalized.module_revisit_relations);
  const revisitPositions = objects(lesson.revisit_positions);
  for (const relationId of revisitIds) {
    const matches = revisitRows.filter((relation) => {
      const projection = revisitPositions.filter(
        (position) =>
          position.relation_id === relationId &&
          position.module_id === relation.module_id &&
          position.phase_id === relation.phase_id,
      );
      const targetEntityIds = strings(relation.target_entity_ids);
      return (
        relation.relation_id === relationId &&
        relation.target_lesson_id === lessonId &&
        relation.first_delivery_relation_id === firstDeliveryId &&
        projection.length === 1 &&
        targetEntityIds.length > 0 &&
        targetEntityIds.every((entityId) => lessonEntitySet.has(entityId))
      );
    });
    if (matches.length !== 1) {
      addReason(
        reasons,
        'REQUIRED_SEQUENCE_RELATION_UNRESOLVED',
        `curriculum.lessons[${lessonId}].sequence_relation_refs.revisits`,
        `revisit relation ${relationId} does not resolve uniquely to ${lessonId}`,
      );
    }
  }
  return {
    audit: {
      phaseIds: phasePlacements.map((placement) => placement.phase_id),
      moduleIds: modulePlacements.map((placement) => placement.module_id),
      pathwayPositions,
      firstDeliveryRelationId: firstDeliveryId,
      revisitRelationIds: revisitIds,
    },
    phases: phasePlacements,
    modules: modulePlacements,
    pathways: pathwayPositions.map((position) => ({
      pathway_id: position.pathwayId,
      source_relation_ids: position.relationIds,
    })),
    positions: pathwayPositions.map((position) => ({
      scope_id: position.pathwayId,
      position: position.position,
      source_relation_ids: position.relationIds,
    })),
  };
}

function lessonEntityIds(lesson: JsonObject): Set<string> {
  return new Set(
    uniqueStrings([
      nonemptyString(lesson.lesson_id),
      ...strings(lesson.ordered_required_kc_ids),
      ...strings(lesson.capstone_ids),
      ...strings(lesson.extension_ids),
      ...strings(lesson.support_artifact_ids),
    ]),
  );
}

function prerequisites(
  manifest: JsonObject,
  curriculum: JsonObject,
  lesson: JsonObject,
  reasons: PacketBlockReason[],
): PacketAudit['prerequisites'] {
  const lessons = objects(curriculum.lessons);
  const kcs = objects(curriculum.kcs);
  const graph = isObject(manifest.graph) ? manifest.graph : {};
  const edges = objects(graph.edges);
  const edgeIndex = graphEdgeIndex(manifest);
  const sequence = isObject(manifest.sequence) ? manifest.sequence : {};
  const normalized = isObject(sequence.normalized_relations) ? sequence.normalized_relations : {};
  const sirsRelations = objects(normalized.sirs_math_point_of_use_relations);
  const helpfulRelations = objects(normalized.helpful_order_decision_relations);
  const firstDeliveryRelations = objects(normalized.module_delivery_event_relations);
  const revisitRelations = objects(normalized.module_revisit_relations);
  const targetLessonId = nonemptyString(lesson.lesson_id);
  const targetEntityIds = lessonEntityIds(lesson);
  const firstDelivery = (lessonId: string): JsonObject | undefined => {
    const matches = firstDeliveryRelations.filter(
      (relation) =>
        relation.target_lesson_id === lessonId &&
        relation.placement_kind === 'LESSON_FIRST_DELIVERY',
    );
    return matches.length === 1 ? matches[0] : undefined;
  };
  const ordinal = (relation: JsonObject | undefined): number | null => {
    const value = relation?.global_delivery_event_ordinal;
    return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
  };
  const targetOrdinal = ordinal(firstDelivery(targetLessonId));
  const hard = strings(lesson.hard_prerequisite_lesson_ids).map((lessonId) => {
    const lessonMatches = lessons.filter((candidate) => candidate.lesson_id === lessonId);
    const prerequisiteLesson = lessonMatches.length === 1 ? lessonMatches[0] : undefined;
    const declaredSourceKcIds =
      prerequisiteLesson === undefined ? [] : strings(prerequisiteLesson.ordered_required_kc_ids);
    for (const sourceKcId of declaredSourceKcIds) {
      const matches = kcs.filter(
        (kc) => kc.kc_id === sourceKcId && kc.owning_lesson_id === lessonId,
      );
      if (matches.length !== 1) {
        addReason(
          reasons,
          'PREREQUISITE_RELATION_UNRESOLVED',
          `curriculum.lessons[${lessonId}].ordered_required_kc_ids`,
          `hard-prerequisite KC ${sourceKcId} does not resolve uniquely as a member of ${lessonId}`,
        );
      }
    }
    const sourceEntityIds =
      prerequisiteLesson === undefined ? new Set<string>() : lessonEntityIds(prerequisiteLesson);
    const forwardEdges = edges.filter(
      (edge) =>
        edge.edge_type === 'HARD_PREREQUISITE' &&
        sourceEntityIds.has(nonemptyString(edge.source_id)) &&
        targetEntityIds.has(nonemptyString(edge.target_id)),
    );
    const reverseEdges = edges.filter(
      (edge) =>
        edge.edge_type === 'HARD_PREREQUISITE' &&
        targetEntityIds.has(nonemptyString(edge.source_id)) &&
        sourceEntityIds.has(nonemptyString(edge.target_id)),
    );
    const forwardSirs = sirsRelations.filter(
      (relation) =>
        relation.relation_type === 'HARD_PREREQUISITE' &&
        relation.source_lesson_id === lessonId &&
        relation.target_lesson_id === targetLessonId,
    );
    const reverseSirs = sirsRelations.filter(
      (relation) =>
        relation.relation_type === 'HARD_PREREQUISITE' &&
        relation.source_lesson_id === targetLessonId &&
        relation.target_lesson_id === lessonId,
    );
    if (
      forwardEdges.length === 0 &&
      forwardSirs.length === 0 &&
      (reverseEdges.length > 0 || reverseSirs.length > 0)
    ) {
      addReason(
        reasons,
        'PREREQUISITE_RELATION_UNRESOLVED',
        `curriculum.lessons[${targetLessonId}].hard_prerequisite_lesson_ids`,
        `hard-prerequisite relation is reversed; ${lessonId} must precede ${targetLessonId}`,
      );
    }
    const relationIds: string[] = [];
    const appendRelation = (relationId: string, sourceEntityId: string): void => {
      if (
        relationId === '' ||
        !sourceEntityIds.has(sourceEntityId) ||
        relationIds.includes(relationId)
      ) {
        return;
      }
      relationIds.push(relationId);
    };
    for (const edge of forwardEdges) {
      const edgeId = nonemptyString(edge.edge_id);
      if ((edgeIndex.get(edgeId) ?? []).length === 1) {
        appendRelation(edgeId, nonemptyString(edge.source_id));
      } else {
        addReason(
          reasons,
          'PREREQUISITE_RELATION_UNRESOLVED',
          `graph.edges[edge_id=${edgeId || '(missing)'}]`,
          `hard-prerequisite graph relation ${edgeId || '(missing)'} does not resolve exactly once`,
        );
      }
    }
    for (const relation of forwardSirs) {
      const underlyingEdges = strings(relation.underlying_edge_ids)
        .map((edgeId) => {
          const matches = edgeIndex.get(edgeId) ?? [];
          return matches.length === 1 ? matches[0] : undefined;
        })
        .filter((edge): edge is JsonObject => edge !== undefined);
      const sourceKcId = underlyingEdges
        .map((edge) => nonemptyString(edge.source_id))
        .find((entityId) => sourceEntityIds.has(entityId));
      const relationId = nonemptyString(relation.relation_id);
      if (
        sirsRelations.filter((candidate) => candidate.relation_id === relationId).length === 1 &&
        underlyingEdges.length === strings(relation.underlying_edge_ids).length
      ) {
        appendRelation(relationId, sourceKcId ?? '');
      } else {
        addReason(
          reasons,
          'PREREQUISITE_RELATION_UNRESOLVED',
          `sequence.normalized_relations.sirs_math_point_of_use_relations[relation_id=${relationId || '(missing)'}]`,
          `hard-prerequisite normalized relation ${relationId || '(missing)'} or its graph bindings do not resolve exactly once`,
        );
      }
    }
    if (
      prerequisiteLesson === undefined ||
      declaredSourceKcIds.length === 0 ||
      relationIds.length === 0
    ) {
      addReason(
        reasons,
        'PREREQUISITE_RELATION_UNRESOLVED',
        `curriculum.lessons[${targetLessonId}].hard_prerequisite_lesson_ids`,
        `hard prerequisite ${lessonId} does not resolve to an authoritative source KC and forward relation`,
      );
    }
    const sourceOrdinal = ordinal(firstDelivery(lessonId));
    if (sourceOrdinal === null || targetOrdinal === null || sourceOrdinal >= targetOrdinal) {
      addReason(
        reasons,
        'PREREQUISITE_RELATION_UNRESOLVED',
        `curriculum.lessons[${targetLessonId}].hard_prerequisite_lesson_ids`,
        `hard prerequisite ${lessonId} must have an authoritative first delivery before ${targetLessonId}`,
      );
    }
    return {
      lessonId,
      relationIds,
      sourceKcIds: declaredSourceKcIds,
      taughtAtSequencePosition: sourceOrdinal ?? 0,
    };
  });
  const helpful = strings(lesson.helpful_prerequisite_lesson_ids).map((lessonId) => {
    const relationMatches = helpfulRelations.filter(
      (relation) =>
        relation.source_lesson_id === lessonId && relation.target_lesson_id === targetLessonId,
    );
    const relationIds = relationMatches
      .map((relation) => nonemptyString(relation.relation_id))
      .filter((relationId) => relationId !== '');
    if (
      lessons.filter((candidate) => candidate.lesson_id === lessonId).length !== 1 ||
      relationMatches.length !== 1
    ) {
      addReason(
        reasons,
        'PREREQUISITE_RELATION_UNRESOLVED',
        `curriculum.lessons[${targetLessonId}].helpful_prerequisite_lesson_ids`,
        `helpful prerequisite ${lessonId} does not resolve to one authoritative forward relation`,
      );
    }
    const sourceOrdinal = ordinal(firstDelivery(lessonId));
    const relation = relationMatches[0];
    const realization = isObject(relation?.realization_references)
      ? relation.realization_references
      : {};
    const deferredRealizationIsValid =
      relation?.decision === 'NOT_FORCED_NONBLOCKING' &&
      firstDelivery(lessonId)?.relation_id === realization.source_first_delivery_relation_id &&
      revisitRelations.some(
        (relation) =>
          relation.relation_id === realization.beneficiary_revisit_relation_id &&
          relation.target_lesson_id === targetLessonId,
      );
    if (
      (sourceOrdinal === null || targetOrdinal === null || sourceOrdinal >= targetOrdinal) &&
      !deferredRealizationIsValid
    ) {
      addReason(
        reasons,
        'PREREQUISITE_RELATION_UNRESOLVED',
        `curriculum.lessons[${targetLessonId}].helpful_prerequisite_lesson_ids`,
        `helpful prerequisite ${lessonId} neither precedes ${targetLessonId} nor has a resolved deferred realization`,
      );
    }
    return { lessonId, relationIds };
  });
  return { hard, helpful };
}

function attachments(
  manifest: JsonObject,
  curriculum: JsonObject,
  lesson: JsonObject,
  reasons: PacketBlockReason[],
): PacketAttachmentAudit[] {
  const lessonId = nonemptyString(lesson.lesson_id);
  const lessonKcIds = strings(lesson.ordered_required_kc_ids);
  const lessonKcSet = new Set(lessonKcIds);
  const relationIndex = normalizedRelationIndex(manifest);
  const result: PacketAttachmentAudit[] = [];
  const configurations: readonly [string, 'CAPSTONE' | 'EXTENSION' | 'SUPPORT', string, string][] =
    [
      ['capstone_ids', 'CAPSTONE', 'capstones', 'capstone_id'],
      ['extension_ids', 'EXTENSION', 'extensions', 'extension_id'],
      ['support_artifact_ids', 'SUPPORT', 'support_artifacts', 'support_id'],
    ];
  for (const [lessonField, kind, collection, idField] of configurations) {
    const rows = objects(curriculum[collection]);
    for (const id of strings(lesson[lessonField])) {
      const matches = rows.filter((candidate) => candidate[idField] === id);
      const row = matches.length === 1 ? matches[0] : undefined;
      if (row === undefined) {
        addReason(
          reasons,
          'REQUIRED_DECISION_UNRESOLVED',
          `curriculum.lessons[${lessonId}].${lessonField}`,
          `${kind.toLowerCase()} attachment ${id} does not resolve uniquely`,
        );
      }
      const delivery = isObject(row?.delivery_evidence) ? row.delivery_evidence : {};
      const declaredHostCoreIds =
        kind === 'CAPSTONE' ? strings(row?.component_kc_ids) : strings(row?.host_core_ids);
      const ownerLessonId =
        kind === 'SUPPORT'
          ? nonemptyString(row?.host_lesson_id)
          : nonemptyString(row?.owning_lesson_id, lessonId);
      const localHostKcIds = declaredHostCoreIds.filter((kcId) => lessonKcSet.has(kcId));
      const secondaryLessonIds =
        kind === 'SUPPORT'
          ? strings(row?.secondary_display_host_ids)
          : strings(row?.secondary_application_lesson_ids);
      const hostCapstoneIds =
        kind === 'EXTENSION'
          ? strings(row?.host_capstone_ids).filter((capstoneId) =>
              strings(lesson.capstone_ids).includes(capstoneId),
            )
          : [];
      const secondary =
        ownerLessonId !== lessonId &&
        (kind === 'CAPSTONE' || secondaryLessonIds.includes(lessonId));
      const mismatch =
        kind === 'EXTENSION' &&
        !secondary &&
        declaredHostCoreIds.length > 0 &&
        localHostKcIds.length === 0;
      const hostScope: PacketAttachmentAudit['hostScope'] = secondary
        ? { kind: 'SECONDARY_APPLICATION', primaryLessonId: ownerLessonId }
        : kind === 'EXTENSION' && declaredHostCoreIds.length === 0 && hostCapstoneIds.length > 0
          ? { kind: 'CAPSTONE', capstoneIds: hostCapstoneIds }
          : localHostKcIds.length > 1
            ? { kind: 'MULTI_KC', kcIds: localHostKcIds }
            : localHostKcIds.length === 1
              ? { kind: 'SINGLE_KC', kcId: localHostKcIds[0]! }
              : { kind: 'LESSON' };
      const sequenceRefs = isObject(lesson.sequence_relation_refs)
        ? lesson.sequence_relation_refs
        : {};
      const attachmentRelationIds = uniqueStrings([
        ...strings(delivery.source_relation_ids),
        ...(kind === 'CAPSTONE'
          ? strings(sequenceRefs.capstone_placements).filter((relationId) =>
              (relationIndex.get(relationId) ?? []).some(
                (relation) =>
                  relation.relationClass === 'MODULE_DELIVERY_EVENT' &&
                  relation.row.placement_kind === 'CAPSTONE_COORDINATION' &&
                  relation.row.target_capstone_id === id,
              ),
            )
          : []),
      ]).sort(compareText);
      const expectedHostLessonIds = uniqueStrings([
        ownerLessonId,
        ...strings(row?.host_lesson_ids),
        nonemptyString(row?.host_lesson_id),
      ]);
      const resolvedRelationClasses: PacketAttachmentAudit['relationClass'][] = [];
      const unresolvedRelationIds = attachmentRelationIds.filter((relationId) => {
        const matches = relationIndex.get(relationId) ?? [];
        if (matches.length !== 1) return true;
        const relation = matches[0]!;
        const canonical = relation.row;
        if (
          relation.relationClass === 'MODULE_DELIVERY_EVENT' &&
          canonical.placement_kind === 'CAPSTONE_COORDINATION' &&
          canonical.target_capstone_id === id &&
          canonical.owning_lesson_id === ownerLessonId &&
          canonicalPacketJson(strings(canonical.component_kc_ids).sort(compareText)) ===
            canonicalPacketJson([...declaredHostCoreIds].sort(compareText))
        ) {
          resolvedRelationClasses.push('CAPSTONE_PLACEMENT');
          return false;
        }
        if (
          relation.relationClass === 'MODULE_DELIVERY_EVENT' &&
          canonical.placement_kind === 'LESSON_FIRST_DELIVERY' &&
          expectedHostLessonIds.includes(nonemptyString(canonical.target_lesson_id)) &&
          strings(delivery.source_relation_ids).includes(relationId)
        ) {
          resolvedRelationClasses.push('FIRST_DELIVERY');
          return false;
        }
        if (
          relation.relationClass === 'MODULE_REVISIT' &&
          expectedHostLessonIds.includes(nonemptyString(canonical.target_lesson_id)) &&
          strings(delivery.source_relation_ids).includes(relationId)
        ) {
          resolvedRelationClasses.push('REVISIT');
          return false;
        }
        if (
          relation.relationClass === 'HELD_NONREQUIRED' &&
          canonical.entity_id === id &&
          canonical.entity_type === kind &&
          canonical.hold_id === delivery.hold_id &&
          canonical.active_sequence_target === false &&
          canonical.required_delivery === false
        ) {
          resolvedRelationClasses.push('HELD_ATTACHMENT');
          return false;
        }
        if (
          relation.relationClass === 'LESSON_INTERNAL' &&
          canonical.lesson_id === ownerLessonId &&
          canonical.grouping_id ===
            nonemptyString(lesson.owning_cluster_id, nonemptyString(lesson.grouping_id)) &&
          strings(canonical.ordered_entity_ids).includes(id)
        ) {
          resolvedRelationClasses.push('LESSON_INTERNAL');
          return false;
        }
        return true;
      });
      const uniqueRelationClasses = uniqueStrings(resolvedRelationClasses);
      const relationClass: PacketAttachmentAudit['relationClass'] =
        uniqueRelationClasses.length === 1
          ? (uniqueRelationClasses[0] as PacketAttachmentAudit['relationClass'])
          : 'LESSON_INTERNAL';
      if (
        row === undefined ||
        attachmentRelationIds.length === 0 ||
        unresolvedRelationIds.length > 0 ||
        uniqueRelationClasses.length !== 1
      ) {
        addReason(
          reasons,
          'REQUIRED_SEQUENCE_RELATION_UNRESOLVED',
          `curriculum.${collection}[${id}].delivery_evidence.source_relation_ids`,
          `${kind.toLowerCase()} attachment ${id} has missing, unrelated, misdirected, or non-unique source relations for ${lessonId}`,
        );
      }
      result.push({
        id,
        kind,
        ownerLessonId,
        hostScope,
        declaredHostCoreIds,
        hostCoreMembershipStatus: mismatch ? 'MISMATCH_PROVISIONAL' : 'RESOLVED',
        creditsKcEvidence: !mismatch && !secondary && hostScope.kind !== 'LESSON',
        relationIds: attachmentRelationIds,
        relationClass,
        relationDirection: secondary ? 'LESSON_TO_ATTACHMENT' : 'ATTACHMENT_TO_LESSON',
        requiredDelivery: row?.required_delivery === true || row?.delivery_state === 'required',
        ...(mismatch
          ? {
              lineageNonclaim:
                'The declared host cores are not knowledge components of this lesson. They are preserved as lineage and credit no knowledge component, no exit condition, and no mastery attribution here.',
              correctionRequiredAfterDeadline: true as const,
            }
          : {}),
      });
    }
  }
  return result;
}

function packetSourceDocuments(
  orderedKcs: readonly PacketKcAudit[],
  sourceCrosswalkPath: string,
): TaskPacketSourceDocument[] {
  const occurrences = new Map<string, RightsSafeSourceOccurrence>();
  for (const kc of orderedKcs) {
    for (const occurrence of kc.sourceOccurrences) {
      if (!occurrences.has(occurrence.sourceOccurrenceId)) {
        occurrences.set(occurrence.sourceOccurrenceId, occurrence);
      }
    }
  }
  const documents = new Map<string, TaskPacketSourceDocument>();
  for (const occurrence of occurrences.values()) {
    if (!documents.has(occurrence.sourceId)) {
      documents.set(occurrence.sourceId, {
        source_id: occurrence.sourceId,
        source_class: occurrence.sourceClass,
        source_locator: sourceCrosswalkPath,
        present_day_authority_refreshed: occurrence.authorityStatus.presentDayAuthorityRefreshed,
      });
    }
  }
  return [...documents.values()];
}

function contractIdentity(schema: JsonObject): {
  readonly contractId: string;
  readonly contractVersion: string;
} {
  return {
    contractId: nonemptyString(schema.x_contract_id),
    contractVersion: nonemptyString(schema.x_contract_version),
  };
}

function buildPacket(
  sources: PacketGeneratorSources,
  request: PacketRequest,
  inputHashes: Readonly<Record<keyof PacketSourcePaths, PacketInputHash>>,
  lesson: JsonObject,
  audit: PacketAudit,
  releasePolicy: JsonObject,
  deadlineProfile: JsonObject,
  packetSchema: JsonObject,
  blockReasons: readonly PacketBlockReason[],
): TaskSourcePacket {
  const identity = contractIdentity(packetSchema);
  const policyRef = `policy:${sources.paths.releasePolicy}#sha256:${inputHashes.releasePolicy.fileSha256}`;
  const profileRef = `profile:${sources.paths.deadlineProfile}#sha256:${inputHashes.deadlineProfile.fileSha256}`;
  const routeProofs = isObject(releasePolicy.route_proofs)
    ? structuredClone(releasePolicy.route_proofs)
    : {};
  const rubricIdentity = isObject(deadlineProfile.rubric_identity)
    ? structuredClone(deadlineProfile.rubric_identity)
    : {
        rubric_path: sources.paths.rubric,
        rubric_version: '0.9.1',
        rubric_sha256: inputHashes.rubric.fileSha256,
      };
  const packetInputKeys: readonly (keyof PacketSourcePaths)[] = [
    'assignmentProof',
    'ownerSourceUseReceipt',
    'curriculumManifest',
    'sourceCrosswalk',
    'researchRegistry',
    'taskPacketSchema',
    'sharedVocabularySchema',
    'deadlineProfile',
    'releasePolicy',
    'rubric',
  ];
  const sourceUseReceiptRef = `source-use-receipt:${sources.paths.ownerSourceUseReceipt}#sha256:${inputHashes.ownerSourceUseReceipt.fileSha256}`;
  const allocationProofRef = `allocation-proof:${sources.paths.assignmentProof}#sha256:${inputHashes.assignmentProof.fileSha256}`;
  const ready = blockReasons.length === 0;
  if (
    audit.laneId === '' ||
    audit.assignmentId === '' ||
    audit.teamId === '' ||
    audit.output.outputDirectory === ''
  ) {
    throw new Error(
      `cannot build packet ${request.lessonId} without an authoritative allocation-proof identity`,
    );
  }
  const authorablePacketPath = outputPath(request.lessonId);
  const quarantineOutputPath = quarantinePath(audit.laneId, request.lessonId);
  const hasProvisionalHostLineage = audit.attachments.some(
    (attachment) => attachment.hostCoreMembershipStatus === 'MISMATCH_PROVISIONAL',
  );
  const packet: TaskSourcePacket = {
    contract_id: identity.contractId,
    contract_version: identity.contractVersion,
    frozen: true,
    packet_id: `packet:${audit.laneId}/${request.lessonId.toLowerCase()}`,
    packet_status: ready ? 'READY' : 'BLOCKED',
    packet_surface: ready ? 'AUTHORABLE' : 'QUARANTINE',
    block_reasons: blockReasons.map((reason) => ({
      code: reason.code,
      path: reason.path,
      message: reason.message,
    })),
    request_id: request.requestId,
    ...(!ready ? { authorable_packet_ref: null, packet_content_sha256: null } : {}),
    assignment_id: audit.assignmentId,
    team_id: audit.teamId,
    lane_id: audit.laneId,
    requested_name: audit.identity.canonicalTitle,
    lesson_id: request.lessonId,
    grouping_id: audit.identity.groupingId,
    identity: {
      canonical_title: audit.identity.canonicalTitle,
      short_alias: audit.canonicalSlug,
      lesson_type: audit.identity.lessonType,
      cluster_id: audit.identity.groupingId,
      content_categories: strings(lesson.content_categories),
      foundational_concepts: strings(lesson.foundational_concepts),
      source_sections: audit.identity.sourceSections,
    },
    source_sanitization: {
      scope: audit.sourceSanitization.scope,
      considered_occurrence_count: audit.sourceSanitization.consideredOccurrenceCount,
      trusted_canonical_input: audit.sourceSanitization.trustedCanonicalInput,
      sanitized_raw_field_count: audit.sourceSanitization.sanitizedRawFieldCount,
      excluded_held_claim_count: audit.sourceSanitization.excludedHeldClaimCount,
      codes: audit.sourceSanitization.codes,
    },
    curriculum_manifest_sha256: inputHashes.curriculumManifest.fileSha256,
    input_hashes: packetInputKeys.map((key) => ({
      input: key,
      path: sources.paths[key],
      file_sha256: inputHashes[key].fileSha256,
      content_sha256: inputHashes[key].contentSha256,
    })),
    placements: {
      phase_ids: audit.placements.phaseIds,
      module_ids: audit.placements.moduleIds,
      pathway_positions: audit.placements.pathwayPositions.map((position) => ({
        pathway_id: position.pathwayId,
        position: position.position,
        relation_ids: position.relationIds,
      })),
      first_delivery_relation_id: audit.placements.firstDeliveryRelationId,
      revisit_relation_ids: audit.placements.revisitRelationIds,
    },
    ordered_kc_ids: audit.orderedKcs.map((kc) => kc.kcId),
    ordered_kc_records: audit.orderedKcs.map((kc) => ({
      kc_id: kc.kcId,
      label: kc.label,
      competency: kc.competency,
      scope_in: kc.scopeIn,
      scope_out: kc.scopeOut,
      representations: kc.representations,
      reasoning_operation: kc.reasoningOperation,
      source_set_status: kc.sourceSetStatus,
      source_mappings: kc.sourceMappings.map((mapping) => ({
        mapping_id: mapping.mappingId,
        relation: mapping.relation,
        source_occurrence_ids: mapping.sourceOccurrenceIds,
      })),
      source_occurrences: kc.sourceOccurrences.map((occurrence) => ({
        source_occurrence_id: occurrence.sourceOccurrenceId,
        occurrence_kind: occurrence.occurrenceKind,
        source_id: occurrence.sourceId,
        source_class: occurrence.sourceClass,
        official_path: occurrence.officialPath,
        official_topic: occurrence.officialTopic,
        printed_pages: occurrence.printedPages,
        source_anchor_ids: occurrence.sourceAnchorIds,
        derived_summary: occurrence.derivedSummary,
        scope_status: occurrence.scopeStatus,
        authority_status: {
          source_id: occurrence.authorityStatus.source,
          present_day_authority_refreshed: occurrence.authorityStatus.presentDayAuthorityRefreshed,
        },
        rights_status: occurrence.rightsStatus,
        derived_fields_only: occurrence.derivedFieldsOnly,
        permitted_use: occurrence.permittedUse,
        permission_receipt_refs: occurrence.permissionReceiptRefs,
        ...(occurrence.sourceUseReceiptRef === null
          ? {}
          : { source_use_receipt_ref: occurrence.sourceUseReceiptRef }),
      })),
    })),
    prerequisites: {
      hard: audit.prerequisites.hard.map((prerequisite) => ({
        lesson_id: prerequisite.lessonId,
        relation_ids: prerequisite.relationIds,
        source_kc_ids: prerequisite.sourceKcIds,
        taught_at_sequence_position: prerequisite.taughtAtSequencePosition,
      })),
      helpful: audit.prerequisites.helpful.map((prerequisite) => ({
        lesson_id: prerequisite.lessonId,
        relation_ids: prerequisite.relationIds,
      })),
    },
    attachments: audit.attachments.map((attachment) => ({
      attachment_id: attachment.id,
      kind: attachment.kind,
      owner_lesson_id: attachment.ownerLessonId,
      host_scope:
        attachment.hostScope.kind === 'SINGLE_KC'
          ? { kind: 'SINGLE_KC', kc_id: attachment.hostScope.kcId }
          : attachment.hostScope.kind === 'MULTI_KC'
            ? { kind: 'MULTI_KC', kc_ids: attachment.hostScope.kcIds }
            : attachment.hostScope.kind === 'CAPSTONE'
              ? { kind: 'CAPSTONE', capstone_ids: attachment.hostScope.capstoneIds }
              : attachment.hostScope.kind === 'SECONDARY_APPLICATION'
                ? {
                    kind: 'SECONDARY_APPLICATION',
                    primary_lesson_id: attachment.hostScope.primaryLessonId,
                  }
                : { kind: 'LESSON' },
      declared_host_core_ids: attachment.declaredHostCoreIds,
      host_core_membership_status: attachment.hostCoreMembershipStatus,
      credits_kc_evidence: attachment.creditsKcEvidence,
      relation_ids: attachment.relationIds,
      relation_class: attachment.relationClass,
      relation_direction: attachment.relationDirection,
      required_delivery: attachment.requiredDelivery,
      ...(attachment.lineageNonclaim === undefined
        ? {}
        : {
            lineage_nonclaim: attachment.lineageNonclaim,
            correction_required_after_deadline: attachment.correctionRequiredAfterDeadline,
          }),
    })),
    source_anchors: uniqueStrings([
      ...audit.orderedKcs.flatMap((kc) =>
        kc.sourceOccurrences.flatMap((occurrence) => occurrence.sourceAnchorIds),
      ),
    ]),
    holds: audit.holds.map((hold) => ({
      hold_id: hold.holdId,
      type: hold.type,
      issue: hold.issue,
      classification: hold.classification,
      safe_interim_code: hold.safeInterimCode,
      safe_interim_behavior: hold.safeInterimBehavior,
      nonclaim: hold.nonclaim,
      blocks_authoring: hold.blocksAuthoring,
    })),
    source_documents: packetSourceDocuments(audit.orderedKcs, sources.paths.sourceCrosswalk),
    research_evidence: {
      registry_id: audit.researchEvidence.registryId,
      authority: audit.researchEvidence.authority,
      used_as_domain_fact_authority: audit.researchEvidence.usedAsDomainFactAuthority,
      nonclaim: audit.researchEvidence.nonclaim,
    },
    adaptive_policy: {
      bypass_authorized: false,
      mastery_threshold: null,
      fluency_threshold: null,
      uncertainty_threshold: null,
    },
    dok_authoring: {
      item_level_dok_labels_authorized: false,
      requirement: audit.dokAuthoring.requirement,
    },
    output_requirements: {
      authorable_packet_path: authorablePacketPath,
      output_directory: ready ? audit.output.outputDirectory : quarantineOutputPath,
      canonical_template_path: audit.output.canonicalTemplatePath,
      anchor_set_version: audit.output.anchorSetVersion,
      max_revision_cycles: audit.output.maxRevisionCycles,
      required_handoff_files: audit.output.requiredHandoffFiles,
    },
    route_universe: [...ROUTE_UNIVERSE],
    route_proofs: routeProofs,
    required_human_review_roles: ['PRODUCT_PEDAGOGY_OWNER'],
    rubric_identity: rubricIdentity,
    deadline_profile_ref: profileRef,
    source_use_receipt_ref: sourceUseReceiptRef,
    allocation_proof_ref: allocationProofRef,
    nonclaims: isObject(deadlineProfile.nonclaims)
      ? structuredClone(deadlineProfile.nonclaims)
      : { ...NONCLAIMS },
    route_scope_code: nonemptyString(releasePolicy.route_scope_code, 'STANDARD_ONLY'),
    applicable_routes: strings(releasePolicy.applicable_routes),
    ratified_policy_version: nonemptyString(releasePolicy.policy_version),
    release_policy_ref: policyRef,
    ...(hasProvisionalHostLineage
      ? {
          provisional_host_lineage: {
            present: true,
            nonclaim:
              'One or more attachments in this packet declare host cores that are not knowledge components of this lesson. They are delivered at lesson level and credit nothing.',
            correction_required_after_deadline: true,
          },
        }
      : {}),
  };
  return packet;
}

function outputPath(lessonId: string): string {
  return `content/lesson-factory/packets/${lessonId}/task-source-packet.json`;
}

function quarantinePath(laneId: string, lessonId: string): string {
  return `.tmp/lesson-factory/${laneId}/${lessonId.toLowerCase()}/quarantine/blocked-packet-audit.json`;
}

function canonicalPacketLocator(laneId: string, lessonId: string): `${string}/${string}` {
  return `${laneId}/${lessonId.toLowerCase()}`;
}

function passesCanonicalAdmission(
  packet: TaskSourcePacket,
  locator: `${string}/${string}`,
): { readonly passed: boolean; readonly diagnostic: CanonicalAdmissionDiagnostic } {
  try {
    const request = { bytes: serializedJson(packet), locator };
    const result = admitTaskSourcePacketV5(request);
    const passed =
      result.admission === 'ADMITTED' &&
      result.semantic_validation.validator === 'PACKET_SEMANTICS_V1' &&
      result.semantic_validation.status === 'PASS' &&
      result.semantic_validation.error_count === 0;
    const diagnostic = passed
      ? {
          stage: 'ADMITTED' as const,
          code: 'ADMITTED' as const,
          paths: [] as readonly string[],
          problems: [] as readonly string[],
        }
      : diagnoseTaskSourcePacketV5(request);
    return {
      passed,
      diagnostic: {
        admission: result.admission,
        validator: result.semantic_validation.validator,
        status: result.semantic_validation.status,
        errorCount: result.semantic_validation.error_count,
        stage: diagnostic.stage,
        code: diagnostic.code,
        paths: diagnostic.paths,
        problems: diagnostic.problems,
      },
    };
  } catch (error) {
    return {
      passed: false,
      diagnostic: {
        admission: 'REJECTED',
        validator: 'PACKET_SEMANTICS_V1',
        status: 'NOT_RUN',
        errorCount: 0,
        stage: 'IDENTITY',
        code: 'UNIDENTIFIABLE',
        paths: ['/'],
        problems: [`canonical admission threw ${error instanceof Error ? error.name : 'Error'}`],
      },
    };
  }
}

function blockedResult(
  request: PacketRequest,
  reasons: readonly PacketBlockReason[],
  audit: PacketAudit,
  quarantineRecord: TaskSourcePacket | null = null,
  scopeClassification: PacketGenerationResult['scopeClassification'] = audit.assignmentId === ''
    ? 'UNRESOLVED'
    : 'IN_SCOPE',
  canonicalAdmissionDiagnostic: CanonicalAdmissionDiagnostic | null = null,
): PacketGenerationResult {
  const quarantineBytes = quarantineRecord === null ? null : serializedJson(quarantineRecord);
  return {
    lessonId: request.lessonId,
    status: 'BLOCKED',
    scopeClassification,
    blockReasons: reasons,
    audit,
    packet: null,
    bytes: null,
    packetContentSha256: null,
    packetFileSha256: null,
    outputPath: outputPath(request.lessonId),
    quarantineRecord,
    quarantineBytes,
    quarantineContentSha256:
      quarantineRecord === null ? null : sha256Hex(canonicalPacketJson(quarantineRecord)),
    quarantineFileSha256: quarantineBytes === null ? null : sha256Hex(quarantineBytes),
    quarantinePath:
      quarantineRecord === null
        ? null
        : quarantinePath(nonemptyString(quarantineRecord.lane_id), request.lessonId),
    canonicalAdmissionDiagnostic,
  };
}

function validateAllocationProofIdentity(
  proof: JsonObject,
  sources: PacketGeneratorSources,
  inputHashes: Readonly<Record<keyof PacketSourcePaths, PacketInputHash>>,
  reasons: PacketBlockReason[],
): void {
  const sourceManifest = isObject(proof.source_manifest) ? proof.source_manifest : {};
  const rubricIdentity = isObject(proof.rubric_identity) ? proof.rubric_identity : {};
  const assignmentSchema = isObject(proof.assignment_schema) ? proof.assignment_schema : {};
  const expectedDeadlineRef = `profile:${sources.paths.deadlineProfile}#sha256:${inputHashes.deadlineProfile.fileSha256}`;
  const expectedPolicyRef = `policy:${sources.paths.releasePolicy}#sha256:${inputHashes.releasePolicy.fileSha256}`;
  const issues = [
    proof.contract_id !== 'lesson-factory.assignment-partition-proof' ? 'contract_id' : '',
    !/^[0-9]+\.[0-9]+\.[0-9]+$/.test(nonemptyString(proof.contract_version))
      ? 'contract_version'
      : '',
    sourceManifest.path !== sources.paths.curriculumManifest ? 'source_manifest.path' : '',
    sourceManifest.file_sha256 !== inputHashes.curriculumManifest.fileSha256
      ? 'source_manifest.file_sha256'
      : '',
    sourceManifest.content_sha256 !== inputHashes.curriculumManifest.contentSha256
      ? 'source_manifest.content_sha256'
      : '',
    proof.deadline_profile_ref !== expectedDeadlineRef ? 'deadline_profile_ref' : '',
    proof.release_policy_ref !== expectedPolicyRef ? 'release_policy_ref' : '',
    rubricIdentity.rubric_path !== sources.paths.rubric ? 'rubric_identity.rubric_path' : '',
    rubricIdentity.rubric_sha256 !== inputHashes.rubric.fileSha256
      ? 'rubric_identity.rubric_sha256'
      : '',
    assignmentSchema.shared_vocabulary_file_sha256 !== inputHashes.sharedVocabularySchema.fileSha256
      ? 'assignment_schema.shared_vocabulary_file_sha256'
      : '',
  ].filter((issue) => issue !== '');
  if (issues.length > 0) {
    addReason(
      reasons,
      'ASSIGNMENT_IDENTITY_MISMATCH',
      'allocation_proof',
      `allocation proof is not pinned to the authoritative generator inputs: ${issues.join(', ')}`,
    );
  }
}

export function createTaskSourcePacket(input: PacketGeneratorInput): PacketGenerationResult {
  const { sources, request } = input;
  const reasons: PacketBlockReason[] = [];
  const inputHashes = computeInputHashes(sources, reasons);
  const unresolvedAllocation: AllocationIdentity = {
    assignmentId: '',
    teamId: '',
    laneId: '',
    outputDirectory: '',
  };
  if (reasons.some((reason) => reason.code === 'INPUT_HASH_MISMATCH')) {
    return blockedResult(
      request,
      reasons,
      emptyAudit(sources, request, unresolvedAllocation, inputHashes, {}, {}),
    );
  }
  const parsedJson: Readonly<Record<Exclude<keyof PacketSourcePaths, 'rubric'>, JsonObject>> = {
    assignmentProof: parseJsonObject(sources.allocationProofText, 'WP-02 allocation proof'),
    ownerSourceUseReceipt: parseJsonObject(
      sources.ownerSourceUseReceiptText,
      'owner source-use receipt',
    ),
    curriculumManifest: parseJsonObject(sources.curriculumManifestText, 'curriculum manifest'),
    sourceCrosswalk: parseJsonObject(sources.sourceCrosswalkText, 'source crosswalk'),
    researchRegistry: parseJsonObject(sources.researchRegistryText, 'research evidence registry'),
    taskPacketSchema: parseJsonObject(sources.taskPacketSchemaText, 'WP-01 task packet schema'),
    sharedVocabularySchema: parseJsonObject(
      sources.sharedVocabularySchemaText,
      'WP-01 shared vocabulary schema',
    ),
    deadlineProfile: parseJsonObject(sources.deadlineProfileText, 'deadline profile'),
    releasePolicy: parseJsonObject(sources.releasePolicyText, 'release policy'),
  };
  completeInputContentHashes(sources, inputHashes, parsedJson, reasons);
  if (reasons.some((reason) => reason.code === 'INPUT_HASH_MISMATCH')) {
    return blockedResult(
      request,
      reasons,
      emptyAudit(sources, request, unresolvedAllocation, inputHashes, {}, {}),
    );
  }
  const allocationProof = parsedJson.assignmentProof;
  const sourceUseReceipt = parsedJson.ownerSourceUseReceipt;
  const manifest = parsedJson.curriculumManifest;
  const crosswalk = parsedJson.sourceCrosswalk;
  const researchRegistry = parsedJson.researchRegistry;
  const packetSchema = parsedJson.taskPacketSchema;
  const deadlineProfile = parsedJson.deadlineProfile;
  const releasePolicy = parsedJson.releasePolicy;
  const sourceUseReceiptRef = `source-use-receipt:${sources.paths.ownerSourceUseReceipt}#sha256:${inputHashes.ownerSourceUseReceipt.fileSha256}`;
  const sourceDecisions = objects(sourceUseReceipt.source_decisions);
  const decidedSourceIds = sourceDecisions.map((decision) => nonemptyString(decision.source_id));
  if (
    sourceUseReceipt.contract_id !== 'lesson-factory.owner-source-use-receipt' ||
    sourceUseReceipt.contract_version !== '2.0.0' ||
    sourceUseReceipt.undecided_source_disposition !== 'PROHIBITED' ||
    sourceDecisions.length === 0 ||
    new Set(decidedSourceIds).size !== sourceDecisions.length ||
    sourceDecisions.some(
      (decision) =>
        !['REPOSITORY', 'PUBLIC_PRIMARY_RESEARCH', 'PRIVATE_COMPARISON'].includes(
          nonemptyString(decision.source_class),
        ) ||
        !Array.isArray(decision.permitted_use_codes) ||
        !Array.isArray(decision.derived_field_allowlist),
    )
  ) {
    addReason(
      reasons,
      'SOURCE_RIGHTS_UNCLEARED',
      'owner_source_use_receipt',
      'owner source-use receipt identity or exact source-ID decisions are incomplete',
    );
  }
  validateAllocationProofIdentity(allocationProof, sources, inputHashes, reasons);
  const curriculum = isObject(manifest.curriculum) ? manifest.curriculum : {};
  const lessonMatches = objects(curriculum.lessons).filter(
    (lesson) => lesson.lesson_id === request.lessonId,
  );
  const allocation = resolveAllocationIdentity(allocationProof, request.lessonId, reasons);
  const baseAudit = emptyAudit(
    sources,
    request,
    allocation,
    inputHashes,
    researchRegistry,
    releasePolicy,
    deadlineProfile,
  );
  if (lessonMatches.length === 0) {
    addReason(
      reasons,
      'UNKNOWN_LESSON_ID',
      'curriculum.lessons',
      `lesson ${request.lessonId} does not resolve in curriculum.lessons`,
    );
    return blockedResult(request, reasons, baseAudit);
  }
  if (lessonMatches.length > 1) {
    addReason(
      reasons,
      'DUPLICATE_LESSON_ID',
      'curriculum.lessons',
      `lesson ${request.lessonId} resolves ${lessonMatches.length} times`,
    );
    return blockedResult(request, reasons, baseAudit);
  }
  if (
    allocation.assignmentId === '' ||
    allocation.teamId === '' ||
    allocation.laneId === '' ||
    allocation.outputDirectory === ''
  ) {
    return blockedResult(request, reasons, baseAudit, null, 'OUT_OF_SCOPE_EXISTING');
  }
  const lesson = lessonMatches[0]!;
  const holds = applicableHolds(manifest, curriculum, lesson);
  const holdPlan = holdExecutionPlan(holds, curriculum, lesson, reasons);
  const trustedCanonicalInput =
    sources.paths.sourceCrosswalk === TRUSTED_CANONICAL_CROSSWALK.path &&
    crosswalk.schema_version === TRUSTED_CANONICAL_CROSSWALK.schemaVersion &&
    inputHashes.sourceCrosswalk.fileSha256 === TRUSTED_CANONICAL_CROSSWALK.fileSha256 &&
    inputHashes.sourceCrosswalk.contentSha256 === TRUSTED_CANONICAL_CROSSWALK.contentSha256;
  const orderedKcs = mapRequiredKcs(
    curriculum,
    crosswalk,
    lesson,
    holdPlan,
    trustedCanonicalInput,
    sourceUseReceipt,
    sourceUseReceiptRef,
    reasons,
  );
  if (orderedKcs.length === 0) {
    addReason(
      reasons,
      'REQUIRED_KC_UNRESOLVED',
      `curriculum.lessons[${request.lessonId}].ordered_required_kc_ids`,
      `lesson ${request.lessonId} has no ordered required KCs`,
    );
  }
  const placement = packetPlacements(manifest, lesson, reasons);
  const prerequisiteAudit = prerequisites(manifest, curriculum, lesson, reasons);
  const attachmentAudit = attachments(manifest, curriculum, lesson, reasons);
  const identity: PacketAudit['identity'] = {
    canonicalTitle: nonemptyString(lesson.canonical_display_label, request.lessonId),
    shortAlias: nonemptyString(lesson.short_display_alias, request.lessonId),
    lessonType: nonemptyString(lesson.lesson_type, 'UNSPECIFIED'),
    groupingId: nonemptyString(lesson.owning_cluster_id, nonemptyString(lesson.grouping_id)),
    sourceSections: strings(lesson.source_sections),
  };
  for (const hold of holds) {
    if (hold.blocksAuthoring) {
      addReason(
        reasons,
        'REQUIRED_DECISION_UNRESOLVED',
        `curriculum.holds[${hold.holdId}]`,
        `hold ${hold.holdId} has no safe interim behavior for a required authored fact`,
      );
    }
  }
  const audit: PacketAudit = {
    ...baseAudit,
    identity,
    orderedKcs,
    prerequisites: prerequisiteAudit,
    placements: placement.audit,
    attachments: attachmentAudit,
    holds,
    sourceSanitization: {
      scope: 'SELECTED_PACKET_OCCURRENCES',
      consideredOccurrenceCount: orderedKcs.reduce(
        (count, kc) => count + kc.sourceOccurrences.length,
        0,
      ),
      trustedCanonicalInput,
      sanitizedRawFieldCount: trustedCanonicalInput
        ? objects(crosswalk.source_occurrences)
            .filter((occurrence) =>
              orderedKcs.some((kc) =>
                kc.sourceOccurrences.some(
                  (selected) => selected.sourceOccurrenceId === occurrence.source_occurrence_id,
                ),
              ),
            )
            .reduce(
              (count, occurrence) =>
                count +
                Object.keys(occurrence).filter((key) =>
                  TRUSTED_CANONICAL_RAW_KEYS.has(key.toLowerCase()),
                ).length,
              0,
            )
        : 0,
      excludedHeldClaimCount: holdPlan.excludedCount(),
      codes: uniqueStrings([
        ...(trustedCanonicalInput &&
        orderedKcs.some((kc) =>
          kc.sourceOccurrences.some((selected) => {
            const occurrence = objects(crosswalk.source_occurrences).find(
              (row) => row.source_occurrence_id === selected.sourceOccurrenceId,
            );
            return (
              occurrence !== undefined &&
              Object.keys(occurrence).some((key) =>
                TRUSTED_CANONICAL_RAW_KEYS.has(key.toLowerCase()),
              )
            );
          }),
        )
          ? ['TRUSTED_CANONICAL_RAW_FIELDS_SANITIZED']
          : []),
        ...(holdPlan.excludedCount() > 0 ? ['HELD_SOURCE_CLAIMS_EXCLUDED'] : []),
      ]),
    },
  };
  if (reasons.length > 0) {
    const quarantineCandidate = buildPacket(
      sources,
      request,
      inputHashes,
      lesson,
      audit,
      releasePolicy,
      deadlineProfile,
      packetSchema,
      reasons,
    );
    const quarantineSchemaErrors = validateTaskSourcePacket(
      quarantineCandidate,
      sources.taskPacketSchemaText,
      sources.sharedVocabularySchemaText,
    );
    const quarantineSemanticErrors =
      quarantineSchemaErrors.length === 0
        ? validateTaskSourcePacketSemantics(quarantineCandidate, sources)
        : [];
    const canonicalAdmission =
      quarantineSchemaErrors.length === 0 && quarantineSemanticErrors.length === 0
        ? passesCanonicalAdmission(
            quarantineCandidate,
            canonicalPacketLocator(audit.laneId, request.lessonId),
          )
        : null;
    return blockedResult(
      request,
      reasons,
      audit,
      canonicalAdmission?.passed === true ? quarantineCandidate : null,
      'IN_SCOPE',
      canonicalAdmission?.diagnostic ?? null,
    );
  }
  const candidate = buildPacket(
    sources,
    request,
    inputHashes,
    lesson,
    audit,
    releasePolicy,
    deadlineProfile,
    packetSchema,
    reasons,
  );
  const schemaErrors = validateTaskSourcePacket(
    candidate,
    sources.taskPacketSchemaText,
    sources.sharedVocabularySchemaText,
  );
  const semanticErrors =
    schemaErrors.length === 0 ? validateTaskSourcePacketSemantics(candidate, sources) : [];
  if (schemaErrors.length > 0 || semanticErrors.length > 0) {
    addReason(
      reasons,
      'WP01_SCHEMA_VALIDATION_FAILED',
      'task-source-packet',
      `final WP-01 schema/semantic validation rejected the packet: ${[
        ...schemaErrors,
        ...semanticErrors,
      ].join('; ')}`,
    );
    const quarantineCandidate = buildPacket(
      sources,
      request,
      inputHashes,
      lesson,
      audit,
      releasePolicy,
      deadlineProfile,
      packetSchema,
      reasons,
    );
    const quarantineSchemaErrors = validateTaskSourcePacket(
      quarantineCandidate,
      sources.taskPacketSchemaText,
      sources.sharedVocabularySchemaText,
    );
    const quarantineSemanticErrors =
      quarantineSchemaErrors.length === 0
        ? validateTaskSourcePacketSemantics(quarantineCandidate, sources)
        : [];
    const canonicalAdmission =
      quarantineSchemaErrors.length === 0 && quarantineSemanticErrors.length === 0
        ? passesCanonicalAdmission(
            quarantineCandidate,
            canonicalPacketLocator(audit.laneId, request.lessonId),
          )
        : null;
    return blockedResult(
      request,
      reasons,
      audit,
      canonicalAdmission?.passed === true ? quarantineCandidate : null,
      'IN_SCOPE',
      canonicalAdmission?.diagnostic ?? null,
    );
  }
  const canonicalAdmission = passesCanonicalAdmission(
    candidate,
    canonicalPacketLocator(audit.laneId, request.lessonId),
  );
  if (!canonicalAdmission.passed) {
    addReason(
      reasons,
      'WP01_CANONICAL_ADMISSION_FAILED',
      'canonical_admission',
      'canonical PACKET_SEMANTICS_V1 authority rejected the authorable packet',
    );
    return blockedResult(request, reasons, audit, null, 'IN_SCOPE', canonicalAdmission.diagnostic);
  }
  const bytes = serializedJson(candidate);
  return {
    lessonId: request.lessonId,
    status: 'READY',
    scopeClassification: 'IN_SCOPE',
    blockReasons: reasons,
    audit,
    packet: candidate,
    bytes,
    packetContentSha256: sha256Hex(canonicalPacketJson(candidate)),
    packetFileSha256: sha256Hex(bytes),
    outputPath: outputPath(request.lessonId),
    quarantineRecord: null,
    quarantineBytes: null,
    quarantineContentSha256: null,
    quarantineFileSha256: null,
    quarantinePath: null,
    canonicalAdmissionDiagnostic: canonicalAdmission.diagnostic,
  };
}

function withBatchReason(result: PacketGenerationResult, message: string): PacketGenerationResult {
  const reason: PacketBlockReason = {
    code: 'DUPLICATE_ASSIGNMENT_IDENTITY',
    path: 'requests',
    message,
  };
  return {
    ...result,
    status: 'BLOCKED',
    blockReasons: [...result.blockReasons, reason],
    packet: null,
    bytes: null,
    packetContentSha256: null,
    packetFileSha256: null,
    quarantineRecord: null,
    quarantineBytes: null,
    quarantineContentSha256: null,
    quarantineFileSha256: null,
    quarantinePath: null,
  };
}

export function createTaskSourcePackets(input: {
  readonly sources: PacketGeneratorSources;
  readonly requests: readonly PacketRequest[];
}): PacketBatchResult {
  const counts = new Map<string, number>();
  for (const request of input.requests) {
    counts.set(request.lessonId, (counts.get(request.lessonId) ?? 0) + 1);
  }
  const results = input.requests.map((request) => {
    const generated = createTaskSourcePacket({ sources: input.sources, request });
    return (counts.get(request.lessonId) ?? 0) > 1
      ? withBatchReason(
          generated,
          `lesson ${request.lessonId} appears more than once in explicit packet requests`,
        )
      : generated;
  });
  const allReady = results.length > 0 && results.every((result) => result.status === 'READY');
  const files = allReady
    ? Object.fromEntries(
        results
          .filter(
            (result): result is PacketGenerationResult & { readonly bytes: string } =>
              result.bytes !== null,
          )
          .map((result) => [result.outputPath, result.bytes]),
      )
    : {};
  return {
    results,
    readyCount: results.filter((result) => result.status === 'READY').length,
    blockedCount: results.filter((result) => result.status === 'BLOCKED').length,
    files,
    outputSetSha256: sha256Hex(canonicalPacketJson(files)),
  };
}

export interface PacketResearchPaths {
  readonly researchRoot: string;
  readonly sourceCrosswalkPath: string;
  readonly researchRegistryPath: string;
}

export function resolvePacketResearchPaths(input: {
  readonly repositoryRoot: string;
  readonly envResearchDir?: string;
  readonly pathExists?: (path: string) => boolean;
  readonly readText?: (path: string) => string;
}): PacketResearchPaths {
  const pathExists = input.pathExists ?? existsSync;
  const readText = input.readText ?? ((path: string) => readFileSync(path, 'utf8'));
  const siblingRoot = join(input.repositoryRoot, '..', 'research');
  const roots = uniqueStrings([input.envResearchDir?.trim() ?? '', siblingRoot]);
  const crosswalkRelative = 'mcat-curriculum-architecture-v3/v3-source-crosswalk.json';
  const registryRelative =
    'mcat-curriculum-architecture-v3/skill-integrated-knowledge-graph/work/research-evidence-registry.json';
  for (const researchRoot of roots) {
    const sourceCrosswalkPath = join(researchRoot, crosswalkRelative);
    const researchRegistryPath = join(researchRoot, registryRelative);
    if (pathExists(sourceCrosswalkPath) && pathExists(researchRegistryPath)) {
      try {
        const crosswalkText = readText(sourceCrosswalkPath);
        const registryText = readText(researchRegistryPath);
        if (crosswalkText.trim() !== '' && registryText.trim() !== '') {
          return { researchRoot, sourceCrosswalkPath, researchRegistryPath };
        }
      } catch {
        // The descriptive aggregate error below identifies required files and attempted roots.
      }
    }
  }
  throw new Error(
    `required sibling research files must exist, be readable and non-empty: v3-source-crosswalk.json and research-evidence-registry.json; attempted roots: ${roots.join(', ')}`,
  );
}

export function verifyPacketArtifact(input: {
  readonly packet: TaskSourcePacket;
  readonly bytes: string;
  readonly expectedContentSha256: string;
  readonly expectedFileSha256: string;
}): void {
  const content = sha256Hex(canonicalPacketJson(input.packet));
  const file = sha256Hex(input.bytes);
  if (content !== input.expectedContentSha256 || file !== input.expectedFileSha256) {
    throw new Error(
      `PACKET_HASH_MISMATCH: expected content/file ${input.expectedContentSha256}/${input.expectedFileSha256}, observed ${content}/${file}`,
    );
  }
}

function schemaType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (Number.isInteger(value)) return 'integer';
  return typeof value;
}

function schemaId(schema: JsonObject, label: string): string {
  if (typeof schema.$id !== 'string' || schema.$id === '') {
    throw new Error(`${label} must declare a non-empty $id`);
  }
  return schema.$id;
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
    throw new Error(`task packet schema has an unresolvable $ref "${ref}"`);
  }
  if (fragment === '') return { schema: document, baseId: targetId };
  if (!fragment.startsWith('/')) {
    throw new Error(`task packet schema has an unsupported $ref fragment "${ref}"`);
  }
  let target: unknown = document;
  for (const encodedSegment of fragment.slice(1).split('/')) {
    const segment = encodedSegment.replace(/~1/g, '/').replace(/~0/g, '~');
    if (!isObject(target) || !(segment in target)) {
      throw new Error(`task packet schema has an unresolvable $ref "${ref}"`);
    }
    target = target[segment];
  }
  if (typeof target !== 'boolean' && !isObject(target)) {
    throw new Error(`task packet schema $ref "${ref}" does not resolve to a schema`);
  }
  return { schema: target, baseId: targetId };
}

function branchIsValid(
  schema: JsonSchema,
  data: unknown,
  baseId: string,
  registry: ReadonlyMap<string, JsonObject>,
): boolean {
  const errors: string[] = [];
  validateSchemaNode(schema, data, baseId, registry, '<probe>', errors);
  return errors.length === 0;
}

function escapePointer(segment: string): string {
  return segment.replace(/~/g, '~0').replace(/\//g, '~1');
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
    if (!SCHEMA_ANNOTATIONS.has(keyword) && !SCHEMA_ASSERTIONS.has(keyword)) {
      throw new Error(
        `task packet schema uses unsupported keyword "${keyword}" at ${path}; refusing partial validation`,
      );
    }
  }
  if (schema.$ref !== undefined) {
    if (typeof schema.$ref !== 'string') {
      throw new Error(`task packet schema has a non-string $ref at ${path}`);
    }
    const target = resolveSchemaRef(schema.$ref, baseId, registry);
    validateSchemaNode(target.schema, data, target.baseId, registry, path, errors);
  }
  for (const keyword of ['allOf', 'anyOf', 'oneOf'] as const) {
    const rawBranches = schema[keyword];
    if (rawBranches === undefined) continue;
    if (!Array.isArray(rawBranches)) {
      throw new Error(`task packet schema has invalid ${keyword} at ${path}`);
    }
    const branches = rawBranches.map((branch) => {
      if (typeof branch !== 'boolean' && !isObject(branch)) {
        throw new Error(`task packet schema has an invalid ${keyword} branch at ${path}`);
      }
      return branch as JsonSchema;
    });
    if (keyword === 'allOf') {
      branches.forEach((branch) =>
        validateSchemaNode(branch, data, baseId, registry, path, errors),
      );
    } else {
      const validCount = branches.filter((branch) =>
        branchIsValid(branch, data, baseId, registry),
      ).length;
      if (keyword === 'anyOf' && validCount === 0) {
        errors.push(`${path}: value does not satisfy anyOf`);
      }
      if (keyword === 'oneOf' && validCount !== 1) {
        errors.push(`${path}: value satisfies ${validCount} oneOf branches`);
      }
    }
  }
  if (schema.not !== undefined) {
    if (typeof schema.not !== 'boolean' && !isObject(schema.not)) {
      throw new Error(`task packet schema has invalid not at ${path}`);
    }
    if (branchIsValid(schema.not as JsonSchema, data, baseId, registry)) {
      errors.push(`${path}: value matches forbidden not schema`);
    }
  }
  if (schema.if !== undefined) {
    if (typeof schema.if !== 'boolean' && !isObject(schema.if)) {
      throw new Error(`task packet schema has invalid if at ${path}`);
    }
    const condition = branchIsValid(schema.if as JsonSchema, data, baseId, registry);
    const selected = condition ? schema.then : schema.else;
    if (selected !== undefined) {
      if (typeof selected !== 'boolean' && !isObject(selected)) {
        throw new Error(`task packet schema has invalid ${condition ? 'then' : 'else'} at ${path}`);
      }
      validateSchemaNode(selected as JsonSchema, data, baseId, registry, path, errors);
    }
  }
  if (schema.type !== undefined) {
    const expected = Array.isArray(schema.type) ? schema.type : [schema.type];
    const actual = schemaType(data);
    const matches = expected.some(
      (candidate) => candidate === actual || (candidate === 'number' && actual === 'integer'),
    );
    if (!matches) {
      errors.push(`${path}: expected type ${expected.map(String).join('|')} but found ${actual}`);
      return;
    }
  }
  if (
    schema.const !== undefined &&
    canonicalPacketJson(data) !== canonicalPacketJson(schema.const)
  ) {
    errors.push(`${path}: value does not match const`);
  }
  if (
    Array.isArray(schema.enum) &&
    !schema.enum.some((candidate) => canonicalPacketJson(candidate) === canonicalPacketJson(data))
  ) {
    errors.push(`${path}: value is not in enum`);
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
      errors.push(`${path}: number is below minimum ${schema.minimum}`);
    }
    if (typeof schema.maximum === 'number' && data > schema.maximum) {
      errors.push(`${path}: number is above maximum ${schema.maximum}`);
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
      data.forEach((item) => {
        const canonical = canonicalPacketJson(item);
        if (seen.has(canonical)) errors.push(`${path}: array contains a duplicate item`);
        seen.add(canonical);
      });
    }
    if (schema.items !== undefined) {
      if (typeof schema.items !== 'boolean' && !isObject(schema.items)) {
        throw new Error(`task packet schema has invalid items at ${path}`);
      }
      data.forEach((item, index) =>
        validateSchemaNode(
          schema.items as JsonSchema,
          item,
          baseId,
          registry,
          `${path}/${index}`,
          errors,
        ),
      );
    }
    if (schema.contains !== undefined) {
      if (typeof schema.contains !== 'boolean' && !isObject(schema.contains)) {
        throw new Error(`task packet schema has invalid contains at ${path}`);
      }
      if (
        !data.some((item) => branchIsValid(schema.contains as JsonSchema, item, baseId, registry))
      ) {
        errors.push(`${path}: array does not contain a matching item`);
      }
    }
  }
  if (isObject(data)) {
    const keys = Object.keys(data);
    if (typeof schema.minProperties === 'number' && keys.length < schema.minProperties) {
      errors.push(`${path}: object has fewer than ${schema.minProperties} properties`);
    }
    if (typeof schema.maxProperties === 'number' && keys.length > schema.maxProperties) {
      errors.push(`${path}: object has more than ${schema.maxProperties} properties`);
    }
    if (schema.propertyNames !== undefined) {
      if (typeof schema.propertyNames !== 'boolean' && !isObject(schema.propertyNames)) {
        throw new Error(`task packet schema has invalid propertyNames at ${path}`);
      }
      keys.forEach((key) =>
        validateSchemaNode(
          schema.propertyNames as JsonSchema,
          key,
          baseId,
          registry,
          `${path}/<property:${escapePointer(key)}>`,
          errors,
        ),
      );
    }
    if (schema.required !== undefined && !Array.isArray(schema.required)) {
      throw new Error(`task packet schema has invalid required at ${path}`);
    }
    if (Array.isArray(schema.required)) {
      for (const required of schema.required) {
        if (typeof required !== 'string') {
          throw new Error(`task packet schema has non-string required property at ${path}`);
        }
        if (!(required in data)) {
          errors.push(`${path}: required property "${required}" is missing`);
        }
      }
    }
    if (schema.properties !== undefined && !isObject(schema.properties)) {
      throw new Error(`task packet schema has invalid properties at ${path}`);
    }
    const propertySchemas = isObject(schema.properties) ? schema.properties : {};
    for (const [key, value] of Object.entries(data)) {
      const childSchema = propertySchemas[key];
      if (childSchema !== undefined) {
        if (typeof childSchema !== 'boolean' && !isObject(childSchema)) {
          throw new Error(`task packet schema property ${path}/${escapePointer(key)} is invalid`);
        }
        validateSchemaNode(
          childSchema as JsonSchema,
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
          throw new Error(`task packet schema has invalid additionalProperties at ${path}`);
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

export function validateTaskSourcePacket(
  document: unknown,
  taskPacketSchemaText: string,
  sharedVocabularySchemaText: string,
): string[] {
  const packetSchema = parseJsonObject(taskPacketSchemaText, 'WP-01 task-source-packet schema');
  const sharedSchema = parseJsonObject(
    sharedVocabularySchemaText,
    'WP-01 shared-vocabulary schema',
  );
  const packetId = schemaId(packetSchema, 'WP-01 task-source-packet schema');
  const sharedId = schemaId(sharedSchema, 'WP-01 shared-vocabulary schema');
  const registry = new Map<string, JsonObject>([
    [packetId, packetSchema],
    [sharedId, sharedSchema],
  ]);
  const errors: string[] = [];
  validateSchemaNode(packetSchema, document, packetId, registry, '<root>', errors);
  return errors;
}

/**
 * Local deterministic preflight diagnostics only.
 *
 * This reduced checker cannot authorize READY or quarantine serialization. The
 * canonical PACKET_SEMANTICS_V1 admission export must independently admit the
 * exact serialized bytes.
 */
export function validateTaskSourcePacketSemantics(
  document: unknown,
  sources: PacketGeneratorSources,
): string[] {
  if (!isObject(document)) return ['task-source packet is not an object'];
  const errors: string[] = [];
  const manifest = parseJsonObject(sources.curriculumManifestText, 'curriculum manifest');
  const curriculum = isObject(manifest.curriculum) ? manifest.curriculum : {};
  const proof = parseJsonObject(sources.allocationProofText, 'allocation proof');
  const receipt = parseJsonObject(sources.ownerSourceUseReceiptText, 'owner source-use receipt');
  const profile = parseJsonObject(sources.deadlineProfileText, 'deadline profile');
  const policy = parseJsonObject(sources.releasePolicyText, 'release policy');
  const lessonId = nonemptyString(document.lesson_id);
  const laneId = nonemptyString(document.lane_id);
  const status = nonemptyString(document.packet_status);
  const identity = isObject(document.identity) ? document.identity : {};
  const lesson = objects(curriculum.lessons).find((row) => row.lesson_id === lessonId);

  if (document.packet_id !== `packet:${laneId}/${lessonId.toLowerCase()}`) {
    errors.push('packet_id does not bind the same lane_id and lesson_id');
  }
  if (lesson !== undefined) {
    if (document.grouping_id !== lesson.owning_cluster_id) {
      errors.push('grouping_id does not equal the curriculum owning cluster');
    }
    if (identity.cluster_id !== document.grouping_id) {
      errors.push('identity.cluster_id does not equal grouping_id');
    }
    if (identity.short_alias !== lessonId.toLowerCase()) {
      errors.push('identity.short_alias is not the canonical lesson slug');
    }
    if (
      canonicalPacketJson(strings(document.ordered_kc_ids)) !==
      canonicalPacketJson(strings(lesson.ordered_required_kc_ids))
    ) {
      errors.push('ordered_kc_ids does not equal the curriculum order');
    }
  }
  const records = objects(document.ordered_kc_records);
  if (
    canonicalPacketJson(records.map((record) => nonemptyString(record.kc_id))) !==
    canonicalPacketJson(strings(document.ordered_kc_ids))
  ) {
    errors.push('ordered_kc_records does not equal ordered_kc_ids in order');
  }

  const inputRows = objects(document.input_hashes);
  const inputByKey = new Map(inputRows.map((row) => [nonemptyString(row.input), row]));
  for (const key of Object.keys(INPUT_TEXT_KEYS) as (keyof PacketSourcePaths)[]) {
    const row = inputByKey.get(key);
    const text = sources[INPUT_TEXT_KEYS[key]] as string;
    let contentSha256 = sha256Hex(text);
    if (key !== 'rubric') {
      contentSha256 = sha256Hex(canonicalPacketJson(JSON.parse(text)));
    }
    if (
      row === undefined ||
      row.path !== sources.paths[key] ||
      row.file_sha256 !== sha256Hex(text) ||
      row.content_sha256 !== contentSha256
    ) {
      errors.push(`input_hashes.${key} path/file_sha256/content_sha256 do not bind exact bytes`);
    }
  }
  if (inputRows.length !== 10 || inputByKey.size !== 10) {
    errors.push('input_hashes must name each of the ten authoritative inputs exactly once');
  }
  const expectedRefs = {
    allocation_proof_ref: `allocation-proof:${sources.paths.assignmentProof}#sha256:${sha256Hex(
      sources.allocationProofText,
    )}`,
    source_use_receipt_ref: `source-use-receipt:${sources.paths.ownerSourceUseReceipt}#sha256:${sha256Hex(
      sources.ownerSourceUseReceiptText,
    )}`,
    deadline_profile_ref: `profile:${sources.paths.deadlineProfile}#sha256:${sha256Hex(
      sources.deadlineProfileText,
    )}`,
    release_policy_ref: `policy:${sources.paths.releasePolicy}#sha256:${sha256Hex(
      sources.releasePolicyText,
    )}`,
  };
  for (const [field, expected] of Object.entries(expectedRefs)) {
    if (document[field] !== expected) errors.push(`${field} does not bind the exact input bytes`);
  }

  const allocationRows = objects(proof.assignments).flatMap((assignment) =>
    objects(assignment.rows).map((row) => ({ assignment, row })),
  );
  const allocationMatches = allocationRows.filter(({ row }) => row.lesson_id === lessonId);
  if (allocationMatches.length === 1) {
    const { assignment, row } = allocationMatches[0]!;
    if (
      document.assignment_id !== row.assignment_id ||
      document.team_id !== row.team_id ||
      document.lane_id !== row.lane_id ||
      row.assignment_id !== assignment.assignment_id ||
      row.team_id !== assignment.team_id ||
      row.lane_id !== assignment.lane_id
    ) {
      errors.push('assignment_id/team_id/lane_id do not equal the exact proof row');
    }
  } else if (
    status === 'READY' ||
    !objects(document.block_reasons).some(
      (reason) => reason.code === 'ASSIGNMENT_IDENTITY_MISMATCH',
    )
  ) {
    errors.push('allocation proof row is unresolved without a matching block reason');
  }

  const occurrences = records.flatMap((record) => objects(record.source_occurrences));
  const sanitization = isObject(document.source_sanitization) ? document.source_sanitization : {};
  if (sanitization.scope !== 'SELECTED_PACKET_OCCURRENCES') {
    errors.push('source_sanitization.scope is not selected packet occurrences');
  }
  if (sanitization.considered_occurrence_count !== occurrences.length) {
    errors.push(
      'source_sanitization.considered_occurrence_count does not equal selected occurrences',
    );
  }
  const decisions = objects(receipt.source_decisions);
  for (const occurrence of occurrences) {
    const sourceId = nonemptyString(occurrence.source_id);
    const matches = decisions.filter((decision) => decision.source_id === sourceId);
    if (matches.length !== 1) {
      errors.push(`source occurrence ${sourceId} has no unique receipt decision`);
      continue;
    }
    const decision = matches[0]!;
    const allowed = new Set(strings(decision.derived_field_allowlist));
    if (
      occurrence.source_class !== decision.source_class ||
      occurrence.rights_status !== (decision.usable === true ? 'PERMITTED' : 'PROHIBITED') ||
      canonicalPacketJson(strings(occurrence.permitted_use)) !==
        canonicalPacketJson(
          decision.usable === true ? strings(decision.permitted_use_codes) : [],
        ) ||
      (!allowed.has('official_topic') && occurrence.official_topic !== null) ||
      (!allowed.has('derived_summary') && occurrence.derived_summary !== null)
    ) {
      errors.push(`source occurrence ${sourceId} disagrees with its exact receipt entry`);
    }
  }

  const usedSourceIds = uniqueStrings(
    occurrences.map((occurrence) => nonemptyString(occurrence.source_id)),
  ).sort(compareText);
  const listedSourceIds = objects(document.source_documents)
    .map((row) => nonemptyString(row.source_id))
    .sort(compareText);
  if (canonicalPacketJson(usedSourceIds) !== canonicalPacketJson(listedSourceIds)) {
    errors.push('source_documents does not equal the exact selected source set');
  }
  const usedAnchors = uniqueStrings(
    occurrences.flatMap((occurrence) => strings(occurrence.source_anchor_ids)),
  ).sort(compareText);
  const listedAnchors = strings(document.source_anchors).sort(compareText);
  if (canonicalPacketJson(usedAnchors) !== canonicalPacketJson(listedAnchors)) {
    errors.push('source_anchors does not equal the exact selected anchor set');
  }

  const output = isObject(document.output_requirements) ? document.output_requirements : {};
  if (output.authorable_packet_path !== outputPath(lessonId)) {
    errors.push('output authorable_packet_path is not the canonical content path');
  }
  if (status === 'READY') {
    if (
      document.packet_surface !== 'AUTHORABLE' ||
      objects(document.block_reasons).length !== 0 ||
      output.output_directory !== `.tmp/lesson-factory/${laneId}/${lessonId.toLowerCase()}`
    ) {
      errors.push('READY/AUTHORABLE status, reasons, and output directory disagree');
    }
  } else if (
    document.packet_surface !== 'QUARANTINE' ||
    objects(document.block_reasons).length === 0 ||
    document.authorable_packet_ref !== null ||
    document.packet_content_sha256 !== null ||
    output.output_directory !== quarantinePath(laneId, lessonId)
  ) {
    errors.push('BLOCKED/QUARANTINE status, reasons, nulls, and output path disagree');
  }
  if (
    canonicalPacketJson(document.route_proofs) !== canonicalPacketJson(policy.route_proofs) ||
    canonicalPacketJson(strings(document.applicable_routes)) !==
      canonicalPacketJson(strings(policy.applicable_routes)) ||
    document.route_scope_code !== policy.route_scope_code ||
    document.ratified_policy_version !== policy.policy_version
  ) {
    errors.push('route fields do not equal the exact release policy');
  }
  if (
    canonicalPacketJson(document.rubric_identity) !==
      canonicalPacketJson(profile.rubric_identity) ||
    canonicalPacketJson(document.nonclaims) !== canonicalPacketJson(profile.nonclaims)
  ) {
    errors.push('profile-bound rubric identity or nonclaims disagree');
  }
  return errors;
}
