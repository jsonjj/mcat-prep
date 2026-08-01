import type { ResolvableIds } from './types';

const keysOf = (v: unknown): string[] =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? Object.keys(v as Record<string, unknown>) : [];

/**
 * Build the {@link ResolvableIds} catalogs R14 resolves against, from the parsed
 * in-repo authoring manifest (`curriculum/v3/v3-lesson-authoring-manifest.json`).
 * The caller reads the file (keeping the rule logic pure); this centralises the
 * index-extraction so the test and the Phase 4 CI wrapper agree.
 *
 * Verified against the manifest (2026-07-30): `kc_by_id` (422 KCs),
 * `source_anchor_by_id` (110), `sequence_relation_by_id` (1583) resolve every
 * KC / relation id the three lessons reference.
 */
export function buildResolvableIds(manifest: unknown): ResolvableIds {
  const root = manifest !== null && typeof manifest === 'object' ? (manifest as Record<string, unknown>) : {};
  const indexes = root.indexes !== null && typeof root.indexes === 'object' ? (root.indexes as Record<string, unknown>) : {};
  return {
    kcIds: new Set(keysOf(indexes.kc_by_id)),
    sourceAnchorIds: new Set(keysOf(indexes.source_anchor_by_id)),
    relationIds: new Set(keysOf(indexes.sequence_relation_by_id)),
  };
}
