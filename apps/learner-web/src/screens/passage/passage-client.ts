/**
 * Browser client for the Passage of the Day API (served by the dev/preview Vite
 * plugin at `/api/passage/*`). It sends only the learner's timezone offset and
 * their choice; it never receives an answer key until it submits an answer, and
 * it holds no scoring material of its own. The feature is formative — nothing
 * here writes mastery or touches the authority kernel.
 */

export type PassageChoiceId = 'A' | 'B' | 'C' | 'D';

export interface PassageChoiceView {
  id: PassageChoiceId;
  text: string;
}

export interface PassageQuestionView {
  id: string;
  stem: string;
  choices: PassageChoiceView[];
}

export interface PassageTodayView {
  id: string;
  title: string;
  discipline: string;
  body: string[];
  questions: PassageQuestionView[];
  dayIndex: number;
  poolSize: number;
  localDate: string;
}

export interface PassageGrade {
  correct: boolean;
  correctChoiceId: PassageChoiceId;
  rationale: string;
  choiceRationale: string | null;
}

const BASE = '/api/passage';

export class PassageApiError extends Error {}

async function parseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new PassageApiError('The passage service returned an invalid response.');
  }
}

function messageOf(json: unknown, fallback: string): string {
  return typeof (json as { error?: unknown }).error === 'string'
    ? (json as { error: string }).error
    : fallback;
}

/**
 * The day's passage, or null when the pool is empty (a served-but-empty state
 * the runner renders on-brand). Rotation is keyed to the learner-local day, so
 * the timezone offset is sent with the request.
 */
export async function fetchTodaysPassage(): Promise<PassageTodayView | null> {
  const tz = new Date().getTimezoneOffset();
  const response = await fetch(`${BASE}/today?tz=${encodeURIComponent(String(tz))}`, {
    method: 'GET',
    headers: { accept: 'application/json' },
    cache: 'no-store',
  });
  const json = await parseJson(response);
  if (!response.ok) {
    throw new PassageApiError(messageOf(json, 'The passage of the day is unavailable.'));
  }
  return (json as { passage: PassageTodayView | null }).passage ?? null;
}

/** Submit one answer and receive its reveal (correct answer + explanation). */
export async function gradePassage(
  questionId: string,
  choiceId: PassageChoiceId | null,
): Promise<PassageGrade> {
  const response = await fetch(`${BASE}/attempts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    cache: 'no-store',
    body: JSON.stringify({ questionId, choiceId }),
  });
  const json = await parseJson(response);
  if (!response.ok) {
    throw new PassageApiError(messageOf(json, 'That answer could not be scored.'));
  }
  return (json as { grade: PassageGrade }).grade;
}
