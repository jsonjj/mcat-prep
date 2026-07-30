import { contentSha256, fileSha256 } from './canonical';
import { PRIMARY_ARTIFACT_FILES } from './types';

/**
 * Content-hash rehash for a real lesson (Real Lesson Catalog, Phase 3 tool).
 *
 * After any authored edit to a lesson artifact (e.g. Phase 4 exit licensing), the
 * embedded `content_sha256`, the downstream dependency references, the manifest,
 * and the `file_sha256` of the stored bytes all go stale. This module recomputes
 * that chain deterministically, reusing the validator's canonical primitives so
 * "the thing that fixes hashes" and "the thing that checks hashes" can never drift.
 *
 * Design contract:
 *  - PURE (no file IO): the caller supplies current bytes and persists `writes`.
 *  - BYTE-FAITHFUL for the four primary artifacts — only their 64-hex hash
 *    substrings are replaced (own `content_sha256` + embedded upstream refs, which
 *    appear in BOTH `dependency_bindings` and `payload`). Every other byte — key
 *    order, whitespace, and historical `lineage.*.content_sha256` values (which are
 *    DIFFERENT hash strings and so are never matched) — is preserved untouched.
 *  - The manifest is metadata (not itself hash-pinned): it is parsed, its per-record
 *    `content_sha256`/`file_sha256` refreshed, and re-serialized (2-space + newline,
 *    matching the vendored form). Union of the L2 `file`-key and L3 `path`-key shapes.
 *  - IDEMPOTENT: rehashing an already-consistent lesson yields `changed: false`.
 */

/** Each primary artifact and the upstream primaries whose `content_sha256` it embeds. */
const UPSTREAM: Record<string, readonly string[]> = {
  'lesson-script.json': [],
  'kc-coverage-matrix.json': ['lesson-script.json'],
  'lesson-presentation-plan.json': ['lesson-script.json', 'kc-coverage-matrix.json'],
  'lesson-quality-report.json': ['lesson-script.json', 'kc-coverage-matrix.json', 'lesson-presentation-plan.json'],
};

const PRIMARY = PRIMARY_ARTIFACT_FILES as readonly string[];
const isPrimary = (relPath: string): boolean => PRIMARY.includes(relPath);

/** One artifact or companion file, read verbatim by the caller. */
export interface RehashFile {
  readonly relPath: string;
  readonly rawText: string;
}

export interface RehashChange {
  readonly relPath: string;
  readonly oldContentSha256: string | null;
  readonly newContentSha256: string;
}

export interface RehashPlan {
  /** Files whose stored bytes must be rewritten (primary artifacts and/or manifest). */
  readonly writes: readonly { readonly relPath: string; readonly newText: string }[];
  /** Old→new `content_sha256` for each primary artifact (for the CLI report). */
  readonly primaryContentSha: readonly RehashChange[];
  readonly changed: boolean;
}

function embeddedContentSha(rawText: string, relPath: string): string {
  const parsed: unknown = JSON.parse(rawText);
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`rehash: ${relPath} is not a JSON object`);
  }
  const sha = (parsed as Record<string, unknown>).content_sha256;
  if (typeof sha !== 'string' || sha.length === 0) {
    throw new Error(`rehash: ${relPath} has no embedded content_sha256 to rewrite`);
  }
  return sha;
}

/**
 * Recompute the content-hash chain for one lesson. `files` must contain the four
 * primary artifacts and may contain companions (learner-safe/protected/ledger) so
 * their `file_sha256` can be refreshed in the manifest. `manifestText` is `null`
 * for the L1 four-file envelope (no manifest).
 */
export function planLessonRehash(
  files: readonly RehashFile[],
  manifestText: string | null,
): RehashPlan {
  const byName = new Map(files.map((f) => [f.relPath, f.rawText] as const));
  const oldSha: Record<string, string> = {};
  const newSha: Record<string, string> = {};
  const newFileSha = new Map<string, string>();
  const writes: { relPath: string; newText: string }[] = [];
  const primaryContentSha: RehashChange[] = [];

  for (const name of PRIMARY) {
    const original = byName.get(name);
    if (original === undefined) throw new Error(`rehash: missing primary artifact ${name}`);
    const oldOwn = embeddedContentSha(original, name);
    oldSha[name] = oldOwn;

    // 1) point every embedded reference to an upstream artifact at its NEW content_sha256
    let raw = original;
    for (const up of UPSTREAM[name] ?? []) {
      const oldUp = oldSha[up];
      const newUp = newSha[up];
      if (oldUp !== undefined && newUp !== undefined && oldUp !== newUp) {
        raw = raw.split(oldUp).join(newUp);
      }
    }
    // 2) recompute OWN content_sha256 (canonical form, own field excluded) and embed it
    const own = contentSha256(JSON.parse(raw));
    newSha[name] = own;
    if (own !== oldOwn) raw = raw.split(oldOwn).join(own);

    newFileSha.set(name, fileSha256(raw));
    primaryContentSha.push({ relPath: name, oldContentSha256: oldOwn, newContentSha256: own });
    if (raw !== original) writes.push({ relPath: name, newText: raw });
  }

  // Refresh file_sha256 for every present companion from its (caller-supplied) bytes.
  for (const [relPath, rawText] of byName) {
    if (!isPrimary(relPath)) newFileSha.set(relPath, fileSha256(rawText));
  }

  if (manifestText !== null) {
    const parsed: unknown = JSON.parse(manifestText);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('rehash: artifact-manifest.json is not a JSON object');
    }
    const manifest = parsed as Record<string, unknown>;
    const updateRecord = (rec: unknown): void => {
      if (rec === null || typeof rec !== 'object' || Array.isArray(rec)) return;
      const r = rec as Record<string, unknown>;
      const rel = typeof r.file === 'string' ? r.file : typeof r.path === 'string' ? r.path : null;
      if (rel === null) return;
      if (isPrimary(rel) && 'content_sha256' in r) r.content_sha256 = newSha[rel];
      const fsha = newFileSha.get(rel);
      if (fsha !== undefined && 'file_sha256' in r) r.file_sha256 = fsha;
    };
    for (const key of ['primary_artifacts', 'companion_artifacts'] as const) {
      const arr = manifest[key];
      if (Array.isArray(arr)) arr.forEach(updateRecord);
    }
    updateRecord(manifest.protected_material); // L2 single-object shape
    updateRecord(manifest.learner_safe_projection); // L2 single-object shape
    const serialized = JSON.stringify(manifest, null, 2) + '\n';
    if (serialized !== manifestText) writes.push({ relPath: 'artifact-manifest.json', newText: serialized });
  }

  return { writes, primaryContentSha, changed: writes.length > 0 };
}
