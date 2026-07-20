import { z } from 'zod';

/** Structured error codes distinguish validation / auth / conflict / version / retry / service. */
export const ErrorCodeSchema = z.enum([
  'validation_error',
  'unauthorized',
  'forbidden',
  'not_found',
  'conflict',
  'content_version_conflict',
  'idempotency_replay',
  'rate_limited',
  'retryable_service_error',
  'unavailable',
]);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const ApiErrorSchema = z.object({
  code: ErrorCodeSchema,
  message: z.string(),
  /** Machine-readable field path for validation errors (JSON Pointer-ish). */
  path: z.string().optional(),
  /** Non-sensitive detail bag; never contains keys, rationales, or free text. */
  details: z.record(z.unknown()).optional(),
  retryable: z.boolean().default(false),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly path: string | undefined;
  readonly retryable: boolean;
  readonly details: Record<string, unknown> | undefined;

  constructor(error: ApiError) {
    super(error.message);
    this.name = 'AppError';
    this.code = error.code;
    this.path = error.path;
    this.retryable = error.retryable ?? false;
    this.details = error.details;
  }

  toApiError(): ApiError {
    return {
      code: this.code,
      message: this.message,
      ...(this.path !== undefined ? { path: this.path } : {}),
      ...(this.details !== undefined ? { details: this.details } : {}),
      retryable: this.retryable,
    };
  }
}

export const isRetryable = (code: ErrorCode): boolean =>
  code === 'rate_limited' || code === 'retryable_service_error' || code === 'unavailable';
