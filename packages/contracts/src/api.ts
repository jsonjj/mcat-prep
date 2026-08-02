import { z } from 'zod';
import { EventIdSchema, LearnerIdSchema } from './ids';
import { UtcTimestampSchema } from './time';
import { ApiErrorSchema } from './errors';
import { LearnerCommandSchema } from './commands';

/** Whether a valid, reviewed question bank is loaded. Learner question flows stay locked when not. */
export const BankStatusSchema = z.enum(['not_loaded', 'loaded']);
export type BankStatus = z.infer<typeof BankStatusSchema>;

export const CapabilitiesSchema = z
  .object({
    webgl: z.boolean(),
    reducedMotion: z.boolean(),
    push: z.boolean(),
    persistentStorage: z.boolean(),
    online: z.boolean(),
  })
  .strict();
export type Capabilities = z.infer<typeof CapabilitiesSchema>;

export const AccountStateSchema = z.enum(['guest', 'linked', 'recovering']);
export type AccountState = z.infer<typeof AccountStateSchema>;

/** Restore session, preferences, capabilities, current versions, and bank status. */
export const BootstrapResponseSchema = z
  .object({
    learnerId: LearnerIdSchema,
    accountState: AccountStateSchema,
    bankStatus: BankStatusSchema,
    contentRelease: z.string().min(1),
    apiVersion: z.literal('v1'),
    /** Whether onboarding (diagnostic + plan) is complete and learning is unlocked. */
    onboardingComplete: z.boolean(),
    serverTime: UtcTimestampSchema,
  })
  .strict();
export type BootstrapResponse = z.infer<typeof BootstrapResponseSchema>;

/** HTTP bootstrap adds the concurrency and CSRF state required for safe commands. */
export const GuestBootstrapResponseSchema = BootstrapResponseSchema.extend({
  streamVersion: z.number().int().nonnegative(),
  csrfToken: z.string().min(32),
}).strict();
export type GuestBootstrapResponse = z.infer<typeof GuestBootstrapResponseSchema>;

/**
 * Bootstrap for a visitor with no session.
 *
 * Bootstrap does not create a learner, so there is no `learnerId` to report and
 * nothing here is learner-specific. The CSRF token still ships because the
 * unauthenticated `/v1/auth/*` routes are state-changing and need a double-submit
 * pair; it authorizes nothing on its own.
 */
export const AnonymousBootstrapResponseSchema = z
  .object({
    authenticated: z.literal(false),
    apiVersion: z.literal('v1'),
    serverTime: UtcTimestampSchema,
    csrfToken: z.string().min(32),
  })
  .strict();
export type AnonymousBootstrapResponse = z.infer<typeof AnonymousBootstrapResponseSchema>;

export const AuthenticatedBootstrapResponseSchema = GuestBootstrapResponseSchema.extend({
  authenticated: z.literal(true),
}).strict();
export type AuthenticatedBootstrapResponse = z.infer<typeof AuthenticatedBootstrapResponseSchema>;

/**
 * What a learner app reads from bootstrap, as opposed to what the wire carries.
 *
 * `streamVersion` and `csrfToken` are HTTP transport state that the HTTP client
 * consumes on the caller's behalf, so they are deliberately absent here — which is
 * also what lets an in-process authority satisfy the port without inventing a
 * concurrency token and a CSRF token it has no use for.
 */
export type BootstrapView =
  | AnonymousBootstrapResponse
  | (BootstrapResponse & { authenticated: true });

/**
 * What `POST /v1/bootstrap` returns. The `authenticated` discriminant is what lets
 * the client tell "signed out" apart from "signed in", and it is the only shape in
 * which a learner id is ever present.
 */
export const BootstrapEnvelopeSchema = z.discriminatedUnion('authenticated', [
  AnonymousBootstrapResponseSchema,
  AuthenticatedBootstrapResponseSchema,
]);
export type BootstrapEnvelope = z.infer<typeof BootstrapEnvelopeSchema>;

/** Offline commands are applied in order; identity is always derived from the session. */
export const SyncSubmitRequestSchema = z
  .object({
    commands: z.array(LearnerCommandSchema).min(1).max(500),
  })
  .strict();
export type SyncSubmitRequest = z.infer<typeof SyncSubmitRequestSchema>;

export const EventAckSchema = z
  .object({
    eventId: EventIdSchema,
    status: z.enum(['accepted', 'duplicate', 'rejected', 'content_version_conflict']),
    sequence: z.number().int().nonnegative().optional(),
    error: ApiErrorSchema.optional(),
  })
  .strict();
export type EventAck = z.infer<typeof EventAckSchema>;

/** After sync, the server reports what it accepted and which projections changed. */
export const ReconciliationSummarySchema = z
  .object({
    acks: z.array(EventAckSchema),
    serverStreamVersion: z.number().int().nonnegative(),
    updatedProjections: z.array(
      z.enum(['plan', 'fsrs', 'mastery', 'errors', 'progress', 'readiness']),
    ),
    reconciledAt: UtcTimestampSchema,
  })
  .strict();
export type ReconciliationSummary = z.infer<typeof ReconciliationSummarySchema>;
