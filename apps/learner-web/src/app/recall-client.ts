/**
 * Browser client for the recall API (served by the dev/preview Vite plugin, and
 * by an API route in production). Recall serves real learner-safe questions and
 * grades them server-side. The browser only ever sends the topic, the question
 * id, and the learner's choice; the answer key never crosses the boundary — only
 * the graded outcome (correct + explanation) comes back, which is the point of a
 * study loop.
 */
import type { ChoiceId, DiagnosticItemView } from './diagnostic-client';

export type RecallQuestion = DiagnosticItemView;

export interface RecallGrade {
  correct: boolean;
  correctChoiceId: ChoiceId;
  explanation: string;
}

const BASE = '/api/recall';

async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    cache: 'no-store',
    body: JSON.stringify(body),
  });
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new Error('Recall service returned an invalid response.');
  }
  if (!response.ok) {
    const message =
      typeof (json as { error?: unknown }).error === 'string'
        ? (json as { error: string }).error
        : 'Recall service is unavailable.';
    throw new Error(message);
  }
  return json as T;
}

/** A learner-safe question for a topic, or null if the topic has no items yet. */
export async function fetchRecallQuestion(
  cluster: string,
  exclude: readonly string[] = [],
): Promise<RecallQuestion | null> {
  const { question } = await post<{ question: RecallQuestion | null }>('/question', {
    cluster,
    exclude,
  });
  return question;
}

/** Grade one answer server-side and reveal the correct choice + explanation. */
export function submitRecallAnswer(
  questionId: string,
  choiceId: ChoiceId | null,
): Promise<RecallGrade> {
  return post<RecallGrade>('/answer', { questionId, choiceId });
}
