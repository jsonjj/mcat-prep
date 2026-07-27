/**
 * App-facing Recall orchestrator. Wires the platform-neutral engine
 * (@mcat/recall-core) to the browser adapters (IndexedDB repo + media store +
 * sanitizer + .apkg importer). This is the single surface the UI/queries call.
 *
 * Boundary: this feature is fact-only and NEVER writes mastery (see
 * @mcat/recall-core mastery-boundary + docs/recall-mastery-boundary.md).
 */
import {
  applyLeech,
  clozeNumbersIn,
  estimateLoad,
  getReviewQueue,
  newCardId,
  newNoteId,
  newReviewId,
  newScheduling,
  rateScheduling,
  renderCloze,
  rollingSecondsPerCard,
  type Card,
  type CardQuery,
  type Note,
  type RecallLoad,
  type RecallRating,
  type RecallRequest,
  type ReviewLogEntry,
} from '@mcat/recall-core';
import { openRecallDb } from './adapters/db';
import { IndexedDbRecallRepository } from './adapters/indexeddb-repository';
import {
  IndexedDbMediaStore,
  mediaIdsIn,
  resolveMediaHtml,
  type RecallMediaStore,
} from './adapters/media-store';
import { sanitizeCardHtml } from './adapters/html-sanitize';
import {
  commitImport,
  parseApkg,
  type ImportSummary,
  type PreparedImport,
} from './adapters/apkg-importer';

const nowIso = (): string => new Date().toISOString();

function normalizeTags(tags: readonly string[]): string[] {
  return [...new Set(tags.map((t) => t.trim()).filter((t) => t.length > 0))];
}

export interface CreateBasicInput {
  front: string;
  back: string;
  tags: string[];
  reversed: boolean;
}

export interface CreateClozeInput {
  text: string;
  extra: string;
  tags: string[];
}

export class RecallService {
  constructor(
    private readonly repo: IndexedDbRecallRepository,
    private readonly media: RecallMediaStore,
  ) {}

  get mediaStore(): RecallMediaStore {
    return this.media;
  }

  /** Swap media placeholders for object URLs (for display). */
  resolveHtml(html: string): Promise<string> {
    return resolveMediaHtml(html, this.media);
  }

  listCards(query?: CardQuery): Promise<Card[]> {
    return this.repo.listCards(query);
  }

  getCard(id: string): Promise<Card | null> {
    return this.repo.getCard(id);
  }

  getNote(id: string): Promise<Note | null> {
    return this.repo.getNote(id);
  }

  listTrash(): Promise<Card[]> {
    return this.repo.listTrash();
  }

  private async secondsPerCard(): Promise<number> {
    const reviews = await this.repo.listReviews();
    const recent = reviews.slice(-100).map((r) => r.elapsedSeconds);
    return rollingSecondsPerCard(recent);
  }

  async estimateLoad(now: string = nowIso()): Promise<RecallLoad> {
    const cards = await this.repo.listCards();
    return estimateLoad(cards, now, await this.secondsPerCard());
  }

  /** The selection contract Today's Path will call (minutesBudget or maxCards). */
  async getQueue(request: RecallRequest = {}, now: string = nowIso()): Promise<Card[]> {
    const cards = await this.repo.listCards();
    const secondsPerCard = await this.secondsPerCard();
    return getReviewQueue(cards, {
      now,
      secondsPerCard,
      maxCards: request.maxCards,
      minutesBudget: request.minutesBudget,
    });
  }

  /** Apply one rating: reschedule via FSRS, auto-suspend leeches, log the review. */
  async recordReview(
    cardId: string,
    rating: RecallRating,
    elapsedSeconds: number,
    now: string = nowIso(),
  ): Promise<{ card: Card; review: ReviewLogEntry } | null> {
    const previous = await this.repo.getCard(cardId);
    if (!previous) return null;
    const { scheduling } = rateScheduling(previous.scheduling, rating, now);
    const card = applyLeech({ ...previous, scheduling, updatedAt: now });
    await this.repo.putCard(card);
    const review: ReviewLogEntry = {
      id: newReviewId(),
      cardId,
      reviewedAt: now,
      rating,
      elapsedSeconds,
      state: scheduling.state,
      stability: scheduling.stability,
      difficulty: scheduling.difficulty,
      scheduledDays: scheduling.scheduledDays,
    };
    await this.repo.appendReview(review);
    return { card, review };
  }

  /** Undo a review: restore the card's pre-review state and drop the logged review. */
  async undoReview(previousCard: Card, reviewId: string): Promise<void> {
    await this.repo.putCard(previousCard);
    await this.repo.deleteReview(reviewId);
  }

  async createBasic(input: CreateBasicInput, now: string = nowIso()): Promise<Card[]> {
    const noteId = newNoteId();
    const front = sanitizeCardHtml(input.front);
    const back = sanitizeCardHtml(input.back);
    const tags = normalizeTags(input.tags);
    await this.repo.putNote({
      id: noteId,
      source: 'user',
      type: 'basic',
      fields: { Front: front, Back: back },
      tags,
      createdAt: now,
      updatedAt: now,
    });
    const makeCard = (faceFront: string, faceBack: string): Card => ({
      id: newCardId(),
      noteId,
      type: 'basic',
      source: 'user',
      frontHtml: faceFront,
      backHtml: faceBack,
      mediaRefs: mediaIdsIn(`${faceFront} ${faceBack}`),
      tags,
      scheduling: newScheduling(now),
      suspended: false,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
    const cards = [makeCard(front, back)];
    if (input.reversed) cards.push(makeCard(back, front));
    await this.repo.putCards(cards);
    return cards;
  }

  async createCloze(input: CreateClozeInput, now: string = nowIso()): Promise<Card[]> {
    const noteId = newNoteId();
    const text = sanitizeCardHtml(input.text);
    const extra = sanitizeCardHtml(input.extra);
    const tags = normalizeTags(input.tags);
    await this.repo.putNote({
      id: noteId,
      source: 'user',
      type: 'cloze',
      fields: { Text: text, Extra: extra },
      tags,
      createdAt: now,
      updatedAt: now,
    });
    const numbers = clozeNumbersIn(text);
    const cards = (numbers.length > 0 ? numbers : [1]).map((clozeNumber) => {
      const front = sanitizeCardHtml(renderCloze(text, clozeNumber, false));
      const back = sanitizeCardHtml(
        renderCloze(text, clozeNumber, true) + (extra ? `<hr>${extra}` : ''),
      );
      return {
        id: newCardId(),
        noteId,
        type: 'cloze' as const,
        source: 'user' as const,
        frontHtml: front,
        backHtml: back,
        mediaRefs: mediaIdsIn(`${front} ${back}`),
        tags,
        scheduling: newScheduling(now),
        suspended: false,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
    });
    await this.repo.putCards(cards);
    return cards;
  }

  /** Edit an imported card in place (does not touch siblings; never resets scheduling). */
  async updateImportedCard(
    cardId: string,
    front: string,
    back: string,
    tags: string[],
    now: string = nowIso(),
  ): Promise<void> {
    const card = await this.repo.getCard(cardId);
    if (!card) return;
    const frontHtml = sanitizeCardHtml(front);
    const backHtml = sanitizeCardHtml(back);
    await this.repo.putCard({
      ...card,
      frontHtml,
      backHtml,
      tags: normalizeTags(tags),
      mediaRefs: mediaIdsIn(`${frontHtml} ${backHtml}`),
      updatedAt: now,
    });
  }

  /** Edit a user note; re-render and propagate to all sibling cards (keeps scheduling). */
  async updateUserNote(
    noteId: string,
    fields: Record<string, string>,
    tags: string[],
    now: string = nowIso(),
  ): Promise<void> {
    const note = await this.repo.getNote(noteId);
    if (!note) return;
    const normTags = normalizeTags(tags);
    const cleanFields: Record<string, string> = {};
    for (const [key, value] of Object.entries(fields)) cleanFields[key] = sanitizeCardHtml(value);
    await this.repo.putNote({ ...note, fields: cleanFields, tags: normTags, updatedAt: now });

    const faces = this.renderNoteFaces(note.type, cleanFields);
    const siblings = (await this.repo.listSiblingCards(noteId)).sort(
      (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
    );

    const updates: Card[] = [];
    const max = Math.max(faces.length, siblings.length);
    for (let i = 0; i < max; i += 1) {
      const face = faces[i];
      const sibling = siblings[i];
      if (face && sibling) {
        updates.push({
          ...sibling,
          frontHtml: face.front,
          backHtml: face.back,
          tags: normTags,
          mediaRefs: mediaIdsIn(`${face.front} ${face.back}`),
          updatedAt: now,
        });
      } else if (face && !sibling) {
        updates.push({
          id: newCardId(),
          noteId,
          type: note.type,
          source: 'user',
          frontHtml: face.front,
          backHtml: face.back,
          mediaRefs: mediaIdsIn(`${face.front} ${face.back}`),
          tags: normTags,
          scheduling: newScheduling(now),
          suspended: false,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        });
      } else if (!face && sibling) {
        updates.push({ ...sibling, deletedAt: now, updatedAt: now });
      }
    }
    await this.repo.putCards(updates);
  }

  private renderNoteFaces(
    type: Note['type'],
    fields: Record<string, string>,
  ): { front: string; back: string }[] {
    if (type === 'cloze') {
      const text = fields.Text ?? '';
      const extra = fields.Extra ?? '';
      const numbers = clozeNumbersIn(text);
      return (numbers.length > 0 ? numbers : [1]).map((n) => ({
        front: sanitizeCardHtml(renderCloze(text, n, false)),
        back: sanitizeCardHtml(renderCloze(text, n, true) + (extra ? `<hr>${extra}` : '')),
      }));
    }
    const front = fields.Front ?? '';
    const back = fields.Back ?? '';
    // A single face; a reversed pair is inferred from the existing sibling count.
    return [{ front, back }];
  }

  async setSuspended(cardId: string, suspended: boolean, now: string = nowIso()): Promise<void> {
    const card = await this.repo.getCard(cardId);
    if (!card) return;
    await this.repo.putCard({ ...card, suspended, updatedAt: now });
  }

  async resetCard(cardId: string, now: string = nowIso()): Promise<void> {
    const card = await this.repo.getCard(cardId);
    if (!card) return;
    await this.repo.putCard({ ...card, scheduling: newScheduling(now), updatedAt: now });
  }

  softDeleteCard(cardId: string, now: string = nowIso()): Promise<void> {
    return this.repo.softDeleteCard(cardId, now);
  }

  async softDeleteNote(noteId: string, now: string = nowIso()): Promise<void> {
    const siblings = await this.repo.listSiblingCards(noteId);
    await Promise.all(siblings.map((card) => this.repo.softDeleteCard(card.id, now)));
  }

  restoreCard(cardId: string): Promise<void> {
    return this.repo.restoreCard(cardId);
  }

  purgeCard(cardId: string): Promise<void> {
    return this.repo.purgeCard(cardId);
  }

  /** Read-only parse for the import preview step. */
  parseImport(file: File | Blob | ArrayBuffer): Promise<PreparedImport> {
    return parseApkg(file);
  }

  /** Persist a previously-parsed import. */
  commitImport(prepared: PreparedImport): Promise<ImportSummary> {
    return commitImport(this.repo, this.media, prepared);
  }
}

const serviceCache = new Map<string, RecallService>();

/** Get (or build) the Recall service for a learner, backed by their IndexedDB store. */
export function getRecallService(learnerId: string): RecallService {
  const cached = serviceCache.get(learnerId);
  if (cached) return cached;
  const dbPromise = openRecallDb(learnerId);
  const service = new RecallService(
    new IndexedDbRecallRepository(dbPromise),
    new IndexedDbMediaStore(dbPromise),
  );
  serviceCache.set(learnerId, service);
  return service;
}
