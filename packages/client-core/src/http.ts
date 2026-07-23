import {
  AcceptedCommandResponseSchema,
  AttemptCommandSchema,
  BootstrapResponseSchema,
  DiagnosticNextSchema,
  ErrorEntryViewSchema,
  GoalCommandSchema,
  GuestBootstrapResponseSchema,
  HTTP_API,
  HttpApiErrorSchema,
  MasteryMapEntrySchema,
  PracticeItemViewSchema,
  PracticeResultSchema,
  SkillSummarySchema,
  StudyStepViewSchema,
  TodayViewSchema,
  WrappedViewSchema,
  newEventId,
  newIdempotencyKey,
  newTaskInstanceId,
  type BootstrapResponse,
  type HttpApiError,
  type HttpErrorCode,
} from '@mcat/contracts';
import type { AuthorityPort, GoalInput, SessionPort } from './port';

interface RuntimeSchema<T> {
  parse(value: unknown): T;
}

export interface HttpAuthorityClientOptions {
  baseUrl: string;
  fetch?: typeof globalThis.fetch;
  session?: SessionPort;
}

export class ApiClientError extends Error {
  readonly code: HttpErrorCode;
  readonly requestId: string;
  readonly retryable: boolean;
  readonly path: string | undefined;
  readonly currentStreamVersion: number | undefined;

  private constructor(error: HttpApiError) {
    super(error.message);
    this.name = 'ApiClientError';
    this.code = error.code;
    this.requestId = error.requestId;
    this.retryable = error.retryable;
    this.path = error.path;
    this.currentStreamVersion = error.currentStreamVersion;
  }

  static from(error: HttpApiError): ApiClientError {
    return new ApiClientError(error);
  }
}

export class MemorySession implements SessionPort {
  private accessToken: string | null = null;
  private csrfToken: string | null = null;

  getAccessToken(): string | null {
    return this.accessToken;
  }

  setAccessToken(token: string | null): void {
    this.accessToken = token;
  }

  getCsrfToken(): string | null {
    return this.csrfToken;
  }

  setCsrfToken(token: string | null): void {
    this.csrfToken = token;
  }

  clear(): void {
    this.accessToken = null;
    this.csrfToken = null;
  }
}

const arrayOf = <T>(itemSchema: RuntimeSchema<T>): RuntimeSchema<T[]> => ({
  parse(value: unknown): T[] {
    if (!Array.isArray(value)) throw new TypeError('Expected an array response');
    return value.map((item) => itemSchema.parse(item));
  },
});

const nullable = <T>(schema: RuntimeSchema<T>): RuntimeSchema<T | null> => ({
  parse: (value: unknown) => (value === null ? null : schema.parse(value)),
});

const booleanResultSchema: RuntimeSchema<{ correct: boolean }> = {
  parse(value: unknown): { correct: boolean } {
    if (
      value === null ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      Object.keys(value).length !== 1 ||
      typeof (value as { correct?: unknown }).correct !== 'boolean'
    ) {
      throw new TypeError('Expected a strict boolean result response');
    }
    return { correct: (value as { correct: boolean }).correct };
  },
};

const safeUnavailable = (requestId: string): ApiClientError =>
  ApiClientError.from({
    code: 'unavailable',
    message: 'The service returned an invalid error response.',
    requestId,
    retryable: true,
  });

export class HttpAuthorityClient implements AuthorityPort {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly session: SessionPort;
  private readonly taskInstanceId = newTaskInstanceId();
  private streamVersion: number | undefined;
  private contentRelease: string | undefined;
  private currentQuestionId: string | undefined;

  constructor(options: HttpAuthorityClientOptions) {
    const url = new URL(options.baseUrl);
    this.baseUrl = url.toString().replace(/\/$/, '');
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.session = options.session ?? new MemorySession();
  }

  private async request<T>(
    path: string,
    schema: RuntimeSchema<T>,
    init: RequestInit = {},
  ): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set('accept', 'application/json');
    headers.set('cache-control', 'no-store');
    headers.set('content-type', 'application/json');

    const accessToken = this.session.getAccessToken();
    if (accessToken !== null) headers.set('authorization', `Bearer ${accessToken}`);

    const method = (init.method ?? 'GET').toUpperCase();
    const csrfToken = this.session.getCsrfToken();
    if (method !== 'GET' && method !== 'HEAD' && csrfToken !== null) {
      headers.set('x-csrf-token', csrfToken);
    }

    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      method,
      headers,
      credentials: 'include',
    });

    let json: unknown;
    try {
      json = await response.json();
    } catch {
      if (!response.ok) {
        throw safeUnavailable(response.headers.get('x-amzn-requestid') ?? 'unknown-request');
      }
      throw new TypeError('The service returned invalid JSON.');
    }

    if (!response.ok) {
      const parsed = HttpApiErrorSchema.safeParse(json);
      if (!parsed.success) {
        throw safeUnavailable(response.headers.get('x-amzn-requestid') ?? 'unknown-request');
      }
      throw ApiClientError.from(parsed.data);
    }

    return schema.parse(json);
  }

  private async ensureBootstrap(): Promise<void> {
    if (this.streamVersion === undefined || this.contentRelease === undefined) {
      await this.bootstrap();
    }
  }

  private async commandEnvelope() {
    await this.ensureBootstrap();
    return {
      eventId: newEventId(),
      idempotencyKey: newIdempotencyKey(),
      occurredAt: new Date().toISOString(),
      expectedStreamVersion: this.streamVersion!,
      contentRelease: this.contentRelease!,
      taskInstanceId: this.taskInstanceId,
    };
  }

  private accept(response: { streamVersion: number }): void {
    this.streamVersion = response.streamVersion;
  }

  private async acceptedCommand(path: string, body: unknown, method = 'POST'): Promise<void> {
    const response = await this.request(path, AcceptedCommandResponseSchema, {
      method,
      body: JSON.stringify(body),
    });
    this.accept(response);
  }

  async bootstrap(): Promise<BootstrapResponse> {
    const response = await this.request(HTTP_API.bootstrap.path, GuestBootstrapResponseSchema, {
      method: HTTP_API.bootstrap.method,
    });
    const { csrfToken, streamVersion, ...bootstrap } = response;
    this.session.setCsrfToken(csrfToken);
    this.streamVersion = streamVersion;
    this.contentRelease = bootstrap.contentRelease;
    return BootstrapResponseSchema.parse(bootstrap);
  }

  async getDiagnosticNext() {
    await this.ensureBootstrap();
    const response = await this.request('/v1/diagnostic/next', DiagnosticNextSchema);
    this.currentQuestionId = response.question?.id;
    return response;
  }

  async submitDiagnostic(questionId: string, choiceId: string | null): Promise<void> {
    const command = AttemptCommandSchema.parse({
      envelope: await this.commandEnvelope(),
      questionId,
      choiceId,
      elapsedMs: 0,
      assistanceLevel: 'A0',
      contentBearingHintUsed: false,
      answerChanges: 0,
      isDiagnosticRetry: false,
    });
    await this.acceptedCommand(HTTP_API.attempt.path, command);
  }

  async confirmPlan(goal: GoalInput): Promise<void> {
    const command = GoalCommandSchema.parse({
      envelope: await this.commandEnvelope(),
      goal: {
        ...goal,
        testDate: goal.testDate === null ? null : goal.testDate.slice(0, 10),
      },
    });
    await this.acceptedCommand(HTTP_API.goal.path, command, HTTP_API.goal.method);
  }

  async getToday() {
    await this.ensureBootstrap();
    return this.request(HTTP_API.today.path, TodayViewSchema);
  }

  async getSession() {
    await this.ensureBootstrap();
    const response = await this.request(HTTP_API.session.path, StudyStepViewSchema);
    this.currentQuestionId = response.kind === 'question' ? response.question.id : undefined;
    return response;
  }

  async submitAttempt(choiceId: string | null): Promise<void> {
    if (this.currentQuestionId === undefined) await this.getSession();
    if (this.currentQuestionId === undefined) {
      throw ApiClientError.from({
        code: 'conflict',
        message: 'There is no active question to submit.',
        requestId: 'client-state',
        retryable: false,
      });
    }
    const command = AttemptCommandSchema.parse({
      envelope: await this.commandEnvelope(),
      questionId: this.currentQuestionId,
      choiceId,
      elapsedMs: 0,
      assistanceLevel: 'A0',
      contentBearingHintUsed: false,
      answerChanges: 0,
      isDiagnosticRetry: false,
    });
    await this.acceptedCommand(HTTP_API.attempt.path, command);
  }

  async selectCause(cause: Parameters<AuthorityPort['selectCause']>[0]): Promise<void> {
    await this.acceptedCommand('/v1/attempts/cause', {
      envelope: await this.commandEnvelope(),
      cause,
    });
  }

  async requestReveal(): Promise<void> {
    await this.acceptedCommand('/v1/attempts/reveal', {
      envelope: await this.commandEnvelope(),
      revealNow: true,
    });
  }

  async continueStep(): Promise<void> {
    await this.acceptedCommand('/v1/learning/session/continue', {
      envelope: await this.commandEnvelope(),
    });
  }

  async submitRecall(answer: string): Promise<boolean> {
    const response = await this.request('/v1/recall', booleanResultSchema, {
      method: 'POST',
      body: JSON.stringify({ envelope: await this.commandEnvelope(), answer }),
    });
    await this.bootstrap();
    return response.correct;
  }

  async getMasteryMap() {
    await this.ensureBootstrap();
    return this.request('/v1/progress/mastery', arrayOf(MasteryMapEntrySchema));
  }

  async getErrorLog() {
    await this.ensureBootstrap();
    return this.request('/v1/errors', arrayOf(ErrorEntryViewSchema));
  }

  async getSkills() {
    await this.ensureBootstrap();
    return this.request('/v1/skills', arrayOf(SkillSummarySchema));
  }

  async getPracticeItem(questionId: string) {
    await this.ensureBootstrap();
    return this.request(
      `/v1/practice/items/${encodeURIComponent(questionId)}`,
      nullable(PracticeItemViewSchema),
    );
  }

  async checkPractice(questionId: string, choiceId: string | null) {
    const response = await this.request('/v1/practice/attempts', PracticeResultSchema, {
      method: 'POST',
      body: JSON.stringify({
        envelope: await this.commandEnvelope(),
        questionId,
        choiceId,
      }),
    });
    await this.bootstrap();
    return response;
  }

  async recordCarsDuel(): Promise<void> {
    await this.acceptedCommand('/v1/hooks/cars-duel', {
      envelope: await this.commandEnvelope(),
    });
  }

  async getWrapped() {
    await this.ensureBootstrap();
    return this.request('/v1/hooks/wrapped', WrappedViewSchema);
  }

  async resetProgress(): Promise<void> {
    await this.acceptedCommand(
      '/v1/account/progress',
      { envelope: await this.commandEnvelope() },
      'DELETE',
    );
    this.currentQuestionId = undefined;
  }
}
