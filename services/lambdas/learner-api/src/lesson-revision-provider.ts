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

  const artifactsById = new Map<string, RawLessonArtifacts>();
  const scriptById = new Map<string, Record<string, unknown>>();

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

    const byLesson = new Map<string, Map<string, string>>();
    for (const row of rows) {
      const forLesson = byLesson.get(row.lesson_id) ?? new Map<string, string>();
      forLesson.set(row.artifact_path, row.bytes);
      byLesson.set(row.lesson_id, forLesson);
    }

    for (const [lessonId, files] of byLesson) {
      const scriptText = files.get('lesson-script.json');
      if (scriptText === undefined) continue; // no script -> not servable; skip
      const script = JSON.parse(decodeArtifact(scriptText)) as Record<string, unknown>;
      const learnerSafe = files.get('learner-safe-items.json');
      const protectedItems = files.get('protected-items.json');
      artifactsById.set(lessonId, {
        script,
        learnerSafeItems:
          learnerSafe === undefined ? undefined : JSON.parse(decodeArtifact(learnerSafe)),
        protectedItems:
          protectedItems === undefined ? undefined : JSON.parse(decodeArtifact(protectedItems)),
      });
      scriptById.set(lessonId, script);
    }
  }

  const ids = [...artifactsById.keys()].sort();
  return createLessonContentProvider({
    listLessonIds: () => ids,
    hasLesson: (lessonId) => artifactsById.has(lessonId),
    readArtifacts: (lessonId) => {
      const artifacts = artifactsById.get(lessonId);
      if (artifacts === undefined) throw new UnknownLessonError(lessonId, ids);
      return artifacts;
    },
    readScriptRecord: (lessonId) => scriptById.get(lessonId),
  });
}
