export type PersistenceErrorCode =
  | 'conflict'
  | 'database_error'
  | 'invalid_input'
  | 'not_found'
  | 'retryable_database_error'
  | 'session_unavailable'
  | 'tenant_scope_violation';

export class PersistenceError extends Error {
  readonly code: PersistenceErrorCode;
  readonly retryable: boolean;
  readonly databaseCode: string | undefined;

  constructor(options: {
    readonly code: PersistenceErrorCode;
    readonly message: string;
    readonly retryable?: boolean;
    readonly databaseCode?: string;
  }) {
    super(options.message);
    this.name = 'PersistenceError';
    this.code = options.code;
    this.retryable = options.retryable ?? false;
    this.databaseCode = options.databaseCode;
  }
}

const RETRYABLE_SQLSTATES = new Set([
  '08000',
  '08003',
  '08006',
  '08001',
  '08004',
  '40001',
  '40P01',
  '55P03',
  '57014',
  '57P01',
]);

function databaseCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  const code = (error as { readonly code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

/** Converts driver failures to allowlisted, non-sensitive errors. */
export function toPersistenceError(error: unknown): PersistenceError {
  if (error instanceof PersistenceError) return error;
  const code = databaseCode(error);

  if (code === '23505') {
    return new PersistenceError({
      code: 'conflict',
      message: 'The authoritative write conflicts with an existing record.',
      databaseCode: code,
    });
  }
  if (code === '22P02' || code === '22007' || code === '23514') {
    return new PersistenceError({
      code: 'invalid_input',
      message: 'The persistence input is invalid.',
      databaseCode: code,
    });
  }
  if (code !== undefined && RETRYABLE_SQLSTATES.has(code)) {
    return new PersistenceError({
      code: 'retryable_database_error',
      message: 'The authority database is temporarily unavailable.',
      retryable: true,
      databaseCode: code,
    });
  }
  return new PersistenceError({
    code: 'database_error',
    message: 'The authority database operation failed.',
    retryable: code === undefined,
    ...(code === undefined ? {} : { databaseCode: code }),
  });
}
