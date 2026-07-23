export type Principal =
  | {
      readonly kind: 'guest';
      readonly learnerId: string;
      readonly sessionId: string;
    }
  | {
      readonly kind: 'linked';
      readonly learnerId: string;
      readonly sessionId: string;
    };

export type AuthorityKernelErrorCode =
  | 'content_version_conflict'
  | 'forbidden'
  | 'not_found'
  | 'stream_conflict'
  | 'unavailable'
  | 'validation_error';

export class AuthorityKernelError extends Error {
  readonly code: AuthorityKernelErrorCode;
  readonly retryable: boolean;
  readonly currentStreamVersion: number | undefined;

  constructor(options: {
    readonly code: AuthorityKernelErrorCode;
    readonly message: string;
    readonly retryable?: boolean;
    readonly currentStreamVersion?: number;
  }) {
    super(options.message);
    this.name = 'AuthorityKernelError';
    this.code = options.code;
    this.retryable = options.retryable ?? false;
    this.currentStreamVersion = options.currentStreamVersion;
  }
}

export const forbidden = (): AuthorityKernelError =>
  new AuthorityKernelError({
    code: 'forbidden',
    message: 'You do not have access to this learner resource.',
  });

export const notFound = (): AuthorityKernelError =>
  new AuthorityKernelError({
    code: 'not_found',
    message: 'The learner resource was not found.',
  });

export const streamConflict = (currentStreamVersion: number): AuthorityKernelError =>
  new AuthorityKernelError({
    code: 'stream_conflict',
    message: 'The learner stream has changed. Reconcile before retrying.',
    currentStreamVersion,
  });

export const validationError = (message: string): AuthorityKernelError =>
  new AuthorityKernelError({ code: 'validation_error', message });
