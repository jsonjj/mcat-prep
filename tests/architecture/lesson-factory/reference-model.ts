/**
 * The lesson-factory reference model.
 *
 * A pinned reference is `<kind>:<locator>#sha256:<digest>`, and until now the locator was
 * a general slug grammar shared by every kind. A general slug grammar is a prose channel
 * with the spaces removed: `bundle:answer-key-is-c#sha256:…` and
 * `kit:official-rubric-pass#sha256:…` both satisfied it, and both would have travelled on
 * a public surface. So each kind now has its own locator grammar, built from the
 * identifiers that kind is actually made of — a lane number, a lesson id, a revision, a
 * kit number, a date — with no free segment anywhere.
 *
 * This module is the single source of that grammar. The contracts carry the same patterns
 * in `shared-vocabulary.schema.json`, and `lesson-factory-reference-model.test.ts` asserts
 * the two are byte-identical, so the validator and the resolver cannot drift apart.
 *
 * It is also the shape a runner will consume. WP-01 implements no runner, so the only
 * targets that exist on disk are the frozen factory artifacts; every other kind resolves
 * to `NOT_YET_PRODUCED` with the path it will occupy, which is a different answer from
 * "this reference is malformed" and is reported as such.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const REPO_ROOT = join(import.meta.dirname, '..', '..', '..');

/** Escape a literal (a path, a dotted filename) for inclusion in a pattern. */
const lit = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const LANE = 'lane-[0-9]{2}';
const LESSON = 'v3-les-[0-9]{6}';
const REVISION = 'rev-[0-9]{6}';
const KIT = 'kit-[0-9]{2}';
const DATE = '[0-9]{4}-[0-9]{2}-[0-9]{2}';
const DIGEST = '[0-9a-f]{64}';
const RUN = 'lesson-factory-deadline-[0-9]{4}-[0-9]{2}-[0-9]{2}';
const ROUTE_SLUG = '(?:standard|concise|misconception|prerequisite-support)';
const SCREEN_SLUG =
  '(?:r1-r15-structural|normalization|source-rights|protected-separation|hash-chain-integrity|deadline-machine-screen)';
const EVIDENCE_SLUG =
  '(?:browser-rendered|accessibility|domain-sme|novice-walkthrough|platform-reliability|human-decision)';

/**
 * Digests that are conventions rather than digests. Named in one place and applied to
 * every reference family and to the bare `Sha256` type, because a placeholder that
 * validates inside a reference is exactly as bad as one that validates on its own — and
 * the reference patterns used to embed a bare `[0-9a-f]{64}` that admitted all of them.
 */
export const PLACEHOLDER_DIGEST_ALTERNATIVES = [
  ...'0123456789abcdef'.split('').map((nibble) => `${nibble}{64}`),
  ...[
    '0a',
    '12',
    'a1',
    'ab',
    'b2',
    'c3',
    'cd',
    'd4',
    'de',
    'e5',
    'f6',
    '1f',
    '2e',
    '3d',
    '4c',
    '5b',
    '6a',
    '7d',
    '8c',
    '9c',
  ].map((pair) => `(?:${pair}){32}`),
  '(?:deadbeef){8}',
  '(?:cafebabe){8}',
  '(?:baadf00d){8}',
  '(?:feedface){8}',
  '(?:0123456789abcdef){4}',
  '(?:fedcba9876543210){4}',
];

/** Matches a placeholder digest sitting at the end of a bare hash or of a reference. */
export const PLACEHOLDER_DIGEST_PATTERN = `(?:${PLACEHOLDER_DIGEST_ALTERNATIVES.join('|')})$`;

/** Concrete placeholder values, for negative cases. */
export const PLACEHOLDER_DIGESTS = [
  '0'.repeat(64),
  'a'.repeat(64),
  'f'.repeat(64),
  'a1'.repeat(32),
  'b2'.repeat(32),
  'de'.repeat(32),
  'deadbeef'.repeat(8),
  'cafebabe'.repeat(8),
  '0123456789abcdef'.repeat(4),
];

export type Resolution =
  /** A frozen artifact that exists in this repository at a fixed path. */
  | { strategy: 'FIXED_PATH'; path: string }
  /** An artifact a runner will produce; the path is derived from the locator. */
  | { strategy: 'DERIVED_PATH'; template: (locator: string) => string }
  /** Identity only. There is no file: the digest pins bytes held elsewhere. */
  | { strategy: 'IDENTITY_ONLY' };

export interface ReferenceKind {
  kind: string;
  /** The locator grammar, without anchors. No segment of it is free text. */
  locator: string;
  resolution: Resolution;
  description: string;
}

const fixed = (kind: string, path: string, description: string): ReferenceKind => ({
  kind,
  locator: lit(path),
  resolution: { strategy: 'FIXED_PATH', path },
  description,
});

export const REFERENCE_KINDS: readonly ReferenceKind[] = [
  fixed(
    'profile',
    'content/lesson-factory/deadline-profile/deadline-profile.json',
    'The frozen deadline profile.',
  ),
  fixed(
    'policy',
    'content/lesson-factory/deadline-profile/release-policy.json',
    'The frozen release policy. The locator is the literal path: a policy reference that could name anything is not a policy reference.',
  ),
  fixed(
    'lifecycle',
    'content/lesson-factory/deadline-profile/lifecycle-nonclaims.json',
    'The lifecycle and nonclaims register.',
  ),
  fixed(
    'receipt',
    'content/lesson-factory/deadline-profile/owner-route-policy-receipt.json',
    'The owner route-scope decision receipt.',
  ),
  fixed(
    'statement',
    'content/lesson-factory/deadline-profile/owner-route-policy-statement.md',
    'The non-authoritative verbatim record of the owner decision.',
  ),
  fixed(
    'spec',
    'docs/design/05-LESSON-STRUCTURAL-AUTHORING-SPEC.md',
    'The structural authoring spec (R1-R15).',
  ),
  fixed('rubric', 'key-docs/lesson-quality-rubric.md', 'The lesson quality rubric.'),
  fixed(
    'mastery',
    'docs/lesson-evidence-mastery-contract.md',
    'The lesson evidence and mastery contract.',
  ),
  {
    kind: 'assignment',
    locator: `${RUN}/assignment-[0-9]{2}`,
    resolution: {
      strategy: 'DERIVED_PATH',
      template: (locator) => `.tmp/lesson-factory/${locator}/assignment-manifest.json`,
    },
    description: 'One assignment manifest of one dated deadline run.',
  },
  {
    kind: 'kit',
    locator: `${RUN}/kit-[0-9]{2}`,
    resolution: {
      strategy: 'DERIVED_PATH',
      template: (locator) => `.tmp/lesson-factory/${locator}/kit-manifest.json`,
    },
    description: 'One packaged kit of one dated deadline run.',
  },
  {
    kind: 'packet',
    locator: `${LANE}/${LESSON}`,
    resolution: {
      strategy: 'DERIVED_PATH',
      template: (locator) => `.tmp/lesson-factory/${locator}/task-source-packet.json`,
    },
    description: 'The frozen packet one lane received for one lesson.',
  },
  {
    kind: 'handoff',
    locator: `${LANE}/${LESSON}`,
    resolution: {
      strategy: 'DERIVED_PATH',
      template: (locator) => `.tmp/lesson-factory/${locator}/lesson-handoff.json`,
    },
    description: 'The handoff one lane produced for one lesson.',
  },
  {
    kind: 'team-handoff',
    locator: LANE,
    resolution: {
      strategy: 'DERIVED_PATH',
      template: (locator) => `.tmp/lesson-factory/${locator}/team-handoff.json`,
    },
    description:
      'One lane\u2019s aggregate handoff. A lane produces exactly one, so the locator is the lane and nothing else.',
  },
  {
    kind: 'import-index',
    locator: `${RUN}/import-index-[0-9]{2}`,
    resolution: {
      strategy: 'DERIVED_PATH',
      template: (locator) => `.tmp/lesson-factory/${locator}/import-index.json`,
    },
    description: 'One import index of one dated deadline run.',
  },
  {
    kind: 'ledger',
    locator: `${LANE}/${LESSON}/${ROUTE_SLUG}`,
    resolution: {
      strategy: 'DERIVED_PATH',
      template: (locator) => {
        const parts = locator.split('/');
        const route = parts.pop() ?? '';
        return `.tmp/lesson-factory/${parts.join('/')}/ledger-${route}.json`;
      },
    },
    description: 'The machine-screen ledger for one lesson on one route.',
  },
  {
    kind: 'screen',
    locator: `${LANE}/${LESSON}/${SCREEN_SLUG}`,
    resolution: {
      strategy: 'DERIVED_PATH',
      template: (locator) => {
        const parts = locator.split('/');
        const screen = parts.pop() ?? '';
        return `.tmp/lesson-factory/${parts.join('/')}/screens/${screen}.json`;
      },
    },
    description:
      'One hard-gate screen run. The screen segment is one of the six gate ids in kebab case, not a name the runner chooses.',
  },
  {
    kind: 'bundle',
    locator: `${KIT}/${LESSON}`,
    resolution: {
      strategy: 'DERIVED_PATH',
      template: (locator) => `.tmp/lesson-factory/bundles/${locator}/bundle.json`,
    },
    description: 'One packaged lesson bundle inside one kit.',
  },
  {
    kind: 'readiness',
    locator: `${KIT}/${LESSON}`,
    resolution: {
      strategy: 'DERIVED_PATH',
      template: (locator) => `.tmp/lesson-factory/bundles/${locator}/readiness.json`,
    },
    description: 'The candidate-import readiness record for one bundle.',
  },
  {
    kind: 'lesson',
    locator: `${LESSON}@${REVISION}`,
    resolution: { strategy: 'IDENTITY_ONLY' },
    description:
      'One exact lesson revision. Identity only: the digest pins the revision bytes, which live in the lesson envelope rather than at a factory path.',
  },
  {
    kind: 'title',
    locator: `${LESSON}@${REVISION}`,
    resolution: { strategy: 'IDENTITY_ONLY' },
    description:
      'The title of one lesson revision, referenced rather than carried. Identity only, for the same reason as `lesson`.',
  },
  {
    kind: 'evidence-receipt',
    locator: `${EVIDENCE_SLUG}/${LESSON}@${REVISION}`,
    resolution: { strategy: 'IDENTITY_ONLY' },
    description:
      'A receipt for one evidence class on one revision. The class segment is one of the six evidence class ids in kebab case.',
  },
  {
    kind: 'permission-receipt',
    locator: `src-[0-9]{4}/${DATE}`,
    resolution: { strategy: 'IDENTITY_ONLY' },
    description: 'A rights-clearance receipt for one source, on one date.',
  },
];

/**
 * Identifier grammars, one per naming context.
 *
 * These replace a single shared slug type. A shared slug type is the same defect as a
 * shared locator grammar: `bundle_id: "answer-key-is-c"` and
 * `readiness_id: "official-rubric-pass"` both satisfied `^[a-z0-9][a-z0-9-]{2,63}$`, and
 * both would have shipped on a public surface. Every grammar below is built from fixed
 * words and numbers, so there is nowhere in an identifier to put a sentence.
 */
export const IDENTIFIER_GRAMMARS: Readonly<Record<string, string>> = Object.freeze({
  ProfileId: `^${RUN}$`,
  PolicyId: '^lesson-factory-deadline-release$',
  ReceiptId: `^owner-route-policy-${DATE}$`,
  AssignmentId: `^${RUN}-assignment-[0-9]{2}$`,
  KitId: `^${RUN}-kit-[0-9]{2}$`,
  ImportIndexId: `^${RUN}-import-index-[0-9]{2}$`,
  RequestId: `^${RUN}-request-[0-9]{2}$`,
  BundleId: `^${KIT}-${LESSON}$`,
  ReadinessId: `^${KIT}-${LESSON}-readiness-[0-9]{2}$`,
  HandoffId: `^${LANE}-${LESSON}-handoff-[0-9]{2}$`,
  TeamHandoffId: `^${LANE}-team-handoff-[0-9]{2}$`,
  LedgerId: `^${LANE}-${LESSON}-${ROUTE_SLUG}-ledger-[0-9]{2}$`,
  SourceId: '^src-[0-9]{4}$',
});

const BY_KIND = new Map(REFERENCE_KINDS.map((spec) => [spec.kind, spec]));

export function referenceKind(kind: string): ReferenceKind {
  const spec = BY_KIND.get(kind);
  if (spec === undefined) throw new ReferenceError_(`unknown reference kind "${kind}"`);
  return spec;
}

/** The exact JSON Schema `pattern` the contracts must carry for this kind. */
export function schemaPatternFor(kind: string): string {
  return `^${kind}:${referenceKind(kind).locator}#sha256:${DIGEST}$`;
}

/** The `$defs` name the contracts use for this kind, e.g. `evidence-receipt` -> `EvidenceReceiptRef`. */
export function schemaDefNameFor(kind: string): string {
  const camel = kind
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
  return `${camel}Ref`;
}

export class ReferenceError_ extends Error {}
export { ReferenceError_ as ReferenceModelError };

export interface ParsedReference {
  kind: string;
  locator: string;
  digest: string;
}

/**
 * Parse and validate a reference against the grammar for `expectedKind`, including the
 * placeholder-digest rule. Throws with the reason; never returns a partial result.
 */
export function parseReference(reference: unknown, expectedKind: string): ParsedReference {
  const spec = referenceKind(expectedKind);
  if (typeof reference !== 'string') {
    throw new ReferenceError_(
      `expected a pinned ${expectedKind} reference, found ${JSON.stringify(reference)}`,
    );
  }
  const shape = /^([a-z][a-z0-9-]*):(.+)#sha256:([0-9a-f]{64})$/.exec(reference);
  if (shape === null) {
    throw new ReferenceError_(
      `malformed reference ${JSON.stringify(reference)}: expected <kind>:<locator>#sha256:<64 lower-case hex>`,
    );
  }
  const [, kind = '', locator = '', digest = ''] = shape;
  if (kind !== expectedKind) {
    throw new ReferenceError_(
      `reference ${reference} is a "${kind}" reference where a "${expectedKind}" was required`,
    );
  }
  if (!new RegExp(`^${spec.locator}$`).test(locator)) {
    throw new ReferenceError_(
      `reference ${reference} has a locator that is not a canonical ${kind} locator; every segment of a locator is an identifier, never free text`,
    );
  }
  if (new RegExp(PLACEHOLDER_DIGEST_PATTERN).test(digest)) {
    throw new ReferenceError_(
      `reference ${reference} carries a placeholder digest; a placeholder that validates is a fixture that reached production wearing the right shape`,
    );
  }
  return { kind, locator, digest };
}

export type ResolutionOutcome =
  | { status: 'RESOLVED'; kind: string; locator: string; path: string; digest: string }
  | { status: 'NOT_YET_PRODUCED'; kind: string; locator: string; expectedPath: string }
  | { status: 'IDENTITY_ONLY'; kind: string; locator: string; digest: string };

export function sha256OfPath(repoRelativePath: string): string {
  return createHash('sha256')
    .update(readFileSync(join(REPO_ROOT, repoRelativePath)))
    .digest('hex');
}

/**
 * Resolve a reference all the way to bytes where bytes exist.
 *
 * The three outcomes are deliberately distinct. `RESOLVED` means the named file exists and
 * hashes to the declared digest. `NOT_YET_PRODUCED` means the reference is well-formed and
 * names a path a runner will write — WP-01 ships no runner, so this is the honest answer
 * for lane and kit artifacts, and it is not the same answer as "invalid". `IDENTITY_ONLY`
 * means the kind names bytes that never live at a factory path. Anything else throws.
 */
export function resolveReference(reference: unknown, expectedKind: string): ResolutionOutcome {
  const { kind, locator, digest } = parseReference(reference, expectedKind);
  const { resolution } = referenceKind(kind);

  if (resolution.strategy === 'IDENTITY_ONLY') {
    return { status: 'IDENTITY_ONLY', kind, locator, digest };
  }

  const path =
    resolution.strategy === 'FIXED_PATH' ? resolution.path : resolution.template(locator);

  if (!existsSync(join(REPO_ROOT, path))) {
    if (resolution.strategy === 'FIXED_PATH') {
      throw new ReferenceError_(
        `reference ${reference} names ${path}, which does not exist; a frozen artifact must be on disk`,
      );
    }
    return { status: 'NOT_YET_PRODUCED', kind, locator, expectedPath: path };
  }

  const actual = sha256OfPath(path);
  if (actual !== digest) {
    throw new ReferenceError_(
      `reference ${reference} declares sha256 ${digest}, but ${path} hashes to ${actual}`,
    );
  }
  return { status: 'RESOLVED', kind, locator, path, digest };
}

/** Build the current canonical reference for a fixed-path kind, for deliberate re-pinning. */
export function canonicalRefFor(kind: string): string {
  const { resolution } = referenceKind(kind);
  if (resolution.strategy !== 'FIXED_PATH') {
    throw new ReferenceError_(`${kind} has no fixed target to pin`);
  }
  return `${kind}:${resolution.path}#sha256:${sha256OfPath(resolution.path)}`;
}
