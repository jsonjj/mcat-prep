import type { IncomingMessage, ServerResponse } from 'node:http';
import { SKILL_CLUSTERS, type SkillCluster } from '@mcat/contracts';
import { diagnosticBank, type DiagnosticBank } from './diagnostic-bank';

/**
 * Dev/preview recall API. Recall quizzes the learner with real learner-safe
 * questions drawn from the (server-only) diagnostic bank, then grades the answer
 * server-side. Unlike the diagnostic, recall is a study loop, so the answer
 * response *does* reveal correctness + explanation. The answer key itself never
 * reaches the browser — only the graded outcome does. Same-origin + JSON only.
 */

const VALID_CLUSTERS = new Set<string>(SKILL_CLUSTERS);

function isSameOriginRequest(request: IncomingMessage): boolean {
  if (request.headers['sec-fetch-site'] === 'cross-site') return false;
  const origin = request.headers.origin;
  if (!origin) return true;
  const host = request.headers.host;
  if (!host) return false;
  const protocol = (request.socket as { encrypted?: boolean }).encrypted ? 'https' : 'http';
  return origin === `${protocol}://${host}`;
}

function writeJson(response: ServerResponse, status: number, payload: unknown): void {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.end(JSON.stringify(payload));
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const contentType = (request.headers['content-type'] ?? '').toLowerCase();
  if (!contentType.startsWith('application/json')) return {};
  let body = '';
  for await (const chunk of request) {
    body += chunk.toString();
    if (body.length > 16_384) return {};
  }
  try {
    const parsed: unknown = JSON.parse(body || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function guard(request: IncomingMessage, response: ServerResponse): boolean {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    writeJson(response, 405, { error: 'Use POST for recall.' });
    return false;
  }
  if (!isSameOriginRequest(request)) {
    writeJson(response, 403, { error: 'This recall request was not accepted.' });
    return false;
  }
  return true;
}

/** POST /api/recall/question — serve a learner-safe question for a topic (cluster). */
export function handleRecallQuestion(
  request: IncomingMessage,
  response: ServerResponse,
  bank: DiagnosticBank = diagnosticBank,
): void {
  if (!guard(request, response)) return;
  void readJsonBody(request)
    .then((body) => {
      const cluster = typeof body.cluster === 'string' ? body.cluster : '';
      if (!VALID_CLUSTERS.has(cluster)) {
        writeJson(response, 400, { error: 'Unknown topic.' });
        return;
      }
      const exclude = new Set(
        Array.isArray(body.exclude) ? body.exclude.filter((v): v is string => typeof v === 'string') : [],
      );
      const question = bank.viewByCluster(cluster as SkillCluster, exclude);
      writeJson(response, 200, { question });
    })
    .catch(() => writeJson(response, 500, { error: 'Recall is unavailable. Please try again.' }));
}

function isChoiceId(value: unknown): value is 'A' | 'B' | 'C' | 'D' {
  return value === 'A' || value === 'B' || value === 'C' || value === 'D';
}

/** POST /api/recall/answer — grade one recall answer and reveal the explanation. */
export function handleRecallAnswer(
  request: IncomingMessage,
  response: ServerResponse,
  bank: DiagnosticBank = diagnosticBank,
): void {
  if (!guard(request, response)) return;
  void readJsonBody(request)
    .then((body) => {
      const questionId = typeof body.questionId === 'string' ? body.questionId : '';
      const choiceId = isChoiceId(body.choiceId) ? body.choiceId : null;
      const grade = bank.grade(questionId, choiceId);
      if (grade === null) {
        writeJson(response, 400, { error: 'Unknown recall item.' });
        return;
      }
      writeJson(response, 200, grade);
    })
    .catch(() => writeJson(response, 500, { error: 'Recall is unavailable. Please try again.' }));
}
