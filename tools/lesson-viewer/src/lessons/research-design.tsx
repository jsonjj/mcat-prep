import {
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
  Link,
  Pill,
  Row,
  Stack,
  Stat,
  Table,
  Text,
  UsageBar,
  useCanvasState,
  useHostTheme,
} from 'cursor/canvas';
import { useEffect, useRef } from 'react';

type Mode = 'learner' | 'reviewer';
type KcKey = 'kc1' | 'kc2' | 'kc3' | 'kc4' | 'kc5';
type Route = 'unassigned' | 'concise' | 'standard' | 'misconception' | 'prerequisite';
type KcStatus = 'locked' | 'in_progress' | 'simulated_exit' | 'paused';
type QuestionPhase = 'entry' | 'orient' | 'A2' | 'A1' | 'A0' | 'exit' | 'repair' | 'recovery';
type SupportLevel = 0 | 1 | 2;
type ReviewerTab = 'authority' | 'content' | 'logic' | 'release';

interface Choice {
  id: 'A' | 'B' | 'C';
  text: string;
  rationale: string;
}

interface Question {
  id: string;
  kc: KcKey;
  phase: QuestionPhase;
  family: string;
  prompt: string;
  scenario: string;
  options: Choice[];
  key: Choice['id'];
  hint: string;
}

interface KcContent {
  key: KcKey;
  id: string;
  label: string;
  canonicalStatement: string;
  competence: string;
  scope: string;
  duration: string;
  entryIds: [string, string];
  orientId: string;
  a2Id: string;
  a1Id: string;
  a0Id: string;
  exitIds: Array<{ near: string; changed: string }>;
  repairIds: Record<string, [string, string]>;
  recoveryIds: [string, string];
  model: string[];
  expert: Array<{ label: string; text: string }>;
  contrasts: Array<{ case: string; decision: string }>;
  handoff: string;
}

interface EventRecord {
  seq: number;
  type: string;
  kc: KcKey;
  screen: string;
  response?: string;
  assistance?: string;
  decisionContext: string;
}

interface LessonState {
  version: 3;
  current: { kc: KcKey; screen: string };
  reached: Record<KcKey, string[]>;
  answers: Record<string, string>;
  committed: Record<string, boolean>;
  hints: Record<string, boolean>;
  routes: Record<KcKey, Route>;
  statuses: Record<KcKey, KcStatus>;
  exitFamily: Record<KcKey, number>;
  repairCycles: Record<KcKey, number>;
  supportLevel: Record<KcKey, SupportLevel>;
  pairReviewed: Record<string, boolean>;
  consumedGates: Record<string, boolean>;
  selectedRepairBranches: Record<string, string>;
  routeSignatures: Partial<Record<KcKey, string>>;
  pauseReason: Partial<Record<KcKey, string>>;
  events: EventRecord[];
  manualPaused: boolean;
}

interface AuditIdentity {
  contentVersion: 'CBR24-RDI-1.2-INTERNAL';
  exposureVersion: 'KEY-EXPOSED-v2';
  reviewRunId: 'RDI-INTERNAL-QR-001';
  rehearsalRun: number;
  reviewedContentHash: 'PENDING';
  exposedQuestionIds: string[];
}

const choiceSet = (
  aText: string,
  aRationale: string,
  bText: string,
  bRationale: string,
  cText: string,
  cRationale: string,
): Choice[] => [
  { id: 'A', text: aText, rationale: aRationale },
  { id: 'B', text: bText, rationale: bRationale },
  { id: 'C', text: cText, rationale: cRationale },
];

const QUESTIONS: Question[] = [
  {
    id: 'q1-e1',
    kc: 'kc1',
    phase: 'entry',
    family: 'entry-route',
    scenario:
      'CBR-24 begins with a claim: a two-minute paced-breathing routine before a quiz improves first-year students’ quiz performance.',
    prompt: 'Which question is testable by the planned study?',
    options: choiceSet(
      'Does assigning students to paced breathing rather than quiet sitting change their next quiz score?',
      'Correct. It names a manipulable comparison and a measurable outcome in a bounded population and time.',
      'Does paced breathing make every student a better learner?',
      'This is too broad: “better learner” is undefined and “every student” exceeds the planned population.',
      'Is paced breathing inherently good?',
      'This is a value claim, not an empirical question with an observable decision rule.',
    ),
    key: 'A',
    hint: 'Look for a comparison, an observable outcome, and a bounded population and time.',
  },
  {
    id: 'q1-e2',
    kc: 'kc1',
    phase: 'entry',
    family: 'entry-route',
    scenario:
      'The team can measure quiz score immediately after the assigned routine but cannot measure neural activity.',
    prompt: 'Which hypothesis fits what this study can test?',
    options: choiceSet(
      'Students assigned to paced breathing will have a higher mean quiz score than students assigned to quiet sitting.',
      'Correct. The groups, direction, and outcome are operationalized.',
      'Paced breathing will permanently improve intelligence.',
      'The duration and construct exceed the study’s measures.',
      'Paced breathing raises quiz scores because it synchronizes prefrontal neurons.',
      'The mechanism is not measured, so the study cannot test that mechanistic explanation.',
    ),
    key: 'A',
    hint: 'A hypothesis cannot require an outcome, timescale, or mechanism the study does not observe.',
  },
  {
    id: 'q1-o',
    kc: 'kc1',
    phase: 'orient',
    family: 'CBR-24 planning note',
    scenario: 'The investigators write: “Breathing makes people successful.”',
    prompt: 'What is the most important first revision?',
    options: choiceSet(
      'Replace “successful” with a named measurement and define the comparison.',
      'Correct. Operational definitions turn the claim into a possible observation.',
      'Recruit more participants before changing the wording.',
      'Sample size does not repair an undefined outcome.',
      'Add a causal mechanism to make the claim sound scientific.',
      'An unmeasured mechanism makes the claim less testable, not more.',
    ),
    key: 'A',
    hint: 'Ask what exact observation could count for or against the claim.',
  },
  {
    id: 'q1-a2',
    kc: 'kc1',
    phase: 'A2',
    family: 'sleep analogue',
    scenario:
      'A campus team compares a fixed 20-minute nap with quiet rest and measures reaction time 10 minutes later.',
    prompt: 'Complete the hypothesis: Students assigned to the nap will…',
    options: choiceSet(
      'show a lower mean reaction time than students assigned to quiet rest 10 minutes later.',
      'Correct. The response supplies comparison, direction, outcome, and time.',
      'be healthier than all students who do not nap.',
      'Health is not measured and the population is overextended.',
      'have greater neural recovery because sleep restores every brain system.',
      'The proposed mechanism and universal claim are not measured.',
    ),
    key: 'A',
    hint: 'Use the exact groups, measure, direction, and observation time in the scenario.',
  },
  {
    id: 'q1-a1',
    kc: 'kc1',
    phase: 'A1',
    family: 'screen-light analogue',
    scenario:
      'Participants are assigned to a bright or dim phone display for 30 minutes. Sleep-onset latency is measured that night.',
    prompt: 'Which hypothesis is properly bounded?',
    options: choiceSet(
      'Bright displays destroy sleep quality.',
      '“Destroy” is undefined, and sleep quality is broader than the measured latency.',
      'Participants assigned to the bright display will have a longer mean sleep-onset latency that night than those assigned to the dim display.',
      'Correct. It matches the manipulation, comparison, outcome, direction, and time.',
      'Blue light permanently damages circadian neurons.',
      'Neither permanence nor neuronal damage is observed.',
    ),
    key: 'B',
    hint: 'Name only what the study manipulates and measures.',
  },
  {
    id: 'q1-a0',
    kc: 'kc1',
    phase: 'A0',
    family: 'plant-growth analogue',
    scenario:
      'Bean plants receive either 4 or 8 hours of light daily for 14 days. Height change is recorded.',
    prompt: 'Which is the strongest testable hypothesis?',
    options: choiceSet(
      'Plants need light.',
      'This is testable in principle, but it does not state the study’s comparison or predicted outcome.',
      'Plants receiving 8 hours of light will have a greater mean height increase over 14 days than plants receiving 4 hours.',
      'Correct. It is specific enough to be evaluated by the described data.',
      'More light makes every plant biologically superior.',
      '“Biologically superior” is undefined and the universal quantifier is unsupported.',
    ),
    key: 'B',
    hint: 'Identify the exact contrast and the recorded outcome.',
  },
  {
    id: 'q1-x0n',
    kc: 'kc1',
    phase: 'exit',
    family: 'exit A · near use',
    scenario:
      'CBR-24 can compare paced breathing with quiet sitting and record the next quiz score.',
    prompt: 'Which conclusion is directly testable?',
    options: choiceSet(
      'The assigned breathing routine changes mean next-quiz score relative to quiet sitting.',
      'Correct. This is the bounded comparison the study can observe.',
      'Breathing improves academic ability for life.',
      'The study does not measure lifetime academic ability.',
      'Breathing works by reducing amygdala activity.',
      'Amygdala activity is not measured.',
    ),
    key: 'A',
    hint: 'Restrict the claim to the actual comparison, measure, and time.',
  },
  {
    id: 'q1-x0c',
    kc: 'kc1',
    phase: 'exit',
    family: 'exit A · changed context',
    scenario:
      'A nutrition lab compares two labeled sports drinks and records blood glucose 30 minutes later.',
    prompt: 'Which hypothesis is testable in that design?',
    options: choiceSet(
      'Drink X is healthier.',
      '“Healthier” is not operationalized by a single 30-minute glucose value.',
      'Drink X causes permanent metabolic improvement.',
      'The study does not observe permanence or broad metabolic improvement.',
      'Participants assigned Drink X will have a lower mean 30-minute glucose concentration than those assigned Drink Y.',
      'Correct. It names the manipulation, comparison, outcome, direction, and time.',
    ),
    key: 'C',
    hint: 'The changed context still requires a measured outcome and bounded time.',
  },
  {
    id: 'q1-x1n',
    kc: 'kc1',
    phase: 'exit',
    family: 'exit B · near replacement',
    scenario:
      'A second campus study compares four minutes of paced breathing with four minutes of silent reading and records self-rated tension immediately afterward.',
    prompt: 'Which research question is testable?',
    options: choiceSet(
      'Is breathing always calming?',
      '“Always” exceeds this one immediate comparison.',
      'Does assignment to paced breathing rather than silent reading change mean immediate tension rating?',
      'Correct. The question is tied to the assigned conditions, measure, and time.',
      'Why does breathing heal the nervous system?',
      'The question assumes an unmeasured effect and mechanism.',
    ),
    key: 'B',
    hint: 'Turn the claim into a comparison the recorded ratings can answer.',
  },
  {
    id: 'q1-x1c',
    kc: 'kc1',
    phase: 'exit',
    family: 'exit B · changed context',
    scenario:
      'Potato cores are placed in 0.2 M or 0.6 M sucrose for 40 minutes; percent mass change is recorded.',
    prompt: 'Which hypothesis matches the data?',
    options: choiceSet(
      'Cores in 0.6 M sucrose will have a lower mean percent mass change than cores in 0.2 M sucrose after 40 minutes.',
      'Correct. Both conditions, the outcome, direction, and interval are specified.',
      'Sucrose is harmful to all cells.',
      'The universal harm claim is not what mass change in potato cores tests.',
      'Osmosis makes organisms unhealthy.',
      'The outcome and population are undefined and overbroad.',
    ),
    key: 'A',
    hint: 'Use only the two concentrations, recorded mass change, and 40-minute interval.',
  },
  {
    id: 'q1-x2n',
    kc: 'kc1',
    phase: 'exit',
    family: 'exit C · near replacement',
    scenario:
      'Students hear white noise or silence for five minutes, then complete a 20-item recall test.',
    prompt: 'Which hypothesis is appropriately testable?',
    options: choiceSet(
      'White noise improves cognition.',
      'Cognition is broader than the recall score.',
      'White noise restructures memory networks.',
      'No neural network measure is described.',
      'Students assigned white noise will have a different mean recall score than students assigned silence.',
      'Correct. A nondirectional hypothesis is valid and matches the observable comparison.',
    ),
    key: 'C',
    hint: 'A hypothesis may be nondirectional, but it must still name the observable comparison.',
  },
  {
    id: 'q1-x2c',
    kc: 'kc1',
    phase: 'exit',
    family: 'exit C · changed context',
    scenario:
      'An enzyme is tested at pH 5 and pH 8; product concentration after 60 seconds is measured.',
    prompt: 'Which question can the experiment answer?',
    options: choiceSet(
      'Does pH condition change mean 60-second product concentration under these assay conditions?',
      'Correct. It is bounded to the conditions and observable outcome.',
      'What pH is best for every enzyme?',
      'Two conditions for one enzyme do not establish a universal optimum.',
      'Why did evolution design enzymes?',
      'That teleological question is not tested by this assay.',
    ),
    key: 'A',
    hint: 'Keep the enzyme, assay conditions, and recorded endpoint in scope.',
  },
  {
    id: 'q1-r1',
    kc: 'kc1',
    phase: 'repair',
    family: 'uncertainty branch · cycle 1',
    scenario: 'A study records change in a named outcome after two assigned conditions.',
    prompt: 'Which feature is required for the hypothesis to be testable by this study?',
    options: choiceSet(
      'A moral judgment about which condition is better.',
      'A value judgment is not an observation rule.',
      'A measurable outcome linked to the named comparison.',
      'Correct. The hypothesis needs an observation that can support or challenge it.',
      'A biological mechanism, even if it is not measured.',
      'An unmeasured mechanism should not be added to the tested claim.',
    ),
    key: 'B',
    hint: 'Ask what result would count against the hypothesis.',
  },
  {
    id: 'q1-r2',
    kc: 'kc1',
    phase: 'repair',
    family: 'scope branch · cycle 2',
    scenario: 'A trial measures pain 15 minutes after an intervention in adult volunteers.',
    prompt: 'Which phrase keeps the claim within scope?',
    options: choiceSet(
      'reduces mean pain rating at 15 minutes in these volunteers',
      'Correct. It preserves outcome, time, and population.',
      'eliminates suffering permanently',
      'The construct and duration exceed the measure.',
      'repairs all pain pathways',
      'The mechanism and universal scope are not measured.',
    ),
    key: 'A',
    hint: 'Reuse the study’s exact population, outcome, and time.',
  },

  {
    id: 'q2-e1',
    kc: 'kc2',
    phase: 'entry',
    family: 'entry-route',
    scenario:
      'CBR-24 assigns a routine, records quiz score, and keeps quiz version and preparation time the same.',
    prompt: 'Which role assignment is correct?',
    options: choiceSet(
      'Routine = independent variable; quiz score = dependent variable; quiz version = controlled variable.',
      'Correct. The manipulated factor, measured outcome, and held-constant feature are distinguished.',
      'Quiz score = independent variable; routine = dependent variable.',
      'The roles are reversed: routine is assigned and score is observed.',
      'Quiz version = confound simply because it could affect score.',
      'A potential influence held constant is a control, not an actual confound.',
    ),
    key: 'A',
    hint: 'Ask what is assigned, what is measured, and what is deliberately held constant.',
  },
  {
    id: 'q2-e2',
    kc: 'kc2',
    phase: 'entry',
    family: 'entry-route',
    scenario:
      'Students choose whether to breathe or sit quietly. More highly motivated students disproportionately choose breathing, and motivation also predicts quiz score.',
    prompt: 'What is motivation in this design?',
    options: choiceSet(
      'A mediator caused by breathing.',
      'The scenario says motivation precedes choice; it is not downstream of the routine.',
      'A confound because it differs with exposure and can affect the outcome.',
      'Correct. Motivation offers an alternative explanation for an association.',
      'A controlled variable because researchers know about it.',
      'Knowing a factor exists does not mean it was held constant or adequately adjusted.',
    ),
    key: 'B',
    hint: 'A confound is associated with the exposure and can independently affect the outcome.',
  },
  {
    id: 'q2-o',
    kc: 'kc2',
    phase: 'orient',
    family: 'CBR-24 protocol',
    scenario:
      'The team switches from self-selection to random assignment and uses the same room, quiz, and preparation interval.',
    prompt: 'Which design threat is most directly reduced by random assignment?',
    options: choiceSet(
      'Systematic baseline differences between routine groups.',
      'Correct. Random assignment tends to balance measured and unmeasured baseline causes across groups.',
      'Imprecision in the pulse sensor.',
      'Assignment does not calibrate a measurement device.',
      'Lack of representativeness of the recruited campus sample.',
      'Assignment supports internal comparison; it does not make recruitment representative.',
    ),
    key: 'A',
    hint: 'Separate how participants enter the sample from how sampled participants enter conditions.',
  },
  {
    id: 'q2-a2',
    kc: 'kc2',
    phase: 'A2',
    family: 'sleep-duration analogue',
    scenario:
      'A trial assigns 6 or 8 hours in bed and measures next-morning vigilance. Caffeine intake is prohibited.',
    prompt: 'How should caffeine prohibition be classified?',
    options: choiceSet(
      'Independent variable',
      'Sleep opportunity, not caffeine, is manipulated.',
      'Dependent variable',
      'Vigilance is the measured outcome.',
      'Controlled variable',
      'Correct. The study holds caffeine exposure constant to reduce an alternative explanation.',
    ),
    key: 'C',
    hint: 'The study does not compare caffeine levels; it restricts them.',
  },
  {
    id: 'q2-a1',
    kc: 'kc2',
    phase: 'A1',
    family: 'music-training analogue',
    scenario:
      'Children who enroll in music lessons already have higher family income, and income predicts later test score.',
    prompt: 'What role does family income play in the observed music–score association?',
    options: choiceSet(
      'Confound',
      'Correct. It is associated with lesson enrollment and independently related to score.',
      'Dependent variable',
      'The outcome is later test score, not income.',
      'Randomized control',
      'Enrollment is observed, not randomized, and income is not a control group.',
    ),
    key: 'A',
    hint: 'Look for a preexisting common cause of exposure and outcome.',
  },
  {
    id: 'q2-a0',
    kc: 'kc2',
    phase: 'A0',
    family: 'plant-fertilizer analogue',
    scenario:
      'Plants receive fertilizer A or B. A is always placed on a warmer upper shelf; B is always on a cooler lower shelf. Growth is measured.',
    prompt: 'Which factor is confounded with fertilizer?',
    options: choiceSet(
      'Final plant height',
      'Height is the outcome.',
      'Shelf temperature/position',
      'Correct. It covaries with fertilizer condition and can affect growth.',
      'The label A versus B',
      'The labels identify the intended independent variable; the shelf difference is the competing cause.',
    ),
    key: 'B',
    hint: 'Find the second factor that changes systematically with treatment and can affect growth.',
  },
  {
    id: 'q2-x0n',
    kc: 'kc2',
    phase: 'exit',
    family: 'exit A · near use',
    scenario:
      'In CBR-24, all breathing sessions occur in the morning and all quiet-sitting sessions occur in the evening.',
    prompt: 'What is the main interpretation problem?',
    options: choiceSet(
      'Time of day is confounded with routine.',
      'Correct. Time covaries perfectly with routine and may affect performance.',
      'Quiz score becomes the independent variable.',
      'Quiz score remains the measured outcome.',
      'Routine becomes a controlled variable.',
      'Routine is still the intended independent variable.',
    ),
    key: 'A',
    hint: 'Ask what else changes whenever the assigned routine changes.',
  },
  {
    id: 'q2-x0c',
    kc: 'kc2',
    phase: 'exit',
    family: 'exit A · changed context',
    scenario:
      'Mice receive drug or vehicle, but every drug cage is on a noisy rack and every vehicle cage is on a quiet rack.',
    prompt: 'Which statement is correct?',
    options: choiceSet(
      'Rack noise is a dependent variable.',
      'The measured outcome, not rack noise, is the dependent variable.',
      'Rack noise is confounded with treatment.',
      'Correct. It differs systematically by treatment and can influence outcomes.',
      'Vehicle is a confound.',
      'Vehicle is the intended comparison condition.',
    ),
    key: 'B',
    hint: 'Identify a competing factor that tracks treatment group.',
  },
  {
    id: 'q2-x1n',
    kc: 'kc2',
    phase: 'exit',
    family: 'exit B · near replacement',
    scenario:
      'Students choose an exercise class or a study hall. Baseline health predicts both that choice and end-of-term stress.',
    prompt: 'How should baseline health be classified?',
    options: choiceSet(
      'Confound',
      'Correct. It precedes exposure and can create an alternative explanation.',
      'Mediator',
      'A mediator would be caused by the exercise exposure.',
      'Outcome',
      'End-of-term stress is the outcome.',
    ),
    key: 'A',
    hint: 'A preexposure common cause is a confound, not a mediator.',
  },
  {
    id: 'q2-x1c',
    kc: 'kc2',
    phase: 'exit',
    family: 'exit B · changed context',
    scenario:
      'Cell cultures receive compound X or solvent. All X plates use one incubator shelf and all solvent plates use another shelf with a temperature offset.',
    prompt: 'Which design change best separates compound from shelf?',
    options: choiceSet(
      'Measure more cells from the same plates.',
      'More observations do not separate two perfectly linked causes.',
      'Randomize plates from both conditions across shelves.',
      'Correct. Crossing condition with shelf breaks the systematic linkage.',
      'Rename the solvent control.',
      'A label change does not alter the design.',
    ),
    key: 'B',
    hint: 'The remedy must stop shelf from tracking treatment.',
  },
  {
    id: 'q2-x2n',
    kc: 'kc2',
    phase: 'exit',
    family: 'exit C · near replacement',
    scenario:
      'A relaxation program may lower anxiety partly by improving sleep. Sleep is measured after the program begins.',
    prompt: 'If the proposed sequence is program → sleep → anxiety, what is sleep?',
    options: choiceSet(
      'Mediator',
      'Correct. It lies on the proposed pathway from exposure to outcome.',
      'Baseline confound',
      'The scenario places sleep after the program, not before it.',
      'Independent variable',
      'Program assignment is the independent variable.',
    ),
    key: 'A',
    hint: 'Order matters: a mediator follows the exposure and transmits part of its effect.',
  },
  {
    id: 'q2-x2c',
    kc: 'kc2',
    phase: 'exit',
    family: 'exit C · changed context',
    scenario:
      'Enzyme activity is measured at two temperatures while pH and substrate concentration are held constant.',
    prompt: 'Which role assignment is correct?',
    options: choiceSet(
      'Temperature = dependent; activity = control.',
      'The roles are reversed.',
      'Temperature = independent; activity = dependent; pH = controlled.',
      'Correct. The varied factor, measured response, and held-constant condition are distinct.',
      'Substrate concentration = confound merely because it affects activity.',
      'It is held constant, so it is a control in this design.',
    ),
    key: 'B',
    hint: 'Classify factors by what the investigators do with them in this specific study.',
  },
  {
    id: 'q2-r1',
    kc: 'kc2',
    phase: 'repair',
    family: 'common-cause branch · cycle 1',
    scenario: 'A preexisting factor predicts both exposure choice and outcome.',
    prompt: 'Which causal diagram best matches a confound?',
    options: choiceSet(
      'Exposure → factor → outcome',
      'That is the structure of a mediator.',
      'Factor → exposure and factor → outcome',
      'Correct. A common cause can generate an exposure–outcome association.',
      'Outcome → exposure only',
      'This does not represent the stated common cause.',
    ),
    key: 'B',
    hint: 'The confound has arrows into both exposure and outcome.',
  },
  {
    id: 'q2-r2',
    kc: 'kc2',
    phase: 'repair',
    family: 'common-cause branch · cycle 2',
    scenario: 'Two treatments are always administered in different rooms.',
    prompt: 'Which revision directly addresses the room confound?',
    options: choiceSet(
      'Use both treatments in both rooms according to a randomized schedule.',
      'Correct. Treatment no longer determines room.',
      'Increase the sample in each unchanged room.',
      'A larger sample preserves the same confounding.',
      'Report the room difference only after seeing results.',
      'Disclosure is important but does not repair the design.',
    ),
    key: 'A',
    hint: 'Break the one-to-one link between treatment and room.',
  },

  {
    id: 'q3-e1',
    kc: 'kc3',
    phase: 'entry',
    family: 'entry-route',
    scenario:
      'CBR-24 recruits volunteers from one introductory psychology course, then randomly assigns those volunteers to routines.',
    prompt: 'What does random assignment accomplish?',
    options: choiceSet(
      'It makes the volunteers representative of all first-year students.',
      'Assignment does not change how the sample was recruited.',
      'It supports comparability of the routine groups within the recruited sample.',
      'Correct. Assignment targets internal group balance.',
      'It guarantees every measured value is accurate.',
      'Assignment does not calibrate instruments or validate measures.',
    ),
    key: 'B',
    hint: 'Sampling selects people from a population; assignment allocates sampled people to conditions.',
  },
  {
    id: 'q3-e2',
    kc: 'kc3',
    phase: 'entry',
    family: 'entry-route',
    scenario:
      'A pulse sensor reads 8 beats/min too high on every trial but gives nearly identical repeated readings.',
    prompt: 'How should the sensor be described?',
    options: choiceSet(
      'Precise but inaccurate.',
      'Correct. Repeated values agree with one another but are offset from the reference.',
      'Accurate but imprecise.',
      'A systematic offset contradicts accuracy; repeated agreement supports precision.',
      'Valid because it is reliable.',
      'Consistency alone does not establish that the intended quantity is measured correctly.',
    ),
    key: 'A',
    hint: 'Precision concerns agreement among repeated values; accuracy concerns closeness to a reference.',
  },
  {
    id: 'q3-o',
    kc: 'kc3',
    phase: 'orient',
    family: 'CBR-24 claim audit',
    scenario:
      'The volunteer course is taught at one commuter campus. The team wants to claim the result applies to all university students.',
    prompt: 'What is the main concern?',
    options: choiceSet(
      'External validity/generalizability beyond the sampled setting.',
      'Correct. The recruitment frame may not represent other students or settings.',
      'Whether random assignment happened inside the sample.',
      'Assignment is relevant to internal comparison, but it does not solve the proposed population leap.',
      'Whether the quiz has enough items to calculate a mean.',
      'A mean can be calculated; the issue is transport beyond the sample and setting.',
    ),
    key: 'A',
    hint: 'Ask which population and setting the recruitment frame can reasonably represent.',
  },
  {
    id: 'q3-a2',
    kc: 'kc3',
    phase: 'A2',
    family: 'survey analogue',
    scenario:
      'A university randomly selects 300 student IDs from the full enrollment list; 92 students respond.',
    prompt: 'Which issue remains after probability selection?',
    options: choiceSet(
      'Nonresponse may make respondents differ from selected nonrespondents.',
      'Correct. Probability selection does not erase bias from differential participation.',
      'The selected students were not randomly assigned to a treatment.',
      'This descriptive survey does not require treatment assignment.',
      'No statistic can be calculated with 92 responses.',
      'Statistics can be calculated; representativeness is the concern.',
    ),
    key: 'A',
    hint: 'Selection was random, but response was not complete.',
  },
  {
    id: 'q3-a1',
    kc: 'kc3',
    phase: 'A1',
    family: 'measurement analogue',
    scenario: 'A scale gives 54.0, 54.1, and 54.0 kg for a 50.0 kg calibration mass.',
    prompt: 'Which description is best?',
    options: choiceSet(
      'Accurate and imprecise',
      'The readings are not close to the reference and are tightly clustered.',
      'Precise with a systematic positive bias',
      'Correct. The readings agree but are about 4 kg high.',
      'Valid for body composition because the readings repeat',
      'Repeatability of mass readings does not establish validity for body composition.',
    ),
    key: 'B',
    hint: 'Compare repeated spread with distance from the known reference.',
  },
  {
    id: 'q3-a0',
    kc: 'kc3',
    phase: 'A0',
    family: 'construct-validity analogue',
    scenario:
      'A one-item survey asks “Are you a good person?” and is used as the sole measure of empathy.',
    prompt: 'Which quality is most directly threatened?',
    options: choiceSet(
      'Construct validity',
      'Correct. The item may not represent the intended construct of empathy.',
      'Random assignment',
      'Assignment is a design procedure, not a property of this measure.',
      'Numerical precision',
      'The central problem is not decimal resolution; it is construct representation.',
    ),
    key: 'A',
    hint: 'Ask whether the measure captures the construct it is claimed to represent.',
  },
  {
    id: 'q3-x0n',
    kc: 'kc3',
    phase: 'exit',
    family: 'exit A · near use',
    scenario:
      'CBR-24’s stress scale yields similar scores when repeated minutes apart, but independent validation shows it mostly captures test familiarity rather than stress.',
    prompt: 'Which statement is most accurate?',
    options: choiceSet(
      'The scale is reliable but has weak construct validity.',
      'Correct. Consistency and construct validity are separate properties.',
      'Reliability proves validity.',
      'A consistently wrong or mis-targeted measure can be reliable without being valid.',
      'Random assignment repairs the measure.',
      'Assignment cannot make an instrument represent the intended construct.',
    ),
    key: 'A',
    hint: 'Separate consistency from measuring the intended construct.',
  },
  {
    id: 'q3-x0c',
    kc: 'kc3',
    phase: 'exit',
    family: 'exit A · changed context',
    scenario: 'A force sensor reports 11.9, 12.0, and 12.1 N for a certified 10.0 N load.',
    prompt: 'What pattern is shown?',
    options: choiceSet(
      'High accuracy and low precision',
      'The values cluster tightly but miss the reference.',
      'High precision and low accuracy',
      'Correct. Repeated spread is small while the systematic error is large.',
      'High construct validity for every use',
      'These calibration readings do not establish validity for every intended application.',
    ),
    key: 'B',
    hint: 'Compare repeatability with closeness to 10.0 N.',
  },
  {
    id: 'q3-x1n',
    kc: 'kc3',
    phase: 'exit',
    family: 'exit B · near replacement',
    scenario:
      'A city estimates transit satisfaction using only people subscribed to its transit-news email.',
    prompt: 'What most limits generalization to all riders?',
    options: choiceSet(
      'The sampling frame excludes riders who are not subscribers.',
      'Correct. Coverage bias can make the frame systematically unrepresentative.',
      'The city did not randomly assign email subscriptions.',
      'Assignment is irrelevant to estimating a descriptive population proportion.',
      'Satisfaction is a dependent variable.',
      'Variable labels do not address the frame’s missing riders.',
    ),
    key: 'A',
    hint: 'Ask who had no chance to enter the sample.',
  },
  {
    id: 'q3-x1c',
    kc: 'kc3',
    phase: 'exit',
    family: 'exit B · changed context',
    scenario: 'A thermometer reads exactly 1.5 °C high across repeated calibration temperatures.',
    prompt: 'Which correction is most directly indicated?',
    options: choiceSet(
      'Address the systematic calibration bias.',
      'Correct. The stable offset is an accuracy problem.',
      'Average more identical biased readings and make no calibration change.',
      'Averaging can reduce random error but retains systematic bias.',
      'Recruit a more representative sample.',
      'Sampling does not correct an instrument’s offset.',
    ),
    key: 'A',
    hint: 'A stable offset calls for calibration, not only more repetitions.',
  },
  {
    id: 'q3-x2n',
    kc: 'kc3',
    phase: 'exit',
    family: 'exit C · near replacement',
    scenario:
      'A grip-strength device gives widely varying values for the same fixed calibration load.',
    prompt: 'Which property is most directly weak?',
    options: choiceSet(
      'Precision/repeatability',
      'Correct. Repeated measurements under the same conditions disagree.',
      'Population representativeness',
      'The issue is the device’s repeated measurements, not sampling.',
      'Random assignment',
      'Treatment allocation does not explain variation under fixed calibration.',
    ),
    key: 'A',
    hint: 'Focus on agreement among repeated measurements.',
  },
  {
    id: 'q3-x2c',
    kc: 'kc3',
    phase: 'exit',
    family: 'exit C · changed context',
    scenario:
      'A depression questionnaire has high test–retest reliability but asks only about physical energy.',
    prompt: 'Which inference is justified?',
    options: choiceSet(
      'It must be a valid complete measure of depression.',
      'Reliability does not prove complete construct coverage.',
      'It may be reliable while having limited content or construct validity.',
      'Correct. Consistent scores can still represent the target construct incompletely.',
      'It is inaccurate because it has no decimal places.',
      'Decimal display is not the relevant definition of accuracy or validity.',
    ),
    key: 'B',
    hint: 'Consistency is necessary for many uses but not sufficient for validity.',
  },
  {
    id: 'q3-r1',
    kc: 'kc3',
    phase: 'repair',
    family: 'sampling-assignment branch · cycle 1',
    scenario: 'People are randomly allocated after volunteering from one clinic.',
    prompt: 'Which statement preserves the sampling–assignment distinction?',
    options: choiceSet(
      'Random allocation supports the treatment comparison but does not make the clinic volunteers representative of all patients.',
      'Correct. Internal allocation and external sampling answer different questions.',
      'Random allocation makes the recruitment frame nationally representative.',
      'Allocation cannot add people absent from the recruitment frame.',
      'Volunteering guarantees external validity.',
      'Self-selection may limit transport to nonvolunteers.',
    ),
    key: 'A',
    hint: 'Use “assignment” for conditions and “sampling” for populations.',
  },
  {
    id: 'q3-r2',
    kc: 'kc3',
    phase: 'repair',
    family: 'measurement-quality branch · cycle 1',
    scenario:
      'A device repeats the same wrong value, while a questionnaire repeats the same score but omits half the intended construct.',
    prompt: 'What principle applies to both?',
    options: choiceSet(
      'Consistency alone does not establish correctness or validity.',
      'Correct. Reliability/precision must be evaluated separately from accuracy and validity.',
      'Any repeated value is accurate.',
      'Systematic error can be highly repeatable.',
      'Larger samples automatically validate measures.',
      'Sample size does not repair construct mismatch or calibration bias.',
    ),
    key: 'A',
    hint: 'Repeatability and truth/construct representation are different axes.',
  },

  {
    id: 'q4-e1',
    kc: 'kc4',
    phase: 'entry',
    family: 'entry-route',
    scenario:
      'CBR-24 recruits adults for a minimal-risk behavioral intervention and collects identifiable stress data.',
    prompt: 'Which statement is correct?',
    options: choiceSet(
      'Informed consent alone makes the study ethical.',
      'Consent is central but does not replace risk minimization, fair selection, privacy, or independent review.',
      'Prospective IRB review should evaluate risks, selection, privacy, consent, and monitoring as applicable.',
      'Correct. Ethical acceptability requires multiple safeguards, not one form.',
      'Minimal risk means confidentiality protections are unnecessary.',
      'Identifiable sensitive data still require appropriate privacy and confidentiality protections.',
    ),
    key: 'B',
    hint: 'Ethics is a system of safeguards, not a single checkbox.',
  },
  {
    id: 'q4-e2',
    kc: 'kc4',
    phase: 'entry',
    family: 'entry-route',
    scenario:
      'Names are replaced by codes, but the code key is stored in the same open spreadsheet as responses.',
    prompt: 'What is the best evaluation?',
    options: choiceSet(
      'Confidentiality is fully protected because codes exist.',
      'Coding helps only if reidentification information is separately secured and access is controlled.',
      'This is anonymous data.',
      'The retained code key means data can be reidentified.',
      'Coding alone is insufficient; the key and data need access controls and separation.',
      'Correct. Confidentiality depends on practical safeguards, not labels.',
    ),
    key: 'C',
    hint: 'Ask whether someone with access can reconnect responses to identities.',
  },
  {
    id: 'q4-o',
    kc: 'kc4',
    phase: 'orient',
    family: 'CBR-24 ethics audit',
    scenario:
      'The instructor who grades the course recruits their own students and offers a large grade bonus for participation.',
    prompt: 'Which concern should be addressed first?',
    options: choiceSet(
      'Potential undue influence and compromised voluntariness.',
      'Correct. Authority and a large academic incentive may distort free choice.',
      'Whether breathing is the independent variable.',
      'Variable classification does not resolve recruitment pressure.',
      'Whether the quiz score is precise to two decimals.',
      'Measurement precision is secondary to the voluntariness concern.',
    ),
    key: 'A',
    hint: 'Consider the power relationship and whether declining is genuinely easy.',
  },
  {
    id: 'q4-a2',
    kc: 'kc4',
    phase: 'A2',
    family: 'Belmont application',
    scenario:
      'Researchers exclude non-English speakers solely because translation costs are inconvenient, though the disease affects them and safe inclusion is feasible.',
    prompt: 'Which principle is most directly implicated?',
    options: choiceSet(
      'Justice in participant selection',
      'Correct. Selection should not unfairly deny burdens or benefits without scientific or safety justification.',
      'Numerical precision',
      'This is not a measurement-resolution issue.',
      'Random assignment',
      'Assignment within a sample does not resolve unfair exclusion from the sample.',
    ),
    key: 'A',
    hint: 'Ask whether burdens and potential benefits are distributed fairly.',
  },
  {
    id: 'q4-a1',
    kc: 'kc4',
    phase: 'A1',
    family: 'privacy analogue',
    scenario:
      'A team collects sensitive interview recordings and allows every lab member unrestricted access indefinitely.',
    prompt: 'Which safeguard is most directly missing?',
    options: choiceSet(
      'A confidentiality plan with limited access, secure storage, and a retention schedule',
      'Correct. Safeguards should match the sensitivity and identifiability of the data.',
      'A larger sample',
      'Sample size does not protect participants’ information.',
      'A placebo group',
      'A comparison group is unrelated to data access protections.',
    ),
    key: 'A',
    hint: 'Match data access and retention to risk.',
  },
  {
    id: 'q4-a0',
    kc: 'kc4',
    phase: 'A0',
    family: 'integrity analogue',
    scenario:
      'A researcher deletes valid observations because they weaken the preferred conclusion and does not disclose the deletion.',
    prompt: 'What is the core integrity problem?',
    options: choiceSet(
      'Random sampling error',
      'The deletion is an intentional research practice, not chance sampling variation.',
      'Falsification through undisclosed manipulation of the research record',
      'Correct. Omitting data so the record is not accurately represented is falsification.',
      'A confidentiality breach',
      'The scenario concerns integrity of the record, not disclosure of identities.',
    ),
    key: 'B',
    hint: 'Distinguish honest error from intentional manipulation of materials, processes, or records.',
  },
  {
    id: 'q4-x0n',
    kc: 'kc4',
    phase: 'exit',
    family: 'exit A · near use',
    scenario:
      'CBR-24 stores identifiable stress scores on a public class drive and tells students participation is required for course credit.',
    prompt: 'Which evaluation is strongest?',
    options: choiceSet(
      'Only confidentiality is a concern.',
      'The scenario also threatens voluntariness.',
      'Both voluntariness and confidentiality require correction before proceeding.',
      'Correct. Multiple independent safeguards fail.',
      'No concern exists because the intervention is minimal risk.',
      'Minimal physical risk does not erase informational or coercion risks.',
    ),
    key: 'B',
    hint: 'More than one ethical safeguard can fail in the same protocol.',
  },
  {
    id: 'q4-x0c',
    kc: 'kc4',
    phase: 'exit',
    family: 'exit A · changed context',
    scenario:
      'An animal study uses 80 mice although a justified design needs 24, and no pilot or alternative method is considered.',
    prompt: 'Which 3Rs concerns are most direct?',
    options: choiceSet(
      'Only replacement',
      'Alternative methods matter, but unjustified excess animal numbers also implicate reduction.',
      'Reduction and replacement',
      'Correct. Use the fewest animals consistent with valid science and consider nonanimal alternatives.',
      'Random assignment and blinding',
      'Those improve rigor but are not the named 3Rs concerns in the scenario.',
    ),
    key: 'B',
    hint: 'Reduction concerns number; replacement concerns alternatives.',
  },
  {
    id: 'q4-x1n',
    kc: 'kc4',
    phase: 'exit',
    family: 'exit B · near replacement',
    scenario:
      'A behavioral study uses necessary deception, poses no more than minimal risk, has prior review, and plans prompt debriefing when disclosure will not cause added harm.',
    prompt: 'Which statement is most defensible?',
    options: choiceSet(
      'Deception is automatically ethical if the topic is interesting.',
      'Scientific interest alone is not sufficient.',
      'Deception can be permissible only under applicable review and waiver criteria with risk minimization and an appropriate debriefing plan.',
      'Correct. Deception is constrained, not categorically allowed or forbidden.',
      'Consent and review are never relevant when deception is used.',
      'Deception does not eliminate oversight requirements.',
    ),
    key: 'B',
    hint: 'Look for independent review, necessity, minimized risk, waiver criteria, and debriefing.',
  },
  {
    id: 'q4-x1c',
    kc: 'kc4',
    phase: 'exit',
    family: 'exit B · changed context',
    scenario:
      'A zebrafish procedure can be performed with a validated analgesic that does not compromise the scientific endpoint, but the team omits it for convenience.',
    prompt: 'Which 3R is most directly violated?',
    options: choiceSet(
      'Refinement',
      'Correct. Refinement reduces pain and distress while preserving scientific aims.',
      'Reduction',
      'The scenario concerns suffering per animal, not primarily animal count.',
      'Replacement',
      'The scenario does not identify a nonanimal alternative.',
    ),
    key: 'A',
    hint: 'Refinement changes procedures to reduce pain, distress, or lasting harm.',
  },
  {
    id: 'q4-x2n',
    kc: 'kc4',
    phase: 'exit',
    family: 'exit C · near replacement',
    scenario: 'Investigators invent three participant records to reach the target sample size.',
    prompt: 'How is this classified?',
    options: choiceSet(
      'Fabrication',
      'Correct. Data or results were made up and recorded or reported.',
      'Falsification',
      'Falsification manipulates existing materials, processes, or records; here records are invented.',
      'Plagiarism',
      'Plagiarism concerns appropriation of another person’s ideas, processes, results, or words.',
    ),
    key: 'A',
    hint: 'Fabrication creates data that never existed.',
  },
  {
    id: 'q4-x2c',
    kc: 'kc4',
    phase: 'exit',
    family: 'exit C · changed context',
    scenario:
      'A phone app records precise location continuously, although coarse neighborhood-level data would answer the research question.',
    prompt: 'Which revision best reflects risk minimization?',
    options: choiceSet(
      'Collect only the least granular location data needed and limit access and retention.',
      'Correct. Data minimization and security reduce informational risk.',
      'Collect exact location forever because more data are always scientifically better.',
      'Excess collection and retention can increase risk without necessary benefit.',
      'Publish raw coordinates without identifiers and assume anonymity.',
      'Location traces can be reidentifiable; removing names alone may be inadequate.',
    ),
    key: 'A',
    hint: 'Collect and retain only what is necessary for the stated question.',
  },
  {
    id: 'q4-r1',
    kc: 'kc4',
    phase: 'repair',
    family: 'single-safeguard branch · cycle 1',
    scenario:
      'A participant signs a form, but the protocol uses avoidable risk and unfair recruitment.',
    prompt: 'What does the signature establish?',
    options: choiceSet(
      'The entire study is ethical.',
      'Consent cannot excuse avoidable risk or unjust selection.',
      'Evidence of a consent process, but not proof that every ethical criterion is satisfied.',
      'Correct. Consent is necessary in many studies but is one part of review.',
      'That no IRB review is needed.',
      'A signature does not determine regulatory review requirements.',
    ),
    key: 'B',
    hint: 'Treat consent as one safeguard among several.',
  },
  {
    id: 'q4-r2',
    kc: 'kc4',
    phase: 'repair',
    family: 'ethics-terms branch · cycle 1',
    scenario:
      'An animal protocol can use fewer animals with adequate power and can add analgesia without compromising the endpoint.',
    prompt: 'Which paired revisions apply?',
    options: choiceSet(
      'Reduction and refinement',
      'Correct. Reduce number while preserving validity and refine to reduce pain.',
      'Replacement and random sampling',
      'No nonanimal alternative or population-sampling issue is stated.',
      'Consent and confidentiality',
      'Those human-participant safeguards do not name the animal-welfare revisions.',
    ),
    key: 'A',
    hint: 'Number maps to reduction; pain mitigation maps to refinement.',
  },

  {
    id: 'q5-e1',
    kc: 'kc5',
    phase: 'entry',
    family: 'hard-prerequisite probe',
    scenario:
      'Before randomization, more motivated CBR-24 students tend to choose breathing, and motivation predicts quiz score.',
    prompt: 'Why is motivation a causal-inference threat?',
    options: choiceSet(
      'It is a common cause of exposure choice and outcome.',
      'Correct. It can create an association even without a breathing effect.',
      'It is necessarily a mediator after breathing.',
      'The scenario places motivation before exposure choice.',
      'It makes quiz score the independent variable.',
      'The measured quiz score remains the outcome.',
    ),
    key: 'A',
    hint: 'This checks the hard prerequisite: identify the preexposure common cause.',
  },
  {
    id: 'q5-e2',
    kc: 'kc5',
    phase: 'entry',
    family: 'entry-route',
    scenario:
      'A cross-sectional survey finds that students who report more breathing practice also report less stress at the same time.',
    prompt: 'Which conclusion is warranted?',
    options: choiceSet(
      'Breathing caused lower stress.',
      'The simultaneous observational association does not establish temporality or eliminate confounding.',
      'Lower stress caused more breathing.',
      'Reverse causation is possible but not established.',
      'Breathing practice and stress are associated in this sample.',
      'Correct. This describes the observed relationship without claiming direction or causation.',
    ),
    key: 'C',
    hint: 'Describe the data first; causal direction requires additional design support.',
  },
  {
    id: 'q5-o',
    kc: 'kc5',
    phase: 'orient',
    family: 'CBR-24 results',
    scenario:
      'CBR-24 randomly assigns 240 volunteers, conceals the condition label from scorers, retains 232, and finds a 2.1-point mean difference (95% CI 0.4 to 3.8) on the immediate quiz.',
    prompt: 'Which conclusion is best?',
    options: choiceSet(
      'Assignment to paced breathing caused a higher mean immediate quiz score in this study sample, with the estimated difference shown by the interval.',
      'Correct. Random assignment, a concurrent control, temporality, and a measured difference support a bounded causal claim.',
      'Paced breathing permanently raises intelligence in all students.',
      'The population, construct, and duration all exceed the study.',
      'The confidence interval proves every individual benefited.',
      'A group mean interval does not show a uniform individual effect.',
    ),
    key: 'A',
    hint: 'A causal conclusion may be justified, but only for the assigned intervention, measured outcome, time, and study population.',
  },
  {
    id: 'q5-a2',
    kc: 'kc5',
    phase: 'A2',
    family: 'exercise trial analogue',
    scenario:
      'Adults are randomly assigned to an exercise program or usual activity. Blood pressure is measured after 12 weeks; outcome assessors are blinded.',
    prompt: 'Which feature most directly supports exchangeability of groups at baseline?',
    options: choiceSet(
      'Random assignment',
      'Correct. It tends to balance baseline causes between intervention groups.',
      'Blinded outcome assessment',
      'Blinding reduces differential measurement but does not create baseline allocation.',
      'A precise blood-pressure cuff',
      'Measurement quality matters but does not balance participant characteristics.',
    ),
    key: 'A',
    hint: 'Separate allocation, measurement, and sampling functions.',
  },
  {
    id: 'q5-a1',
    kc: 'kc5',
    phase: 'A1',
    family: 'cohort analogue',
    scenario:
      'A prospective cohort measures sleep first, then memory a year later, and adjusts for age and baseline health. Sleep is not manipulated.',
    prompt: 'Which limitation remains most important?',
    options: choiceSet(
      'Temporality is absent.',
      'Sleep precedes the later memory outcome, so temporality is present.',
      'Residual and unmeasured confounding can remain without randomized manipulation.',
      'Correct. Prospective timing and adjustment strengthen inference but do not guarantee causal exchangeability.',
      'No association can be estimated from a cohort.',
      'Cohorts can estimate associations and temporal patterns.',
    ),
    key: 'B',
    hint: 'Prospective order helps, but ask how exposure groups were formed.',
  },
  {
    id: 'q5-a0',
    kc: 'kc5',
    phase: 'A0',
    family: 'caffeine trial analogue',
    scenario:
      'Volunteers are randomly assigned caffeine or placebo; capsules look identical. At 30 minutes, mean reaction time is 238 ms with caffeine and 257 ms with placebo (mean difference −19 ms; 95% CI −31 to −7 ms). Protocol adherence is high and attrition is low.',
    prompt: 'Which claim is justified by the observed outcome?',
    options: choiceSet(
      'Assigned caffeine caused a difference in mean 30-minute reaction time in these volunteers.',
      'Correct. The claim is bounded to assignment, outcome, time, and sample.',
      'Caffeine improves every cognitive ability in every adult.',
      'The outcome, population, and individual-uniformity claims are overextended.',
      'The trial proves the biological mechanism.',
      'The design estimates an effect but does not identify an unmeasured mechanism.',
    ),
    key: 'A',
    hint: 'Match the causal claim to the actual intervention, endpoint, time, and participants.',
  },
  {
    id: 'q5-x0n',
    kc: 'kc5',
    phase: 'exit',
    family: 'exit A · near use',
    scenario:
      'CBR-24 randomly assigns volunteers to breathing or quiet sitting and has low balanced attrition. Mean immediate quiz score is 15.2/20 with breathing and 13.1/20 with quiet sitting (difference 2.1 points; 95% CI 0.4 to 3.8).',
    prompt: 'What is the strongest conclusion supported?',
    options: choiceSet(
      'Breathing assignment caused the observed difference in mean immediate quiz score in the study sample.',
      'Correct. Manipulation, random assignment, concurrent control, and temporality support a bounded effect claim.',
      'Breathing caused long-term academic success for all first-year students.',
      'Long-term success, universality, and population transport are unsupported.',
      'Breathing is associated with score, but experiments can never support causation.',
      'That is too restrictive; a well-conducted randomized experiment can support bounded causal inference.',
    ),
    key: 'A',
    hint: 'Avoid both overclaiming and the opposite error of denying all experimental causal inference.',
  },
  {
    id: 'q5-x0c',
    kc: 'kc5',
    phase: 'exit',
    family: 'exit A · changed context',
    scenario:
      'Greenhouse benches are randomly assigned shade cloth or no shade. Watering is standardized and leaf temperature is measured after one week.',
    prompt: 'Which inference is best if groups differ?',
    options: choiceSet(
      'Shade assignment caused a difference in mean one-week leaf temperature under these greenhouse conditions.',
      'Correct. The causal claim stays inside the randomized system and measured endpoint.',
      'Shade is best for every plant species in every climate.',
      'The design does not establish universal benefit or transport.',
      'The result identifies the complete physiological mechanism.',
      'An effect estimate does not by itself identify mechanism.',
    ),
    key: 'A',
    hint: 'State the treatment, outcome, time, and setting—no more and no less.',
  },
  {
    id: 'q5-x1n',
    kc: 'kc5',
    phase: 'exit',
    family: 'exit B · near replacement',
    scenario:
      'Students are randomly assigned a reminder app or no reminder. Over two weeks, mean logged study time is 43 min/day with reminders and 31 min/day without reminders (difference 12 min/day; 95% CI 4 to 20).',
    prompt: 'Which conclusion fits the design?',
    options: choiceSet(
      'Reminder assignment caused a difference in mean logged study minutes over two weeks among participants.',
      'Correct. The randomized intervention and bounded outcome support this causal statement.',
      'Reminder apps make all students more disciplined for life.',
      'Discipline and lifetime effects were not measured.',
      'Only association language is ever allowed.',
      'Randomized manipulation can justify causal language within design limits.',
    ),
    key: 'A',
    hint: 'Do not discard causal information supplied by random assignment.',
  },
  {
    id: 'q5-x1c',
    kc: 'kc5',
    phase: 'exit',
    family: 'exit B · changed context',
    scenario:
      'A cohort records phone use and mood at the same monthly survey, with no manipulation.',
    prompt: 'Which statement is safest?',
    options: choiceSet(
      'Phone use caused mood differences.',
      'No manipulation, clear temporality, or full confound control is established.',
      'Phone use and mood were associated at the measured times.',
      'Correct. Association language matches the observational evidence.',
      'Mood caused phone use.',
      'Reverse causation is possible, not proven.',
    ),
    key: 'B',
    hint: 'Simultaneous observational measures support association, not a settled causal direction.',
  },
  {
    id: 'q5-x2n',
    kc: 'kc5',
    phase: 'exit',
    family: 'exit C · near replacement',
    scenario:
      'Cell-culture wells are randomly assigned drug or vehicle under identical conditions. Mean 24-hour viability is 68% with drug and 91% with vehicle (difference −23 percentage points; 95% CI −29 to −17).',
    prompt: 'Which claim is justified?',
    options: choiceSet(
      'Drug assignment caused a difference in mean 24-hour viability in this cell system.',
      'Correct. The manipulation and randomized controlled conditions support a system-bounded effect.',
      'The drug will cure patients.',
      'A cell system does not establish patient benefit.',
      'The drug’s molecular pathway is proven.',
      'The endpoint does not identify an unmeasured pathway.',
    ),
    key: 'A',
    hint: 'Keep the claim inside the experimental system.',
  },
  {
    id: 'q5-x2c',
    kc: 'kc5',
    phase: 'exit',
    family: 'exit C · changed context',
    scenario:
      'A city compares collisions before and after a policy, while traffic volume and road construction also change. No concurrent control city is used.',
    prompt: 'What is the main inferential limit?',
    options: choiceSet(
      'The time order is unknown.',
      'The policy precedes the later period, so order is known.',
      'Concurrent changes and secular trends provide alternative explanations.',
      'Correct. A simple before–after contrast lacks control for co-occurring causes.',
      'No association can be described.',
      'A before–after difference can be described even when its cause is uncertain.',
    ),
    key: 'B',
    hint: 'Temporality alone is not enough; ask what else changed over time.',
  },
  {
    id: 'q5-r1',
    kc: 'kc5',
    phase: 'repair',
    family: 'uncertainty branch · cycle 1',
    scenario: 'Exposure and outcome are measured at the same moment in an observational survey.',
    prompt: 'Which causal requirement is especially unresolved?',
    options: choiceSet(
      'Temporality: whether the proposed cause preceded the outcome',
      'Correct. Simultaneous measurement cannot settle direction.',
      'Whether a mean can be calculated',
      'A mean may be calculable even when causal order is unclear.',
      'Whether participants signed consent',
      'Ethics matters, but it is not the stated causal-order problem.',
    ),
    key: 'A',
    hint: 'A cause must precede its effect.',
  },
  {
    id: 'q5-r2',
    kc: 'kc5',
    phase: 'repair',
    family: 'causal-overclaim branch · cycle 1',
    scenario:
      'A randomized experiment estimates an intervention effect in a narrow volunteer sample.',
    prompt: 'Which pair of statements is correct?',
    options: choiceSet(
      'Randomization can support internal causal inference; sampling and setting still bound generalization.',
      'Correct. Internal and external validity are related but distinct.',
      'Randomization proves the effect in every population.',
      'Assignment within a sample does not guarantee transport.',
      'A narrow sample makes causal inference impossible even within the trial.',
      'Limited generalizability does not automatically erase internal causal information.',
    ),
    key: 'A',
    hint: 'Separate “did it cause an effect here?” from “will it generalize there?”',
  },
];

const RECOVERY_QUESTIONS: Question[] = [
  {
    id: 'q1-fr1',
    kc: 'kc1',
    phase: 'recovery',
    family: 'fresh fading recovery 1',
    scenario:
      'A lab exposes bacterial cultures to 0 or 5 µg/mL of a compound and records colony count after 24 hours.',
    prompt: 'Which claim is testable by this study?',
    options: choiceSet(
      'The compound is universally safe.',
      'Safety across organisms and doses is not measured.',
      'Cultures exposed to 5 µg/mL will have a different mean 24-hour colony count than unexposed cultures.',
      'Correct. The comparison, outcome, and time match the protocol.',
      'The compound permanently changes every bacterial pathway.',
      'Permanence, universality, and pathway mechanisms are not measured.',
    ),
    key: 'B',
    hint: 'Keep only the two exposure conditions, colony count, and 24-hour endpoint.',
  },
  {
    id: 'q1-fr2',
    kc: 'kc1',
    phase: 'recovery',
    family: 'fresh fading recovery 2',
    scenario:
      'Adults receive a reminder or no reminder; appointment attendance during the next 30 days is recorded.',
    prompt: 'Which hypothesis is properly bounded?',
    options: choiceSet(
      'Reminders make all adults responsible.',
      'Responsibility is not operationalized and the universal claim exceeds the sample.',
      'Reminder assignment changes mean 30-day attendance in the enrolled adults.',
      'Correct. It names the assigned comparison, observed outcome, interval, and population.',
      'Reminders permanently alter motivation circuits.',
      'Neither permanence nor a neural mechanism is observed.',
    ),
    key: 'B',
    hint: 'Use the exact intervention, measure, population, and 30-day interval.',
  },
  {
    id: 'q2-fr1',
    kc: 'kc2',
    phase: 'recovery',
    family: 'fresh fading recovery 1',
    scenario:
      'Fertilizer type is randomized across pots, plant height is measured, and soil moisture is held equal.',
    prompt: 'What is soil moisture in this design?',
    options: choiceSet(
      'A controlled variable',
      'Correct. It is intentionally kept comparable across fertilizer groups.',
      'The dependent variable',
      'Plant height is the measured response.',
      'A confound merely because moisture can affect height',
      'A possible cause held equal is controlled, not an actual group-linked confound.',
    ),
    key: 'A',
    hint: 'Classify moisture by what investigators do with it here.',
  },
  {
    id: 'q2-fr2',
    kc: 'kc2',
    phase: 'recovery',
    family: 'fresh fading recovery 2',
    scenario:
      'A program improves sleep after enrollment, and improved sleep may then reduce anxiety.',
    prompt: 'What role does postprogram sleep play in the proposed pathway?',
    options: choiceSet(
      'Baseline confound',
      'The scenario places sleep after the program.',
      'Mediator',
      'Correct. It is proposed to transmit part of the program’s effect.',
      'Independent variable',
      'Program exposure is the predictor/intervention.',
    ),
    key: 'B',
    hint: 'Use temporal order: exposure → intermediate → outcome.',
  },
  {
    id: 'q3-fr1',
    kc: 'kc3',
    phase: 'recovery',
    family: 'fresh fading recovery 1',
    scenario: 'Volunteers from one hospital are randomly assigned to two treatments.',
    prompt: 'Which statement is correct?',
    options: choiceSet(
      'Assignment supports the treatment contrast but does not make one-hospital volunteers representative of all patients.',
      'Correct. Allocation and recruitment support different inferences.',
      'Random assignment creates a national probability sample.',
      'Allocation cannot add people absent from the recruitment frame.',
      'The hospital frame is irrelevant once groups are randomized.',
      'The frame still limits population transport.',
    ),
    key: 'A',
    hint: 'Sampling answers who; assignment answers which condition.',
  },
  {
    id: 'q3-fr2',
    kc: 'kc3',
    phase: 'recovery',
    family: 'fresh fading recovery 2',
    scenario: 'A meter reads 6.0, 6.0, and 6.1 for a certified value of 4.0.',
    prompt: 'Which description fits?',
    options: choiceSet(
      'Accurate but imprecise',
      'The readings cluster tightly and miss the reference.',
      'Precise but inaccurate',
      'Correct. Repeated values agree but show a systematic offset.',
      'Valid for every construct because it repeats',
      'Repeatability cannot establish every intended interpretation.',
    ),
    key: 'B',
    hint: 'Judge repeated spread separately from distance to the reference.',
  },
  {
    id: 'q4-fr1',
    kc: 'kc4',
    phase: 'recovery',
    family: 'fresh fading recovery 1',
    scenario: 'A team collects identifiable health histories that only two analysts need.',
    prompt: 'Which plan best minimizes informational risk?',
    options: choiceSet(
      'Give every staff member permanent access.',
      'Unnecessary access and retention increase risk.',
      'Limit access to authorized analysts, separate identifiers, encrypt storage, and define deletion.',
      'Correct. The safeguards match sensitivity, identifiability, and need.',
      'Call the data anonymous while retaining an open name key.',
      'A label does not prevent reidentification.',
    ),
    key: 'B',
    hint: 'Minimize collection, access, linkage, and retention.',
  },
  {
    id: 'q4-fr2',
    kc: 'kc4',
    phase: 'recovery',
    family: 'fresh fading recovery 2',
    scenario:
      'A validated analgesic can reduce animal pain without changing the scientific endpoint.',
    prompt: 'Using the analgesic primarily implements which R?',
    options: choiceSet(
      'Replacement',
      'No nonanimal method is substituted.',
      'Reduction',
      'Animal number is not the feature changed.',
      'Refinement',
      'Correct. The procedure is modified to reduce pain or distress.',
    ),
    key: 'C',
    hint: 'Refinement changes care or procedures to reduce suffering.',
  },
  {
    id: 'q5-fr1',
    kc: 'kc5',
    phase: 'recovery',
    family: 'fresh fading recovery 1',
    scenario:
      'Participants are randomly assigned intervention or control. Mean symptom score is 3.2 points lower in the intervention group after four weeks (95% CI 1.1 to 5.3 points lower).',
    prompt: 'Which conclusion fits?',
    options: choiceSet(
      'Intervention assignment caused a lower mean four-week symptom score in this trial sample.',
      'Correct. The observed effect, assigned contrast, endpoint, time, and sample are all retained.',
      'The intervention cures every patient permanently.',
      'Individual uniformity, cure, and permanence are not established.',
      'Only association language is permitted despite randomization.',
      'A preserved randomized contrast can support bounded causal language.',
    ),
    key: 'A',
    hint: 'Use the observed group difference, then bound it to this trial and endpoint.',
  },
  {
    id: 'q5-fr2',
    kc: 'kc5',
    phase: 'recovery',
    family: 'fresh fading recovery 2',
    scenario:
      'A cohort measures diet first and disease five years later, but diet is not randomized and important socioeconomic factors are incompletely measured.',
    prompt: 'Which limitation remains?',
    options: choiceSet(
      'Temporality is completely absent.',
      'Diet was measured before disease, so temporal order is present.',
      'Residual confounding can remain despite prospective timing.',
      'Correct. Timing strengthens but does not randomize the exposure contrast.',
      'No association can be estimated.',
      'A cohort can estimate an association even when causal certainty is limited.',
    ),
    key: 'B',
    hint: 'Prospective order and exchangeability are different design properties.',
  },
];

const BRANCH_REPAIR_QUESTIONS: Question[] = [
  {
    id: 'q1-r-mechanism-c1',
    kc: 'kc1',
    phase: 'repair',
    family: 'mechanism branch · cycle 1',
    scenario: 'A trial records pain ratings but no neural or biochemical measure.',
    prompt: 'Which claim stays testable?',
    options: choiceSet(
      'The treatment changes mean pain rating at the recorded time.',
      'Correct. The claim uses the observed outcome.',
      'The treatment repairs nociceptor signaling.',
      'The proposed mechanism is not measured.',
      'The treatment permanently eliminates every pain pathway.',
      'Permanence, universality, and pathway change are unobserved.',
    ),
    key: 'A',
    hint: 'Delete every mechanism noun that has no corresponding measure.',
  },
  {
    id: 'q1-r-mechanism-c2',
    kc: 'kc1',
    phase: 'repair',
    family: 'mechanism branch · cycle 2',
    scenario:
      'Investigators want to test whether a breathing routine changes quiz score through lower physiological arousal.',
    prompt: 'Which addition is needed to test the proposed pathway?',
    options: choiceSet(
      'A measure of arousal collected at an appropriate point after assignment',
      'Correct. The mediator must be observed with defensible timing.',
      'A broader claim about intelligence',
      'Broader language does not measure the pathway.',
      'A second unmeasured neural explanation',
      'Adding another explanation does not make either testable.',
    ),
    key: 'A',
    hint: 'A mechanism claim needs a measured intermediate, not only an outcome.',
  },
  {
    id: 'q1-r-scope-c1',
    kc: 'kc1',
    phase: 'repair',
    family: 'scope branch · cycle 1',
    scenario: 'A study compares two assigned routines and records one outcome after seven days.',
    prompt: 'Which four slots make the claim testable?',
    options: choiceSet(
      'Value, popularity, permanence, mechanism',
      'Those slots can remain undefined or unmeasured.',
      'Population, comparison, outcome, time',
      'Correct. These slots bind the claim to observable study features.',
      'Author, journal, sample size, p value',
      'Those details do not substitute for the tested variables and scope.',
    ),
    key: 'B',
    hint: 'Who, compared with what, measured how, and when?',
  },
  {
    id: 'q1-r-uncertainty-c2',
    kc: 'kc1',
    phase: 'repair',
    family: 'uncertainty branch · cycle 2',
    scenario: 'A study records immediate recall after silence or music.',
    prompt: 'Which statement is a value claim rather than the study hypothesis?',
    options: choiceSet(
      'Music is morally better than silence.',
      'Correct. “Morally better” has no empirical decision rule here.',
      'Mean immediate recall differs between assigned conditions.',
      'This is an observable nondirectional hypothesis.',
      'Music assignment raises mean immediate recall.',
      'This is a directional hypothesis the data can evaluate.',
    ),
    key: 'A',
    hint: 'Look for language that cannot be supported or challenged by the recorded outcome.',
  },
  {
    id: 'q2-r-roles-c1',
    kc: 'kc2',
    phase: 'repair',
    family: 'variable-roles branch · cycle 1',
    scenario:
      'Cultures receive 0 or 10 mg/L nutrient; growth is measured while temperature is held constant.',
    prompt: 'Which role assignment is correct?',
    options: choiceSet(
      'Nutrient = independent; growth = dependent; temperature = controlled',
      'Correct. The varied, measured, and held-constant factors are distinct.',
      'Growth = independent; temperature = dependent',
      'The measured response and control are misclassified.',
      'Temperature = confound because it can affect growth',
      'It is held constant rather than linked systematically to treatment.',
    ),
    key: 'A',
    hint: 'Ask: varied, measured, or held constant?',
  },
  {
    id: 'q2-r-roles-c2',
    kc: 'kc2',
    phase: 'repair',
    family: 'variable-roles branch · cycle 2',
    scenario:
      'Room lighting can affect vigilance, but both treatment groups are tested under the same lighting schedule.',
    prompt: 'What is lighting in this design?',
    options: choiceSet(
      'An actual confound because it could affect the outcome',
      'Potential influence alone is insufficient when it does not differ by group.',
      'A controlled variable',
      'Correct. Investigators deliberately keep it comparable.',
      'The dependent variable',
      'Vigilance is the measured response.',
    ),
    key: 'B',
    hint: 'Classify the factor by its implemented role, not its general biological relevance.',
  },
  {
    id: 'q2-r-uncertainty-c1',
    kc: 'kc2',
    phase: 'repair',
    family: 'uncertainty branch · cycle 1',
    scenario: 'Baseline workload predicts program enrollment and later stress.',
    prompt: 'Which arrow pattern fits?',
    options: choiceSet(
      'Program → workload → stress',
      'That would make workload a postexposure mediator.',
      'Workload → program and workload → stress',
      'Correct. A preexposure common cause is a confound.',
      'Stress → program only',
      'This omits the stated common cause.',
    ),
    key: 'B',
    hint: 'Place the baseline factor before both exposure and outcome.',
  },
  {
    id: 'q2-r-uncertainty-c2',
    kc: 'kc2',
    phase: 'repair',
    family: 'uncertainty branch · cycle 2',
    scenario:
      'A trial varies temperature, measures reaction rate, holds pH equal, and accidentally uses different instruments by temperature group.',
    prompt: 'Which classification is complete?',
    options: choiceSet(
      'Temperature independent; rate dependent; pH controlled; instrument confounded with temperature',
      'Correct. Each factor is classified by its role in this protocol.',
      'Every factor is an independent variable',
      'Only temperature is intentionally varied.',
      'Instrument is controlled because investigators recorded its name',
      'Recording a difference does not make it comparable across groups.',
    ),
    key: 'A',
    hint: 'Separate intended variation, measured response, held constant factor, and group-linked alternative.',
  },
  {
    id: 'q3-r-sampling-c2',
    kc: 'kc3',
    phase: 'repair',
    family: 'sampling-assignment branch · cycle 2',
    scenario: 'One clinic recruits volunteers, then randomly assigns them to treatment.',
    prompt: 'Which inference is strengthened by assignment?',
    options: choiceSet(
      'The treatment comparison within the recruited volunteers',
      'Correct. Assignment supports internal group comparability.',
      'Representativeness of every patient nationally',
      'Assignment does not alter the recruitment frame.',
      'Accuracy of every instrument',
      'Allocation does not calibrate measurement.',
    ),
    key: 'A',
    hint: 'Assignment acts after recruitment.',
  },
  {
    id: 'q3-r-quality-c2',
    kc: 'kc3',
    phase: 'repair',
    family: 'measurement-quality branch · cycle 2',
    scenario:
      'A questionnaire repeats the same score but asks only about energy while being interpreted as complete depression severity.',
    prompt: 'Which description fits?',
    options: choiceSet(
      'Reliable with limited content or construct validity',
      'Correct. Consistency does not prove adequate construct coverage.',
      'Valid because it repeats',
      'Reliability alone is insufficient for validity.',
      'Inaccurate only because it lacks decimals',
      'Decimal display is not the relevant issue.',
    ),
    key: 'A',
    hint: 'Judge consistency separately from the intended interpretation.',
  },
  {
    id: 'q3-r-uncertainty-c1',
    kc: 'kc3',
    phase: 'repair',
    family: 'uncertainty branch · cycle 1',
    scenario:
      'A probability sample is selected, but only 30% respond and respondents differ in age from nonrespondents.',
    prompt: 'Which concern remains?',
    options: choiceSet(
      'Differential nonresponse can limit representativeness.',
      'Correct. Random selection does not guarantee representative participation.',
      'The survey requires treatment randomization.',
      'A descriptive survey need not assign treatment.',
      'No estimate can be computed.',
      'An estimate can be computed even when transport is limited.',
    ),
    key: 'A',
    hint: 'Separate selection into the sample from response after selection.',
  },
  {
    id: 'q3-r-uncertainty-c2',
    kc: 'kc3',
    phase: 'repair',
    family: 'uncertainty branch · cycle 2',
    scenario: 'Repeated readings cluster tightly 3 units above a certified reference.',
    prompt: 'Which pair of properties applies?',
    options: choiceSet(
      'High precision, low accuracy',
      'Correct. Agreement is high while reference closeness is poor.',
      'Low precision, high accuracy',
      'The readings are not dispersed around the reference.',
      'High validity for every use',
      'Calibration consistency cannot establish every interpretation.',
    ),
    key: 'A',
    hint: 'Use one axis for repeated spread and one for reference error.',
  },
  {
    id: 'q4-r-safeguard-c2',
    kc: 'kc4',
    phase: 'repair',
    family: 'single-safeguard branch · cycle 2',
    scenario: 'Participants sign consent, but recruitment is coercive and avoidable risks remain.',
    prompt: 'Which conclusion is correct?',
    options: choiceSet(
      'The signature makes the full protocol ethical.',
      'Consent cannot compensate for coercion or avoidable risk.',
      'Consent is one safeguard; voluntariness and risk minimization still require correction.',
      'Correct. Ethical criteria are noncompensatory protocol checks.',
      'IRB review is unnecessary after signature.',
      'A signature does not determine oversight requirements.',
    ),
    key: 'B',
    hint: 'Audit each protection independently.',
  },
  {
    id: 'q4-r-terms-c2',
    kc: 'kc4',
    phase: 'repair',
    family: 'ethics-terms branch · cycle 2',
    scenario:
      'Researchers privately collect identifiable interviews, then leave the files accessible to unauthorized staff.',
    prompt: 'Which distinction is correct?',
    options: choiceSet(
      'Collection context concerns privacy; unauthorized disclosure concerns confidentiality.',
      'Correct. Access/collection and protection after collection are related but distinct.',
      'Both issues are random assignment.',
      'Assignment does not address information handling.',
      'Neither matters after consent.',
      'Consent does not waive all privacy or confidentiality protections.',
    ),
    key: 'A',
    hint: 'Privacy concerns access to the person; confidentiality concerns protection of collected information.',
  },
  {
    id: 'q4-r-uncertainty-c1',
    kc: 'kc4',
    phase: 'repair',
    family: 'uncertainty branch · cycle 1',
    scenario:
      'A study can answer its question using neighborhood rather than exact GPS coordinates.',
    prompt: 'Which action best minimizes risk?',
    options: choiceSet(
      'Collect exact coordinates indefinitely.',
      'Unnecessary granularity and retention increase informational risk.',
      'Collect the least granular necessary location and limit access and retention.',
      'Correct. Data minimization directly reduces risk.',
      'Publish coordinates after removing names.',
      'Location traces can remain reidentifiable.',
    ),
    key: 'B',
    hint: 'Use only the information necessary for the stated question.',
  },
  {
    id: 'q4-r-uncertainty-c2',
    kc: 'kc4',
    phase: 'repair',
    family: 'uncertainty branch · cycle 2',
    scenario: 'A researcher invents observations that never occurred.',
    prompt: 'How is this classified?',
    options: choiceSet(
      'Fabrication',
      'Correct. Data or results were made up.',
      'Falsification',
      'Falsification manipulates existing materials, processes, or records.',
      'Honest error',
      'The scenario describes intentional invention, not an error.',
    ),
    key: 'A',
    hint: 'Fabrication creates a research record from nonexistent data.',
  },
  {
    id: 'q5-r-overclaim-c2',
    kc: 'kc5',
    phase: 'repair',
    family: 'causal-overclaim branch · cycle 2',
    scenario:
      'A randomized trial finds a lower mean 8-week symptom score in one narrow volunteer sample.',
    prompt: 'Which conclusion is bounded correctly?',
    options: choiceSet(
      'Assignment caused a lower mean 8-week symptom score in this trial sample.',
      'Correct. The claim preserves intervention, endpoint, time, and sample.',
      'The intervention permanently cures every patient.',
      'Permanence, cure, uniformity, and transport are unsupported.',
      'The molecular mechanism is proven.',
      'An effect estimate does not identify an unmeasured pathway.',
    ),
    key: 'A',
    hint: 'Retain every design boundary in the causal sentence.',
  },
  {
    id: 'q5-r-underclaim-c1',
    kc: 'kc5',
    phase: 'repair',
    family: 'causal-underclaim branch · cycle 1',
    scenario:
      'Wells are randomly assigned drug or vehicle under identical conditions, then viability differs at 24 hours.',
    prompt: 'Which language is justified?',
    options: choiceSet(
      'Only association language is ever allowed.',
      'This discards randomized manipulation and control.',
      'Drug assignment caused a difference in mean 24-hour viability in this cell system.',
      'Correct. The claim is causal and system-bounded.',
      'The drug cures patients.',
      'The cell system does not establish patient benefit.',
    ),
    key: 'B',
    hint: 'Randomized manipulation can support a bounded causal effect.',
  },
  {
    id: 'q5-r-underclaim-c2',
    kc: 'kc5',
    phase: 'repair',
    family: 'causal-underclaim branch · cycle 2',
    scenario:
      'Greenhouse benches are randomly assigned shade or no shade; leaf temperature differs after one week.',
    prompt: 'Which statement avoids underclaiming?',
    options: choiceSet(
      'Shade assignment caused a mean one-week leaf-temperature difference under these greenhouse conditions.',
      'Correct. Randomized control supports this bounded causal claim.',
      'Shade and temperature were merely associated because causation is never inferable.',
      'That rule ignores the experiment.',
      'Shade benefits every species in every climate.',
      'That overextends population and outcome scope.',
    ),
    key: 'A',
    hint: 'Use causal language inside the randomized experimental system.',
  },
  {
    id: 'q5-r-uncertainty-c2',
    kc: 'kc5',
    phase: 'repair',
    family: 'uncertainty branch · cycle 2',
    scenario:
      'A report states that exposure preceded outcome but gives no information about assignment, comparison, attrition, or measurement.',
    prompt: 'What is the best next step?',
    options: choiceSet(
      'Declare causation from temporality alone.',
      'Time order is necessary but not sufficient.',
      'Audit manipulation, assignment, control, attrition, measurement, and alternative explanations.',
      'Correct. Causal strength depends on the full design.',
      'Declare no association can exist.',
      'Missing causal support does not prevent describing an observed association.',
    ),
    key: 'B',
    hint: 'Temporality is one checkpoint in a larger causal audit.',
  },
];

const ROUTE_CONFIRM_QUESTIONS: Question[] = [
  {
    id: 'q1-route-scope-confirm',
    kc: 'kc1',
    phase: 'repair',
    family: 'misconception route confirmation',
    scenario: 'A trial measures immediate attention after one assigned study break.',
    prompt: 'Which claim preserves the revised scope rule?',
    options: choiceSet(
      'The break permanently improves every learning ability.',
      'The claim exceeds outcome, time, and population.',
      'Break assignment changes mean immediate attention in these participants.',
      'Correct. Every claim element maps to the protocol.',
      'The break repairs an unmeasured neural circuit.',
      'The mechanism is not measured.',
    ),
    key: 'B',
    hint: 'Copy the assigned comparison, outcome, population, and time.',
  },
  {
    id: 'q2-route-control-confirm',
    kc: 'kc2',
    phase: 'repair',
    family: 'misconception route confirmation',
    scenario:
      'Both treatment groups use the same room temperature, even though temperature can affect the outcome.',
    prompt: 'How should temperature be classified here?',
    options: choiceSet(
      'Controlled variable',
      'Correct. It is deliberately held comparable.',
      'Actual confound',
      'It does not differ systematically by treatment.',
      'Dependent variable',
      'It is not the measured response.',
    ),
    key: 'A',
    hint: 'Potential influence is not the same as implemented confounding.',
  },
  {
    id: 'q4-route-safeguard-confirm',
    kc: 'kc4',
    phase: 'repair',
    family: 'misconception route confirmation',
    scenario: 'A participant signs consent, but identifiable data remain publicly accessible.',
    prompt: 'Which judgment applies?',
    options: choiceSet(
      'Consent makes the public storage acceptable.',
      'One safeguard cannot compensate for failed confidentiality.',
      'Confidentiality still requires correction despite consent.',
      'Correct. Ethical safeguards are evaluated independently.',
      'Minimal physical risk removes information risk.',
      'Informational harm remains possible.',
    ),
    key: 'B',
    hint: 'A signed form does not replace every other protection.',
  },
  {
    id: 'q5-route-confound-confirm',
    kc: 'kc5',
    phase: 'repair',
    family: 'hard-prerequisite bridge confirmation',
    scenario: 'Baseline motivation predicts choosing a study app and later quiz score.',
    prompt: 'Why does motivation threaten the causal comparison?',
    options: choiceSet(
      'It is a preexposure common cause of exposure and outcome.',
      'Correct. It can generate an alternative explanation.',
      'It is necessarily caused by the app.',
      'The scenario places motivation before app choice.',
      'It makes quiz score the independent variable.',
      'Quiz score remains the outcome.',
    ),
    key: 'A',
    hint: 'Draw arrows from motivation to both app choice and score.',
  },
];

const ALL_QUESTIONS = [
  ...QUESTIONS,
  ...RECOVERY_QUESTIONS,
  ...BRANCH_REPAIR_QUESTIONS,
  ...ROUTE_CONFIRM_QUESTIONS,
];

const KCS: Record<KcKey, KcContent> = {
  kc1: {
    key: 'kc1',
    id: 'V3-KC-231348',
    label: 'Form testable questions and hypotheses',
    canonicalStatement:
      'Use theory, prior findings, and observations to distinguish testable research questions and hypotheses from claims a described study cannot test.',
    competence:
      'Use theory, prior findings, and observations to distinguish testable research questions and hypotheses from claims a described study cannot test.',
    scope:
      'Operational comparison, observable outcome, direction when justified, bounded population/time, and claims excluded by missing measures.',
    duration: '12 min standard · 8 min concise',
    entryIds: ['q1-e1', 'q1-e2'],
    orientId: 'q1-o',
    a2Id: 'q1-a2',
    a1Id: 'q1-a1',
    a0Id: 'q1-a0',
    exitIds: [
      { near: 'q1-x0n', changed: 'q1-x0c' },
      { near: 'q1-x1n', changed: 'q1-x1c' },
      { near: 'q1-x2n', changed: 'q1-x2c' },
    ],
    repairIds: {
      scope: ['q1-r-scope-c1', 'q1-r2'],
      mechanism: ['q1-r-mechanism-c1', 'q1-r-mechanism-c2'],
      uncertainty: ['q1-r1', 'q1-r-uncertainty-c2'],
    },
    recoveryIds: ['q1-fr1', 'q1-fr2'],
    model: [
      'A question is testable when the study can produce an observation that would count for or against an answer. Match four parts: who, what is compared, what is measured, and when.',
      'A hypothesis is a proposed answer to that question. It may predict a direction or simply a difference, but every important word must map to something the study assigns or records.',
      'Tempting claims usually fail by stretching beyond the evidence. “Permanent,” “all students,” and a brain mechanism do not belong in the CBR-24 claim because this study measures one immediate quiz score in one volunteer sample.',
    ],
    expert: [
      {
        label: '1 · Notice',
        text: 'CBR-24 assigns paced breathing or quiet sitting and records the next quiz score.',
      },
      {
        label: '2 · Match the parts',
        text: 'Who: course volunteers. Comparison: assigned routines. Outcome: mean immediate quiz score. Time: the next quiz.',
      },
      {
        label: '3 · Write the claim',
        text: 'Assignment to paced breathing changes mean immediate quiz score relative to quiet sitting in this volunteer sample.',
      },
      {
        label: '4 · Reject the tempting version',
        text: '“Permanently improves intelligence” fails because neither permanence nor intelligence is measured.',
      },
    ],
    contrasts: [
      {
        case: 'Testable',
        decision:
          'Assignment to breathing changes mean immediate quiz score relative to quiet sitting.',
      },
      { case: 'Too broad', decision: 'Breathing makes all students successful.' },
      {
        case: 'Mechanism mismatch',
        decision: 'Breathing changes amygdala activity when no neural measure exists.',
      },
      {
        case: 'Valid nondirectional form',
        decision: 'Mean scores differ between assigned routines.',
      },
    ],
    handoff:
      'In this rehearsal, the testability decisions are complete. Next, inspect variable roles and alternative causes.',
  },
  kc2: {
    key: 'kc2',
    id: 'V3-KC-136063',
    label: 'Identify variables, controls, and confounds',
    canonicalStatement:
      'Identify independent, dependent, control, and confounding variables and predict how they affect interpretation.',
    competence:
      'Identify independent, dependent, control, and confounding variables and predict how they affect interpretation.',
    scope:
      'Roles depend on the described study; distinguish controlled variables, confounds, and mediators; separate potential from actual confounding.',
    duration: '12 min standard · 8 min concise',
    entryIds: ['q2-e1', 'q2-e2'],
    orientId: 'q2-o',
    a2Id: 'q2-a2',
    a1Id: 'q2-a1',
    a0Id: 'q2-a0',
    exitIds: [
      { near: 'q2-x0n', changed: 'q2-x0c' },
      { near: 'q2-x1n', changed: 'q2-x1c' },
      { near: 'q2-x2n', changed: 'q2-x2c' },
    ],
    repairIds: {
      roles: ['q2-r-roles-c1', 'q2-r-roles-c2'],
      'common-cause': ['q2-r1', 'q2-r2'],
      uncertainty: ['q2-r-uncertainty-c1', 'q2-r-uncertainty-c2'],
    },
    recoveryIds: ['q2-fr1', 'q2-fr2'],
    model: [
      'Name a variable by what the study does with it. Ask in order: Was it varied? Was it measured as the response? Was it deliberately kept the same?',
      'A confound must do two jobs: differ with the comparison groups and plausibly affect the outcome. A variable that could affect a score is not automatically a confound if it is held constant or balanced.',
      'Timing separates a confound from a mediator. A confound is already present before the exposure comparison; a mediator happens after the exposure and may carry part of its effect.',
    ],
    expert: [
      {
        label: '1 · Start with actions',
        text: 'CBR-24 varies the assigned routine, measures immediate quiz score, and keeps quiz version, room, and preparation time the same.',
      },
      {
        label: '2 · Check the competing cause',
        text: 'Under self-selection, motivation can influence routine choice and quiz performance, so it differs with exposure and can affect outcome.',
      },
      {
        label: '3 · Classify',
        text: 'Routine is the independent variable, score is the dependent variable, shared procedures are controls, and motivation is a confound in the self-selected design.',
      },
      {
        label: '4 · Fix the tempting error',
        text: 'Do not call every score-related factor a confound. Random assignment and consistent procedures can keep such factors from tracking one group.',
      },
    ],
    contrasts: [
      { case: 'Control', decision: 'Quiz version is held identical across CBR-24 groups.' },
      {
        case: 'Confound',
        decision: 'All breathing sessions occur in the morning and all controls in the evening.',
      },
      { case: 'Mediator', decision: 'The routine changes sleep, which then changes stress.' },
      {
        case: 'Not enough',
        decision:
          'A variable can affect score but is not an actual confound if it does not differ systematically by group.',
      },
    ],
    handoff:
      'In this rehearsal, CBR-24 has defined variable roles and controls. Next, inspect population transport and measure quality.',
  },
  kc3: {
    key: 'kc3',
    id: 'V3-KC-678042',
    label: 'Evaluate sampling and measurement quality',
    canonicalStatement:
      'Judge sample-to-population generalization and the appropriateness, precision, accuracy, reliability, or validity of a measurement.',
    competence:
      'Evaluate sampling methods, generalizability, and measurement quality using accuracy, precision, reliability, and validity.',
    scope:
      'Separate sampling from assignment; distinguish target population, frame, nonresponse, and transport; keep measurement-quality terms noninterchangeable.',
    duration: '12 min standard · 8 min concise',
    entryIds: ['q3-e1', 'q3-e2'],
    orientId: 'q3-o',
    a2Id: 'q3-a2',
    a1Id: 'q3-a1',
    a0Id: 'q3-a0',
    exitIds: [
      { near: 'q3-x0n', changed: 'q3-x0c' },
      { near: 'q3-x1n', changed: 'q3-x1c' },
      { near: 'q3-x2n', changed: 'q3-x2c' },
    ],
    repairIds: {
      'sampling-assignment': ['q3-r1', 'q3-r-sampling-c2'],
      'quality-terms': ['q3-r2', 'q3-r-quality-c2'],
      uncertainty: ['q3-r-uncertainty-c1', 'q3-r-uncertainty-c2'],
    },
    recoveryIds: ['q3-fr1', 'q3-fr2'],
    model: [
      'Separate two questions. Sampling asks who entered the study; assignment asks which condition those participants received. Good assignment can support a fair comparison without making the sample representative.',
      'Judge a measure on separate axes. Accuracy is closeness to a reference, precision is clustering across readings, reliability is consistency, and validity asks whether the score really supports the intended meaning.',
      'A large sample can still be narrow or biased. CBR-24’s one-course volunteers may give a precise estimate for this sample while leaving uncertainty about other campuses, ages, or settings.',
    ],
    expert: [
      {
        label: '1 · Inspect recruitment',
        text: 'CBR-24 recruits volunteers from one course at one commuter campus, then randomly assigns those volunteers.',
      },
      {
        label: '2 · Separate the decisions',
        text: 'Random assignment strengthens the breathing-versus-sitting comparison inside the sample; it does not turn one course into all first-year students.',
      },
      {
        label: '3 · Inspect measurement',
        text: 'Pulse readings of 80, 80, and 81 against a reference of 72 are tightly clustered but systematically high: precise, not accurate.',
      },
      {
        label: '4 · Reject the tempting shortcut',
        text: 'Neither random assignment nor a large sample, by itself, proves broad generalizability or valid measurement.',
      },
    ],
    contrasts: [
      {
        case: 'Precise, inaccurate',
        decision: 'Readings cluster tightly around a value 8 beats/min above reference.',
      },
      {
        case: 'Accurate on average, imprecise',
        decision: 'Repeated readings scatter widely around the reference.',
      },
      {
        case: 'Reliable, weak validity',
        decision: 'A score repeats but captures familiarity instead of stress.',
      },
      {
        case: 'Internal versus external',
        decision:
          'Random assignment balances groups; representative sampling supports population inference.',
      },
    ],
    handoff:
      'In this rehearsal, internal comparison, sampling, and measurement limits are separated. Next, audit participant protection and research integrity.',
  },
  kc4: {
    key: 'kc4',
    id: 'V3-KC-965248',
    label: 'Evaluate research ethics',
    canonicalStatement:
      'Evaluate whether a described study respects stated participant or animal protections, privacy where applicable, scientific integrity, and bounded research-consumer interests.',
    competence:
      'Evaluate human and animal research using consent, risk–benefit, justice, privacy, welfare, oversight, and research-integrity principles.',
    scope:
      'Apply principles to described decisions; distinguish privacy/confidentiality, consent/review, the 3Rs, and fabrication/falsification/plagiarism without teaching legal practice.',
    duration: '12 min standard · 8 min concise',
    entryIds: ['q4-e1', 'q4-e2'],
    orientId: 'q4-o',
    a2Id: 'q4-a2',
    a1Id: 'q4-a1',
    a0Id: 'q4-a0',
    exitIds: [
      { near: 'q4-x0n', changed: 'q4-x0c' },
      { near: 'q4-x1n', changed: 'q4-x1c' },
      { near: 'q4-x2n', changed: 'q4-x2c' },
    ],
    repairIds: {
      'single-safeguard': ['q4-r1', 'q4-r-safeguard-c2'],
      terms: ['q4-r2', 'q4-r-terms-c2'],
      uncertainty: ['q4-r-uncertainty-c1', 'q4-r-uncertainty-c2'],
    },
    recoveryIds: ['q4-fr1', 'q4-fr2'],
    model: [
      'Follow the participant through the study. At each step ask who could be pressured or harmed, then choose the safeguard that directly reduces that risk.',
      'For people, check voluntary consent, fair selection, proportionate risk and benefit, privacy, confidentiality, and independent review separately. One safeguard cannot make up for a failure somewhere else.',
      'Useful distinctions prevent tempting errors: privacy concerns access to people or information; confidentiality concerns protecting information already collected. A signed consent form does not, by itself, secure data or remove instructor pressure.',
    ],
    expert: [
      {
        label: '1 · Follow the participant',
        text: 'The instructor recruits their own students, offers a large grade benefit, and collects identifiable stress data.',
      },
      {
        label: '2 · Name each risk',
        text: 'Instructor power and the incentive can undermine voluntariness; identifiable stress data create a disclosure risk.',
      },
      {
        label: '3 · Match safeguards',
        text: 'Use neutral recruitment and an equivalent alternative, collect only needed identifiers, separate the key, limit access, and define deletion.',
      },
      {
        label: '4 · Reject the tempting shortcut',
        text: 'A signature or minimal-risk label does not replace the rest of the ethics review; the complete protocol needs prospective review.',
      },
    ],
    contrasts: [
      { case: 'Privacy', decision: 'Whether and how personal information or contact is accessed.' },
      {
        case: 'Confidentiality',
        decision: 'How information already collected is protected from disclosure.',
      },
      { case: 'Fabrication', decision: 'Making up data or results.' },
      {
        case: 'Falsification',
        decision: 'Manipulating or omitting so the research record is not accurately represented.',
      },
    ],
    handoff:
      'In this rehearsal, CBR-24 has a reviewable ethics plan. The final KC integrates question, design, measurement, and ethics to bound the conclusion.',
  },
  kc5: {
    key: 'kc5',
    id: 'V3-KC-388302',
    label: 'Bound causal inference by design',
    canonicalStatement:
      'Determine whether temporality, manipulation, assignment, control, and stated limitations support association or causal inference.',
    competence:
      'Distinguish association from causation and bound causal claims using temporality, manipulation, random assignment, controls, blinding, and plausible alternative explanations.',
    scope:
      'Avoid both causal overclaiming and the false rule that experiments can never support causation; separate internal causal inference, mechanisms, individual effects, and generalization.',
    duration: '12 min standard · 8 min concise',
    entryIds: ['q5-e1', 'q5-e2'],
    orientId: 'q5-o',
    a2Id: 'q5-a2',
    a1Id: 'q5-a1',
    a0Id: 'q5-a0',
    exitIds: [
      { near: 'q5-x0n', changed: 'q5-x0c' },
      { near: 'q5-x1n', changed: 'q5-x1c' },
      { near: 'q5-x2n', changed: 'q5-x2c' },
    ],
    repairIds: {
      overclaim: ['q5-r2', 'q5-r-overclaim-c2'],
      underclaim: ['q5-r-underclaim-c1', 'q5-r-underclaim-c2'],
      uncertainty: ['q5-r1', 'q5-r-uncertainty-c2'],
    },
    recoveryIds: ['q5-fr1', 'q5-fr2'],
    model: [
      'Causal language is warranted when the proposed cause comes first and the design makes major alternative explanations less plausible. Then keep every noun in the conclusion inside the study’s actual bounds.',
      'In CBR-24, manipulation, random assignment, a concurrent comparison, consistent procedures, scorer blinding, and low balanced attrition support a bounded causal contrast for the assigned routine and immediate quiz score.',
      'Two tempting extremes fail. “Correlation only” ignores the randomized experiment, while “breathing helps everyone permanently” exceeds the sample, average outcome, time, and unmeasured mechanism.',
    ],
    expert: [
      {
        label: '1 · Audit the design',
        text: 'CBR-24 assigns the routine at random, uses a concurrent quiet-sitting group, blinds scorers, and has low balanced attrition.',
      },
      {
        label: '2 · Read the result',
        text: 'Among 116 analyzed per group, mean score is 15.2 versus 13.1; the mean difference is 2.1 points with a reported 95% interval of 0.4 to 3.8.',
      },
      {
        label: '3 · State the warrant',
        text: 'Assignment to paced breathing caused a higher mean immediate quiz score in this randomized volunteer sample.',
      },
      {
        label: '4 · State the limits',
        text: 'The study does not establish permanent intelligence change, benefit for every person, a neural mechanism, or automatic transport to all students.',
      },
    ],
    contrasts: [
      {
        case: 'Cross-sectional association',
        decision: 'Report variables as associated; direction and confounding remain unresolved.',
      },
      {
        case: 'Prospective cohort',
        decision: 'Temporality improves, but unmeasured confounding can remain.',
      },
      {
        case: 'Randomized controlled experiment',
        decision:
          'Can support a bounded causal effect if conduct and analysis preserve the comparison.',
      },
      {
        case: 'Mechanism claim',
        decision: 'Requires measures or interventions that distinguish the proposed pathway.',
      },
    ],
    handoff:
      'The internal rehearsal has exercised all five KC flows. This simulated exit is not instruction evidence, mastery, readiness, or capstone completion.',
  },
};

const KC_ORDER: KcKey[] = ['kc1', 'kc2', 'kc3', 'kc4', 'kc5'];

const LEARNER_KC_COPY: Record<
  KcKey,
  {
    title: string;
    focus: string;
    handoff: string;
    activeStages: number[];
  }
> = {
  kc1: {
    title: 'Ask a testable question',
    focus:
      'Inspect the research question: does every claim word match something CBR-24 can assign or measure?',
    handoff:
      'You bounded the question. Next, identify what the study changes, measures, and keeps comparable.',
    activeStages: [0],
  },
  kc2: {
    title: 'Let’s identify the variables',
    focus:
      'Inspect assignment, variables, and controls: what changes, what is measured, and what competing cause could differ by group?',
    handoff:
      'You mapped the variables and competing causes. Next, separate the sample from the quality of its measures.',
    activeStages: [1, 2],
  },
  kc3: {
    title: 'Judge the sample and measures',
    focus:
      'Inspect who entered CBR-24 and how each outcome was measured; assignment and recruitment answer different questions.',
    handoff:
      'You separated internal comparison, population limits, and measurement quality. Next, follow the participant through the protocol.',
    activeStages: [1, 2],
  },
  kc4: {
    title: 'Protect participants and data',
    focus:
      'Inspect the participant path: recruitment, choice, data collection, access, and storage each need the right safeguard.',
    handoff:
      'You matched risks to safeguards. Now combine the full design and result into a conclusion that stays inside the evidence.',
    activeStages: [1, 2],
  },
  kc5: {
    title: 'What can this design support?',
    focus:
      'Inspect the observed group difference, then ask what the assignment supports and which sample, outcome, and time limits remain.',
    handoff: 'You followed CBR-24 from a testable question to a bounded conclusion.',
    activeStages: [3, 4],
  },
};

const CBR24_FLOW = [
  {
    title: 'Research question',
    summary:
      'Does assignment to paced breathing rather than quiet sitting change mean immediate quiz score?',
  },
  {
    title: 'Sample & assignment',
    summary:
      '240 volunteers from one commuter-campus course are randomly assigned 120 per routine.',
  },
  {
    title: 'Variables & measurement',
    summary:
      'Assigned routine is compared; immediate quiz score is measured; quiz, room, and preparation time are kept comparable.',
  },
  {
    title: 'Observed result',
    summary:
      '116 per group are analyzed. Mean scores are 15.2 and 13.1, a 2.1-point difference with a reported 95% interval from 0.4 to 3.8.',
  },
  {
    title: 'Inference & limits',
    summary:
      'The randomized comparison supports a bounded causal effect on mean immediate score in this volunteer sample—not permanence, a mechanism, or automatic generalization.',
  },
] as const;

function learnerScreenLabel(kc: KcKey, screen: string): string {
  const exit = parseExitCheckpoint(screen);
  if (exit)
    return exit.kind === 'near' ? 'On your own · question 1 of 2' : 'On your own · question 2 of 2';
  if (parseRepairCheckpoint(screen)) return 'Review the decision rule';
  const labels: Record<string, string> = {
    'entry-1': 'Starting point · question 1 of 2',
    'entry-2': 'Starting point · question 2 of 2',
    route: 'Focus now',
    'misconception-model': 'Replace a tempting rule',
    'misconception-contrast': 'Worked contrast',
    'misconception-confirm': 'Try the corrected rule',
    'prerequisite-bridge': 'One idea first',
    'prerequisite-confirm': 'Try the common-cause rule',
    orient: 'Try the rule together',
    model: 'Decision rule',
    worked: 'Worked CBR-24 example',
    a2: 'Practice with support',
    a1: 'Practice with one cue',
    a0: 'On your own',
    'fade-recovery-1': 'Fresh supported example',
    'fade-recovery-2': 'One more supported example',
    contrast: 'Why tempting answers fail',
    handoff: kc === 'kc5' ? 'Study complete' : 'Ready for the next focus',
    pause: 'Pause and review',
    'simulation-complete': 'Lesson complete',
  };
  return labels[screen] ?? 'Continue the study';
}

function learnerQuestionLabel(question: Question): string {
  if (question.phase === 'entry') return 'Starting-point check';
  if (question.phase === 'A0' || question.phase === 'exit') return 'On your own';
  if (question.phase === 'repair' || question.phase === 'recovery') return 'Fresh example';
  return 'Apply the decision rule';
}

const SCREEN_DEFS = [
  { id: 'entry-1', label: 'Entry probe 1', phase: 'Route', duration: '0.5 min' },
  { id: 'entry-2', label: 'Entry probe 2', phase: 'Route', duration: '0.5 min' },
  { id: 'route', label: 'Route decision', phase: 'Route', duration: '0.5 min' },
  {
    id: 'misconception-model',
    label: 'Route-specific replacement model',
    phase: 'Replacement',
    duration: '1.25 min',
  },
  {
    id: 'misconception-contrast',
    label: 'Route-specific replacement contrast',
    phase: 'Replacement',
    duration: '0.75 min',
  },
  {
    id: 'misconception-confirm',
    label: 'Fresh replacement confirmation',
    phase: 'Replacement',
    duration: '0.75 min',
  },
  {
    id: 'prerequisite-bridge',
    label: 'Hard-prerequisite bridge',
    phase: 'Bridge',
    duration: '1.5 min',
  },
  {
    id: 'prerequisite-confirm',
    label: 'Fresh bridge confirmation',
    phase: 'Bridge',
    duration: '0.75 min',
  },
  { id: 'model', label: 'Direct model', phase: 'Build', duration: '1.5 min' },
  { id: 'worked', label: 'Expert decision', phase: 'A3', duration: '1.5 min' },
  { id: 'orient', label: 'Orient and predict', phase: 'Build', duration: '0.75 min' },
  { id: 'a2', label: 'Complete with support', phase: 'A2', duration: '0.75 min' },
  { id: 'a1', label: 'Use one cue', phase: 'A1', duration: '0.75 min' },
  { id: 'a0', label: 'Fresh independent use', phase: 'A0', duration: '0.75 min' },
  {
    id: 'fade-recovery-1',
    label: 'Fresh supported recovery 1',
    phase: 'Performance gate',
    duration: '1 min',
  },
  {
    id: 'fade-recovery-2',
    label: 'Fresh supported recovery 2',
    phase: 'Performance gate',
    duration: '1 min',
  },
  { id: 'contrast', label: 'Contrast and boundary', phase: 'Discriminate', duration: '1 min' },
  {
    id: 'exit-{family}-near-c{cycle}',
    label: 'Family/cycle-specific near-use simulation',
    phase: 'Exposed exit rehearsal',
    duration: '0.75 min',
  },
  {
    id: 'exit-{family}-changed-c{cycle}',
    label: 'Family/cycle-specific changed-task simulation',
    phase: 'Exposed exit rehearsal',
    duration: '0.75 min',
  },
  { id: 'handoff', label: 'KC handoff', phase: 'Handoff', duration: '0.25 min' },
] as const;

const ROUTE_COPY: Record<Route, { title: string; body: string; next: string }> = {
  unassigned: {
    title: 'Focus now',
    body: 'Answer both starting-point questions so the lesson can choose the right amount of support.',
    next: 'Continue',
  },
  concise: {
    title: 'Focus now',
    body: 'Your starting check supports a shorter path. You will still learn the decision rule and study a complete CBR-24 example before working on your own.',
    next: 'Learn the decision rule',
  },
  standard: {
    title: 'Focus now',
    body: 'First learn the decision rule, then work through CBR-24, and finally practice with support that fades as you succeed.',
    next: 'Learn the decision rule',
  },
  misconception: {
    title: 'Focus now',
    body: 'One tempting rule needs attention first. You will replace it, see a worked contrast, and try the corrected rule in a fresh case before continuing.',
    next: 'Replace the tempting rule',
  },
  prerequisite: {
    title: 'Focus now',
    body: 'Before judging a causal claim, refresh one idea: a confound is an earlier common cause of both the exposure and the outcome.',
    next: 'Review the common-cause rule',
  },
};

const PHASE_QUESTION_SCREEN: Record<
  string,
  keyof Pick<KcContent, 'orientId' | 'a2Id' | 'a1Id' | 'a0Id'>
> = {
  orient: 'orientId',
  a2: 'a2Id',
  a1: 'a1Id',
  a0: 'a0Id',
};

const ENTRY_MISCONCEPTION_PAIRS: Record<KcKey, Record<string, string>> = {
  kc1: { 'B|B': 'scope-overreach' },
  kc2: { 'C|C': 'control-confound-substitution' },
  kc3: {},
  kc4: { 'A|A': 'single-safeguard-sufficiency' },
  kc5: {},
};

const MISCONCEPTION_INTERVENTIONS: Record<
  string,
  {
    title: string;
    model: string[];
    contrasts: Array<[string, string]>;
    confirmationId: string;
  }
> = {
  'scope-overreach': {
    title: 'Keep the claim inside the study',
    model: [
      'A claim can sound scientific and still be untestable by the study in front of you. Broad words such as “always,” “all learners,” or “permanently” require evidence CBR-24 does not collect.',
      'Use this rule: copy the study’s people, comparison, measured outcome, and time into the claim before adding any interpretation.',
    ],
    contrasts: [
      ['Measured', 'Mean immediate attention differs between assigned breaks.'],
      ['Not measured', 'The break permanently improves every learning ability.'],
    ],
    confirmationId: 'q1-route-scope-confirm',
  },
  'control-confound-substitution': {
    title: 'Classify the relationship, not the topic',
    model: [
      'A factor is not a confound merely because it could affect the outcome. It must also differ systematically with the comparison groups.',
      'Use this rule: held comparable means control; linked to one group and able to affect the outcome means confound.',
    ],
    contrasts: [
      ['Controlled', 'Both groups use the same room temperature.'],
      ['Confounded', 'Every treatment session is warm and every control session is cool.'],
    ],
    confirmationId: 'q2-route-control-confirm',
  },
  'single-safeguard-sufficiency': {
    title: 'Check each protection separately',
    model: [
      'Consent, coding, low physical risk, and independent review protect against different problems. None is a universal seal of approval.',
      'Use this rule: check voluntariness, risk and benefit, fair selection, privacy, confidentiality, and oversight separately. One strength cannot erase an unrelated failure.',
    ],
    contrasts: [
      ['One safeguard present', 'A signature documents consent but does not secure public files.'],
      ['Protocol protected', 'Consent and proportionate data safeguards are each satisfied.'],
    ],
    confirmationId: 'q4-route-safeguard-confirm',
  },
};

const PREREQUISITE_INTERVENTIONS: Record<
  string,
  {
    title: string;
    model: string[];
    confirmationId: string;
  }
> = {
  'hard-prerequisite-confound': {
    title: 'Find the earlier common cause',
    model: [
      'Before judging a causal claim, ask whether a third variable came first and could influence both who received the exposure and the outcome.',
      'Use the arrow test: confound → exposure and confound → outcome. A mediator is different because it follows the exposure.',
    ],
    confirmationId: 'q5-route-confound-confirm',
  },
};

const REPAIR_BRANCHES: Record<
  KcKey,
  Array<{ id: string; trigger: string; diagnosis: string; replacement: string }>
> = {
  kc1: [
    {
      id: 'scope',
      trigger: 'Broad or permanent claim selected',
      diagnosis: 'The response exceeded the measured population, outcome, or time.',
      replacement: 'Copy the study nouns into the claim; delete unmeasured scope.',
    },
    {
      id: 'mechanism',
      trigger: 'Unmeasured mechanism selected',
      diagnosis: 'The response treated an explanation as if it were an observed endpoint.',
      replacement:
        'State the effect claim first; label the mechanism as untested unless it is measured.',
    },
    {
      id: 'uncertainty',
      trigger: 'Not sure or omission',
      diagnosis: 'The record does not identify one misconception.',
      replacement: 'Use the four-slot frame: population · comparison · outcome · time.',
    },
  ],
  kc2: [
    {
      id: 'roles',
      trigger: 'Independent/dependent/control roles swapped',
      diagnosis:
        'The response classified variables by topic rather than by what the study does with them.',
      replacement: 'Ask in order: varied? measured? held constant?',
    },
    {
      id: 'common-cause',
      trigger: 'Confound confused with mediator/control',
      diagnosis: 'The temporal position of the third variable was not used.',
      replacement: 'Confound points into exposure and outcome; mediator lies after exposure.',
    },
    {
      id: 'uncertainty',
      trigger: 'Not sure or omission',
      diagnosis: 'The response supplies insufficient evidence for a misconception label.',
      replacement: 'Draw treatment → outcome, then place each third variable by timing and arrows.',
    },
  ],
  kc3: [
    {
      id: 'sampling-assignment',
      trigger: 'Assignment treated as representative sampling',
      diagnosis: 'Internal allocation and population recruitment were collapsed.',
      replacement: 'Sampling selects from population; assignment allocates within sample.',
    },
    {
      id: 'quality-terms',
      trigger: 'Precision/reliability treated as accuracy/validity',
      diagnosis: 'Consistency was used as proof of correctness.',
      replacement: 'Judge repeat agreement and closeness/construct fit on separate axes.',
    },
    {
      id: 'uncertainty',
      trigger: 'Not sure or omission',
      diagnosis: 'No stable misconception is inferred.',
      replacement:
        'Name the target population, frame, assignment, reference, and intended interpretation separately.',
    },
  ],
  kc4: [
    {
      id: 'single-safeguard',
      trigger: 'Consent or minimal risk treated as sufficient',
      diagnosis: 'One protection was substituted for the full ethics review.',
      replacement:
        'Audit respect, risk–benefit, justice, privacy/confidentiality, and oversight independently.',
    },
    {
      id: 'terms',
      trigger: 'Privacy/confidentiality or 3Rs terms conflated',
      diagnosis: 'The response selected a neighboring ethical concept.',
      replacement:
        'Classify the exact action: access, disclosure, number, alternatives, or suffering.',
    },
    {
      id: 'uncertainty',
      trigger: 'Not sure or omission',
      diagnosis: 'The response does not justify a narrow misconception label.',
      replacement:
        'Identify who can be harmed, how, and which safeguard directly reduces that harm.',
    },
  ],
  kc5: [
    {
      id: 'overclaim',
      trigger: 'Broad causal or universal claim selected',
      diagnosis: 'The response exceeded the intervention, endpoint, time, system, or sample.',
      replacement: 'Causal language may be used, but every noun must remain inside the design.',
    },
    {
      id: 'underclaim',
      trigger: 'All evidence reduced to association',
      diagnosis: 'The response ignored manipulation, random assignment, and control.',
      replacement:
        'Use causal language for a preserved randomized contrast, then state external and mechanistic limits.',
    },
    {
      id: 'uncertainty',
      trigger: 'Not sure or omission',
      diagnosis: 'The record does not support a specific causal misconception.',
      replacement:
        'Audit temporality · manipulation · assignment · control · attrition · measurement · transport.',
    },
  ],
};

const REPAIR_OPTION_MAP: Record<KcKey, Record<string, 0 | 1>> = {
  kc1: {
    'q1-x0n:B': 0,
    'q1-x0n:C': 1,
    'q1-x0c:A': 0,
    'q1-x0c:B': 0,
    'q1-x1n:A': 0,
    'q1-x1n:C': 1,
    'q1-x1c:B': 0,
    'q1-x1c:C': 0,
    'q1-x2n:A': 0,
    'q1-x2n:B': 1,
    'q1-x2c:B': 0,
    'q1-x2c:C': 1,
  },
  kc2: {
    'q2-x0n:B': 0,
    'q2-x0n:C': 0,
    'q2-x0c:A': 0,
    'q2-x0c:C': 0,
    'q2-x1n:B': 1,
    'q2-x1n:C': 0,
    'q2-x1c:A': 1,
    'q2-x1c:C': 0,
    'q2-x2n:B': 1,
    'q2-x2n:C': 0,
    'q2-x2c:A': 0,
    'q2-x2c:C': 1,
  },
  kc3: {
    'q3-x0n:B': 1,
    'q3-x0n:C': 1,
    'q3-x0c:A': 1,
    'q3-x0c:C': 1,
    'q3-x1n:B': 0,
    'q3-x1n:C': 0,
    'q3-x1c:B': 1,
    'q3-x1c:C': 1,
    'q3-x2n:B': 1,
    'q3-x2n:C': 1,
    'q3-x2c:A': 1,
    'q3-x2c:C': 1,
  },
  kc4: {
    'q4-x0n:A': 0,
    'q4-x0n:C': 0,
    'q4-x0c:A': 1,
    'q4-x0c:C': 1,
    'q4-x1n:A': 0,
    'q4-x1n:C': 0,
    'q4-x1c:B': 1,
    'q4-x1c:C': 1,
    'q4-x2n:B': 1,
    'q4-x2n:C': 1,
    'q4-x2c:B': 0,
    'q4-x2c:C': 1,
  },
  kc5: {
    'q5-x0n:B': 0,
    'q5-x0n:C': 1,
    'q5-x0c:B': 0,
    'q5-x0c:C': 0,
    'q5-x1n:B': 0,
    'q5-x1n:C': 1,
    'q5-x1c:A': 0,
    'q5-x1c:C': 0,
    'q5-x2n:B': 0,
    'q5-x2n:C': 0,
    'q5-x2c:A': 0,
    'q5-x2c:C': 0,
  },
};

const CANONICAL_ROWS = [
  ['Lesson', 'V3-LES-765609', 'Research Questions, Design, and Inference Limits'],
  ['Cluster', 'V3-CL-765609', 'Five ordered KCs; capstone association recorded separately'],
  [
    'First delivery',
    'R14-FD-765609',
    'Global delivery event 6 · phase V3-PHS-714203 · module V3-MOD-163905',
  ],
  [
    'Lesson scope',
    'CORE',
    'Analyze testability, variables, samples, measures, ethics, and causal limits in described studies.',
  ],
  [
    'Explicit exclusions',
    'Lesson contract',
    'Hands-on laboratory proficiency; advanced methods survey; regulatory-law curriculum',
  ],
  [
    'Content version',
    'CBR24-RDI-1.2-INTERNAL',
    'Internal key-exposed quality-review simulation; not deployable evidence',
  ],
  [
    'Reviewed content hash',
    'reviewed_content_hash=PENDING',
    'Noncompensatory release blocker until a reviewed artifact is frozen',
  ],
];

const GRAPH_ROWS = [
  [
    'Ordered teaching',
    'V3-KC-231348 → 136063 → 678042 → 965248 → 388302',
    'Cluster teaching order',
  ],
  ['Hard prerequisite', 'V3-EDG-740206', 'V3-KC-136063 → V3-KC-388302'],
  ['Hard prerequisite', 'V3-EDG-685845', 'V3-KC-388302 → V3-CAP-510781'],
  [
    'CO_DEVELOPS_WITH',
    'V3-EDG-704426',
    'V3-KC-136063 ↔ V3-KC-388302: beyond the conditional hard point, repeated causal-claim evaluation improves design reading and vice versa',
  ],
  ['Later capstone', 'R14-CAP-510781', 'Global event 99 · owned by V3-LES-128144, not this lesson'],
];

const EVENT_SEMANTICS_ROWS = [
  [
    'attempt_started',
    'Question becomes active',
    'kcId, checkpointId, questionId, family, assistanceAllowed',
    'Required production contract; local Canvas trace does not emit this event',
  ],
  [
    'response_selected',
    'Choice changes before commitment',
    'questionId, responseId',
    'Local simulation trace only; never evidence',
  ],
  [
    'hint_requested',
    'Reviewer requests help',
    'questionId, assistance level, exposureState',
    'Local simulation trace; question remains exposed',
  ],
  [
    'attempt_submitted',
    'Response is committed in this rehearsal',
    'responseId or OMITTED, correctness, assistance, family, decisionContext',
    'Simulated outcome only',
  ],
  [
    'route_selected',
    'Both entry probes are interpreted',
    'route, persisted intervention signature, source responses',
    'Special route opens only when its exact intervention exists; otherwise standard',
  ],
  [
    'route_intervention_confirmed',
    'Fresh replacement/bridge item commits',
    'signature, questionId, responseId, correct, consumed gate',
    'One-shot transition into the standard model; never a learner diagnosis',
  ],
  [
    'assistance_level_updated',
    'A2/A1/A0/recovery gate consumes',
    'kcId, checkpointId, questionId, correctness, hint, A-before/A-after, consumed gate',
    'Validated current item changes assistance at most once',
  ],
  [
    'exit_pair_reviewed',
    'Both responses and rationales are displayed and acknowledged',
    'family, cycle, exposed=true',
    'Required before a simulated family advances',
  ],
  [
    'exit_pair_evaluated',
    'Acknowledged pair is evaluated',
    'family, cycle, correctness, unassisted flag, exposureState',
    'May grant simulated exit only',
  ],
  [
    'repair_started',
    'Explicit option-ID map selects and persists a tentative branch',
    'failed question/response IDs, branchId, cycle, branch-specific questionId',
    'Question lookup requires persisted branch plus cycle; diagnosis remains tentative and exposed',
  ],
  [
    'kc_simulated_exit',
    'Two unassisted key-exposed simulations pass',
    'kcId, family, cycle, exposureState',
    'Internal flow completion only; zero evidentiary weight',
  ],
  [
    'kc_paused',
    'Two repair cycles fail or simulation inventory is exhausted',
    'reason, cycle, decisionContext',
    'Quality-review stop; no infinite loop',
  ],
  [
    'lesson_simulation_completed',
    'All five statuses equal simulated_exit',
    'lessonId, completedKcs, exposed=true, capstoneExcluded=true',
    'Derived UI completion only; no mastery/readiness/capstone write',
  ],
];

const EVENT_ENVELOPE_ROWS = [
  ['schemaVersion', 'Required', 'Versioned event schema identifier'],
  [
    'eventId / previousEventHash / eventHash',
    'Required',
    'Immutable ordering and tamper-evident chain',
  ],
  ['contentVersion / reviewedContentHash', 'Required', 'Exact frozen content authority'],
  ['reviewRunId / actorId / occurredAt', 'Required', 'Stable run identity and server timestamp'],
  [
    'mode / exposureState / assistance',
    'Required',
    'Key-exposed simulation versus deployable evidence boundary',
  ],
  [
    'payload / decisionContext',
    'Required',
    'Typed event data and reason for consequential transitions',
  ],
  [
    'Implementation status',
    'REQUIRED—NOT IMPLEMENTED',
    'This Canvas stores a convenient local trace, not an authoritative event envelope',
  ],
];

const QA_ROWS = [
  [
    'Canonical identity',
    'Lesson, KC order, graph edges, sequence placement, capstone owner and boundary match source records.',
    'Block',
  ],
  [
    'Scientific accuracy',
    'Testability, role labels, sampling/assignment, quality terms, ethics, and causal limits are noninterchangeable.',
    'Block',
  ],
  [
    'Claim calibration',
    'Each key avoids overclaiming and the opposite error of denying bounded experimental causation.',
    'Block',
  ],
  [
    'Microcycle completeness',
    'Entry, model, expert decision, guided orientation, performance-gated fading, contrast, exposed pair simulation, repair, and handoff exist for every KC.',
    'Block',
  ],
  [
    'Exposure integrity',
    'Because keys coexist in this artifact, every outcome is simulated/exposed and receives zero evidentiary weight.',
    'Block',
  ],
  [
    'Feedback',
    'Every distractor, Not sure, omission, hint, key, and repair path has exact learner-facing copy.',
    'Block',
  ],
  [
    'Ethics',
    'Human/animal principles are educational summaries with oversight and jurisdiction boundaries.',
    'Block',
  ],
  [
    'Accessibility',
    'Keyboard, native semantics, text alternatives, reflow, no color-only meaning, and persistent state are present.',
    'Block',
  ],
  [
    'Event authority',
    'Production use is blocked until the required versioned event envelope is implemented outside this Canvas.',
    'Block',
  ],
  [
    'Visual quality',
    'Host tokens, flat hierarchy, responsive flow, no gradients, decorative emoji, shadows, or card wall.',
    'Major',
  ],
];

const BRANCH_TEST_ROWS = [
  [
    'BT-01',
    'Both entry probes correct without hints',
    'No feedback until both commit; concise simulation route',
  ],
  [
    'BT-02',
    'One entry response matches a misconception',
    'Standard route; no diagnosis from one isolated response',
  ],
  [
    'BT-02B',
    'Both entry responses match one registered signature',
    'Persist signature; open replacement model → route contrast → fresh confirmation before standard model',
  ],
  [
    'BT-03',
    'KC5 hard prerequisite probe wrong',
    'Persist hard-prerequisite signature; bridge and fresh common-cause confirmation appear before causal model',
  ],
  ['BT-04', 'Commit with no choice', 'OMITTED stored; exact omission feedback; no silent default'],
  [
    'BT-05',
    'Request hint on an exit simulation',
    'Item marked assisted; next exposed family replaces it; never evidence',
  ],
  [
    'BT-06',
    'Initial pair passes unassisted',
    'Complete pair review required before simulated exit',
  ],
  [
    'BT-07',
    'Initial exit pair misses',
    'Option map persists branch; branch-specific cycle-1 item loads; then exit family B',
  ],
  [
    'BT-08',
    'Family B misses',
    'New branch is persisted if indicated; its distinct cycle-2 item loads; then family C',
  ],
  ['BT-09', 'Family C misses', 'KC pauses with reason; no third repair loop'],
  [
    'BT-10',
    'Try to navigate during exit/repair gate',
    'All other checkpoint and KC navigation is disabled',
  ],
  [
    'BT-11',
    'Pause and resume',
    'No response changes while paused; reached navigation remains available in reviewer controls subject to atomic-gate locks',
  ],
  [
    'BT-12',
    'KC5 handoff selected before every status exits',
    'Completion remains false; only all five simulated_exit statuses derive completion',
  ],
  [
    'BT-13',
    'Reset armed then confirmed',
    'Responses reset; reviewRunId/exposureVersion persist; rehearsalRun increments',
  ],
  [
    'BT-14',
    'A2/A1 miss or help',
    'Assistance does not fade; a fresh supported recovery is required before exposed exit simulation',
  ],
  [
    'BT-15',
    'Open A0 or an exit simulation',
    'Expanded study details, model, definitions, and learner checkpoint navigation are hidden; only the compact active-stage map remains',
  ],
  [
    'BT-16',
    'Revisit an earlier handoff',
    'No KC status regresses from simulated_exit or paused to in_progress',
  ],
  [
    'BT-17',
    'Double-activate an A2/A1/A0/recovery Continue action',
    'First updater consumes kc:screen:item gate; stale updater sees a different screen or consumed gate and makes no change',
  ],
  [
    'BT-18',
    'Navigate back to a consumed fading or route-confirmation checkpoint',
    'Committed response remains reviewable; transition control is disabled and assistance cannot reduce again',
  ],
  [
    'BT-19',
    'For every KC, force each of its three repair branches in cycle 1 and cycle 2',
    'Thirty branch/cycle combinations resolve to thirty declared IDs; no lookup uses cycle alone',
  ],
  [
    'BT-20',
    'Special route has no registered exact intervention',
    'Route is relabeled standard; no replacement instruction is promised',
  ],
  [
    'BT-21',
    'Audit timing arithmetic',
    '60 base + 11.5 route + 10 recovery + 30 repair + 9 transition/break = 120.5 min; capstone excluded',
  ],
];

const ACCESSIBILITY_ITEMS = [
  'Native fieldset, legend, radio, and button semantics expose each response group to assistive technology.',
  'Keyboard users can select, commit, request help, navigate allowed checkpoints, pause, resume, switch reviewer tabs, and reset.',
  'Correctness and status are always stated in text; color is never the only signal.',
  'Tables include explicit headers and remain horizontally scrollable through the Canvas table primitive.',
  'The layout uses wrapping rows and auto-fit grids; no task requires a fixed viewport or pointer precision.',
  'No timed response, automatic motion, audio-only cue, hover-only instruction, or memory-dependent color legend is used.',
  'The CBR-24 flow uses ordered text cards, numbered stages, active-stage wording, an aria label, and a disclosure with the same flow in prose; color is supplementary.',
  'Each new checkpoint remounts an autofocus target and is announced through a polite status region; reset requires confirmation.',
];

const SOURCES = [
  {
    label: 'Belmont Report · HHS OHRP',
    url: 'https://www.hhs.gov/ohrp/regulations-and-policy/belmont-report/index.html',
    use: 'Respect for persons, beneficence, justice, and applications.',
  },
  {
    label: '45 CFR 46.111 · eCFR',
    url: 'https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-A/part-46/subpart-A/section-46.111',
    use: 'IRB approval criteria: risks, selection, consent, monitoring, privacy/confidentiality.',
  },
  {
    label: '45 CFR 46.116 · eCFR',
    url: 'https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-A/part-46/subpart-A/section-46.116',
    use: 'General informed-consent requirements and waiver boundaries.',
  },
  {
    label: 'PHS Policy on Humane Care and Use · OLAW',
    url: 'https://olaw.nih.gov/policies-laws/phs-policy.htm',
    use: 'Institutional animal-care oversight and humane-use policy context.',
  },
  {
    label: 'The 3Rs · NC3Rs',
    url: 'https://nc3rs.org.uk/who-we-are/3rs',
    use: 'Replacement, reduction, and refinement definitions.',
  },
  {
    label: 'Federal Research Misconduct Policy · ORI',
    url: 'https://ori.hhs.gov/federal-research-misconduct-policy',
    use: 'Fabrication, falsification, plagiarism; honest error and differences of opinion excluded.',
  },
  {
    label: 'NIST TN 1297',
    url: 'https://www.nist.gov/pml/nist-technical-note-1297',
    use: 'Measurement result, uncertainty, random and systematic effects; accuracy/precision language checked against metrology usage.',
  },
  {
    label: 'NIH Quality Assessment Tools',
    url: 'https://www.nhlbi.nih.gov/health-topics/study-quality-assessment-tools',
    use: 'Study quality depends on design-specific threats, not a single score.',
  },
  {
    label: 'CDC Principles of Epidemiology',
    url: 'https://archive.cdc.gov/www_cdc_gov/csels/dsepd/ss1978/index.html',
    use: 'Descriptive/analytic epidemiology, association, comparison groups, and causal caution.',
  },
  {
    label: 'CONSORT 2025 · SPIRIT–CONSORT',
    url: 'https://www.consort-spirit.org/',
    use: 'Current randomized-trial reporting context: design, analysis, interpretation, participant flow, outcomes, and limitations.',
  },
];

const RELEASE_GATE_ROWS = [
  [
    'Rights',
    'Document ownership/license for every authored or sourced element; protected question text prohibited.',
    'PENDING',
    'BLOCK',
  ],
  [
    'Similarity',
    'Complete automated and human similarity review against protected and prior item corpora.',
    'PENDING',
    'BLOCK',
  ],
  [
    'Blind solve',
    'Independent reviewers solve every item without keys, author notes, or reviewer-mode exposure.',
    'PENDING',
    'BLOCK',
  ],
  [
    'Provenance',
    'Verify every canonical record and methodological/ethics citation against the frozen source snapshot.',
    'PENDING',
    'BLOCK',
  ],
  [
    'Content hash',
    'Freeze reviewed_content_hash and bind it to the release manifest and event envelope.',
    'PENDING',
    'BLOCK',
  ],
];

const ENTRY_SIGNATURE_ROWS = [
  [
    'V3-KC-231348',
    'B | B',
    'scope-overreach',
    'Both probes independently select an overbroad claim',
  ],
  [
    'V3-KC-136063',
    'C | C',
    'control-confound-substitution',
    'Both probes treat awareness/potential influence as control or confound status',
  ],
  [
    'V3-KC-678042',
    'None registered',
    'Standard route',
    'The two probes sample different constructs; no convergent diagnosis is available',
  ],
  [
    'V3-KC-965248',
    'A | A',
    'single-safeguard-sufficiency',
    'Both probes treat one label or safeguard as sufficient',
  ],
  [
    'V3-KC-388302',
    'First probe misses after both probes commit',
    'hard-prerequisite-confound',
    'A failed hard-prerequisite probe opens the distinct bridge; it is not labeled a misconception',
  ],
];

const FADING_RULE_ROWS = [
  [
    'Correct on a fresh item without requested hint',
    'Reduce planned assistance by one level: A2 → A1 → A0',
  ],
  [
    'Wrong, Not sure, omission, or requested hint',
    'Hold assistance; if attempted at A0, restore A1',
  ],
  ['A0 screen ends above A0', 'Open fresh supported recovery 1'],
  ['Recovery 1 ends above A0', 'Open fresh supported recovery 2'],
  ['Recovery 2 ends above A0', 'Pause; do not advance to contrast or exit simulation'],
  [
    'Replayed or stale gate action',
    'No state change: KC, current checkpoint, active question ID, commitment, and unconsumed gate must all match',
  ],
  ['Assistance reaches A0', 'Open contrast, then family/cycle-specific exposed exit rehearsal'],
];

const TIMING_CONTRACT_ROWS = [
  [
    'Standard route',
    '12 min per KC · 60 min for five KCs',
    'Authored screens total 10.25 min; add 1.75 min for KC-local commitment and feedback. Excludes inter-KC transition overhead and break',
  ],
  [
    'Concise route',
    '8 min per KC · 40 min for five KCs',
    'Two convergent correct entry probes; compact model, expert decision, A0, contrast, one exit pair, and handoff content; excludes inter-KC transition overhead and break',
  ],
  [
    'Misconception increment',
    '+3 min for a routed KC',
    'Replacement model 1.25 + contrast 0.75 + fresh confirmation 0.75, normalized with transition buffer',
  ],
  [
    'Prerequisite bridge increment',
    '+2.5 min for KC5 when triggered',
    'Bridge 1.5 + fresh confirmation 0.75, normalized with transition buffer',
  ],
  [
    'Fading recovery increment',
    '+1 min each · max +2 min per KC',
    'Only when performance has not reached A0 after the authored A0 screen',
  ],
  [
    'Repair increment',
    '+3 min per cycle · max +6 min per KC',
    'Branch-specific repair interaction 1.5 + new exposed exit pair 1.5',
  ],
  [
    'Worst valid lesson branch',
    '120.5 min · schedule 121 min',
    '60 base + 11.5 possible distinct-route increments + 10 recovery + 30 repair + 9 transitions/break',
  ],
  [
    'Transitions and break',
    '+9 min per full lesson',
    'Four inter-KC transitions at 1 min each + one 5 min break after KC3',
  ],
  [
    'Separate capstone reference',
    'Excluded · duration owned later',
    'V3-CAP-510781 occurs at R14-CAP-510781/global event 99 under V3-LES-128144; no capstone minutes are included here',
  ],
];

const CAPSTONE_ROWS = [
  ['ID', 'V3-CAP-510781'],
  ['Label', 'Draw Evidence-Bounded Conclusions and Applications'],
  ['Owner', 'V3-LES-128144 · not V3-LES-765609'],
  ['Placement', 'R14-CAP-510781 · global event 99'],
  ['Components', 'These five KCs plus V3-KC-092280, V3-KC-102285, V3-KC-434142, and V3-KC-062200'],
  [
    'Coordination demand',
    'Coordinate question, design, sampling/measurement, ethics, display, statistics, uncertainty, and causal limits.',
  ],
  [
    'Boundary',
    'This Canvas previews the dependency only. Simulating this flow never marks the capstone attempted, passed, or mastered.',
  ],
];

function freshState(): LessonState {
  return {
    version: 3,
    current: { kc: 'kc1', screen: 'entry-1' },
    reached: { kc1: ['entry-1'], kc2: [], kc3: [], kc4: [], kc5: [] },
    answers: {},
    committed: {},
    hints: {},
    routes: {
      kc1: 'unassigned',
      kc2: 'unassigned',
      kc3: 'unassigned',
      kc4: 'unassigned',
      kc5: 'unassigned',
    },
    statuses: { kc1: 'in_progress', kc2: 'locked', kc3: 'locked', kc4: 'locked', kc5: 'locked' },
    exitFamily: { kc1: 0, kc2: 0, kc3: 0, kc4: 0, kc5: 0 },
    repairCycles: { kc1: 0, kc2: 0, kc3: 0, kc4: 0, kc5: 0 },
    supportLevel: { kc1: 2, kc2: 2, kc3: 2, kc4: 2, kc5: 2 },
    pairReviewed: {},
    consumedGates: {},
    selectedRepairBranches: {},
    routeSignatures: {},
    pauseReason: {},
    events: [
      {
        seq: 1,
        type: 'lesson_started',
        kc: 'kc1',
        screen: 'entry-1',
        decisionContext:
          'Internal key-exposed quality-review rehearsal; all outcomes simulated and assigned zero evidentiary weight',
      },
    ],
    manualPaused: false,
  };
}

function questionById(id: string): Question {
  const question = ALL_QUESTIONS.find((item) => item.id === id);
  if (!question) {
    throw new Error(`Missing inline question: ${id}`);
  }
  return question;
}

function exitCheckpointId(familyIndex: number, kind: 'near' | 'changed', cycle: number): string {
  return `exit-${String.fromCharCode(65 + familyIndex)}-${kind}-c${cycle}`;
}

function parseExitCheckpoint(
  id: string,
): { familyIndex: number; kind: 'near' | 'changed'; cycle: number } | undefined {
  const match = /^exit-([ABC])-(near|changed)-c([0-2])$/.exec(id);
  if (!match) return undefined;
  return {
    familyIndex: match[1].charCodeAt(0) - 65,
    kind: match[2] as 'near' | 'changed',
    cycle: Number(match[3]),
  };
}

function repairCheckpointId(cycle: number): string {
  return `repair-c${cycle}`;
}

function parseRepairCheckpoint(id: string): number | undefined {
  const match = /^repair-c([12])$/.exec(id);
  return match ? Number(match[1]) : undefined;
}

function isLockedSequenceScreen(id: string): boolean {
  return Boolean(parseExitCheckpoint(id) || parseRepairCheckpoint(id));
}

function screenDefinition(
  id: string,
): { id: string; label: string; phase: string; duration: string } | undefined {
  const exit = parseExitCheckpoint(id);
  if (exit) {
    return {
      id,
      label: `Family ${String.fromCharCode(65 + exit.familyIndex)} ${exit.kind === 'near' ? 'near-use' : 'changed-task'} simulation · cycle ${exit.cycle}`,
      phase: 'Exposed exit rehearsal',
      duration: '0.75 min',
    };
  }
  const repairCycle = parseRepairCheckpoint(id);
  if (repairCycle) {
    return {
      id,
      label: `Branch-specific repair cycle ${repairCycle}`,
      phase: 'Supported repair',
      duration: '1.5 min',
    };
  }
  return SCREEN_DEFS.find((item) => item.id === id);
}

function questionForScreen(state: LessonState): Question | undefined {
  const kc = KCS[state.current.kc];
  const screen = state.current.screen;
  if (screen === 'entry-1') return questionById(kc.entryIds[0]);
  if (screen === 'entry-2') return questionById(kc.entryIds[1]);
  if (screen in PHASE_QUESTION_SCREEN) return questionById(kc[PHASE_QUESTION_SCREEN[screen]]);
  if (screen === 'fade-recovery-1') return questionById(kc.recoveryIds[0]);
  if (screen === 'fade-recovery-2') return questionById(kc.recoveryIds[1]);
  if (screen === 'misconception-confirm') {
    const signature = state.routeSignatures[kc.key];
    const intervention = signature ? MISCONCEPTION_INTERVENTIONS[signature] : undefined;
    return intervention ? questionById(intervention.confirmationId) : undefined;
  }
  if (screen === 'prerequisite-confirm') {
    const signature = state.routeSignatures[kc.key];
    const intervention = signature ? PREREQUISITE_INTERVENTIONS[signature] : undefined;
    return intervention ? questionById(intervention.confirmationId) : undefined;
  }
  const exit = parseExitCheckpoint(screen);
  if (exit) return questionById(kc.exitIds[exit.familyIndex][exit.kind]);
  const repairCycle = parseRepairCheckpoint(screen);
  if (repairCycle) {
    const branchId = state.selectedRepairBranches[repairSelectionKey(kc.key, screen)];
    const branchQuestions = branchId ? kc.repairIds[branchId] : undefined;
    return branchQuestions ? questionById(branchQuestions[repairCycle - 1]) : undefined;
  }
  return undefined;
}

function routeFor(kc: KcKey, state: LessonState): Route {
  const content = KCS[kc];
  const first = state.answers[content.entryIds[0]];
  const second = state.answers[content.entryIds[1]];
  const clean =
    first === questionById(content.entryIds[0]).key &&
    second === questionById(content.entryIds[1]).key &&
    !state.hints[content.entryIds[0]] &&
    !state.hints[content.entryIds[1]];
  if (clean) return 'concise';
  if (kc === 'kc5' && first !== questionById(content.entryIds[0]).key) return 'prerequisite';
  if (ENTRY_MISCONCEPTION_PAIRS[kc][`${first}|${second}`]) return 'misconception';
  return 'standard';
}

function routeSignatureFor(kc: KcKey, state: LessonState, route: Route): string | undefined {
  const content = KCS[kc];
  if (route === 'misconception') {
    return ENTRY_MISCONCEPTION_PAIRS[kc][
      `${state.answers[content.entryIds[0]]}|${state.answers[content.entryIds[1]]}`
    ];
  }
  if (route === 'prerequisite' && kc === 'kc5') return 'hard-prerequisite-confound';
  return undefined;
}

function repairSelectionKey(kc: KcKey, screen: string): string {
  return `${kc}:${screen}`;
}

function fadingGateKey(kc: KcKey, screen: string, questionId: string): string {
  return `${kc}:${screen}:${questionId}`;
}

function addEvent(
  state: LessonState,
  type: string,
  detail: {
    kc?: KcKey;
    screen?: string;
    response?: string;
    assistance?: string;
    decisionContext: string;
  },
): LessonState {
  const event: EventRecord = {
    seq: state.events.length + 1,
    type,
    kc: detail.kc ?? state.current.kc,
    screen: detail.screen ?? state.current.screen,
    response: detail.response,
    assistance: detail.assistance,
    decisionContext: detail.decisionContext,
  };
  return { ...state, events: [...state.events, event] };
}

function withReached(state: LessonState, kc: KcKey, screen: string): LessonState {
  const reached = state.reached[kc].includes(screen)
    ? state.reached[kc]
    : [...state.reached[kc], screen];
  return { ...state, current: { kc, screen }, reached: { ...state.reached, [kc]: reached } };
}

function nextStandardScreen(screen: string): string {
  const order = ['route', 'model', 'worked', 'orient', 'a2', 'a1', 'a0'];
  const index = order.indexOf(screen);
  return index >= 0 && index < order.length - 1 ? order[index + 1] : screen;
}

function nextConciseScreen(screen: string): string {
  const order = ['route', 'model', 'worked', 'a0'];
  const index = order.indexOf(screen);
  return index >= 0 && index < order.length - 1 ? order[index + 1] : screen;
}

function questionOptions(
  question: Question,
): Array<{ id: string; text: string; rationale: string }> {
  return [
    ...question.options,
    {
      id: 'NS',
      text: 'Not sure',
      rationale:
        'Choosing “Not sure” is useful information. The lesson will keep the idea in view and offer another supported example.',
    },
  ];
}

function responseLabel(question: Question, response: string | undefined): string {
  if (response === '__OMITTED__') return 'No answer selected';
  const option = questionOptions(question).find((item) => item.id === response);
  return option ? `${option.id}. ${option.text}` : 'No committed response';
}

function responseRationale(question: Question, response: string | undefined): string {
  if (response === '__OMITTED__') {
    return 'No answer was selected, so there is no claim to evaluate. The lesson will keep the idea in view and provide another supported example.';
  }
  const option = questionOptions(question).find((item) => item.id === response);
  return option?.rationale ?? 'No response rationale is available.';
}

function questionCorrect(question: Question, state: LessonState): boolean {
  return state.answers[question.id] === question.key;
}

function allKcsExited(state: LessonState): boolean {
  return KC_ORDER.every((key) => state.statuses[key] === 'simulated_exit');
}

function withMonotonicStatus(state: LessonState, kc: KcKey, nextStatus: KcStatus): LessonState {
  const current = state.statuses[kc];
  if (current === 'simulated_exit' || current === 'paused') return state;
  if (current === 'in_progress' && nextStatus === 'locked') return state;
  return { ...state, statuses: { ...state.statuses, [kc]: nextStatus } };
}

function repairBranch(kc: KcKey, state: LessonState) {
  const familyIndex = Math.max(0, state.exitFamily[kc] - 1);
  const pair = KCS[kc].exitIds[familyIndex];
  const pairQuestions = [questionById(pair.near), questionById(pair.changed)];
  const responses = pairQuestions.map((question) => state.answers[question.id]);
  if (responses.some((response) => response === 'NS' || response === '__OMITTED__' || !response)) {
    return REPAIR_BRANCHES[kc][2];
  }
  const failedSignatures = failedRepairSignatures(kc, state);
  const selectedBranch =
    REPAIR_OPTION_MAP[kc][failedSignatures[1]] ?? REPAIR_OPTION_MAP[kc][failedSignatures[0]];
  return selectedBranch === undefined
    ? REPAIR_BRANCHES[kc][2]
    : REPAIR_BRANCHES[kc][selectedBranch];
}

function persistedRepairBranch(kc: KcKey, screen: string, state: LessonState) {
  const branchId = state.selectedRepairBranches[repairSelectionKey(kc, screen)];
  return REPAIR_BRANCHES[kc].find((branch) => branch.id === branchId);
}

function failedRepairSignatures(kc: KcKey, state: LessonState): string[] {
  const familyIndex = Math.max(0, state.exitFamily[kc] - 1);
  const pair = KCS[kc].exitIds[familyIndex];
  return [questionById(pair.near), questionById(pair.changed)]
    .map((question) => ({ question, response: state.answers[question.id] }))
    .filter(({ question, response }) => response !== question.key)
    .map(({ question, response }) => `${question.id}:${response}`);
}

function ChoiceList({
  question,
  state,
  paused,
  feedbackVisible,
  onSelect,
  onCommit,
  onHint,
}: {
  question: Question;
  state: LessonState;
  paused: boolean;
  feedbackVisible: boolean;
  onSelect: (questionId: string, response: string) => void;
  onCommit: (question: Question) => void;
  onHint: (question: Question) => void;
}) {
  const theme = useHostTheme();
  const committed = Boolean(state.committed[question.id]);
  const selected = state.answers[question.id];
  const hinted = Boolean(state.hints[question.id]);
  const correct = questionCorrect(question, state);
  const selectedRationale = responseRationale(question, selected);
  const bestAnswer = questionOptions(question).find((item) => item.id === question.key);
  const showIndividualFeedback = question.phase !== 'entry' && question.phase !== 'exit';
  return (
    <Stack gap={12}>
      <div>
        <Text size="small" tone="tertiary" weight="semibold">
          {learnerQuestionLabel(question)}
        </Text>
        <Text style={{ marginTop: 6 }}>{question.scenario}</Text>
      </div>
      <fieldset
        disabled={committed || paused}
        style={{
          border: 0,
          padding: 0,
          margin: 0,
          minWidth: 0,
        }}
      >
        <legend
          style={{
            color: theme.text.primary,
            fontSize: 16,
            lineHeight: '22px',
            fontWeight: 590,
            marginBottom: 10,
          }}
        >
          {question.prompt}
        </legend>
        <Stack gap={8}>
          {questionOptions(question).map((option) => (
            <label
              key={option.id}
              style={{
                display: 'flex',
                gap: 10,
                alignItems: 'flex-start',
                padding: 10,
                borderRadius: 6,
                border: `1px solid ${
                  selected === option.id ? theme.stroke.focused : theme.stroke.tertiary
                }`,
                background: selected === option.id ? theme.fill.secondary : theme.fill.quaternary,
                color: committed ? theme.text.secondary : theme.text.primary,
                cursor: committed || paused ? 'default' : 'pointer',
              }}
            >
              <input
                type="radio"
                name={question.id}
                checked={selected === option.id}
                onChange={() => onSelect(question.id, option.id)}
                style={{ marginTop: 2, accentColor: theme.accent.primary }}
              />
              <span style={{ fontSize: 14, lineHeight: '20px' }}>
                <strong>{option.id}.</strong> {option.text}
              </span>
            </label>
          ))}
        </Stack>
      </fieldset>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))',
          gap: 8,
        }}
      >
        <Button
          variant="secondary"
          disabled={committed || paused || hinted}
          style={{ width: '100%' }}
          onClick={() => onHint(question)}
        >
          {hinted ? 'Hint shown' : 'Use a hint'}
        </Button>
        <Button
          variant="primary"
          disabled={committed || paused}
          style={{ width: '100%' }}
          onClick={() => onCommit(question)}
        >
          Check answer
        </Button>
      </div>
      <Text size="small" tone="tertiary">
        {committed ? 'Answer checked.' : 'Choose one answer, or choose “Not sure.”'}
      </Text>
      {hinted ? (
        <div
          style={{
            borderLeft: `3px solid ${theme.accent.primary}`,
            padding: '8px 10px',
            background: theme.fill.quaternary,
          }}
        >
          <Text size="small">
            <Text as="span" weight="semibold">
              Hint:{' '}
            </Text>
            {question.hint}
          </Text>
        </div>
      ) : null}
      {committed && !feedbackVisible ? (
        <Text size="small" tone="secondary" aria-live="polite">
          {question.phase === 'entry'
            ? 'Complete both starting-point questions, then review them together.'
            : 'Complete the second question before reviewing the pair. The first explanation stays hidden so it cannot coach the next answer.'}
        </Text>
      ) : null}
      {committed && feedbackVisible && showIndividualFeedback ? (
        <div aria-live="polite">
          <Callout
            tone={correct ? 'success' : 'warning'}
            title={
              correct
                ? 'That’s the best-supported answer'
                : selected === 'NS'
                  ? 'Let’s build the decision'
                  : 'Review the decision rule'
            }
          >
            <Text>
              <Text as="span" weight="semibold">
                Your answer:{' '}
              </Text>
              {responseLabel(question, selected)}
            </Text>
            <Text style={{ marginTop: 6 }}>
              <Text as="span" weight="semibold">
                {correct ? 'Why it works: ' : 'Why it does not work here: '}
              </Text>
              {selectedRationale}
            </Text>
            {!correct ? (
              <Stack gap={4} style={{ marginTop: 8 }}>
                <Text>
                  <Text as="span" weight="semibold">
                    Best answer:{' '}
                  </Text>
                  {responseLabel(question, question.key)}
                </Text>
                <Text>
                  <Text as="span" weight="semibold">
                    Decision reason:{' '}
                  </Text>
                  {bestAnswer?.rationale}
                </Text>
              </Stack>
            ) : null}
          </Callout>
        </div>
      ) : null}
    </Stack>
  );
}

function CompletePairReview({
  title,
  questions,
  state,
}: {
  title: string;
  questions: [Question, Question];
  state: LessonState;
}) {
  const theme = useHostTheme();
  return (
    <Stack gap={12}>
      <H3>{title}</H3>
      {questions.map((question, index) => {
        const response = state.answers[question.id];
        const isCorrect = response === question.key;
        const bestAnswer = questionOptions(question).find((option) => option.id === question.key);
        return (
          <div
            key={question.id}
            style={{
              border: `1px solid ${isCorrect ? theme.stroke.focused : theme.stroke.tertiary}`,
              borderRadius: 8,
              padding: 12,
              background: theme.fill.quaternary,
            }}
          >
            <Stack gap={6}>
              <Text size="small" tone="tertiary" weight="semibold">
                Question {index + 1} · {isCorrect ? 'Best-supported' : 'Needs revision'}
              </Text>
              <Text weight="semibold">{question.prompt}</Text>
              <Text>
                <Text as="span" weight="semibold">
                  Your answer:{' '}
                </Text>
                {responseLabel(question, response)}
              </Text>
              {!isCorrect ? (
                <Text>
                  <Text as="span" weight="semibold">
                    Why that choice fails here:{' '}
                  </Text>
                  {responseRationale(question, response)}
                </Text>
              ) : null}
              <Text>
                <Text as="span" weight="semibold">
                  Best answer:{' '}
                </Text>
                {responseLabel(question, question.key)}
              </Text>
              <Text>
                <Text as="span" weight="semibold">
                  Why:{' '}
                </Text>
                {bestAnswer?.rationale}
              </Text>
            </Stack>
          </div>
        );
      })}
    </Stack>
  );
}

function Cbr24StudyFlow({ currentKc, compact }: { currentKc: KcKey; compact: boolean }) {
  const theme = useHostTheme();
  const learnerCopy = LEARNER_KC_COPY[currentKc];
  const revealedThrough = currentKc === 'kc1' ? 0 : currentKc === 'kc5' ? 4 : 2;
  const activeStageNames = learnerCopy.activeStages
    .map((index) => CBR24_FLOW[index]?.title)
    .filter(Boolean)
    .join(' and ');
  return (
    <Card>
      <CardHeader>CBR-24 study map</CardHeader>
      <CardBody>
        <figure
          aria-label={`CBR-24 study flow. ${CBR24_FLOW.map((stage) => stage.title).join(' to ')}.`}
          style={{ margin: 0 }}
        >
          <Text>
            <Text as="span" weight="semibold">
              Focus now:{' '}
            </Text>
            {compact ? `Inspect ${activeStageNames}.` : learnerCopy.focus}
          </Text>
          <div
            role="list"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))',
              gap: 8,
              marginTop: 12,
            }}
          >
            {CBR24_FLOW.map((stage, index) => {
              const active = learnerCopy.activeStages.includes(index);
              return (
                <div
                  key={stage.title}
                  role="listitem"
                  aria-current={active ? 'step' : undefined}
                  style={{
                    border: `1px solid ${active ? theme.stroke.focused : theme.stroke.tertiary}`,
                    borderRadius: 8,
                    padding: 10,
                    background: active ? theme.fill.secondary : theme.fill.quaternary,
                    minWidth: 0,
                  }}
                >
                  <Text size="small" tone={active ? undefined : 'tertiary'} weight="semibold">
                    {index + 1}. {stage.title}
                  </Text>
                  {active && !compact ? (
                    <Text size="small" tone="secondary" style={{ marginTop: 5 }}>
                      {stage.summary}
                    </Text>
                  ) : null}
                </div>
              );
            })}
          </div>
          <Text size="small" tone="tertiary" style={{ marginTop: 10 }}>
            Text path: research question → sample and assignment → variables and measurement →
            observed result → warranted inference and limits.
          </Text>
          {!compact ? (
            <CollapsibleSection title="Read the current CBR-24 flow in words">
              <ol style={{ margin: 0, paddingLeft: 20, color: theme.text.secondary }}>
                {CBR24_FLOW.map((stage, index) => (
                  <li key={stage.title} style={{ marginBottom: 7, lineHeight: '20px' }}>
                    <strong>{stage.title}:</strong>{' '}
                    {index <= revealedThrough
                      ? stage.summary
                      : 'This part of the study will be examined later.'}
                  </li>
                ))}
              </ol>
            </CollapsibleSection>
          ) : null}
        </figure>
      </CardBody>
    </Card>
  );
}

function ModelTables({ kc }: { kc: KcKey }) {
  if (kc === 'kc2') {
    return (
      <Table
        headers={['CBR-24 feature', 'Role', 'Why']}
        rows={[
          [
            'Assigned routine',
            'Independent variable',
            'Investigators manipulate breathing versus quiet sitting',
          ],
          [
            'Immediate quiz score',
            'Dependent variable',
            'Recorded response used for the comparison',
          ],
          [
            'Quiz version, room, preparation interval',
            'Controlled variables',
            'Kept comparable across conditions',
          ],
          ['Motivation under self-selection', 'Confound', 'Predicts routine choice and score'],
          [
            'Stress reduction after routine',
            'Possible mediator',
            'Could lie on a postassignment pathway',
          ],
        ]}
        striped
      />
    );
  }
  if (kc === 'kc3') {
    return (
      <Stack gap={10}>
        <Table
          headers={['Pulse monitor trial', 'Reference (beats/min)', 'Reading (beats/min)', 'Error']}
          rows={[
            ['1', '72', '80', '+8'],
            ['2', '72', '80', '+8'],
            ['3', '72', '81', '+9'],
          ]}
          columnAlign={['left', 'right', 'right', 'right']}
          striped
        />
        <Text size="small" tone="secondary">
          Text alternative: all three readings cluster at 80–81 while the reference is 72, so the
          device is precise/repeatable but systematically inaccurate.
        </Text>
      </Stack>
    );
  }
  if (kc === 'kc4') {
    return (
      <Table
        headers={['Decision lens', 'CBR-24 question', 'Required response']}
        rows={[
          [
            'Respect for persons',
            'Can students decline without academic penalty or instructor pressure?',
            'Neutral recruitment and equivalent nonparticipation option',
          ],
          [
            'Beneficence',
            'Are intervention and informational risks minimized and reasonable?',
            'Minimal necessary data, monitoring, secure storage',
          ],
          [
            'Justice',
            'Are students selected for scientific reasons rather than convenience or vulnerability?',
            'Defensible, equitable inclusion/exclusion',
          ],
          [
            'Privacy/confidentiality',
            'Who can access identities and sensitive scores?',
            'Separate key, least privilege, retention and deletion plan',
          ],
          [
            'Oversight',
            'Has the complete protocol received applicable prospective review?',
            'IRB determination before research begins',
          ],
        ]}
        striped
      />
    );
  }
  if (kc === 'kc5') {
    return (
      <Stack gap={10}>
        <Table
          headers={['CBR-24 result', 'Breathing', 'Quiet sitting', 'Bounded interpretation']}
          rows={[
            ['Randomized', '120', '120', 'Allocation supports baseline comparability'],
            ['Analyzed', '116', '116', 'Low, balanced attrition'],
            ['Mean quiz score / 20', '15.2', '13.1', 'Mean difference 2.1 points'],
            [
              '95% CI for difference',
              '0.4 to 3.8',
              'Reference',
              'Compatible effect sizes under the analysis; not individual uniformity',
            ],
          ]}
          striped
        />
        <Text size="small" tone="secondary">
          Text alternative: the randomized groups began at 120 each, 116 per group were analyzed,
          and the breathing group averaged 2.1 points higher; the reported 95% interval is 0.4 to
          3.8 points.
        </Text>
      </Stack>
    );
  }
  return null;
}

function ReviewerMode({
  state,
  setState,
  identity,
}: {
  state: LessonState;
  setState: (action: LessonState | ((previous: LessonState) => LessonState)) => void;
  identity: AuditIdentity;
}) {
  const theme = useHostTheme();
  const [reviewerTab, setReviewerTab] = useCanvasState<ReviewerTab>(
    'mcat-rdi-reviewer-tab-v1',
    'authority',
  );
  const reviewerTabs: Array<{ id: ReviewerTab; label: string }> = [
    { id: 'authority', label: 'Authority & map' },
    { id: 'content', label: 'Content & keys' },
    { id: 'logic', label: 'Routing & events' },
    { id: 'release', label: 'Release gates' },
  ];
  const questionRows = (kc: KcKey) =>
    ALL_QUESTIONS.filter((question) => question.kc === kc).map((question) => [
      question.id,
      `${question.phase} · ${question.family}`,
      question.prompt,
      question.key,
    ]);
  const navigationLocked =
    isLockedSequenceScreen(state.current.screen) || state.current.screen === 'a0';
  const navigateToReached = (targetKc: KcKey, screen: string) => {
    setState((previous) => {
      if (
        isLockedSequenceScreen(previous.current.screen) &&
        (previous.current.kc !== targetKc || previous.current.screen !== screen)
      ) {
        return addEvent(previous, 'navigation_blocked', {
          decisionContext:
            'Exit/repair sequence is atomic; reviewer checkpoint navigation cannot bypass it',
        });
      }
      if (
        previous.statuses[targetKc] !== 'in_progress' &&
        isLockedSequenceScreen(screen) &&
        (previous.current.kc !== targetKc || previous.current.screen !== screen)
      ) {
        return addEvent(previous, 'navigation_blocked', {
          decisionContext:
            'Terminal simulated-exit/pause status prevents reviewer re-entry into an atomic checkpoint',
        });
      }
      let next = withReached(previous, targetKc, screen);
      next = addEvent(next, 'checkpoint_opened', {
        kc: targetKc,
        screen,
        decisionContext:
          'Reviewer opened a reached checkpoint; committed responses and consumed gates remain unchanged',
      });
      return next;
    });
  };
  return (
    <Stack gap={22}>
      <Callout tone="warning" title="Internal quality review only · all keys exposed">
        Review run {identity.reviewRunId} · rehearsal {identity.rehearsalRun} ·{' '}
        {identity.exposureVersion} · reviewed_content_hash={identity.reviewedContentHash}. Every
        displayed outcome is simulated and has zero evidentiary weight.
      </Callout>
      <CollapsibleSection
        title="Flow checkpoint controls"
        count={state.reached[state.current.kc].length}
      >
        <Stack gap={10}>
          <Text size="small" tone="secondary">
            Reviewer-only navigation. Atomic A0, exit, and repair gates remain locked.
          </Text>
          <Row gap={7} wrap>
            {KC_ORDER.map((key, index) => {
              const unlocked = state.reached[key].length > 0;
              const disabled = !unlocked || navigationLocked;
              return (
                <span key={key}>
                  <Pill
                    active={state.current.kc === key}
                    disabled={disabled}
                    title={
                      disabled
                        ? 'Unavailable while the active gate is locked'
                        : `${KCS[key].id}: ${state.statuses[key]}`
                    }
                    onClick={
                      disabled
                        ? undefined
                        : () =>
                            navigateToReached(
                              key,
                              state.reached[key][state.reached[key].length - 1],
                            )
                    }
                  >
                    {index + 1}. {KCS[key].label}
                  </Pill>
                </span>
              );
            })}
          </Row>
          <Divider />
          <Row gap={6} wrap>
            {state.reached[state.current.kc].map((screen) => {
              const terminalAtomicTarget =
                state.statuses[state.current.kc] !== 'in_progress' &&
                isLockedSequenceScreen(screen) &&
                screen !== state.current.screen;
              const disabled =
                (navigationLocked && screen !== state.current.screen) || terminalAtomicTarget;
              return (
                <span key={screen}>
                  <Pill
                    size="sm"
                    active={state.current.screen === screen}
                    disabled={disabled}
                    title={disabled ? 'Atomic gate in progress' : 'Open reached checkpoint'}
                    onClick={
                      disabled ? undefined : () => navigateToReached(state.current.kc, screen)
                    }
                  >
                    {screenDefinition(screen)?.label ??
                      (screen === 'pause' ? 'Reviewer pause' : screen)}
                  </Pill>
                </span>
              );
            })}
          </Row>
        </Stack>
      </CollapsibleSection>
      <div role="tablist" aria-label="Reviewer sections">
        <Row gap={7} wrap>
          {reviewerTabs.map((tab) => (
            <span key={tab.id}>
              <Pill active={reviewerTab === tab.id} onClick={() => setReviewerTab(tab.id)}>
                {tab.label}
              </Pill>
            </span>
          ))}
        </Row>
      </div>
      <div role="status" aria-live="polite">
        <Text size="small" tone="tertiary">
          Reviewer section: {reviewerTabs.find((tab) => tab.id === reviewerTab)?.label}
        </Text>
      </div>

      <section style={{ display: reviewerTab === 'authority' ? 'block' : 'none' }}>
        <H2>Canonical authority lock</H2>
        <Text tone="secondary">
          Reviewer data are inline and immutable in this artifact. Runtime simulation state never
          changes canonical IDs, keys, source notes, or capstone ownership.
        </Text>
        <Table
          headers={['Entity', 'Canonical ID / relation', 'Bound record']}
          rows={CANONICAL_ROWS}
          striped
          style={{ marginTop: 10 }}
        />
      </section>

      <section style={{ display: reviewerTab === 'authority' ? 'block' : 'none' }}>
        <H2>KC contract and teaching order</H2>
        <Table
          headers={[
            'Order',
            'KC',
            'Verbatim canonical statement',
            'Authored learning objective',
            'Scope guard',
            'Target duration',
          ]}
          rows={KC_ORDER.map((key, index) => [
            String(index + 1),
            `${KCS[key].id} · ${KCS[key].label}`,
            KCS[key].canonicalStatement,
            KCS[key].competence,
            KCS[key].scope,
            KCS[key].duration,
          ])}
          striped
        />
        <Table
          headers={['Relation', 'ID / order', 'Meaning']}
          rows={GRAPH_ROWS}
          striped
          style={{ marginTop: 12 }}
        />
        <H3 style={{ marginTop: 14 }}>Normalized timing contract</H3>
        <Table
          headers={['Contract component', 'Normalized time', 'Included work']}
          rows={TIMING_CONTRACT_ROWS}
          striped
        />
      </section>

      <section style={{ display: reviewerTab === 'authority' ? 'block' : 'none' }}>
        <H2>Screen map</H2>
        <Text tone="secondary">
          The standard route begins with A2 support and reduces assistance only after correct fresh
          performance. Runtime exit IDs bind family and repair cycle. All rows are exposed
          simulation assets.
        </Text>
        {KC_ORDER.map((key, index) => (
          <div key={key}>
            <CollapsibleSection
              title={`${index + 1}. ${KCS[key].id} · ${KCS[key].label}`}
              count={
                SCREEN_DEFS.length +
                Object.keys(KCS[key].repairIds).length +
                (key === 'kc5' ? 2 : 1)
              }
              defaultOpen={index === 0}
              style={{ marginTop: 8 }}
            >
              <Table
                headers={['Screen', 'Phase', 'Duration', 'Bound asset']}
                rows={[
                  ...SCREEN_DEFS.map((screen) => {
                    let asset = 'Exact instructional copy';
                    if (screen.id === 'entry-1') asset = KCS[key].entryIds[0];
                    if (screen.id === 'entry-2') asset = KCS[key].entryIds[1];
                    if (screen.id in PHASE_QUESTION_SCREEN)
                      asset = KCS[key][PHASE_QUESTION_SCREEN[screen.id]];
                    if (screen.id.startsWith('exit-'))
                      asset = 'Runtime IDs: exit-A/B/C-near/changed-c0/1/2';
                    if (screen.id === 'fade-recovery-1') asset = KCS[key].recoveryIds[0];
                    if (screen.id === 'fade-recovery-2') asset = KCS[key].recoveryIds[1];
                    const misconceptionSignature = Object.values(ENTRY_MISCONCEPTION_PAIRS[key])[0];
                    const misconception = misconceptionSignature
                      ? MISCONCEPTION_INTERVENTIONS[misconceptionSignature]
                      : undefined;
                    if (
                      screen.id === 'misconception-model' ||
                      screen.id === 'misconception-contrast'
                    ) {
                      asset = misconception
                        ? `${misconceptionSignature} · exact route-specific copy`
                        : 'Not triggerable for this KC';
                    }
                    if (screen.id === 'misconception-confirm') {
                      asset = misconception?.confirmationId ?? 'Not triggerable for this KC';
                    }
                    if (screen.id === 'prerequisite-bridge') {
                      asset =
                        key === 'kc5'
                          ? 'hard-prerequisite-confound · exact bridge copy'
                          : 'Not triggerable for this KC';
                    }
                    if (screen.id === 'prerequisite-confirm') {
                      asset =
                        key === 'kc5'
                          ? PREREQUISITE_INTERVENTIONS['hard-prerequisite-confound'].confirmationId
                          : 'Not triggerable for this KC';
                    }
                    return [screen.label, screen.phase, screen.duration, asset];
                  }),
                  ...Object.entries(KCS[key].repairIds).map(([branch, ids]) => [
                    `Repair branch ${branch}`,
                    'Branch-specific repair',
                    '1.5 min per cycle',
                    `cycle 1 ${ids[0]} · cycle 2 ${ids[1]}`,
                  ]),
                  [
                    'Bounded pause',
                    'Reviewer handoff',
                    'Saved state',
                    'Appears after two failed repair cycles or exhausted exposed simulation inventory',
                  ],
                  ...(key === 'kc5'
                    ? [
                        [
                          'Simulation completion',
                          'Review close',
                          '<1 min',
                          'Derived only when all five statuses equal simulated_exit; mastery and V3-CAP-510781 excluded',
                        ],
                      ]
                    : []),
                ]}
                framed={false}
                striped
              />
            </CollapsibleSection>
          </div>
        ))}
      </section>

      <section style={{ display: reviewerTab === 'content' ? 'block' : 'none' }}>
        <H2>Exact keys and distractor rationales</H2>
        <Text tone="secondary">
          The 70 original interactions are retained. Ten fresh fading-recovery items, 20
          branch-and-cycle repair items, and four route-confirmation items make 104 exposed
          interactions. Every item is simulation-only.
        </Text>
        {KC_ORDER.map((key) => (
          <div key={key}>
            <CollapsibleSection
              title={`${KCS[key].id} item inventory`}
              count={ALL_QUESTIONS.filter((q) => q.kc === key).length}
            >
              <Table
                headers={['ID', 'Assistance / family', 'Prompt', 'Key']}
                rows={questionRows(key)}
                framed={false}
                striped
              />
              {ALL_QUESTIONS.filter((question) => question.kc === key).map((question) => (
                <div key={question.id}>
                  <CollapsibleSection
                    title={`${question.id} · ${question.family}`}
                    trailing={<Text size="small">Key {question.key}</Text>}
                  >
                    <Stack gap={8} style={{ paddingBottom: 10 }}>
                      <Text>
                        <Text as="span" weight="semibold">
                          Scenario:{' '}
                        </Text>
                        {question.scenario}
                      </Text>
                      <Text>
                        <Text as="span" weight="semibold">
                          Prompt:{' '}
                        </Text>
                        {question.prompt}
                      </Text>
                      <Table
                        headers={['Response', 'Exact choice', 'Exact feedback / rationale']}
                        rows={[
                          ...question.options.map((option) => [
                            option.id === question.key ? `${option.id} · KEY` : option.id,
                            option.text,
                            option.rationale,
                          ]),
                          ['NS', 'Not sure', questionOptions(question)[3].rationale],
                          [
                            'OMITTED',
                            'Commit pressed without a selection',
                            'Omission is stored explicitly; no choice is inferred. Standard support or repair follows.',
                          ],
                        ]}
                        framed={false}
                        rowTone={[
                          ...question.options.map((option) =>
                            option.id === question.key ? ('success' as const) : undefined,
                          ),
                          undefined,
                          undefined,
                        ]}
                      />
                      <Callout tone="info" title="Exact hint">
                        {question.hint}
                      </Callout>
                    </Stack>
                  </CollapsibleSection>
                </div>
              ))}
            </CollapsibleSection>
          </div>
        ))}
      </section>

      <section style={{ display: reviewerTab === 'content' ? 'block' : 'none' }}>
        <H2>Models, expert decisions, contrasts, and handoffs</H2>
        {KC_ORDER.map((key) => (
          <div key={key}>
            <CollapsibleSection
              title={`${KCS[key].id} authored microcycle`}
              defaultOpen={key === 'kc1'}
            >
              <Stack gap={12}>
                <H3>Direct model</H3>
                {KCS[key].model.map((paragraph) => (
                  <div key={paragraph}>
                    <Text>{paragraph}</Text>
                  </div>
                ))}
                <ModelTables kc={key} />
                <H3>Annotated expert decision</H3>
                <Table
                  headers={['Decision step', 'Exact copy']}
                  rows={KCS[key].expert.map((item) => [item.label, item.text])}
                  framed={false}
                />
                <H3>Contrast and boundary set</H3>
                <Table
                  headers={['Case', 'Decision']}
                  rows={KCS[key].contrasts.map((item) => [item.case, item.decision])}
                  framed={false}
                />
                <Callout tone="neutral" title="Exact handoff">
                  {KCS[key].handoff}
                </Callout>
              </Stack>
            </CollapsibleSection>
          </div>
        ))}
      </section>

      <section style={{ display: reviewerTab === 'logic' ? 'block' : 'none' }}>
        <H2>Deterministic repair branches</H2>
        <H3>Convergent entry signatures</H3>
        <Table
          headers={[
            'KC',
            'Committed response pair',
            'Route signature',
            'Why this is disambiguating',
          ]}
          rows={ENTRY_SIGNATURE_ROWS}
          striped
        />
        <H3 style={{ marginTop: 14 }}>Consequential route interventions</H3>
        <Table
          headers={['Persisted signature', 'Route checkpoints', 'Fresh confirmation']}
          rows={[
            ...Object.entries(MISCONCEPTION_INTERVENTIONS).map(([signature, intervention]) => [
              signature,
              `${intervention.title} → route contrast → confirmation`,
              intervention.confirmationId,
            ]),
            ...Object.entries(PREREQUISITE_INTERVENTIONS).map(([signature, intervention]) => [
              signature,
              intervention.title,
              intervention.confirmationId,
            ]),
          ]}
          striped
        />
        {Object.entries(MISCONCEPTION_INTERVENTIONS).map(([signature, intervention]) => (
          <div key={signature}>
            <CollapsibleSection title={`${signature} replacement copy`}>
              <Stack gap={8}>
                {intervention.model.map((paragraph) => (
                  <div key={paragraph}>
                    <Text>{paragraph}</Text>
                  </div>
                ))}
                <Table
                  headers={['Contrast case', 'Exact decision']}
                  rows={intervention.contrasts}
                  framed={false}
                  striped
                />
                <Text size="small" tone="secondary">
                  Fresh confirmation ID: {intervention.confirmationId}
                </Text>
              </Stack>
            </CollapsibleSection>
          </div>
        ))}
        {Object.entries(PREREQUISITE_INTERVENTIONS).map(([signature, intervention]) => (
          <div key={signature}>
            <CollapsibleSection title={`${signature} bridge copy`}>
              <Stack gap={8}>
                {intervention.model.map((paragraph) => (
                  <div key={paragraph}>
                    <Text>{paragraph}</Text>
                  </div>
                ))}
                <Text size="small" tone="secondary">
                  Fresh confirmation ID: {intervention.confirmationId}
                </Text>
              </Stack>
            </CollapsibleSection>
          </div>
        ))}
        <H3 style={{ marginTop: 14 }}>Performance-based fading rules</H3>
        <Table
          headers={['Observed performance', 'Deterministic transition']}
          rows={FADING_RULE_ROWS}
          striped
        />
        <H3 style={{ marginTop: 14 }}>Exit repair option maps</H3>
        {KC_ORDER.map((key) => (
          <div key={key}>
            <CollapsibleSection
              title={`${KCS[key].id} repair logic`}
              count={REPAIR_BRANCHES[key].length}
            >
              <Table
                headers={[
                  'Branch',
                  'Observed trigger',
                  'Tentative diagnosis',
                  'Replacement rule',
                  'Cycle-specific fresh IDs',
                ]}
                rows={REPAIR_BRANCHES[key].map((branch) => [
                  branch.id,
                  branch.trigger,
                  branch.diagnosis,
                  branch.replacement,
                  KCS[key].repairIds[branch.id].join(' → '),
                ])}
                framed={false}
                striped
              />
              <Text size="small" tone="secondary" style={{ marginTop: 8 }}>
                The failed option map selects and persists a branch ID before loading its
                cycle-specific item. Cycle 1 then opens family B; cycle 2 opens a different item in
                the selected cycle-2 branch then family C. No question is selected from cycle number
                alone.
              </Text>
              <Table
                headers={['Failed question:option', 'Mapped branch']}
                rows={Object.entries(REPAIR_OPTION_MAP[key]).map(([signature, branch]) => [
                  signature,
                  REPAIR_BRANCHES[key][branch].id,
                ])}
                framed={false}
                striped
                style={{ marginTop: 10 }}
              />
            </CollapsibleSection>
          </div>
        ))}
      </section>

      <section style={{ display: reviewerTab === 'logic' ? 'block' : 'none' }}>
        <H2>Simulation and event semantics</H2>
        <Callout tone="danger" title="Required event contract is not implemented">
          The local trace below is a UI debugging convenience. It is not versioned,
          server-timestamped, hash-chained, authenticated, or authoritative. Production evidence
          ingestion is blocked.
        </Callout>
        <Table
          headers={['Event', 'Trigger', 'Required payload', 'Decision meaning']}
          rows={EVENT_SEMANTICS_ROWS}
          striped
          style={{ marginTop: 10 }}
        />
        <H3 style={{ marginTop: 14 }}>Required versioned envelope</H3>
        <Table headers={['Field', 'Requirement', 'Meaning']} rows={EVENT_ENVELOPE_ROWS} striped />
        <H3 style={{ marginTop: 14 }}>Current nonauthoritative local trace</H3>
        <Table
          headers={['Seq', 'Event', 'KC / screen', 'Response · assistance', 'Decision context']}
          rows={state.events.map((event) => [
            String(event.seq),
            event.type,
            `${KCS[event.kc].id} · ${event.screen}`,
            [event.response, event.assistance].filter(Boolean).join(' · ') || '—',
            event.decisionContext,
          ])}
          striped
        />
      </section>

      <section style={{ display: reviewerTab === 'release' ? 'block' : 'none' }}>
        <H2>Accessibility contract</H2>
        <ol style={{ margin: 0, paddingLeft: 20, color: theme.text.primary }}>
          {ACCESSIBILITY_ITEMS.map((item) => (
            <li key={item} style={{ marginBottom: 7, lineHeight: '20px' }}>
              {item}
            </li>
          ))}
        </ol>
      </section>

      <section style={{ display: reviewerTab === 'release' ? 'block' : 'none' }}>
        <H2>Provenance and verification</H2>
        <Text tone="secondary">
          Curriculum authority: v3-learner-facing-lessons.csv, v3-canonical-kcs.csv,
          v3-clusters-and-groupings.json, v3-extensions-capstones-support.json,
          v3-prerequisite-edges.csv, v3-teaching-sequences.json,
          work/v3-authoritative-registry.json, and docs/design/mcat-complete-learning-flow.md.
          External sources below support methodological and ethics definitions. Scenarios were
          authored for this artifact; rights and similarity release gates remain PENDING.
        </Text>
        <Stack gap={8} style={{ marginTop: 10 }}>
          {SOURCES.map((source) => (
            <div
              key={source.url}
              style={{ borderBottom: `1px solid ${theme.stroke.tertiary}`, paddingBottom: 8 }}
            >
              <Link href={source.url}>{source.label}</Link>
              <Text size="small" tone="secondary">
                {source.use}
              </Text>
            </div>
          ))}
        </Stack>
        <Text size="small" tone="tertiary" style={{ marginTop: 10 }}>
          Verification note: summaries are educational, not legal or compliance advice. Local law,
          institutional policy, IRB/IACUC determinations, and protocol-specific facts govern actual
          research.
        </Text>
      </section>

      <section style={{ display: reviewerTab === 'release' ? 'block' : 'none' }}>
        <H2>Reviewer QA rubric</H2>
        <Table
          headers={['Gate', 'Acceptance criterion', 'Severity if failed']}
          rows={QA_ROWS}
          striped
        />
      </section>

      <section style={{ display: reviewerTab === 'release' ? 'block' : 'none' }}>
        <H2>Noncompensatory release gates</H2>
        <Callout tone="danger" title="Not releasable">
          Every gate must pass independently. A strong score elsewhere cannot compensate for a
          failed rights, similarity, blind-solve, provenance, or content-hash gate.
          reviewed_content_hash=PENDING.
        </Callout>
        <Table
          headers={['Gate', 'Acceptance criterion', 'Current state', 'Failure effect']}
          rows={RELEASE_GATE_ROWS}
          striped
          style={{ marginTop: 10 }}
        />
      </section>

      <section style={{ display: reviewerTab === 'release' ? 'block' : 'none' }}>
        <H2>Deterministic branch tests</H2>
        <Table
          headers={['Test', 'Given / when', 'Expected result']}
          rows={BRANCH_TEST_ROWS}
          striped
        />
      </section>

      <section style={{ display: reviewerTab === 'authority' ? 'block' : 'none' }}>
        <H2>Separate later capstone boundary</H2>
        <Callout tone="info" title="Dependency, not lesson completion">
          V3-CAP-510781 is associated with this cluster but owned and delivered later. This lesson
          supplies five prerequisite components; it does not simulate or award the capstone.
        </Callout>
        <Table
          headers={['Field', 'Canonical value']}
          rows={CAPSTONE_ROWS}
          striped
          style={{ marginTop: 10 }}
        />
        <H3 style={{ marginTop: 14 }}>Later capstone activity contract</H3>
        <Text>
          A future capstone may present a new study packet with protocol, participant flow, measure
          validation, results, uncertainty, and ethics notes. The learner must write one
          evidence-bounded conclusion, one application boundary, one unresolved alternative
          explanation, and one ethics/integrity action while coordinating all nine component KCs.
          Its items, responses, keys, and evidence ledger must remain separate from this Canvas.
        </Text>
      </section>
    </Stack>
  );
}

function LearnerMode({
  state,
  setState,
}: {
  state: LessonState;
  setState: (action: LessonState | ((previous: LessonState) => LessonState)) => void;
}) {
  const theme = useHostTheme();
  const kc = KCS[state.current.kc];
  const question = questionForScreen(state);
  const currentScreen = state.current.screen;
  const screenFocusRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    screenFocusRef.current?.focus();
  }, [currentScreen, kc.key]);
  const exitMeta = parseExitCheckpoint(currentScreen);
  const repairCycle = parseRepairCheckpoint(currentScreen);
  const committed = question ? Boolean(state.committed[question.id]) : true;
  const activeFamily = exitMeta?.familyIndex ?? state.exitFamily[kc.key];
  const currentPair = kc.exitIds[activeFamily];
  const pairQuestions: [Question, Question] = [
    questionById(currentPair.near),
    questionById(currentPair.changed),
  ];
  const pairCommitted = Boolean(
    state.committed[currentPair.near] && state.committed[currentPair.changed],
  );
  const entryQuestions: [Question, Question] = [
    questionById(kc.entryIds[0]),
    questionById(kc.entryIds[1]),
  ];
  const entryPairCommitted = Boolean(
    state.committed[kc.entryIds[0]] && state.committed[kc.entryIds[1]],
  );
  const feedbackVisible =
    question?.phase === 'entry'
      ? entryPairCommitted
      : question?.phase === 'exit'
        ? pairCommitted
        : true;
  const currentPart = KC_ORDER.indexOf(kc.key) + 1;
  const progressSegments = KC_ORDER.map((key) => ({
    id: key,
    value: state.statuses[key] === 'simulated_exit' || key === kc.key ? 1 : 0.001,
    color: state.statuses[key] === 'simulated_exit' ? ('green' as const) : ('blue' as const),
  }));
  const compactStudyMap = Boolean(question);
  const pairReviewAcknowledged = Boolean(state.pairReviewed[currentScreen]);
  const simulationComplete = currentScreen === 'simulation-complete' && allKcsExited(state);
  const routeSignature = state.routeSignatures[kc.key];
  const misconceptionIntervention = routeSignature
    ? MISCONCEPTION_INTERVENTIONS[routeSignature]
    : undefined;
  const prerequisiteIntervention = routeSignature
    ? PREREQUISITE_INTERVENTIONS[routeSignature]
    : undefined;
  const activeRepairBranch = repairCycle
    ? persistedRepairBranch(kc.key, currentScreen, state)
    : undefined;
  const isFadingGate =
    currentScreen === 'a2' ||
    currentScreen === 'a1' ||
    currentScreen === 'a0' ||
    currentScreen.startsWith('fade-recovery-');
  const activeFadingGateKey =
    isFadingGate && question ? fadingGateKey(kc.key, currentScreen, question.id) : undefined;
  const activeRouteGateKey =
    (currentScreen === 'misconception-confirm' || currentScreen === 'prerequisite-confirm') &&
    question
      ? `route:${fadingGateKey(kc.key, currentScreen, question.id)}`
      : undefined;
  const activeGateConsumed = Boolean(
    (activeFadingGateKey && state.consumedGates[activeFadingGateKey]) ||
      (activeRouteGateKey && state.consumedGates[activeRouteGateKey]),
  );

  const setAnswer = (questionId: string, response: string) => {
    setState((previous) => {
      if (previous.committed[questionId] || previous.manualPaused) return previous;
      let next = { ...previous, answers: { ...previous.answers, [questionId]: response } };
      next = addEvent(next, 'response_selected', {
        response,
        decisionContext: 'Nonauthoritative key-exposed rehearsal draft; editable until commitment',
      });
      return next;
    });
  };

  const requestHint = (target: Question) => {
    setState((previous) => {
      if (previous.committed[target.id] || previous.manualPaused) return previous;
      let next = { ...previous, hints: { ...previous.hints, [target.id]: true } };
      next = addEvent(next, 'hint_requested', {
        response: previous.answers[target.id],
        assistance:
          target.phase === 'exit'
            ? 'assisted exposed exit simulation'
            : `A${previous.supportLevel[target.kc]} plus requested hint`,
        decisionContext:
          target.phase === 'exit'
            ? 'Assisted exposed simulation requires a parallel family; outcome remains zero-weight'
            : 'Requested support prevents assistance fading on this item; local trace only',
      });
      return next;
    });
  };

  const commit = (target: Question) => {
    setState((previous) => {
      if (previous.committed[target.id] || previous.manualPaused) return previous;
      const response = previous.answers[target.id] ?? '__OMITTED__';
      const automaticSupport =
        target.phase === 'recovery' ||
        ((target.phase === 'A2' || target.phase === 'A1' || target.phase === 'A0') &&
          previous.supportLevel[target.kc] > 0);
      let next: LessonState = {
        ...previous,
        answers: { ...previous.answers, [target.id]: response },
        committed: { ...previous.committed, [target.id]: true },
      };
      next = addEvent(next, 'attempt_submitted', {
        response,
        assistance: previous.hints[target.id]
          ? 'requested hint'
          : automaticSupport
            ? `planned A${previous.supportLevel[target.kc]} support`
            : 'no in-screen assistance; still key-exposed simulation',
        decisionContext: `${target.phase} ${target.family}; correctness=${response === target.key}; simulated=true; exposed=true`,
      });
      return next;
    });
  };

  const go = (targetKc: KcKey, screen: string, context: string, allowLockedTransition = false) => {
    setState((previous) => {
      if (
        isLockedSequenceScreen(previous.current.screen) &&
        !allowLockedTransition &&
        (previous.current.kc !== targetKc || previous.current.screen !== screen)
      ) {
        return addEvent(previous, 'navigation_blocked', {
          decisionContext: 'Exit/repair sequence is atomic; checkpoint navigation cannot bypass it',
        });
      }
      if (
        previous.statuses[targetKc] !== 'in_progress' &&
        isLockedSequenceScreen(screen) &&
        !allowLockedTransition
      ) {
        return addEvent(previous, 'navigation_blocked', {
          decisionContext:
            'Terminal simulated-exit/pause status permits review in Reviewer mode, not re-entry into atomic checkpoints',
        });
      }
      let next = withReached(previous, targetKc, screen);
      next = addEvent(next, 'checkpoint_opened', {
        kc: targetKc,
        screen,
        decisionContext: context,
      });
      return next;
    });
  };

  const acknowledgePairReview = () => {
    setState((previous) => {
      if (!parseExitCheckpoint(previous.current.screen) || !pairCommitted) return previous;
      const next: LessonState = {
        ...previous,
        pairReviewed: { ...previous.pairReviewed, [previous.current.screen]: true },
      };
      return addEvent(next, 'exit_pair_reviewed', {
        decisionContext: `checkpoint=${previous.current.screen}; both responses, keys, and rationales exposed; zero evidentiary weight`,
      });
    });
  };

  const evaluateExit = () => {
    setState((previous) => {
      const key = previous.current.kc;
      if (previous.statuses[key] !== 'in_progress') return previous;
      const parsed = parseExitCheckpoint(previous.current.screen);
      if (!parsed || parsed.kind !== 'changed' || !previous.pairReviewed[previous.current.screen])
        return previous;
      const content = KCS[key];
      const familyIndex = parsed.familyIndex;
      const pair = content.exitIds[familyIndex];
      const near = questionById(pair.near);
      const changed = questionById(pair.changed);
      const bothCorrect = questionCorrect(near, previous) && questionCorrect(changed, previous);
      const unassisted = !previous.hints[near.id] && !previous.hints[changed.id];
      let next = addEvent(previous, 'exit_pair_evaluated', {
        response: `near=${previous.answers[near.id]}; changed=${previous.answers[changed.id]}`,
        assistance: unassisted ? 'unassisted but key-exposed' : 'assisted and key-exposed',
        decisionContext: `family=${String.fromCharCode(65 + familyIndex)}; cycle=${parsed.cycle}; bothCorrect=${bothCorrect}; unassisted=${unassisted}; simulated=true`,
      });
      if (bothCorrect && unassisted) {
        next = withMonotonicStatus(next, key, 'simulated_exit');
        next = withReached(next, key, 'handoff');
        return addEvent(next, 'kc_simulated_exit', {
          screen: 'handoff',
          decisionContext:
            'Flow criterion met inside key-exposed simulation; no mastery, readiness, or evidence write',
        });
      }
      if (!unassisted) {
        if (familyIndex < 2) {
          const nextFamily = familyIndex + 1;
          next = { ...next, exitFamily: { ...next.exitFamily, [key]: nextFamily } };
          const nextScreen = exitCheckpointId(nextFamily, 'near', previous.repairCycles[key]);
          next = withReached(next, key, nextScreen);
          return addEvent(next, 'exit_pair_replaced', {
            screen: nextScreen,
            assistance: 'prior pair assisted and exposed',
            decisionContext: 'Parallel exposed family substituted without a repair-cycle diagnosis',
          });
        }
        next = withMonotonicStatus(next, key, 'paused');
        next = {
          ...next,
          pauseReason: {
            ...next.pauseReason,
            [key]:
              'All authored exit families are exposed and received assistance. Author another simulation family before continuing QA.',
          },
        };
        next = withReached(next, key, 'pause');
        return addEvent(next, 'kc_paused', {
          screen: 'pause',
          decisionContext: 'Exposed simulation inventory exhausted; no evidentiary inference made',
        });
      }
      if (previous.repairCycles[key] < 2 && familyIndex < 2) {
        const cycle = previous.repairCycles[key] + 1;
        const nextFamily = familyIndex + 1;
        next = {
          ...next,
          repairCycles: { ...next.repairCycles, [key]: cycle },
          exitFamily: { ...next.exitFamily, [key]: nextFamily },
        };
        const repairScreen = repairCheckpointId(cycle);
        const branch = repairBranch(key, next);
        next = {
          ...next,
          selectedRepairBranches: {
            ...next.selectedRepairBranches,
            [repairSelectionKey(key, repairScreen)]: branch.id,
          },
        };
        next = withReached(next, key, repairScreen);
        const repairQuestionId = content.repairIds[branch.id][cycle - 1];
        return addEvent(next, 'repair_started', {
          screen: repairScreen,
          decisionContext: `cycle=${cycle}; failedOptionIds=${failedRepairSignatures(key, next).join(',')}; persistedBranch=${branch.id}; repairQuestionId=${repairQuestionId}; direct option-ID map; nextFamily=${String.fromCharCode(65 + nextFamily)}; simulated=true`,
        });
      }
      next = withMonotonicStatus(next, key, 'paused');
      next = {
        ...next,
        pauseReason: {
          ...next.pauseReason,
          [key]:
            'Two bounded repair cycles or all three exposed families were exhausted without a simulated exit.',
        },
      };
      next = withReached(next, key, 'pause');
      return addEvent(next, 'kc_paused', {
        screen: 'pause',
        decisionContext: 'Repair/inventory cap reached; quality-review stop; no infinite loop',
      });
    });
  };

  const advanceFading = (expectedKc: KcKey, expectedScreen: string, expectedQuestionId: string) => {
    setState((previous) => {
      const key = previous.current.kc;
      if (
        key !== expectedKc ||
        previous.current.screen !== expectedScreen ||
        previous.statuses[key] !== 'in_progress'
      ) {
        return previous;
      }
      const activeQuestion = questionForScreen(previous);
      if (
        !activeQuestion ||
        activeQuestion.id !== expectedQuestionId ||
        !previous.committed[activeQuestion.id]
      ) {
        return previous;
      }
      const gateKey = fadingGateKey(key, expectedScreen, activeQuestion.id);
      if (previous.consumedGates[gateKey]) return previous;
      const success =
        questionCorrect(activeQuestion, previous) && !previous.hints[activeQuestion.id];
      const currentLevel = previous.supportLevel[key];
      const nextLevel = success
        ? (Math.max(0, currentLevel - 1) as SupportLevel)
        : currentLevel === 0
          ? 1
          : currentLevel;
      let next: LessonState = {
        ...previous,
        supportLevel: { ...previous.supportLevel, [key]: nextLevel },
        consumedGates: { ...previous.consumedGates, [gateKey]: true },
      };
      let nextScreen = 'contrast';
      if (previous.current.screen === 'a2') nextScreen = 'a1';
      if (previous.current.screen === 'a1') nextScreen = 'a0';
      if (previous.current.screen === 'a0')
        nextScreen = nextLevel === 0 ? 'contrast' : 'fade-recovery-1';
      if (previous.current.screen === 'fade-recovery-1')
        nextScreen = nextLevel === 0 ? 'contrast' : 'fade-recovery-2';
      if (previous.current.screen === 'fade-recovery-2' && nextLevel > 0) {
        next = withMonotonicStatus(next, key, 'paused');
        next = {
          ...next,
          pauseReason: {
            ...next.pauseReason,
            [key]:
              'Two fresh supported recovery interactions did not reach A0. Additional authored recovery is required before exit simulation.',
          },
        };
        next = withReached(next, key, 'pause');
        return addEvent(next, 'kc_paused', {
          screen: 'pause',
          decisionContext: `Fading gate stopped at A${nextLevel}; no fixed-sequence advancement to exit`,
        });
      }
      next = withReached(next, key, nextScreen);
      return addEvent(next, 'assistance_level_updated', {
        screen: nextScreen,
        assistance: `A${currentLevel}→A${nextLevel}`,
        decisionContext: `gate=${gateKey}; freshItem=${activeQuestion.id}; correct=${questionCorrect(activeQuestion, previous)}; requestedHint=${Boolean(previous.hints[activeQuestion.id])}; consumed=true`,
      });
    });
  };

  const continueLesson = () => {
    if (state.manualPaused) return;
    if (currentScreen === 'entry-1') {
      go(
        kc.key,
        'entry-2',
        'First entry response committed; feedback withheld; second probe opened',
      );
      return;
    }
    if (currentScreen === 'entry-2') {
      setState((previous) => {
        if (!previous.committed[kc.entryIds[0]] || !previous.committed[kc.entryIds[1]])
          return previous;
        let route = routeFor(kc.key, previous);
        let routeSignature = routeSignatureFor(kc.key, previous, route);
        if (
          (route === 'misconception' &&
            (!routeSignature || !MISCONCEPTION_INTERVENTIONS[routeSignature])) ||
          (route === 'prerequisite' &&
            (!routeSignature || !PREREQUISITE_INTERVENTIONS[routeSignature]))
        ) {
          route = 'standard';
          routeSignature = undefined;
        }
        let next: LessonState = {
          ...previous,
          routes: { ...previous.routes, [kc.key]: route },
          supportLevel: { ...previous.supportLevel, [kc.key]: route === 'concise' ? 0 : 2 },
          routeSignatures: routeSignature
            ? { ...previous.routeSignatures, [kc.key]: routeSignature }
            : previous.routeSignatures,
        };
        next = withReached(next, kc.key, 'route');
        return addEvent(next, 'route_selected', {
          screen: 'route',
          decisionContext: `route=${route}; bothCommitted=true; entryResponses=${previous.answers[kc.entryIds[0]]}|${previous.answers[kc.entryIds[1]]}; persistedIntervention=${routeSignature ?? 'none'}`,
        });
      });
      return;
    }
    if (currentScreen === 'route') {
      if (state.routes[kc.key] === 'misconception' && state.routeSignatures[kc.key]) {
        go(
          kc.key,
          'misconception-model',
          'Persisted misconception signature opened its replacement model',
        );
        return;
      }
      if (state.routes[kc.key] === 'prerequisite' && state.routeSignatures[kc.key]) {
        go(
          kc.key,
          'prerequisite-bridge',
          'Persisted hard-prerequisite signature opened its bridge',
        );
        return;
      }
    }
    if (currentScreen === 'misconception-model') {
      go(
        kc.key,
        'misconception-contrast',
        'Replacement model completed; route-specific contrast opened',
      );
      return;
    }
    if (currentScreen === 'misconception-contrast') {
      go(
        kc.key,
        'misconception-confirm',
        'Replacement contrast completed; fresh confirmation opened',
      );
      return;
    }
    if (currentScreen === 'prerequisite-bridge') {
      go(
        kc.key,
        'prerequisite-confirm',
        'Hard-prerequisite bridge completed; fresh confirmation opened',
      );
      return;
    }
    if (currentScreen === 'misconception-confirm' || currentScreen === 'prerequisite-confirm') {
      if (!question) return;
      setState((previous) => {
        if (previous.current.kc !== kc.key || previous.current.screen !== currentScreen)
          return previous;
        const activeQuestion = questionForScreen(previous);
        if (
          !activeQuestion ||
          activeQuestion.id !== question.id ||
          !previous.committed[activeQuestion.id]
        )
          return previous;
        const gateKey = `route:${fadingGateKey(kc.key, currentScreen, activeQuestion.id)}`;
        if (previous.consumedGates[gateKey]) return previous;
        let next: LessonState = {
          ...previous,
          consumedGates: { ...previous.consumedGates, [gateKey]: true },
        };
        next = withReached(next, kc.key, 'model');
        return addEvent(next, 'route_intervention_confirmed', {
          screen: 'model',
          response: previous.answers[activeQuestion.id],
          decisionContext: `gate=${gateKey}; signature=${previous.routeSignatures[kc.key]}; correct=${questionCorrect(activeQuestion, previous)}; distinct intervention consumed=true`,
        });
      });
      return;
    }
    if (exitMeta?.kind === 'changed') {
      evaluateExit();
      return;
    }
    if (exitMeta?.kind === 'near') {
      go(
        kc.key,
        exitCheckpointId(exitMeta.familyIndex, 'changed', exitMeta.cycle),
        'Near-use response locked without feedback; family/cycle-matched changed task opened',
        true,
      );
      return;
    }
    if (repairCycle) {
      go(
        kc.key,
        exitCheckpointId(state.exitFamily[kc.key], 'near', repairCycle),
        `Repair cycle ${repairCycle} committed; next exposed family opened atomically`,
        true,
      );
      return;
    }
    if (
      currentScreen === 'a2' ||
      currentScreen === 'a1' ||
      currentScreen === 'a0' ||
      currentScreen.startsWith('fade-recovery-')
    ) {
      if (question) advanceFading(kc.key, currentScreen, question.id);
      return;
    }
    if (currentScreen === 'contrast') {
      go(
        kc.key,
        exitCheckpointId(0, 'near', 0),
        'Contrast complete; exposed family A simulation opened',
        true,
      );
      return;
    }
    if (currentScreen === 'handoff') {
      const index = KC_ORDER.indexOf(kc.key);
      if (state.statuses[kc.key] !== 'simulated_exit') return;
      if (index < KC_ORDER.length - 1) {
        const nextKc = KC_ORDER[index + 1];
        setState((previous) => {
          let next = withMonotonicStatus(previous, nextKc, 'in_progress');
          const targetScreen =
            next.reached[nextKc].length > 0
              ? next.reached[nextKc][next.reached[nextKc].length - 1]
              : 'entry-1';
          next = withReached(next, nextKc, targetScreen);
          return addEvent(next, 'kc_handoff', {
            kc: nextKc,
            screen: targetScreen,
            decisionContext: `${kc.id} simulated_exit preserved; ${KCS[nextKc].id} opened without regressing any status`,
          });
        });
      } else {
        setState((previous) => {
          if (!allKcsExited(previous)) {
            return addEvent(previous, 'completion_blocked', {
              decisionContext:
                'Simulation completion requires every KC status to equal simulated_exit',
            });
          }
          const next = withReached(previous, kc.key, 'simulation-complete');
          return addEvent(next, 'lesson_simulation_completed', {
            screen: 'simulation-complete',
            decisionContext:
              'Derived from five simulated_exit statuses; exposed=true; evidenceWeight=0; capstoneExcluded=true',
          });
        });
      }
      return;
    }
    const route = state.routes[kc.key];
    const nextScreen =
      route === 'concise' ? nextConciseScreen(currentScreen) : nextStandardScreen(currentScreen);
    go(kc.key, nextScreen, `${route} simulation route advanced`);
  };

  const canContinue =
    !state.manualPaused &&
    (state.statuses[kc.key] === 'in_progress' || currentScreen === 'handoff') &&
    currentScreen !== 'pause' &&
    (!question || committed) &&
    !activeGateConsumed &&
    (currentScreen !== 'entry-2' || entryPairCommitted) &&
    (exitMeta?.kind !== 'changed' || (pairCommitted && pairReviewAcknowledged));

  const continueLabel = (() => {
    if (currentScreen === 'entry-1') return 'Next starting question';
    if (currentScreen === 'entry-2') return 'See my focus';
    if (currentScreen === 'route') return ROUTE_COPY[state.routes[kc.key]].next;
    if (currentScreen === 'misconception-model') return 'See a worked contrast';
    if (currentScreen === 'misconception-contrast') return 'Try the corrected rule';
    if (currentScreen === 'misconception-confirm')
      return activeGateConsumed ? 'Continue from the next step' : 'Continue to the lesson';
    if (currentScreen === 'prerequisite-bridge') return 'Try the common-cause rule';
    if (currentScreen === 'prerequisite-confirm')
      return activeGateConsumed ? 'Continue from the next step' : 'Continue to the lesson';
    if (exitMeta?.kind === 'near') return 'Next question';
    if (exitMeta?.kind === 'changed' && pairCommitted) {
      const unassisted = !state.hints[currentPair.near] && !state.hints[currentPair.changed];
      if (!pairReviewAcknowledged) return 'Review both answers first';
      if (!unassisted) return activeFamily < 2 ? 'Try a fresh pair' : 'Pause and review';
      if (questionCorrect(pairQuestions[0], state) && questionCorrect(pairQuestions[1], state))
        return 'Finish this section';
      return state.repairCycles[kc.key] < 2 && activeFamily < 2
        ? 'Review the decision rule'
        : 'Pause and review';
    }
    if (repairCycle) return 'Try a fresh pair';
    if (currentScreen === 'handoff')
      return kc.key === 'kc5' ? 'Finish lesson' : 'Continue to the next part';
    if (currentScreen === 'model') return 'See the worked example';
    if (currentScreen === 'worked')
      return state.routes[kc.key] === 'concise' ? 'Work on my own' : 'Try the rule together';
    if (currentScreen === 'contrast') return 'Start on my own';
    return 'Continue';
  })();

  if (simulationComplete) {
    return (
      <Stack gap={18}>
        <Callout tone="success" title="You completed the CBR-24 study">
          You followed one study from a testable question to a conclusion that stays inside the
          design and the data.
        </Callout>
        <Grid columns="repeat(auto-fit, minmax(min(100%, 180px), 1fr))" gap={12}>
          <Stat value="5 / 5" label="Research-design parts" tone="success" />
          <Stat value="1" label="Connected study story" />
        </Grid>
        <H2>What you practiced</H2>
        <Text>
          You matched claims to measurements, identified variable roles, separated sampling from
          assignment, matched participant risks to safeguards, and bounded a causal conclusion.
        </Text>
        <Cbr24StudyFlow currentKc="kc5" compact={false} />
      </Stack>
    );
  }

  return (
    <Stack gap={16}>
      <div role="status" aria-live="polite">
        <Text size="small" tone="tertiary">
          Now: {learnerScreenLabel(kc.key, currentScreen)}. Part {currentPart} of 5.
        </Text>
      </div>
      <section aria-label="Lesson progress">
        <UsageBar
          total={5}
          segments={progressSegments}
          topLeftLabel={`Part ${currentPart} of 5`}
          topRightLabel={LEARNER_KC_COPY[kc.key].title}
        />
      </section>

      {state.manualPaused ? (
        <div
          style={{
            borderLeft: `3px solid ${theme.accent.primary}`,
            padding: '8px 10px',
            background: theme.fill.quaternary,
          }}
        >
          <Text>
            <Text as="span" weight="semibold">
              Lesson paused.{' '}
            </Text>
            Your place is saved.
          </Text>
        </div>
      ) : null}

      <Cbr24StudyFlow currentKc={kc.key} compact={compactStudyMap} />

      <Card size="lg">
        <CardHeader
          trailing={
            <Text size="small" tone="tertiary">
              Part {currentPart} of 5
            </Text>
          }
        >
          {learnerScreenLabel(kc.key, currentScreen)}
        </CardHeader>
        <CardBody>
          <div
            key={`${kc.key}-${currentScreen}`}
            ref={screenFocusRef}
            tabIndex={-1}
            aria-label={`${LEARNER_KC_COPY[kc.key].title}. ${learnerScreenLabel(kc.key, currentScreen)}`}
          >
            <Stack gap={14}>
              <div>
                <Text size="small" tone="tertiary">
                  CBR-24 research design
                </Text>
                <H2 style={{ marginTop: 4 }}>{LEARNER_KC_COPY[kc.key].title}</H2>
              </div>

              {repairCycle && activeRepairBranch ? (
                <div
                  style={{
                    borderLeft: `3px solid ${theme.accent.primary}`,
                    padding: '10px 12px',
                    background: theme.fill.quaternary,
                  }}
                >
                  <Text weight="semibold">Let’s revisit one decision</Text>
                  <Text>{activeRepairBranch.diagnosis}</Text>
                  <Text style={{ marginTop: 6 }}>
                    <Text as="span" weight="semibold">
                      Use this rule:{' '}
                    </Text>
                    {activeRepairBranch.replacement}
                  </Text>
                </div>
              ) : null}

              {question &&
              (question.phase === 'A2' ||
                question.phase === 'A1' ||
                question.phase === 'A0' ||
                question.phase === 'recovery') &&
              state.supportLevel[kc.key] > 0 ? (
                <div
                  style={{
                    borderLeft: `3px solid ${theme.accent.primary}`,
                    padding: '8px 10px',
                    background: theme.fill.quaternary,
                  }}
                >
                  <Text size="small">
                    <Text as="span" weight="semibold">
                      Focus cue:{' '}
                    </Text>
                    {state.supportLevel[kc.key] === 2
                      ? `${question.hint} Say which detail decides the answer before you choose.`
                      : question.hint}
                  </Text>
                </div>
              ) : null}

              {question ? (
                <ChoiceList
                  question={question}
                  state={state}
                  paused={state.manualPaused}
                  feedbackVisible={feedbackVisible}
                  onSelect={setAnswer}
                  onCommit={commit}
                  onHint={requestHint}
                />
              ) : null}

              {currentScreen === 'entry-2' && entryPairCommitted ? (
                <CompletePairReview
                  title="Review your starting point"
                  questions={entryQuestions}
                  state={state}
                />
              ) : null}

              {exitMeta?.kind === 'changed' && pairCommitted ? (
                <Stack gap={10}>
                  <CompletePairReview
                    title="Review both answers"
                    questions={pairQuestions}
                    state={state}
                  />
                  <Button
                    variant="secondary"
                    disabled={pairReviewAcknowledged}
                    style={{ width: 'min(100%, 320px)' }}
                    onClick={acknowledgePairReview}
                  >
                    {pairReviewAcknowledged ? 'Answers reviewed' : 'I reviewed both answers'}
                  </Button>
                </Stack>
              ) : null}

              {currentScreen === 'route' ? (
                <Callout
                  tone={state.routes[kc.key] === 'prerequisite' ? 'warning' : 'info'}
                  title={ROUTE_COPY[state.routes[kc.key]].title}
                >
                  {ROUTE_COPY[state.routes[kc.key]].body}
                </Callout>
              ) : null}

              {currentScreen === 'misconception-model' && misconceptionIntervention ? (
                <Stack gap={10}>
                  <H3>{misconceptionIntervention.title}</H3>
                  {misconceptionIntervention.model.map((paragraph) => (
                    <div key={paragraph}>
                      <Text>{paragraph}</Text>
                    </div>
                  ))}
                </Stack>
              ) : null}

              {currentScreen === 'misconception-contrast' && misconceptionIntervention ? (
                <Stack gap={10}>
                  <Text>
                    Compare the same idea in two cases. The relationship in the study—not the topic
                    word—decides the answer.
                  </Text>
                  {misconceptionIntervention.contrasts.map(([caseLabel, decision]) => (
                    <div
                      key={caseLabel}
                      style={{
                        border: `1px solid ${theme.stroke.tertiary}`,
                        borderRadius: 8,
                        padding: 10,
                        background: theme.fill.quaternary,
                      }}
                    >
                      <Text size="small" tone="tertiary" weight="semibold">
                        {caseLabel}
                      </Text>
                      <Text style={{ marginTop: 4 }}>{decision}</Text>
                    </div>
                  ))}
                </Stack>
              ) : null}

              {currentScreen === 'prerequisite-bridge' && prerequisiteIntervention ? (
                <Stack gap={10}>
                  <H3>{prerequisiteIntervention.title}</H3>
                  {prerequisiteIntervention.model.map((paragraph) => (
                    <div key={paragraph}>
                      <Text>{paragraph}</Text>
                    </div>
                  ))}
                  <div
                    style={{
                      border: `1px solid ${theme.stroke.tertiary}`,
                      borderRadius: 8,
                      padding: 10,
                      background: theme.fill.quaternary,
                    }}
                  >
                    <Text size="small" tone="tertiary" weight="semibold">
                      Worked CBR-24 check
                    </Text>
                    <Text style={{ marginTop: 4 }}>
                      Motivation exists before routine choice and can affect both choice and quiz
                      score. That makes it a common cause. Stress relief after the assigned routine
                      would instead be a possible mediator.
                    </Text>
                  </div>
                </Stack>
              ) : null}

              {currentScreen === 'model' ? (
                <Stack gap={10}>
                  <Callout tone="info" title="Decision rule">
                    {kc.model[0]}
                  </Callout>
                  <Text>{kc.model[1]}</Text>
                  <CollapsibleSection title="Definitions, details, and common traps">
                    <Stack gap={10}>
                      <Text>{kc.model[2]}</Text>
                      <ModelTables kc={kc.key} />
                    </Stack>
                  </CollapsibleSection>
                </Stack>
              ) : null}

              {currentScreen === 'worked' ? (
                <Stack gap={8}>
                  <Text>Watch the decision unfold before trying a new case.</Text>
                  {kc.expert.map((item) => (
                    <div
                      key={item.label}
                      style={{
                        border: `1px solid ${theme.stroke.tertiary}`,
                        borderRadius: 8,
                        padding: 10,
                        background: theme.fill.quaternary,
                      }}
                    >
                      <Text size="small" tone="tertiary" weight="semibold">
                        {item.label}
                      </Text>
                      <Text style={{ marginTop: 4 }}>{item.text}</Text>
                    </div>
                  ))}
                </Stack>
              ) : null}

              {currentScreen === 'contrast' ? (
                <Stack gap={8}>
                  <Text>
                    Tempting answers often use a nearby concept or make the claim too broad. Compare
                    each case with the decision it actually supports.
                  </Text>
                  {kc.contrasts.map((item) => (
                    <div
                      key={item.case}
                      style={{
                        border: `1px solid ${theme.stroke.tertiary}`,
                        borderRadius: 8,
                        padding: 10,
                        background: theme.fill.quaternary,
                      }}
                    >
                      <Text size="small" tone="tertiary" weight="semibold">
                        {item.case}
                      </Text>
                      <Text style={{ marginTop: 4 }}>{item.decision}</Text>
                    </div>
                  ))}
                </Stack>
              ) : null}

              {currentScreen === 'handoff' ? (
                <Callout tone="success" title="Ready for the next focus">
                  {LEARNER_KC_COPY[kc.key].handoff}
                </Callout>
              ) : null}

              {currentScreen === 'pause' ? (
                <Callout tone="warning" title="Pause and review">
                  You have used the available examples for this idea. Revisit the decision rule with
                  an instructor or reviewer before continuing.
                </Callout>
              ) : null}

              <Divider />
              <Stack gap={8}>
                {currentScreen !== 'pause' ? (
                  <Button
                    variant="primary"
                    disabled={!canContinue}
                    style={{ width: 'min(100%, 320px)' }}
                    onClick={continueLesson}
                  >
                    {continueLabel}
                  </Button>
                ) : null}
                <Text size="small" tone="tertiary">
                  {question && !committed
                    ? 'Check an answer to continue. “Not sure” is always available.'
                    : 'Your place is saved automatically.'}
                </Text>
              </Stack>
            </Stack>
          </div>
        </CardBody>
      </Card>
    </Stack>
  );
}

interface ResearchDesignLessonCanvasProps {
  reviewMode: boolean;
}

export default function ResearchDesignLessonCanvas({
  reviewMode,
}: ResearchDesignLessonCanvasProps) {
  const theme = useHostTheme();
  const [state, setState] = useCanvasState<LessonState>('mcat-rdi-lesson-state-v3', freshState());
  const [identity, setIdentity] = useCanvasState<AuditIdentity>('mcat-rdi-audit-identity-v1', {
    contentVersion: 'CBR24-RDI-1.2-INTERNAL',
    exposureVersion: 'KEY-EXPOSED-v2',
    reviewRunId: 'RDI-INTERNAL-QR-001',
    rehearsalRun: 1,
    reviewedContentHash: 'PENDING',
    exposedQuestionIds: [],
  });
  const [resetArmed, setResetArmed] = useCanvasState<boolean>('mcat-rdi-reset-armed-v1', false);
  const mode: Mode = reviewMode ? 'reviewer' : 'learner';
  const activeState = state.version === 3 ? state : freshState();
  const activeIdentity: AuditIdentity = {
    ...identity,
    contentVersion: 'CBR24-RDI-1.2-INTERNAL',
    exposureVersion: 'KEY-EXPOSED-v2',
    exposedQuestionIds: Array.from(new Set(identity.exposedQuestionIds ?? [])),
  };
  const reviewReady =
    reviewMode && activeIdentity.exposedQuestionIds.length === ALL_QUESTIONS.length;

  useEffect(() => {
    if (!reviewMode) return;
    setIdentity((previous) => {
      const exposedQuestionIds = Array.from(
        new Set([
          ...(previous.exposedQuestionIds ?? []),
          ...ALL_QUESTIONS.map((question) => question.id),
        ]),
      );
      if (exposedQuestionIds.length === previous.exposedQuestionIds.length) return previous;
      return { ...previous, exposedQuestionIds };
    });
  }, [reviewMode, setIdentity]);

  const togglePause = () => {
    setState((previous) => {
      let next = { ...previous, manualPaused: !previous.manualPaused };
      next = addEvent(next, next.manualPaused ? 'lesson_paused' : 'lesson_resumed', {
        decisionContext: next.manualPaused
          ? 'Reviewer requested a resumable simulation pause; atomic gates remain locked'
          : 'Reviewer resumed the saved key-exposed rehearsal',
      });
      return next;
    });
  };

  const reset = () => {
    if (!resetArmed) {
      setResetArmed(true);
      return;
    }
    setState(freshState());
    setIdentity((previous) => ({
      ...previous,
      contentVersion: 'CBR24-RDI-1.2-INTERNAL',
      exposureVersion: 'KEY-EXPOSED-v2',
      rehearsalRun: previous.rehearsalRun + 1,
      exposedQuestionIds: Array.from(new Set(previous.exposedQuestionIds ?? [])),
    }));
    setResetArmed(false);
  };

  return (
    <main
      style={{
        minHeight: '100%',
        background: theme.bg.editor,
        color: theme.text.primary,
        padding: 'clamp(16px, 3vw, 32px)',
      }}
    >
      <Stack gap={22} style={{ maxWidth: 1320, margin: '0 auto' }}>
        <header
          style={{
            borderLeft: `3px solid ${theme.accent.primary}`,
            paddingLeft: 14,
          }}
        >
          <Row gap={12} justify="space-between" align="start" wrap>
            <div style={{ minWidth: 0, flex: '1 1 560px' }}>
              <Text size="small" tone="tertiary" weight="semibold">
                {mode === 'learner'
                  ? 'MCAT RESEARCH DESIGN · CBR-24'
                  : 'V3-LES-765609 · INTERNAL QUALITY REVIEW · KEY-EXPOSED'}
              </Text>
              <H1>
                {mode === 'learner'
                  ? 'Build a conclusion the study can support'
                  : 'Research Questions, Design, and Inference Limits'}
              </H1>
              <Text tone="secondary" style={{ maxWidth: 820 }}>
                {mode === 'learner'
                  ? 'Follow one study from its research question through participants, variables, measurements, result, and the limits of its conclusion.'
                  : 'Rehearse and audit one CBR-24 learning flow: question → variables → sample and measures → ethics → causal limit. This dual-mode artifact is not learner evidence.'}
              </Text>
            </div>
          </Row>
        </header>

        {reviewReady ? (
          <Callout
            tone="danger"
            title="Internal quality-review artifact · outcomes are simulated/exposed"
          >
            All 70 core interactions, 10 fading recoveries, 20 additional branch-and-cycle repairs,
            four route confirmations, keys, and rationales coexist in this Canvas (
            {activeIdentity.exposedQuestionIds.length} exposed IDs). Run{' '}
            {activeIdentity.reviewRunId} · rehearsal {activeIdentity.rehearsalRun} ·{' '}
            {activeIdentity.exposureVersion}. No outcome is eligible for learner evidence,
            readiness, mastery, or capstone credit. reviewed_content_hash=
            {activeIdentity.reviewedContentHash}.
          </Callout>
        ) : null}

        <Row gap={8} justify="space-between" align="center" wrap>
          <Row gap={8} wrap>
            <Button
              variant="secondary"
              disabled={activeState.current.screen === 'simulation-complete'}
              onClick={togglePause}
            >
              {mode === 'learner'
                ? activeState.manualPaused
                  ? 'Resume lesson'
                  : 'Pause lesson'
                : activeState.manualPaused
                  ? 'Resume rehearsal'
                  : 'Pause rehearsal'}
            </Button>
            <Button variant={resetArmed ? 'primary' : 'ghost'} onClick={reset}>
              {mode === 'learner'
                ? resetArmed
                  ? 'Confirm start over'
                  : 'Start over'
                : resetArmed
                  ? 'Confirm rehearsal reset'
                  : 'Reset rehearsal'}
            </Button>
            {resetArmed ? (
              <Button variant="ghost" onClick={() => setResetArmed(false)}>
                Cancel reset
              </Button>
            ) : null}
          </Row>
          <Text size="small" tone="tertiary">
            {mode === 'learner'
              ? 'Your place saves automatically.'
              : 'Persistent exposed rehearsal · exact commitment · zero evidentiary weight'}
          </Text>
        </Row>

        {resetArmed && mode === 'reviewer' ? (
          <Callout tone="danger" title="Reset is armed">
            Confirming clears responses and flow state, but preserves reviewRunId, exposureVersion,
            contentVersion, and key-exposure history. The next same-family run is labeled rehearsal{' '}
            {activeIdentity.rehearsalRun + 1}.
          </Callout>
        ) : null}
        {resetArmed && mode === 'learner' ? (
          <div
            style={{
              border: `1px solid ${theme.stroke.tertiary}`,
              borderRadius: 8,
              padding: 12,
              background: theme.fill.quaternary,
            }}
          >
            <Text>
              <Text as="span" weight="semibold">
                Start over?{' '}
              </Text>
              This clears your answers and returns to the first starting-point question.
            </Text>
          </div>
        ) : null}

        {mode === 'learner' ? (
          <LearnerMode state={activeState} setState={setState} />
        ) : reviewReady ? (
          <ReviewerMode state={activeState} setState={setState} identity={activeIdentity} />
        ) : (
          <div role="status">Preparing reviewer workspace…</div>
        )}

        <footer style={{ borderTop: `1px solid ${theme.stroke.tertiary}`, paddingTop: 12 }}>
          <Text size="small" tone="tertiary">
            {mode === 'learner'
              ? 'CBR-24 · Research question → design → result → warranted conclusion'
              : `${activeIdentity.contentVersion} · reviewed_content_hash=${activeIdentity.reviewedContentHash} · Internal key-exposed QA only · V3-CAP-510781 excluded.`}
          </Text>
        </footer>
      </Stack>
    </main>
  );
}
