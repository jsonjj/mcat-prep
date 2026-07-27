/**
 * Media store for Recall (images/audio). Blobs live in IndexedDB; at display time
 * we hand out short-lived object URLs. Card HTML stores a stable placeholder
 * attribute (`data-recall-media="<id>"`) instead of a volatile blob URL, so the
 * stored content survives reloads; resolveMediaHtml() swaps placeholders → URLs.
 */
import type { RecallDB } from './db';

export const RECALL_MEDIA_ATTR = 'data-recall-media';

export interface RecallMediaStore {
  /** Store a blob under a fresh id (returns the id). */
  put(filename: string, blob: Blob): Promise<string>;
  /** Resolve an id to a cached object URL, or null if missing. */
  getUrl(id: string): Promise<string | null>;
  /** Release all object URLs created this session (call on unmount). */
  revokeAll(): void;
}

export class IndexedDbMediaStore implements RecallMediaStore {
  private readonly urls = new Map<string, string>();

  constructor(private readonly dbPromise: Promise<RecallDB>) {}

  async put(filename: string, blob: Blob): Promise<string> {
    const db = await this.dbPromise;
    const id = `media_${crypto.randomUUID()}`;
    await db.put('media', { id, filename, mime: blob.type, blob });
    return id;
  }

  async getUrl(id: string): Promise<string | null> {
    const cached = this.urls.get(id);
    if (cached) return cached;
    const db = await this.dbPromise;
    const record = await db.get('media', id);
    if (!record) return null;
    const url = URL.createObjectURL(record.blob);
    this.urls.set(id, url);
    return url;
  }

  revokeAll(): void {
    for (const url of this.urls.values()) URL.revokeObjectURL(url);
    this.urls.clear();
  }
}

/** Media ids referenced by a card's HTML (via the placeholder attribute). */
export function mediaIdsIn(html: string): string[] {
  return [
    ...new Set(
      [...html.matchAll(/data-recall-media="([^"]+)"/g)]
        .map((match) => match[1])
        .filter((id): id is string => Boolean(id)),
    ),
  ];
}

/** Replace `data-recall-media="<id>"` placeholders with resolved `src` URLs for display. */
export async function resolveMediaHtml(html: string, store: RecallMediaStore): Promise<string> {
  const ids = new Set(
    [...html.matchAll(/data-recall-media="([^"]+)"/g)].map((match) => match[1]).filter(Boolean),
  );
  let out = html;
  for (const id of ids) {
    const url = await store.getUrl(id);
    if (url) out = out.split(`${RECALL_MEDIA_ATTR}="${id}"`).join(`src="${url}"`);
  }
  return out;
}
