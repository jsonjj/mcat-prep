import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  normalizeLesson,
  type NormalizedItem,
  type NormalizedLesson,
  type RawLessonArtifacts,
} from '@mcat/content/lesson-normalization';

import { VECTOR_LESSON_PROTECTED_ANSWERS } from './vector-lesson-protected';

/**
 * The one seam through which the learner runtime obtains lesson content.
 *
 * It reads the vendored catalog under `content/lessons/<id>/`, hands the raw
 * artifacts to `@mcat/content` `normalizeLesson`, and returns the SAME
 * `NormalizedLesson` every downstream consumer already speaks (the Phase 3
 * validator, the Phase 5 runtime). The learner-facing surface
 * (`getNormalizedLesson`) is answer-free by construction — normalization never
 * reads protected material. Correct answers live ONLY behind `getAnswerKey`,
 * which is server-only and is the seam the browser-boundary architecture test
 * forbids `apps/learner-web` from reaching.
 *
 * Storage is an implementation detail: this repo-backed provider satisfies the
 * interface with the filesystem today; a bundle- or DB-backed provider can drop
 * in later without changing a caller (design note D5).
 */
export interface LessonContentProvider {
  /** Every lesson id discovered in the catalog, sorted. */
  listLessonIds(): readonly string[];
  hasLesson(lessonId: string): boolean;
  /** Learner-safe normalized lesson. Throws `UnknownLessonError` / normalization errors; never returns a key. */
  getNormalizedLesson(lessonId: string): NormalizedLesson;
  /** SERVER ONLY. Correct answers for every scored item. Never serialize to a browser route. */
  getAnswerKey(lessonId: string): ServerAnswerKey;
  /** `content_sha256` of the lesson script — the content revision to attribute evidence to. */
  getDefinitionHash(lessonId: string): string;
  /**
   * SERVER ONLY. The lesson's authored `question_evidence_plan` entries (raw and
   * unparsed) plus the envelope `artifact_version`, for the seam adapter to feed
   * to `parseAuthoredLessonBinding`. Not learner-safe: the QEP carries
   * evidence-mode, scoring-authority, and reasoning-operation metadata.
   */
  getAuthoredBindings(lessonId: string): AuthoredLessonBindings;
}

/** SERVER-ONLY authored-binding source for one lesson: the raw QEP + envelope version. */
export interface AuthoredLessonBindings {
  readonly lessonId: string;
  /** Lesson-script `artifact_version`; the envelope fallback when a binding omits its own version. */
  readonly artifactVersion: string | undefined;
  /** The raw `payload.question_evidence_plan` entries, in authored order. */
  readonly entries: readonly Readonly<Record<string, unknown>>[];
}

/** SERVER-ONLY correct-answer record for one scored item. */
export interface ServerItemAnswer {
  readonly itemId: string;
  readonly primaryKcId: string;
  /** Projection response type (`single_select`, `MULTIPLE_CHOICE`, `SHORT_RESPONSE`, …). */
  readonly responseType: string;
  /**
   * The winning `NormalizedChoice.choiceId` for select items; `null` for
   * free/short-response items, whose answer is `acceptedResponses` instead.
   */
  readonly correctChoiceId: string | null;
  /** One or more canonical correct responses (option text or accepted free text). Always non-empty. */
  readonly acceptedResponses: readonly string[];
  /** Post-commitment rationale/derivation when the source supplies one. */
  readonly rationale: string | null;
  /**
   * For structured/constructed-response items that have no single correct
   * option, the raw server-only scoring authority (e.g. L3
   * `constructed_system_and_solution`: required fields + expected equation forms
   * + solution pair). Absent for plain multiple-choice / short-response items.
   */
  readonly structuredAuthority?: Readonly<Record<string, unknown>>;
}

/** SERVER-ONLY answer key for a lesson: `itemId -> answer`, over scored items only. */
export interface ServerAnswerKey {
  readonly lessonId: string;
  readonly definitionHash: string;
  readonly byItemId: Readonly<Record<string, ServerItemAnswer>>;
}

export class UnknownLessonError extends Error {
  constructor(
    readonly lessonId: string,
    readonly known: readonly string[],
  ) {
    super(`unknown lesson "${lessonId}"; known: ${known.join(', ') || '(none)'}`);
    this.name = 'UnknownLessonError';
  }
}

/**
 * A scored item's correct answer could not be resolved from its protected
 * material. This is always a hard failure — the provider NEVER guesses or
 * silently drops an item, because a lesson that scores against a hole is worse
 * than one that refuses to load.
 */
export class AnswerKeyResolutionError extends Error {
  constructor(
    message: string,
    readonly detail: { lessonId: string; itemId?: string },
  ) {
    super(message);
    this.name = 'AnswerKeyResolutionError';
  }
}

// This module's own directory, resolved so the provider works BOTH under ESM
// (dev/tests/tsx, where `import.meta.url` is defined and `__dirname` is not) AND
// inside the CommonJS Lambda bundle esbuild emits (where `__dirname` is the real
// Node global and `import.meta` is empty). Referencing `import.meta.url` unguarded
// at module scope is exactly what crashed the deployed handler on load
// (`fileURLToPath(undefined)` throws), 502'ing EVERY route at import time. This
// resolution must therefore NEVER throw — a bundle quirk in one file must not be
// able to take the whole Lambda down before a single request is served.
//
// Priority (mirrors the numbered contract): the caller checks
// `LESSON_CONTENT_ROOT` first (see `DEFAULT_CONTENT_ROOT`); then this function
// prefers (2) the CJS `__dirname` global, (3) a VALID ESM `import.meta.url`, and
// finally (4) degrades to `process.cwd()`. Pure and parameterized so a test can
// exercise the "both unavailable" and "malformed URL" branches directly.
export function resolveModuleDir(dirnameGlobal: unknown, importMetaUrl: unknown): string {
  // (2) The CJS bundle path: `__dirname` is the real Node global. Selected first
  // so the ESM-only branch is never evaluated in a bundle where `import.meta` is
  // empty (`import.meta.url === undefined`).
  if (typeof dirnameGlobal === 'string' && dirnameGlobal.length > 0) return dirnameGlobal;
  // (3) The ESM path (dev/tests/tsx): a real `file:` URL. Wrapped in try/catch so a
  // non-`file:` scheme or malformed URL degrades to the safe default instead of
  // throwing `ERR_INVALID_URL*` at module load.
  if (typeof importMetaUrl === 'string' && importMetaUrl.length > 0) {
    try {
      return dirname(fileURLToPath(importMetaUrl));
    } catch {
      return process.cwd();
    }
  }
  // (4) Neither is available (e.g. a CJS bundle with an empty `import.meta` AND no
  // usable `__dirname`): fall back to a safe, non-throwing default.
  return process.cwd();
}

function moduleDirname(): string {
  // Read the ambient globals defensively. `typeof` never throws even when the
  // identifier is undeclared (ESM has no `__dirname`), and `import.meta` is empty
  // rather than absent in the CJS bundle, so `import.meta.url` reads as `undefined`
  // there instead of throwing.
  const dirnameGlobal = typeof __dirname === 'string' ? __dirname : undefined;
  const importMetaUrl =
    typeof import.meta !== 'undefined' && typeof import.meta.url === 'string'
      ? import.meta.url
      : undefined;
  return resolveModuleDir(dirnameGlobal, importMetaUrl);
}

// The vendored catalog root. In the deployed Lambda the catalog is copied next to
// the handler and pointed at by `LESSON_CONTENT_ROOT` (see the learner function's
// bundling in `infra/cdk/lib/api-stack.ts`); in dev and tests it resolves relative
// to this module (services/lambdas/learner-api/src -> repo root -> content/lessons)
// so the provider stays cwd-independent.
const DEFAULT_CONTENT_ROOT =
  process.env.LESSON_CONTENT_ROOT ??
  join(moduleDirname(), '..', '..', '..', '..', 'content', 'lessons');

type JsonRecord = Record<string, unknown>;

const asRecord = (value: unknown): JsonRecord | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : undefined;

const asArray = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : []);

const readJsonFile = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));

function readArtifacts(dir: string): RawLessonArtifacts {
  const learnerSafePath = join(dir, 'learner-safe-items.json');
  const protectedPath = join(dir, 'protected-items.json');
  return {
    script: readJsonFile(join(dir, 'lesson-script.json')),
    learnerSafeItems: existsSync(learnerSafePath) ? readJsonFile(learnerSafePath) : undefined,
    protectedItems: existsSync(protectedPath) ? readJsonFile(protectedPath) : undefined,
  };
}

// ---------------------------------------------------------------------------
// Per-grammar answer resolution. Each returns the choice whose id/ordinal/text
// the runtime will score the learner's committed choice against — resolved
// against the SAME normalized choices the learner sees, so a scored answer can
// never reference an option that does not exist.
// ---------------------------------------------------------------------------

function resolveL1Answer(lessonId: string, item: NormalizedItem): ServerItemAnswer {
  // L1 keeps its key in code (no protected-items.json): a letter per item_binding_id.
  const record = VECTOR_LESSON_PROTECTED_ANSWERS[item.itemId];
  if (record === undefined) {
    throw new AnswerKeyResolutionError(
      `L1 item "${item.itemId}" has no entry in the protected answer authority`,
      {
        lessonId,
        itemId: item.itemId,
      },
    );
  }
  const choice = item.projection.choices.find((c) => c.choiceId === record.correctChoiceId);
  if (choice === undefined) {
    throw new AnswerKeyResolutionError(
      `L1 correct choice "${record.correctChoiceId}" is not among the ${item.projection.choices.length} options for "${item.itemId}"`,
      { lessonId, itemId: item.itemId },
    );
  }
  return {
    itemId: item.itemId,
    primaryKcId: item.primaryKcId,
    responseType: item.projection.responseType,
    correctChoiceId: choice.choiceId,
    acceptedResponses: [choice.text],
    rationale: record.derivation,
  };
}

interface L2ProtectedRecord {
  readonly acceptedResponses: readonly string[];
  readonly rationale: string | null;
}

function buildL2Index(artifacts: RawLessonArtifacts): Map<string, L2ProtectedRecord> {
  const index = new Map<string, L2ProtectedRecord>();
  for (const raw of asArray(asRecord(artifacts.protectedItems)?.items)) {
    const rec = asRecord(raw);
    if (rec === undefined) continue;
    const key =
      typeof rec.internal_item_binding_id === 'string'
        ? rec.internal_item_binding_id
        : typeof rec.prompt_ref === 'string'
          ? rec.prompt_ref
          : undefined;
    if (key === undefined) continue;
    const accepted = asArray(rec.accepted_responses).filter(
      (x): x is string => typeof x === 'string',
    );
    const correct = typeof rec.correct_response === 'string' ? rec.correct_response : undefined;
    const acceptedResponses = [
      ...new Set([...(correct !== undefined ? [correct] : []), ...accepted]),
    ];
    const rationale =
      typeof rec.rationale === 'string'
        ? rec.rationale
        : typeof rec.post_commitment_feedback === 'string'
          ? rec.post_commitment_feedback
          : null;
    index.set(key, { acceptedResponses, rationale });
  }
  return index;
}

function resolveL2Answer(
  lessonId: string,
  item: NormalizedItem,
  index: Map<string, L2ProtectedRecord>,
): ServerItemAnswer {
  const record = index.get(item.itemId);
  if (record === undefined) {
    throw new AnswerKeyResolutionError(
      `L2 item "${item.itemId}" has no protected record (by internal_item_binding_id/prompt_ref)`,
      { lessonId, itemId: item.itemId },
    );
  }
  if (record.acceptedResponses.length === 0) {
    throw new AnswerKeyResolutionError(`L2 item "${item.itemId}" has no correct_response`, {
      lessonId,
      itemId: item.itemId,
    });
  }
  const base = {
    itemId: item.itemId,
    primaryKcId: item.primaryKcId,
    responseType: item.projection.responseType,
    rationale: record.rationale,
  };
  // Multiple-choice: the correct_response is the TEXT of one option. Free/short
  // response items carry no options, so the accepted text(s) ARE the key.
  if (item.projection.choices.length === 0) {
    return { ...base, correctChoiceId: null, acceptedResponses: record.acceptedResponses };
  }
  const accepted = new Set(record.acceptedResponses);
  const choice = item.projection.choices.find((c) => accepted.has(c.text));
  if (choice === undefined) {
    throw new AnswerKeyResolutionError(
      `L2 correct_response for "${item.itemId}" ("${record.acceptedResponses[0]}") matches none of the ${item.projection.choices.length} options`,
      { lessonId, itemId: item.itemId },
    );
  }
  return { ...base, correctChoiceId: choice.choiceId, acceptedResponses: [choice.text] };
}

interface L3ProtectedRecord {
  /** Present for multiple-choice items; absent for constructed-response items. */
  readonly correctOptionIndex: number | undefined;
  /** Present for `constructed_system_and_solution` items; absent for multiple choice. */
  readonly responseAuthority: Record<string, unknown> | undefined;
  readonly rationale: string | null;
}

function buildL3Index(artifacts: RawLessonArtifacts): Map<string, L3ProtectedRecord> {
  const index = new Map<string, L3ProtectedRecord>();
  for (const raw of asArray(asRecord(artifacts.protectedItems)?.records)) {
    const rec = asRecord(raw);
    if (rec === undefined) continue;
    if (typeof rec.answer_record_id !== 'string') continue;
    index.set(rec.answer_record_id, {
      correctOptionIndex:
        typeof rec.correct_option_index === 'number' ? rec.correct_option_index : undefined,
      responseAuthority: asRecord(rec.response_authority),
      rationale: typeof rec.rationale === 'string' ? rec.rationale : null,
    });
  }
  return index;
}

function resolveL3Answer(
  lessonId: string,
  item: NormalizedItem,
  index: Map<string, L3ProtectedRecord>,
): ServerItemAnswer {
  const record = index.get(item.itemId);
  if (record === undefined) {
    throw new AnswerKeyResolutionError(
      `L3 item "${item.itemId}" has no protected record (by answer_record_id)`,
      {
        lessonId,
        itemId: item.itemId,
      },
    );
  }
  const base = {
    itemId: item.itemId,
    primaryKcId: item.primaryKcId,
    responseType: item.projection.responseType,
    rationale: record.rationale,
  };

  // Constructed-response items (`constructed_system_and_solution`) carry a
  // response_authority (equation forms + solution pair) instead of an option
  // index — they are NOT multiple choice, so there is no choiceId to point at.
  if (record.correctOptionIndex === undefined) {
    if (record.responseAuthority === undefined) {
      throw new AnswerKeyResolutionError(
        `L3 item "${item.itemId}" has neither a correct_option_index nor a response_authority`,
        { lessonId, itemId: item.itemId },
      );
    }
    const accepted = [
      ...asArray(record.responseAuthority.expected_equation_forms),
      ...asArray(record.responseAuthority.expected_solution_pair),
    ].filter((x): x is string => typeof x === 'string');
    if (accepted.length === 0) {
      throw new AnswerKeyResolutionError(
        `L3 item "${item.itemId}" response_authority carries no expected equation/solution strings`,
        { lessonId, itemId: item.itemId },
      );
    }
    return {
      ...base,
      correctChoiceId: null,
      acceptedResponses: accepted,
      structuredAuthority: record.responseAuthority,
    };
  }

  if (!Number.isInteger(record.correctOptionIndex)) {
    throw new AnswerKeyResolutionError(
      `L3 item "${item.itemId}" has a non-integer correct_option_index`,
      {
        lessonId,
        itemId: item.itemId,
      },
    );
  }
  const choice = item.projection.choices.find((c) => c.ordinal === record.correctOptionIndex);
  if (choice === undefined) {
    throw new AnswerKeyResolutionError(
      `L3 correct_option_index ${record.correctOptionIndex} for "${item.itemId}" is out of range (${item.projection.choices.length} options)`,
      { lessonId, itemId: item.itemId },
    );
  }
  return { ...base, correctChoiceId: choice.choiceId, acceptedResponses: [choice.text] };
}

function buildAnswerKey(
  normalized: NormalizedLesson,
  artifacts: RawLessonArtifacts,
): ServerAnswerKey {
  const scored = normalized.items.filter((item) => item.scored);
  const byItemId: Record<string, ServerItemAnswer> = {};
  switch (normalized.grammar) {
    case 'L1_INLINE':
      for (const item of scored) byItemId[item.itemId] = resolveL1Answer(normalized.lessonId, item);
      break;
    case 'L2_PROMPTREF': {
      const index = buildL2Index(artifacts);
      for (const item of scored)
        byItemId[item.itemId] = resolveL2Answer(normalized.lessonId, item, index);
      break;
    }
    case 'L3_PROJECTIONREF': {
      const index = buildL3Index(artifacts);
      for (const item of scored)
        byItemId[item.itemId] = resolveL3Answer(normalized.lessonId, item, index);
      break;
    }
  }
  return { lessonId: normalized.lessonId, definitionHash: normalized.definitionHash, byItemId };
}

/**
 * A storage-agnostic source of a lesson's raw artifacts. Both the filesystem
 * (repo) provider and the DB/S3-backed revision provider build one of these and
 * share the grammar-agnostic normalization + answer-key resolution below, so the
 * protection split and the L1/L2/L3 answer logic can never diverge by storage.
 */
export interface LessonArtifactSource {
  listLessonIds(): readonly string[];
  hasLesson(lessonId: string): boolean;
  /** lesson-script.json + learner-safe-items.json (+ protected-items.json for the key). */
  readArtifacts(lessonId: string): RawLessonArtifacts;
  /** The parsed lesson-script.json object (for authored bindings). */
  readScriptRecord(lessonId: string): Record<string, unknown> | undefined;
}

/**
 * Build a provider over any artifact source. Normalization + answer keys are
 * resolved lazily and cached, exactly as the repo provider always did — the only
 * thing that varies is WHERE the raw artifacts come from (design note D5). The
 * learner-safe surface stays answer-free; keys resolve only via getAnswerKey.
 */
export function createLessonContentProvider(source: LessonArtifactSource): LessonContentProvider {
  const normalizedCache = new Map<string, NormalizedLesson>();
  const answerCache = new Map<string, ServerAnswerKey>();
  const authoringCache = new Map<string, AuthoredLessonBindings>();

  const ensureKnown = (lessonId: string): void => {
    if (!source.hasLesson(lessonId)) throw new UnknownLessonError(lessonId, source.listLessonIds());
  };
  const normalizedOf = (lessonId: string): NormalizedLesson => {
    const cached = normalizedCache.get(lessonId);
    if (cached !== undefined) return cached;
    ensureKnown(lessonId);
    const normalized = normalizeLesson(source.readArtifacts(lessonId));
    normalizedCache.set(lessonId, normalized);
    return normalized;
  };

  return {
    listLessonIds: () => source.listLessonIds(),
    hasLesson: (lessonId) => source.hasLesson(lessonId),
    getNormalizedLesson: normalizedOf,
    getDefinitionHash: (lessonId) => normalizedOf(lessonId).definitionHash,
    getAnswerKey: (lessonId) => {
      const cached = answerCache.get(lessonId);
      if (cached !== undefined) return cached;
      const key = buildAnswerKey(normalizedOf(lessonId), source.readArtifacts(lessonId));
      answerCache.set(lessonId, key);
      return key;
    },
    getAuthoredBindings: (lessonId) => {
      const cached = authoringCache.get(lessonId);
      if (cached !== undefined) return cached;
      ensureKnown(lessonId);
      const script = asRecord(source.readScriptRecord(lessonId));
      const payload = asRecord(script?.payload);
      const entries = asArray(payload?.question_evidence_plan)
        .map(asRecord)
        .filter((entry): entry is JsonRecord => entry !== undefined);
      const value: AuthoredLessonBindings = {
        lessonId,
        artifactVersion:
          typeof script?.artifact_version === 'string' ? script.artifact_version : undefined,
        entries,
      };
      authoringCache.set(lessonId, value);
      return value;
    },
  };
}

/**
 * The repo-backed provider. Discovers every `content/lessons/<id>/` carrying a
 * `lesson-script.json`, keyed by the script's own `payload.lesson_id`.
 */
export function createRepoLessonContentProvider(
  contentRoot: string = DEFAULT_CONTENT_ROOT,
): LessonContentProvider {
  const dirById = new Map<string, string>();
  if (existsSync(contentRoot)) {
    for (const entry of readdirSync(contentRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = join(contentRoot, entry.name);
      const scriptPath = join(dir, 'lesson-script.json');
      if (!existsSync(scriptPath)) continue;
      const payload = asRecord(asRecord(readJsonFile(scriptPath))?.payload);
      const lessonId = typeof payload?.lesson_id === 'string' ? payload.lesson_id : undefined;
      if (lessonId !== undefined) dirById.set(lessonId, dir);
    }
  }
  const ids = [...dirById.keys()].sort();
  const dirOf = (lessonId: string): string => {
    const dir = dirById.get(lessonId);
    if (dir === undefined) throw new UnknownLessonError(lessonId, ids);
    return dir;
  };
  return createLessonContentProvider({
    listLessonIds: () => ids,
    hasLesson: (lessonId) => dirById.has(lessonId),
    readArtifacts: (lessonId) => readArtifacts(dirOf(lessonId)),
    readScriptRecord: (lessonId) =>
      asRecord(readJsonFile(join(dirOf(lessonId), 'lesson-script.json'))),
  });
}

/**
 * A composite provider: a synchronous base (the repo pilots, available at module
 * load) plus an optional secondary (the DB-backed release catalog) installed
 * asynchronously at Lambda cold start via {@link AttachableLessonContentProvider.attach}.
 * A lesson is served by the secondary when it has it, else the base — so the three
 * pilots keep working synchronously and the 111 build-a lessons resolve once the DB
 * provider is attached, WITHOUT threading a provider through the runtime call chain.
 */
export interface AttachableLessonContentProvider extends LessonContentProvider {
  attach(secondary: LessonContentProvider): void;
}

export function createCompositeLessonContentProvider(
  base: LessonContentProvider,
): AttachableLessonContentProvider {
  let secondary: LessonContentProvider | undefined;
  const providerFor = (lessonId: string): LessonContentProvider =>
    secondary?.hasLesson(lessonId) ? secondary : base;
  return {
    attach: (next) => {
      secondary = next;
    },
    listLessonIds: () =>
      [...new Set([...base.listLessonIds(), ...(secondary?.listLessonIds() ?? [])])].sort(),
    hasLesson: (lessonId) => base.hasLesson(lessonId) || (secondary?.hasLesson(lessonId) ?? false),
    getNormalizedLesson: (lessonId) => providerFor(lessonId).getNormalizedLesson(lessonId),
    getAnswerKey: (lessonId) => providerFor(lessonId).getAnswerKey(lessonId),
    getDefinitionHash: (lessonId) => providerFor(lessonId).getDefinitionHash(lessonId),
    getAuthoredBindings: (lessonId) => providerFor(lessonId).getAuthoredBindings(lessonId),
  };
}

/**
 * Default provider for the deployed learner runtime: the repo pilots now, with the
 * DB-backed release catalog attached at cold start (see the learner Lambda's
 * `createRuntime`). Consumers that import this keep using the same seam.
 */
export const lessonContentProvider: AttachableLessonContentProvider =
  createCompositeLessonContentProvider(createRepoLessonContentProvider());
