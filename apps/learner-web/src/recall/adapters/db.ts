/**
 * IndexedDB handle for the client-side Recall store. One database per learner
 * (namespaced by the app-owned learnerId) so isolation + deletion are trivial.
 * Media blobs live in the same DB but are managed by the media store.
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Card, Note, ReviewLogEntry } from '@mcat/recall-core';

export interface StoredMedia {
  id: string;
  filename: string;
  mime: string;
  blob: Blob;
}

export interface RecallDBSchema extends DBSchema {
  notes: { key: string; value: Note };
  cards: { key: string; value: Card; indexes: { byNote: string } };
  reviews: { key: string; value: ReviewLogEntry; indexes: { byCard: string } };
  media: { key: string; value: StoredMedia };
}

export type RecallDB = IDBPDatabase<RecallDBSchema>;

export const RECALL_DB_VERSION = 1;

const dbCache = new Map<string, Promise<RecallDB>>();

export function openRecallDb(learnerId: string): Promise<RecallDB> {
  const name = `mcat-recall-${learnerId}`;
  const existing = dbCache.get(name);
  if (existing) return existing;
  const opened = openDB<RecallDBSchema>(name, RECALL_DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('notes')) {
        db.createObjectStore('notes', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('cards')) {
        const cards = db.createObjectStore('cards', { keyPath: 'id' });
        cards.createIndex('byNote', 'noteId');
      }
      if (!db.objectStoreNames.contains('reviews')) {
        const reviews = db.createObjectStore('reviews', { keyPath: 'id' });
        reviews.createIndex('byCard', 'cardId');
      }
      if (!db.objectStoreNames.contains('media')) {
        db.createObjectStore('media', { keyPath: 'id' });
      }
    },
  });
  dbCache.set(name, opened);
  return opened;
}
