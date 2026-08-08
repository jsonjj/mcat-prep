import {
  LessonObservationAttributionSchema,
  LessonRuntimeResponseFactsSchema,
  type LessonItemBinding,
} from '@mcat/contracts';
import {
  parseAuthoredLessonBinding,
  type EvidenceOutcome,
  type ServerScoringResolution,
} from '@mcat/domain';

import { type LoadedLessonRevision, type ServerItemAnswer } from './lesson-content-provider';
import type { LessonBindingResolution, LessonResponseSubmission } from './lesson-response-seam';
import {
  isEngineResponseInvalid,
  isEngineResponseOmitted,
  scoreEngineResponse,
  type EngineResponse,
  type NormalizedLessonRun,
  type NormalizedResponseRecord,
  type NormalizedResponseRuntimeFacts,
} from './normalized-lesson-runtime';

/**
 * The NormalizedLesson engine's half of the generic lesson → mastery seam
 * (Phase 5, wave 5B.2).
 *
 * It is the analogue of `vector-lesson-response-source` for L2/L3 and every
 * future normalized lesson: it turns an engine-committed response into pure seam
 * vocabulary — an immutable `LessonItemBinding`, a `LessonRuntimeResponseFacts`
 * snapshot, and a `ServerScoringResolution` — and hands it to the SAME generic
 * `RepositoryLearnerKernel.recordLessonResponse` that already moves BKT and
 * writes evidence for any `lessonId`. Nothing downstream learns which grammar
 * ran.
 *
 * Three rules it holds, mirroring the vector source (lesson-evidence-mastery
 * contract §2, §4, §7.1):
 *
 * - Bindings are parsed through the production `parseAuthoredLessonBinding` seam
 *   over the lesson's own `question_evidence_plan`, never a local normalizer, so
 *   this path cannot drift from the on-disk conformance test.
 * - Correctness is RE-DERIVED server-side from `getAnswerKey` and the learner's
 *   raw response, never read off `record.correct` — a tampered projection cannot
 *   assert an outcome.
 * - The runtime emits FACTS only. Observed commit facts are read from the
 *   immutable response record. A legacy record without those facts fails closed;
 *   authored assistance affordance strings are never consulted.
 */

/**
 * Internal-draft instructional lessons resolve `serverItemVersion` 1 and are not
 * protected unseen-bank items — the same stance the vector lesson takes.
 * `protectedScoring` is warrant-bearing and asserted here as `false`, never
 * inferred from a scoring ref existing.
 */
const SCORED_SERVER_ITEM_VERSION = 1;

const ABSENT_BINDING: LessonBindingResolution = { status: 'absent', unrecognizedKeys: [] };

interface NormalizedBindingLoad {
  readonly bindings: ReadonlyMap<string, LessonItemBinding>;
  readonly resolutionByItemBindingId: ReadonlyMap<string, LessonBindingResolution>;
  /** Envelope `artifact_version`; the fallback binding version. Never parsed. */
  readonly envelopeBindingVersion: string;
}

// Per exact immutable revision binding load. Keying by the loaded revision object
// makes an active-pointer lookup structurally impossible on this path.
const loadCacheByRevision = new WeakMap<LoadedLessonRevision, NormalizedBindingLoad>();

function bindingLoadFor(revision: LoadedLessonRevision): NormalizedBindingLoad {
  const cached = loadCacheByRevision.get(revision);
  if (cached !== undefined) return cached;

  const authored = revision.authoredBindings;
  const envelope = { lessonId: revision.lessonId, artifactVersion: authored.artifactVersion };
  const bindings = new Map<string, LessonItemBinding>();
  const resolutionByItemBindingId = new Map<string, LessonBindingResolution>();

  for (const entry of authored.entries) {
    const parsed = parseAuthoredLessonBinding(envelope, entry);
    const itemBindingId =
      typeof entry.item_binding_id === 'string' ? entry.item_binding_id : undefined;
    if (itemBindingId !== undefined) {
      resolutionByItemBindingId.set(itemBindingId, {
        status: parsed.status,
        unrecognizedKeys: parsed.unrecognizedKeys,
      });
    }
    if (parsed.status === 'parsed') bindings.set(parsed.binding.itemBindingId, parsed.binding);
  }

  const load: NormalizedBindingLoad = {
    bindings,
    resolutionByItemBindingId,
    envelopeBindingVersion: authored.artifactVersion ?? '(unversioned)',
  };
  loadCacheByRevision.set(revision, load);
  return load;
}

/**
 * Re-derive the scored outcome from the server answer key and the learner's raw
 * response. Fails closed (no BKT, evidence still routes by kind) for a
 * non-measurable binding or an item the key does not cover.
 */
function resolveNormalizedScoring(
  binding: LessonItemBinding | null,
  answer: ServerItemAnswer | undefined,
  record: NormalizedResponseRecord,
): ServerScoringResolution {
  if (binding === null || binding.measurementKind !== 'MEASURABLE' || answer === undefined) {
    return { scoringValid: false };
  }
  const outcome: EvidenceOutcome = isEngineResponseOmitted(record.response)
    ? 'omitted'
    : record.outcome === 'INVALID' || isEngineResponseInvalid(record.response)
      ? 'incorrect'
      : scoreEngineResponse(answer, record.response)
        ? 'correct'
        : 'incorrect';
  return {
    scoringValid: true,
    serverItemVersion: SCORED_SERVER_ITEM_VERSION,
    outcome,
    protectedScoring: false,
  };
}

type ResponseFacts =
  | { readonly kind: 'MULTIPLE_CHOICE'; readonly chosenChoiceId: string | null }
  | { readonly kind: 'CONSTRUCTED'; readonly fields: Readonly<Record<string, string | null>> };

/**
 * Map an engine response to the two shapes the seam response vocabulary carries.
 * A single free/short answer is one constructed field (`response`), which is how
 * `LessonRuntimeResponseFacts` represents a non-multiple-choice answer.
 */
function toResponseFacts(response: EngineResponse): ResponseFacts {
  if (response.kind === 'MULTIPLE_CHOICE')
    return { kind: 'MULTIPLE_CHOICE', chosenChoiceId: response.choiceId };
  if (response.kind === 'SHORT')
    return { kind: 'CONSTRUCTED', fields: { response: response.text } };
  return { kind: 'CONSTRUCTED', fields: { ...response.fields } };
}

interface RuntimeFactResolution {
  readonly observed: boolean;
  readonly facts: NormalizedResponseRuntimeFacts;
}

function runtimeFactsFor(
  record: NormalizedResponseRecord,
  lessonId: string,
): RuntimeFactResolution {
  if (record.runtimeFacts !== undefined) {
    return { observed: true, facts: record.runtimeFacts };
  }
  return {
    observed: false,
    facts: {
      responseId: `legacy:${lessonId}:${record.itemId}:${record.committedAt}`,
      attemptIndex: 2,
      firstAttempt: false,
      isRetry: true,
      isDiagnosticRetry: false,
      assistanceRequested: false,
      assistanceTaken: false,
      assistanceLevel: 'A3',
      contentBearingHintUsed: false,
      revealUsed: false,
      mixedAdministration: false,
      passageAdministration: false,
      timedAdministration: false,
    },
  };
}

/** One engine-committed response, expressed only in seam vocabulary. */
export function normalizedLessonResponseSubmission(
  record: NormalizedResponseRecord,
  revision: LoadedLessonRevision,
): LessonResponseSubmission {
  const load = bindingLoadFor(revision);
  const binding = load.bindings.get(record.itemId) ?? null;
  const bindingVersion = binding?.bindingVersion ?? load.envelopeBindingVersion;
  const questionId = binding?.measurementKind === 'MEASURABLE' ? binding.questionId : record.itemId;
  const answer = revision.protectedAuthority.answerKey.byItemId[record.itemId];
  const runtime = runtimeFactsFor(record, revision.lessonId);
  const scoring = resolveNormalizedScoring(binding, answer, record);
  const lessonAttribution =
    binding?.measurementKind === 'MEASURABLE' && scoring.scoringValid
      ? LessonObservationAttributionSchema.parse({
          lessonId: revision.lessonId,
          definitionHash: revision.definitionHash,
          questionId: binding.questionId,
          itemBindingId: binding.itemBindingId,
          bindingVersion,
          serverItemVersion: scoring.serverItemVersion,
          primaryKcId: binding.primaryKcId,
          activityRole: binding.activityRole,
          exitFunction: record.exitFunction,
          semanticFamilyId: binding.semanticFamilyId,
          responseId: runtime.facts.responseId,
          responseOccurredAt: record.committedAt,
          serverScoringAuthorityRef: binding.serverScoringAuthorityRef,
          isReentry: record.isReentry,
        })
      : undefined;

  return {
    lessonId: revision.lessonId,
    envelopeBindingVersion: load.envelopeBindingVersion,
    binding,
    bindingResolution: load.resolutionByItemBindingId.get(record.itemId) ?? ABSENT_BINDING,
    assistanceObserved: runtime.observed,
    ...(runtime.observed
      ? {
          runtimeObservation: {
            firstAttempt: runtime.facts.firstAttempt,
            assistanceRequested: runtime.facts.assistanceRequested,
            assistanceTaken: runtime.facts.assistanceTaken,
          },
        }
      : {}),
    response: LessonRuntimeResponseFactsSchema.parse({
      questionId,
      itemBindingId: binding?.itemBindingId ?? record.itemId,
      // The server resolves the version match before acceptance (§4); the
      // runtime never states which binding cut it believes it ran against.
      bindingVersion,
      attemptIndex: runtime.facts.attemptIndex,
      isRetry: runtime.facts.isRetry,
      isDiagnosticRetry: runtime.facts.isDiagnosticRetry,
      response: toResponseFacts(record.response),
      omitted: isEngineResponseOmitted(record.response),
      // The engine's only timestamps are envelope times; a computed elapsed
      // would be a client-controlled latency signal. No pre-commit answer-change
      // channel exists, so `answerChanges` is a true zero.
      elapsedMs: 0,
      answerChanges: 0,
      assistanceLevel: runtime.facts.assistanceLevel,
      contentBearingHintUsed: runtime.facts.contentBearingHintUsed,
      revealUsed: runtime.facts.revealUsed,
      mixedAdministration: runtime.facts.mixedAdministration,
      passageAdministration: runtime.facts.passageAdministration,
      timedAdministration: runtime.facts.timedAdministration,
      occurredAt: record.committedAt,
    }),
    scoring,
    ...(lessonAttribution === undefined ? {} : { lessonAttribution }),
  };
}

/**
 * The responses this action newly committed, in commit order.
 *
 * The engine commits at most one response per accepted action, so this returns a
 * list (0 or 1) rather than an optional, letting the workflow assert the "one
 * response, one event, one evidence record" invariant instead of assuming it.
 */
export function normalizedLessonResponseSubmissions(
  before: NormalizedLessonRun,
  after: NormalizedLessonRun,
  revision: LoadedLessonRevision,
): readonly LessonResponseSubmission[] {
  return Object.values(after.responses)
    .filter((record) => before.responses[record.itemId] === undefined)
    .map((record) => normalizedLessonResponseSubmission(record, revision));
}
