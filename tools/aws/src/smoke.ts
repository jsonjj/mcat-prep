import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { processCommandRunner, type CommandRunner } from './command';
import { readStackOutputs } from './outputs';
import { runLivePreflight } from './preflight';

const PROTECTED_MARKERS = [
  'proposed_key',
  'correct_choice_id',
  'correctchoiceid',
  'rationales',
  'option_rationales',
  'protected_rationale',
  'rationale_correct',
  'rationale_incorrect',
  'sessiontoken',
] as const;

export interface SmokeOptions {
  readonly apiBaseUrl: string;
  readonly directApiBaseUrl: string;
  readonly learnerOrigin: string;
  readonly fetcher?: typeof fetch;
  readonly now?: () => string;
  readonly uuid?: () => string;
}

export interface SmokeReport {
  readonly apiBaseUrl: string;
  readonly directApiBaseUrl: string;
  readonly learnerOrigin: string;
  readonly checks: readonly string[];
}

export interface SmokeConfiguration {
  readonly apiBaseUrl: string;
  readonly directApiBaseUrl: string;
  readonly learnerOrigin: string;
}

export async function resolveSmokeConfiguration(
  runner: CommandRunner,
): Promise<SmokeConfiguration> {
  const api = await readStackOutputs(runner, 'mcat-dev-api', ['LearnerWebUrl', 'LearnerApiUrl']);
  const learnerOrigin = exactHttpsOrigin(api.LearnerWebUrl ?? '', 'Learner origin');
  if (!/^d[a-z0-9]+\.cloudfront\.net$/.test(new URL(learnerOrigin).hostname)) {
    throw new Error('Learner origin must use the reviewed CloudFront distribution');
  }
  const directApiBaseUrl = normalizeApiBase(api.LearnerApiUrl ?? '');
  return { apiBaseUrl: learnerOrigin, directApiBaseUrl, learnerOrigin };
}

interface BootstrapPayload {
  readonly learnerId: string;
  readonly streamVersion: number;
  readonly csrfToken: string;
  readonly contentRelease: string;
}

function exactHttpsOrigin(value: string, label: string): string {
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.origin !== value ||
    url.username !== '' ||
    url.password !== ''
  ) {
    throw new Error(`${label} must be an exact HTTPS origin`);
  }
  return value;
}

function normalizeApiBase(value: string): string {
  const parsed = new URL(value);
  if (
    parsed.protocol !== 'https:' ||
    parsed.username !== '' ||
    parsed.password !== '' ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error('API base URL must be HTTPS without credentials, query, or fragment');
  }
  const normalizedPath = parsed.pathname.replace(/\/+$/, '').replace(/\/v1$/, '');
  parsed.pathname = normalizedPath;
  return parsed.toString().replace(/\/$/, '');
}

function protectedSafe(value: string, label: string): void {
  const normalized = value.toLowerCase().replaceAll('-', '_');
  const marker = PROTECTED_MARKERS.find((candidate) => normalized.includes(candidate));
  if (marker !== undefined) throw new Error(`${label} leaked protected marker ${marker}`);
}

function setCookies(headers: Headers): string[] {
  const extended = headers as Headers & { getSetCookie?: () => string[] };
  const values = extended.getSetCookie?.();
  if (values !== undefined && values.length > 0) return values;
  const combined = headers.get('set-cookie');
  return combined === null ? [] : combined.split(/,\s*(?=__Host-)/);
}

function cookieHeader(cookies: readonly string[]): string {
  return cookies.map((cookie) => cookie.split(';', 1)[0]).join('; ');
}

export function validateBootstrapCookies(cookies: readonly string[]): void {
  const names = cookies.map((cookie) => cookie.split('=', 1)[0]);
  if (
    cookies.length !== 2 ||
    names.filter((name) => name === '__Host-mcat_session').length !== 1 ||
    names.filter((name) => name === '__Host-mcat_csrf').length !== 1
  ) {
    throw new Error('Bootstrap must set exactly one session and one CSRF cookie');
  }
  for (const cookie of cookies) {
    if (/;\s*Domain=/i.test(cookie)) throw new Error('__Host- cookies must not include Domain');
    if (
      !/;\s*Path=\/(?:;|$)/i.test(cookie) ||
      !/;\s*HttpOnly(?:;|$)/i.test(cookie) ||
      !/;\s*Secure(?:;|$)/i.test(cookie) ||
      !/;\s*SameSite=Lax(?:;|$)/i.test(cookie)
    ) {
      throw new Error('Bootstrap cookie is missing required security attributes');
    }
  }
}

async function responseBody(response: Response, label: string): Promise<unknown> {
  const text = await response.text();
  protectedSafe(text, `${label} body`);
  for (const [name, value] of response.headers)
    protectedSafe(`${name}:${value}`, `${label} headers`);
  if (text.length === 0) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`${label} returned non-JSON content`);
  }
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return value as Record<string, unknown>;
}

function assertStatus(response: Response, expected: number, label: string): void {
  if (response.status !== expected)
    throw new Error(`${label} returned ${response.status}, expected ${expected}`);
  const cacheControl = response.headers.get('cache-control')?.toLowerCase() ?? '';
  if (!cacheControl.includes('no-store')) throw new Error(`${label} response must be no-store`);
}

function assertExactCors(response: Response, origin: string, label: string): void {
  if (response.headers.get('access-control-allow-origin') !== origin) {
    throw new Error(`${label} did not echo the exact learner origin`);
  }
  if (response.headers.get('access-control-allow-credentials') !== 'true') {
    throw new Error(`${label} did not allow credentialed requests`);
  }
}

export async function runLearnerApiSmoke(options: SmokeOptions): Promise<SmokeReport> {
  const fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
  const now = options.now ?? (() => new Date().toISOString());
  const uuid = options.uuid ?? randomUUID;
  const apiBaseUrl = normalizeApiBase(options.apiBaseUrl);
  const directApiBaseUrl = normalizeApiBase(options.directApiBaseUrl);
  const learnerOrigin = exactHttpsOrigin(options.learnerOrigin, 'Learner origin');
  const checks: string[] = [];

  const request = async (
    path: string,
    init: RequestInit,
    expected: number,
    label: string,
    cors = false,
  ): Promise<{ readonly response: Response; readonly body: unknown }> => {
    const headers = new Headers(init.headers);
    const response = await fetcher(`${apiBaseUrl}${path}`, { ...init, headers });
    assertStatus(response, expected, label);
    if (cors) assertExactCors(response, learnerOrigin, label);
    return { response, body: await responseBody(response, label) };
  };

  const health = await request(
    '/v1/health',
    { method: 'GET', headers: { origin: learnerOrigin } },
    200,
    'health',
    true,
  );
  if (object(health.body, 'health body').status !== 'ok')
    throw new Error('Health status was not ok');
  checks.push('health');

  const cors = await request(
    '/v1/attempts',
    {
      method: 'OPTIONS',
      headers: {
        origin: learnerOrigin,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type,x-csrf-token',
      },
    },
    204,
    'CORS preflight',
    true,
  );
  const methods = cors.response.headers.get('access-control-allow-methods')?.toUpperCase() ?? '';
  const headers = cors.response.headers.get('access-control-allow-headers')?.toLowerCase() ?? '';
  if (!methods.includes('POST') || !headers.includes('x-csrf-token')) {
    throw new Error('CORS preflight did not allow the required write method and CSRF header');
  }
  checks.push('cors');

  const bootstrap = await request(
    '/v1/bootstrap',
    {
      method: 'POST',
      headers: { origin: learnerOrigin, 'content-type': 'application/json' },
      body: '{}',
    },
    200,
    'bootstrap',
    true,
  );
  const bootstrapObject = object(bootstrap.body, 'bootstrap body');
  if (
    typeof bootstrapObject.learnerId !== 'string' ||
    typeof bootstrapObject.streamVersion !== 'number' ||
    typeof bootstrapObject.csrfToken !== 'string' ||
    bootstrapObject.csrfToken.length < 32 ||
    typeof bootstrapObject.contentRelease !== 'string'
  ) {
    throw new Error('Bootstrap response is missing learner concurrency/session fields');
  }
  const bootstrapPayload: BootstrapPayload = {
    learnerId: bootstrapObject.learnerId,
    streamVersion: bootstrapObject.streamVersion,
    csrfToken: bootstrapObject.csrfToken,
    contentRelease: bootstrapObject.contentRelease,
  };
  const cookies = setCookies(bootstrap.response.headers);
  validateBootstrapCookies(cookies);
  const authenticatedHeaders = {
    origin: learnerOrigin,
    cookie: cookieHeader(cookies),
    'x-csrf-token': bootstrapPayload.csrfToken,
    'content-type': 'application/json',
  };
  checks.push('guest-bootstrap-cookies');

  const eventId = uuid();
  const idempotencyKey = uuid();
  const taskInstanceId = uuid();
  const goalCommand = {
    envelope: {
      eventId,
      idempotencyKey,
      occurredAt: now(),
      expectedStreamVersion: bootstrapPayload.streamVersion,
      contentRelease: bootstrapPayload.contentRelease,
      taskInstanceId,
    },
    goal: { testDate: null, targetScore: 515, minutesPerWeek: 420 },
  };
  const firstGoal = await request(
    '/v1/profile/goal',
    { method: 'PUT', headers: authenticatedHeaders, body: JSON.stringify(goalCommand) },
    200,
    'first goal command',
    true,
  );
  const duplicateGoal = await request(
    '/v1/profile/goal',
    { method: 'PUT', headers: authenticatedHeaders, body: JSON.stringify(goalCommand) },
    200,
    'duplicate goal command',
    true,
  );
  const firstAccepted = object(firstGoal.body, 'first goal response');
  const duplicateAccepted = object(duplicateGoal.body, 'duplicate goal response');
  if (
    firstAccepted.eventId !== duplicateAccepted.eventId ||
    firstAccepted.sequence !== duplicateAccepted.sequence ||
    firstAccepted.streamVersion !== duplicateAccepted.streamVersion
  ) {
    throw new Error('Duplicate goal command produced a second logical effect');
  }
  checks.push('goal-idempotency');

  for (const [path, label] of [
    ['/v1/plan/today', 'Today'],
    ['/v1/learning/session', 'learning session'],
    ['/v1/progress/mastery', 'mastery'],
    ['/v1/errors', 'errors'],
  ] as const) {
    await request(path, { method: 'GET', headers: authenticatedHeaders }, 200, label, true);
  }
  checks.push('authorized-reads');

  await request(
    '/v1/plan/today',
    { method: 'GET', headers: { origin: learnerOrigin } },
    401,
    'unauthenticated read',
    true,
  );
  await request(
    '/v1/profile/goal',
    {
      method: 'PUT',
      headers: {
        ...authenticatedHeaders,
        'x-csrf-token': 'wrong-csrf-token-with-at-least-32-chars',
      },
      body: JSON.stringify(goalCommand),
    },
    403,
    'wrong CSRF write',
    true,
  );
  await request(
    '/v1/profile/goal',
    {
      method: 'PUT',
      headers: {
        origin: learnerOrigin,
        cookie: cookieHeader(cookies),
        'content-type': 'application/json',
      },
      body: JSON.stringify(goalCommand),
    },
    403,
    'missing CSRF write',
    true,
  );
  await request(
    '/v1/profile/goal',
    {
      method: 'PUT',
      headers: authenticatedHeaders,
      body: JSON.stringify({ ...goalCommand, learnerId: bootstrapPayload.learnerId }),
    },
    400,
    'injected learner ownership',
    true,
  );
  const evil = await fetcher(`${apiBaseUrl}/v1/profile/goal`, {
    method: 'PUT',
    headers: { ...authenticatedHeaders, origin: 'https://evil.example' },
    body: JSON.stringify(goalCommand),
  });
  assertStatus(evil, 403, 'evil-origin write');
  if (evil.headers.has('access-control-allow-origin')) {
    throw new Error('Evil-origin response exposed an allow-origin header');
  }
  await responseBody(evil, 'evil-origin write');
  checks.push('protected-negative-boundaries');

  const directOrigin = await fetcher(`${directApiBaseUrl}/v1/bootstrap`, {
    method: 'POST',
    headers: { origin: learnerOrigin, 'content-type': 'application/json' },
    body: '{}',
  });
  if (directOrigin.status !== 403) {
    throw new Error(`Direct API origin returned ${directOrigin.status}, expected 403`);
  }
  if (directOrigin.headers.has('access-control-allow-origin')) {
    throw new Error('Direct API origin exposed an allow-origin header');
  }
  protectedSafe(await directOrigin.text(), 'direct-origin body');
  checks.push('direct-origin-blocked');

  return { apiBaseUrl, directApiBaseUrl, learnerOrigin, checks };
}

const invokedPath = process.argv[1] === undefined ? undefined : resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) {
  const reviewManifestPath = process.env.MCAT_DEPLOY_REVIEW_MANIFEST;
  const attestationPath = process.env.MCAT_SMOKE_ATTESTATION_PATH;
  if (reviewManifestPath === undefined || attestationPath === undefined) {
    throw new Error('MCAT_DEPLOY_REVIEW_MANIFEST and MCAT_SMOKE_ATTESTATION_PATH are required');
  }
  const repositoryRoot = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
  const preflight = await runLivePreflight({
    repositoryRoot,
    reviewManifestPath,
    runner: processCommandRunner,
  });
  const configuration = await resolveSmokeConfiguration(processCommandRunner);
  const report = await runLearnerApiSmoke(configuration);
  const evidenceSha256 = createHash('sha256').update(JSON.stringify(report)).digest('hex');
  const destination = resolve(attestationPath);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(
    destination,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        kind: 'smoke',
        account: '056956104102',
        region: 'us-east-1',
        gitCommit: preflight.review.gitCommit,
        evidenceSha256,
        verifiedAt: new Date().toISOString(),
        checks: report.checks,
      },
      null,
      2,
    )}\n`,
    { encoding: 'utf8', mode: 0o600, flag: 'wx' },
  );
  process.stdout.write(`AWS smoke passed: ${report.checks.join(', ')}.\n`);
}
