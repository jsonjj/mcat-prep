/**
 * Storage port for Recall. The platform supplies the implementation (v1: browser
 * IndexedDB in apps/learner-web; later a Postgres-backed server impl behind the
 * same interface — no UI/logic change). Kept DOM-free: media blobs are handled by
 * a separate platform media store, so this port only moves card/note/log metadata.
 *
 * All data is scoped to a single learner by the adapter (per app-owned learnerId).
 */
import type { Card, CardState, Note, ReviewLogEntry } from './card';

export interface CardQuery {
  /** Include suspended cards (default false). */
  includeSuspended?: boolean;
  /** Include soft-deleted (Trash) cards (default false). */
  includeDeleted?: boolean;
  tag?: string;
  state?: CardState;
  /** Case-insensitive substring match over front/back text and tags. */
  search?: string;
}

export interface RecallRepository {
  listCards(query?: CardQuery): Promise<Card[]>;
  getCard(id: string): Promise<Card | null>;
  putCard(card: Card): Promise<void>;
  putCards(cards: readonly Card[]): Promise<void>;
  /** Soft delete → Trash (recoverable; review history preserved). */
  softDeleteCard(id: string, deletedAt: string): Promise<void>;
  restoreCard(id: string): Promise<void>;
  /** Permanent removal (also removes the card's review-log rows). */
  purgeCard(id: string): Promise<void>;
  listTrash(): Promise<Card[]>;

  getNote(id: string): Promise<Note | null>;
  putNote(note: Note): Promise<void>;
  /** Sibling cards from one note (reversed pair, multi-blank cloze). */
  listSiblingCards(noteId: string): Promise<Card[]>;

  appendReview(entry: ReviewLogEntry): Promise<void>;
  listReviews(cardId?: string): Promise<ReviewLogEntry[]>;
}
