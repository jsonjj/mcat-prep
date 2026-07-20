import { z } from 'zod';

/** All timestamps are UTC ISO-8601 strings at the contract boundary. */
export const UtcTimestampSchema = z.string().datetime({ offset: true }).brand<'UtcTimestamp'>();
export type UtcTimestamp = z.infer<typeof UtcTimestampSchema>;

/** A clock abstraction so policies/tests are deterministic and time-injectable. */
export interface Clock {
  now(): UtcTimestamp;
}

export const systemClock: Clock = {
  now: () => new Date().toISOString() as UtcTimestamp,
};

export const fixedClock = (iso: string): Clock => {
  const value = UtcTimestampSchema.parse(iso);
  return { now: () => value };
};

export const toUtc = (d: Date): UtcTimestamp => d.toISOString() as UtcTimestamp;

export const daysBetween = (a: UtcTimestamp, b: UtcTimestamp): number => {
  const ms = Date.parse(b) - Date.parse(a);
  return ms / (1000 * 60 * 60 * 24);
};
