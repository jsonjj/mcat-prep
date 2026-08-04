import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SchemaRegistry, type JsonObject, type JsonValue } from './json-schema-subset';

/**
 * Locations, canonical vocabulary, and loaders for the frozen lesson-factory
 * deadline contracts (WP-01). Loading is deliberately fail-loud: a missing or
 * unparseable contract throws instead of degrading to an empty registry, because
 * a contract suite that silently skips its subject proves nothing.
 */

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const FACTORY_ROOT = join(REPO_ROOT, 'content/lesson-factory');
export const SCHEMA_DIR = join(FACTORY_ROOT, 'schemas');
export const PROFILE_DIR = join(FACTORY_ROOT, 'deadline-profile');
export const ASSIGNMENTS_DIR = join(FACTORY_ROOT, 'assignments');
export const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
export const DOC_PATH = join(REPO_ROOT, 'docs/lesson-factory/deadline-profile.md');
export const RUBRIC_PATH = join(REPO_ROOT, 'key-docs/lesson-quality-rubric.md');

export const CONTRACT_BASE = 'https://mcat-mastery.internal/lesson-factory/schemas/v1/';
export const RUBRIC_VERSION = '0.9.1';

/**
 * Every schema the deadline contract freeze ships, at its current contract version.
 * Order is the read order in the docs. A version is bumped when the contract itself
 * changes shape, so a consumer can tell a re-pin from a redefinition. A major bump
 * marks a contract that removed or replaced a field a consumer could already be
 * reading: the receipt and the log record dropped their free-text fields, and the
 * ledger, handoff, and readiness contracts replaced prose lists with code vocabularies.
 */
export const SCHEMA_VERSIONS = {
  'shared-vocabulary.schema.json': '5.0.0',
  'deadline-profile.schema.json': '7.0.0',
  'release-policy.schema.json': '3.0.0',
  'lifecycle-nonclaims.schema.json': '2.0.0',
  'owner-route-policy-receipt.schema.json': '4.0.0',
  'owner-source-use-receipt.schema.json': '2.0.0',
  'assignment-manifest.schema.json': '3.0.0',
  'task-source-packet.schema.json': '5.0.0',
  'lesson-handoff.schema.json': '4.0.0',
  'team-handoff.schema.json': '3.0.0',
  'candidate-quality-ledger.schema.json': '4.0.0',
  'kit-manifest.schema.json': '3.0.0',
  'import-index.schema.json': '3.0.0',
  'bundle-readiness.schema.json': '4.0.0',
  'runner-log-record.schema.json': '4.0.0',
  'intake-validation.schema.json': '3.0.0',
} as const;

/** The closed WP-01 contract set has sixteen schemas; WP-02's proof schema is separate. */
export const CONTRACT_COUNT = 16 as const;

export const SCHEMA_FILES = Object.keys(SCHEMA_VERSIONS) as Array<keyof typeof SCHEMA_VERSIONS>;

/** WP-02's allocation-only proof contract, versioned separately from the frozen WP-01 set. */
export const ASSIGNMENT_SCHEMA_VERSIONS = {
  'assignment-partition-proof.schema.json': '2.0.0',
} as const;

export const ASSIGNMENT_ARTIFACTS = {
  'partition-proof.json': 'assignment-partition-proof.schema.json',
} as const;

/** Shipped profile artifacts, mapped to the schema that governs each. */
export const PROFILE_ARTIFACTS = {
  'deadline-profile.json': 'deadline-profile.schema.json',
  'release-policy.json': 'release-policy.schema.json',
  'lifecycle-nonclaims.json': 'lifecycle-nonclaims.schema.json',
  'owner-route-policy-receipt.json': 'owner-route-policy-receipt.schema.json',
  'owner-source-use-receipt.json': 'owner-source-use-receipt.schema.json',
} as const;

/** Valid control instances for the contracts that have no shipped artifact yet. */
export const FIXTURE_CONTROLS = {
  'assignment-manifest.json': 'assignment-manifest.schema.json',
  'task-source-packet.json': 'task-source-packet.schema.json',
  'lesson-handoff.json': 'lesson-handoff.schema.json',
  'team-handoff.json': 'team-handoff.schema.json',
  'candidate-quality-ledger.json': 'candidate-quality-ledger.schema.json',
  'kit-manifest.json': 'kit-manifest.schema.json',
  'import-index.json': 'import-index.schema.json',
  'bundle-readiness.json': 'bundle-readiness.schema.json',
  'runner-log-record.json': 'runner-log-record.schema.json',
  'intake-validation.json': 'intake-validation.schema.json',
  'intake-validation-team-handoff.json': 'intake-validation.schema.json',
  'intake-validation-import-index.json': 'intake-validation.schema.json',
} as const;

/**
 * The three admission controls, and what each one is a record of. One is an admission of
 * a frozen artifact; the other two are refusals of lane artifacts whose targets no runner
 * has written, which is the honest state of those two kinds in a work package that runs
 * nothing. All three are produced by the intake API, never written by hand.
 */
export const INTAKE_CONTROLS = [
  'intake-validation.json',
  'intake-validation-team-handoff.json',
  'intake-validation-import-index.json',
] as const;

export const RECEIPT_FILE = 'owner-route-policy-receipt.json';
export const LOG_SCHEMA_FILE = 'runner-log-record.schema.json';

export const CANONICAL_ROUTES = [
  'STANDARD',
  'CONCISE',
  'MISCONCEPTION',
  'PREREQUISITE_SUPPORT',
] as const;

export const HARD_GATE_IDS = [
  'R1_R15_STRUCTURAL',
  'NORMALIZATION',
  'SOURCE_RIGHTS',
  'PROTECTED_SEPARATION',
  'HASH_CHAIN_INTEGRITY',
  'DEADLINE_MACHINE_SCREEN',
] as const;

export const EVIDENCE_CLASS_IDS = [
  'BROWSER_RENDERED',
  'ACCESSIBILITY',
  'DOMAIN_SME',
  'NOVICE_WALKTHROUGH',
  'PLATFORM_RELIABILITY',
  'HUMAN_DECISION',
] as const;

export const NONCLAIM_FLAGS = [
  'official_rubric_pass',
  'human_approved',
  'release_approved',
  'efficacy_established',
  'mastery_calibrated',
  'readiness_validated',
  'learner_validated',
  'publication_safe',
  'production_published',
] as const;

/**
 * Protected vocabulary that may never name a field in a factory contract: these
 * artifacts are learner-safe or public handoff surfaces, and protected material is
 * referenced by hash from server-only storage, never carried.
 */
export const PROTECTED_FIELD_TOKENS = [
  'answer_key',
  'answer_keys',
  'correct_answer',
  'correct_choice_id',
  'proposed_key',
  'accepted_responses',
  'response_authority',
  'scoring_rules',
  'option_rationales',
  'protected_rationale',
  'rationale_correct',
  'rationale_incorrect',
  'credentials',
  'learner_pii',
] as const;

/**
 * Field names a runner log may never declare. Protected answers, scoring authority,
 * accepted responses, and rationales are the material rubric §7.3 keeps server-only;
 * the free-text and payload names are the escape hatches through which anything at
 * all reaches a log line once one of them exists.
 */
export const LOG_FORBIDDEN_TOKENS = [
  ...PROTECTED_FIELD_TOKENS,
  'message',
  'msg',
  'text',
  'detail',
  'details',
  'note',
  'notes',
  'comment',
  'reason',
  'payload',
  'body',
  'data',
  'context',
  'extra',
  'metadata',
  'raw',
  'dump',
  'stack',
  'secret',
  'secrets',
  'token',
  'api_key',
  'authorization',
  'learner_response',
  'response_text',
  'prompt',
  'completion',
] as const;

export const SCREENED_STATUS = 'CANDIDATE_RUBRIC_SCREENED';
export const DECISION_ROLE = 'PRODUCT_PEDAGOGY_OWNER';
export const ROUTE_SCOPE_CODE = 'STANDARD_ONLY';

/**
 * Strings that must not be accepted anywhere a learner-safe, diagnostic, public, or log
 * surface admits text. Each is a plausible sentence rather than a keyword, because the
 * defence being tested is "this field admits no prose", not "this field blocks the word
 * PASS". A field that rejects all of these because it only accepts an enum or a pattern
 * is safe against the ones nobody thought to list.
 */
export const INJECTION_PAYLOADS = [
  'the correct answer is C',
  'correct_choice_id: B',
  'accepted responses: 4.2 mol, 4.2 moles',
  'scoring: award 2 points for the second step',
  'rationale: C is right because the enthalpy term dominates',
  // Not the bare word PASS: it is a legitimate member of the three-value gate-status
  // vocabulary, so a field accepting it there proves nothing about prose. The claim it
  // would carry is tested on the fields that must not carry it by explicit rows.
  'rubric PASS on all dimensions',
  'approved by the product pedagogy owner',
  'release approved for production',
  'human_approved: true',
  'sk_live_AbC123DeF456xyz',
  'Bearer eyJhbGciOiJIUzI1NiJ9',
  // Slug-shaped variants. A field that rejects sentences but admits lower-case
  // hyphenated words is still a prose channel; it just costs the writer the spaces.
  // These are the payloads a general slug identifier or a general locator accepted.
  'answer-key-is-c',
  'correct-choice-b',
  'accepted-responses-4-2-mol',
  'scoring-award-2-points',
  'rationale-enthalpy-term-dominates',
  'official-rubric-pass',
  'rubric-pass-all-dimensions',
  'approved-by-product-pedagogy-owner',
  'release-approved-for-production',
  'human-approved-true',
  'publication-safe-yes',
  // Payloads that keep the shape of the field they are attacking. A path field that
  // checks for a `.md` suffix, a command field that checks for a `pnpm` prefix, and a
  // locator that checks its own prefix all accept these: the affix is the part the
  // check looks at, and the claim rides in the middle where nothing is looking.
  'key-docs/answer-key-is-c.md',
  'docs/design/official-rubric-pass.md',
  'answer-key-is-c.md',
  'release-approved-for-production.json',
  'pnpm answer-key-is-c',
  'pnpm run official-rubric-pass',
  'pnpm exec release-approved-for-production',
] as const;

/**
 * Where injection is attempted.
 *
 * Every document is now attacked whole, from the root: naming a few learner-safe
 * subtrees left every id and locator outside them untested, and those were the fields
 * that turned out to accept slug-shaped prose. `declaredProse` is the only exemption,
 * and it lists the pointers where a human is genuinely writing to another human. That
 * list is itself audited — a pointer may only appear there if the contract really does
 * type the field as unconstrained text — so it cannot be used to quietly exempt a field
 * that was supposed to be closed.
 */
export const INJECTION_SURFACES: ReadonlyArray<{
  document: string;
  schemaFile: string;
  source: 'fixture' | 'artifact';
  roots: readonly string[];
  declaredProse?: readonly RegExp[];
}> = [
  {
    document: 'lesson-handoff.json',
    schemaFile: 'lesson-handoff.schema.json',
    source: 'fixture',
    roots: [''],
  },
  {
    document: 'team-handoff.json',
    schemaFile: 'team-handoff.schema.json',
    source: 'fixture',
    roots: [''],
  },
  {
    document: 'candidate-quality-ledger.json',
    schemaFile: 'candidate-quality-ledger.schema.json',
    source: 'fixture',
    roots: [''],
  },
  {
    document: 'runner-log-record.json',
    schemaFile: 'runner-log-record.schema.json',
    source: 'fixture',
    roots: [''],
  },
  {
    document: 'import-index.json',
    schemaFile: 'import-index.schema.json',
    source: 'fixture',
    roots: [''],
  },
  {
    document: 'kit-manifest.json',
    schemaFile: 'kit-manifest.schema.json',
    source: 'fixture',
    roots: [''],
  },
  {
    document: 'bundle-readiness.json',
    schemaFile: 'bundle-readiness.schema.json',
    source: 'fixture',
    roots: [''],
  },
  {
    document: 'assignment-manifest.json',
    schemaFile: 'assignment-manifest.schema.json',
    source: 'fixture',
    roots: [''],
  },
  {
    document: 'task-source-packet.json',
    schemaFile: 'task-source-packet.schema.json',
    source: 'fixture',
    roots: [''],
    declaredProse: [
      /^\/requested_name$/,
      /^\/identity\/canonical_title$/,
      /^\/ordered_kc_records\/\d+\/(?:label|competency|reasoning_operation)$/,
      /^\/ordered_kc_records\/\d+\/(?:scope_in|scope_out|representations)\/\d+$/,
      /^\/ordered_kc_records\/\d+\/source_occurrences\/\d+\/(?:official_topic|derived_summary)$/,
      /^\/ordered_kc_records\/\d+\/source_occurrences\/\d+\/official_path\/\d+$/,
      /^\/holds\/\d+\/(?:issue|safe_interim_behavior|nonclaim)$/,
      /^\/block_reasons\/\d+\/message$/,
      /^\/research_evidence\/nonclaim$/,
      /^\/dok_authoring\/requirement$/,
    ],
  },
  {
    document: 'owner-source-use-receipt.json',
    schemaFile: 'owner-source-use-receipt.schema.json',
    source: 'artifact',
    roots: [''],
  },
  ...INTAKE_CONTROLS.map((document) => ({
    document,
    schemaFile: 'intake-validation.schema.json',
    source: 'fixture' as const,
    roots: [''],
  })),
  {
    document: 'owner-route-policy-receipt.json',
    schemaFile: 'owner-route-policy-receipt.schema.json',
    source: 'artifact',
    roots: [''],
  },
  {
    document: 'release-policy.json',
    schemaFile: 'release-policy.schema.json',
    source: 'artifact',
    roots: [''],
  },
  {
    document: 'lifecycle-nonclaims.json',
    schemaFile: 'lifecycle-nonclaims.schema.json',
    source: 'artifact',
    roots: [''],
    declaredProse: [
      /^\/states\/[A-Z_]+\/requires$/,
      /^\/transitions\/\d+\/requires$/,
      /^\/nonclaim_statements\/\d+$/,
      /^\/never_asserts\/\d+$/,
      /^\/separation\/separation_rule$/,
    ],
  },
  {
    document: 'deadline-profile.json',
    schemaFile: 'deadline-profile.schema.json',
    source: 'artifact',
    roots: [''],
    declaredProse: [
      /^\/hard_gates\/[A-Z_0-9]+\/description$/,
      /^\/evidence_classes\/[A-Z_]+\/description$/,
      /^\/protected_boundary\/(?:learner_safe_surfaces|protected_surfaces)\/\d+$/,
    ],
  },
];

export { PLACEHOLDER_DIGESTS as PLACEHOLDER_SHA256 } from './reference-model.js';

export function schemaId(fileName: string): string {
  return `${CONTRACT_BASE}${fileName}`;
}

export function readJson(path: string): JsonObject {
  if (!existsSync(path)) {
    throw new Error(`missing lesson-factory contract file: ${path}`);
  }
  const raw = readFileSync(path, 'utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`unparseable lesson-factory contract file ${path}: ${String(error)}`);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`lesson-factory contract file ${path} must contain a JSON object`);
  }
  return parsed as JsonObject;
}

export function loadSchema(fileName: string): JsonObject {
  return readJson(join(SCHEMA_DIR, fileName));
}

export function loadArtifact(fileName: string): JsonObject {
  return readJson(join(PROFILE_DIR, fileName));
}

export function loadAssignmentArtifact(fileName: string): JsonObject {
  return readJson(join(ASSIGNMENTS_DIR, fileName));
}

/**
 * The key that makes a fixture file unmistakably test-only. Every control lives inside
 * an envelope carrying this marker, so the raw file can never be mistaken for — or
 * validated as — a production instance: every contract is closed, so the marker alone
 * fails production validation.
 */
export const TEST_FIXTURE_MARKER = '$test_fixture';

/** The raw fixture file, envelope and all. Use this to prove the envelope is rejected. */
export function loadFixtureEnvelope(fileName: string): JsonObject {
  const envelope = readJson(join(FIXTURE_DIR, fileName));
  if (!(TEST_FIXTURE_MARKER in envelope)) {
    throw new Error(
      `fixture ${fileName} has no ${TEST_FIXTURE_MARKER} marker; a control that is indistinguishable from a production instance is a liability, not a control`,
    );
  }
  return envelope;
}

/** The instance inside a test-only fixture envelope. */
export function loadFixture(fileName: string): JsonObject {
  const envelope = loadFixtureEnvelope(fileName);
  const instance = envelope.instance;
  if (instance === null || typeof instance !== 'object' || Array.isArray(instance)) {
    throw new Error(`fixture ${fileName} must carry its control document under "instance"`);
  }
  return instance;
}

export function loadRegistry(): SchemaRegistry {
  const registry = new SchemaRegistry();
  for (const fileName of SCHEMA_FILES) {
    registry.add(loadSchema(fileName));
  }
  return registry;
}

export function sha256OfFile(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

export function sha256OfSchema(fileName: string): string {
  return sha256OfFile(join(SCHEMA_DIR, fileName));
}

/**
 * Resolve one `$ref` written inside `fromFile` to the schema node it names, so a
 * test can inspect what a contract actually admits rather than the alias it uses.
 */
export function resolveContractRef(ref: string, fromFile: string): JsonValue {
  const [uri = '', pointer = ''] = ref.split('#');
  const targetFile = uri === '' ? fromFile : uri;
  let node: JsonValue = loadSchema(targetFile);
  for (const segment of pointer.split('/').filter((part) => part.length > 0)) {
    if (node === null || typeof node !== 'object' || Array.isArray(node) || !(segment in node)) {
      throw new Error(`unresolvable $ref "${ref}" from ${fromFile}`);
    }
    node = node[segment] as JsonValue;
  }
  return node;
}
