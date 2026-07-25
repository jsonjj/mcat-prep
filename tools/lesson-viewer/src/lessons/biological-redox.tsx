import { useEffect, useRef, useState } from 'react';

import {
  Button,
  Callout,
  CollapsibleSection,
  Divider,
  Grid,
  H1,
  H2,
  H3,
  Link,
  Pill,
  Row,
  Spacer,
  Stack,
  Stat,
  Table,
  Text,
  useCanvasState,
  useHostTheme,
} from 'cursor/canvas';

type Mode = 'learner' | 'reviewer';
type ReviewerTab = 'canonical' | 'content' | 'evidence' | 'qa';
type Route = 'unassigned' | 'standard' | 'concise' | 'support';
type ScreenId =
  | 'enter'
  | 'pulse'
  | 'support'
  | 'orientation'
  | 'model'
  | 'worked'
  | 'a2'
  | 'a1'
  | 'contrast'
  | 'exit'
  | 'repair'
  | 'handoff'
  | 'extension';
type ExitSet = 'A' | 'B' | 'C';
type LessonStatus = 'in-progress' | 'simulated-success' | 'planner-handoff';
type Feature = 'direction' | 'structure' | 'mixed';
type ResetTarget = 'default' | 'standard' | 'concise' | 'support';
type HandoffReason = 'none' | 'repair-cycle-cap' | 'supported-retry-cap';
type ExposureKind = 'presented' | 'hint' | 'reveal' | 'reviewer';

type Choice = {
  id: string;
  label: string;
  feedback: string;
  correct?: boolean;
  feature?: Feature;
};

type ItemData = {
  id: string;
  familyId?: string;
  stage: string;
  title: string;
  context?: string;
  prompt: string;
  choices: Choice[];
  hint: string;
  omission: string;
  rationale: string;
  assistance: 'A2' | 'A1' | 'A0' | 'orientation' | 'pulse' | 'extension';
  evidence: string;
  expectedSeconds: number;
};

type ResponseRecord = {
  selection: string | null;
  committed: boolean;
  assisted: boolean;
  hintShown: boolean;
  retryCount: number;
};

type LessonState = {
  schemaVersion: number;
  contentVersion: string;
  runSequence: number;
  runId: string;
  mode: Mode;
  reviewerTab: ReviewerTab;
  screen: ScreenId;
  priorEvidence: 'none' | 'fresh';
  route: Route;
  responses: Record<string, ResponseRecord>;
  exitSet: ExitSet;
  exitRevealed: boolean;
  pendingExitHint: string | null;
  repairCycle: 0 | 1 | 2;
  repairFeatures: Feature[];
  status: LessonStatus;
  runExposed: boolean;
  exposureReason: string | null;
  pausedByLearner: boolean;
  standaloneExited: boolean;
  resetPending: boolean;
  resetTarget: ResetTarget;
  handoffReason: HandoffReason;
  handoffItemId: string | null;
};

type PrototypeLogEntry = {
  sequence: number;
  runId: string;
  at: string;
  type: string;
  summary: string;
  contentVersion: string;
  schemaVersion: number;
  policyVersion?: string;
  exposed: boolean;
};

type ExposureRecord = {
  sequence: number;
  runId: string;
  itemId: string;
  familyId: string;
  kind: ExposureKind;
  at: string;
  contentVersion: string;
  schemaVersion?: number;
  policyVersion?: string;
};

const OMIT = '__OMIT__';
const CONTENT_VERSION = 'V3-LES-329622-content-1.2.0-internal-review';
const STATE_SCHEMA_VERSION = 3;
const PROTOTYPE_POLICY_VERSION = 'QR-simulation-policy-3';
const PROTOTYPE_LOG_KEY = 'mcat-redox-prototype-log-v2';
const EXPOSURE_REGISTRY_KEY = 'mcat-redox-family-exposure-v1';
const MAX_SUPPORTED_RETRIES = 1;

function makeInitialState(runSequence = 1, target: ResetTarget = 'default'): LessonState {
  return {
    schemaVersion: STATE_SCHEMA_VERSION,
    contentVersion: CONTENT_VERSION,
    runSequence,
    runId: `qr-v${STATE_SCHEMA_VERSION}-run-${runSequence}`,
    mode: 'learner',
    reviewerTab: 'canonical',
    screen: target === 'support' ? 'support' : target === 'default' ? 'enter' : 'pulse',
    priorEvidence: target === 'concise' ? 'fresh' : 'none',
    route: target === 'support' ? 'support' : 'unassigned',
    responses: {},
    exitSet: 'A',
    exitRevealed: false,
    pendingExitHint: null,
    repairCycle: 0,
    repairFeatures: [],
    status: 'in-progress',
    runExposed: false,
    exposureReason: null,
    pausedByLearner: false,
    standaloneExited: false,
    resetPending: false,
    resetTarget: 'default',
    handoffReason: 'none',
    handoffItemId: null,
  };
}

const INITIAL_STATE = makeInitialState();

const RAW_ITEMS: Record<string, ItemData> = {
  PULSE_ELECTRON: {
    id: 'PULSE-ELECTRON-01',
    stage: 'Prerequisite pulse',
    title: 'Electron-language pulse',
    prompt: 'A carrier accepts electrons from a donor. What happened to the carrier?',
    choices: [
      {
        id: 'A',
        label: 'It was reduced.',
        feedback:
          'Correct. Accepting electrons is reduction. The donor loses those electrons and is oxidized.',
        correct: true,
      },
      {
        id: 'B',
        label: 'It was oxidized.',
        feedback:
          'The direction is reversed. The species that loses electrons is oxidized; the carrier accepted them, so it was reduced.',
        feature: 'direction',
      },
      {
        id: 'C',
        label: 'Only an acid–base reaction occurred.',
        feedback:
          'Protons may accompany biological electron transfer, but stated electron gain makes this a reduction.',
        feature: 'direction',
      },
      {
        id: 'D',
        label: 'Electron information is insufficient to classify it.',
        feedback:
          'Electron direction is sufficient: gain means reduction and loss means oxidation.',
        feature: 'direction',
      },
      {
        id: 'E',
        label: 'I’m not sure yet.',
        feedback:
          'That is okay for a starting check. The full structure-and-electron model comes next.',
        feature: 'mixed',
      },
    ],
    hint: 'Track the electron: the carrier gains it. Gain of electrons means reduction.',
    omission: 'No answer was saved. The full structure-and-electron model comes next.',
    rationale:
      'Reduction is defined by electron gain. The electron donor undergoes the complementary oxidation.',
    assistance: 'pulse',
    evidence: 'Routing telemetry only',
    expectedSeconds: 25,
  },
  PULSE_STRUCTURE: {
    id: 'PULSE-STRUCTURE-01',
    stage: 'Prerequisite pulse',
    title: 'Structure-symbol pulse',
    context: 'Card 1: C=O\nCard 2: C–OH',
    prompt: 'Which card shows a carbonyl group at an oxidized quinone endpoint?',
    choices: [
      {
        id: 'A',
        label: 'Card 1',
        feedback: 'Correct. A carbonyl contains a carbon–oxygen double bond, C=O.',
        correct: true,
      },
      {
        id: 'B',
        label: 'Card 2',
        feedback:
          'Card 2 is a hydroxyl-bearing carbon, C–OH, used at the reduced hydroquinone endpoint.',
        feature: 'structure',
      },
      {
        id: 'C',
        label: 'Both cards',
        feedback: 'The groups contain oxygen, but their bonding differs. Only C=O is the carbonyl.',
        feature: 'structure',
      },
      {
        id: 'D',
        label: 'Neither card',
        feedback: 'Card 1 explicitly shows the defining carbonyl bond, C=O.',
        feature: 'structure',
      },
      {
        id: 'E',
        label: 'I’m not sure yet.',
        feedback: 'That is okay for a starting check. The next model will compare C=O with C–OH.',
        feature: 'mixed',
      },
    ],
    hint: 'In C=O, oxygen is double-bonded to carbon: carbonyl. In C–OH, oxygen is bonded to hydrogen: hydroxyl.',
    omission: 'No structure choice was saved. The next model will compare C=O with C–OH.',
    rationale:
      'The oxidized quinone endpoint contains two designated carbonyl groups; the reduced endpoint contains hydroxyls.',
    assistance: 'pulse',
    evidence: 'Routing telemetry only',
    expectedSeconds: 25,
  },
  ORIENTATION: {
    id: 'ORIENT-PREDICT-01',
    stage: 'Orientation',
    title: 'Predict the endpoint',
    context:
      'State A has two designated C=O groups. State B has the same ring and side chain, but those groups are C–OH.',
    prompt: 'The carrier starts in State A and accepts 2 e⁻ and 2 H⁺. Predict its endpoint.',
    choices: [
      {
        id: 'A',
        label: 'State B; the carrier is reduced.',
        feedback: 'Correct prediction. Electron gain produces the reduced hydroxyl endpoint.',
        correct: true,
      },
      {
        id: 'B',
        label: 'State A; the carrier remains oxidized.',
        feedback:
          'A completed two-electron reduction does not leave the carrier at its oxidized carbonyl endpoint.',
        feature: 'direction',
      },
      {
        id: 'C',
        label: 'State B; the carrier is oxidized.',
        feedback:
          'The structure is right but the label is reversed. State B gained electrons, so it is reduced.',
        feature: 'direction',
      },
      {
        id: 'D',
        label: 'A new state containing two additional oxygen atoms.',
        feedback:
          'No oxygen atoms are added. The bonding at the same two oxygens changes from C=O to C–OH.',
        feature: 'structure',
      },
      {
        id: 'E',
        label: 'I’m not sure yet.',
        feedback:
          'Keep the prediction open. The model will show how electron direction and structure agree.',
        feature: 'mixed',
      },
    ],
    hint: 'Accepting 2 e⁻ is reduction. In this pair, reduction changes both designated C=O groups to C–OH.',
    omission: 'No prediction was saved. Keep the complete model visible while you continue.',
    rationale: 'The full quinone-to-hydroquinone endpoint consumes two electrons and two protons.',
    assistance: 'orientation',
    evidence: 'Instructional telemetry only',
    expectedSeconds: 35,
  },
  WORKED: {
    id: 'WORKED-EXAMPLE-01',
    stage: 'Worked example',
    title: 'Select the expert product',
    context:
      'A membrane vesicle contains carrier R–Q. Before reaction, the carrier’s two designated redox oxygens are C=O. Enzyme D transfers an electron pair and two protons to the carrier. Side chain R is unchanged.',
    prompt: 'Which product panel should an expert select?',
    choices: [
      {
        id: 'A',
        label: 'R–QH₂, two C–OH, labeled reduced',
        feedback:
          'Correct. The electron pair enters the carrier, both redox oxygens become hydroxyls, and R stays unchanged.',
        correct: true,
      },
      {
        id: 'B',
        label: 'R–Q, two C=O, labeled oxidized',
        feedback: 'This option ignores the completed electron-and-proton transfer.',
        feature: 'direction',
      },
      {
        id: 'C',
        label: 'R–QH₂, two C–OH, labeled oxidized',
        feedback: 'The structure is right, but the label is reversed. Electron gain is reduction.',
        feature: 'direction',
      },
      {
        id: 'D',
        label: 'R–Q with two additional oxygen atoms',
        feedback: 'No oxygen atoms are added. Existing oxygen bonding and hydrogen count change.',
        feature: 'structure',
      },
      {
        id: 'E',
        label: 'I’m not sure yet.',
        feedback: 'The expert trace will connect the cue, principle, operation, and check.',
        feature: 'mixed',
      },
    ],
    hint: 'Write R–Q + 2 H⁺ + 2 e⁻ → R–QH₂, then match the product structure.',
    omission: 'No product was selected. The complete expert trace will remain available.',
    rationale:
      'The carrier gains two electrons and two protons, producing the reduced hydroquinone endpoint while the side chain remains unchanged.',
    assistance: 'A2',
    evidence: 'Worked-example telemetry only',
    expectedSeconds: 45,
  },
  A2: {
    id: 'GUID-A2-01',
    stage: 'Guided completion',
    title: 'Complete the conversion',
    context:
      'Carrier NQ has two designated C=O groups. Enzyme R transfers an electron pair and two protons to it.',
    prompt: 'Choose the operation that correctly completes the conversion to NQH₂.',
    choices: [
      {
        id: 'A',
        label: 'NQ + 2 H⁺ + 2 e⁻ → NQH₂; both C=O become C–OH',
        feedback:
          'Correct. Electrons enter, both redox oxygens become hydroxyls, and the carrier is reduced.',
        correct: true,
      },
      {
        id: 'B',
        label: 'NQH₂ → NQ + 2 H⁺ + 2 e⁻; both C–OH become C=O',
        feedback: 'That equation is the reverse oxidation, not the stated reduction of NQ.',
        feature: 'direction',
      },
      {
        id: 'C',
        label: 'NQ + 2 H⁺ + e⁻ → NQH₂; only one oxygen changes',
        feedback:
          'The full endpoints differ by two electrons and two protons. One electron does not complete NQH₂.',
        feature: 'structure',
      },
      {
        id: 'D',
        label: 'NQ + 2 O → NQH₂; both carbonyls remain',
        feedback:
          'No oxygen is added, and this option omits the electron transfer that defines the reaction.',
        feature: 'structure',
      },
      {
        id: 'E',
        label: 'I’m not sure yet.',
        feedback: 'We’ll keep completion support and use a separate equation.',
        feature: 'mixed',
      },
    ],
    hint: 'Put electrons on the side of the species gaining them. The full reduced endpoint needs 2 e⁻ and 2 H⁺.',
    omission: 'No operation was selected. We’ll keep the complete model visible for a fresh task.',
    rationale: 'The overall reduction half-reaction is NQ + 2 H⁺ + 2 e⁻ → NQH₂.',
    assistance: 'A2',
    evidence: 'Instructional telemetry only',
    expectedSeconds: 40,
  },
  A2_RECOVERY: {
    id: 'GUID-A2-REC-02',
    stage: 'Guided completion recovery',
    title: 'Restore the missing term',
    prompt: 'Complete: GQ + 2 H⁺ + ___ → GQH₂',
    choices: [
      {
        id: 'A',
        label: '2 e⁻',
        feedback: 'Correct. Two electrons complete the two-electron endpoint.',
        correct: true,
      },
      {
        id: 'B',
        label: 'e⁻',
        feedback: 'One electron can describe an intermediate step, not full GQH₂.',
        feature: 'structure',
      },
      {
        id: 'C',
        label: '2 e⁺',
        feedback: 'Positrons are not the redox particles in this half-reaction.',
        feature: 'direction',
      },
      {
        id: 'D',
        label: '2 O',
        feedback: 'The oxygen count is unchanged.',
        feature: 'structure',
      },
      {
        id: 'E',
        label: 'I’m not sure yet.',
        feedback: 'Keep the complete model visible: GQ + 2 H⁺ + 2 e⁻ → GQH₂.',
        feature: 'mixed',
      },
    ],
    hint: 'The blank must supply the two reducing electrons.',
    omission: 'The complete equation will remain visible before you try again.',
    rationale: 'Two electrons are required to connect the complete Q and QH₂ endpoints.',
    assistance: 'A2',
    evidence: 'Assisted instructional telemetry only',
    expectedSeconds: 30,
  },
  A1: {
    id: 'GUID-A1-01',
    stage: 'Cue-only completion',
    title: 'Trace the reverse direction',
    context: 'Cue: electrons on product side → carrier lost electrons → oxidation',
    prompt:
      'Carrier PH₂ starts with two designated C–OH groups and gives two electrons to an acceptor. Which product panel is correct?',
    choices: [
      {
        id: 'A',
        label: 'P, two C=O, same tail; PH₂ was oxidized',
        feedback:
          'Correct. PH₂ released the electron pair and returned to the oxidized carbonyl endpoint.',
        correct: true,
      },
      {
        id: 'B',
        label: 'PH₂, two C–OH; PH₂ was reduced further',
        feedback:
          'A carrier cannot donate the stated pair yet remain at the same fully reduced endpoint without another source replacing the electrons.',
        feature: 'direction',
      },
      {
        id: 'C',
        label: 'P, two C–OH, shortened tail; PH₂ was oxidized',
        feedback:
          'The tail is not the designated redox center, and the hydroxyl head still depicts the reduced endpoint.',
        feature: 'structure',
      },
      {
        id: 'D',
        label: 'P, one C=O and one C–OH; fully oxidized',
        feedback:
          'The full oxidized endpoint has both designated oxygens as carbonyls. One-electron intermediates require separate information.',
        feature: 'structure',
      },
      {
        id: 'E',
        label: 'I’m not sure yet.',
        feedback: 'We’ll restore one completion step and use a separate carrier.',
        feature: 'mixed',
      },
    ],
    hint: 'Reverse the model: PH₂ → P + 2 H⁺ + 2 e⁻. Both hydroxyl sites return to carbonyls.',
    omission: 'No product was selected. The next task will retain the oxidation cue.',
    rationale:
      'Electron donation is oxidation and returns both designated hydroxyl sites to carbonyls.',
    assistance: 'A1',
    evidence: 'Instructional telemetry only',
    expectedSeconds: 45,
  },
  A1_RECOVERY: {
    id: 'GUID-A1-REC-02',
    stage: 'Cue-only recovery',
    title: 'Use the oxidation cue',
    context: 'Cue: donates e⁻ → loses e⁻ → oxidized',
    prompt:
      'Carrier HH₂ donates an electron pair. Which endpoint label belongs at the arrow’s end?',
    choices: [
      {
        id: 'A',
        label: 'H; two C=O; oxidized',
        feedback:
          'Correct. Electron donation returns the carrier to H, the oxidized carbonyl endpoint.',
        correct: true,
      },
      {
        id: 'B',
        label: 'HH₂; two C–OH; reduced',
        feedback: 'This is the starting reduced form, not the product after donation.',
        feature: 'direction',
      },
      {
        id: 'C',
        label: 'H; two C–OH; reduced',
        feedback:
          'The name and structure conflict: a hydroquinone-style head is H₂, not oxidized H.',
        feature: 'structure',
      },
      {
        id: 'D',
        label: 'HH₂; two C=O; oxidized',
        feedback:
          'The carbonyl pattern is oxidized, but H₂ incorrectly says the two reducing equivalents remain.',
        feature: 'structure',
      },
      {
        id: 'E',
        label: 'I’m not sure yet.',
        feedback: 'Keep the complete oxidation visible: HH₂ → H + 2 H⁺ + 2 e⁻.',
        feature: 'mixed',
      },
    ],
    hint: 'Place the donated electrons on the product side.',
    omission: 'Keep the complete oxidation visible: HH₂ → H + 2 H⁺ + 2 e⁻.',
    rationale: 'The reduced HH₂ endpoint loses two electrons and two protons to become oxidized H.',
    assistance: 'A1',
    evidence: 'Assisted instructional telemetry only',
    expectedSeconds: 30,
  },
  EXIT_A1: {
    id: 'EXIT-N-01',
    stage: 'Sealed exit set A',
    title: 'Near-use structural task',
    context:
      'State X: CoQ-like carrier, same tail, two designated C=O, formula C₅₉H₉₀O₄.\nState Y: same carrier and tail, two designated C–OH, formula C₅₉H₉₂O₄.',
    prompt:
      'A reaction converts State X to State Y exactly as shown. Which description is correct?',
    choices: [
      {
        id: 'A',
        label:
          'State X accepted 2 e⁻ and 2 H⁺ overall and was reduced from ubiquinone to ubiquinol.',
        feedback:
          'Correct. The carbonyl-to-hydroxyl change, unchanged tail, and addition of H₂ identify the two-electron reduction.',
        correct: true,
      },
      {
        id: 'B',
        label: 'State X released 2 e⁻ and 2 H⁺ and was oxidized to ubiquinol.',
        feedback:
          'Electron direction and the product name are reversed. Release would convert ubiquinol to ubiquinone.',
        feature: 'direction',
      },
      {
        id: 'C',
        label: 'No redox occurred because both states contain four oxygen atoms.',
        feedback:
          'Redox does not require a change in oxygen count. Electron transfer and oxygen bonding changed.',
        feature: 'structure',
      },
      {
        id: 'D',
        label: 'The tail accepted the electrons while the quinone head remained unchanged.',
        feedback:
          'The tail is unchanged. The highlighted head changed from carbonyls to hydroxyls.',
        feature: 'structure',
      },
      {
        id: 'E',
        label: 'I’m not sure yet.',
        feedback:
          'The carbonyl-to-hydroxyl link needs another look. A focused explanation will come before a fresh item.',
        feature: 'mixed',
      },
    ],
    hint: 'Compare the designated redox oxygens, then locate the electrons in Q + 2 H⁺ + 2 e⁻ → QH₂.',
    omission: 'No answer was saved. Inspect the same two oxygen bonds before the next item.',
    rationale:
      'The same oxygen atoms change from carbonyls to hydroxyls as the carrier consumes two electrons and two protons.',
    assistance: 'A0',
    evidence: 'Instructional-exit evidence only',
    expectedSeconds: 55,
  },
  EXIT_A2: {
    id: 'EXIT-X-01',
    stage: 'Sealed exit set A',
    title: 'Changed representation and operation',
    context:
      'No structure diagram is provided. A lab note states: “During conversion of carrier LH₂, each of its two designated ring C–OH groups becomes C=O. The side chain is unchanged.”',
    prompt: 'Which half-reaction matches the note?',
    choices: [
      {
        id: 'A',
        label: 'LH₂ → L + 2 H⁺ + 2 e⁻',
        feedback:
          'Correct. Hydroxyls becoming carbonyls is oxidation, so electrons appear among the products.',
        correct: true,
      },
      {
        id: 'B',
        label: 'L + 2 H⁺ + 2 e⁻ → LH₂',
        feedback: 'This is the reverse reduction and would convert carbonyls to hydroxyls.',
        feature: 'direction',
      },
      {
        id: 'C',
        label: 'LH₂ + 2 e⁻ → L + 2 H⁺',
        feedback:
          'The carrier cannot lose its reduced hydroxyl endpoint while also gaining the electrons placed on the left.',
        feature: 'direction',
      },
      {
        id: 'D',
        label: 'L → LH₂ + 2 O',
        feedback:
          'The oxygen atoms were already present, and the required electron transfer is missing.',
        feature: 'structure',
      },
      {
        id: 'E',
        label: 'I’m not sure yet.',
        feedback:
          'The structure-to-equation link needs another look. A focused explanation will come before a fresh item.',
        feature: 'mixed',
      },
    ],
    hint: 'Hydroxyls becoming carbonyls is the reverse of reduction; put released electrons on the product side.',
    omission:
      'No answer was saved. Inspect which side of the arrow receives the released electrons.',
    rationale: 'The complete oxidation half-reaction releases two protons and two electrons.',
    assistance: 'A0',
    evidence: 'Instructional-exit evidence only',
    expectedSeconds: 60,
  },
  REPAIR_D1: {
    id: 'REPAIR-D1-01',
    stage: 'Repair cycle 1',
    title: 'Electron-direction repair',
    context:
      'Carrier JH₂ supplies an electron pair to protein A. Use the electron ledger, not an oxygen-count shortcut.',
    prompt: 'Which ledger is correct?',
    choices: [
      {
        id: 'A',
        label: 'JH₂ → J + 2 H⁺ + 2 e⁻; JH₂ is oxidized',
        feedback: 'Correct. Electrons leave JH₂, so it is oxidized.',
        correct: true,
      },
      {
        id: 'B',
        label: 'J + 2 H⁺ + 2 e⁻ → JH₂; JH₂ is oxidized',
        feedback: 'The equation is reduction of J, and the stated label conflicts with it.',
        feature: 'direction',
      },
      {
        id: 'C',
        label: 'JH₂ + 2 e⁻ → J; JH₂ is reduced',
        feedback: 'A donor loses rather than gains electrons.',
        feature: 'direction',
      },
      {
        id: 'D',
        label: 'JH₂ → J + 2 H⁺; no redox occurred',
        feedback: 'The stated electron pair must appear in the bookkeeping.',
        feature: 'direction',
      },
      {
        id: 'E',
        label: 'I’m not sure yet.',
        feedback:
          'Keep the complete oxidation equation visible and locate the electrons on the product side.',
        feature: 'mixed',
      },
    ],
    hint: 'Find the electron pair after the arrow: product-side electrons mean oxidation.',
    omission:
      'No ledger was saved. The complete oxidation equation will remain visible before the next check.',
    rationale: 'A carrier that supplies electrons loses them and is oxidized.',
    assistance: 'A2',
    evidence: 'Near-transfer repair telemetry only',
    expectedSeconds: 35,
  },
  REPAIR_S1: {
    id: 'REPAIR-S1-01',
    stage: 'Repair cycle 1',
    title: 'Structure-center repair',
    prompt: 'Which text-only structure describes fully reduced carrier KH₂?',
    choices: [
      {
        id: 'A',
        label: 'Same tail; two opposite designated C–OH groups',
        feedback: 'Correct. Two hydroxyl groups identify the complete hydroquinone endpoint.',
        correct: true,
      },
      {
        id: 'B',
        label: 'Same tail; two opposite designated C=O groups',
        feedback: 'Two carbonyls identify oxidized K.',
        feature: 'structure',
      },
      {
        id: 'C',
        label: 'Shorter tail; two designated C=O groups',
        feedback: 'Tail length does not create KH₂; the head remains oxidized.',
        feature: 'structure',
      },
      {
        id: 'D',
        label: 'Same tail; one designated C=O and one C–OH',
        feedback:
          'That is not either complete endpoint and cannot be called fully reduced from the supplied information.',
        feature: 'structure',
      },
      {
        id: 'E',
        label: 'I’m not sure yet.',
        feedback: 'We’ll keep the two-site comparison visible before a fresh check.',
        feature: 'mixed',
      },
    ],
    hint: 'Fully reduced means both designated redox oxygens are C–OH.',
    omission: 'No structure was committed. The two-endpoint comparison remains visible.',
    rationale: 'The complete reduced endpoint has hydroxyl groups at both designated redox sites.',
    assistance: 'A2',
    evidence: 'Near-transfer repair telemetry only',
    expectedSeconds: 35,
  },
  EXIT_B1: {
    id: 'EXIT-B-N-01',
    stage: 'Sealed exit set B',
    title: 'Changed reverse structural task',
    context:
      'State 2 has two designated C–OH groups. It changes to State 1, which has two designated C=O groups; the tail is unchanged.',
    prompt: 'What occurred?',
    choices: [
      {
        id: 'A',
        label: 'State 2 released 2 e⁻ and 2 H⁺ overall and was oxidized.',
        feedback: 'Correct. Hydroxyl-to-carbonyl conversion releases the two reducing equivalents.',
        correct: true,
      },
      {
        id: 'B',
        label: 'State 2 accepted 2 e⁻ and was reduced.',
        feedback: 'Electron acceptance would drive the opposite carbonyl-to-hydroxyl conversion.',
        feature: 'direction',
      },
      {
        id: 'C',
        label: 'No redox occurred because oxygen count stayed constant.',
        feedback: 'Unchanged oxygen count does not exclude redox.',
        feature: 'structure',
      },
      {
        id: 'D',
        label: 'The tail lost the electrons.',
        feedback: 'The tail is unchanged; the redox head changed.',
        feature: 'structure',
      },
      {
        id: 'E',
        label: 'I’m not sure yet.',
        feedback:
          'Electron release and the C–OH-to-C=O change need another look before a fresh item.',
        feature: 'mixed',
      },
    ],
    hint: 'Hydroxyl-to-carbonyl is the QH₂-to-Q direction; released electrons belong on the right.',
    omission:
      'No answer was saved. Inspect electron direction and the two marked oxygen bonds next.',
    rationale:
      'The QH₂-to-Q endpoint change is oxidation and releases two electrons and two protons overall.',
    assistance: 'A0',
    evidence: 'Instructional-exit evidence only',
    expectedSeconds: 55,
  },
  EXIT_B2: {
    id: 'EXIT-B-X-01',
    stage: 'Sealed exit set B',
    title: 'Changed detector-to-structure task',
    context: 'A detector reports that carrier N consumed 2 e⁻ and 2 H⁺.',
    prompt: 'Which endpoint observation best matches?',
    choices: [
      {
        id: 'A',
        label: 'Both designated C=O groups became C–OH.',
        feedback: 'Correct. Consuming electrons produces the reduced hydroxyl endpoint.',
        correct: true,
      },
      {
        id: 'B',
        label: 'Both designated C–OH groups became C=O.',
        feedback: 'That is oxidation and releases electrons.',
        feature: 'direction',
      },
      {
        id: 'C',
        label: 'The tail detached while the head stayed unchanged.',
        feedback: 'Tail detachment is not the defined redox operation.',
        feature: 'structure',
      },
      {
        id: 'D',
        label: 'Two new oxygen atoms appeared.',
        feedback: 'Reduction changes bonding at existing oxygens.',
        feature: 'structure',
      },
      {
        id: 'E',
        label: 'I’m not sure yet.',
        feedback:
          'Review electron consumption and the two C=O-to-C–OH changes before a fresh item.',
        feature: 'mixed',
      },
    ],
    hint: 'Consumed electrons mean reduction; match reduction to the hydroxyl endpoint.',
    omission:
      'No observation was saved. Inspect what electron consumption does to both marked C=O groups.',
    rationale:
      'Electron consumption identifies reduction, which changes both designated carbonyl groups to hydroxyls.',
    assistance: 'A0',
    evidence: 'Instructional-exit evidence only',
    expectedSeconds: 55,
  },
  REPAIR_D2: {
    id: 'REPAIR-D2-01',
    stage: 'Repair cycle 2',
    title: 'Electron-pool alternate model',
    context:
      'Carrier W begins as WH₂. After the operation, the electron pool contains two additional electrons and W has two C=O groups.',
    prompt: 'Which label is required?',
    choices: [
      {
        id: 'A',
        label: 'W was oxidized.',
        feedback: 'Correct. W lost electrons and reached the carbonyl endpoint.',
        correct: true,
      },
      {
        id: 'B',
        label: 'W was reduced.',
        feedback: 'Reduction would consume, not add, electrons in the pool.',
        feature: 'direction',
      },
      {
        id: 'C',
        label: 'W was only protonated.',
        feedback: 'Electron loss makes this redox, not proton transfer alone.',
        feature: 'direction',
      },
      {
        id: 'D',
        label: 'No chemical change occurred.',
        feedback: 'Both the electron ledger and head structure changed.',
        feature: 'mixed',
      },
      {
        id: 'E',
        label: 'I’m not sure yet.',
        feedback: 'The operation will be shown as WH₂ → W + 2 H⁺ + 2 e⁻.',
        feature: 'mixed',
      },
    ],
    hint: 'An electron pool that gains electrons received them from W.',
    omission: 'The operation will be shown as WH₂ → W + 2 H⁺ + 2 e⁻.',
    rationale: 'W supplied the electrons and therefore underwent oxidation.',
    assistance: 'A2',
    evidence: 'Near-transfer repair telemetry only',
    expectedSeconds: 35,
  },
  REPAIR_S2: {
    id: 'REPAIR-S2-01',
    stage: 'Repair cycle 2',
    title: 'Oxygen-label alternate model',
    context:
      'State A has two designated C=O groups. State B has the same atoms but two designated C–OH groups.',
    prompt: 'Which state is the hydroquinone or ubiquinol endpoint?',
    choices: [
      {
        id: 'A',
        label: 'State B; reduced',
        feedback: 'Correct. The two hydroxyls identify the reduced endpoint.',
        correct: true,
      },
      {
        id: 'B',
        label: 'State A; reduced',
        feedback: 'Two carbonyls identify oxidized quinone.',
        feature: 'structure',
      },
      {
        id: 'C',
        label: 'Both; the oxygen count is equal',
        feedback: 'Bonding, not oxygen count alone, distinguishes the endpoints.',
        feature: 'structure',
      },
      {
        id: 'D',
        label: 'Neither; tail information is required',
        feedback: 'The tail is not needed to classify this redox head.',
        feature: 'structure',
      },
      {
        id: 'E',
        label: 'I’m not sure yet.',
        feedback: 'The reduced endpoint is the two-hydroxyl state.',
        feature: 'mixed',
      },
    ],
    hint: 'Cover the tail and compare only C=O with C–OH.',
    omission: 'The reduced endpoint is the two-hydroxyl state.',
    rationale:
      'Both designated hydroxyl groups identify the complete two-electron-reduced endpoint.',
    assistance: 'A2',
    evidence: 'Near-transfer repair telemetry only',
    expectedSeconds: 35,
  },
  EXIT_C1: {
    id: 'EXIT-C-N-01',
    stage: 'Sealed exit set C',
    title: 'Changed name-to-electron task',
    prompt:
      'A sample labeled ubiquinol is converted completely to ubiquinone while its tail remains unchanged. What happened to the carrier?',
    choices: [
      {
        id: 'A',
        label: 'It donated two electrons overall and was oxidized.',
        feedback: 'Correct. Ubiquinol is QH₂; conversion to Q releases the electron pair.',
        correct: true,
      },
      {
        id: 'B',
        label: 'It accepted two electrons and was reduced.',
        feedback: 'That describes ubiquinone becoming ubiquinol.',
        feature: 'direction',
      },
      {
        id: 'C',
        label: 'It gained two oxygen atoms.',
        feedback: 'Both endpoints already contain the same oxygen atoms.',
        feature: 'structure',
      },
      {
        id: 'D',
        label: 'Its tail became the redox center.',
        feedback: 'The quinone head, not the unchanged tail, changed.',
        feature: 'structure',
      },
      {
        id: 'E',
        label: 'I’m not sure yet.',
        feedback: 'Review which form donates the pair when ubiquinol becomes ubiquinone.',
        feature: 'mixed',
      },
    ],
    hint: 'Ubiquinol is QH₂; use the reverse of Q reduction.',
    omission: 'No answer was saved. Review the reverse of Q reduction.',
    rationale:
      'Ubiquinol is the reduced QH₂ endpoint and is oxidized when it donates the electron pair.',
    assistance: 'A0',
    evidence: 'Instructional-exit evidence only',
    expectedSeconds: 55,
  },
  EXIT_C2: {
    id: 'EXIT-C-X-01',
    stage: 'Sealed exit set C',
    title: 'Changed atom-and-charge balance task',
    context:
      'State O has two designated C=O groups. State R has the same carbon and oxygen counts, two additional hydrogens, and two designated C–OH groups.',
    prompt: 'Which reduction equation is balanced?',
    choices: [
      {
        id: 'A',
        label: 'O + 2 H⁺ + 2 e⁻ → R',
        feedback:
          'Correct. O consumes two protons and two electrons to form the reduced endpoint R.',
        correct: true,
      },
      {
        id: 'B',
        label: 'R → O + 2 H⁺ + 2 e⁻',
        feedback: 'This is the balanced oxidation direction.',
        feature: 'direction',
      },
      {
        id: 'C',
        label: 'O + 2 e⁻ → R + 2 H⁺',
        feedback: 'The protons are on the wrong side and charge is not balanced.',
        feature: 'direction',
      },
      {
        id: 'D',
        label: 'O + H₂O → R + O',
        feedback: 'This invents a free oxygen product and omits electron transfer.',
        feature: 'structure',
      },
      {
        id: 'E',
        label: 'I’m not sure yet.',
        feedback:
          'Review electron placement and the two added hydrogens in the reduction equation.',
        feature: 'mixed',
      },
    ],
    hint: 'Reduction consumes electrons; the product has two additional hydrogens.',
    omission: 'No answer was saved. Review electron placement and the two added hydrogens.',
    rationale:
      'Two protons and two electrons balance the two additional hydrogens and net charge of the reduction.',
    assistance: 'A0',
    evidence: 'Instructional-exit evidence only',
    expectedSeconds: 60,
  },
  EXTENSION: {
    id: 'EXT-072959-APP-01',
    stage: 'Optional extension',
    title: 'Trace a supplied carrier sequence',
    context:
      'Start: reduced soluble carrier Dred, oxidized flavin center Fox, oxidized membrane quinone Q, and a supplied proton pool.\nStage 1: Dred gives two electrons to Fox.\nStage 2: the resulting reduced flavin gives those two electrons to Q, and Q also takes up 2 H⁺ from the supplied proton pool to become QH₂.',
    prompt: 'Which final-state row is correct?',
    choices: [
      {
        id: 'A',
        label: 'Dox, Fox, QH₂',
        feedback:
          'Correct. D ends oxidized; F accepts and then passes on the pair, so it returns oxidized; Q accepts the two electrons and 2 H⁺ to end as QH₂.',
        correct: true,
      },
      {
        id: 'B',
        label: 'Dred, Fred, Q',
        feedback: 'No transfer is reflected in the final states.',
        feature: 'mixed',
      },
      {
        id: 'C',
        label: 'Dox, Fred, QH₂',
        feedback: 'The flavin cannot remain reduced after donating the pair in Stage 2.',
        feature: 'direction',
      },
      {
        id: 'D',
        label: 'Dox, Fox, Q',
        feedback:
          'The donor and relay changed, but this row makes the electrons disappear instead of reducing Q.',
        feature: 'direction',
      },
      {
        id: 'E',
        label: 'I’m not sure yet.',
        feedback:
          'Trace one stage at a time: donor oxidizes, temporary receiver reduces, then that receiver oxidizes as Q reduces.',
        feature: 'mixed',
      },
    ],
    hint: 'After Stage 1: Dox, Fred, Q. After Stage 2, F gives the pair away while Q takes the pair plus 2 H⁺: Dox, Fox, QH₂.',
    omission: 'No sequence was selected. Follow the supplied arrows one stage at a time.',
    rationale:
      'The soluble donor ends oxidized, the flavin relay returns to its oxidized state, and Q accepts two electrons plus 2 H⁺ to end reduced as QH₂.',
    assistance: 'extension',
    evidence: 'Simulated contextual telemetry; no production authority',
    expectedSeconds: 70,
  },
};

type KeyPosition = 'A' | 'B' | 'C' | 'D';

const KEY_POSITIONS: Record<string, KeyPosition> = {
  PULSE_ELECTRON: 'B',
  PULSE_STRUCTURE: 'C',
  ORIENTATION: 'D',
  WORKED: 'A',
  A2: 'C',
  A2_RECOVERY: 'B',
  A1: 'D',
  A1_RECOVERY: 'A',
  EXIT_A1: 'B',
  EXIT_A2: 'D',
  REPAIR_D1: 'C',
  REPAIR_S1: 'A',
  EXIT_B1: 'C',
  EXIT_B2: 'A',
  REPAIR_D2: 'D',
  REPAIR_S2: 'B',
  EXIT_C1: 'D',
  EXIT_C2: 'C',
  EXTENSION: 'B',
};

const FAMILY_IDS: Record<string, string> = {
  PULSE_ELECTRON: 'FAM-K271440-PULSE-ELECTRON',
  PULSE_STRUCTURE: 'FAM-K271440-PULSE-STRUCTURE',
  ORIENTATION: 'FAM-K271440-ORIENTATION',
  WORKED: 'FAM-K271440-WORKED',
  A2: 'FAM-K271440-GUIDED-A2',
  A2_RECOVERY: 'FAM-K271440-GUIDED-A2-RECOVERY',
  A1: 'FAM-K271440-GUIDED-A1',
  A1_RECOVERY: 'FAM-K271440-GUIDED-A1-RECOVERY',
  EXIT_A1: 'FAM-K271440-EXIT-N-A',
  EXIT_A2: 'FAM-K271440-EXIT-X-A',
  REPAIR_D1: 'FAM-K271440-REPAIR-D1',
  REPAIR_S1: 'FAM-K271440-REPAIR-S1',
  EXIT_B1: 'FAM-K271440-EXIT-N-B',
  EXIT_B2: 'FAM-K271440-EXIT-X-B',
  REPAIR_D2: 'FAM-K271440-REPAIR-D2',
  REPAIR_S2: 'FAM-K271440-REPAIR-S2',
  EXIT_C1: 'FAM-K271440-EXIT-N-C',
  EXIT_C2: 'FAM-K271440-EXIT-X-C',
  EXTENSION: 'FAM-EXT-072959-APP-01',
};

function rebalanceItem(item: ItemData, keyPosition: KeyPosition, familyId: string): ItemData {
  const labels: KeyPosition[] = ['A', 'B', 'C', 'D'];
  const substantive = item.choices.filter((choice) => choice.id !== 'E');
  const correct = substantive.find((choice) => choice.correct);
  const distractors = substantive.filter((choice) => !choice.correct);
  const unsure = item.choices.find((choice) => choice.id === 'E');
  if (!correct || !unsure) return item;

  let distractorIndex = 0;
  const reordered = labels.map((label) => {
    const source = label === keyPosition ? correct : distractors[distractorIndex++];
    return { ...source, id: label };
  });

  return {
    ...item,
    familyId,
    choices: [...reordered, { ...unsure, id: 'E' }],
    evidence: item.evidence.startsWith('Simulated')
      ? item.evidence
      : `Would map to ${item.evidence.toLowerCase()} in an integrated host; simulation only`,
  };
}

const ITEMS = Object.fromEntries(
  Object.entries(RAW_ITEMS).map(([name, item]) => [
    name,
    rebalanceItem(item, KEY_POSITIONS[name] ?? 'A', FAMILY_IDS[name] ?? `FAM-${item.id}`),
  ]),
) as Record<string, ItemData>;

const EXIT_ITEMS: Record<ExitSet, [ItemData, ItemData]> = {
  A: [ITEMS.EXIT_A1, ITEMS.EXIT_A2],
  B: [ITEMS.EXIT_B1, ITEMS.EXIT_B2],
  C: [ITEMS.EXIT_C1, ITEMS.EXIT_C2],
};

const MODEL_STEPS = [
  {
    title: 'Focus on the two ring oxygens',
    lines: [
      'Ignore the name and most of the molecule for now. Locate the two marked oxygen atoms on the quinone head.',
      'The same two oxygen atoms are present in both endpoint drawings.',
    ],
  },
  {
    title: 'Follow the electrons',
    lines: [
      'Electrons entering the carrier mean the carrier is reduced.',
      'Electrons leaving the carrier mean the carrier is oxidized.',
    ],
  },
  {
    title: 'Compare only their bonds',
    lines: [
      'Reduction changes each marked C=O to C–OH. Oxidation reverses C–OH to C=O.',
      'The oxygen count stays the same; the bonding and hydrogen count change.',
    ],
  },
  {
    title: 'Balance the endpoint change',
    lines: [
      'Reduction accounting: Q + 2 H⁺ + 2 e⁻ → QH₂.',
      'The 2 H⁺ supply the two added hydrogens, while 2 H⁺ and 2 e⁻ contribute zero net charge together.',
      'This is net electron and proton accounting, not a claim that all transfers occur in one elementary step.',
    ],
  },
  {
    title: 'Hold the tail constant',
    lines: [
      'The gray carrier tail is unchanged in this comparison and does not identify the oxidation state.',
      'Read the head: electron in, C=O → C–OH, reduced. Reverse each cue for oxidation.',
    ],
  },
] as const;

const MODEL_COPY = MODEL_STEPS.flatMap((step) => [`${step.title}.`, ...step.lines]);

const SUPPORT_COPY = [
  'Find the two marked ring oxygens before reading the rest of the structure.',
  'At the oxidized endpoint they are C=O; at the reduced endpoint the same oxygens are C–OH.',
  'Use electron direction to name the change, and treat the gray carrier tail as unchanged.',
];

const CONTRAST_COPY = [
  'Near case: Q + 2 H⁺ + 2 e⁻ → QH₂. Electrons enter; two carbonyls become two hydroxyls; reduction.',
  'Reverse case: QH₂ → Q + 2 H⁺ + 2 e⁻. Electrons leave; two hydroxyls become two carbonyls; oxidation.',
  'Nonexample: two carriers can have different tail lengths but the same two-carbonyl Q head. Tail length does not distinguish the redox state of the quinone center.',
  'Acid–base boundary: adding a proton without electron transfer is not enough to call a process reduction.',
  'Intermediate boundary: quinones can participate in one-electron steps and form semiquinone intermediates. This lesson’s Q and QH₂ structures are the complete oxidized and two-electron-reduced endpoints.',
  'Thermodynamic boundary: a structure tells you the carrier’s state, not whether a particular reaction will proceed in that direction.',
  'Kinetic boundary: a structure does not tell you how fast the transfer occurs.',
];

const EXPERT_TRACE = [
  ['Cue', '“Transfers an electron pair and two protons to the carrier.”'],
  [
    'Principle',
    'A species that gains electrons is reduced. The full quinone-to-hydroquinone endpoint consumes two electrons and two protons.',
  ],
  [
    'Operation',
    'Write R–Q + 2 H⁺ + 2 e⁻ → R–QH₂. Change both designated C=O groups to C–OH; leave R unchanged.',
  ],
  [
    'Check',
    'Atoms balance, and the left-side charge contributed by 2 H⁺ and 2 e⁻ sums to zero. Because electrons are reactants, this is reduction.',
  ],
  ['Decision', 'Select R–QH₂, two C–OH, labeled reduced.'],
];

const MANIFEST_ROWS = [
  ['Lesson', 'V3-LES-329622', 'Trace biological redox carriers and centers'],
  ['Sole mastery KC', 'V3-KC-271440', 'Trace phenolic two-electron redox'],
  ['Support', 'V3-SUP-070003', 'Nonblocking reference; no evidence credit'],
  ['Extension', 'V3-EXT-072959', 'Bounded supplied-sequence application'],
  ['Referenced capstone', 'V3-CAP-162024', 'Separately owned, delivered, and measured'],
  ['First delivery', 'R14-FD-329622', 'Phase V3-PHS-935127 · module V3-MOD-820156'],
  ['Remediation', 'R14-REM-CP-066', 'Exact bounded repair checkpoint'],
  ['Revisit', 'R14-RV-329622', 'Changed representation and reduced scaffolding'],
  ['Open holds', 'V3-HOLD-110003 · V3-HOLD-110005', 'Learner validation remains pending'],
];

const RELEASE_ROWS = [
  ['Registry SHA-256', '635c39e9c0ebb28a3892399449aa9b74893aae3264924cd739b92b6e370ba26a'],
  ['Canonical freeze', 'MCAT-V3-CANONICAL-FRZ-2026-07-22-01'],
  ['Graph freeze', 'MCAT-V3-GRAPH-FRZ-2026-07-22-01'],
  ['Sequence freeze', 'MCAT-V3-SEQUENCE-FRZ-2026-07-22-01'],
  ['Content version', CONTENT_VERSION],
  ['State schema', `v${STATE_SCHEMA_VERSION}`],
  ['Prototype policy', PROTOTYPE_POLICY_VERSION],
  ['Prototype log schema', PROTOTYPE_LOG_KEY],
  ['Exposure registry schema', EXPOSURE_REGISTRY_KEY],
  ['Reviewed content hash', 'PENDING_REVIEW'],
];

const SCREEN_ROWS = [
  ['Enter', 'Goal, boundaries, and simulated route context', 'None'],
  ['Pulse', 'Electron language and carbonyl recognition', 'Would route support'],
  ['Support', 'Staged model with full point-of-use support', 'Simulation only'],
  ['Direct model', 'Five-step structure, direction, and accounting model', 'Simulation only'],
  ['Orientation', 'Post-model prediction of Q-to-QH₂ endpoint', 'Would be instructional telemetry'],
  ['Worked example', 'Cue → principle → operation → check', 'Simulation only'],
  ['A2', 'Supported equation completion', 'Simulation only'],
  ['A1', 'Cue-only reverse operation', 'Simulation only'],
  ['Contrast', 'Near, reverse, nonexample, and scope boundaries', 'No credit'],
  ['A0 set A', 'Near-use plus changed task; feedback sealed', 'Would record instructional exit'],
  ['Repair 1', 'Objective direction/structure branch', 'Would be near-transfer telemetry'],
  ['A0 set B', 'Unseen pair after repair 1', 'Would record instructional exit'],
  ['Repair 2', 'Both alternate models; final bounded cycle', 'Would be near-transfer telemetry'],
  ['A0 set C', 'Unseen final pair', 'Would record instructional exit'],
  ['Handoff', 'Simulated success or standalone planner boundary', 'No production claim'],
  ['Extension', 'Governed supplied carrier sequence', 'Simulation only'],
  [
    'Pause/exit/resume',
    'Persist exact local checkpoint without submitting',
    'Prototype state only',
  ],
  ['Reset confirmation', 'Close active run and start versioned run', 'Append-only reset trace'],
  ['Reviewer exposure', 'Expose keys and mark run exposed', 'Never untouched performance'],
  ['Timing', 'Normalized route, repair, extension, and break estimates', 'Planning metadata'],
];

const SCREEN_COPY_DETAILS: Array<{ title: string; lines: string[] }> = [
  {
    title: 'Enter',
    lines: [
      'A quinone can switch between two recognizable structures as it accepts or releases electrons. Your job is to read that structural switch and trace where the electrons went.',
      'By the end, you will label the carrier as oxidized or reduced and match it to a balanced two-electron half-reaction.',
      'This lesson will not ask whether a reaction is favorable or fast. Those are separate judgments.',
    ],
  },
  {
    title: 'Route context',
    lines: [
      'Concise-route test fixture: the reviewer attached a simulated valid-readiness flag. A clean pulse can select the concise route.',
      'Default simulation: no external readiness signal is attached. A clean pulse selects the standard route; any support signal selects the support route.',
    ],
  },
  {
    title: 'Pulse',
    lines: [
      'These two responses route support. They do not award mastery.',
      'A help request marks the pulse assisted. An omission is stored separately from an incorrect selection.',
    ],
  },
  {
    title: 'Orientation',
    lines: [
      'Look for two things: where the electrons go and whether the redox oxygens are C=O or C–OH.',
      'If two direction reversals are observed: Oxidation is not defined by adding oxygen. In electron bookkeeping, the species that accepts electrons is reduced. Here the oxygen count does not change.',
    ],
  },
  {
    title: 'A2 and A1 fading',
    lines: [
      'A2: The complete model is available, and help marks this attempt assisted.',
      'A1: Use the electron-direction cue without the complete model.',
      'A miss, omission, Not sure, or hint opens a separate supported recovery. The learner must answer that recovery correctly before fading.',
      'A supported recovery or repair allows one alternate-model retry. Repeated failure stops at the planner boundary without opening or skipping A0 and without adding a repair cycle.',
    ],
  },
  {
    title: 'Sealed A0 pair',
    lines: [
      'Commit both sealed responses before any answer-bearing feedback appears. Cross-run family exposure remains stored and visible in reviewer mode; sealed status never restores freshness.',
      'Opening the model marks the check assisted, so it cannot count toward a simulated instructional-exit outcome. The response is preserved and repair follows.',
      'Both responses are locked before feedback is revealed. Changing an answer after reveal is not permitted.',
    ],
  },
  {
    title: 'Repair cycle 1',
    lines: [
      'Electron ledger: Q + 2 H⁺ + 2 e⁻ → QH₂. Electrons are inputs, so Q is reduced. Reverse the arrow and electrons become outputs, so QH₂ is oxidized.',
      'Redox-center reader: Ignore the tail and box the two designated oxygens. Oxidized Q has two C=O groups. Reduced QH₂ has two C–OH groups.',
      'The branch basis is the objective feature of selected responses, not an inferred learner trait.',
    ],
  },
  {
    title: 'Repair cycle 2',
    lines: [
      'Alternate direction model: Cover every label except the electrons. If e⁻ exits the carrier side, call the carrier oxidized. If e⁻ enters, call it reduced.',
      'Alternate structure model: Cover the tail, names, and arrow. Compare only the two redox oxygen labels.',
      'Both alternate models are required. The next sealed set C follows, and no third repair loop is allowed.',
    ],
  },
  {
    title: 'Successful handoff',
    lines: [
      'Simulation complete. You can connect the two endpoint structures to electron flow. This is a would-emit instructional-exit result, not durable mastery or production evidence.',
      'Knowing that Q became QH₂ tells you what happened to the carrier. It does not tell you whether the complete process is thermodynamically favored or how rapidly it occurs.',
      'An integrated planner would prescribe an unseen structure, a changed representation, delayed mixed practice, and a passage context; this standalone Canvas cannot create that assignment.',
    ],
  },
  {
    title: 'Paused handoff',
    lines: [
      'Two bounded repair cycles have ended without a simulated instructional-exit result. No third loop will run, and no misconception trait or mastery result is assigned.',
      'Preserve the exact checkpoint, selected responses, assistance state, route, and repair-cycle history.',
      'An integrated planner should assign reviewed support and a later unseen family. This standalone Canvas cannot notify that planner.',
    ],
  },
  {
    title: 'Optional extension',
    lines: [
      'You do not need to memorize these carrier names. Follow only the supplied states and arrows.',
      'V3-EXT-072959 is contextual preview/application. It names V3-KC-922672, owned by V3-LES-990746, as its host core.',
      'Q takes up two electrons and 2 H⁺ to become QH₂ in the supplied sequence.',
      'The task cannot affect V3-KC-271440 evidence or emit capstone success.',
    ],
  },
  {
    title: 'Pause, exit, and resume',
    lines: [
      'Pausing preserves the exact local checkpoint and does not submit an answer or create an omission.',
      'Exit and preserve checkpoint marks the standalone view exited but cannot close the host tab or notify a planner.',
      'Resume exact checkpoint restores the same screen, responses, assistance flags, route, and repair-cycle state and logs lesson_checkpoint_resumed.',
      'kc_resumed_at_reentry is reserved for a future relation-bound repair reentry and is not used for ordinary pause/resume.',
    ],
  },
  {
    title: 'Confirmed versioned reset',
    lines: [
      'A reset is always requested first and requires explicit confirmation.',
      'Confirmation closes the active run and starts a new run ID bound to the current content and schema versions.',
      'Active responses do not transfer, but the append-only prototype log and fixed-family exposure registry retain prior presentation, hint, reveal, and reviewer records.',
      'Reused fixed families are rehearsal/simulation-only. A new run never restores freshness or evidence eligibility.',
    ],
  },
  {
    title: 'Reviewer exposure',
    lines: [
      'Opening reviewer mode marks the current run exposed before keys, rationales, and branch logic render.',
      'Reviewer exposure is persisted for every fixed item/family and remains across runs. Returning to learner mode or resetting does not restore untouched status.',
      'All outcomes in this Canvas are simulations; exposed-run outcomes are branch demonstrations only.',
    ],
  },
];

const EVIDENCE_ROWS = [
  [
    'Pulse, orientation, model, worked, A2, A1',
    'Would be instructional telemetry',
    'Not emitted by this Canvas',
  ],
  ['V3-SUP-070003', 'Would be support-use telemetry', 'Not emitted by this Canvas'],
  [
    'A0 exit sets',
    'Would be instructional-exit evidence in an integrated host',
    'Simulation outcome only',
  ],
  ['Same-item supported retry', 'Prototype rehearsal record', 'Never evidence'],
  [
    'Unseen repair checks',
    'Would be near-transfer repair telemetry',
    'Never closes delayed repair',
  ],
  ['V3-EXT-072959', 'Would be contextual extension telemetry', 'Never evidence'],
  ['Referenced capstone', 'No event authority in this lesson', 'Measured elsewhere'],
];

const ROUTE_ROWS = [
  [
    'Simulated valid-readiness flag + both pulse items correct and unassisted in this run',
    'Concise',
  ],
  ['No external readiness flag + both pulse items correct and unassisted in this run', 'Standard'],
  ['Any pulse miss, Not sure, omission, or hint', 'Support'],
  ['Missing or conflicting branch state', 'Supportive standard fallback'],
];

const TIMING_ROWS = [
  [
    'Concise core',
    '9–11 min',
    'Clean pulse through simulated handoff; orientation omitted and worked practice remains',
  ],
  ['Standard core', '13–15 min', 'Clean pulse through simulated handoff; no repair or extension'],
  ['Support increment', '+2–3 min', 'Point-of-use reference and return transition'],
  [
    'Repair increment',
    '+4–6 min per cycle',
    'One objective-feature repair cycle plus its next sealed set',
  ],
  [
    'Worst valid required branch',
    '23–30 min',
    'Standard core + support increment + both bounded repair cycles',
  ],
  ['Optional extension', '+2–3 min', 'Excluded from required progress'],
  [
    'Transitions or break',
    '+1–2 min',
    'Separate learner-controlled allowance; excluded from instructional totals',
  ],
];

const BRANCH_TESTS = [
  ['1', 'Simulated readiness flag; both pulse items clean', 'Concise route'],
  ['2', 'No prior telemetry; both pulse items clean', 'Standard route'],
  ['3', 'Any pulse help or Not sure', 'Support route'],
  ['4', 'Two direction reversals', 'Direction reset; no trait label'],
  [
    '5',
    'Set A: both valid, A0, correct, no prior/reviewer exposure',
    'Simulated would-emit instructional exit',
  ],
  ['6', 'Set A direction-feature responses', 'Repair D, then set B'],
  ['7', 'Set A structure-feature responses', 'Repair S, then set B'],
  ['8', 'Mixed direction and structure responses', 'D then S'],
  ['9', 'Exit omission', 'Nonpass; no cause inference'],
  ['10', 'Exit hint confirmed', 'Assisted and nonpassing'],
  ['11', 'Pause before commit', 'Checkpoint retained; no attempt'],
  ['12', 'Invalid item', 'Required: exclude outcome and use a reviewed replacement'],
  [
    '13',
    'Set B passes without prior/reviewer exposure',
    'Simulated exit; delayed repair remains open',
  ],
  ['14', 'Set B fails', 'Both alternate models; set C'],
  ['15', 'Set C fails', 'Paused handoff; no third loop'],
  ['16', 'Extension response', 'No KC or capstone evidence; return always available'],
  ['17', 'Lesson exit', 'No production or capstone event'],
  ['18', 'Later miss after exit', 'Required: open recency/repair overlay and preserve history'],
  ['19', 'Open reviewer workspace', 'Run marked exposed before keys render'],
  ['20', 'Return to learner after key view', 'Exposure remains monotonic'],
  ['21', 'Request reset', 'Confirmation required; no state replacement yet'],
  ['22', 'Confirm reset', 'New versioned run; old prototype log retained'],
  ['23', 'Pause then reload/resume', 'Exact local checkpoint retained; no omission'],
  [
    '24',
    'Repeated A2/A1 recovery failure',
    'One alternate-model retry, then terminal planner handoff',
  ],
  [
    '25',
    'Concise eligibility and clean pulse',
    'Orientation skipped; staged model leads to worked practice',
  ],
  ['26', 'Extension stage 2', 'Q accepts 2 e⁻ and 2 H⁺ to become QH₂'],
  [
    '27',
    'Reset after fixed-family key exposure',
    'New run remains exposed across content versions',
  ],
  [
    '28',
    'Fixed family shown in a prior run',
    'Rehearsal/simulation-only label; no restored freshness',
  ],
  [
    '29',
    'Repeated supported repair failure',
    'One alternate-model retry, then terminal handoff within two-cycle cap',
  ],
];

const NOT_IMPLEMENTED_BRANCH_CASES = ['12', '18'];

const ACCESSIBILITY_CHECKS = [
  'Every chemical visual includes a visible semantic text equivalent.',
  'Equations include spoken-language labels; superscripts and subscripts remain distinguishable at 200% zoom.',
  'State is never encoded by color alone; labels identify oxidized Q and reduced QH₂.',
  'Choice selection uses visible (x)/( ) markers; active modes and reviewer tabs use [ACTIVE]; progress uses CURRENT, DONE, and NEXT.',
  'The two redox oxygens use outline, text labels, and accent color.',
  'Choice controls expose radio-group semantics, roving tab stops, and Arrow/Home/End navigation.',
  'Commit, hint, omission, exposure, pause, and reset remain explicit labeled controls.',
  'Committed status, hints, feedback, and checkpoint changes use polite live regions.',
  'Screen and reviewer-tab wrappers receive focus on navigation as far as host rendering permits.',
  'Feedback follows the committed response in reading order and is linked to the question context.',
  'Accounting motion is learner-controlled; reduced-motion users jump to static endpoints and lose no sequence information.',
  'Text-only alternatives preserve the same structure-to-state relationship.',
  'Pausing creates no omission and preserves the exact checkpoint.',
  'No visible timer or speed-based correctness threshold is used.',
  'The mobile-first SVG scales to narrow viewports without mandatory horizontal scrolling and has a visible limitation statement.',
  'Independent keyboard and screen-reader verification remains a required publication gate.',
];

const SCIENTIFIC_EDGES = [
  'Q/QH₂ is an overall two-electron/two-proton endpoint pair; transfer may occur stepwise.',
  'Semiquinone radical states can occur and may be stabilized in protein sites.',
  'Semiquinone protonation and charge vary with environment; no universal intermediate drawing is asserted.',
  'Proton uptake or release is not identical to net proton pumping across a membrane.',
  'The acidic-aqueous half-reaction is a bookkeeping convention; biochemical transformed equations may display proton terms differently.',
  'The quinone and hydroquinone rings differ in bond order; the visual does not merely attach two H labels.',
  'CoQ contains methoxy oxygens that are not the designated redox pair.',
  'CoQ10’s 10 names side-chain isoprenoid units, not electrons or protons.',
  'Structure identifies carrier state, not spontaneous direction or kinetic rate.',
  'One carbonyl plus one hydroxyl is not asserted as a generic drawing of every semiquinone state.',
];

const PUBLICATION_GATES = [
  ['Canonical alignment', 'Required', 'IDs and pins represented', 'Not independently verified'],
  ['Scientific review', 'Required', 'Open-source citations represented', 'Two-SME review pending'],
  [
    'Blind item solving',
    'Required',
    'Keys and rationales exposed for review',
    'Independent solving pending',
  ],
  [
    'Family isolation',
    'Required',
    'Partial: persistent local item/family exposure registry',
    'Production item-service test pending',
  ],
  [
    'Deterministic routing',
    'Required',
    'Partial: core routes and bounded retries implemented; cases 12 and 18 are not',
    'Partial; full branch execution pending',
  ],
  ['Invalid-item replacement', 'Required', 'Not implemented', 'Required before release'],
  ['Post-exit reopening', 'Required', 'Not implemented', 'Required before release'],
  [
    'Event integrity',
    'Required',
    'Partial: append-only local log and exposure registry implemented',
    'Production emission not implemented or verified',
  ],
  [
    'Accessibility',
    'Required',
    'Radio, live-region, focus, text alternatives implemented',
    'Assistive-technology review pending',
  ],
  [
    'Rights and originality',
    'Required',
    'Clean-room provenance stated',
    'Similarity and rights review pending',
  ],
  ['Empirical validation', 'Required', 'Not implemented', 'Pilot pending'],
  ['Reviewed content hash', 'Required', 'Version-bound draft only', 'Exact reviewed hash pending'],
];

const SOURCES = [
  {
    label: 'IUPAC Gold Book — oxidation',
    href: 'https://goldbook.iupac.org/terms/view/O04362',
    note: 'Electron removal and oxidation-number increase.',
  },
  {
    label: 'OpenStax Chemistry 2e — redox and half-reactions',
    href: 'https://openstax.org/books/chemistry-2e/pages/4-2-classifying-chemical-reactions',
    note: 'Open instructional reference for oxidation–reduction bookkeeping.',
  },
  {
    label: 'PubChem — Hydroquinone',
    href: 'https://pubchem.ncbi.nlm.nih.gov/compound/Hydroquinone',
    note: 'Identity and structure of the reduced para-benzoquinone endpoint.',
  },
  {
    label: 'PubChem — 1,4-Benzoquinone',
    href: 'https://pubchem.ncbi.nlm.nih.gov/compound/Quinone',
    note: 'Identity and structure of the oxidized endpoint.',
  },
  {
    label: 'PubChem — Coenzyme Q10',
    href: 'https://pubchem.ncbi.nlm.nih.gov/compound/Coenzyme-Q10',
    note: 'Ubiquinone-10 identity and molecular data.',
  },
  {
    label: 'PubChem — Ubiquinol',
    href: 'https://pubchem.ncbi.nlm.nih.gov/compound/Ubiquinol',
    note: 'Reduced coenzyme-Q endpoint.',
  },
  {
    label: 'NCBI Bookshelf — electron-transport chains',
    href: 'https://www.ncbi.nlm.nih.gov/books/NBK26904/',
    note: 'Mobile membrane ubiquinone and biological electron/proton carrying.',
  },
  {
    label: 'Huynh et al. 2016 — quinone PCET',
    href: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC6206872/',
    note: 'One- and two-electron/proton-coupled quinone reduction.',
  },
  {
    label: 'Sarewicz and Osyczka 2015 — redox pools',
    href: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC4281590/',
    note: 'Quinone endpoints, semiquinones, and biological context.',
  },
];

const AUTHORITATIVE_HOST_EVENT_NAMES = [
  'lesson_shell_started',
  'kc_microcycle_started',
  'item_presented',
  'attempt_submitted',
  'hint_requested',
  'lesson_checkpoint_completed',
  'lesson_checkpoint_paused',
  'lesson_checkpoint_resumed',
  'support_artifact_opened',
  'kc_repair_activity_started',
  'kc_repair_activity_completed',
  'kc_paused_for_repair',
  'kc_resumed_at_reentry',
  'kc_instructional_exit_recorded',
  'lesson_delivery_completed',
  'practice_prescription_created',
];

const LOCAL_SIMULATION_COMPLETION_EVENTS = [
  [
    'lesson_simulation_completed',
    'Clean internal simulation reaches the success handoff',
    'Local QA trace only; never a production contract event',
  ],
  [
    'rehearsal_path_completed',
    'Reviewer or prior fixed-family exposure makes the path rehearsal-only',
    'Local QA trace only; never a production contract event',
  ],
];

const EVENT_SCOPE: Record<string, string> = {
  lesson_checkpoint_paused: 'Ordinary local pause checkpoint',
  lesson_checkpoint_resumed: 'Ordinary local pause/resume continuation',
  kc_resumed_at_reentry:
    'Reserved for relation-bound repair reentry; never used for ordinary pause/resume',
  lesson_delivery_completed:
    'Authoritative-host completion only; prohibited from local Canvas logs',
};

function blankResponse(): ResponseRecord {
  return {
    selection: null,
    committed: false,
    assisted: false,
    hintShown: false,
    retryCount: 0,
  };
}

function selectedChoice(item: ItemData, record: ResponseRecord): Choice | undefined {
  return item.choices.find((choice) => choice.id === record.selection);
}

function responseIsCorrect(item: ItemData, record: ResponseRecord): boolean {
  const choice = selectedChoice(item, record);
  return Boolean(record.committed && choice?.correct && !record.assisted);
}

function responseAnswerCorrect(item: ItemData, record: ResponseRecord): boolean {
  const choice = selectedChoice(item, record);
  return Boolean(record.committed && choice?.correct);
}

function responseNeedsRecovery(item: ItemData, record: ResponseRecord): boolean {
  const choice = selectedChoice(item, record);
  return Boolean(record.committed && (!choice?.correct || record.assisted));
}

function deriveRepairFeatures(
  items: [ItemData, ItemData],
  responses: Record<string, ResponseRecord>,
): Feature[] {
  const found: Feature[] = [];
  items.forEach((item) => {
    const record = responses[item.id] ?? blankResponse();
    const choice = selectedChoice(item, record);
    const feature =
      record.assisted || record.selection === OMIT || !choice || choice.id === 'E'
        ? 'mixed'
        : choice.feature;
    if (feature && !found.includes(feature)) {
      found.push(feature);
    }
  });
  if (
    found.includes('mixed') ||
    (found.includes('direction') && found.includes('structure')) ||
    found.length === 0
  ) {
    return ['direction', 'structure'];
  }
  return found;
}

function nextInspection(choice?: Choice) {
  if (choice?.feature === 'direction') {
    return 'Locate the electrons first: reactant-side electrons enter the carrier; product-side electrons leave it.';
  }
  if (choice?.feature === 'structure') {
    return 'Compare only the two marked oxygens—C=O or C–OH—while holding the gray tail constant.';
  }
  return 'Check electron direction first, then compare the bonds at the same two marked oxygens.';
}

function ChoiceQuestion({
  item,
  record,
  onSelect,
  onCommit,
  onOmit,
  onHint,
  showFeedback,
  sealed = false,
}: {
  item: ItemData;
  record: ResponseRecord;
  onSelect: (choiceId: string) => void;
  onCommit: () => void;
  onOmit: () => void;
  onHint: () => void;
  showFeedback: boolean;
  sealed?: boolean;
}) {
  const theme = useHostTheme();
  const choice = selectedChoice(item, record);
  const feedbackTone =
    record.selection === OMIT || choice?.id === 'E'
      ? 'warning'
      : choice?.correct
        ? 'success'
        : 'danger';

  return (
    <section className="lesson-question" aria-labelledby={`${item.id}-prompt`}>
      <Stack gap={12}>
        {item.context ? (
          <div
            id={`${item.id}-context`}
            className="lesson-question__context"
            style={{
              whiteSpace: 'pre-line',
            }}
          >
            <Text>{item.context}</Text>
          </div>
        ) : null}
        <div id={`${item.id}-prompt`}>
          <Text weight="semibold">{item.prompt}</Text>
        </div>
        <div
          role="radiogroup"
          aria-labelledby={`${item.id}-prompt`}
          aria-describedby={item.context ? `${item.id}-context` : undefined}
          style={{ display: 'grid', gap: 8 }}
        >
          {item.choices.map((option, index) => {
            const checked = record.selection === option.id;
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={checked}
                disabled={record.committed}
                onClick={() => onSelect(option.id)}
                onKeyDown={(event: {
                  key: string;
                  preventDefault: () => void;
                  currentTarget: HTMLButtonElement;
                }) => {
                  if (
                    event.key !== 'ArrowDown' &&
                    event.key !== 'ArrowRight' &&
                    event.key !== 'ArrowUp' &&
                    event.key !== 'ArrowLeft' &&
                    event.key !== 'Home' &&
                    event.key !== 'End'
                  ) {
                    return;
                  }
                  event.preventDefault();
                  const radios = Array.from(
                    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
                      '[role="radio"]',
                    ) ?? [],
                  );
                  if (!radios.length) return;
                  const current = radios.indexOf(event.currentTarget);
                  const nextIndex =
                    event.key === 'Home'
                      ? 0
                      : event.key === 'End'
                        ? radios.length - 1
                        : event.key === 'ArrowDown' || event.key === 'ArrowRight'
                          ? (current + 1) % radios.length
                          : (current - 1 + radios.length) % radios.length;
                  onSelect(item.choices[nextIndex].id);
                  radios[nextIndex].focus();
                }}
                tabIndex={checked || (!record.selection && index === 0) ? 0 : -1}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '32px minmax(0, 1fr)',
                  gap: 10,
                  alignItems: 'center',
                  width: '100%',
                  minHeight: 44,
                  padding: '12px 14px',
                  borderRadius: 12,
                  border: `1px solid ${checked ? theme.accent.primary : theme.stroke.secondary}`,
                  background: checked ? theme.fill.secondary : theme.bg.editor,
                  color: theme.text.primary,
                  textAlign: 'left',
                  font: 'inherit',
                  lineHeight: 1.45,
                  cursor: record.committed ? 'default' : 'pointer',
                  opacity: record.committed && !checked ? 0.62 : 1,
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    display: 'grid',
                    width: 28,
                    height: 28,
                    placeItems: 'center',
                    border: `1px solid ${checked ? theme.accent.primary : theme.stroke.primary}`,
                    borderRadius: '50%',
                    color: checked ? theme.accent.primary : theme.text.secondary,
                    fontWeight: 700,
                  }}
                >
                  {checked ? '✓' : option.id}
                </span>
                <span>{option.label}</span>
              </button>
            );
          })}
        </div>
        {record.hintShown ? (
          <div id={`${item.id}-hint`} role="status" aria-live="polite" aria-atomic="true">
            <Callout tone="info" title="Hint">
              {item.hint}
            </Callout>
          </div>
        ) : null}
        {!record.committed ? (
          <div className="lesson-question__actions">
            <Button
              variant="primary"
              disabled={!record.selection}
              onClick={onCommit}
              style={{ width: '100%' }}
            >
              Check answer
            </Button>
            <details className="lesson-question-more">
              <summary>Need help or want to skip?</summary>
              <div className="lesson-question-more__actions">
                <Button variant="secondary" onClick={onHint}>
                  {sealed ? 'Review the model' : 'Show hint'}
                </Button>
                <Button variant="ghost" onClick={onOmit}>
                  Continue without an answer
                </Button>
              </div>
            </details>
          </div>
        ) : sealed && !showFeedback ? (
          <div
            id={`${item.id}-interaction-status`}
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            <Text size="small" tone="secondary">
              Answer saved. Feedback appears after both answers.
            </Text>
          </div>
        ) : null}
        {record.committed && showFeedback ? (
          <div id={`${item.id}-feedback`} role="status" aria-live="polite" aria-atomic="true">
            {record.selection === OMIT ? (
              <Callout tone="warning" title="Why this needs another look">
                <Stack gap={8}>
                  <Text>{item.omission}</Text>
                  <Text>
                    <Text as="span" weight="semibold">
                      Inspect next:{' '}
                    </Text>
                    {nextInspection()}
                  </Text>
                </Stack>
              </Callout>
            ) : choice ? (
              <Callout tone={feedbackTone} title="Why">
                <Stack gap={8}>
                  <Text>{choice.feedback}</Text>
                  <Text>
                    <Text as="span" weight="semibold">
                      Inspect next:{' '}
                    </Text>
                    {nextInspection(choice)}
                  </Text>
                </Stack>
              </Callout>
            ) : null}
          </div>
        ) : null}
      </Stack>
    </section>
  );
}

function RedoxPairFigure({
  staticView = false,
  onContinue,
  continueLabel = 'Continue',
}: {
  staticView?: boolean;
  onContinue?: () => void;
  continueLabel?: string;
}) {
  const theme = useHostTheme();
  const [step, setStep] = useState(staticView ? 5 : 1);
  const [direction, setDirection] = useState<'reduction' | 'oxidation'>('reduction');
  const [playing, setPlaying] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncPreference = () => setReducedMotion(media.matches);
    syncPreference();
    media.addEventListener('change', syncPreference);
    return () => media.removeEventListener('change', syncPreference);
  }, []);

  useEffect(() => {
    if (!playing || staticView) return;
    const endpoint = direction === 'reduction' ? 5 : 1;
    if (reducedMotion) {
      setStep(endpoint);
      setPlaying(false);
      return;
    }
    if (step === endpoint) {
      setPlaying(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setStep((current) => (direction === 'reduction' ? current + 1 : current - 1));
    }, 850);
    return () => window.clearTimeout(timer);
  }, [direction, playing, reducedMotion, staticView, step]);

  const activeStep = staticView ? 5 : step;
  const current = MODEL_STEPS[activeStep - 1];
  const flowOpacity = activeStep === 2 || activeStep === 4 ? 1 : 0.34;
  const bondOpacity = activeStep === 1 || activeStep === 3 ? 1 : 0.62;
  const tailOpacity = activeStep === 5 ? 1 : 0.46;
  const transition = reducedMotion ? 'none' : 'opacity 220ms ease';
  const reduction = direction === 'reduction';

  const playReduction = () => {
    setDirection('reduction');
    if (step >= 5) setStep(1);
    setPlaying(true);
  };
  const playReverse = () => {
    setDirection('oxidation');
    if (step <= 1) setStep(5);
    setPlaying(true);
  };
  const takeStep = () => {
    setPlaying(false);
    setStep((currentStep) =>
      direction === 'reduction'
        ? currentStep >= 5
          ? 1
          : currentStep + 1
        : currentStep <= 1
          ? 5
          : currentStep - 1,
    );
  };

  return (
    <Stack gap={14}>
      {!staticView ? (
        <div>
          <Text size="small" tone="secondary">
            Step {activeStep} of {MODEL_STEPS.length}
          </Text>
          <H3 style={{ marginBottom: 8 }}>{current.title}</H3>
          <Stack gap={8}>
            {current.lines.map((line) => (
              <Text key={line}>{line}</Text>
            ))}
          </Stack>
        </div>
      ) : null}
      <figure style={{ margin: 0 }}>
        <div
          role="group"
          aria-label="Quinone electron-accounting diagram"
          style={{
            width: '100%',
            maxWidth: 520,
            margin: '0 auto',
            borderTop: `1px solid ${theme.stroke.tertiary}`,
            borderBottom: `1px solid ${theme.stroke.tertiary}`,
          }}
        >
          <svg
            viewBox="0 0 480 650"
            preserveAspectRatio="xMidYMid meet"
            width="100%"
            role="img"
            aria-labelledby="redox-pair-title redox-pair-desc"
            style={{ display: 'block', width: '100%', height: 'auto' }}
          >
            <title id="redox-pair-title">
              Electron accounting for the quinone and hydroquinone endpoints
            </title>
            <desc id="redox-pair-desc">
              A vertical comparison shows an oxidized Q head with the same two marked oxygens as
              carbonyls and a reduced QH2 head with those oxygens as hydroxyls. Reduction takes in
              two electrons and two protons; oxidation releases them. The gray carrier tail is
              labeled unchanged. The arrows show net accounting, not an elementary reaction
              mechanism.
            </desc>

            <text
              x="240"
              y="24"
              textAnchor="middle"
              fill={theme.text.primary}
              fontSize="17"
              fontWeight="700"
            >
              Oxidized Q · two C=O
            </text>
            <polygon
              points="125,105 180,75 235,105 235,165 180,195 125,165"
              fill="none"
              stroke={theme.text.secondary}
              strokeWidth="3"
            />
            <line
              x1="137"
              y1="111"
              x2="137"
              y2="159"
              stroke={theme.text.secondary}
              strokeWidth="2"
            />
            <line
              x1="223"
              y1="111"
              x2="223"
              y2="159"
              stroke={theme.text.secondary}
              strokeWidth="2"
            />
            <g style={{ opacity: bondOpacity, transition }}>
              <line
                x1="176"
                y1="77"
                x2="176"
                y2="51"
                stroke={theme.accent.primary}
                strokeWidth="3"
              />
              <line
                x1="184"
                y1="77"
                x2="184"
                y2="51"
                stroke={theme.accent.primary}
                strokeWidth="2"
              />
              <text
                x="180"
                y="44"
                textAnchor="middle"
                fill={theme.accent.primary}
                fontSize="17"
                fontWeight="700"
              >
                O₁
              </text>
              <line
                x1="176"
                y1="193"
                x2="176"
                y2="219"
                stroke={theme.accent.primary}
                strokeWidth="3"
              />
              <line
                x1="184"
                y1="193"
                x2="184"
                y2="219"
                stroke={theme.accent.primary}
                strokeWidth="2"
              />
              <text
                x="180"
                y="239"
                textAnchor="middle"
                fill={theme.accent.primary}
                fontSize="17"
                fontWeight="700"
              >
                O₂
              </text>
            </g>
            <g style={{ opacity: tailOpacity, transition }}>
              <line
                x1="235"
                y1="135"
                x2="288"
                y2="135"
                stroke={theme.text.tertiary}
                strokeWidth="3"
              />
              <path
                d="M288 135 L310 122 L332 148 L354 122 L376 148 L398 122"
                fill="none"
                stroke={theme.text.tertiary}
                strokeWidth="3"
              />
              <text
                x="330"
                y="174"
                textAnchor="middle"
                fill={theme.text.tertiary}
                fontSize="14"
                fontWeight="700"
              >
                Tail unchanged
              </text>
            </g>

            <g style={{ opacity: flowOpacity, transition }}>
              <line
                x1="72"
                y1={reduction ? 268 : 338}
                x2="72"
                y2={reduction ? 338 : 268}
                stroke={theme.accent.primary}
                strokeWidth="4"
              />
              <polygon
                points={reduction ? '72,348 62,330 82,330' : '72,258 62,276 82,276'}
                fill={theme.accent.primary}
              />
              <text
                x="272"
                y="288"
                textAnchor="middle"
                fill={theme.accent.primary}
                fontSize="16"
                fontWeight="700"
              >
                {reduction ? '2 e⁻ + 2 H⁺ enter' : '2 e⁻ + 2 H⁺ leave'}
              </text>
              <text x="272" y="316" textAnchor="middle" fill={theme.text.primary} fontSize="15">
                {reduction ? 'reduction' : 'oxidation'}
              </text>
            </g>
            <text
              x="240"
              y="374"
              textAnchor="middle"
              fill={activeStep === 4 ? theme.accent.primary : theme.text.secondary}
              fontSize="16"
              fontWeight={activeStep === 4 ? '700' : '500'}
              style={{ transition }}
            >
              {reduction ? 'Q + 2 H⁺ + 2 e⁻ → QH₂' : 'QH₂ → Q + 2 H⁺ + 2 e⁻'}
            </text>
            <text x="240" y="396" textAnchor="middle" fill={theme.text.tertiary} fontSize="12">
              Net electron accounting
            </text>

            <text
              x="240"
              y="424"
              textAnchor="middle"
              fill={theme.text.primary}
              fontSize="17"
              fontWeight="700"
            >
              Reduced QH₂ · two C–OH
            </text>
            <polygon
              points="125,513 180,483 235,513 235,573 180,603 125,573"
              fill="none"
              stroke={theme.text.secondary}
              strokeWidth="3"
            />
            <line
              x1="142"
              y1="521"
              x2="179"
              y2="500"
              stroke={theme.text.secondary}
              strokeWidth="2"
            />
            <line
              x1="181"
              y1="586"
              x2="218"
              y2="565"
              stroke={theme.text.secondary}
              strokeWidth="2"
            />
            <line
              x1="223"
              y1="521"
              x2="223"
              y2="565"
              stroke={theme.text.secondary}
              strokeWidth="2"
            />
            <g style={{ opacity: bondOpacity, transition }}>
              <line
                x1="180"
                y1="483"
                x2="180"
                y2="460"
                stroke={theme.accent.primary}
                strokeWidth="3"
              />
              <text
                x="180"
                y="454"
                textAnchor="middle"
                fill={theme.accent.primary}
                fontSize="17"
                fontWeight="700"
              >
                O₁H
              </text>
              <line
                x1="180"
                y1="603"
                x2="180"
                y2="625"
                stroke={theme.accent.primary}
                strokeWidth="3"
              />
              <text
                x="180"
                y="644"
                textAnchor="middle"
                fill={theme.accent.primary}
                fontSize="17"
                fontWeight="700"
              >
                O₂H
              </text>
            </g>
            <g style={{ opacity: tailOpacity, transition }}>
              <line
                x1="235"
                y1="543"
                x2="288"
                y2="543"
                stroke={theme.text.tertiary}
                strokeWidth="3"
              />
              <path
                d="M288 543 L310 530 L332 556 L354 530 L376 556 L398 530"
                fill="none"
                stroke={theme.text.tertiary}
                strokeWidth="3"
              />
              <text
                x="330"
                y="581"
                textAnchor="middle"
                fill={theme.text.tertiary}
                fontSize="14"
                fontWeight="700"
              >
                Tail unchanged
              </text>
            </g>
          </svg>
        </div>
        <figcaption>
          <details className="lesson-visual-details">
            <summary>Read the diagram as text</summary>
            <Text size="small" tone="secondary">
              Oxidized Q has two marked C=O groups. Taking in 2 e⁻ and 2 H⁺ gives reduced QH₂, where
              those same oxygens are C–OH. Reversing the accounting releases 2 e⁻ and 2 H⁺. The ring
              bonds reorganize while the gray tail stays unchanged.
            </Text>
          </details>
        </figcaption>
      </figure>
      {!staticView ? (
        <>
          <Row gap={8} wrap>
            <Button variant="secondary" onClick={playReduction}>
              Play reduction
            </Button>
            <Button variant="secondary" onClick={playReverse}>
              Play oxidation
            </Button>
            <Button variant="ghost" onClick={takeStep}>
              Next step
            </Button>
          </Row>
          <div role="status" aria-live="polite" aria-atomic="true">
            <Text size="small" tone="secondary">
              {reducedMotion
                ? 'Reduced motion is on: playback jumps to a static endpoint.'
                : playing
                  ? `Playing ${direction} accounting.`
                  : `${direction === 'reduction' ? 'Reduction' : 'Oxidation'} direction selected.`}
            </Text>
          </div>
          {activeStep === 5 && !playing && onContinue ? (
            <Button variant="primary" onClick={onContinue}>
              {continueLabel}
            </Button>
          ) : null}
        </>
      ) : null}
    </Stack>
  );
}

function ReferenceSupport({ onContinue }: { onContinue: () => void }) {
  return (
    <RedoxPairFigure onContinue={onContinue} continueLabel="Use the model in guided practice" />
  );
}

function ExpertTrace() {
  return (
    <Stack gap={10}>
      <H3>How an expert checks the choice</H3>
      <Callout tone="info" title="1 · Read the cue">
        An electron pair enters the carrier, so the carrier is reduced.
      </Callout>
      <Callout tone="neutral" title="2 · Change the head">
        Write R–Q + 2 H⁺ + 2 e⁻ → R–QH₂ and change both marked C=O groups to C–OH.
      </Callout>
      <Callout tone="neutral" title="3 · Check what stayed fixed">
        The atoms and net charge balance, and the gray tail R is unchanged.
      </Callout>
    </Stack>
  );
}

const LEARNER_PHASES = ['Check', 'Learn', 'Practice', 'Final check'] as const;

function learnerPhaseIndex(state: LessonState) {
  if (state.screen === 'handoff' && state.handoffReason === 'supported-retry-cap') {
    if (state.handoffItemId === ITEMS.A2_RECOVERY.id) return 2;
    if (state.handoffItemId === ITEMS.A1_RECOVERY.id) return 2;
    return 1;
  }
  if (state.screen === 'enter' || state.screen === 'pulse') return 0;
  if (
    state.screen === 'support' ||
    state.screen === 'model' ||
    state.screen === 'orientation' ||
    state.screen === 'worked'
  ) {
    return 1;
  }
  if (state.screen === 'exit' || state.screen === 'handoff') return 3;
  return 2;
}

function LearnerProgress({ state, onPause }: { state: LessonState; onPause: () => void }) {
  const currentIndex = learnerPhaseIndex(state);
  const progress = ((currentIndex + 1) / LEARNER_PHASES.length) * 100;

  return (
    <div className="lesson-progress">
      <div className="lesson-progress__topline">
        <Text size="small" tone="secondary">
          {LEARNER_PHASES[currentIndex]}
        </Text>
        <button type="button" className="lesson-progress__pause" onClick={onPause}>
          Pause
        </button>
      </div>
      <div
        className="lesson-progress__track"
        role="progressbar"
        aria-label="Lesson progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
      >
        <span style={{ width: `${progress}%` }} />
      </div>
      <ol className="lesson-progress__phases">
        {LEARNER_PHASES.map((phase, index) => (
          <li key={phase} aria-current={index === currentIndex ? 'step' : undefined}>
            {phase}
          </li>
        ))}
      </ol>
    </div>
  );
}

function LearnerView({
  state,
  setState,
  onReset,
  onPause,
  appendLog,
  exposureRegistry,
  recordExposure,
}: {
  state: LessonState;
  setState: (action: LessonState | ((previous: LessonState) => LessonState)) => void;
  onReset: () => void;
  onPause: () => void;
  appendLog: (type: string, summary: string, exposed?: boolean) => void;
  exposureRegistry: ExposureRecord[];
  recordExposure: (items: ItemData[], kind: ExposureKind) => void;
}) {
  const [repairCursor, setRepairCursor] = useState(0);

  useEffect(() => {
    setRepairCursor(0);
  }, [state.repairCycle]);

  const getRecord = (id: string) => state.responses[id] ?? blankResponse();
  const priorRunExposureCount = (item: ItemData) =>
    exposureRegistry.filter(
      (entry) =>
        entry.runId !== state.runId &&
        (entry.itemId === item.id || entry.familyId === (item.familyId ?? `FAM-${item.id}`)),
    ).length;
  const wasExposedBeforeRun = (item: ItemData) => priorRunExposureCount(item) > 0;

  const updateResponse = (id: string, patch: Partial<ResponseRecord>) => {
    setState((previous) => {
      const current = previous.responses[id] ?? blankResponse();
      return {
        ...previous,
        responses: {
          ...previous.responses,
          [id]: { ...current, ...patch },
        },
      };
    });
  };

  const select = (item: ItemData, choiceId: string) => {
    updateResponse(item.id, { selection: choiceId });
  };

  const commit = (item: ItemData) => {
    const record = getRecord(item.id);
    if (record.selection) {
      updateResponse(item.id, { committed: true });
      appendLog(
        'attempt_submitted',
        `${item.id}: committed ${record.selection}; assisted=${record.assisted}`,
      );
      if (item.assistance !== 'A0') {
        recordExposure([item], 'reveal');
      }
      const choice = selectedChoice(item, record);
      if (item.id === ITEMS.A2.id && (!choice?.correct || record.assisted)) {
        recordExposure([ITEMS.A2_RECOVERY], 'presented');
      }
      if (item.id === ITEMS.A1.id && (!choice?.correct || record.assisted)) {
        recordExposure([ITEMS.A1_RECOVERY], 'presented');
      }
    }
  };

  const omit = (item: ItemData) => {
    updateResponse(item.id, { selection: OMIT, committed: true });
    appendLog('attempt_submitted', `${item.id}: omission committed`);
    if (item.assistance !== 'A0') {
      recordExposure([item], 'reveal');
    }
    if (item.id === ITEMS.A2.id) {
      recordExposure([ITEMS.A2_RECOVERY], 'presented');
    }
    if (item.id === ITEMS.A1.id) {
      recordExposure([ITEMS.A1_RECOVERY], 'presented');
    }
  };

  const hint = (item: ItemData) => {
    updateResponse(item.id, { assisted: true, hintShown: true });
    recordExposure([item], 'hint');
  };

  const retrySupported = (item: ItemData) => {
    const current = getRecord(item.id);
    if (current.retryCount >= MAX_SUPPORTED_RETRIES) return;
    updateResponse(item.id, {
      selection: null,
      committed: false,
      assisted: true,
      hintShown: true,
      retryCount: current.retryCount + 1,
    });
    appendLog(
      'supported_retry_started',
      `${item.id}: bounded rehearsal retry ${
        current.retryCount + 1
      }/${MAX_SUPPORTED_RETRIES} opened`,
    );
    recordExposure([item], 'hint');
  };

  const stopAtSupportedRetryCap = (item: ItemData) => {
    setState((previous) =>
      previous.status === 'in-progress'
        ? {
            ...previous,
            status: 'planner-handoff',
            screen: 'handoff',
            handoffReason: 'supported-retry-cap',
            handoffItemId: item.id,
          }
        : previous,
    );
    appendLog(
      'kc_paused_for_repair',
      `${item.id}: supported retry cap reached; no A0 or additional repair cycle bypassed`,
    );
  };

  const moveTo = (screen: ScreenId, summary: string) => {
    setState((previous) =>
      previous.status === 'in-progress' ? { ...previous, screen } : previous,
    );
    appendLog('lesson_checkpoint_completed', `${state.screen} → ${screen}: ${summary}`);
    if (screen === 'pulse') {
      recordExposure([ITEMS.PULSE_ELECTRON, ITEMS.PULSE_STRUCTURE], 'presented');
    } else if (screen === 'orientation') {
      recordExposure([ITEMS.ORIENTATION], 'presented');
    } else if (screen === 'worked') {
      recordExposure([ITEMS.WORKED], 'presented');
    } else if (screen === 'a2') {
      recordExposure([ITEMS.A2], 'presented');
    } else if (screen === 'a1') {
      recordExposure([ITEMS.A1], 'presented');
    }
  };

  const sealedHintRequest = (item: ItemData) => {
    setState((previous) => ({ ...previous, pendingExitHint: item.id }));
    appendLog(
      'a0_assistance_confirmation_requested',
      `${item.id}: A0 model confirmation requested; no hint exposed yet`,
    );
  };

  const confirmSealedHint = () => {
    if (!state.pendingExitHint) return;
    const id = state.pendingExitHint;
    setState((previous) => {
      const current = previous.responses[id] ?? blankResponse();
      return {
        ...previous,
        pendingExitHint: null,
        responses: {
          ...previous.responses,
          [id]: { ...current, assisted: true, hintShown: true },
        },
      };
    });
    appendLog('a0_assistance_confirmed', `${id}: model opened; simulated exit eligibility removed`);
    const item = Object.values(ITEMS).find((candidate) => candidate.id === id);
    if (item) recordExposure([item], 'hint');
  };

  const routeAfterPulse = () => {
    const pulseItems = [ITEMS.PULSE_ELECTRON, ITEMS.PULSE_STRUCTURE];
    const needsSupport = pulseItems.some((item) => {
      const record = getRecord(item.id);
      return !responseIsCorrect(item, record);
    });
    const route: Route = needsSupport
      ? 'support'
      : state.priorEvidence === 'fresh'
        ? 'concise'
        : 'standard';
    setState((previous) => ({
      ...previous,
      route,
      screen: route === 'support' ? 'support' : 'model',
    }));
    appendLog(
      route === 'support' ? 'support_artifact_opened' : 'route_selected',
      `${route} simulation route selected from pulse and route fixture`,
    );
  };

  const beginExitSet = (set: ExitSet) => {
    if (state.status !== 'in-progress') return;
    setState((previous) => ({
      ...previous,
      screen: 'exit',
      exitSet: set,
      exitRevealed: false,
      pendingExitHint: null,
    }));
    appendLog('sealed_exit_set_started', `A0 set ${set} opened`);
    recordExposure(EXIT_ITEMS[set], 'presented');
  };

  const advanceAfterExit = () => {
    if (state.status !== 'in-progress') return;
    const pair = EXIT_ITEMS[state.exitSet];
    const pass = pair.every((item) => responseIsCorrect(item, getRecord(item.id)));
    const rehearsalOnly = state.runExposed || pair.some(wasExposedBeforeRun);
    if (pass) {
      setState((previous) => ({
        ...previous,
        status: 'simulated-success',
        screen: 'handoff',
        handoffReason: 'none',
        handoffItemId: null,
      }));
      appendLog(
        rehearsalOnly ? 'rehearsal_exit_branch_passed' : 'kc_instructional_exit_recorded',
        rehearsalOnly
          ? `WOULD-NOT-EMIT: set ${state.exitSet} passed after reviewer or prior fixed-family exposure`
          : `WOULD-EMIT only: set ${state.exitSet} passed in internal simulation`,
        rehearsalOnly,
      );
      appendLog(
        rehearsalOnly ? 'rehearsal_path_completed' : 'lesson_simulation_completed',
        rehearsalOnly
          ? 'Simulation reached successful rehearsal handoff; no instructional-exit event eligible'
          : 'WOULD-EMIT only: internal simulation reached successful handoff',
        rehearsalOnly,
      );
      return;
    }
    if (state.exitSet === 'A') {
      const features = deriveRepairFeatures(pair, state.responses);
      setState((previous) => ({
        ...previous,
        repairCycle: 1,
        repairFeatures: features,
        screen: 'repair',
      }));
      appendLog('kc_repair_activity_started', 'Repair cycle 1 opened from set A');
      recordExposure(
        [
          ...(features.includes('direction') ? [ITEMS.REPAIR_D1] : []),
          ...(features.includes('structure') ? [ITEMS.REPAIR_S1] : []),
        ],
        'presented',
      );
      return;
    }
    if (state.exitSet === 'B') {
      setState((previous) => ({
        ...previous,
        repairCycle: 2,
        repairFeatures: deriveRepairFeatures(pair, previous.responses),
        screen: 'repair',
      }));
      appendLog('kc_repair_activity_started', 'Repair cycle 2 opened from set B');
      recordExposure([ITEMS.REPAIR_D2, ITEMS.REPAIR_S2], 'presented');
      return;
    }
    setState((previous) => ({
      ...previous,
      status: 'planner-handoff',
      screen: 'handoff',
      handoffReason: 'repair-cycle-cap',
      handoffItemId: null,
    }));
    appendLog(
      'kc_paused_for_repair',
      'WOULD-EMIT only: two-cycle limit reached; standalone planner boundary shown',
    );
  };

  const renderQuestion = (item: ItemData, showFeedback = true, sealed = false) => (
    <ChoiceQuestion
      item={item}
      record={getRecord(item.id)}
      onSelect={(choiceId) => select(item, choiceId)}
      onCommit={() => commit(item)}
      onOmit={() => omit(item)}
      onHint={() => (sealed ? sealedHintRequest(item) : hint(item))}
      showFeedback={showFeedback}
      sealed={sealed}
    />
  );

  let content;

  if (state.pausedByLearner) {
    content = (
      <Stack gap={16}>
        <Callout
          tone={state.standaloneExited ? 'neutral' : 'info'}
          title={state.standaloneExited ? 'Lesson closed for now' : 'Lesson paused'}
        >
          {state.standaloneExited
            ? 'Your place and answers are saved. Return here whenever you are ready.'
            : 'Your exact place is saved. Pausing did not submit or change an answer.'}
        </Callout>
        <H1>Pick up where you left off</H1>
        <Row gap={8} wrap>
          <Button
            variant="primary"
            onClick={() => {
              setState((previous) => ({
                ...previous,
                pausedByLearner: false,
                standaloneExited: false,
              }));
              appendLog(
                'lesson_checkpoint_resumed',
                `Resumed exact local checkpoint at ${state.screen}`,
              );
            }}
          >
            Resume lesson
          </Button>
          {!state.standaloneExited ? (
            <Button
              variant="secondary"
              onClick={() => {
                setState((previous) => ({
                  ...previous,
                  standaloneExited: true,
                }));
                appendLog(
                  'standalone_exit_marked',
                  `Exited standalone view with checkpoint ${state.screen} preserved`,
                );
              }}
            >
              Leave for now
            </Button>
          ) : null}
          <Button variant="ghost" onClick={onReset}>
            Start over
          </Button>
        </Row>
      </Stack>
    );
  } else if (state.screen === 'enter') {
    content = (
      <div className="lesson-start">
        <p className="lesson-start__context">
          Chemical &amp; physical foundations · Biological redox
        </p>
        <H1>Follow electrons through biological redox</H1>
        <p className="lesson-start__summary">
          Begin with two short questions so the lesson can choose the right amount of explanation.
        </p>
        <Button
          variant="primary"
          style={{ width: '100%' }}
          onClick={() => {
            appendLog('lesson_shell_started', 'Internal quality-review shell started');
            moveTo('pulse', 'simulation started');
            appendLog('kc_microcycle_started', 'V3-KC-271440 simulation opened');
          }}
        >
          Begin starting check
        </Button>
        <details className="lesson-disclosure">
          <summary>What this lesson covers</summary>
          <div>
            <p>
              You’ll learn to label a carrier as oxidized or reduced and match it to a balanced
              two-electron half-reaction.
            </p>
            <p>
              The lesson focuses on electron movement and structure, not whether a reaction is
              favorable or fast.
            </p>
          </div>
        </details>
      </div>
    );
  } else if (state.screen === 'pulse') {
    const p1 = getRecord(ITEMS.PULSE_ELECTRON.id);
    const p2 = getRecord(ITEMS.PULSE_STRUCTURE.id);
    content = (
      <Stack gap={20}>
        <div>
          <H1>Starting check</H1>
          <Text tone="secondary">
            Two low-stakes questions choose how much explanation you see next.
          </Text>
        </div>
        {renderQuestion(ITEMS.PULSE_ELECTRON)}
        {p1.committed ? (
          <>
            <Divider />
            {renderQuestion(ITEMS.PULSE_STRUCTURE)}
          </>
        ) : null}
        {p1.committed && p2.committed ? (
          <Row gap={8} wrap>
            <Button variant="primary" onClick={routeAfterPulse}>
              Build the model
            </Button>
          </Row>
        ) : null}
      </Stack>
    );
  } else if (state.screen === 'support') {
    content = (
      <Stack gap={16}>
        <H1>Build the model</H1>
        <ReferenceSupport
          onContinue={() => moveTo('orientation', 'staged support model completed')}
        />
      </Stack>
    );
  } else if (state.screen === 'orientation') {
    const record = getRecord(ITEMS.ORIENTATION.id);
    const pulseDirection = selectedChoice(
      ITEMS.PULSE_ELECTRON,
      getRecord(ITEMS.PULSE_ELECTRON.id),
    )?.feature;
    const orientationDirection = selectedChoice(ITEMS.ORIENTATION, record)?.feature;
    const showReset =
      record.committed && pulseDirection === 'direction' && orientationDirection === 'direction';
    content = (
      <Stack gap={18}>
        <div>
          <H1>Guided practice</H1>
          <Text tone="secondary">Keep the pair visible while you predict a complete endpoint.</Text>
        </div>
        <RedoxPairFigure staticView />
        {renderQuestion(ITEMS.ORIENTATION)}
        {showReset ? (
          <Callout tone="warning" title="Reset the rule">
            Oxidation is not defined by adding oxygen. In electron bookkeeping, the species that
            accepts electrons is reduced. Here the oxygen count does not change.
          </Callout>
        ) : null}
        {record.committed ? (
          <Button
            variant="primary"
            onClick={() => moveTo('worked', 'orientation response committed')}
          >
            Continue with the model
          </Button>
        ) : null}
      </Stack>
    );
  } else if (state.screen === 'model') {
    content = (
      <Stack gap={18}>
        <H1>Build the model</H1>
        <RedoxPairFigure
          onContinue={() =>
            moveTo(
              state.route === 'concise' ? 'worked' : 'orientation',
              'staged redox model completed',
            )
          }
          continueLabel={
            state.route === 'concise'
              ? 'Use the model in guided practice'
              : 'Predict with the model'
          }
        />
      </Stack>
    );
  } else if (state.screen === 'worked') {
    const record = getRecord(ITEMS.WORKED.id);
    content = (
      <Stack gap={18}>
        <H1>Guided practice</H1>
        {renderQuestion(ITEMS.WORKED)}
        {record.committed ? (
          <>
            <ExpertTrace />
            <Button variant="primary" onClick={() => moveTo('a2', 'worked example completed')}>
              Continue guided practice
            </Button>
          </>
        ) : null}
      </Stack>
    );
  } else if (state.screen === 'a2') {
    const primary = getRecord(ITEMS.A2.id);
    const needsRecovery = responseNeedsRecovery(ITEMS.A2, primary);
    const recovery = getRecord(ITEMS.A2_RECOVERY.id);
    const recoveryIncorrect =
      recovery.committed && !responseAnswerCorrect(ITEMS.A2_RECOVERY, recovery);
    const recoveryExhausted = recoveryIncorrect && recovery.retryCount >= MAX_SUPPORTED_RETRIES;
    const canContinue =
      primary.committed && (!needsRecovery || responseAnswerCorrect(ITEMS.A2_RECOVERY, recovery));
    content = (
      <Stack gap={18}>
        <div>
          <H1>Guided practice</H1>
          <Text tone="secondary">Use the complete equation and the two marked oxygen bonds.</Text>
        </div>
        {renderQuestion(ITEMS.A2)}
        {needsRecovery ? (
          <>
            <Divider />
            <Callout tone="info" title="Rebuild the distinction first">
              <Stack gap={8}>
                <Text>
                  Electrons on the left enter the carrier, so Q is reduced: Q + 2 H⁺ + 2 e⁻ → QH₂.
                </Text>
                <Text>
                  The same two oxygens change from C=O to C–OH; the gray tail stays unchanged.
                </Text>
                <Text>Now complete a fresh carrier equation.</Text>
              </Stack>
            </Callout>
            {renderQuestion(ITEMS.A2_RECOVERY)}
            {recoveryIncorrect && !recoveryExhausted ? (
              <Button variant="secondary" onClick={() => retrySupported(ITEMS.A2_RECOVERY)}>
                Review another explanation and retry
              </Button>
            ) : null}
            {recoveryExhausted ? (
              <Callout tone="warning" title="Pause this distinction">
                <Stack gap={10}>
                  <Text>
                    This step is still unclear after another explanation. Save your place here
                    instead of moving to less-supported work.
                  </Text>
                  <Button
                    variant="primary"
                    onClick={() => stopAtSupportedRetryCap(ITEMS.A2_RECOVERY)}
                  >
                    Finish for now
                  </Button>
                </Stack>
              </Callout>
            ) : null}
          </>
        ) : null}
        {canContinue ? (
          <Button variant="primary" onClick={() => moveTo('a1', 'A2 requirement satisfied')}>
            Try with less help
          </Button>
        ) : null}
      </Stack>
    );
  } else if (state.screen === 'a1') {
    const primary = getRecord(ITEMS.A1.id);
    const needsRecovery = responseNeedsRecovery(ITEMS.A1, primary);
    const recovery = getRecord(ITEMS.A1_RECOVERY.id);
    const recoveryIncorrect =
      recovery.committed && !responseAnswerCorrect(ITEMS.A1_RECOVERY, recovery);
    const recoveryExhausted = recoveryIncorrect && recovery.retryCount >= MAX_SUPPORTED_RETRIES;
    const canContinue =
      primary.committed && (!needsRecovery || responseAnswerCorrect(ITEMS.A1_RECOVERY, recovery));
    content = (
      <Stack gap={18}>
        <div>
          <H1>Less help</H1>
          <Text tone="secondary">Use the electron-direction cue without the complete model.</Text>
        </div>
        {renderQuestion(ITEMS.A1)}
        {needsRecovery ? (
          <>
            <Divider />
            <Callout tone="info" title="Rebuild the distinction first">
              <Stack gap={8}>
                <Text>
                  A donor loses electrons and is oxidized. Put the released electrons on the product
                  side.
                </Text>
                <Text>For this endpoint pair, both marked C–OH groups return to C=O.</Text>
                <Text>Now apply that rule to a fresh carrier.</Text>
              </Stack>
            </Callout>
            {renderQuestion(ITEMS.A1_RECOVERY)}
            {recoveryIncorrect && !recoveryExhausted ? (
              <Button variant="secondary" onClick={() => retrySupported(ITEMS.A1_RECOVERY)}>
                Review another explanation and retry
              </Button>
            ) : null}
            {recoveryExhausted ? (
              <Callout tone="warning" title="Pause this distinction">
                <Stack gap={10}>
                  <Text>
                    This step is still unclear after another explanation. Save your place here
                    instead of moving to independent work.
                  </Text>
                  <Button
                    variant="primary"
                    onClick={() => stopAtSupportedRetryCap(ITEMS.A1_RECOVERY)}
                  >
                    Finish for now
                  </Button>
                </Stack>
              </Callout>
            ) : null}
          </>
        ) : null}
        {canContinue ? (
          <Button variant="primary" onClick={() => moveTo('contrast', 'A1 requirement satisfied')}>
            Continue on your own
          </Button>
        ) : null}
      </Stack>
    );
  } else if (state.screen === 'contrast') {
    content = (
      <Stack gap={14}>
        <H1>On your own</H1>
        <Callout tone="info" title="Same pair, opposite directions">
          <Stack gap={8}>
            <Text>
              Q + 2 H⁺ + 2 e⁻ → QH₂ is reduction: electrons enter and both C=O groups become C–OH.
            </Text>
            <Text>
              Reverse the equation for oxidation: electrons leave and both C–OH groups become C=O.
            </Text>
          </Stack>
        </Callout>
        <Callout tone="neutral" title="Details that do not decide the state">
          Tail length does not identify oxidation state, and proton transfer without electron
          transfer is not enough to call a process redox.
        </Callout>
        <Callout tone="neutral" title="Limits of the endpoint model">
          Quinones can pass through one-electron semiquinone states. An endpoint structure alone
          also cannot tell you whether a reaction is favorable or fast.
        </Callout>
        <Button variant="primary" onClick={() => beginExitSet('A')}>
          Begin final check
        </Button>
      </Stack>
    );
  } else if (state.screen === 'exit') {
    const pair = EXIT_ITEMS[state.exitSet];
    const firstRecord = getRecord(pair[0].id);
    const secondRecord = getRecord(pair[1].id);
    const bothCommitted = firstRecord.committed && secondRecord.committed;
    const pass = pair.every((item) => responseIsCorrect(item, getRecord(item.id)));
    content = (
      <Stack gap={18}>
        <div>
          <H1>Final check</H1>
          <Text tone="secondary">
            Answer two questions independently. You will review both results together after saving
            both answers.
          </Text>
        </div>
        {renderQuestion(pair[0], state.exitRevealed, true)}
        {firstRecord.committed ? (
          <>
            <Divider />
            {renderQuestion(pair[1], state.exitRevealed, true)}
          </>
        ) : null}
        {state.pendingExitHint ? (
          <Callout tone="warning" title="Open the model?">
            <Stack gap={10}>
              <Text>
                Opening help keeps your answer but moves you into a teaching step before a fresh
                check.
              </Text>
              <Row gap={8} wrap>
                <Button
                  variant="secondary"
                  onClick={() =>
                    setState((previous) => ({
                      ...previous,
                      pendingExitHint: null,
                    }))
                  }
                >
                  Keep working
                </Button>
                <Button variant="primary" onClick={confirmSealedHint}>
                  Open model and repair
                </Button>
              </Row>
            </Stack>
          </Callout>
        ) : null}
        {bothCommitted && !state.exitRevealed ? (
          <Callout tone="neutral" title="Both answers are saved">
            <Stack gap={10}>
              <Text>
                Review both results together. Saved answers cannot be changed after feedback opens.
              </Text>
              <Button
                variant="primary"
                onClick={() => {
                  setState((previous) => ({
                    ...previous,
                    exitRevealed: true,
                  }));
                  appendLog(
                    'sealed_feedback_revealed',
                    `A0 set ${state.exitSet} feedback revealed after both commitments`,
                  );
                  recordExposure(pair, 'reveal');
                }}
              >
                See feedback
              </Button>
            </Stack>
          </Callout>
        ) : null}
        {bothCommitted && state.exitRevealed ? (
          <Callout
            tone={pass ? 'success' : state.exitSet === 'C' ? 'warning' : 'info'}
            title={pass ? 'Final check complete' : 'Review before another check'}
          >
            <Stack gap={10}>
              <Text>
                {pass
                  ? 'Both answers consistently connect electron direction, the two oxygen bonds, and the complete endpoint equation.'
                  : state.exitSet === 'C'
                    ? 'You have worked through two focused reviews. Stop here for now and return later with a different example.'
                    : 'One or both distinctions need another look. You will review the relevant rule before answering a fresh item.'}
              </Text>
              <Button variant="primary" onClick={advanceAfterExit}>
                {pass
                  ? 'Review what you learned'
                  : state.exitSet === 'C'
                    ? 'Finish for now'
                    : 'Review the distinction'}
              </Button>
            </Stack>
          </Callout>
        ) : null}
      </Stack>
    );
  } else if (state.screen === 'repair') {
    const firstCycleItems: ItemData[] = [];
    if (state.repairFeatures.includes('direction')) {
      firstCycleItems.push(ITEMS.REPAIR_D1);
    }
    if (state.repairFeatures.includes('structure')) {
      firstCycleItems.push(ITEMS.REPAIR_S1);
    }
    const repairItems =
      state.repairCycle === 1
        ? firstCycleItems.length
          ? firstCycleItems
          : [ITEMS.REPAIR_D1, ITEMS.REPAIR_S1]
        : [ITEMS.REPAIR_D2, ITEMS.REPAIR_S2];
    const ready = repairItems.every((item) => responseAnswerCorrect(item, getRecord(item.id)));
    const activeRepairIndex = Math.min(repairCursor, repairItems.length - 1);
    const activeRepairItem = repairItems[activeRepairIndex];
    const activeRepairRecord = getRecord(activeRepairItem.id);
    const activeRepairCorrect = responseAnswerCorrect(activeRepairItem, activeRepairRecord);
    const activeRepairIncorrect = activeRepairRecord.committed && !activeRepairCorrect;
    const activeRepairExhausted =
      activeRepairIncorrect && activeRepairRecord.retryCount >= MAX_SUPPORTED_RETRIES;
    const directionRepair =
      activeRepairItem.id === ITEMS.REPAIR_D1.id || activeRepairItem.id === ITEMS.REPAIR_D2.id;
    content = (
      <Stack gap={18}>
        <div>
          <H1>Build the model</H1>
          <Text tone="secondary">Review one distinction, then apply it to a fresh carrier.</Text>
        </div>
        {directionRepair ? (
          <Callout tone="info" title="Teach: follow the electrons">
            <Stack gap={8}>
              <Text>
                If e⁻ enters the carrier, it gains electrons and is reduced. If e⁻ leaves, it loses
                electrons and is oxidized.
              </Text>
              <Text>Reduction: Q + 2 H⁺ + 2 e⁻ → QH₂. Oxidation reverses every term.</Text>
            </Stack>
          </Callout>
        ) : (
          <Callout tone="info" title="Teach: compare the same two oxygens">
            <Stack gap={8}>
              <Text>
                Oxidized Q has two marked C=O groups. Reduced QH₂ has the same oxygens as C–OH.
              </Text>
              <Text>
                Ignore the gray tail and oxygen count; neither changes between these endpoints.
              </Text>
            </Stack>
          </Callout>
        )}
        {renderQuestion(activeRepairItem)}
        {activeRepairIncorrect && !activeRepairExhausted ? (
          <Button variant="secondary" onClick={() => retrySupported(activeRepairItem)}>
            Review another explanation and retry
          </Button>
        ) : null}
        {activeRepairExhausted ? (
          <Callout tone="warning" title="Pause this distinction">
            <Stack gap={10}>
              <Text>
                This distinction is still unclear after another explanation. Save your place instead
                of advancing to a new check.
              </Text>
              <Button variant="primary" onClick={() => stopAtSupportedRetryCap(activeRepairItem)}>
                Finish for now
              </Button>
            </Stack>
          </Callout>
        ) : null}
        {activeRepairCorrect && activeRepairIndex < repairItems.length - 1 ? (
          <Button
            variant="primary"
            onClick={() => setRepairCursor((currentCursor) => currentCursor + 1)}
          >
            Review the next distinction
          </Button>
        ) : null}
        {ready && activeRepairIndex === repairItems.length - 1 ? (
          <Button
            variant="primary"
            onClick={() => {
              appendLog(
                'kc_repair_activity_completed',
                `Repair cycle ${state.repairCycle} supported checks answered correctly`,
              );
              beginExitSet(state.repairCycle === 1 ? 'B' : 'C');
            }}
          >
            Try a fresh final check
          </Button>
        ) : null}
      </Stack>
    );
  } else if (state.screen === 'handoff') {
    const extensionRecord = getRecord(ITEMS.EXTENSION.id);
    content =
      state.status === 'simulated-success' ? (
        <Stack gap={16}>
          <H1>Final check</H1>
          <Callout tone="success" title="You connected the model">
            You consistently matched electron direction, the two marked oxygen bonds, and the
            balanced endpoint equation.
          </Callout>
          <Callout tone="info" title="Keep this compact model">
            Electron in → two C=O become C–OH → reduced QH₂. Reverse the arrows and bonds for
            oxidation back to Q.
          </Callout>
          <Callout tone="neutral" title="What the structure cannot tell you">
            Knowing that Q became QH₂ tells you what happened to the carrier. It does not tell you
            whether the complete process is thermodynamically favored or how rapidly it occurs.
          </Callout>
          {extensionRecord.committed ? (
            <Callout tone="neutral" title="Optional extension completed">
              You traced the supplied electron relay. Review its feedback again if you want to
              compare each handoff.
            </Callout>
          ) : null}
          <Button
            variant="secondary"
            onClick={() => {
              setState((previous) => ({ ...previous, screen: 'extension' }));
              appendLog(
                'optional_extension_opened',
                'V3-EXT-072959 opened outside required progress',
              );
              recordExposure([ITEMS.EXTENSION], 'presented');
            }}
          >
            {extensionRecord.committed
              ? 'Review the optional extension'
              : 'Try an optional electron relay'}
          </Button>
          <Button variant="ghost" onClick={onReset}>
            Start over
          </Button>
        </Stack>
      ) : (
        <Stack gap={16}>
          <H1>Pause and return later</H1>
          <Callout tone="warning" title="Stop here for now">
            {state.handoffReason === 'supported-retry-cap'
              ? 'This distinction stayed unclear after a second explanation. Moving to less-supported work now would not help.'
              : 'Two focused reviews are complete. A later return with a different example will be more useful than repeating the same questions.'}
          </Callout>
          <Text>
            Your place and answers are saved. No label is being assigned to why the distinction was
            difficult.
          </Text>
          <Row gap={8} wrap>
            <Button variant="ghost" onClick={onReset}>
              Start over
            </Button>
          </Row>
        </Stack>
      );
  } else {
    const extensionRecord = getRecord(ITEMS.EXTENSION.id);
    content = (
      <Stack gap={18}>
        <div>
          <H1>On your own</H1>
          <Text tone="secondary">
            You do not need to memorize these carrier names. Follow only the supplied states and
            arrows.
          </Text>
        </div>
        <Callout tone="info" title="Use the same accounting">
          In Stage 2, Q accepts two electrons and 2 H⁺ from the supplied pools to become QH₂. Track
          where the pair is after each arrow.
        </Callout>
        {renderQuestion(ITEMS.EXTENSION)}
        {extensionRecord.committed ? (
          <Button
            variant="secondary"
            onClick={() => setState((previous) => ({ ...previous, screen: 'handoff' }))}
          >
            Return to summary
          </Button>
        ) : null}
      </Stack>
    );
  }

  const currentLearnerPhase = LEARNER_PHASES[learnerPhaseIndex(state)];

  return (
    <div
      className={
        state.screen === 'enter' ? 'lesson-learner lesson-learner--start' : 'lesson-learner'
      }
    >
      {state.screen !== 'enter' && !state.pausedByLearner && state.status === 'in-progress' ? (
        <LearnerProgress state={state} onPause={onPause} />
      ) : null}
      <main
        className="lesson-task"
        key={`${state.screen}-${state.exitSet}-${state.repairCycle}-${state.pausedByLearner}-${state.standaloneExited}`}
        tabIndex={-1}
        autoFocus
        aria-label={`Learner lesson: ${currentLearnerPhase}`}
      >
        {content}
      </main>
    </div>
  );
}

function ReviewerContentInventory() {
  const allItems = Object.values(ITEMS);
  const keyDistribution = ['A', 'B', 'C', 'D'].map((position) => [
    position,
    String(
      allItems.filter((item) => item.choices.find((choice) => choice.correct)?.id === position)
        .length,
    ),
  ]);
  return (
    <Stack gap={18}>
      <div>
        <H2>Screen and item inventory</H2>
        <Text tone="secondary">
          Every response option, key, exact feedback string, omission response, hint, rationale,
          assistance level, duration, and evidence use is exposed below.
        </Text>
      </div>
      <Table
        headers={['Screen', 'Learner function', 'Evidence use']}
        rows={SCREEN_ROWS}
        striped
        stickyHeader
      />
      <H3>Key-position balance</H3>
      <Text size="small" tone="secondary">
        Deterministic item-version positions; “Not sure” remains option E and is excluded from key
        counts.
      </Text>
      <Table headers={['Correct position', 'Item count']} rows={keyDistribution} />
      <H2>Screen-level exact copy registry</H2>
      {SCREEN_COPY_DETAILS.map((screen) => (
        <div key={screen.title}>
          <CollapsibleSection title={screen.title} count={screen.lines.length}>
            <Stack gap={8}>
              {screen.lines.map((line) => (
                <div key={line}>
                  <Text>{line}</Text>
                </div>
              ))}
            </Stack>
          </CollapsibleSection>
        </div>
      ))}
      <H2>Exact static instructional copy</H2>
      <CollapsibleSection title="Direct model" count={MODEL_COPY.length} defaultOpen>
        <Stack gap={8}>
          {MODEL_COPY.map((line) => (
            <div key={line}>
              <Text>{line}</Text>
            </div>
          ))}
        </Stack>
      </CollapsibleSection>
      <CollapsibleSection title="Point-of-use support" count={SUPPORT_COPY.length}>
        <Stack gap={8}>
          {SUPPORT_COPY.map((line) => (
            <div key={line}>
              <Text>{line}</Text>
            </div>
          ))}
        </Stack>
      </CollapsibleSection>
      <CollapsibleSection title="Expert trace" count={EXPERT_TRACE.length}>
        <Table headers={['Decision step', 'Exact reasoning']} rows={EXPERT_TRACE} framed={false} />
      </CollapsibleSection>
      <CollapsibleSection title="Contrast and boundaries" count={CONTRAST_COPY.length}>
        <Stack gap={8}>
          {CONTRAST_COPY.map((line) => (
            <div key={line}>
              <Text>{line}</Text>
            </div>
          ))}
        </Stack>
      </CollapsibleSection>
      <Divider />
      <H2>All item keys and rationales</H2>
      {allItems.map((item) => {
        const key = item.choices.find((choice) => choice.correct)?.id ?? 'None';
        return (
          <div key={item.id}>
            <CollapsibleSection
              title={`${item.id} · ${item.familyId ?? `FAM-${item.id}`} · ${item.title}`}
              count={item.choices.length}
              trailing={<Text size="small">Key {key}</Text>}
            >
              <Stack gap={10}>
                {item.context ? <Text tone="secondary">{item.context}</Text> : null}
                <Text weight="semibold">{item.prompt}</Text>
                <Table
                  headers={['Option', 'Exact response', 'Key', 'Exact feedback', 'Feature']}
                  rows={item.choices.map((choice) => [
                    choice.id,
                    choice.label,
                    choice.correct ? 'Yes' : 'No',
                    choice.feedback,
                    choice.feature ?? 'Correct',
                  ])}
                  framed={false}
                />
                <Text>
                  <Text as="span" weight="semibold">
                    Rationale:{' '}
                  </Text>
                  {item.rationale}
                </Text>
                <Text>
                  <Text as="span" weight="semibold">
                    Hint:{' '}
                  </Text>
                  {item.hint}
                </Text>
                <Text>
                  <Text as="span" weight="semibold">
                    Omission:{' '}
                  </Text>
                  {item.omission}
                </Text>
                <Text size="small" tone="tertiary">
                  {item.assistance} · {item.expectedSeconds}s · {item.evidence}
                </Text>
              </Stack>
            </CollapsibleSection>
          </div>
        );
      })}
    </Stack>
  );
}

function ReviewerCanonical() {
  return (
    <Stack gap={18}>
      <div>
        <H2>Canonical manifest</H2>
        <Text tone="secondary">Publication candidate bound to the pinned curriculum release.</Text>
      </div>
      <Table headers={['Entity', 'Canonical ID', 'Binding']} rows={MANIFEST_ROWS} striped />
      <H2>Release pins</H2>
      <Table headers={['Field', 'Value']} rows={RELEASE_ROWS} />
      <Callout tone="warning" title="Ownership boundary">
        V3-EXT-072959 is contextual and names a core KC owned by another lesson. V3-CAP-162024 is
        referenced but owned by V3-LES-191915. Neither may broaden this lesson’s mastery claim.
      </Callout>
      <Grid columns="repeat(auto-fit, minmax(260px, 1fr))" gap={20}>
        <section>
          <H3>Knowledge-in-use objective</H3>
          <Text>
            Given a quinone/hydroquinone or ubiquinone/ubiquinol structure—or a description of
            electron transfer—identify the oxidized and reduced endpoints, trace whether the carrier
            gained or lost electrons, and select the matching two-electron half-reaction.
          </Text>
        </section>
        <section>
          <H3>Explicit non-goals</H3>
          <Text>
            No reduction-potential calculations, Nernst equation, spontaneous direction, rate
            prediction, complete respiratory-chain memorization, detailed flavin or iron–sulfur
            mechanisms, clinical use, or universal semiquinone drawing.
          </Text>
        </section>
      </Grid>
      <H3>Required exit criterion</H3>
      <Text>
        An integrated host requires two valid, truly untouched, first-attempt A0 items to pass: one
        near-use structural task and one construct-preserving representation or operation change.
        This fixed-family Canvas cannot reassert untouched status after exposure and can only
        simulate the resulting would-emit instructional-exit decision.
      </Text>
      <H3>Normalized timing contract</H3>
      <Table headers={['Segment', 'Duration', 'Included work']} rows={TIMING_ROWS} />
    </Stack>
  );
}

function ReviewerEvidence({
  state,
  log,
  exposureRegistry,
  onRequestScenario,
}: {
  state: LessonState;
  log: PrototypeLogEntry[];
  exposureRegistry: ExposureRecord[];
  onRequestScenario: (target: ResetTarget) => void;
}) {
  const committed = Object.values(state.responses).filter((response) => response.committed).length;
  const assisted = Object.values(state.responses).filter((response) => response.assisted).length;

  return (
    <Stack gap={18}>
      <H2>Would-emit contract and deterministic routing</H2>
      <Callout tone="warning" title="No production evidence authority">
        This internal Canvas stores local simulation state and an append-only prototype audit log.
        It does not emit authoritative curriculum events, write to an evidence service, verify
        identity, or establish mastery.
      </Callout>
      <Grid columns="repeat(auto-fit, minmax(170px, 1fr))" gap={16}>
        <Stat value={state.screen} label="Saved checkpoint" />
        <Stat value={state.route} label="Current route" />
        <Stat value={committed} label="Committed responses" />
        <Stat value={assisted} label="Assisted responses" />
        <Stat value={state.repairCycle} label="Repair cycle" />
        <Stat value={state.runExposed ? 'yes' : 'no'} label="Key exposure" />
        <Stat value={exposureRegistry.length} label="Persisted exposure records" />
      </Grid>
      <H3>Route contract</H3>
      <Table headers={['Deterministic condition', 'Route']} rows={ROUTE_ROWS} />
      <Callout tone="info" title="Concise-route performance delta">
        After a simulated readiness flag and clean pulse, the concise route bypasses the orientation
        item. The staged direct model is followed by the worked item on its own learner screen; A2,
        A1, contrast, and the sealed A0 pair remain required.
      </Callout>
      <Callout tone="neutral" title="Route simulator">
        <Stack gap={10}>
          <Text>
            Each control requests a confirmed, versioned new simulation run. Existing attempts
            remain in the append-only prototype log. The concise fixture attaches a simulated
            readiness flag, not imported evidence, and still requires a clean pulse.
          </Text>
          <Row gap={8} wrap>
            <Button variant="secondary" onClick={() => onRequestScenario('standard')}>
              Test standard route
            </Button>
            <Button variant="secondary" onClick={() => onRequestScenario('concise')}>
              Test concise eligibility
            </Button>
            <Button variant="secondary" onClick={() => onRequestScenario('support')}>
              Test support route
            </Button>
          </Row>
        </Stack>
      </Callout>
      <H3>Evidence eligibility</H3>
      <Table
        headers={['Activity', 'Integrated-host meaning', 'This Canvas']}
        rows={EVIDENCE_ROWS}
        striped
      />
      <H3>Authoritative-host event contract versus this Canvas</H3>
      <Callout tone="warning" title="Completion event names are isolated">
        An authoritative integrated host would emit
        {' lesson_delivery_completed '}after an eligible completion. This internal simulation Canvas
        never appends that production-shaped name. A clean simulation path appends
        {' lesson_simulation_completed '}; an exposed or reused path appends
        {' rehearsal_path_completed '}.
      </Callout>
      <Table
        headers={[
          'Event name',
          'Authoritative-host requirement',
          'Scope',
          'Canvas behavior',
          'Host implementation',
          'Verification',
        ]}
        rows={AUTHORITATIVE_HOST_EVENT_NAMES.map((eventName) => [
          eventName,
          'Required by authoring contract',
          EVENT_SCOPE[eventName] ?? 'Integrated-host lifecycle event',
          eventName === 'lesson_delivery_completed'
            ? 'Intentionally prohibited; this Canvas never appends it'
            : eventName === 'kc_resumed_at_reentry'
              ? 'Reserved; not implemented in this standalone Canvas'
              : log.some(
                    (entry) => entry.type === eventName && entry.contentVersion === CONTENT_VERSION,
                  )
                ? 'Observed in append-only local log'
                : 'Not exercised or not instrumented',
          'Outside this Canvas',
          'Authoritative-host emission not verified here',
        ])}
        striped
      />
      <H3>Local-only simulation completion events</H3>
      <Table
        headers={['Local event', 'Used when', 'Authority']}
        rows={LOCAL_SIMULATION_COMPLETION_EVENTS}
        striped
      />
      <Text size="small" tone="secondary">
        The integrated product is required to bind registry SHA, freeze IDs, content version, policy
        version, evidence cutoff, item mapping version, route snapshot, item/family IDs, first
        attempt, assistance, correctness, omission, timing, representation, exposure, and
        contamination status. This standalone prototype does not implement or verify that full
        payload.
      </Text>
      {log.length ? (
        <>
          <H3>Versioned append-only prototype log</H3>
          <Text size="small" tone="secondary">
            Local persisted key for schema v{STATE_SCHEMA_VERSION}. Confirmed resets append a reset
            record and start a new run ID; they do not delete this log. Entries are QA traces, not
            production events.
          </Text>
          <Table
            headers={['Seq', 'Run', 'Time', 'Type', 'Summary', 'Version binding', 'Exposed']}
            rows={log.map((entry) => [
              String(entry.sequence),
              entry.runId,
              entry.at,
              entry.type,
              entry.summary,
              `${entry.contentVersion} · schema v${entry.schemaVersion} · ${
                entry.policyVersion ?? 'legacy local prototype'
              }`,
              entry.exposed ? 'Yes' : 'No',
            ])}
            striped
            stickyHeader
          />
        </>
      ) : null}
      {exposureRegistry.length ? (
        <>
          <H3>Persistent fixed-family exposure registry</H3>
          <Text size="small" tone="secondary">
            Presentation, hint, answer reveal, and reviewer exposure survive confirmed resets.
            Reusing a listed item or family in a later run is rehearsal/simulation-only; reset never
            restores freshness.
          </Text>
          <Table
            headers={['Seq', 'Run', 'Item', 'Family', 'Exposure', 'Time', 'Version binding']}
            rows={exposureRegistry.map((entry) => [
              String(entry.sequence),
              entry.runId,
              entry.itemId,
              entry.familyId,
              entry.kind,
              entry.at,
              `${entry.contentVersion} · schema ${
                entry.schemaVersion ? `v${entry.schemaVersion}` : 'legacy'
              } · ${entry.policyVersion ?? 'legacy local prototype'}`,
            ])}
            striped
            stickyHeader
          />
        </>
      ) : null}
      <H3>Branch test cases</H3>
      <Table
        headers={['Case', 'Input state', 'Expected result', 'Implementation']}
        rows={BRANCH_TESTS.map((row) => [
          ...row,
          NOT_IMPLEMENTED_BRANCH_CASES.includes(row[0])
            ? 'Required · not implemented'
            : 'Prototype implemented · not independently verified',
        ])}
        striped
        stickyHeader
      />
    </Stack>
  );
}

function ReviewerQA() {
  return (
    <Stack gap={18}>
      <H2>Accessibility, science, sources, and publication gates</H2>
      <Grid columns="repeat(auto-fit, minmax(280px, 1fr))" gap={24}>
        <section>
          <H3>Accessibility contract</H3>
          <ul>
            {ACCESSIBILITY_CHECKS.map((check) => (
              <li key={check}>
                <Text>{check}</Text>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <H3>Scientific edge cases</H3>
          <ul>
            {SCIENTIFIC_EDGES.map((edge) => (
              <li key={edge}>
                <Text>{edge}</Text>
              </li>
            ))}
          </ul>
        </section>
      </Grid>
      <H3>Publication gates</H3>
      <Table
        headers={['Gate', 'Requirement', 'Implemented here', 'Verified']}
        rows={PUBLICATION_GATES}
        striped
      />
      <Callout tone="warning" title="Internal quality-review artifact only">
        “Implemented” means represented in this standalone prototype, not production-integrated or
        independently verified. Release still requires two-SME scientific review, blind solving,
        assistive-technology testing, family isolation, rights review, full branch execution,
        rendered-content review, production event integration, and an exact reviewed hash.
      </Callout>
      <H3>Authoritative open sources</H3>
      <Stack gap={10}>
        {SOURCES.map((source) => (
          <div key={source.href}>
            <Link href={source.href}>{source.label}</Link>
            <Text size="small" tone="secondary">
              {source.note}
            </Text>
          </div>
        ))}
      </Stack>
      <H3>Originality and provenance</H3>
      <Text>
        All learner prose, examples, distractors, feedback, and figure specifications in this Canvas
        are original clean-room content. Canonical provenance: v3-authoritative-registry.json,
        v3-learner-facing-lessons.json, v3-canonical-kcs.json, v3-extensions-capstones-support.json,
        v3-prerequisite-graph.json, v3-teaching-sequences.json, v3-source-crosswalk.json, and
        mcat-complete-learning-flow.md.
      </Text>
    </Stack>
  );
}

function ReviewerView({
  state,
  setState,
  log,
  exposureRegistry,
  onRequestScenario,
}: {
  state: LessonState;
  setState: (action: LessonState | ((previous: LessonState) => LessonState)) => void;
  log: PrototypeLogEntry[];
  exposureRegistry: ExposureRecord[];
  onRequestScenario: (target: ResetTarget) => void;
}) {
  const theme = useHostTheme();
  const tabs: Array<[ReviewerTab, string]> = [
    ['canonical', 'Canonical'],
    ['content', 'Screens and keys'],
    ['evidence', 'Evidence and branches'],
    ['qa', 'QA and sources'],
  ];
  return (
    <Stack gap={20}>
      <Callout tone="warning" title="Reviewer exposure is active">
        Opening this workspace exposes keys, rationales, branch logic, and feedback. Run{' '}
        {state.runId} is marked exposed. Returning to learner mode is allowed for QA, but all
        outcomes remain simulated and cannot represent untouched performance.
      </Callout>
      <div
        role="tablist"
        aria-label="Reviewer workspace sections"
        style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}
      >
        {tabs.map(([id, label], index) => {
          const selected = state.reviewerTab === id;
          return (
            <button
              key={id}
              id={`reviewer-tab-${id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`reviewer-panel-${id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setState((previous) => ({ ...previous, reviewerTab: id }))}
              onKeyDown={(event: {
                key: string;
                preventDefault: () => void;
                currentTarget: HTMLButtonElement;
              }) => {
                if (
                  event.key !== 'ArrowRight' &&
                  event.key !== 'ArrowLeft' &&
                  event.key !== 'Home' &&
                  event.key !== 'End'
                ) {
                  return;
                }
                event.preventDefault();
                const nextIndex =
                  event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? tabs.length - 1
                      : event.key === 'ArrowRight'
                        ? (index + 1) % tabs.length
                        : (index - 1 + tabs.length) % tabs.length;
                const next = tabs[nextIndex][0];
                setState((previous) => ({ ...previous, reviewerTab: next }));
                const list =
                  event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
                    '[role="tab"]',
                  );
                list?.[nextIndex]?.focus();
              }}
              style={{
                border: `1px solid ${selected ? theme.accent.primary : theme.stroke.secondary}`,
                borderRadius: 9999,
                background: selected ? theme.fill.secondary : theme.bg.editor,
                color: theme.text.primary,
                minHeight: 44,
                padding: '5px 10px',
                font: 'inherit',
                cursor: 'pointer',
              }}
            >
              {selected ? '[ACTIVE] ' : '[ ] '}
              {label}
            </button>
          );
        })}
      </div>
      <Divider />
      <section
        key={state.reviewerTab}
        id={`reviewer-panel-${state.reviewerTab}`}
        role="tabpanel"
        aria-labelledby={`reviewer-tab-${state.reviewerTab}`}
        tabIndex={-1}
        autoFocus
      >
        {state.reviewerTab === 'canonical' ? <ReviewerCanonical /> : null}
        {state.reviewerTab === 'content' ? <ReviewerContentInventory /> : null}
        {state.reviewerTab === 'evidence' ? (
          <ReviewerEvidence
            state={state}
            log={log}
            exposureRegistry={exposureRegistry}
            onRequestScenario={onRequestScenario}
          />
        ) : null}
        {state.reviewerTab === 'qa' ? <ReviewerQA /> : null}
      </section>
    </Stack>
  );
}

export default function BiologicalRedoxLessonCanvas({ reviewMode }: { reviewMode: boolean }) {
  const theme = useHostTheme();
  const syncedReviewerRun = useRef<string | null>(null);
  const [state, setState] = useCanvasState<LessonState>(
    `mcat-redox-lesson-state-v${STATE_SCHEMA_VERSION}`,
    INITIAL_STATE,
  );
  const [prototypeLog, setPrototypeLog] = useCanvasState<PrototypeLogEntry[]>(
    PROTOTYPE_LOG_KEY,
    [],
  );
  const [exposureRegistry, setExposureRegistry] = useCanvasState<ExposureRecord[]>(
    EXPOSURE_REGISTRY_KEY,
    [],
  );
  const priorFixedFamilyKeyExposure =
    exposureRegistry.some((entry) => entry.kind === 'reviewer') ||
    prototypeLog.some((entry) => entry.type === 'reviewer_key_exposure');
  const priorRunExposureRecords = exposureRegistry.filter(
    (entry) => entry.runId !== state.runId,
  ).length;
  const currentRunHasReviewerExposure = exposureRegistry.some(
    (entry) => entry.runId === state.runId && entry.kind === 'reviewer',
  );
  const runtimeMode: Mode = reviewMode ? 'reviewer' : 'learner';
  const persistedRunExposed = state.runExposed || priorFixedFamilyKeyExposure;
  const effectiveRunExposed = reviewMode || persistedRunExposed;
  const effectiveState: LessonState = {
    ...state,
    mode: runtimeMode,
    runExposed: effectiveRunExposed,
    exposureReason: effectiveRunExposed
      ? (state.exposureReason ??
        (reviewMode
          ? 'Reviewer route exposed item keys, rationales, and branch logic.'
          : 'Fixed-family keys were exposed in an earlier local run.'))
      : null,
  };

  const appendLog = (
    type: string,
    summary: string,
    exposed = effectiveRunExposed,
    runId = state.runId,
  ) => {
    setPrototypeLog((previous) => [
      ...previous,
      {
        sequence: previous.length + 1,
        runId,
        at: new Date().toISOString(),
        type,
        summary,
        contentVersion: CONTENT_VERSION,
        schemaVersion: STATE_SCHEMA_VERSION,
        policyVersion: PROTOTYPE_POLICY_VERSION,
        exposed,
      },
    ]);
  };

  const recordExposure = (items: ItemData[], kind: ExposureKind, runId = state.runId) => {
    const at = new Date().toISOString();
    setExposureRegistry((previous) => {
      const additions = items
        .filter(
          (item) =>
            !previous.some(
              (entry) => entry.runId === runId && entry.itemId === item.id && entry.kind === kind,
            ),
        )
        .map((item, index) => ({
          sequence: previous.length + index + 1,
          runId,
          itemId: item.id,
          familyId: item.familyId ?? `FAM-${item.id}`,
          kind,
          at,
          contentVersion: CONTENT_VERSION,
          schemaVersion: STATE_SCHEMA_VERSION,
          policyVersion: PROTOTYPE_POLICY_VERSION,
        }));
      return additions.length ? [...previous, ...additions] : previous;
    });
    items.forEach((item) => {
      appendLog(
        kind === 'presented'
          ? 'item_presented'
          : kind === 'hint'
            ? 'hint_requested'
            : kind === 'reveal'
              ? 'answer_reveal_exposure'
              : 'reviewer_family_exposure',
        `${item.id} · ${item.familyId ?? `FAM-${item.id}`} · ${kind}`,
        kind === 'reviewer' ? true : effectiveRunExposed,
        runId,
      );
    });
  };

  const requestReset = (target: ResetTarget = 'default') => {
    setState((previous) => ({
      ...previous,
      resetPending: true,
      resetTarget: target,
    }));
  };

  const cancelReset = () => {
    setState((previous) => ({
      ...previous,
      resetPending: false,
      resetTarget: 'default',
    }));
  };

  const confirmReset = () => {
    const nextRun = state.runSequence + 1;
    appendLog(
      'run_reset_confirmed',
      `${state.runId} closed; new ${state.resetTarget} simulation requested as run ${nextRun}`,
    );
    const nextState = makeInitialState(nextRun, state.resetTarget);
    const runtimeNextState = {
      ...nextState,
      mode: runtimeMode,
    };
    setState(
      effectiveRunExposed
        ? {
            ...runtimeNextState,
            runExposed: true,
            exposureReason: 'Fixed-family keys were exposed before this run began.',
          }
        : runtimeNextState,
    );
    if (state.resetTarget === 'standard' || state.resetTarget === 'concise') {
      recordExposure([ITEMS.PULSE_ELECTRON, ITEMS.PULSE_STRUCTURE], 'presented', nextState.runId);
    }
  };

  const pauseRun = () => {
    if (state.status !== 'in-progress' || state.pausedByLearner) return;
    setState((previous) => ({
      ...previous,
      pausedByLearner: true,
      standaloneExited: false,
    }));
    appendLog(
      'lesson_checkpoint_paused',
      `Local checkpoint paused at ${state.screen}; no response submitted`,
    );
  };

  useEffect(() => {
    if (!reviewMode) {
      syncedReviewerRun.current = null;
      if (state.mode !== 'learner') {
        setState((previous) => ({ ...previous, mode: 'learner' }));
      }
      return;
    }

    if (state.mode !== 'reviewer' || !state.runExposed) {
      setState((previous) => ({
        ...previous,
        mode: 'reviewer',
        runExposed: true,
        exposureReason:
          previous.exposureReason ??
          'Reviewer workspace exposed item keys, rationales, and branch logic.',
      }));
    }

    if (syncedReviewerRun.current === state.runId) return;
    syncedReviewerRun.current = state.runId;

    if (currentRunHasReviewerExposure) {
      appendLog(
        'reviewer_workspace_opened',
        'Reviewer route reopened for an already-exposed run',
        true,
      );
      return;
    }

    const firstExposure = !persistedRunExposed;
    appendLog(
      firstExposure ? 'reviewer_key_exposure' : 'reviewer_workspace_opened',
      firstExposure
        ? 'Run marked exposed before reviewer keys and rationales were rendered'
        : 'Reviewer route opened for an already-exposed run',
      true,
    );
    recordExposure(Object.values(ITEMS), 'reviewer');
  }, [
    appendLog,
    currentRunHasReviewerExposure,
    persistedRunExposed,
    recordExposure,
    reviewMode,
    setState,
    state.mode,
    state.runExposed,
    state.runId,
    syncedReviewerRun,
  ]);

  const stateCompatible =
    state.schemaVersion === STATE_SCHEMA_VERSION && state.contentVersion === CONTENT_VERSION;
  const reviewerStateReady =
    state.mode === 'reviewer' && state.runExposed && currentRunHasReviewerExposure;
  const resetTargetLabel =
    state.resetTarget === 'default' ? 'default' : `${state.resetTarget} route-test`;

  return (
    <div
      className={
        reviewMode
          ? 'lesson-canvas lesson-canvas--reviewer'
          : 'lesson-canvas lesson-canvas--learner'
      }
      style={{ color: theme.text.primary }}
    >
      <Stack
        gap={reviewMode ? 24 : 0}
        style={{ maxWidth: reviewMode ? 1120 : 640, margin: '0 auto' }}
      >
        {reviewMode ? (
          <>
            <header>
              <Stack gap={10}>
                <Row gap={12} align="start" wrap>
                  <div style={{ minWidth: 0, flex: '1 1 520px' }}>
                    <H1>Trace biological redox carriers and centers</H1>
                    <Text tone="secondary">
                      V3-LES-329622 · INTERNAL QUALITY-REVIEW simulation · persistent local state
                    </Text>
                  </div>
                </Row>
                <Row gap={8} align="center" wrap>
                  <Pill size="sm">V3-KC-271440</Pill>
                  <Pill size="sm">medium depth</Pill>
                  <Pill size="sm">simulation only</Pill>
                  <Spacer />
                  <Text size="small" tone="tertiary">
                    {CONTENT_VERSION} · schema v{STATE_SCHEMA_VERSION} · {state.runId}
                  </Text>
                </Row>
              </Stack>
            </header>
            <Divider />
          </>
        ) : null}
        {reviewMode ? (
          <Callout tone="warning" title="No production authority">
            This shared learner/reviewer Canvas is for internal quality review. Outcomes are
            simulated, events are local prototype log entries, and nothing here establishes mastery,
            emits production evidence, or controls an external planner.
          </Callout>
        ) : null}
        {reviewMode && priorRunExposureRecords > 0 ? (
          <Callout tone="info" title="Persistent fixed-family history active">
            {priorRunExposureRecords} presentation, hint, reveal, or reviewer exposure record
            {priorRunExposureRecords === 1 ? '' : 's'} exist from prior runs. Reused families are
            labeled rehearsal/simulation-only; this run does not restore freshness.
          </Callout>
        ) : null}
        {reviewMode ? (
          <div role="status" aria-live="polite" aria-atomic="true">
            <Text size="small" tone="secondary">
              Run {state.runId}: {state.status}
              {effectiveRunExposed ? ' · reviewer-exposed' : ''}
              {state.pausedByLearner ? ' · locally paused' : ''}
            </Text>
          </div>
        ) : null}
        {state.resetPending ? (
          <div
            tabIndex={-1}
            autoFocus
            role="alertdialog"
            aria-modal="true"
            aria-label={
              reviewMode
                ? 'Confirm new versioned simulation run'
                : 'Confirm starting the lesson over'
            }
            onKeyDown={(event: { key: string; preventDefault: () => void }) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                cancelReset();
              }
            }}
          >
            <Callout
              tone="warning"
              title={
                reviewMode ? 'Start a new versioned simulation run?' : 'Start the lesson over?'
              }
            >
              <Stack gap={10}>
                <Text>
                  {reviewMode ? (
                    <>
                      Confirming closes active run {state.runId} and starts a
                      {` ${resetTargetLabel} `}simulation under content version {CONTENT_VERSION}{' '}
                      and schema v{STATE_SCHEMA_VERSION}. Active responses leave the new run, but
                      the append-only prototype log retains the reset record and prior run history.
                      Presentation, hint, reveal, and reviewer exposure for these fixed families
                      also carry forward. Reuse is labeled rehearsal/simulation-only; the new run
                      never restores freshness or evidence authority.
                    </>
                  ) : (
                    'Your current answers and place will be cleared. Reviewer history is retained separately.'
                  )}
                </Text>
                <Row gap={8} wrap>
                  <Button variant="primary" onClick={confirmReset}>
                    {reviewMode ? 'Confirm new simulation run' : 'Start over'}
                  </Button>
                  <Button variant="secondary" onClick={cancelReset}>
                    {reviewMode ? 'Keep current run' : 'Keep my place'}
                  </Button>
                </Row>
              </Stack>
            </Callout>
          </div>
        ) : null}
        {state.resetPending ? null : !stateCompatible ? (
          <Callout
            tone="danger"
            title={
              reviewMode ? 'Persisted state version mismatch' : 'This saved lesson is out of date'
            }
          >
            <Stack gap={10}>
              <Text>
                {reviewMode
                  ? `This state is not bound to content ${CONTENT_VERSION} and schema v${STATE_SCHEMA_VERSION}. It cannot continue. Request a confirmed compatible simulation run; no prior attempt will be represented as new evidence.`
                  : 'The lesson has changed since this place was saved. Start again to continue with the current version.'}
              </Text>
              <Button variant="primary" onClick={() => requestReset('default')}>
                {reviewMode ? 'Request compatible run' : 'Start again'}
              </Button>
            </Stack>
          </Callout>
        ) : reviewMode ? (
          reviewerStateReady ? (
            <ReviewerView
              state={effectiveState}
              setState={setState}
              log={prototypeLog}
              exposureRegistry={exposureRegistry}
              onRequestScenario={requestReset}
            />
          ) : (
            <Callout tone="info" title="Opening reviewer workspace">
              Marking this run as key-exposed before reviewer content appears.
            </Callout>
          )
        ) : (
          <LearnerView
            state={effectiveState}
            setState={setState}
            onReset={() => requestReset('default')}
            onPause={pauseRun}
            appendLog={appendLog}
            exposureRegistry={exposureRegistry}
            recordExposure={recordExposure}
          />
        )}
      </Stack>
    </div>
  );
}
