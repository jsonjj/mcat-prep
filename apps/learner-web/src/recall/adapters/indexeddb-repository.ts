/**
 * IndexedDB implementation of the platform-neutral RecallRepository port. All data
 * is scoped to one learner via the per-learner database (see db.ts). Card counts
 * are client-scale (thousands), so list queries load-and-filter in memory.
 */
import type { Card, CardQuery, Note, RecallRepository, ReviewLogEntry } from '@mcat/recall-core';
import { htmlToText } from './html-sanitize';
import type { RecallDB } from './db';

/** The port plus the bulk note write used by the importer. */
export type RecallRepositoryWithBulk = RecallRepository & {
  putNotes(notes: readonly Note[]): Promise<void>;
};

function matchesQuery(card: Card, query: CardQuery): boolean {
  if (!query.includeDeleted && card.deletedAt !== null) return false;
  if (!query.includeSuspended && card.suspended) return false;
  if (query.state && card.scheduling.state !== query.state) return false;
  if (query.tag && !card.tags.includes(query.tag)) return false;
  if (query.search) {
    const needle = query.search.toLowerCase().trim();
    if (needle.length > 0) {
      const haystack = `${htmlToText(card.frontHtml)} ${htmlToText(card.backHtml)} ${card.tags.join(
        ' ',
      )}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
  }
  return true;
}

export class IndexedDbRecallRepository implements RecallRepositoryWithBulk {
  constructor(private readonly dbPromise: Promise<RecallDB>) {}

  async listCards(query: CardQuery = {}): Promise<Card[]> {
    const db = await this.dbPromise;
    const all = await db.getAll('cards');
    return all.filter((card) => matchesQuery(card, query));
  }

  async getCard(id: string): Promise<Card | null> {
    const db = await this.dbPromise;
    return (await db.get('cards', id)) ?? null;
  }

  async putCard(card: Card): Promise<void> {
    const db = await this.dbPromise;
    await db.put('cards', card);
  }

  async putCards(cards: readonly Card[]): Promise<void> {
    const db = await this.dbPromise;
    const tx = db.transaction('cards', 'readwrite');
    await Promise.all(cards.map((card) => tx.store.put(card)));
    await tx.done;
  }

  async softDeleteCard(id: string, deletedAt: string): Promise<void> {
    const db = await this.dbPromise;
    const card = await db.get('cards', id);
    if (!card) return;
    await db.put('cards', { ...card, deletedAt, updatedAt: deletedAt });
  }

  async restoreCard(id: string): Promise<void> {
    const db = await this.dbPromise;
    const card = await db.get('cards', id);
    if (!card) return;
    await db.put('cards', { ...card, deletedAt: null, updatedAt: new Date().toISOString() });
  }

  async purgeCard(id: string): Promise<void> {
    const db = await this.dbPromise;
    const tx = db.transaction(['cards', 'reviews'], 'readwrite');
    await tx.objectStore('cards').delete(id);
    const reviewIndex = tx.objectStore('reviews').index('byCard');
    let cursor = await reviewIndex.openCursor(id);
    while (cursor) {
      await cursor.delete();
      cursor = await cursor.continue();
    }
    await tx.done;
  }

  async listTrash(): Promise<Card[]> {
    const db = await this.dbPromise;
    const all = await db.getAll('cards');
    return all.filter((card) => card.deletedAt !== null);
  }

  async getNote(id: string): Promise<Note | null> {
    const db = await this.dbPromise;
    return (await db.get('notes', id)) ?? null;
  }

  async putNote(note: Note): Promise<void> {
    const db = await this.dbPromise;
    await db.put('notes', note);
  }

  async putNotes(notes: readonly Note[]): Promise<void> {
    const db = await this.dbPromise;
    const tx = db.transaction('notes', 'readwrite');
    await Promise.all(notes.map((note) => tx.store.put(note)));
    await tx.done;
  }

  async listSiblingCards(noteId: string): Promise<Card[]> {
    const db = await this.dbPromise;
    const cards = await db.getAllFromIndex('cards', 'byNote', noteId);
    return cards.filter((card) => card.deletedAt === null);
  }

  async appendReview(entry: ReviewLogEntry): Promise<void> {
    const db = await this.dbPromise;
    await db.put('reviews', entry);
  }

  async deleteReview(id: string): Promise<void> {
    const db = await this.dbPromise;
    await db.delete('reviews', id);
  }

  async listReviews(cardId?: string): Promise<ReviewLogEntry[]> {
    const db = await this.dbPromise;
    if (cardId) return db.getAllFromIndex('reviews', 'byCard', cardId);
    return db.getAll('reviews');
  }
}
