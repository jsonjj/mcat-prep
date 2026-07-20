import { z } from 'zod';
import { EventIdSchema, LearnerIdSchema } from './ids';
import { UtcTimestampSchema } from './time';
import { LearnerEventSchema } from './events';
import { ApiErrorSchema } from './errors';

/** Whether a valid, reviewed question bank is loaded. Learner question flows stay locked when not. */
export const BankStatusSchema = z.enum(['not_loaded', 'loaded']);
export type BankStatus = z.infer<typeof BankStatusSchema>;

export const CapabilitiesSchema = z.object({
  webgl: z.boolean(),
  reducedMotion: z.boolean(),
  push: z.boolean(),
  persistentStorage: z.boolean(),
  online: z.boolean(),
});
export type Capabilities = z.infer<typeof CapabilitiesSchema>;

export const AccountStateSchema = z.enum(['guest', 'linked', 'recovering']);
export type AccountState = z.infer<typeof AccountStateSchema>;

/** Restore session, preferences, capabilities, current versions, and bank status. */
export const BootstrapResponseSchema = z.object({
  learnerId: LearnerIdSchema,
  accountState: AccountStateSchema,
  bankStatus: BankStatusSchema,
  contentRelease: z.string().min(1),
  apiVersion: z.literal('v1'),
  /** Whether onboarding (diagnostic + plan) is complete and learning is unlocked. */
  onboardingComplete: z.boolean(),
  serverTime: UtcTimestampSchema,
});
export type BootstrapResponse = z.infer<typeof BootstrapResponseSchema>;

/** Offline queue submission. Events are applied in order; duplicates are rejected safely. */
export const SyncSubmitRequestSchema = z.object({
  events: z.array(LearnerEventSchema).max(500),
  /** Expected server stream version for optimistic concurrency, if known. */
  expectedStreamVersion: z.number().int().nonnegative().optional(),
});
export type SyncSubmitRequest = z.infer<typeof SyncSubmitRequestSchema>;

export const EventAckSchema = z.object({
  eventId: EventIdSchema,
  status: z.enum(['accepted', 'duplicate', 'rejected', 'content_version_conflict']),
  sequence: z.number().int().nonnegative().optional(),
  error: ApiErrorSchema.optional(),
});
export type EventAck = z.infer<typeof EventAckSchema>;

/** After sync, the server reports what it accepted and which projections changed. */
export const ReconciliationSummarySchema = z.object({
  acks: z.array(EventAckSchema),
  serverStreamVersion: z.number().int().nonnegative(),
  updatedProjections: z.array(
    z.enum(['plan', 'fsrs', 'mastery', 'errors', 'progress', 'readiness']),
  ),
  reconciledAt: UtcTimestampSchema,
});
export type ReconciliationSummary = z.infer<typeof ReconciliationSummarySchema>;
