import { createHash } from 'node:crypto';

/**
 * The repository content-hash standard (Real Lesson Catalog D1). Verbatim
 * algorithm from the L1 generator (`v3-vector-lesson-artifacts.ts`), reproduced
 * here so the validator remains the source of truth AFTER the generator is
 * deleted in Phase 7: recursively key-sorted, whitespace-free JSON, UTF-8, SHA-256.
 *
 * `content_sha256` = SHA-256 of the canonical JSON with the `content_sha256`
 * field itself omitted. `file_sha256` = SHA-256 of the stored file bytes.
 */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
    .join(',')}}`;
}

export function sha256Hex(input: string): string {
  return createHash('sha256').update(Buffer.from(input, 'utf8')).digest('hex');
}

/** content_sha256 of a parsed artifact (its own `content_sha256` field excluded). */
export function contentSha256(json: unknown): string {
  if (json === null || typeof json !== 'object' || Array.isArray(json)) {
    return sha256Hex(canonicalize(json));
  }
  const { content_sha256: _omit, ...rest } = json as Record<string, unknown>;
  return sha256Hex(canonicalize(rest));
}

/** file_sha256 of the stored bytes. */
export function fileSha256(rawBytes: string): string {
  return sha256Hex(rawBytes);
}
