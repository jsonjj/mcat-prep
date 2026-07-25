import {
  BarChart,
  Button,
  Callout,
  Card,
  CardBody,
  CardHeader,
  CollapsibleSection,
  Divider,
  Grid,
  H1,
  H2,
  H3,
  LineChart,
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
import { useEffect, useRef } from 'react';

const STATE_SCHEMA_VERSION = 4 as const;
const CONTENT_ID = 'V3-LES-225658.associative-learning.canvas';
const CONTENT_VERSION = 'AL-CANVAS-2026-07-22.4';
const POLICY_ID = 'docs/design/mcat-complete-learning-flow.md';
const POLICY_VERSION = 'sha256:e56590830462987e2cc9ec8d523a702e75c903613020addb81da6edbcad3286b';
const REGISTRY_ID = 'v3-authoritative-registry.json';
const REGISTRY_VERSION = 'sha256:635c39e9c0ebb28a3892399449aa9b74893aae3264924cd739b92b6e370ba26a';

type Mode = 'learner' | 'reviewer';
type ReviewerTab = 'manifest' | 'screens' | 'evidence' | 'accessibility' | 'provenance' | 'qa';
type Phase =
  | 'entry'
  | 'route'
  | 'prediction'
  | 'model'
  | 'expert'
  | 'a2'
  | 'a1'
  | 'a0'
  | 'contrast'
  | 'exitNear'
  | 'exitChanged'
  | 'repair'
  | 'handoff'
  | 'paused'
  | 'complete'
  | 'extension';
type Route = 'prepared' | 'standard' | 'targeted';

type Choice = {
  id: string;
  text: string;
  rationale: string;
  correct?: boolean;
  misconception?: string;
};

type DataTableSpec = {
  caption: string;
  headers: string[];
  rows: Array<Array<string | number>>;
};

type ChartSpec = {
  kind: 'line' | 'bar';
  title: string;
  categories: string[];
  series: Array<{
    name: string;
    data: number[];
    tone?: 'success' | 'danger' | 'warning' | 'info' | 'neutral';
  }>;
  xLabel: string;
  yLabel: string;
  readingGuide: string;
  source: string;
  valueSuffix?: string;
  table: DataTableSpec;
};

type DiagramNode = {
  label: string;
  detail?: string;
};

type DiagramRow = {
  label: string;
  nodes: DiagramNode[];
  links: string[];
};

type DiagramSpec = {
  title: string;
  rows: DiagramRow[];
  textEquivalent: string;
};

type Question = {
  id: string;
  prompt: string;
  context?: string[];
  choices: Choice[];
  hint: string;
  sequence?: string[];
  table?: DataTableSpec;
};

type Screen = {
  id: string;
  stage: string;
  title: string;
  duration: string;
  intro?: string;
  body?: string[];
  bullets?: string[];
  visual?: DiagramSpec;
  sequence?: string[];
  table?: DataTableSpec;
  chart?: ChartSpec;
  annotations?: string[];
  questions?: Question[];
};

type ExitPair = {
  label: string;
  near: Screen;
  changed: Screen;
};

type KC = {
  id: string;
  label: string;
  shortLabel: string;
  competence: string;
  representations: string[];
  duration: string;
  entry: Screen;
  routeCopy: {
    prepared: string[];
    standard: string[];
    targeted: string[];
  };
  prediction: Screen;
  model: Screen;
  expert: Screen;
  a2: Screen;
  a1: Screen;
  a0: Screen;
  contrast: Screen;
  exits: [ExitPair, ExitPair, ExitPair];
  plannerExit?: ExitPair;
  repairs: [Screen, Screen];
  handoff: Screen;
  remediationId: string;
};

type Attempt = {
  selected?: string;
  committed: boolean;
  assisted: boolean;
  correct?: boolean;
  abstained?: boolean;
  exposed?: boolean;
  runId?: number;
};

type AttemptHistoryRecord = {
  seq: number;
  runId: number;
  contentVersion: string;
  kcId: string;
  questionId: string;
  selected: string;
  selectedPosition: string;
  selectedText: string;
  correct: boolean;
  assisted: boolean;
  abstained: boolean;
  exposed: boolean;
};

type ExposureRecord = {
  seq: number;
  runId: number;
  contentVersion: string;
  kind:
    | 'reviewer_keys_opened'
    | 'reviewer_during_exit'
    | 'support_during_exit'
    | 'feedback_revealed'
    | 'rerun_started';
  detail: string;
  kcId?: string;
  itemId?: string;
};

type ArchivedRun = {
  runId: number;
  contentVersion: string;
  disposition: 'internal-review-simulation';
  completedKcs: string[];
  eventCountAtArchive: number;
  reviewerExposed: boolean;
};

type CanvasEventName =
  | 'lesson_shell_started'
  | 'new_rehearsal_run_started'
  | 'kc_microcycle_started'
  | 'reviewer_mode_opened'
  | 'entry_attempt_submitted'
  | 'instruction_route_selected'
  | 'prediction_started'
  | 'provisional_route_primer_viewed'
  | 'full_model_opened'
  | 'hint_revealed'
  | 'instruction_attempt_submitted'
  | 'support_attempt_submitted'
  | 'support_opened'
  | 'exit_pair_started'
  | 'exit_attempt_submitted'
  | 'exit_pair_contaminated'
  | 'same_level_recovery_started'
  | 'repair_cycle_started'
  | 'repair_cycle_completed'
  | 'kc_simulated_exit_recorded'
  | 'kc_paused_for_repair'
  | 'external_planner_reentry_authorized'
  | 'planner_fresh_task_started'
  | 'planner_task_nonpass'
  | 'lesson_simulation_completed'
  | 'lesson_rehearsal_completed'
  | 'extension_started'
  | 'extension_attempt_submitted'
  | 'extension_completed';

type AuthoritativeHostWouldEmitEventName = 'lesson_delivery_completed';

type EventRecord = {
  seq: number;
  runId: number;
  contentId: string;
  contentVersion: string;
  policyId: string;
  policyVersion: string;
  registryId: string;
  registryVersion: string;
  type: CanvasEventName;
  kcId?: string;
  itemId?: string;
  detail: string;
};

type LessonState = {
  schemaVersion: 4;
  contentId: string;
  contentVersion: string;
  policyId: string;
  policyVersion: string;
  registryId: string;
  registryVersion: string;
  runId: number;
  runDisposition: 'internal-review-simulation';
  mode: Mode;
  reviewerTab: ReviewerTab;
  kcIndex: number;
  phase: Phase;
  attempts: Record<string, Attempt>;
  routes: Record<string, Route>;
  exitRound: number;
  repairCount: number;
  completedKcs: string[];
  supportOpen: boolean;
  extensionComplete: boolean;
  lessonComplete: boolean;
  events: EventRecord[];
  attemptHistory: AttemptHistoryRecord[];
  exposureHistory: ExposureRecord[];
  archivedRuns: ArchivedRun[];
  reviewerExposed: boolean;
  supportViewedKcs: string[];
  routePrimerViewedKcs: string[];
  contaminatedExitPairs: Record<string, string>;
  recoveryIndex: Record<string, number>;
  modelExpanded: Record<string, boolean>;
  plannerAuthorization?: {
    kcId: string;
    taskId: string;
    runId: number;
    contentVersion: string;
    policyVersion: string;
    registryVersion: string;
  };
  plannerTaskActive: boolean;
  plannerTaskUsed: boolean;
  resetConfirmation: boolean;
};

const NOT_SURE: Choice = {
  id: 'not-sure',
  text: 'Not sure — abstain',
  rationale:
    'Abstention recorded. No answer was claimed; use the deciding cue before a fresh same-level task.',
};

const table = (
  caption: string,
  headers: string[],
  rows: Array<Array<string | number>>,
): DataTableSpec => ({ caption, headers, rows });

const recoveryQuestion = (
  id: string,
  prompt: string,
  correctText: string,
  correctRationale: string,
  distractors: Array<[string, string]>,
  hint: string,
): Question => ({
  id,
  prompt,
  choices: [
    { id: 'a', text: correctText, rationale: correctRationale, correct: true },
    ...distractors.map(([text, rationale], index) => ({
      id: ['b', 'c', 'd'][index],
      text,
      rationale,
    })),
  ],
  hint,
});

const k1Entry: Screen = {
  id: 'k1-entry',
  stage: 'Entry route',
  title: 'What changed after repetition?',
  duration: '1:30',
  intro:
    'Classify the pattern, then identify the deciding observation. These two answers select an instructional route; they do not award evidence.',
  questions: [
    {
      id: 'k1-entry-classify',
      prompt:
        'A participant hears the same soft 750-Hz tone on six trials. Blink magnitude is 12, 10, 8, 6, 5, and 4 units. A checkerboard then appears. On the next presentation of the original tone, blink magnitude is 10 units. Which account best fits?',
      table: table(
        'Blink magnitude to the original tone across trials; all values are simulated',
        ['Event', 'Blink magnitude (units)'],
        [
          ['Tone trial 1', 12],
          ['Tone trial 2', 10],
          ['Tone trial 3', 8],
          ['Tone trial 4', 6],
          ['Tone trial 5', 5],
          ['Tone trial 6', 4],
          ['Checkerboard', 'different stimulus'],
          ['Original tone returns', 10],
        ],
      ),
      choices: [
        {
          id: 'a',
          text: 'Habituation followed by dishabituation',
          rationale:
            'Repetition reduced responding, and a different stimulus was followed by renewed responding to the original tone.',
          correct: true,
        },
        {
          id: 'b',
          text: 'Sensory adaptation followed by sensory recovery',
          rationale:
            'No sensory-system measure locates the decrement in sensory processing; original-response recovery after another stimulus supports dishabituation.',
          misconception: 'sensory-level',
        },
        {
          id: 'c',
          text: 'Acquisition of classical conditioning',
          rationale:
            'No second event was paired with the tone, and responding fell instead of being acquired.',
          misconception: 'association-structure',
        },
        {
          id: 'd',
          text: 'Extinction of an operant response',
          rationale: 'No emitted action is followed by a consequence.',
          misconception: 'association-structure',
        },
      ],
      hint: 'Ask what happened when the original tone returned after a different stimulus.',
    },
    {
      id: 'k1-entry-rationale',
      prompt: 'Which observation is decisive?',
      choices: [
        {
          id: 'a',
          text: 'The response to the original tone rose after a different stimulus.',
          rationale:
            'Dishabituation is measured as recovery of responding to the original habituated stimulus.',
          correct: true,
        },
        {
          id: 'b',
          text: 'The auditory receptors must have stopped detecting the tone.',
          rationale:
            'That sensory inference is unsupported, and it does not explain the rebound to the original tone.',
          misconception: 'sensory-level',
        },
        {
          id: 'c',
          text: 'The tone predicted a second event.',
          rationale: 'No predictive second event appears in the trial sequence.',
          misconception: 'association-structure',
        },
        {
          id: 'd',
          text: 'A consequence followed a voluntary action.',
          rationale: 'The record contains no action–consequence relation.',
          misconception: 'association-structure',
        },
      ],
      hint: 'Dishabituation concerns the original response after the stimulus change.',
    },
  ],
};

const k1Prediction: Screen = {
  id: 'k1-prediction',
  stage: 'Orientation and prediction',
  title: 'Predict the original response',
  duration: '0:45',
  questions: [
    {
      id: 'k1-predict',
      prompt:
        'Orienting scores to the same harmless wrist vibration are 9, 7, 5, and 3. A novel chime occurs. If the chime produces dishabituation, what is the best prediction for the next wrist-vibration score?',
      sequence: [
        'Original wrist vibration: 9',
        'Original wrist vibration: 7',
        'Original wrist vibration: 5',
        'Original wrist vibration: 3',
        'Different stimulus: novel chime',
        'Original wrist vibration returns: predict the score',
      ],
      choices: [
        {
          id: 'a',
          text: 'About 3',
          rationale: 'This predicts no recovery of the decremented response.',
        },
        {
          id: 'b',
          text: 'About 7',
          rationale: 'Dishabituation predicts a rebound toward the earlier response level.',
          correct: true,
        },
        {
          id: 'c',
          text: 'Exactly 0',
          rationale: 'Habituation need not eliminate the response completely.',
        },
        { id: 'd', text: 'Above 12', rationale: 'Recovery need not exceed the initial response.' },
      ],
      hint: 'Predict renewed responding to the original stimulus, not necessarily complete recovery.',
    },
  ],
};

const k1Model: Screen = {
  id: 'k1-model',
  stage: 'Direct model',
  title: 'First locate where the change happened',
  duration: '1:45',
  body: [
    'Imagine a desk vibration that you notice less each time. If your touch system still detects it and you can still turn your head, the falling head-turn response supports habituation. If touch-system activity itself falls, sensory adaptation is the closer explanation.',
    'Dishabituation has one extra causal test: after a different event, measure the response to the original vibration again. Responding to the new event alone does not show dishabituation.',
  ],
  bullets: [
    'Habituation: repeated stimulus, smaller behavioral response, sensory and motor systems still work.',
    'Sensory adaptation: the sensory system itself becomes less responsive.',
  ],
  visual: {
    title: 'Repetition and the dishabituation test',
    rows: [
      {
        label: 'Habituation pattern',
        nodes: [
          { label: 'Same stimulus', detail: 'repeats' },
          { label: 'Behavior', detail: 'decreases' },
        ],
        links: ['follow'],
      },
      {
        label: 'Dishabituation test',
        nodes: [
          { label: 'Different stimulus' },
          { label: 'Original stimulus', detail: 'tested again' },
          { label: 'Original response', detail: 'rebounds' },
        ],
        links: ['then', 'measure'],
      },
    ],
    textEquivalent:
      'With habituation, repeating the same stimulus is followed by less behavior. To test dishabituation, present a different stimulus, retest the original stimulus, and look for a rebound in the original response.',
  },
};

const k1Expert: Screen = {
  id: 'k1-expert',
  stage: 'Annotated expert example',
  title: 'Read the full trial structure',
  duration: '2:00',
  chart: {
    kind: 'line',
    title: 'Head-turn probability to the original desk vibration',
    categories: ['Trial 1', 'Trial 2', 'Trial 3', 'Trial 4', 'Trial 5', 'After flash'],
    series: [{ name: 'Head-turn probability', data: [92, 76, 55, 31, 18, 71], tone: 'info' }],
    xLabel: 'Original-vibration presentation',
    yLabel: 'Head-turn probability (%)',
    readingGuide:
      'Read left to right across presentations of the original vibration. Each value is the percent of trials with a head turn; the last value is measured after the separate lamp flash.',
    valueSuffix: '%',
    source: 'Source: original simulated instructional data · six original-stimulus measurements',
    table: table(
      'Accessible data for head-turn probability to the original desk vibration',
      ['Measurement', 'Head-turn probability'],
      [
        ['Original vibration 1', '92%'],
        ['Original vibration 2', '76%'],
        ['Original vibration 3', '55%'],
        ['Original vibration 4', '31%'],
        ['Original vibration 5', '18%'],
        ['Lamp flash', 'different stimulus'],
        ['Original vibration after flash', '71%'],
      ],
    ),
  },
  annotations: [
    'Cue: one stimulus repeats and responding to it falls.',
    'Control: tactile detection remains above 95%, and head-turning to a spoken name remains 90%.',
    'Operation: compare the response to the original vibration before and after the lamp flash.',
    'Conclusion: intact input and action plus an original-response rebound support habituation followed by dishabituation.',
    'Boundary: the response to the lamp flash itself is not used as the dishabituation measure.',
  ],
};

const k1A2: Screen = {
  id: 'k1-a2',
  stage: 'A2 · high support',
  title: 'Locate the final measurement',
  duration: '1:15',
  questions: [
    {
      id: 'k1-a2-item',
      prompt:
        'Skin-conductance magnitude to one repeated visual pulse is 9, 7, 5, and 4 units. A novel tone occurs. The next original visual pulse produces 8 units. The final increase is:',
      choices: [
        {
          id: 'a',
          text: 'Dishabituation',
          rationale: 'The response to the original stimulus recovered after another stimulus.',
          correct: true,
        },
        {
          id: 'b',
          text: 'Stimulus generalization',
          rationale:
            'Generalization concerns responding to a similar stimulus, not recovery to the original.',
        },
        { id: 'c', text: 'Acquisition', rationale: 'No predictive pairing was trained.' },
        {
          id: 'd',
          text: 'Sensory adaptation',
          rationale: 'Adaptation does not name this original-response rebound.',
        },
      ],
      hint: 'Identify which stimulus produced the final measurement.',
    },
  ],
};

const k1A1: Screen = {
  id: 'k1-a1',
  stage: 'A1 · reduced support',
  title: 'Transfer to viewing time',
  duration: '1:00',
  questions: [
    {
      id: 'k1-a1-item',
      prompt:
        'Viewing time for the same abstract image falls from 7 to 2 seconds. A new image appears. Viewing time for the original image then rises to 6 seconds.',
      choices: [
        {
          id: 'a',
          text: 'Habituation and dishabituation',
          rationale:
            'The response falls with repetition and rebounds to the original after a different image.',
          correct: true,
        },
        { id: 'b', text: 'Classical acquisition', rationale: 'No paired outcome exists.' },
        { id: 'c', text: 'Operant extinction', rationale: 'No response consequence exists.' },
        {
          id: 'd',
          text: 'Sensory adaptation is demonstrated',
          rationale:
            'The evidence is a stimulus-specific behavioral pattern, not a localized sensory decrement.',
        },
      ],
      hint: 'The measured response returns to the original image.',
    },
  ],
};

const k1A0: Screen = {
  id: 'k1-a0',
  stage: 'A0 · unsupported practice',
  title: 'Identify sensory-level evidence',
  duration: '1:00',
  questions: [
    {
      id: 'k1-a0-item',
      prompt:
        'During constant odor exposure, olfactory-system evoked activity falls from 40 to 8 units and perceived intensity falls. No different stimulus is introduced and no stimulus-specific behavioral response is tested.',
      choices: [
        {
          id: 'a',
          text: 'Habituation is established',
          rationale: 'Behavioral learning has not been isolated.',
        },
        {
          id: 'b',
          text: 'Dishabituation is established',
          rationale: 'No different stimulus or original-response recovery occurs.',
        },
        {
          id: 'c',
          text: 'Sensory adaptation is best supported',
          rationale:
            'The evidence directly concerns sensory responsiveness during continued stimulation.',
          correct: true,
        },
        {
          id: 'd',
          text: 'Classical conditioning is established',
          rationale: 'No predictive pairing occurs.',
        },
      ],
      hint: 'Name the level at which the measured response changes.',
    },
  ],
};

const k1Contrast: Screen = {
  id: 'k1-contrast',
  stage: 'Contrast and boundary',
  title: 'Why the nearest explanations differ',
  duration: '1:00',
  visual: {
    title: 'Three different causal structures',
    rows: [
      {
        label: 'Repetition only',
        nodes: [{ label: 'Same stimulus' }, { label: 'Response', detail: 'falls' }],
        links: ['repeats'],
      },
      {
        label: 'Predictive pairing',
        nodes: [
          { label: 'CS', detail: 'predictive cue' },
          { label: 'US', detail: 'next event' },
        ],
        links: ['predicts'],
      },
      {
        label: 'Action consequence',
        nodes: [
          { label: 'Response', detail: 'action' },
          { label: 'Consequence', detail: 'follows action' },
        ],
        links: ['changes outcome'],
      },
    ],
    textEquivalent:
      'Repetition-only learning starts with the same stimulus repeating. Classical conditioning links a predictive cue, the CS, to a following event, the US. Operant conditioning links a response to its consequence.',
  },
  body: [
    'The same downward curve can come from different causes. Habituation changes a stimulus-specific behavior, sensory adaptation changes input responsiveness, classical learning needs a cue–event pairing, and operant learning needs an action–consequence relation.',
  ],
};

const k1Exits: [ExitPair, ExitPair, ExitPair] = [
  {
    label: 'Initial unassisted simulation pair',
    near: {
      id: 'k1-x0-near',
      stage: 'Near exit · round 0',
      title: 'Chair-pulse sequence',
      duration: '1:00',
      questions: [
        {
          id: 'k1-x0-near-item',
          prompt:
            'Startle magnitude to the same weak chair pulse is 14, 11, 8, and 5. A door chime occurs. The next original chair pulse produces 12.',
          choices: [
            {
              id: 'a',
              text: 'Habituation followed by dishabituation',
              rationale:
                'Repetition reduced responding, then the response to the original pulse rebounded after a different stimulus.',
              correct: true,
            },
            {
              id: 'b',
              text: 'Sensory adaptation followed by spontaneous recovery',
              rationale: 'No rest interval or sensory-system measurement appears.',
            },
            {
              id: 'c',
              text: 'Classical extinction followed by recovery',
              rationale: 'There is no CS–US relation.',
            },
            {
              id: 'd',
              text: 'Generalization',
              rationale: 'The final measure is to the original stimulus, not merely a similar one.',
            },
          ],
          hint: 'Using help converts this exit item to instruction. Track the original chair pulse.',
        },
      ],
    },
    changed: {
      id: 'k1-x0-changed',
      stage: 'Changed-task exit · round 0',
      title: 'Sensory-response data',
      duration: '1:00',
      questions: [
        {
          id: 'k1-x0-changed-item',
          prompt:
            'During constant citrus odor, evoked sensory activity falls. A bright flash then occurs, but activity to the same odor remains at 13 units. Which interpretation is best supported?',
          table: table(
            'Evoked sensory activity during constant citrus odor; simulated units',
            ['Measurement', 'Activity (units)'],
            [
              ['Minute 0', 62],
              ['Minute 1', 38],
              ['Minute 2', 21],
              ['Minute 3', 13],
              ['After bright flash, same odor', 13],
            ],
          ),
          choices: [
            {
              id: 'a',
              text: 'Sensory adaptation',
              rationale:
                'The evidence directly measures declining sensory responsiveness during continued stimulation.',
              correct: true,
            },
            {
              id: 'b',
              text: 'Habituation is established',
              rationale:
                'The measured change is sensory responsiveness and lacks stimulus-specific behavioral controls.',
            },
            {
              id: 'c',
              text: 'Dishabituation',
              rationale: 'The original odor response did not recover after the flash.',
            },
            {
              id: 'd',
              text: 'Operant extinction',
              rationale: 'No action–consequence relation exists.',
            },
          ],
          hint: 'Using help converts this exit item to instruction. Identify the measured system.',
        },
      ],
    },
  },
  {
    label: 'Fresh pair after repair 1',
    near: {
      id: 'k1-x1-near',
      stage: 'Near exit · round 1',
      title: 'Cross-measure response matrix',
      duration: '1:00',
      questions: [
        {
          id: 'k1-x1-near-item',
          prompt:
            'Sensory input to pattern A remains stable while behavioral orienting to A falls. Pattern B still evokes strong orienting. After an unrelated tactile pulse, orienting to A rises. Which account fits all four measures?',
          table: table(
            'Cross-measure matrix; original simulated values',
            ['Measure', 'Early', 'Late', 'After tactile pulse'],
            [
              ['Sensory input to A', '94%', '92%', '93%'],
              ['Orienting to A', '85%', '25%', '70%'],
              ['Orienting to B', 'not tested', '81%', 'not tested'],
            ],
          ),
          choices: [
            {
              id: 'a',
              text: 'Habituation followed by dishabituation',
              rationale:
                'Stable input, stimulus-specific decrement, and recovery to A after another stimulus support the full account.',
              correct: true,
            },
            {
              id: 'b',
              text: 'Sensory adaptation only',
              rationale:
                'Sensory input remains stable, B still evokes orienting, and the response to A rebounds.',
            },
            {
              id: 'c',
              text: 'Classical acquisition',
              rationale: 'No second event is paired with the LED.',
            },
            { id: 'd', text: 'Operant punishment', rationale: 'No consequence follows an action.' },
          ],
          hint: 'Using help converts this exit item to instruction. Integrate measurement level, stimulus specificity, and the A retest.',
        },
      ],
    },
    changed: {
      id: 'k1-x1-changed',
      stage: 'Changed-task exit · round 1',
      title: 'Stimulus-specific decrement',
      duration: '1:00',
      questions: [
        {
          id: 'k1-x1-changed-item',
          prompt:
            'Auditory input remains stable. Orientation to one repeated frequency falls, while orientation to a different frequency remains high. What is best supported?',
          choices: [
            {
              id: 'a',
              text: 'Habituation supported by stimulus specificity',
              rationale:
                'Stable input and retained responding to another frequency argue against broad sensory or motor failure.',
              correct: true,
            },
            {
              id: 'b',
              text: 'Dishabituation',
              rationale:
                'Recovery to the original frequency after a different stimulus was not measured.',
            },
            {
              id: 'c',
              text: 'Sensory adaptation',
              rationale: 'Stable input plus stimulus-specific behavior favors habituation.',
            },
            {
              id: 'd',
              text: 'Classical conditioning',
              rationale: 'No two-stimulus predictive relation appears.',
            },
          ],
          hint: 'Using help converts this exit item to instruction. Stimulus specificity can support habituation without demonstrating dishabituation.',
        },
      ],
    },
  },
  {
    label: 'Fresh pair after repair 2',
    near: {
      id: 'k1-x2-near',
      stage: 'Near exit · round 2',
      title: 'Audit a dishabituation claim',
      duration: '1:00',
      questions: [
        {
          id: 'k1-x2-near-item',
          prompt:
            'A report shows declining response to icon A and a strong response to novel sound B, then declares dishabituation without presenting A again. Which addition is required to support that declaration?',
          choices: [
            {
              id: 'a',
              text: 'Present icon A again and show its response recovered',
              rationale:
                'Dishabituation is measured by renewed responding to the original habituated stimulus.',
              correct: true,
            },
            {
              id: 'b',
              text: 'Measure a still larger response to sound B',
              rationale: 'Response to the novel stimulus is not the dishabituation measure.',
            },
            {
              id: 'c',
              text: 'Pair sound B with a reward',
              rationale: 'That introduces conditioning and does not test recovery to A.',
            },
            {
              id: 'd',
              text: 'Remove a consequence after icon A',
              rationale: 'An action–consequence manipulation is not the required test.',
            },
          ],
          hint: 'Using help converts this exit item to instruction. Identify the missing dependent measure.',
        },
      ],
    },
    changed: {
      id: 'k1-x2-changed',
      stage: 'Changed-task exit · round 2',
      title: 'Two-event acquisition',
      duration: '1:00',
      questions: [
        {
          id: 'k1-x2-changed-item',
          prompt:
            'A blue light is repeatedly followed by an air puff. Anticipatory blinking to the blue light rises.',
          choices: [
            {
              id: 'a',
              text: 'Classical conditioning',
              rationale: 'The response changes because the light predicts a second event.',
              correct: true,
            },
            {
              id: 'b',
              text: 'Habituation',
              rationale:
                'Habituation is repetition-only response decrement, not acquisition from a cue–event relation.',
            },
            {
              id: 'c',
              text: 'Dishabituation',
              rationale: 'No habituated original response rebounds after a different stimulus.',
            },
            {
              id: 'd',
              text: 'Negative reinforcement',
              rationale: 'No action prevents or removes an event.',
            },
          ],
          hint: 'Using help converts this exit item to instruction. Count how many events are being associated.',
        },
      ],
    },
  },
];

const k1Repairs: [Screen, Screen] = [
  {
    id: 'k1-repair-1',
    stage: 'Bounded repair 1',
    title: 'A smaller behavior is not always weaker sensation',
    duration: '2:15',
    body: [
      'A commuter may stop turning toward one repeated station chime while still hearing it clearly and still turning toward their name. That selective behavioral decrease supports habituation because sensation and the turning action remain intact.',
      'If auditory-system activity itself fell during the chime, sensory adaptation would be the closer explanation. The deciding evidence is the level that changed, not merely a downward score.',
    ],
    questions: [
      {
        id: 'k1-repair-1-check',
        prompt:
          'Auditory input remains stable, orientation to one repeated tone falls, and orientation to a second tone remains high. Which explanation is best supported?',
        choices: [
          {
            id: 'a',
            text: 'Habituation',
            rationale:
              'The behavioral decrement is stimulus-specific while sensory input remains stable.',
            correct: true,
          },
          {
            id: 'b',
            text: 'Broad sensory adaptation',
            rationale: 'Stable input and preserved responding to another tone argue against this.',
          },
          {
            id: 'c',
            text: 'Dishabituation',
            rationale:
              'The response to the original tone was not retested after a different stimulus.',
          },
          {
            id: 'd',
            text: 'Operant extinction',
            rationale: 'No action’s reinforcer is discontinued.',
          },
        ],
        hint: 'Locate the change at the behavioral or sensory level.',
      },
    ],
  },
  {
    id: 'k1-repair-2',
    stage: 'Bounded repair 2',
    title: 'Novelty alone is not the dishabituation measure',
    duration: '2:15',
    sequence: [
      'Response to original stimulus declines',
      'Different stimulus occurs',
      'Original stimulus is presented again',
      'Response to original stimulus rises',
    ],
    body: [
      'Suppose orienting to a repeated fan sound has fallen. A door slam gets a strong response, but that only shows responsiveness to the slam. Present the fan sound once more: a rebound to the fan is the evidence for dishabituation.',
    ],
    questions: [
      {
        id: 'k1-repair-2-check',
        prompt: 'Which final observation completes a valid dishabituation test?',
        choices: [
          {
            id: 'a',
            text: 'A strong response to the novel stimulus',
            rationale: 'That does not measure recovery to the habituated stimulus.',
          },
          {
            id: 'b',
            text: 'A renewed response to the original stimulus',
            rationale:
              'Dishabituation is defined by recovery of the decremented original response.',
            correct: true,
          },
          {
            id: 'c',
            text: 'Lower receptor firing during the original stimulus',
            rationale: 'That supports sensory adaptation, not dishabituation.',
          },
          {
            id: 'd',
            text: 'An action followed by a reward',
            rationale: 'That is an operant relation.',
          },
        ],
        hint: 'The dependent measure must return to the original stimulus.',
      },
    ],
  },
];

const k1PlannerExit: ExitPair = {
  label: 'Externally simulated planner reentry · fresh family',
  near: {
    id: 'k1-planner-near',
    stage: 'Planner-authorized near task',
    title: 'Interpret a response matrix',
    duration: '1:20',
    questions: [
      {
        id: 'k1-planner-near-item',
        prompt:
          'Response to visual pattern A falls from 82% to 21% across repetitions. Response to untrained pattern B remains 79%. After a brief tactile pulse, response to pattern A rises to 68%. Which account fits the matrix?',
        choices: [
          {
            id: 'a',
            text: 'Habituation supported by specificity, followed by dishabituation',
            rationale:
              'Response decrement is specific to A, and responding to A recovers after a different stimulus.',
            correct: true,
          },
          {
            id: 'b',
            text: 'Broad sensory adaptation only',
            rationale:
              'Preserved responding to B and recovery to A argue against a broad sensory decrement.',
          },
          { id: 'c', text: 'Classical extinction', rationale: 'No CS–US relation is withdrawn.' },
          {
            id: 'd',
            text: 'Operant punishment',
            rationale: 'No action–consequence contingency exists.',
          },
        ],
        hint: 'This planner task is simulated. Compare A with B, then retest A after the tactile pulse.',
      },
    ],
  },
  changed: {
    id: 'k1-planner-changed',
    stage: 'Planner-authorized changed task',
    title: 'Assign two measurement levels',
    duration: '1:20',
    questions: [
      {
        id: 'k1-planner-changed-item',
        prompt:
          'Study H shows stable sensory input, declining orienting to one repeated cue, and preserved orienting to another cue. Study S shows declining receptor output during constant stimulation and no behavioral specificity test. Which mapping is warranted?',
        choices: [
          {
            id: 'a',
            text: 'H supports habituation; S supports sensory adaptation',
            rationale:
              'H isolates stimulus-specific behavioral learning; S directly measures sensory decrement.',
            correct: true,
          },
          {
            id: 'b',
            text: 'H supports adaptation; S supports dishabituation',
            rationale:
              'The measurement levels are reversed and S has no original-response rebound.',
          },
          {
            id: 'c',
            text: 'Both demonstrate dishabituation',
            rationale:
              'Neither study includes the required different-stimulus then original-stimulus recovery sequence.',
          },
          {
            id: 'd',
            text: 'Both demonstrate conditioning',
            rationale: 'No predictive pairing or action consequence appears.',
          },
        ],
        hint: 'This planner task is simulated. Locate each decrement at the behavioral or sensory level.',
      },
    ],
  },
};

const KC1: KC = {
  id: 'V3-KC-337354',
  label: 'Distinguish habituation and dishabituation',
  shortLabel: 'Habituation',
  competence:
    'Given repeated-stimulus or stimulus-change evidence, distinguish habituation, dishabituation, sensory adaptation, and conditioning.',
  representations: ['response-over-trials graph', 'stimulus-change vignette'],
  duration: '14–16 min',
  entry: k1Entry,
  routeCopy: {
    prepared: [
      'Both entry decisions were correct, unassisted, and unexposed.',
      'The direct model begins compact, but all supported practice and both simulated exit tasks remain required.',
    ],
    standard: [
      'The answers did not show one repeated provisional response pattern.',
      'Use the full model and expert example before support is faded.',
    ],
    targeted: [
      'Two responses provisionally match a sensory-level-versus-behavioral response pattern; this is an instructional hypothesis, not a diagnosis.',
      'Review the contrast primer before predicting. Performance, not the route label, controls later fading.',
    ],
  },
  prediction: k1Prediction,
  model: k1Model,
  expert: k1Expert,
  a2: k1A2,
  a1: k1A1,
  a0: k1A0,
  contrast: k1Contrast,
  exits: k1Exits,
  plannerExit: k1PlannerExit,
  repairs: k1Repairs,
  handoff: {
    id: 'k1-handoff',
    stage: 'Handoff',
    title: 'From repetition to prediction',
    duration: '0:20',
    body: [
      'You analyzed change caused by repeating one stimulus. Next, two events will be linked so that one predicts the other.',
    ],
  },
  remediationId: 'R14-REM-PS-048',
};

const k2Entry: Screen = {
  id: 'k2-entry',
  stage: 'Entry route',
  title: 'Map stimuli and responses',
  duration: '1:30',
  questions: [
    {
      id: 'k2-entry-map',
      prompt:
        'A green square initially produces no blink. A brief air puff naturally produces a blink. After repeated green-square → air-puff trials, the green square alone produces an anticipatory blink. Which mapping is correct?',
      sequence: [
        'Before: green square → no blink',
        'Before: air puff → blink',
        'Training: green square → air puff',
        'After: green square alone → anticipatory blink',
      ],
      choices: [
        {
          id: 'a',
          text: 'Square NS→CS; puff US; blink to puff UR; blink to square CR',
          rationale:
            'Stimulus and response labels follow their functions before and after acquisition.',
          correct: true,
        },
        {
          id: 'b',
          text: 'Square US; puff CS; blink to puff CR; blink to square UR',
          rationale: 'The puff elicits an unlearned response; the square acquires its function.',
          misconception: 'label-reversal',
        },
        {
          id: 'c',
          text: 'Square remains NS after training',
          rationale: 'A cue that elicits the learned response after pairing functions as the CS.',
          misconception: 'label-reversal',
        },
        {
          id: 'd',
          text: 'The blink was operantly reinforced',
          rationale: 'No consequence follows an emitted blink.',
          misconception: 'relation-reversal',
        },
      ],
      hint: 'Separate stimuli from responses, then ask which relation required training.',
    },
    {
      id: 'k2-entry-rationale',
      prompt: 'Which label can change for the same cue across acquisition?',
      choices: [
        {
          id: 'a',
          text: 'NS can become CS',
          rationale:
            'The cue changes from neutral to conditioned as it acquires predictive control.',
          correct: true,
        },
        {
          id: 'b',
          text: 'US can become UR',
          rationale: 'A stimulus does not become a response.',
          misconception: 'label-reversal',
        },
        {
          id: 'c',
          text: 'UR can become NS',
          rationale: 'A response does not become a stimulus.',
          misconception: 'label-reversal',
        },
        {
          id: 'd',
          text: 'CR can become US',
          rationale: 'Conditioned responses and unconditioned stimuli are different event types.',
          misconception: 'label-reversal',
        },
      ],
      hint: 'The initially neutral cue changes its functional label.',
    },
  ],
};

const k2Prediction: Screen = {
  id: 'k2-prediction',
  stage: 'Orientation and prediction',
  title: 'Predict a cue-alone probe',
  duration: '0:50',
  questions: [
    {
      id: 'k2-predict',
      prompt:
        'A yellow diamond alone produces 0 anticipatory blinks in 10 trials. A puff alone produces 10 reflex blinks in 10 trials. Across diamond → puff acquisition blocks, anticipatory blinking rises 0, 1, 3, 5, 7, and 8 of 10. What should occur on an immediate diamond-alone probe?',
      choices: [
        {
          id: 'a',
          text: 'A high rate of conditioned anticipatory blinking',
          rationale: 'The diamond acquired predictive control through the pairings.',
          correct: true,
        },
        {
          id: 'b',
          text: 'Only an unconditioned blink',
          rationale: 'The puff is absent, so a diamond-elicited blink is conditioned.',
        },
        {
          id: 'c',
          text: 'No blink because the puff is absent',
          rationale: 'This ignores the acquired cue–event relation.',
        },
        {
          id: 'd',
          text: 'A reinforced voluntary response',
          rationale: 'The trial models stimulus–stimulus learning, not action consequences.',
        },
      ],
      hint: 'Use the acquisition curve to predict responding to the cue alone.',
    },
  ],
};

const k2Model: Screen = {
  id: 'k2-model',
  stage: 'Direct model',
  title: 'A pairing makes one event predict the next',
  duration: '2:00',
  visual: {
    title: 'Classical-conditioning sequence',
    rows: [
      {
        label: 'Before learning',
        nodes: [
          { label: 'US', detail: 'air puff' },
          { label: 'UR', detail: 'reflex blink' },
        ],
        links: ['naturally elicits'],
      },
      {
        label: 'During learning',
        nodes: [
          { label: 'CS', detail: 'cue; first an NS' },
          { label: 'US', detail: 'air puff' },
        ],
        links: ['predicts'],
      },
      {
        label: 'After learning',
        nodes: [
          { label: 'CS', detail: 'cue alone' },
          { label: 'CR', detail: 'anticipatory blink' },
        ],
        links: ['elicits'],
      },
    ],
    textEquivalent:
      'Before learning, the unconditioned stimulus naturally elicits the unconditioned response. During learning, the cue, which began as a neutral stimulus, is paired with and predicts the unconditioned stimulus. After learning, that cue is a conditioned stimulus and elicits a conditioned response.',
  },
  body: [
    'At a bakery, a chime that reliably comes just before a warm sample can begin to trigger anticipation. The chime is the cue; the sample is the event it predicts. No voluntary action has to produce the sample.',
    'NS, US, and CS name stimuli. UR and CR name responses. The same cue changes from NS to CS when it gains predictive control; a stimulus never turns into a response.',
  ],
};

const k2Expert: Screen = {
  id: 'k2-expert',
  stage: 'Annotated expert example',
  title: 'Follow acquisition, extinction, and return',
  duration: '2:30',
  chart: {
    kind: 'line',
    title: 'Anticipatory blinking across conditioning phases',
    categories: ['Acq 1', 'Acq 2', 'Acq 3', 'Acq 4', 'Ext 1', 'Ext 2', 'Ext 3', 'Ext 4', '24h'],
    series: [{ name: 'Anticipatory blinks', data: [0, 2, 5, 8, 7, 4, 2, 0, 3], tone: 'info' }],
    xLabel: 'Training block and post-rest probe',
    yLabel: 'Anticipatory blinks (out of 10 trials)',
    readingGuide:
      'Each x-axis position is one 10-trial block or the later probe. The y-axis is a count from 0 to 10 anticipatory blinks, not a percentage.',
    source:
      'Source: original simulated instructional data · acquisition, extinction, and 24-hour probe',
    table: table(
      'Accessible conditioning data',
      ['Phase', 'Anticipatory blinks out of 10'],
      [
        ['Acquisition block 1', 0],
        ['Acquisition block 2', 2],
        ['Acquisition block 3', 5],
        ['Acquisition block 4', 8],
        ['Extinction block 1', 7],
        ['Extinction block 2', 4],
        ['Extinction block 3', 2],
        ['Extinction block 4', 0],
        ['After 24-hour rest', 3],
      ],
    ),
  },
  annotations: [
    'Amber hexagon begins as NS; a brief puff is US and its reflex blink is UR.',
    'Anticipatory blinking rises while the hexagon precedes the puff: acquisition.',
    'Hexagon-alone blocks reduce the CR: extinction.',
    'A partial CR returns after 24 hours without new pairing: spontaneous recovery.',
    'Before differential training, an amber pentagon evokes 5/10 responses: generalization.',
    'After amber hexagon → puff and blue hexagon → no puff, responses are 8/10 versus 1/10: discrimination.',
    'A striped frame paired with the established hexagon later evokes 3/10 responses: higher-order conditioning.',
  ],
};

const k2A2: Screen = {
  id: 'k2-a2',
  stage: 'A2 · high support',
  title: 'Label a fresh sequence',
  duration: '1:20',
  questions: [
    {
      id: 'k2-a2-item',
      prompt:
        'A blue triangle initially produces no salivation. A tart droplet naturally produces salivation. After triangle → droplet pairings, the triangle alone produces salivation.',
      choices: [
        {
          id: 'a',
          text: 'Triangle NS→CS; droplet US; droplet salivation UR; triangle salivation CR',
          rationale:
            'The mapping separates events from responses and learned from unlearned functions.',
          correct: true,
        },
        {
          id: 'b',
          text: 'Triangle UR; droplet CR',
          rationale: 'Triangle and droplet are stimuli, not responses.',
        },
        {
          id: 'c',
          text: 'Droplet CS because it occurs second',
          rationale: 'Its unlearned eliciting function makes it the US.',
        },
        { id: 'd', text: 'Operant reinforcement', rationale: 'No action changes a consequence.' },
      ],
      hint: 'First label stimuli versus responses; then identify which relation was learned.',
    },
  ],
};

const k2A1: Screen = {
  id: 'k2-a1',
  stage: 'A1 · reduced support',
  title: 'Distinguish extinction and higher-order conditioning',
  duration: '1:30',
  questions: [
    {
      id: 'k2-a1-extinction',
      prompt:
        'After acquisition, a purple cue is repeatedly shown without the puff and conditioned blinking declines.',
      choices: [
        { id: 'a', text: 'Extinction', rationale: 'CS-alone trials reduce the CR.', correct: true },
        {
          id: 'b',
          text: 'Acquisition',
          rationale: 'Acquisition strengthens responding through pairing.',
        },
        {
          id: 'c',
          text: 'Spontaneous recovery',
          rationale: 'Recovery requires a rest after extinction.',
        },
        {
          id: 'd',
          text: 'Dishabituation',
          rationale: 'The decline depends on a prior CS–US relation, not repetition-only learning.',
        },
      ],
      hint: 'Identify what is omitted on the declining-response trials.',
    },
    {
      id: 'k2-a1-higher',
      prompt:
        'A tone already predicts a puff. A striped card is repeatedly followed by the tone but never directly by the puff. The card later produces anticipatory blinking.',
      choices: [
        {
          id: 'a',
          text: 'Higher-order conditioning',
          rationale: 'A new cue acquired control through an established CS.',
          correct: true,
        },
        { id: 'b', text: 'Generalization', rationale: 'The card need not be similar to the tone.' },
        {
          id: 'c',
          text: 'Discrimination',
          rationale: 'No differential paired-versus-unpaired training is described.',
        },
        {
          id: 'd',
          text: 'Spontaneous recovery',
          rationale: 'No extinction and rest sequence occurs.',
        },
      ],
      hint: 'Ask whether the new cue was paired with a US or with an established CS.',
    },
  ],
};

const k2A0: Screen = {
  id: 'k2-a0',
  stage: 'A0 · unsupported practice',
  title: 'Recognize response return',
  duration: '1:00',
  questions: [
    {
      id: 'k2-a0-item',
      prompt:
        'After a cue’s CR reaches zero during extinction, 48 hours pass. The cue alone again produces a small CR, with no new cue–US pairing.',
      choices: [
        { id: 'a', text: 'Acquisition', rationale: 'No new pairing occurred.' },
        { id: 'b', text: 'Extinction', rationale: 'Extinction preceded the break.' },
        {
          id: 'c',
          text: 'Spontaneous recovery',
          rationale: 'An extinguished CR partially returned after rest.',
          correct: true,
        },
        { id: 'd', text: 'Discrimination', rationale: 'Only one cue is tested.' },
      ],
      hint: 'Look for extinction, a rest interval, and return without retraining.',
    },
  ],
};

const k2Contrast: Screen = {
  id: 'k2-contrast',
  stage: 'Contrast and boundary',
  title: 'Why prediction is not a consequence',
  duration: '1:00',
  visual: {
    title: 'Compare the causal arrows',
    rows: [
      {
        label: 'Classical conditioning',
        nodes: [
          { label: 'CS', detail: 'cue' },
          { label: 'US', detail: 'following event' },
        ],
        links: ['predicts'],
      },
      {
        label: 'Operant conditioning',
        nodes: [
          { label: 'Response', detail: 'action' },
          { label: 'Consequence', detail: 'produced or prevented' },
        ],
        links: ['changes'],
      },
      {
        label: 'Habituation',
        nodes: [
          { label: 'Same stimulus', detail: 'repeats' },
          { label: 'Response', detail: 'decreases' },
        ],
        links: ['with repetition'],
      },
    ],
    textEquivalent:
      'Classical conditioning links a conditioned stimulus to the event it predicts. Operant conditioning links an action to a consequence it produces or prevents. Habituation involves repetition of one stimulus without either relation.',
  },
  body: [
    'In classical extinction, a learned cue appears without the event it used to predict, so the CR declines. In dishabituation, a different stimulus occurs and the response to the original repeated stimulus rebounds. The curves may look alike, but their histories differ.',
  ],
};

const k2Exits: [ExitPair, ExitPair, ExitPair] = [
  {
    label: 'Initial unassisted simulation pair',
    near: {
      id: 'k2-x0-near',
      stage: 'Near exit · round 0',
      title: 'Map the complete sequence',
      duration: '1:10',
      questions: [
        {
          id: 'k2-x0-near-item',
          prompt:
            'A gray icon initially produces no skin-conductance response. A brief safe noise naturally produces one. After icon → noise pairings, the icon alone produces a response. Icon-alone trials reduce it to zero. After one day, the icon alone produces a small response.',
          choices: [
            {
              id: 'a',
              text: 'Icon NS→CS; noise US; noise response UR; icon response CR; then extinction and spontaneous recovery',
              rationale: 'Every label and phase follows the event function and timeline.',
              correct: true,
            },
            {
              id: 'b',
              text: 'Icon US; noise CS; responses UR then CR',
              rationale: 'The stimulus functions are reversed.',
            },
            {
              id: 'c',
              text: 'Habituation then dishabituation',
              rationale:
                'The defining evidence is a learned icon–noise relation and CS-alone extinction.',
            },
            {
              id: 'd',
              text: 'Operant reinforcement then punishment',
              rationale: 'No action–consequence contingency exists.',
            },
          ],
          hint: 'Using help converts this exit item to instruction. Label the noise relation before naming later phases.',
        },
      ],
    },
    changed: {
      id: 'k2-x0-changed',
      stage: 'Changed-task exit · round 0',
      title: 'Read a stimulus gradient',
      duration: '1:10',
      questions: [
        {
          id: 'k2-x0-changed-item',
          prompt:
            'An 800-Hz tone is paired with a puff. Before differential training, nearby tones evoke weaker CRs. After 800 Hz → puff and 760 Hz → no puff, responding diverges. What occurred?',
          table: table(
            'Conditioned responses by test frequency',
            ['Test', '760 Hz', '800 Hz', '840 Hz', '1200 Hz'],
            [
              ['Before differential training', '55%', '84%', '58%', '6%'],
              ['After differential training', '9%', '82%', 'not tested', 'not tested'],
            ],
          ),
          choices: [
            {
              id: 'a',
              text: 'Generalization followed by discrimination',
              rationale:
                'Similar tones first evoke CRs; differential outcomes then separate responding.',
              correct: true,
            },
            {
              id: 'b',
              text: 'Acquisition followed by extinction',
              rationale:
                'The first test varies cue similarity and the second compares different cues.',
            },
            {
              id: 'c',
              text: 'Habituation followed by dishabituation',
              rationale: 'No repetition-only decrement or novel-stimulus recovery appears.',
            },
            {
              id: 'd',
              text: 'Spontaneous recovery followed by higher-order conditioning',
              rationale: 'Neither rest nor a second-order cue appears.',
            },
          ],
          hint: 'Using help converts this exit item to instruction. First ask why nearby frequencies evoke the CR.',
        },
      ],
    },
  },
  {
    label: 'Fresh pair after repair 1',
    near: {
      id: 'k2-x1-near',
      stage: 'Near exit · round 1',
      title: 'Correct a mislabeled lab record',
      duration: '1:00',
      questions: [
        {
          id: 'k2-x1-near-item',
          prompt:
            'A report says: “The striped card is the UR, citric taste is the CS, salivation to taste is the US, and salivation to the card is the CR.” Before training the card caused no salivation; taste naturally caused salivation; after card → taste pairings, the card caused salivation. Which corrected mapping is valid?',
          choices: [
            {
              id: 'a',
              text: 'Card NS→CS; taste US; taste salivation UR; card salivation CR',
              rationale: 'The mapping follows stimulus, response, and learning functions.',
              correct: true,
            },
            {
              id: 'b',
              text: 'Card US; taste CS',
              rationale: 'The taste elicits the unlearned response.',
            },
            {
              id: 'c',
              text: 'Card UR; salivation NS',
              rationale: 'The card is a stimulus and salivation is a response.',
            },
            { id: 'd', text: 'Negative reinforcement', rationale: 'No action removes an event.' },
          ],
          hint: 'Using help converts this exit item to instruction. Audit stimulus versus response before learned versus unlearned.',
        },
      ],
    },
    changed: {
      id: 'k2-x1-changed',
      stage: 'Changed-task exit · round 1',
      title: 'Timeline after a rest',
      duration: '1:00',
      questions: [
        {
          id: 'k2-x1-changed-item',
          prompt:
            'Green-line CS-alone responding is 7, 4, 1, and 0. After a 12-hour rest, the green line produces a response of 3.',
          choices: [
            {
              id: 'a',
              text: 'Extinction followed by spontaneous recovery',
              rationale: 'CS-alone trials reduce the CR, which partially returns after rest.',
              correct: true,
            },
            {
              id: 'b',
              text: 'Habituation followed by dishabituation',
              rationale:
                'The cue has a prior conditioned relation and no different stimulus intervenes.',
            },
            {
              id: 'c',
              text: 'Acquisition followed by discrimination',
              rationale: 'No CS–US pairings or second cue appear.',
            },
            {
              id: 'd',
              text: 'Operant extinction',
              rationale: 'No action’s reinforcer is discontinued.',
            },
          ],
          hint: 'Using help converts this exit item to instruction. Find the CS-alone decline and rest interval.',
        },
      ],
    },
  },
  {
    label: 'Fresh pair after repair 2',
    near: {
      id: 'k2-x2-near',
      stage: 'Near exit · round 2',
      title: 'New cue through an established cue',
      duration: '1:00',
      questions: [
        {
          id: 'k2-x2-near-item',
          prompt:
            'A tone already predicts a puff. A checkerboard repeatedly precedes the tone without direct puff pairings. The checkerboard later evokes anticipatory blinking.',
          choices: [
            {
              id: 'a',
              text: 'Higher-order conditioning',
              rationale: 'The new cue acquired control through an established CS.',
              correct: true,
            },
            {
              id: 'b',
              text: 'Generalization',
              rationale: 'Similarity between checkerboard and tone is not the basis of learning.',
            },
            {
              id: 'c',
              text: 'Spontaneous recovery',
              rationale: 'No extinction and rest sequence occurs.',
            },
            {
              id: 'd',
              text: 'Operant shaping',
              rationale: 'No successive approximations are reinforced.',
            },
          ],
          hint: 'Using help converts this exit item to instruction. Identify what the new cue was paired with.',
        },
      ],
    },
    changed: {
      id: 'k2-x2-changed',
      stage: 'Changed-task exit · round 2',
      title: 'Association or repetition?',
      duration: '1:00',
      questions: [
        {
          id: 'k2-x2-changed-item',
          prompt: 'One light repeatedly precedes a puff, and cue-elicited responding rises.',
          choices: [
            {
              id: 'a',
              text: 'Classical acquisition',
              rationale: 'The light becomes predictive through a two-event relation.',
              correct: true,
            },
            {
              id: 'b',
              text: 'Habituation',
              rationale: 'Habituation is repetition-only response decrement.',
            },
            {
              id: 'c',
              text: 'Sensory adaptation',
              rationale: 'No sensory-responsiveness decline is measured.',
            },
            {
              id: 'd',
              text: 'Negative punishment',
              rationale: 'No action is followed by removal of a valued event.',
            },
          ],
          hint: 'Using help converts this exit item to instruction. Count the linked events.',
        },
      ],
    },
  },
];

const k2Repairs: [Screen, Screen] = [
  {
    id: 'k2-repair-1',
    stage: 'Bounded repair 1',
    title: 'A cue changes jobs, not event type',
    duration: '2:15',
    visual: {
      title: 'Keep stimuli and responses in separate roles',
      rows: [
        {
          label: 'Pairing',
          nodes: [
            { label: 'NS becomes CS', detail: 'same cue' },
            { label: 'US', detail: 'predicted event' },
          ],
          links: ['predicts after pairing'],
        },
        {
          label: 'Response',
          nodes: [
            { label: 'CS', detail: 'stimulus' },
            { label: 'CR', detail: 'learned response' },
          ],
          links: ['elicits'],
        },
      ],
      textEquivalent:
        'The same cue can change from a neutral stimulus to a conditioned stimulus after it predicts the unconditioned stimulus. It remains a stimulus. The behavior it elicits is the conditioned response.',
    },
    body: [
      'A lunch bell begins as a neutral stimulus. After it repeatedly comes before food, it becomes a conditioned stimulus. Salivation is a response, so the bell cannot become the salivation and the salivation cannot become a stimulus.',
    ],
    questions: [
      {
        id: 'k2-repair-1-check',
        prompt: 'Which statement is structurally valid?',
        choices: [
          {
            id: 'a',
            text: 'An NS can become a CS',
            rationale: 'A cue can acquire predictive function through conditioning.',
            correct: true,
          },
          { id: 'b', text: 'A US can become a UR', rationale: 'Stimuli do not become responses.' },
          { id: 'c', text: 'A CR can become an NS', rationale: 'Responses do not become stimuli.' },
          {
            id: 'd',
            text: 'A UR must be learned',
            rationale: 'The UR is unconditioned relative to the target training.',
          },
        ],
        hint: 'Keep event labels separate from behavior labels.',
      },
    ],
  },
  {
    id: 'k2-repair-2',
    stage: 'Bounded repair 2',
    title: 'Similarity and training history answer different questions',
    duration: '2:15',
    body: [
      'If a similar, untrained tone evokes the CR, responding has generalized from the trained cue. Discrimination requires a different history: one cue predicts the US while another does not, and responding separates.',
      'Extinction instead asks what happens when the trained CS appears without its US. A rest after extinction can reveal spontaneous recovery.',
    ],
    questions: [
      {
        id: 'k2-repair-2-check',
        prompt: 'A similar, untrained tone evokes the CR. Which process is demonstrated?',
        choices: [
          {
            id: 'a',
            text: 'Generalization',
            rationale: 'Conditioned responding spreads to a similar stimulus.',
            correct: true,
          },
          {
            id: 'b',
            text: 'Discrimination',
            rationale:
              'Discrimination is differential responding, usually after different cue outcomes.',
          },
          { id: 'c', text: 'Extinction', rationale: 'No CS-alone decline is described.' },
          { id: 'd', text: 'Spontaneous recovery', rationale: 'No rest after extinction occurs.' },
        ],
        hint: 'The test changes stimulus similarity, not time since extinction.',
      },
    ],
  },
];

const k2PlannerExit: ExitPair = {
  label: 'Externally simulated planner reentry · fresh family',
  near: {
    id: 'k2-planner-near',
    stage: 'Planner-authorized near task',
    title: 'Audit a labeled timeline',
    duration: '1:20',
    questions: [
      {
        id: 'k2-planner-near-item',
        prompt:
          'Before training, a bronze frame produces no startle and a safe burst of air produces startle. After frame → air pairings, the frame alone produces anticipatory startle. Frame-alone trials then reduce responding; after a rest, a small response returns. Which labeling is complete?',
        choices: [
          {
            id: 'a',
            text: 'Frame NS→CS; air US; startle to air UR; startle to frame CR; extinction then spontaneous recovery',
            rationale: 'The mapping and phase sequence follow event function and timing.',
            correct: true,
          },
          {
            id: 'b',
            text: 'Frame US; air CS; habituation then dishabituation',
            rationale:
              'The unlearned elicitor and learned cue are reversed, and no different stimulus causes recovery.',
          },
          {
            id: 'c',
            text: 'Frame UR; startle CS; acquisition then punishment',
            rationale: 'Stimuli and responses are reversed, and no action consequence appears.',
          },
          {
            id: 'd',
            text: 'Air NS; frame US; generalization then shaping',
            rationale:
              'The air has an unlearned eliciting function, and no successive approximation is reinforced.',
          },
        ],
        hint: 'This planner task is simulated. Label the natural air response before reading extinction and rest.',
      },
    ],
  },
  changed: {
    id: 'k2-planner-changed',
    stage: 'Planner-authorized changed task',
    title: 'Separate second-order learning and discrimination',
    duration: '1:20',
    questions: [
      {
        id: 'k2-planner-changed-item',
        prompt:
          'A tone CS predicts a puff. A mosaic repeatedly precedes the tone but never the puff, and the mosaic later evokes a CR. Separately, tone 1 remains paired while tone 2 is unpaired, producing 81% versus 9% responding. Which processes occurred?',
        choices: [
          {
            id: 'a',
            text: 'Higher-order conditioning, then discrimination',
            rationale:
              'The mosaic learns through an established CS; differential cue outcomes separate responding.',
            correct: true,
          },
          {
            id: 'b',
            text: 'Generalization, then spontaneous recovery',
            rationale: 'Similarity and a rest after extinction are not the operative structures.',
          },
          {
            id: 'c',
            text: 'Habituation, then dishabituation',
            rationale:
              'Both cases depend on cue–event histories rather than repetition-only decrement.',
          },
          {
            id: 'd',
            text: 'Operant shaping, then punishment',
            rationale: 'No emitted action controls a consequence.',
          },
        ],
        hint: 'This planner task is simulated. Ask what trained the mosaic and why the two tones diverged.',
      },
    ],
  },
};

const KC2: KC = {
  id: 'V3-KC-564671',
  label: 'Model classical conditioning',
  shortLabel: 'Classical',
  competence:
    'Map NS, US, UR, CS, and CR and predict acquisition, extinction, recovery, generalization, discrimination, and higher-order conditioning.',
  representations: ['stimulus–response diagram', 'learning curve', 'trial vignette'],
  duration: '17 min',
  entry: k2Entry,
  routeCopy: {
    prepared: [
      'The mapping and rationale were both correct, unassisted, and unexposed.',
      'The compact model remains available; all fresh practice and exit checks still run.',
    ],
    standard: [
      'The response pattern calls for the complete label-and-timeline model.',
      'Work from event function rather than position in the sentence.',
    ],
    targeted: [
      'Two responses provisionally match a stimulus-versus-response label pattern; this is not a learner diagnosis.',
      'Review the label-function primer before prediction. Later support fades only after unassisted performance.',
    ],
  },
  prediction: k2Prediction,
  model: k2Model,
  expert: k2Expert,
  a2: k2A2,
  a1: k2A1,
  a0: k2A0,
  contrast: k2Contrast,
  exits: k2Exits,
  plannerExit: k2PlannerExit,
  repairs: k2Repairs,
  handoff: {
    id: 'k2-handoff',
    stage: 'Handoff',
    title: 'From cue–event relations to consequences',
    duration: '0:20',
    body: ['Classical conditioning links antecedent events. Next, an action changes what follows.'],
  },
  remediationId: 'R14-REM-PS-075',
};

const k3Entry: Screen = {
  id: 'k3-entry',
  stage: 'Entry route',
  title: 'Classify an action–consequence relation',
  duration: '1:30',
  questions: [
    {
      id: 'k3-entry-classify',
      prompt:
        'Whenever a participant taps a key, an irritating screen flicker stops for 30 seconds. Key taps rise from 2 to 12 per session. What occurred?',
      choices: [
        {
          id: 'a',
          text: 'Negative reinforcement',
          rationale: 'A stimulus was removed and the behavior increased.',
          correct: true,
        },
        {
          id: 'b',
          text: 'Positive punishment',
          rationale: 'Added punishment would be identified by decreased tapping.',
          misconception: 'negative-means-punishment',
        },
        {
          id: 'c',
          text: 'Negative punishment',
          rationale: 'Removed punishment also requires a decrease in behavior.',
          misconception: 'negative-means-punishment',
        },
        {
          id: 'd',
          text: 'Classical conditioning',
          rationale: 'The defining relation is action → consequence.',
          misconception: 'relation-reversal',
        },
      ],
      hint: 'Determine behavior direction first, then whether the consequence was added or removed.',
    },
    {
      id: 'k3-entry-rationale',
      prompt: 'Which observation fixes the classification?',
      choices: [
        {
          id: 'a',
          text: 'The action increased because it removed an aversive event.',
          rationale: 'Increase makes it reinforcement; removal makes it negative.',
          correct: true,
        },
        {
          id: 'b',
          text: 'The event was unpleasant, so it was punishment.',
          rationale: 'Pleasantness does not define punishment; behavior direction does.',
          misconception: 'negative-means-punishment',
        },
        {
          id: 'c',
          text: 'Anything removed is punishment.',
          rationale:
            'Removal can participate in either negative reinforcement or negative punishment.',
          misconception: 'negative-means-punishment',
        },
        {
          id: 'd',
          text: 'The flicker occurred before behavior changed.',
          rationale:
            'Timing alone does not replace the action–consequence and behavior-direction tests.',
          misconception: 'relation-reversal',
        },
      ],
      hint: 'Reinforcement means the behavior increases.',
    },
  ],
};

const k3Prediction: Screen = {
  id: 'k3-prediction',
  stage: 'Orientation and prediction',
  title: 'Use the two-axis model',
  duration: '0:50',
  questions: [
    {
      id: 'k3-predict',
      prompt:
        'A learner submits a checklist. A badge is added immediately afterward. Submission rises from 3 of 10 opportunities to 8 of 10. Assuming comparable opportunities, how should the consequence be classified?',
      choices: [
        {
          id: 'a',
          text: 'Positive reinforcement',
          rationale: 'The consequence is added and behavior increases.',
          correct: true,
        },
        { id: 'b', text: 'Negative reinforcement', rationale: 'Nothing is removed.' },
        {
          id: 'c',
          text: 'Positive punishment',
          rationale: 'Behavior increases rather than decreases.',
        },
        {
          id: 'd',
          text: 'Negative punishment',
          rationale: 'Neither removal nor behavioral decrease occurs.',
        },
      ],
      hint: 'Positive means added; reinforcement means increased behavior.',
    },
  ],
};

const k3Model: Screen = {
  id: 'k3-model',
  stage: 'Direct model',
  title: 'Consequences change future responding',
  duration: '2:15',
  visual: {
    title: 'Operant contingency',
    rows: [
      {
        label: 'Basic contingency',
        nodes: [
          { label: 'Response', detail: 'an action' },
          { label: 'Consequence', detail: 'follows the action' },
          { label: 'Future response', detail: 'more or less likely' },
        ],
        links: ['produces', 'changes'],
      },
      {
        label: 'With a discriminative cue',
        nodes: [
          { label: 'Discriminative cue', detail: 'signals availability' },
          { label: 'Response', detail: 'an action' },
          { label: 'Outcome', detail: 'follows here' },
        ],
        links: ['sets occasion', 'produces'],
      },
    ],
    textEquivalent:
      'In operant learning, a response produces a consequence, and that consequence changes how likely the response is in the future. A discriminative cue can signal that a particular response will produce its outcome in that situation.',
  },
  body: [
    'A student turns in checklists, receives a badge, and submits more often. The badge is positive reinforcement because something was added and the response increased. If the badge reduced submissions, the same added event would function as positive punishment.',
    'Use two independent questions: did the response increase or decrease, and was the consequence added or removed? Positive never means good, and negative never means punishment.',
  ],
  bullets: [
    'Response rises: reinforcement. Response falls: punishment.',
    'Event added: positive. Event removed: negative.',
  ],
};

const k3Expert: Screen = {
  id: 'k3-expert',
  stage: 'Annotated expert example',
  title: 'Shape, schedule, and extinguish',
  duration: '2:30',
  sequence: [
    'Point for opening any command menu',
    'Point only for opening Tools',
    'Point only for selecting Export inside Tools',
    'Point only for using Ctrl+E',
  ],
  chart: {
    kind: 'bar',
    title: 'Target responses after points are discontinued',
    categories: ['Block 1', 'Block 2', 'Block 3', 'Block 4'],
    series: [{ name: 'Ctrl+E responses', data: [9, 6, 3, 1], tone: 'info' }],
    xLabel: 'No-point block',
    yLabel: 'Target responses per block',
    readingGuide:
      'Each x-axis category is one block after points stopped. The y-axis is the number of Ctrl+E responses in that block; the falling count is the evidence to interpret.',
    source: 'Source: original simulated keyboard-training data · four no-reinforcer blocks',
    table: table(
      'Accessible target-response data after point discontinuation',
      ['No-point block', 'Target responses'],
      [
        ['Block 1', 9],
        ['Block 2', 6],
        ['Block 3', 3],
        ['Block 4', 1],
      ],
    ),
  },
  table: table(
    'Simulated schedule-response patterns; cumulative target responses by minute',
    [
      'Schedule',
      'Minute 0',
      'Minute 1',
      'Minute 2',
      'Minute 3',
      'Minute 4',
      'Minute 5',
      'Typical reading',
    ],
    [
      ['FR', 0, 12, 13, 25, 26, 38, 'High runs with post-reinforcement pauses'],
      ['VR', 0, 10, 20, 31, 41, 52, 'High, steady responding'],
      ['FI', 0, 2, 8, 9, 12, 19, 'Responding accelerates near predictable interval completion'],
      ['VI', 0, 6, 12, 18, 24, 31, 'Moderate, steady responding'],
    ],
  ),
  annotations: [
    'The criterion narrows toward Ctrl+E: shaping.',
    'Ctrl+E → point added → Ctrl+E rises from 2 to 9 per minute: positive reinforcement.',
    'Points exchange for interface themes: conditioned reinforcers in a token economy.',
    'Points occur after responses 4, 8, 12, 16, and 20: FR-4.',
    'Median post-point pause is 4.8 seconds versus 0.9 seconds within a run; this supports but does not define FR.',
    'Schedule curves are characteristic patterns, not definitions; classify ratio versus interval and fixed versus variable from the programmed contingency first.',
    'When points stop and behavior declines, operant extinction occurs.',
  ],
};

const k3A2: Screen = {
  id: 'k3-a2',
  stage: 'A2 · high support',
  title: 'Choose the next approximation',
  duration: '1:30',
  questions: [
    {
      id: 'k3-a2-shaping',
      prompt:
        'Opening the Tools menu is currently reinforced. The final target is pressing Ctrl+E. What is the best next shaping criterion?',
      choices: [
        {
          id: 'a',
          text: 'Reinforce any mouse movement',
          rationale: 'This is farther from the target.',
        },
        {
          id: 'b',
          text: 'Reinforce selecting Export inside Tools',
          rationale: 'This is a closer achievable approximation.',
          correct: true,
        },
        {
          id: 'c',
          text: 'Require Ctrl+E immediately',
          rationale: 'This skips the next approximation.',
        },
        {
          id: 'd',
          text: 'Reinforce regardless of action',
          rationale: 'This removes the contingency.',
        },
      ],
      hint: 'Choose a response closer to the target than the current criterion.',
    },
    {
      id: 'k3-a2-contingency',
      prompt: 'Fastening a virtual harness stops a warning tone, and fastening increases.',
      choices: [
        {
          id: 'a',
          text: 'Negative reinforcement',
          rationale: 'The tone is removed and fastening increases.',
          correct: true,
        },
        {
          id: 'b',
          text: 'Positive punishment',
          rationale: 'Nothing is added, and behavior does not decrease.',
        },
        {
          id: 'c',
          text: 'Negative punishment',
          rationale: 'Behavior increases rather than decreases.',
        },
        {
          id: 'd',
          text: 'Classical extinction',
          rationale: 'The measured relation is action → consequence.',
        },
      ],
      hint: 'Stopping is removal; increasing makes the consequence reinforcing.',
    },
  ],
};

const k3A1: Screen = {
  id: 'k3-a1',
  stage: 'A1 · reduced support',
  title: 'Read the count and the decline',
  duration: '1:15',
  questions: [
    {
      id: 'k3-a1-item',
      prompt:
        'Points occur after responses 5, 10, 15, and 20. After points stop, responses per block are 16, 10, 6, and 2.',
      choices: [
        {
          id: 'a',
          text: 'FR-5 followed by operant extinction',
          rationale: 'Five counts responses, and behavior declines after reinforcement stops.',
          correct: true,
        },
        {
          id: 'b',
          text: 'FI-5 followed by punishment',
          rationale: 'Five counts responses rather than time, and no punisher is added.',
        },
        {
          id: 'c',
          text: 'VR followed by spontaneous recovery',
          rationale: 'The response count is predictable and no rest-return sequence occurs.',
        },
        {
          id: 'd',
          text: 'Continuous reinforcement followed by habituation',
          rationale: 'Not every response is reinforced.',
        },
      ],
      hint: 'Ratio counts responses; extinction follows reinforcer discontinuation.',
    },
  ],
};

const k3A0: Screen = {
  id: 'k3-a0',
  stage: 'A0 · unsupported practice',
  title: 'Escape or avoidance?',
  duration: '1:00',
  questions: [
    {
      id: 'k3-a0-item',
      prompt:
        'A light appears five seconds before a safe buzzer. Pressing space while the light is on prevents the buzzer. Space presses increase.',
      choices: [
        {
          id: 'a',
          text: 'Escape through negative reinforcement',
          rationale: 'The buzzer has not begun, so the response is not escape.',
        },
        {
          id: 'b',
          text: 'Avoidance through negative reinforcement',
          rationale: 'The response increases because it prevents an expected aversive event.',
          correct: true,
        },
        {
          id: 'c',
          text: 'Positive punishment',
          rationale: 'Pressing increases and no event is added after it.',
        },
        {
          id: 'd',
          text: 'Classical conditioning only',
          rationale:
            'The cue may predict the buzzer, but the measured action is maintained by its consequence.',
        },
      ],
      hint: 'Ask whether the buzzer is ongoing or forthcoming when the action occurs.',
    },
  ],
};

const k3Contrast: Screen = {
  id: 'k3-contrast',
  stage: 'Contrast and boundary',
  title: 'Why similar-looking cases get different names',
  duration: '1:00',
  visual: {
    title: 'Cue prediction versus operant control',
    rows: [
      {
        label: 'Classical',
        nodes: [
          { label: 'Cue', detail: 'predicts' },
          { label: 'Event', detail: 'comes next' },
        ],
        links: ['signals'],
      },
      {
        label: 'Operant',
        nodes: [
          { label: 'Discriminative cue', detail: 'signals when' },
          { label: 'Response', detail: 'acts' },
          { label: 'Outcome', detail: 'changes' },
        ],
        links: ['sets occasion', 'produces'],
      },
    ],
    textEquivalent:
      'In classical conditioning, a cue predicts another event. In a discriminated operant contingency, a discriminative cue signals when a response will produce an outcome.',
  },
  body: [
    'Ratio schedules count responses; interval schedules track elapsed time. Escape stops an event that is already happening; avoidance prevents an expected event. In every case, name the programmed relation before using the shape of a response curve.',
  ],
};

const k3Exits: [ExitPair, ExitPair, ExitPair] = [
  {
    label: 'Initial unassisted simulation pair',
    near: {
      id: 'k3-x0-near',
      stage: 'Near exit · round 0',
      title: 'Blueprint slots 1–2 · contingency ledger',
      duration: '2:10',
      questions: [
        {
          id: 'k3-x0-slot-contingency',
          prompt:
            'The ledger records four action–consequence changes. Which complete mapping uses behavior direction first and operation second?',
          table: table(
            'X0 contingency ledger; original simulated changes',
            ['Action', 'Consequence change', 'Later action'],
            [
              ['Submit calibration', 'Badge added', 'Increases'],
              ['Complete safety scan', 'Warning overlay removed', 'Increases'],
              ['Make unsafe entry', 'Correction buzz added', 'Decreases'],
              ['Make unsafe entry', 'One media minute removed', 'Decreases'],
            ],
          ),
          choices: [
            {
              id: 'a',
              text: 'Positive reinforcement; negative reinforcement; positive punishment; negative punishment',
              rationale:
                'Addition plus increase, removal plus increase, addition plus decrease, and removal plus decrease map to the four quadrants.',
              correct: true,
            },
            {
              id: 'b',
              text: 'Positive reinforcement; negative punishment; negative reinforcement; positive punishment',
              rationale:
                'The second action increases and the third decreases, so reinforcement and punishment are reversed.',
            },
            {
              id: 'c',
              text: 'Negative reinforcement; positive reinforcement; negative punishment; positive punishment',
              rationale: 'Added versus removed operations are reversed in every row.',
            },
            {
              id: 'd',
              text: 'Positive punishment; negative punishment; positive reinforcement; negative reinforcement',
              rationale: 'Behavior direction is reversed in every row.',
            },
          ],
          hint: 'Using help converts this exit item to instruction. Classify increase versus decrease before addition versus removal.',
        },
        {
          id: 'k3-x0-slot-reinforcer',
          prompt:
            'Water is effective after heat exposure without exchange training. Blue credits initially have no effect, then increase responding after they can be exchanged for breaks. Which interpretation is complete?',
          choices: [
            {
              id: 'a',
              text: 'Water is primary; credits are conditioned reinforcers; the exchange system is a token economy',
              rationale:
                'Water addresses a biological need without learned exchange value, while credits acquire value through exchange.',
              correct: true,
            },
            {
              id: 'b',
              text: 'Water is conditioned; credits are primary; the system is extinction',
              rationale:
                'The value sources are reversed and exchangeable credits remain available.',
            },
            {
              id: 'c',
              text: 'Both are primary reinforcers; exchange training is irrelevant',
              rationale: 'The credits were ineffective until their exchange relation was learned.',
            },
            {
              id: 'd',
              text: 'Both are punishers; the system is shaping',
              rationale:
                'Both outcomes increase responding and no successive approximation criterion is described.',
            },
          ],
          hint: 'Using help converts the whole exit pair to instruction. Ask whether value depends on learned exchange.',
        },
      ],
    },
    changed: {
      id: 'k3-x0-changed',
      stage: 'Changed-task exit · round 0',
      title: 'Blueprint slots 3–4 · programmed rules',
      duration: '2:00',
      questions: [
        {
          id: 'k3-x0-slot-schedule',
          prompt:
            'A rule audit lists six reinforcement programs. Which schedule sequence is complete?',
          table: table(
            'X0 programmed contingency rules',
            ['Program', 'Rule'],
            [
              ['C', 'Reinforce every target response'],
              ['F', 'Reinforce every fifth target response'],
              ['R', 'Reinforce after changing counts: 2, 7, 4, 9'],
              ['T', 'Reinforce first response after exactly 120 seconds'],
              ['I', 'Reinforce first response after changing intervals: 45, 90, 30 seconds'],
              ['Off', 'Stop the prior reinforcer; responding then declines'],
            ],
          ),
          choices: [
            {
              id: 'a',
              text: 'Continuous; FR-5; VR; FI-120 s; VI; operant extinction',
              rationale:
                'The rules distinguish every response, fixed and varying counts, fixed and varying time, and reinforcer discontinuation.',
              correct: true,
            },
            {
              id: 'b',
              text: 'FR-1; FI-5; VI; VR; FR; punishment',
              rationale:
                'The count-versus-time dimensions are repeatedly reversed, and reinforcer discontinuation is extinction.',
            },
            {
              id: 'c',
              text: 'Continuous; VR; FR; VI; FI; habituation',
              rationale:
                'Fixedness is reversed and a stopped action reinforcer defines operant extinction.',
            },
            {
              id: 'd',
              text: 'VI; FR-5; FI; VR; continuous; shaping',
              rationale:
                'Only F is correctly identified; the other programmed dimensions do not match.',
            },
          ],
          hint: 'Using help converts this exit item to instruction. Identify response count versus elapsed time, then fixed versus variable.',
        },
        {
          id: 'k3-x0-slot-aversive',
          prompt:
            'Trace E begins with an alert already sounding; a key press stops it and presses increase. Trace A begins with a warning; a key press prevents the later alert and presses increase. Which mapping is complete?',
          choices: [
            {
              id: 'a',
              text: 'E is escape; A is avoidance; both are negative reinforcement',
              rationale:
                'E terminates an ongoing event, A prevents a forthcoming event, and both actions increase.',
              correct: true,
            },
            {
              id: 'b',
              text: 'E is avoidance; A is escape; both are punishment',
              rationale: 'The timing labels and behavior-direction classification are reversed.',
            },
            {
              id: 'c',
              text: 'Both are escape through positive reinforcement',
              rationale:
                'A prevents rather than terminates, and the aversive event is removed or omitted rather than added.',
            },
            {
              id: 'd',
              text: 'Both are classical extinction',
              rationale: 'An emitted action directly controls each consequence.',
            },
          ],
          hint: 'Using help converts the whole exit pair to instruction. Determine whether the aversive event is ongoing or only forecast.',
        },
      ],
    },
  },
  {
    label: 'Fresh pair after repair 1',
    near: {
      id: 'k3-x1-near',
      stage: 'Near exit · round 1',
      title: 'Blueprint slots 1–2 · outcome deltas',
      duration: '2:00',
      questions: [
        {
          id: 'k3-x1-slot-contingency',
          prompt:
            'A community-lab matrix records consequence operations and observed response deltas. Which row-by-row classification is complete?',
          table: table(
            'X1 outcome-delta matrix; original simulated counts',
            ['Action', 'Consequence operation', 'Response change'],
            [
              ['Sort sample', 'Praise card added', '+9'],
              ['Fasten shield', 'Abrasive vibration removed', '+8'],
              ['Leave litter', 'Cleanup task added', '−6'],
              ['Unsafe reach', 'Tool access removed', '−5'],
            ],
          ),
          choices: [
            {
              id: 'a',
              text: 'Positive reinforcement; negative reinforcement; positive punishment; negative punishment',
              rationale:
                'The signed response deltas establish reinforcement versus punishment; the operations establish positive versus negative.',
              correct: true,
            },
            {
              id: 'b',
              text: 'Positive punishment; negative punishment; positive reinforcement; negative reinforcement',
              rationale: 'Every behavior direction is reversed.',
            },
            {
              id: 'c',
              text: 'Negative reinforcement; positive reinforcement; negative punishment; positive punishment',
              rationale: 'Every addition/removal operation is reversed.',
            },
            {
              id: 'd',
              text: 'Positive reinforcement; negative punishment; negative reinforcement; positive punishment',
              rationale: 'Rows two and three reverse behavior direction.',
            },
          ],
          hint: 'Using help converts this exit item to instruction. Read the response delta before the operation column.',
        },
        {
          id: 'k3-x1-slot-reinforcer',
          prompt:
            'A warming pack increases a cold participant’s task completion before any exchange training. Brass markers increase responding only after they become exchangeable for station access. Which interpretation is complete?',
          choices: [
            {
              id: 'a',
              text: 'The warming pack is primary; markers are conditioned reinforcers in a token economy',
              rationale:
                'The pack directly addresses a biological state, while marker value depends on learned exchange.',
              correct: true,
            },
            {
              id: 'b',
              text: 'The warming pack is conditioned; markers are primary',
              rationale: 'Their sources of reinforcing value are reversed.',
            },
            {
              id: 'c',
              text: 'Both are primary because both increase behavior',
              rationale:
                'Behavioral effect defines reinforcement, not primary status; marker value was learned.',
            },
            {
              id: 'd',
              text: 'Both are punishment because access is delayed',
              rationale: 'Both consequences increase the target response.',
            },
          ],
          hint: 'Using help converts the whole exit pair to instruction. Separate behavioral effect from the source of reinforcing value.',
        },
      ],
    },
    changed: {
      id: 'k3-x1-changed',
      stage: 'Changed-task exit · round 1',
      title: 'Blueprint slots 3–4 · delivery records',
      duration: '2:00',
      questions: [
        {
          id: 'k3-x1-slot-schedule',
          prompt:
            'The records show when reinforcers were delivered. Which full schedule interpretation is correct?',
          table: table(
            'X1 delivery records; original simulated observations',
            ['Station', 'Delivery record'],
            [
              ['A', 'Responses 1, 2, 3, 4'],
              ['B', 'Responses 8, 16, 24'],
              ['C', 'Responses 3, 14, 19, 30'],
              ['D', 'First eligible responses at 60, 120, 180 seconds'],
              ['E', 'First eligible responses after 20, 80, 35-second intervals'],
              ['A-off', 'A deliveries stop; A responding declines'],
            ],
          ),
          choices: [
            {
              id: 'a',
              text: 'A continuous; B FR-8; C VR; D FI-60 s; E VI; A-off extinction',
              rationale:
                'The records identify every response, fixed and varying counts, fixed and varying intervals, then reinforcer discontinuation.',
              correct: true,
            },
            {
              id: 'b',
              text: 'A FR-4; B FI-8; C VI; D VR; E FI; A-off punishment',
              rationale:
                'Counts and times are confused, and discontinuing a reinforcer is extinction.',
            },
            {
              id: 'c',
              text: 'A continuous; B VR; C FR; D VI; E FI; A-off habituation',
              rationale:
                'Fixedness is reversed in B–E and the action contingency makes the decline operant extinction.',
            },
            {
              id: 'd',
              text: 'A VI; B FR-8; C FI; D continuous; E VR; A-off shaping',
              rationale: 'Only B is correctly mapped.',
            },
          ],
          hint: 'Using help converts this exit item to instruction. Compute gaps between deliveries and note whether records use responses or seconds.',
        },
        {
          id: 'k3-x1-slot-aversive',
          prompt:
            'State table E is ON → key press → OFF, and key pressing rises. State table A is WARNING → key press → aversive event OMITTED, and key pressing rises. Which mapping is complete?',
          choices: [
            {
              id: 'a',
              text: 'E is escape; A is avoidance; both are negative reinforcement',
              rationale:
                'E ends an active event, A prevents a cued future event, and both actions rise.',
              correct: true,
            },
            {
              id: 'b',
              text: 'E is avoidance; A is escape; both are negative punishment',
              rationale: 'Timing is reversed and increased behavior identifies reinforcement.',
            },
            {
              id: 'c',
              text: 'Both are escape maintained by positive reinforcement',
              rationale: 'The A event never begins and neither consequence is added.',
            },
            {
              id: 'd',
              text: 'Both are extinction',
              rationale: 'Each action still has an effective consequence.',
            },
          ],
          hint: 'Using help converts the whole exit pair to instruction. Compare event termination with event omission.',
        },
      ],
    },
  },
  {
    label: 'Fresh pair after repair 2',
    near: {
      id: 'k3-x2-near',
      stage: 'Near exit · round 2',
      title: 'Blueprint slots 1–2 · policy diff',
      duration: '2:00',
      questions: [
        {
          id: 'k3-x2-slot-contingency',
          prompt:
            'A policy diff shows four consequence edits and later behavior. Which complete mapping is correct?',
          table: table(
            'X2 policy diff; original simulated effects',
            ['Target action', 'Policy edit', 'Observed effect'],
            [
              ['Daily check-in', 'Data bonus added', 'Check-ins rise'],
              ['Daily check-in', 'Mandatory countdown removed', 'Check-ins rise'],
              ['Missed check', 'Correction drill added', 'Misses fall'],
              ['Missed check', 'Status badge removed', 'Misses fall'],
            ],
          ),
          choices: [
            {
              id: 'a',
              text: 'Positive reinforcement; negative reinforcement; positive punishment; negative punishment',
              rationale:
                'The policy edits instantiate all four operation-by-direction quadrants in order.',
              correct: true,
            },
            {
              id: 'b',
              text: 'Positive punishment; negative punishment; positive reinforcement; negative reinforcement',
              rationale: 'Behavior direction is reversed in every row.',
            },
            {
              id: 'c',
              text: 'Negative reinforcement; positive reinforcement; negative punishment; positive punishment',
              rationale: 'Added and removed operations are reversed.',
            },
            {
              id: 'd',
              text: 'Positive reinforcement; negative punishment; negative reinforcement; positive punishment',
              rationale: 'Rows two and three reverse reinforcement versus punishment.',
            },
          ],
          hint: 'Using help converts this exit item to instruction. Read rise or fall first, then the policy edit.',
        },
        {
          id: 'k3-x2-slot-reinforcer',
          prompt:
            'A meal increases work after fasting without prior exchange learning. Digital coupons initially do not change work, then do after coupons become exchangeable for meals. Which interpretation is complete?',
          choices: [
            {
              id: 'a',
              text: 'The meal is primary; coupons are conditioned reinforcers; exchange defines a token economy',
              rationale:
                'The meal’s value is tied directly to a biological need; coupon value is learned through exchange.',
              correct: true,
            },
            {
              id: 'b',
              text: 'The meal is conditioned; coupons are primary',
              rationale: 'Their value histories are reversed.',
            },
            {
              id: 'c',
              text: 'Both are primary because both can reinforce',
              rationale:
                'Primary status concerns the source of value, not whether behavior increases.',
            },
            {
              id: 'd',
              text: 'Coupons are punishers because they delay the meal',
              rationale: 'Coupons increase work after acquiring exchange value.',
            },
          ],
          hint: 'Using help converts the whole exit pair to instruction. Use the pre-exchange baseline to identify learned value.',
        },
      ],
    },
    changed: {
      id: 'k3-x2-changed',
      stage: 'Changed-task exit · round 2',
      title: 'Blueprint slots 3–4 · rule pseudocode',
      duration: '2:00',
      questions: [
        {
          id: 'k3-x2-slot-schedule',
          prompt: 'Read the six rule summaries. Which schedule mapping is complete?',
          sequence: [
            'α: issue one point after each target response',
            'β: issue one point when response_count reaches each multiple of 4',
            'γ: draw the next response requirement from 2, 9, or 6',
            'δ: make the first response after exactly 180 seconds eligible',
            'ε: draw the next eligible interval from 40, 130, or 70 seconds',
            'off: stop points previously maintaining the response; responding declines',
          ],
          choices: [
            {
              id: 'a',
              text: 'α continuous; β FR-4; γ VR; δ FI-180 s; ε VI; off operant extinction',
              rationale:
                'The rules explicitly separate every response, fixed/varying counts, fixed/varying times, and reinforcer discontinuation.',
              correct: true,
            },
            {
              id: 'b',
              text: 'α FR-1; β FI-4; γ VI; δ VR; ε FI; off punishment',
              rationale:
                'The count/time dimensions are reversed and reinforcer discontinuation is extinction.',
            },
            {
              id: 'c',
              text: 'α continuous; β VR; γ FR; δ VI; ε FI; off habituation',
              rationale:
                'Fixedness is reversed and the response decline follows a changed consequence, not repetition alone.',
            },
            {
              id: 'd',
              text: 'α VI; β FR-4; γ FI; δ continuous; ε VR; off shaping',
              rationale: 'Only β is correct.',
            },
          ],
          hint: 'Using help converts this exit item to instruction. Ratio rules count responses; interval rules track elapsed time.',
        },
        {
          id: 'k3-x2-slot-aversive',
          prompt:
            'In protocol Cold-On, cold air is already blowing before a response, and the response stops it. In protocol Forecast, a warning appears before cold air, and the response prevents the air from starting. Both responses increase. Which mapping is complete?',
          choices: [
            {
              id: 'a',
              text: 'Cold-On is escape; Forecast is avoidance; both are negative reinforcement',
              rationale:
                'One action ends an ongoing event, the other prevents a signaled event, and both actions increase.',
              correct: true,
            },
            {
              id: 'b',
              text: 'Cold-On is avoidance; Forecast is escape; both are punishment',
              rationale: 'Timing and behavior direction are reversed.',
            },
            {
              id: 'c',
              text: 'Both are avoidance through positive reinforcement',
              rationale:
                'Cold-On terminates an active event and neither consequence adds an event.',
            },
            {
              id: 'd',
              text: 'Both are respondent extinction',
              rationale: 'An action controls whether the event continues or occurs.',
            },
          ],
          hint: 'Using help converts the whole exit pair to instruction. Ask whether the event is already active at response time.',
        },
      ],
    },
  },
];

const k3Repairs: [Screen, Screen] = [
  {
    id: 'k3-repair-1',
    stage: 'Bounded repair 1',
    title: 'Removal is not the same as punishment',
    duration: '2:15',
    visual: {
      title: 'Classify direction before operation',
      rows: [
        {
          label: 'Concrete case',
          nodes: [
            { label: 'Response', detail: 'closes prompt' },
            { label: 'Prompt', detail: 'is removed' },
            { label: 'Future response', detail: 'increases' },
          ],
          links: ['removes', 'so'],
        },
      ],
      textEquivalent:
        'The response removes a prompt, and that response becomes more frequent. Increase means reinforcement; removal means negative, so the full classification is negative reinforcement.',
    },
    body: [
      'Suppose tapping “dismiss” removes a nagging prompt and people tap it more often. The event was removed, but the behavior rose. That makes it negative reinforcement, not punishment.',
    ],
    questions: [
      {
        id: 'k3-repair-1-check',
        prompt: 'A response removes a prompt and the response rises. Which two axes apply?',
        choices: [
          {
            id: 'a',
            text: 'Increase + removal',
            rationale: 'That combination is negative reinforcement.',
            correct: true,
          },
          { id: 'b', text: 'Decrease + removal', rationale: 'The response rose rather than fell.' },
          { id: 'c', text: 'Increase + addition', rationale: 'The prompt was removed.' },
          { id: 'd', text: 'Decrease + addition', rationale: 'Neither axis matches.' },
        ],
        hint: 'Do not let the word aversive replace the behavior-direction test.',
      },
    ],
  },
  {
    id: 'k3-repair-2',
    stage: 'Bounded repair 2',
    title: 'Use one clock for the schedule and one for the event',
    duration: '2:30',
    visual: {
      title: 'Escape and avoidance differ at response time',
      rows: [
        {
          label: 'Escape',
          nodes: [
            { label: 'Aversive event', detail: 'already on' },
            { label: 'Response' },
            { label: 'Event', detail: 'ends' },
          ],
          links: ['then', 'stops'],
        },
        {
          label: 'Avoidance',
          nodes: [
            { label: 'Warning cue', detail: 'event expected' },
            { label: 'Response' },
            { label: 'Outcome', detail: 'event prevented' },
          ],
          links: ['prompts', 'prevents'],
        },
      ],
      textEquivalent:
        'Escape responses end an aversive event that is already happening. Avoidance responses occur before the expected event and prevent it. A separate schedule rule may depend on response count or elapsed time.',
    },
    body: [
      'First classify the schedule: ratio counts responses, while interval tracks time; fixed is predictable and variable changes. Then inspect event timing: stopping an active tone is escape, while preventing a future tone is avoidance.',
    ],
    questions: [
      {
        id: 'k3-repair-2-check',
        prompt:
          'The first response after changing time intervals prevents an upcoming tone. Which structure applies?',
        choices: [
          {
            id: 'a',
            text: 'Variable interval + avoidance',
            rationale:
              'Eligibility depends on changing time, and the action prevents a forthcoming event.',
            correct: true,
          },
          {
            id: 'b',
            text: 'Variable ratio + escape',
            rationale: 'The schedule does not count responses, and the event is not ongoing.',
          },
          {
            id: 'c',
            text: 'Fixed interval + punishment',
            rationale: 'Intervals vary and behavior is maintained through prevention.',
          },
          {
            id: 'd',
            text: 'Fixed ratio + shaping',
            rationale: 'Neither predictable counts nor successive approximations appear.',
          },
        ],
        hint: 'Separate the schedule axis from the aversive-event timing.',
      },
    ],
  },
];

const k3PlannerExit: ExitPair = {
  label: 'Externally simulated planner reentry · fresh family',
  near: {
    id: 'k3-planner-near',
    stage: 'Planner-authorized near task',
    title: 'Blueprint slots 1–2 · abstract audit',
    duration: '2:00',
    questions: [
      {
        id: 'k3-planner-slot-contingency',
        prompt:
          'An anonymized audit shows only operation and response delta. Which complete mapping follows from the matrix?',
        table: table(
          'Planner abstract operation matrix',
          ['Case', 'Consequence operation', 'Response delta'],
          [
            ['P', 'Add', '+12'],
            ['N', 'Remove', '+9'],
            ['Q', 'Add', '−8'],
            ['M', 'Remove', '−7'],
          ],
        ),
        choices: [
          {
            id: 'a',
            text: 'P positive reinforcement; N negative reinforcement; Q positive punishment; M negative punishment',
            rationale:
              'Positive deltas identify reinforcement, negative deltas identify punishment, and operation identifies positive versus negative.',
            correct: true,
          },
          {
            id: 'b',
            text: 'P positive punishment; N negative punishment; Q positive reinforcement; M negative reinforcement',
            rationale: 'Every response direction is reversed.',
          },
          {
            id: 'c',
            text: 'P negative reinforcement; N positive reinforcement; Q negative punishment; M positive punishment',
            rationale: 'Every operation is reversed.',
          },
          {
            id: 'd',
            text: 'P positive reinforcement; N negative punishment; Q negative reinforcement; M positive punishment',
            rationale: 'Cases N and Q reverse behavior direction.',
          },
        ],
        hint: 'This planner task is simulated. Use delta sign first, then operation.',
      },
      {
        id: 'k3-planner-slot-reinforcer',
        prompt:
          'Transfer test: water increases responding before training. Neutral chips do not; after exchange training, chips increase responding and can be traded for several outcomes. Which conclusion is complete?',
        choices: [
          {
            id: 'a',
            text: 'Water is primary; chips are conditioned reinforcers; the exchange system is a token economy',
            rationale:
              'The transfer baseline isolates unlearned biological value from value acquired through exchange.',
            correct: true,
          },
          {
            id: 'b',
            text: 'Water is conditioned; chips are primary',
            rationale: 'The transfer history indicates the opposite.',
          },
          {
            id: 'c',
            text: 'Both are primary because both increase responding',
            rationale: 'Primary versus conditioned concerns the origin of value.',
          },
          {
            id: 'd',
            text: 'Chips are extinction cues because they were initially neutral',
            rationale: 'After exchange training, chips actively reinforce responding.',
          },
        ],
        hint: 'This planner task is simulated. Compare behavior before and after exchange training.',
      },
    ],
  },
  changed: {
    id: 'k3-planner-changed',
    stage: 'Planner-authorized changed task',
    title: 'Blueprint slots 3–4 · pattern and trace',
    duration: '2:00',
    questions: [
      {
        id: 'k3-planner-slot-schedule',
        prompt:
          'A reviewer receives programmed rules plus characteristic records. Which complete schedule mapping is warranted?',
        table: table(
          'Planner schedule audit',
          ['Stream', 'Program and record'],
          [
            ['C', 'Every response; one delivery per response'],
            ['F', 'Every seventh response; runs with post-delivery pauses'],
            ['R', 'Changing response counts; high steady responding'],
            ['T', 'First response after fixed 90-second intervals; scalloped record'],
            ['I', 'First response after changing intervals; moderate steady record'],
            ['Off', 'Deliveries stop; responding declines'],
          ],
        ),
        choices: [
          {
            id: 'a',
            text: 'C continuous; F FR-7; R VR; T FI-90 s; I VI; Off operant extinction',
            rationale:
              'Programmed contingencies determine the labels; the record shapes are corroborating rather than defining.',
            correct: true,
          },
          {
            id: 'b',
            text: 'C FR-1; F FI-7; R VI; T VR; I FI; Off punishment',
            rationale: 'Counts and time are reversed and reinforcer discontinuation is extinction.',
          },
          {
            id: 'c',
            text: 'C continuous; F VR; R FR; T VI; I FI; Off habituation',
            rationale: 'Fixedness is reversed and the decline follows reinforcer discontinuation.',
          },
          {
            id: 'd',
            text: 'C VI; F FR-7; R FI; T continuous; I VR; Off shaping',
            rationale: 'Only F is correctly mapped.',
          },
        ],
        hint: 'This planner task is simulated. Classify from the program before using response-pattern corroboration.',
      },
      {
        id: 'k3-planner-slot-aversive',
        prompt:
          'Counterfactual trace E: event ON; response occurs; event changes to OFF; response rises. Trace A: warning ON; response occurs; scheduled event is omitted; response rises. Which mapping is complete?',
        choices: [
          {
            id: 'a',
            text: 'E is escape; A is avoidance; both are negative reinforcement',
            rationale:
              'The response terminates an existing event in E and prevents a forthcoming event in A; both increase.',
            correct: true,
          },
          {
            id: 'b',
            text: 'E is avoidance; A is escape; both are punishment',
            rationale: 'Timing and response direction are reversed.',
          },
          {
            id: 'c',
            text: 'Both are positive reinforcement',
            rationale: 'No reinforcing event is added.',
          },
          {
            id: 'd',
            text: 'Both are extinction',
            rationale: 'Each response retains an effective consequence.',
          },
        ],
        hint: 'This planner task is simulated. Distinguish termination from omission.',
      },
    ],
  },
};

const KC3: KC = {
  id: 'V3-KC-628404',
  label: 'Model operant conditioning',
  shortLabel: 'Operant',
  competence:
    'Classify consequences and schedules and predict shaping, extinction, escape, and avoidance from action–consequence evidence.',
  representations: ['behavior vignette', 'contingency diagram', 'schedule response graph'],
  duration: '20–22 min',
  entry: k3Entry,
  routeCopy: {
    prepared: [
      'Both contingency decisions were correct, unassisted, and unexposed.',
      'The full fading sequence and fresh exits remain required.',
    ],
    standard: [
      'Use behavior direction before evaluating addition or removal.',
      'The model will then add schedule and escape/avoidance structure.',
    ],
    targeted: [
      'Two responses provisionally match a removal-equals-punishment pattern; the hypothesis only selects instruction.',
      'Review the independent direction and operation axes before prediction.',
    ],
  },
  prediction: k3Prediction,
  model: k3Model,
  expert: k3Expert,
  a2: k3A2,
  a1: k3A1,
  a0: k3A0,
  contrast: k3Contrast,
  exits: k3Exits,
  plannerExit: k3PlannerExit,
  repairs: k3Repairs,
  handoff: {
    id: 'k3-handoff',
    stage: 'Handoff',
    title: 'Beyond direct reinforcement',
    duration: '0:20',
    body: [
      'Consequences shape behavior, but knowledge and biological predispositions can change what is acquired or expressed.',
    ],
  },
  remediationId: 'R14-REM-PS-079',
};

const k4Entry: Screen = {
  id: 'k4-entry',
  stage: 'Entry route',
  title: 'Separate acquisition from performance',
  duration: '1:30',
  questions: [
    {
      id: 'k4-entry-classify',
      prompt:
        'Maze errors are 9, 8, 8, and 7 across four unrewarded days. Reward is introduced on day 5, and errors fall to 2 immediately. Which account best explains the abrupt change?',
      choices: [
        {
          id: 'a',
          text: 'Latent learning revealed when there was reason to demonstrate it',
          rationale: 'Knowledge can be acquired before motivation reveals it in performance.',
          correct: true,
        },
        {
          id: 'b',
          text: 'Shaping began on day 1',
          rationale: 'No successive approximations were reinforced.',
          misconception: 'reward-required',
        },
        {
          id: 'c',
          text: 'Classical generalization occurred',
          rationale: 'No conditioned cue-similarity test appears.',
          misconception: 'relation-reversal',
        },
        {
          id: 'd',
          text: 'Instinctive drift occurred',
          rationale: 'No trained action was displaced by an innate pattern.',
          misconception: 'constraint-reversal',
        },
      ],
      hint: 'Ask whether learning could occur before the incentive changed performance.',
    },
    {
      id: 'k4-entry-rationale',
      prompt: 'Which distinction is decisive?',
      choices: [
        {
          id: 'a',
          text: 'Acquisition may occur before performance reveals it',
          rationale: 'Latent learning separates knowledge acquisition from its expression.',
          correct: true,
        },
        {
          id: 'b',
          text: 'No reward means no learning can occur',
          rationale: 'That is the strict assumption challenged by latent-learning evidence.',
          misconception: 'reward-required',
        },
        {
          id: 'c',
          text: 'Any abrupt improvement is shaping',
          rationale: 'Shaping requires reinforcement of successive approximations.',
          misconception: 'reward-required',
        },
        {
          id: 'd',
          text: 'Any maze result proves instinctive behavior',
          rationale: 'A maze can test spatial knowledge without showing innate-action intrusion.',
          misconception: 'constraint-reversal',
        },
      ],
      hint: 'Learning and current observable performance are not identical.',
    },
  ],
};

const k4Prediction: Screen = {
  id: 'k4-prediction',
  stage: 'Orientation and prediction',
  title: 'Predict performance when incentive appears',
  duration: '0:50',
  questions: [
    {
      id: 'k4-predict',
      prompt:
        'Errors for a group with no reward on days 1–4 are 9, 8, 7, and 7. If the group acquired route knowledge latently and reward begins on day 5, what is the best prediction for days 5 and 6?',
      choices: [
        {
          id: 'a',
          text: 'About 2 and 2 errors',
          rationale: 'Rapid improvement is predicted when existing knowledge becomes useful.',
          correct: true,
        },
        {
          id: 'b',
          text: 'About 7 and 7 errors',
          rationale: 'This predicts no performance effect when motivation changes.',
        },
        {
          id: 'c',
          text: 'Exactly 0 and 0 errors',
          rationale: 'Latent learning does not imply perfect performance.',
        },
        {
          id: 'd',
          text: 'More than 9 errors',
          rationale: 'Incentive introduction does not predict worse navigation under this model.',
        },
      ],
      hint: 'Predict a sharp performance change without assuming perfect behavior.',
    },
  ],
};

const k4Model: Screen = {
  id: 'k4-model',
  stage: 'Direct model',
  title: 'Learning and visible performance can separate',
  duration: '2:00',
  body: [
    'Someone can explore a building without reward, learn how its hallways connect, and reveal that knowledge only when a destination matters. A novel shortcut supports a flexible cognitive map more strongly than faster repetition of one route.',
    'Biology can also tilt learning. Preparedness makes some pairings easier, not inevitable. Instinctive drift is different: a species-typical action begins to displace a trained response even while its reward remains available.',
  ],
};

const k4Expert: Screen = {
  id: 'k4-expert',
  stage: 'Annotated expert example',
  title: 'Compare expected and observed learning',
  duration: '2:40',
  chart: {
    kind: 'line',
    title: 'Target deposits and species-typical object handling',
    categories: ['Session 1', 'Session 2', 'Session 3', 'Session 4'],
    series: [
      { name: 'Correct deposits', data: [18, 17, 13, 8], tone: 'info' },
      { name: 'Object-rubbing bouts', data: [1, 3, 7, 12], tone: 'warning' },
    ],
    xLabel: 'Training session',
    yLabel: 'Behaviors per 20-trial session',
    readingGuide:
      'Each x-axis position is one 20-trial session. Both lines use behavior counts from 0 to 20: correct deposits fall while object-rubbing bouts rise.',
    source:
      'Source: original simulated Species Q data · reward remains available for every correct deposit',
    table: table(
      'Accessible expected-versus-observed behavior data',
      ['Session', 'Correct deposits', 'Object-rubbing bouts'],
      [
        ['Session 1', 18, 1],
        ['Session 2', 17, 3],
        ['Session 3', 13, 7],
        ['Session 4', 8, 12],
      ],
    ),
  },
  annotations: [
    'Latent-learning panel: unrewarded maze errors are 8, 7, 7, 6; reward begins and errors fall to 2. A blocked corridor then produces the shortest detour on 4/5 trials, supporting a cognitive map.',
    'Preparedness panel after one pairing: flavor→nausea avoidance 84%; light→nausea 20%; flavor→surface vibration 25%; light→surface vibration 73%. Relative matching supports preparedness, not impossibility.',
    'Drift panel: fictional Species Q naturally rubs food-like objects. Correct deposits decline while rubbing rises even though rewards remain available for deposits.',
    'All values are simulated for instruction and make no empirical claim about a real species.',
  ],
};

const k4A2: Screen = {
  id: 'k4-a2',
  stage: 'A2 · high support',
  title: 'Infer a flexible representation',
  duration: '1:10',
  questions: [
    {
      id: 'k4-a2-item',
      prompt:
        'People freely explore a virtual building without reward. Later, a corridor is blocked and a goal is announced. Most immediately select a short route they never directly practiced.',
      choices: [
        {
          id: 'a',
          text: 'Latent learning with a cognitive map',
          rationale: 'Knowledge was acquired before incentive and supports flexible route use.',
          correct: true,
        },
        { id: 'b', text: 'Shaping', rationale: 'No approximations were reinforced.' },
        { id: 'c', text: 'Taste aversion', rationale: 'No flavor–illness relation exists.' },
        { id: 'd', text: 'Instinctive drift', rationale: 'No innate action displaces training.' },
      ],
      hint: 'Look for knowledge acquired before incentive and flexible detour behavior.',
    },
  ],
};

const k4A1: Screen = {
  id: 'k4-a1',
  stage: 'A1 · reduced support',
  title: 'Identify prepared taste learning',
  duration: '1:00',
  questions: [
    {
      id: 'k4-a1-item',
      prompt:
        'One novel berry flavor is followed four hours later by illness. The flavor is avoided on the next encounter, while a light presented with the flavor is not strongly avoided.',
      choices: [
        {
          id: 'a',
          text: 'Prepared taste-aversion learning',
          rationale:
            'A flavor–illness association forms readily despite delay and stronger than the arbitrary visual relation.',
          correct: true,
        },
        {
          id: 'b',
          text: 'Habituation',
          rationale: 'Avoidance increases rather than a response declining through repetition.',
        },
        {
          id: 'c',
          text: 'Operant punishment',
          rationale: 'No emitted action is followed by a consequence.',
        },
        {
          id: 'd',
          text: 'Cognitive-map learning',
          rationale: 'No spatial representation is tested.',
        },
      ],
      hint: 'Identify the cue–outcome pair and whether biology makes that pair relatively learnable.',
    },
  ],
};

const k4A0: Screen = {
  id: 'k4-a0',
  stage: 'A0 · unsupported practice',
  title: 'Distinguish drift from extinction',
  duration: '1:00',
  questions: [
    {
      id: 'k4-a0-item',
      prompt:
        'A fictional species naturally digs around food-like objects. It is reinforced for carrying a food-linked tile directly to a bin. Across sessions, digging rises and direct carries fall even though correct carries still earn reinforcement.',
      choices: [
        { id: 'a', text: 'Operant extinction', rationale: 'Reinforcement has not stopped.' },
        {
          id: 'b',
          text: 'Instinctive drift',
          rationale: 'A species-typical action increasingly intrudes on the trained response.',
          correct: true,
        },
        {
          id: 'c',
          text: 'Latent learning',
          rationale: 'No hidden knowledge is revealed by an incentive.',
        },
        {
          id: 'd',
          text: 'Stimulus generalization',
          rationale: 'The issue is innate-action intrusion, not responding to similar cues.',
        },
      ],
      hint: 'Check whether reinforcement stopped or an innate pattern displaced the target.',
    },
  ],
};

const k4Contrast: Screen = {
  id: 'k4-contrast',
  stage: 'Contrast and boundary',
  title: 'Why the close alternatives differ',
  duration: '1:00',
  visual: {
    title: 'Compare what changes',
    rows: [
      {
        label: 'Latent learning',
        nodes: [
          { label: 'Explore', detail: 'no reward' },
          { label: 'Knowledge', detail: 'acquired' },
          { label: 'Goal appears', detail: 'performance changes' },
        ],
        links: ['builds', 'revealed by'],
      },
      {
        label: 'Instinctive drift',
        nodes: [
          { label: 'Trained response', detail: 'still rewarded' },
          { label: 'Innate action', detail: 'intrudes' },
          { label: 'Target response', detail: 'declines' },
        ],
        links: ['competes with', 'displaces'],
      },
    ],
    textEquivalent:
      'With latent learning, unrewarded exploration can build knowledge that appears in performance when a goal is introduced. With instinctive drift, a species-typical action displaces a trained response even though reinforcement remains available.',
  },
  body: [
    'Preparedness compares how readily associations form; it does not prove that the weaker pairing is impossible. Taste aversion is one prepared flavor–illness pairing. Drift differs from extinction because reinforcement remains available during drift but stops in extinction.',
  ],
};

const k4Exits: [ExitPair, ExitPair, ExitPair] = [
  {
    label: 'Initial unassisted simulation pair',
    near: {
      id: 'k4-x0-near',
      stage: 'Near exit · round 0',
      title: 'Match three constraint cases',
      duration: '1:15',
      questions: [
        {
          id: 'k4-x0-near-item',
          prompt:
            'Case A: unrewarded exploration is followed by immediate shortcut use when a goal is introduced. Case B: one delayed flavor–illness pairing produces strong avoidance while an arbitrary light–illness relation is weak. Case C: species-typical handling increasingly displaces a still-reinforced target response.',
          choices: [
            {
              id: 'a',
              text: 'A: latent learning/cognitive map; B: preparedness/taste aversion; C: instinctive drift',
              rationale:
                'Each mechanism matches the acquisition, flexibility, or biological-intrusion evidence.',
              correct: true,
            },
            {
              id: 'b',
              text: 'A: shaping; B: extinction; C: punishment',
              rationale:
                'No successive reinforcement, CS-alone decline, or suppressing consequence matches.',
            },
            {
              id: 'c',
              text: 'A: classical conditioning; B: habituation; C: generalization',
              rationale:
                'This ignores spatial flexibility, flavor–illness selectivity, and innate-action intrusion.',
            },
            {
              id: 'd',
              text: 'A: instinctive drift; B: cognitive map; C: latent learning',
              rationale: 'Each mechanism is assigned to the wrong evidence structure.',
            },
          ],
          hint: 'Using help converts this exit item to instruction. Match hidden spatial knowledge, selective flavor learning, and innate-action intrusion.',
        },
      ],
    },
    changed: {
      id: 'k4-x0-changed',
      stage: 'Changed-task exit · round 0',
      title: 'Expected versus observed behavior',
      duration: '1:10',
      questions: [
        {
          id: 'k4-x0-changed-item',
          prompt:
            'Reinforcement remains available after every correct target response. The target declines while an established species-typical response rises. What best explains the divergence?',
          table: table(
            'Expected target, observed target, and innate-response frequency',
            ['Session', 'Expected target', 'Observed target', 'Innate response'],
            [
              ['1', 17, 17, 1],
              ['2', 17, 17, 2],
              ['3', 17, 15, 4],
              ['4', 17, 10, 9],
              ['5', 17, 6, 13],
            ],
          ),
          choices: [
            {
              id: 'a',
              text: 'Instinctive drift',
              rationale:
                'An innate response rises and disrupts the trained response while reinforcement remains.',
              correct: true,
            },
            {
              id: 'b',
              text: 'Operant extinction',
              rationale: 'The reinforcer has not been discontinued.',
            },
            {
              id: 'c',
              text: 'Latent learning',
              rationale:
                'The pattern concerns intrusion, not hidden acquisition revealed by incentive.',
            },
            {
              id: 'd',
              text: 'Sensory adaptation',
              rationale: 'No sensory-response decrement is measured.',
            },
          ],
          hint: 'Using help converts this exit item to instruction. Compare reinforcement availability with the rising alternative behavior.',
        },
      ],
    },
  },
  {
    label: 'Fresh pair after repair 1',
    near: {
      id: 'k4-x1-near',
      stage: 'Near exit · round 1',
      title: 'Evaluate spatial evidence strength',
      duration: '1:00',
      questions: [
        {
          id: 'k4-x1-near-item',
          prompt:
            'Study 1 shows faster repetition of one practiced route. Study 2 allows unrewarded map exploration, then blocks the familiar route after announcing a goal; participants immediately choose an efficient unpracticed detour. Which inference is better supported by Study 2?',
          choices: [
            {
              id: 'a',
              text: 'Latent learning plus a cognitive map',
              rationale:
                'Knowledge precedes the need to perform and transfers flexibly to a novel route.',
              correct: true,
            },
            {
              id: 'b',
              text: 'A fixed motor sequence only',
              rationale: 'The familiar route is blocked and an unpracticed detour is selected.',
            },
            { id: 'c', text: 'Instinctive drift', rationale: 'No innate behavior intrudes.' },
            { id: 'd', text: 'Taste aversion', rationale: 'No flavor–illness relation exists.' },
          ],
          hint: 'Using help converts this exit item to instruction. Compare route repetition with flexible detour transfer.',
        },
      ],
    },
    changed: {
      id: 'k4-x1-changed',
      stage: 'Changed-task exit · round 1',
      title: 'Delayed selective association',
      duration: '1:00',
      questions: [
        {
          id: 'k4-x1-changed-item',
          prompt:
            'One delayed flavor–illness pairing produces strong flavor avoidance, while a simultaneous visual cue has little control.',
          choices: [
            {
              id: 'a',
              text: 'Prepared taste-aversion learning',
              rationale: 'Flavor–illness learning is relatively favored and can bridge a delay.',
              correct: true,
            },
            {
              id: 'b',
              text: 'All visual associations are impossible',
              rationale: 'Preparedness concerns relative ease, not absolute impossibility.',
            },
            {
              id: 'c',
              text: 'Operant punishment',
              rationale: 'No emitted action controls the illness.',
            },
            {
              id: 'd',
              text: 'Habituation',
              rationale:
                'The response does not progressively decline through repeated stimulation.',
            },
          ],
          hint: 'Using help converts this exit item to instruction. Interpret the relative strength without making it absolute.',
        },
      ],
    },
  },
  {
    label: 'Fresh pair after repair 2',
    near: {
      id: 'k4-x2-near',
      stage: 'Near exit · round 2',
      title: 'Interpret competing-response controls',
      duration: '1:00',
      questions: [
        {
          id: 'k4-x2-near-item',
          prompt:
            'Across sessions, the target deposit remains reinforced on every success. Deposits fall from 18 to 7 while an independently documented species-typical scraping response rises from 1 to 12. A control group trained with non-food-like objects keeps depositing at 17. Which explanation best fits?',
          choices: [
            {
              id: 'a',
              text: 'Instinctive drift',
              rationale:
                'A species-typical competitor rises selectively despite continued target reinforcement and a stable control.',
              correct: true,
            },
            { id: 'b', text: 'Extinction', rationale: 'Reinforcement has not stopped.' },
            { id: 'c', text: 'Latent learning', rationale: 'No hidden knowledge is revealed.' },
            {
              id: 'd',
              text: 'Classical discrimination',
              rationale: 'No differential cue relation is being tested.',
            },
          ],
          hint: 'Using help converts this exit item to instruction. Use the unchanged reinforcer and control group.',
        },
      ],
    },
    changed: {
      id: 'k4-x2-changed',
      stage: 'Changed-task exit · round 2',
      title: 'Relative learnability',
      duration: '1:00',
      questions: [
        {
          id: 'k4-x2-changed-item',
          prompt:
            'With equal exposure, flavor–illness learning is much faster than light–illness learning. What follows?',
          choices: [
            {
              id: 'a',
              text: 'Preparedness affects relative ease',
              rationale: 'The association types differ in learnability under equal exposure.',
              correct: true,
            },
            {
              id: 'b',
              text: 'Light–illness learning is impossible',
              rationale: 'The data show a rate difference, not an absolute limit.',
            },
            {
              id: 'c',
              text: 'Reinforcement schedules caused the difference',
              rationale: 'The comparison concerns classical cue–outcome associations.',
            },
            {
              id: 'd',
              text: 'The flavor response habituated',
              rationale: 'The measured outcome is acquired avoidance, not repetition-only decline.',
            },
          ],
          hint: 'Using help converts this exit item to instruction. Do not turn a relative predisposition into determinism.',
        },
      ],
    },
  },
];

const k4Repairs: [Screen, Screen] = [
  {
    id: 'k4-repair-1',
    stage: 'Bounded repair 1',
    title: 'A new route reveals more than a faster old route',
    duration: '2:15',
    body: [
      'Imagine two people who explored the same building. One later repeats a practiced hallway faster; that could be a motor routine. The other immediately takes an efficient detour around a new closure; that requires flexible spatial relations and better supports a cognitive map.',
    ],
    questions: [
      {
        id: 'k4-repair-1-check',
        prompt:
          'Which observation most strongly supports a cognitive map rather than one memorized route?',
        choices: [
          {
            id: 'a',
            text: 'Immediate use of an efficient novel detour',
            rationale: 'Flexible route selection requires relational spatial knowledge.',
            correct: true,
          },
          {
            id: 'b',
            text: 'Faster repetition of the same turn sequence',
            rationale: 'This could reflect a fixed motor sequence.',
          },
          {
            id: 'c',
            text: 'A token after every response',
            rationale: 'That describes continuous reinforcement.',
          },
          { id: 'd', text: 'Declining sensory activity', rationale: 'That concerns adaptation.' },
        ],
        hint: 'Look for transfer to a changed spatial route.',
      },
    ],
  },
  {
    id: 'k4-repair-2',
    stage: 'Bounded repair 2',
    title: 'Easier does not mean possible only one way',
    duration: '2:15',
    body: [
      'If flavor–illness learning reaches 80% while light–illness learning reaches 25% under equal exposure, the evidence supports a relative predisposition. The 25% result directly shows that the weaker association is not impossible.',
      'Keep this separate from instinctive drift, where an innate action increasingly interferes with a trained response while reinforcement remains available.',
    ],
    questions: [
      {
        id: 'k4-repair-2-check',
        prompt:
          'Which conclusion is warranted when one association is learned faster than another under equal exposure?',
        choices: [
          {
            id: 'a',
            text: 'Biological preparedness may alter relative learnability',
            rationale:
              'A rate difference supports predisposition without implying an absolute barrier.',
            correct: true,
          },
          {
            id: 'b',
            text: 'The weaker association can never be learned',
            rationale: 'The evidence does not support impossibility.',
          },
          {
            id: 'c',
            text: 'All learning is independent of biology',
            rationale: 'The systematic difference is evidence of a biological constraint.',
          },
          {
            id: 'd',
            text: 'The result must be operant extinction',
            rationale: 'No action reinforcer was discontinued.',
          },
        ],
        hint: 'State a comparative conclusion, not an absolute one.',
      },
    ],
  },
];

const k4PlannerExit: ExitPair = {
  label: 'Externally simulated planner reentry · fresh family',
  near: {
    id: 'k4-planner-near',
    stage: 'Planner-authorized near task',
    title: 'Compare three changed-task cases',
    duration: '1:30',
    questions: [
      {
        id: 'k4-planner-near-item',
        prompt:
          'Case A: after unrewarded exploration, a novel barrier is solved by an efficient detour once a goal is announced. Case B: flavor→illness learning is much stronger than light→illness under equal exposure. Case C: a natural handling action displaces a still-reinforced target.',
        choices: [
          {
            id: 'a',
            text: 'A latent learning/cognitive map; B preparedness; C instinctive drift',
            rationale:
              'Each label matches flexible hidden knowledge, relative associative ease, and innate-action intrusion.',
            correct: true,
          },
          {
            id: 'b',
            text: 'A shaping; B extinction; C punishment',
            rationale:
              'No successive reinforcement, CS-alone decline, or suppressing consequence matches.',
          },
          {
            id: 'c',
            text: 'A habituation; B cognitive map; C latent learning',
            rationale: 'Each mechanism is assigned to the wrong evidence structure.',
          },
          {
            id: 'd',
            text: 'A taste aversion; B generalization; C sensory adaptation',
            rationale:
              'The spatial, selective-association, and competing-action structures are ignored.',
          },
        ],
        hint: 'This planner task is simulated. Match flexibility, relative learnability, and innate intrusion separately.',
      },
    ],
  },
  changed: {
    id: 'k4-planner-changed',
    stage: 'Planner-authorized changed task',
    title: 'Interpret control-group divergence',
    duration: '1:30',
    questions: [
      {
        id: 'k4-planner-changed-item',
        prompt:
          'Group U explores without reward and later improves immediately when a goal appears; Group M also selects an unpracticed shortest detour. In a separate trained-action study, reinforcement remains constant while a species-typical competing response rises. Which conclusions are bounded by the data?',
        choices: [
          {
            id: 'a',
            text: 'U supports latent learning; M strengthens the cognitive-map inference; the trained-action pattern supports instinctive drift',
            rationale:
              'The conclusions separate acquisition, flexible spatial transfer, and continued-reinforcement intrusion.',
            correct: true,
          },
          {
            id: 'b',
            text: 'U proves no learning; M proves shaping; the trained-action pattern proves extinction',
            rationale: 'Each conclusion contradicts the stated reward and reinforcement structure.',
          },
          {
            id: 'c',
            text: 'All three prove preparedness',
            rationale: 'Only differential associative ease would directly test preparedness.',
          },
          {
            id: 'd',
            text: 'All three are classical generalization',
            rationale:
              'The cases concern spatial knowledge and operant interference, not similar conditioned cues.',
          },
        ],
        hint: 'This planner task is simulated. Keep acquisition, representation, and biological interference distinct.',
      },
    ],
  },
};

const KC4: KC = {
  id: 'V3-KC-730668',
  label: 'Explain cognitive and biological constraints on associative learning',
  shortLabel: 'Constraints',
  competence:
    'Explain latent learning, cognitive maps, preparedness, taste aversion, and instinctive drift from expected-versus-observed evidence.',
  representations: ['expected-versus-observed learning curve', 'constraint vignette'],
  duration: '16 min',
  entry: k4Entry,
  routeCopy: {
    prepared: [
      'Both acquisition-versus-performance decisions were correct, unassisted, and unexposed.',
      'All constraint examples and fresh exit checks remain required.',
    ],
    standard: [
      'Build the distinction between acquired knowledge and current performance before comparing biological constraints.',
      'Use changed-task evidence to test the proposed representation.',
    ],
    targeted: [
      'Two responses provisionally match a reward-required-for-acquisition pattern; the route is not a diagnosis.',
      'Review the acquisition-versus-performance primer before prediction.',
    ],
  },
  prediction: k4Prediction,
  model: k4Model,
  expert: k4Expert,
  a2: k4A2,
  a1: k4A1,
  a0: k4A0,
  contrast: k4Contrast,
  exits: k4Exits,
  plannerExit: k4PlannerExit,
  repairs: k4Repairs,
  handoff: {
    id: 'k4-handoff',
    stage: 'Handoff',
    title: 'Integrate without overclaiming',
    duration: '0:25',
    body: [
      'You can now identify whether a changing response reflects repetition, cue prediction, action consequences, hidden knowledge, or biological constraint.',
      'The optional application integrates these mechanisms. It does not complete the separate capstone.',
    ],
  },
  remediationId: 'R14-REM-PS-096',
};

const KCS: KC[] = [KC1, KC2, KC3, KC4];

const PRACTICE_RECOVERY_BANKS: Record<string, [Question, Question]> = {
  'k1-a2': [
    recoveryQuestion(
      'k1-a2-recovery-1',
      'Glances to one repeated notification banner fall from 8 to 2 seconds. An unexpected vibration occurs. Glancing to the original banner then rises to 7 seconds.',
      'Habituation followed by dishabituation',
      'The response to the repeated banner falls and then rebounds to that original banner after a different stimulus.',
      [
        [
          'Sensory adaptation only',
          'The evidence is a stimulus-specific behavioral rebound, not a measured sensory decrement.',
        ],
        ['Classical acquisition', 'No second event is paired with the banner.'],
        ['Operant extinction', 'No action’s consequence is discontinued.'],
      ],
      'Track the response to the original banner before and after the vibration.',
    ),
    recoveryQuestion(
      'k1-a2-recovery-2',
      'Pupil orienting to one repeated grid falls across trials. A brief tone occurs. The same grid then evokes a larger orienting response.',
      'Dishabituation of a habituated response',
      'The original-grid response recovers after a different stimulus.',
      [
        [
          'Response to novelty only',
          'The measured rebound is to the original grid, not merely to the tone.',
        ],
        ['Sensory adaptation', 'No decline in sensory-system responsiveness is isolated.'],
        ['Negative reinforcement', 'No action removes an event.'],
      ],
      'Identify which stimulus produces the final measurement.',
    ),
  ],
  'k1-a1': [
    recoveryQuestion(
      'k1-a1-recovery-1',
      'Tactile input remains stable. Orienting to pulses at one wrist falls, while orienting to equal pulses at the other wrist remains high.',
      'Habituation supported by stimulus specificity',
      'Stable input and location-specific behavioral decrement argue against broad sensory or motor failure.',
      [
        ['Dishabituation', 'The original wrist was not retested after a different stimulus.'],
        ['Broad sensory adaptation', 'Sensitivity to the other equal pulse remains high.'],
        ['Classical conditioning', 'No predictive event pairing appears.'],
      ],
      'Use the intact comparison stimulus as a control.',
    ),
    recoveryQuestion(
      'k1-a1-recovery-2',
      'A repeated word produces progressively less orienting, but the same head-turn action remains intact to the learner’s name. After a rest, orienting to the word partially returns.',
      'Habituation with spontaneous recovery',
      'The behavioral response declines with repetition, motor ability remains intact, and the original response partially returns after rest.',
      [
        ['Dishabituation', 'A rest occurred, not a different dishabituating stimulus.'],
        ['Motor fatigue', 'The head-turn remains available to the learner’s name.'],
        ['Operant extinction', 'No reinforcer for an action was discontinued.'],
      ],
      'Distinguish recovery after rest from recovery after a different stimulus.',
    ),
  ],
  'k1-a0': [
    recoveryQuestion(
      'k1-a0-recovery-1',
      'During an unchanged background hum, auditory evoked activity and perceived loudness both decline. No stimulus-specific behavioral control is included.',
      'Sensory adaptation is best supported',
      'The evidence directly locates reduced sensory responsiveness during continued input.',
      [
        [
          'Habituation is established',
          'Behavioral learning has not been isolated from sensory change.',
        ],
        ['Dishabituation', 'No different stimulus and original-response rebound occur.'],
        ['Classical extinction', 'No CS-alone phase is present.'],
      ],
      'Name the level of the measured decrement.',
    ),
    recoveryQuestion(
      'k1-a0-recovery-2',
      'Receptor output to constant skin pressure falls from 52 to 14 units while a separate motor command remains normal. No changed-stimulus test occurs.',
      'Sensory adaptation',
      'The decrement is measured in sensory output during constant stimulation.',
      [
        ['Dishabituation', 'No original response is retested after another stimulus.'],
        ['Habituation is proven', 'The data do not isolate a learned behavioral decrement.'],
        ['Avoidance learning', 'No action prevents an event.'],
      ],
      'Use the receptor-output measurement rather than the direction of the line alone.',
    ),
  ],
  'k2-a2': [
    recoveryQuestion(
      'k2-a2-recovery-1',
      'A vibration initially produces no blink. A puff naturally produces a blink. After vibration → puff pairings, vibration alone produces anticipatory blinking.',
      'Vibration NS→CS; puff US; puff blink UR; vibration blink CR',
      'Stimulus and response labels follow unlearned and learned functions.',
      [
        ['Vibration US; puff CS', 'The puff elicits the blink without the target training.'],
        ['Vibration UR; blinking NS', 'The vibration is a stimulus and blinking is a response.'],
        ['Operant reinforcement', 'No action changes a consequence.'],
      ],
      'Begin with the event that elicits a response without training.',
    ),
    recoveryQuestion(
      'k2-a2-recovery-2',
      'A white circle precedes a tart taste that naturally causes salivation. Later, the circle alone causes salivation.',
      'Circle CS; taste US; taste salivation UR; circle salivation CR',
      'The circle acquires predictive control; the taste elicits the unlearned response.',
      [
        ['Circle US; taste NS', 'The circle did not initially elicit the target response.'],
        ['Taste CR; salivation CS', 'The taste is a stimulus and salivation is a response.'],
        ['Negative reinforcement', 'No action removes an event.'],
      ],
      'Keep presented events separate from responses.',
    ),
  ],
  'k2-a1': [
    recoveryQuestion(
      'k2-a1-recovery-1',
      'An established light CS predicts a puff. A novel texture repeatedly precedes the light but never the puff. The texture later evokes the CR.',
      'Higher-order conditioning',
      'The novel cue acquires control through an established CS rather than direct US pairing.',
      [
        ['Generalization', 'The texture need not resemble the light.'],
        ['Spontaneous recovery', 'No extinction and rest sequence occurs.'],
        ['Operant shaping', 'No successive approximations are reinforced.'],
      ],
      'Identify what the novel cue was paired with.',
    ),
    recoveryQuestion(
      'k2-a1-recovery-2',
      'A cue-alone response falls from 6 to 0 across trials. After a day without trials, the cue alone produces a response of 2.',
      'Extinction followed by spontaneous recovery',
      'CS-alone trials reduce the CR, which partially returns after a rest.',
      [
        [
          'Habituation and dishabituation',
          'No different stimulus precedes recovery to a repetition-only response.',
        ],
        ['Acquisition and discrimination', 'No CS–US pairing or second cue appears.'],
        ['Operant extinction', 'No action’s reinforcer is discontinued.'],
      ],
      'Find the CS-alone decline and the rest interval.',
    ),
  ],
  'k2-a0': [
    recoveryQuestion(
      'k2-a0-recovery-1',
      'After a 900-Hz tone becomes a CS, 860-Hz and 940-Hz tones also evoke weaker CRs before differential training.',
      'Stimulus generalization',
      'Conditioned responding spreads to similar tones.',
      [
        ['Discrimination', 'Differential responding has not yet been trained.'],
        ['Extinction', 'The CS is not repeatedly presented without the US.'],
        ['Dishabituation', 'No habituated original response is restored.'],
      ],
      'Ask whether a similar untrained stimulus evokes the CR.',
    ),
    recoveryQuestion(
      'k2-a0-recovery-2',
      'After one tone is paired with a puff and a nearby tone is repeatedly unpaired, responding is 80% versus 8%.',
      'Stimulus discrimination',
      'Differential cue outcomes produce sharply different responding.',
      [
        ['Generalization only', 'Generalization would not explain the trained divergence.'],
        ['Spontaneous recovery', 'No extinction-rest-return sequence appears.'],
        ['Habituation', 'The difference depends on paired versus unpaired cue histories.'],
      ],
      'Use the differential outcomes for the two cues.',
    ),
  ],
  'k3-a2': [
    recoveryQuestion(
      'k3-a2-recovery-1',
      'A learner is reinforced first for opening Settings, then for selecting Keyboard, then for entering a shortcut. Which process and consequence are present?',
      'Shaping through positive reinforcement',
      'Successive approximations receive an added reinforcer.',
      [
        [
          'Habituation through negative reinforcement',
          'The target response is being acquired through consequences, not repetition-only decrement.',
        ],
        ['Classical acquisition', 'The defining structure is action → consequence.'],
        ['Negative punishment', 'Behavior is being increased, not reduced.'],
      ],
      'Identify the narrowing response criterion and behavior direction.',
    ),
    recoveryQuestion(
      'k3-a2-recovery-2',
      'Completing a safety check removes an irritating overlay, and checks increase.',
      'Negative reinforcement',
      'The consequence is removed and the behavior increases.',
      [
        ['Negative punishment', 'Punishment requires behavior to decrease.'],
        ['Positive reinforcement', 'No event is added.'],
        ['Classical extinction', 'The relation is action → consequence.'],
      ],
      'Use direction first, then addition or removal.',
    ),
  ],
  'k3-a1': [
    recoveryQuestion(
      'k3-a1-recovery-1',
      'A token follows responses 3, 6, 9, and 12. When tokens stop, responding falls across blocks.',
      'FR-3 followed by operant extinction',
      'Three is a predictable response count, and behavior declines after the reinforcer stops.',
      [
        ['FI-3 followed by punishment', 'Three counts responses, and no punisher is delivered.'],
        [
          'VR followed by spontaneous recovery',
          'The count is fixed and no rest-return sequence appears.',
        ],
        [
          'Continuous reinforcement followed by habituation',
          'Only every third response is reinforced.',
        ],
      ],
      'Ratio counts responses; extinction follows reinforcer discontinuation.',
    ),
    recoveryQuestion(
      'k3-a1-recovery-2',
      'Every correct response immediately earns one exchangeable credit. Which schedule and reinforcer type apply?',
      'Continuous reinforcement with a conditioned reinforcer',
      'Every response is reinforced, and the exchangeable credit has acquired value.',
      [
        [
          'FR-2 with a primary reinforcer',
          'Every response, not every second response, earns credit; the credit is learned in value.',
        ],
        [
          'Variable interval with punishment',
          'Neither changing time nor behavioral suppression appears.',
        ],
        ['Classical conditioning only', 'A response directly produces the credit.'],
      ],
      'Separate reinforcement frequency from how the reinforcer acquired value.',
    ),
  ],
  'k3-a0': [
    recoveryQuestion(
      'k3-a0-recovery-1',
      'A warning predicts a forthcoming tone. Pressing a key during the warning prevents the tone, and key presses increase.',
      'Avoidance maintained by negative reinforcement',
      'The action prevents a forthcoming event and increases.',
      [
        ['Escape', 'The tone has not started.'],
        ['Positive punishment', 'No event is added after the key press, and behavior rises.'],
        ['Classical conditioning only', 'The measured action changes its consequence.'],
      ],
      'Determine whether the aversive event is ongoing or forthcoming.',
    ),
    recoveryQuestion(
      'k3-a0-recovery-2',
      'A corrective alert is added after unsafe entries, and unsafe entries decrease.',
      'Positive punishment',
      'An event is added and the target behavior decreases.',
      [
        ['Negative reinforcement', 'Nothing is removed and behavior does not increase.'],
        ['Negative punishment', 'The consequence is added rather than removed.'],
        ['Avoidance learning', 'The entries do not prevent a forthcoming event.'],
      ],
      'Direction first; then decide whether the consequence was added.',
    ),
  ],
  'k4-a2': [
    recoveryQuestion(
      'k4-a2-recovery-1',
      'After unrewarded exploration of a campus map, a blocked walkway leads a person to choose an efficient route never previously walked.',
      'Latent learning expressed through a cognitive map',
      'Knowledge was acquired before incentive and supports a novel detour.',
      [
        ['Shaping', 'No approximations were reinforced.'],
        ['Instinctive drift', 'No innate behavior intrudes.'],
        ['Taste aversion', 'No flavor–illness relation exists.'],
      ],
      'Use acquisition timing and flexible route transfer.',
    ),
    recoveryQuestion(
      'k4-a2-recovery-2',
      'A participant observes a virtual town without a goal. Once a destination is announced, the participant immediately chooses a shortcut across unfamiliar connecting streets.',
      'Latent learning with a cognitive map',
      'Previously unexpressed spatial knowledge supports flexible shortcut use.',
      [
        ['Operant shaping', 'No successive route approximations earned consequences.'],
        [
          'Classical generalization',
          'The evidence concerns spatial relations rather than cue similarity.',
        ],
        ['Instinctive drift', 'No species-typical action displaces training.'],
      ],
      'Ask whether knowledge precedes the reason to demonstrate it.',
    ),
  ],
  'k4-a1': [
    recoveryQuestion(
      'k4-a1-recovery-1',
      'After one delayed illness episode, a novel herb flavor is strongly avoided while an accompanying geometric icon is weakly avoided.',
      'Prepared taste-aversion learning',
      'Flavor–illness learning is relatively favored and can bridge a delay.',
      [
        ['All icon learning is impossible', 'Preparedness is relative, not absolute.'],
        ['Operant punishment', 'No action controls the illness.'],
        ['Habituation', 'Avoidance is acquired rather than progressively reduced.'],
      ],
      'Interpret selective learning without turning it into impossibility.',
    ),
    recoveryQuestion(
      'k4-a1-recovery-2',
      'Equal exposure yields 78% avoidance for flavor→illness and 18% for light→illness.',
      'Preparedness changes relative learnability',
      'The association types differ strongly under equal exposure.',
      [
        [
          'Light→illness can never be learned',
          'The data show a rate or strength difference, not impossibility.',
        ],
        ['The flavor response habituated', 'Avoidance increased through association.'],
        ['A fixed-ratio schedule caused the result', 'The task is classical cue–outcome learning.'],
      ],
      'State a comparative conclusion only.',
    ),
  ],
  'k4-a0': [
    recoveryQuestion(
      'k4-a0-recovery-1',
      'A species-typical sorting motion rises while a trained deposit response falls, even though every correct deposit still earns its consequence.',
      'Instinctive drift',
      'An innate action intrudes despite continued reinforcement.',
      [
        ['Operant extinction', 'The consequence remains available.'],
        ['Latent learning', 'No hidden knowledge is revealed.'],
        ['Sensory adaptation', 'No sensory-response decrement is measured.'],
      ],
      'Check whether reinforcement stopped or another behavior intruded.',
    ),
    recoveryQuestion(
      'k4-a0-recovery-2',
      'Target responses decline from 16 to 7 while an innate handling pattern rises from 2 to 11; the target response remains reinforced.',
      'Instinctive drift rather than extinction',
      'The opposing behavior trends occur while target reinforcement continues.',
      [
        ['Extinction', 'Extinction requires reinforcer discontinuation.'],
        ['Prepared taste aversion', 'No flavor–illness association appears.'],
        ['Cognitive-map learning', 'No flexible spatial representation is tested.'],
      ],
      'Compare reinforcement availability with the rising competing response.',
    ),
  ],
};

const SUPPORT_SCREEN: Screen = {
  id: 'support-941207',
  stage: 'V3-SUP-941207 · noncredit refresher',
  title: 'One stimulus, two systems, or two events?',
  duration: '2:30',
  body: [
    'Same stimulus repeats; a behavioral response progressively falls; sensory and motor controls remain intact: habituation is supported.',
    'A different stimulus occurs; the response to the original habituated stimulus then rises: dishabituation is supported.',
    'Evidence locates reduced sensitivity in sensory processing during continued stimulation: sensory adaptation is supported.',
    'One cue predicts another event: test classical conditioning. An action changes what happens next: test operant conditioning.',
  ],
  questions: [
    {
      id: 'support-941207-check',
      prompt:
        'Auditory input remains stable while head-turning to one repeated tone declines. After a light flash, head-turning to the original tone rises. What is the complete pattern?',
      choices: [
        {
          id: 'a',
          text: 'Habituation followed by dishabituation',
          rationale:
            'Behavior falls with repetition and recovers to the original after a different stimulus.',
          correct: true,
        },
        {
          id: 'b',
          text: 'Sensory adaptation only',
          rationale: 'Stable input and original-response recovery favor behavioral learning.',
        },
        {
          id: 'c',
          text: 'Classical acquisition',
          rationale: 'No predictive tone–event pairing is trained.',
        },
        {
          id: 'd',
          text: 'Operant punishment',
          rationale: 'No action–consequence relation exists.',
        },
      ],
      hint: 'Support is noncredit. Track the original tone before and after the flash.',
    },
  ],
};

const EXTENSION_SCREEN: Screen = {
  id: 'extension-910216',
  stage: 'V3-EXT-910216 · optional application',
  title: 'One curve is not one mechanism',
  duration: '9:00',
  intro:
    'Classify four files from trial structure. Extension attempts create no core, durable, transfer, or capstone evidence.',
  questions: [
    {
      id: 'extension-file-a',
      prompt:
        'File A: repeated beacon response is 10, 8, 6, and 3. A different click occurs. Response to the original beacon is then 8.',
      choices: [
        {
          id: 'a',
          text: 'Habituation followed by dishabituation',
          rationale: 'The original response declines and then rebounds after another stimulus.',
          correct: true,
        },
        {
          id: 'b',
          text: 'Classical extinction',
          rationale: 'No learned CS–US relation is withdrawn.',
        },
        { id: 'c', text: 'Negative reinforcement', rationale: 'No action removes an event.' },
        {
          id: 'd',
          text: 'Preparedness',
          rationale: 'No relative biological learnability is tested.',
        },
      ],
      hint: 'Track the original beacon across the stimulus change.',
    },
    {
      id: 'extension-file-b',
      prompt:
        'File B: a blue cue initially produces no blink; an air puff produces a blink; cue → puff pairings are followed by anticipatory blinking to the cue alone.',
      choices: [
        {
          id: 'a',
          text: 'Classical conditioning',
          rationale: 'The cue acquires predictive control through pairing with the puff.',
          correct: true,
        },
        {
          id: 'b',
          text: 'Habituation',
          rationale: 'The response rises through a two-event association.',
        },
        { id: 'c', text: 'Operant shaping', rationale: 'No approximations are reinforced.' },
        { id: 'd', text: 'Instinctive drift', rationale: 'No innate action intrudes.' },
      ],
      hint: 'Ask whether a cue predicts another event.',
    },
    {
      id: 'extension-file-c',
      prompt:
        'File C: a buzz is already sounding. An action stops it. The action rises from 2 to 12 per session.',
      choices: [
        {
          id: 'a',
          text: 'Escape maintained by negative reinforcement',
          rationale: 'The action terminates an ongoing aversive event and increases.',
          correct: true,
        },
        {
          id: 'b',
          text: 'Avoidance maintained by punishment',
          rationale: 'The event is ongoing rather than forthcoming, and behavior rises.',
        },
        {
          id: 'c',
          text: 'Positive reinforcement',
          rationale: 'The event is removed rather than added.',
        },
        { id: 'd', text: 'Classical generalization', rationale: 'No similar cue test occurs.' },
      ],
      hint: 'Ask whether the event is already happening.',
    },
    {
      id: 'extension-file-d',
      prompt:
        'File D: unrewarded maze exploration is followed by an immediate novel shortcut after a goal appears. Later, a natural object-scraping action displaces a still-reinforced deposit response.',
      choices: [
        {
          id: 'a',
          text: 'Latent learning/cognitive map, then instinctive drift',
          rationale:
            'The first pattern reveals flexible hidden knowledge; the second shows innate-action intrusion.',
          correct: true,
        },
        {
          id: 'b',
          text: 'Shaping, then extinction',
          rationale: 'No approximations were reinforced and reinforcement did not stop.',
        },
        {
          id: 'c',
          text: 'Taste aversion, then habituation',
          rationale: 'No flavor–illness relation or repetition-only decline appears.',
        },
        {
          id: 'd',
          text: 'Discrimination, then punishment',
          rationale: 'Neither differential cue training nor a suppressing consequence matches.',
        },
      ],
      hint: 'Treat the maze and trained-action portions as separate mechanisms.',
    },
  ],
};

const initialState: LessonState = {
  schemaVersion: STATE_SCHEMA_VERSION,
  contentId: CONTENT_ID,
  contentVersion: CONTENT_VERSION,
  policyId: POLICY_ID,
  policyVersion: POLICY_VERSION,
  registryId: REGISTRY_ID,
  registryVersion: REGISTRY_VERSION,
  runId: 1,
  runDisposition: 'internal-review-simulation',
  mode: 'learner',
  reviewerTab: 'manifest',
  kcIndex: 0,
  phase: 'entry',
  attempts: {},
  routes: {},
  exitRound: 0,
  repairCount: 0,
  completedKcs: [],
  supportOpen: false,
  extensionComplete: false,
  lessonComplete: false,
  events: [
    {
      seq: 1,
      runId: 1,
      contentId: CONTENT_ID,
      contentVersion: CONTENT_VERSION,
      policyId: POLICY_ID,
      policyVersion: POLICY_VERSION,
      registryId: REGISTRY_ID,
      registryVersion: REGISTRY_VERSION,
      type: 'lesson_shell_started',
      detail: 'V3-LES-225658 internal simulation initialized',
    },
  ],
  attemptHistory: [],
  exposureHistory: [],
  archivedRuns: [],
  reviewerExposed: false,
  supportViewedKcs: [],
  routePrimerViewedKcs: [],
  contaminatedExitPairs: {},
  recoveryIndex: {},
  modelExpanded: {},
  plannerTaskActive: false,
  plannerTaskUsed: false,
  resetConfirmation: false,
};

const PHASE_ORDER: Phase[] = [
  'entry',
  'route',
  'model',
  'expert',
  'prediction',
  'a2',
  'a1',
  'a0',
  'contrast',
  'exitNear',
  'exitChanged',
  'repair',
  'handoff',
];

const PHASE_LABELS: Record<Phase, string> = {
  entry: 'Entry',
  route: 'Route',
  prediction: 'Predict',
  model: 'Model',
  expert: 'Expert',
  a2: 'A2',
  a1: 'A1',
  a0: 'A0',
  contrast: 'Contrast',
  exitNear: 'Near exit',
  exitChanged: 'Changed exit',
  repair: 'Repair',
  handoff: 'Handoff',
  paused: 'Paused',
  complete: 'Complete',
  extension: 'Extension',
};

const LEARNER_PHASE_LABELS: Record<Phase, string> = {
  entry: 'Starting point',
  route: 'Your learning path',
  model: 'Mini-model',
  expert: 'Worked example',
  prediction: 'Try the model',
  a2: 'Guided practice',
  a1: 'Less help',
  a0: 'On your own',
  contrast: 'Compare close ideas',
  exitNear: 'Fresh check',
  exitChanged: 'New context',
  repair: 'Repair and retry',
  handoff: 'Wrap-up',
  paused: 'Pause',
  complete: 'Complete',
  extension: 'Optional application',
};

const LEARNER_FOCUS: Record<Phase, string> = {
  entry: 'Answer from what you know now. These questions only choose your starting point.',
  route: 'See the causal pattern before you classify a new case.',
  model: 'Build the rule for this topic before applying it.',
  expert: 'Watch the rule explain one concrete example.',
  prediction: 'Use the worked example to make one guided prediction.',
  a2: 'Apply the deciding cue while support is visible.',
  a1: 'Use the same distinction with less help.',
  a0: 'Identify the causal pattern on your own.',
  contrast: 'Explain why the nearest alternative has a different cause.',
  exitNear: 'Apply the distinction to one fresh case.',
  exitChanged: 'Apply the same distinction when the surface details change.',
  repair: 'Learn the failed causal distinction, then try one new case.',
  handoff: 'Name the rule you will carry into the next topic.',
  paused: 'Pause here until a genuinely fresh practice set is available.',
  complete: 'Review the causal patterns you can now distinguish.',
  extension: 'Apply the same reasoning across mixed examples.',
};

const PLAIN_LANGUAGE_MINI_MODEL: DiagramSpec = {
  title: 'Two ways events can be connected',
  rows: [
    {
      label: 'Pairing',
      nodes: [
        { label: 'CS', detail: 'cue' },
        { label: 'US', detail: 'what comes next' },
      ],
      links: ['predicts'],
    },
    {
      label: 'Consequence',
      nodes: [
        { label: 'Response', detail: 'action' },
        { label: 'Consequence', detail: 'follows action' },
        { label: 'Future response', detail: 'more or less likely' },
      ],
      links: ['produces', 'changes'],
    },
  ],
  textEquivalent:
    'With predictive pairing, a conditioned stimulus predicts the unconditioned stimulus that comes next. With consequences, a response produces an outcome that makes the response more or less likely in the future.',
};

const REVIEWER_TABS: Array<{ id: ReviewerTab; label: string }> = [
  { id: 'manifest', label: 'Manifest' },
  { id: 'screens', label: 'Screens & keys' },
  { id: 'evidence', label: 'Evidence' },
  { id: 'accessibility', label: 'Accessibility' },
  { id: 'provenance', label: 'Provenance' },
  { id: 'qa', label: 'QA' },
];

const TARGET_PRIMERS: Record<string, string> = {
  'V3-KC-337354':
    'A quieter sensory signal supports adaptation; a smaller stimulus-specific action with intact sensing supports habituation. After a novel event, retest the original stimulus before calling the rebound dishabituation.',
  'V3-KC-564671':
    'The cue and the event it predicts are stimuli; blinking or salivating are responses. A cue can change from neutral to conditioned, but a stimulus never becomes a response.',
  'V3-KC-628404':
    'First ask whether the action became more or less likely. Only then ask whether the consequence was added or removed. Removal can reinforce, and addition can punish.',
  'V3-KC-730668':
    'A sudden improvement after a goal appears can reveal knowledge learned earlier. A biological tilt makes one association easier; it does not make every other association impossible.',
};

function appendEvent(
  state: LessonState,
  type: CanvasEventName,
  detail: string,
  kcId?: string,
  itemId?: string,
): LessonState {
  const event: EventRecord = {
    seq: state.events.length ? state.events[state.events.length - 1].seq + 1 : 1,
    runId: state.runId,
    contentId: state.contentId,
    contentVersion: state.contentVersion,
    policyId: state.policyId,
    policyVersion: state.policyVersion,
    registryId: state.registryId,
    registryVersion: state.registryVersion,
    type,
    detail,
    kcId,
    itemId,
  };
  return { ...state, events: [...state.events, event] };
}

function appendExposure(
  state: LessonState,
  kind: ExposureRecord['kind'],
  detail: string,
  kcId?: string,
  itemId?: string,
): LessonState {
  const exposure: ExposureRecord = {
    seq: state.exposureHistory.length
      ? state.exposureHistory[state.exposureHistory.length - 1].seq + 1
      : 1,
    runId: state.runId,
    contentVersion: state.contentVersion,
    kind,
    detail,
    kcId,
    itemId,
  };
  return { ...state, exposureHistory: [...state.exposureHistory, exposure] };
}

function openInternalReviewer(state: LessonState, reviewerTab: ReviewerTab = state.reviewerTab) {
  if (state.mode === 'reviewer' && state.reviewerExposed && state.reviewerTab === reviewerTab) {
    return state;
  }
  const exposedAttempts = Object.fromEntries(
    Object.entries(state.attempts).map(([itemId, attempt]) => [
      itemId,
      { ...attempt, exposed: true },
    ]),
  );
  const activeKc = KCS[Math.min(state.kcIndex, KCS.length - 1)];
  const enteringDuringExit =
    state.mode !== 'reviewer' && (state.phase === 'exitNear' || state.phase === 'exitChanged');
  let next: LessonState = {
    ...state,
    mode: 'reviewer',
    reviewerTab,
    reviewerExposed: true,
    attempts: exposedAttempts,
  };
  if (!state.reviewerExposed) {
    next = appendExposure(
      next,
      'reviewer_keys_opened',
      'Reviewer mode exposes every key and rationale; all responses in this run are simulated and non-authoritative.',
      activeKc.id,
    );
    next = appendEvent(
      next,
      'reviewer_mode_opened',
      'same-run keys exposed; run remains internal-review simulation',
      activeKc.id,
    );
  }
  if (enteringDuringExit) {
    const pairKey = exitPairKey(activeKc.id, state);
    next = {
      ...next,
      contaminatedExitPairs: {
        ...next.contaminatedExitPairs,
        [pairKey]: 'Reviewer mode opened during the active exit pair',
      },
    };
    next = appendExposure(
      next,
      'reviewer_during_exit',
      `Exit pair ${pairKey} contaminated by reviewer key exposure`,
      activeKc.id,
    );
    next = appendEvent(
      next,
      'exit_pair_contaminated',
      `reviewer opened during ${pairKey}; pair cannot pass`,
      activeKc.id,
    );
  }
  return next;
}

function simulateExternalPlannerAuthorization(state: LessonState) {
  if (
    state.mode !== 'reviewer' ||
    state.phase !== 'paused' ||
    state.plannerTaskUsed ||
    state.plannerAuthorization
  ) {
    return state;
  }
  const activeKc = KCS[Math.min(state.kcIndex, KCS.length - 1)];
  if (!activeKc.plannerExit) return state;
  const taskId = `SIM-PLANNER-${CONTENT_VERSION}-R${state.runId}-KC${state.kcIndex + 1}-FRESH-01`;
  return appendEvent(
    {
      ...state,
      plannerAuthorization: {
        kcId: activeKc.id,
        taskId,
        runId: state.runId,
        contentVersion: state.contentVersion,
        policyVersion: state.policyVersion,
        registryVersion: state.registryVersion,
      },
    },
    'external_planner_reentry_authorized',
    `${taskId} · reviewer-only simulation of external authorization for one newly authored task pair`,
    activeKc.id,
  );
}

function getChoice(question: Question, choiceId?: string) {
  return [...question.choices, NOT_SURE].find((choice) => choice.id === choiceId);
}

function questionIsExposed(state: LessonState, questionId: string) {
  return Boolean(
    state.reviewerExposed ||
      state.attempts[questionId]?.exposed ||
      state.attemptHistory.some((record) => record.questionId === questionId) ||
      state.exposureHistory.some((record) => record.kind === 'reviewer_keys_opened'),
  );
}

function runHasRehearsalExposure(state: LessonState) {
  return Boolean(
    state.runId > 1 ||
      state.reviewerExposed ||
      Object.values(state.attempts).some((attempt) => attempt.exposed),
  );
}

type StableKeyPosition = 0 | 1 | 2 | 3;

const KEY_POSITIONS: Record<string, StableKeyPosition> = {
  'k1-entry-classify': 0,
  'k1-entry-rationale': 1,
  'k2-entry-map': 2,
  'k2-entry-rationale': 3,
  'k3-entry-classify': 0,
  'k3-entry-rationale': 1,
  'k4-entry-classify': 2,
  'k4-entry-rationale': 3,
  'k1-x0-near-item': 0,
  'k1-x0-changed-item': 1,
  'k1-x1-near-item': 2,
  'k1-x1-changed-item': 3,
  'k1-x2-near-item': 0,
  'k1-x2-changed-item': 1,
  'k1-planner-near-item': 2,
  'k1-planner-changed-item': 3,
  'k2-x0-near-item': 2,
  'k2-x0-changed-item': 3,
  'k2-x1-near-item': 0,
  'k2-x1-changed-item': 1,
  'k2-x2-near-item': 2,
  'k2-x2-changed-item': 3,
  'k2-planner-near-item': 0,
  'k2-planner-changed-item': 1,
  'k3-x0-slot-contingency': 0,
  'k3-x0-slot-reinforcer': 2,
  'k3-x0-slot-schedule': 1,
  'k3-x0-slot-aversive': 3,
  'k3-x1-slot-contingency': 3,
  'k3-x1-slot-reinforcer': 1,
  'k3-x1-slot-schedule': 0,
  'k3-x1-slot-aversive': 2,
  'k3-x2-slot-contingency': 1,
  'k3-x2-slot-reinforcer': 3,
  'k3-x2-slot-schedule': 2,
  'k3-x2-slot-aversive': 0,
  'k3-planner-slot-contingency': 2,
  'k3-planner-slot-reinforcer': 0,
  'k3-planner-slot-schedule': 3,
  'k3-planner-slot-aversive': 1,
  'k4-x0-near-item': 1,
  'k4-x0-changed-item': 3,
  'k4-x1-near-item': 2,
  'k4-x1-changed-item': 0,
  'k4-x2-near-item': 3,
  'k4-x2-changed-item': 1,
  'k4-planner-near-item': 0,
  'k4-planner-changed-item': 2,
  'k1-a2-recovery-1': 0,
  'k1-a2-recovery-2': 1,
  'k1-a1-recovery-1': 2,
  'k1-a1-recovery-2': 3,
  'k1-a0-recovery-1': 0,
  'k1-a0-recovery-2': 1,
  'k2-a2-recovery-1': 2,
  'k2-a2-recovery-2': 3,
  'k2-a1-recovery-1': 0,
  'k2-a1-recovery-2': 1,
  'k2-a0-recovery-1': 2,
  'k2-a0-recovery-2': 3,
  'k3-a2-recovery-1': 0,
  'k3-a2-recovery-2': 1,
  'k3-a1-recovery-1': 2,
  'k3-a1-recovery-2': 3,
  'k3-a0-recovery-1': 0,
  'k3-a0-recovery-2': 1,
  'k4-a2-recovery-1': 2,
  'k4-a2-recovery-2': 3,
  'k4-a1-recovery-1': 0,
  'k4-a1-recovery-2': 1,
  'k4-a0-recovery-1': 2,
  'k4-a0-recovery-2': 3,
};

function orderedChoices(question: Question) {
  const choices = [...question.choices];
  const keyPosition = KEY_POSITIONS[question.id];
  const correctIndex = choices.findIndex((choice) => choice.correct);
  if (keyPosition !== undefined && correctIndex >= 0 && correctIndex !== keyPosition) {
    const [correctChoice] = choices.splice(correctIndex, 1);
    choices.splice(Math.min(keyPosition, choices.length), 0, correctChoice);
  }
  return choices;
}

function keyedExitQuestions(kc: KC) {
  return [
    ...kc.exits.flatMap((pair) => [
      ...(pair.near.questions ?? []),
      ...(pair.changed.questions ?? []),
    ]),
    ...(kc.plannerExit
      ? [...(kc.plannerExit.near.questions ?? []), ...(kc.plannerExit.changed.questions ?? [])]
      : []),
  ];
}

function assertStableKeyPositions() {
  const groups: Array<[string, Question[]]> = [
    ['entry', KCS.flatMap((kc) => kc.entry.questions ?? [])],
    ['exit', KCS.flatMap((kc) => keyedExitQuestions(kc))],
    ['recovery', Object.values(PRACTICE_RECOVERY_BANKS).flatMap((questions) => questions)],
  ];
  const targetIds = new Set<string>();

  groups.forEach(([groupName, questions]) => {
    const counts = [0, 0, 0, 0];
    questions.forEach((question) => {
      if (targetIds.has(question.id)) {
        throw new Error(`Duplicate stable key target: ${question.id}`);
      }
      targetIds.add(question.id);
      const position = KEY_POSITIONS[question.id];
      if (!Number.isInteger(position) || position < 0 || position > 3) {
        throw new Error(`Missing or invalid zero-based key position for ${question.id}`);
      }
      const correctChoices = question.choices.filter((choice) => choice.correct);
      if (correctChoices.length !== 1) {
        throw new Error(`Expected one key for ${question.id}; found ${correctChoices.length}`);
      }
      if (orderedChoices(question)[position]?.id !== correctChoices[0].id) {
        throw new Error(`Stable key placement failed for ${question.id}`);
      }
      counts[position] += 1;
    });
    if (counts.some((count) => count !== counts[0])) {
      throw new Error(
        `${groupName} key positions are not evenly distributed across A/B/C/D: ${counts.join('/')}`,
      );
    }
  });

  const configuredIds = Object.keys(KEY_POSITIONS);
  if (configuredIds.length !== targetIds.size || configuredIds.some((id) => !targetIds.has(id))) {
    throw new Error('Stable key config contains a missing or non-target item');
  }
  return true;
}

const KEY_POSITION_ASSERTION_PASSED = assertStableKeyPositions();

function validUnexposedPerformancePass(attempt: Attempt | undefined) {
  return Boolean(
    attempt?.committed &&
      attempt.correct &&
      !attempt.assisted &&
      !attempt.abstained &&
      !attempt.exposed,
  );
}

function isFadingPhase(phase: Phase) {
  return phase === 'a2' || phase === 'a1' || phase === 'a0';
}

function screenPassesUnexposed(screen: Screen, attempts: Record<string, Attempt>) {
  const questions = screen.questions ?? [];
  return (
    questions.length > 0 &&
    questions.every((question) => validUnexposedPerformancePass(attempts[question.id]))
  );
}

function allQuestionsCommitted(screen: Screen, attempts: Record<string, Attempt>) {
  return (screen.questions ?? []).every((question) => attempts[question.id]?.committed);
}

function misconceptionFor(question: Question, attempt: Attempt | undefined) {
  return getChoice(question, attempt?.selected)?.misconception;
}

function exitPairKey(kcId: string, state: LessonState) {
  return `${kcId}:${state.plannerTaskActive ? 'planner' : state.exitRound}`;
}

function currentExitPair(kc: KC, state: LessonState) {
  if (state.plannerTaskActive && kc.plannerExit) return kc.plannerExit;
  return kc.exits[Math.min(state.exitRound, 2)];
}

function screenForPhase(kc: KC, state: LessonState): Screen | undefined {
  if (state.phase === 'entry') return kc.entry;
  if (state.phase === 'prediction') return kc.prediction;
  if (state.phase === 'model') return kc.model;
  if (state.phase === 'expert') return kc.expert;
  if (state.phase === 'a2') return kc.a2;
  if (state.phase === 'a1') return kc.a1;
  if (state.phase === 'a0') return kc.a0;
  if (state.phase === 'contrast') return kc.contrast;
  if (state.phase === 'exitNear') return currentExitPair(kc, state).near;
  if (state.phase === 'exitChanged') return currentExitPair(kc, state).changed;
  if (state.phase === 'repair') return kc.repairs[Math.max(0, state.repairCount - 1)];
  if (state.phase === 'handoff') return kc.handoff;
  if (state.phase === 'extension') return EXTENSION_SCREEN;
  return undefined;
}

function learnerTableCaption(caption: string) {
  return caption
    .replace(/\bX[012]\s*/g, '')
    .replace(/\boriginal simulated\b/gi, 'instructional')
    .replace(/\bsimulated\b/gi, 'instructional')
    .replace(/\bV3-[A-Z]+-\d+\s*·?\s*/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function DataTableView({ spec, reviewer = false }: { spec: DataTableSpec; reviewer?: boolean }) {
  return (
    <Stack gap={6}>
      <Text size="small" tone="secondary" weight="semibold">
        {reviewer ? spec.caption : learnerTableCaption(spec.caption)}
      </Text>
      <div style={{ maxWidth: '100%', overflowX: 'auto' }}>
        <Table
          headers={spec.headers}
          rows={spec.rows.map((row) => row.map((cell) => String(cell)))}
          striped
        />
      </div>
    </Stack>
  );
}

function SemanticSequence({ items, label }: { items: string[]; label: string }) {
  const theme = useHostTheme();
  return (
    <ol
      aria-label={label}
      style={{
        margin: 0,
        paddingLeft: 22,
        color: theme.text.secondary,
        display: 'grid',
        gap: 6,
        fontSize: 13,
        lineHeight: '19px',
      }}
    >
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ol>
  );
}

function splitDiagramLabel(label: string) {
  if (label.length <= 14 || !label.includes(' ')) return [label];
  const words = label.split(' ');
  const midpoint = Math.ceil(words.length / 2);
  return [words.slice(0, midpoint).join(' '), words.slice(midpoint).join(' ')];
}

function ContingencyDiagram({ spec }: { spec: DiagramSpec }) {
  const theme = useHostTheme();
  return (
    <figure style={{ margin: 0, maxWidth: '100%' }}>
      <Stack gap={8}>
        <Text weight="semibold">{spec.title}</Text>
        {spec.rows.map((row) => {
          const count = row.nodes.length;
          const nodeWidth = count === 3 ? 88 : count === 2 ? 126 : 200;
          const gap = count === 3 ? 18 : count === 2 ? 52 : 0;
          const startX = count === 3 ? 4 : count === 2 ? 8 : 60;
          const rowDescription = row.nodes
            .map(
              (node, index) =>
                `${node.label}${node.detail ? `, ${node.detail}` : ''}${row.links[index] ? `, ${row.links[index]}` : ''}`,
            )
            .join('; ');
          return (
            <svg
              key={row.label}
              viewBox="0 0 320 108"
              width="100%"
              role="img"
              aria-label={`${row.label}: ${rowDescription}`}
              style={{ display: 'block', width: '100%', maxWidth: 560, minHeight: 108 }}
            >
              <title>{`${row.label}: ${rowDescription}`}</title>
              <text x="4" y="13" fill={theme.text.secondary} fontSize="11" fontWeight="600">
                {row.label}
              </text>
              {row.nodes.map((node, index) => {
                const x = startX + index * (nodeWidth + gap);
                const labelLines = splitDiagramLabel(node.label);
                const firstLineY = labelLines.length === 1 ? 72 : 65;
                return (
                  <g key={`${row.label}-${node.label}-${index}`}>
                    <rect
                      x={x}
                      y="45"
                      width={nodeWidth}
                      height="56"
                      rx="8"
                      fill={theme.fill.secondary}
                      stroke={theme.stroke.tertiary}
                    />
                    {labelLines.map((line, lineIndex) => (
                      <text
                        key={line}
                        x={x + nodeWidth / 2}
                        y={firstLineY + lineIndex * 12}
                        textAnchor="middle"
                        fill={theme.text.primary}
                        fontSize={count === 3 ? '10' : '11'}
                        fontWeight="600"
                      >
                        {line}
                      </text>
                    ))}
                    {node.detail && (
                      <text
                        x={x + nodeWidth / 2}
                        y="94"
                        textAnchor="middle"
                        fill={theme.text.secondary}
                        fontSize={count === 3 ? '8' : '9'}
                      >
                        {node.detail}
                      </text>
                    )}
                  </g>
                );
              })}
              {row.links.map((link, index) => {
                const fromX = startX + index * (nodeWidth + gap) + nodeWidth + 2;
                const toX = startX + (index + 1) * (nodeWidth + gap) - 5;
                const midpoint = (fromX + toX) / 2;
                return (
                  <g key={`${row.label}-${link}-${index}`}>
                    <text
                      x={midpoint}
                      y="36"
                      textAnchor="middle"
                      fill={theme.text.secondary}
                      fontSize="8"
                    >
                      {link}
                    </text>
                    <line
                      x1={fromX}
                      y1="73"
                      x2={toX}
                      y2="73"
                      stroke={theme.accent.primary}
                      strokeWidth="2"
                    />
                    <polygon
                      points={`${toX},73 ${toX - 6},69 ${toX - 6},77`}
                      fill={theme.accent.primary}
                    />
                  </g>
                );
              })}
            </svg>
          );
        })}
        <figcaption>
          <Text size="small" tone="tertiary">
            Text version: {spec.textEquivalent}
          </Text>
        </figcaption>
      </Stack>
    </figure>
  );
}

function ChartView({ spec, reviewer = false }: { spec: ChartSpec; reviewer?: boolean }) {
  return (
    <Stack gap={8}>
      <H3>{spec.title}</H3>
      <div style={{ borderLeft: '3px solid currentColor', paddingLeft: 10 }}>
        <Text size="small" tone="secondary" weight="semibold">
          How to read this chart
        </Text>
        <Text size="small" tone="secondary">
          X-axis: {spec.xLabel}. Y-axis: {spec.yLabel}. {spec.readingGuide}
        </Text>
      </div>
      {spec.kind === 'line' ? (
        <LineChart
          categories={spec.categories}
          series={spec.series}
          height={220}
          beginAtZero
          showValues
          valueSuffix={spec.valueSuffix}
        />
      ) : (
        <BarChart
          categories={spec.categories}
          series={spec.series}
          height={220}
          beginAtZero
          showValues
          valueSuffix={spec.valueSuffix}
        />
      )}
      <Text size="small" tone="tertiary">
        {spec.source}
      </Text>
      <DataTableView spec={spec.table} reviewer={reviewer} />
    </Stack>
  );
}

function learnerHint(hint: string) {
  return hint
    .replace(/^Using help converts (?:this|the whole) exit (?:item|pair) to instruction\.\s*/i, '')
    .replace(/^This planner task is simulated\.\s*/i, '')
    .replace(/^Support is noncredit\.\s*/i, '')
    .replace(/\bexit gate\b/gi, 'independent check')
    .trim();
}

function learnerScreenTitle(phase: Phase, screen: Screen) {
  if (phase === 'exitNear') return 'Apply the idea to a fresh case';
  if (phase === 'exitChanged') return 'Apply the idea in a new context';
  return screen.title;
}

function InlineFeedback({ title, children }: { title: string; children: string }) {
  const theme = useHostTheme();
  return (
    <div
      style={{
        borderLeft: `3px solid ${theme.accent.primary}`,
        background: theme.fill.secondary,
        borderRadius: 6,
        padding: '9px 11px',
      }}
    >
      <Text size="small" weight="semibold">
        {title}
      </Text>
      <Text size="small" tone="secondary">
        {children}
      </Text>
    </div>
  );
}

function QuestionBlock({
  question,
  attempt,
  exitMode,
  feedbackVisible,
  onSelect,
  onCommit,
  onHint,
}: {
  question: Question;
  attempt?: Attempt;
  exitMode: boolean;
  feedbackVisible: boolean;
  onSelect: (choiceId: string) => void;
  onCommit: () => void;
  onHint: () => void;
}) {
  const theme = useHostTheme();
  const choices = [...orderedChoices(question), NOT_SURE];
  const selectedChoice = getChoice(question, attempt?.selected);
  const hint = learnerHint(question.hint);

  return (
    <Stack gap={10} style={{ paddingTop: 4 }}>
      {question.context?.map((line) => (
        <div key={line}>
          <Text tone="secondary">{line}</Text>
        </div>
      ))}
      {question.sequence && (
        <SemanticSequence items={question.sequence} label="Trial sequence for this question" />
      )}
      {question.table && <DataTableView spec={question.table} />}
      <fieldset style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <legend
          style={{
            color: theme.text.primary,
            fontSize: 14,
            lineHeight: '20px',
            fontWeight: 590,
            marginBottom: 10,
          }}
        >
          {question.prompt.replace('A reviewer receives', 'You receive')}
        </legend>
        <Stack gap={7}>
          {choices.map((choice, index) => {
            const selected = attempt?.selected === choice.id;
            return (
              <label
                key={choice.id}
                style={{
                  display: 'flex',
                  gap: 9,
                  alignItems: 'flex-start',
                  padding: '9px 10px',
                  border: `1px solid ${selected ? theme.accent.primary : theme.stroke.tertiary}`,
                  borderRadius: 6,
                  background: selected ? theme.fill.secondary : theme.bg.editor,
                  color: theme.text.primary,
                  cursor: attempt?.committed ? 'default' : 'pointer',
                  fontSize: 13,
                  lineHeight: '18px',
                }}
              >
                <input
                  type="radio"
                  name={question.id}
                  value={choice.id}
                  checked={selected}
                  disabled={attempt?.committed}
                  onChange={() => onSelect(choice.id)}
                  style={{ marginTop: 2, accentColor: theme.accent.primary }}
                />
                <span>
                  {choice.id === 'not-sure'
                    ? choice.text
                    : `${String.fromCharCode(65 + index)}. ${choice.text}`}
                </span>
              </label>
            );
          })}
        </Stack>
      </fieldset>
      <Row gap={8} wrap align="center">
        <Button
          variant="primary"
          disabled={!attempt?.selected || attempt?.committed}
          onClick={onCommit}
        >
          Check answer
        </Button>
        <Button variant="ghost" disabled={attempt?.committed} onClick={onHint}>
          {attempt?.assisted ? 'Cue shown' : 'Show one cue'}
        </Button>
        {attempt?.assisted && (
          <Text size="small" tone="tertiary">
            Cue used{exitMode ? '; this becomes practice' : ''}
          </Text>
        )}
      </Row>
      {(attempt?.assisted || attempt?.exposed) && !attempt.committed && (
        <Callout
          tone={attempt.exposed ? 'warning' : 'info'}
          title={attempt.exposed ? 'Practice guidance' : 'One cue'}
        >
          {attempt.assisted
            ? exitMode
              ? `Use this to learn the distinction. You will receive a fresh check afterward. ${hint}`
              : hint
            : ''}
          {attempt.exposed
            ? `${attempt.assisted ? ' ' : ''}You have already seen this item or its answer. Use it to practice; a fresh item will be used for an independent check.`
            : ''}
        </Callout>
      )}
      {attempt?.committed && selectedChoice && feedbackVisible && (
        <div role="status" aria-live="polite" aria-atomic="true">
          <InlineFeedback
            title={
              selectedChoice.correct
                ? attempt.assisted
                  ? 'Correct with a cue'
                  : attempt.exposed
                    ? 'Correct for practice'
                    : 'Correct'
                : selectedChoice.id === 'not-sure'
                  ? 'Abstention recorded'
                  : 'Not yet'
            }
          >
            {`${selectedChoice.rationale}${!selectedChoice.correct ? ` Deciding cue: ${hint}` : ''}${exitMode && attempt.assisted ? ' Because you used a cue, you will get a fresh check next.' : ''}${attempt.exposed ? ' Because this item was already visible, it remains practice.' : ''}`}
          </InlineFeedback>
        </div>
      )}
    </Stack>
  );
}

function PairFeedback({ pair, attempts }: { pair: ExitPair; attempts: Record<string, Attempt> }) {
  const questions = [...(pair.near.questions ?? []), ...(pair.changed.questions ?? [])];
  return (
    <Stack gap={8}>
      <H3>Feedback on both cases</H3>
      <Text size="small" tone="secondary">
        Feedback appears now so the second case could test the same idea in a changed context
        without revealing the first answer.
      </Text>
      {questions.map((question) => {
        const attempt = attempts[question.id];
        const selected = getChoice(question, attempt?.selected);
        if (!attempt?.committed || !selected) return null;
        return (
          <div key={question.id} role="status" aria-live="polite">
            <InlineFeedback
              title={
                selected.correct
                  ? 'Correct'
                  : selected.id === 'not-sure'
                    ? 'Not sure'
                    : 'Review this distinction'
              }
            >
              {`${selected.rationale}${attempt.assisted ? ' A cue made this practice, so a fresh check is needed.' : ''}${attempt.exposed ? ' This item was already visible, so it remains practice.' : ''}`}
            </InlineFeedback>
          </div>
        );
      })}
    </Stack>
  );
}

function ScreenContent({
  screen,
  attempts,
  exitMode,
  feedbackVisible,
  onSelect,
  onCommit,
  onHint,
}: {
  screen: Screen;
  attempts: Record<string, Attempt>;
  exitMode: boolean;
  feedbackVisible: boolean;
  onSelect: (questionId: string, choiceId: string) => void;
  onCommit: (question: Question) => void;
  onHint: (questionId: string) => void;
}) {
  const questions = screen.questions ?? [];
  const firstOpenQuestion = questions.findIndex((question) => !attempts[question.id]?.committed);
  const visibleQuestions =
    firstOpenQuestion === -1 ? questions : questions.slice(0, firstOpenQuestion + 1);

  return (
    <Stack gap={14}>
      {screen.intro && <Text tone="secondary">{screen.intro}</Text>}
      {screen.body?.map((paragraph) => (
        <div key={paragraph}>
          <Text>{paragraph}</Text>
        </div>
      ))}
      {screen.bullets && (
        <SemanticSequence items={screen.bullets} label={`${screen.title} key points`} />
      )}
      {screen.visual && <ContingencyDiagram spec={screen.visual} />}
      {screen.sequence && (
        <SemanticSequence items={screen.sequence} label={`${screen.title} sequence`} />
      )}
      {screen.chart && <ChartView spec={screen.chart} />}
      {screen.table && <DataTableView spec={screen.table} />}
      {screen.annotations && (
        <Stack gap={7}>
          <H3>Worked-example reasoning</H3>
          <SemanticSequence
            items={screen.annotations}
            label={`${screen.title} expert annotations`}
          />
        </Stack>
      )}
      {visibleQuestions.map((question, index) => (
        <div key={question.id}>
          <Stack gap={10}>
            {index > 0 && <Divider />}
            <QuestionBlock
              question={question}
              attempt={attempts[question.id]}
              exitMode={exitMode}
              feedbackVisible={feedbackVisible}
              onSelect={(choiceId) => onSelect(question.id, choiceId)}
              onCommit={() => onCommit(question)}
              onHint={() => onHint(question.id)}
            />
          </Stack>
        </div>
      ))}
    </Stack>
  );
}

function ProgressHeader({ state }: { state: LessonState }) {
  const theme = useHostTheme();
  const completed = state.completedKcs.length;
  const phaseIndex = Math.max(0, PHASE_ORDER.indexOf(state.phase));
  const withinKc =
    state.phase === 'complete' || state.lessonComplete ? 1 : phaseIndex / (PHASE_ORDER.length - 1);
  const fraction = Math.min(1, (completed + withinKc) / KCS.length);
  const part = state.phase === 'complete' ? KCS.length : Math.min(state.kcIndex + 1, KCS.length);
  const topic =
    state.phase === 'complete'
      ? 'All topics'
      : KCS[Math.min(state.kcIndex, KCS.length - 1)].shortLabel;

  return (
    <Stack gap={8}>
      <Row gap={8} align="center">
        <Text size="small" weight="semibold">
          Part {part} of {KCS.length}: {topic}
        </Text>
        <Spacer />
        <Text size="small" tone="secondary">
          {LEARNER_PHASE_LABELS[state.phase]}
        </Text>
      </Row>
      <div
        role="progressbar"
        aria-label="Lesson progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(fraction * 100)}
        style={{
          height: 6,
          borderRadius: 999,
          background: theme.fill.tertiary,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${fraction * 100}%`,
            height: '100%',
            background: theme.accent.control,
          }}
        />
      </div>
    </Stack>
  );
}

function FocusCue({ children }: { children: string }) {
  const theme = useHostTheme();
  return (
    <div
      role="note"
      aria-label={`Focus now: ${children}`}
      style={{
        borderLeft: `3px solid ${theme.accent.primary}`,
        background: theme.fill.secondary,
        borderRadius: 6,
        padding: '9px 11px',
      }}
    >
      <Text size="small" weight="semibold">
        Focus now
      </Text>
      <Text size="small" tone="secondary">
        {children}
      </Text>
    </div>
  );
}

function RouteView({ route }: { route: Route }) {
  const titles: Record<Route, string> = {
    prepared: 'Concise start',
    standard: 'Build the full foundation',
    targeted: 'Quick contrast before continuing',
  };
  const routeCopy: Record<Route, string[]> = {
    prepared: [
      'Your starting-point answers support a concise explanation. You will still see a worked example and complete the practice sequence.',
    ],
    standard: ['Start with the full causal model, then watch it work before support fades.'],
    targeted: [
      'First compare the two ideas that were closest in your starting answers. This selects useful instruction; it is not a label about you.',
    ],
  };
  return (
    <Stack gap={12}>
      <FocusCue>{LEARNER_FOCUS.route}</FocusCue>
      <H2>{titles[route]}</H2>
      {routeCopy[route].map((line) => (
        <div key={line}>
          <Text>{line}</Text>
        </div>
      ))}
      <Text size="small" tone="secondary">
        Your path changes the amount of explanation, not which ideas or fresh practice you receive.
      </Text>
      <Divider />
      <Text>
        Pairing predicts what comes next. Consequences change what a response is likely to do.
      </Text>
      <ContingencyDiagram spec={PLAIN_LANGUAGE_MINI_MODEL} />
    </Stack>
  );
}

function TransitionAnnouncement({ message }: { message: string }) {
  return (
    <div role="status" aria-live="polite" aria-atomic="true">
      <Text size="small" tone="tertiary">
        Now showing: {message}
      </Text>
    </div>
  );
}

function LearnerView({
  state,
  setState,
}: {
  state: LessonState;
  setState: (action: LessonState | ((previous: LessonState) => LessonState)) => void;
}) {
  const kc = KCS[Math.min(state.kcIndex, KCS.length - 1)];
  const screen = state.supportOpen ? SUPPORT_SCREEN : screenForPhase(kc, state);
  const exitMode = state.phase === 'exitNear' || state.phase === 'exitChanged';
  const activeExitPair = currentExitPair(kc, state);
  const activePairCommitted =
    allQuestionsCommitted(activeExitPair.near, state.attempts) &&
    allQuestionsCommitted(activeExitPair.changed, state.attempts);
  const activePairContaminated = state.contaminatedExitPairs[exitPairKey(kc.id, state)];
  const fadingScreen =
    screen && !state.supportOpen && isFadingPhase(state.phase) ? screen : undefined;
  const fadingBaseCommitted = fadingScreen
    ? allQuestionsCommitted(fadingScreen, state.attempts)
    : false;
  const fadingBasePass = fadingScreen ? screenPassesUnexposed(fadingScreen, state.attempts) : false;
  const recoveryBank = fadingScreen ? PRACTICE_RECOVERY_BANKS[fadingScreen.id] : undefined;
  const recoveryIndex = fadingScreen ? (state.recoveryIndex[fadingScreen.id] ?? 0) : 0;
  const recoveryQuestion = recoveryBank?.[Math.min(recoveryIndex, recoveryBank.length - 1)];
  const recoveryNeeded = Boolean(
    fadingScreen && fadingBaseCommitted && !fadingBasePass && recoveryQuestion,
  );
  const recoveryAttempt = recoveryQuestion ? state.attempts[recoveryQuestion.id] : undefined;
  const failedQuestion = fadingScreen?.questions?.find((question) => {
    const attempt = state.attempts[question.id];
    return attempt?.committed && !validUnexposedPerformancePass(attempt);
  });
  const failedAttempt = failedQuestion ? state.attempts[failedQuestion.id] : undefined;
  const failedChoice = failedQuestion
    ? getChoice(failedQuestion, failedAttempt?.selected)
    : undefined;
  const correctChoice = failedQuestion?.choices.find((choice) => choice.correct);
  const recoveryExplanation = failedChoice?.correct
    ? `${correctChoice?.rationale ?? 'The causal rule was identified.'} Apply that distinction once more without a cue.`
    : `${failedChoice?.rationale ?? 'The original case was not classified.'} ${correctChoice?.rationale ?? ''}`.trim();
  const recoveryPass = recoveryNeeded ? validUnexposedPerformancePass(recoveryAttempt) : false;
  const recoveryNeedsNext = Boolean(
    recoveryNeeded &&
      recoveryAttempt?.committed &&
      !recoveryPass &&
      recoveryBank &&
      recoveryIndex < recoveryBank.length - 1,
  );
  const recoveryExhausted = Boolean(
    recoveryNeeded &&
      recoveryAttempt?.committed &&
      !recoveryPass &&
      recoveryBank &&
      recoveryIndex >= recoveryBank.length - 1,
  );
  const preparedCompactModel = Boolean(
    screen &&
      state.phase === 'model' &&
      state.routes[kc.id] === 'prepared' &&
      !state.modelExpanded[kc.id],
  );
  const routeAdjustedScreen =
    preparedCompactModel && screen
      ? {
          ...screen,
          body: screen.body?.slice(0, 1),
          bullets: screen.bullets?.slice(0, 2),
        }
      : screen;
  const learnerAdjustedScreen = routeAdjustedScreen
    ? {
        ...routeAdjustedScreen,
        title: learnerScreenTitle(state.phase, routeAdjustedScreen),
        intro:
          state.phase === 'extension'
            ? 'Classify four cases from their causal structure. This optional practice does not change your core lesson progress.'
            : routeAdjustedScreen.intro,
        body:
          state.phase === 'handoff'
            ? routeAdjustedScreen.body?.filter((line) => !line.toLowerCase().includes('capstone'))
            : routeAdjustedScreen.body,
      }
    : routeAdjustedScreen;
  const displayScreen =
    recoveryNeeded && learnerAdjustedScreen && recoveryQuestion
      ? {
          ...learnerAdjustedScreen,
          title: 'Repair the distinction before moving on',
          body: undefined,
          bullets: undefined,
          visual: undefined,
          sequence: undefined,
          chart: undefined,
          table: undefined,
          annotations: undefined,
          questions: [recoveryQuestion],
        }
      : learnerAdjustedScreen;

  const selectChoice = (questionId: string, choiceId: string) => {
    setState((previous) => {
      const oldAttempt = previous.attempts[questionId];
      if (oldAttempt?.committed) return previous;
      return {
        ...previous,
        attempts: {
          ...previous.attempts,
          [questionId]: {
            selected: choiceId,
            committed: false,
            assisted: oldAttempt?.assisted ?? false,
            exposed: oldAttempt?.exposed ?? questionIsExposed(previous, questionId),
          },
        },
      };
    });
  };

  const commitQuestion = (question: Question) => {
    setState((previous) => {
      const attempt = previous.attempts[question.id];
      if (!attempt?.selected || attempt.committed) return previous;
      const selected = getChoice(question, attempt.selected);
      const displayedChoices = [...orderedChoices(question), NOT_SURE];
      const selectedIndex = displayedChoices.findIndex((choice) => choice.id === attempt.selected);
      const exposed = questionIsExposed(previous, question.id);
      const committedAttempt: Attempt = {
        ...attempt,
        committed: true,
        correct: Boolean(selected?.correct),
        abstained: selected?.id === 'not-sure',
        exposed,
        runId: previous.runId,
      };
      const historyRecord: AttemptHistoryRecord = {
        seq: previous.attemptHistory.length
          ? previous.attemptHistory[previous.attemptHistory.length - 1].seq + 1
          : 1,
        runId: previous.runId,
        contentVersion: previous.contentVersion,
        kcId: previous.supportOpen ? KC1.id : kc.id,
        questionId: question.id,
        selected: attempt.selected,
        selectedPosition:
          selected?.id === 'not-sure' ? 'Abstain' : String.fromCharCode(65 + selectedIndex),
        selectedText: selected?.text ?? 'Unknown choice',
        correct: Boolean(selected?.correct),
        assisted: attempt.assisted,
        abstained: selected?.id === 'not-sure',
        exposed,
      };
      let next: LessonState = {
        ...previous,
        attempts: {
          ...previous.attempts,
          [question.id]: committedAttempt,
        },
        attemptHistory: [...previous.attemptHistory, historyRecord],
      };
      const eventType = previous.supportOpen
        ? 'support_attempt_submitted'
        : previous.phase === 'exitNear' || previous.phase === 'exitChanged'
          ? 'exit_attempt_submitted'
          : previous.phase === 'extension'
            ? 'extension_attempt_submitted'
            : previous.phase === 'entry'
              ? 'entry_attempt_submitted'
              : 'instruction_attempt_submitted';
      if (previous.phase === 'entry' && allQuestionsCommitted(kc.entry, next.attempts)) {
        next = appendExposure(
          next,
          'feedback_revealed',
          'Both entry probes committed; gated entry feedback released.',
          kc.id,
          question.id,
        );
      }
      if (previous.phase === 'exitChanged') {
        const pair = currentExitPair(kc, previous);
        if (
          allQuestionsCommitted(pair.near, next.attempts) &&
          allQuestionsCommitted(pair.changed, next.attempts)
        ) {
          next = appendExposure(
            next,
            'feedback_revealed',
            `Complete exit pair ${exitPairKey(kc.id, previous)} committed; paired feedback released.`,
            kc.id,
            question.id,
          );
        }
      }
      return appendEvent(
        next,
        eventType,
        `${selected?.correct ? 'key selected' : selected?.id === 'not-sure' ? 'abstention' : 'distractor selected'}${attempt.assisted ? ' · assisted' : ''}${exposed ? ' · exposed/rehearsal' : ''} · internal simulation`,
        previous.supportOpen ? KC1.id : kc.id,
        question.id,
      );
    });
  };

  const showHint = (questionId: string) => {
    setState((previous) => {
      const old = previous.attempts[questionId] ?? { committed: false, assisted: false };
      if (old.committed || old.assisted) return previous;
      const next = {
        ...previous,
        attempts: {
          ...previous.attempts,
          [questionId]: { ...old, assisted: true },
        },
      };
      return appendEvent(
        next,
        'hint_revealed',
        'assistance recorded',
        previous.supportOpen ? KC1.id : kc.id,
        questionId,
      );
    });
  };

  const currentComplete = fadingScreen
    ? fadingBasePass || recoveryPass || recoveryNeedsNext
    : screen
      ? allQuestionsCommitted(screen, state.attempts)
      : true;

  const advance = () => {
    setState((previous) => {
      const activeKc = KCS[Math.min(previous.kcIndex, KCS.length - 1)];
      const activeScreen = screenForPhase(activeKc, previous);
      if (activeScreen && !allQuestionsCommitted(activeScreen, previous.attempts)) return previous;
      if (activeScreen && isFadingPhase(previous.phase)) {
        const basePass = screenPassesUnexposed(activeScreen, previous.attempts);
        if (!basePass) {
          const bank = PRACTICE_RECOVERY_BANKS[activeScreen.id];
          const index = previous.recoveryIndex[activeScreen.id] ?? 0;
          const recovery = bank?.[Math.min(index, (bank?.length ?? 1) - 1)];
          const attempt = recovery ? previous.attempts[recovery.id] : undefined;
          if (!recovery || !attempt?.committed) return previous;
          if (!validUnexposedPerformancePass(attempt)) {
            if (index < bank.length - 1) {
              return appendEvent(
                {
                  ...previous,
                  recoveryIndex: {
                    ...previous.recoveryIndex,
                    [activeScreen.id]: index + 1,
                  },
                },
                'same_level_recovery_started',
                `${activeScreen.stage} remained at the same support level after a nonpass or assisted response; fresh family ${index + 2}`,
                activeKc.id,
                bank[index + 1].id,
              );
            }
            return previous;
          }
        }
      }

      if (previous.phase === 'entry') {
        const questions = activeKc.entry.questions ?? [];
        const allCorrect = questions.every((question) =>
          validUnexposedPerformancePass(previous.attempts[question.id]),
        );
        const misconceptions = questions
          .map((question) => misconceptionFor(question, previous.attempts[question.id]))
          .filter(Boolean);
        const targeted =
          misconceptions.length >= 2 &&
          misconceptions.every((value) => value === misconceptions[0]);
        const route: Route = allCorrect ? 'prepared' : targeted ? 'targeted' : 'standard';
        let next: LessonState = {
          ...previous,
          routes: { ...previous.routes, [activeKc.id]: route },
          phase: 'route',
        };
        next = appendEvent(
          next,
          'instruction_route_selected',
          route === 'targeted' ? 'provisional response-pattern route' : `${route} route`,
          activeKc.id,
        );
        return next;
      }
      if (previous.phase === 'route') {
        if (
          previous.routes[activeKc.id] === 'targeted' &&
          !previous.routePrimerViewedKcs.includes(activeKc.id)
        ) {
          return previous;
        }
        return { ...previous, phase: 'model' };
      }
      if (previous.phase === 'model') return { ...previous, phase: 'expert' };
      if (previous.phase === 'expert') {
        return appendEvent(
          { ...previous, phase: 'prediction' },
          'prediction_started',
          'guided prediction opened after model and worked example',
          activeKc.id,
        );
      }
      if (previous.phase === 'prediction') return { ...previous, phase: 'a2' };
      if (previous.phase === 'a2') return { ...previous, phase: 'a1' };
      if (previous.phase === 'a1') return { ...previous, phase: 'a0' };
      if (previous.phase === 'a0') return { ...previous, phase: 'contrast' };
      if (previous.phase === 'contrast') {
        return appendEvent(
          { ...previous, phase: 'exitNear' },
          'exit_pair_started',
          `round ${previous.exitRound}`,
          activeKc.id,
        );
      }
      if (previous.phase === 'exitNear') return { ...previous, phase: 'exitChanged' };
      if (previous.phase === 'exitChanged') {
        const pair = currentExitPair(activeKc, previous);
        const nearQuestions = pair.near.questions ?? [];
        const changedQuestions = pair.changed.questions ?? [];
        const nearPass =
          nearQuestions.length > 0 &&
          nearQuestions.every((question) =>
            validUnexposedPerformancePass(previous.attempts[question.id]),
          );
        const changedPass =
          changedQuestions.length > 0 &&
          changedQuestions.every((question) =>
            validUnexposedPerformancePass(previous.attempts[question.id]),
          );
        const contaminated = Boolean(
          previous.contaminatedExitPairs[exitPairKey(activeKc.id, previous)],
        );
        if (nearPass && changedPass && !contaminated) {
          return appendEvent(
            { ...previous, phase: 'handoff' },
            'kc_simulated_exit_recorded',
            `near and changed-task checks passed unassisted in internal simulation on ${previous.plannerTaskActive ? 'planner task' : `round ${previous.exitRound}`}; never authoritative evidence`,
            activeKc.id,
          );
        }
        if (previous.plannerTaskActive) {
          return appendEvent(
            {
              ...previous,
              phase: 'paused',
              plannerTaskActive: false,
              plannerTaskUsed: true,
              plannerAuthorization: undefined,
            },
            'planner_task_nonpass',
            'fresh planner task did not pass; terminal pause retained',
            activeKc.id,
          );
        }
        if (previous.repairCount < 2) {
          const nextRepair = previous.repairCount + 1;
          return appendEvent(
            { ...previous, phase: 'repair', repairCount: nextRepair },
            'repair_cycle_started',
            `repair ${nextRepair} · fresh exit pair required`,
            activeKc.id,
          );
        }
        return appendEvent(
          { ...previous, phase: 'paused' },
          'kc_paused_for_repair',
          activeKc.remediationId,
          activeKc.id,
        );
      }
      if (previous.phase === 'repair') {
        return appendEvent(
          { ...previous, phase: 'exitNear', exitRound: previous.repairCount },
          'repair_cycle_completed',
          `repair ${previous.repairCount} · exit round ${previous.repairCount} opened`,
          activeKc.id,
        );
      }
      if (previous.phase === 'handoff') {
        const completedKcs = previous.completedKcs.includes(activeKc.id)
          ? previous.completedKcs
          : [...previous.completedKcs, activeKc.id];
        if (previous.kcIndex === KCS.length - 1) {
          let next: LessonState = {
            ...previous,
            completedKcs,
            phase: 'complete',
            lessonComplete: true,
            plannerTaskActive: false,
            plannerAuthorization: undefined,
          };
          const completionEvent: CanvasEventName = runHasRehearsalExposure(previous)
            ? 'lesson_rehearsal_completed'
            : 'lesson_simulation_completed';
          next = appendEvent(
            next,
            completionEvent,
            `${completionEvent === 'lesson_rehearsal_completed' ? 'exposed rehearsal' : 'unexposed internal simulation'} completed four simulated instructional exits; no authoritative, mastery, or capstone inference`,
            activeKc.id,
          );
          return next;
        }
        const nextIndex = previous.kcIndex + 1;
        let next: LessonState = {
          ...previous,
          completedKcs,
          kcIndex: nextIndex,
          phase: 'entry',
          exitRound: 0,
          repairCount: 0,
          plannerTaskActive: false,
          plannerTaskUsed: false,
          plannerAuthorization: undefined,
        };
        next = appendEvent(next, 'kc_microcycle_started', KCS[nextIndex].label, KCS[nextIndex].id);
        return next;
      }
      if (previous.phase === 'extension') {
        const complete = allQuestionsCommitted(EXTENSION_SCREEN, previous.attempts);
        if (!complete) return previous;
        let next: LessonState = { ...previous, phase: 'complete', extensionComplete: true };
        next = appendEvent(
          next,
          'extension_completed',
          'optional application completed; no core or capstone evidence',
        );
        return next;
      }
      return previous;
    });
  };

  const openSupport = () => {
    setState((previous) => {
      const activeKc = KCS[Math.min(previous.kcIndex, KCS.length - 1)];
      const activeScreen = screenForPhase(activeKc, previous);
      const assistedAttempts = { ...previous.attempts };
      (activeScreen?.questions ?? []).forEach((question) => {
        assistedAttempts[question.id] = {
          ...(assistedAttempts[question.id] ?? { committed: false }),
          assisted: true,
        };
      });
      if (
        activeScreen &&
        isFadingPhase(previous.phase) &&
        allQuestionsCommitted(activeScreen, previous.attempts) &&
        !screenPassesUnexposed(activeScreen, previous.attempts)
      ) {
        const bank = PRACTICE_RECOVERY_BANKS[activeScreen.id];
        const index = previous.recoveryIndex[activeScreen.id] ?? 0;
        const recovery = bank?.[Math.min(index, (bank?.length ?? 1) - 1)];
        if (recovery) {
          assistedAttempts[recovery.id] = {
            ...(assistedAttempts[recovery.id] ?? { committed: false }),
            assisted: true,
          };
        }
      }
      let next: LessonState = {
        ...previous,
        supportOpen: true,
        attempts: assistedAttempts,
        supportViewedKcs: previous.supportViewedKcs.includes(activeKc.id)
          ? previous.supportViewedKcs
          : [...previous.supportViewedKcs, activeKc.id],
      };
      if (previous.phase === 'exitNear' || previous.phase === 'exitChanged') {
        const pairKey = exitPairKey(activeKc.id, previous);
        next = {
          ...next,
          contaminatedExitPairs: {
            ...previous.contaminatedExitPairs,
            [pairKey]: 'Support opened during the active exit pair',
          },
        };
        next = appendExposure(
          next,
          'support_during_exit',
          `Exit pair ${pairKey} contaminated by support access`,
          activeKc.id,
        );
        next = appendEvent(
          next,
          'exit_pair_contaminated',
          `support opened during ${pairKey}; pair cannot pass`,
          activeKc.id,
        );
      }
      return appendEvent(
        next,
        'support_opened',
        'V3-SUP-941207 · authored noncredit refresher',
        KC1.id,
      );
    });
  };

  const closeSupport = () => setState((previous) => ({ ...previous, supportOpen: false }));

  const startPlannerTask = () => {
    setState((previous) => {
      const activeKc = KCS[Math.min(previous.kcIndex, KCS.length - 1)];
      if (
        previous.phase !== 'paused' ||
        !previous.plannerAuthorization ||
        previous.plannerAuthorization.kcId !== activeKc.id ||
        previous.plannerAuthorization.runId !== previous.runId ||
        previous.plannerAuthorization.contentVersion !== previous.contentVersion ||
        previous.plannerAuthorization.policyVersion !== previous.policyVersion ||
        previous.plannerAuthorization.registryVersion !== previous.registryVersion ||
        !activeKc.plannerExit
      ) {
        return previous;
      }
      return appendEvent(
        {
          ...previous,
          phase: 'exitNear',
          plannerTaskActive: true,
        },
        'planner_fresh_task_started',
        previous.plannerAuthorization.taskId,
        activeKc.id,
      );
    });
  };

  if (state.phase === 'complete') {
    return (
      <Stack gap={18}>
        <ProgressHeader state={state} />
        <TransitionAnnouncement message="Lesson complete" />
        <Divider />
        <FocusCue>{LEARNER_FOCUS.complete}</FocusCue>
        <H2>Lesson complete</H2>
        <Text>
          You worked through repetition effects, predictive pairings, action consequences, and
          cognitive or biological constraints.
        </Text>
        <Callout tone="info" title="Carry this model forward">
          Ask what predicts what. If a cue predicts the next event, use a pairing model. If an
          action changes what happens next, use a consequence model.
        </Callout>
        <Row gap={8} wrap>
          {!state.extensionComplete && (
            <Button
              variant="primary"
              onClick={() =>
                setState((previous) =>
                  appendEvent(
                    { ...previous, phase: 'extension' },
                    'extension_started',
                    'V3-EXT-910216 · optional noncredit application',
                  ),
                )
              }
            >
              Start optional application
            </Button>
          )}
        </Row>
      </Stack>
    );
  }

  if (state.phase === 'paused') {
    return (
      <Stack gap={18}>
        <ProgressHeader state={state} />
        <TransitionAnnouncement message="Pause for fresh practice" />
        <Divider />
        <FocusCue>{LEARNER_FOCUS.paused}</FocusCue>
        <H2>Pause for a new practice set</H2>
        <Callout
          tone={state.plannerAuthorization && !state.plannerTaskActive ? 'info' : 'warning'}
          title={
            state.plannerAuthorization && !state.plannerTaskActive
              ? 'Fresh practice is ready'
              : 'Do not repeat an answer you have seen'
          }
        >
          {state.plannerAuthorization && !state.plannerTaskActive
            ? 'A new pair of cases is available. Start when you are ready.'
            : state.plannerTaskUsed
              ? 'The available fresh practice has been used. Pause until another new set is available.'
              : 'You have completed both repair paths. A new case is needed so the next attempt measures the causal distinction rather than memory for an answer.'}
        </Callout>
        {state.plannerAuthorization && !state.plannerTaskActive && (
          <Button variant="primary" onClick={startPlannerTask}>
            Start fresh practice
          </Button>
        )}
      </Stack>
    );
  }

  if (state.supportOpen && screen) {
    return (
      <Stack gap={16}>
        <ProgressHeader state={state} />
        <TransitionAnnouncement message={`Refresher: ${screen.title}`} />
        <Card size="lg">
          <CardHeader trailing={<Pill size="sm">Practice</Pill>}>Refresher</CardHeader>
          <CardBody>
            <Stack gap={14}>
              <FocusCue>Compare the measured level before naming the learning process.</FocusCue>
              <H2>{screen.title}</H2>
              <ScreenContent
                screen={screen}
                attempts={state.attempts}
                exitMode={false}
                feedbackVisible
                onSelect={selectChoice}
                onCommit={commitQuestion}
                onHint={showHint}
              />
              <Divider />
              <Button variant="secondary" onClick={closeSupport}>
                Return to lesson
              </Button>
            </Stack>
          </CardBody>
        </Card>
      </Stack>
    );
  }

  if (state.phase === 'route') {
    const route = state.routes[kc.id] ?? 'standard';
    const primerViewed = state.routePrimerViewedKcs.includes(kc.id);
    return (
      <Stack gap={16}>
        <ProgressHeader state={state} />
        <TransitionAnnouncement message={LEARNER_PHASE_LABELS.route} />
        <Divider />
        <RouteView route={route} />
        {route === 'targeted' && primerViewed && (
          <Callout tone="info" title="Quick contrast before continuing">
            {TARGET_PRIMERS[kc.id]}
          </Callout>
        )}
        <Row gap={8} wrap>
          <Button
            variant="primary"
            disabled={route === 'targeted' && !primerViewed}
            onClick={advance}
          >
            Continue to model
          </Button>
          {route === 'targeted' && !primerViewed && (
            <Button
              variant="secondary"
              onClick={() =>
                setState((previous) =>
                  appendEvent(
                    {
                      ...previous,
                      routePrimerViewedKcs: [...previous.routePrimerViewedKcs, kc.id],
                    },
                    'provisional_route_primer_viewed',
                    TARGET_PRIMERS[kc.id],
                    kc.id,
                  ),
                )
              }
            >
              See the quick contrast
            </Button>
          )}
          {route === 'targeted' && kc.id === KC1.id && (
            <Button variant="ghost" onClick={openSupport}>
              Open refresher
            </Button>
          )}
        </Row>
      </Stack>
    );
  }

  if (!screen) return null;

  const buttonLabel =
    state.phase === 'entry'
      ? 'Choose my starting point'
      : recoveryNeedsNext
        ? 'Try another case at this level'
        : state.phase === 'model'
          ? 'See a worked example'
          : state.phase === 'expert'
            ? 'Try a guided prediction'
            : state.phase === 'prediction'
              ? 'Start guided practice'
              : state.phase === 'a2'
                ? 'Continue with less help'
                : state.phase === 'a1'
                  ? 'Try one on your own'
                  : state.phase === 'a0'
                    ? 'Compare close alternatives'
                    : state.phase === 'contrast'
                      ? 'Start a fresh check'
                      : state.phase === 'exitNear'
                        ? 'Continue in a new context'
                        : state.phase === 'exitChanged'
                          ? 'See both results'
                          : state.phase === 'repair'
                            ? 'Try a fresh case'
                            : state.phase === 'handoff'
                              ? state.kcIndex === KCS.length - 1
                                ? 'Finish lesson'
                                : 'Continue to the next topic'
                              : state.phase === 'extension'
                                ? 'Finish optional application'
                                : 'Continue';

  if (!displayScreen) return null;

  return (
    <Stack gap={16}>
      <ProgressHeader state={state} />
      <TransitionAnnouncement
        message={`${LEARNER_PHASE_LABELS[state.phase]}: ${displayScreen.title}`}
      />
      {state.kcIndex === 0 && state.phase === 'entry' && (
        <Stack gap={10}>
          <H2>Read the learning structure</H2>
          <Text tone="secondary">
            Across trials, a response may fall, rise, return, spread to a similar cue, or resist
            training. The curve alone does not name the mechanism.
          </Text>
          <SemanticSequence
            label="Four questions for classifying learning evidence"
            items={[
              'What was repeated?',
              'What was paired?',
              'What happened after an action?',
              'Did knowledge or a biological tendency change the expected pattern?',
            ]}
          />
        </Stack>
      )}
      <Row gap={8} wrap align="center">
        <Text size="small" weight="semibold">
          Part {state.kcIndex + 1}
        </Text>
        <Text size="small" tone="secondary">
          {kc.shortLabel}
        </Text>
        <Spacer />
        {kc.id === KC1.id && (
          <Button variant="ghost" onClick={openSupport}>
            Open refresher
          </Button>
        )}
      </Row>
      <Card size="lg">
        <CardHeader
          trailing={
            <Text size="small" tone="tertiary">
              {screen.duration}
            </Text>
          }
        >
          {LEARNER_PHASE_LABELS[state.phase]}
        </CardHeader>
        <CardBody>
          <Stack gap={16}>
            <FocusCue>{LEARNER_FOCUS[state.phase]}</FocusCue>
            <H2>{displayScreen.title}</H2>
            {preparedCompactModel && (
              <InlineFeedback title="Concise explanation">
                Your starting check selected the short version. You can still open the full
                explanation below.
              </InlineFeedback>
            )}
            {recoveryNeeded && (
              <InlineFeedback title="Why the alternatives differ">
                {`${recoveryExplanation} Now use that causal difference in the fresh case below.`}
              </InlineFeedback>
            )}
            <ScreenContent
              screen={displayScreen}
              attempts={state.attempts}
              exitMode={exitMode}
              feedbackVisible={state.phase === 'entry' ? currentComplete : !exitMode}
              onSelect={selectChoice}
              onCommit={commitQuestion}
              onHint={showHint}
            />
            {recoveryExhausted && (
              <InlineFeedback title="Pause for a fresh example">
                The available practice examples have been used. Continue after a new example is
                available rather than repeating an answer you have already seen.
              </InlineFeedback>
            )}
            {exitMode && activePairContaminated && (
              <InlineFeedback title="This check is now practice">
                Support was opened during these cases. Use the feedback to learn; a fresh set is
                required for the independent check.
              </InlineFeedback>
            )}
            {state.phase === 'exitChanged' && activePairCommitted && (
              <PairFeedback pair={activeExitPair} attempts={state.attempts} />
            )}
            <Divider />
            <Row gap={8} wrap align="center">
              <Button variant="primary" disabled={!currentComplete} onClick={advance}>
                {buttonLabel}
              </Button>
              {preparedCompactModel && (
                <Button
                  variant="secondary"
                  onClick={() =>
                    setState((previous) =>
                      appendEvent(
                        {
                          ...previous,
                          modelExpanded: { ...previous.modelExpanded, [kc.id]: true },
                        },
                        'full_model_opened',
                        'prepared-route learner opened the full direct model',
                        kc.id,
                      ),
                    )
                  }
                >
                  Open full explanation
                </Button>
              )}
              {!currentComplete && (
                <Text size="small" tone="tertiary">
                  Check each answer before continuing. “I’m not sure” is always available.
                </Text>
              )}
            </Row>
          </Stack>
        </CardBody>
      </Card>
    </Stack>
  );
}

function allScreensFor(kc: KC): Screen[] {
  return [
    kc.entry,
    kc.model,
    kc.expert,
    kc.prediction,
    kc.a2,
    kc.a1,
    kc.a0,
    kc.contrast,
    ...kc.exits.flatMap((pair) => [pair.near, pair.changed]),
    ...(kc.plannerExit ? [kc.plannerExit.near, kc.plannerExit.changed] : []),
    ...kc.repairs,
    kc.handoff,
  ];
}

function ReviewScreen({ screen }: { screen: Screen }) {
  return (
    <Stack gap={10}>
      <Row gap={8} wrap>
        <Pill size="sm">{screen.id}</Pill>
        <Text size="small" tone="secondary">
          {screen.stage}
        </Text>
        <Text size="small" tone="tertiary">
          {screen.duration}
        </Text>
      </Row>
      {screen.intro && <Text size="small">{screen.intro}</Text>}
      {screen.body?.map((line) => (
        <div key={line}>
          <Text size="small">{line}</Text>
        </div>
      ))}
      {screen.bullets && <SemanticSequence items={screen.bullets} label={`${screen.id} bullets`} />}
      {screen.visual && <ContingencyDiagram spec={screen.visual} />}
      {screen.sequence && (
        <SemanticSequence items={screen.sequence} label={`${screen.id} sequence`} />
      )}
      {screen.table && <DataTableView spec={screen.table} reviewer />}
      {screen.chart && <ChartView spec={screen.chart} reviewer />}
      {screen.annotations && (
        <SemanticSequence items={screen.annotations} label={`${screen.id} annotations`} />
      )}
      {screen.questions?.map((question) => (
        <div key={question.id}>
          <Stack gap={7}>
            <Divider />
            <Text weight="semibold">{question.id}</Text>
            <Text size="small">{question.prompt}</Text>
            {question.sequence && (
              <SemanticSequence items={question.sequence} label={`${question.id} sequence`} />
            )}
            {question.table && <DataTableView spec={question.table} reviewer />}
            <Table
              headers={['Choice', 'Key', 'Exact rationale']}
              rows={[...orderedChoices(question), NOT_SURE].map((choice, index) => [
                `${index < 4 ? String.fromCharCode(65 + index) : 'Abstain'}: ${choice.text}`,
                choice.correct ? 'Correct' : 'Distractor',
                choice.rationale,
              ])}
              rowTone={[...orderedChoices(question), NOT_SURE].map((choice) =>
                choice.correct ? 'success' : 'neutral',
              )}
              striped
            />
            <Text size="small" tone="tertiary">
              Hint: {question.hint}
            </Text>
          </Stack>
        </div>
      ))}
      {PRACTICE_RECOVERY_BANKS[screen.id] && (
        <CollapsibleSection
          title="Fresh same-level recovery bank"
          count={PRACTICE_RECOVERY_BANKS[screen.id].length}
        >
          <Stack gap={10}>
            {PRACTICE_RECOVERY_BANKS[screen.id].map((question) => (
              <div key={question.id}>
                <Text weight="semibold">{question.id}</Text>
                <Text size="small">{question.prompt}</Text>
                <Table
                  headers={['Choice', 'Key', 'Exact rationale']}
                  rows={[...orderedChoices(question), NOT_SURE].map((choice, index) => [
                    `${index < 4 ? String.fromCharCode(65 + index) : 'Abstain'}: ${choice.text}`,
                    choice.correct ? 'Correct' : 'Distractor',
                    choice.rationale,
                  ])}
                  rowTone={[...orderedChoices(question), NOT_SURE].map((choice) =>
                    choice.correct ? 'success' : 'neutral',
                  )}
                  striped
                />
                <Text size="small" tone="tertiary">
                  Hint: {question.hint}
                </Text>
              </div>
            ))}
          </Stack>
        </CollapsibleSection>
      )}
    </Stack>
  );
}

const GRAPH_RELATIONS = [
  [
    'V3-EDG-530089',
    'CONFUSABLE_WITH',
    'V3-KC-192043 ↔ V3-KC-337354',
    'Sensory adaptation versus behavioral habituation',
  ],
  [
    'V3-EDG-121309',
    'CONFUSABLE_WITH',
    'V3-KC-337354 ↔ V3-KC-564671',
    'Repetition-only change versus stimulus association',
  ],
  [
    'V3-EDG-368360',
    'CONFUSABLE_WITH',
    'V3-KC-564671 ↔ V3-KC-628404',
    'Cue–event relation versus action consequence',
  ],
  [
    'V3-EDG-451762',
    'APPLIED_TO',
    'V3-KC-991992 → V3-KC-564671',
    'Predict consequences from a trial model',
  ],
  [
    'V3-EDG-374894',
    'INTEGRATES',
    'V3-CAP-262807 → V3-KC-337354',
    'Separate capstone component; no readiness inference',
  ],
  [
    'V3-EDG-140767',
    'INTEGRATES',
    'V3-CAP-262807 → V3-KC-564671',
    'Separate capstone component; no readiness inference',
  ],
  [
    'V3-EDG-758875',
    'INTEGRATES',
    'V3-CAP-262807 → V3-KC-628404',
    'Separate capstone component; no readiness inference',
  ],
  [
    'V3-EDG-926505',
    'INTEGRATES',
    'V3-CAP-262807 → V3-KC-730668',
    'Separate capstone component; no readiness inference',
  ],
];

const KC3_EXIT_BLUEPRINT = [
  [
    'X0',
    'Contingency ledger',
    'Pre/post exchange vignette',
    'Programmed-rule table',
    'Ongoing/forecast event trace',
  ],
  [
    'X1',
    'Signed outcome-delta matrix',
    'Biological-state transfer',
    'Cumulative delivery records',
    'State-transition table',
  ],
  [
    'X2',
    'Policy-diff table',
    'Exchange-baseline audit',
    'Rule pseudocode sequence',
    'Cold-on/forecast protocols',
  ],
  [
    'Planner',
    'Abstract operation matrix',
    'Transfer test',
    'Program plus response-pattern audit',
    'Counterfactual trace',
  ],
];

const AUTHORITATIVE_HOST_WOULD_EMIT: Array<
  [AuthoritativeHostWouldEmitEventName, 'WOULD_EMIT_ONLY', string]
> = [
  [
    'lesson_delivery_completed',
    'WOULD_EMIT_ONLY',
    'Reserved for an authoritative host after its own policy-valid delivery. This internal Canvas never appends it.',
  ],
];

const CANVAS_RUNTIME_EVENT_MEANINGS: Record<CanvasEventName, string> = {
  lesson_shell_started: 'Persistent internal-simulation state initialized',
  new_rehearsal_run_started: 'New rehearsal run ID; immutable prior histories retained',
  kc_microcycle_started: 'Ordered KC simulation began',
  reviewer_mode_opened:
    'Keys exposed; active exit pair contaminated; same-run activity remains simulated',
  entry_attempt_submitted: 'Instructional routing observation only',
  instruction_route_selected:
    'Prepared, standard, or provisional response-pattern instruction selected',
  prediction_started: 'Orientation prediction opened',
  provisional_route_primer_viewed: 'Adapted-route primer exposed',
  full_model_opened: 'Prepared-route full model exposed',
  hint_revealed: 'Assistance attached to the item attempt',
  instruction_attempt_submitted: 'Practice response; no downstream evidence',
  support_attempt_submitted: 'Authored support response; noncredit',
  support_opened: 'Authored support opened; exit contamination applies when active',
  exit_pair_started: 'Fresh near and changed-task simulation pair opened',
  exit_attempt_submitted: 'First committed response retained with assistance and exposure state',
  exit_pair_contaminated: 'Active pair cannot pass after support or reviewer exposure',
  same_level_recovery_started: 'Performance gate held support level and opened a fresh family',
  repair_cycle_started: 'Bounded repair began after a simulated pair nonpass',
  repair_cycle_completed: 'Bounded repair completed and a fresh pair opened',
  kc_simulated_exit_recorded:
    'All near and changed checks passed one unassisted, unexposed, uncontaminated simulation round',
  kc_paused_for_repair: 'Two repairs exhausted; exact KC simulation paused',
  external_planner_reentry_authorized: 'Reviewer-only local simulation of external authorization',
  planner_fresh_task_started: 'Authorized fresh planner task simulation opened',
  planner_task_nonpass: 'Planner task did not pass; terminal simulation pause retained',
  lesson_simulation_completed:
    'Unexposed first-run internal simulation completed four simulated exits',
  lesson_rehearsal_completed: 'Exposed or repeated rehearsal completed four simulated exits',
  extension_started: 'Optional noncredit application simulation opened',
  extension_attempt_submitted: 'Optional application response; no core or capstone evidence',
  extension_completed: 'Optional application simulation completed; no core or capstone evidence',
};

const EVIDENCE_RULES = [
  'All learner and reviewer activity emits internal-review simulation events only; this Canvas never administers authoritative evidence.',
  'Canvas completion appends lesson_simulation_completed or, for an exposed/repeated run, lesson_rehearsal_completed; the authoritative host completion name is would-emit documentation only.',
  'Every entry-performance, fading, recovery, and exit gate requires a correct, unassisted, unabstained, unexposed response.',
  'A simulated KC exit additionally requires every near and changed-task response in one round and an uncontaminated pair.',
  'Using help or opening support during an exit converts the whole affected scope to instruction; it cannot satisfy exit.',
  'A passed item and failed item do not combine across rounds.',
  'Same-item correction after feedback never replaces the first committed attempt.',
  'After each failed pair, a bounded repair precedes a fresh parallel pair.',
  'After two failed repair cycles, the KC terminally pauses until a simulated external planner authorization unlocks newly authored content.',
  'Opening reviewer mode exposes every key, marks all same-run responses exposed, and contaminates an active exit pair; switching back does not reverse exposure.',
  'Confirmed resets preserve immutable histories; any previously attempted item and any run after full reviewer exposure remain same-family rehearsal.',
  'The local planner-authorization simulator is reviewer-only and therefore exposes its planner form; only an unseen externally supplied authorization could yield an unexposed planner attempt.',
  'Every result in this dual-mode Canvas is simulated internal-review data, never authoritative evidence, mastery, transfer, delayed retention, or capstone completion.',
  'Incidental contrast KCs and V3-KC-991992 receive no evidence from this simulation.',
];

const ACCESSIBILITY_REQUIREMENTS = [
  'All sounds, puffs, flashes, illness, and animal procedures are described only; the Canvas emits no startling stimulus.',
  'Every plotted series has a title, explicit axis labels and units, source caption, and adjacent semantic data table.',
  'Every arrow model is exposed as ordered text, not position or color alone.',
  'Shape and color cues always include written names.',
  'Choices use native radio inputs, fieldsets, legends, persistent labels, visible focus supplied by the host, and keyboard operation.',
  'Not sure remains a first-class abstention response on every interaction.',
  'Entry feedback waits for both probes; exit feedback waits for the complete near/changed pair; all released feedback includes the selected-choice rationale.',
  'No countdown, speed score, hover-only instruction, audio-only information, or forced animation is used.',
  'Versioned persistent state resumes at the exact screen; confirmed reruns preserve immutable history and interruption does not manufacture a failure.',
  'The layout uses flat host-token surfaces, structural borders, and wrapping navigation without gradients, shadows, or decorative color coding.',
];

const SOURCES = [
  [
    'AAMC scope',
    'Psychological, Social, and Biological Foundations Content Category 7C; scope cross-check only; accessed 2026-07-22',
  ],
  [
    'Rankin et al. (2009)',
    'Habituation Revisited · DOI 10.1016/j.nlm.2008.09.012 · PMCID PMC2754195',
  ],
  [
    'OpenStax Psychology 2e',
    'Sections 5.1, 6.2, and 6.3; terminology cross-check only; no prose or assets reused',
  ],
  ['Bouton, Noba', 'Conditioning and Learning · noba.to/ajxhcqdr · CC BY-NC-SA 4.0'],
  ['Krypotos et al. (2015)', 'Avoidance learning · DOI 10.3389/fnbeh.2015.00189 · CC BY'],
  ['Domjan (2015)', 'Garcia-Koelling selective association effect · open eScholarship manuscript'],
  [
    'Breland & Breland (1961)',
    'The Misbehavior of Organisms · York Classics archive; mechanism cross-check only',
  ],
];

const CHECKSUMS = [
  [
    'v3-authoritative-registry.json',
    '635c39e9c0ebb28a3892399449aa9b74893aae3264924cd739b92b6e370ba26a',
  ],
  ['v3-canonical-kcs.json', '31d304a7f6ea51ac4847ede01824bb14cd8b98ed7a6bc61bb05617d53f9860fd'],
  [
    'v3-prerequisite-graph.json',
    'fe0fffdd16bd10d3f7c046951cbe642add8ef2639f5b3f68a3224d9648f59e10',
  ],
  [
    'v3-teaching-sequences.json',
    'b2bbd9f8a14cbff1250013e8d717eb1c8195ccbf6335e605c64f1469a94246aa',
  ],
  [
    'v3-extensions-capstones-support.json',
    '23bbea9e358c4aa0ff255964d203c0081b4ff3ba28e4e123eed0cfc0b7a54831',
  ],
  ['V3-UNRESOLVED-HOLDS.md', 'cb4bf2c06d9bf02d6b5d2827c8d26c33e46411786430a95e20da954de996ddc8'],
  [
    'mcat-complete-learning-flow.md',
    'e56590830462987e2cc9ec8d523a702e75c903613020addb81da6edbcad3286b',
  ],
];

const QA_RUBRIC = [
  'Canonical identity, KC order, attachments, and 7C scope are exact.',
  'Source artifact hashes are recorded and V3-HOLD-110010 remains visibly open without an unsupported comparison claim.',
  'Habituation, dishabituation, sensory adaptation, and conditioning are operationally discriminated.',
  'Classical labels and acquisition, extinction, spontaneous recovery, generalization, discrimination, and higher-order conditioning are correct.',
  'Operant quadrants, shaping, extinction, primary and conditioned reinforcers, token economy, schedules, escape, and avoidance are correct.',
  'Latent learning, cognitive maps, preparedness, taste aversion, and instinctive drift stay within scope and avoid determinism.',
  'Every key is unique and every distractor has diagnostic choice-level feedback.',
  'All exit and recheck families are fresh within their branch.',
  'Two repairs are bounded and reenter through exact KC relations.',
  'No completion state leaks mastery or capstone status.',
  'All data and diagrams have accessible text equivalents.',
  'All content and simulated data are original and source provenance is disclosed.',
];

const BRANCH_TESTS = [
  'The module-load assertion finds exactly one key per target, only zero-based positions 0–3, no missing or extra config, and exact A/B/C/D balance for entry, exit, and recovery groups.',
  'Entry feedback stays hidden until both probes are committed, including an abstention.',
  'Near-exit feedback stays hidden; both near and changed-task rationales appear only after the whole pair is committed.',
  'Correct unassisted entry selects prepared; mixed nonpasses select standard; two matching response-pattern tags select a provisional hypothesis route.',
  'Prepared uses a compact direct model with full model access; standard uses the full model; provisional targeted requires its contrast primer.',
  'A wrong, abstained, assisted, or exposed A2/A1/A0 response stops fading and opens a substantively fresh task at the same support level.',
  'A nonpass, assisted, or exposed first recovery opens a second fresh same-level family; exhausted recovery content cannot be recycled.',
  'Not sure is explicitly recorded as abstention and never passes a performance gate.',
  'Opening reviewer mode marks the current run exposed, contaminates an active exit pair, and makes every later performance-gate response ineligible.',
  'Opening V3-SUP-941207 during an exit records exposure, contaminates the entire pair, and prevents that pair from passing.',
  'Every exit checks every question on both screens; a passed item cannot compensate for a failed, assisted, exposed, or contaminated item.',
  'Each KC3 X0/X1/X2/planner form instantiates equivalent quadrant, reinforcer/token, schedule/extinction, and escape/avoidance blueprint slots in a distinct context and representation.',
  'Every KC3 form keys positive/negative reinforcement and punishment, primary/conditioned reinforcers and token economy, continuous/FR/VR/FI/VI, operant extinction, escape, and avoidance.',
  'One X0 pair nonpass starts Repair 1 and a fresh matrix/audit family; X1 nonpass starts Repair 2 and another substantively fresh family.',
  'An X2 nonpass terminally pauses at the exact R14 remediation relation without an automatic restart.',
  'Learner pause exposes no authorization control; only internal reviewer mode can simulate external planner authorization for one new pair.',
  'Confirmed new-run reset increments the run ID, preserves immutable history, and marks previously attempted or globally key-exposed same-family items as rehearsal-ineligible.',
  'An unexposed first run appends lesson_simulation_completed; an exposed or repeated run appends lesson_rehearsal_completed.',
  'The authoritative host completion name exists only in a separately typed would-emit table and is excluded from appendEvent’s CanvasEventName parameter.',
  'Persisted state and every event carry the content, policy, and registry identifiers and versions under the migrated v4 simulation-event state key.',
  'The optional extension unlocks only after all four simulated instructional exits and emits no core, durable, transfer, or capstone evidence.',
  'Capstone integration edges create no readiness or completion inference; no hard prerequisite or accelerated bypass exists.',
  'Every chart renders fully in learner and reviewer views and remains interpretable from its semantic table.',
  'Screen changes update a polite atomic transition announcement; feedback updates use live status regions.',
  'Every choice, key position, rationale, hint, recovery, repair, standard exit, and planner exit is visible in reviewer mode.',
  'Authored content hash remains pending until noncompensatory rights, similarity, and blind-solve gates pass.',
  'Aggregate duration rows cover prepared, standard, provisional targeted, repair, planner, worst-case, and extension branches.',
  'A content search confirms the disputed wording is absent from all learner and reviewer copy.',
];

const RELEASE_GATES = [
  [
    'Rights',
    'PENDING',
    'Document original authorship and source-use boundaries; rights reviewer signs off.',
  ],
  [
    'Similarity',
    'PENDING',
    'Run protected-corpus similarity review and resolve every flagged overlap.',
  ],
  [
    'Blind solve',
    'PENDING',
    'Independent solver verifies every key, distractor rationale, gate, and fresh-form distinction without answer access.',
  ],
];

const BRANCH_DURATIONS = [
  [
    'Prepared, no recovery or repair',
    '62–65 min',
    'Compact direct models; all A2/A1/A0 and exit stages retained',
  ],
  [
    'Standard, no recovery or repair',
    '67–70 min',
    'Full direct models and all core stages, including expanded KC3 exit coverage',
  ],
  [
    'Provisional targeted, no repair',
    '72–77 min',
    'Required contrast primers; optional authored K1 refresher not included',
  ],
  [
    'One same-level recovery task',
    '+1–2 min',
    'Added when practice is incorrect, abstained, or assisted',
  ],
  [
    'Two same-level recovery tasks',
    '+3–4 min',
    'Second fresh family follows a recovery nonpass; support level does not fade',
  ],
  ['One KC uses one repair', '74–78 min', 'Standard branch plus one repair and one fresh pair'],
  [
    'One KC uses two repairs',
    '81–87 min',
    'Standard branch plus both bounded repairs and two fresh pairs',
  ],
  [
    'Every KC uses two repairs',
    '112–118 min',
    'Upper aggregate before any planner-authorized task',
  ],
  [
    'One planner-authorized fresh pair',
    '+3–4 min',
    'Added only after terminal pause and simulated external authorization',
  ],
  ['Optional V3-EXT-910216', '+9 min', 'After four simulated KC exits; noncredit'],
];

function ManifestView({ state }: { state: LessonState }) {
  return (
    <Stack gap={18}>
      <H2>Canonical manifest</H2>
      <Grid columns="repeat(auto-fit, minmax(150px, 1fr))" gap={16}>
        <Stat value="V3-LES-225658" label="Core lesson" />
        <Stat value="4" label="Ordered KCs" />
        <Stat value="1 + 1" label="Support + extension" />
        <Stat value={`${state.completedKcs.length}/4`} label="Simulated instructional exits" />
      </Grid>
      <Table
        headers={['Order', 'KC', 'Canonical label', 'Representations', 'Reentry']}
        rows={KCS.map((kc, index) => [
          String(index + 1),
          kc.id,
          kc.label,
          kc.representations.join('; '),
          kc.remediationId,
        ])}
        striped
      />
      <Callout tone="warning" title="Release status">
        Canonical graph and sequence records are accepted but learner-unvalidated. Accelerated
        bypass is disabled. Authored content remains pending content hashing and noncompensatory
        review gates.
      </Callout>
      <H3>Canonical attachment and integration fields</H3>
      <Table
        headers={[
          'Record',
          'Canonical type',
          'Canonical host/component fields',
          'Canonical inference',
        ]}
        rows={[
          [
            'V3-SUP-941207',
            'REFRESHER',
            'host_lesson_id: V3-LES-225658',
            'No readiness or credit inference',
          ],
          [
            'V3-EXT-910216',
            'APPLICATION',
            'host_lesson_ids: V3-LES-225658; host_core_ids: all four ordered KCs',
            'No core evidence inference',
          ],
          [
            'V3-CAP-262807',
            'Separate capstone',
            'INTEGRATES edges to each KC; not a lesson attachment',
            'Readiness and completion inference forbidden',
          ],
        ]}
      />
      <H3>Authored runtime bindings</H3>
      <Table
        headers={['Authored behavior', 'Runtime target', 'Status']}
        rows={[
          [
            'Place V3-SUP-941207 as a contrastive refresher',
            'K1 learner flow and manual support access',
            'Authored binding; not presented as a canonical KC field',
          ],
          [
            'Unlock V3-EXT-910216',
            'After four simulated KC exits',
            'Authored sequencing; noncredit',
          ],
          ['Mention V3-CAP-262807', 'Completion boundary only', 'Never set or inferred'],
        ]}
      />
      <H3>Open hold</H3>
      <Table
        headers={['Hold', 'Status', 'Scope-safe handling']}
        rows={[
          [
            'V3-HOLD-110010',
            'OPEN',
            'Printed p.91 reinforcement terminology requires source-edition and Psych/Soc SME adjudication; disputed wording is absent.',
          ],
        ]}
      />
      <H3>Graph relations</H3>
      <Table
        headers={['Edge', 'Type', 'Endpoints', 'Point of use']}
        rows={GRAPH_RELATIONS}
        striped
      />
      <H3>Sequence</H3>
      <Table
        headers={[
          'Relation',
          'Phase / module',
          'Module event',
          'Global event',
          'Lesson ordinal',
          'Meaning',
        ]}
        rows={[
          [
            'R14-FD-225658',
            'V3-PHS-280641 · V3-MOD-938420',
            '1',
            '53',
            '46',
            'Canonical first delivery',
          ],
          [
            'R14-RV-225658',
            'V3-PHS-608354 · V3-MOD-741509',
            'Revisit order 5',
            '—',
            '46',
            'Planned revisit',
          ],
          ['KC lesson order', 'Lesson shell', '1 → 2 → 3 → 4', '—', '—', 'Exact microcycle order'],
          ['Prerequisites', 'None', 'None', 'None', '—', 'No hard or helpful readiness block'],
        ]}
      />
    </Stack>
  );
}

function ScreensView() {
  return (
    <Stack gap={12}>
      <H2>Every screen, key, and rationale</H2>
      <Text tone="secondary">
        Screen IDs are authoring-local. Canonical identities remain the V3 lesson, KC, support, and
        extension records.
      </Text>
      <H3>Stable key-position assertion</H3>
      <Table
        headers={['Build/runtime check', 'Entry A/B/C/D', 'Exit A/B/C/D', 'Recovery A/B/C/D']}
        rows={[
          [
            KEY_POSITION_ASSERTION_PASSED ? 'PASS' : 'FAIL',
            '2 / 2 / 2 / 2',
            '10 / 10 / 10 / 10',
            '6 / 6 / 6 / 6',
          ],
        ]}
        rowTone={[KEY_POSITION_ASSERTION_PASSED ? 'success' : 'danger']}
      />
      <H3>KC3 equivalent exit blueprint</H3>
      <Table
        headers={[
          'Form',
          'Slot 1 · +R/−R/+P/−P',
          'Slot 2 · primary/conditioned/token',
          'Slot 3 · continuous/FR/VR/FI/VI/extinction',
          'Slot 4 · escape/avoidance',
        ]}
        rows={KC3_EXIT_BLUEPRINT}
        striped
      />
      {KCS.map((kc) => (
        <div key={kc.id}>
          <CollapsibleSection title={`${kc.id} · ${kc.label}`} count={allScreensFor(kc).length}>
            <Stack gap={8}>
              <CollapsibleSection title="Entry route behavior">
                <Stack gap={7}>
                  {(['prepared', 'standard', 'targeted'] as Route[]).map((route) => (
                    <div key={route}>
                      <Stack gap={4}>
                        <Text weight="semibold">
                          {route === 'targeted' ? 'provisional response-pattern' : route}
                        </Text>
                        {kc.routeCopy[route].map((line) => (
                          <div key={line}>
                            <Text size="small">{line}</Text>
                          </div>
                        ))}
                      </Stack>
                    </div>
                  ))}
                </Stack>
              </CollapsibleSection>
              {allScreensFor(kc).map((screen) => (
                <div key={screen.id}>
                  <CollapsibleSection
                    title={`${screen.stage} · ${screen.title}`}
                    count={screen.questions?.length}
                  >
                    <ReviewScreen screen={screen} />
                  </CollapsibleSection>
                </div>
              ))}
            </Stack>
          </CollapsibleSection>
        </div>
      ))}
      <CollapsibleSection title="V3-SUP-941207 · support refresher" count={1}>
        <ReviewScreen screen={SUPPORT_SCREEN} />
      </CollapsibleSection>
      <CollapsibleSection title="V3-EXT-910216 · optional application" count={4}>
        <ReviewScreen screen={EXTENSION_SCREEN} />
      </CollapsibleSection>
    </Stack>
  );
}

function EvidenceView({ state }: { state: LessonState }) {
  return (
    <Stack gap={16}>
      <H2>Event and evidence semantics</H2>
      <Callout tone="warning" title={`Run ${state.runId} · internal-review simulation`}>
        Schema v{state.schemaVersion}. Reviewer exposure:{' '}
        {state.reviewerExposed ? 'yes' : 'not yet in this run'}. Regardless of exposure timing, this
        Canvas is not an authoritative evidence administration.
      </Callout>
      <H3>Persisted identity pins</H3>
      <Table
        headers={['Domain', 'Identifier', 'Version / pin']}
        rows={[
          ['Content', state.contentId, state.contentVersion],
          ['Policy', state.policyId, state.policyVersion],
          ['Registry', state.registryId, state.registryVersion],
        ]}
      />
      <SemanticSequence items={EVIDENCE_RULES} label="Evidence rules" />
      <H3>Canvas runtime event vocabulary</H3>
      <Table
        headers={['Event', 'Meaning']}
        rows={Object.entries(CANVAS_RUNTIME_EVENT_MEANINGS) as Array<[CanvasEventName, string]>}
        striped
      />
      <H3>Authoritative host contract · would-emit only</H3>
      <Callout tone="warning" title="Not a Canvas runtime event">
        These names document the external host contract only. They are excluded from the Canvas
        runtime event type and cannot be passed to appendEvent.
      </Callout>
      <Table
        headers={['Host event', 'Status', 'Contract meaning']}
        rows={AUTHORITATIVE_HOST_WOULD_EMIT}
      />
      <H3>Current simulation log</H3>
      <Table
        headers={['Seq', 'Run', 'Content', 'Policy', 'Registry', 'Event', 'KC', 'Item', 'Detail']}
        rows={state.events.map((event) => [
          String(event.seq),
          String(event.runId),
          event.contentVersion,
          event.policyId,
          event.registryId,
          event.type,
          event.kcId ?? 'lesson',
          event.itemId ?? '—',
          event.detail,
        ])}
        stickyHeader
        striped
      />
      {state.attemptHistory.length > 0 && (
        <Stack gap={8}>
          <H3>Immutable attempt history</H3>
          <Table
            headers={[
              'Seq',
              'Run',
              'Content',
              'KC',
              'Item',
              'Selection',
              'Result',
              'Assistance',
              'Exposure',
            ]}
            rows={state.attemptHistory.map((attempt) => [
              String(attempt.seq),
              String(attempt.runId),
              attempt.contentVersion,
              attempt.kcId,
              attempt.questionId,
              attempt.abstained
                ? 'Abstain: Not sure'
                : `${attempt.selectedPosition}: ${attempt.selectedText}`,
              attempt.correct ? 'key selected' : 'nonpass',
              attempt.assisted ? 'assisted' : 'unassisted',
              attempt.exposed ? 'exposed at commit' : 'simulation only',
            ])}
            stickyHeader
            striped
          />
        </Stack>
      )}
      {state.exposureHistory.length > 0 && (
        <Stack gap={8}>
          <H3>Immutable exposure history</H3>
          <Table
            headers={['Seq', 'Run', 'Content', 'Kind', 'KC', 'Detail']}
            rows={state.exposureHistory.map((exposure) => [
              String(exposure.seq),
              String(exposure.runId),
              exposure.contentVersion,
              exposure.kind,
              exposure.kcId ?? 'lesson',
              exposure.detail,
            ])}
            striped
          />
        </Stack>
      )}
      {state.archivedRuns.length > 0 && (
        <Stack gap={8}>
          <H3>Archived rehearsal runs</H3>
          <Table
            headers={[
              'Run',
              'Content',
              'Disposition',
              'Completed KCs',
              'Events at archive',
              'Reviewer exposed',
            ]}
            rows={state.archivedRuns.map((run) => [
              String(run.runId),
              run.contentVersion,
              run.disposition,
              `${run.completedKcs.length}/4`,
              String(run.eventCountAtArchive),
              run.reviewerExposed ? 'yes' : 'no',
            ])}
          />
        </Stack>
      )}
    </Stack>
  );
}

function AccessibilityView() {
  return (
    <Stack gap={16}>
      <H2>Accessibility and stimulus safety</H2>
      <SemanticSequence items={ACCESSIBILITY_REQUIREMENTS} label="Accessibility requirements" />
      <H3>Semantic representation contract</H3>
      <Table
        headers={['Visual form', 'Required text equivalent']}
        rows={[
          ['Trial sequence', 'Ordered list naming each stimulus, response, and transition'],
          [
            'Line or bar chart',
            'Title, axes and units, series labels, source caption, and exact adjacent table',
          ],
          ['Contingency diagram', 'Action → consequence operation → later behavior direction'],
          ['Conditioning diagram', 'Before, acquisition, and after relations in reading order'],
          ['Color or shape cue', 'Written color and shape name in every prompt and data label'],
          [
            'Feedback state',
            'Committed result, selected-choice rationale, assistance state, and next action in text',
          ],
        ]}
      />
      <Callout tone="info" title="No live aversive stimuli">
        Every tone, flash, puff, illness event, and fictional-species procedure is textual or
        data-only. The Canvas never plays audio, flashes the viewport, or simulates a physical
        stimulus.
      </Callout>
    </Stack>
  );
}

function ProvenanceView() {
  return (
    <Stack gap={16}>
      <H2>Source and provenance</H2>
      <Callout tone="info" title="Source artifact pins">
        The hashes below identify the exact inspected source artifacts; they are identity pins, not
        a comparison warning.
      </Callout>
      <Callout tone="warning" title="Open scope hold · V3-HOLD-110010">
        Printed p.91 reinforcement terminology remains open for source-edition and Psych/Soc SME
        adjudication. This Canvas uses “conditioned (secondary) reinforcer” and does not close the
        hold.
      </Callout>
      <H3>Authored content hash</H3>
      <Table
        headers={['Artifact', 'Content version', 'Status', 'Value']}
        rows={[
          [
            'mcat-lesson-associative-learning.canvas.tsx',
            CONTENT_VERSION,
            'PENDING',
            'Compute and pin only after final content, rights, similarity, and blind-solve gates pass.',
          ],
        ]}
      />
      <H3>Artifact hashes</H3>
      <Table headers={['Artifact', 'SHA-256']} rows={CHECKSUMS} />
      <H3>Scientific verification</H3>
      <Table headers={['Source', 'Use']} rows={SOURCES} striped />
      <H3>Rights declaration</H3>
      <SemanticSequence
        label="Rights declaration"
        items={[
          'Every vignette, number, choice, rationale, and diagram in this Canvas is newly authored.',
          'All datasets are marked or described as simulated and make no empirical claim.',
          'No AAMC item, stem, distractor, explanation, or protected prose is reproduced.',
          'No source illustration or expressive example is reused.',
          'Sources verify terminology and mechanisms only.',
        ]}
      />
    </Stack>
  );
}

function QAView() {
  return (
    <Stack gap={16}>
      <H2>Release QA</H2>
      <H3>Noncompensatory release gates</H3>
      <Callout tone="warning" title="All three gates must pass">
        Rights, similarity, and blind-solve review are independently required. A high rubric total
        cannot compensate for a failed or pending gate.
      </Callout>
      <Table
        headers={['Gate', 'Current status', 'Pass criterion']}
        rows={RELEASE_GATES}
        rowTone={RELEASE_GATES.map(() => 'warning')}
        striped
      />
      <H3>Reviewer rubric</H3>
      <Text tone="secondary">
        Score each 0 = fail, 1 = revision required, 2 = release-ready. Dimensions 1–6 and 10–12 must
        score 2; total must be at least 22/24.
      </Text>
      <Table
        headers={['Dimension', 'Release criterion']}
        rows={QA_RUBRIC.map((criterion, index) => [String(index + 1), criterion])}
        striped
      />
      <H3>Branch tests</H3>
      <Table
        headers={['Test', 'Expected behavior']}
        rows={BRANCH_TESTS.map((test, index) => [String(index + 1), test])}
        striped
      />
      <H3>Aggregate branch durations</H3>
      <Table
        headers={['Branch', 'Aggregate estimate', 'Included work']}
        rows={BRANCH_DURATIONS}
        striped
      />
      <Callout tone="info" title="Required independent review">
        Publication requires a Psych/Soc SME, an assessment reviewer, a blind solver for every key,
        keyboard and screen-reader review, and retained learner-unvalidated status until empirical
        calibration.
      </Callout>
    </Stack>
  );
}

function ReviewerView({
  state,
  setState,
}: {
  state: LessonState;
  setState: (action: LessonState | ((previous: LessonState) => LessonState)) => void;
}) {
  return (
    <Stack gap={16}>
      <Callout tone="warning" title="Internal review mode">
        Keys, rationales, repairs, and all parallel forms are exposed in this run. Every response is
        simulated review data and can never be treated as untouched authoritative evidence.
      </Callout>
      <Text size="small" tone="secondary">
        Current phase: {PHASE_LABELS[state.phase]} · events: {state.events.length} · run:{' '}
        {state.runId}
      </Text>
      {state.phase === 'paused' && !state.plannerAuthorization && !state.plannerTaskUsed && (
        <Callout tone="warning" title="Reviewer-only planner control">
          Learner mode remains terminal. This control only simulates external authorization for
          branch QA; reviewer exposure keeps the local planner pair rehearsal-only and unable to
          pass an exit gate.
          <Button
            variant="secondary"
            style={{ marginTop: 10 }}
            onClick={() => setState((previous) => simulateExternalPlannerAuthorization(previous))}
          >
            Simulate external planner authorization
          </Button>
        </Callout>
      )}
      {state.phase === 'paused' && state.plannerAuthorization && (
        <Callout tone="info" title="Planner task authorized">
          {state.plannerAuthorization.taskId}. Return to learner mode to start the authorized fresh
          task.
        </Callout>
      )}
      <Row gap={8} wrap>
        {REVIEWER_TABS.map((tab) => (
          <div key={tab.id}>
            <Pill
              active={state.reviewerTab === tab.id}
              onClick={() => setState((previous) => ({ ...previous, reviewerTab: tab.id }))}
            >
              {tab.label}
            </Pill>
          </div>
        ))}
      </Row>
      <Divider />
      {state.reviewerTab === 'manifest' && <ManifestView state={state} />}
      {state.reviewerTab === 'screens' && <ScreensView />}
      {state.reviewerTab === 'evidence' && <EvidenceView state={state} />}
      {state.reviewerTab === 'accessibility' && <AccessibilityView />}
      {state.reviewerTab === 'provenance' && <ProvenanceView />}
      {state.reviewerTab === 'qa' && <QAView />}
    </Stack>
  );
}

interface AssociativeLearningCanvasProps {
  reviewMode: boolean;
}

export default function AssociativeLearningCanvas({ reviewMode }: AssociativeLearningCanvasProps) {
  const theme = useHostTheme();
  const [state, setState] = useCanvasState<LessonState>(
    'associative-learning-state-v4-simulation-events',
    initialState,
  );
  const requestedMode: Mode = reviewMode ? 'reviewer' : 'learner';
  const activeState = state.mode === requestedMode ? state : { ...state, mode: requestedMode };
  const reviewReady = reviewMode && state.mode === 'reviewer' && state.reviewerExposed;
  const screenFocusRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setState((previous) => {
      if (reviewMode) return openInternalReviewer(previous);
      return previous.mode === 'learner' ? previous : { ...previous, mode: 'learner' };
    });
  }, [reviewMode, setState]);

  useEffect(() => {
    screenFocusRef.current?.focus();
  }, [
    activeState.exitRound,
    activeState.kcIndex,
    activeState.mode,
    activeState.phase,
    activeState.repairCount,
    activeState.runId,
    activeState.supportOpen,
  ]);

  const confirmNewRun = () => {
    setState((previous) => {
      const archivedRun: ArchivedRun = {
        runId: previous.runId,
        contentVersion: previous.contentVersion,
        disposition: 'internal-review-simulation',
        completedKcs: [...previous.completedKcs],
        eventCountAtArchive: previous.events.length,
        reviewerExposed: previous.reviewerExposed,
      };
      let next: LessonState = {
        ...initialState,
        runId: previous.runId + 1,
        mode: previous.mode,
        reviewerTab: previous.reviewerTab,
        reviewerExposed: previous.mode === 'reviewer',
        events: previous.events,
        attemptHistory: previous.attemptHistory,
        exposureHistory: previous.exposureHistory,
        archivedRuns: [...previous.archivedRuns, archivedRun],
        resetConfirmation: false,
      };
      next = appendExposure(
        next,
        'rerun_started',
        `Run ${next.runId} is a new internal-review rehearsal; archived exposure and attempt history remain immutable.`,
      );
      next = appendEvent(
        next,
        'new_rehearsal_run_started',
        `run ${next.runId} · prior run archived · no authoritative evidence eligibility`,
      );
      if (next.mode === 'reviewer') {
        next = appendExposure(
          next,
          'reviewer_keys_opened',
          'New run began while reviewer mode remained open; all task families are exposed.',
        );
      }
      return next;
    });
  };

  const requestNewRun = () => {
    setState((previous) => ({
      ...previous,
      resetConfirmation: true,
    }));
  };

  const cancelNewRun = () => {
    setState((previous) => ({
      ...previous,
      resetConfirmation: false,
    }));
  };

  const resetLegacyState = () => {
    setState({
      ...initialState,
      events: [
        {
          seq: 1,
          runId: 1,
          contentId: CONTENT_ID,
          contentVersion: CONTENT_VERSION,
          policyId: POLICY_ID,
          policyVersion: POLICY_VERSION,
          registryId: REGISTRY_ID,
          registryVersion: REGISTRY_VERSION,
          type: 'lesson_shell_started',
          detail: 'V3-LES-225658 versioned run initialized',
        },
      ],
    });
  };

  return (
    <main
      style={{
        minHeight: '100%',
        background: theme.bg.editor,
        color: theme.text.primary,
        padding: '22px clamp(14px, 3vw, 32px) 40px',
      }}
    >
      <Stack gap={20} style={{ maxWidth: 1120, margin: '0 auto' }}>
        <header>
          <Stack gap={10}>
            <Row gap={12} align="start" wrap>
              <Stack gap={5} style={{ minWidth: 280, flex: '1 1 560px' }}>
                {activeState.mode === 'reviewer' && (
                  <Text size="small" tone="tertiary">
                    V3-LES-225658 · {activeState.contentVersion ?? CONTENT_VERSION} · state v
                    {activeState.schemaVersion ?? 'legacy'} · rehearsal run {activeState.runId ?? 0}
                  </Text>
                )}
                <H1>
                  {activeState.mode === 'learner'
                    ? 'How cues, actions, and outcomes shape learning'
                    : 'Discriminate and model associative learning'}
                </H1>
                <Text tone="secondary">
                  {activeState.mode === 'learner'
                    ? 'Build a causal model, watch it work, then practice with gradually less help.'
                    : 'Four complete KC microcycles with persistent learner progress and a publication-review surface.'}
                </Text>
              </Stack>
              {reviewReady && (
                <Row gap={8} align="center" wrap>
                  <Button variant="ghost" onClick={requestNewRun}>
                    New rehearsal run
                  </Button>
                </Row>
              )}
            </Row>
            {reviewReady && activeState.resetConfirmation && (
              <Callout tone="warning" title="Confirm a separately labeled rehearsal run">
                Active responses and progress will clear, but immutable attempt, exposure,
                archived-run, and event histories will remain. Previously attempted same-family
                items remain exposed rehearsal and cannot satisfy a performance gate.
                <Row gap={8} wrap style={{ marginTop: 10 }}>
                  <Button variant="primary" onClick={confirmNewRun}>
                    Confirm new rehearsal run
                  </Button>
                  <Button variant="secondary" onClick={cancelNewRun}>
                    Cancel
                  </Button>
                </Row>
              </Callout>
            )}
            {(activeState.schemaVersion ?? 0) !== STATE_SCHEMA_VERSION && (
              <Callout
                tone="warning"
                title={
                  activeState.mode === 'learner' ? 'Lesson update needed' : 'Legacy state detected'
                }
              >
                {activeState.mode === 'learner'
                  ? 'Update the saved lesson state before continuing.'
                  : 'This Canvas now requires the v4 content/policy/registry-pinned simulation-event schema.'}
                <Button variant="secondary" onClick={resetLegacyState} style={{ marginTop: 10 }}>
                  {activeState.mode === 'learner' ? 'Update lesson' : 'Initialize v4 state'}
                </Button>
              </Callout>
            )}
          </Stack>
        </header>
        <Divider />
        <div
          key={`${activeState.mode}-${activeState.runId}-${activeState.kcIndex}-${activeState.phase}-${activeState.exitRound}-${activeState.repairCount}-${String(activeState.supportOpen)}`}
          ref={screenFocusRef}
          tabIndex={-1}
          aria-label={
            activeState.mode === 'learner'
              ? `Lesson screen: ${LEARNER_PHASE_LABELS[activeState.phase]}`
              : 'Reviewer workspace'
          }
        >
          {activeState.mode === 'learner' ? (
            <LearnerView state={activeState} setState={setState} />
          ) : reviewReady ? (
            <ReviewerView state={activeState} setState={setState} />
          ) : (
            <div role="status">Preparing reviewer workspace…</div>
          )}
        </div>
      </Stack>
    </main>
  );
}
