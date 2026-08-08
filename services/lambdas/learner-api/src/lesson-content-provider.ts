import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  LessonNormalizationError,
  compileCanonicalLesson,
  detectGrammar,
  normalizeLesson,
  type CanonicalServerAnswerKey,
  type CanonicalServerItemAnswer,
  type NormalizedItem,
  type NormalizedLesson,
  type RawLessonArtifacts,
} from '@mcat/content/lesson-normalization';
import {
  LessonCatalogEntrySchema,
  LessonCatalogIdentitySchema,
  LessonCatalogResponseSchema,
  LessonDefinitionHashSchema,
  LessonLifecycleSchema,
  type LessonCatalogEntry,
  type LessonCatalogIdentity,
  type LessonDefinitionHash,
  type LessonLifecycle,
} from '@mcat/contracts';

import { VECTOR_LESSON_PROTECTED_ANSWERS } from './vector-lesson-protected';

/** Temporary synchronous surface retained until WP-05C migrates existing callers. */
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

/** Compatibility names for the canonical WP-05A protected authority. */
export type ServerItemAnswer = CanonicalServerItemAnswer;
export type ServerAnswerKey = CanonicalServerAnswerKey;

export type ActiveLessonReference =
  | { readonly lessonId: string; readonly slug?: never }
  | { readonly slug: string; readonly lessonId?: never };

export interface LessonRevisionArtifactHashes {
  readonly lessonScript: string;
  readonly learnerSafeItems: string | null;
  readonly protectedItems: string | null;
  readonly presentationPlan: string | null;
}

export interface LessonRevisionInputHash {
  readonly inputId: string;
  readonly sha256: string;
}

/** SERVER ONLY. The protected half of one compiled revision. */
export interface LessonProtectedAuthority {
  readonly answerKey: ServerAnswerKey;
}

/** A complete immutable server revision; never serialize this object as a catalog response. */
export interface LoadedLessonRevision {
  readonly lessonId: string;
  readonly definitionHash: LessonDefinitionHash;
  readonly lifecycle: LessonLifecycle;
  readonly catalogEntry: LessonCatalogEntry;
  readonly lesson: NormalizedLesson;
  readonly protectedAuthority: LessonProtectedAuthority;
  readonly authoredBindings: AuthoredLessonBindings;
  readonly artifactHashes: LessonRevisionArtifactHashes;
  readonly inputHashes: readonly LessonRevisionInputHash[];
}

export type LessonLearnerAccessMode =
  | 'ACTIVE_DISCOVERY'
  | 'ACTIVE_LOAD'
  | 'EXACT_RESUME'
  | 'LEGACY_COMPATIBILITY';

export type LessonLearnerDeliveryBlockReason = 'DISABLED' | 'KILL_SWITCH_ENGAGED' | 'RETIRED';

/**
 * Storage-neutral learner-delivery contract for the filesystem adapter and WP-11
 * Postgres repository. `loadExactRevision` addresses the pinned immutable revision
 * rather than the active pointer, but intentionally still honors disabled,
 * kill-switch, and retired emergency controls during learner resume.
 */
export interface LessonRevisionProvider {
  listActiveCatalogEntries(): Promise<readonly LessonCatalogEntry[]>;
  resolveSlug(slug: string): Promise<LessonCatalogIdentity>;
  loadActiveRevision(reference: ActiveLessonReference): Promise<LoadedLessonRevision>;
  /** Learner resume by pinned revision; active-pointer changes do not affect this address. */
  loadExactRevision(lessonId: string, definitionHash: string): Promise<LoadedLessonRevision>;
}

export type LessonCatalogProvider = LessonRevisionProvider;

export type RepoLessonCatalogDefinition = Omit<LessonCatalogEntry, 'activeDefinitionHash'> & {
  readonly activeDefinitionHash?: string;
};

export interface RepoLessonRevisionProviderOptions {
  readonly contentRoot?: string;
  readonly catalog?: readonly RepoLessonCatalogDefinition[];
  /** Explicit exceptions to the ID-derived slug rule; defaults to L1's approved legacy route. */
  readonly approvedLegacySlugs?: Readonly<Record<string, string>>;
}

export type LessonProviderErrorCode =
  | 'ACTIVE_REVISION_MISSING'
  | 'CATALOG_REQUIRED_FOR_CUSTOM_ROOT'
  | 'COMPATIBILITY_UNAVAILABLE'
  | 'DUPLICATE_LESSON_ID'
  | 'DUPLICATE_LESSON_ID_LOCATION'
  | 'DUPLICATE_REVISION_LOCATION'
  | 'DUPLICATE_SLUG'
  | 'HASH_MISMATCH'
  | 'INVALID_CATALOG'
  | 'INVALID_REVISION'
  | 'KILL_SWITCH_ENGAGED'
  | 'LESSON_DISABLED'
  | 'LESSON_RETIRED'
  | 'LIFECYCLE_MISMATCH'
  | 'PROTECTED_CATALOG_LEAK'
  | 'REVISION_NOT_FOUND'
  | 'UNKNOWN_LESSON'
  | 'UNKNOWN_SLUG';

export class LessonProviderError extends Error {
  constructor(
    readonly code: LessonProviderErrorCode,
    message: string,
    readonly detail: Readonly<Record<string, unknown>> = {},
  ) {
    super(message);
    this.name = 'LessonProviderError';
  }
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

/** Resolve safely in ESM tests and in the CommonJS Lambda bundle. */
export function resolveModuleDir(dirnameGlobal: unknown, importMetaUrl: unknown): string {
  if (typeof dirnameGlobal === 'string' && dirnameGlobal.length > 0) return dirnameGlobal;
  if (typeof importMetaUrl === 'string' && importMetaUrl.length > 0) {
    try {
      return dirname(fileURLToPath(importMetaUrl));
    } catch {
      return process.cwd();
    }
  }
  return process.cwd();
}

function moduleDirname(): string {
  const dirnameGlobal = typeof __dirname === 'string' ? __dirname : undefined;
  const importMetaUrl =
    typeof import.meta !== 'undefined' && typeof import.meta.url === 'string'
      ? import.meta.url
      : undefined;
  return resolveModuleDir(dirnameGlobal, importMetaUrl);
}

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

function readArtifacts(dir: string, includePresentationPlan = false): RawLessonArtifacts {
  const learnerSafePath = join(dir, 'learner-safe-items.json');
  const protectedPath = join(dir, 'protected-items.json');
  const presentationPath = join(dir, 'lesson-presentation-plan.json');
  return {
    script: readJsonFile(join(dir, 'lesson-script.json')),
    learnerSafeItems: existsSync(learnerSafePath) ? readJsonFile(learnerSafePath) : undefined,
    protectedItems: existsSync(protectedPath) ? readJsonFile(protectedPath) : undefined,
    presentationPlan:
      includePresentationPlan && existsSync(presentationPath)
        ? readJsonFile(presentationPath)
        : undefined,
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

function buildL1AnswerKey(normalized: NormalizedLesson): ServerAnswerKey {
  const scored = normalized.items.filter((item) => item.scored);
  const byItemId: Record<string, ServerItemAnswer> = {};
  for (const item of scored) byItemId[item.itemId] = resolveL1Answer(normalized.lessonId, item);
  return { lessonId: normalized.lessonId, definitionHash: normalized.definitionHash, byItemId };
}

const DEFAULT_APPROVED_LEGACY_SLUGS: Readonly<Record<string, string>> = {
  'V3-LES-130923': 'vectors-and-trigonometry',
};

const DEFAULT_CATALOG_DEFINITIONS: readonly RepoLessonCatalogDefinition[] = [
  {
    lessonId: 'V3-LES-130923',
    slug: 'vectors-and-trigonometry',
    title: 'Vectors and Trigonometry',
    section: null,
    cluster: 'R1',
    estimatedMinutes: 12,
    orderedKcIds: ['V3-KC-866848', 'V3-KC-700208', 'V3-KC-159529'],
    prerequisiteLessonIds: [],
    runtimeKind: 'vector',
    lifecycle: 'DRAFT',
    enabled: true,
    killSwitch: 'OPEN',
    routePath: '/app/lessons/vectors-and-trigonometry',
    candidateNonclaimStatus: 'INTERNAL_DRAFT_ONLY',
  },
  {
    lessonId: 'V3-LES-789208',
    slug: 'v3-les-789208',
    title: 'Quantitative Measurement and Scaling',
    section: null,
    cluster: 'R1',
    estimatedMinutes: 15,
    orderedKcIds: ['V3-KC-399019', 'V3-KC-799492', 'V3-KC-919842', 'V3-KC-981438'],
    prerequisiteLessonIds: [],
    runtimeKind: 'normalized',
    lifecycle: 'DRAFT',
    enabled: true,
    killSwitch: 'OPEN',
    routePath: '/app/lessons/v3-les-789208',
    candidateNonclaimStatus: 'INTERNAL_DRAFT_ONLY',
  },
  {
    lessonId: 'V3-LES-844372',
    slug: 'v3-les-844372',
    title: 'Algebra and Graphs',
    section: null,
    cluster: 'R1',
    estimatedMinutes: 12,
    orderedKcIds: ['V3-KC-452593', 'V3-KC-008681', 'V3-KC-238607'],
    prerequisiteLessonIds: [],
    runtimeKind: 'normalized',
    lifecycle: 'DRAFT',
    enabled: true,
    killSwitch: 'OPEN',
    routePath: '/app/lessons/v3-les-844372',
    candidateNonclaimStatus: 'INTERNAL_DRAFT_ONLY',
  },
];

interface RevisionLocation {
  readonly lessonId: string;
  readonly expectedDefinitionHash: string;
  readonly directory: string;
}

interface RevisionDiscovery {
  readonly byLessonId: ReadonlyMap<string, ReadonlyMap<string, RevisionLocation>>;
  readonly directHashByLessonId: ReadonlyMap<string, string>;
}

interface JsonArtifact {
  readonly value: unknown;
  readonly sha256: string;
}

interface RevisionSnapshot {
  readonly artifacts: RawLessonArtifacts;
  readonly actualDefinitionHash: LessonDefinitionHash;
  readonly lessonId: string;
  readonly lifecycle: LessonLifecycle;
  readonly artifactHashes: LessonRevisionArtifactHashes;
  readonly inputHashes: readonly LessonRevisionInputHash[];
  readonly authoredBindings: AuthoredLessonBindings;
}

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

function readJsonArtifact(path: string): JsonArtifact {
  const bytes = readFileSync(path);
  return {
    value: JSON.parse(bytes.toString('utf8')),
    sha256: sha256(bytes),
  };
}

function readOptionalJsonArtifact(path: string): JsonArtifact | undefined {
  return existsSync(path) ? readJsonArtifact(path) : undefined;
}

function scriptIdentity(directory: string): { lessonId: string; definitionHash: string } {
  const script = asRecord(readJsonFile(join(directory, 'lesson-script.json')));
  const payload = asRecord(script?.payload);
  if (typeof payload?.lesson_id !== 'string' || typeof script?.content_sha256 !== 'string') {
    throw new LessonProviderError(
      'INVALID_REVISION',
      `lesson revision at "${directory}" has no lesson id or definition hash`,
      { directory },
    );
  }
  return { lessonId: payload.lesson_id, definitionHash: script.content_sha256 };
}

function discoverRevisions(contentRoot: string): RevisionDiscovery {
  const mutable = new Map<string, Map<string, RevisionLocation>>();
  const directHashByLessonId = new Map<string, string>();
  const directLocationByLessonId = new Map<string, string>();
  const sortedPaths = (left: string, right: string): readonly string[] =>
    [left, right].sort((a, b) => a.localeCompare(b));
  const add = (location: RevisionLocation): void => {
    let byHash = mutable.get(location.lessonId);
    if (byHash === undefined) {
      byHash = new Map<string, RevisionLocation>();
      mutable.set(location.lessonId, byHash);
    }
    const existing = byHash.get(location.expectedDefinitionHash);
    if (existing !== undefined && existing.directory !== location.directory) {
      const paths = sortedPaths(existing.directory, location.directory);
      throw new LessonProviderError(
        'DUPLICATE_REVISION_LOCATION',
        `revision ${location.lessonId}@${location.expectedDefinitionHash} exists at both "${paths[0]}" and "${paths[1]}"`,
        {
          lessonId: location.lessonId,
          definitionHash: location.expectedDefinitionHash,
          paths,
        },
      );
    }
    byHash.set(location.expectedDefinitionHash, location);
  };

  if (existsSync(contentRoot)) {
    const lessonEntries = readdirSync(contentRoot, { withFileTypes: true }).sort((left, right) =>
      left.name.localeCompare(right.name),
    );
    for (const entry of lessonEntries) {
      if (!entry.isDirectory()) continue;
      const lessonDirectory = join(contentRoot, entry.name);
      if (existsSync(join(lessonDirectory, 'lesson-script.json'))) {
        const identity = scriptIdentity(lessonDirectory);
        const parsed = LessonDefinitionHashSchema.safeParse(identity.definitionHash);
        if (!parsed.success) {
          throw new LessonProviderError(
            'HASH_MISMATCH',
            `direct revision for ${identity.lessonId} has an invalid definition hash`,
            { lessonId: identity.lessonId, definitionHash: identity.definitionHash },
          );
        }
        const existingDirect = directLocationByLessonId.get(identity.lessonId);
        if (existingDirect !== undefined && existingDirect !== lessonDirectory) {
          const paths = sortedPaths(existingDirect, lessonDirectory);
          throw new LessonProviderError(
            'DUPLICATE_LESSON_ID_LOCATION',
            `lesson id "${identity.lessonId}" exists at both "${paths[0]}" and "${paths[1]}"`,
            { lessonId: identity.lessonId, paths },
          );
        }
        directLocationByLessonId.set(identity.lessonId, lessonDirectory);
        directHashByLessonId.set(identity.lessonId, parsed.data);
        add({
          lessonId: identity.lessonId,
          expectedDefinitionHash: parsed.data,
          directory: lessonDirectory,
        });
      }

      const revisionsDirectory = join(lessonDirectory, 'revisions');
      if (!existsSync(revisionsDirectory)) continue;
      const revisionEntries = readdirSync(revisionsDirectory, { withFileTypes: true }).sort(
        (left, right) => left.name.localeCompare(right.name),
      );
      for (const revisionEntry of revisionEntries) {
        if (!revisionEntry.isDirectory()) continue;
        const directory = join(revisionsDirectory, revisionEntry.name);
        if (!existsSync(join(directory, 'lesson-script.json'))) continue;
        const address = LessonDefinitionHashSchema.safeParse(revisionEntry.name);
        if (!address.success) {
          throw new LessonProviderError(
            'HASH_MISMATCH',
            `revision directory "${revisionEntry.name}" is not a definition hash`,
            { directory },
          );
        }
        add({
          lessonId: scriptIdentity(directory).lessonId,
          expectedDefinitionHash: address.data,
          directory,
        });
      }
    }
  }
  return { byLessonId: mutable, directHashByLessonId };
}

const PROTECTED_CATALOG_KEYS = new Set([
  'acceptedresponses',
  'answerauthority',
  'answerkey',
  'correctanswer',
  'correctchoiceid',
  'protectedref',
  'rationale',
  'scoringauthority',
  'sourceref',
  'structuredauthority',
]);

function assertNoProtectedCatalogFields(value: unknown, path = 'catalog'): void {
  if (value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoProtectedCatalogFields(entry, `${path}[${index}]`));
    return;
  }
  for (const [key, child] of Object.entries(value as JsonRecord)) {
    const canonical = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (PROTECTED_CATALOG_KEYS.has(canonical)) {
      throw new LessonProviderError(
        'PROTECTED_CATALOG_LEAK',
        `protected catalog field "${key}" is forbidden at ${path}`,
        { field: key, path },
      );
    }
    assertNoProtectedCatalogFields(child, `${path}.${key}`);
  }
}

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

function buildCatalog(
  discovery: RevisionDiscovery,
  options: RepoLessonRevisionProviderOptions,
): readonly LessonCatalogEntry[] {
  const definitions =
    options.catalog ??
    DEFAULT_CATALOG_DEFINITIONS.filter((definition) =>
      discovery.byLessonId.has(definition.lessonId),
    );
  if (options.contentRoot !== undefined) {
    const coveredLessonIds = new Set(definitions.map((definition) => definition.lessonId));
    const uncoveredLessonIds = [...discovery.byLessonId.keys()]
      .filter((lessonId) => !coveredLessonIds.has(lessonId))
      .sort((left, right) => left.localeCompare(right));
    if (uncoveredLessonIds.length > 0) {
      throw new LessonProviderError(
        'CATALOG_REQUIRED_FOR_CUSTOM_ROOT',
        `custom content root requires explicit catalog metadata for: ${uncoveredLessonIds.join(
          ', ',
        )}`,
        { lessonIds: uncoveredLessonIds },
      );
    }
  }
  const approvedLegacySlugs = {
    ...DEFAULT_APPROVED_LEGACY_SLUGS,
    ...options.approvedLegacySlugs,
  };
  const seenIds = new Set<string>();
  const seenSlugs = new Set<string>();
  const entries: LessonCatalogEntry[] = [];

  for (const definition of definitions) {
    assertNoProtectedCatalogFields(definition);
    const activeDefinitionHash =
      definition.activeDefinitionHash ?? discovery.directHashByLessonId.get(definition.lessonId);
    if (activeDefinitionHash === undefined) {
      throw new LessonProviderError(
        'ACTIVE_REVISION_MISSING',
        `active revision is absent for ${definition.lessonId}`,
        { lessonId: definition.lessonId },
      );
    }
    let entry: LessonCatalogEntry;
    try {
      entry = LessonCatalogEntrySchema.parse({ ...definition, activeDefinitionHash });
    } catch (error) {
      throw new LessonProviderError(
        'INVALID_CATALOG',
        `invalid catalog entry for ${definition.lessonId}: ${messageOf(error)}`,
        { lessonId: definition.lessonId },
      );
    }
    if (seenIds.has(entry.lessonId)) {
      throw new LessonProviderError(
        'DUPLICATE_LESSON_ID',
        `duplicate lesson id "${entry.lessonId}"`,
        { lessonId: entry.lessonId },
      );
    }
    if (seenSlugs.has(entry.slug)) {
      throw new LessonProviderError('DUPLICATE_SLUG', `duplicate slug "${entry.slug}"`, {
        slug: entry.slug,
      });
    }
    seenIds.add(entry.lessonId);
    seenSlugs.add(entry.slug);
    if (
      entry.slug !== entry.lessonId.toLowerCase() &&
      approvedLegacySlugs[entry.lessonId] !== entry.slug
    ) {
      throw new LessonProviderError(
        'INVALID_CATALOG',
        `${entry.lessonId} slug "${entry.slug}" is neither ID-based nor approved`,
        { lessonId: entry.lessonId, slug: entry.slug },
      );
    }
    if (!discovery.byLessonId.get(entry.lessonId)?.has(entry.activeDefinitionHash)) {
      throw new LessonProviderError(
        'ACTIVE_REVISION_MISSING',
        `active revision ${entry.activeDefinitionHash} is absent for ${entry.lessonId}`,
        { lessonId: entry.lessonId, definitionHash: entry.activeDefinitionHash },
      );
    }
    entries.push(entry);
  }

  for (const entry of entries) {
    for (const prerequisite of entry.prerequisiteLessonIds) {
      if (!seenIds.has(prerequisite)) {
        throw new LessonProviderError(
          'INVALID_CATALOG',
          `${entry.lessonId} prerequisite ${prerequisite} is outside this catalog`,
          { lessonId: entry.lessonId, prerequisite },
        );
      }
    }
  }
  try {
    return LessonCatalogResponseSchema.parse({
      lessons: entries.sort((left, right) => left.lessonId.localeCompare(right.lessonId)),
    }).lessons;
  } catch (error) {
    throw new LessonProviderError('INVALID_CATALOG', `invalid lesson catalog: ${messageOf(error)}`);
  }
}

function authoredBindingsOf(script: JsonRecord, lessonId: string): AuthoredLessonBindings {
  const payload = asRecord(script.payload);
  return {
    lessonId,
    artifactVersion:
      typeof script.artifact_version === 'string' ? script.artifact_version : undefined,
    entries: asArray(payload?.question_evidence_plan)
      .map(asRecord)
      .filter((entry): entry is JsonRecord => entry !== undefined),
  };
}

function revisionInputHashes(script: JsonRecord, lessonId: string): LessonRevisionInputHash[] {
  const hashes: LessonRevisionInputHash[] = [];
  const seen = new Set<string>();
  for (const raw of asArray(script.input_bindings)) {
    const binding = asRecord(raw);
    if (
      binding === undefined ||
      typeof binding.input_id !== 'string' ||
      typeof binding.sha256 !== 'string'
    ) {
      throw new LessonProviderError(
        'INVALID_REVISION',
        `${lessonId} has an incomplete input hash binding`,
        { lessonId },
      );
    }
    const hash = LessonDefinitionHashSchema.safeParse(binding.sha256);
    if (!hash.success) {
      throw new LessonProviderError(
        'HASH_MISMATCH',
        `${lessonId} input "${binding.input_id}" has an invalid SHA-256`,
        { lessonId, inputId: binding.input_id },
      );
    }
    if (seen.has(binding.input_id)) {
      throw new LessonProviderError(
        'INVALID_REVISION',
        `${lessonId} has duplicate input hash "${binding.input_id}"`,
        { lessonId, inputId: binding.input_id },
      );
    }
    seen.add(binding.input_id);
    hashes.push({ inputId: binding.input_id, sha256: hash.data });
  }
  return hashes;
}

function readRevisionSnapshot(location: RevisionLocation): RevisionSnapshot {
  const scriptArtifact = readJsonArtifact(join(location.directory, 'lesson-script.json'));
  const script = asRecord(scriptArtifact.value);
  const payload = asRecord(script?.payload);
  if (script === undefined || typeof payload?.lesson_id !== 'string') {
    throw new LessonProviderError(
      'INVALID_REVISION',
      `revision ${location.expectedDefinitionHash} has no lesson identity`,
      { directory: location.directory },
    );
  }
  if (payload.lesson_id !== location.lessonId) {
    throw new LessonProviderError(
      'INVALID_REVISION',
      `revision identity ${payload.lesson_id} does not match ${location.lessonId}`,
      { lessonId: location.lessonId, actualLessonId: payload.lesson_id },
    );
  }
  const actualDefinitionHash = LessonDefinitionHashSchema.safeParse(script.content_sha256);
  if (
    !actualDefinitionHash.success ||
    actualDefinitionHash.data !== location.expectedDefinitionHash
  ) {
    throw new LessonProviderError(
      'HASH_MISMATCH',
      `revision ${location.lessonId}@${location.expectedDefinitionHash} contains hash "${String(
        script.content_sha256,
      )}"`,
      {
        lessonId: location.lessonId,
        expectedDefinitionHash: location.expectedDefinitionHash,
        actualDefinitionHash: script.content_sha256,
      },
    );
  }
  const lifecycle = LessonLifecycleSchema.safeParse(script.artifact_status);
  if (!lifecycle.success) {
    throw new LessonProviderError(
      'LIFECYCLE_MISMATCH',
      `${location.lessonId}@${location.expectedDefinitionHash} has unknown lifecycle "${String(
        script.artifact_status,
      )}"`,
      { lessonId: location.lessonId, lifecycle: script.artifact_status },
    );
  }

  const learnerSafe = readOptionalJsonArtifact(join(location.directory, 'learner-safe-items.json'));
  const protectedItems = readOptionalJsonArtifact(join(location.directory, 'protected-items.json'));
  const presentationPlan = readOptionalJsonArtifact(
    join(location.directory, 'lesson-presentation-plan.json'),
  );
  return {
    artifacts: {
      script,
      learnerSafeItems: learnerSafe?.value,
      protectedItems: protectedItems?.value,
      presentationPlan: presentationPlan?.value,
    },
    actualDefinitionHash: actualDefinitionHash.data,
    lessonId: location.lessonId,
    lifecycle: lifecycle.data,
    artifactHashes: {
      lessonScript: scriptArtifact.sha256,
      learnerSafeItems: learnerSafe?.sha256 ?? null,
      protectedItems: protectedItems?.sha256 ?? null,
      presentationPlan: presentationPlan?.sha256 ?? null,
    },
    inputHashes: revisionInputHashes(script, location.lessonId),
    authoredBindings: authoredBindingsOf(script, location.lessonId),
  };
}

function learnerDeliveryBlockReason(
  entry: LessonCatalogEntry,
): LessonLearnerDeliveryBlockReason | undefined {
  if (!entry.enabled) return 'DISABLED';
  if (entry.killSwitch === 'ENGAGED') return 'KILL_SWITCH_ENGAGED';
  if (entry.lifecycle === 'RETIRED') return 'RETIRED';
  return undefined;
}

const isVisible = (entry: LessonCatalogEntry): boolean =>
  learnerDeliveryBlockReason(entry) === undefined;

const sameStrings = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index]);

class RepoLessonStore {
  readonly entries: readonly LessonCatalogEntry[];
  readonly lessonIds: readonly string[];
  private readonly byLessonId: ReadonlyMap<string, LessonCatalogEntry>;
  private readonly bySlug: ReadonlyMap<string, LessonCatalogEntry>;
  private readonly cache = new Map<string, LoadedLessonRevision>();

  constructor(
    private readonly discovery: RevisionDiscovery,
    entries: readonly LessonCatalogEntry[],
  ) {
    this.entries = entries;
    this.lessonIds = entries.filter(isVisible).map((entry) => entry.lessonId);
    this.byLessonId = new Map(entries.map((entry) => [entry.lessonId, entry]));
    this.bySlug = new Map(entries.map((entry) => [entry.slug, entry]));
  }

  hasLesson(lessonId: string): boolean {
    const entry = this.byLessonId.get(lessonId);
    return entry !== undefined && isVisible(entry);
  }

  listVisible(): readonly LessonCatalogEntry[] {
    return this.entries.filter(isVisible);
  }

  resolveSlug(slug: string): LessonCatalogIdentity {
    const entry = this.bySlug.get(slug);
    if (entry === undefined) {
      throw new LessonProviderError('UNKNOWN_SLUG', `unknown lesson slug "${slug}"`, { slug });
    }
    this.assertLearnerDeliverable(entry, 'ACTIVE_DISCOVERY');
    return LessonCatalogIdentitySchema.parse({
      lessonId: entry.lessonId,
      slug: entry.slug,
      activeDefinitionHash: entry.activeDefinitionHash,
    });
  }

  loadActive(reference: ActiveLessonReference): LoadedLessonRevision {
    const byLessonId = 'lessonId' in reference && reference.lessonId !== undefined;
    const entry = byLessonId
      ? this.byLessonId.get(reference.lessonId)
      : this.bySlug.get(reference.slug);
    if (entry === undefined) {
      const code = byLessonId ? 'UNKNOWN_LESSON' : 'UNKNOWN_SLUG';
      const value = byLessonId ? reference.lessonId : reference.slug;
      throw new LessonProviderError(code, `unknown lesson identity "${value}"`, { value });
    }
    this.assertLearnerDeliverable(entry, 'ACTIVE_LOAD');
    return this.loadExact(entry.lessonId, entry.activeDefinitionHash);
  }

  /**
   * Loads a pinned immutable revision for learner resume. The active pointer is
   * irrelevant, while current emergency delivery controls remain authoritative.
   */
  loadExact(lessonId: string, definitionHash: string): LoadedLessonRevision {
    const entry = this.byLessonId.get(lessonId);
    if (entry === undefined) {
      throw new LessonProviderError('UNKNOWN_LESSON', `unknown lesson "${lessonId}"`, {
        lessonId,
      });
    }
    this.assertLearnerDeliverable(entry, 'EXACT_RESUME');
    const requestedHash = LessonDefinitionHashSchema.safeParse(definitionHash);
    if (!requestedHash.success) {
      throw new LessonProviderError(
        'HASH_MISMATCH',
        `requested revision hash "${definitionHash}" is invalid`,
        { lessonId, definitionHash },
      );
    }
    const location = this.discovery.byLessonId.get(lessonId)?.get(requestedHash.data);
    if (location === undefined) {
      throw new LessonProviderError(
        'REVISION_NOT_FOUND',
        `revision ${lessonId}@${requestedHash.data} was not found`,
        { lessonId, definitionHash: requestedHash.data },
      );
    }
    const cacheKey = `${lessonId}@${requestedHash.data}`;
    const cached = this.cache.get(cacheKey);
    if (cached !== undefined) return cached;

    const snapshot = readRevisionSnapshot(location);
    const active = requestedHash.data === entry.activeDefinitionHash;
    if (active && snapshot.lifecycle !== entry.lifecycle) {
      throw new LessonProviderError(
        'LIFECYCLE_MISMATCH',
        `active revision lifecycle ${snapshot.lifecycle} does not match catalog lifecycle ${entry.lifecycle}`,
        {
          lessonId,
          definitionHash: requestedHash.data,
          revisionLifecycle: snapshot.lifecycle,
          catalogLifecycle: entry.lifecycle,
        },
      );
    }

    const grammar = detectGrammar(snapshot.artifacts.script);
    let lesson: NormalizedLesson;
    let answerKey: ServerAnswerKey;
    if (grammar === 'L1_INLINE') {
      lesson = normalizeLesson(snapshot.artifacts);
      answerKey = buildL1AnswerKey(lesson);
    } else {
      const compilation = compileCanonicalLesson(snapshot.artifacts);
      lesson = compilation.lesson;
      answerKey = compilation.answerKey;
    }
    if (
      lesson.lessonId !== lessonId ||
      lesson.definitionHash !== requestedHash.data ||
      answerKey.lessonId !== lessonId ||
      answerKey.definitionHash !== requestedHash.data
    ) {
      throw new LessonProviderError(
        'HASH_MISMATCH',
        `compiled revision identity does not match ${lessonId}@${requestedHash.data}`,
        {
          lessonId,
          definitionHash: requestedHash.data,
          compiledLessonId: lesson.lessonId,
          compiledDefinitionHash: lesson.definitionHash,
        },
      );
    }
    if (active) {
      const expectedRuntime = grammar === 'L1_INLINE' ? 'vector' : 'normalized';
      if (entry.runtimeKind !== expectedRuntime) {
        throw new LessonProviderError(
          'INVALID_REVISION',
          `${lessonId} runtime ${entry.runtimeKind} contradicts grammar ${grammar}`,
          { lessonId, runtimeKind: entry.runtimeKind, grammar },
        );
      }
      if (!sameStrings(entry.orderedKcIds, lesson.orderedKcIds)) {
        throw new LessonProviderError(
          'INVALID_REVISION',
          `${lessonId} catalog KC order does not match its active revision`,
          { lessonId },
        );
      }
    }

    const loaded: LoadedLessonRevision = {
      lessonId,
      definitionHash: snapshot.actualDefinitionHash,
      lifecycle: snapshot.lifecycle,
      catalogEntry: entry,
      lesson,
      protectedAuthority: { answerKey },
      authoredBindings: snapshot.authoredBindings,
      artifactHashes: snapshot.artifactHashes,
      inputHashes: snapshot.inputHashes,
    };
    this.cache.set(cacheKey, loaded);
    return loaded;
  }

  legacyArtifacts(lessonId: string): RawLessonArtifacts {
    const entry = this.byLessonId.get(lessonId);
    if (entry === undefined) throw new UnknownLessonError(lessonId, this.lessonIds);
    this.assertLearnerDeliverable(entry, 'LEGACY_COMPATIBILITY');
    const location = this.discovery.byLessonId.get(lessonId)?.get(entry.activeDefinitionHash);
    if (location === undefined) throw new UnknownLessonError(lessonId, this.lessonIds);
    return readArtifacts(location.directory);
  }

  private assertLearnerDeliverable(
    entry: LessonCatalogEntry,
    accessMode: LessonLearnerAccessMode,
  ): void {
    const reason = learnerDeliveryBlockReason(entry);
    if (reason !== undefined) {
      const code: LessonProviderErrorCode =
        reason === 'DISABLED'
          ? 'LESSON_DISABLED'
          : reason === 'KILL_SWITCH_ENGAGED'
            ? 'KILL_SWITCH_ENGAGED'
            : 'LESSON_RETIRED';
      throw new LessonProviderError(
        code,
        `lesson "${entry.lessonId}" is unavailable for ${accessMode.toLowerCase()}: ${reason.toLowerCase()}`,
        {
          lessonId: entry.lessonId,
          accessMode,
          reason,
          enabled: entry.enabled,
          killSwitch: entry.killSwitch,
          lifecycle: entry.lifecycle,
        },
      );
    }
  }
}

/** Storage-neutral source used by filesystem and Aurora-backed providers. */
export interface LessonArtifactSource {
  listLessonIds(): readonly string[];
  hasLesson(lessonId: string): boolean;
  readArtifacts(lessonId: string): RawLessonArtifacts;
  readScriptRecord(lessonId: string): Record<string, unknown> | undefined;
}

/** Build the synchronous compatibility surface over any immutable artifact source. */
export function createLessonContentProvider(source: LessonArtifactSource): LessonContentProvider {
  const normalizedCache = new Map<string, NormalizedLesson>();
  const answerCache = new Map<string, ServerAnswerKey>();
  const authoredCache = new Map<string, AuthoredLessonBindings>();

  const ensureKnown = (lessonId: string): void => {
    if (!source.hasLesson(lessonId)) throw new UnknownLessonError(lessonId, source.listLessonIds());
  };
  const normalizedOf = (lessonId: string): NormalizedLesson => {
    const cached = normalizedCache.get(lessonId);
    if (cached !== undefined) return cached;
    ensureKnown(lessonId);
    const artifacts = source.readArtifacts(lessonId);
    const grammar = detectGrammar(artifacts.script);
    const lesson =
      grammar === 'L1_INLINE'
        ? normalizeLesson(artifacts)
        : compileCanonicalLesson(artifacts).lesson;
    normalizedCache.set(lessonId, lesson);
    return lesson;
  };

  return {
    listLessonIds: () => source.listLessonIds(),
    hasLesson: (lessonId) => source.hasLesson(lessonId),
    getNormalizedLesson: normalizedOf,
    getDefinitionHash: (lessonId) => normalizedOf(lessonId).definitionHash,
    getAnswerKey: (lessonId) => {
      const cached = answerCache.get(lessonId);
      if (cached !== undefined) return cached;
      const artifacts = source.readArtifacts(lessonId);
      const lesson = normalizedOf(lessonId);
      const answerKey =
        lesson.grammar === 'L1_INLINE'
          ? buildL1AnswerKey(lesson)
          : compileCanonicalLesson(artifacts).answerKey;
      answerCache.set(lessonId, answerKey);
      return answerKey;
    },
    getAuthoredBindings: (lessonId) => {
      const cached = authoredCache.get(lessonId);
      if (cached !== undefined) return cached;
      ensureKnown(lessonId);
      const script = source.readScriptRecord(lessonId);
      if (script === undefined) throw new UnknownLessonError(lessonId, source.listLessonIds());
      const bindings = authoredBindingsOf(script, lessonId);
      authoredCache.set(lessonId, bindings);
      return bindings;
    },
  };
}

const REPO_STORE = Symbol('repoLessonStore');
type RepoBackedLessonRevisionProvider = LessonRevisionProvider & {
  readonly [REPO_STORE]: RepoLessonStore;
};

export function createRepoLessonRevisionProvider(
  options: RepoLessonRevisionProviderOptions = {},
): LessonRevisionProvider {
  const discovery = discoverRevisions(options.contentRoot ?? DEFAULT_CONTENT_ROOT);
  const store = new RepoLessonStore(discovery, buildCatalog(discovery, options));
  const provider: RepoBackedLessonRevisionProvider = {
    [REPO_STORE]: store,
    listActiveCatalogEntries: async () => store.listVisible(),
    resolveSlug: async (slug) => store.resolveSlug(slug),
    loadActiveRevision: async (reference) => store.loadActive(reference),
    loadExactRevision: async (lessonId, definitionHash) =>
      store.loadExact(lessonId, definitionHash),
  };
  return provider;
}

function repoStoreOf(provider: LessonRevisionProvider): RepoLessonStore {
  const store = (provider as Partial<RepoBackedLessonRevisionProvider>)[REPO_STORE];
  if (store === undefined) {
    throw new LessonProviderError(
      'COMPATIBILITY_UNAVAILABLE',
      'the synchronous compatibility adapter only supports the repository provider',
    );
  }
  return store;
}

/**
 * Temporary filesystem-only adapter for synchronous runtime callers. It
 * deliberately omits the presentation plan to preserve their pre-WP-05C model.
 */
export function createLessonContentProviderCompatibilityAdapter(
  provider: LessonRevisionProvider,
): LessonContentProvider {
  const store = repoStoreOf(provider);
  const normalizedCache = new Map<string, NormalizedLesson>();
  const answerCache = new Map<string, ServerAnswerKey>();
  const authoringCache = new Map<string, AuthoredLessonBindings>();

  const artifactsOf = (lessonId: string): RawLessonArtifacts => store.legacyArtifacts(lessonId);
  const normalizedOf = (lessonId: string): NormalizedLesson => {
    const cached = normalizedCache.get(lessonId);
    if (cached !== undefined) return cached;
    const normalized = normalizeLesson(artifactsOf(lessonId));
    normalizedCache.set(lessonId, normalized);
    return normalized;
  };

  return {
    listLessonIds: () => store.lessonIds,
    hasLesson: (lessonId) => store.hasLesson(lessonId),
    getNormalizedLesson: normalizedOf,
    getDefinitionHash: (lessonId) => normalizedOf(lessonId).definitionHash,
    getAnswerKey: (lessonId) => {
      const cached = answerCache.get(lessonId);
      if (cached !== undefined) return cached;
      const artifacts = artifactsOf(lessonId);
      let key: ServerAnswerKey;
      try {
        if (detectGrammar(artifacts.script) === 'L1_INLINE') {
          key = buildL1AnswerKey(normalizedOf(lessonId));
        } else {
          key = compileCanonicalLesson(artifacts).answerKey;
        }
      } catch (error) {
        if (
          error instanceof LessonNormalizationError &&
          error.detail.itemId !== undefined &&
          /^protected correct_option_index for ".+" is outside its learner choices$/.test(
            error.message,
          )
        ) {
          const compatibilityMessage = error.message.replace(
            'is outside its learner choices',
            'is out of range',
          );
          throw new AnswerKeyResolutionError(compatibilityMessage, {
            lessonId,
            ...(error.detail.itemId === undefined ? {} : { itemId: error.detail.itemId }),
          });
        }
        throw error;
      }
      answerCache.set(lessonId, key);
      return key;
    },
    getAuthoredBindings: (lessonId) => {
      const cached = authoringCache.get(lessonId);
      if (cached !== undefined) return cached;
      const script = asRecord(artifactsOf(lessonId).script);
      if (script === undefined) throw new UnknownLessonError(lessonId, store.lessonIds);
      const value = authoredBindingsOf(script, lessonId);
      authoringCache.set(lessonId, value);
      return value;
    },
  };
}

/** Existing construction signature, now explicitly routed through the adapter. */
export function createRepoLessonContentProvider(
  contentRoot: string = DEFAULT_CONTENT_ROOT,
): LessonContentProvider {
  return createLessonContentProviderCompatibilityAdapter(
    createRepoLessonRevisionProvider({ contentRoot }),
  );
}

/**
 * Adapt an immutable synchronous artifact provider (including Aurora) to the
 * revision-addressable runtime boundary.
 */
export function createLessonRevisionProviderCompatibilityAdapter(
  provider: LessonContentProvider,
): LessonRevisionProvider {
  const revisionCache = new Map<string, LoadedLessonRevision>();
  const entryOf = (lessonId: string): LessonCatalogEntry => {
    const lesson = provider.getNormalizedLesson(lessonId);
    const slug = lessonId.toLowerCase();
    return LessonCatalogEntrySchema.parse({
      lessonId,
      slug,
      title: lessonId,
      section: null,
      cluster: 'R1',
      estimatedMinutes: 15,
      orderedKcIds: [...lesson.orderedKcIds],
      prerequisiteLessonIds: [
        ...new Set(lesson.prerequisiteGates.map((gate) => gate.prerequisiteLessonId)),
      ],
      runtimeKind: lesson.grammar === 'L1_INLINE' ? 'vector' : 'normalized',
      lifecycle: 'DRAFT',
      activeDefinitionHash: lesson.definitionHash,
      enabled: true,
      killSwitch: 'OPEN',
      routePath: `/app/lessons/${slug}`,
      candidateNonclaimStatus: 'INTERNAL_DRAFT_ONLY',
    });
  };
  const revisionOf = (lessonId: string): LoadedLessonRevision => {
    const cached = revisionCache.get(lessonId);
    if (cached !== undefined) return cached;
    if (!provider.hasLesson(lessonId)) {
      throw new LessonProviderError('UNKNOWN_LESSON', `unknown lesson "${lessonId}"`, {
        lessonId,
      });
    }
    const lesson = provider.getNormalizedLesson(lessonId);
    const revision: LoadedLessonRevision = {
      lessonId,
      definitionHash: LessonDefinitionHashSchema.parse(lesson.definitionHash),
      lifecycle: 'DRAFT',
      catalogEntry: entryOf(lessonId),
      lesson,
      protectedAuthority: { answerKey: provider.getAnswerKey(lessonId) },
      authoredBindings: provider.getAuthoredBindings(lessonId),
      artifactHashes: {
        lessonScript: lesson.definitionHash,
        learnerSafeItems: null,
        protectedItems: null,
        presentationPlan: null,
      },
      inputHashes: [],
    };
    revisionCache.set(lessonId, revision);
    return revision;
  };
  const idForSlug = (slug: string): string | undefined =>
    provider.listLessonIds().find((lessonId) => lessonId.toLowerCase() === slug);

  return {
    listActiveCatalogEntries: async () => provider.listLessonIds().map(entryOf),
    resolveSlug: async (slug) => {
      const lessonId = idForSlug(slug);
      if (lessonId === undefined) {
        throw new LessonProviderError('UNKNOWN_SLUG', `unknown lesson slug "${slug}"`, { slug });
      }
      const entry = entryOf(lessonId);
      return LessonCatalogIdentitySchema.parse({
        lessonId,
        slug,
        activeDefinitionHash: entry.activeDefinitionHash,
      });
    },
    loadActiveRevision: async (reference) => {
      const lessonId = 'lessonId' in reference ? reference.lessonId : idForSlug(reference.slug);
      if (lessonId === undefined) {
        throw new LessonProviderError('UNKNOWN_SLUG', `unknown lesson slug "${reference.slug}"`, {
          slug: reference.slug,
        });
      }
      return revisionOf(lessonId);
    },
    loadExactRevision: async (lessonId, definitionHash) => {
      const revision = revisionOf(lessonId);
      if (revision.definitionHash !== definitionHash) {
        throw new LessonProviderError(
          'REVISION_NOT_FOUND',
          `revision ${lessonId}@${definitionHash} was not found`,
          { lessonId, definitionHash },
        );
      }
      return revision;
    },
  };
}

export interface AttachableLessonRevisionProvider extends LessonRevisionProvider {
  attach(secondary: LessonRevisionProvider): void;
}

const fallbackProviderError = (error: unknown): boolean =>
  error instanceof LessonProviderError &&
  ['UNKNOWN_LESSON', 'UNKNOWN_SLUG', 'REVISION_NOT_FOUND'].includes(error.code);

export function createCompositeLessonRevisionProvider(
  base: LessonRevisionProvider,
): AttachableLessonRevisionProvider {
  let secondary: LessonRevisionProvider | undefined;
  return {
    attach: (next) => {
      secondary = next;
    },
    listActiveCatalogEntries: async () => {
      const entries = [
        ...(await base.listActiveCatalogEntries()),
        ...(secondary === undefined ? [] : await secondary.listActiveCatalogEntries()),
      ];
      return LessonCatalogResponseSchema.parse({
        lessons: [...new Map(entries.map((entry) => [entry.lessonId, entry])).values()],
      }).lessons;
    },
    resolveSlug: async (slug) => {
      if (secondary !== undefined) {
        try {
          return await secondary.resolveSlug(slug);
        } catch (error) {
          if (!fallbackProviderError(error)) throw error;
        }
      }
      return base.resolveSlug(slug);
    },
    loadActiveRevision: async (reference) => {
      if (secondary !== undefined) {
        try {
          return await secondary.loadActiveRevision(reference);
        } catch (error) {
          if (!fallbackProviderError(error)) throw error;
        }
      }
      return base.loadActiveRevision(reference);
    },
    loadExactRevision: async (lessonId, definitionHash) => {
      if (secondary !== undefined) {
        try {
          return await secondary.loadExactRevision(lessonId, definitionHash);
        } catch (error) {
          if (!fallbackProviderError(error)) throw error;
        }
      }
      return base.loadExactRevision(lessonId, definitionHash);
    },
  };
}

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

const repoLessonRevisionProvider = createRepoLessonRevisionProvider();

/** Async provider used by normalized lesson workflow and exact run resume. */
export const lessonRevisionProvider: AttachableLessonRevisionProvider =
  createCompositeLessonRevisionProvider(repoLessonRevisionProvider);

/** Default synchronous compatibility surface for the current runtime. */
export const lessonContentProvider: AttachableLessonContentProvider =
  createCompositeLessonContentProvider(
    createLessonContentProviderCompatibilityAdapter(repoLessonRevisionProvider),
  );
