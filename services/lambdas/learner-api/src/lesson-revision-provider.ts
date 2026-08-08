import type { RawLessonArtifacts } from '@mcat/content/lesson-normalization';

import {
  createLessonContentProvider,
  UnknownLessonError,
  type LessonContentProvider,
} from './lesson-content-provider';

/**
 * DB/storage-backed lesson provider (design note D5). It resolves a content
 * release's immutable lesson revisions from Aurora and fetches each revision's
 * raw artifacts (lesson-script.json + learner-safe-items.json + protected
 * -items.json) from content-addressed storage (S3 in prod; local files in tests),
 * then serves them through the SAME normalization + answer-key core the repo
 * provider uses. Nothing here is learner-specific and no bytes are mutated.
 */

/** Minimal query surface — a `pg` Pool or Client satisfies it. */
export interface LessonRevisionQuery {
  query(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: Array<Record<string, unknown>> }>;
}

/** Fetches an object's bytes (utf8) by its `content_objects.storage_key`. */
export type ObjectFetcher = (storageKey: string) => Promise<string>;

/** The three artifacts the normalizer + answer-key resolver need. */
const REQUIRED_ARTIFACTS = [
  'lesson-script.json',
  'learner-safe-items.json',
  'protected-items.json',
] as const;

/**
 * Load a DB/storage-backed provider for one content release. The
 * `LessonContentProvider` surface is synchronous, so every revision's artifacts
 * are fetched up front (cold start) into memory and served in-process.
 *
 * Defaults to the single ACTIVE release for the environment (the release gate);
 * pass `releaseId` to load a specific candidate (verification before activation).
 * If there is no matching release, the provider is simply empty — a safe no-op
 * the caller can compose with the repo provider.
 */
export async function loadLessonRevisionProvider(deps: {
  db: LessonRevisionQuery;
  fetchObject: ObjectFetcher;
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
        `select lr.lesson_id, lro.artifact_path, co.storage_key
           from lesson_revisions lr
           join lesson_revision_objects lro using (lesson_id, content_sha256)
           join content_objects co on co.content_version_id = lro.content_version_id
          where lr.release_id = $1 and lro.artifact_path = any($2::text[])`,
        [releaseId, [...REQUIRED_ARTIFACTS]],
      )
    ).rows as Array<{ lesson_id: string; artifact_path: string; storage_key: string }>;

    const storageKey = new Map<string, string>();
    const lessonIds = new Set<string>();
    for (const row of rows) {
      lessonIds.add(row.lesson_id);
      storageKey.set(`${row.lesson_id}\u0000${row.artifact_path}`, row.storage_key);
    }

    for (const lessonId of lessonIds) {
      const keyOf = (artifact: string): string | undefined =>
        storageKey.get(`${lessonId}\u0000${artifact}`);
      const scriptKey = keyOf('lesson-script.json');
      if (scriptKey === undefined) continue; // no script -> not servable; skip
      const script = JSON.parse(await deps.fetchObject(scriptKey)) as Record<string, unknown>;
      const learnerKey = keyOf('learner-safe-items.json');
      const protectedKey = keyOf('protected-items.json');
      artifactsById.set(lessonId, {
        script,
        learnerSafeItems: learnerKey ? JSON.parse(await deps.fetchObject(learnerKey)) : undefined,
        protectedItems: protectedKey ? JSON.parse(await deps.fetchObject(protectedKey)) : undefined,
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
