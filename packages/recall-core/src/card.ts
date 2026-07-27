/**
 * Recall card model (mastery-independent, platform-neutral).
 *
 * A "note" is authored content; a "card" is one reviewable face rendered from a
 * note (a reversed pair = 2 cards; each cloze number = its own card). Cards carry
 * their own FSRS scheduling state. Timestamps are ISO-8601 UTC strings so the
 * model serializes cleanly into IndexedDB (or, later, Postgres).
 *
 * This package never stores answer keys or mastery — see ./mastery-boundary.ts.
 */
import { z } from 'zod';
import { uuid, type UtcTimestamp } from '@mcat/contracts';

/** Accepted "now" inputs across the engine. Stored values are always ISO strings. */
export type TimeInput = UtcTimestamp | string | Date;

export const RecallRatingSchema = z.enum(['again', 'hard', 'good', 'easy']);
export type RecallRating = z.infer<typeof RecallRatingSchema>;

export const CardTypeSchema = z.enum(['basic', 'cloze']);
export type CardType = z.infer<typeof CardTypeSchema>;

export const CardSourceSchema = z.enum(['imported', 'user']);
export type CardSource = z.infer<typeof CardSourceSchema>;

export const CardStateSchema = z.enum(['new', 'learning', 'review', 'relearning']);
export type CardState = z.infer<typeof CardStateSchema>;

/** ISO-8601 UTC timestamp stored as a plain string. */
const Iso = z.string().min(1);

/** FSRS-6 scheduling state, stored per card. Mirrors ts-fsrs fields (serializable). */
export const CardSchedulingSchema = z
  .object({
    state: CardStateSchema,
    /** Next due instant (ISO). A card is "due" when due <= now. */
    due: Iso,
    stability: z.number(),
    difficulty: z.number(),
    /** Interval in days from the last review to `due` (ts-fsrs scheduled_days). */
    scheduledDays: z.number(),
    /** Current (re)learning step index (ts-fsrs learning_steps). */
    learningStep: z.number().int().min(0),
    reps: z.number().int().min(0),
    lapses: z.number().int().min(0),
    lastReviewedAt: Iso.nullable(),
  })
  .strict();
export type CardScheduling = z.infer<typeof CardSchedulingSchema>;

/** Authored note. `fields` holds raw authored values (Front/Back, or cloze Text/Extra). */
export const NoteSchema = z
  .object({
    id: z.string().min(1),
    source: CardSourceSchema,
    type: CardTypeSchema,
    fields: z.record(z.string(), z.string()),
    tags: z.array(z.string()),
    createdAt: Iso,
    updatedAt: Iso,
  })
  .strict();
export type Note = z.infer<typeof NoteSchema>;

/** A single reviewable card. `frontHtml`/`backHtml` are rendered + sanitized upstream. */
export const CardSchema = z
  .object({
    id: z.string().min(1),
    noteId: z.string().min(1),
    type: CardTypeSchema,
    source: CardSourceSchema,
    frontHtml: z.string(),
    backHtml: z.string(),
    /** Media ids referenced by this card; resolved to blobs by the platform media store. */
    mediaRefs: z.array(z.string()),
    tags: z.array(z.string()),
    scheduling: CardSchedulingSchema,
    suspended: z.boolean(),
    createdAt: Iso,
    updatedAt: Iso,
    /** Soft-delete marker (Trash). Null = active. */
    deletedAt: Iso.nullable(),
  })
  .strict();
export type Card = z.infer<typeof CardSchema>;

/** One row per rating; powers minutes surfacing and (later) FSRS parameter optimization. */
export const ReviewLogEntrySchema = z
  .object({
    id: z.string().min(1),
    cardId: z.string().min(1),
    reviewedAt: Iso,
    rating: RecallRatingSchema,
    /** Seconds spent before rating (front shown → rated). */
    elapsedSeconds: z.number().nonnegative(),
    state: CardStateSchema,
    stability: z.number(),
    difficulty: z.number(),
    scheduledDays: z.number(),
  })
  .strict();
export type ReviewLogEntry = z.infer<typeof ReviewLogEntrySchema>;

export const newNoteId = (): string => `note_${uuid()}`;
export const newCardId = (): string => `card_${uuid()}`;
export const newReviewId = (): string => `rev_${uuid()}`;

export const toMillis = (t: TimeInput): number =>
  t instanceof Date ? t.getTime() : Date.parse(t);

export const toIso = (t: TimeInput): string =>
  t instanceof Date ? t.toISOString() : new Date(t).toISOString();
