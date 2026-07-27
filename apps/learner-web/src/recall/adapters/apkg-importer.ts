/**
 * Client-side `.apkg` importer: unzip (JSZip) + read the Anki SQLite (sql.js WASM),
 * render each card with the pure renderer from @mcat/recall-core, and stage media
 * blobs. Legacy-first: schema v11 (`collection.anki2` / `collection.anki21`). The
 * newest `.anki21b` (zstd + protobuf) is not parsed — we surface a friendly
 * "re-export for older Anki versions" message (MCAT_RECALL_FLASHCARDS_PLAN §5).
 *
 * Two phases: parseApkg() is read-only (for the preview/confirm step); commitImport()
 * stores media, rewrites card HTML to media placeholders, sanitizes, and persists.
 */
import JSZip from 'jszip';
import initSqlJs from 'sql.js';
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url';

type SqlJsStatic = Awaited<ReturnType<typeof initSqlJs>>;
type SqlDatabase = InstanceType<SqlJsStatic['Database']>;
import {
  newCardId,
  newNoteId,
  newScheduling,
  renderAnkiCard,
  type AnkiModel,
  type Card,
  type Note,
} from '@mcat/recall-core';
import { sanitizeCardHtml } from './html-sanitize';
import { RECALL_MEDIA_ATTR, type RecallMediaStore } from './media-store';
import type { RecallRepositoryWithBulk } from './indexeddb-repository';

/** Thrown when the file is the newest `.anki21b` format we can't parse yet. */
export class ApkgUnsupportedError extends Error {
  constructor() {
    super(
      'This deck was exported in the newest Anki format. In Anki, re-export with ' +
        '“Support older Anki versions” checked, then import that file.',
    );
    this.name = 'ApkgUnsupportedError';
  }
}

export interface PreparedCard {
  card: Card;
  mediaFilenames: string[];
}

export interface ImportCounts {
  cards: number;
  notes: number;
  images: number;
  audio: number;
  skipped: number;
}

export interface PreparedImport {
  notes: Note[];
  cards: PreparedCard[];
  mediaByFilename: Map<string, Blob>;
  counts: ImportCounts;
  warnings: string[];
}

export interface ImportSummary {
  cards: number;
  notes: number;
  media: number;
}

const AUDIO_EXTS = new Set(['mp3', 'ogg', 'oga', 'wav', 'm4a', 'aac', 'flac', 'opus']);
const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif']);

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  avif: 'image/avif',
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  flac: 'audio/flac',
  opus: 'audio/opus',
};

let sqlPromise: Promise<SqlJsStatic> | null = null;
const getSql = (): Promise<SqlJsStatic> =>
  (sqlPromise ??= initSqlJs({ locateFile: () => sqlWasmUrl }));

const extOf = (filename: string): string => filename.split('.').pop()?.toLowerCase() ?? '';

interface RawModel {
  id?: number | string;
  name?: string;
  type?: number;
  flds?: { name: string; ord: number }[];
  tmpls?: { name: string; ord: number; qfmt: string; afmt: string }[];
}

function toAnkiModel(mid: string, raw: RawModel): AnkiModel {
  return {
    id: String(raw.id ?? mid),
    name: raw.name ?? 'Model',
    type: raw.type ?? 0,
    flds: (raw.flds ?? []).map((f) => ({ name: f.name, ord: f.ord })),
    tmpls: (raw.tmpls ?? []).map((t) => ({
      ord: t.ord,
      name: t.name,
      qfmt: t.qfmt,
      afmt: t.afmt,
    })),
  };
}

function queryRows(db: SqlDatabase, sql: string): Record<string, unknown>[] {
  const result = db.exec(sql);
  if (result.length === 0) return [];
  const first = result[0];
  const columns = first.columns;
  return first.values.map((row) => {
    const record: Record<string, unknown> = {};
    columns.forEach((col, index) => {
      record[col] = row[index];
    });
    return record;
  });
}

/** Parse (read-only) an .apkg into staged notes/cards/media for a preview step. */
export async function parseApkg(
  file: File | Blob | ArrayBuffer,
  now: string = new Date().toISOString(),
): Promise<PreparedImport> {
  const zip = await JSZip.loadAsync(file);

  if (zip.file('collection.anki21b')) throw new ApkgUnsupportedError();
  const dbEntry = zip.file('collection.anki21') ?? zip.file('collection.anki2');
  if (!dbEntry) throw new Error('No Anki collection was found in this .apkg file.');

  const bytes = await dbEntry.async('uint8array');
  const SQL = await getSql();
  const db = new SQL.Database(bytes);

  const warnings: string[] = [];
  const notes: Note[] = [];
  const cards: PreparedCard[] = [];
  const mediaByFilename = new Map<string, Blob>();
  let skipped = 0;

  try {
    const col = queryRows(db, 'SELECT models, decks FROM col LIMIT 1')[0];
    const models = JSON.parse(String(col?.models ?? '{}')) as Record<string, RawModel>;
    const decks = JSON.parse(String(col?.decks ?? '{}')) as Record<string, { name?: string }>;

    const noteRows = queryRows(db, 'SELECT id, mid, flds, tags FROM notes');
    const noteById = new Map<string, { mid: string; fields: string[]; tags: string[] }>();
    const ourNoteIdByAnkiId = new Map<string, string>();

    for (const row of noteRows) {
      const ankiId = String(row.id);
      const mid = String(row.mid);
      const fields = String(row.flds ?? '').split('\u001f');
      const tags = String(row.tags ?? '')
        .split(/\s+/)
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
      noteById.set(ankiId, { mid, fields, tags });
    }

    const cardRows = queryRows(db, 'SELECT id, nid, did, ord FROM cards');

    for (const row of cardRows) {
      const ankiNoteId = String(row.nid);
      const note = noteById.get(ankiNoteId);
      const model = note ? models[note.mid] : undefined;
      if (!note || !model) {
        skipped += 1;
        continue;
      }

      const ankiModel = toAnkiModel(note.mid, model);
      const deckName = decks[String(row.did)]?.name;
      const ord = Number(row.ord ?? 0);

      const rendered = renderAnkiCard(
        ankiModel,
        { id: ankiNoteId, mid: note.mid, fields: note.fields, tags: note.tags },
        { id: String(row.id), nid: ankiNoteId, ord, ...(deckName ? { deckName } : {}) },
      );

      let ourNoteId = ourNoteIdByAnkiId.get(ankiNoteId);
      if (!ourNoteId) {
        ourNoteId = newNoteId();
        ourNoteIdByAnkiId.set(ankiNoteId, ourNoteId);
        const fieldMap: Record<string, string> = {};
        ankiModel.flds.forEach((field, index) => {
          fieldMap[field.name] = note.fields[index] ?? '';
        });
        notes.push({
          id: ourNoteId,
          source: 'imported',
          type: rendered.type,
          fields: fieldMap,
          tags: rendered.tags,
          createdAt: now,
          updatedAt: now,
        });
      }

      cards.push({
        card: {
          id: newCardId(),
          noteId: ourNoteId,
          type: rendered.type,
          source: 'imported',
          frontHtml: rendered.frontHtml,
          backHtml: rendered.backHtml,
          mediaRefs: [],
          tags: rendered.tags,
          scheduling: newScheduling(now),
          suspended: false,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        },
        mediaFilenames: rendered.mediaFilenames,
      });
    }

    // Media: the `media` file maps zip entry name → real filename.
    const mediaEntry = zip.file('media');
    const referenced = new Set(cards.flatMap((c) => c.mediaFilenames));
    if (mediaEntry && referenced.size > 0) {
      const map = JSON.parse(await mediaEntry.async('string')) as Record<string, string>;
      const zipKeyByRealName = new Map<string, string>();
      for (const [zipKey, realName] of Object.entries(map)) zipKeyByRealName.set(realName, zipKey);

      for (const filename of referenced) {
        const zipKey = zipKeyByRealName.get(filename);
        const entry = zipKey ? zip.file(zipKey) : null;
        if (!entry) {
          warnings.push(`Missing media file: ${filename}`);
          continue;
        }
        const buffer = await entry.async('arraybuffer');
        const mime = MIME_BY_EXT[extOf(filename)] ?? 'application/octet-stream';
        mediaByFilename.set(filename, new Blob([buffer], { type: mime }));
      }
    }

    let images = 0;
    let audio = 0;
    for (const filename of mediaByFilename.keys()) {
      const ext = extOf(filename);
      if (AUDIO_EXTS.has(ext)) audio += 1;
      else if (IMAGE_EXTS.has(ext)) images += 1;
    }

    return {
      notes,
      cards,
      mediaByFilename,
      counts: { cards: cards.length, notes: notes.length, images, audio, skipped },
      warnings,
    };
  } finally {
    db.close();
  }
}

function rewriteMediaSrc(html: string, filename: string, mediaId: string): string {
  const placeholder = `${RECALL_MEDIA_ATTR}="${mediaId}"`;
  return html
    .split(`src="${filename}"`)
    .join(placeholder)
    .split(`src='${filename}'`)
    .join(placeholder)
    .split(`src="./${filename}"`)
    .join(placeholder);
}

/** Persist a previously-parsed import: store media, rewrite + sanitize, save rows. */
export async function commitImport(
  repository: RecallRepositoryWithBulk,
  mediaStore: RecallMediaStore,
  prepared: PreparedImport,
): Promise<ImportSummary> {
  const idByFilename = new Map<string, string>();
  for (const [filename, blob] of prepared.mediaByFilename) {
    idByFilename.set(filename, await mediaStore.put(filename, blob));
  }

  const finalized: Card[] = prepared.cards.map(({ card, mediaFilenames }) => {
    let front = card.frontHtml;
    let back = card.backHtml;
    const mediaRefs: string[] = [];
    for (const filename of mediaFilenames) {
      const mediaId = idByFilename.get(filename);
      if (!mediaId) continue;
      front = rewriteMediaSrc(front, filename, mediaId);
      back = rewriteMediaSrc(back, filename, mediaId);
      mediaRefs.push(mediaId);
    }
    return {
      ...card,
      frontHtml: sanitizeCardHtml(front),
      backHtml: sanitizeCardHtml(back),
      mediaRefs,
    };
  });

  await repository.putNotes(prepared.notes);
  await repository.putCards(finalized);

  return { cards: finalized.length, notes: prepared.notes.length, media: idByFilename.size };
}
