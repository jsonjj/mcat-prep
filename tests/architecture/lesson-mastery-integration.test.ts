import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, posix, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  EventIdSchema,
  IdempotencyKeySchema,
  LearnerIdSchema,
} from '../../packages/contracts/src/ids';
import { UtcTimestampSchema } from '../../packages/contracts/src/time';
import {
  BKT_ELIGIBLE_EVIDENCE_MODES,
  BKT_QUALIFICATION_REJECTION_CODES,
  CandidateEvidenceModeSchema,
  LessonRuntimeResponseFactsSchema,
  QualifiedBktObservationSchema,
  hasEligibleEvidenceMode,
  type CandidateEvidenceMode,
  type LessonItemBinding,
  type LessonRuntimeResponseFacts,
} from '../../packages/contracts/src/lesson-observation';
import { CONTEXTUAL_ONLY_KINDS, EvidenceRecordSchema } from '../../packages/domain/src/evidence';
import {
  adaptLessonResponse,
  deriveEvidenceKind,
  isIndependentAdministration,
  parseAuthoredLessonBinding,
  unrecognizedAuthoredBindingKeys,
  type LessonResponseAdaptation,
  type ServerScoringResolution,
} from '../../packages/domain/src/lesson-response-adapter';
import { DEBUG_LEARNER_STATE_PATH } from '../../services/local-authority/src/debug-state';
import { ROUTES } from '../../services/lambdas/learner-api/src/routes';

/**
 * Architecture contract for the lesson → evidence → mastery seam.
 *
 * Two authorities, deliberately separated (docs/lesson-evidence-mastery-contract.md,
 * docs/governance/authority-boundaries.md):
 *
 * - BKT owns CAPABILITY: `pL`, decay, review-due, the learner-facing percentage,
 *   the 0.95 cut. Only `@mcat/policies` computes it and only the authority
 *   applies an observation to it.
 * - The evidence system owns WARRANT: independence, family diversity, transfer,
 *   delayed/retention, administration conditions, freshness, gaps. Backend only.
 *
 * The single rule underneath all of it: THE LESSON RUNTIME EMITS FACTS; THE
 * SERVER DECIDES EVERYTHING ELSE. A lesson author or lesson runtime never
 * asserts correctness, independence, an evidence mode, an administration
 * condition, or mastery.
 *
 * Every assertion here is written to fail on a NEW violation rather than to
 * snapshot today's tree: file sets are discovered, not listed, and the vocabulary
 * bans are keyed off the concepts the two documents name. Where an existing
 * exception had to be allowlisted it is named inline with the reason.
 *
 * Deliberately NOT duplicated here:
 * - `cross-package-enum-parity.test.ts` owns mirrored-enum divergence.
 * - `v3-lesson-binding-conformance.test.ts` owns real-artifact conformance for
 *   the three on-disk lessons; this file uses synthetic bindings so it can test
 *   the violations no shipped artifact contains.
 * - `packages/policies/src/lesson-rollup.test.ts` owns the fail-closed rollup.
 */

// ---------------------------------------------------------------------------
// Source discovery
// ---------------------------------------------------------------------------

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Trees that ship or run product code. `tests/` is excluded: it is the guard, not the subject. */
const PRODUCT_TREES = ['apps', 'database', 'infra', 'packages', 'services', 'tools'];

const SKIPPED_DIRECTORIES: ReadonlySet<string> = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.turbo',
  '.next',
  'cdk.out',
]);

const SOURCE_EXTENSIONS = /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/;

interface SourceFile {
  /** Repo-relative, POSIX-separated, so allowlists read the same on every platform. */
  readonly path: string;
  readonly text: string;
}

function walk(absolute: string, out: string[]): void {
  if (!existsSync(absolute)) return;
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    const child = join(absolute, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name)) walk(child, out);
      continue;
    }
    if (SOURCE_EXTENSIONS.test(entry.name)) out.push(child);
  }
}

/** Every production source file (no tests) under the given repo-relative roots. */
function productionSources(relativeRoots: readonly string[]): readonly SourceFile[] {
  const absolute: string[] = [];
  for (const relativeRoot of relativeRoots) walk(join(root, relativeRoot), absolute);
  return absolute
    .map((file) => relative(root, file).split(sep).join(posix.sep))
    .filter((path) => !TEST_FILE.test(path))
    .sort()
    .map((path) => ({ path, text: readFileSync(join(root, path), 'utf8') }));
}

const PRODUCT_SOURCES = productionSources(PRODUCT_TREES);

/** Import specifiers a file pulls in, as written. */
function importSpecifiers(text: string): readonly string[] {
  const specifiers: string[] = [];
  const patterns = [
    /\bfrom\s+['"]([^'"]+)['"]/g,
    /\bimport\s+['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]/g,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier !== undefined) specifiers.push(specifier);
    }
  }
  return specifiers;
}

/** True when `text` calls `symbol`. Call syntax, so a doc comment naming a
 * prohibition is not mistaken for committing it. */
const callsSymbol = (text: string, symbol: string): boolean =>
  new RegExp(String.raw`(?<![.\w$])${symbol}\s*\(`).test(text);

/**
 * Where each import actually points: a bare specifier as written, and a relative
 * one resolved to a repo-relative path. Both spellings have to be checked —
 * reaching across a package boundary with `../../other-package/src` bypasses the
 * package name entirely and is the cheaper way to smuggle a forbidden
 * dependency past a check that only looks at `@mcat/…`.
 */
const importTargets = (file: SourceFile): readonly string[] =>
  importSpecifiers(file.text).map((specifier) =>
    specifier.startsWith('.')
      ? posix.normalize(posix.join(posix.dirname(file.path), specifier))
      : specifier,
  );

interface StrictSchema {
  safeParse(input: unknown): {
    readonly success: boolean;
    readonly error?:
      | { readonly issues: readonly { readonly code: string; readonly keys?: readonly string[] }[] }
      | undefined;
  };
}

/**
 * Does `schema` have no field named `key` at all?
 *
 * Asserted through the `unrecognized_keys` issue a `.strict()` object reports,
 * not through a probe value being rejected: a probe of the wrong type is refused
 * by a field that exists perfectly well, which would let a newly added field
 * pass this check.
 */
function rejectsUnknownKey(schema: StrictSchema, base: object, key: string): boolean {
  const result = schema.safeParse({ ...base, [key]: 'architecture-probe' });
  if (result.success) return false;
  const unrecognized = (result.error?.issues ?? [])
    .filter((issue) => issue.code === 'unrecognized_keys')
    .flatMap((issue) => issue.keys ?? []);
  return unrecognized.includes(key);
}

/** Does `file` import the given workspace package, by name or by path? */
function importsWorkspacePackage(
  file: SourceFile,
  packageName: string,
  packageDirectory: string,
): boolean {
  return importTargets(file).some(
    (target) =>
      target === packageName ||
      target.startsWith(`${packageName}/`) ||
      target === packageDirectory ||
      target.startsWith(`${packageDirectory}/`),
  );
}

// ---------------------------------------------------------------------------
// Fixtures — synthetic, so no lesson artifact is a source of truth here
// ---------------------------------------------------------------------------

/**
 * Deliberately unlike a real lesson id (`V3-LES-130923`). Lessons are the test
 * set, never the source, and the generic seam must not recognise either shape.
 */
const LESSON_ID = 'arch-fixture-lesson';
const ARTIFACT_VERSION = 'arch-fixture-artifact-v1';
const OCCURRED_AT = '2026-07-27T12:00:00.000Z';
const ACCEPTED_AT = '2026-07-27T12:00:05.000Z';

/** Sentinels: protected material must be findable by value, not just by key name. */
const PROTECTED_SCORER_REF = 'PROTECTED-SCORING-AUTHORITY-MUST-NOT-LEAK';
const PROTECTED_RATIONALE_REF = 'PROTECTED-RATIONALE-AUTHORITY-MUST-NOT-LEAK';

type Authored = Record<string, unknown>;

const authoredBinding = (overrides: Authored = {}): Authored => ({
  item_binding_id: 'arch-binding-1',
  question_id: 'arch-question-1',
  activity_id: 'arch-activity-1',
  primary_kc_id: 'ARCH-KC-PRIMARY',
  activity_role: 'SOLO_PRACTICE',
  semantic_family_id: 'arch-family-1',
  assistance_available: ['NOT_SURE_ALLOWED'],
  changed_dimensions: [],
  first_attempt_immutable: true,
  server_scoring_authority_ref: PROTECTED_SCORER_REF,
  server_rationale_authority_ref: PROTECTED_RATIONALE_REF,
  learner_safe_item_ref: 'arch-learner-safe-ref',
  ...overrides,
});

/** A binding an author and reviewer deliberately made BKT-eligible. */
const eligibleAuthoredBinding = (overrides: Authored = {}): Authored =>
  authoredBinding({
    candidate_evidence_modes: ['INDEPENDENT'],
    reasoning_operation: 'IDENTIFY',
    ...overrides,
  });

/**
 * The inline-projection arm of `learnerSafeItemRef`. The opaque-ref key is
 * removed because the normalizer resolves the arms in preference order and
 * `learner_safe_item_ref` wins, which would leave the projection unexamined.
 */
function projectionBinding(projection: Record<string, unknown>): Authored {
  const { learner_safe_item_ref: _omitted, ...rest } = authoredBinding();
  return { ...rest, learner_safe_projection: projection };
}

const parseBinding = (raw: Authored) =>
  parseAuthoredLessonBinding({ lessonId: LESSON_ID, artifactVersion: ARTIFACT_VERSION }, raw);

function binding(raw: Authored): LessonItemBinding {
  const parsed = parseBinding(raw);
  if (parsed.status !== 'parsed') {
    throw new Error(
      `Fixture binding did not parse, so the assertion below would be vacuous: ${JSON.stringify(
        parsed.issues.map((issue) => [issue.path.join('.'), issue.message]),
      )}`,
    );
  }
  return parsed.binding;
}

/** A clean independent first attempt: the only shape that can qualify for BKT. */
const responseFacts = (overrides: Record<string, unknown> = {}): LessonRuntimeResponseFacts =>
  LessonRuntimeResponseFactsSchema.parse({
    questionId: 'arch-question-1',
    itemBindingId: 'arch-binding-1',
    bindingVersion: ARTIFACT_VERSION,
    attemptIndex: 1,
    isRetry: false,
    isDiagnosticRetry: false,
    response: { kind: 'MULTIPLE_CHOICE', chosenChoiceId: 'arch-choice-a' },
    omitted: false,
    elapsedMs: 30_000,
    answerChanges: 0,
    assistanceLevel: 'A0',
    contentBearingHintUsed: false,
    revealUsed: false,
    occurredAt: OCCURRED_AT,
    ...overrides,
  });

const VALID_SCORING: ServerScoringResolution = {
  scoringValid: true,
  serverItemVersion: 4,
  outcome: 'correct',
  protectedScoring: false,
};

function adapt(
  raw: Authored,
  response: LessonRuntimeResponseFacts = responseFacts(),
  scoring: ServerScoringResolution = VALID_SCORING,
  extra: { readonly acceptedAt?: string } = {},
): LessonResponseAdaptation {
  return adaptLessonResponse({
    binding: binding(raw),
    response,
    scoring,
    identity: {
      observationId: '9c0ffee0-0000-4000-8000-00000000a001',
      eventId: EventIdSchema.parse('9c0ffee0-0000-4000-8000-00000000a002'),
      learnerId: LearnerIdSchema.parse('9c0ffee0-0000-4000-8000-00000000a003'),
      idempotencyKey: IdempotencyKeySchema.parse('9c0ffee0-0000-4000-8000-00000000a004'),
      evidenceId: '9c0ffee0-0000-4000-8000-00000000a005',
    },
    cluster: 'R1',
    envelopeBindingVersion: ARTIFACT_VERSION,
    acceptedAt: UtcTimestampSchema.parse(extra.acceptedAt ?? ACCEPTED_AT),
    sequence: 1,
    contentRelease: 'arch-fixture-release',
    policies: [],
  });
}

function qualifiedObservation(raw: Authored): Record<string, unknown> {
  const { qualification } = adapt(raw);
  if (qualification.status !== 'qualified') {
    throw new Error(
      `Fixture was expected to qualify for BKT; it was rejected with ${qualification.rejectionCodes.join(', ')}.`,
    );
  }
  return qualification.observation as unknown as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// 1–2. Who may touch BKT
// ---------------------------------------------------------------------------

/**
 * The functions that MOVE `pL`. `applyMasteryAttempt` is the composition,
 * `bktUpdate` the update itself, `stepMemory` the decay-then-update step, and
 * `reinforcePrerequisite` the indirect one-hop write. Anything that calls one of
 * these is writing capability.
 */
const BKT_APPLY_PATH_SYMBOLS = [
  'applyMasteryAttempt',
  'bktUpdate',
  'stepMemory',
  'reinforcePrerequisite',
] as const;

/**
 * The only code allowed to call the apply path.
 *
 * - `packages/policies/src/**` declares and internally composes it.
 * - `packages/authority-core/src/authority.ts` IS the authority: it re-parses a
 *   `QualifiedBktObservation` through the strict schema, deduplicates on
 *   `observationId`, and is the single door to `pL`. Callers reach it through
 *   `applyQualifiedBktObservation`, never through `@mcat/policies` directly.
 */
const BKT_APPLY_PATH_ALLOWLIST = [
  /^packages\/policies\/src\//,
  /^packages\/authority-core\/src\/authority\.ts$/,
];

/** How a file imports the capability engine, in any spelling. */
const importsPolicyEngine = (file: SourceFile): boolean =>
  importsWorkspacePackage(file, '@mcat/policies', 'packages/policies');

/**
 * The lesson runtime, discovered rather than listed: any production file whose
 * path names a lesson, inside the trees that deliver lessons to a learner. A new
 * `lesson-*.ts` runtime file is covered the day it lands.
 */
const LESSON_RUNTIME_TREES = [
  'services/lambdas/learner-api/src',
  'apps/learner-web/src',
  'packages/content/src',
  'packages/client-core/src',
];

const LESSON_RUNTIME_FILES = productionSources(LESSON_RUNTIME_TREES).filter((file) =>
  /lesson/i.test(file.path),
);

/** Files that must be in the scan, or the scan has silently stopped looking. */
const LESSON_RUNTIME_ANCHORS = [
  'services/lambdas/learner-api/src/vector-lesson-runtime.ts',
  'apps/learner-web/src/screens/VectorLesson.tsx',
];

describe('only the authority may move P(L)', () => {
  it('scans a non-empty lesson runtime, including the known runtime entry points', () => {
    // Anti-vacuity for every assertion in this describe block: a discovery that
    // returns nothing would make them all pass without checking anything.
    expect(LESSON_RUNTIME_FILES.length).toBeGreaterThan(3);
    const scanned = new Set(LESSON_RUNTIME_FILES.map((file) => file.path));
    for (const anchor of LESSON_RUNTIME_ANCHORS) {
      expect(
        scanned.has(anchor),
        `${anchor} is no longer in the lesson-runtime scan. If it moved, update ` +
          'LESSON_RUNTIME_ANCHORS / LESSON_RUNTIME_TREES; do not delete the anchor.',
      ).toBe(true);
    }
  });

  it('the lesson runtime never imports the BKT policy engine', () => {
    const offenders = LESSON_RUNTIME_FILES.filter(importsPolicyEngine).map((file) => file.path);
    expect(
      offenders,
      [
        'A lesson runtime file imports @mcat/policies.',
        '',
        'The runtime EMITS FACTS (attempt index, retry flags, the response payload,',
        'omission, elapsed time, answer changes, the assistance level actually taken,',
        'hint/reveal usage, occurrence time). It never decides correctness,',
        'independence, an evidence kind, or mastery — see',
        'docs/governance/authority-boundaries.md, "Lesson runner (runtime)".',
        '',
        'A lesson reaches P(L) only by handing a QualifiedBktObservation to',
        'Authority.applyQualifiedBktObservation. Importing the engine here would let',
        'the runtime compute or compare capability itself.',
      ].join('\n'),
    ).toEqual([]);
  });

  it('the lesson runtime never calls the BKT apply path', () => {
    const offenders = LESSON_RUNTIME_FILES.filter((file) =>
      BKT_APPLY_PATH_SYMBOLS.some((symbol) => callsSymbol(file.text, symbol)),
    ).map((file) => file.path);
    expect(offenders, 'A lesson runtime file calls a BKT write function directly.').toEqual([]);
  });

  it('nothing outside @mcat/policies and the authority calls the BKT apply path', () => {
    const callSites = PRODUCT_SOURCES.filter((file) =>
      BKT_APPLY_PATH_SYMBOLS.some((symbol) => callsSymbol(file.text, symbol)),
    ).map((file) => file.path);

    // Calibration: if the detector stopped matching real code the offender list
    // below would be empty for the wrong reason.
    expect(
      callSites.length,
      'The apply-path detector found no call sites at all, not even the ones inside ' +
        '@mcat/policies. The regex or the scan is broken, not the codebase.',
    ).toBeGreaterThanOrEqual(2);
    expect(PRODUCT_SOURCES.length).toBeGreaterThan(100);

    const offenders = callSites.filter(
      (path) => !BKT_APPLY_PATH_ALLOWLIST.some((allowed) => allowed.test(path)),
    );
    expect(
      offenders,
      [
        'Code outside @mcat/policies and packages/authority-core/src/authority.ts calls',
        `the BKT apply path (${BKT_APPLY_PATH_SYMBOLS.join(', ')}).`,
        '',
        'Exactly one component applies an observation to a learner state, because it is',
        'the component that re-parses the observation through the strict schema and',
        'deduplicates on observationId. A second writer means a lesson response can move',
        'P(L) twice, or move it without ever being qualified.',
        '',
        'Call Authority.applyQualifiedBktObservation instead of the engine.',
      ].join('\n'),
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 3. The seam is generic: lessons are the test set, never the source
// ---------------------------------------------------------------------------

/** Lesson-script artifacts on disk, so a NEW lesson's id is banned the day it lands. */
function discoveredLessonIds(): readonly string[] {
  const roots = [join(root, 'content', 'lessons'), join(root, '..', 'research')];
  const scripts: string[] = [];
  const collect = (absolute: string): void => {
    if (!existsSync(absolute)) return;
    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      const child = join(absolute, entry.name);
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(entry.name)) collect(child);
      } else if (entry.name === 'lesson-script.json') scripts.push(child);
    }
  };
  for (const dir of roots) collect(dir);

  const ids = new Set<string>();
  for (const script of scripts) {
    const parsed: unknown = JSON.parse(readFileSync(script, 'utf8'));
    const payload =
      typeof parsed === 'object' && parsed !== null
        ? (parsed as Record<string, unknown>).payload
        : undefined;
    const id =
      typeof payload === 'object' && payload !== null
        ? (payload as Record<string, unknown>).lesson_id
        : undefined;
    if (typeof id === 'string' && id.length > 0) ids.add(id);
  }
  return [...ids].sort();
}

const DISCOVERED_LESSON_IDS = discoveredLessonIds();

/**
 * Identifiers that name one particular lesson. Real ids look like
 * `V3-LES-130923`; the friendly route slug and the synthetic dev lesson are the
 * other two spellings that have been branched on before.
 */
const LESSON_SPECIFIC_PATTERNS: readonly RegExp[] = [
  /V3-LES-\d+/,
  /V3-KC-\d+/,
  /vectors-and-trigonometry/,
  /lesson-enz-inhibition/,
  ...DISCOVERED_LESSON_IDS.map((id) => new RegExp(id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))),
];

/**
 * Trees that MUST stay lesson-agnostic. Adding a second conforming lesson must
 * require zero changes here (contract §13): the generic adapter, the evidence
 * router, and the mastery engine.
 */
const LESSON_AGNOSTIC_TREES = ['packages/domain/src', 'packages/policies/src'];

const LESSON_AGNOSTIC_ANCHORS = [
  'packages/domain/src/lesson-response-adapter.ts',
  'packages/domain/src/evidence.ts',
  'packages/policies/src/mastery-attempt.ts',
  'packages/policies/src/lesson-rollup.ts',
];

describe('the lesson seam is generic (no lesson is a special case)', () => {
  it('knows what a lesson-specific identifier looks like', () => {
    // The pattern list is the whole assertion below; prove it recognises the
    // real shapes rather than trusting it.
    for (const sample of ['V3-LES-130923', 'V3-LES-789208', 'V3-LES-844372']) {
      expect(
        LESSON_SPECIFIC_PATTERNS.some((pattern) => pattern.test(sample)),
        `${sample} is a real lesson id and must be recognised as lesson-specific.`,
      ).toBe(true);
    }
    expect(LESSON_SPECIFIC_PATTERNS.some((pattern) => pattern.test('primaryKcId'))).toBe(false);
    // Lessons discovered from disk are extra coverage, not the whole list, so an
    // absent artifact tree weakens nothing above.
    expect(DISCOVERED_LESSON_IDS.length).toBeGreaterThanOrEqual(0);
  });

  it('no lesson-specific identifier appears in the generic adapter, router, or engine', () => {
    const files = productionSources(LESSON_AGNOSTIC_TREES);
    const scanned = new Set(files.map((file) => file.path));
    for (const anchor of LESSON_AGNOSTIC_ANCHORS) {
      expect(scanned.has(anchor), `${anchor} dropped out of the lesson-agnostic scan.`).toBe(true);
    }

    const offenders: string[] = [];
    for (const file of files) {
      for (const pattern of LESSON_SPECIFIC_PATTERNS) {
        const hit = pattern.exec(file.text);
        if (hit !== null) offenders.push(`${file.path}: ${hit[0]}`);
      }
    }
    expect(
      offenders,
      [
        'A lesson-specific identifier appears in code that must be lesson-agnostic.',
        '',
        'Contract §13: a second conforming V3 lesson MUST require zero changes to the',
        'adapter, the evidence router, or mastery policy. Nothing may branch on a lesson',
        'id, a KC id, an id format, an item count, or an item ordering.',
        '',
        'If a lesson needs something the seam does not offer, the fix is a governed',
        'vocabulary member or a deliberately mapped author key — never a lesson-shaped',
        'branch here.',
      ].join('\n'),
    ).toEqual([]);
  });

  it('the generic seam never reaches into content for lesson data', () => {
    // `EvidenceRecord.cluster` is caller-resolved for exactly this reason
    // (contract §7.3): @mcat/domain must not import @mcat/content, so no
    // lesson-specific table can be consulted from inside the seam.
    const offenders = productionSources(['packages/domain/src'])
      .filter((file) => importsWorkspacePackage(file, '@mcat/content', 'packages/content'))
      .map((file) => file.path);
    expect(
      offenders,
      '@mcat/domain imported @mcat/content. The cluster and the lesson→KC membership ' +
        'arrive as caller-resolved inputs precisely so the seam carries no content dependency.',
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 4. Protected material never reaches a learner-safe or evidence surface
// ---------------------------------------------------------------------------

/** Author keys that would let a lesson script assert what only the server may decide. */
const FORBIDDEN_AUTHOR_KEYS = [
  'independent',
  'p_l',
  'pL',
  'mastered',
  'mastery_threshold',
  'mastery_status',
  'decay_rate',
  'half_life_days',
  'review_due',
  'evidence_status',
  'evidence_rank',
  'evidence_kind',
  'correct_answer',
  'correct_choice_id',
  'answer_key',
  'scoring_logic',
  'protected_rationale',
] as const;

describe('protected and server-owned material stays out of learner-facing records', () => {
  it('never copies a scoring or rationale authority ref into evidence or a BKT observation', () => {
    const adaptation = adapt(eligibleAuthoredBinding());

    // Calibration: the refs must really be on the binding, or "absent from
    // evidence" would be true because nothing carried them in the first place.
    expect(JSON.stringify(adaptation.observation)).toContain(PROTECTED_SCORER_REF);
    expect(JSON.stringify(adaptation.observation)).toContain(PROTECTED_RATIONALE_REF);

    for (const [label, record] of [
      ['EvidenceRecord', adaptation.evidence],
      ['QualifiedBktObservation', qualifiedObservation(eligibleAuthoredBinding())],
    ] as const) {
      const json = JSON.stringify(record);
      expect(json, `${label} leaked the protected scoring authority ref.`).not.toContain(
        PROTECTED_SCORER_REF,
      );
      expect(json, `${label} leaked the protected rationale authority ref.`).not.toContain(
        PROTECTED_RATIONALE_REF,
      );
      for (const key of ['serverScoringAuthorityRef', 'serverRationaleAuthorityRef', 'binding']) {
        expect(Object.keys(record as object), `${label} must not carry ${key}.`).not.toContain(key);
      }
    }
  });

  it('rejects an inline learner-safe projection that smuggles the key or a rationale', () => {
    for (const smuggled of [
      { correct_answer: 'B' },
      { correctChoiceId: 'choice-b' },
      { rationales: { a: 'because' } },
      { answerKey: 'B' },
    ]) {
      const parsed = parseBinding(
        projectionBinding({
          prompt: 'Resolve the vector.',
          choices: [{ id: 'choice-a', text: 'A' }],
          ...smuggled,
        }),
      );
      expect(
        parsed.status,
        `An inline learner-safe projection carrying ${Object.keys(smuggled).join(', ')} was ` +
          'ACCEPTED. The strict projection shape must reject it rather than silently strip it: ' +
          'stripping means the author never learns the material was answer-bearing.',
      ).toBe('invalid');
    }

    // Calibration: the same projection without the smuggled key parses, so the
    // rejections above are about the answer-bearing field and nothing else.
    expect(
      parseBinding(
        projectionBinding({
          prompt: 'Resolve the vector.',
          choices: [{ id: 'choice-a', text: 'A' }],
        }),
      ).status,
    ).toBe('parsed');

    // A choice object may carry an id and text and nothing else, so a per-choice
    // rationale or correctness flag cannot ride along inside the array either.
    expect(
      parseBinding(
        projectionBinding({
          choices: [{ id: 'choice-a', text: 'A', isCorrect: true }],
        }),
      ).status,
    ).toBe('invalid');
  });

  it('reports every unmapped author key instead of dropping it, and lets none reach the contract', () => {
    // This is the live-fire test for `unrecognizedAuthoredBindingKeys`: the real
    // artifacts all return empty, so conformance can only ever prove the empty
    // case. A detector that returned [] unconditionally would pass there.
    for (const key of FORBIDDEN_AUTHOR_KEYS) {
      const raw = authoredBinding({ [key]: 'author-asserted-value' });
      expect(
        unrecognizedAuthoredBindingKeys(raw),
        `An author wrote "${key}" and the normalizer did not report it. Contract §3.7: an ` +
          'unmapped author key is REPORTED, not dropped, so a new key has to be mapped ' +
          'deliberately instead of disappearing on the way to the contract.',
      ).toContain(key);

      const parsed = parseBinding(raw);
      expect(parsed.unrecognizedKeys, `parse result did not surface "${key}".`).toContain(key);
      // Structural half: even reported, it must never occupy a contract field.
      if (parsed.status === 'parsed') {
        expect(
          Object.keys(parsed.binding),
          `"${key}" reached the compiled LessonItemBinding.`,
        ).not.toContain(key);
        expect(JSON.stringify(parsed.binding)).not.toContain('author-asserted-value');
      }
    }

    // Calibration: a fully mapped binding reports nothing, so the assertions
    // above are not just "this function always returns something".
    expect(unrecognizedAuthoredBindingKeys(authoredBinding())).toEqual([]);
  });

  it('gives the lesson runner no field for a judgement it is not allowed to make', () => {
    for (const judgement of [
      { correct: true },
      { independent: true },
      { pL: 0.99 },
      { mastered: true },
      { masteryThreshold: 0.95 },
      { scoringValid: true },
      { evidenceKind: 'independent' },
      { outcome: 'correct' },
    ]) {
      const name = Object.keys(judgement)[0] as string;
      expect(
        rejectsUnknownKey(LessonRuntimeResponseFactsSchema, responseFacts(), name),
        `LessonRuntimeResponseFacts has a field named "${name}". Contract §4: every field on ` +
          'this object is an observed fact and none is a judgement. The schema is .strict() so ' +
          'there is no field for correctness, independence, or mastery.',
      ).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// 5. Lesson completion is delivery state, not capability
// ---------------------------------------------------------------------------

/** Capability vocabulary: BKT's alone. */
const CAPABILITY_FIELDS = [
  'pL',
  'mastered',
  'masteryThreshold',
  'halfLifeDays',
  'reviewDue',
  'refreshNeeded',
  'lastPracticedAt',
  'decayRate',
  'priorPL',
] as const;

/** Warrant vocabulary: the evidence system's alone. */
const WARRANT_FIELDS = [
  'kind',
  'independent',
  'familyId',
  'stimulusId',
  'conditions',
  'changeDimensions',
  'delayHours',
  'evidenceStatus',
  'evidenceRank',
  'assistanceLevel',
  'contentBearingHint',
  'valid',
] as const;

/** The lesson DELIVERY surface: run state, screens, progress, checkpoints. */
const LESSON_DELIVERY_FILES = [
  'packages/contracts/src/v3-vector-lesson.ts',
  'services/lambdas/learner-api/src/vector-lesson-runtime.ts',
];

describe('lesson delivery and capability are separate axes', () => {
  it('the lesson delivery contract and state machine carry no capability vocabulary', () => {
    for (const path of LESSON_DELIVERY_FILES) {
      const absolute = join(root, path);
      expect(
        existsSync(absolute),
        `${path} is missing, so this assertion cannot see the delivery surface.`,
      ).toBe(true);
      const text = readFileSync(absolute, 'utf8');
      for (const field of CAPABILITY_FIELDS) {
        expect(
          new RegExp(String.raw`\b${field}\b`).test(text),
          [
            `${path} names the capability field "${field}".`,
            '',
            'Contract §9: lesson delivery, checkpoint and repair state is a SEPARATE axis',
            'from mastery. Completing a lesson must not set, raise, or imply mastery, and a',
            'mastered rollup must not mark a lesson delivered. A delivery view that carries a',
            'capability number is how the two axes get wired together by accident.',
          ].join('\n'),
        ).toBe(false);
      }
    }
  });

  it('a delivery-completion signal cannot be read as a BKT observation', () => {
    // The only input BKT accepts from a lesson is one scored item attempt.
    // Completion has no questionId, no serverItemVersion, and no
    // reasoningOperation, so it cannot be coerced into the shape.
    const completion = {
      lessonId: LESSON_ID,
      runId: '9c0ffee0-0000-4000-8000-00000000b001',
      state: 'DELIVERY_COMPLETE',
      occurredAt: OCCURRED_AT,
      correct: true,
    };
    expect(
      QualifiedBktObservationSchema.safeParse(completion).success,
      'A lesson delivery-completion payload parsed as a QualifiedBktObservation.',
    ).toBe(false);

    // And a lesson is never itself a BKT target (contract §8.2).
    const observation = qualifiedObservation(eligibleAuthoredBinding());
    expect(Object.keys(observation)).not.toContain('lessonId');
    expect(
      rejectsUnknownKey(QualifiedBktObservationSchema, observation, 'lessonId'),
      'QualifiedBktObservation has a lessonId field. Lessons have no BKT state of their own; ' +
        'a lesson-grain value is a derived rollup of its required member KCs.',
    ).toBe(true);
  });

  it('secondary KC mappings never become a BKT target', () => {
    const observation = qualifiedObservation(
      eligibleAuthoredBinding({ secondary_kc_mappings: ['ARCH-KC-SECONDARY'] }),
    );
    expect(observation.primaryKcId).toBe('ARCH-KC-PRIMARY');
    expect(JSON.stringify(observation)).not.toContain('ARCH-KC-SECONDARY');
    for (const key of ['secondaryKcMappings', 'secondaryKcRefs']) {
      expect(Object.keys(observation), `${key} reached the BKT observation.`).not.toContain(key);
    }
  });
});

// ---------------------------------------------------------------------------
// 6. Warrant and capability stay disjoint
// ---------------------------------------------------------------------------

describe('evidence warrant and BKT capability outputs stay disjoint', () => {
  it('an EvidenceRecord carries no capability estimate', () => {
    const { evidence } = adapt(eligibleAuthoredBinding());
    expect(evidence, 'the fixture produced no evidence record').not.toBeNull();
    for (const field of CAPABILITY_FIELDS) {
      expect(
        Object.keys(evidence as object),
        [
          `EvidenceRecord carries the capability field "${field}".`,
          '',
          'The evidence system owns the WARRANT and must not independently answer "is this',
          'learner mastered?". Two systems answering one question guarantees contradiction.',
        ].join('\n'),
      ).not.toContain(field);
    }

    // A capability value bolted on later must not survive validation either.
    for (const field of CAPABILITY_FIELDS) {
      const reparsed = EvidenceRecordSchema.parse({ ...(evidence as object), [field]: 0.99 });
      expect(
        Object.keys(reparsed),
        `EvidenceRecordSchema published "${field}" instead of discarding it.`,
      ).not.toContain(field);
    }
  });

  it('a QualifiedBktObservation carries no evidence rank, kind, or status', () => {
    const observation = qualifiedObservation(eligibleAuthoredBinding());
    for (const field of WARRANT_FIELDS) {
      expect(
        Object.keys(observation),
        `QualifiedBktObservation carries the warrant field "${field}". The BKT system must ` +
          'not read an evidence rank or status (contract §10, cross-system rules).',
      ).not.toContain(field);
      expect(
        rejectsUnknownKey(QualifiedBktObservationSchema, observation, field),
        `QualifiedBktObservationSchema has a field named "${field}".`,
      ).toBe(true);
    }
  });

  it('publishes no evidence rank as a capability estimate', () => {
    // Both terminal records exist and are non-empty, so the disjointness above
    // is a real separation and not two empty objects.
    const adaptation = adapt(eligibleAuthoredBinding());
    expect(Object.keys(adaptation.evidence as object).length).toBeGreaterThan(10);
    expect(Object.keys(qualifiedObservation(eligibleAuthoredBinding())).length).toBeGreaterThan(8);

    const evidenceKeys = new Set(Object.keys(adaptation.evidence as object));
    const bktKeys = new Set(Object.keys(qualifiedObservation(eligibleAuthoredBinding())));
    // `kind` and `independent` are the evidence system's verdict; neither may
    // cross into the capability input.
    for (const field of ['kind', 'independent']) {
      expect(evidenceKeys.has(field)).toBe(true);
      expect(bktKeys.has(field)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// 7. The local debug route is not registered in the deployed lambda
// ---------------------------------------------------------------------------

const LAMBDA_ROOT = 'services/lambdas/learner-api';
const LOCAL_AUTHORITY_PACKAGE = '@mcat/local-authority';

const lambdaManifest = (): Record<string, unknown> =>
  JSON.parse(readFileSync(join(root, LAMBDA_ROOT, 'package.json'), 'utf8')) as Record<
    string,
    unknown
  >;

const LAMBDA_SOURCES = productionSources([`${LAMBDA_ROOT}/src`]);

describe('the local debug route never reaches the deployed lambda', () => {
  it('reads a real route table and a real debug path, so the bans below mean something', () => {
    // Both halves of this guard were previously asserted only by a source comment
    // and a README. The invariant held by accident, because the lambda happened
    // not to list the dependency. These calibrations are what stop it from
    // silently becoming an accident again.
    expect(ROUTES.length).toBeGreaterThan(10);
    expect(typeof DEBUG_LEARNER_STATE_PATH).toBe('string');
    expect(DEBUG_LEARNER_STATE_PATH.startsWith('/')).toBe(true);
    expect(LAMBDA_SOURCES.length).toBeGreaterThan(3);
    expect(LAMBDA_SOURCES.map((file) => file.path)).toContain(`${LAMBDA_ROOT}/src/routes.ts`);
  });

  it('does not declare the local-authority package as a dependency', () => {
    const manifest = lambdaManifest();
    for (const field of [
      'dependencies',
      'devDependencies',
      'peerDependencies',
      'optionalDependencies',
    ]) {
      const declared = Object.keys((manifest[field] as Record<string, string> | undefined) ?? {});
      expect(
        declared,
        [
          `${LAMBDA_ROOT}/package.json declares ${LOCAL_AUTHORITY_PACKAGE} under "${field}".`,
          '',
          '@mcat/local-authority is the loopback development harness. It registers',
          `${DEBUG_LEARNER_STATE_PATH}, a read-only projection of a learner's mastery and`,
          'evidence state. It is guarded by an explicit opt-in plus a loopback peer check and',
          'is never deployed. The dependency direction is local-authority → learner-api, and',
          'only that way.',
        ].join('\n'),
      ).not.toContain(LOCAL_AUTHORITY_PACKAGE);
    }
  });

  it('does not import the local-authority package or its debug module', () => {
    const offenders = LAMBDA_SOURCES.filter(
      (file) =>
        importsWorkspacePackage(file, LOCAL_AUTHORITY_PACKAGE, 'services/local-authority') ||
        importTargets(file).some((target) => /(?:^|\/)debug-state(?:\.[cm]?[jt]s)?$/.test(target)),
    ).map((file) => file.path);
    expect(
      offenders,
      `The deployed lambda imports ${LOCAL_AUTHORITY_PACKAGE} or its debug-state module.`,
    ).toEqual([]);
  });

  it('registers no debug route in the deployed route table', () => {
    const registered = ROUTES.filter(
      (route) =>
        route.path === DEBUG_LEARNER_STATE_PATH ||
        route.path.includes(DEBUG_LEARNER_STATE_PATH) ||
        /(?:^|\/)debug(?:\/|$)/.test(route.path),
    ).map((route) => `${route.method} ${route.path} (${route.id})`);
    expect(
      registered,
      [
        'The deployed lambda route table registers a debug route.',
        '',
        `${DEBUG_LEARNER_STATE_PATH} exists only in services/local-authority, which binds`,
        'loopback and is never deployed. Its two guards — an explicit MCAT_LOCAL_DEBUG_STATE',
        'opt-in and a loopback remote address — do not exist in the Lambda, where every',
        'request arrives from an API Gateway address and no operator opted anything in.',
        'Registering it there publishes a learner-state projection to the internet.',
      ].join('\n'),
    ).toEqual([]);
  });

  it('does not mention the debug route path anywhere in the deployed source', () => {
    const offenders = LAMBDA_SOURCES.filter((file) =>
      file.text.includes(DEBUG_LEARNER_STATE_PATH),
    ).map((file) => file.path);
    expect(
      offenders,
      `The deployed lambda source names ${DEBUG_LEARNER_STATE_PATH}. Even unrouted, a handler ` +
        'branch on that path is one wiring change away from serving it.',
    ).toEqual([]);
  });

  it('keeps the debug projection out of the local-authority package surface', () => {
    // The README states the route is not exported from the package index; apps
    // depend on that index, so a re-export would put the route-registering module
    // into a shipped app's import graph.
    const index = readFileSync(join(root, 'services/local-authority/src/index.ts'), 'utf8');
    for (const forbidden of ['debug-state', 'http-server']) {
      expect(
        importSpecifiers(index).some((specifier) => specifier.includes(forbidden)),
        `services/local-authority/src/index.ts re-exports ./${forbidden}.`,
      ).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// 8. Doc-asserted rules nothing else enforced
// ---------------------------------------------------------------------------

describe('fail-closed rules the contract states and nothing else checked', () => {
  it('keeps BKT eligibility an allowlist, so a future evidence mode is ineligible by default', () => {
    const declared = new Set<string>(CandidateEvidenceModeSchema.options);
    for (const mode of BKT_ELIGIBLE_EVIDENCE_MODES) {
      expect(declared.has(mode), `${mode} is allowlisted but is not a declared mode.`).toBe(true);
    }
    expect(BKT_ELIGIBLE_EVIDENCE_MODES.length).toBeLessThan(declared.size);

    // A member added to the enum tomorrow must not become eligible by omission.
    // This is the denylist-vs-allowlist failure in its most direct form.
    expect(
      hasEligibleEvidenceMode({
        candidateEvidenceModes: ['A_MODE_ADDED_LATER' as CandidateEvidenceMode],
      }),
      'An unrecognised evidence mode was treated as BKT-eligible. Eligibility must be an ' +
        'ALLOWLIST: a denylist silently grants BKT access to every future enum member.',
    ).toBe(false);
    expect(hasEligibleEvidenceMode({ candidateEvidenceModes: ['INSTRUCTIONAL'] })).toBe(false);
    expect(hasEligibleEvidenceMode({ candidateEvidenceModes: ['INDEPENDENT'] })).toBe(true);
  });

  it('lets a mode move P(L) only if its evidence kind could fill a mastery recipe slot', () => {
    // Contract §15 named this as an open tension: five modes were eligible while
    // routing to contextual-only evidence, which would move pL on evidence that
    // can never satisfy a recipe. This ties the two lists together so they
    // cannot drift apart again.
    const clean = responseFacts();
    const everyConditionMet = { mixed: true, passage: true, timed: true, protected: true };
    for (const mode of CandidateEvidenceModeSchema.options) {
      const kind = deriveEvidenceKind([mode], clean, everyConditionMet);
      const eligible = hasEligibleEvidenceMode({ candidateEvidenceModes: [mode] });
      expect(
        eligible,
        [
          `${mode} declares BKT eligibility ${eligible} but routes to evidence kind "${kind}",`,
          `which is ${CONTEXTUAL_ONLY_KINDS.has(kind) ? '' : 'not '}contextual-only.`,
          '',
          'A mode that moves P(L) while producing evidence that can never fill a mastery',
          'recipe slot is incoherent: the capability estimate would rise on a warrant the',
          'evidence system refuses to count.',
        ].join('\n'),
      ).toBe(!CONTEXTUAL_ONLY_KINDS.has(kind));
    }
  });

  it('never lets a declared mode mint an administration condition the runner did not report', () => {
    // The declaration says what an item is ELIGIBLE to serve as. It says nothing
    // about how one attempt was actually run.
    const declaresEverything = eligibleAuthoredBinding({
      candidate_evidence_modes: ['MIXED', 'PASSAGE', 'TIMED', 'PROTECTED'],
      reasoning_operation: 'QUANTIFY',
    });
    const { evidence } = adapt(declaresEverything, responseFacts());
    expect(evidence?.conditions).toMatchObject({
      mixed: false,
      passage: false,
      timed: false,
      protected: false,
    });
    expect(
      evidence?.kind,
      'A binding that merely DECLARED timed/passage/mixed/protected was classified as such ' +
        'on an attempt the runner did not administer that way. Recipe slots key on `kind`, so ' +
        'that is author-manufactured warrant.',
    ).toBe('instruction');

    // Calibration: the same declaration DOES classify once the runner reports the
    // condition, so the assertion above is about the missing fact, not a dead path.
    const timedRun = adapt(
      eligibleAuthoredBinding({
        candidate_evidence_modes: ['TIMED'],
        reasoning_operation: 'QUANTIFY',
      }),
      responseFacts({ timedAdministration: true }),
    );
    expect(timedRun.evidence?.kind).toBe('timed');
    expect(timedRun.evidence?.conditions.timed).toBe(true);
  });

  it('never lets authored assistance affordances decide independence or qualification', () => {
    // An authored `assistance_state: "A0"` looks exactly like an AssistanceLevel
    // and is not one. Only the assistance the learner actually TOOK counts.
    // `assistance_available` is dropped from the first fixture because the
    // normalizer resolves the affordance aliases in preference order and would
    // otherwise never look at `assistance_state`.
    const { assistance_available: _unused, ...withoutAffordances } = eligibleAuthoredBinding();
    const authoredA0 = { ...withoutAffordances, assistance_state: 'A0' };
    const authoredA2 = eligibleAuthoredBinding({
      assistance_available: ['A2', 'VISIBLE_EXPLANATION'],
    });

    // The authored value reaches the binding — preserved for audit — but no
    // longer as something a later reader can parse back into an AssistanceLevel.
    const affordances = binding(authoredA0).authoredAssistanceAffordances;
    expect(affordances).toHaveLength(1);
    expect(affordances[0], 'the authored affordance was not preserved for audit').toContain('A0');
    for (const level of ['A0', 'A1', 'A2', 'A3']) {
      expect(
        affordances,
        `authoredAssistanceAffordances carries the bare AssistanceLevel "${level}". An ` +
          'affordance that is spelled exactly like the runtime fact invites the two being ' +
          'conflated again, which is how an assisted attempt became fake independent evidence.',
      ).not.toContain(level);
    }

    const assisted = responseFacts({ assistanceLevel: 'A2' });
    for (const raw of [authoredA0, authoredA2]) {
      const adaptation = adapt(raw, assisted);
      expect(adaptation.evidence?.independent, 'authored affordances changed independence').toBe(
        false,
      );
      expect(adaptation.qualification.status).toBe('rejected');
      if (adaptation.qualification.status === 'rejected') {
        expect(adaptation.qualification.rejectionCodes).toContain('ASSISTANCE_NOT_A0');
      }
    }

    // The same two bindings on a clean A0 attempt both qualify: the authored
    // string neither grants nor withholds anything.
    for (const raw of [authoredA0, authoredA2]) {
      const adaptation = adapt(raw, responseFacts());
      expect(adaptation.evidence?.independent).toBe(true);
      expect(adaptation.qualification.status).toBe('qualified');
    }

    // And independence is a pure function of the response, with no binding input.
    expect(isIndependentAdministration(responseFacts())).toBe(true);
    expect(isIndependentAdministration(responseFacts({ revealUsed: true }))).toBe(false);
  });

  it('bounds the runner-reported time by the server clock before it becomes warrant', () => {
    // A client-controlled timestamp was the decay clock once and the freshness
    // clock once. A future-dated occurrence sits inside every freshness window
    // forever.
    const future = '2099-01-01T00:00:00.000Z';
    const { evidence } = adapt(eligibleAuthoredBinding(), responseFacts({ occurredAt: future }));
    expect(
      evidence?.occurredAt,
      'EvidenceRecord.occurredAt took the runner-reported time verbatim. It must be bounded ' +
        "by the server's acceptedAt ceiling.",
    ).toBe(ACCEPTED_AT);

    // Calibration: an in-range report is preserved, so the bound is a ceiling and
    // not a blanket overwrite.
    const inRange = adapt(eligibleAuthoredBinding(), responseFacts());
    expect(inRange.evidence?.occurredAt).toBe(OCCURRED_AT);
  });

  it('treats an omission as a scored outcome rather than a scoring failure', () => {
    // §5.2: dropping a clean independent first attempt that produced no answer
    // would put survivorship bias straight into P(L).
    expect(BKT_QUALIFICATION_REJECTION_CODES).not.toContain('OMITTED');

    const omitted = responseFacts({
      omitted: true,
      response: { kind: 'MULTIPLE_CHOICE', chosenChoiceId: null },
    });
    const adaptation = adapt(eligibleAuthoredBinding(), omitted, {
      scoringValid: true,
      serverItemVersion: 4,
      outcome: 'omitted',
      protectedScoring: false,
    });
    expect(adaptation.evidence?.outcome).toBe('omitted');
    expect(adaptation.qualification.status).toBe('qualified');
    if (adaptation.qualification.status === 'qualified') {
      expect(adaptation.qualification.observation.correct).toBe(false);
    }
  });

  it('produces no evidence and no BKT output when server scoring does not resolve', () => {
    const adaptation = adapt(eligibleAuthoredBinding(), responseFacts(), { scoringValid: false });
    expect(adaptation.evidence).toBeNull();
    expect(adaptation.qualification.status).toBe('rejected');
    if (adaptation.qualification.status === 'rejected') {
      expect(adaptation.qualification.rejectionCodes).toContain('SERVER_SCORING_INVALID');
    }
    // Fails closed to `omitted` rather than guessing correctness.
    expect(adaptation.observation?.outcome).toBe('omitted');
    expect(adaptation.observation?.serverItemVersion).toBeUndefined();
  });

  it('collects every reason a response did not move P(L) instead of short-circuiting', () => {
    // §5.3: every rejection must be recorded, so the audit trail explains the
    // whole refusal. A first-code-wins implementation hides the rest.
    const adaptation = adapt(
      authoredBinding(),
      responseFacts({
        attemptIndex: 3,
        isRetry: true,
        assistanceLevel: 'A2',
        contentBearingHintUsed: true,
        revealUsed: true,
      }),
    );
    expect(adaptation.qualification.status).toBe('rejected');
    if (adaptation.qualification.status === 'rejected') {
      expect(adaptation.qualification.rejectionCodes).toEqual(
        expect.arrayContaining([
          'INDEPENDENT_EVIDENCE_MODE_NOT_DECLARED',
          'NOT_FIRST_ATTEMPT',
          'ASSISTANCE_NOT_A0',
          'CONTENT_BEARING_HINT_USED',
          'REVEAL_USED',
          'RETRY_USED',
        ]),
      );
      for (const code of adaptation.qualification.rejectionCodes) {
        expect(BKT_QUALIFICATION_REJECTION_CODES).toContain(code);
      }
    }
  });
});
