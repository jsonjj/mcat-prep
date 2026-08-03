import {
  AcceptedCommandResponseSchema,
  AttemptCommandSchema,
  BootstrapEnvelopeSchema,
  CarsReadinessViewSchema,
  CarsReasoningPatternViewSchema,
  DiagnosticNextSchema,
  ErrorEntryViewSchema,
  GoalCommandSchema,
  GoalViewSchema,
  HTTP_API,
  HttpApiErrorSchema,
  MistakePatternViewSchema,
  LessonMasteryViewSchema,
  LessonWarrantViewSchema,
  MasteryMapEntrySchema,
  MasterySeedSchema,
  PassageAttemptResponseSchema,
  PassageTodayResponseSchema,
  PracticeAttemptResultSchema,
  PracticeItemViewSchema,
  PracticeQueueViewSchema,
  PracticeTestSummaryViewSchema,
  RepairQueueViewSchema,
  SessionExchangeRequestSchema,
  SessionExchangeResponseSchema,
  SignOutResponseSchema,
  SkillMasteryViewSchema,
  PracticeResultSchema,
  SkillSummarySchema,
  StudyStepViewSchema,
  TodayViewSchema,
  TodaysPathViewSchema,
  NormalizedLessonCommandSchema,
  NormalizedLessonRunViewSchema,
  NormalizedLessonStartCommandSchema,
  NormalizedLessonStartResponseSchema,
  NormalizedLessonStatusViewSchema,
  VectorLessonCommandSchema,
  VectorLessonRunViewSchema,
  VectorLessonStartCommandSchema,
  VectorLessonStartResponseSchema,
  VectorLessonStatusViewSchema,
  WrappedViewSchema,
  newEventId,
  newIdempotencyKey,
  newTaskInstanceId,
  type BootstrapEnvelope,
  type BuildTodaysPathInput,
  type HttpApiError,
  type HttpErrorCode,
  type MasterySeed,
  type NormalizedLessonAction,
  type PassageChoiceId,
  type PassageGrade,
  type PassageTodayView,
  type PracticeAttemptCommand,
  type VectorLessonAction,
} from '@mcat/contracts';
import type { AttemptTiming, AuthPort, AuthorityPort, GoalInput, SessionPort } from './port';

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

/**
 * The slug-routed path for a normalized-catalog lesson endpoint. The slug is
 * URL-encoded even though the registered slugs are already path-safe, so a future
 * slug can never break out of its segment.
 */
const normalizedLessonPath = (slug: string, segment: 'status' | 'start' | 'run' | 'commands') =>
  `/v1/lessons/${encodeURIComponent(slug)}/${segment}`;

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

const unauthenticated = (): ApiClientError =>
  ApiClientError.from({
    code: 'unauthorized',
    message: 'Sign in to continue.',
    requestId: 'client-unauthenticated',
    retryable: false,
  });

/**
 * Whether a failure means "no valid session", raised either by the server or by
 * the client noticing it bootstrapped as a signed-out visitor. Callers use it to
 * send the learner to the sign-in screen instead of showing an error.
 */
export function isUnauthenticatedError(error: unknown): boolean {
  return error instanceof ApiClientError && error.code === 'unauthorized';
}

export class HttpAuthorityClient implements AuthorityPort, AuthPort {
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

  /**
   * Every learner call funnels through here, so this is the single point at which
   * "not signed in" turns into a typed `unauthorized` failure the app can route on.
   */
  private async ensureBootstrap(): Promise<void> {
    if (this.streamVersion !== undefined && this.contentRelease !== undefined) return;
    const bootstrap = await this.bootstrap();
    if (!bootstrap.authenticated) throw unauthenticated();
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

  /**
   * Establish or refresh the session.
   *
   * A signed-out visitor gets `{ authenticated: false }` and a CSRF token that is
   * only good for the credential routes — no learner is created, so there is no
   * learner state to return.
   */
  async bootstrap(): Promise<BootstrapEnvelope> {
    const response = await this.request(HTTP_API.bootstrap.path, BootstrapEnvelopeSchema, {
      method: HTTP_API.bootstrap.method,
    });
    // Stored in both arms: the signed-out token is what authorizes sign-in and
    // sign-up as a same-site request.
    this.session.setCsrfToken(response.csrfToken);
    if (!response.authenticated) {
      this.streamVersion = undefined;
      this.contentRelease = undefined;
      return response;
    }
    this.streamVersion = response.streamVersion;
    this.contentRelease = response.contentRelease;
    return response;
  }

  /**
   * Trade a Supabase access token for a session.
   *
   * The Supabase token is used once and not retained. What persists is the
   * `HttpOnly` session cookie pair the response sets, which script cannot read —
   * so an XSS foothold cannot lift a long-lived credential out of the page the
   * way it could if the Supabase session were the thing kept in the browser.
   */
  async exchangeSession(accessToken: string): Promise<void> {
    await this.ensureCredentialToken();
    const response = await this.request(
      HTTP_API.authSessionExchange.path,
      SessionExchangeResponseSchema,
      {
        method: 'POST',
        body: JSON.stringify(SessionExchangeRequestSchema.parse({ accessToken })),
      },
    );
    this.session.setCsrfToken(response.csrfToken);
    // The previous identity's cached versions must not survive into the new one.
    this.streamVersion = undefined;
    this.contentRelease = undefined;
    this.currentQuestionId = undefined;
  }

  async signOut(): Promise<void> {
    try {
      await this.request(HTTP_API.authSignOut.path, SignOutResponseSchema, { method: 'POST' });
    } finally {
      // Local state is dropped even if the server call failed, so a failed
      // sign-out never leaves the UI showing a session the learner ended.
      this.session.clear();
      this.streamVersion = undefined;
      this.contentRelease = undefined;
      this.currentQuestionId = undefined;
    }
  }

  /**
   * The exchange route is CSRF-protected, so a visitor who lands straight on
   * `/signin` needs a token before the first attempt.
   */
  private async ensureCredentialToken(): Promise<void> {
    if (this.session.getCsrfToken() === null) await this.bootstrap();
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

  async getGoal() {
    await this.ensureBootstrap();
    return this.request(HTTP_API.goalView.path, GoalViewSchema);
  }

  async getToday() {
    await this.ensureBootstrap();
    return this.request(HTTP_API.today.path, TodayViewSchema);
  }

  async getTodaysPath() {
    await this.ensureBootstrap();
    return this.request(HTTP_API.todaysPath.path, TodaysPathViewSchema);
  }

  async buildTodaysPath(input: BuildTodaysPathInput) {
    const view = await this.request(HTTP_API.todaysPathBuild.path, TodaysPathViewSchema, {
      method: HTTP_API.todaysPathBuild.method,
      body: JSON.stringify({ envelope: await this.commandEnvelope(), input }),
    });
    // Build persists the plan (advances the stream) but returns a view, not an
    // AcceptedCommandResponse — resync the stream version like the practice attempt does.
    await this.bootstrap();
    return view;
  }

  async recordPlanActivity(
    activityId: string,
    status: 'in_progress' | 'complete' | 'skipped',
  ): Promise<void> {
    await this.acceptedCommand(HTTP_API.todaysPathActivity.path, {
      envelope: await this.commandEnvelope(),
      activityId,
      status,
    });
  }

  async setDailyBudget(minutesPerDay: number): Promise<void> {
    await this.acceptedCommand(
      HTTP_API.dailyBudget.path,
      { envelope: await this.commandEnvelope(), minutesPerDay },
      HTTP_API.dailyBudget.method,
    );
  }

  async getSession() {
    await this.ensureBootstrap();
    const response = await this.request(HTTP_API.session.path, StudyStepViewSchema);
    this.currentQuestionId = response.kind === 'question' ? response.question.id : undefined;
    return response;
  }

  async submitAttempt(choiceId: string | null, timing?: AttemptTiming): Promise<void> {
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
      // Diagnose-before-reveal capture from the Study UI (WS0). These used to be
      // hardcoded `0`, so every Study attempt claimed an instantaneous,
      // never-changed answer. A caller with no timing (a non-UI path) still sends
      // `0`, which the AttemptCommand's non-nullable contract requires.
      elapsedMs: timing?.elapsedMs ?? 0,
      assistanceLevel: 'A0',
      contentBearingHintUsed: false,
      answerChanges: timing?.answerChanges ?? 0,
      isDiagnosticRetry: false,
    });
    await this.acceptedCommand(HTTP_API.attempt.path, command);
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

  async getMasterySkills() {
    await this.ensureBootstrap();
    return this.request(HTTP_API.progressSkills.path, arrayOf(SkillMasteryViewSchema));
  }

  async getMasteryLessons() {
    await this.ensureBootstrap();
    return this.request(HTTP_API.progressLessons.path, arrayOf(LessonMasteryViewSchema));
  }

  async getLessonWarrants() {
    await this.ensureBootstrap();
    return this.request(HTTP_API.progressLessonWarrants.path, arrayOf(LessonWarrantViewSchema));
  }

  async getCarsReadiness() {
    await this.ensureBootstrap();
    return this.request(HTTP_API.progressCars.path, CarsReadinessViewSchema);
  }

  async getErrorLog() {
    await this.ensureBootstrap();
    return this.request(HTTP_API.errors.path, arrayOf(ErrorEntryViewSchema));
  }

  async getShakyWins() {
    await this.ensureBootstrap();
    return this.request(HTTP_API.shakyWins.path, arrayOf(ErrorEntryViewSchema));
  }

  async getMistakePatterns() {
    await this.ensureBootstrap();
    return this.request(HTTP_API.errorPatterns.path, arrayOf(MistakePatternViewSchema));
  }

  async getCarsReasoningPatterns() {
    await this.ensureBootstrap();
    return this.request(
      HTTP_API.carsReasoningPatterns.path,
      arrayOf(CarsReasoningPatternViewSchema),
    );
  }

  async getRepairQueue(limit: number) {
    await this.ensureBootstrap();
    // Path-parameterized like the practice queue (the edge rejects query strings),
    // so the limit rides as a segment the authority reads back.
    const count = encodeURIComponent(String(Math.max(1, Math.floor(limit))));
    return this.request(`${HTTP_API.mistakesRepair.path}/${count}`, RepairQueueViewSchema);
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

  async getPracticeQueue(x: number, focus?: string) {
    await this.ensureBootstrap();
    const count = encodeURIComponent(String(Math.max(1, Math.floor(x))));
    const path =
      focus === undefined
        ? `/v1/practice/queue/${count}`
        : `/v1/practice/queue/${count}/${encodeURIComponent(focus)}`;
    return this.request(path, PracticeQueueViewSchema);
  }

  async submitPracticeAttempt(command: PracticeAttemptCommand) {
    const response = await this.request(
      '/v1/practice/attempts/adaptive',
      PracticeAttemptResultSchema,
      {
        method: 'POST',
        body: JSON.stringify({ envelope: await this.commandEnvelope(), ...command }),
      },
    );
    // The adaptive attempt advances the stream but returns feedback (not an
    // AcceptedCommandResponse), so resync the stream version like PotD does.
    await this.bootstrap();
    return response;
  }

  async getPracticeTestSummary() {
    await this.ensureBootstrap();
    try {
      // `nullable` here keeps DTO drift LOUD: a served-but-malformed summary
      // throws in `.parse`, exactly like every other read. Only the "route not
      // served yet" signal below is swallowed into the graceful `null`.
      return await this.request(
        HTTP_API.practiceTestSummary.path,
        nullable(PracticeTestSummaryViewSchema),
      );
    } catch (error) {
      // GRACEFUL DATA PATH: the scored practice-test engine is deferred, so the
      // deployed backend has no route for this and answers `not_found`. Treat
      // that as "no summary yet" so the Practice card renders its existing
      // coming-soon states. Any other failure still propagates (and the card
      // falls back to coming-soon on an errored query regardless).
      if (error instanceof ApiClientError && error.code === 'not_found') return null;
      throw error;
    }
  }

  async passageToday(tz: number): Promise<PassageTodayView | null> {
    await this.ensureBootstrap();
    // Path-parameterized like the practice queue (the authority edge rejects query
    // strings), so the tz offset rides as a segment the authority reads back.
    const segment = encodeURIComponent(String(Math.trunc(tz)));
    const response = await this.request(
      `${HTTP_API.passageToday.path}/${segment}`,
      PassageTodayResponseSchema,
    );
    return response.passage;
  }

  async passageAttempt(
    questionId: string,
    choiceId: PassageChoiceId | null,
  ): Promise<PassageGrade> {
    // Session-gated but NOT state-changing (no CSRF write gate); the shared
    // request() still sends the session cookie via `credentials: 'include'`.
    await this.ensureBootstrap();
    const response = await this.request(HTTP_API.passageAttempt.path, PassageAttemptResponseSchema, {
      method: HTTP_API.passageAttempt.method,
      body: JSON.stringify({ questionId, choiceId }),
    });
    return response.grade;
  }

  async recordCarsDuel(outcome?: Parameters<AuthorityPort['recordCarsDuel']>[0]): Promise<void> {
    await this.acceptedCommand('/v1/hooks/cars-duel', {
      envelope: await this.commandEnvelope(),
      ...(outcome ?? {}),
    });
  }

  async recordPracticeTestCompleted(): Promise<void> {
    await this.acceptedCommand('/v1/hooks/practice-test/completed', {
      envelope: await this.commandEnvelope(),
    });
  }

  async recordPracticeTestReviewed(): Promise<void> {
    await this.acceptedCommand('/v1/hooks/practice-test/reviewed', {
      envelope: await this.commandEnvelope(),
    });
  }

  async applyMasterySeed(seed: MasterySeed): Promise<void> {
    await this.acceptedCommand('/v1/hooks/mastery-seed', {
      envelope: await this.commandEnvelope(),
      seed: MasterySeedSchema.parse(seed),
    });
    // The seed moves per-lesson priors, which the Progress brain reads.
    await this.bootstrap();
  }

  async getWrapped() {
    await this.ensureBootstrap();
    return this.request('/v1/hooks/wrapped', WrappedViewSchema);
  }

  async getVectorLessonStatus() {
    await this.ensureBootstrap();
    return this.request(HTTP_API.vectorLessonStatus.path, VectorLessonStatusViewSchema);
  }

  async startVectorLesson() {
    const command = VectorLessonStartCommandSchema.parse({
      envelope: await this.commandEnvelope(),
      lessonId: 'V3-LES-130923',
    });
    const response = await this.request(
      HTTP_API.vectorLessonStart.path,
      VectorLessonStartResponseSchema,
      {
        method: HTTP_API.vectorLessonStart.method,
        body: JSON.stringify(command),
      },
    );
    this.accept(response);
    return response;
  }

  async getVectorLessonRun() {
    await this.ensureBootstrap();
    return this.request(HTTP_API.vectorLessonRun.path, VectorLessonRunViewSchema);
  }

  async submitVectorLessonAction(
    runId: string,
    screenToken: string,
    action: VectorLessonAction,
  ): Promise<void> {
    const command = VectorLessonCommandSchema.parse({
      envelope: await this.commandEnvelope(),
      runId,
      screenToken,
      action,
    });
    await this.acceptedCommand(HTTP_API.vectorLessonCommand.path, command);
  }

  // ---- normalized-engine catalog (L2/L3 and any future template lesson) --------
  // Slug-routed mirrors of the four vector methods above. The slug names WHICH
  // lesson runs; the server rejects a start whose body id contradicts the slug.

  async getNormalizedLessonStatus(slug: string) {
    await this.ensureBootstrap();
    return this.request(normalizedLessonPath(slug, 'status'), NormalizedLessonStatusViewSchema);
  }

  async startNormalizedLesson(slug: string, lessonId: string) {
    const command = NormalizedLessonStartCommandSchema.parse({
      envelope: await this.commandEnvelope(),
      lessonId,
    });
    const response = await this.request(
      normalizedLessonPath(slug, 'start'),
      NormalizedLessonStartResponseSchema,
      { method: 'POST', body: JSON.stringify(command) },
    );
    this.accept(response);
    return response;
  }

  async getNormalizedLessonRun(slug: string) {
    await this.ensureBootstrap();
    return this.request(normalizedLessonPath(slug, 'run'), NormalizedLessonRunViewSchema);
  }

  async submitNormalizedLessonAction(slug: string, action: NormalizedLessonAction): Promise<void> {
    const command = NormalizedLessonCommandSchema.parse({
      envelope: await this.commandEnvelope(),
      action,
    });
    await this.acceptedCommand(normalizedLessonPath(slug, 'commands'), command);
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
