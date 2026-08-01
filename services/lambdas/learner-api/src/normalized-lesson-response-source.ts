import {
  LessonRuntimeResponseFactsSchema,
  type AssistanceLevel,
  type LessonItemBinding,
} from '@mcat/contracts';
import {
  parseAuthoredLessonBinding,
  type EvidenceOutcome,
  type ServerScoringResolution,
} from '@mcat/domain';

import {
  lessonContentProvider,
  type LessonContentProvider,
  type ServerItemAnswer,
} from './lesson-content-provider';
import type { LessonBindingResolution, LessonResponseSubmission } from './lesson-response-seam';
import {
  isEngineResponseOmitted,
  scoreEngineResponse,
  type EngineResponse,
  type NormalizedLessonRun,
  type NormalizedResponseRecord,
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
 * - The runtime emits FACTS only. This engine displays no scaffold, no
 *   content-bearing cue, and reveals nothing before commitment, so every
 *   administration is independent and MEASURED as such (`A0`, observed). That is
 *   an honest property of the delivery, not a fail-open default; when the engine
 *   grows assistance affordances it will report the level it displayed.
 */

const INDEPENDENT_LEVEL: AssistanceLevel = 'A0';

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

// Per (provider, lessonId) binding load. The QEP is stable for a content
// revision, so parsing it once and reusing keeps "one response, one lookup"
// cheap without re-normalizing 40 bindings on every committed answer.
const loadCacheByProvider = new WeakMap<LessonContentProvider, Map<string, NormalizedBindingLoad>>();

function bindingLoadFor(provider: LessonContentProvider, lessonId: string): NormalizedBindingLoad {
  let byLesson = loadCacheByProvider.get(provider);
  if (byLesson === undefined) {
    byLesson = new Map();
    loadCacheByProvider.set(provider, byLesson);
  }
  const cached = byLesson.get(lessonId);
  if (cached !== undefined) return cached;

  const authored = provider.getAuthoredBindings(lessonId);
  const envelope = { lessonId, artifactVersion: authored.artifactVersion };
  const bindings = new Map<string, LessonItemBinding>();
  const resolutionByItemBindingId = new Map<string, LessonBindingResolution>();

  for (const entry of authored.entries) {
    const parsed = parseAuthoredLessonBinding(envelope, entry);
    const itemBindingId = typeof entry.item_binding_id === 'string' ? entry.item_binding_id : undefined;
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
  byLesson.set(lessonId, load);
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
  response: EngineResponse,
): ServerScoringResolution {
  if (binding === null || binding.measurementKind !== 'MEASURABLE' || answer === undefined) {
    return { scoringValid: false };
  }
  const outcome: EvidenceOutcome = isEngineResponseOmitted(response)
    ? 'omitted'
    : scoreEngineResponse(answer, response)
      ? 'correct'
      : 'incorrect';
  return { scoringValid: true, serverItemVersion: SCORED_SERVER_ITEM_VERSION, outcome, protectedScoring: false };
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
  if (response.kind === 'MULTIPLE_CHOICE') return { kind: 'MULTIPLE_CHOICE', chosenChoiceId: response.choiceId };
  if (response.kind === 'SHORT') return { kind: 'CONSTRUCTED', fields: { response: response.text } };
  return { kind: 'CONSTRUCTED', fields: { ...response.fields } };
}

/** One engine-committed response, expressed only in seam vocabulary. */
export function normalizedLessonResponseSubmission(
  record: NormalizedResponseRecord,
  lessonId: string,
  provider: LessonContentProvider = lessonContentProvider,
): LessonResponseSubmission {
  const load = bindingLoadFor(provider, lessonId);
  const binding = load.bindings.get(record.itemId) ?? null;
  const bindingVersion = binding?.bindingVersion ?? load.envelopeBindingVersion;
  const answer = provider.getAnswerKey(lessonId).byItemId[record.itemId];

  return {
    lessonId,
    envelopeBindingVersion: load.envelopeBindingVersion,
    binding,
    bindingResolution: load.resolutionByItemBindingId.get(record.itemId) ?? ABSENT_BINDING,
    // Measured, not assumed: this engine has no support affordance to display.
    assistanceObserved: true,
    response: LessonRuntimeResponseFactsSchema.parse({
      questionId: record.itemId,
      itemBindingId: record.itemId,
      // The server resolves the version match before acceptance (§4); the
      // runtime never states which binding cut it believes it ran against.
      bindingVersion,
      // The engine records one committed response per item and has no retry
      // channel — re-entries are distinct items with their own bindings.
      attemptIndex: 1,
      isRetry: false,
      isDiagnosticRetry: false,
      response: toResponseFacts(record.response),
      omitted: isEngineResponseOmitted(record.response),
      // The engine's only timestamps are envelope times; a computed elapsed
      // would be a client-controlled latency signal. No pre-commit answer-change
      // channel exists, so `answerChanges` is a true zero.
      elapsedMs: 0,
      answerChanges: 0,
      assistanceLevel: INDEPENDENT_LEVEL,
      contentBearingHintUsed: false,
      revealUsed: false,
      // Administration facts: one item at a time, no passage, no timer.
      mixedAdministration: false,
      passageAdministration: false,
      timedAdministration: false,
      occurredAt: record.committedAt,
    }),
    scoring: resolveNormalizedScoring(binding, answer, record.response),
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
  provider: LessonContentProvider = lessonContentProvider,
): readonly LessonResponseSubmission[] {
  return Object.values(after.responses)
    .filter((record) => before.responses[record.itemId] === undefined)
    .map((record) => normalizedLessonResponseSubmission(record, after.lessonId, provider));
}
