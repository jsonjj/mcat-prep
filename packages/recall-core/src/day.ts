/**
 * Recall "day" boundary. Anki-style: the day rolls over at 04:00 local time, so a
 * late-night session still counts as the same study day. Used for session/day
 * grouping and to align with the mastery pipeline's due-review "session" notion
 * (docs/mastery-pipeline.md §4.4).
 */
import type { TimeInput } from './card';

export const RECALL_DAY_BOUNDARY_HOUR = 4;

const toDate = (t: TimeInput): Date => (t instanceof Date ? new Date(t.getTime()) : new Date(t));

/** Start of the recall day containing `now` (04:00 local by default). */
export function recallDayStart(now: TimeInput, boundaryHour: number = RECALL_DAY_BOUNDARY_HOUR): Date {
  const d = toDate(now);
  const start = new Date(d);
  start.setHours(boundaryHour, 0, 0, 0);
  if (d.getHours() < boundaryHour) {
    start.setDate(start.getDate() - 1);
  }
  return start;
}

/** Whether two instants fall within the same recall day. */
export function isSameRecallDay(
  a: TimeInput,
  b: TimeInput,
  boundaryHour: number = RECALL_DAY_BOUNDARY_HOUR,
): boolean {
  return recallDayStart(a, boundaryHour).getTime() === recallDayStart(b, boundaryHour).getTime();
}
