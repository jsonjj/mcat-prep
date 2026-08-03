import type { PassageChoiceId, PassageGrade, PassageTodayView } from '@mcat/contracts';
import { authority } from '../../app/authority';

/**
 * Browser client for the Passage of the Day API.
 *
 * It routes through the shared authority client (`HttpAuthorityClient` via
 * `../../app/authority`) at the REAL, deployed `/v1/passage/*` surface — a GET
 * `/v1/passage/today/{tz}` (tz in the PATH) and a POST `/v1/passage/attempts`.
 * Going through the shared client is what makes it work in the deployed app: the
 * request is same-origin `/v1`, carries the HttpOnly session cookie
 * (`credentials: 'include'`), and — for the attempt — behaves exactly like the
 * other formative, session-gated commands. The previous plain `fetch` to the
 * DEV-ONLY `/api/passage/*` Vite plugin returned index.html in production, where
 * CloudFront rewrites `/api/*` to the SPA shell.
 *
 * It sends only the learner's timezone offset and their choice; it never receives
 * an answer key until it submits an answer, and it holds no scoring material of
 * its own. The feature is formative — nothing here writes mastery or touches the
 * authority kernel.
 */

export type {
  PassageChoiceId,
  PassageChoiceView,
  PassageGrade,
  PassageQuestionView,
  PassageTodayView,
} from '@mcat/contracts';

/**
 * The day's passage, or null when the pool is empty (a served-but-empty state the
 * runner renders on-brand). Rotation is keyed to the learner-local day, so the
 * browser's `Date.getTimezoneOffset()` (minutes) is sent with the request.
 */
export async function fetchTodaysPassage(): Promise<PassageTodayView | null> {
  return authority.passageToday(new Date().getTimezoneOffset());
}

/** Submit one answer and receive its reveal (correct answer + explanation). */
export async function gradePassage(
  questionId: string,
  choiceId: PassageChoiceId | null,
): Promise<PassageGrade> {
  return authority.passageAttempt(questionId, choiceId);
}
