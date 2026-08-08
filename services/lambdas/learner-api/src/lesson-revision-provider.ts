import { gunzipSync } from 'node:zlib';

import type { RawLessonArtifacts } from '@mcat/content/lesson-normalization';

import {
  createLessonContentProvider,
  UnknownLessonError,
  type LessonContentProvider,
} from './lesson-content-provider';

/**
 * Serve-time artifact bytes are stored gzip+base64-encoded (design note D5) so the
 * seed migration stays ~2.6MB instead of ~22MB. Decode is synchronous and runs once
 * per artifact at cold start (~333 small buffers), well within the boot budget.
 */
const decodeArtifact = (encoded: string): string =>
  gunzipSync(Buffer.from(encoded, 'base64')).toString('utf8');

/**
 * DB-backed lesson provider (design note D5). Resolves a content release's immutable
 * lesson revisions from Aurora and reads each revision's serve-time artifacts
 * (lesson-script.json + learner-safe-items.json + protected-items.json) — whose bytes
 * are stored in `lesson_revision_objects.bytes` — then serves them through the SAME
 * normalization + answer-key core the repo provider uses. No object store at serve
 * time; no learner-specific state; no bytes mutated.
 */

/** Minimal query surface — a `pg` Pool or Client satisfies it. */
export interface LessonRevisionQuery {
  query(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: Array<Record<string, unknown>> }>;
}

/** The three artifacts the normalizer + answer-key resolver need (carry bytes). */
const REQUIRED_ARTIFACTS = [
  'lesson-script.json',
  'learner-safe-items.json',
  'protected-items.json',
] as const;

/**
 * Load a DB-backed provider for one content release. The `LessonContentProvider`
 * surface is synchronous, so every revision's artifact bytes are read up front (cold
 * start) into memory and served in-process. Defaults to the single ACTIVE release for
 * the environment (the release gate); pass `releaseId` to load a specific candidate
 * (verification before activation). No matching release -> an empty provider (a safe
 * no-op the caller composes with the repo pilots).
 */
export async function loadLessonRevisionProvider(deps: {
  db: LessonRevisionQuery;
  environment?: string;
  releaseId?: string;
}): Promise<LessonContentProvider> {
  const environment = deps.environment ?? 'dev';

  let releaseId = deps.releaseId;
  if (releaseId === undefined) {
    const active = await deps.db.query(
      "select release_id from content_releases where environment = $1 and lifecycle = 'active'",
      [environment],
    );
    releaseId = active.rows[0]?.release_id as string | undefined;
  }

  // Load the COMPRESSED serve bytes at cold start (one query), grouped by lesson, but
  // DON'T gunzip/parse them yet. Decoding all ~111 lessons up front (gzip+base64 ->
  // ~22MB JSON) added ~0.5-0.7s to every cold start — dead weight for the plan,
  // progress, and bootstrap paths, which never call this provider. Instead decode each
  // lesson's artifacts on first access (synchronously, then cache), so cold start only
  // pays the query while lessons stay immediately servable (their bytes are in memory).
  const compressedByLesson = new Map<string, Map<string, string>>();
  if (releaseId !== undefined) {
    const rows = (
      await deps.db.query(
        `select lr.lesson_id, lro.artifact_path, lro.bytes
           from lesson_revisions lr
           join lesson_revision_objects lro using (lesson_id, content_sha256)
          where lr.release_id = $1
            and lro.artifact_path = any($2::text[])
            and lro.bytes is not null`,
        [releaseId, [...REQUIRED_ARTIFACTS]],
      )
    ).rows as Array<{ lesson_id: string; artifact_path: string; bytes: string }>;

    for (const row of rows) {
      const forLesson = compressedByLesson.get(row.lesson_id) ?? new Map<string, string>();
      forLesson.set(row.artifact_path, row.bytes);
      compressedByLesson.set(row.lesson_id, forLesson);
    }
  }

  const hasScript = (lessonId: string): boolean =>
    compressedByLesson.get(lessonId)?.has('lesson-script.json') ?? false;
  const ids = [...compressedByLesson.keys()].filter(hasScript).sort();

  const artifactCache = new Map<string, RawLessonArtifacts>();
  const scriptCache = new Map<string, Record<string, unknown>>();
  const materialize = (lessonId: string): RawLessonArtifacts => {
    const cached = artifactCache.get(lessonId);
    if (cached !== undefined) return cached;
    const files = compressedByLesson.get(lessonId);
    const scriptText = files?.get('lesson-script.json');
    if (files === undefined || scriptText === undefined) throw new UnknownLessonError(lessonId, ids);
    const script = JSON.parse(decodeArtifact(scriptText)) as Record<string, unknown>;
    const learnerSafe = files.get('learner-safe-items.json');
    const protectedItems = files.get('protected-items.json');
    const artifacts: RawLessonArtifacts = {
      script,
      learnerSafeItems:
        learnerSafe === undefined ? undefined : JSON.parse(decodeArtifact(learnerSafe)),
      protectedItems:
        protectedItems === undefined ? undefined : JSON.parse(decodeArtifact(protectedItems)),
    };
    artifactCache.set(lessonId, artifacts);
    scriptCache.set(lessonId, script);
    return artifacts;
  };

  return createLessonContentProvider({
    listLessonIds: () => ids,
    hasLesson: (lessonId) => hasScript(lessonId),
    readArtifacts: (lessonId) => materialize(lessonId),
    readScriptRecord: (lessonId) => {
      if (!scriptCache.has(lessonId) && hasScript(lessonId)) materialize(lessonId);
      return scriptCache.get(lessonId);
    },
  });
}
