import {
  Button,
  Callout,
  Card,
  CardBody,
  CardHeader,
  Code,
  CollapsibleSection,
  Divider,
  Grid,
  H1,
  H2,
  H3,
  Pill,
  Row,
  Select,
  Spacer,
  Stack,
  Stat,
  Table,
  Text,
  useCanvasState,
  useHostTheme,
} from 'cursor/canvas';
import { useEffect, useRef } from 'react';

type ChoiceId = 'A' | 'B' | 'C' | 'D';
type ResponseId = ChoiceId | 'NS' | 'OMIT';
type KcId = 'V3-KC-189442' | 'V3-KC-730249' | 'V3-KC-072322';
type Mode = 'learner' | 'reviewer';
type Route =
  | 'unselected'
  | 'concise'
  | 'standard'
  | 'misconception'
  | 'prerequisite-support'
  | 'local-support';
type Assistance = 'entry' | 'A3' | 'A2' | 'A1' | 'A0';
type ReviewerTab = 'manifest' | 'content' | 'maps' | 'evidence' | 'qa';
type RunStatus = 'active' | 'completed' | 'paused' | 'blocked';
type CreditEligibility =
  | 'routing_only'
  | 'instruction_only'
  | 'support_only'
  | 'instructional_exit_candidate'
  | 'simulation_only_never_untouched';
type GovernedOperationId = 'LES-386478-GOVOP-REFERENCE-RESOLUTION-v1';
type SupportArtifactId = 'V3-EDG-971610' | 'V3-SUP-900002';
type ConstructRef =
  | { type: 'kc'; id: KcId }
  | { type: 'capstone'; id: 'V3-CAP-027756' }
  | { type: 'governed_operation'; id: GovernedOperationId };
type EventExpectedTiming = {
  contractVersion: 'les-386478-expected-timing-v2';
  normalizedUnit: 'milliseconds';
  itemExpectedDurationMs: number | null;
  observedTimingStatus: 'outside_canvas_scope_not_implemented';
};
type ExpectedTimingEnvelope = {
  contractVersion: 'les-386478-expected-timing-v2';
  basis: 'normative_expected_duration_not_observed';
  normalizedUnit: 'milliseconds';
  shellTotalsScope: 'core_three_kc_instruction_before_increments';
  shellTotals: {
    concise: { minMs: number; maxMs: number };
    standard: { minMs: number; maxMs: number };
  };
  routeIncrementsPerActivatedKc: {
    misconception: number;
    prerequisiteSupport: number;
    localSupport: number;
  };
  recoveryIncrements: {
    initialHardEdgeBridge: number;
    dedicatedHardEdgeRepairAndReentry: number;
    localSupportAndConfirmation: number;
  };
  repairIncrements: {
    perAttemptedCyclePerKc: number;
    maximumCyclesPerKc: 2;
  };
  transitionsAndBreaks: {
    betweenKcTransitionCount: 2;
    perTransitionMs: number;
    scheduledBreakCount: 1;
    perBreakMs: number;
    breakPolicy: 'normative_allowance_not_observed_or_enforced';
  };
  worstValidBranch: {
    totalMs: number;
    formula: string;
    excludesTerminalPauseTime: true;
  };
  capstone: {
    included: false;
    id: 'V3-CAP-027756';
  };
  observedTiming: {
    implemented: false;
    status: 'outside_this_canvas_scope';
  };
};

type Sentence = {
  id: string;
  text: string;
  role?: string;
};

type Paragraph = {
  id: string;
  sentences: Sentence[];
};

type Stimulus = {
  id: string;
  title: string;
  domain: string;
  familyId: string;
  paragraphs: Paragraph[];
  map: string;
};

type Item = {
  id: string;
  kcId: KcId;
  hostKcId?: KcId;
  primaryConstruct?: ConstructRef;
  supportArtifact?: SupportArtifactId | null;
  creditEligibility?: CreditEligibility;
  stage: string;
  stimulusId: string;
  commitGroup: string;
  assistance: Assistance;
  evidence: 'routing' | 'instruction' | 'instructional_exit';
  stem: string;
  support?: string;
  choices: Record<ChoiceId, string>;
  key: ChoiceId;
  rationales: Record<ChoiceId, string>;
  explanation: string;
  hint: string;
  expectedSeconds: number;
};

type LessonEventCommon = {
  envelopeVersion: 'les-386478-event-v4';
  eventId: string;
  runId: string;
  sequence: number;
  runSequence: number;
  prototypeOrder: string;
  screenId: string;
  creditEligibility: CreditEligibility | null;
  registrySha: string;
  graphFreeze: string;
  sequenceFreeze: string;
  phaseId: 'V3-PHS-935127';
  moduleId: 'V3-MOD-326514';
  moduleEventOrdinal: 1;
  lessonOrdinal: 87;
  contentVersion: string;
  policyVersion: string;
  reviewedContentHash: null;
  reviewedContentHashStatus: 'pending_independent_review';
  actorMode: Mode;
  simulationMode: true;
  runtimeContext: 'cursor_canvas_internal_simulation';
  runStatus: RunStatus;
  expectedTiming: EventExpectedTiming;
  unimplementedFields: Array<'wallClockTimestamp' | 'observedTiming' | 'signedActorIdentity'>;
};

type LessonEventPayloadMap = {
  lesson_shell_started: {
    lessonId: 'V3-LES-386478';
    action: 'initialized';
    expectedTimingEnvelope: ExpectedTimingEnvelope;
  };
  screen_activated: {
    activatedScreenId: string;
    reason: string;
    mutable: boolean;
  };
  lesson_checkpoint_completed: {
    checkpointScreenId: string;
    checkpoint: string;
  };
  kc_microcycle_started: {
    kcId: KcId;
    entryScreenId: string;
    routeAtStart: Route;
  };
  stimulus_presented: {
    stimulusId: string;
    familyId: string;
    reason: string;
  };
  item_presented: {
    itemId: string;
    stimulusId: string;
    familyId: string;
    commitGroup: string;
    hostKcId: KcId;
    primaryConstruct: ConstructRef;
    supportArtifact: SupportArtifactId | null;
    assistance: Assistance;
    eligibility: CreditEligibility;
    reason: string;
  };
  hint_requested: {
    itemId: string;
    commitGroup: string;
    queuedUntilCommit: true;
    contaminatesExitCandidate: boolean;
  };
  attempt_submitted: {
    itemId: string;
    commitGroup: string;
    response: ResponseId;
    correct: boolean;
    omitted: boolean;
    assistance: Assistance;
    eligibility: CreditEligibility;
  };
  answer_feedback_revealed: {
    commitGroups: string[];
    allLinkedResponsesCommitted: true;
    scope: 'instruction_feedback_only';
  };
  instruction_route_selected: {
    kcId: KcId;
    route: Route;
    sourceScreenId: string;
  };
  repair_closure_verified: {
    kcId: KcId;
    groupId: string;
    priorExitRemainsMonotonic: true;
  };
  kc_instructional_exit_simulated: {
    kcId: KcId;
    groupId: string;
    simulation: true;
    capstoneCredit: false;
  };
  exact_kc_repair_activity_started: {
    kcId: KcId;
    cycle: 1 | 2;
    failedGroupId: string;
  };
  kc_paused_for_repair: {
    kcId: KcId;
    failedGroupId: string;
    retiredGroupIds: string[];
    terminal: true;
  };
  kc_paused_for_retired_family: {
    kcId: KcId;
    retiredGroupId: string;
    terminal: true;
  };
  kc_paused_for_support: {
    kcId: KcId;
    supportArtifact: 'V3-SUP-900002';
    failedGroupId: string;
    terminal: true;
  };
  sequence_reentry_target_persisted: {
    target: ReentryTarget;
  };
  kc_resumed_at_reentry: {
    kcId: KcId;
    edgeId: 'V3-EDG-971610';
    replacementGroupId: 'k2-bridge-replacement';
    targetVersion: 'les-386478-reentry-v1';
  };
  invalid_content_blocked: {
    sourceScreenId: string;
    invalidIds: string[];
    transition: 'blocked';
    reason:
      | 'visible_content_preflight_failed'
      | 'exit_preflight_failed'
      | 'persisted_invalid_activity_detected';
  };
  internal_review_key_access_started: {
    itemCount: number;
    stimulusCount: number;
    familyCount: number;
    forcesSimulation: true;
  };
  lesson_simulation_completed: {
    lessonId: 'V3-LES-386478';
    orderedKcIds: ['V3-KC-189442', 'V3-KC-730249', 'V3-KC-072322'];
    triggerKcId: 'V3-KC-072322';
    atomicWithTriggerExit: true;
    idempotent: true;
    capstoneExcluded: 'V3-CAP-027756';
    productionHostEvent: 'lesson_delivery_completed';
    canvasEmitsProductionHostEvent: false;
  };
};

type LessonEventType = keyof LessonEventPayloadMap;
type LessonEvent = {
  [Type in LessonEventType]: LessonEventCommon & {
    type: Type;
    payload: LessonEventPayloadMap[Type];
  };
}[LessonEventType];

type ExposureRecord = {
  envelopeVersion: 'les-386478-exposure-v3';
  exposureId: string;
  runId: string;
  sequence: number;
  actorMode: Mode;
  contentVersion: string;
  policyVersion: string;
  reviewedContentHash: null;
  reviewedContentHashStatus: 'pending_independent_review';
  stimulusIds: string[];
  familyIds: string[];
  itemIds: string[];
  exposureClass:
    | 'learner_item_presentation'
    | 'learner_response_commit'
    | 'learner_answer_feedback'
    | 'internal_review_key_access'
    | 'invalid_content_block';
  creditEligibility: CreditEligibility | null;
  detail: string;
};

type ReentryTarget = {
  version: 'les-386478-reentry-v1';
  edgeId: 'V3-EDG-971610';
  sourceKcId: KcId;
  hostKcId: KcId;
  returnScreen: 'k2-entry';
  requiredReplacementGroup: 'k2-bridge-replacement';
  createdInRunId: string;
};

type LessonState = {
  mode: Mode;
  reviewerTab: ReviewerTab;
  runStatus: RunStatus;
  runId: string;
  runContentVersion: string;
  currentScreen: string;
  activeScreen: string;
  reached: string[];
  responses: Record<string, ResponseId>;
  committedGroups: string[];
  retiredGroups: string[];
  presentedItemIds: string[];
  presentedStimulusIds: string[];
  hintsQueued: string[];
  assistedItems: string[];
  routes: Record<KcId, Route>;
  repairCycles: Record<KcId, number>;
  exited: Record<KcId, boolean>;
  pausedAt: KcId | null;
  pausedReason: string | null;
  simulationCompletionRecorded: boolean;
  reentryTarget: ReentryTarget | null;
  bridgeStatus: 'none' | 'repair_required' | 'repair_active' | 'replacement_pending' | 'resolved';
  reviewerKeysExposed: boolean;
  exposures: ExposureRecord[];
  blockedInvalidIds: string[];
  announcement: string;
  events: LessonEvent[];
};

const KC1 = 'V3-KC-189442' as const;
const KC2 = 'V3-KC-730249' as const;
const KC3 = 'V3-KC-072322' as const;
const EVENT_ENVELOPE_VERSION = 'les-386478-event-v4' as const;
const EXPOSURE_ENVELOPE_VERSION = 'les-386478-exposure-v3' as const;
const CONTENT_VERSION = 'les-386478-canvas-v0.5.0-prototype';
const CANVAS_RUNTIME_CONTEXT = 'cursor_canvas_internal_simulation' as const;
const POLICY_VERSION = 'mcat-learning-flow-2026-07-22';
const REGISTRY_SHA = '635c39e9c0ebb28a3892399449aa9b74893aae3264924cd739b92b6e370ba26a';
const GRAPH_FREEZE = 'MCAT-V3-GRAPH-FRZ-2026-07-22-01';
const SEQUENCE_FREEZE = 'MCAT-V3-SEQUENCE-FRZ-2026-07-22-01';
const REFERENCE_RESOLUTION_OPERATION_ID: GovernedOperationId =
  'LES-386478-GOVOP-REFERENCE-RESOLUTION-v1';
const CREDIT_ELIGIBILITIES: CreditEligibility[] = [
  'routing_only',
  'instruction_only',
  'support_only',
  'instructional_exit_candidate',
  'simulation_only_never_untouched',
];
const EXPECTED_TIMING_ENVELOPE: ExpectedTimingEnvelope = {
  contractVersion: 'les-386478-expected-timing-v2',
  basis: 'normative_expected_duration_not_observed',
  normalizedUnit: 'milliseconds',
  shellTotalsScope: 'core_three_kc_instruction_before_increments',
  shellTotals: {
    concise: { minMs: 2160000, maxMs: 2520000 },
    standard: { minMs: 2580000, maxMs: 2940000 },
  },
  routeIncrementsPerActivatedKc: {
    misconception: 180000,
    prerequisiteSupport: 180000,
    localSupport: 180000,
  },
  recoveryIncrements: {
    initialHardEdgeBridge: 180000,
    dedicatedHardEdgeRepairAndReentry: 480000,
    localSupportAndConfirmation: 240000,
  },
  repairIncrements: {
    perAttemptedCyclePerKc: 300000,
    maximumCyclesPerKc: 2,
  },
  transitionsAndBreaks: {
    betweenKcTransitionCount: 2,
    perTransitionMs: 60000,
    scheduledBreakCount: 1,
    perBreakMs: 300000,
    breakPolicy: 'normative_allowance_not_observed_or_enforced',
  },
  worstValidBranch: {
    totalMs: 6600000,
    formula:
      '49m standard max + 9m route increments + 15m recoveries + 30m bounded repair attempts on a successful branch + 7m transitions/break allowance',
    excludesTerminalPauseTime: true,
  },
  capstone: {
    included: false,
    id: 'V3-CAP-027756',
  },
  observedTiming: {
    implemented: false,
    status: 'outside_this_canvas_scope',
  },
};
const EXIT_GROUP_MANIFEST: Record<string, { kcId: KcId; expectedItemCount: 2 }> = {
  'k1-exit0': { kcId: KC1, expectedItemCount: 2 },
  'k1-exit1': { kcId: KC1, expectedItemCount: 2 },
  'k1-exit2': { kcId: KC1, expectedItemCount: 2 },
  'k2-exit0': { kcId: KC2, expectedItemCount: 2 },
  'k2-exit1': { kcId: KC2, expectedItemCount: 2 },
  'k2-exit2': { kcId: KC2, expectedItemCount: 2 },
  'k3-exit0': { kcId: KC3, expectedItemCount: 2 },
  'k3-exit1': { kcId: KC3, expectedItemCount: 2 },
  'k3-exit2': { kcId: KC3, expectedItemCount: 2 },
};
const SUPPORT_ONLY_EXIT_GROUP_MANIFEST: Record<
  string,
  {
    primaryKcId: KcId;
    hostKcId: KcId;
    supportArtifact: 'V3-EDG-971610';
    expectedItemCount: 2;
  }
> = {
  'k1-bridge-exit': {
    primaryKcId: KC1,
    hostKcId: KC2,
    supportArtifact: 'V3-EDG-971610',
    expectedItemCount: 2,
  },
};

const ROLE_CHOICES: Record<ChoiceId, string> = {
  A: 'Conclusion — a claim supported by other passage parts.',
  B: 'Evidence — a reported observation or record offered as a basis.',
  C: 'Illustration — a concrete case that makes an idea easier to see.',
  D: 'Background — context that frames the issue without doing the local supporting work.',
};

const REL_CHOICES: Record<ChoiceId, string> = {
  A: 'Direct support — gives a reason to accept the target.',
  B: 'Qualification — narrows the target’s scope without rejecting it.',
  C: 'Objection — challenges the target.',
  D: 'Concession — grants part of a challenge.',
};

const LINK_CHOICES: Record<ChoiceId, string> = {
  A: 'Genuine reason link — the earlier part supplies the stated reason for the later part.',
  B: 'Genuine contrast or qualification link — the later part meaningfully limits or contrasts with the earlier part.',
  C: 'Genuine example link — the later part is a relevant instance of the earlier part.',
  D: 'Apparent link only — the asserted connection lacks a passage-internal bridge.',
};

function s(id: string, text: string, role?: string): Sentence {
  return { id, text, role };
}

function passage(
  id: string,
  title: string,
  domain: string,
  familyId: string,
  map: string,
  sentences: Sentence[],
): Stimulus {
  const firstSentenceId = sentences[0]?.id;
  const paragraphId = firstSentenceId ? firstSentenceId.replace(/\.S\d+$/, '') : `${id}.P1`;
  return {
    id,
    title,
    domain,
    familyId,
    map,
    paragraphs: [{ id: paragraphId, sentences }],
  };
}

function r(a: string, b: string, c: string, d: string): Record<ChoiceId, string> {
  return { A: a, B: b, C: c, D: d };
}

const ANCHOR: Stimulus = {
  id: 'cars-l386-anchor-01',
  title: 'What a Replica Can Admit',
  domain: 'Humanities · museum interpretation · fictional',
  familyId: 'cars-l386-anchor-family',
  map: 'S1–S2 background; S3 intermediate conclusion; S4 evidence + S5 interpretive reason are complementary premises for S3; S6 illustrates S5; S7 qualifies S3; S8 supports S7; S9 objects to S12; S10 concedes a bounded part of S9; S11 answers S9 and supports S12; S3 + S7 + S11 → S12 final conclusion.',
  paragraphs: [
    {
      id: 'A.P1',
      sentences: [
        s(
          'A.P1.S1',
          'In many local museums, fragile tools remain behind glass while replicas sit on handling tables.',
          'Background',
        ),
        s(
          'A.P1.S2',
          'Curators often describe this arrangement as a compromise between preservation and access.',
          'Background / attributed framing',
        ),
        s(
          'A.P1.S3',
          'But a handling replica should be treated as an interpretation, not merely as a second-best copy.',
          'Intermediate conclusion',
        ),
        s(
          'A.P1.S4',
          'In a pilot described by one fictional museum, visitors who lifted a replica plane wrote more often about the tool’s weight than visitors who saw only a photograph.',
          'Evidence',
        ),
      ],
    },
    {
      id: 'A.P2',
      sentences: [
        s(
          'A.P2.S5',
          'Weight, after all, directs attention to the repeated bodily effort that the tool demanded.',
          'Supporting reason',
        ),
        s(
          'A.P2.S6',
          'A visitor may, for example, imagine why a craftsperson shifted grip during a long task.',
          'Illustration',
        ),
        s(
          'A.P2.S7',
          'Touch does not, however, recover the whole history of work.',
          'Qualification',
        ),
        s(
          'A.P2.S8',
          'The replica cannot by itself disclose wages, workshop noise, or workers’ own judgments.',
          'Support for qualification',
        ),
      ],
    },
    {
      id: 'A.P3',
      sentences: [
        s(
          'A.P3.S9',
          'Some curators object that labels emphasizing reconstruction will make visitors distrust every display.',
          'Objection',
        ),
        s(
          'A.P3.S10',
          'That concern is reasonable when a warning is so elaborate that it overwhelms the object.',
          'Bounded concession',
        ),
        s(
          'A.P3.S11',
          'Yet a brief label can state what was reconstructed and what remains unknown without inviting wholesale doubt.',
          'Response to objection',
        ),
        s(
          'A.P3.S12',
          'Museums should therefore pair touchable replicas with concise limits labels, expanding access while making interpretation visible.',
          'Final conclusion',
        ),
      ],
    },
  ],
};

const STIMULI: Stimulus[] = [
  ANCHOR,
  passage(
    'cars-l386-k1-entry-01',
    'Ticket stubs as records',
    'Humanities · local cultural history · fictional',
    'cars-l386-k1-entry-family',
    'S1 background; S2 evidence; S2 → S3; S3 conclusion.',
    [
      s(
        'K1E.P1.S1',
        'For decades, a neighborhood cinema stored discarded ticket stubs in unlabeled boxes.',
      ),
      s(
        'K1E.P1.S2',
        'When volunteers later sorted the stubs by year, they found that sold-out screenings clustered around local festivals.',
      ),
      s(
        'K1E.P1.S3',
        'The cinema should therefore treat the stubs as records of community routines, not merely as paper waste.',
      ),
    ],
  ),
  passage(
    'cars-l386-k1-disambiguator-01',
    'Record versus possible use',
    'Humanities · archive accessibility · fictional',
    'cars-l386-k1-disambiguator-family',
    'S1 is reported evidence; S2 is an illustration. The contrast isolates report versus imagined case.',
    [
      s('K1D.P1.S1', 'The archivist’s log records repeated requests for audio descriptions.'),
      s('K1D.P1.S2', 'For example, a visitor might want to hear how a faded sign once looked.'),
    ],
  ),
  passage(
    'cars-l386-k1-a2-01',
    'Photographs of murals',
    'Humanities · public art archives · fictional',
    'cars-l386-k1-a2-family',
    'S1 background; S2 evidence → S3 conclusion.',
    [
      s('K1A2.P1.S1', 'Community murals are often photographed before weather changes them.'),
      s(
        'K1A2.P1.S2',
        'In one fictional archive’s log, residents using the photographs identified details they had stopped noticing on the wall.',
      ),
      s(
        'K1A2.P1.S3',
        'The photographs should be cataloged not only as copies but also as records of attention.',
      ),
    ],
  ),
  passage(
    'cars-l386-k1-a1-01',
    'The interrupting footnote',
    'Humanities · literary criticism',
    'cars-l386-k1-a1-family',
    'S1 claim; S2 develops the claim; S3 illustrates S2.',
    [
      s('K1A1.P1.S1', 'A footnote can interrupt a novel’s pace.'),
      s('K1A1.P1.S2', 'Yet that interruption can make a reader notice the act of reading.'),
      s(
        'K1A1.P1.S3',
        'For example, a footnote that disputes the narrator’s date forces the reader to compare two voices.',
      ),
    ],
  ),
  passage(
    'cars-l386-k1-a0-01',
    'Waiting and perceived safety',
    'Social sciences · public-space survey · fictional',
    'cars-l386-k1-a0-family',
    'S1 background; S2 evidence → S3 conclusion.',
    [
      s('K1A0.P1.S1', 'A city survey asked residents to mark places they avoided after dark.'),
      s('K1A0.P1.S2', 'Responses clustered around crossings with long waits.'),
      s(
        'K1A0.P1.S3',
        'Planners should therefore examine waiting time, not lighting alone, when studying perceived safety.',
      ),
    ],
  ),
  passage(
    'cars-l386-k1-contrast-01',
    'Record versus imagined case',
    'Social sciences · project participation · fictional',
    'cars-l386-k1-contrast-family',
    'S1 evidence; S2 illustration. The decisive feature is reported record versus imagined case.',
    [
      s(
        'K1C.P1.S1',
        'In the project’s records, 18 of 24 participants returned to annotate a second photograph.',
      ),
      s(
        'K1C.P1.S2',
        'Imagine one participant returning because a familiar doorway looked different in the photograph.',
      ),
    ],
  ),
  passage(
    'cars-l386-k1-exit0-near',
    'Photograph labels',
    'Humanities · neighborhood archive · fictional',
    'cars-l386-k1-exit0-near-family',
    'S1 background; S2 evidence → S3 conclusion.',
    [
      s('K1X0N.P1.S1', 'A neighborhood archive tested two label styles for donated photographs.'),
      s(
        'K1X0N.P1.S2',
        'In comment cards, visitors using labels that named the photographer more often described the image as a chosen viewpoint.',
      ),
      s(
        'K1X0N.P1.S3',
        'The archive should identify photographers when that information is available.',
      ),
    ],
  ),
  passage(
    'cars-l386-k1-exit0-changed',
    'Repetition in a poem',
    'Humanities · literary criticism',
    'cars-l386-k1-exit0-changed-family',
    'S1 claim; S2 illustration; S3 conclusion.',
    [
      s('K1X0C.P1.S1', 'A critic argues that repeated words in a poem can organize attention.'),
      s(
        'K1X0C.P1.S2',
        'For example, the same word at the start of three stanzas can make the stanzas answer one another.',
      ),
      s('K1X0C.P1.S3', 'Editors should not automatically smooth every repetition.'),
    ],
  ),
  passage(
    'cars-l386-k1-r1a',
    'A connected history walk',
    'Humanities · local history interpretation · fictional',
    'cars-l386-k1-r1a-family',
    'S1 background; S2 supporting reason → S3 conclusion.',
    [
      s(
        'K1R1A.P1.S1',
        'A local history walk follows the river through sites usually described separately.',
      ),
      s('K1R1A.P1.S2', 'The route presents the district as a connected story.'),
      s('K1R1A.P1.S3', 'The walk should make that connecting idea explicit in its title.'),
    ],
  ),
  passage(
    'cars-l386-k1-r1b',
    'Observed pause versus imagined pause',
    'Humanities · gallery interpretation · fictional',
    'cars-l386-k1-r1b-family',
    'S1 is reported evidence; S2 is an illustration.',
    [
      s('K1R1B.P1.S1', 'In timed observations, visitors stayed longer at unlabeled works.'),
      s('K1R1B.P1.S2', 'Imagine a visitor pausing because no caption supplies a quick category.'),
    ],
  ),
  passage(
    'cars-l386-k1-exit1-near',
    'Temporary display shelves',
    'Social sciences · reading-room behavior · fictional',
    'cars-l386-k1-exit1-near-family',
    'S1 background; S2 evidence → S3 conclusion.',
    [
      s('K1X1N.P1.S1', 'A reading room tried placing returned books on a temporary display shelf.'),
      s(
        'K1X1N.P1.S2',
        'Checkout records showed those books were borrowed sooner than comparable books placed in storage.',
      ),
      s('K1X1N.P1.S3', 'The room should display returns briefly before storing them.'),
    ],
  ),
  passage(
    'cars-l386-k1-exit1-changed',
    'An inventory in fiction',
    'Humanities · narrative form',
    'cars-l386-k1-exit1-changed-family',
    'S1 claim; S2 illustration; S3 conclusion.',
    [
      s('K1X1C.P1.S1', 'A novelist can interrupt a scene with an inventory.'),
      s(
        'K1X1C.P1.S2',
        'For instance, listing each chipped cup can make scarcity visible without naming it.',
      ),
      s('K1X1C.P1.S3', 'Such inventories can carry argument as well as description.'),
    ],
  ),
  passage(
    'cars-l386-k1-r2',
    'Sound alongside text',
    'Social sciences · neighborhood archive · fictional',
    'cars-l386-k1-r2-family',
    'S1 background; S2 supporting claim; S2 → S3 conclusion.',
    [
      s('K1R2.P1.S1', 'Residents recorded evening sounds for a neighborhood archive.'),
      s('K1R2.P1.S2', 'The recordings include voices normally absent from written minutes.'),
      s('K1R2.P1.S3', 'The archive should preserve sound alongside text.'),
    ],
  ),
  passage(
    'cars-l386-k1-exit2-near',
    'Saturday archive hours',
    'Social sciences · access policy · fictional',
    'cars-l386-k1-exit2-near-family',
    'S1 background; S3 evidence → S2 conclusion. Support follows its target.',
    [
      s('K1X2N.P1.S1', 'A neighborhood archive operates in two rooms above a pharmacy.'),
      s('K1X2N.P1.S2', 'Its volunteers argue that the archive should add Saturday hours.'),
      s('K1X2N.P1.S3', 'Sign-in sheets show that most turned-away visitors came on weekends.'),
    ],
  ),
  passage(
    'cars-l386-k1-exit2-changed',
    'Silence in film',
    'Humanities · film criticism',
    'cars-l386-k1-exit2-changed-family',
    'S1 claim; S2 evidence → S3 conclusion.',
    [
      s('K1X2C.P1.S1', 'A critic claims that silence can organize a film scene.'),
      s(
        'K1X2C.P1.S2',
        'In audience notes from one fictional screening, viewers most often mentioned the scene’s long pause.',
      ),
      s('K1X2C.P1.S3', 'The pause therefore deserves analysis as part of the scene’s form.'),
    ],
  ),
  passage(
    'cars-l386-k2-entry-01',
    'A stable rehearsal room',
    'Social sciences · community arts policy · fictional',
    'cars-l386-k2-entry-family',
    'S1 evidence → S2 conclusion through direct support.',
    [
      s(
        'K2E.P1.S1',
        'In a choir’s attendance records, absences rose during weeks when its rehearsal room changed.',
      ),
      s('K2E.P1.S2', 'The city should therefore reserve one stable room for the choir.'),
    ],
  ),
  passage(
    'cars-l386-k2-relation-route-01',
    'Searchable and still listed',
    'Humanities · oral-history catalog · fictional',
    'cars-l386-k2-relation-route-family-v1',
    'S2 qualifies S1 by limiting searchable transcript coverage while retaining title listings.',
    [
      s(
        'K2RR.P1.S1',
        'The archive should make completed interview transcripts searchable by spoken name.',
      ),
      s(
        'K2RR.P1.S2',
        'However, interviews without completed transcripts should remain listed by title rather than treated as name-searchable.',
      ),
    ],
  ),
  passage(
    'cars-l386-k2-bridge-01',
    'A late gallery evening',
    'Humanities · museum access · fictional',
    'cars-l386-k2-bridge-family',
    'S1 evidence → S2 conclusion. This bridge checks node roles before relation mapping.',
    [
      s(
        'K2B.P1.S1',
        'Attendance logs show that the gallery’s single late evening drew visitors who had not attended during daytime hours.',
      ),
      s('K2B.P1.S2', 'The gallery should keep one late evening each month.'),
    ],
  ),
  passage(
    'cars-l386-k2-a2-01',
    'Quiet and collaborative rooms',
    'Social sciences · library policy',
    'cars-l386-k2-a2-family',
    'S2 objects to S1; S3 concedes S2; S4 answers S2 and supports S1.',
    [
      s('K2A2.P1.S1', 'Libraries should not convert every reading room into collaborative space.'),
      s(
        'K2A2.P1.S2',
        'Supporters of conversion note that group projects benefit from conversation.',
      ),
      s('K2A2.P1.S3', 'That benefit is real.'),
      s(
        'K2A2.P1.S4',
        'Yet students working alone still need one predictable room without conversation.',
      ),
    ],
  ),
  passage(
    'cars-l386-k2-a1-01',
    'Recorded walking tours',
    'Humanities · historic-district interpretation',
    'cars-l386-k2-a1-family',
    'S2 qualifies S1 by limiting what recorded access can reproduce.',
    [
      s('K2A1.P1.S1', 'Recorded walking tours can widen access to historic districts.'),
      s(
        'K2A1.P1.S2',
        'They cannot reproduce the unpredictability of moving through a crowded street.',
      ),
    ],
  ),
  passage(
    'cars-l386-k2-a0-01',
    'Timely meeting summaries',
    'Social sciences · neighborhood governance',
    'cars-l386-k2-a0-family',
    'S2 supports S1; S3 objects to S1; S4 answers S3 and supports S1.',
    [
      s('K2A0.P1.S1', 'A neighborhood council should publish meeting summaries within a week.'),
      s('K2A0.P1.S2', 'Residents who cannot attend need a timely record of decisions.'),
      s(
        'K2A0.P1.S3',
        'Some members worry that rapid publication leaves too little time to polish prose.',
      ),
      s('K2A0.P1.S4', 'A plain factual summary need not be polished like an essay.'),
    ],
  ),
  passage(
    'cars-l386-k2-contrast-01',
    'Qualification versus concession',
    'Humanities · map interpretation',
    'cars-l386-k2-contrast-family',
    'S1 qualifies the speaker’s own claim. S2 concedes an explicitly attributed critic’s point before responding.',
    [
      s('K2C.P1.S1', 'The map helps visitors orient, though it omits temporary stalls.'),
      s(
        'K2C.P1.S2',
        'Critics are right that the map omits temporary stalls; still, it accurately shows permanent streets.',
      ),
    ],
  ),
  passage(
    'cars-l386-k2-exit0-near',
    'Caption decision logs',
    'Humanities · municipal archive',
    'cars-l386-k2-exit0-near-family',
    'S2 supports S1; S3 qualifies S1.',
    [
      s('K2X0N.P1.S1', 'Municipal archives should record who chose each exhibition caption.'),
      s('K2X0N.P1.S2', 'Caption choices shape which details visitors see as central.'),
      s('K2X0N.P1.S3', 'The record need not include every draft; a final decision log is enough.'),
    ],
  ),
  passage(
    'cars-l386-k2-exit0-changed',
    'A neighborhood time bank',
    'Social sciences · exchange institutions',
    'cars-l386-k2-exit0-changed-family',
    'S2 objects to S1; S3 concedes S2; S4 answers S2 by clarifying the unit measured.',
    [
      s(
        'K2X0C.P1.S1',
        'A neighborhood time bank treats an hour of tutoring and an hour of repair as equal units.',
      ),
      s('K2X0C.P1.S2', 'Critics object that equal units conceal differences in training.'),
      s('K2X0C.P1.S3', 'That objection identifies a real difference in preparation.'),
      s('K2X0C.P1.S4', 'Still, the bank measures contributed time, not professional price.'),
    ],
  ),
  passage(
    'cars-l386-k2-r1',
    'Performances in the plaza',
    'Social sciences · public-space policy',
    'cars-l386-k2-r1-family',
    'S2 objects to S1; S3 concedes S2; S4 answers S2 and supports S1.',
    [
      s('K2R1.P1.S1', 'Street performances should remain permitted in the plaza.'),
      s('K2R1.P1.S2', 'Nearby residents object that late shows interrupt sleep.'),
      s('K2R1.P1.S3', 'That complaint identifies a real cost.'),
      s(
        'K2R1.P1.S4',
        'A permit ending performances at 9 p.m. can reduce that cost without banning them.',
      ),
    ],
  ),
  passage(
    'cars-l386-k2-exit1-near',
    'Optional audio summaries',
    'Humanities · museum interpretation',
    'cars-l386-k2-exit1-near-family',
    'S2 qualifies S1 by narrowing how complete each audio guide must be.',
    [
      s('K2X1N.P1.S1', 'Museums should offer audio guides for every new exhibition.'),
      s('K2X1N.P1.S2', 'The guide need not narrate every label; optional summaries are enough.'),
    ],
  ),
  passage(
    'cars-l386-k2-exit1-changed',
    'Rotating meeting times',
    'Social sciences · tenant organization',
    'cars-l386-k2-exit1-changed-family',
    'S2 objects to S1; S3 concedes S2; S4 answers S2.',
    [
      s('K2X1C.P1.S1', 'A tenants’ group proposes monthly meetings.'),
      s('K2X1C.P1.S2', 'Critics say monthly meetings burden shift workers.'),
      s('K2X1C.P1.S3', 'That burden is real.'),
      s('K2X1C.P1.S4', 'Rotating meeting times can reduce it.'),
    ],
  ),
  passage(
    'cars-l386-k2-r2',
    'Dates on repainted murals',
    'Humanities · public art labels',
    'cars-l386-k2-r2-family',
    'S2 supports S1; S3 qualifies S1.',
    [
      s('K2R2.P1.S1', 'A public mural should include the date of each major repainting.'),
      s('K2R2.P1.S2', 'Repainting can change which figures appear central.'),
      s('K2R2.P1.S3', 'The label need not list minor repairs.'),
    ],
  ),
  passage(
    'cars-l386-k2-exit2-near',
    'A monthly donation index',
    'Social sciences · archival access',
    'cars-l386-k2-exit2-near-family',
    'S2 supports S1; S3 qualifies S1.',
    [
      s('K2X2N.P1.S1', 'The archive should publish a monthly index of new donations.'),
      s('K2X2N.P1.S2', 'A monthly index lets researchers see what has arrived.'),
      s('K2X2N.P1.S3', 'The index may group minor donations rather than naming every object.'),
    ],
  ),
  passage(
    'cars-l386-k2-exit2-changed',
    'Open-microphone nights',
    'Humanities · poetry institutions',
    'cars-l386-k2-exit2-changed-family',
    'S2 objects to S1; S3 concedes S2; S4 responds and supports S1.',
    [
      s('K2X2C.P1.S1', 'A poetry series should keep open-microphone nights.'),
      s('K2X2C.P1.S2', 'Some editors object that uncurated readings vary in quality.'),
      s('K2X2C.P1.S3', 'That variation is real.'),
      s(
        'K2X2C.P1.S4',
        'Yet the series uses those nights to hear voices outside its invitation list.',
      ),
    ],
  ),
  {
    id: 'cars-l386-k3-entry-01',
    title: 'Two asserted project responses',
    domain: 'Social sciences · oral-history access · fictional',
    familyId: 'cars-l386-k3-entry-family',
    map: 'S1 → S2 is genuine problem-to-response. S3 ⇏ S4: clip length does not supply a bridge to captions or text preference.',
    paragraphs: [
      {
        id: 'K3E.P1',
        sentences: [
          s(
            'K3E.P1.S1',
            'Several listeners said they could not search the project’s audio interviews for family names.',
          ),
          s('K3E.P1.S2', 'For that reason, the project added searchable transcripts.'),
        ],
      },
      {
        id: 'K3E.P2',
        sentences: [
          s('K3E.P2.S3', 'Other listeners asked for shorter clips.'),
          s('K3E.P2.S4', 'Therefore, the project added captions for readers who prefer text.'),
        ],
      },
    ],
  },
  passage(
    'cars-l386-k3-local-support-01',
    'Resolving a reference',
    'Topic-neutral language support',
    'cars-l386-k3-local-support-family',
    'S1 states an early closure; “that closure” in S2 refers to S1 and supplies the stated reason for the online move.',
    [
      s('K3S.P1.S1', 'The hall closed at six.'),
      s('K3S.P1.S2', 'Because of that closure, the committee moved the meeting online.'),
    ],
  ),
  passage(
    'cars-l386-k3-a2-01',
    'Earlier matinees',
    'Social sciences · cultural access · fictional',
    'cars-l386-k3-a2-family',
    'S1 new start time + S2 stated 60-minute duration/end time + S3 bus cutoff genuinely support S4’s limited possibility claim.',
    [
      s('K3A2.P1.S1', 'The theater moved its matinees from 6:30 p.m. to 4:30 p.m.'),
      s('K3A2.P1.S2', 'Each matinee lasts 60 minutes, so the new performance ends at 5:30 p.m.'),
      s('K3A2.P1.S3', 'The last bus leaves the district at 5:45 p.m.'),
      s(
        'K3A2.P1.S4',
        'Therefore, the 4:30 p.m. matinees may make attendance possible for some bus riders.',
      ),
    ],
  ),
  passage(
    'cars-l386-k3-a1-01',
    'Website categories and paper boxes',
    'Humanities · archive design · fictional',
    'cars-l386-k3-a1-family',
    'S1 → S2 is a stated interface outcome. S2 ⇏ S3: no bridge connects page intimidation to physical preservation.',
    [
      s('K3A1.P1.S1', 'The archive reduced the number of categories on its website.'),
      s('K3A1.P1.S2', 'Visitors then described the search page as less intimidating.'),
      s('K3A1.P1.S3', 'Consequently, the archive’s paper boxes became easier to preserve.'),
    ],
  ),
  passage(
    'cars-l386-k3-a0-01',
    'An evening garden meeting',
    'Social sciences · community organization',
    'cars-l386-k3-a0-family',
    'S1 preference + S2 response genuinely support S3’s carefully limited claim.',
    [
      s('K3A0.P1.S1', 'Residents who joined the garden meetings asked for evening sessions.'),
      s('K3A0.P1.S2', 'The organizers moved one monthly meeting to 7 p.m.'),
      s('K3A0.P1.S3', 'Thus the schedule now responds to at least one stated preference.'),
    ],
  ),
  passage(
    'cars-l386-k3-contrast-01',
    'The requested change',
    'Social sciences · interview publishing',
    'cars-l386-k3-contrast-family',
    'S1 contains a genuine exact-request link. S2 lacks the bridge from clip length to captions.',
    [
      s('K3C.P1.S1', 'Interviewees asked for captions; therefore, the project added captions.'),
      s(
        'K3C.P1.S2',
        'Interviewees asked for shorter clips; therefore, the project added captions.',
      ),
    ],
  ),
  passage(
    'cars-l386-k3-exit0-near',
    'Markers at route crossings',
    'Social sciences · wayfinding design',
    'cars-l386-k3-exit0-near-family',
    'S1 identifies confusion at crossings; S2 changes those crossings; S1 + S2 genuinely support S3.',
    [
      s('K3X0N.P1.S1', 'Users of a walking-tour app reported getting lost where routes crossed.'),
      s('K3X0N.P1.S2', 'The designers added turn-by-turn markers at those crossings.'),
      s('K3X0N.P1.S3', 'Accordingly, the revision addresses the confusion users described.'),
    ],
  ),
  passage(
    'cars-l386-k3-exit0-changed',
    'Bells and diaries',
    'Humanities · comparative essay',
    'cars-l386-k3-exit0-changed-family',
    'S2 ⇏ S3: preserving traces does not establish deliberate creation as public records.',
    [
      s('K3X0C.P1.S1', 'The essay’s final section shifts from city bells to handwritten diaries.'),
      s('K3X0C.P1.S2', 'Both can preserve traces of ordinary routines.'),
      s('K3X0C.P1.S3', 'Therefore, both were deliberately created as public records.'),
    ],
  ),
  {
    id: 'cars-l386-k3-r1',
    title: 'Two requests, one response',
    domain: 'Social sciences · workshop logistics',
    familyId: 'cars-l386-k3-r1-family',
    map: 'S1 → S2 is genuine. S3 ⇏ S4 because longer breaks do not bridge to a printed schedule.',
    paragraphs: [
      {
        id: 'K3R1.P1',
        sentences: [
          s('K3R1.P1.S1', 'Workshop participants asked for a printed schedule.'),
          s('K3R1.P1.S2', 'Accordingly, organizers posted a printed schedule at the entrance.'),
        ],
      },
      {
        id: 'K3R1.P2',
        sentences: [
          s('K3R1.P2.S3', 'Other participants asked for longer breaks.'),
          s('K3R1.P2.S4', 'Accordingly, organizers posted a printed schedule at the entrance.'),
        ],
      },
    ],
  },
  passage(
    'cars-l386-k3-exit1-near',
    'A side panel and paper boxes',
    'Humanities · digital publishing',
    'cars-l386-k3-exit1-near-family',
    'S1 ⇏ S2: a digital note-panel change does not supply a bridge to physical preservation.',
    [
      s('K3X1N.P1.S1', 'The publisher placed article notes in a fixed side panel.'),
      s('K3X1N.P1.S2', 'Therefore, the archive’s paper source boxes became easier to preserve.'),
    ],
  ),
  passage(
    'cars-l386-k3-exit1-changed',
    'The searchable portion',
    'Humanities · oral-history catalog',
    'cars-l386-k3-exit1-changed-family',
    'S2 genuinely qualifies S1 by narrowing searchable coverage to interviews with transcripts.',
    [
      s('K3X1C.P1.S1', 'The archive describes its interview catalog as searchable.'),
      s(
        'K3X1C.P1.S2',
        'However, only interviews with completed transcripts can be searched by spoken name.',
      ),
    ],
  ),
  passage(
    'cars-l386-k3-r2',
    'Extended evening hours',
    'Social sciences · museum attendance',
    'cars-l386-k3-r2-family',
    'S1 ⇏ S2 without a passage statement connecting the schedule change to attendance.',
    [
      s('K3R2.P1.S1', 'The museum extended its evening hours.'),
      s('K3R2.P1.S2', 'Therefore, weekday attendance rose.'),
    ],
  ),
  passage(
    'cars-l386-k3-exit2-near',
    'The returning doorway',
    'Humanities · essay form',
    'cars-l386-k3-exit2-near-family',
    'S2 is a genuine example of the recurring-image claim in S1.',
    [
      s('K3X2N.P1.S1', 'A repeated image can connect distant sections of an essay.'),
      s(
        'K3X2N.P1.S2',
        'For example, the same doorway appears in both the opening scene and the conclusion.',
      ),
    ],
  ),
  passage(
    'cars-l386-k3-exit2-changed',
    'Two songs about rain',
    'Humanities · music commentary',
    'cars-l386-k3-exit2-changed-family',
    'S1 ⇏ S2: shared subject does not establish shared performance context.',
    [
      s('K3X2C.P1.S1', 'Two songs in the essay mention rain.'),
      s('K3X2C.P1.S2', 'Therefore, they were performed at the same concert.'),
    ],
  ),
  passage(
    'cars-l386-k1-bridge-repair-task',
    'Who shaped the recording',
    'Humanities · oral-history catalog · fictional',
    'cars-l386-k1-bridge-repair-task-family-v1',
    'S1 conclusion; S2 supporting claim → S1; S3 qualification of S1.',
    [
      s('K1BR.P1.S1', 'A community archive should list who recorded each interview.'),
      s(
        'K1BR.P1.S2',
        'A recorder’s choices affect which pauses and follow-up questions enter the collection.',
      ),
      s('K1BR.P1.S3', 'The list need not include equipment serial numbers.'),
    ],
  ),
  passage(
    'cars-l386-k1-bridge-exit-near',
    'Closure notices',
    'Social sciences · library access · fictional',
    'cars-l386-k1-bridge-exit-near-family-v1',
    'S1 evidence → S2 conclusion.',
    [
      s(
        'K1BXN.P1.S1',
        'In last winter’s logs, most wasted trips occurred when visitors arrived during unposted closures.',
      ),
      s('K1BXN.P1.S2', 'The library should publish closure notices on the same page as its hours.'),
    ],
  ),
  passage(
    'cars-l386-k1-bridge-exit-changed',
    'A cracked frame',
    'Humanities · narrative criticism',
    'cars-l386-k1-bridge-exit-changed-family-v1',
    'S1 claim; S2 illustration of S1.',
    [
      s('K1BXC.P1.S1', 'A damaged object can make a story’s time visible.'),
      s(
        'K1BXC.P1.S2',
        'For example, a cracked frame returned in three scenes can mark years of neglect.',
      ),
    ],
  ),
  passage(
    'cars-l386-k2-bridge-replacement',
    'One stable workshop room',
    'Social sciences · community education · fictional',
    'cars-l386-k2-bridge-replacement-family-v1',
    'S1 evidence → S2 conclusion through direct support.',
    [
      s(
        'K2BR.P1.S1',
        'Workshop records show that attendance fell whenever the meeting room changed floors.',
      ),
      s('K2BR.P1.S2', 'The center should reserve one stable room for the workshop.'),
    ],
  ),
  passage(
    'cars-l386-k3-disambiguator',
    'A marker without its bridge',
    'Social sciences · reading interface · fictional',
    'cars-l386-k3-disambiguator-family-v1',
    'S1 ⇏ S2: a request for larger type does not supply a bridge to audio narration.',
    [
      s('K3D.P1.S1', 'Readers asked the site to enlarge its article text.'),
      s('K3D.P1.S2', 'Therefore, the site added audio narration.'),
    ],
  ),
  passage(
    'cars-l386-k3-support-confirm',
    'Resolving a fresh event reference',
    'Topic-neutral language confirmation',
    'cars-l386-k3-support-confirm-family-v1',
    '“That cancellation” in S2 resolves to the canceled Tuesday rehearsal in S1.',
    [
      s('K3SC.P1.S1', 'The studio canceled Tuesday’s rehearsal.'),
      s('K3SC.P1.S2', 'Because of that cancellation, the ensemble moved practice to Wednesday.'),
    ],
  ),
  passage(
    'cars-l386-k1-claim-coverage',
    'A date that orients',
    'Humanities · essay form',
    'cars-l386-k1-claim-coverage-family-v1',
    'S1 conclusion; S2 supporting claim → S1. S2 is asserted reasoning, not reported evidence.',
    [
      s('K1PC.P1.S1', 'An essay should repeat the year when it returns to an earlier event.'),
      s(
        'K1PC.P1.S2',
        'The repeated date lets readers compare what changed between the two discussions.',
      ),
    ],
  ),
  passage(
    'cars-l386-k2-example-coverage',
    'A doorway as a recurring image',
    'Humanities · essay analysis',
    'cars-l386-k2-example-coverage-family-v1',
    'S2 illustrates S1 through an example relation.',
    [
      s('K2PE.P1.S1', 'A recurring image can connect distant sections of an essay.'),
      s(
        'K2PE.P1.S2',
        'For example, the same doorway can appear in both the opening and the conclusion.',
      ),
    ],
  ),
  passage(
    'cars-l386-k2-causal-coverage',
    'Moving the sign-in desk',
    'Social sciences · archive operations · fictional',
    'cars-l386-k2-causal-coverage-family-v1',
    'S1 supplies a passage-stated causal mechanism for S2.',
    [
      s(
        'K2PC.P1.S1',
        'After the archive moved its sign-in desk beside the entrance, visitors no longer crossed the lobby to locate it.',
      ),
      s('K2PC.P1.S2', 'The move therefore reduced one source of check-in delay.'),
    ],
  ),
];

const ITEMS: Item[] = [
  {
    id: 'k1-entry-conclusion',
    kcId: KC1,
    stage: 'Entry route',
    stimulusId: 'cars-l386-k1-entry-01',
    commitGroup: 'k1-entry',
    assistance: 'entry',
    evidence: 'routing',
    stem: 'What is the primary role of S3?',
    choices: ROLE_CHOICES,
    key: 'A',
    rationales: r(
      'S3 is the recommendation supported by the reported pattern in S2.',
      'S3 reports no observation.',
      'S3 is not a concrete example.',
      'S3 advances the point rather than merely framing it.',
    ),
    explanation: 'S3 is the supported recommendation, so it functions as the conclusion.',
    hint: 'Ask which sentence the others are trying to justify.',
    expectedSeconds: 45,
  },
  {
    id: 'k1-entry-evidence',
    kcId: KC1,
    stage: 'Entry route',
    stimulusId: 'cars-l386-k1-entry-01',
    commitGroup: 'k1-entry',
    assistance: 'entry',
    evidence: 'routing',
    stem: 'What is the primary role of S2?',
    choices: ROLE_CHOICES,
    key: 'B',
    rationales: r(
      'S2 supplies support rather than the recommendation.',
      'The volunteers’ finding is a passage-reported observation used as a basis.',
      'It is reported as an occurrence, not posed as an illustrative possibility.',
      'Although it adds context, its local job is to support S3.',
    ),
    explanation: 'The recorded clustering is evidence offered for the recommendation.',
    hint: 'Look for a report, record, observation, or finding.',
    expectedSeconds: 45,
  },
  {
    id: 'k1-entry-disambiguator',
    kcId: KC1,
    stage: 'Conditional entry disambiguator',
    stimulusId: 'cars-l386-k1-disambiguator-01',
    commitGroup: 'k1-entry-d1',
    assistance: 'entry',
    evidence: 'routing',
    stem: 'Which sentence is reported evidence rather than an illustration?',
    choices: {
      A: 'S1 only.',
      B: 'S2 only.',
      C: 'Both.',
      D: 'Neither.',
    },
    key: 'A',
    rationales: r(
      'S1 reports a recorded pattern; S2 imagines a representative case.',
      'This reverses evidence and illustration.',
      'S2 is a possible case, not a report.',
      'S1 explicitly reports what a log records.',
    ),
    explanation: 'S1 is recorded evidence; S2 is an illustration.',
    hint: 'Ask which sentence the passage presents as observed rather than possible.',
    expectedSeconds: 50,
  },
  {
    id: 'k1-orient',
    kcId: KC1,
    stage: 'Orient and predict',
    stimulusId: 'cars-l386-anchor-01',
    commitGroup: 'k1-orient',
    assistance: 'A0',
    evidence: 'instruction',
    stem: 'Which sentence states the passage’s final recommendation?',
    choices: {
      A: 'S3',
      B: 'S4',
      C: 'S9',
      D: 'S12',
    },
    key: 'D',
    rationales: r(
      'S3 is an important intermediate claim.',
      'S4 is reported evidence.',
      'S9 voices an objection.',
      'S12 gives the final recommended action.',
    ),
    explanation:
      'S12 is the final recommendation supported and constrained by the earlier passage.',
    hint: 'Find the action the author ultimately recommends.',
    expectedSeconds: 50,
  },
  {
    id: 'k1-a2',
    kcId: KC1,
    stage: 'Fresh A2',
    stimulusId: 'cars-l386-k1-a2-01',
    commitGroup: 'k1-a2',
    assistance: 'A2',
    evidence: 'instruction',
    stem: 'Complete the missing role for S2.',
    support: 'S1 frames the setting. S3 is the supported recommendation.',
    choices: ROLE_CHOICES,
    key: 'B',
    rationales: r(
      'S3, not S2, is the conclusion.',
      'S2 reports an observed pattern used to support S3.',
      'S2 is not a hypothetical example.',
      'S2 performs supporting work beyond context.',
    ),
    explanation: 'The archive log is reported evidence.',
    hint: 'Ask whether the passage presents S2 as observed or imagined.',
    expectedSeconds: 55,
  },
  {
    id: 'k1-a1',
    kcId: KC1,
    stage: 'Fresh A1',
    stimulusId: 'cars-l386-k1-a1-01',
    commitGroup: 'k1-a1',
    assistance: 'A1',
    evidence: 'instruction',
    stem: 'What is S3’s primary role?',
    support: 'One cue remains: was S3 reported as an observation, or offered as a concrete case?',
    choices: ROLE_CHOICES,
    key: 'C',
    rationales: r(
      'S3 does not state the supported endpoint.',
      'No observation or record is reported.',
      'S3 concretely demonstrates S2.',
      'S3 does more than establish context.',
    ),
    explanation: 'The footnote example illustrates the preceding idea.',
    hint: 'The words “for example” are a cue; verify that the sentence is actually a case.',
    expectedSeconds: 55,
  },
  {
    id: 'k1-a0',
    kcId: KC1,
    stage: 'Fresh A0',
    stimulusId: 'cars-l386-k1-a0-01',
    commitGroup: 'k1-a0',
    assistance: 'A0',
    evidence: 'instruction',
    stem: 'What is S2’s primary role?',
    choices: ROLE_CHOICES,
    key: 'B',
    rationales: r(
      'S3 is the conclusion.',
      'S2 reports the survey result used as support.',
      'S2 is not merely a possible example.',
      'S2 is consequential support, not scene-setting alone.',
    ),
    explanation: 'The response cluster is evidence for the planners’ recommendation.',
    hint: 'Ask what the survey produced and what later claim uses it.',
    expectedSeconds: 60,
  },
  {
    id: 'k1-contrast',
    kcId: KC1,
    stage: 'Close contrast',
    stimulusId: 'cars-l386-k1-contrast-01',
    commitGroup: 'k1-contrast',
    assistance: 'A1',
    evidence: 'instruction',
    stem: 'Which classification is best?',
    choices: {
      A: 'S1 is evidence; S2 is an illustration.',
      B: 'Both are evidence.',
      C: 'Both are illustrations.',
      D: 'S1 is background; S2 is a conclusion.',
    },
    key: 'A',
    rationales: r(
      'S1 reports a record; S2 supplies a concrete imagined case.',
      'S2 reports no observation.',
      'S1 is explicitly presented as recorded.',
      'Neither proposed role matches the local functions.',
    ),
    explanation: 'The decisive difference is recorded observation versus imagined example.',
    hint: 'Hold topic constant and vary only report versus imagined case.',
    expectedSeconds: 55,
  },
  {
    id: 'k1-exit0-near',
    kcId: KC1,
    stage: 'Untouched near-use exit',
    stimulusId: 'cars-l386-k1-exit0-near',
    commitGroup: 'k1-exit0',
    assistance: 'A0',
    evidence: 'instructional_exit',
    stem: 'What is S2’s primary role?',
    choices: ROLE_CHOICES,
    key: 'B',
    rationales: r(
      'S3 is the recommendation.',
      'S2 reports a comparison used to support S3.',
      'S2 is not hypothetical.',
      'Its local function exceeds background.',
    ),
    explanation: 'The comment-card comparison functions as evidence.',
    hint: 'Look for the passage-reported comparison.',
    expectedSeconds: 70,
  },
  {
    id: 'k1-exit0-changed',
    kcId: KC1,
    stage: 'Untouched changed-passage exit',
    stimulusId: 'cars-l386-k1-exit0-changed',
    commitGroup: 'k1-exit0',
    assistance: 'A0',
    evidence: 'instructional_exit',
    stem: 'What is S2’s primary role?',
    choices: ROLE_CHOICES,
    key: 'C',
    rationales: r(
      'S3 gives the recommendation.',
      'S2 reports no observed result.',
      'S2 supplies a concrete instance of S1.',
      'S2 illustrates rather than merely frames.',
    ),
    explanation: 'The stanza example illustrates the critic’s claim.',
    hint: 'Ask whether S2 reports a finding or supplies a case.',
    expectedSeconds: 70,
  },
  {
    id: 'k1-r1-conclusion',
    kcId: KC1,
    stage: 'Repair cycle 1 · claim/conclusion branch',
    stimulusId: 'cars-l386-k1-r1a',
    commitGroup: 'k1-r1-task',
    assistance: 'A2',
    evidence: 'instruction',
    stem: 'What is S3’s primary role?',
    support: 'Ask whether another sentence supplies a reason for this recommendation.',
    choices: ROLE_CHOICES,
    key: 'A',
    rationales: r(
      'S2 supplies a reason for the recommendation in S3.',
      'S3 reports no observation.',
      'S3 is not a concrete case.',
      'S3 advances the proposed action rather than merely framing it.',
    ),
    explanation: 'S3 is a conclusion because S2 supports it.',
    hint: 'Draw the arrow from S2 to the claim it supports.',
    expectedSeconds: 55,
  },
  {
    id: 'k1-r1-contrast',
    kcId: KC1,
    stage: 'Repair cycle 1 · evidence/illustration branch',
    stimulusId: 'cars-l386-k1-r1b',
    commitGroup: 'k1-r1-task',
    assistance: 'A2',
    evidence: 'instruction',
    stem: 'Which classification is best?',
    support: 'Separate a reported observation from a possible example.',
    choices: {
      A: 'S1 is evidence; S2 is an illustration.',
      B: 'S1 is an illustration; S2 is evidence.',
      C: 'Both are evidence.',
      D: 'Both are background.',
    },
    key: 'A',
    rationales: r(
      'S1 reports timed observations; S2 asks the reader to imagine a case.',
      'This reverses report and example.',
      'S2 reports no observation.',
      'S1 performs supporting work, and S2 concretizes the idea.',
    ),
    explanation: 'The timed observation is evidence; the imagined visitor is an illustration.',
    hint: 'Which sentence is explicitly observed, and which is introduced as imagined?',
    expectedSeconds: 55,
  },
  {
    id: 'k1-exit1-near',
    kcId: KC1,
    stage: 'Repair-1 near-use exit',
    stimulusId: 'cars-l386-k1-exit1-near',
    commitGroup: 'k1-exit1',
    assistance: 'A0',
    evidence: 'instructional_exit',
    stem: 'What is S2’s primary role?',
    choices: ROLE_CHOICES,
    key: 'B',
    rationales: r(
      'S3 is the recommendation.',
      'Checkout records are reported evidence.',
      'S2 is not an imagined case.',
      'S2 supports rather than merely frames.',
    ),
    explanation: 'The checkout comparison functions as evidence.',
    hint: 'Identify what the records showed.',
    expectedSeconds: 65,
  },
  {
    id: 'k1-exit1-changed',
    kcId: KC1,
    stage: 'Repair-1 changed-passage exit',
    stimulusId: 'cars-l386-k1-exit1-changed',
    commitGroup: 'k1-exit1',
    assistance: 'A0',
    evidence: 'instructional_exit',
    stem: 'What is S2’s primary role?',
    choices: ROLE_CHOICES,
    key: 'C',
    rationales: r(
      'S3 is the concluding claim.',
      'No observation is reported.',
      'The chipped-cup case illustrates S1.',
      'The case does more than set context.',
    ),
    explanation: 'The invented inventory is an illustration.',
    hint: 'Ask whether this is a report or a constructed case.',
    expectedSeconds: 65,
  },
  {
    id: 'k1-r2',
    kcId: KC1,
    stage: 'Repair cycle 2',
    stimulusId: 'cars-l386-k1-r2',
    commitGroup: 'k1-r2-task',
    assistance: 'A1',
    evidence: 'instruction',
    stem: 'Which sentence is the conclusion supported by another passage part?',
    support: 'Draw the support arrow first; its target functions as the conclusion.',
    choices: { A: 'S1', B: 'S2', C: 'S3', D: 'None of the sentences' },
    key: 'C',
    rationales: r(
      'S1 establishes the activity.',
      'S2 gives the reason.',
      'S3 is the recommendation supported by S2.',
      'The passage contains a clear supported endpoint.',
    ),
    explanation: 'S2 supports the recommendation in S3.',
    hint: 'Which sentence answers “What should the archive do?”',
    expectedSeconds: 60,
  },
  {
    id: 'k1-exit2-near',
    kcId: KC1,
    stage: 'Repair-2 near-use exit',
    stimulusId: 'cars-l386-k1-exit2-near',
    commitGroup: 'k1-exit2',
    assistance: 'A0',
    evidence: 'instructional_exit',
    stem: 'What is S2’s primary role?',
    choices: ROLE_CHOICES,
    key: 'A',
    rationales: r(
      'S2 is the recommendation supported by the later evidence in S3.',
      'S2 reports no observation.',
      'S2 is not a concrete case.',
      'S2 advances the endpoint.',
    ),
    explanation: 'A conclusion may precede its evidence; S3 supports S2.',
    hint: 'Do not assume support must appear before its target.',
    expectedSeconds: 70,
  },
  {
    id: 'k1-exit2-changed',
    kcId: KC1,
    stage: 'Repair-2 changed-passage exit',
    stimulusId: 'cars-l386-k1-exit2-changed',
    commitGroup: 'k1-exit2',
    assistance: 'A0',
    evidence: 'instructional_exit',
    stem: 'What is S2’s primary role?',
    choices: ROLE_CHOICES,
    key: 'B',
    rationales: r(
      'S3 is the conclusion.',
      'S2 reports audience notes as a basis.',
      'S2 is not a hypothetical scene.',
      'S2 actively supports S3.',
    ),
    explanation: 'The audience notes function as evidence.',
    hint: 'Look for the stated record of viewers’ responses.',
    expectedSeconds: 70,
  },
  {
    id: 'k2-entry-roles',
    kcId: KC2,
    hostKcId: KC2,
    primaryConstruct: { type: 'kc', id: KC1 },
    supportArtifact: 'V3-EDG-971610',
    creditEligibility: 'routing_only',
    stage: 'Entry hard-point check',
    stimulusId: 'cars-l386-k2-entry-01',
    commitGroup: 'k2-role-probe',
    assistance: 'entry',
    evidence: 'routing',
    stem: 'Which element-role map is correct?',
    choices: {
      A: 'S1 evidence; S2 conclusion.',
      B: 'S1 background; S2 evidence.',
      C: 'S1 conclusion; S2 qualification.',
      D: 'S1 illustration; S2 objection.',
    },
    key: 'A',
    rationales: r(
      'S1 reports attendance records; S2 is the recommendation they support.',
      'S1 performs supporting work, and S2 reports no observation.',
      'The roles are reversed and S2 does not narrow S1.',
      'Neither sentence has those functions.',
    ),
    explanation: 'The nodes are evidence S1 and conclusion S2.',
    hint: 'Label the nodes before attempting the arrow.',
    expectedSeconds: 50,
  },
  {
    id: 'k2-relation-route-qualification',
    kcId: KC2,
    stage: 'Fresh post-edge relation route',
    stimulusId: 'cars-l386-k2-relation-route-01',
    commitGroup: 'k2-relation-route',
    assistance: 'entry',
    evidence: 'routing',
    stem: 'What relation does S2 have to S1?',
    choices: REL_CHOICES,
    key: 'B',
    rationales: r(
      'S2 does not provide the main reason for searchable transcripts.',
      'S2 narrows which interviews may be treated as name-searchable.',
      'S2 preserves the listing goal rather than challenging it.',
      'No opposing speaker is granted a point.',
    ),
    explanation: 'S2 qualifies the scope of S1’s searchable-transcript recommendation.',
    hint: 'Ask whether S2 rejects the recommendation or limits where it applies.',
    expectedSeconds: 50,
  },
  {
    id: 'k2-bridge-roles',
    kcId: KC1,
    hostKcId: KC2,
    primaryConstruct: { type: 'kc', id: KC1 },
    supportArtifact: 'V3-EDG-971610',
    creditEligibility: 'support_only',
    stage: 'Hard-prerequisite bridge',
    stimulusId: 'cars-l386-k2-bridge-01',
    commitGroup: 'k2-bridge',
    assistance: 'A2',
    evidence: 'instruction',
    stem: 'Which element-role map is correct?',
    support: 'This bounded bridge checks the roles required before an unscaffolded relation map.',
    choices: {
      A: 'S1 evidence; S2 conclusion.',
      B: 'S1 conclusion; S2 evidence.',
      C: 'S1 background; S2 illustration.',
      D: 'S1 objection; S2 concession.',
    },
    key: 'A',
    rationales: r(
      'The logs are evidence for the recommendation.',
      'This reverses source and target.',
      'The logs do consequential supporting work.',
      'No opposing view appears.',
    ),
    explanation: 'The bridge restores the source and target roles required by V3-EDG-971610.',
    hint: 'Ask which sentence reports a record and which recommends an action.',
    expectedSeconds: 60,
  },
  {
    id: 'k2-orient',
    kcId: KC2,
    stage: 'Orient and predict',
    stimulusId: 'cars-l386-anchor-01',
    commitGroup: 'k2-orient',
    assistance: 'A0',
    evidence: 'instruction',
    stem: 'What relation does S7 have to S3?',
    choices: REL_CHOICES,
    key: 'B',
    rationales: r(
      'S7 does not provide the main reason for S3.',
      'S7 limits what touch can recover without rejecting interpretive value.',
      'S7 does not reject S3.',
      'S7 does not grant an attributed opponent’s point.',
    ),
    explanation: 'S7 qualifies S3 by narrowing its scope.',
    hint: 'Does S7 reject replicas as interpretations, or limit what they reveal?',
    expectedSeconds: 55,
  },
  {
    id: 'k2-a2',
    kcId: KC2,
    stage: 'Fresh A2',
    stimulusId: 'cars-l386-k2-a2-01',
    commitGroup: 'k2-a2',
    assistance: 'A2',
    evidence: 'instruction',
    stem: 'What relation does S3 have to S2?',
    support: 'S2 states the opposing consideration. Complete the relation from S3 to S2.',
    choices: REL_CHOICES,
    key: 'D',
    rationales: r(
      'S3 does not give a reason to accept S2; it grants the benefit S2 names.',
      'S3 does not narrow S2.',
      'S3 does not challenge S2.',
      'S3 grants the benefit asserted by the opposing side.',
    ),
    explanation: 'S3 is a concession to the objection in S2.',
    hint: 'Whose point does “That benefit is real” grant?',
    expectedSeconds: 60,
  },
  {
    id: 'k2-a1',
    kcId: KC2,
    stage: 'Fresh A1',
    stimulusId: 'cars-l386-k2-a1-01',
    commitGroup: 'k2-a1',
    assistance: 'A1',
    evidence: 'instruction',
    stem: 'What relation does S2 have to S1?',
    support:
      'One cue remains: does S2 reject all widened access, or limit what kind of access the recording provides?',
    choices: REL_CHOICES,
    key: 'B',
    rationales: r(
      'S2 does not give the primary reason for S1.',
      'S2 narrows the capabilities claimed for recorded tours.',
      'S2 preserves rather than rejects widened access.',
      'No opponent is granted a point.',
    ),
    explanation: 'S2 qualifies the kind of access recordings provide.',
    hint: 'A limitation can preserve the central claim.',
    expectedSeconds: 55,
  },
  {
    id: 'k2-a0',
    kcId: KC2,
    stage: 'Fresh A0',
    stimulusId: 'cars-l386-k2-a0-01',
    commitGroup: 'k2-a0',
    assistance: 'A0',
    evidence: 'instruction',
    stem: 'Which map is best?',
    choices: {
      A: 'S2 supports S1; S3 objects to S1; S4 answers S3.',
      B: 'S2 illustrates S1; S3 qualifies S2; S4 concedes S3.',
      C: 'S2 objects to S1; S3 supports S1; S4 is background.',
      D: 'S2, S3, and S4 all directly support S1.',
    },
    key: 'A',
    rationales: r(
      'The need supports timely summaries, the worry challenges them, and S4 answers that worry.',
      'This mislabels each relation.',
      'This reverses support and objection.',
      'S3 is explicitly a challenge, not support.',
    ),
    explanation: 'The passage contains support, objection, and response in sequence.',
    hint: 'Identify whose position each sentence belongs to.',
    expectedSeconds: 75,
  },
  {
    id: 'k2-contrast',
    kcId: KC2,
    stage: 'Close contrast',
    stimulusId: 'cars-l386-k2-contrast-01',
    commitGroup: 'k2-contrast',
    assistance: 'A1',
    evidence: 'instruction',
    stem: 'Why does the same omission function differently?',
    choices: {
      A: 'S1 qualifies the speaker’s claim; S2 concedes a critic’s point before responding.',
      B: 'S1 concedes; S2 merely supplies background.',
      C: 'Both are objections.',
      D: 'Both are direct support.',
    },
    key: 'A',
    rationales: r(
      'S1 narrows its own claim; S2 explicitly grants critics a point.',
      'The ownership is reversed.',
      'Neither sentence simply attacks its own position.',
      'The omission does not directly support the map’s value.',
    ),
    explanation: 'Ownership distinguishes qualification from concession.',
    hint: 'Ask whether an opponent is explicitly being granted a point.',
    expectedSeconds: 60,
  },
  {
    id: 'k2-exit0-near',
    kcId: KC2,
    stage: 'Untouched near-use exit',
    stimulusId: 'cars-l386-k2-exit0-near',
    commitGroup: 'k2-exit0',
    assistance: 'A0',
    evidence: 'instructional_exit',
    stem: 'What relation does S3 have to S1?',
    choices: REL_CHOICES,
    key: 'B',
    rationales: r(
      'S3 does not give the reason for keeping a record.',
      'S3 narrows how complete the required record must be.',
      'S3 does not reject the record.',
      'No opposing speaker is granted a point.',
    ),
    explanation: 'S3 qualifies the implementation of S1.',
    hint: 'Does S3 remove the requirement or narrow it?',
    expectedSeconds: 75,
  },
  {
    id: 'k2-exit0-changed',
    kcId: KC2,
    stage: 'Untouched changed-passage exit',
    stimulusId: 'cars-l386-k2-exit0-changed',
    commitGroup: 'k2-exit0',
    assistance: 'A0',
    evidence: 'instructional_exit',
    stem: 'Which map is best?',
    choices: {
      A: 'S3 concedes part of S2; S4 answers S2 by clarifying the bank’s measure.',
      B: 'S3 directly supports S2; S4 is an unrelated illustration.',
      C: 'S3 qualifies S1; S4 concedes S2.',
      D: 'S3 and S4 both object to S1.',
    },
    key: 'A',
    rationales: r(
      'S3 grants the preparation difference; S4 explains why the bank’s unit can remain.',
      'S4 directly addresses the objection.',
      'S3 is framed as granting the critic, not narrowing S1.',
      'S4 responds to rather than repeats the objection.',
    ),
    explanation: 'The author concedes the difference, then answers its force.',
    hint: 'Track the critic’s point through “That objection” and “Still.”',
    expectedSeconds: 80,
  },
  {
    id: 'k2-r1',
    kcId: KC2,
    stage: 'Repair cycle 1',
    stimulusId: 'cars-l386-k2-r1',
    commitGroup: 'k2-r1-task',
    assistance: 'A2',
    evidence: 'instruction',
    stem: 'Which map is best?',
    support: 'Use the ownership test: challenge, grant, then response.',
    choices: {
      A: 'S2 objects; S3 concedes; S4 responds while supporting S1.',
      B: 'S2 supports; S3 qualifies; S4 objects.',
      C: 'S2 qualifies; S3 supports; S4 concedes.',
      D: 'S2, S3, and S4 all object to S1.',
    },
    key: 'A',
    rationales: r(
      'The resident concern challenges, S3 grants it, and the time limit answers it.',
      'This reverses each role.',
      'S2 is attributed opposition, not the author’s qualification.',
      'S3 and S4 do not continue the objection.',
    ),
    explanation: 'The passage follows objection → concession → response.',
    hint: 'Ask whose position owns each sentence.',
    expectedSeconds: 75,
  },
  {
    id: 'k2-exit1-near',
    kcId: KC2,
    stage: 'Repair-1 near-use exit',
    stimulusId: 'cars-l386-k2-exit1-near',
    commitGroup: 'k2-exit1',
    assistance: 'A0',
    evidence: 'instructional_exit',
    stem: 'What relation does S2 have to S1?',
    choices: REL_CHOICES,
    key: 'B',
    rationales: r(
      'S2 does not establish why guides are needed.',
      'S2 narrows how much each guide must narrate.',
      'S2 does not reject offering guides.',
      'No critic is granted a point.',
    ),
    explanation: 'Optional summaries qualify the full recommendation.',
    hint: 'The guide remains; only its required scope changes.',
    expectedSeconds: 70,
  },
  {
    id: 'k2-exit1-changed',
    kcId: KC2,
    stage: 'Repair-1 changed-passage exit',
    stimulusId: 'cars-l386-k2-exit1-changed',
    commitGroup: 'k2-exit1',
    assistance: 'A0',
    evidence: 'instructional_exit',
    stem: 'Which map is best?',
    choices: {
      A: 'S2 objects; S3 concedes; S4 responds.',
      B: 'S2 supports; S3 objects; S4 concedes.',
      C: 'S2 qualifies; S3 supports; S4 objects.',
      D: 'All three sentences support monthly meetings.',
    },
    key: 'A',
    rationales: r(
      'The burden challenges the proposal, is granted, and is answered by rotation.',
      'S2 is not support and S4 does not concede.',
      'The ownership and sequence are wrong.',
      'S2 is explicitly a criticism.',
    ),
    explanation: 'The relation chain is objection, concession, response.',
    hint: 'Follow the burden from challenge to grant to remedy.',
    expectedSeconds: 75,
  },
  {
    id: 'k2-r2',
    kcId: KC2,
    stage: 'Repair cycle 2',
    stimulusId: 'cars-l386-k2-r2',
    commitGroup: 'k2-r2-task',
    assistance: 'A1',
    evidence: 'instruction',
    stem: 'What relation does S3 have to S1?',
    support: 'Complete one verb: S3 backs, narrows, challenges, or grants S1.',
    choices: REL_CHOICES,
    key: 'B',
    rationales: r(
      'S3 does not give the reason for dates.',
      'S3 narrows the labels to major repainting.',
      'S3 does not reject dates.',
      'No opposing point is granted.',
    ),
    explanation: 'S3 qualifies the scope of S1.',
    hint: 'The date requirement remains after S3.',
    expectedSeconds: 60,
  },
  {
    id: 'k2-exit2-near',
    kcId: KC2,
    stage: 'Repair-2 near-use exit',
    stimulusId: 'cars-l386-k2-exit2-near',
    commitGroup: 'k2-exit2',
    assistance: 'A0',
    evidence: 'instructional_exit',
    stem: 'What relation does S3 have to S1?',
    choices: REL_CHOICES,
    key: 'B',
    rationales: r(
      'S2 supplies the direct support.',
      'S3 narrows the level of detail required.',
      'S3 preserves the monthly index.',
      'No opposing voice appears.',
    ),
    explanation: 'Grouping minor donations qualifies the index requirement.',
    hint: 'Ask what remains true after the limitation.',
    expectedSeconds: 70,
  },
  {
    id: 'k2-exit2-changed',
    kcId: KC2,
    stage: 'Repair-2 changed-passage exit',
    stimulusId: 'cars-l386-k2-exit2-changed',
    commitGroup: 'k2-exit2',
    assistance: 'A0',
    evidence: 'instructional_exit',
    stem: 'Which map is best?',
    choices: {
      A: 'S2 objects; S3 concedes; S4 responds and supports S1.',
      B: 'S2 supports; S3 qualifies; S4 objects.',
      C: 'S2 qualifies; S3 objects; S4 concedes.',
      D: 'S2, S3, and S4 all oppose S1.',
    },
    key: 'A',
    rationales: r(
      'Variable quality is the objection, is granted, and is answered with a distinct value.',
      'S2 is not support.',
      'The relations are assigned to the wrong speakers.',
      'S4 supports retaining the nights.',
    ),
    explanation: 'The passage grants the cost and then provides a response.',
    hint: 'Separate “That variation is real” from the value introduced by “Yet.”',
    expectedSeconds: 75,
  },
  {
    id: 'k3-entry-valid',
    kcId: KC3,
    stage: 'Entry route',
    stimulusId: 'cars-l386-k3-entry-01',
    commitGroup: 'k3-entry',
    assistance: 'entry',
    evidence: 'routing',
    stem: 'What kind of link connects S1 and S2?',
    choices: LINK_CHOICES,
    key: 'A',
    rationales: r(
      'The inability to search for names is directly addressed by searchable transcripts.',
      'S2 does not limit S1.',
      'S2 is a response, not an example.',
      'The passage supplies the required bridge.',
    ),
    explanation: 'The stated problem and response genuinely connect.',
    hint: 'State the problem in S1 and the feature added in S2.',
    expectedSeconds: 55,
  },
  {
    id: 'k3-entry-invalid',
    kcId: KC3,
    stage: 'Entry route',
    stimulusId: 'cars-l386-k3-entry-01',
    commitGroup: 'k3-entry',
    assistance: 'entry',
    evidence: 'routing',
    stem: 'What kind of link connects S3 and S4?',
    choices: LINK_CHOICES,
    key: 'D',
    rationales: r(
      'Shorter clips do not supply the stated reason for captions or text preference.',
      'S4 does not narrow S3.',
      'S4 is not an example of shorter clips.',
      'The passage lacks the bridge between clip length and captions.',
    ),
    explanation: 'The transition word asserts a relation the passage does not supply.',
    hint: 'Cover “Therefore” and compare the exact requested and implemented changes.',
    expectedSeconds: 55,
  },
  {
    id: 'k3-local-support',
    kcId: KC3,
    hostKcId: KC3,
    primaryConstruct: {
      type: 'governed_operation',
      id: REFERENCE_RESOLUTION_OPERATION_ID,
    },
    supportArtifact: 'V3-SUP-900002',
    creditEligibility: 'support_only',
    stage: 'Conditional syntax and reference support',
    stimulusId: 'cars-l386-k3-local-support-01',
    commitGroup: 'k3-local-support',
    assistance: 'A3',
    evidence: 'instruction',
    stem: 'What does “that closure” in S2 refer to?',
    support:
      'This topic-neutral support checks reference resolution only. It earns no CARS credit.',
    choices: {
      A: 'The hall closing at six in S1.',
      B: 'The committee in S2.',
      C: 'The online meeting in S2.',
      D: 'No phrase in the passage.',
    },
    key: 'A',
    rationales: r(
      'The demonstrative phrase directly picks up the closure stated in S1.',
      'A committee is not a closure.',
      'The online move is the result, not the referent.',
      'S1 provides an explicit referent.',
    ),
    explanation: 'The reference resolves backward to S1’s early hall closure.',
    hint: 'Find the nearest earlier event that can grammatically be called a closure.',
    expectedSeconds: 45,
  },
  {
    id: 'k3-orient',
    kcId: KC3,
    stage: 'Orient and predict',
    stimulusId: 'cars-l386-anchor-01',
    commitGroup: 'k3-orient',
    assistance: 'A0',
    evidence: 'instruction',
    stem: 'In S10, what does “That concern” refer to?',
    choices: {
      A: 'S3’s claim that replicas are interpretations.',
      B: 'S7’s limit on touch.',
      C: 'S9’s concern that reconstruction labels could create distrust.',
      D: 'S12’s final recommendation.',
    },
    key: 'C',
    rationales: r(
      'S3 is not the immediately named concern.',
      'S7 is a limitation but not the referent.',
      'S10 directly picks up the concern stated in S9.',
      'S12 appears later and cannot be the backward referent.',
    ),
    explanation: 'The reference link from “That concern” resolves to S9.',
    hint: 'Look for the nearest prior sentence that explicitly states a concern.',
    expectedSeconds: 50,
  },
  {
    id: 'k3-a2',
    kcId: KC3,
    stage: 'Fresh A2',
    stimulusId: 'cars-l386-k3-a2-01',
    commitGroup: 'k3-a2',
    assistance: 'A2',
    evidence: 'instruction',
    stem: 'Why does S4 genuinely connect S1–S3?',
    support:
      'Name the new start time, stated duration and end time, and bus cutoff before evaluating the arrow.',
    choices: {
      A: 'The 4:30 p.m. start plus the stated 60-minute duration gives a 5:30 p.m. end, before the stated 5:45 p.m. last bus.',
      B: 'S4 merely repeats S1.',
      C: 'The word “performances” appears nearby.',
      D: 'Outside knowledge proves that every bus rider attends matinees.',
    },
    key: 'A',
    rationales: r(
      'The passage explicitly supplies the start, duration, end, and later bus cutoff.',
      'S4 adds a limited access consequence.',
      'Word overlap alone is not the bridge.',
      'The passage neither needs nor supports this universal outside claim.',
    ),
    explanation: 'The link is passage-internal and carefully limited to some riders.',
    hint: 'Use the stated 60 minutes: 4:30 p.m. → 5:30 p.m.; then compare 5:30 with 5:45.',
    expectedSeconds: 65,
  },
  {
    id: 'k3-a1',
    kcId: KC3,
    stage: 'Fresh A1',
    stimulusId: 'cars-l386-k3-a1-01',
    commitGroup: 'k3-a1',
    assistance: 'A1',
    evidence: 'instruction',
    stem: 'What kind of link connects S2 to S3?',
    support: 'Cover “Consequently.” Does S2 state anything about preserving paper boxes?',
    choices: LINK_CHOICES,
    key: 'D',
    rationales: r(
      'A less intimidating search page does not supply a preservation reason.',
      'S3 does not meaningfully qualify S2.',
      'S3 is not an example of interface intimidation.',
      'No passage-internal bridge connects the digital response to physical preservation.',
    ),
    explanation: 'The apparent consequence changes subjects without a bridge.',
    hint: 'Name the outcome in S2 and the different outcome in S3.',
    expectedSeconds: 60,
  },
  {
    id: 'k3-a0',
    kcId: KC3,
    stage: 'Fresh A0',
    stimulusId: 'cars-l386-k3-a0-01',
    commitGroup: 'k3-a0',
    assistance: 'A0',
    evidence: 'instruction',
    stem: 'What kind of link connects S1–S2 to S3?',
    choices: LINK_CHOICES,
    key: 'A',
    rationales: r(
      'The request and schedule change support the explicitly limited response claim.',
      'S3 does not contrast with the earlier parts.',
      'S3 is a conclusion, not an example.',
      'The bridge is stated in the matching request and response.',
    ),
    explanation: 'The phrase “at least one” preserves the exact scope supported.',
    hint: 'Check whether S3 claims more than the single schedule change establishes.',
    expectedSeconds: 65,
  },
  {
    id: 'k3-contrast',
    kcId: KC3,
    stage: 'Close contrast',
    stimulusId: 'cars-l386-k3-contrast-01',
    commitGroup: 'k3-contrast',
    assistance: 'A1',
    evidence: 'instruction',
    stem: 'Why is only the first connection established?',
    choices: {
      A: 'The first source names the exact change later made; the second names a different requested change.',
      B: 'The first uses a semicolon.',
      C: '“Therefore” makes both links valid.',
      D: 'Captions are always better than shorter clips.',
    },
    key: 'A',
    rationales: r(
      'Matching requested and implemented changes supplies the bridge only in S1.',
      'Punctuation does not establish relevance.',
      'A marker announces but cannot create a relation.',
      'This outside value judgment is irrelevant.',
    ),
    explanation: 'The decisive feature is exact relevance, not the marker.',
    hint: 'Compare the object of each request with the action taken.',
    expectedSeconds: 55,
  },
  {
    id: 'k3-exit0-near',
    kcId: KC3,
    stage: 'Untouched near-use exit',
    stimulusId: 'cars-l386-k3-exit0-near',
    commitGroup: 'k3-exit0',
    assistance: 'A0',
    evidence: 'instructional_exit',
    stem: 'What kind of link connects S1–S2 to S3?',
    choices: {
      A: 'Apparent link only — the asserted connection lacks a passage-internal bridge.',
      B: 'Genuine qualification link — the later part narrows the earlier part.',
      C: 'Genuine reason link — the earlier parts supply the stated reason for S3.',
      D: 'Genuine example link — S3 is an instance of the earlier parts.',
    },
    key: 'C',
    rationales: r(
      'The reported problem and targeted change supply a precise bridge.',
      'S3 does not narrow an earlier claim.',
      'The reported confusion and targeted markers directly support S3.',
      'S3 summarizes the response rather than giving a concrete instance.',
    ),
    explanation: 'The redesign addresses the exact location and problem reported.',
    hint: 'Match the location in S1 with the location changed in S2.',
    expectedSeconds: 75,
  },
  {
    id: 'k3-exit0-changed',
    kcId: KC3,
    stage: 'Untouched changed-passage exit',
    stimulusId: 'cars-l386-k3-exit0-changed',
    commitGroup: 'k3-exit0',
    assistance: 'A0',
    evidence: 'instructional_exit',
    stem: 'What kind of link connects S2 to S3?',
    choices: {
      A: 'Genuine example link — S3 is an instance of S2.',
      B: 'Apparent link only — the asserted connection lacks a passage-internal bridge.',
      C: 'Genuine reason link — S2 supplies the stated reason for S3.',
      D: 'Genuine qualification link — S3 narrows S2.',
    },
    key: 'B',
    rationales: r(
      'S3 is not a concrete instance of preserving routines.',
      'A possible shared effect does not establish shared original purpose.',
      'S2 supplies no reason for deliberate creation as public records.',
      'S3 changes the claim rather than narrowing it.',
    ),
    explanation: 'Possible preservation of routines does not establish intended public purpose.',
    hint: 'Separate what the objects can do from why they were created.',
    expectedSeconds: 75,
  },
  {
    id: 'k3-r1',
    kcId: KC3,
    stage: 'Repair cycle 1',
    stimulusId: 'cars-l386-k3-r1',
    commitGroup: 'k3-r1-task',
    assistance: 'A2',
    evidence: 'instruction',
    stem: 'Which asserted link is genuine?',
    support:
      'Cover “Accordingly,” then complete “Because participants requested ___, organizers added ___.”',
    choices: {
      A: 'S1 → S2 only.',
      B: 'S3 → S4 only.',
      C: 'Both links.',
      D: 'Neither link.',
    },
    key: 'A',
    rationales: r(
      'The printed-schedule request matches the printed-schedule response.',
      'Longer breaks do not supply a reason for a printed schedule.',
      'Only the first pair contains the bridge.',
      'The first pair is explicitly connected.',
    ),
    explanation: 'An asserted marker is valid only where source and response match.',
    hint: 'Compare the exact object requested with the exact action taken.',
    expectedSeconds: 70,
  },
  {
    id: 'k3-exit1-near',
    kcId: KC3,
    stage: 'Repair-1 near-use exit',
    stimulusId: 'cars-l386-k3-exit1-near',
    commitGroup: 'k3-exit1',
    assistance: 'A0',
    evidence: 'instructional_exit',
    stem: 'What kind of link connects S1 to S2?',
    choices: {
      A: 'Apparent link only — the asserted connection lacks a passage-internal bridge.',
      B: 'Genuine reason link — S1 supplies the stated reason for S2.',
      C: 'Genuine example link — S2 is an instance of S1.',
      D: 'Genuine qualification link — S2 narrows S1.',
    },
    key: 'A',
    rationales: r(
      'The digital note-panel change supplies no bridge to physical paper preservation.',
      'S1 states no physical preservation mechanism.',
      'S2 is not a concrete instance of a note panel.',
      'S2 changes topics rather than narrowing S1.',
    ),
    explanation: 'The asserted digital-to-physical link is only apparent.',
    hint: 'Ask what sentence would connect a side panel to paper-box preservation.',
    expectedSeconds: 70,
  },
  {
    id: 'k3-exit1-changed',
    kcId: KC3,
    stage: 'Repair-1 changed-passage exit',
    stimulusId: 'cars-l386-k3-exit1-changed',
    commitGroup: 'k3-exit1',
    assistance: 'A0',
    evidence: 'instructional_exit',
    stem: 'What kind of link connects S2 to S1?',
    choices: LINK_CHOICES,
    key: 'B',
    rationales: r(
      'S2 does not supply the primary reason for calling the whole catalog searchable.',
      'S2 narrows the searchability claim to interviews with transcripts.',
      'S2 is not a concrete instance of searchability.',
      'The source and target have a clear scope-narrowing bridge.',
    ),
    explanation: 'S2 is a genuine qualification of S1.',
    hint: 'Ask what portion of the catalog remains covered after S2.',
    expectedSeconds: 70,
  },
  {
    id: 'k3-r2',
    kcId: KC3,
    stage: 'Repair cycle 2',
    stimulusId: 'cars-l386-k3-r2',
    commitGroup: 'k3-r2-task',
    assistance: 'A1',
    evidence: 'instruction',
    stem: 'Which added sentence would supply the missing bridge?',
    support:
      'Use the bridge-sentence test: add only the premise required by the asserted connection.',
    choices: {
      A: 'Attendance logs showed more weekday visits after the hours were extended.',
      B: 'The museum’s walls were repainted that month.',
      C: 'Evening hours occur after daytime hours.',
      D: 'A nearby museum also offers evening hours.',
    },
    key: 'A',
    rationales: r(
      'This sentence directly connects the changed hours to the claimed attendance outcome.',
      'Wall color is irrelevant.',
      'This definition does not establish attendance change.',
      'A different museum does not establish this museum’s result.',
    ),
    explanation: 'A passage-reported before/after attendance link supplies the required bridge.',
    hint: 'The missing sentence must connect this museum’s hours to this museum’s attendance.',
    expectedSeconds: 70,
  },
  {
    id: 'k3-exit2-near',
    kcId: KC3,
    stage: 'Repair-2 near-use exit',
    stimulusId: 'cars-l386-k3-exit2-near',
    commitGroup: 'k3-exit2',
    assistance: 'A0',
    evidence: 'instructional_exit',
    stem: 'What kind of link connects S2 to S1?',
    choices: LINK_CHOICES,
    key: 'C',
    rationales: r(
      'S2 does not supply a reason for the general claim.',
      'S2 does not narrow the claim.',
      'The returning doorway is a concrete instance of the recurring-image claim.',
      'The passage supplies a clear example bridge.',
    ),
    explanation: 'S2 genuinely illustrates S1.',
    hint: 'Test whether S2 is a concrete case of the pattern named in S1.',
    expectedSeconds: 65,
  },
  {
    id: 'k3-exit2-changed',
    kcId: KC3,
    stage: 'Repair-2 changed-passage exit',
    stimulusId: 'cars-l386-k3-exit2-changed',
    commitGroup: 'k3-exit2',
    assistance: 'A0',
    evidence: 'instructional_exit',
    stem: 'What kind of link connects S1 to S2?',
    choices: LINK_CHOICES,
    key: 'D',
    rationales: r(
      'A shared subject does not establish shared performance context.',
      'S2 is not a qualification.',
      'S2 is not an example of mentioning rain.',
      'The same-concert bridge is absent.',
    ),
    explanation: 'Topical similarity does not establish event identity.',
    hint: 'Ask whether S1 states where or when either song was performed.',
    expectedSeconds: 65,
  },
  {
    id: 'k1-bridge-repair-task',
    kcId: KC1,
    hostKcId: KC2,
    primaryConstruct: { type: 'kc', id: KC1 },
    supportArtifact: 'V3-EDG-971610',
    creditEligibility: 'support_only',
    stage: 'Dedicated hard-edge KC1 repair',
    stimulusId: 'cars-l386-k1-bridge-repair-task',
    commitGroup: 'k1-bridge-repair-task',
    assistance: 'A2',
    evidence: 'instruction',
    stem: 'What is S2’s primary role?',
    support: 'The sentence is asserted as a reason; no record or observation is reported.',
    choices: {
      A: 'Plain claim — asserted but not used to support another claim here.',
      B: 'Supporting claim — an asserted reason used to support S1.',
      C: 'Evidence — a reported observation or record.',
      D: 'Illustration — a concrete example.',
    },
    key: 'B',
    rationales: r(
      'S2 is not structurally free-standing; it supplies a reason for S1.',
      'S2 is an asserted reason that supports the recommendation in S1.',
      'S2 reports no observation or record.',
      'S2 states a general reason rather than a concrete case.',
    ),
    explanation: 'S2 is a supporting claim, distinct from reported evidence.',
    hint: 'Ask whether S2 is reported, exemplified, or asserted as a reason.',
    expectedSeconds: 60,
  },
  {
    id: 'k1-bridge-exit-near',
    kcId: KC1,
    hostKcId: KC2,
    primaryConstruct: { type: 'kc', id: KC1 },
    supportArtifact: 'V3-EDG-971610',
    creditEligibility: 'support_only',
    stage: 'Dedicated hard-edge replacement exit',
    stimulusId: 'cars-l386-k1-bridge-exit-near',
    commitGroup: 'k1-bridge-exit',
    assistance: 'A0',
    evidence: 'instructional_exit',
    stem: 'What is S1’s primary role?',
    choices: ROLE_CHOICES,
    key: 'B',
    rationales: r(
      'S2, not S1, is the recommendation.',
      'S1 reports a pattern from logs used as a basis for S2.',
      'S1 is not an imagined example.',
      'S1 performs supporting work rather than only framing.',
    ),
    explanation: 'The closure-log pattern is evidence for the recommendation.',
    hint: 'Identify the passage-reported record.',
    expectedSeconds: 65,
  },
  {
    id: 'k1-bridge-exit-changed',
    kcId: KC1,
    hostKcId: KC2,
    primaryConstruct: { type: 'kc', id: KC1 },
    supportArtifact: 'V3-EDG-971610',
    creditEligibility: 'support_only',
    stage: 'Dedicated hard-edge changed replacement exit',
    stimulusId: 'cars-l386-k1-bridge-exit-changed',
    commitGroup: 'k1-bridge-exit',
    assistance: 'A0',
    evidence: 'instructional_exit',
    stem: 'What is S2’s primary role?',
    choices: ROLE_CHOICES,
    key: 'C',
    rationales: r(
      'S2 is not the supported endpoint.',
      'No observation is reported.',
      'The cracked-frame case illustrates S1.',
      'S2 makes the claim concrete rather than merely framing it.',
    ),
    explanation: 'S2 is a concrete illustration.',
    hint: 'The words “for example” must match an actual case, not just signal one.',
    expectedSeconds: 65,
  },
  {
    id: 'k2-bridge-replacement',
    kcId: KC1,
    hostKcId: KC2,
    primaryConstruct: { type: 'kc', id: KC1 },
    supportArtifact: 'V3-EDG-971610',
    creditEligibility: 'support_only',
    stage: 'Fresh hard-edge reentry confirmation',
    stimulusId: 'cars-l386-k2-bridge-replacement',
    commitGroup: 'k2-bridge-replacement',
    assistance: 'A1',
    evidence: 'instruction',
    stem: 'Which element-role map is correct?',
    choices: {
      A: 'S1 conclusion; S2 evidence.',
      B: 'S1 evidence; S2 conclusion.',
      C: 'S1 illustration; S2 background.',
      D: 'S1 objection; S2 concession.',
    },
    key: 'B',
    rationales: r(
      'This reverses source and target.',
      'The records are evidence for the stable-room recommendation.',
      'The record is not imagined, and the recommendation is not background.',
      'No opposing view appears.',
    ),
    explanation: 'The fresh replacement confirms evidence S1 → conclusion S2.',
    hint: 'Name the reported record before naming the recommendation.',
    expectedSeconds: 55,
  },
  {
    id: 'k3-entry-disambiguator',
    kcId: KC3,
    hostKcId: KC3,
    primaryConstruct: { type: 'kc', id: KC3 },
    supportArtifact: null,
    creditEligibility: 'routing_only',
    stage: 'Fresh marker disambiguator',
    stimulusId: 'cars-l386-k3-disambiguator',
    commitGroup: 'k3-entry-d1',
    assistance: 'entry',
    evidence: 'routing',
    stem: 'What kind of link connects S1 to S2?',
    choices: LINK_CHOICES,
    key: 'D',
    rationales: r(
      'Larger text does not supply the stated reason for audio narration.',
      'S2 does not narrow S1.',
      'S2 is not an example of larger text.',
      'The marker asserts a link whose bridge is absent.',
    ),
    explanation: 'A fresh marker cannot create a missing content bridge.',
    hint: 'Cover “Therefore” and compare the requested change with the implemented change.',
    expectedSeconds: 55,
  },
  {
    id: 'k3-local-support-confirm',
    kcId: KC3,
    hostKcId: KC3,
    primaryConstruct: {
      type: 'governed_operation',
      id: REFERENCE_RESOLUTION_OPERATION_ID,
    },
    supportArtifact: 'V3-SUP-900002',
    creditEligibility: 'support_only',
    stage: 'Fresh V3-SUP-900002 confirmation',
    stimulusId: 'cars-l386-k3-support-confirm',
    commitGroup: 'k3-local-support-confirm',
    assistance: 'A1',
    evidence: 'instruction',
    stem: 'What does “that cancellation” in S2 refer to?',
    choices: {
      A: 'The studio in S1.',
      B: 'Tuesday’s canceled rehearsal in S1.',
      C: 'The ensemble in S2.',
      D: 'Wednesday practice in S2.',
    },
    key: 'B',
    rationales: r(
      'A place is not the canceled event.',
      'The demonstrative phrase resolves to the canceled Tuesday rehearsal.',
      'The ensemble responds to the cancellation but is not its referent.',
      'Wednesday practice is the result.',
    ),
    explanation: 'The fresh reference confirmation succeeds only with S1’s canceled rehearsal.',
    hint: 'Find the earlier event that can be named a cancellation.',
    expectedSeconds: 45,
  },
  {
    id: 'k1-claim-coverage',
    kcId: KC1,
    stage: 'Supporting-claim coverage',
    stimulusId: 'cars-l386-k1-claim-coverage',
    commitGroup: 'k1-claim-coverage',
    assistance: 'A1',
    evidence: 'instruction',
    stem: 'What is S2’s primary role?',
    choices: {
      A: 'Plain claim — asserted but not used as support here.',
      B: 'Supporting claim — an asserted reason for S1.',
      C: 'Evidence — a reported observation or record.',
      D: 'Illustration — a concrete case.',
    },
    key: 'B',
    rationales: r(
      'S2 is used as a reason for S1.',
      'S2 is an asserted explanatory reason, not a report.',
      'No observation or record is presented.',
      'S2 is general rather than a concrete example.',
    ),
    explanation: 'A supporting claim can be a premise without being evidence.',
    hint: 'Distinguish asserted reasoning from a reported finding.',
    expectedSeconds: 55,
  },
  {
    id: 'k2-example-coverage',
    kcId: KC2,
    stage: 'Example-relation coverage',
    stimulusId: 'cars-l386-k2-example-coverage',
    commitGroup: 'k2-relation-coverage',
    assistance: 'A1',
    evidence: 'instruction',
    stem: 'What relation does S2 have to S1?',
    choices: {
      A: 'Example — supplies a concrete instance of S1.',
      B: 'Causal explanation — states why S1 occurs.',
      C: 'Qualification — narrows S1.',
      D: 'Objection — challenges S1.',
    },
    key: 'A',
    rationales: r(
      'The doorway is a concrete instance of the recurring-image claim.',
      'S2 does not state a cause.',
      'S2 does not narrow S1.',
      'S2 supports rather than challenges S1.',
    ),
    explanation: 'S2 relates to S1 as example to general claim.',
    hint: 'Test whether S2 is a case of S1.',
    expectedSeconds: 55,
  },
  {
    id: 'k2-causal-coverage',
    kcId: KC2,
    stage: 'Causal-relation coverage',
    stimulusId: 'cars-l386-k2-causal-coverage',
    commitGroup: 'k2-relation-coverage',
    assistance: 'A1',
    evidence: 'instruction',
    stem: 'What relation does S1 have to S2?',
    choices: {
      A: 'Example — gives one instance of S2.',
      B: 'Causal explanation — supplies the passage-stated mechanism for S2.',
      C: 'Qualification — narrows S2.',
      D: 'Concession — grants an objection to S2.',
    },
    key: 'B',
    rationales: r(
      'S1 describes the changed route, not merely an instance of reduced delay.',
      'S1 states how the desk move removed one source of delay.',
      'S1 does not narrow the claim.',
      'No objection is granted.',
    ),
    explanation: 'S1 supplies a local causal mechanism for S2 without evaluating sufficiency.',
    hint: 'Ask whether S1 states how the outcome occurred.',
    expectedSeconds: 60,
  },
];

const SCREEN_ORDER = [
  'intro',
  'k1-entry',
  'k1-entry-followup',
  'k1-model',
  'k1-orient',
  'k1-practice',
  'k1-practice-cued',
  'k1-practice-solo',
  'k1-practice-contrast',
  'k1-practice-claim',
  'k1-exit',
  'k1-repair1',
  'k1-repair2',
  'k1-handoff',
  'k2-entry',
  'k1-bridge-repair',
  'k2-model',
  'k2-orient',
  'k2-practice',
  'k2-practice-cued',
  'k2-practice-solo',
  'k2-practice-contrast',
  'k2-practice-coverage',
  'k2-exit',
  'k2-repair1',
  'k2-repair2',
  'k2-handoff',
  'k3-entry',
  'k3-entry-followup',
  'k3-model',
  'k3-support',
  'k3-support-confirm',
  'k3-orient',
  'k3-practice',
  'k3-practice-cued',
  'k3-practice-solo',
  'k3-practice-contrast',
  'k3-exit',
  'k3-repair1',
  'k3-repair2',
  'complete',
  'paused',
  'blocked',
];

const SCREEN_LABELS: Record<string, string> = {
  intro: 'Lesson opening',
  'k1-entry': 'Topic 1 · Check',
  'k1-entry-followup': 'Topic 1 · Check',
  'k1-model': 'Topic 1 · Learn',
  'k1-orient': 'Topic 1 · Practice',
  'k1-practice': 'Topic 1 · Practice',
  'k1-practice-cued': 'Topic 1 · Practice',
  'k1-practice-solo': 'Topic 1 · Practice',
  'k1-practice-contrast': 'Topic 1 · Practice',
  'k1-practice-claim': 'Topic 1 · Practice',
  'k1-exit': 'Topic 1 · Final check',
  'k1-repair1': 'Topic 1 · Practice',
  'k1-repair2': 'Topic 1 · Practice',
  'k1-handoff': 'Topic 1 · Complete',
  'k2-entry': 'Topic 2 · Check',
  'k1-bridge-repair': 'Topic 1 · Practice',
  'k2-model': 'Topic 2 · Learn',
  'k2-orient': 'Topic 2 · Practice',
  'k2-practice': 'Topic 2 · Practice',
  'k2-practice-cued': 'Topic 2 · Practice',
  'k2-practice-solo': 'Topic 2 · Practice',
  'k2-practice-contrast': 'Topic 2 · Practice',
  'k2-practice-coverage': 'Topic 2 · Practice',
  'k2-exit': 'Topic 2 · Final check',
  'k2-repair1': 'Topic 2 · Practice',
  'k2-repair2': 'Topic 2 · Practice',
  'k2-handoff': 'Topic 2 · Complete',
  'k3-entry': 'Topic 3 · Check',
  'k3-entry-followup': 'Topic 3 · Check',
  'k3-model': 'Topic 3 · Learn',
  'k3-support': 'Topic 3 · Practice',
  'k3-support-confirm': 'Topic 3 · Practice',
  'k3-orient': 'Topic 3 · Practice',
  'k3-practice': 'Topic 3 · Practice',
  'k3-practice-cued': 'Topic 3 · Practice',
  'k3-practice-solo': 'Topic 3 · Practice',
  'k3-practice-contrast': 'Topic 3 · Practice',
  'k3-exit': 'Topic 3 · Final check',
  'k3-repair1': 'Topic 3 · Practice',
  'k3-repair2': 'Topic 3 · Practice',
  complete: 'Lesson complete',
  paused: 'Lesson paused',
  blocked: 'Lesson unavailable',
};

function learnerProgress(screenId: string): {
  topic: number | null;
  phase: 'Check' | 'Learn' | 'Practice' | 'Final check' | null;
} {
  const topic = screenId.startsWith('k1')
    ? 1
    : screenId.startsWith('k2')
      ? 2
      : screenId.startsWith('k3') || screenId === 'complete'
        ? 3
        : null;
  if (topic === null) return { topic: null, phase: null };
  if (screenId.includes('entry')) return { topic, phase: 'Check' };
  if (screenId.includes('model')) return { topic, phase: 'Learn' };
  if (screenId.includes('exit') || screenId.includes('handoff') || screenId === 'complete') {
    return { topic, phase: 'Final check' };
  }
  return { topic, phase: 'Practice' };
}

const INITIAL_EVENTS: LessonEvent[] = [
  {
    envelopeVersion: EVENT_ENVELOPE_VERSION,
    eventId: 'les-386478-run-1-event-1',
    runId: 'les-386478-run-1',
    sequence: 1,
    runSequence: 1,
    prototypeOrder: 'append-only-sequence:1',
    type: 'lesson_shell_started',
    screenId: 'intro',
    payload: {
      lessonId: 'V3-LES-386478',
      action: 'initialized',
      expectedTimingEnvelope: EXPECTED_TIMING_ENVELOPE,
    },
    creditEligibility: null,
    registrySha: REGISTRY_SHA,
    graphFreeze: GRAPH_FREEZE,
    sequenceFreeze: SEQUENCE_FREEZE,
    phaseId: 'V3-PHS-935127',
    moduleId: 'V3-MOD-326514',
    moduleEventOrdinal: 1,
    lessonOrdinal: 87,
    contentVersion: CONTENT_VERSION,
    policyVersion: POLICY_VERSION,
    reviewedContentHash: null,
    reviewedContentHashStatus: 'pending_independent_review',
    actorMode: 'learner',
    simulationMode: true,
    runtimeContext: CANVAS_RUNTIME_CONTEXT,
    runStatus: 'active',
    expectedTiming: {
      contractVersion: EXPECTED_TIMING_ENVELOPE.contractVersion,
      normalizedUnit: 'milliseconds',
      itemExpectedDurationMs: null,
      observedTimingStatus: 'outside_canvas_scope_not_implemented',
    },
    unimplementedFields: ['wallClockTimestamp', 'observedTiming', 'signedActorIdentity'],
  },
  {
    envelopeVersion: EVENT_ENVELOPE_VERSION,
    eventId: 'les-386478-run-1-event-2',
    runId: 'les-386478-run-1',
    sequence: 2,
    runSequence: 2,
    prototypeOrder: 'append-only-sequence:2',
    type: 'screen_activated',
    screenId: 'intro',
    payload: {
      activatedScreenId: 'intro',
      reason: 'Initial lesson screen activated',
      mutable: true,
    },
    creditEligibility: null,
    registrySha: REGISTRY_SHA,
    graphFreeze: GRAPH_FREEZE,
    sequenceFreeze: SEQUENCE_FREEZE,
    phaseId: 'V3-PHS-935127',
    moduleId: 'V3-MOD-326514',
    moduleEventOrdinal: 1,
    lessonOrdinal: 87,
    contentVersion: CONTENT_VERSION,
    policyVersion: POLICY_VERSION,
    reviewedContentHash: null,
    reviewedContentHashStatus: 'pending_independent_review',
    actorMode: 'learner',
    simulationMode: true,
    runtimeContext: CANVAS_RUNTIME_CONTEXT,
    runStatus: 'active',
    expectedTiming: {
      contractVersion: EXPECTED_TIMING_ENVELOPE.contractVersion,
      normalizedUnit: 'milliseconds',
      itemExpectedDurationMs: null,
      observedTimingStatus: 'outside_canvas_scope_not_implemented',
    },
    unimplementedFields: ['wallClockTimestamp', 'observedTiming', 'signedActorIdentity'],
  },
];

const INITIAL_STATE: LessonState = {
  mode: 'learner',
  reviewerTab: 'manifest',
  runStatus: 'active',
  runId: 'les-386478-run-1',
  runContentVersion: CONTENT_VERSION,
  currentScreen: 'intro',
  activeScreen: 'intro',
  reached: ['intro'],
  responses: {},
  committedGroups: [],
  retiredGroups: [],
  presentedItemIds: [],
  presentedStimulusIds: [],
  hintsQueued: [],
  assistedItems: [],
  routes: {
    [KC1]: 'unselected',
    [KC2]: 'unselected',
    [KC3]: 'unselected',
  },
  repairCycles: {
    [KC1]: 0,
    [KC2]: 0,
    [KC3]: 0,
  },
  exited: {
    [KC1]: false,
    [KC2]: false,
    [KC3]: false,
  },
  pausedAt: null,
  pausedReason: null,
  simulationCompletionRecorded: false,
  reentryTarget: null,
  bridgeStatus: 'none',
  reviewerKeysExposed: false,
  exposures: [],
  blockedInvalidIds: [],
  announcement: 'Lesson ready.',
  events: INITIAL_EVENTS,
};

const MANIFEST_ROWS = [
  ['Lesson', 'V3-LES-386478', 'Reconstruct Argument Structure'],
  ['Grouping', 'V3-CL-386478', 'Exact order preserved'],
  ['KC 1', KC1, 'Distinguish Claims, Conclusions, and Evidence'],
  ['KC 2', KC2, 'Map Argument Support and Relation'],
  ['KC 3', KC3, 'Test an Apparent Argument Link'],
  [
    'Production first-delivery coordinate',
    'R14-FD-386478',
    'Referenced for alignment; this Canvas remains simulation-only',
  ],
  ['Module', 'V3-MOD-326514', 'Module event 1 · lesson ordinal 87'],
  ['Internal order', 'R14-INTERNAL-386478', 'KC1 → KC2 → KC3; capstone referenced only'],
  [
    'Governed operation',
    REFERENCE_RESOLUTION_OPERATION_ID,
    'Versioned reference-resolution operation; never KC credit',
  ],
  ['Support artifact', 'V3-SUP-900002', 'Attached separately to the governed operation'],
  ['Event envelope', EVENT_ENVELOPE_VERSION, 'Discriminated union with typed payloads'],
  [
    'Canvas runtime',
    CANVAS_RUNTIME_CONTEXT,
    'Every path is simulation-only; production completion is never emitted',
  ],
  [
    'Exposure envelope',
    EXPOSURE_ENVELOPE_VERSION,
    'Nullable eligibility for invalid-content no-credit blocks',
  ],
  [
    'Expected timing',
    EXPECTED_TIMING_ENVELOPE.contractVersion,
    'Normative milliseconds only; observed timing out of scope',
  ],
  ['Reviewed hash', 'pending', 'null until independent exact-version approval'],
  ['Rights gate', 'blocked', 'internal prototype pending independent rights review'],
  ['Similarity gate', 'blocked', 'independent similarity scan not yet completed'],
  ['Blind-solve gate', 'blocked', 'independent blind solver and final approver pending'],
  ['Capstone', 'V3-CAP-027756', 'Separate later coordination event; not delivered here'],
];

const BRANCH_TESTS = [
  'Missing entry telemetry selects the supportive standard route.',
  'Clean entry performance selects concise delivery without bypassing the KC.',
  'One evidence/illustration distractor opens a fresh disambiguator; only a repeated reversal selects misconception support.',
  'A marker-driven KC3 entry choice opens a fresh family; only a repeated marker-driven choice selects misconception support.',
  'KC2 commits the single KC1 role probe before any KC2 relation item or relation-routing stimulus is presented.',
  'A KC2 node-role miss activates the V3-EDG-971610 hard-point bridge before relation routing.',
  'After a clean role probe or successful bridge path, only the fresh cars-l386-k2-relation-route-family-v1 performs KC2 routing.',
  'A failed hard bridge persists les-386478-reentry-v1, opens dedicated fresh KC1 repair and exit families, then exposes only k2-bridge-replacement.',
  'Replacement exits remain hidden until their repair task is committed.',
  'V3-SUP-900002 requires a successful fresh topic-neutral confirmation before KC3 can continue.',
  'Not sure records uncertainty without a misconception label.',
  'A committed blank records omission without inferring a cause.',
  'A queued hint stays hidden until every response in the shared commit group is submitted.',
  'Help on an A0 exit item contaminates that item and makes the exit pack nonpassing.',
  'One failed exit check prevents kc_instructional_exit_simulated.',
  'Every visible group preflights item, stimulus, family, construct, eligibility, governed-support, timing, and exit metadata before presentation.',
  'Invalid content transitions to blocked with null eligibility and no anchor fallback, presentation, response, penalty, or evidence.',
  'Repair cycle 1 uses a fresh task and fresh exit families.',
  'Repair cycle 2 failure emits kc_paused_for_repair and retires the failed group for this content version.',
  'Reached-screen navigation never unlocks an unseen screen.',
  'Reached historical text stays in the accessibility tree while descendant controls are disabled.',
  'A paused or blocked run has no local reset; replacement remains terminal because no statically reviewed manifest/hash with distinct families is embedded.',
  'A late failure opens a repair or freshness overlay without erasing the first simulation pass.',
  'Reviewer/key access appends internal-review exposure and forces simulation-only eligibility.',
  'Screen activation emits typed lifecycle events and first-per-run item/stimulus presentation exposures without duplication.',
  'Support-only bridge metadata never becomes an instructional-exit candidate even when a legacy item evidence label says exit.',
  'Expected timing normalizes shell totals and all increments to milliseconds; observed timing is outside this Canvas’s scope.',
  'Screen-reader text maps and visual annotations preserve equivalent semantics.',
  'KC3 exit and lesson_simulation_completed are emitted atomically and idempotently in one state transaction; a production host would emit lesson_delivery_completed, but this Canvas never does.',
  'No path emits capstone completion, whole-argument evaluation, mastery, or score-readiness evidence.',
  'Any whole-argument persuasion, sufficiency, credibility, or truth prompt is rejected as out of scope.',
];

const QA_RUBRIC = [
  'Canonical lesson identity, grouping, and KC order are exact.',
  'Every key follows solely from identified passage text.',
  'No task asks whether the whole argument is persuasive, sufficient, credible, or externally true.',
  'Element role and relation-between-elements remain distinct.',
  'Close distractors are plausible but not co-correct.',
  'Choice rationales describe response features, never certain learner traits.',
  'A2, A1, and A0 supports change the intended cognitive work.',
  'Near-use and changed exit families are isolated; reviewer/key exposure forces simulation-only status.',
  'Changed passages vary discipline or rhetorical form, not surface nouns alone.',
  'Shared-passage feedback waits for the full response commitment.',
  'Host KC, typed primary construct, support artifact, and credit eligibility remain separate.',
  'Reference resolution uses LES-386478-GOVOP-REFERENCE-RESOLUTION-v1 while V3-SUP-900002 remains a separate support artifact.',
  'Lesson events form a discriminated union with typed payloads and common decision/version fields.',
  'Every Canvas path is internal simulation, including clean previews with no reviewer/key exposure.',
  'Only lesson_simulation_completed exists in the Canvas event union; lesson_delivery_completed is a production-host contract reference and is never emitted here.',
  'Presentation and attempt telemetry derive credit only from normalized metadata.',
  'Every active-screen transition emits lifecycle events and deduplicated first-presentation exposure.',
  'Expected duration is normalized under les-386478-expected-timing-v2; no observed clock claim is emitted.',
  'Repairs use fresh families and stop after two cycles.',
  'Text alternatives preserve all information carried by annotation styling.',
  'Core route remains within the provisional 18-minute p90 guardrail per KC.',
  'Originality, rights, similarity, blind-solve, accessibility, and bias gates remain blocked until exact-version review passes.',
];

const SOURCES = [
  'curriculum-architecture-v3/work/v3-authoritative-registry.json · SHA-256 635c39e9c0ebb28a3892399449aa9b74893aae3264924cd739b92b6e370ba26a',
  'curriculum-architecture-v3/v3-canonical-kcs.json · exact KC records',
  'curriculum-architecture-v3/v3-prerequisite-graph.json · graph freeze MCAT-V3-GRAPH-FRZ-2026-07-22-01',
  'curriculum-architecture-v3/v3-teaching-sequences.json · sequence freeze MCAT-V3-SEQUENCE-FRZ-2026-07-22-01',
  'curriculum-architecture-v3/v3-extensions-capstones-support.json · capstone and support boundaries',
  '/Users/mohamedshawgi/mcat-prep/docs/design/mcat-complete-learning-flow.md · microcycle, feedback, evidence, accessibility, and publication rules',
];

const EVENT_DICTIONARY = [
  [
    'lesson_shell_started',
    'Open the internal simulation contract and first KC.',
    'Simulation lifecycle',
  ],
  [
    'kc_microcycle_started',
    'Bind ordered KC, route, and simulated checkpoint.',
    'Simulation lifecycle',
  ],
  [
    'screen_activated',
    'Record a typed simulation-screen transition and whether the destination is mutable.',
    'Simulation lifecycle',
  ],
  ['stimulus_presented', 'Record first per-run stimulus and family exposure.', 'Exposure'],
  [
    'item_presented',
    'Record first per-run typed item presentation and normalized expected duration.',
    'Metadata-derived',
  ],
  [
    'attempt_submitted',
    'Record typed response, omission, correctness, assistance, and eligibility; observed timing is out of scope.',
    'Mode-dependent',
  ],
  ['hint_requested', 'Queue help; contaminate A0 exit when applicable.', 'Assistance'],
  ['answer_feedback_revealed', 'Reveal only after the linked group closes.', 'Instruction'],
  [
    'instruction_route_selected',
    'Bind the ordered KC, source screen, and selected instructional dose.',
    'Routing only',
  ],
  [
    'lesson_checkpoint_completed',
    'Persist the exact resumable simulation coordinate.',
    'Simulation lifecycle',
  ],
  [
    'kc_instructional_exit_simulated',
    'Close a simulated checkpoint on every Canvas path, including a clean preview.',
    'Simulation only',
  ],
  [
    'repair_closure_verified',
    'Close a support repair while preserving any prior KC exit monotonically.',
    'Instruction/support only',
  ],
  [
    'exact_kc_repair_activity_started',
    'Bind the KC, failed group, and bounded repair-cycle number.',
    'Instruction only',
  ],
  ['kc_paused_for_repair', 'Stop after two bounded repair cycles.', 'Repair'],
  ['kc_paused_for_support', 'Stop when required local support is not confirmed.', 'Support only'],
  [
    'kc_paused_for_retired_family',
    'Keep a failed family terminal; no local replacement resolver exists.',
    'Null eligibility',
  ],
  [
    'sequence_reentry_target_persisted',
    'Bind exact hard-edge return screen and fresh replacement group.',
    'Repair',
  ],
  ['kc_resumed_at_reentry', 'Return to exact KC and repair coordinate.', 'Repair'],
  [
    'internal_review_key_access_started',
    'Expose all keys and families as internal simulation.',
    'Never untouched',
  ],
  [
    'invalid_content_blocked',
    'Fail closed before presentation, response, or evidence.',
    'Null eligibility',
  ],
  [
    'lesson_simulation_completed',
    'Atomically close this Canvas simulation. A production host would emit lesson_delivery_completed; this Canvas never does.',
    'Simulation only; no mastery or capstone',
  ],
];

function getStimulus(id: string): Stimulus | undefined {
  return STIMULI.find((stimulus) => stimulus.id === id);
}

function groupItems(groupId: string): Item[] {
  return ITEMS.filter((item) => item.commitGroup === groupId);
}

const STATIC_SCREEN_GROUPS: Record<string, string[]> = {
  'k1-entry-followup': ['k1-entry-d1'],
  'k1-model': [],
  'k1-orient': ['k1-orient'],
  'k1-practice': ['k1-a2'],
  'k1-practice-cued': ['k1-a1'],
  'k1-practice-solo': ['k1-a0'],
  'k1-practice-contrast': ['k1-contrast'],
  'k1-practice-claim': ['k1-claim-coverage'],
  'k1-exit': ['k1-exit0'],
  'k1-handoff': [],
  'k2-model': [],
  'k2-orient': ['k2-orient'],
  'k2-practice': ['k2-a2'],
  'k2-practice-cued': ['k2-a1'],
  'k2-practice-solo': ['k2-a0'],
  'k2-practice-contrast': ['k2-contrast'],
  'k2-practice-coverage': ['k2-relation-coverage'],
  'k2-exit': ['k2-exit0'],
  'k2-handoff': [],
  'k3-model': [],
  'k3-entry-followup': ['k3-entry-d1'],
  'k3-support': ['k3-local-support'],
  'k3-support-confirm': ['k3-local-support-confirm'],
  'k3-orient': ['k3-orient'],
  'k3-practice': ['k3-a2'],
  'k3-practice-cued': ['k3-a1'],
  'k3-practice-solo': ['k3-a0'],
  'k3-practice-contrast': ['k3-contrast'],
  'k3-exit': ['k3-exit0'],
};

const STATIC_SCREEN_STIMULI: Record<string, string[]> = {
  'k1-model': [ANCHOR.id],
  'k2-model': [ANCHOR.id],
  'k3-model': ['cars-l386-k3-entry-01'],
};

function stateGroupPassed(state: LessonState, groupId: string): boolean {
  const items = groupItems(groupId);
  return (
    items.length > 0 &&
    state.committedGroups.includes(groupId) &&
    !state.retiredGroups.includes(groupId) &&
    items.every((item) => Boolean(getStimulus(item.stimulusId))) &&
    items.every(
      (item) => state.responses[item.id] === item.key && !state.assistedItems.includes(item.id),
    )
  );
}

function visibleGroupIdsForScreen(screenId: string, state: LessonState): string[] {
  if (screenId === 'k1-entry') {
    return ['k1-entry'];
  }
  if (screenId === 'k1-repair1') {
    return ['k1-r1-task', ...(state.committedGroups.includes('k1-r1-task') ? ['k1-exit1'] : [])];
  }
  if (screenId === 'k1-repair2') {
    return ['k1-r2-task', ...(state.committedGroups.includes('k1-r2-task') ? ['k1-exit2'] : [])];
  }
  if (screenId === 'k1-bridge-repair') {
    return [
      'k1-bridge-repair-task',
      ...(state.committedGroups.includes('k1-bridge-repair-task') ? ['k1-bridge-exit'] : []),
    ];
  }
  if (screenId === 'k2-entry') {
    const roleCommitted = state.committedGroups.includes('k2-role-probe');
    const roleReady =
      state.responses['k2-entry-roles'] === 'A' && !state.assistedItems.includes('k2-entry-roles');
    const bridgePassed = stateGroupPassed(state, 'k2-bridge');
    const hardEdgeReady =
      (roleCommitted && roleReady) || bridgePassed || state.bridgeStatus === 'resolved';
    if (!roleCommitted) return ['k2-role-probe'];
    if (
      !roleReady &&
      state.bridgeStatus === 'none' &&
      !state.committedGroups.includes('k2-bridge')
    ) {
      return ['k2-bridge'];
    }
    if (
      state.bridgeStatus === 'replacement_pending' &&
      !state.committedGroups.includes('k2-bridge-replacement')
    ) {
      return ['k2-bridge-replacement'];
    }
    if (hardEdgeReady && !state.committedGroups.includes('k2-relation-route')) {
      return ['k2-relation-route'];
    }
    return [];
  }
  if (screenId === 'k2-repair1') {
    return ['k2-r1-task', ...(state.committedGroups.includes('k2-r1-task') ? ['k2-exit1'] : [])];
  }
  if (screenId === 'k2-repair2') {
    return ['k2-r2-task', ...(state.committedGroups.includes('k2-r2-task') ? ['k2-exit2'] : [])];
  }
  if (screenId === 'k3-entry') {
    return ['k3-entry'];
  }
  if (screenId === 'k3-repair1') {
    return ['k3-r1-task', ...(state.committedGroups.includes('k3-r1-task') ? ['k3-exit1'] : [])];
  }
  if (screenId === 'k3-repair2') {
    return ['k3-r2-task', ...(state.committedGroups.includes('k3-r2-task') ? ['k3-exit2'] : [])];
  }
  return STATIC_SCREEN_GROUPS[screenId] ?? [];
}

function getItemMetadata(item: Item): {
  hostKcId: KcId;
  primaryConstruct: ConstructRef;
  supportArtifact: SupportArtifactId | null;
  creditEligibility: CreditEligibility;
} {
  return {
    hostKcId: item.hostKcId ?? item.kcId,
    primaryConstruct: item.primaryConstruct ?? {
      type: 'kc',
      id: item.kcId,
    },
    supportArtifact: item.supportArtifact ?? null,
    creditEligibility:
      item.creditEligibility ??
      (item.evidence === 'routing'
        ? 'routing_only'
        : item.evidence === 'instructional_exit' && item.assistance === 'A0'
          ? 'instructional_exit_candidate'
          : item.assistance === 'A3'
            ? 'support_only'
            : 'instruction_only'),
  };
}

function effectiveCreditEligibility(item: Item): CreditEligibility {
  const base = getItemMetadata(item).creditEligibility;
  if (base !== 'instructional_exit_candidate') return base;
  return 'simulation_only_never_untouched';
}

function aggregateCreditEligibility(items: Item[]): CreditEligibility {
  const values = items.map((item) => effectiveCreditEligibility(item));
  if (values.includes('simulation_only_never_untouched')) {
    return 'simulation_only_never_untouched';
  }
  if (values.includes('instructional_exit_candidate')) {
    return 'instructional_exit_candidate';
  }
  if (values.includes('routing_only')) return 'routing_only';
  if (values.includes('support_only')) return 'support_only';
  return 'instruction_only';
}

type ContentPreflightResult = {
  valid: boolean;
  invalidIds: string[];
  items: Item[];
  stimuli: Stimulus[];
};

function validConstructRef(construct: ConstructRef): boolean {
  if (construct.type === 'kc') {
    return [KC1, KC2, KC3].includes(construct.id);
  }
  if (construct.type === 'capstone') {
    return construct.id === 'V3-CAP-027756';
  }
  return construct.id === REFERENCE_RESOLUTION_OPERATION_ID;
}

function preflightContentGroups(groupIds: string[]): ContentPreflightResult {
  const invalidIds: string[] = [];
  const rawItems = groupIds.flatMap((groupId) => {
    const grouped = groupItems(groupId);
    if (grouped.length === 0) {
      invalidIds.push(`group:${groupId}:missing`);
    }
    return grouped;
  });
  const items = Array.from(new Map(rawItems.map((item) => [item.id, item])).values());
  if (rawItems.length !== new Set(rawItems.map((item) => item.id)).size) {
    invalidIds.push('item-id:duplicate-visible');
  }

  items.forEach((item) => {
    const metadata = getItemMetadata(item);
    const stimulus = getStimulus(item.stimulusId);
    if (!item.id.trim()) invalidIds.push('item-id:blank');
    if (ITEMS.filter((candidate) => candidate.id === item.id).length !== 1) {
      invalidIds.push(`item:${item.id}:static-id-not-unique`);
    }
    if (!item.commitGroup.trim()) {
      invalidIds.push(`item:${item.id}:blank-commit-group`);
    }
    if (
      !item.stem.trim() ||
      !item.choices[item.key]?.trim() ||
      (['A', 'B', 'C', 'D'] as ChoiceId[]).some(
        (choiceId) => !item.choices[choiceId]?.trim() || !item.rationales[choiceId]?.trim(),
      )
    ) {
      invalidIds.push(`item:${item.id}:response-contract-invalid`);
    }
    if (!groupIds.includes(item.commitGroup)) {
      invalidIds.push(`item:${item.id}:unexpected-group`);
    }
    if (!stimulus) {
      invalidIds.push(`item:${item.id}:stimulus:${item.stimulusId}:missing`);
    } else {
      if (STIMULI.filter((candidate) => candidate.id === stimulus.id).length !== 1) {
        invalidIds.push(`stimulus:${stimulus.id}:static-id-not-unique`);
      }
      if (!stimulus.id.trim()) {
        invalidIds.push(`item:${item.id}:stimulus-id:blank`);
      }
      if (!stimulus.familyId.trim()) {
        invalidIds.push(`stimulus:${stimulus.id}:family-id:blank`);
      }
      if (STIMULI.filter((candidate) => candidate.familyId === stimulus.familyId).length !== 1) {
        invalidIds.push(`family:${stimulus.familyId}:not-unique`);
      }
      if (
        stimulus.paragraphs.length === 0 ||
        stimulus.paragraphs.some(
          (paragraph) =>
            !paragraph.id.trim() ||
            paragraph.sentences.length === 0 ||
            paragraph.sentences.some((sentence) => !sentence.id.trim() || !sentence.text.trim()),
        )
      ) {
        invalidIds.push(`stimulus:${stimulus.id}:structure-invalid`);
      }
    }
    if (![KC1, KC2, KC3].includes(metadata.hostKcId)) {
      invalidIds.push(`item:${item.id}:host-kc-invalid`);
    }
    if (!validConstructRef(metadata.primaryConstruct)) {
      invalidIds.push(`item:${item.id}:primary-construct-invalid`);
    }
    if (metadata.primaryConstruct.type === 'capstone') {
      invalidIds.push(`item:${item.id}:capstone-construct-excluded`);
    }
    if (
      metadata.primaryConstruct.type === 'governed_operation' &&
      metadata.supportArtifact !== 'V3-SUP-900002'
    ) {
      invalidIds.push(`item:${item.id}:governed-operation-support-missing`);
    }
    if (
      metadata.supportArtifact === 'V3-SUP-900002' &&
      metadata.primaryConstruct.type !== 'governed_operation'
    ) {
      invalidIds.push(`item:${item.id}:support-operation-mismatch`);
    }
    if (metadata.supportArtifact !== null && !metadata.supportArtifact.trim()) {
      invalidIds.push(`item:${item.id}:support-artifact-blank`);
    }
    if (!CREDIT_ELIGIBILITIES.includes(metadata.creditEligibility)) {
      invalidIds.push(`item:${item.id}:credit-eligibility-invalid`);
    }
    if (!Number.isFinite(item.expectedSeconds) || item.expectedSeconds <= 0) {
      invalidIds.push(`item:${item.id}:expected-timing-invalid`);
    }
  });

  groupIds.forEach((groupId) => {
    const grouped = groupItems(groupId);
    const exitManifest = EXIT_GROUP_MANIFEST[groupId];
    const supportExitManifest = SUPPORT_ONLY_EXIT_GROUP_MANIFEST[groupId];
    if (exitManifest) {
      const familyIds = grouped
        .map((item) => getStimulus(item.stimulusId)?.familyId)
        .filter((familyId): familyId is string => Boolean(familyId));
      if (grouped.length !== exitManifest.expectedItemCount) {
        invalidIds.push(`exit:${groupId}:item-count-invalid`);
      }
      if (new Set(familyIds).size !== exitManifest.expectedItemCount) {
        invalidIds.push(`exit:${groupId}:families-not-distinct`);
      }
      if (
        !grouped.some((item) => item.stage.toLowerCase().includes('near')) ||
        !grouped.some((item) => item.stage.toLowerCase().includes('changed'))
      ) {
        invalidIds.push(`exit:${groupId}:near-changed-pair-invalid`);
      }
      grouped.forEach((item) => {
        const metadata = getItemMetadata(item);
        if (
          item.assistance !== 'A0' ||
          item.evidence !== 'instructional_exit' ||
          metadata.creditEligibility !== 'instructional_exit_candidate' ||
          metadata.hostKcId !== exitManifest.kcId ||
          metadata.primaryConstruct.type !== 'kc' ||
          metadata.primaryConstruct.id !== exitManifest.kcId
        ) {
          invalidIds.push(`exit:${groupId}:metadata:${item.id}:invalid`);
        }
      });
    } else if (supportExitManifest) {
      if (grouped.length !== supportExitManifest.expectedItemCount) {
        invalidIds.push(`support-exit:${groupId}:item-count-invalid`);
      }
      if (
        !grouped.some((item) => item.stage.toLowerCase().includes('exit')) ||
        new Set(
          grouped
            .map((item) => getStimulus(item.stimulusId)?.familyId)
            .filter((familyId): familyId is string => Boolean(familyId)),
        ).size !== supportExitManifest.expectedItemCount
      ) {
        invalidIds.push(`support-exit:${groupId}:families-invalid`);
      }
      grouped.forEach((item) => {
        const metadata = getItemMetadata(item);
        if (
          item.assistance !== 'A0' ||
          item.evidence !== 'instructional_exit' ||
          metadata.creditEligibility !== 'support_only' ||
          metadata.hostKcId !== supportExitManifest.hostKcId ||
          metadata.primaryConstruct.type !== 'kc' ||
          metadata.primaryConstruct.id !== supportExitManifest.primaryKcId ||
          metadata.supportArtifact !== supportExitManifest.supportArtifact
        ) {
          invalidIds.push(`support-exit:${groupId}:metadata:${item.id}:invalid`);
        }
      });
    } else {
      grouped.forEach((item) => {
        const metadata = getItemMetadata(item);
        if (
          item.evidence === 'instructional_exit' ||
          metadata.creditEligibility === 'instructional_exit_candidate'
        ) {
          invalidIds.push(`item:${item.id}:unmanifested-exit-metadata`);
        }
      });
    }
  });

  const stimuli = Array.from(
    new Map(
      items
        .map((item) => getStimulus(item.stimulusId))
        .filter((stimulus): stimulus is Stimulus => Boolean(stimulus))
        .map((stimulus) => [stimulus.id, stimulus]),
    ).values(),
  );
  const normalizedInvalidIds = Array.from(new Set(invalidIds));
  return {
    valid: normalizedInvalidIds.length === 0,
    invalidIds: normalizedInvalidIds,
    items,
    stimuli,
  };
}

function preflightInstructionalExit(kcId: KcId, groupId: string): ContentPreflightResult {
  const preflight = preflightContentGroups([groupId]);
  const exitManifest = EXIT_GROUP_MANIFEST[groupId];
  const invalidIds = [
    ...preflight.invalidIds,
    ...(!exitManifest
      ? [`exit:${groupId}:not-in-static-manifest`]
      : exitManifest.kcId !== kcId
        ? [`exit:${groupId}:host-kc-mismatch`]
        : []),
  ];
  const normalizedInvalidIds = Array.from(new Set(invalidIds));
  return {
    ...preflight,
    valid: normalizedInvalidIds.length === 0,
    invalidIds: normalizedInvalidIds,
  };
}

function annotationBorder(role: string, color: string): string {
  if (role.includes('Evidence')) return `3px double ${color}`;
  if (role.includes('Illustration')) return `2px dotted ${color}`;
  if (role.includes('Background')) return 'none';
  if (role.includes('Conclusion')) return `2px solid ${color}`;
  return `2px dashed ${color}`;
}

function StimulusView({
  stimulus,
  annotated = false,
  annotationLabels,
  learnerLabels = false,
}: {
  stimulus: Stimulus;
  annotated?: boolean;
  annotationLabels?: Record<string, string>;
  learnerLabels?: boolean;
}) {
  const theme = useHostTheme();
  return (
    <Stack gap={10}>
      <Row gap={8} align="center" wrap>
        <Text weight="semibold">{stimulus.title}</Text>
        <Pill size="sm">{stimulus.domain}</Pill>
      </Row>
      <div
        style={{
          background: theme.fill.quaternary,
          border: `1px solid ${theme.stroke.tertiary}`,
          borderRadius: 8,
          padding: 16,
        }}
      >
        <Stack gap={14}>
          {stimulus.paragraphs.map((paragraph, paragraphIndex) => (
            <div key={paragraph.id}>
              <Text size="small" tone="tertiary" weight="semibold">
                {learnerLabels ? `Paragraph ${paragraphIndex + 1}` : paragraph.id}
              </Text>
              <Stack gap={7} style={{ marginTop: 6 }}>
                {paragraph.sentences.map((sentence) => {
                  const annotation =
                    annotationLabels?.[sentence.id] ?? (annotated ? sentence.role : undefined);
                  const sentenceNumber = sentence.id.match(/\.S(\d+)$/)?.[1] ?? '?';
                  return (
                    <div
                      key={sentence.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(54px, auto) minmax(0, 1fr)',
                        columnGap: 8,
                        rowGap: 4,
                        alignItems: 'start',
                      }}
                    >
                      <Code>{learnerLabels ? `S${sentenceNumber}` : sentence.id}</Code>
                      <Text
                        as="span"
                        style={
                          annotation
                            ? {
                                borderBottom: annotationBorder(annotation, theme.stroke.focused),
                                paddingBottom: 2,
                              }
                            : undefined
                        }
                      >
                        {sentence.text}
                      </Text>
                      {annotation ? (
                        <Text size="small" tone="secondary" style={{ gridColumn: '2' }}>
                          {annotation}
                        </Text>
                      ) : null}
                    </div>
                  );
                })}
              </Stack>
            </div>
          ))}
        </Stack>
      </div>
    </Stack>
  );
}

function QuestionBlock({
  item,
  state,
  onSelect,
  onQueueHint,
  feedbackAvailable = true,
  readOnly = false,
}: {
  item: Item;
  state: LessonState;
  onSelect: (itemId: string, response: ResponseId) => void;
  onQueueHint: (itemId: string) => void;
  feedbackAvailable?: boolean;
  readOnly?: boolean;
}) {
  const theme = useHostTheme();
  const response = state.responses[item.id];
  const committed = state.committedGroups.includes(item.commitGroup);
  const showFeedback = committed && feedbackAvailable;
  const hintQueued = state.hintsQueued.includes(item.id);
  const creditEligibility = getItemMetadata(item).creditEligibility;
  const isCorrect = response === item.key;
  const responseRationale =
    response && response !== 'NS' && response !== 'OMIT' ? item.rationales[response] : '';
  const feedbackTitle = isCorrect
    ? 'Correct'
    : response === 'NS'
      ? 'Not sure recorded'
      : response === 'OMIT'
        ? 'Omission recorded'
        : 'Not yet';
  const learnerExplanation =
    item.id === 'k2-bridge-roles'
      ? 'The reported record is the source; the recommendation is the point it supports.'
      : item.explanation;
  const feedbackBody = isCorrect
    ? state.mode === 'learner'
      ? learnerExplanation
      : item.explanation
    : response === 'NS'
      ? '“Not sure” helps choose the right amount of support.'
      : response === 'OMIT'
        ? 'No answer was recorded. A fresh check will be used when one is needed.'
        : responseRationale;

  return (
    <Stack gap={10} style={{ paddingTop: 6 }}>
      {state.mode === 'reviewer' ? (
        <Row gap={8} align="center" wrap>
          <Pill size="sm">{item.assistance}</Pill>
          <Text size="small" tone="tertiary">
            {item.stage} · expected {item.expectedSeconds}s
          </Text>
        </Row>
      ) : null}
      {item.support ? (
        <div
          style={{
            borderLeft: `2px solid ${theme.stroke.focused}`,
            paddingLeft: 12,
          }}
        >
          <Text size="small" weight="semibold">
            A useful cue
          </Text>
          <Text size="small" tone="secondary">
            {state.mode === 'learner' && item.id === 'k3-local-support'
              ? 'Find the nearest earlier event that this phrase can name.'
              : state.mode === 'learner' && item.id === 'k2-bridge-roles'
                ? 'Label the reported basis and the recommendation before drawing an arrow.'
                : item.support}
          </Text>
        </div>
      ) : null}
      <div id={`${item.id}-stem`}>
        <Text weight="semibold">{item.stem}</Text>
      </div>
      <div role="radiogroup" aria-labelledby={`${item.id}-stem`}>
        <Stack gap={7}>
          {(Object.keys(item.choices) as ChoiceId[]).map((choiceId) => (
            <button
              key={choiceId}
              type="button"
              role="radio"
              aria-checked={response === choiceId}
              aria-label={`${choiceId}. ${item.choices[choiceId]}`}
              aria-describedby={showFeedback ? `${item.id}-feedback` : undefined}
              aria-disabled={committed || readOnly}
              data-radio-choice={choiceId}
              tabIndex={
                response === choiceId ||
                ((!response || response === 'NS' || response === 'OMIT') && choiceId === 'A')
                  ? 0
                  : -1
              }
              disabled={committed || readOnly}
              onClick={() => onSelect(item.id, choiceId)}
              onKeyDown={(event: {
                key: string;
                preventDefault: () => void;
                currentTarget: HTMLButtonElement;
              }) => {
                if (
                  committed ||
                  readOnly ||
                  !['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'].includes(event.key)
                ) {
                  return;
                }
                event.preventDefault();
                const order: ChoiceId[] = ['A', 'B', 'C', 'D'];
                const direction = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : -1;
                const nextChoice =
                  order[(order.indexOf(choiceId) + direction + order.length) % order.length];
                onSelect(item.id, nextChoice);
                const nextButton = event.currentTarget.parentElement?.querySelector(
                  `[data-radio-choice="${nextChoice}"]`,
                );
                if (nextButton instanceof HTMLElement) nextButton.focus();
              }}
              style={{
                width: '100%',
                textAlign: 'left',
                color: theme.text.primary,
                background: response === choiceId ? theme.fill.primary : theme.fill.quaternary,
                border: `1px solid ${
                  response === choiceId ? theme.stroke.focused : theme.stroke.tertiary
                }`,
                borderRadius: 6,
                padding: '9px 11px',
                cursor: committed || readOnly ? 'default' : 'pointer',
              }}
            >
              <strong>{choiceId}.</strong> {item.choices[choiceId]}
            </button>
          ))}
        </Stack>
      </div>
      <Row gap={8} align="center" wrap>
        <Button
          variant={response === 'NS' ? 'secondary' : 'ghost'}
          disabled={committed || readOnly}
          onClick={() => onSelect(item.id, 'NS')}
        >
          Not sure
        </Button>
        <Button
          variant="ghost"
          disabled={committed || hintQueued || readOnly}
          onClick={() => onQueueHint(item.id)}
        >
          {hintQueued ? 'Hint ready after submit' : 'Get a hint'}
        </Button>
        {hintQueued && !showFeedback ? (
          <Text size="small" tone="secondary">
            {committed
              ? 'The hint will appear when this set is submitted.'
              : creditEligibility === 'instructional_exit_candidate'
                ? 'This now counts as practice. Finish the set; a fresh final check will follow.'
                : 'Submit this passage set to see the hint and feedback.'}
          </Text>
        ) : null}
      </Row>
      {showFeedback ? (
        <div id={`${item.id}-feedback`} role="status" aria-live="polite" tabIndex={-1}>
          <Stack gap={8}>
            <div
              style={{
                borderLeft: `2px solid ${
                  isCorrect ? theme.stroke.focused : theme.stroke.secondary
                }`,
                paddingLeft: 12,
              }}
            >
              <Text weight="semibold">{feedbackTitle}</Text>
              <Text size="small" tone="secondary">
                {feedbackBody}
              </Text>
            </div>
            {hintQueued ? (
              <div>
                <Text size="small" weight="semibold">
                  Hint
                </Text>
                <Text size="small" tone="secondary">
                  {item.hint}
                </Text>
              </div>
            ) : null}
            {state.mode === 'reviewer' ? (
              <div
                style={{
                  borderLeft: `2px solid ${theme.stroke.secondary}`,
                  paddingLeft: 12,
                }}
              >
                <Text size="small" weight="semibold">
                  Choice-level review
                </Text>
                <Stack gap={4} style={{ marginTop: 6 }}>
                  {(Object.keys(item.choices) as ChoiceId[]).map((choiceId) => (
                    <div key={choiceId}>
                      <Text size="small" tone="secondary">
                        <strong>
                          {choiceId}
                          {choiceId === item.key ? ' · key' : ''}:
                        </strong>{' '}
                        {item.rationales[choiceId]}
                      </Text>
                    </div>
                  ))}
                </Stack>
              </div>
            ) : null}
          </Stack>
        </div>
      ) : null}
    </Stack>
  );
}

function ActivityGroup({
  groupId,
  state,
  onSelect,
  onQueueHint,
  onCommit,
  onInvalid,
  title,
  suppressFeedback = false,
  readOnly = false,
}: {
  groupId: string;
  state: LessonState;
  onSelect: (itemId: string, response: ResponseId) => void;
  onQueueHint: (itemId: string) => void;
  onCommit: (groupId: string) => void;
  onInvalid: (groupId: string, invalidIds: string[]) => void;
  title?: string;
  suppressFeedback?: boolean;
  readOnly?: boolean;
}) {
  const items = groupItems(groupId);
  if (state.retiredGroups.includes(groupId)) {
    return (
      <Stack gap={10}>
        {title ? <H3>{title}</H3> : null}
        {state.mode === 'reviewer' ? (
          <Callout tone="warning" title="Failed family retired">
            <Code>{groupId}</Code> failed in an earlier run and remains permanently closed. This
            Canvas embeds no verified replacement manifest or local reset; the branch is terminal
            here.
          </Callout>
        ) : (
          <Callout tone="warning" title="A fresh set is needed">
            This question set is closed. Ask for a new set before continuing.
          </Callout>
        )}
      </Stack>
    );
  }
  const preflight = preflightContentGroups([groupId]);
  if (!preflight.valid) {
    return (
      <Stack gap={10}>
        {title ? <H3>{title}</H3> : null}
        {state.mode === 'reviewer' ? (
          <>
            <Callout tone="danger" title="Invalid item blocked">
              This activity failed closed because its item or stimulus reference is invalid. No
              anchor fallback, response, penalty, or evidence is allowed. A statically reviewed
              replacement manifest/hash is required externally; that resolver is not implemented
              here.
            </Callout>
            <Text size="small" tone="secondary">
              Invalid references: {preflight.invalidIds.join(', ')}
            </Text>
          </>
        ) : (
          <Callout tone="danger" title="This question is unavailable">
            Stop here and ask for a refreshed lesson set.
          </Callout>
        )}
        {!readOnly ? (
          <Button variant="primary" onClick={() => onInvalid(groupId, preflight.invalidIds)}>
            Stop this lesson safely
          </Button>
        ) : null}
      </Stack>
    );
  }
  const stimulusIds = Array.from(new Set(items.map((item) => item.stimulusId)));
  const committed = state.committedGroups.includes(groupId);
  const allAnswered = items.every((item) => Boolean(state.responses[item.id]));
  const shared = items.length > 1;

  return (
    <Stack gap={14}>
      {title ? <H3>{title}</H3> : null}
      {shared && !committed ? (
        <Text size="small" tone="secondary">
          <strong>Answer as one set:</strong> answer both questions before feedback appears.
        </Text>
      ) : null}
      {committed && suppressFeedback ? (
        <Text size="small" tone="secondary">
          Finish the next short question to see feedback.
        </Text>
      ) : null}
      {stimulusIds.length === 1 ? (
        <StimulusView
          stimulus={getStimulus(stimulusIds[0])!}
          learnerLabels={state.mode === 'learner'}
        />
      ) : null}
      {items.map((item, index) => (
        <div key={item.id}>
          {stimulusIds.length > 1 ? (
            <StimulusView
              stimulus={getStimulus(item.stimulusId)!}
              learnerLabels={state.mode === 'learner'}
            />
          ) : null}
          {index > 0 ? <Divider style={{ marginTop: 14, marginBottom: 14 }} /> : null}
          <QuestionBlock
            item={item}
            state={state}
            onSelect={onSelect}
            onQueueHint={onQueueHint}
            feedbackAvailable={!suppressFeedback}
            readOnly={readOnly}
          />
        </div>
      ))}
      <Row gap={8} align="center" wrap>
        <Button
          variant="primary"
          disabled={committed || readOnly}
          onClick={() => onCommit(groupId)}
        >
          {committed
            ? 'Submitted'
            : !allAnswered
              ? 'Skip and submit'
              : shared
                ? 'Submit both answers'
                : 'Submit answer'}
        </Button>
        {!allAnswered && !committed ? (
          <Text size="small" tone="tertiary">
            A blank answer will be recorded as skipped.
          </Text>
        ) : null}
        {readOnly ? (
          <Text size="small" tone="tertiary">
            Earlier lesson step: answers cannot be changed.
          </Text>
        ) : null}
      </Row>
    </Stack>
  );
}

function RouteDose({ kcId, route }: { kcId: KcId; route: Route }) {
  const needsExtraFocus =
    route === 'misconception' || route === 'prerequisite-support' || route === 'local-support';
  const copy =
    kcId === KC1
      ? needsExtraFocus
        ? 'Keep reports and examples separate: evidence tells what was observed; an illustration gives a case that helps you picture an idea.'
        : 'Track three jobs: the point being supported, the reported basis, and the reason that connects them.'
      : kcId === KC2
        ? needsExtraFocus
          ? 'Name what each sentence does before naming the arrow between them.'
          : 'Keep the sentence’s job separate from the relation between two sentences.'
        : needsExtraFocus
          ? 'Cover the transition word, then match the exact source, target, and missing bridge.'
          : 'A transition can announce a link, but only the passage can supply it.';
  return (
    <Callout tone={needsExtraFocus ? 'warning' : 'info'} title="Focus now">
      {copy}
    </Callout>
  );
}

function ExpertModel({ kcId, route }: { kcId: KcId; route: Route }) {
  if (kcId === KC1) {
    return (
      <Stack gap={14}>
        <RouteDose kcId={kcId} route={route} />
        <H3>See how the pieces connect</H3>
        <Text>
          A <strong>claim</strong> is a point the author asks you to accept.
          <strong> Evidence</strong> reports what was observed. A<strong> warrant</strong> explains
          why that evidence bears on the claim.
        </Text>
        <StimulusView
          stimulus={ANCHOR}
          learnerLabels
          annotationLabels={{
            'A.P1.S3': 'Claim / conclusion — the point being supported',
            'A.P1.S4': 'Evidence — the reported observation',
            'A.P2.S5': 'Warrant — why the observation supports the claim',
          }}
        />
        <H3>Think aloud</H3>
        <Text tone="secondary">
          “S3 makes the point. S4 reports what visitors wrote, so it is evidence. S5 explains why
          weight changes attention, so it connects that evidence to the claim. I can now trace S4 →
          S5 → S3.”
        </Text>
      </Stack>
    );
  }
  if (kcId === KC2) {
    return (
      <Stack gap={14}>
        <RouteDose kcId={kcId} route={route} />
        <H3>See how the pieces connect</H3>
        <Text>
          A <strong>role</strong> names one sentence’s job. A<strong> relation</strong> names what
          the arrow between two labeled pieces does: supports, narrows, challenges, or grants.
        </Text>
        <StimulusView
          stimulus={ANCHOR}
          learnerLabels
          annotationLabels={{
            'A.P1.S3': 'Target claim',
            'A.P2.S7': 'Qualification — narrows the target without rejecting it',
            'A.P2.S8': 'Support — gives a reason for the qualification',
          }}
        />
        <H3>Think aloud</H3>
        <Text tone="secondary">
          “S7 does not reject S3. It limits what touch can recover, so the arrow from S7 to S3 is
          qualification. S8 then supports that limit with examples of what a replica cannot reveal.”
        </Text>
      </Stack>
    );
  }
  const linkStimulus = getStimulus('cars-l386-k3-entry-01')!;
  return (
    <Stack gap={14}>
      <RouteDose kcId={kcId} route={route} />
      <H3>See how the pieces connect</H3>
      <Text>
        Name the source and target, cover the transition, and say the missing “because” sentence. If
        the passage cannot supply it, the link is only asserted.
      </Text>
      <StimulusView
        stimulus={linkStimulus}
        learnerLabels
        annotationLabels={{
          'K3E.P1.S1': 'Source — listeners cannot search names',
          'K3E.P1.S2': 'Target — searchable transcripts answer that problem',
          'K3E.P2.S3': 'Source — listeners want shorter clips',
          'K3E.P2.S4': 'Target — captions solve a different problem',
        }}
      />
      <H3>Think aloud</H3>
      <Text tone="secondary">
        “Searchable transcripts address name-searching, so the first link has a bridge. Shorter
        clips do not explain captions, so ‘Therefore’ cannot create the second link.”
      </Text>
    </Stack>
  );
}

function ReviewerView({
  state,
  setTab,
}: {
  state: LessonState;
  setTab: (tab: ReviewerTab) => void;
}) {
  const theme = useHostTheme();
  const staticManifestPreflight = preflightContentGroups(
    Array.from(new Set(ITEMS.map((item) => item.commitGroup))),
  );
  const tabs: Array<{ id: ReviewerTab; label: string }> = [
    { id: 'manifest', label: 'Manifest' },
    { id: 'content', label: 'All content' },
    { id: 'maps', label: 'Maps & provenance' },
    { id: 'evidence', label: 'Evidence & events' },
    { id: 'qa', label: 'QA' },
  ];

  return (
    <Stack gap={18}>
      <Row gap={8} wrap>
        {tabs.map((tab) => (
          <div key={tab.id}>
            <Pill active={state.reviewerTab === tab.id} onClick={() => setTab(tab.id)}>
              {tab.label}
            </Pill>
          </div>
        ))}
      </Row>
      {state.reviewerTab === 'manifest' ? (
        <Stack gap={16}>
          <H2>Canonical manifest</H2>
          <Table headers={['Entity', 'ID', 'Contract']} rows={MANIFEST_ROWS} striped />
          <Callout tone="info" title="Active run contract">
            Run <Code>{state.runId}</Code> binds content version{' '}
            <Code>{state.runContentVersion}</Code>. KC2 presents and commits the KC1 role probe
            alone, resolves V3-EDG-971610 when needed, and only then presents the fresh
            relation-routing family.
          </Callout>
          <Callout tone="warning" title="Capstone boundary">
            V3-CAP-027756 “Reconstruct and Evaluate the Argument as a Whole” is referenced but never
            attempted or completed here. It is owned by V3-LES-269427 and placed later by
            R14-CAP-027756.
          </Callout>
          <H3>Graph neighborhood</H3>
          <Text>
            V3-EDG-971610 is the hard KC1 → KC2 point-of-use edge. V3-EDG-348787 marks role and
            relation as confusable. V3-EDG-192746 blocks only the later unscaffolded capstone point.
            V3-EDG-441457 and V3-EDG-916802 are nonblocking co-development records.
          </Text>
          <H3>Durations and checkpoints</H3>
          <Grid columns="repeat(auto-fit, minmax(min(100%, 180px), 1fr))" gap={12}>
            <Stat value="14–16m" label="KC1 standard core" />
            <Stat value="15–17m" label="KC2 standard core" />
            <Stat value="14–16m" label="KC3 standard core" />
            <Stat value="2" label="Maximum repair cycles" />
          </Grid>
          <Text tone="secondary">
            Checkpoints: entry committed → model seen → orient committed → A2 → A1 → A0 → contrast →
            exit pack → repair or exited. Learner practice levels occupy separate screens; every
            checkpoint remains resumable.
          </Text>
        </Stack>
      ) : null}
      {state.reviewerTab === 'content' ? (
        <Stack gap={16}>
          <H2>Complete passage and item inventory</H2>
          <Text tone="secondary">
            Keys and rationales shown here are reviewer-only. Learner mode reveals them only after
            each complete commit group closes.
          </Text>
          {[KC1, KC2, KC3].map((kcId) => {
            const items = ITEMS.filter((item) => item.kcId === kcId);
            return (
              <div key={kcId}>
                <CollapsibleSection
                  title={`${kcId} · ${kcId === KC1 ? 'Element roles' : kcId === KC2 ? 'Argument relations' : 'Apparent links'}`}
                  count={items.length}
                  defaultOpen={kcId === KC1}
                >
                  <Stack gap={12}>
                    {items.map((item) => {
                      const stimulus = getStimulus(item.stimulusId);
                      const metadata = getItemMetadata(item);
                      return (
                        <div key={item.id}>
                          <CollapsibleSection
                            title={`${item.id} · ${item.stage}`}
                            trailing={<Code>{item.key}</Code>}
                          >
                            <Stack gap={10}>
                              {stimulus ? (
                                <StimulusView stimulus={stimulus} />
                              ) : (
                                <Callout tone="danger" title="Invalid reference blocked">
                                  {item.stimulusId} does not resolve. This item is invalid and
                                  cannot fall back to another passage.
                                </Callout>
                              )}
                              <Text weight="semibold">{item.stem}</Text>
                              {item.support ? (
                                <Text size="small" tone="secondary">
                                  Pre-response support: {item.support}
                                </Text>
                              ) : null}
                              {(Object.keys(item.choices) as ChoiceId[]).map((choiceId) => (
                                <div key={choiceId}>
                                  <Text size="small">
                                    <strong>
                                      {choiceId}
                                      {choiceId === item.key ? ' · key' : ''}:
                                    </strong>{' '}
                                    {item.choices[choiceId]} — {item.rationales[choiceId]}
                                  </Text>
                                </div>
                              ))}
                              <Text size="small" tone="secondary">
                                Feedback: {item.explanation}
                              </Text>
                              <Text size="small" tone="secondary">
                                Hint: {item.hint}
                              </Text>
                              <Text size="small" tone="tertiary">
                                {item.commitGroup} · {item.assistance} · {item.evidence} ·{' '}
                                {stimulus?.familyId ?? 'invalid_family_reference'}
                              </Text>
                              <Text size="small" tone="tertiary">
                                host KC: {metadata.hostKcId} · primary construct:{' '}
                                {metadata.primaryConstruct.type}:{metadata.primaryConstruct.id} ·
                                support artifact: {metadata.supportArtifact ?? 'none'} · credit:{' '}
                                {metadata.creditEligibility === 'instructional_exit_candidate'
                                  ? 'simulation_only_never_untouched'
                                  : metadata.creditEligibility}{' '}
                                · timing: {item.expectedSeconds * 1000} ms expected
                              </Text>
                            </Stack>
                          </CollapsibleSection>
                        </div>
                      );
                    })}
                  </Stack>
                </CollapsibleSection>
              </div>
            );
          })}
        </Stack>
      ) : null}
      {state.reviewerTab === 'maps' ? (
        <Stack gap={16}>
          <H2>Argument maps and provenance</H2>
          <Callout tone="success" title="Original clean-room candidate">
            Every passage was authored de novo for this internal prototype. All institutions,
            reports, and observations are fictional. No protected passage or item was copied,
            adapted, paraphrased, or used as a distractor template.
          </Callout>
          {STIMULI.map((stimulus) => (
            <div key={stimulus.id}>
              <CollapsibleSection title={stimulus.title} trailing={<Code>{stimulus.id}</Code>}>
                <Stack gap={8}>
                  <StimulusView stimulus={stimulus} annotated />
                  <Text size="small" weight="semibold">
                    Reviewer map
                  </Text>
                  <Text size="small" tone="secondary">
                    {stimulus.map}
                  </Text>
                  <Text size="small" tone="tertiary">
                    Family: {stimulus.familyId} · origin: original_clean_room_candidate ·
                    AI-assisted: true · rights: internal prototype pending independent review
                  </Text>
                </Stack>
              </CollapsibleSection>
            </div>
          ))}
          <H3>Sources</H3>
          <Stack gap={6}>
            {SOURCES.map((source) => (
              <div key={source}>
                <Text size="small" tone="secondary">
                  {source}
                </Text>
              </div>
            ))}
          </Stack>
        </Stack>
      ) : null}
      {state.reviewerTab === 'evidence' ? (
        <Stack gap={16}>
          <H2>Evidence and event semantics</H2>
          <Callout tone="info" title="Eligibility boundary">
            Entry is routing evidence. Models, fading, hints, and repairs are instructional
            telemetry. Exit packs carry candidate metadata, but every Canvas path normalizes them to
            simulation-only eligibility and can emit only kc_instructional_exit_simulated. Nothing
            here creates independent, transfer, retained, timed, protected, mastery, capstone, or
            readiness evidence.
          </Callout>
          <Text>
            Exposure follows each family. A queued hint contaminates an A0 exit response. Linked
            questions are locally dependent. The first submitted response remains the recorded
            attempt.
          </Text>
          <Callout tone="warning" title="Canvas simulation and reviewer exposure">
            This entire Canvas is internal simulation, even before reviewer access. Reviewer mode
            additionally exposes every key and rationale and appends an internal_review_key_access
            exposure. No family is treated as untouched production evidence.
          </Callout>
          {state.reentryTarget ? (
            <Callout tone="info" title="Persisted hard-edge reentry target">
              {state.reentryTarget.version} · {state.reentryTarget.edgeId} · source{' '}
              {state.reentryTarget.sourceKcId} · host {state.reentryTarget.hostKcId} · return{' '}
              {state.reentryTarget.returnScreen} · require{' '}
              {state.reentryTarget.requiredReplacementGroup} · run{' '}
              {state.reentryTarget.createdInRunId}
            </Callout>
          ) : null}
          {state.retiredGroups.length > 0 ? (
            <Callout tone="warning" title="Permanently retired families">
              {state.retiredGroups.join(', ')}. This Canvas has no local reset. Replacement requires
              a statically reviewed external manifest, non-null reviewed hash, and distinct family
              IDs.
            </Callout>
          ) : null}
          <H3>Event dictionary</H3>
          <Table headers={['Event', 'Meaning', 'Eligibility']} rows={EVENT_DICTIONARY} striped />
          <Callout tone="info" title="Normalized expected timing contract">
            {EXPECTED_TIMING_ENVELOPE.contractVersion} contains normative expected durations in
            milliseconds only. Core concise shell before increments: 36–42 minutes. Core standard
            shell before increments: 43–49 minutes. Activated misconception, prerequisite-support,
            or local-support routes add 3 minutes per KC. Initial hard-edge bridge adds 3 minutes;
            dedicated repair/reentry adds 8; local support plus confirmation adds 4. Each successful
            repair cycle attempted adds 5 minutes per KC. Two transitions add 2 minutes total, and
            one non-enforced break allowance adds 5. Worst valid branch: 110 minutes. V3-CAP-027756
            is excluded.
          </Callout>
          <Callout tone="neutral" title="Observed timing not implemented">
            This Canvas does not measure foreground, wall-clock, monotonic, or response latency.
            Observed timing is outside the implemented scope; no event claims an observed duration.
          </Callout>
          <Table
            headers={['Expected timing component', 'Normalized milliseconds']}
            rows={[
              [
                'Concise three-KC shell total',
                `${EXPECTED_TIMING_ENVELOPE.shellTotals.concise.minMs}–${EXPECTED_TIMING_ENVELOPE.shellTotals.concise.maxMs}`,
              ],
              [
                'Standard three-KC shell total',
                `${EXPECTED_TIMING_ENVELOPE.shellTotals.standard.minMs}–${EXPECTED_TIMING_ENVELOPE.shellTotals.standard.maxMs}`,
              ],
              [
                'Misconception route increment / activated KC',
                String(EXPECTED_TIMING_ENVELOPE.routeIncrementsPerActivatedKc.misconception),
              ],
              [
                'Prerequisite-support route increment / activated KC',
                String(EXPECTED_TIMING_ENVELOPE.routeIncrementsPerActivatedKc.prerequisiteSupport),
              ],
              [
                'Local-support route increment / activated KC',
                String(EXPECTED_TIMING_ENVELOPE.routeIncrementsPerActivatedKc.localSupport),
              ],
              [
                'Initial hard-edge bridge',
                String(EXPECTED_TIMING_ENVELOPE.recoveryIncrements.initialHardEdgeBridge),
              ],
              [
                'Dedicated hard-edge repair and reentry',
                String(
                  EXPECTED_TIMING_ENVELOPE.recoveryIncrements.dedicatedHardEdgeRepairAndReentry,
                ),
              ],
              [
                'Local support and confirmation',
                String(EXPECTED_TIMING_ENVELOPE.recoveryIncrements.localSupportAndConfirmation),
              ],
              [
                'Attempted repair cycle / KC',
                String(EXPECTED_TIMING_ENVELOPE.repairIncrements.perAttemptedCyclePerKc),
              ],
              [
                'Two KC transitions',
                String(
                  EXPECTED_TIMING_ENVELOPE.transitionsAndBreaks.betweenKcTransitionCount *
                    EXPECTED_TIMING_ENVELOPE.transitionsAndBreaks.perTransitionMs,
                ),
              ],
              [
                'One normative break allowance (not enforced)',
                String(EXPECTED_TIMING_ENVELOPE.transitionsAndBreaks.perBreakMs),
              ],
              ['Worst valid branch', String(EXPECTED_TIMING_ENVELOPE.worstValidBranch.totalMs)],
              ['V3-CAP-027756', 'excluded'],
            ]}
            striped
          />
          <Text size="small" tone="tertiary">
            Worst-valid formula: {EXPECTED_TIMING_ENVELOPE.worstValidBranch.formula}. Terminal pause
            time is excluded.
          </Text>
          {state.events.length > 0 ? (
            <>
              <H3>Append-only typed events</H3>
              <Table
                headers={[
                  'Envelope',
                  'Event ID',
                  'Run',
                  'Type',
                  'Runtime',
                  'Screen',
                  'Typed payload',
                  'Typed credit',
                  'Expected ms',
                  'Observed',
                ]}
                rows={state.events.map((event) => [
                  event.envelopeVersion,
                  event.eventId,
                  event.runId,
                  event.type,
                  event.runtimeContext,
                  SCREEN_LABELS[event.screenId] ?? event.screenId,
                  JSON.stringify(event.payload),
                  event.creditEligibility ?? 'none',
                  event.expectedTiming.itemExpectedDurationMs === null
                    ? 'n/a'
                    : String(event.expectedTiming.itemExpectedDurationMs),
                  event.expectedTiming.observedTimingStatus,
                ])}
                striped
              />
            </>
          ) : null}
          {state.exposures.length > 0 ? (
            <>
              <H3>Append-only exposure envelope</H3>
              <Table
                headers={[
                  'Envelope',
                  'Exposure ID',
                  'Run',
                  'Content',
                  'Class',
                  'Families',
                  'Items',
                  'Eligibility',
                ]}
                rows={state.exposures.map((exposure) => [
                  exposure.envelopeVersion,
                  exposure.exposureId,
                  exposure.runId,
                  exposure.contentVersion,
                  exposure.exposureClass,
                  String(exposure.familyIds.length),
                  String(exposure.itemIds.length),
                  exposure.creditEligibility ?? 'null / no credit',
                ])}
                striped
              />
            </>
          ) : null}
          <H3>Required decision context</H3>
          <Text tone="secondary">
            Implemented in envelope v4: global and per-run sequence, run and event IDs, registry
            SHA, graph and sequence freezes, content and policy versions, exact
            phase/module/module-event/lesson ordinals, actor mode, internal-simulation runtime
            context, screen, typed lifecycle event, typed primary construct, host KC, support
            artifact, metadata-derived credit eligibility, normalized expected milliseconds,
            reviewed hash state, and explicit unimplemented fields. Shell, KC lifecycle,
            presentation, attempt, routing, invalid-content, exit, completion, pause, and reentry
            contexts use discriminated typed payloads; family/item exposure is bound in exposure
            envelope v3.
          </Text>
          <Callout tone="neutral" title="Explicitly unimplemented prototype fields">
            Wall-clock timestamp, observed timing, and signed actor identity are not implemented.
            Every event carries those exact names in unimplementedFields. No observed-duration or
            clock-policy field is emitted. The reviewed-content hash remains null pending
            independent approval.
          </Callout>
        </Stack>
      ) : null}
      {state.reviewerTab === 'qa' ? (
        <Stack gap={16}>
          <H2>Accessibility, branch tests, and QA</H2>
          <H3>Accessibility contract</H3>
          <Text>
            Sentence IDs remain visible and screen-reader addressable. Annotation styles use solid
            underline for conclusions, double underline for evidence, dotted underline for
            illustrations, and no underline for background; every style also includes an explicit
            role text label. Every arrow has a text equivalent such as “S2 supports S4.” Responses
            use native buttons with radio semantics. Navigation, hints, commitment, and mode
            switching are keyboard operable. No information depends on color, motion, or pointer
            position. Historical content remains in the accessibility tree inside a disabled
            fieldset while every descendant control is noninteractive.
          </Text>
          <H3>Branch acceptance tests</H3>
          <ol style={{ margin: 0, paddingLeft: 22, color: theme.text.secondary }}>
            {BRANCH_TESTS.map((test) => (
              <li key={test} style={{ marginBottom: 6 }}>
                {test}
              </li>
            ))}
          </ol>
          <H3>Visible-content preflight</H3>
          <Callout
            tone={staticManifestPreflight.valid ? 'success' : 'danger'}
            title={
              staticManifestPreflight.valid
                ? 'Embedded manifest passes structural preflight'
                : 'Embedded manifest fails structural preflight'
            }
          >
            Before any presentation event or exposure, every visible group must resolve unique item,
            stimulus, and family IDs; valid sentence structure; an exact construct discriminator and
            ID; recognized credit eligibility; positive expected timing; governed-operation support
            binding; and static exit-manifest metadata. Any failure transitions to blocked with null
            eligibility.{' '}
            {staticManifestPreflight.valid
              ? `${staticManifestPreflight.items.length} items and ${staticManifestPreflight.stimuli.length} stimuli validated.`
              : `Invalid IDs: ${staticManifestPreflight.invalidIds.join(', ')}.`}
          </Callout>
          <H3>Publication rubric</H3>
          <ol style={{ margin: 0, paddingLeft: 22, color: theme.text.secondary }}>
            {QA_RUBRIC.map((criterion) => (
              <li key={criterion} style={{ marginBottom: 6 }}>
                {criterion}
              </li>
            ))}
          </ol>
          <Callout tone="warning" title="Approval requirements">
            Author, blind solver, and final approver must be different people. Publication also
            requires content, CARS/reasoning, accessibility, rights, similarity, bias, and subgroup
            review bound to the exact reviewed-content hash.
          </Callout>
          <H3>Replacement-content boundary</H3>
          <Callout tone="warning" title="Required capability not implemented">
            This Canvas has no local reset or replacement-version authorization. A blocked or
            retired family may resume only after an external planner supplies a statically reviewed
            manifest, non-null reviewed hash, and distinct family IDs, and the host verifies that
            binding. That resolver is outside this Canvas’s implemented scope.
          </Callout>
        </Stack>
      ) : null}
    </Stack>
  );
}

interface ArgumentStructureLessonCanvasProps {
  reviewMode: boolean;
}

export default function ArgumentStructureLessonCanvas({
  reviewMode,
}: ArgumentStructureLessonCanvasProps) {
  const theme = useHostTheme();
  const [state, setState] = useCanvasState<LessonState>(
    'argument-structure-lesson-state-v5',
    INITIAL_STATE,
  );
  const requestedMode: Mode = reviewMode ? 'reviewer' : 'learner';
  const activeState = state.mode === requestedMode ? state : { ...state, mode: requestedMode };
  const reviewReady = reviewMode && state.mode === 'reviewer' && state.reviewerKeysExposed;
  const screenFocusRef = useRef<HTMLFieldSetElement>(null);

  const makeEvent = <Type extends LessonEventType>(
    current: LessonState,
    type: Type,
    payload: LessonEventPayloadMap[Type],
    options: {
      screenId?: string;
      offset?: number;
      expectedSeconds?: number;
      creditEligibility?: CreditEligibility | null;
    } = {},
  ): LessonEvent => {
    const screenId = options.screenId ?? current.currentScreen;
    const offset = options.offset ?? 1;
    const sequence = current.events.length + offset;
    const runSequence =
      current.events.filter((event) => event.runId === current.runId).length + offset;
    return {
      envelopeVersion: EVENT_ENVELOPE_VERSION,
      eventId: `${current.runId}-event-${runSequence}`,
      runId: current.runId,
      sequence,
      runSequence,
      prototypeOrder: `append-only-sequence:${sequence}`,
      type,
      screenId,
      payload,
      creditEligibility: options.creditEligibility ?? null,
      registrySha: REGISTRY_SHA,
      graphFreeze: GRAPH_FREEZE,
      sequenceFreeze: SEQUENCE_FREEZE,
      phaseId: 'V3-PHS-935127',
      moduleId: 'V3-MOD-326514',
      moduleEventOrdinal: 1,
      lessonOrdinal: 87,
      contentVersion: current.runContentVersion,
      policyVersion: POLICY_VERSION,
      reviewedContentHash: null,
      reviewedContentHashStatus: 'pending_independent_review',
      actorMode: current.mode,
      simulationMode: true,
      runtimeContext: CANVAS_RUNTIME_CONTEXT,
      runStatus: current.runStatus,
      expectedTiming: {
        contractVersion: EXPECTED_TIMING_ENVELOPE.contractVersion,
        normalizedUnit: 'milliseconds',
        itemExpectedDurationMs:
          options.expectedSeconds === undefined ? null : options.expectedSeconds * 1000,
        observedTimingStatus: 'outside_canvas_scope_not_implemented',
      },
      unimplementedFields: ['wallClockTimestamp', 'observedTiming', 'signedActorIdentity'],
    } as LessonEvent;
  };

  const addEvent = <Type extends LessonEventType>(
    current: LessonState,
    type: Type,
    payload: LessonEventPayloadMap[Type],
    options: {
      screenId?: string;
      expectedSeconds?: number;
      creditEligibility?: CreditEligibility | null;
    } = {},
  ): LessonEvent[] => [...current.events, makeEvent(current, type, payload, options)];

  const canMutateRun = (current: LessonState): boolean =>
    current.runStatus === 'active' && current.currentScreen === current.activeScreen;

  const blockInvalidContentState = (
    current: LessonState,
    sourceScreen: string,
    invalidIds: string[],
    reason: LessonEventPayloadMap['invalid_content_blocked']['reason'] = 'visible_content_preflight_failed',
  ): LessonState => {
    const normalizedInvalidIds = Array.from(new Set(invalidIds));
    const invalidItems = ITEMS.filter((item) => normalizedInvalidIds.includes(item.id));
    const invalidStimuli = STIMULI.filter((stimulus) => normalizedInvalidIds.includes(stimulus.id));
    const exposure: ExposureRecord = {
      envelopeVersion: EXPOSURE_ENVELOPE_VERSION,
      exposureId: `${current.runId}-exposure-${current.exposures.length + 1}`,
      runId: current.runId,
      sequence: current.exposures.length + 1,
      actorMode: current.mode,
      contentVersion: current.runContentVersion,
      policyVersion: POLICY_VERSION,
      reviewedContentHash: null,
      reviewedContentHashStatus: 'pending_independent_review',
      stimulusIds: invalidStimuli.map((stimulus) => stimulus.id),
      familyIds: invalidStimuli.map((stimulus) => stimulus.familyId),
      itemIds: invalidItems.map((item) => item.id),
      exposureClass: 'invalid_content_block',
      creditEligibility: null,
      detail: `Invalid content blocked at ${sourceScreen}: ${normalizedInvalidIds.join(', ')}`,
    };
    const blockedState: LessonState = {
      ...current,
      runStatus: 'blocked',
      pausedAt: invalidItems.length > 0 ? getItemMetadata(invalidItems[0]).hostKcId : null,
      pausedReason:
        'Invalid item, group, or stimulus content was detected. No response or fallback is permitted.',
      blockedInvalidIds: Array.from(
        new Set([...current.blockedInvalidIds, ...normalizedInvalidIds]),
      ),
      currentScreen: 'blocked',
      activeScreen: 'blocked',
      reached: current.reached.includes('blocked')
        ? current.reached
        : [...current.reached, 'blocked'],
      announcement: 'This lesson step is unavailable. Ask for a refreshed set.',
      exposures: [...current.exposures, exposure],
    };
    return {
      ...blockedState,
      events: [
        ...current.events,
        makeEvent(
          blockedState,
          'invalid_content_blocked',
          {
            sourceScreenId: sourceScreen,
            invalidIds: normalizedInvalidIds,
            transition: 'blocked',
            reason,
          },
          {
            screenId: sourceScreen,
            offset: 1,
            creditEligibility: null,
          },
        ),
        makeEvent(
          blockedState,
          'screen_activated',
          {
            activatedScreenId: 'blocked',
            reason: `invalid content from ${sourceScreen}`,
            mutable: false,
          },
          {
            screenId: 'blocked',
            offset: 2,
            creditEligibility: null,
          },
        ),
      ],
    };
  };

  const appendPresentationLifecycle = (
    current: LessonState,
    screenId: string,
    reason: string,
  ): LessonState => {
    const visibleGroups = visibleGroupIdsForScreen(screenId, current).filter(
      (groupId) => !current.retiredGroups.includes(groupId),
    );
    const preflight = preflightContentGroups(visibleGroups);
    const explicitStimulusIds = STATIC_SCREEN_STIMULI[screenId] ?? [];
    const missingExplicitStimulusIds = explicitStimulusIds.filter(
      (stimulusId) => !getStimulus(stimulusId),
    );
    if (!preflight.valid || missingExplicitStimulusIds.length > 0) {
      return blockInvalidContentState(
        current,
        screenId,
        [
          ...preflight.invalidIds,
          ...missingExplicitStimulusIds.map((stimulusId) => `stimulus:${stimulusId}:missing`),
        ],
        'visible_content_preflight_failed',
      );
    }

    const deduplicatedItems = preflight.items;
    const newlyPresentedItems = deduplicatedItems.filter(
      (item) => !current.presentedItemIds.includes(item.id),
    );
    const stimuli = Array.from(
      new Map(
        [
          ...preflight.stimuli,
          ...explicitStimulusIds.map((stimulusId) => getStimulus(stimulusId)!),
        ].map((stimulus) => [stimulus.id, stimulus]),
      ).values(),
    );
    const newlyPresentedStimuli = stimuli.filter(
      (stimulus) => !current.presentedStimulusIds.includes(stimulus.id),
    );
    if (newlyPresentedItems.length === 0 && newlyPresentedStimuli.length === 0) {
      return current;
    }

    const stimulusEvents = newlyPresentedStimuli.map((stimulus, index) =>
      makeEvent(
        current,
        'stimulus_presented',
        {
          stimulusId: stimulus.id,
          familyId: stimulus.familyId,
          reason,
        },
        {
          screenId,
          offset: index + 1,
          creditEligibility: null,
        },
      ),
    );
    const itemEvents = newlyPresentedItems.map((item, index) => {
      const metadata = getItemMetadata(item);
      const eligibility = effectiveCreditEligibility(item);
      const stimulus = getStimulus(item.stimulusId)!;
      return makeEvent(
        current,
        'item_presented',
        {
          itemId: item.id,
          stimulusId: stimulus.id,
          familyId: stimulus.familyId,
          commitGroup: item.commitGroup,
          hostKcId: metadata.hostKcId,
          primaryConstruct: metadata.primaryConstruct,
          supportArtifact: metadata.supportArtifact,
          assistance: item.assistance,
          eligibility,
          reason,
        },
        {
          screenId,
          offset: stimulusEvents.length + index + 1,
          expectedSeconds: item.expectedSeconds,
          creditEligibility: eligibility,
        },
      );
    });
    const exposureItems = newlyPresentedItems.length > 0 ? newlyPresentedItems : deduplicatedItems;
    const exposure: ExposureRecord = {
      envelopeVersion: EXPOSURE_ENVELOPE_VERSION,
      exposureId: `${current.runId}-exposure-${current.exposures.length + 1}`,
      runId: current.runId,
      sequence: current.exposures.length + 1,
      actorMode: current.mode,
      contentVersion: current.runContentVersion,
      policyVersion: POLICY_VERSION,
      reviewedContentHash: null,
      reviewedContentHashStatus: 'pending_independent_review',
      stimulusIds: newlyPresentedStimuli.map((stimulus) => stimulus.id),
      familyIds: newlyPresentedStimuli.map((stimulus) => stimulus.familyId),
      itemIds: newlyPresentedItems.map((item) => item.id),
      exposureClass: 'learner_item_presentation',
      creditEligibility:
        exposureItems.length > 0 ? aggregateCreditEligibility(exposureItems) : 'instruction_only',
      detail: `Deduplicated presentation on ${screenId}: ${reason}`,
    };
    return {
      ...current,
      presentedItemIds: [
        ...current.presentedItemIds,
        ...newlyPresentedItems.map((item) => item.id),
      ],
      presentedStimulusIds: [
        ...current.presentedStimulusIds,
        ...newlyPresentedStimuli.map((stimulus) => stimulus.id),
      ],
      exposures: [...current.exposures, exposure],
      events: [...current.events, ...stimulusEvents, ...itemEvents],
    };
  };

  const blockInvalidContent = (groupId: string, invalidIds: string[]) => {
    setState((current) => {
      if (!canMutateRun(current)) return current;
      return blockInvalidContentState(
        current,
        `${current.currentScreen}/${groupId}`,
        invalidIds,
        'persisted_invalid_activity_detected',
      );
    });
  };

  const activateScreenState = (
    current: LessonState,
    screenId: string,
    detail: string,
  ): LessonState => {
    const microcycleKc =
      screenId === 'k1-entry'
        ? KC1
        : screenId === 'k2-entry'
          ? KC2
          : screenId === 'k3-entry'
            ? KC3
            : null;
    const lifecycleEvents: LessonEvent[] = [
      makeEvent(
        current,
        'screen_activated',
        {
          activatedScreenId: screenId,
          reason: detail,
          mutable: current.runStatus === 'active',
        },
        { screenId, offset: 1, creditEligibility: null },
      ),
      makeEvent(
        current,
        'lesson_checkpoint_completed',
        {
          checkpointScreenId: screenId,
          checkpoint: detail,
        },
        { screenId, offset: 2, creditEligibility: null },
      ),
      ...(microcycleKc
        ? [
            makeEvent(
              current,
              'kc_microcycle_started',
              {
                kcId: microcycleKc,
                entryScreenId: screenId,
                routeAtStart: current.routes[microcycleKc],
              },
              { screenId, offset: 3, creditEligibility: null },
            ),
          ]
        : []),
    ];
    const activated: LessonState = {
      ...current,
      currentScreen: screenId,
      activeScreen: screenId,
      reached: current.reached.includes(screenId)
        ? current.reached
        : [...current.reached, screenId],
      announcement: `${SCREEN_LABELS[screenId] ?? screenId} opened.`,
      events: [...current.events, ...lifecycleEvents],
    };
    return appendPresentationLifecycle(activated, screenId, 'screen activation');
  };

  const navigate = (screenId: string, detail = 'Screen reached') => {
    setState((current) => {
      if (!canMutateRun(current)) return current;
      return activateScreenState(current, screenId, detail);
    });
  };

  const selectResponse = (itemId: string, response: ResponseId) => {
    const item = ITEMS.find((candidate) => candidate.id === itemId);
    if (
      !item ||
      state.runStatus !== 'active' ||
      state.currentScreen !== state.activeScreen ||
      state.committedGroups.includes(item.commitGroup)
    ) {
      return;
    }
    setState((current) =>
      !canMutateRun(current)
        ? current
        : {
            ...current,
            responses: { ...current.responses, [itemId]: response },
            announcement: response === 'NS' ? 'Not sure selected.' : `${response} selected.`,
          },
    );
  };

  const queueHint = (itemId: string) => {
    const item = ITEMS.find((candidate) => candidate.id === itemId);
    if (
      !item ||
      state.runStatus !== 'active' ||
      state.currentScreen !== state.activeScreen ||
      state.hintsQueued.includes(itemId)
    ) {
      return;
    }
    setState((current) => {
      if (!canMutateRun(current)) return current;
      return {
        ...current,
        hintsQueued: [...current.hintsQueued, itemId],
        assistedItems: current.assistedItems.includes(itemId)
          ? current.assistedItems
          : [...current.assistedItems, itemId],
        announcement: 'Hint requested. It will appear after you submit.',
        events: addEvent(
          current,
          'hint_requested',
          {
            itemId,
            commitGroup: item.commitGroup,
            queuedUntilCommit: true,
            contaminatesExitCandidate:
              getItemMetadata(item).creditEligibility === 'instructional_exit_candidate',
          },
          {
            creditEligibility: effectiveCreditEligibility(item),
          },
        ),
      };
    });
  };

  const commitGroup = (groupId: string) => {
    const items = groupItems(groupId);
    if (
      state.runStatus !== 'active' ||
      state.currentScreen !== state.activeScreen ||
      state.retiredGroups.includes(groupId) ||
      state.committedGroups.includes(groupId)
    ) {
      return;
    }
    setState((current) => {
      if (
        !canMutateRun(current) ||
        current.retiredGroups.includes(groupId) ||
        current.committedGroups.includes(groupId)
      ) {
        return current;
      }
      const preflight = preflightContentGroups([groupId]);
      if (!preflight.valid) {
        return blockInvalidContentState(
          current,
          current.currentScreen,
          preflight.invalidIds,
          'visible_content_preflight_failed',
        );
      }
      const resolvedResponses: Record<string, ResponseId> = {
        ...current.responses,
      };
      items.forEach((item) => {
        if (!resolvedResponses[item.id]) {
          resolvedResponses[item.id] = 'OMIT';
        }
      });
      const itemEvents = items.map((item, index) => {
        const response = resolvedResponses[item.id];
        const eligibility = effectiveCreditEligibility(item);
        return makeEvent(
          current,
          'attempt_submitted',
          {
            itemId: item.id,
            commitGroup: groupId,
            response,
            correct: response === item.key,
            omitted: response === 'OMIT',
            assistance: item.assistance,
            eligibility,
          },
          {
            screenId: current.currentScreen,
            offset: index + 1,
            expectedSeconds: item.expectedSeconds,
            creditEligibility: eligibility,
          },
        );
      });
      const exposureItems =
        groupId === 'k1-entry-d1'
          ? [...groupItems('k1-entry'), ...items]
          : groupId === 'k3-entry-d1'
            ? [...groupItems('k3-entry'), ...items]
            : items;
      const groupStimuli = Array.from(
        new Map(
          exposureItems
            .map((item) => getStimulus(item.stimulusId))
            .filter((stimulus): stimulus is Stimulus => Boolean(stimulus))
            .map((stimulus) => [stimulus.id, stimulus]),
        ).values(),
      );
      const exposure: ExposureRecord = {
        envelopeVersion: EXPOSURE_ENVELOPE_VERSION,
        exposureId: `${current.runId}-exposure-${current.exposures.length + 1}`,
        runId: current.runId,
        sequence: current.exposures.length + 1,
        actorMode: current.mode,
        contentVersion: current.runContentVersion,
        policyVersion: POLICY_VERSION,
        reviewedContentHash: null,
        reviewedContentHashStatus: 'pending_independent_review',
        stimulusIds: groupStimuli.map((stimulus) => stimulus.id),
        familyIds: groupStimuli.map((stimulus) => stimulus.familyId),
        itemIds: exposureItems.map((item) => item.id),
        exposureClass:
          (groupId === 'k1-entry' && resolvedResponses['k1-entry-evidence'] === 'C') ||
          (groupId === 'k3-entry' && resolvedResponses['k3-entry-invalid'] === 'A')
            ? 'learner_response_commit'
            : 'learner_answer_feedback',
        creditEligibility: aggregateCreditEligibility(items),
        detail:
          groupId === 'k1-entry-d1' || groupId === 'k3-entry-d1'
            ? `Commit group ${groupId} closed; answer feedback for the sealed entry and fresh disambiguator was exposed together.`
            : `Commit group ${groupId} closed before answer-bearing feedback.`,
      };
      const feedbackDeferred =
        (groupId === 'k1-entry' && resolvedResponses['k1-entry-evidence'] === 'C') ||
        (groupId === 'k3-entry' && resolvedResponses['k3-entry-invalid'] === 'A');
      const feedbackEvents = feedbackDeferred
        ? []
        : [
            makeEvent(
              current,
              'answer_feedback_revealed',
              {
                commitGroups:
                  groupId === 'k1-entry-d1'
                    ? ['k1-entry', 'k1-entry-d1']
                    : groupId === 'k3-entry-d1'
                      ? ['k3-entry', 'k3-entry-d1']
                      : [groupId],
                allLinkedResponsesCommitted: true,
                scope: 'instruction_feedback_only',
              },
              {
                screenId: current.currentScreen,
                offset: itemEvents.length + 1,
                creditEligibility: 'instruction_only',
              },
            ),
          ];
      const committedState: LessonState = {
        ...current,
        responses: resolvedResponses,
        committedGroups: [...current.committedGroups, groupId],
        events: [...current.events, ...itemEvents, ...feedbackEvents],
        exposures: [...current.exposures, exposure],
        announcement: 'Answer submitted. Feedback is now available.',
      };
      return appendPresentationLifecycle(
        committedState,
        current.currentScreen,
        `commit ${groupId} revealed the next gated content`,
      );
    });
  };

  const groupPassed = (groupId: string): boolean => stateGroupPassed(state, groupId);

  const setRouteAndNavigate = (kcId: KcId, route: Route, screenId: string) => {
    setState((current) => {
      if (!canMutateRun(current)) return current;
      const routed: LessonState = {
        ...current,
        routes: { ...current.routes, [kcId]: route },
        announcement: `${route} instructional dose selected for ${kcId}.`,
        events: addEvent(
          current,
          'instruction_route_selected',
          {
            kcId,
            route,
            sourceScreenId: current.currentScreen,
          },
          { creditEligibility: 'routing_only' },
        ),
      };
      return activateScreenState(routed, screenId, `${kcId} ${route} route activated`);
    });
  };

  const markExit = (kcId: KcId, handoffScreen: string, groupId: string) => {
    setState((current) => {
      if (!canMutateRun(current)) return current;
      const preflight = preflightInstructionalExit(kcId, groupId);
      if (!preflight.valid) {
        return blockInvalidContentState(
          current,
          current.currentScreen,
          preflight.invalidIds,
          'exit_preflight_failed',
        );
      }
      const exitItems = preflight.items;
      const alreadyExited = current.exited[kcId];
      if (kcId === KC3 && current.simulationCompletionRecorded) return current;
      const exited = { ...current.exited, [kcId]: true };
      const exitEligibility = aggregateCreditEligibility(exitItems);
      const exitEvent = alreadyExited
        ? makeEvent(
            current,
            'repair_closure_verified',
            {
              kcId,
              groupId,
              priorExitRemainsMonotonic: true,
            },
            { creditEligibility: 'instruction_only' },
          )
        : makeEvent(
            current,
            'kc_instructional_exit_simulated',
            {
              kcId,
              groupId,
              simulation: true,
              capstoneCredit: false,
            },
            { creditEligibility: exitEligibility },
          );
      const exiting: LessonState = {
        ...current,
        exited,
        announcement: `${kcId} instructional checkpoint closed.`,
        events: [...current.events, exitEvent],
      };
      if (kcId !== KC3) {
        return activateScreenState(exiting, handoffScreen, `${kcId} instructional handoff`);
      }
      const allExited = [KC1, KC2, KC3].every((id) => exited[id]);
      if (!allExited) {
        return blockInvalidContentState(current, current.currentScreen, [
          'sequence:kc3-exit-before-prior-kc-exits',
        ]);
      }
      const completedBase: LessonState = {
        ...exiting,
        runStatus: 'completed',
        simulationCompletionRecorded: true,
        announcement:
          'KC3 exit and lesson_simulation_completed were recorded atomically and idempotently. A production host would emit lesson_delivery_completed, but this Canvas never does.',
      };
      const completed: LessonState = {
        ...completedBase,
        events: [
          ...exiting.events,
          makeEvent(
            completedBase,
            'lesson_simulation_completed',
            {
              lessonId: 'V3-LES-386478',
              orderedKcIds: [KC1, KC2, KC3],
              triggerKcId: 'V3-KC-072322',
              atomicWithTriggerExit: true,
              idempotent: true,
              capstoneExcluded: 'V3-CAP-027756',
              productionHostEvent: 'lesson_delivery_completed',
              canvasEmitsProductionHostEvent: false,
            },
            { creditEligibility: null },
          ),
        ],
      };
      return activateScreenState(
        completed,
        'complete',
        'KC3 exit atomically completed the internal lesson simulation; a production host would emit lesson_delivery_completed, but this Canvas never does',
      );
    });
  };

  const handleExit = (
    kcId: KcId,
    groupId: string,
    repairCycle: number,
    passScreen: string,
    failScreen: string,
  ) => {
    if (state.runStatus !== 'active' || state.currentScreen !== state.activeScreen) {
      return;
    }
    const exitPreflight = preflightInstructionalExit(kcId, groupId);
    if (!exitPreflight.valid) {
      setState((current) =>
        !canMutateRun(current)
          ? current
          : blockInvalidContentState(
              current,
              current.currentScreen,
              exitPreflight.invalidIds,
              'exit_preflight_failed',
            ),
      );
      return;
    }
    if (groupPassed(groupId)) {
      markExit(kcId, passScreen, groupId);
      return;
    }
    if (repairCycle >= 2) {
      setState((current) => {
        if (!canMutateRun(current)) return current;
        const nextRetiredGroups = current.retiredGroups.includes(groupId)
          ? current.retiredGroups
          : [...current.retiredGroups, groupId];
        const pausedBase: LessonState = {
          ...current,
          runStatus: 'paused',
          pausedAt: kcId,
          pausedReason: `${kcId} exhausted two bounded repair cycles. The failed pack is retired for this content version.`,
          retiredGroups: nextRetiredGroups,
          repairCycles: { ...current.repairCycles, [kcId]: repairCycle },
          announcement:
            'Run paused after two failed repairs. Verified external replacement is required and not implemented here.',
        };
        const paused: LessonState = {
          ...pausedBase,
          events: addEvent(
            pausedBase,
            'kc_paused_for_repair',
            {
              kcId,
              failedGroupId: groupId,
              retiredGroupIds: nextRetiredGroups,
              terminal: true,
            },
            { creditEligibility: null },
          ),
        };
        return activateScreenState(paused, 'paused', `${kcId} repair terminal activated`);
      });
      return;
    }
    setState((current) => {
      if (!canMutateRun(current)) return current;
      const repairing: LessonState = {
        ...current,
        repairCycles: {
          ...current.repairCycles,
          [kcId]: repairCycle + 1,
        },
        announcement: `${kcId} repair cycle ${repairCycle + 1} opened.`,
        events: addEvent(
          current,
          'exact_kc_repair_activity_started',
          {
            kcId,
            cycle: (repairCycle + 1) as 1 | 2,
            failedGroupId: groupId,
          },
          { creditEligibility: 'instruction_only' },
        ),
      };
      return activateScreenState(repairing, failScreen, `${kcId} repair cycle ${repairCycle + 1}`);
    });
  };

  const pauseForRetiredGroup = (kcId: KcId, groupId: string) => {
    setState((current) => {
      if (!canMutateRun(current) || !current.retiredGroups.includes(groupId)) {
        return current;
      }
      const pausedBase: LessonState = {
        ...current,
        runStatus: 'paused',
        pausedAt: kcId,
        pausedReason: `${groupId} is retired from an earlier run. A distinct content version is required for this branch.`,
        announcement: 'Run paused because this branch requires a distinct replacement family.',
      };
      const paused: LessonState = {
        ...pausedBase,
        events: addEvent(
          pausedBase,
          'kc_paused_for_retired_family',
          {
            kcId,
            retiredGroupId: groupId,
            terminal: true,
          },
          { creditEligibility: null },
        ),
      };
      return activateScreenState(paused, 'paused', `${groupId} retired-family terminal activated`);
    });
  };

  const enterReviewerMode = () => {
    setState((current) => {
      if (current.mode === 'reviewer' && current.reviewerKeysExposed) return current;
      const reviewerState: LessonState = {
        ...current,
        mode: 'reviewer',
        reviewerKeysExposed: true,
        announcement:
          'Internal reviewer mode opened. All keys and families are now simulation-only exposure.',
      };
      if (current.reviewerKeysExposed) return reviewerState;
      const exposure: ExposureRecord = {
        envelopeVersion: EXPOSURE_ENVELOPE_VERSION,
        exposureId: `${current.runId}-exposure-${current.exposures.length + 1}`,
        runId: current.runId,
        sequence: current.exposures.length + 1,
        actorMode: 'reviewer',
        contentVersion: current.runContentVersion,
        policyVersion: POLICY_VERSION,
        reviewedContentHash: null,
        reviewedContentHashStatus: 'pending_independent_review',
        stimulusIds: STIMULI.map((stimulus) => stimulus.id),
        familyIds: STIMULI.map((stimulus) => stimulus.familyId),
        itemIds: ITEMS.map((item) => item.id),
        exposureClass: 'internal_review_key_access',
        creditEligibility: 'simulation_only_never_untouched',
        detail:
          'Reviewer/key access exposes every passage, key, rationale, and family for internal simulation.',
      };
      return {
        ...reviewerState,
        exposures: [...current.exposures, exposure],
        events: addEvent(
          reviewerState,
          'internal_review_key_access_started',
          {
            itemCount: ITEMS.length,
            stimulusCount: STIMULI.length,
            familyCount: new Set(STIMULI.map((stimulus) => stimulus.familyId)).size,
            forcesSimulation: true,
          },
          { creditEligibility: 'simulation_only_never_untouched' },
        ),
      };
    });
  };

  useEffect(() => {
    if (reviewMode) {
      enterReviewerMode();
      return;
    }
    setState((current) =>
      current.mode === 'learner'
        ? current
        : {
            ...current,
            mode: 'learner',
            announcement: 'Learner lesson ready.',
          },
    );
  }, [reviewMode, setState]);

  useEffect(() => {
    if (!reviewMode) screenFocusRef.current?.focus();
  }, [reviewMode, state.currentScreen]);

  const reachedOptions = state.reached
    .filter((id) => SCREEN_LABELS[id])
    .map((id) => ({ value: id, label: SCREEN_LABELS[id] }));

  const completedKcs = [KC1, KC2, KC3].filter((kcId) => state.exited[kcId]).length;
  const currentOrdinal = Math.max(0, SCREEN_ORDER.indexOf(state.activeScreen));
  const linearProgress = Math.round((currentOrdinal / SCREEN_ORDER.indexOf('complete')) * 100);
  const progressPercent =
    state.runStatus === 'completed'
      ? 100
      : state.runStatus === 'paused'
        ? Math.min(92, linearProgress)
        : state.runStatus === 'blocked'
          ? Math.min(90, linearProgress)
          : Math.min(96, linearProgress);
  const historicalScreen = state.currentScreen !== state.activeScreen;
  const learnerStep = learnerProgress(state.currentScreen);
  const repairTaskGroup =
    state.currentScreen === 'k1-repair1'
      ? 'k1-r1-task'
      : state.currentScreen === 'k1-repair2'
        ? 'k1-r2-task'
        : state.currentScreen === 'k1-bridge-repair'
          ? 'k1-bridge-repair-task'
          : state.currentScreen === 'k2-repair1'
            ? 'k2-r1-task'
            : state.currentScreen === 'k2-repair2'
              ? 'k2-r2-task'
              : state.currentScreen === 'k3-repair1'
                ? 'k3-r1-task'
                : state.currentScreen === 'k3-repair2'
                  ? 'k3-r2-task'
                  : null;
  const learnerPhase =
    repairTaskGroup && state.committedGroups.includes(repairTaskGroup)
      ? 'Final check'
      : learnerStep.phase;
  const learnerScreenLabel =
    learnerStep.topic && learnerPhase
      ? `Topic ${learnerStep.topic} · ${learnerPhase}`
      : SCREEN_LABELS[state.currentScreen];

  const activityProps = {
    state: activeState,
    onSelect: selectResponse,
    onQueueHint: queueHint,
    onCommit: commitGroup,
    onInvalid: blockInvalidContent,
    readOnly: historicalScreen,
  };

  let learnerContent = null;

  if (state.currentScreen === 'intro') {
    learnerContent = (
      <Stack gap={18}>
        <Callout tone="info" title="Focus now">
          Reconstruct how the argument is built: label each piece, map the connections, and check
          whether the passage actually supplies each link.
        </Callout>
        <H2>Three topics</H2>
        <Grid columns="repeat(auto-fit, minmax(min(100%, 220px), 1fr))" gap={14}>
          <div>
            <Text size="small" tone="tertiary">
              Topic 1
            </Text>
            <Text weight="semibold">Label the elements</Text>
            <Text size="small" tone="secondary">
              Separate claims, evidence, warrants, illustrations, and background.
            </Text>
          </div>
          <div>
            <Text size="small" tone="tertiary">
              Topic 2
            </Text>
            <Text weight="semibold">Map the relations</Text>
            <Text size="small" tone="secondary">
              Support, qualification, objection, and concession.
            </Text>
          </div>
          <div>
            <Text size="small" tone="tertiary">
              Topic 3
            </Text>
            <Text weight="semibold">Test the links</Text>
            <Text size="small" tone="secondary">
              Check whether the source really supports the target.
            </Text>
          </div>
        </Grid>
        <Row>
          <Button
            variant="primary"
            onClick={() => navigate('k1-entry', 'Lesson shell started at KC1')}
          >
            Start with a quick check
          </Button>
        </Row>
      </Stack>
    );
  }

  if (state.currentScreen === 'k1-entry') {
    const committed = state.committedGroups.includes('k1-entry');
    const pass = groupPassed('k1-entry');
    const needsDisambiguator = committed && state.responses['k1-entry-evidence'] === 'C';
    const route: Route = pass ? 'concise' : 'standard';
    learnerContent = (
      <Stack gap={18}>
        <H2>Topic 1 of 3 · Check</H2>
        <Text>Find the point the author supports and the reported basis for it.</Text>
        <ActivityGroup
          groupId="k1-entry"
          suppressFeedback={needsDisambiguator}
          {...activityProps}
        />
        <Button
          variant="primary"
          disabled={!committed}
          onClick={() =>
            needsDisambiguator
              ? navigate('k1-entry-followup', 'Topic 1 check follow-up')
              : setRouteAndNavigate(KC1, route, 'k1-model')
          }
        >
          {needsDisambiguator ? 'Answer one follow-up' : 'See the worked example'}
        </Button>
      </Stack>
    );
  }

  if (state.currentScreen === 'k1-entry-followup') {
    const committed = state.committedGroups.includes('k1-entry-d1');
    const route: Route =
      committed && state.responses['k1-entry-disambiguator'] === 'B' ? 'misconception' : 'standard';
    learnerContent = (
      <Stack gap={18}>
        <H2>Topic 1 of 3 · Check</H2>
        <Text>
          Evidence reports what was observed. An illustration gives a concrete or imagined case. Use
          that difference here.
        </Text>
        <ActivityGroup groupId="k1-entry-d1" {...activityProps} />
        <Button
          variant="primary"
          disabled={!committed}
          onClick={() => setRouteAndNavigate(KC1, route, 'k1-model')}
        >
          See the worked example
        </Button>
      </Stack>
    );
  }

  if (state.currentScreen === 'k1-model') {
    learnerContent = (
      <Stack gap={18}>
        <H2>Topic 1 of 3 · Learn</H2>
        <ExpertModel kcId={KC1} route={state.routes[KC1]} />
        <Button
          variant="primary"
          onClick={() => navigate('k1-orient', 'Topic 1 worked model viewed')}
        >
          Try the model on this passage
        </Button>
      </Stack>
    );
  }

  if (state.currentScreen === 'k1-orient') {
    const committed = state.committedGroups.includes('k1-orient');
    learnerContent = (
      <Stack gap={18}>
        <H2>Topic 1 of 3 · Practice</H2>
        <H3>Try with guidance</H3>
        <ActivityGroup groupId="k1-orient" {...activityProps} />
        <Button
          variant="primary"
          disabled={!committed}
          onClick={() => navigate('k1-practice', 'Topic 1 guided practice')}
        >
          Continue
        </Button>
      </Stack>
    );
  }

  if (state.currentScreen === 'k1-practice') {
    const committed = state.committedGroups.includes('k1-a2');
    learnerContent = (
      <Stack gap={18}>
        <H2>Topic 1 of 3 · Practice</H2>
        <ActivityGroup groupId="k1-a2" title="Try with guidance" {...activityProps} />
        <Button
          variant="primary"
          disabled={!committed}
          onClick={() => navigate('k1-practice-cued', 'Topic 1 second guided practice')}
        >
          Continue
        </Button>
      </Stack>
    );
  }

  if (state.currentScreen === 'k1-practice-cued') {
    const committed = state.committedGroups.includes('k1-a1');
    learnerContent = (
      <Stack gap={18}>
        <H2>Topic 1 of 3 · Practice</H2>
        <ActivityGroup groupId="k1-a1" title="Try with guidance" {...activityProps} />
        <Button
          variant="primary"
          disabled={!committed}
          onClick={() => navigate('k1-practice-solo', 'Topic 1 independent practice')}
        >
          Continue
        </Button>
      </Stack>
    );
  }

  if (state.currentScreen === 'k1-practice-solo') {
    const committed = state.committedGroups.includes('k1-a0');
    learnerContent = (
      <Stack gap={18}>
        <H2>Topic 1 of 3 · Practice</H2>
        <ActivityGroup groupId="k1-a0" title="On your own" {...activityProps} />
        <Button
          variant="primary"
          disabled={!committed}
          onClick={() => navigate('k1-practice-contrast', 'Topic 1 contrast practice')}
        >
          Continue
        </Button>
      </Stack>
    );
  }

  if (state.currentScreen === 'k1-practice-contrast') {
    const committed = state.committedGroups.includes('k1-contrast');
    learnerContent = (
      <Stack gap={18}>
        <H2>Topic 1 of 3 · Practice</H2>
        <ActivityGroup
          groupId="k1-contrast"
          title="On your own · Compare close cases"
          {...activityProps}
        />
        <Button
          variant="primary"
          disabled={!committed}
          onClick={() => navigate('k1-practice-claim', 'Topic 1 claim practice')}
        >
          Continue
        </Button>
      </Stack>
    );
  }

  if (state.currentScreen === 'k1-practice-claim') {
    const committed = state.committedGroups.includes('k1-claim-coverage');
    learnerContent = (
      <Stack gap={18}>
        <H2>Topic 1 of 3 · Practice</H2>
        <ActivityGroup
          groupId="k1-claim-coverage"
          title="On your own · Name the claim’s job"
          {...activityProps}
        />
        <Button
          variant="primary"
          disabled={!committed}
          onClick={() => navigate('k1-exit', 'Topic 1 practice complete')}
        >
          Go to final check
        </Button>
      </Stack>
    );
  }

  if (state.currentScreen === 'k1-exit') {
    const committed = state.committedGroups.includes('k1-exit0');
    learnerContent = (
      <Stack gap={18}>
        <H2>Topic 1 of 3 · Final check</H2>
        <Text>Apply the distinction to two fresh passages. Submit them together.</Text>
        <ActivityGroup groupId="k1-exit0" {...activityProps} />
        {committed ? (
          <Callout tone={groupPassed('k1-exit0') ? 'success' : 'warning'}>
            {groupPassed('k1-exit0')
              ? 'Both checks are correct. You are ready to map the connections.'
              : 'One distinction needs another look before a fresh check.'}
          </Callout>
        ) : null}
        <Button
          variant="primary"
          disabled={!committed}
          onClick={() => handleExit(KC1, 'k1-exit0', 0, 'k1-handoff', 'k1-repair1')}
        >
          Continue
        </Button>
      </Stack>
    );
  }

  if (state.currentScreen === 'k1-repair1') {
    const repairCommitted = state.committedGroups.includes('k1-r1-task');
    const ready = repairCommitted && state.committedGroups.includes('k1-exit1');
    learnerContent = (
      <Stack gap={20}>
        {!repairCommitted ? (
          <>
            <H2>Topic 1 of 3 · Practice</H2>
            <Callout tone="info" title="Review the difference">
              First ask whether the sentence makes a point. Then ask whether another sentence
              supports it. A reported observation is evidence; a concrete case is an illustration.
            </Callout>
            <ActivityGroup groupId="k1-r1-task" title="Try with guidance" {...activityProps} />
          </>
        ) : (
          <>
            <H2>Topic 1 of 3 · Final check</H2>
            <ActivityGroup groupId="k1-exit1" title="On your own" {...activityProps} />
          </>
        )}
        <Button
          variant="primary"
          disabled={!ready}
          onClick={() => handleExit(KC1, 'k1-exit1', 1, 'k1-handoff', 'k1-repair2')}
        >
          Continue
        </Button>
      </Stack>
    );
  }

  if (state.currentScreen === 'k1-repair2') {
    const repairCommitted = state.committedGroups.includes('k1-r2-task');
    const exitRetired = state.retiredGroups.includes('k1-exit2');
    const ready = repairCommitted && state.committedGroups.includes('k1-exit2');
    learnerContent = (
      <Stack gap={20}>
        {!repairCommitted ? (
          <>
            <H2>Topic 1 of 3 · Practice</H2>
            <Callout tone="info" title="Review the support arrow">
              Draw the arrow from the reason to the point it supports. The target is the conclusion;
              a reported source can be evidence.
            </Callout>
            <ActivityGroup groupId="k1-r2-task" title="Try with guidance" {...activityProps} />
          </>
        ) : (
          <>
            <H2>Topic 1 of 3 · Final check</H2>
            <ActivityGroup groupId="k1-exit2" title="On your own" {...activityProps} />
          </>
        )}
        {exitRetired ? (
          <Button variant="secondary" onClick={() => pauseForRetiredGroup(KC1, 'k1-exit2')}>
            Pause for a fresh question set
          </Button>
        ) : (
          <Button
            variant="primary"
            disabled={!ready}
            onClick={() => handleExit(KC1, 'k1-exit2', 2, 'k1-handoff', 'paused')}
          >
            Continue
          </Button>
        )}
      </Stack>
    );
  }

  if (state.currentScreen === 'k1-handoff') {
    learnerContent = (
      <Stack gap={18}>
        <Callout tone="success" title="See how the pieces connect">
          You can label the pieces; now map how one supports another.
        </Callout>
        <Button variant="primary" onClick={() => navigate('k2-entry', 'Handoff from KC1 to KC2')}>
          Start Topic 2 check
        </Button>
      </Stack>
    );
  }

  if (state.currentScreen === 'k2-entry') {
    const roleCommitted = state.committedGroups.includes('k2-role-probe');
    const roleReady =
      state.responses['k2-entry-roles'] === 'A' && !state.assistedItems.includes('k2-entry-roles');
    const needsInitialBridge = roleCommitted && !roleReady && state.bridgeStatus === 'none';
    const bridgeCommitted = state.committedGroups.includes('k2-bridge');
    const bridgePassed = groupPassed('k2-bridge');
    const replacementPending =
      state.bridgeStatus === 'replacement_pending' &&
      state.reentryTarget?.requiredReplacementGroup === 'k2-bridge-replacement';
    const replacementCommitted = state.committedGroups.includes('k2-bridge-replacement');
    const replacementRetired = state.retiredGroups.includes('k2-bridge-replacement');
    const replacementPassed = groupPassed('k2-bridge-replacement');
    const hardEdgeReady =
      (roleCommitted && roleReady) || bridgePassed || state.bridgeStatus === 'resolved';
    const relationCommitted = state.committedGroups.includes('k2-relation-route');
    const relationPassed = groupPassed('k2-relation-route');
    const route: Route =
      roleReady && relationPassed ? 'concise' : !roleReady ? 'prerequisite-support' : 'standard';
    learnerContent = (
      <Stack gap={18}>
        <H2>Topic 2 of 3 · Check</H2>
        <Text>Before you name an arrow, make sure you know what each sentence does.</Text>
        {!roleCommitted ? (
          <ActivityGroup groupId="k2-role-probe" title="Focus now" {...activityProps} />
        ) : null}
        {needsInitialBridge && !bridgeCommitted ? (
          <ActivityGroup groupId="k2-bridge" title="Try with guidance" {...activityProps} />
        ) : null}
        {replacementPending && !replacementCommitted ? (
          <ActivityGroup
            groupId="k2-bridge-replacement"
            title="Try with guidance"
            {...activityProps}
          />
        ) : null}
        {hardEdgeReady && !relationCommitted ? (
          <ActivityGroup groupId="k2-relation-route" title="Focus now" {...activityProps} />
        ) : null}
        {needsInitialBridge && bridgeCommitted && !bridgePassed ? (
          <Callout tone="warning" title="Review the difference">
            Revisit which sentence reports a basis and which sentence states the point it supports.
            Then try a fresh pair.
          </Callout>
        ) : null}
        {replacementPending && replacementCommitted ? (
          <Callout tone={replacementPassed ? 'success' : 'warning'}>
            {replacementPassed
              ? 'The source and target roles are clear. Continue to the relation check.'
              : 'This distinction needs a new question set before you continue.'}
          </Callout>
        ) : null}
        <Row gap={8} wrap>
          {hardEdgeReady && relationCommitted ? (
            <Button variant="primary" onClick={() => setRouteAndNavigate(KC2, route, 'k2-model')}>
              See the worked example
            </Button>
          ) : null}
          {needsInitialBridge && bridgeCommitted && !bridgePassed ? (
            <Button
              variant="secondary"
              onClick={() => {
                setState((current) => {
                  if (!canMutateRun(current)) return current;
                  const target: ReentryTarget = {
                    version: 'les-386478-reentry-v1',
                    edgeId: 'V3-EDG-971610',
                    sourceKcId: KC1,
                    hostKcId: KC2,
                    returnScreen: 'k2-entry',
                    requiredReplacementGroup: 'k2-bridge-replacement',
                    createdInRunId: current.runId,
                  };
                  const repairing: LessonState = {
                    ...current,
                    routes: {
                      ...current.routes,
                      [KC2]: 'prerequisite-support',
                    },
                    reentryTarget: target,
                    bridgeStatus: 'repair_active',
                    announcement:
                      'Dedicated KC1 hard-edge repair opened with an exact persisted KC2 reentry target.',
                    events: addEvent(
                      current,
                      'sequence_reentry_target_persisted',
                      { target },
                      { creditEligibility: 'support_only' },
                    ),
                  };
                  return activateScreenState(
                    repairing,
                    'k1-bridge-repair',
                    'V3-EDG-971610 dedicated KC1 repair activated',
                  );
                });
              }}
            >
              Review roles with a fresh example
            </Button>
          ) : null}
          {replacementPending && replacementCommitted ? (
            <Button
              variant="primary"
              onClick={() => {
                if (replacementPassed) {
                  setState((current) => {
                    if (!canMutateRun(current) || current.bridgeStatus !== 'replacement_pending') {
                      return current;
                    }
                    const resumed: LessonState = {
                      ...current,
                      bridgeStatus: 'resolved',
                      reentryTarget: null,
                      routes: {
                        ...current.routes,
                        [KC2]: 'prerequisite-support',
                      },
                      announcement:
                        'Fresh hard-edge replacement passed. The fresh KC2 relation-routing family is now available.',
                      events: addEvent(
                        current,
                        'kc_resumed_at_reentry',
                        {
                          kcId: KC2,
                          edgeId: 'V3-EDG-971610',
                          replacementGroupId: 'k2-bridge-replacement',
                          targetVersion: 'les-386478-reentry-v1',
                        },
                        { creditEligibility: 'support_only' },
                      ),
                    };
                    return appendPresentationLifecycle(
                      resumed,
                      'k2-entry',
                      'fresh hard-edge replacement revealed relation routing',
                    );
                  });
                } else {
                  setState((current) => {
                    if (!canMutateRun(current)) return current;
                    const nextRetiredGroups = current.retiredGroups.includes(
                      'k2-bridge-replacement',
                    )
                      ? current.retiredGroups
                      : [...current.retiredGroups, 'k2-bridge-replacement'];
                    const pausedBase: LessonState = {
                      ...current,
                      runStatus: 'paused',
                      pausedAt: KC2,
                      pausedReason:
                        'Fresh V3-EDG-971610 replacement family failed and is retired for this content version.',
                      retiredGroups: nextRetiredGroups,
                      announcement: 'Run paused. The failed hard-edge replacement cannot reopen.',
                    };
                    const paused: LessonState = {
                      ...pausedBase,
                      events: addEvent(
                        pausedBase,
                        'kc_paused_for_repair',
                        {
                          kcId: KC2,
                          failedGroupId: 'k2-bridge-replacement',
                          retiredGroupIds: nextRetiredGroups,
                          terminal: true,
                        },
                        { creditEligibility: null },
                      ),
                    };
                    return activateScreenState(
                      paused,
                      'paused',
                      'hard-edge replacement terminal activated',
                    );
                  });
                }
              }}
            >
              {replacementPassed ? 'Continue to the relation check' : 'Pause for a fresh set'}
            </Button>
          ) : null}
          {replacementPending && replacementRetired ? (
            <Button
              variant="secondary"
              onClick={() => pauseForRetiredGroup(KC2, 'k2-bridge-replacement')}
            >
              Pause for a fresh question set
            </Button>
          ) : null}
        </Row>
      </Stack>
    );
  }

  if (state.currentScreen === 'k1-bridge-repair') {
    const repairCommitted = state.committedGroups.includes('k1-bridge-repair-task');
    const exitRetired = state.retiredGroups.includes('k1-bridge-exit');
    const exitCommitted = state.committedGroups.includes('k1-bridge-exit');
    const exitPassed = groupPassed('k1-bridge-exit');
    learnerContent = (
      <Stack gap={20}>
        {!repairCommitted ? (
          <>
            <H2>Topic 1 of 3 · Practice</H2>
            <Callout
              tone={state.reentryTarget ? 'info' : 'warning'}
              title={state.reentryTarget ? 'Review the difference' : 'This step cannot continue'}
            >
              {state.reentryTarget
                ? 'Evidence is the reported basis. A conclusion is the point that basis supports. Label those two jobs before drawing the arrow.'
                : 'A required return step is missing. Pause and ask for a refreshed lesson.'}
            </Callout>
            <ActivityGroup
              groupId="k1-bridge-repair-task"
              title="Try with guidance"
              {...activityProps}
            />
          </>
        ) : (
          <>
            <H2>Topic 1 of 3 · Final check</H2>
            <ActivityGroup groupId="k1-bridge-exit" title="On your own" {...activityProps} />
          </>
        )}
        {exitRetired ? (
          <Button variant="secondary" onClick={() => pauseForRetiredGroup(KC1, 'k1-bridge-exit')}>
            Pause for a fresh question set
          </Button>
        ) : exitCommitted ? (
          <Button
            variant="primary"
            onClick={() => {
              if (exitPassed && state.reentryTarget) {
                setState((current) => {
                  if (!canMutateRun(current) || !current.reentryTarget) {
                    return current;
                  }
                  const reentering: LessonState = {
                    ...current,
                    bridgeStatus: 'replacement_pending',
                    announcement:
                      'Dedicated KC1 repair closed. Fresh KC2 bridge replacement exposed.',
                    events: addEvent(
                      current,
                      'repair_closure_verified',
                      {
                        kcId: KC1,
                        groupId: 'k1-bridge-exit',
                        priorExitRemainsMonotonic: true,
                      },
                      { creditEligibility: 'support_only' },
                    ),
                  };
                  return activateScreenState(
                    reentering,
                    current.reentryTarget.returnScreen,
                    'persisted hard-edge reentry activated',
                  );
                });
              } else {
                setState((current) => {
                  if (!canMutateRun(current)) return current;
                  const nextRetiredGroups = current.retiredGroups.includes('k1-bridge-exit')
                    ? current.retiredGroups
                    : [...current.retiredGroups, 'k1-bridge-exit'];
                  const pausedBase: LessonState = {
                    ...current,
                    runStatus: 'paused',
                    pausedAt: KC1,
                    pausedReason:
                      'Dedicated KC1 hard-edge replacement exit failed and is retired for this content version.',
                    retiredGroups: nextRetiredGroups,
                    announcement:
                      'Run paused. The failed dedicated KC1 replacement exit cannot reopen.',
                  };
                  const paused: LessonState = {
                    ...pausedBase,
                    events: addEvent(
                      pausedBase,
                      'kc_paused_for_repair',
                      {
                        kcId: KC1,
                        failedGroupId: 'k1-bridge-exit',
                        retiredGroupIds: nextRetiredGroups,
                        terminal: true,
                      },
                      { creditEligibility: null },
                    ),
                  };
                  return activateScreenState(
                    paused,
                    'paused',
                    'dedicated KC1 hard-edge terminal activated',
                  );
                });
              }
            }}
          >
            {exitPassed ? 'Return to Topic 2' : 'Pause for a fresh set'}
          </Button>
        ) : null}
      </Stack>
    );
  }

  if (state.currentScreen === 'k2-model') {
    learnerContent = (
      <Stack gap={18}>
        <H2>Topic 2 of 3 · Learn</H2>
        <ExpertModel kcId={KC2} route={state.routes[KC2]} />
        <Button
          variant="primary"
          onClick={() => navigate('k2-orient', 'Topic 2 worked model viewed')}
        >
          Try the map on this passage
        </Button>
      </Stack>
    );
  }

  if (state.currentScreen === 'k2-orient') {
    const committed = state.committedGroups.includes('k2-orient');
    learnerContent = (
      <Stack gap={18}>
        <H2>Topic 2 of 3 · Practice</H2>
        <ActivityGroup groupId="k2-orient" title="Try with guidance" {...activityProps} />
        <Button
          variant="primary"
          disabled={!committed}
          onClick={() => navigate('k2-practice', 'Topic 2 guided practice')}
        >
          Continue
        </Button>
      </Stack>
    );
  }

  if (state.currentScreen === 'k2-practice') {
    const committed = state.committedGroups.includes('k2-a2');
    learnerContent = (
      <Stack gap={18}>
        <H2>Topic 2 of 3 · Practice</H2>
        <ActivityGroup groupId="k2-a2" title="Try with guidance" {...activityProps} />
        <Button
          variant="primary"
          disabled={!committed}
          onClick={() => navigate('k2-practice-cued', 'Topic 2 second guided practice')}
        >
          Continue
        </Button>
      </Stack>
    );
  }

  if (state.currentScreen === 'k2-practice-cued') {
    const committed = state.committedGroups.includes('k2-a1');
    learnerContent = (
      <Stack gap={18}>
        <H2>Topic 2 of 3 · Practice</H2>
        <ActivityGroup groupId="k2-a1" title="Try with guidance" {...activityProps} />
        <Button
          variant="primary"
          disabled={!committed}
          onClick={() => navigate('k2-practice-solo', 'Topic 2 independent practice')}
        >
          Continue
        </Button>
      </Stack>
    );
  }

  if (state.currentScreen === 'k2-practice-solo') {
    const committed = state.committedGroups.includes('k2-a0');
    learnerContent = (
      <Stack gap={18}>
        <H2>Topic 2 of 3 · Practice</H2>
        <ActivityGroup groupId="k2-a0" title="On your own" {...activityProps} />
        <Button
          variant="primary"
          disabled={!committed}
          onClick={() => navigate('k2-practice-contrast', 'Topic 2 contrast practice')}
        >
          Continue
        </Button>
      </Stack>
    );
  }

  if (state.currentScreen === 'k2-practice-contrast') {
    const committed = state.committedGroups.includes('k2-contrast');
    learnerContent = (
      <Stack gap={18}>
        <H2>Topic 2 of 3 · Practice</H2>
        <ActivityGroup
          groupId="k2-contrast"
          title="On your own · Compare close relations"
          {...activityProps}
        />
        <Button
          variant="primary"
          disabled={!committed}
          onClick={() => navigate('k2-practice-coverage', 'Topic 2 relation practice')}
        >
          Continue
        </Button>
      </Stack>
    );
  }

  if (state.currentScreen === 'k2-practice-coverage') {
    const committed = state.committedGroups.includes('k2-relation-coverage');
    learnerContent = (
      <Stack gap={18}>
        <H2>Topic 2 of 3 · Practice</H2>
        <ActivityGroup
          groupId="k2-relation-coverage"
          title="On your own · Name the arrow"
          {...activityProps}
        />
        <Button
          variant="primary"
          disabled={!committed}
          onClick={() => navigate('k2-exit', 'Topic 2 practice complete')}
        >
          Go to final check
        </Button>
      </Stack>
    );
  }

  if (state.currentScreen === 'k2-exit') {
    const committed = state.committedGroups.includes('k2-exit0');
    learnerContent = (
      <Stack gap={18}>
        <H2>Topic 2 of 3 · Final check</H2>
        <Text>Map each fresh passage without a built-in cue.</Text>
        <ActivityGroup groupId="k2-exit0" {...activityProps} />
        {committed ? (
          <Callout tone={groupPassed('k2-exit0') ? 'success' : 'warning'}>
            {groupPassed('k2-exit0')
              ? 'Both relation maps are correct.'
              : 'One relation needs another look before a fresh check.'}
          </Callout>
        ) : null}
        <Button
          variant="primary"
          disabled={!committed}
          onClick={() => handleExit(KC2, 'k2-exit0', 0, 'k2-handoff', 'k2-repair1')}
        >
          Continue
        </Button>
      </Stack>
    );
  }

  if (state.currentScreen === 'k2-repair1') {
    const repairCommitted = state.committedGroups.includes('k2-r1-task');
    const ready = repairCommitted && state.committedGroups.includes('k2-exit1');
    learnerContent = (
      <Stack gap={20}>
        {!repairCommitted ? (
          <>
            <H2>Topic 2 of 3 · Practice</H2>
            <Callout tone="info" title="Review who owns the idea">
              A qualification narrows the author’s claim. An objection challenges it. A concession
              grants part of that challenge.
            </Callout>
            <ActivityGroup groupId="k2-r1-task" title="Try with guidance" {...activityProps} />
          </>
        ) : (
          <>
            <H2>Topic 2 of 3 · Final check</H2>
            <ActivityGroup groupId="k2-exit1" title="On your own" {...activityProps} />
          </>
        )}
        <Button
          variant="primary"
          disabled={!ready}
          onClick={() => handleExit(KC2, 'k2-exit1', 1, 'k2-handoff', 'k2-repair2')}
        >
          Continue
        </Button>
      </Stack>
    );
  }

  if (state.currentScreen === 'k2-repair2') {
    const repairCommitted = state.committedGroups.includes('k2-r2-task');
    const exitRetired = state.retiredGroups.includes('k2-exit2');
    const ready = repairCommitted && state.committedGroups.includes('k2-exit2');
    learnerContent = (
      <Stack gap={20}>
        {!repairCommitted ? (
          <>
            <H2>Topic 2 of 3 · Practice</H2>
            <Callout tone="info" title="Review the arrow’s verb">
              Paraphrase both pieces, then complete one sentence: this part backs, narrows,
              challenges, or grants that part.
            </Callout>
            <ActivityGroup groupId="k2-r2-task" title="Try with guidance" {...activityProps} />
          </>
        ) : (
          <>
            <H2>Topic 2 of 3 · Final check</H2>
            <ActivityGroup groupId="k2-exit2" title="On your own" {...activityProps} />
          </>
        )}
        {exitRetired ? (
          <Button variant="secondary" onClick={() => pauseForRetiredGroup(KC2, 'k2-exit2')}>
            Pause for a fresh question set
          </Button>
        ) : (
          <Button
            variant="primary"
            disabled={!ready}
            onClick={() => handleExit(KC2, 'k2-exit2', 2, 'k2-handoff', 'paused')}
          >
            Continue
          </Button>
        )}
      </Stack>
    );
  }

  if (state.currentScreen === 'k2-handoff') {
    learnerContent = (
      <Stack gap={18}>
        <Callout tone="success" title="Focus now">
          You can map the arrows. Next, check whether each arrow has a real passage-based bridge.
        </Callout>
        <Button variant="primary" onClick={() => navigate('k3-entry', 'Handoff from KC2 to KC3')}>
          Start Topic 3 check
        </Button>
      </Stack>
    );
  }

  if (state.currentScreen === 'k3-entry') {
    const committed = state.committedGroups.includes('k3-entry');
    const pass = groupPassed('k3-entry');
    const allUnsure =
      state.responses['k3-entry-valid'] === 'NS' && state.responses['k3-entry-invalid'] === 'NS';
    const needsDisambiguator = committed && state.responses['k3-entry-invalid'] === 'A';
    const route: Route = pass ? 'concise' : allUnsure ? 'local-support' : 'standard';
    learnerContent = (
      <Stack gap={18}>
        <H2>Topic 3 of 3 · Check</H2>
        <Text>A transition word announces a connection; it does not prove one.</Text>
        <ActivityGroup
          groupId="k3-entry"
          suppressFeedback={needsDisambiguator}
          {...activityProps}
        />
        <Button
          variant="primary"
          disabled={!committed}
          onClick={() =>
            needsDisambiguator
              ? navigate('k3-entry-followup', 'Topic 3 check follow-up')
              : setRouteAndNavigate(KC3, route, 'k3-model')
          }
        >
          {needsDisambiguator ? 'Answer one follow-up' : 'See the worked example'}
        </Button>
      </Stack>
    );
  }

  if (state.currentScreen === 'k3-entry-followup') {
    const committed = state.committedGroups.includes('k3-entry-d1');
    const repeatedMarkerDrivenLink =
      committed &&
      state.responses['k3-entry-disambiguator'] === 'A' &&
      !state.assistedItems.includes('k3-entry-disambiguator');
    const route: Route = repeatedMarkerDrivenLink ? 'misconception' : 'standard';
    learnerContent = (
      <Stack gap={18}>
        <H2>Topic 3 of 3 · Check</H2>
        <Text>
          Cover the transition word. Then ask whether the earlier sentence gives the exact reason
          needed for the later one.
        </Text>
        <ActivityGroup groupId="k3-entry-d1" {...activityProps} />
        <Button
          variant="primary"
          disabled={!committed}
          onClick={() => setRouteAndNavigate(KC3, route, 'k3-model')}
        >
          See the worked example
        </Button>
      </Stack>
    );
  }

  if (state.currentScreen === 'k3-model') {
    const needsLocalSupport = state.routes[KC3] === 'local-support';
    learnerContent = (
      <Stack gap={18}>
        <H2>Topic 3 of 3 · Learn</H2>
        <ExpertModel kcId={KC3} route={state.routes[KC3]} />
        <Button
          variant="primary"
          onClick={() =>
            navigate(needsLocalSupport ? 'k3-support' : 'k3-orient', 'Topic 3 worked model viewed')
          }
        >
          {needsLocalSupport ? 'Practice one reference first' : 'Try the link test'}
        </Button>
      </Stack>
    );
  }

  if (state.currentScreen === 'k3-support') {
    const committed = state.committedGroups.includes('k3-local-support');
    learnerContent = (
      <Stack gap={18}>
        <H2>Topic 3 of 3 · Practice</H2>
        <Text>
          First resolve what a short reference points back to. The same move helps you identify a
          link’s source.
        </Text>
        <ActivityGroup groupId="k3-local-support" title="Try with guidance" {...activityProps} />
        <Button
          variant="primary"
          disabled={!committed}
          onClick={() => navigate('k3-support-confirm', 'Topic 3 reference follow-up')}
        >
          Try a fresh reference
        </Button>
      </Stack>
    );
  }

  if (state.currentScreen === 'k3-support-confirm') {
    const supportConfirmationCommitted = state.committedGroups.includes('k3-local-support-confirm');
    const supportConfirmationRetired = state.retiredGroups.includes('k3-local-support-confirm');
    const supportConfirmed = groupPassed('k3-local-support-confirm');
    learnerContent = (
      <Stack gap={18}>
        <H2>Topic 3 of 3 · Practice</H2>
        <ActivityGroup groupId="k3-local-support-confirm" title="On your own" {...activityProps} />
        {supportConfirmationCommitted ? (
          <Callout tone={supportConfirmed ? 'success' : 'warning'}>
            {supportConfirmed
              ? 'The reference points to the correct earlier source.'
              : 'Pause here and continue later with a fresh reference set.'}
          </Callout>
        ) : null}
        {supportConfirmationRetired ? (
          <Button
            variant="secondary"
            onClick={() => pauseForRetiredGroup(KC3, 'k3-local-support-confirm')}
          >
            Pause for a fresh question set
          </Button>
        ) : supportConfirmationCommitted && supportConfirmed ? (
          <Button
            variant="primary"
            onClick={() => navigate('k3-orient', 'Topic 3 reference support complete')}
          >
            Continue to the link test
          </Button>
        ) : supportConfirmationCommitted ? (
          <Button
            variant="secondary"
            onClick={() =>
              setState((current) => {
                if (!canMutateRun(current)) return current;
                const nextRetiredGroups = current.retiredGroups.includes('k3-local-support-confirm')
                  ? current.retiredGroups
                  : [...current.retiredGroups, 'k3-local-support-confirm'];
                const pausedBase: LessonState = {
                  ...current,
                  runStatus: 'paused',
                  pausedAt: KC3,
                  pausedReason:
                    'Fresh V3-SUP-900002 confirmation failed and is retired for this content version.',
                  retiredGroups: nextRetiredGroups,
                  announcement:
                    'Run paused because required local-language support was not confirmed.',
                };
                const paused: LessonState = {
                  ...pausedBase,
                  events: addEvent(
                    pausedBase,
                    'kc_paused_for_support',
                    {
                      kcId: KC3,
                      supportArtifact: 'V3-SUP-900002',
                      failedGroupId: 'k3-local-support-confirm',
                      terminal: true,
                    },
                    { creditEligibility: null },
                  ),
                };
                return activateScreenState(paused, 'paused', 'V3-SUP-900002 terminal activated');
              })
            }
          >
            Pause for a fresh set
          </Button>
        ) : null}
      </Stack>
    );
  }

  if (state.currentScreen === 'k3-orient') {
    const committed = state.committedGroups.includes('k3-orient');
    learnerContent = (
      <Stack gap={18}>
        <H2>Topic 3 of 3 · Practice</H2>
        <ActivityGroup groupId="k3-orient" title="Try with guidance" {...activityProps} />
        <Button
          variant="primary"
          disabled={!committed}
          onClick={() => navigate('k3-practice', 'Topic 3 guided practice')}
        >
          Continue
        </Button>
      </Stack>
    );
  }

  if (state.currentScreen === 'k3-practice') {
    const committed = state.committedGroups.includes('k3-a2');
    learnerContent = (
      <Stack gap={18}>
        <H2>Topic 3 of 3 · Practice</H2>
        <ActivityGroup groupId="k3-a2" title="Try with guidance" {...activityProps} />
        <Button
          variant="primary"
          disabled={!committed}
          onClick={() => navigate('k3-practice-cued', 'Topic 3 second guided practice')}
        >
          Continue
        </Button>
      </Stack>
    );
  }

  if (state.currentScreen === 'k3-practice-cued') {
    const committed = state.committedGroups.includes('k3-a1');
    learnerContent = (
      <Stack gap={18}>
        <H2>Topic 3 of 3 · Practice</H2>
        <ActivityGroup groupId="k3-a1" title="Try with guidance" {...activityProps} />
        <Button
          variant="primary"
          disabled={!committed}
          onClick={() => navigate('k3-practice-solo', 'Topic 3 independent practice')}
        >
          Continue
        </Button>
      </Stack>
    );
  }

  if (state.currentScreen === 'k3-practice-solo') {
    const committed = state.committedGroups.includes('k3-a0');
    learnerContent = (
      <Stack gap={18}>
        <H2>Topic 3 of 3 · Practice</H2>
        <ActivityGroup groupId="k3-a0" title="On your own" {...activityProps} />
        <Button
          variant="primary"
          disabled={!committed}
          onClick={() => navigate('k3-practice-contrast', 'Topic 3 contrast practice')}
        >
          Continue
        </Button>
      </Stack>
    );
  }

  if (state.currentScreen === 'k3-practice-contrast') {
    const committed = state.committedGroups.includes('k3-contrast');
    learnerContent = (
      <Stack gap={18}>
        <H2>Topic 3 of 3 · Practice</H2>
        <ActivityGroup
          groupId="k3-contrast"
          title="On your own · Compare close links"
          {...activityProps}
        />
        <Button
          variant="primary"
          disabled={!committed}
          onClick={() => navigate('k3-exit', 'Topic 3 practice complete')}
        >
          Go to final check
        </Button>
      </Stack>
    );
  }

  if (state.currentScreen === 'k3-exit') {
    const committed = state.committedGroups.includes('k3-exit0');
    learnerContent = (
      <Stack gap={18}>
        <H2>Topic 3 of 3 · Final check</H2>
        <Text>Test each fresh link using only what its passage states.</Text>
        <ActivityGroup groupId="k3-exit0" {...activityProps} />
        {committed ? (
          <Callout tone={groupPassed('k3-exit0') ? 'success' : 'warning'}>
            {groupPassed('k3-exit0')
              ? 'Both link tests are correct.'
              : 'One link needs another look before a fresh check.'}
          </Callout>
        ) : null}
        <Button
          variant="primary"
          disabled={!committed}
          onClick={() => handleExit(KC3, 'k3-exit0', 0, 'complete', 'k3-repair1')}
        >
          Continue
        </Button>
      </Stack>
    );
  }

  if (state.currentScreen === 'k3-repair1') {
    const repairCommitted = state.committedGroups.includes('k3-r1-task');
    const ready = repairCommitted && state.committedGroups.includes('k3-exit1');
    learnerContent = (
      <Stack gap={20}>
        {!repairCommitted ? (
          <>
            <H2>Topic 3 of 3 · Practice</H2>
            <Callout tone="info" title="Review the bridge">
              Remove the transition and restate: “Because the earlier part says ___, the later part
              may say ___.” The passage must fill that blank.
            </Callout>
            <ActivityGroup groupId="k3-r1-task" title="Try with guidance" {...activityProps} />
          </>
        ) : (
          <>
            <H2>Topic 3 of 3 · Final check</H2>
            <ActivityGroup groupId="k3-exit1" title="On your own" {...activityProps} />
          </>
        )}
        <Button
          variant="primary"
          disabled={!ready}
          onClick={() => handleExit(KC3, 'k3-exit1', 1, 'complete', 'k3-repair2')}
        >
          Continue
        </Button>
      </Stack>
    );
  }

  if (state.currentScreen === 'k3-repair2') {
    const repairCommitted = state.committedGroups.includes('k3-r2-task');
    const exitRetired = state.retiredGroups.includes('k3-exit2');
    const ready = repairCommitted && state.committedGroups.includes('k3-exit2');
    learnerContent = (
      <Stack gap={20}>
        {!repairCommitted ? (
          <>
            <H2>Topic 3 of 3 · Practice</H2>
            <Callout tone="info" title="Review the missing sentence">
              Ask what extra sentence would make the connection work. If the passage never states
              that idea, the link is not established.
            </Callout>
            <ActivityGroup groupId="k3-r2-task" title="Try with guidance" {...activityProps} />
          </>
        ) : (
          <>
            <H2>Topic 3 of 3 · Final check</H2>
            <ActivityGroup groupId="k3-exit2" title="On your own" {...activityProps} />
          </>
        )}
        {exitRetired ? (
          <Button variant="secondary" onClick={() => pauseForRetiredGroup(KC3, 'k3-exit2')}>
            Pause for a fresh question set
          </Button>
        ) : (
          <Button
            variant="primary"
            disabled={!ready}
            onClick={() => handleExit(KC3, 'k3-exit2', 2, 'complete', 'paused')}
          >
            Continue
          </Button>
        )}
      </Stack>
    );
  }

  if (state.currentScreen === 'complete') {
    learnerContent = (
      <Stack gap={18}>
        <Callout tone="success" title="Final check complete">
          You labeled argument parts, mapped their relations, and tested whether each asserted link
          had a passage-based bridge.
        </Callout>
        <H2>Keep practicing the same sequence</H2>
        <Text>
          Name the pieces first. Then name the arrows. Finally, cover transition words and verify
          each bridge from the passage itself.
        </Text>
      </Stack>
    );
  }

  if (state.currentScreen === 'paused') {
    learnerContent = (
      <Stack gap={18}>
        <Callout tone="warning" title="Pause here">
          This question set is finished. Continue later with a fresh set chosen for the distinction
          you were practicing.
        </Callout>
        <Text>Your earlier answers are saved, but they cannot be changed on this screen.</Text>
      </Stack>
    );
  }

  if (state.currentScreen === 'blocked') {
    learnerContent = (
      <Stack gap={18}>
        <Callout tone="danger" title="This lesson step is unavailable">
          The question could not be loaded safely, so the lesson stopped without counting an answer.
        </Callout>
        <Text>Ask for a refreshed lesson set before continuing.</Text>
      </Stack>
    );
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: theme.bg.editor,
        color: theme.text.primary,
        padding: '24px clamp(16px, 4vw, 44px) 48px',
      }}
    >
      <Stack
        gap={20}
        style={{
          maxWidth: activeState.mode === 'learner' ? 820 : 1180,
          margin: '0 auto',
        }}
      >
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          style={{
            position: 'absolute',
            width: 1,
            height: 1,
            overflow: 'hidden',
            clip: 'rect(0 0 0 0)',
          }}
        >
          {state.announcement}
        </div>
        <div>
          <Row gap={12} align="start" wrap>
            <div style={{ minWidth: 0, flex: '1 1 480px' }}>
              <H1>Reconstruct Argument Structure</H1>
              <Text tone="secondary">
                Label the pieces, map the arrows, and test each link from the passage.
              </Text>
            </div>
          </Row>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progressPercent}
            aria-valuetext={`${progressPercent}%`}
            aria-label={`Lesson progress ${progressPercent}%`}
            style={{
              height: 3,
              background: theme.fill.secondary,
              marginTop: 16,
              overflow: 'hidden',
              borderRadius: 999,
            }}
          >
            <div
              style={{
                width: `${progressPercent}%`,
                height: '100%',
                background: theme.accent.primary,
              }}
            />
          </div>
        </div>

        {activeState.mode === 'learner' ? (
          <Row gap={8} align="center" wrap>
            <Text weight="semibold">
              {learnerStep.topic
                ? `Topic ${learnerStep.topic} of 3`
                : state.currentScreen === 'intro'
                  ? 'Lesson overview'
                  : 'Lesson status'}
            </Text>
            {learnerPhase ? <Pill size="sm">{learnerPhase}</Pill> : null}
          </Row>
        ) : (
          <Stack gap={12}>
            <Grid columns="repeat(auto-fit, minmax(min(100%, 220px), 1fr))" gap={12}>
              <Stat value={`${completedKcs} / 3`} label="KC checkpoints closed" />
              <Stat value={state.events.length} label="Append-only events" />
              <Stat value={state.reached.length} label="Reached screens" />
              <Stat value={state.runStatus} label="Run status" />
            </Grid>
            <Row gap={8} align="center" wrap>
              <Text size="small" tone="tertiary">
                Reached-screen navigation
              </Text>
              <Select
                value={state.currentScreen}
                options={reachedOptions}
                onChange={(value) =>
                  setState((current) => ({
                    ...current,
                    currentScreen: value,
                    announcement:
                      value !== current.activeScreen
                        ? `${SCREEN_LABELS[value]} opened as read-only history.`
                        : `${SCREEN_LABELS[value]} opened.`,
                  }))
                }
                style={{ minWidth: 230 }}
              />
              <Spacer />
              <Text size="small" tone="tertiary">
                Reviewer diagnostics
              </Text>
            </Row>
          </Stack>
        )}

        <Divider />

        {activeState.mode === 'learner' ? (
          <Card size="lg">
            <CardHeader trailing={<Pill size="sm">{learnerScreenLabel}</Pill>}>
              Lesson step
            </CardHeader>
            <CardBody style={{ padding: '20px clamp(14px, 3vw, 28px) 28px' }}>
              {historicalScreen ? (
                <Callout tone="neutral" title="Earlier lesson step">
                  This step is read only. Return to Reviewer to choose the current step.
                </Callout>
              ) : null}
              <fieldset
                key={state.currentScreen}
                ref={screenFocusRef}
                tabIndex={-1}
                disabled={historicalScreen}
                aria-disabled={historicalScreen}
                style={{
                  pointerEvents: historicalScreen ? 'none' : 'auto',
                  opacity: historicalScreen ? 0.72 : 1,
                  marginTop: historicalScreen ? 14 : 0,
                  border: 0,
                  padding: 0,
                  minWidth: 0,
                }}
              >
                {learnerContent}
              </fieldset>
            </CardBody>
          </Card>
        ) : reviewReady ? (
          <ReviewerView
            state={activeState}
            setTab={(tab) => setState((current) => ({ ...current, reviewerTab: tab }))}
          />
        ) : (
          <div role="status">Preparing reviewer workspace…</div>
        )}
      </Stack>
    </div>
  );
}
