import { buildVectorLessonArtifacts } from '@mcat/content/v3-vector-lesson';
import {
  LessonRuntimeResponseFactsSchema,
  type AssistanceLevel,
  type LessonItemBinding,
} from '@mcat/contracts';
import { parseAuthoredLessonBinding, type ServerScoringResolution } from '@mcat/domain';

import type { LessonBindingResolution, LessonResponseSubmission } from './lesson-response-seam';
import {
  VECTOR_LESSON_PROTECTED_ANSWERS,
  type VectorLessonProtectedAnswer,
} from './vector-lesson-protected';
import type { VectorLessonResponseRecord, VectorLessonRun } from './vector-lesson-runtime';

/**
 * The vector lesson's half of the generic lesson → mastery seam.
 *
 * This module is the ONLY place that knows this particular runtime exists. It
 * reads the lesson's own authored artifacts and its own protected scoring
 * authority, and emits nothing but seam vocabulary: an immutable
 * `LessonItemBinding`, a `LessonRuntimeResponseFacts` snapshot, and a
 * `ServerScoringResolution`. Everything downstream — normalization, evidence
 * routing, BKT qualification, persistence — is `adaptLessonResponse` plus the
 * generic workflow path, neither of which knows which lesson ran.
 *
 * Two rules this file exists to hold (lesson-evidence-mastery-contract §2, §4):
 *
 * - The runtime emits FACTS. It never states correctness, independence, an
 *   evidence kind, a `pL`, or a mastery claim; `LessonRuntimeResponseFacts` is
 *   `.strict()` and has no field for any of them. Correctness is re-derived
 *   here from the protected scoring authority rather than read off the
 *   persisted run, so a tampered projection cannot assert an outcome.
 * - Nothing an author wrote may cross into a field the adapter reads as a
 *   runtime fact. See `assistanceTaken` below: this is the rule that was broken
 *   once already and is now enforced by construction — the runtime's response
 *   record carries no authored assistance field for this module to read.
 */

const LESSON_SCRIPT = buildVectorLessonArtifacts().script;

const AUTHORED_ENVELOPE = {
  lessonId: LESSON_SCRIPT.payload.lesson_id,
  artifactVersion: LESSON_SCRIPT.artifact_version,
} as const;

// ---------------------------------------------------------------------------
// Binding load, with its diagnostics surfaced rather than dropped
// ---------------------------------------------------------------------------

export interface AuthoredBindingLoad {
  readonly bindings: ReadonlyMap<string, LessonItemBinding>;
  /**
   * One entry per authored binding that did not load cleanly — invalid, or
   * carrying author keys the normalizer does not map. Empty is the healthy
   * state and is asserted by test.
   */
  readonly issues: readonly LessonBindingLoadIssue[];
  readonly resolutionByItemBindingId: ReadonlyMap<string, LessonBindingResolution>;
}

export interface LessonBindingLoadIssue {
  readonly itemBindingId: string;
  readonly status: 'parsed' | 'invalid';
  readonly unrecognizedKeys: readonly string[];
  readonly issuePaths: readonly string[];
}

/**
 * Normalize an authored question-evidence plan through the production
 * `parseAuthoredLessonBinding` seam — never a local normalizer, so this path
 * cannot drift from the on-disk conformance test.
 *
 * A binding that fails validation is withheld (fail closed: the response
 * resolves to `BINDING_NOT_FOUND`, no evidence, no BKT) but is NOT silent. It
 * is recorded as an issue here, warned at load, and reported on every response
 * that arrives for it. §3.7 requires unmapped keys to be reported, not dropped,
 * and a build-time conformance test over today's three lessons is not a runtime
 * property of the seam.
 */
export function loadAuthoredLessonBindings(
  envelope: { readonly lessonId: string; readonly artifactVersion: string },
  authoredBindings: readonly Readonly<Record<string, unknown>>[],
): AuthoredBindingLoad {
  const bindings = new Map<string, LessonItemBinding>();
  const resolutionByItemBindingId = new Map<string, LessonBindingResolution>();
  const issues: LessonBindingLoadIssue[] = [];

  for (const authored of authoredBindings) {
    const parsed = parseAuthoredLessonBinding(envelope, authored);
    const itemBindingId =
      typeof authored.item_binding_id === 'string'
        ? authored.item_binding_id
        : (`(missing item_binding_id, index ${issues.length})` as string);

    resolutionByItemBindingId.set(itemBindingId, {
      status: parsed.status,
      unrecognizedKeys: parsed.unrecognizedKeys,
    });
    if (parsed.status === 'parsed') bindings.set(parsed.binding.itemBindingId, parsed.binding);

    if (parsed.status === 'invalid' || parsed.unrecognizedKeys.length > 0) {
      issues.push({
        itemBindingId,
        status: parsed.status,
        unrecognizedKeys: parsed.unrecognizedKeys,
        issuePaths:
          parsed.status === 'invalid'
            ? parsed.issues.map((issue) => issue.path.join('.') || '(root)')
            : [],
      });
    }
  }

  return { bindings, issues, resolutionByItemBindingId };
}

const AUTHORED_BINDINGS = loadAuthoredLessonBindings(
  AUTHORED_ENVELOPE,
  LESSON_SCRIPT.payload.question_evidence_plan as unknown as readonly Readonly<
    Record<string, unknown>
  >[],
);

/** Binding-load problems for this lesson. Empty in a healthy build. */
export const VECTOR_LESSON_BINDING_LOAD_ISSUES = AUTHORED_BINDINGS.issues;

if (VECTOR_LESSON_BINDING_LOAD_ISSUES.length > 0) {
  console.warn(
    `${AUTHORED_ENVELOPE.lessonId}: ${VECTOR_LESSON_BINDING_LOAD_ISSUES.length} authored binding(s) did not load cleanly`,
    JSON.stringify(VECTOR_LESSON_BINDING_LOAD_ISSUES),
  );
}

const ABSENT_BINDING: LessonBindingResolution = { status: 'absent', unrecognizedKeys: [] };

// ---------------------------------------------------------------------------
// Server scoring resolution
// ---------------------------------------------------------------------------

/**
 * `SERVER_ITEM_VERSION_RESOLUTION` for this lesson.
 *
 * §7.1 says the caller resolves the outcome from `serverScoringAuthorityRef`,
 * so the index is keyed on the authored ref itself. The ref stays opaque — it
 * is used as a map key and never parsed — and it becomes load-bearing rather
 * than decorative: retargeting a binding's ref scores it against whatever that
 * ref serves, and a ref the authority does not serve resolves to nothing.
 *
 * The pair is (ref, `bindingVersion`): the version is pinned as a literal
 * rather than read back from the artifact so that re-cutting the lesson without
 * re-cutting the answer authority fails closed instead of silently scoring the
 * new cut with the old key.
 */
const SCORED_BINDING_VERSION = '0.1.0-internal-draft';
const SCORED_SERVER_ITEM_VERSION = 1;

const SCORING_AUTHORITY_BY_REF: ReadonlyMap<string, VectorLessonProtectedAnswer> = new Map(
  LESSON_SCRIPT.payload.question_evidence_plan.flatMap((authored) => {
    const answer = VECTOR_LESSON_PROTECTED_ANSWERS[authored.item_binding_id];
    return answer === undefined ? [] : ([[authored.server_answer_authority_ref, answer]] as const);
  }),
);

export function resolveVectorLessonScoring(
  binding: LessonItemBinding | null,
  record: VectorLessonResponseRecord,
  bindingVersion: string,
): ServerScoringResolution {
  const authority =
    binding === null || binding.measurementKind !== 'MEASURABLE'
      ? undefined
      : SCORING_AUTHORITY_BY_REF.get(binding.serverScoringAuthorityRef);
  if (authority === undefined || bindingVersion !== SCORED_BINDING_VERSION) {
    return { scoringValid: false };
  }
  return {
    scoringValid: true,
    serverItemVersion: SCORED_SERVER_ITEM_VERSION,
    // Re-derived from the authority, never read from `record.correct`.
    outcome:
      record.choiceId === null
        ? 'omitted'
        : record.choiceId === authority.correctChoiceId
          ? 'correct'
          : 'incorrect',
    // These are internal-draft instructional items, not protected unseen bank
    // items. `protected` is a warrant-bearing condition, so it is stated by the
    // scoring authority and never inferred from the presence of a scoring ref.
    protectedScoring: false,
  };
}

// ---------------------------------------------------------------------------
// Assistance TAKEN — never assistance offered
// ---------------------------------------------------------------------------

/**
 * The graded level each of this runtime's own support mechanisms supplies.
 *
 * This is the measurement lesson-evidence-mastery-contract §3.3 asks for: the
 * level names WHICH MECHANISM the runtime displayed, so it is a property of the
 * delivery rather than a copy of an authored string. The runtime has exactly two
 * ways to put solution-path support on a question screen, and it knows which one
 * it used:
 *
 * - the persistent structured reference panel (`visual`) — a standing scaffold,
 *   `A2`-class structured support;
 * - the released `REQUEST_SUPPORT` cue (`supportFor`) — one bounded procedural
 *   cue, `A1`-class.
 *
 * `A3` has no member here on purpose. `A3` means a worked solution path was in
 * front of the learner, and this runtime never puts one on a scored screen:
 * worked examples are exposition stages with no item and no commit, and feedback
 * is only reachable after commitment. So no OBSERVED administration from this
 * runtime is ever `A3`, which is what makes `A3` from this runtime mean exactly
 * one thing — see {@link UNOBSERVED_ASSISTANCE}. That property is asserted by
 * test rather than left as a reading of this comment.
 */
const SCAFFOLD_PANEL_LEVEL: AssistanceLevel = 'A2';
const RELEASED_CUE_LEVEL: AssistanceLevel = 'A1';
const NO_SUPPORT_DISPLAYED: AssistanceLevel = 'A0';

/**
 * How "assistance taken was not observed" is spelled, and why it is not simply
 * "maximum assistance".
 *
 * The closed `AssistanceLevel` vocabulary has no `UNOBSERVED` member and this
 * module may not add one — that is a `@mcat/contracts` change, reported and not
 * made. So the fail-closed emission borrows `A3`, chosen because it is the value
 * that can never satisfy `ASSISTANCE_NOT_A0`.
 *
 * Two things keep that borrowing from collapsing the distinction the way the
 * blanket `A3` did:
 *
 * - No observed level from this runtime is `A3` (above), so an `A3` on a record
 *   from this runtime is unambiguously "could not tell" rather than "we know
 *   they took the most help".
 * - `LessonResponseSubmission.assistanceObserved` states it outright, and the
 *   workflow writes it onto the response ledger, so the distinction is a
 *   persisted fact rather than an inference from the level.
 *
 * It remains fail-closed for qualification: unobserved cannot become permissive,
 * because the level it emits is the one the BKT gate refuses.
 */
const UNOBSERVED_ASSISTANCE: AssistanceLevel = 'A3';

/**
 * What help the learner actually took, and whether the runtime saw it.
 *
 * NOTHING AN AUTHOR WROTE REACHES THIS. `VectorLessonResponseRecord` carries no
 * authored `assistance_state` field at all — it was deleted rather than left
 * unread, because fail-open 6 was a guard defeated by reading around it, and an
 * unread field is an invitation to read it. The only inputs are the delivery
 * facts `commitResponse` captured from run state at the moment of commitment.
 *
 * The level is the MOST support displayed, which is the standing scaffold when
 * one was present: a panel that sat on screen for the whole administration
 * supplies more of the solution path than one bounded cue, and a learner who
 * took the cue as well took nothing beyond it that this runtime can see. Taking
 * the cue is not thereby forgotten — it lands on `contentBearingHintUsed`, which
 * disqualifies on its own.
 *
 * An OFFER is not help. `observedSupportOffered` never raises the level, because
 * a cue the learner declined carried no content toward the answer. That is the
 * whole difference between assistance offered and assistance taken (§3.3), and
 * it is why the old blanket refusal was wider than the hazard: what the design
 * makes available is the author's, but what the runtime DISPLAYED is the
 * runtime's own act, and observing your own output is not trusting the artifact.
 *
 * The scope of the observation is the administration itself — the screen bearing
 * the item. Instruction the learner met earlier in the lesson is not assistance
 * on this attempt; if it were, no lesson item could ever be unassisted, since
 * every lesson item follows teaching. Cross-item contamination is the freshness
 * and family axis, and it is enforced there.
 */
interface ObservedAssistance {
  readonly observed: boolean;
  readonly level: AssistanceLevel;
}

function assistanceTaken(record: VectorLessonResponseRecord): ObservedAssistance {
  // `restoreVectorLessonRun` casts unvalidated JSON, so the declared type cannot
  // express a run persisted before the delivery ledger existed. Checked rather
  // than trusted, and absence fails closed to unobserved.
  if (
    typeof record.observedScaffoldDisplayed !== 'boolean' ||
    typeof record.observedSupportRequested !== 'boolean'
  ) {
    return { observed: false, level: UNOBSERVED_ASSISTANCE };
  }
  if (record.observedScaffoldDisplayed) return { observed: true, level: SCAFFOLD_PANEL_LEVEL };
  if (record.observedSupportRequested) return { observed: true, level: RELEASED_CUE_LEVEL };
  return { observed: true, level: NO_SUPPORT_DISPLAYED };
}

/**
 * Whether help that carried content toward the answer was consumed.
 *
 * Observed, not assumed: `REQUEST_SUPPORT` releases `supportFor(kc)`, a
 * procedural cue toward the answer, so a request that the runtime honoured is
 * a content-bearing hint. A run persisted before the runtime recorded this
 * fact has no observation, which fails closed to `true`.
 */
function contentBearingHintUsed(record: VectorLessonResponseRecord): boolean {
  return typeof record.observedSupportRequested === 'boolean'
    ? record.observedSupportRequested
    : true;
}

/**
 * Whether answer-bearing material was shown before commitment.
 *
 * Read from the run's open-feedback state at commit rather than from the
 * authored `feedback_release_point`. This state machine has no pre-commit
 * reveal transition at all — `enterFeedback` is only reachable from
 * `submitCurrentResponse` after `commitResponse` — so unlike assistance this is
 * a complete observation rather than an unmeasured quantity. An unobserved
 * legacy record fails closed to `true`.
 */
function revealUsed(record: VectorLessonResponseRecord): boolean {
  return typeof record.observedAnswerRevealed === 'boolean' ? record.observedAnswerRevealed : true;
}

// ---------------------------------------------------------------------------
// Submission
// ---------------------------------------------------------------------------

/** One committed lesson response, expressed only in seam vocabulary. */
export function vectorLessonResponseSubmission(
  record: VectorLessonResponseRecord,
): LessonResponseSubmission {
  const binding = AUTHORED_BINDINGS.bindings.get(record.itemId) ?? null;
  const bindingVersion = binding?.bindingVersion ?? AUTHORED_ENVELOPE.artifactVersion;
  const assistance = assistanceTaken(record);

  return {
    lessonId: AUTHORED_ENVELOPE.lessonId,
    envelopeBindingVersion: AUTHORED_ENVELOPE.artifactVersion,
    binding,
    assistanceObserved: assistance.observed,
    bindingResolution:
      AUTHORED_BINDINGS.resolutionByItemBindingId.get(record.itemId) ?? ABSENT_BINDING,
    response: LessonRuntimeResponseFactsSchema.parse({
      questionId: record.itemId,
      itemBindingId: record.itemId,
      // The server resolves the version match before acceptance (§4); the
      // runtime never states which binding cut it believes it ran against.
      bindingVersion,
      // `commitResponse` rejects a second commit for the same item, so a
      // committed record is always the preserved first attempt. The runtime has
      // no retry path: repair confirmations and exact re-entries are distinct
      // items with their own bindings, not retries of this one.
      attemptIndex: 1,
      isRetry: false,
      isDiagnosticRetry: false,
      response: { kind: 'MULTIPLE_CHOICE', chosenChoiceId: record.choiceId },
      omitted: record.choiceId === null,
      // Not observed, and deliberately not derived. The runtime's only per-item
      // timestamps are the client-supplied envelope times, so a computed
      // elapsed would be a latency signal the client controls — the failure
      // `9e68e3a` removed from the decay clock, reintroduced one field over.
      // `answerChanges` is a true zero: the runtime accepts one committed
      // choice and has no pre-commit answer-change channel to count.
      elapsedMs: 0,
      answerChanges: 0,
      assistanceLevel: assistance.level,
      contentBearingHintUsed: contentBearingHintUsed(record),
      revealUsed: revealUsed(record),
      // Administration facts, not author declarations: one item at a time, no
      // passage, no timer.
      mixedAdministration: false,
      passageAdministration: false,
      timedAdministration: false,
      occurredAt: record.committedAt,
    }),
    scoring: resolveVectorLessonScoring(binding, record, bindingVersion),
  };
}

/**
 * The responses this action newly committed, in commit order.
 *
 * The runtime commits at most one response per accepted action, which is what
 * makes "one response, one event, one evidence record" enforceable upstream.
 * This returns a list rather than an optional so the workflow can assert that
 * invariant instead of assuming it.
 */
export function vectorLessonResponseSubmissions(
  before: VectorLessonRun,
  after: VectorLessonRun,
): readonly LessonResponseSubmission[] {
  return Object.values(after.committedResponses)
    .filter((record) => before.committedResponses[record.itemId] === undefined)
    .map(vectorLessonResponseSubmission);
}
