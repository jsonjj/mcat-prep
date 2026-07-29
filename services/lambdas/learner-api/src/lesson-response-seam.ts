import type { LessonItemBinding, LessonRuntimeResponseFacts } from '@mcat/contracts';
import type { ServerScoringResolution } from '@mcat/domain';

/**
 * The generic lesson → mastery submission shape, and the binding-load
 * diagnostics that travel with it.
 *
 * It lives in its own module rather than in `workflow.ts` so that a second
 * lesson's runtime can produce the shape without importing the vector lesson's
 * consumer. Its proper long-term home is `@mcat/contracts` next to
 * `LessonRuntimeResponseFactsSchema`; moving it there is out of this task's
 * scope, and it is recorded as owed.
 */

/**
 * What the binding load found for the item a response arrived for.
 *
 * Required, not optional, for the same reason `AuthoredLessonBindingParse`
 * makes `unrecognizedKeys` required: a source must not be able to fail to
 * report. An unmapped author key is reported and never dropped
 * (lesson-evidence-mastery-contract §3.7), and a binding that stopped
 * validating must be distinguishable in production from an item that never
 * existed — otherwise "this item silently produces no evidence" looks
 * identical to a typo'd id.
 */
export interface LessonBindingResolution {
  /**
   * `parsed` — the binding validated. `invalid` — it exists in the artifact but
   * failed the contract, so it is withheld. `absent` — no binding carries this
   * id at all.
   */
  readonly status: 'parsed' | 'invalid' | 'absent';
  /** Author keys the normalizer did not map. Empty means full coverage. */
  readonly unrecognizedKeys: readonly string[];
}

/**
 * One lesson response, as any lesson runtime must express it.
 *
 * Carries no lesson id, KC id, item-id shape, or runtime type: a second lesson
 * wires in by producing this shape from its own runtime and reusing
 * `RepositoryLearnerKernel`'s recording path unchanged (§13).
 *
 * `binding` is nullable because an unresolvable binding is a real outcome, not
 * an error to throw on — the adapter turns it into `BINDING_NOT_FOUND` with no
 * evidence and no BKT movement.
 */
export interface LessonResponseSubmission {
  readonly lessonId: string;
  readonly envelopeBindingVersion: string;
  readonly binding: LessonItemBinding | null;
  readonly bindingResolution: LessonBindingResolution;
  readonly response: LessonRuntimeResponseFacts;
  readonly scoring: ServerScoringResolution;
  /**
   * Whether the runtime MEASURED the `response.assistanceLevel` it reported, or
   * fail-closed because it could not tell.
   *
   * "We saw them take no help" and "we could not see" are different facts, and
   * collapsing them is what made every check ineligible for a whole phase.
   * `AssistanceLevel` is a closed four-member vocabulary with no `UNOBSERVED`
   * member, so an unobserved level has to borrow one — and the borrowed value
   * cannot then be told from a measured one by looking at the level alone. This
   * flag is the distinction, and the workflow persists it on the response ledger.
   *
   * Required rather than optional, and NOT defaulted to `true`: a source that
   * does not state whether it observed has not observed. It is a report, never a
   * gate — the level it accompanies is what fails closed, so a source that lies
   * here gains no qualification it did not already have.
   */
  readonly assistanceObserved: boolean;
}
