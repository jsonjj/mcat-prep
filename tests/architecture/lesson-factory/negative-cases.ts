import { join } from 'node:path';
import { withMutation, type JsonObject, type JsonValue } from './json-schema-subset';
import {
  INJECTION_PAYLOADS,
  INJECTION_SURFACES,
  loadArtifact,
  loadFixture,
  PLACEHOLDER_SHA256,
  PROFILE_DIR,
  SCHEMA_VERSIONS,
  sha256OfFile,
} from './contract-registry';

/**
 * The single negative-case table for WP-01.
 *
 * Both validators consume this: `lesson-factory-fail-closed.test.ts` runs it through
 * the subset checker and asserts the error names the field that caused it, and
 * `lesson-factory-ajv-conformance.test.ts` runs the same rows through Ajv 2020 and
 * asserts parity on every one. Keeping one table is the point — a sampled cross-check
 * only proves the two validators agree about the sample.
 *
 * Each row is exactly one mutation of a control document that validates clean, so a
 * rejection can only be caused by that mutation.
 */

export interface NegativeCase {
  /** The fail-closed property this row defends. */
  group: string;
  /** Human-readable name, unique within the table. */
  name: string;
  schemaFile: string;
  source: 'artifact' | 'fixture';
  document: string;
  /** Mutations are applied in order; the last one is the one under test. */
  mutations: ReadonlyArray<{ pointer: string; value: JsonValue | undefined }>;
  /** Must match the subset checker's rendered errors. */
  expect: RegExp;
}

const LEDGER = 'candidate-quality-ledger.schema.json';
const POLICY = 'release-policy.schema.json';
const HANDOFF = 'lesson-handoff.schema.json';
const TEAM = 'team-handoff.schema.json';
const KIT = 'kit-manifest.schema.json';
const IMPORT = 'import-index.schema.json';
const READINESS = 'bundle-readiness.schema.json';
const ASSIGNMENT = 'assignment-manifest.schema.json';
const PACKET = 'task-source-packet.schema.json';
const RECEIPT = 'owner-route-policy-receipt.schema.json';
const SOURCE_USE_RECEIPT = 'owner-source-use-receipt.schema.json';
const LOG = 'runner-log-record.schema.json';
const PROFILE = 'deadline-profile.schema.json';

const LEDGER_DOC = 'candidate-quality-ledger.json';
const POLICY_DOC = 'release-policy.json';
const HANDOFF_DOC = 'lesson-handoff.json';
const RECEIPT_DOC = 'owner-route-policy-receipt.json';
const LOG_DOC = 'runner-log-record.json';

export function loadControl(source: 'artifact' | 'fixture', document: string): JsonObject {
  return source === 'artifact' ? loadArtifact(document) : loadFixture(document);
}

/** The control with every mutation of a case applied, ready to be validated. */
export function mutatedDocument(testCase: NegativeCase): JsonObject {
  return testCase.mutations.reduce<JsonObject>(
    (document, mutation) => withMutation(document, mutation.pointer, mutation.value),
    loadControl(testCase.source, testCase.document),
  );
}

const escapeForRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

interface RowSpec {
  group: string;
  schemaFile: string;
  source: 'artifact' | 'fixture';
  document: string;
}

/** One row: one pointer, one value, one expectation. */
const row = (
  spec: RowSpec,
  pointer: string,
  value: JsonValue | undefined,
  expected: RegExp,
  name?: string,
): NegativeCase => ({
  group: spec.group,
  name: name ?? `${spec.document} ${pointer} = ${JSON.stringify(value)}`,
  schemaFile: spec.schemaFile,
  source: spec.source,
  document: spec.document,
  mutations: [{ pointer, value }],
  expect: expected,
});

/** Several pointers set together, where one alone would not reach the rule under test. */
const compound = (
  spec: RowSpec,
  name: string,
  mutations: ReadonlyArray<{ pointer: string; value: JsonValue | undefined }>,
  expected: RegExp,
): NegativeCase => ({ ...spec, name, mutations, expect: expected });

const ledger: RowSpec = {
  group: 'CANDIDATE_RUBRIC_SCREENED is a lifecycle status, never a claim',
  schemaFile: LEDGER,
  source: 'fixture',
  document: LEDGER_DOC,
};
const gates: RowSpec = { ...ledger, group: 'the hard gates are hard' };
const evidence: RowSpec = {
  ...ledger,
  group: 'missing evidence stays BLOCKED and cannot be normalised',
};
const routes: RowSpec = {
  group: 'the route proof has exactly four members with real proofs',
  schemaFile: POLICY,
  source: 'artifact',
  document: POLICY_DOC,
};
const scope: RowSpec = { ...routes, group: 'the route scope is internally consistent' };
const identity: RowSpec = {
  group: 'identity is pinned by hash and never reconstructed',
  schemaFile: HANDOFF,
  source: 'fixture',
  document: HANDOFF_DOC,
};
const separation: RowSpec = {
  group: 'source rights, and learner-safe versus protected separation',
  schemaFile: HANDOFF,
  source: 'fixture',
  document: HANDOFF_DOC,
};
const receipt: RowSpec = {
  group: 'the owner receipt ratifies a route scope and nothing else',
  schemaFile: RECEIPT,
  source: 'artifact',
  document: RECEIPT_DOC,
};
const logs: RowSpec = {
  group: 'runner logs carry codes, hashes, and counts, never content',
  schemaFile: LOG,
  source: 'fixture',
  document: LOG_DOC,
};
const intake: RowSpec = {
  group: 'production intake refuses fixture envelopes and placeholder digests',
  schemaFile: IMPORT,
  source: 'fixture',
  document: 'import-index.json',
};
const intakeRecord: RowSpec = {
  group: 'schema validation alone is not admission',
  schemaFile: 'intake-validation.schema.json',
  source: 'fixture',
  document: 'intake-validation.json',
};

const NONCLAIM_FLAGS = [
  'official_rubric_pass',
  'human_approved',
  'release_approved',
  'efficacy_established',
  'mastery_calibrated',
  'readiness_validated',
  'learner_validated',
  'publication_safe',
  'production_published',
];

const HARD_GATES = [
  'R1_R15_STRUCTURAL',
  'NORMALIZATION',
  'SOURCE_RIGHTS',
  'PROTECTED_SEPARATION',
  'HASH_CHAIN_INTEGRITY',
  'DEADLINE_MACHINE_SCREEN',
];

const ABSENT_ROUTES = ['CONCISE', 'MISCONCEPTION', 'PREREQUISITE_SUPPORT'];

/**
 * The three probes the re-review used, generalised.
 *
 * The first two are the same defect wearing two costumes: a field that looks structural
 * but accepts anything lower-case and hyphenated. The reviewer wrote them by hand for a
 * couple of fields; here they run against every public identifier and every reference
 * family, because the fields nobody probed are the ones that were still open.
 */
const SLUG_PAYLOADS = [
  'answer-key-is-c',
  'official-rubric-pass',
  'release-approved-for-production',
  'approved-by-owner',
  'correct-choice-b',
  'human-approved-true',
];

const PUBLIC_IDENTIFIER_FIELDS: ReadonlyArray<{ spec: RowSpec; pointer: string }> = [
  {
    spec: { group: '', schemaFile: KIT, source: 'fixture', document: 'kit-manifest.json' },
    pointer: '/kit_id',
  },
  {
    spec: { group: '', schemaFile: KIT, source: 'fixture', document: 'kit-manifest.json' },
    pointer: '/bundles/0/bundle_id',
  },
  {
    spec: { group: '', schemaFile: IMPORT, source: 'fixture', document: 'import-index.json' },
    pointer: '/index_id',
  },
  {
    spec: {
      group: '',
      schemaFile: READINESS,
      source: 'fixture',
      document: 'bundle-readiness.json',
    },
    pointer: '/readiness_id',
  },
  {
    spec: { group: '', schemaFile: HANDOFF, source: 'fixture', document: HANDOFF_DOC },
    pointer: '/handoff_id',
  },
  {
    spec: { group: '', schemaFile: TEAM, source: 'fixture', document: 'team-handoff.json' },
    pointer: '/team_handoff_id',
  },
  {
    spec: { group: '', schemaFile: LEDGER, source: 'fixture', document: LEDGER_DOC },
    pointer: '/ledger_id',
  },
  {
    spec: {
      group: '',
      schemaFile: ASSIGNMENT,
      source: 'fixture',
      document: 'assignment-manifest.json',
    },
    pointer: '/assignment_id',
  },
  {
    spec: { group: '', schemaFile: PACKET, source: 'fixture', document: 'task-source-packet.json' },
    pointer: '/request_id',
  },
  {
    spec: { group: '', schemaFile: PACKET, source: 'fixture', document: 'task-source-packet.json' },
    pointer: '/ordered_kc_records/0/source_occurrences/0/source_occurrence_id',
  },
  {
    spec: { group: '', schemaFile: PROFILE, source: 'artifact', document: 'deadline-profile.json' },
    pointer: '/profile_id',
  },
  {
    spec: { group: '', schemaFile: POLICY, source: 'artifact', document: POLICY_DOC },
    pointer: '/policy_id',
  },
  {
    spec: { group: '', schemaFile: RECEIPT, source: 'artifact', document: RECEIPT_DOC },
    pointer: '/receipt_id',
  },
];

/**
 * Every control and the contract that governs it, for the families that apply to all of
 * them: the declared contract version, and the frozen policy reference.
 */
const ALL_CONTROLS: ReadonlyArray<RowSpec> = [
  { group: '', schemaFile: LEDGER, source: 'fixture', document: LEDGER_DOC },
  { group: '', schemaFile: HANDOFF, source: 'fixture', document: HANDOFF_DOC },
  { group: '', schemaFile: TEAM, source: 'fixture', document: 'team-handoff.json' },
  { group: '', schemaFile: KIT, source: 'fixture', document: 'kit-manifest.json' },
  { group: '', schemaFile: IMPORT, source: 'fixture', document: 'import-index.json' },
  { group: '', schemaFile: READINESS, source: 'fixture', document: 'bundle-readiness.json' },
  { group: '', schemaFile: ASSIGNMENT, source: 'fixture', document: 'assignment-manifest.json' },
  { group: '', schemaFile: PACKET, source: 'fixture', document: 'task-source-packet.json' },
  { group: '', schemaFile: LOG, source: 'fixture', document: LOG_DOC },
  { group: '', schemaFile: PROFILE, source: 'artifact', document: 'deadline-profile.json' },
  { group: '', schemaFile: POLICY, source: 'artifact', document: POLICY_DOC },
  { group: '', schemaFile: RECEIPT, source: 'artifact', document: RECEIPT_DOC },
  {
    group: '',
    schemaFile: 'lifecycle-nonclaims.schema.json',
    source: 'artifact',
    document: 'lifecycle-nonclaims.json',
  },
];

/**
 * A version an instance might claim: the release before this one, a patch and a minor
 * that were never cut, the next major, and a version from a numbering nobody uses. Each
 * is well formed, which is the point — the defence cannot be "that is not a version".
 */
function wrongVersions(current: string): string[] {
  const [major = '1', minor = '0', patch = '0'] = current.split('.');
  const previousMajor = Math.max(1, Number(major) - 1);
  return [
    `${previousMajor}.0.0`,
    `${major}.${Number(minor) + 1}.0`,
    `${major}.${minor}.${Number(patch) + 1}`,
    `${Number(major) + 1}.0.0`,
    '0.0.1',
  ];
}

/** The documents that name the frozen release policy. */
const POLICY_REF_HOLDERS: ReadonlyArray<RowSpec> = [
  { group: '', schemaFile: PROFILE, source: 'artifact', document: 'deadline-profile.json' },
  { group: '', schemaFile: ASSIGNMENT, source: 'fixture', document: 'assignment-manifest.json' },
  { group: '', schemaFile: KIT, source: 'fixture', document: 'kit-manifest.json' },
  { group: '', schemaFile: PACKET, source: 'fixture', document: 'task-source-packet.json' },
  { group: '', schemaFile: HANDOFF, source: 'fixture', document: HANDOFF_DOC },
];

/**
 * A real digest of a real frozen artifact — the lifecycle register — used as the digest
 * of the policy. Nothing about it is malformed; it is simply the wrong file's bytes, and
 * that is the case a hash-shaped check accepts.
 */
const OTHER_REAL_DIGEST = sha256OfFile(join(PROFILE_DIR, 'lifecycle-nonclaims.json'));
const CURRENT_POLICY_DIGEST = sha256OfFile(join(PROFILE_DIR, 'release-policy.json'));

/**
 * One genuine reference row out of the intake control, for the rows that duplicate it.
 * Taken from the control rather than written here, so the duplicate is byte-identical to
 * something the API really produced — a duplicate that differs in some detail would be
 * rejected for the detail rather than for being a duplicate.
 */
const INTAKE_REFERENCE_ROW = (
  (loadFixture('intake-validation.json').resolver_validation as JsonObject)
    .references as JsonValue[]
)[0] as JsonValue;

/**
 * The two lane artifacts intake now admits, probed the same way the profile is.
 *
 * A team handoff and an import index are the documents a lane and a packager actually
 * hand on, and until this round neither had a canonical reference kind — so neither could
 * be admitted, and neither had a single negative row about its admission. These rows are
 * generated from each control rather than written out twice, because the whole point is
 * that nothing about these two kinds is special.
 *
 * Both controls are refusals: no runner has written the artifacts they name, so the
 * resolver half fails honestly. That makes them the right controls for the probes a
 * refusal has to survive — a forged upgrade to ADMITTED, a missing reason, a rewritten
 * identity — while the admitted-path probes stay on the profile control.
 */
const LANE_INTAKE_CONTROLS = [
  'intake-validation-team-handoff.json',
  'intake-validation-import-index.json',
] as const;

function laneIntakeRows(document: string): NegativeCase[] {
  const control = loadFixture(document);
  const identified = control.document as JsonObject;
  const resolver = control.resolver_validation as JsonObject;
  const firstRow = (resolver.references as JsonValue[])[0] as JsonValue;

  const kind = String(identified.kind);
  const other =
    kind === 'team-handoff'
      ? {
          kind: 'import-index',
          contract: 'lesson-factory.import-index',
          schema: 'import-index.schema.json',
        }
      : {
          kind: 'team-handoff',
          contract: 'lesson-factory.team-handoff',
          schema: 'team-handoff.schema.json',
        };
  const ref = String(identified.ref);
  const locator = ref.slice(kind.length + 1).split('#')[0] ?? '';
  const digest = ref.split('#sha256:')[1] ?? '';

  const base = {
    schemaFile: 'intake-validation.schema.json',
    source: 'fixture' as const,
    document,
  };
  const identity: RowSpec = {
    ...base,
    group: 'an admission is bound to one document, not to a kind of one',
  };
  const references: RowSpec = {
    ...base,
    group: 'an admission reports the references the document has',
  };
  const proof: RowSpec = {
    ...base,
    group: 'an admission carries a proof nobody can write by hand',
  };
  const anyIdentity = /oneOf|kind|contract_id|contract_version|schema_file|schema_locator|ref/;

  return [
    row(
      identity,
      '/document/kind',
      other.kind,
      anyIdentity,
      `${document} files a ${kind} as ${other.kind}`,
    ),
    row(
      identity,
      '/document/contract_id',
      other.contract,
      anyIdentity,
      `${document} keeps its kind and claims the ${other.kind} contract`,
    ),
    row(
      identity,
      '/document/contract_version',
      '0.9.0',
      anyIdentity,
      `${document} claims a superseded contract version`,
    ),
    row(
      identity,
      '/document/contract_version',
      '99.0.0',
      anyIdentity,
      `${document} claims a contract version nobody has written`,
    ),
    row(
      identity,
      '/document/schema_file',
      other.schema,
      anyIdentity,
      `${document} says it was validated against the ${other.kind} contract`,
    ),
    row(
      identity,
      '/document/schema_locator',
      `content/lesson-factory/schemas/${other.schema}`,
      anyIdentity,
      `${document} points the schema locator at a contract it did not apply`,
    ),
    row(
      identity,
      '/document/ref',
      `${kind}:${locator}#sha256:${'ab'.repeat(32)}`,
      anyIdentity,
      `${document} names its document at a placeholder digest`,
    ),
    row(
      identity,
      '/document/ref',
      `${other.kind}:${locator}#sha256:${digest}`,
      anyIdentity,
      `${document} names its document under the other kind`,
    ),
    row(
      identity,
      '/document/sha256',
      PLACEHOLDER_SHA256[0],
      /sha256/,
      `${document} carries a placeholder content digest`,
    ),
    row(
      identity,
      '/document/schema_sha256',
      PLACEHOLDER_SHA256[1],
      /schema_sha256/,
      `${document} carries a placeholder contract digest`,
    ),
    row(identity, '/document', undefined, /document/, `${document} names no document at all`),
    row(
      references,
      '/resolver_validation/checked_count',
      0,
      /checked_count/,
      `${document} lists references and reports checking none`,
    ),
    compound(
      references,
      `${document} reports a count of references it does not list`,
      [{ pointer: '/resolver_validation/references', value: [] }],
      /references/,
    ),
    compound(
      references,
      `${document} lists the same reference row twice`,
      [{ pointer: '/resolver_validation/references', value: [firstRow, firstRow] }],
      /references|duplicate/,
    ),
    row(
      references,
      '/admission',
      'ADMITTED',
      /admission|status/,
      `${document} admits a document whose artifacts nobody has written`,
    ),
    row(
      references,
      '/refusal_code',
      undefined,
      /refusal_code/,
      `${document} refuses without saying why`,
    ),
    row(
      proof,
      '/admission_proof',
      undefined,
      /admission_proof/,
      `${document} carries no derivation proof`,
    ),
    row(
      proof,
      '/admission_proof/derivation_sha256',
      PLACEHOLDER_SHA256[2],
      /derivation_sha256/,
      `${document} proves itself with a placeholder digest`,
    ),
    row(
      proof,
      '/admission_proof/derivation',
      'INTAKE_DERIVATION_V1',
      /derivation/,
      `${document} proves itself under a derivation this contract does not define`,
    ),
  ];
}

/** Where a hard-gate or structural record lives in each control that carries one. */
const COMMAND_BEARING_DOCUMENTS: ReadonlyArray<{ spec: RowSpec; pointer: string }> = [
  {
    spec: { group: '', schemaFile: LEDGER, source: 'fixture', document: LEDGER_DOC },
    pointer: '/hard_gate_results/R1_R15_STRUCTURAL',
  },
  {
    spec: { group: '', schemaFile: LEDGER, source: 'fixture', document: LEDGER_DOC },
    pointer: '/hard_gate_results/SOURCE_RIGHTS',
  },
  {
    spec: {
      group: '',
      schemaFile: READINESS,
      source: 'fixture',
      document: 'bundle-readiness.json',
    },
    pointer: '/hard_gate_results/NORMALIZATION',
  },
  {
    spec: { group: '', schemaFile: HANDOFF, source: 'fixture', document: HANDOFF_DOC },
    pointer: '/structural_validation',
  },
];

/** Every field that embeds a digest, with the shape a valid value would take. */
const REFERENCE_FIELDS: ReadonlyArray<{
  spec: RowSpec;
  pointer: string;
  template: (digest: string) => string;
}> = [
  {
    spec: { group: '', schemaFile: HANDOFF, source: 'fixture', document: HANDOFF_DOC },
    pointer: '/task_packet_ref',
    template: (digest) => `packet:lane-01/v3-les-000101#sha256:${digest}`,
  },
  {
    spec: { group: '', schemaFile: HANDOFF, source: 'fixture', document: HANDOFF_DOC },
    pointer: '/candidate_quality_ledger_ref',
    template: (digest) => `ledger:lane-01/v3-les-000101/standard#sha256:${digest}`,
  },
  {
    spec: { group: '', schemaFile: HANDOFF, source: 'fixture', document: HANDOFF_DOC },
    pointer: '/learner_safe_summary/lesson_title_ref',
    template: (digest) => `title:v3-les-000101@rev-000002#sha256:${digest}`,
  },
  {
    spec: { group: '', schemaFile: HANDOFF, source: 'fixture', document: HANDOFF_DOC },
    pointer: '/release_policy_ref',
    template: (digest) =>
      `policy:content/lesson-factory/deadline-profile/release-policy.json#sha256:${digest}`,
  },
  {
    spec: { group: '', schemaFile: KIT, source: 'fixture', document: 'kit-manifest.json' },
    pointer: '/bundles/0/readiness_ref',
    template: (digest) => `readiness:kit-01/v3-les-000101#sha256:${digest}`,
  },
  {
    spec: { group: '', schemaFile: KIT, source: 'fixture', document: 'kit-manifest.json' },
    pointer: '/assignment_ref',
    template: (digest) =>
      `assignment:lesson-factory-deadline-2026-08-03/assignment-01#sha256:${digest}`,
  },
  {
    spec: { group: '', schemaFile: IMPORT, source: 'fixture', document: 'import-index.json' },
    pointer: '/kit_ref',
    template: (digest) => `kit:lesson-factory-deadline-2026-08-03/kit-01#sha256:${digest}`,
  },
  {
    spec: { group: '', schemaFile: IMPORT, source: 'fixture', document: 'import-index.json' },
    pointer: '/entries/0/bundle_ref',
    template: (digest) => `bundle:kit-01/v3-les-000101#sha256:${digest}`,
  },
  {
    spec: { group: '', schemaFile: LOG, source: 'fixture', document: LOG_DOC },
    pointer: '/lesson_ref',
    template: (digest) => `lesson:v3-les-000101@rev-000002#sha256:${digest}`,
  },
  {
    spec: { group: '', schemaFile: LEDGER, source: 'fixture', document: LEDGER_DOC },
    pointer: '/hard_gate_results/NORMALIZATION/screen_ref',
    template: (digest) => `screen:lane-01/v3-les-000101/normalization#sha256:${digest}`,
  },
  {
    spec: { group: '', schemaFile: PACKET, source: 'fixture', document: 'task-source-packet.json' },
    pointer: '/ordered_kc_records/0/source_occurrences/0/permission_receipt_refs/0',
    template: (digest) => `permission-receipt:src-0001/2026-08-03#sha256:${digest}`,
  },
  {
    spec: { group: '', schemaFile: PACKET, source: 'fixture', document: 'task-source-packet.json' },
    pointer: '/ordered_kc_records/0/source_occurrences/0/source_use_receipt_ref',
    template: (digest) =>
      `source-use-receipt:content/lesson-factory/deadline-profile/owner-source-use-receipt.json#sha256:${digest}`,
  },
  {
    spec: {
      group: '',
      schemaFile: SOURCE_USE_RECEIPT,
      source: 'artifact',
      document: 'owner-source-use-receipt.json',
    },
    pointer: '/statement_ref',
    template: (digest) =>
      `source-use-statement:content/lesson-factory/deadline-profile/owner-source-use-statement.md#sha256:${digest}`,
  },
  {
    spec: { group: '', schemaFile: PACKET, source: 'fixture', document: 'task-source-packet.json' },
    pointer: '/deadline_profile_ref',
    template: (digest) =>
      `profile:content/lesson-factory/deadline-profile/deadline-profile.json#sha256:${digest}`,
  },
  {
    spec: { group: '', schemaFile: POLICY, source: 'artifact', document: POLICY_DOC },
    pointer: '/policy_authority/decision_ref',
    template: (digest) =>
      `receipt:content/lesson-factory/deadline-profile/owner-route-policy-receipt.json#sha256:${digest}`,
  },
  {
    spec: { group: '', schemaFile: PROFILE, source: 'artifact', document: 'deadline-profile.json' },
    pointer: '/lifecycle_nonclaims_ref',
    template: (digest) =>
      `lifecycle:content/lesson-factory/deadline-profile/lifecycle-nonclaims.json#sha256:${digest}`,
  },
  {
    spec: { group: '', schemaFile: RECEIPT, source: 'artifact', document: RECEIPT_DOC },
    pointer: '/decision_provenance/statement_sha256',
    template: (digest) => digest,
  },
];

/** The documents that must work under the frozen release policy rather than beside it. */
const POLICY_BOUND_DOCUMENTS: readonly RowSpec[] = [
  { group: '', schemaFile: PACKET, source: 'fixture', document: 'task-source-packet.json' },
  { group: '', schemaFile: HANDOFF, source: 'fixture', document: HANDOFF_DOC },
];

const EXPLICIT_CASES: NegativeCase[] = [
  // ── the screened status claims nothing ────────────────────────────────────────
  ...NONCLAIM_FLAGS.map((flag) =>
    row(ledger, `/nonclaims/${flag}`, true, new RegExp(`nonclaims/${flag}`)),
  ),
  row(ledger, '/final_gate_status', 'PASS', /final_gate_status/),
  row(ledger, '/release_eligibility', 'PRODUCTION_RELEASE', /release_eligibility/),
  row(ledger, '/official_quality_result/evaluation_available', true, /evaluation_available/),
  row(ledger, '/official_quality_result/approval_withheld', false, /approval_withheld/),
  row(ledger, '/official_quality_result/human_gate_status', 'SATISFIED', /human_gate_status/),
  row(ledger, '/official_quality_result/approval_blocker_codes', [], /approval_blocker_codes/),
  ...['route_verdict', 'lesson_verdict', 'human_verdict', 'gold_verdict'].map((field) =>
    row(ledger, `/${field}`, 'PASS', new RegExp(`"${field}" is not allowed`)),
  ),
  ...['PASS', 'RUBRIC_PASS', 'GOLD_APPROVED', 'RELEASED'].map((status) =>
    row(ledger, '/lifecycle_status', status, /lifecycle_status/),
  ),

  // ── hard gates ────────────────────────────────────────────────────────────────
  ...HARD_GATES.flatMap((gate) =>
    ['FAIL', 'BLOCKED'].map((status) =>
      row(
        gates,
        `/hard_gate_results/${gate}/status`,
        status,
        new RegExp(`hard_gate_results/${gate}/status`),
      ),
    ),
  ),
  row(
    gates,
    '/hard_gate_results/PROTECTED_SEPARATION',
    undefined,
    /required property "PROTECTED_SEPARATION" is missing/,
  ),
  row(
    gates,
    '/hard_gate_results/DEADLINE_EXEMPTION',
    { status: 'PASS' },
    /"DEADLINE_EXEMPTION" is not allowed/,
  ),
  row(gates, '/hard_gate_results/NORMALIZATION/waived', true, /"waived" is not allowed/),
  row(
    { ...gates, schemaFile: READINESS, document: 'bundle-readiness.json' },
    '/hard_gate_results/NORMALIZATION/status',
    'FAIL',
    /hard_gate_results\/NORMALIZATION\/status/,
  ),
  ...['READY_FOR_RELEASE', 'PUBLISHABLE', 'APPROVED'].map((status) =>
    row(
      { ...gates, schemaFile: READINESS, document: 'bundle-readiness.json' },
      '/readiness_status',
      status,
      /readiness_status/,
    ),
  ),

  // ── evidence ──────────────────────────────────────────────────────────────────
  ...['PASS', 'NOT_APPLICABLE', 'WAIVED', 'NORMALIZED', 'WARN'].map((state) =>
    row(
      evidence,
      '/evidence_class_results/ACCESSIBILITY/state',
      state,
      /evidence_class_results\/ACCESSIBILITY\/state/,
    ),
  ),
  row(evidence, '/evidence_class_results/BROWSER_RENDERED/blocker_code', null, /blocker_code/),
  row(
    evidence,
    '/evidence_class_results/BROWSER_RENDERED/receipt_refs',
    [`receipt:browser-capture#sha256:${'9c'.repeat(32)}`],
    /receipt_refs/,
  ),
  compound(
    evidence,
    'a PRESENT evidence class with no receipt',
    [
      { pointer: '/evidence_class_results/DOMAIN_SME/state', value: 'PRESENT' },
      { pointer: '/evidence_class_results/DOMAIN_SME/blocker_code', value: null },
    ],
    /receipt_refs/,
  ),
  compound(
    evidence,
    'a PRESENT evidence class whose receipt is the author\u2019s own',
    [
      { pointer: '/evidence_class_results/DOMAIN_SME/state', value: 'PRESENT' },
      { pointer: '/evidence_class_results/DOMAIN_SME/blocker_code', value: null },
      {
        pointer: '/evidence_class_results/DOMAIN_SME/receipt_refs',
        value: [`receipt:sme-construct-comparison#sha256:${'7d'.repeat(32)}`],
      },
    ],
    /independent_of_author/,
  ),
  row(
    evidence,
    '/evidence_class_results/NOVICE_WALKTHROUGH/normalization_to_pass_allowed',
    true,
    /normalization_to_pass_allowed/,
  ),
  row(
    evidence,
    '/evidence_class_results/NOVICE_WALKTHROUGH/normalized_to',
    'PASS',
    /"normalized_to" is not allowed/,
  ),
  row(
    evidence,
    '/evidence_class_results/HUMAN_DECISION',
    undefined,
    /required property "HUMAN_DECISION" is missing/,
  ),

  // ── the four-member route proof ───────────────────────────────────────────────
  row(
    routes,
    '/route_proofs/PREREQUISITE_SUPPORT',
    undefined,
    /required property "PREREQUISITE_SUPPORT" is missing/,
  ),
  row(
    routes,
    '/route_proofs/ADAPTIVE',
    {
      route_applicability: 'NOT_APPLICABLE',
      absence_proof_basis: 'VERSIONED_RELEASE_POLICY',
      absence_proof_ref: 'policy:x',
      blocker_code: null,
      evidence_refs: [],
    },
    /"ADAPTIVE" is not allowed/,
  ),
  row(routes, '/route_proofs/CONCISE/absence_proof_ref', null, /absence_proof_ref/),
  row(routes, '/route_proofs/CONCISE/absence_proof_basis', null, /absence_proof_basis/),
  row(routes, '/route_proofs/CONCISE/evidence_refs', [], /evidence_refs/),
  ...['REVIEWER_OPINION', 'EMPTY_COVERAGE_ROW', 'RUNTIME_FALLBACK'].map((basis) =>
    row(routes, '/route_proofs/MISCONCEPTION/absence_proof_basis', basis, /absence_proof_basis/),
  ),
  row(routes, '/route_proofs/STANDARD/absence_proof_ref', 'policy:not-needed', /absence_proof_ref/),
  row(routes, '/route_proofs/STANDARD/blocker_code', 'blocker:x', /blocker_code/),
  row(
    routes,
    '/route_proofs/PREREQUISITE_SUPPORT/route_applicability',
    'BLOCKED',
    /blocker_code|route_applicability/,
  ),

  // ── route-state equivalence: list, map, proofs, and clauses agree ─────────────
  row(
    scope,
    '/applicable_routes',
    ['STANDARD', 'CONCISE'],
    /applicable_routes/,
    'a route listed as applicable whose proof says NOT_APPLICABLE',
  ),
  row(
    scope,
    '/applicable_routes',
    [],
    /applicable_routes/,
    'an empty applicable list while STANDARD is proved APPLICABLE',
  ),
  row(
    scope,
    '/applicable_routes',
    ['CONCISE'],
    /applicable_routes/,
    'the applicable list naming a different route than the proofs do',
  ),
  row(
    scope,
    '/route_proofs/STANDARD/route_applicability',
    'NOT_APPLICABLE',
    /applicable_routes|absence_proof/,
    'STANDARD demoted while it is still the declared release scope',
  ),
  row(
    scope,
    '/route_scope_code',
    'ALL_ROUTES',
    /route_scope_code/,
    'a route scope code outside the closed vocabulary',
  ),
  compound(
    scope,
    'a scope code that contradicts the applicable list it derives',
    [{ pointer: '/applicable_routes', value: ['STANDARD', 'MISCONCEPTION'] }],
    /applicable_routes|route_proofs/,
  ),
  compound(
    scope,
    'a second route enabled consistently, but outside the ratified STANDARD_ONLY scope',
    [
      { pointer: '/applicable_routes', value: ['STANDARD', 'CONCISE'] },
      { pointer: '/route_proofs/CONCISE/route_applicability', value: 'APPLICABLE' },
      { pointer: '/route_proofs/CONCISE/absence_proof_basis', value: null },
      { pointer: '/route_proofs/CONCISE/absence_proof_ref', value: null },
    ],
    /applicable_routes|route_proofs/,
  ),
  row(
    scope,
    '/route_proofs/CONCISE/absence_proof_ref',
    'policy:some-other-policy@1.2.0#clause:ROUTE_ABSENCE_CONCISE',
    /absence_proof_ref/,
    'an absence proof citing a different policy entirely',
  ),
  ...ABSENT_ROUTES.map((route) =>
    row(
      scope,
      `/route_proofs/${route}/absence_proof_ref`,
      `policy:lesson-factory-deadline-release@1.1.0#clause:ROUTE_ABSENCE_STANDARD`,
      new RegExp(`route_proofs/${route}/absence_proof_ref`),
      `the ${route} proof citing another route\u2019s clause`,
    ),
  ),
  ...ABSENT_ROUTES.map((route) =>
    row(
      scope,
      `/route_proofs/${route}/absence_proof_ref`,
      `policy:lesson-factory-deadline-release@9.9.9#clause:ROUTE_ABSENCE_${route}`,
      new RegExp(`route_proofs/${route}/absence_proof_ref`),
      `the ${route} clause cited at a policy version that does not exist`,
    ),
  ),

  // ── the owner receipt ─────────────────────────────────────────────────────────
  ...['official_rubric_pass', 'human_approved', 'release_approved', 'publication_safe'].map(
    (flag) => row(receipt, `/nonclaims/${flag}`, true, new RegExp(`nonclaims/${flag}`)),
  ),
  ...[
    'waives_any_nonclaim',
    'waives_any_hard_gate',
    'waives_any_evidence_requirement',
    'approves_any_lesson',
    'establishes_rubric_pass',
    'authorizes_release',
    'authorizes_publication',
  ].map((flag) => row(receipt, `/receipt_nonclaims/${flag}`, true, new RegExp(flag))),
  ...['DOMAIN_CONSTRUCT_SME', 'ACCESSIBILITY_REVIEWER', 'LANE_AUTHOR'].map((role) =>
    row(receipt, '/decided_by_role', role, /decided_by_role/),
  ),
  row(receipt, '/decision_authority_scope', 'ANY_DECISION', /decision_authority_scope/),
  row(receipt, '/route_decisions/PREREQUISITE_SUPPORT', undefined, /PREREQUISITE_SUPPORT/),
  row(
    receipt,
    '/route_decisions/CONCISE_EXTRA',
    { decision: 'APPLICABLE', policy_clause_id: null },
    /not allowed/,
  ),
  row(receipt, '/route_decisions/CONCISE/policy_clause_id', null, /policy_clause_id/),
  row(
    receipt,
    '/route_decisions/STANDARD/policy_clause_id',
    'ROUTE_ABSENCE_STANDARD',
    /policy_clause_id/,
  ),
  row(
    receipt,
    '/route_decisions/CONCISE/policy_clause_id',
    'ROUTE_ABSENCE_MISCONCEPTION',
    /policy_clause_id/,
    'a route decision citing another route\u2019s clause',
  ),
  row(
    receipt,
    '/route_decisions/CONCISE/decision',
    'APPLICABLE',
    /route_decisions|initial_release_routes/,
    'a route decided applicable that the release scope excludes',
  ),
  row(
    receipt,
    '/initial_release_routes',
    ['STANDARD', 'CONCISE'],
    /initial_release_routes|route_decisions/,
  ),
  row(receipt, '/initial_release_routes', [], /initial_release_routes/),
  row(receipt, '/decision_basis_codes', [], /decision_basis_codes/),
  row(receipt, '/scope_limit_codes', [], /scope_limit_codes/),
  row(
    receipt,
    '/decision_basis_codes',
    ['because the owner said so'],
    /decision_basis_codes/,
    'a decision basis written as prose instead of a code',
  ),
  row(receipt, '/rubric_identity/rubric_sha256', 'UNKNOWN', /rubric_sha256/),
  row(receipt, '/decided_at', '2026-08-03', /decided_at/),
  row(receipt, '/decision_date', '2026-08-03T23:05:00Z', /decision_date/),
  row(receipt, '/decision_status', 'PENDING_OWNER_RATIFICATION', /decision_status/),
  row(
    receipt,
    '/decision_provenance/authority',
    'AUTHORITATIVE',
    /authority/,
    'verbatim provenance promoting itself to authoritative',
  ),
  row(receipt, '/decision_provenance/statement_sha256', PLACEHOLDER_SHA256[0], /statement_sha256/),
  row(
    receipt,
    '/decision_statement',
    'STANDARD only, and the lesson is approved.',
    /"decision_statement" is not allowed/,
    'free prose restored to the receipt as a machine decision field',
  ),

  // ── the ratified policy ───────────────────────────────────────────────────────
  row(
    { ...receipt, schemaFile: POLICY, document: POLICY_DOC },
    '/policy_authority/decision_ref',
    null,
    /decision_ref/,
  ),
  row(
    { ...receipt, schemaFile: POLICY, document: POLICY_DOC },
    '/policy_authority/decision_ref',
    'receipt:content/lesson-factory/deadline-profile/owner-route-policy-receipt.json',
    /decision_ref/,
  ),
  row(
    { ...receipt, schemaFile: POLICY, document: POLICY_DOC },
    '/policy_authority/decision_ref',
    `policy:some-policy@1.0.0#sha256:${'3e'.repeat(32)}`,
    /decision_ref/,
    'a policy citing another policy as its own ratification',
  ),
  row(
    { ...receipt, schemaFile: POLICY, document: POLICY_DOC },
    '/policy_authority/ratification_blockers',
    ['rubric §10 open decision 4 is unresolved'],
    /ratification_blockers/,
  ),

  // ── identity ──────────────────────────────────────────────────────────────────
  ...([null, 'UNKNOWN', 'TBD', '', 'a'.repeat(63), 'A'.repeat(64)] as JsonValue[]).map((value) =>
    row(
      identity,
      '/lesson_identity/lesson_script_content_sha256',
      value,
      /lesson_script_content_sha256/,
    ),
  ),
  ...PLACEHOLDER_SHA256.map((value) =>
    row(
      identity,
      '/lesson_identity/lesson_script_content_sha256',
      value,
      /lesson_script_content_sha256/,
      `a placeholder digest ${value.slice(0, 8)}… in a production identity`,
    ),
  ),
  row(
    identity,
    '/lesson_identity/kc_coverage_matrix_sha256',
    undefined,
    /required property "kc_coverage_matrix_sha256" is missing/,
  ),
  row(identity, '/lesson_identity/envelope_kind', 'L1', /artifact_manifest_sha256/),
  row(identity, '/candidate_quality_ledger_ref', 'ref:some-artifact', /does not match pattern/),
  row(identity, '/candidate_quality_ledger_ref', null, /expected type string/),
  row(
    { ...identity, schemaFile: KIT, document: 'kit-manifest.json' },
    '/deadline_profile_ref',
    'ref:some-artifact',
    /does not match pattern/,
  ),
  row(
    { ...identity, schemaFile: IMPORT, document: 'import-index.json' },
    '/kit_ref',
    'ref:some-artifact',
    /does not match pattern/,
  ),
  row(
    { ...identity, schemaFile: ASSIGNMENT, document: 'assignment-manifest.json' },
    '/release_policy_ref',
    'ref:some-artifact',
    /release_policy_ref/,
  ),
  row(
    { ...identity, schemaFile: IMPORT, document: 'import-index.json' },
    '/entries/0/lesson_revision_id',
    '',
    /lesson_revision_id/,
  ),
  row(
    { ...identity, schemaFile: IMPORT, document: 'import-index.json' },
    '/entries/0/bundle_ref',
    'bundle:v3-les-000001',
    /bundle_ref/,
  ),
  row(
    { ...identity, schemaFile: IMPORT, document: 'import-index.json' },
    '/identity_reconstruction_allowed',
    true,
    /identity_reconstruction_allowed/,
  ),
  row(
    { ...identity, schemaFile: IMPORT, document: 'import-index.json' },
    '/import_target/namespace',
    'PUBLISHED_CATALOG',
    /namespace/,
  ),
  row(
    { ...identity, schemaFile: IMPORT, document: 'import-index.json' },
    '/import_target/serves_learners',
    true,
    /serves_learners/,
  ),
  row(
    { ...identity, schemaFile: KIT, document: 'kit-manifest.json' },
    '/bundles/0/bundle_sha256',
    undefined,
    /required property "bundle_sha256" is missing/,
  ),
  row(
    { ...identity, schemaFile: KIT, document: 'kit-manifest.json' },
    '/bundles',
    [],
    /fewer than minItems 1/,
  ),
  row(
    { ...identity, schemaFile: ASSIGNMENT, document: 'assignment-manifest.json' },
    '/assignments/0/output_directory',
    'content/lessons/v3-les-000001',
    /output_directory/,
  ),
  row(
    { ...identity, schemaFile: ASSIGNMENT, document: 'assignment-manifest.json' },
    '/assignments/0/max_revision_cycles',
    0,
    /max_revision_cycles/,
  ),

  // ── rights, learner-safe, and protected separation ────────────────────────────
  ...['PENDING', 'RESTRICTED', 'PROHIBITED'].map((status) =>
    row(
      { ...separation, schemaFile: PACKET, document: 'task-source-packet.json' },
      '/ordered_kc_records/0/source_occurrences/0/rights_status',
      status,
      /permitted_use/,
    ),
  ),
  // A permitted source is permitted under one receipt, for uses it grants, over derived
  // fields only. Each of these is a way of claiming permission the receipt did not give.
  row(
    { ...separation, schemaFile: PACKET, document: 'task-source-packet.json' },
    '/ordered_kc_records/0/source_occurrences/0/derived_fields_only',
    false,
    /derived_fields_only/,
  ),
  ...['EXCERPT_STORAGE', 'MODEL_CALIBRATION', 'EXTERNAL_DISTRIBUTION', 'RAW_SOURCE_TEXT'].map(
    (use) =>
      row(
        { ...separation, schemaFile: PACKET, document: 'task-source-packet.json' },
        '/ordered_kc_records/0/source_occurrences/0/permitted_use/0',
        use,
        /permitted_use/,
      ),
  ),
  row(
    { ...separation, schemaFile: PACKET, document: 'task-source-packet.json' },
    '/ordered_kc_records/0/source_occurrences/0/source_class',
    'PRIVATE_COMPARISON',
    /rights_status|source_class/,
  ),
  row(
    { ...separation, schemaFile: PACKET, document: 'task-source-packet.json' },
    '/ordered_kc_records/0/source_occurrences/0/source_id',
    'KAPLAN-2026',
    /source_id/,
  ),
  // The sanitization record is the only evidence that anything was removed. A code with no
  // count behind it, or a count with no code, is a removal nobody can check.
  row(
    { ...separation, schemaFile: PACKET, document: 'task-source-packet.json' },
    '/source_sanitization/excluded_held_claim_count',
    3,
    /codes|source_sanitization/,
  ),
  row(
    { ...separation, schemaFile: PACKET, document: 'task-source-packet.json' },
    '/source_sanitization/codes',
    ['SOURCE_TEXT_RETAINED'],
    /codes|SanitizationCode/,
  ),
  // The receipt cannot be edited into an approval, or into permitting what it prohibits.
  ...[
    'grants_lesson_approval',
    'grants_external_source_copying',
    'grants_rights_clearance_for_third_party_material',
    'is_legal_advice',
    'is_third_party_license',
    'establishes_efficacy',
    'establishes_calibration',
  ].map((claim) =>
    row(
      {
        ...separation,
        schemaFile: SOURCE_USE_RECEIPT,
        source: 'artifact',
        document: 'owner-source-use-receipt.json',
      },
      `/decision_scope/${claim}`,
      true,
      new RegExp(claim),
    ),
  ),
  row(
    {
      ...separation,
      schemaFile: SOURCE_USE_RECEIPT,
      source: 'artifact',
      document: 'owner-source-use-receipt.json',
    },
    '/human_statement_authoritative',
    true,
    /human_statement_authoritative/,
  ),
  row(
    {
      ...separation,
      schemaFile: SOURCE_USE_RECEIPT,
      source: 'artifact',
      document: 'owner-source-use-receipt.json',
    },
    '/source_classes/2/usable',
    true,
    /usable/,
  ),
  row(
    {
      ...separation,
      schemaFile: SOURCE_USE_RECEIPT,
      source: 'artifact',
      document: 'owner-source-use-receipt.json',
    },
    '/permitted_use_codes/0',
    'EXTERNAL_DISTRIBUTION',
    /permitted_use_codes/,
  ),
  // A packet cannot answer to a status it did not report, or to no status at all.
  row(
    { ...identity, schemaFile: PACKET, document: 'task-source-packet.json' },
    '/packet_status',
    'BLOCKED',
    /block_reasons/,
  ),
  // The identifier families the curriculum does not issue, in the positions that used to
  // require exactly them. Each of these was the shape the frozen contract asked for.
  row(
    { ...identity, schemaFile: PACKET, document: 'task-source-packet.json' },
    '/grouping_id',
    'V3-GRP-006619',
    /grouping_id/,
  ),
  row(
    { ...identity, schemaFile: PACKET, document: 'task-source-packet.json' },
    '/placements/phase_ids/0',
    'V3-PHS-0001',
    /phase_ids/,
  ),
  row(
    { ...identity, schemaFile: PACKET, document: 'task-source-packet.json' },
    '/attachments/0/attachment_id',
    'V3-ATT-004008',
    /attachment_id/,
  ),
  row(
    { ...identity, schemaFile: PACKET, document: 'task-source-packet.json' },
    '/attachments/0/kind',
    'EXTENSION',
    /attachment_id|kind/,
  ),
  row(
    { ...identity, schemaFile: PACKET, document: 'task-source-packet.json' },
    '/placements/first_delivery_relation_id',
    'R14-XX-006619',
    /first_delivery_relation_id/,
  ),
  row(
    { ...separation, schemaFile: PACKET, document: 'task-source-packet.json' },
    '/frozen',
    false,
    /frozen/,
  ),
  ...['answer_key', 'protected_rationale', 'scoring_rules', 'author_diagnostics'].map((field) =>
    row(
      { ...separation, schemaFile: TEAM, document: 'team-handoff.json' },
      `/public_metadata/${field}`,
      'x',
      new RegExp(`"${field}" is not allowed`),
    ),
  ),
  row(
    { ...separation, schemaFile: TEAM, document: 'team-handoff.json' },
    '/public_metadata/screened_status',
    'PASS',
    /screened_status/,
  ),
  row(separation, '/protected_material_reference/storage_class', 'LEARNER_SAFE', /storage_class/),
  row(separation, '/learner_safe_summary/answer_key', 'B', /"answer_key" is not allowed/),
  ...['evaluation_verdict', 'route_verdict', 'rubric_pass', 'score'].map((field) =>
    row(
      { ...separation, schemaFile: LEDGER, document: LEDGER_DOC },
      `/author_diagnostics/${field}`,
      'PASS',
      new RegExp(field),
    ),
  ),
  row(separation, '/structural_validation/status', 'SKIPPED', /status/),
  row(separation, '/structural_validation/rule_set', 'R1-R10', /rule_set/),

  // ── runner logs ───────────────────────────────────────────────────────────────
  ...[
    'answer_key',
    'correct_choice_id',
    'accepted_responses',
    'scoring_rules',
    'response_authority',
    'option_rationales',
    'protected_rationale',
  ].map((field) => row(logs, `/${field}`, 'C', new RegExp(`"${field}" is not allowed`))),
  ...['message', 'detail', 'note', 'reason', 'text', 'stack', 'comment'].map((field) =>
    row(logs, `/${field}`, 'the key for item 3 is C', new RegExp(`"${field}" is not allowed`)),
  ),
  ...['secret', 'token', 'api_key', 'credentials', 'learner_pii'].map((field) =>
    row(logs, `/${field}`, 'sk_live_AbC123', new RegExp(`"${field}" is not allowed`)),
  ),

  // ── the lifecycle nonclaims register ──────────────────────────────────────────
  ...NONCLAIM_FLAGS.map((flag) =>
    row(
      {
        group: 'the lifecycle register cannot relabel the screened status',
        schemaFile: 'lifecycle-nonclaims.schema.json',
        source: 'artifact',
        document: 'lifecycle-nonclaims.json',
      },
      `/nonclaims/${flag}`,
      true,
      new RegExp(`nonclaims/${flag}`),
    ),
  ),
  row(
    {
      group: 'the lifecycle register cannot relabel the screened status',
      schemaFile: 'lifecycle-nonclaims.schema.json',
      source: 'artifact',
      document: 'lifecycle-nonclaims.json',
    },
    '/screened_status',
    'RUBRIC_PASS',
    /screened_status/,
  ),
  row(
    {
      group: 'the lifecycle register cannot relabel the screened status',
      schemaFile: 'lifecycle-nonclaims.schema.json',
      source: 'artifact',
      document: 'lifecycle-nonclaims.json',
    },
    '/status_kind',
    'QUALITY_VERDICT',
    /status_kind/,
  ),
  ...([{ anything: 'goes' }, ['a', 'b'], 'a long serialised blob', 42] as JsonValue[]).map(
    (value, index) =>
      row(logs, '/payload', value, /"payload" is not allowed/, `an arbitrary payload (${index})`),
  ),
  row(logs, '/event_code', 'ANSWER_KEY_MISMATCH: expected C', /event_code/),
  row(logs, '/stage', 'IMPROVISED_STAGE', /stage/),
  row(logs, '/severity', 'shout', /severity/),
  row(logs, '/blocker_code', 'blocker:the-answer-is-c', /blocker_code/),
  row(logs, '/blocker_code', 'blocker:unlisted-reason', /blocker_code/),
  row(logs, '/run_id', 'run-the-answer-is-c', /run_id/),
  row(
    logs,
    '/hashes/input_manifest_sha256',
    'the accepted response is 4.2 mol',
    /input_manifest_sha256/,
  ),
  row(logs, '/hashes/leaked_answer', 'C', /not allowed/),
  row(logs, '/counts/gates_passed', -1, /gates_passed/),
  row(logs, '/counts/gates_passed', 'many', /gates_passed/),
  row(logs, '/redaction/free_text_permitted', true, /free_text_permitted/),
  row(logs, '/redaction/protected_material_present', true, /protected_material_present/),
  row(logs, '/redaction/payload_transport', 'INLINE', /payload_transport/),
  row(logs, '/lesson_ref', 'V3-LES-000101', /lesson_ref/),
  row(
    logs,
    '/lesson_ref',
    `lesson:the-answer-is-c#sha256:${'5a'.repeat(32)}`,
    /lesson_ref/,
    'prose smuggled into the locator of a log reference',
  ),

  // ── production intake refuses test-only shapes ────────────────────────────────
  ...PLACEHOLDER_SHA256.map((value) =>
    row(
      intake,
      '/entries/0/content_sha256',
      value,
      /content_sha256/,
      `import intake refuses placeholder digest ${value.slice(0, 8)}…`,
    ),
  ),
  row(
    intake,
    '/$test_fixture',
    { synthetic: true },
    /"\$test_fixture" is not allowed/,
    'import intake refuses a test-fixture envelope marker',
  ),
  row(
    { ...intake, schemaFile: KIT, document: 'kit-manifest.json' },
    '/bundles/0/bundle_sha256',
    PLACEHOLDER_SHA256[3],
    /bundle_sha256/,
    'kit intake refuses a placeholder bundle digest',
  ),
  row(
    { ...intake, schemaFile: PROFILE, source: 'artifact', document: 'deadline-profile.json' },
    '/log_boundary/free_text_permitted',
    true,
    /free_text_permitted/,
  ),

  // ── reviewer probe 1: a public identifier used as a sentence with the spaces out ──
  ...PUBLIC_IDENTIFIER_FIELDS.flatMap(({ spec, pointer }) =>
    SLUG_PAYLOADS.map((payload) =>
      row(
        { ...spec, group: 'a public identifier is a coordinate, not a phrase' },
        pointer,
        payload,
        new RegExp(escapeForRegExp(pointer.split('/').pop() ?? pointer)),
        `${spec.document}${pointer} rejects the slug-shaped claim "${payload}"`,
      ),
    ),
  ),

  // ── reviewer probe 2: a placeholder digest hiding inside a locator ────────────
  ...REFERENCE_FIELDS.flatMap(({ spec, pointer, template }) =>
    PLACEHOLDER_SHA256.map((digest) =>
      row(
        { ...spec, group: 'one placeholder rule, applied to every reference family' },
        pointer,
        template(digest),
        new RegExp(escapeForRegExp(pointer.split('/').pop() ?? pointer)),
        `${spec.document}${pointer} refuses the placeholder digest ${digest.slice(0, 8)}\u2026`,
      ),
    ),
  ),
  ...REFERENCE_FIELDS.flatMap(({ spec, pointer }) =>
    SLUG_PAYLOADS.slice(0, 4).map((payload) =>
      row(
        { ...spec, group: 'one placeholder rule, applied to every reference family' },
        pointer,
        `${
          pointer
            .split('/')
            .pop()
            ?.replace(/_refs?$/, '') ?? 'ref'
        }:${payload}#sha256:${'5a3f'.repeat(16)}`,
        new RegExp(escapeForRegExp(pointer.split('/').pop() ?? pointer)),
        `${spec.document}${pointer} refuses the locator "${payload}"`,
      ),
    ),
  ),

  // ── reviewer probe 3: a packet or handoff authored outside the frozen scope ────
  ...POLICY_BOUND_DOCUMENTS.flatMap((spec) => [
    row(
      { ...spec, group: 'a packet and a handoff work under the frozen policy, not beside it' },
      '/applicable_routes',
      ['STANDARD', 'CONCISE'],
      /applicable_routes|route_proofs/,
      `${spec.document} lists a route the frozen policy excludes`,
    ),
    row(
      { ...spec, group: 'a packet and a handoff work under the frozen policy, not beside it' },
      '/route_proofs/CONCISE/route_applicability',
      'APPLICABLE',
      /applicable_routes|route_proofs/,
      `${spec.document} proves a route applicable that the frozen policy excludes`,
    ),
    row(
      { ...spec, group: 'a packet and a handoff work under the frozen policy, not beside it' },
      '/ratified_policy_version',
      '1.0.0',
      /ratified_policy_version/,
      `${spec.document} claims a policy version that was never ratified`,
    ),
    row(
      { ...spec, group: 'a packet and a handoff work under the frozen policy, not beside it' },
      '/route_scope_code',
      'ALL_ROUTES',
      /route_scope_code/,
      `${spec.document} invents a route scope`,
    ),
    row(
      { ...spec, group: 'a packet and a handoff work under the frozen policy, not beside it' },
      '/route_proofs/MISCONCEPTION/absence_proof_ref',
      'policy:lesson-factory-deadline-release@1.0.0#clause:ROUTE_ABSENCE_MISCONCEPTION',
      /absence_proof_ref/,
      `${spec.document} cites a superseded policy version in its absence proof`,
    ),
    row(
      { ...spec, group: 'a packet and a handoff work under the frozen policy, not beside it' },
      '/route_proofs/MISCONCEPTION/absence_proof_ref',
      'policy:lesson-factory-deadline-release@2.0.0#clause:ROUTE_ABSENCE_CONCISE',
      /absence_proof_ref/,
      `${spec.document} cites another route's clause`,
    ),
    row(
      { ...spec, group: 'a packet and a handoff work under the frozen policy, not beside it' },
      '/release_policy_ref',
      undefined,
      /release_policy_ref/,
      `${spec.document} omits the policy it was authored under`,
    ),
    row(
      { ...spec, group: 'a packet and a handoff work under the frozen policy, not beside it' },
      '/release_policy_ref',
      `policy:content/lesson-factory/deadline-profile/release-policy-copy.json#sha256:${'5a3f'.repeat(16)}`,
      /release_policy_ref/,
      `${spec.document} points at a policy lookalike`,
    ),
  ]),

  // ── an intake record cannot be admitted on the schema half alone ──────────────
  row(
    intakeRecord,
    '/resolver_validation',
    undefined,
    /resolver_validation/,
    'an intake record with no resolver result at all',
  ),
  row(
    intakeRecord,
    '/resolver_validation/status',
    'FAIL',
    /admission|resolver_validation/,
    'an intake record admitted while its references did not resolve',
  ),
  row(
    intakeRecord,
    '/resolver_validation/unresolved_count',
    1,
    /admission|unresolved_count/,
    'an intake record admitted with a reference still unresolved',
  ),
  row(
    intakeRecord,
    '/schema_validation/status',
    'FAIL',
    /admission|schema_validation/,
    'an intake record admitted while the document failed its schema',
  ),
  row(
    intakeRecord,
    '/schema_validation/error_count',
    3,
    /admission|error_count/,
    'an intake record admitted with schema errors counted against it',
  ),
  compound(
    { ...intakeRecord, group: 'schema validation alone is not admission' },
    'an intake record that passed both halves cannot then withhold admission silently',
    [{ pointer: '/admission', value: 'REJECTED' }],
    /admission/,
  ),
  row(
    intakeRecord,
    '/admission',
    'PROVISIONAL',
    /admission/,
    'an intake record that invents a third answer',
  ),
  row(
    intakeRecord,
    '/resolver_validation/references/0/status',
    'PROBABLY_FINE',
    /status/,
    'an intake record that invents a resolution status',
  ),
  row(
    intakeRecord,
    '/resolver_validation/references/0/field',
    'the correct answer is C',
    /field/,
    'an intake record that carries prose where a pointer belongs',
  ),
  row(
    intakeRecord,
    '/document/kind',
    'answer-key',
    /kind/,
    'an intake record that invents a kind of document',
  ),
  row(
    intakeRecord,
    '/document/schema_file',
    'answer-key.schema.json',
    /schema_file/,
    'an intake record that names a contract this freeze does not ship',
  ),

  // ── an admission names one document, and the four identity fields agree ───────
  //
  // Every row below is a record whose digests are all real. What each one changes is
  // what the record says those digests are *of*. The identity fields are pinned
  // together in a closed oneOf, so relabelling one of them leaves no branch standing:
  // there is no combination of profile bytes and handoff contract that is a document.
  ...(
    [
      ['/document/kind', 'policy', 'files the profile it read under the policy kind'],
      ['/document/kind', 'handoff', 'files the profile as a lane handoff'],
      [
        '/document/contract_id',
        'lesson-factory.release-policy',
        'keeps the profile kind and claims the policy contract',
      ],
      [
        '/document/contract_version',
        '4.0.0',
        'claims the profile contract at the version before this one',
      ],
      [
        '/document/contract_version',
        '99.0.0',
        'claims the profile contract at a version nobody has written',
      ],
      [
        '/document/schema_file',
        'lesson-handoff.schema.json',
        'says the profile was validated against the handoff contract',
      ],
      [
        '/document/schema_locator',
        'content/lesson-factory/schemas/lesson-handoff.schema.json',
        'points the schema locator at a contract it did not apply',
      ],
      [
        '/document/ref',
        `profile:content/lesson-factory/deadline-profile/release-policy.json#sha256:${CURRENT_POLICY_DIGEST}`,
        'names the policy file under the profile kind, at the policy digest',
      ],
      [
        '/document/ref',
        `profile:content/lesson-factory/deadline-profile/deadline-profile.json#sha256:${'ab'.repeat(32)}`,
        'names the profile at a placeholder digest',
      ],
    ] as ReadonlyArray<[string, JsonValue, string]>
  ).map(([pointer, value, what]) =>
    row(
      { ...intakeRecord, group: 'an admission is bound to one document, not to a kind of one' },
      pointer,
      value,
      /oneOf|kind|contract_id|contract_version|schema_file|schema_locator|ref/,
      `an intake record that ${what}`,
    ),
  ),
  row(
    { ...intakeRecord, group: 'an admission is bound to one document, not to a kind of one' },
    '/document/schema_locator',
    'content/lesson-factory/schemas/answer-key.schema.json',
    /schema_locator/,
    'an intake record that names a contract file this freeze does not ship',
  ),
  row(
    { ...intakeRecord, group: 'an admission is bound to one document, not to a kind of one' },
    '/document/sha256',
    PLACEHOLDER_SHA256[0],
    /sha256/,
    'an intake record whose offered-document digest is a placeholder',
  ),
  row(
    { ...intakeRecord, group: 'an admission is bound to one document, not to a kind of one' },
    '/document/schema_sha256',
    PLACEHOLDER_SHA256[1],
    /schema_sha256/,
    'an intake record whose contract digest is a placeholder',
  ),
  row(
    { ...intakeRecord, group: 'an admission is bound to one document, not to a kind of one' },
    '/document',
    undefined,
    /document/,
    'an intake record that names no document at all',
  ),
  row(
    { ...intakeRecord, group: 'an admission is bound to one document, not to a kind of one' },
    '/document/ref',
    undefined,
    /ref|document/,
    'an intake record that gives a digest but no canonical reference',
  ),
  row(
    { ...intakeRecord, group: 'an admission is bound to one document, not to a kind of one' },
    '/document/sha256',
    undefined,
    /sha256|document/,
    'an intake record that gives a reference but no content digest',
  ),

  // ── the reference rows are the ones the document has ──────────────────────────
  row(
    { ...intakeRecord, group: 'an admission reports the references the document has' },
    '/resolver_validation/checked_count',
    0,
    /checked_count/,
    'an intake record that lists references and reports checking none',
  ),
  compound(
    { ...intakeRecord, group: 'an admission reports the references the document has' },
    'an intake record that reports a count of references it does not list',
    [{ pointer: '/resolver_validation/references', value: [] }],
    /references/,
  ),
  compound(
    { ...intakeRecord, group: 'an admission reports the references the document has' },
    'an intake record that lists the same reference row twice',
    [
      {
        pointer: '/resolver_validation/references',
        value: [INTAKE_REFERENCE_ROW, INTAKE_REFERENCE_ROW],
      },
    ],
    /references|duplicate/,
  ),
  compound(
    { ...intakeRecord, group: 'an admission reports the references the document has' },
    'an intake record admitted over a reference no runner has written yet',
    [{ pointer: '/resolver_validation/references/0/status', value: 'NOT_YET_PRODUCED' }],
    /admission|status|unresolved_count/,
  ),
  compound(
    { ...intakeRecord, group: 'an admission reports the references the document has' },
    'an intake record admitted over a reference whose target hashes differently',
    [{ pointer: '/resolver_validation/references/1/status', value: 'MISMATCHED' }],
    /admission|status|unresolved_count/,
  ),

  // ── an admission carries a proof, and a refusal carries a reason ──────────────
  row(
    { ...intakeRecord, group: 'an admission carries a proof nobody can write by hand' },
    '/admission_proof',
    undefined,
    /admission_proof/,
    'an intake record admitted with no derivation proof at all',
  ),
  row(
    { ...intakeRecord, group: 'an admission carries a proof nobody can write by hand' },
    '/admission_proof/derivation_sha256',
    PLACEHOLDER_SHA256[2],
    /derivation_sha256/,
    'an intake record whose proof is a placeholder digest',
  ),
  row(
    { ...intakeRecord, group: 'an admission carries a proof nobody can write by hand' },
    '/admission_proof/derivation',
    'INTAKE_DERIVATION_V1',
    /derivation/,
    'an intake record proved under a derivation this contract does not define',
  ),
  row(
    { ...intakeRecord, group: 'an admission carries a proof nobody can write by hand' },
    '/refusal_code',
    'SCHEMA_INVALID',
    /refusal_code/,
    'an intake record that admits a document and gives a reason for refusing it',
  ),

  // ── the same probes, applied to the two lane artifacts intake now admits ──────
  ...LANE_INTAKE_CONTROLS.flatMap(laneIntakeRows),

  // ── an instance that claims a contract version its schema never described ─────
  ...ALL_CONTROLS.flatMap((spec) =>
    wrongVersions(SCHEMA_VERSIONS[spec.schemaFile as keyof typeof SCHEMA_VERSIONS]).map((version) =>
      row(
        { ...spec, group: 'an instance declares the one contract version it was written for' },
        '/contract_version',
        version,
        /contract_version/,
        `${spec.document} claims contract version ${version}`,
      ),
    ),
  ),

  // ── the frozen policy, probed with references that are well formed and wrong ──
  ...POLICY_REF_HOLDERS.flatMap((spec) => [
    row(
      { ...spec, group: 'the frozen policy is pinned by bytes, not by shape' },
      '/release_policy_ref',
      `policy:content/lesson-factory/deadline-profile/release-policy.json#sha256:${OTHER_REAL_DIGEST}`,
      /release_policy_ref/,
      `${spec.document} pins the right policy file at the digest of a different frozen artifact`,
    ),
    row(
      { ...spec, group: 'the frozen policy is pinned by bytes, not by shape' },
      '/release_policy_ref',
      `policy:content/lesson-factory/deadline-profile/release-policy.json#sha256:${'7c'.repeat(32)}`,
      /release_policy_ref/,
      `${spec.document} pins the right policy file at a digest of nothing`,
    ),
    row(
      { ...spec, group: 'the frozen policy is pinned by bytes, not by shape' },
      '/release_policy_ref',
      `policy:content/lesson-factory/deadline-profile/release-policy-v1.json#sha256:${CURRENT_POLICY_DIGEST}`,
      /release_policy_ref/,
      `${spec.document} pins the current bytes at a superseded policy locator`,
    ),
    row(
      { ...spec, group: 'the frozen policy is pinned by bytes, not by shape' },
      '/release_policy_ref',
      `receipt:content/lesson-factory/deadline-profile/release-policy.json#sha256:${CURRENT_POLICY_DIGEST}`,
      /release_policy_ref/,
      `${spec.document} pins the policy under the wrong kind`,
    ),
  ]),

  // ── a command or a path, smuggled back onto a record ──────────────────────────
  ...COMMAND_BEARING_DOCUMENTS.flatMap(({ spec, pointer }) => [
    row(
      { ...spec, group: 'a record says which screen ran, not how it was invoked' },
      `${pointer}/screen_command`,
      'pnpm --filter @mcat/content-cli start -- lesson-validate .tmp/lesson-factory/lane-01/v3-les-000101',
      /screen_command|not allowed/,
      `${spec.document}${pointer} refuses a command line`,
    ),
    row(
      { ...spec, group: 'a record says which screen ran, not how it was invoked' },
      `${pointer}/screen_code`,
      'DEADLINE_MACHINE_SCREEN',
      /screen_code/,
      `${spec.document}${pointer} refuses a code that is not the gate it is filed under`,
    ),
    row(
      { ...spec, group: 'a record says which screen ran, not how it was invoked' },
      `${pointer}/screen_ref`,
      `screen:lane-01/v3-les-000101/deadline-machine-screen#sha256:${'3b'.repeat(32)}`,
      /screen_ref/,
      `${spec.document}${pointer} refuses a run of a different screen`,
    ),
  ]),
];

/**
 * One case per (string-bearing field, payload) pair across every learner-safe, public,
 * diagnostic, and log surface. Generated from the control documents rather than a
 * hand-written field list, so a new string field is covered the moment it appears in a
 * control — the failure mode of a hand-written list is the field nobody added to it.
 */
/**
 * What the rendered error has to say for an injection row to have proven its point.
 *
 * Normally: the name of the field that was injected into. A field inside a closed
 * discriminated union is different — the union refuses the whole value, because the
 * branch that would have named the field is one of several that failed, and the others
 * failed for saying the value is not some other shape entirely. Accepting the union's own
 * refusal at the immediate parent keeps the row about this field, and nothing else is
 * accepted: an error somewhere else in the document still fails the row.
 */
function injectionExpectation(pointer: string): RegExp {
  const leaf = escapeForRegExp(pointer.split('/').pop() ?? pointer);
  const parent = pointer.slice(0, pointer.lastIndexOf('/'));
  if (parent === '') return new RegExp(leaf);
  return new RegExp(`${leaf}|^${escapeForRegExp(parent)}: value matches 0 oneOf branches`);
}

function injectionCases(): NegativeCase[] {
  const cases: NegativeCase[] = [];
  for (const surface of INJECTION_SURFACES) {
    const control = loadControl(surface.source, surface.document);
    for (const pointer of stringPointersUnder(control, surface.roots)) {
      if (isDeclaredProse(surface, pointer)) continue;
      for (const payload of INJECTION_PAYLOADS) {
        cases.push({
          group: 'no learner-safe, diagnostic, or log field admits prose',
          name: `${surface.document}${pointer} rejects ${JSON.stringify(payload)}`,
          schemaFile: surface.schemaFile,
          source: surface.source,
          document: surface.document,
          mutations: [{ pointer, value: payload }],
          expect: injectionExpectation(pointer),
        });
      }
    }
  }
  return cases;
}

/**
 * Whether a pointer is one of a surface's declared prose fields — a place where a human
 * is writing to another human, and the contract says so. Everything else on every
 * surface is injected. `lesson-factory-deadline-contract.test.ts` audits this list
 * against the contracts, so a field cannot be exempted here without the contract
 * agreeing that it really is unconstrained text.
 */
export function isDeclaredProse(
  surface: (typeof INJECTION_SURFACES)[number],
  pointer: string,
): boolean {
  return (surface.declaredProse ?? []).some((pattern) => pattern.test(pointer));
}

/** Every declared-prose pointer of every surface, for the audit that checks them. */
export function declaredProsePointers(): Array<{ document: string; pointer: string }> {
  const found: Array<{ document: string; pointer: string }> = [];
  for (const surface of INJECTION_SURFACES) {
    if (surface.declaredProse === undefined) continue;
    const control = loadControl(surface.source, surface.document);
    for (const pointer of stringPointersUnder(control, surface.roots)) {
      if (isDeclaredProse(surface, pointer)) found.push({ document: surface.document, pointer });
    }
  }
  return found;
}

/** Every pointer under `roots` whose value is a string. */
export function stringPointersUnder(document: JsonObject, roots: readonly string[]): string[] {
  const pointers: string[] = [];
  const walk = (node: JsonValue, pointer: string): void => {
    if (typeof node === 'string') {
      pointers.push(pointer);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((child, index) => walk(child, `${pointer}/${index}`));
      return;
    }
    if (node !== null && typeof node === 'object') {
      for (const [key, value] of Object.entries(node)) walk(value, `${pointer}/${key}`);
    }
  };
  for (const root of roots) {
    const node = root === '' ? document : pointerValue(document, root);
    if (node !== undefined) walk(node, root);
  }
  return pointers;
}

function pointerValue(document: JsonObject, pointer: string): JsonValue | undefined {
  let node: JsonValue | undefined = document;
  for (const segment of pointer.split('/').filter((part) => part.length > 0)) {
    if (node === null || typeof node !== 'object') return undefined;
    node = Array.isArray(node) ? node[Number(segment)] : node[segment];
  }
  return node;
}

let cached: NegativeCase[] | undefined;

/** The whole table: explicit invariant rows plus generated injection rows. */
export function allNegativeCases(): NegativeCase[] {
  cached ??= [...EXPLICIT_CASES, ...injectionCases()];
  return cached;
}

export const EXPLICIT_CASE_COUNT = EXPLICIT_CASES.length;
