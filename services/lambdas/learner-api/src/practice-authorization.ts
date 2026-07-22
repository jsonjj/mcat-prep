import type { Principal } from '@mcat/authority-kernel';
import { ContentIdSchema, type ContentId } from '@mcat/contracts';

/** Server-owned policy boundary for content that may use the low-stakes practice API. */
export interface PracticeAuthorizationPolicy {
  permits(principal: Principal, questionId: ContentId): boolean;
}

const SYNTHETIC_PASSAGE_OF_THE_DAY = ContentIdSchema.parse('q-enz-passage-1');

const assignedPracticeItems = new Set<ContentId>([SYNTHETIC_PASSAGE_OF_THE_DAY]);

/**
 * Development currently has one explicit Passage-of-the-Day assignment. Protected
 * forms and all other bank items remain inaccessible through the practice API.
 */
export const syntheticPracticeAuthorizationPolicy: PracticeAuthorizationPolicy = {
  permits(_principal, questionId) {
    return assignedPracticeItems.has(questionId);
  },
};
