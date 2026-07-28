import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, posix, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  EventIdSchema,
  IdempotencyKeySchema,
  LearnerIdSchema,
} from '../../packages/contracts/src/ids';
import { fixedClock, UtcTimestampSchema } from '../../packages/contracts/src/time';
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
import * as masteryViews from '../../packages/contracts/src/mastery';
import * as learnerViews from '../../packages/contracts/src/learner-views';
import {
  CONTEXTUAL_ONLY_KINDS,
  EvidenceRecordSchema,
  type EvidenceKind,
} from '../../packages/domain/src/evidence';
import {
  adaptLessonResponse,
  isIndependentAdministration,
  parseAuthoredLessonBinding,
  unrecognizedAuthoredBindingKeys,
  type LessonResponseAdaptation,
  type ServerScoringResolution,
} from '../../packages/domain/src/lesson-response-adapter';
import {
  Authority,
  BKT_OBSERVATION_FUTURE_SKEW_TOLERANCE_MS,
  BKT_OBSERVATION_PAST_SKEW_TOLERANCE_MS,
  UnresolvedWarrantGrainError,
} from '../../packages/authority-core/src/authority';
import { loadSyntheticBank, orderedKcsForLesson } from '@mcat/content';
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

/**
 * The lesson corpus the seam is measured against, and where each artifact lives.
 *
 * TWO OF THE THREE ARE OUTSIDE THE REPOSITORY. `V3-LES-789208` and
 * `V3-LES-844372` are authoring drafts under the workspace's sibling `research/`
 * tree, which is not part of `mcat-prep` and is absent from a clean checkout of
 * it. `v3-lesson-binding-conformance.test.ts` reads the same two, so a checkout
 * without them measures 42 bindings instead of 115 and every per-lesson
 * conformance assertion simply stops existing.
 *
 * That is why absence is a LOUD, NAMED failure below rather than a skip: a
 * silently smaller corpus is indistinguishable from a passing one, which is the
 * exact defect shape this suite exists to catch. Point `MCAT_LESSON_DRAFTS_DIR`
 * at a checkout of the drafts tree to satisfy it elsewhere.
 */
const LESSON_DRAFTS_ENV_VAR = 'MCAT_LESSON_DRAFTS_DIR';

const LESSON_SCRIPT_SEARCH_ROOTS: readonly { readonly label: string; readonly path: string }[] = [
  { label: 'in-repo lesson content', path: join(root, 'content', 'lessons') },
  {
    label: `${LESSON_DRAFTS_ENV_VAR} override`,
    path: process.env[LESSON_DRAFTS_ENV_VAR] ?? '',
  },
  {
    // Repo-relative escape, stated once and named, rather than spread through
    // the assertions as a bare `join(root, '..')`.
    label: 'workspace sibling research/ drafts tree (OUTSIDE this repository)',
    path: join(
      root,
      '..',
      'research',
      'mcat-curriculum-architecture-v3',
      'lesson-authoring-drafts',
    ),
  },
];

/** Expected corpus: `id → binding count`. 42 + 40 + 33 = 115. */
const EXPECTED_LESSON_BINDINGS: Readonly<Record<string, number>> = {
  'V3-LES-130923': 42,
  'V3-LES-789208': 40,
  'V3-LES-844372': 33,
};

const EXPECTED_TOTAL_BINDINGS = 115;

interface DiscoveredLesson {
  readonly id: string;
  readonly bindingCount: number;
  /** Which search root it came from, for the failure message. */
  readonly source: string;
  readonly path: string;
}

function discoverLessons(): readonly DiscoveredLesson[] {
  const found = new Map<string, DiscoveredLesson>();

  for (const searchRoot of LESSON_SCRIPT_SEARCH_ROOTS) {
    if (searchRoot.path.length === 0 || !existsSync(searchRoot.path)) continue;
    const scripts: string[] = [];
    const collect = (absolute: string): void => {
      for (const entry of readdirSync(absolute, { withFileTypes: true })) {
        const child = join(absolute, entry.name);
        if (entry.isDirectory()) {
          if (!SKIPPED_DIRECTORIES.has(entry.name)) collect(child);
        } else if (entry.name === 'lesson-script.json') scripts.push(child);
      }
    };
    collect(searchRoot.path);

    for (const script of scripts) {
      const parsed: unknown = JSON.parse(readFileSync(script, 'utf8'));
      const payload =
        typeof parsed === 'object' && parsed !== null
          ? (parsed as Record<string, unknown>).payload
          : undefined;
      const record =
        typeof payload === 'object' && payload !== null
          ? (payload as Record<string, unknown>)
          : undefined;
      const id = record?.lesson_id;
      if (typeof id !== 'string' || id.length === 0 || found.has(id)) continue;
      found.set(id, {
        id,
        bindingCount: Array.isArray(record?.question_evidence_plan)
          ? record.question_evidence_plan.length
          : 0,
        source: searchRoot.label,
        path: script,
      });
    }
  }

  return [...found.values()].sort((left, right) => left.id.localeCompare(right.id));
}

const DISCOVERED_LESSONS = discoverLessons();

/**
 * Identifiers that name one particular lesson. Real ids look like
 * `V3-LES-130923`; the friendly route slug and the synthetic dev lesson are the
 * other two spellings that have been branched on before.
 *
 * The hard-coded shapes carry the assertion on their own, so the discovered ids
 * below only ever ADD coverage — the genericity check never weakens when the
 * out-of-repo drafts are missing, and the corpus test says so out loud.
 */
const LESSON_SPECIFIC_PATTERNS: readonly RegExp[] = [
  /V3-LES-\d+/,
  /V3-KC-\d+/,
  /vectors-and-trigonometry/,
  /lesson-enz-inhibition/,
  ...DISCOVERED_LESSONS.map(
    (lesson) => new RegExp(lesson.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
  ),
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
  });

  it('resolves the whole three-lesson corpus, or names exactly which lesson is missing', () => {
    const expectedIds = Object.keys(EXPECTED_LESSON_BINDINGS).sort();
    const byId = new Map(DISCOVERED_LESSONS.map((lesson) => [lesson.id, lesson]));
    const missing = expectedIds.filter((id) => !byId.has(id));

    expect(
      missing,
      [
        `The lesson corpus is incomplete: ${missing.join(', ')} could not be found.`,
        '',
        'Two of the three lessons live OUTSIDE this repository, in the workspace sibling',
        '`research/mcat-curriculum-architecture-v3/lesson-authoring-drafts/`, so a clean',
        'checkout of mcat-prep alone does not contain them. Roots searched, in order:',
        ...LESSON_SCRIPT_SEARCH_ROOTS.map(
          (searchRoot) =>
            `  ${searchRoot.path.length === 0 ? '(unset)' : searchRoot.path}  — ${searchRoot.label}`,
        ),
        '',
        `Set ${LESSON_DRAFTS_ENV_VAR} to a checkout of the drafts tree, or vendor the two`,
        'artifacts into `content/lessons/`.',
        '',
        'This fails loudly instead of skipping ON PURPOSE.',
        '`v3-lesson-binding-conformance.test.ts` discovers the same artifacts, so without',
        `them it silently measures ${EXPECTED_LESSON_BINDINGS['V3-LES-130923']} bindings`,
        `instead of ${EXPECTED_TOTAL_BINDINGS} and its per-lesson assertions stop existing`,
        'altogether — a suite that passes because it stopped looking, which is the exact',
        'failure mode this file was written to prevent.',
      ].join('\n'),
    ).toEqual([]);

    // The corpus size the seam is measured against. Pinned because the
    // conformance suite's own floor (115) is only meaningful if these three
    // artifacts are the ones supplying it.
    for (const [id, bindings] of Object.entries(EXPECTED_LESSON_BINDINGS)) {
      const lesson = byId.get(id);
      expect(
        lesson?.bindingCount,
        `${id} yielded ${lesson?.bindingCount} bindings, expected ${bindings} ` +
          `(resolved from ${lesson?.source ?? 'nowhere'}).`,
      ).toBe(bindings);
    }
    expect(
      DISCOVERED_LESSONS.reduce((sum, lesson) => sum + lesson.bindingCount, 0),
    ).toBeGreaterThanOrEqual(EXPECTED_TOTAL_BINDINGS);
    expect(DISCOVERED_LESSONS.map((lesson) => lesson.id)).toEqual(
      expect.arrayContaining(expectedIds),
    );
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

/**
 * Capability vocabulary: BKT's alone.
 *
 * `reviewDue` is here and `refreshNeeded` is NOT. They are two different facts
 * that were spelled with one word: "this memory has decayed below the review
 * line" is BKT's, and "the warrant behind this grain has gone stale" is the
 * evidence system's. One name for both would let the future planner take a
 * single input where it must weigh two.
 */
const CAPABILITY_FIELDS = [
  'pL',
  'mastered',
  'masteryThreshold',
  'halfLifeDays',
  'reviewDue',
  'lastPracticedAt',
  'decayRate',
  'priorPL',
] as const;

/** Warrant vocabulary: the evidence system's alone. `refreshNeeded` belongs here. */
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
  'refreshNeeded',
  'supportingEvidenceIds',
  'freshestByKind',
] as const;

/**
 * Both spellings of "needs attention again". The delivery surface carries
 * neither, whichever authority a given name currently belongs to.
 */
const DUE_FLAG_NAMES = ['reviewDue', 'refreshNeeded'] as const;

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
      for (const field of [...CAPABILITY_FIELDS, ...DUE_FLAG_NAMES]) {
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

/**
 * The learner-facing VIEW types, discovered from the two contract modules rather
 * than listed, so a new view is classified the day it lands.
 */
interface ViewShape {
  readonly name: string;
  readonly keys: readonly string[];
}

function contractViewShapes(): readonly ViewShape[] {
  const shapes: ViewShape[] = [];
  for (const [moduleName, module] of [
    ['contracts/src/mastery.ts', masteryViews],
    ['contracts/src/learner-views.ts', learnerViews],
  ] as const) {
    for (const [exportName, value] of Object.entries(module as Record<string, unknown>)) {
      if (!exportName.endsWith('Schema') || typeof value !== 'object' || value === null) continue;
      const shape = (value as { shape?: unknown }).shape;
      if (typeof shape !== 'object' || shape === null) continue;
      const keys = Object.keys(shape as Record<string, unknown>);
      if (keys.length > 0) shapes.push({ name: `${moduleName} ${exportName}`, keys });
    }
  }
  return shapes;
}

/** A view makes a CAPABILITY claim if it publishes a probability or the cut. */
const CAPABILITY_VIEW_MARKERS = ['pL', 'mastered'] as const;

/** A view reports the WARRANT if it publishes evidence provenance. */
const WARRANT_VIEW_MARKERS = ['supportingEvidenceIds', 'freshestByKind', 'reasons'] as const;

/**
 * Field names that legitimately appear on both sides. Every one is identity or
 * provenance — WHICH grain and under WHICH policy — never a finding about it.
 */
const SHARED_VIEW_IDENTITY_FIELDS: ReadonlySet<string> = new Set([
  'skillId',
  'lessonId',
  'operation',
  'cluster',
  'title',
  'policyVersion',
]);

/**
 * Names permitted to straddle the boundary. EMPTY, and it should stay that way.
 *
 * `refreshNeeded` used to sit here: it meant BKT decay on `SkillMasteryView` /
 * `LessonMasteryView` and evidence staleness on `MasteryMapEntry` /
 * `SessionSummary`, so a planner reading "does this need attention again?" got
 * one field where two different authorities were answering. The BKT side is now
 * `reviewDue` and `refreshNeeded` belongs to the warrant alone.
 *
 * An entry here must be a LIVE straddle: the check below fails if one stops
 * straddling, so a resolved exemption cannot linger as cover for the next one.
 */
const ALLOWED_STRADDLING_VIEW_FIELDS: readonly string[] = [];

describe('evidence warrant and BKT capability outputs stay disjoint', () => {
  it('no view type both claims capability and reports the warrant', () => {
    const shapes = contractViewShapes();
    expect(
      shapes.length,
      'No contract view schemas were discovered, so the classification below is vacuous.',
    ).toBeGreaterThan(5);

    const capability = shapes.filter((shape) =>
      CAPABILITY_VIEW_MARKERS.some((marker) => shape.keys.includes(marker)),
    );
    const warrant = shapes.filter((shape) =>
      WARRANT_VIEW_MARKERS.some((marker) => shape.keys.includes(marker)),
    );
    // Anti-vacuity: both sides must actually be populated, or "disjoint" is
    // true because one of them is empty.
    expect(capability.length, 'no capability-bearing view found').toBeGreaterThanOrEqual(2);
    expect(warrant.length, 'no warrant-bearing view found').toBeGreaterThanOrEqual(2);

    const both = capability.filter((shape) => warrant.includes(shape)).map((shape) => shape.name);
    expect(
      both,
      [
        'A single view type publishes BOTH a capability estimate and the evidence warrant.',
        '',
        'BKT owns capability (`pL`, decay, review-due, the 0.95 cut); the evidence system',
        'owns the warrant (which recipe slots are filled, how fresh, what is missing). A',
        'view that carries both invites a consumer to read the warrant as attainment — which',
        'is what happened to the ordinal `base` tier, and to `masteryState` before it.',
        '',
        'Publish two views, or publish the capability claim alone.',
      ].join('\n'),
    ).toEqual([]);
  });

  it('no field name means capability on one view and warrant on another', () => {
    const shapes = contractViewShapes();
    const capabilityKeys = new Set(
      shapes
        .filter((shape) => CAPABILITY_VIEW_MARKERS.some((marker) => shape.keys.includes(marker)))
        .flatMap((shape) => shape.keys),
    );
    const warrantKeys = new Set(
      shapes
        .filter((shape) => WARRANT_VIEW_MARKERS.some((marker) => shape.keys.includes(marker)))
        .flatMap((shape) => shape.keys),
    );
    expect(capabilityKeys.size).toBeGreaterThan(2);
    expect(warrantKeys.size).toBeGreaterThan(2);

    const straddling = [...capabilityKeys]
      .filter((key) => warrantKeys.has(key))
      .filter((key) => !SHARED_VIEW_IDENTITY_FIELDS.has(key))
      .sort();

    // The invariant is asserted on the CONCEPT, not on a spelling: whatever the
    // BKT decay flag ends up called, it must not be the same identifier the
    // warrant staleness flag uses.
    const unexpected = straddling.filter((key) => !ALLOWED_STRADDLING_VIEW_FIELDS.includes(key));
    expect(
      unexpected,
      [
        `Field name(s) ${unexpected.join(', ')} mean one thing on a capability view and`,
        'another on a warrant view.',
        '',
        '"This memory has decayed below the review line" and "the warrant behind this grain',
        'has gone stale" are two different facts with two different owners. Spelled with one',
        'word, the future planner takes one input where it has to weigh two, and neither',
        'authority can be held to its own answer. That is what `refreshNeeded` was before the',
        'BKT side became `reviewDue`.',
        '',
        'Give the capability side and the warrant side different names. If the field is pure',
        'identity or provenance, add it to SHARED_VIEW_IDENTITY_FIELDS with a reason.',
      ].join('\n'),
    ).toEqual([]);

    // An exemption must still describe reality. A resolved straddle left in the
    // allowlist is cover for the next one, so it has to be deleted, not kept.
    for (const allowed of ALLOWED_STRADDLING_VIEW_FIELDS) {
      expect(
        straddling,
        `ALLOWED_STRADDLING_VIEW_FIELDS exempts "${allowed}", which no longer straddles the ` +
          'capability/warrant boundary. Delete the entry.',
      ).toContain(allowed);
    }
  });

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

// ---------------------------------------------------------------------------
// 8a. ONE notion of BKT eligibility: the two derivations cannot disagree
// ---------------------------------------------------------------------------

/**
 * The invariant this section exists for, and the reason it is written as a
 * biconditional over a full cross product rather than as two separate checks.
 *
 * One attempt produces two outputs that both answer "did this establish
 * capability?": the `EvidenceRecord.kind` (which a mastery recipe accepts or
 * refuses) and the BKT qualification verdict (which decides whether `P(L)`
 * moves). They were derived independently — the verdict from whether the
 * DECLARED mode set intersected an allowlist, the kind from what the attempt
 * actually established, least-credit-first and gated on the administration facts.
 * Only the second was honest, and only the first decided `P(L)`.
 *
 * The defect lived exactly in the gap between two assertions that each watched
 * one output. Testing each output separately does not test that they agree, so
 * the assertion here is their AGREEMENT:
 *
 *   qualified  ⟺  the resolved evidence kind is not contextual-only
 *
 * Two reachable forms, neither needing hostile input:
 *
 *  F1. An ineligible mode winning least-credit alongside an eligible one —
 *      `[ENTRY, INDEPENDENT]`, `[DIAGNOSTIC, TIMED]` and 40 others — with every
 *      administration condition satisfied.
 *  F2. Any administration-gated mode (`MIXED`, `PASSAGE`, `TIMED`, `PROTECTED`)
 *      when the runner HONESTLY reported its condition as false.
 *
 * Neither is reachable one mode at a time under all-conditions-met, which is why
 * the old single-mode loop passed while `P(L)` ramped to 0.99999 on zero
 * mastery-eligible records.
 */

const MODE_OPTIONS: readonly CandidateEvidenceMode[] = CandidateEvidenceModeSchema.options;

/** Every declaration of length 1 and every ORDERED pair: 13 + 156 = 169. */
function modeDeclarations(): readonly (readonly CandidateEvidenceMode[])[] {
  const declarations: (readonly CandidateEvidenceMode[])[] = MODE_OPTIONS.map((mode) => [mode]);
  for (const first of MODE_OPTIONS) {
    for (const second of MODE_OPTIONS) {
      // Ordered, not unordered: least-credit-first must not depend on the order
      // an author happened to write the modes in, and asserting that requires
      // seeing both orders.
      if (first !== second) declarations.push([first, second]);
    }
  }
  return declarations;
}

interface AdministrationSetting {
  readonly mixed: boolean;
  readonly passage: boolean;
  readonly timed: boolean;
  readonly protected: boolean;
}

/** All 16 combinations, so every gated mode is seen both met and honestly unmet. */
function administrationSettings(): readonly AdministrationSetting[] {
  const settings: AdministrationSetting[] = [];
  for (const mixed of [false, true]) {
    for (const passage of [false, true]) {
      for (const timed of [false, true]) {
        for (const protectedScoring of [false, true]) {
          settings.push({ mixed, passage, timed, protected: protectedScoring });
        }
      }
    }
  }
  return settings;
}

const MODE_DECLARATIONS = modeDeclarations();
const ADMINISTRATION_SETTINGS = administrationSettings();

/** Which of the 13 modes the declared allowlist accepts, and which it does not. */
const ELIGIBLE_MODES = MODE_OPTIONS.filter((mode) =>
  hasEligibleEvidenceMode({ candidateEvidenceModes: [mode] }),
);
const INELIGIBLE_MODES = MODE_OPTIONS.filter((mode) => !ELIGIBLE_MODES.includes(mode));

/** Modes whose evidence kind is only earned if the runner reported the condition. */
const ADMINISTRATION_GATED_MODES = ['MIXED', 'PASSAGE', 'TIMED', 'PROTECTED'] as const;

interface SweepCase {
  readonly declaration: readonly CandidateEvidenceMode[];
  readonly setting: AdministrationSetting;
  /** `null` when no evidence record was produced at all — a finding, not a skip. */
  readonly kind: EvidenceKind | null;
  readonly contextualOnly: boolean;
  readonly qualified: boolean;
  readonly rejectionCodes: readonly string[];
  readonly conditions: AdministrationSetting | null;
  readonly declaresEligibleMode: boolean;
}

/**
 * One adaptation per (declaration × administration setting), on an otherwise
 * clean independent first attempt with a `reasoningOperation` present — so the
 * ONLY thing that can differ between cases is what the attempt established.
 */
function runEligibilitySweep(): readonly SweepCase[] {
  const cases: SweepCase[] = [];
  for (const declaration of MODE_DECLARATIONS) {
    // Parsed once per declaration and reused across the 16 settings: the binding
    // is author-time and cannot vary with how one attempt was administered.
    const parsed = binding(
      eligibleAuthoredBinding({
        candidate_evidence_modes: [...declaration],
        reasoning_operation: 'IDENTIFY',
      }),
    );
    for (const setting of ADMINISTRATION_SETTINGS) {
      const adaptation = adaptLessonResponse({
        binding: parsed,
        response: responseFacts({
          mixedAdministration: setting.mixed,
          passageAdministration: setting.passage,
          timedAdministration: setting.timed,
        }),
        scoring: {
          scoringValid: true,
          serverItemVersion: 4,
          outcome: 'correct',
          // The only condition the runner does not own: the server's scoring
          // authority reports whether it scored this as a protected, unseen item.
          protectedScoring: setting.protected,
        },
        identity: {
          observationId: '9c0ffee0-0000-4000-8000-00000000c001',
          eventId: EventIdSchema.parse('9c0ffee0-0000-4000-8000-00000000c002'),
          learnerId: LearnerIdSchema.parse('9c0ffee0-0000-4000-8000-00000000c003'),
          idempotencyKey: IdempotencyKeySchema.parse('9c0ffee0-0000-4000-8000-00000000c004'),
          evidenceId: '9c0ffee0-0000-4000-8000-00000000c005',
        },
        cluster: 'R1',
        envelopeBindingVersion: ARTIFACT_VERSION,
        acceptedAt: UtcTimestampSchema.parse(ACCEPTED_AT),
        sequence: 1,
        contentRelease: 'arch-fixture-release',
        policies: [],
      });

      // A missing evidence record is RECORDED, not thrown: scoring is valid in
      // every case here, so its absence is a finding a named assertion should
      // report rather than a collection-time crash with no test attached.
      const evidence = adaptation.evidence;
      cases.push({
        declaration,
        setting,
        kind: evidence?.kind ?? null,
        contextualOnly: evidence === null ? true : CONTEXTUAL_ONLY_KINDS.has(evidence.kind),
        qualified: adaptation.qualification.status === 'qualified',
        rejectionCodes:
          adaptation.qualification.status === 'rejected'
            ? adaptation.qualification.rejectionCodes
            : [],
        conditions:
          evidence === null
            ? null
            : {
                mixed: evidence.conditions.mixed,
                passage: evidence.conditions.passage,
                timed: evidence.conditions.timed,
                protected: evidence.conditions.protected,
              },
        declaresEligibleMode: hasEligibleEvidenceMode({ candidateEvidenceModes: declaration }),
      });
    }
  }
  return cases;
}

/**
 * Computed on first use rather than at module load, so a defect that makes the
 * sweep unrepresentable fails a named test instead of breaking collection for
 * the whole file.
 */
let eligibilitySweep: readonly SweepCase[] | undefined;
const sweep = (): readonly SweepCase[] => (eligibilitySweep ??= runEligibilitySweep());

const describeCase = (sweepCase: SweepCase): string =>
  `[${sweepCase.declaration.join(', ')}] under ` +
  `{mixed:${sweepCase.setting.mixed}, passage:${sweepCase.setting.passage}, ` +
  `timed:${sweepCase.setting.timed}, protected:${sweepCase.setting.protected}}`;

/** The two frozen codes that may name a refusal the kind gate decided. */
const CONTEXTUAL_ONLY_REFUSAL_CODES = [
  'RESOLVED_EVIDENCE_KIND_CONTEXTUAL_ONLY',
  'INDEPENDENT_EVIDENCE_MODE_NOT_DECLARED',
] as const;

describe('BKT qualification and the evidence kind cannot disagree', () => {
  it('covers every one- and two-mode declaration under every administration setting', () => {
    // Coverage is asserted, not asserted-about: a sweep that silently stopped
    // enumerating would make every assertion below pass on a handful of cases.
    const modeCount = MODE_OPTIONS.length;
    const orderedPairs = MODE_DECLARATIONS.filter((declaration) => declaration.length === 2);
    const unordered = new Set(orderedPairs.map((pair) => [...pair].sort().join('+')));

    expect(modeCount).toBeGreaterThanOrEqual(13);
    expect(MODE_DECLARATIONS).toHaveLength(modeCount + modeCount * (modeCount - 1));
    expect(orderedPairs).toHaveLength(modeCount * (modeCount - 1));
    expect(unordered.size).toBe((modeCount * (modeCount - 1)) / 2);
    expect(ADMINISTRATION_SETTINGS).toHaveLength(16);
    expect(sweep()).toHaveLength(MODE_DECLARATIONS.length * 16);

    // Both outcomes must occur, or the biconditional is satisfied by a constant.
    expect(sweep().some((sweepCase) => sweepCase.qualified)).toBe(true);
    expect(sweep().some((sweepCase) => !sweepCase.qualified)).toBe(true);
  });

  it('produces an evidence record for every case, so nothing is compared against nothing', () => {
    const withoutEvidence = sweep()
      .filter((sweepCase) => sweepCase.kind === null)
      .map(describeCase);
    expect(
      withoutEvidence.slice(0, 12),
      [
        `${withoutEvidence.length} cases produced NO evidence record.`,
        '',
        'Server scoring resolves in every case here, and a valid resolution is the only',
        'condition that may suppress the record (contract §5.2). Suppressing it for any other',
        'reason — a rejection short-circuit, say — throws away the warrant for a response the',
        'server accepted, and leaves the consistency assertions below with one output to',
        'compare instead of two.',
      ].join('\n'),
    ).toEqual([]);
  });

  it('qualifies for BKT exactly when the resolved evidence kind is not contextual-only', () => {
    const disagreements = sweep()
      .filter((sweepCase) => sweepCase.qualified === sweepCase.contextualOnly)
      .map(
        (sweepCase) =>
          `${describeCase(sweepCase)} resolved kind "${sweepCase.kind}" ` +
          `(contextual-only: ${sweepCase.contextualOnly}) but qualification was ` +
          `${sweepCase.qualified ? 'QUALIFIED' : `rejected [${sweepCase.rejectionCodes.join(', ')}]`}`,
      );

    expect(
      disagreements.slice(0, 12),
      [
        `${disagreements.length} of ${sweep().length} cases have the evidence record`,
        'and the BKT gate disagreeing about one attempt.',
        '',
        'These are the two derivations of a single fact. When they diverge, `P(L)` moves on a',
        'warrant no mastery recipe would accept — the learner is shown mastered with every',
        'recipe slot still open, and the rejection code list is empty so nothing looks wrong.',
        '',
        'The fix is not to make the second derivation agree with the first. It is to have ONE',
        'derivation: resolve the evidence kind once, gate BKT on',
        '`CONTEXTUAL_ONLY_KINDS.has(resolvedKind)`, and let the evidence record read the same',
        'value. A declared mode set states what an item is ELIGIBLE TO SERVE AS and is never a',
        'finding about an attempt, so it must not gate here.',
      ].join('\n'),
    ).toEqual([]);
  });

  it('names every contextual-only refusal with a frozen code and nothing else', () => {
    const wrong = sweep()
      .filter((sweepCase) => sweepCase.contextualOnly)
      .filter(
        (sweepCase) =>
          sweepCase.rejectionCodes.length !== 1 ||
          !CONTEXTUAL_ONLY_REFUSAL_CODES.includes(
            sweepCase.rejectionCodes[0] as (typeof CONTEXTUAL_ONLY_REFUSAL_CODES)[number],
          ),
      )
      .map(
        (sweepCase) =>
          `${describeCase(sweepCase)} → [${sweepCase.rejectionCodes.join(', ')}] for kind "${sweepCase.kind}"`,
      );
    expect(
      wrong.slice(0, 12),
      'A contextual-only resolution refused BKT without naming exactly one of ' +
        `${CONTEXTUAL_ONLY_REFUSAL_CODES.join(' / ')}. Everything else about these attempts is ` +
        'clean, so any other code — or an empty list — is an audit trail that does not explain ' +
        'why P(L) did not move.',
    ).toEqual([]);

    for (const code of CONTEXTUAL_ONLY_REFUSAL_CODES) {
      expect(BKT_QUALIFICATION_REJECTION_CODES, `${code} is not a frozen code.`).toContain(code);
    }
  });

  it('reaches the F1 form: an eligible declaration resolving to contextual-only', () => {
    // Every ineligible mode precedes every eligible one in the conservative
    // least-credit order, so an {ineligible, eligible} pair always resolves to the
    // ineligible one's kind while still declaring an allowlisted mode. That is
    // the whole F1 space, and it is only visible with TWO modes.
    const everyConditionMet = sweep().filter(
      (sweepCase) =>
        sweepCase.setting.mixed &&
        sweepCase.setting.passage &&
        sweepCase.setting.timed &&
        sweepCase.setting.protected,
    );
    const f1 = everyConditionMet.filter(
      (sweepCase) => sweepCase.declaresEligibleMode && sweepCase.contextualOnly,
    );
    const f1Unordered = new Set(f1.map((sweepCase) => [...sweepCase.declaration].sort().join('+')));

    expect(ELIGIBLE_MODES.length).toBeGreaterThan(0);
    expect(INELIGIBLE_MODES.length).toBeGreaterThan(0);
    expect(
      f1Unordered.size,
      'The sweep no longer reaches the F1 input space, so its verdict below proves nothing. ' +
        'Expected every {ineligible, eligible} pair to declare an allowlisted mode and still ' +
        'resolve contextual-only.',
    ).toBe(INELIGIBLE_MODES.length * ELIGIBLE_MODES.length);

    expect(
      f1
        .filter((sweepCase) => sweepCase.qualified)
        .map(describeCase)
        .slice(0, 12),
      'A declaration containing an allowlisted mode moved P(L) while resolving to a ' +
        'contextual-only kind. This is the original defect: the declared set said yes and the ' +
        'resolved kind said no, and the declared set won.',
    ).toEqual([]);
  });

  it('reaches the F2 form: a gated mode whose condition the runner honestly reported false', () => {
    const gateFor: Readonly<Record<string, keyof AdministrationSetting>> = {
      MIXED: 'mixed',
      PASSAGE: 'passage',
      TIMED: 'timed',
      PROTECTED: 'protected',
    };
    const failures: string[] = [];
    for (const mode of ADMINISTRATION_GATED_MODES) {
      const gate = gateFor[mode] as keyof AdministrationSetting;
      const honestlyUnmet = sweep().filter(
        (sweepCase) =>
          sweepCase.declaration.length === 1 &&
          sweepCase.declaration[0] === mode &&
          !sweepCase.setting[gate],
      );
      if (honestlyUnmet.length === 0) {
        failures.push(`${mode}: the sweep never ran it with ${gate} false`);
        continue;
      }
      for (const sweepCase of honestlyUnmet) {
        if (sweepCase.qualified) {
          failures.push(`${describeCase(sweepCase)} qualified for BKT although ${gate} was false`);
        }
        if (!sweepCase.contextualOnly) {
          failures.push(
            `${describeCase(sweepCase)} resolved to non-contextual kind "${sweepCase.kind}" ` +
              `although ${gate} was false`,
          );
        }
      }
      // Calibration: the same declaration DOES earn its kind once the condition
      // is met, so the refusals above are about the missing fact.
      const met = sweep().filter(
        (sweepCase) =>
          sweepCase.declaration.length === 1 &&
          sweepCase.declaration[0] === mode &&
          sweepCase.setting[gate],
      );
      if (!met.some((sweepCase) => sweepCase.qualified)) {
        failures.push(
          `${mode}: never qualified even with ${gate} true — the gate is dead, not strict`,
        );
      }
    }
    expect(
      failures.slice(0, 12),
      'An administration-gated mode was credited on an attempt the runner did not administer ' +
        'that way. No hostile input is needed for this: a runner reporting `timed: false` ' +
        'honestly was enough to move P(L) on a `TIMED` declaration.',
    ).toEqual([]);
  });

  it('resolves the evidence kind independently of the order the author wrote the modes', () => {
    const kindByCase = new Map<string, EvidenceKind | null>();
    for (const sweepCase of sweep()) {
      kindByCase.set(
        `${JSON.stringify(sweepCase.setting)}|${sweepCase.declaration.join(',')}`,
        sweepCase.kind,
      );
    }
    const mismatches: string[] = [];
    for (const setting of ADMINISTRATION_SETTINGS) {
      for (const first of MODE_OPTIONS) {
        for (const second of MODE_OPTIONS) {
          if (first === second) continue;
          const forward = kindByCase.get(`${JSON.stringify(setting)}|${first},${second}`);
          const reverse = kindByCase.get(`${JSON.stringify(setting)}|${second},${first}`);
          if (forward !== reverse) {
            mismatches.push(
              `[${first}, ${second}] → ${forward} but [${second}, ${first}] → ${reverse}`,
            );
          }
        }
      }
    }
    expect(
      mismatches.slice(0, 12),
      'The resolved evidence kind depends on the order the modes were authored in. ' +
        'Least-credit-first must walk a fixed conservative order, or an author changes the ' +
        'warrant — and with it whether P(L) moves — by reordering a list.',
    ).toEqual([]);
  });

  it('derives the evidence kind exactly once, so there is nothing to keep in sync', () => {
    // The behavioural biconditional above is the real guarantee. This adds the
    // structural half: one derivation read by both consumers, rather than two
    // derivations that happen to agree today.
    const adapter = readFileSync(
      join(root, 'packages/domain/src/lesson-response-adapter.ts'),
      'utf8',
    );
    const callSites = adapter.match(/(?<![.\w$])deriveEvidenceKind\s*\(/g) ?? [];
    expect(
      callSites,
      [
        `deriveEvidenceKind is called ${callSites.length} times in the adapter.`,
        '',
        'It must be called ONCE, before qualification, with both the BKT gate and the',
        'EvidenceRecord reading that single value. Deriving it twice is how the record and',
        'the qualification came to disagree about one attempt, and a second call site is the',
        'first step back to two rival notions of eligibility.',
      ].join('\n'),
    ).toHaveLength(1);

    expect(
      adapter.includes('CONTEXTUAL_ONLY_KINDS'),
      'The adapter no longer references CONTEXTUAL_ONLY_KINDS, so the resolved-kind gate is ' +
        'gone. Whatever replaced it is a second notion of eligibility.',
    ).toBe(true);
  });

  it('keeps the declared allowlist strictly weaker than the resolved-kind gate', () => {
    // Why removing the declared test from the gate is safe rather than merely
    // different: it could only ever be MORE permissive. Every declaration it
    // refuses also resolves contextual-only, so nothing that used to move P(L)
    // stops moving; only the cases it wrongly admitted are now refused.
    const overStrict = sweep()
      .filter((sweepCase) => !sweepCase.declaresEligibleMode && !sweepCase.contextualOnly)
      .map(describeCase);
    expect(
      overStrict.slice(0, 12),
      'A declaration the allowlist calls ineligible resolved to a kind that CAN fill a recipe ' +
        'slot. The declared test would then be stricter than the honest one, and dropping it ' +
        'from the gate would newly admit these — which is not what the fix did.',
    ).toEqual([]);
  });

  it('never credits a condition the administration facts did not establish', () => {
    const invented = sweep()
      .filter(
        (sweepCase) =>
          sweepCase.conditions !== null &&
          (sweepCase.conditions.mixed !== sweepCase.setting.mixed ||
            sweepCase.conditions.passage !== sweepCase.setting.passage ||
            sweepCase.conditions.timed !== sweepCase.setting.timed ||
            sweepCase.conditions.protected !== sweepCase.setting.protected),
      )
      .map(
        (sweepCase) =>
          `${describeCase(sweepCase)} recorded conditions ${JSON.stringify(sweepCase.conditions)}`,
      );
    expect(
      invented.slice(0, 12),
      'EvidenceRecord.conditions diverged from the administration facts across the sweep. ' +
        'Conditions are warrant-bearing and come from the runner and the scoring authority; a ' +
        'declared mode must never set one.',
    ).toEqual([]);
  });
});

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

// ---------------------------------------------------------------------------
// 9. The warrant covers what the lesson writes; the decay clock is symmetric
// ---------------------------------------------------------------------------

/** A learner whose only history is one qualified lesson response. */
const WARRANT_LESSON_ID = 'V3-LES-130923';
const AUTHORITY_NOW = '2026-07-20T12:00:00.000Z';

function bktObservationFor(
  primaryKcId: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    observationId: '9c0ffee0-0000-4000-8000-00000000d001',
    questionId: 'arch-question-1',
    itemBindingId: 'arch-binding-1',
    bindingVersion: ARTIFACT_VERSION,
    serverItemVersion: 4,
    primaryKcId,
    reasoningOperation: 'IDENTIFY',
    correct: true,
    occurredAt: AUTHORITY_NOW,
    sequence: 1,
    contentRelease: 'arch-fixture-release',
    policies: [],
    ...overrides,
  };
}

describe('the evidence warrant covers every grain a lesson writes', () => {
  it('produces a warrant for the KC grains a practiced lesson targets', () => {
    const bank = loadSyntheticBank();
    const authority = new Authority(bank, fixedClock(AUTHORITY_NOW));
    const requiredKcIds = orderedKcsForLesson(WARRANT_LESSON_ID) ?? [];

    // Calibration, and the whole point: these grains are NOT in the bank's skill
    // graph. Enumerating warrants from the graph alone produced an empty warrant
    // for every lesson KC while nothing looked broken — an absent warrant reads
    // exactly like "no evidence yet".
    const graphSkillIds = new Set(bank.skillGraph.skills.map((skill) => skill.skillId));
    expect(requiredKcIds.length).toBeGreaterThan(0);
    for (const kcId of requiredKcIds) {
      expect(
        graphSkillIds.has(kcId),
        `${kcId} is in the synthetic skill graph, so this test cannot show that the warrant ` +
          'enumeration unions the lesson grains in.',
      ).toBe(false);
    }

    const state = authority.createGuest();
    const applied = authority.applyQualifiedBktObservation(state, {
      observation: QualifiedBktObservationSchema.parse(
        bktObservationFor(requiredKcIds[0] as string),
      ),
      lessonId: WARRANT_LESSON_ID,
    });
    expect(applied.status, `the fixture observation was ${applied.status}`).toBe('applied');

    const warrantedGrains = new Set(authority.getMasteryMap(state).map((entry) => entry.skillId));
    const missing = requiredKcIds.filter((kcId) => !warrantedGrains.has(kcId));
    expect(
      missing,
      [
        `No warrant was produced for ${missing.join(', ')}.`,
        '',
        'Lesson evidence is keyed on `binding.primaryKcId`, a curriculum KC id. If the warrant',
        "is enumerated only over the bank's skill graph, every recipe slot, gap, freshness",
        'signal and reason code is computed for grains the lesson seam never touches, and the',
        "planner's warrant input is an empty set with nothing looking wrong.",
        '',
        'A KC with no evidence yet must still report its OPEN slots — that is the gap analysis',
        'the planner needs, and it is not the same thing as no grain at all.',
      ].join('\n'),
    ).toEqual([]);
  });

  it('throws a named error for an unresolvable grain rather than omitting it', () => {
    // Silent omission is what hid the finding above for six review rounds, so the
    // refusal has to name itself.
    const error = new UnresolvedWarrantGrainError(['ARCH-KC-NOWHERE', 'ARCH-KC-ALSO-NOWHERE']);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain('ARCH-KC-NOWHERE');
    expect(error.message).toContain('ARCH-KC-ALSO-NOWHERE');
    expect(error.skillIds).toHaveLength(2);

    const authoritySource = readFileSync(
      join(root, 'packages/authority-core/src/authority.ts'),
      'utf8',
    );
    expect(
      /throw new UnresolvedWarrantGrainError/.test(authoritySource),
      'The warrant enumeration no longer THROWS on an unresolvable grain. Whatever it does ' +
        'instead — filter, default, or skip — makes a missing warrant indistinguishable from ' +
        '"no evidence yet", which is a failure with no symptom.',
    ).toBe(true);
  });

  it('keeps P(L) within the skew window of itself whichever order observations arrive in', () => {
    // A backdated first write had no floor, so a claim dated years ago became the
    // decay baseline and identical evidence produced a different learner-facing
    // number depending on delivery order: 0.1497 against 0.8624, a 5.8x spread.
    //
    // BOUNDED, not eliminated — that distinction is the invariant. While a
    // reported time is honoured at all, some order-dependence remains, and it is
    // bounded by the decay across the skew window: ~0.03% at the initial 7-day
    // half-life. Asserting equality would be asserting something the design
    // deliberately does not promise; asserting a bound is the real contract.
    const requiredKcIds = orderedKcsForLesson(WARRANT_LESSON_ID) ?? [];
    const kcId = requiredKcIds[0] as string;
    const longAgo = new Date(
      Date.parse(AUTHORITY_NOW) - 6 * 365 * 24 * 60 * 60 * 1000,
    ).toISOString();

    const apply = (order: readonly string[]): number => {
      const authority = new Authority(loadSyntheticBank(), fixedClock(AUTHORITY_NOW));
      const state = authority.createGuest();
      order.forEach((occurredAt, index) => {
        authority.applyQualifiedBktObservation(state, {
          observation: QualifiedBktObservationSchema.parse(
            bktObservationFor(kcId, {
              observationId: `9c0ffee0-0000-4000-8000-00000000e00${index + 1}`,
              occurredAt,
              sequence: index + 1,
            }),
          ),
          lessonId: WARRANT_LESSON_ID,
        });
      });
      const view = authority
        .getMasterySkills(state)
        .find((skill) => skill.operation === 'IDENTIFY');
      return view?.pL ?? Number.NaN;
    };

    const oldestFirst = apply([longAgo, AUTHORITY_NOW]);
    const newestFirst = apply([AUTHORITY_NOW, longAgo]);

    expect(Number.isFinite(oldestFirst)).toBe(true);
    expect(Number.isFinite(newestFirst)).toBe(true);

    /**
     * Two correct answers must leave `P(L)` well above the prior in BOTH orders.
     * Unbounded, the backdated-first order decayed its own baseline to ~1e-104
     * and read back 0.1497 — under the 0.2 prior, from two correct answers.
     */
    for (const [label, reading] of [
      ['backdated observation first', oldestFirst],
      ['backdated observation last', newestFirst],
    ] as const) {
      expect(
        reading,
        `With the ${label}, two correct answers left P(L) at ${reading} — at or below the 0.2 ` +
          'prior. An unclamped decay baseline is eating the evidence.',
      ).toBeGreaterThan(0.5);
    }

    const spread = Math.abs(newestFirst - oldestFirst) / Math.max(oldestFirst, newestFirst);
    expect(
      spread,
      [
        `P(L) read ${oldestFirst} when the backdated observation arrived first and`,
        `${newestFirst} when it arrived last: a ${(spread * 100).toFixed(4)}% spread from`,
        'transport order alone.',
        '',
        'The decay baseline needs a floor symmetric with the future-skew tolerance, which caps',
        "this at the decay across that window (~0.03%). A grain's monotonic floor cannot help",
        'on its FIRST write, where there is no history to be monotonic against.',
      ].join('\n'),
    ).toBeLessThan(0.001);
  });

  it('bounds the decay clock symmetrically, and narrowly', () => {
    expect(BKT_OBSERVATION_PAST_SKEW_TOLERANCE_MS).toBeGreaterThan(0);
    expect(
      BKT_OBSERVATION_PAST_SKEW_TOLERANCE_MS,
      'The past and future skew tolerances differ. An asymmetric window means the same ' +
        'unverifiable claim is treated one way early and another way late, and the ' +
        'order-dependence the past bound exists to close reopens on the wider side.',
    ).toBe(BKT_OBSERVATION_FUTURE_SKEW_TOLERANCE_MS);

    // The bound on order-dependence IS the decay across the window, so the width
    // is load-bearing: a day would leave a spread a learner could see.
    expect(
      BKT_OBSERVATION_PAST_SKEW_TOLERANCE_MS,
      'The skew window is wider than an hour. It is generosity toward an unverifiable claim, ' +
        'and the wider it gets the more decay a backdated submission can avoid.',
    ).toBeLessThanOrEqual(60 * 60 * 1000);
  });
});
