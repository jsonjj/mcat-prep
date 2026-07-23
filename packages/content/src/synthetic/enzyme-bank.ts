import type { z } from 'zod';
import type { SkillGraphSchema } from '@mcat/domain';
import type { EngineQuestionSchema, EngineStimulusSchema } from '../engine-schema';
import type {
  HintLadderSchema,
  LessonSchema,
  RecallPromptSchema,
  SimulationSpecSchema,
} from '../instruction';

/**
 * SYNTHETIC, TEST-ONLY fixtures. Uses a fictional enzyme ("Zymase-Q") and a
 * fictional inhibitor ("compound Z") so it can never be confused with, or
 * derived from, any real MCAT material. Every record carries test_only: true;
 * production publication rejects it. Not learner content.
 */

type QuestionInput = z.input<typeof EngineQuestionSchema>;
type StimulusInput = z.input<typeof EngineStimulusSchema>;
type LessonInput = z.input<typeof LessonSchema>;
type HintLadderInput = z.input<typeof HintLadderSchema>;
type RecallInput = z.input<typeof RecallPromptSchema>;
type SimulationInput = z.input<typeof SimulationSpecSchema>;
type SkillGraphInput = z.input<typeof SkillGraphSchema>;

const SKILL_BASICS = 'bb1-enzyme-kinetics-basics';
const SKILL_INHIB = 'bb1-enzyme-inhibition';

export const syntheticSkillGraph: SkillGraphInput = {
  version: 'synthetic-v1',
  skills: [
    {
      skillId: SKILL_BASICS,
      cluster: 'BB1',
      title: 'Enzyme kinetics basics',
      objective: 'Interpret Km and Vmax from a rate-versus-substrate curve.',
      sections: ['bb'],
      operations: ['K', 'D'],
      scope: 'prerequisite',
    },
    {
      skillId: SKILL_INHIB,
      cluster: 'BB1',
      title: 'Enzyme inhibition',
      objective:
        'Given kinetic data, identify inhibition type and predict its effect on apparent Km and Vmax.',
      sections: ['bb'],
      operations: ['K', 'E', 'D'],
      scope: 'required',
    },
  ],
  edges: [{ from: SKILL_BASICS, to: SKILL_INHIB, kind: 'hard_prerequisite' }],
};

const provenance = { origin: 'original' as const, rights_status: 'cleared' as const };
const reviewApproved = {
  content_status: 'approved' as const,
  copy_status: 'approved' as const,
  accessibility_status: 'approved' as const,
  reviewer_ids: ['synthetic-reviewer'],
};
const deliverable = (over: Partial<QuestionInput['delivery']> = {}) => ({
  diagnostic_eligible: false,
  mastery_eligible: true,
  protected: false,
  test_only: true,
  ...over,
});

export const syntheticStimuli: StimulusInput[] = [
  {
    schema_version: '1.0',
    id: 'stim-zymaseq-assay',
    version: 1,
    status: 'published',
    type: 'experiment',
    section: 'bb',
    body: [
      'Researchers studied the fictional enzyme Zymase-Q, which converts substrate S into product P. ' +
        'They measured initial reaction rate at increasing substrate concentrations, first alone and ' +
        'then in the presence of a fixed amount of the fictional inhibitor compound Z.',
      'With compound Z present, the maximum rate observed at very high substrate concentration was ' +
        'unchanged, but a higher substrate concentration was required to reach half of that maximum rate.',
    ],
    provenance,
    test_only: true,
  },
];

const q = (over: Partial<QuestionInput> & Pick<QuestionInput, 'id' | 'stem' | 'choices' | 'correct_choice_id' | 'rationales' | 'family_id'>): QuestionInput => ({
  schema_version: '1.0',
  version: 1,
  status: 'published',
  section: 'bb',
  skill_cluster: 'BB1',
  internal_skill_ids: [SKILL_INHIB],
  template_tags: ['K', 'D'],
  learning_objective: 'Predict inhibition effects on Km and Vmax.',
  format: 'discrete_mcq',
  difficulty: 3,
  stimulus_id: null,
  prerequisite_ids: [SKILL_BASICS],
  content_tags: ['enzyme-inhibition'],
  estimated_seconds: 90,
  media_ids: [],
  provenance,
  review: reviewApproved,
  delivery: deliverable(),
  ...over,
});

export const syntheticQuestions: QuestionInput[] = [
  q({
    id: 'q-enz-basics-1',
    internal_skill_ids: [SKILL_BASICS],
    prerequisite_ids: [],
    learning_objective: 'Interpret Vmax from a kinetic curve.',
    family_id: 'fam-basics',
    stem: 'On a rate-versus-substrate curve for an enzyme, Vmax corresponds to which feature?',
    choices: [
      { id: 'A', text: 'The rate approached as substrate concentration becomes very large' },
      { id: 'B', text: 'The substrate concentration at half-maximal rate', distractor_families: ['wrong_relationship'] },
      { id: 'C', text: 'The initial slope of the curve near zero substrate', distractor_families: ['graph_or_data'] },
      { id: 'D', text: 'The rate at which product first appears', distractor_families: ['missing_knowledge'] },
    ],
    correct_choice_id: 'A',
    rationales: {
      correct: 'Vmax is the plateau rate approached as substrate saturates the enzyme.',
      choices: {
        A: 'Correct: Vmax is the saturating (plateau) rate at very high substrate.',
        B: 'That describes Km, not Vmax.',
        C: 'The initial slope reflects catalytic efficiency, not Vmax.',
        D: 'Product appearance timing is not Vmax.',
      },
    },
  }),
  q({
    id: 'q-enz-indep-competitive',
    family_id: 'fam-competitive',
    stem: 'A competitive inhibitor of Zymase-Q is added. Compared with no inhibitor, the apparent Km and Vmax will:',
    choices: [
      { id: 'A', text: 'Apparent Km increases; Vmax unchanged' },
      { id: 'B', text: 'Apparent Km decreases; Vmax unchanged', distractor_families: ['wrong_relationship'] },
      { id: 'C', text: 'Apparent Km unchanged; Vmax decreases', distractor_families: ['wrong_relationship'] },
      { id: 'D', text: 'Both apparent Km and Vmax decrease', distractor_families: ['scope_or_relevance'] },
    ],
    correct_choice_id: 'A',
    rationales: {
      correct:
        'A competitive inhibitor raises the apparent Km (more substrate needed to reach half-max) but Vmax is unchanged because saturating substrate outcompetes the inhibitor.',
      choices: {
        A: 'Correct.',
        B: 'Competitive inhibition raises, not lowers, apparent Km.',
        C: 'That is noncompetitive inhibition.',
        D: 'That is uncompetitive inhibition.',
      },
    },
  }),
  q({
    id: 'q-enz-indep-noncompetitive',
    family_id: 'fam-noncompetitive',
    stem: 'A pure noncompetitive inhibitor of Zymase-Q is added. The apparent Km and Vmax will:',
    choices: [
      { id: 'A', text: 'Apparent Km unchanged; Vmax decreases' },
      { id: 'B', text: 'Apparent Km increases; Vmax unchanged', distractor_families: ['wrong_relationship'] },
      { id: 'C', text: 'Apparent Km decreases; Vmax decreases', distractor_families: ['scope_or_relevance'] },
      { id: 'D', text: 'Both unchanged', distractor_families: ['missing_knowledge'] },
    ],
    correct_choice_id: 'A',
    rationales: {
      correct:
        'Pure noncompetitive inhibitors bind equally to free enzyme and enzyme-substrate complex, lowering Vmax while leaving apparent Km unchanged.',
      choices: {
        A: 'Correct.',
        B: 'That is competitive inhibition.',
        C: 'That is uncompetitive inhibition.',
        D: 'A noncompetitive inhibitor does change Vmax.',
      },
    },
  }),
  q({
    id: 'q-enz-transfer-lineweaver',
    family_id: 'fam-competitive',
    template_tags: ['D', 'E'],
    learning_objective: 'Recognize competitive inhibition from a double-reciprocal plot.',
    stem: 'On a double-reciprocal (Lineweaver-Burk) plot, adding compound Z leaves the y-intercept unchanged but increases the slope. Compound Z acts as a:',
    choices: [
      { id: 'A', text: 'Competitive inhibitor' },
      { id: 'B', text: 'Pure noncompetitive inhibitor', distractor_families: ['graph_or_data'] },
      { id: 'C', text: 'Uncompetitive inhibitor', distractor_families: ['graph_or_data'] },
      { id: 'D', text: 'Irreversible inhibitor', distractor_families: ['missing_knowledge'] },
    ],
    correct_choice_id: 'A',
    rationales: {
      correct:
        'An unchanged y-intercept means Vmax is unchanged; an increased slope means apparent Km increases — the signature of competitive inhibition.',
      choices: {
        A: 'Correct.',
        B: 'Noncompetitive inhibition raises the y-intercept (lower Vmax).',
        C: 'Uncompetitive inhibition shifts the line in parallel.',
        D: 'A double-reciprocal signature does not by itself indicate irreversibility.',
      },
    },
  }),
  q({
    id: 'q-enz-passage-1',
    family_id: 'fam-passage',
    format: 'passage_mcq',
    stimulus_id: 'stim-zymaseq-assay',
    template_tags: ['E', 'D'],
    stem: 'Based on the experiment, compound Z most likely acts as which type of inhibitor?',
    choices: [
      { id: 'A', text: 'Competitive' },
      { id: 'B', text: 'Pure noncompetitive', distractor_families: ['experimental_design'] },
      { id: 'C', text: 'Uncompetitive', distractor_families: ['experimental_design'] },
      { id: 'D', text: 'No inhibition occurred', distractor_families: ['misread_condition'] },
    ],
    correct_choice_id: 'A',
    rationales: {
      correct:
        'Unchanged maximum rate (Vmax) with a higher substrate concentration needed for half-maximal rate (higher apparent Km) indicates competitive inhibition.',
      choices: {
        A: 'Correct.',
        B: 'Noncompetitive inhibition would lower the maximum rate.',
        C: 'Uncompetitive inhibition would lower both the maximum rate and apparent Km.',
        D: 'A change in apparent Km shows inhibition did occur.',
      },
    },
  }),
  q({
    id: 'q-enz-protected-1',
    family_id: 'fam-uncompetitive',
    template_tags: ['K', 'E'],
    delivery: deliverable({ protected: true }),
    stem: 'An uncompetitive inhibitor of Zymase-Q is added. Apparent Km and Vmax will:',
    choices: [
      { id: 'A', text: 'Both decrease' },
      { id: 'B', text: 'Both increase', distractor_families: ['wrong_relationship'] },
      { id: 'C', text: 'Km increases; Vmax unchanged', distractor_families: ['scope_or_relevance'] },
      { id: 'D', text: 'Km unchanged; Vmax decreases', distractor_families: ['scope_or_relevance'] },
    ],
    correct_choice_id: 'A',
    rationales: {
      correct:
        'Uncompetitive inhibitors bind only the enzyme-substrate complex, lowering both Vmax and apparent Km.',
      choices: {
        A: 'Correct.',
        B: 'Both increasing does not match any standard inhibition type.',
        C: 'That is competitive inhibition.',
        D: 'That is noncompetitive inhibition.',
      },
    },
  }),
  q({
    id: 'q-enz-sim-transfer-1',
    family_id: 'fam-competitive',
    template_tags: ['Q', 'D'],
    learning_objective: 'Predict competitive-inhibitor behavior at saturating substrate.',
    stem: 'With a competitive inhibitor present, what happens to the reaction rate as substrate concentration is raised to very high levels?',
    choices: [
      { id: 'A', text: 'It approaches the same Vmax as without inhibitor' },
      { id: 'B', text: 'It approaches a lower maximum than without inhibitor', distractor_families: ['wrong_relationship'] },
      { id: 'C', text: 'It stays near zero regardless of substrate', distractor_families: ['missing_knowledge'] },
      { id: 'D', text: 'It exceeds the original Vmax', distractor_families: ['calculation'] },
    ],
    correct_choice_id: 'A',
    rationales: {
      correct: 'At saturating substrate, substrate outcompetes a competitive inhibitor, so the rate approaches the original Vmax.',
      choices: {
        A: 'Correct.',
        B: 'That describes noncompetitive inhibition.',
        C: 'Enzyme activity is not abolished by a competitive inhibitor at high substrate.',
        D: 'Inhibition cannot raise the rate above the uninhibited Vmax.',
      },
    },
  }),
];

export const syntheticLessons: LessonInput[] = [
  {
    id: 'lesson-enz-inhibition',
    skillId: SKILL_INHIB,
    title: 'How inhibitors change Km and Vmax',
    test_only: true,
    blocks: [
      {
        kind: 'model',
        heading: 'Three reversible inhibition types',
        body: [
          'Competitive inhibitors compete with substrate for the active site. Adding more substrate overcomes them, so Vmax is unchanged but apparent Km rises.',
          'Noncompetitive inhibitors bind elsewhere and reduce catalysis whether or not substrate is bound, lowering Vmax while leaving apparent Km unchanged.',
          'Uncompetitive inhibitors bind only the enzyme-substrate complex, lowering both Vmax and apparent Km.',
        ],
      },
      {
        kind: 'checklist',
        heading: 'Read the data',
        body: [
          'Did the maximum (plateau) rate change? If yes, Vmax changed.',
          'Did the substrate needed for half-maximal rate change? If yes, apparent Km changed.',
          'Match the pair of changes to the inhibition type.',
        ],
      },
    ],
  },
];

export const syntheticHintLadders: HintLadderInput[] = [
  {
    questionId: 'q-enz-indep-competitive',
    hints: [
      { level: 'A1', text: 'Ask whether adding a lot more substrate could overcome this inhibitor.', contentBearing: false },
      { level: 'A2', text: 'A competitive inhibitor competes for the active site; saturating substrate wins.', contentBearing: true },
      { level: 'A3', text: 'Competitive inhibition: Vmax unchanged (substrate outcompetes), apparent Km increases.', contentBearing: true },
    ],
  },
];

export const syntheticRecallPrompts: RecallInput[] = [
  {
    id: 'recall-enz-competitive',
    skillId: SKILL_INHIB,
    format: 'claim_evidence',
    prompt: 'In competitive inhibition, apparent Km ____ and Vmax ____.',
    acceptedAnswers: ['increases; unchanged', 'increases unchanged', 'up; same', 'higher; unchanged'],
    explanation: 'Competitive inhibitors raise apparent Km; Vmax is unchanged at saturating substrate.',
    test_only: true,
  },
];

export const syntheticSimulations: SimulationInput[] = [
  {
    id: 'sim-enz-inhibition',
    skillId: SKILL_INHIB,
    title: 'Inhibitor effect on the rate curve',
    predictionPrompt:
      'Before manipulating anything: with a competitive inhibitor present, will the curve reach the same maximum rate at very high substrate?',
    variables: [
      { key: 'inhibitor', label: 'Inhibitor amount', min: 0, max: 10, step: 1, unit: 'units' },
      { key: 'substrate', label: 'Substrate concentration', min: 0, max: 100, step: 5, unit: 'mM' },
    ],
    observationLabel: 'Observed initial rate',
    transferQuestionId: 'q-enz-sim-transfer-1',
    directRoute: {
      summary: 'A non-graphical route using a data table and step controls instead of an interactive plot.',
      steps: [
        'Read the rate at low substrate with and without inhibitor.',
        'Read the plateau rate at very high substrate with and without inhibitor.',
        'Note that the plateau (Vmax) is unchanged but more substrate is needed to reach half of it.',
        'Conclude the inhibition type, then answer the unseen transfer question.',
      ],
    },
    test_only: true,
  },
];
