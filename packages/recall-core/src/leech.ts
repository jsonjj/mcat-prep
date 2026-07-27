/**
 * Leech handling: a card that keeps lapsing wastes review time. After
 * RECALL_LEECH_THRESHOLD lapses (default 8) the card is auto-suspended and
 * tagged `leech` so the learner can find and fix it. Reversible (unsuspend).
 */
import { RECALL_LEECH_THRESHOLD } from './fsrs';
import type { Card } from './card';

export const LEECH_TAG = 'leech';

export function isLeech(card: Card, threshold: number = RECALL_LEECH_THRESHOLD): boolean {
  return card.scheduling.lapses >= threshold;
}

/**
 * Suspend + tag a card that has reached the leech threshold. Idempotent and a
 * no-op for cards that are already suspended or below the threshold.
 */
export function applyLeech(card: Card, threshold: number = RECALL_LEECH_THRESHOLD): Card {
  if (card.suspended || !isLeech(card, threshold)) return card;
  const tags = card.tags.includes(LEECH_TAG) ? card.tags : [...card.tags, LEECH_TAG];
  return { ...card, suspended: true, tags };
}
