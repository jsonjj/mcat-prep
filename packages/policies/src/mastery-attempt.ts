/**
 * Shared composition for applying ONE independent attempt to a learner's mastery
 * state (mastery-bkt / provisional-v1). Kept pure so the in-process authority
 * (@mcat/authority-core) and the Postgres authority (learner-api) run identical
 * logic; each call site loads/saves the states.
 *
 * Exactly TWO grains take a direct BKT observation: the primary KC and the primary
 * reasoning operation. A lesson has no state of its own — its view is derived from
 * its member KCs on read (see ./lesson-rollup.ts). One-hop prerequisite
 * reinforcement is a separate, indirect effect and is unchanged.
 *
 * IMPORTANT (fail-closed): callers MUST only invoke this for INDEPENDENT attempts
 * (A0, no content-bearing hint, not a diagnostic retry, not post-reveal). Assisted
 * or revealed work never reaches here, so it can never move P(L). See
 * docs/mastery-pipeline.md §4.1.
 */
import type { UtcTimestamp } from '@mcat/contracts';
import { BKT_CONFIG, type BktConfig } from './bkt';
import { difficultyB, slip, type IrtConfig, IRT_CONFIG } from './irt';
import {
  stepMemory,
  type ForgettingConfig,
  FORGETTING_CONFIG,
  type MemoryState,
} from './forgetting';
import { reinforcePrerequisite, type PrereqConfig, PREREQ_CONFIG } from './prerequisite';

/** The only two grain states a direct observation may update. */
export interface DirectBktTargetStates {
  kc: MemoryState;
  reasoningOperation: MemoryState;
}

export interface ApplyMasteryAttemptInput {
  correct: boolean;
  now: UtcTimestamp;
  /** Population stats for this exact question (drives IRT `b`; DOK cold-start until >20). */
  questionStats: { attempts: number; correct: number };
  dokLevel?: number;
  states: DirectBktTargetStates;
  /** Current states of the KC's DIRECT (1-hop) prerequisites; empty until the graph is loaded. */
  prerequisites?: readonly MemoryState[];
  /** Net session performance to judge a due-review half-life change (defaults to `correct`). */
  dueReviewNetCorrect?: boolean;
}

export interface ApplyMasteryAttemptResult {
  states: DirectBktTargetStates;
  /** Updated prerequisite states, in the same order supplied (reinforced only on a correct answer). */
  prerequisites: MemoryState[];
  /** True for whichever direct grains this attempt was a due (spaced) review. */
  dueReview: { kc: boolean; reasoningOperation: boolean };
  b: number;
  slip: number;
}

export interface MasteryAttemptConfig {
  bkt: BktConfig;
  irt: IrtConfig;
  forgetting: ForgettingConfig;
  prereq: PrereqConfig;
}

export const MASTERY_ATTEMPT_CONFIG: MasteryAttemptConfig = {
  bkt: BKT_CONFIG,
  irt: IRT_CONFIG,
  forgetting: FORGETTING_CONFIG,
  prereq: PREREQ_CONFIG,
};

export function applyMasteryAttempt(
  input: ApplyMasteryAttemptInput,
  cfg: MasteryAttemptConfig = MASTERY_ATTEMPT_CONFIG,
): ApplyMasteryAttemptResult {
  const b = difficultyB(
    input.dokLevel === undefined
      ? { attempts: input.questionStats.attempts, correct: input.questionStats.correct }
      : {
          attempts: input.questionStats.attempts,
          correct: input.questionStats.correct,
          dokLevel: input.dokLevel,
        },
    cfg.irt,
  );
  const s = slip(b, cfg.irt);
  const observation = { correct: input.correct, slip: s };
  const stepInput =
    input.dueReviewNetCorrect === undefined
      ? { observation, now: input.now }
      : { observation, now: input.now, dueReviewNetCorrect: input.dueReviewNetCorrect };
  const step = (state: MemoryState) => stepMemory(state, stepInput, cfg.bkt, cfg.forgetting);

  const kc = step(input.states.kc);
  const reasoningOperation = step(input.states.reasoningOperation);

  // Prerequisites are reinforced only on a correct answer (§4.5).
  const prerequisites = (input.prerequisites ?? []).map((p) =>
    input.correct ? reinforcePrerequisite(p, input.now, cfg.prereq) : p,
  );

  return {
    states: { kc: kc.state, reasoningOperation: reasoningOperation.state },
    prerequisites,
    dueReview: { kc: kc.wasDueReview, reasoningOperation: reasoningOperation.wasDueReview },
    b,
    slip: s,
  };
}
