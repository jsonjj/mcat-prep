import { z } from 'zod';

import { ExposureModeSchema, QuestionChoiceIdSchema, Sha256DigestSchema } from './question-serving';
import { UtcTimestampSchema } from './time';

const ChoiceExplanationsSchema = z
  .object({
    A: z.string().min(1),
    B: z.string().min(1),
    C: z.string().min(1),
    D: z.string().min(1),
  })
  .strict();

/**
 * Server-only scoring material, bound to the exact authorized presentation and
 * immutable item/answer versions. This module is not exported from the shared
 * contracts entrypoint.
 */
export const VersionBoundProtectedAnswerWireSchema = z
  .object({
    presentation_id: z.string().uuid(),
    learner_id: z.string().uuid(),
    question_id: z.string().trim().min(1).max(256),
    item_version: z.number().int().positive(),
    answer_version: z.number().int().positive(),
    answer_hash: Sha256DigestSchema,
    correct_answer: QuestionChoiceIdSchema,
    explanations: ChoiceExplanationsSchema,
    exposure_mode: ExposureModeSchema,
    authorized_at: UtcTimestampSchema,
  })
  .strict();

export type VersionBoundProtectedAnswerWire = z.infer<typeof VersionBoundProtectedAnswerWireSchema>;
