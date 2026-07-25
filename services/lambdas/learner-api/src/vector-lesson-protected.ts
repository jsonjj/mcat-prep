import { VECTOR_LESSON_KCS, type VectorLessonChoiceId } from '@mcat/content/v3-vector-lesson';

/**
 * Server-only answer authority for V3-LES-130923.
 *
 * This module is reachable only from the learner API package. The learner web
 * package cannot import it and receives only the closed DTO variants from
 * @mcat/contracts after the relevant commitment boundary.
 */
const CORRECT_CHOICE_BY_ITEM = {
  'vtr-vec-entry-check-1': 'A',
  'vtr-vec-guided-practice-1': 'B',
  'vtr-vec-guided-practice-fresh': 'C',
  'vtr-vec-light-support-practice-1': 'C',
  'vtr-vec-light-support-practice-fresh': 'B',
  'vtr-vec-solo-practice-1': 'D',
  'vtr-vec-near-exit-initial': 'B',
  'vtr-vec-changed-exit-initial': 'C',
  'vtr-vec-repair-confirmation-near-1': 'D',
  'vtr-vec-repair-confirmation-near-2': 'A',
  'vtr-vec-near-exit-reentry': 'C',
  'vtr-vec-repair-confirmation-changed-1': 'B',
  'vtr-vec-repair-confirmation-changed-2': 'D',
  'vtr-vec-changed-exit-reentry': 'A',
  'vtr-trig-entry-check-1': 'A',
  'vtr-trig-guided-practice-1': 'C',
  'vtr-trig-guided-practice-fresh': 'D',
  'vtr-trig-light-support-practice-1': 'B',
  'vtr-trig-light-support-practice-fresh': 'C',
  'vtr-trig-solo-practice-1': 'D',
  'vtr-trig-near-exit-initial': 'B',
  'vtr-trig-changed-exit-initial': 'C',
  'vtr-trig-repair-confirmation-near-1': 'A',
  'vtr-trig-repair-confirmation-near-2': 'D',
  'vtr-trig-near-exit-reentry': 'C',
  'vtr-trig-repair-confirmation-changed-1': 'B',
  'vtr-trig-repair-confirmation-changed-2': 'A',
  'vtr-trig-changed-exit-reentry': 'D',
  'vtr-dir-entry-check-1': 'D',
  'vtr-dir-guided-practice-1': 'B',
  'vtr-dir-guided-practice-fresh': 'C',
  'vtr-dir-light-support-practice-1': 'C',
  'vtr-dir-light-support-practice-fresh': 'D',
  'vtr-dir-solo-practice-1': 'A',
  'vtr-dir-near-exit-initial': 'D',
  'vtr-dir-changed-exit-initial': 'B',
  'vtr-dir-repair-confirmation-near-1': 'C',
  'vtr-dir-repair-confirmation-near-2': 'A',
  'vtr-dir-near-exit-reentry': 'D',
  'vtr-dir-repair-confirmation-changed-1': 'B',
  'vtr-dir-repair-confirmation-changed-2': 'C',
  'vtr-dir-changed-exit-reentry': 'A',
} as const satisfies Readonly<Record<string, VectorLessonChoiceId>>;

export interface VectorLessonProtectedAnswer {
  readonly correctChoiceId: VectorLessonChoiceId;
  readonly derivation: string;
  readonly correctFeedback: string;
  readonly choiceFeedback: Readonly<Record<VectorLessonChoiceId, string>>;
}

function answerAuthority(): Readonly<Record<string, VectorLessonProtectedAnswer>> {
  const entries = VECTOR_LESSON_KCS.flatMap((kc) =>
    kc.items.map((item) => {
      const correctChoiceId = (
        CORRECT_CHOICE_BY_ITEM as Readonly<Record<string, VectorLessonChoiceId>>
      )[item.item_id];
      if (correctChoiceId === undefined) {
        throw new Error(`Missing protected key for ${item.item_id}`);
      }
      const correctChoice = item.choices.find((choice) => choice.id === correctChoiceId);
      if (correctChoice === undefined) {
        throw new Error(`Protected key does not resolve for ${item.item_id}`);
      }
      const derivation = `The correct response is “${correctChoice.text}.” Derivation: ${item.learner_operation} Use only the labeled givens, preserve the stated direction or side roles, and check the resulting sign, size, or orientation against the prompt.`;
      const correctFeedback = `That response preserves the required relationship. ${derivation}`;
      const choiceFeedback = Object.fromEntries(
        item.choices.map((choice) => {
          if (choice.id === correctChoiceId) return [choice.id, correctFeedback];
          const observed = item.observed_feature_by_choice[choice.id];
          return [
            choice.id,
            observed === undefined
              ? `The selected response “${choice.text}” does not complete the stated operation. Rebuild the relationship from the labeled givens before calculating.`
              : `That response ${observed}. Return to the first cue or operation where the representation diverges.`,
          ];
        }),
      ) as Record<VectorLessonChoiceId, string>;
      return [
        item.item_id,
        {
          correctChoiceId,
          derivation,
          correctFeedback,
          choiceFeedback,
        },
      ] as const;
    }),
  );
  const authority = Object.fromEntries(entries);
  if (Object.keys(authority).length !== Object.keys(CORRECT_CHOICE_BY_ITEM).length) {
    throw new Error('Protected answer authority and authored item inventory do not match');
  }
  return authority;
}

export const VECTOR_LESSON_PROTECTED_ANSWERS = answerAuthority();
