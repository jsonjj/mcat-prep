import { buildAppNativeLesson, question, relations } from './authoring-helpers';
import type { LessonSectionAuthoring } from './section-authoring';

const CONCLUSION_KC = 'V3-KC-062200';

function boundMap(caption?: string) {
  return relations(
    'Bounding a conclusion to the evidence',
    'A warranted conclusion matches the effect size and its uncertainty, respects that correlation is not causation, and stays within the sample, measure, and time actually studied.',
    [
      {
        label: 'Match the numbers',
        nodes: [
          { label: 'Effect size', detail: 'how big?', emphasis: 'active' },
          { label: 'Uncertainty', detail: 'interval includes 0?' },
          { label: 'Claim strength', detail: 'no stronger than data' },
        ],
        links: ['with', 'sets'],
      },
      {
        label: 'Match the scope',
        continuationLabel: 'do not travel past the study',
        nodes: [
          { label: 'Design', detail: 'causal or correlational' },
          { label: 'Sample', detail: 'who was studied', emphasis: 'active' },
          { label: 'Measure & time', detail: 'what and when' },
        ],
        links: ['then', 'then'],
      },
    ],
    caption,
  );
}

const conclusionSection: LessonSectionAuthoring = {
  key: 'concl-bound',
  kcId: CONCLUSION_KC,
  stageLabel: 'Bounding conclusions',
  nextActionLabel: 'Finish the lesson',
  starting: question(
    'Read a confidence interval',
    'A study reports that group A scored 0.8 points higher than group B, with a 95% confidence interval from −0.5 to 2.1. What conclusion is warranted?',
    [
      ['The data do not establish a difference, because the interval includes zero.', 'Correct. An interval spanning zero is consistent with no difference, so a real difference is not established.'],
      ['Group A is definitely better by 0.8 points.', 'The point estimate is 0.8, but the interval\u2019s width and inclusion of zero make a firm difference unsupported.'],
      ['The two groups are proven to be identical.', 'Failing to establish a difference is not the same as proving none exists.'],
      ['The study must have been done incorrectly.', 'An inconclusive interval is a normal result, not evidence of a flawed study.'],
    ],
    'A',
    'A 95% interval that includes zero means the data are consistent with no difference. The warranted conclusion is that a difference was not established—neither confirmed nor disproven.',
    'Check whether the confidence interval crosses zero before claiming a difference.',
    'A conclusion should be no stronger than the effect and its uncertainty allow.',
    boundMap('An interval that includes zero cannot establish a difference.'),
  ),
  model: {
    title: 'Fit the claim to the evidence',
    supportingLine: 'Two dials: how strong, and how far.',
    explanation: [
      'A warranted conclusion is calibrated to the evidence in two ways. First, its strength must match the effect size and its uncertainty: a confidence interval that includes zero cannot establish a difference, and a wide interval limits precision.',
      'Second, its scope must match the study: describe correlational data as association, not causation, and keep the claim within the sample, measure, and time frame actually studied. Overreaching on either dial produces an unwarranted conclusion.',
    ],
    visual: boundMap('Set strength from the numbers; set scope from the design and sample.'),
    takeaway: 'Bound the claim by both effect-plus-uncertainty and by the study\u2019s sample, measure, and time.',
  },
  understandingCheck: question(
    'A different interval',
    'A second study reports a mean difference of 2.1 points with a 95% confidence interval from 0.4 to 3.8. What is warranted?',
    [
      ['The data support a positive difference within this sample.', 'Correct. The whole interval lies above zero, so a positive difference is established for these participants.'],
      ['No difference is established.', 'Because the interval excludes zero, a difference is supported here.'],
      ['The difference is exactly 2.1 in the whole population.', 'The point estimate is 2.1, but the interval and sample scope prevent claiming an exact population value.'],
      ['Group A is better for everyone everywhere.', 'The result is bounded to this sample, measure, and time; it does not generalize to everyone.'],
    ],
    'A',
    'An interval entirely above zero supports a positive difference, but only within the studied sample. Strength is warranted; scope still must stay bounded.',
    'When the interval excludes zero, a difference is supported—within the sample studied.',
  ),
  worked: {
    title: 'Compare two results',
    supportingLine: 'The interval, not just the point estimate, decides.',
    explanation: [
      'Study 1: difference 0.8, interval −0.5 to 2.1. Because the interval includes zero, no difference is established. Study 2: difference 2.1, interval 0.4 to 3.8. Because the interval excludes zero, a positive difference is supported.',
      'Notice that a larger point estimate is not automatically more convincing. What matters is whether the plausible range of the effect includes zero and how wide it is.',
    ],
    visual: relations(
      'Interval decides, not the point estimate',
      'Study 1\u2019s interval includes zero, so no difference is established; study 2\u2019s interval excludes zero, so a positive difference is supported.',
      [
        {
          label: 'Study 1',
          nodes: [
            { label: '0.8', detail: 'point estimate' },
            { label: '[−0.5, 2.1]', detail: 'includes 0 → inconclusive', emphasis: 'active' },
          ],
          links: ['interval'],
        },
        {
          label: 'Study 2',
          nodes: [
            { label: '2.1', detail: 'point estimate' },
            { label: '[0.4, 3.8]', detail: 'excludes 0 → supported', emphasis: 'active' },
          ],
          links: ['interval'],
        },
      ],
    ),
    takeaway: 'What to notice: read the interval, not just the point estimate, to judge a difference.',
  },
  guided: question(
    'Correlation versus causation',
    'An observational study finds that students who use a study app score higher, but students chose whether to use it. What conclusion is warranted?',
    [
      ['App use is associated with higher scores; causation is not established.', 'Correct. Self-selection leaves alternative explanations, so only association is warranted.'],
      ['The app causes higher scores.', 'Without random assignment, motivation or ability could drive both app use and scores.'],
      ['The app has no effect.', 'The data show an association; they neither prove nor disprove an effect.'],
      ['Higher scores cause students to use the app.', 'The direction is not established either; only association is supported.'],
    ],
    'A',
    'Observational, self-selected data can support an association but cannot isolate cause. The warranted conclusion stops at association.',
    'No random assignment means describe association, not cause.',
  ),
  reducedSupport: question(
    'Bound the population',
    'A randomized result comes from volunteers at a single commuter campus. How should the conclusion be bounded?',
    [
      ['It may support a causal effect within this sample, while generalization to all students stays uncertain.', 'Correct. Internal strength and external reach are separate; the narrow sample limits transport.'],
      ['It applies to every college student nationwide.', 'One-campus recruitment does not license a nationwide claim.'],
      ['It applies to no one, because the sample is small.', 'A randomized comparison can still be informative for those participants.'],
      ['Randomization makes the sample nationally representative.', 'Randomization balances groups within the sample; it does not fix who was recruited.'],
    ],
    'A',
    'Randomization can warrant a causal claim inside the sample, but a single-campus volunteer pool limits generalization. Keep the scope bounded to who was studied.',
    'Internal validity and generalization are different bounds.',
  ),
  independent: question(
    'Choose the warranted conclusion',
    'A randomized trial finds a 2.1-point higher mean score with a 95% interval of 0.4 to 3.8, in volunteers from one course. Which conclusion is strongest without overreaching?',
    [
      ['The intervention raised the mean score in this sample; broader generalization is uncertain.', 'Correct. It uses the causal strength of randomization and keeps the scope bounded.'],
      ['The intervention raises scores for all students everywhere.', 'That overreaches on sample, measure, and time.'],
      ['The variables are only associated; randomized trials cannot show causation.', 'That underclaims what a randomized design supports.'],
      ['Every participant improved by exactly 2.1 points.', 'A group-mean difference is not an identical individual effect.'],
    ],
    'A',
    'The best conclusion avoids both overreach and underclaim: a bounded causal effect on the mean within this sample, with generalization left open.',
  ),
  near: question(
    'Interpret one more interval',
    'A study reports a difference of −0.2 points with a 95% interval from −1.6 to 1.2. What is warranted?',
    [
      ['No difference is established, since the interval includes zero.', 'Correct. The plausible range spans zero, so a difference is not supported.'],
      ['Group B is clearly better.', 'The interval includes zero and positive values, so a firm difference is not established.'],
      ['The groups are proven equal.', 'Failing to find a difference does not prove equality.'],
      ['The effect is definitely −0.2.', 'The point estimate is uncertain across the whole interval.'],
    ],
    'A',
    'The interval from −1.6 to 1.2 includes zero, so the data do not establish any difference in either direction.',
  ),
  changed: question(
    'Significant but small',
    'With 100,000 participants, a study finds a statistically significant 0.2-point difference on a 100-point exam (interval 0.15 to 0.25). What conclusion is warranted?',
    [
      [
        'A real but very small difference exists in this sample; statistical significance does not make it practically important.',
        'Correct. A huge sample can make a tiny effect statistically detectable, but importance depends on effect size, not significance alone.',
      ],
      [
        'The difference is large and important because it is statistically significant.',
        'Significance shows the effect is detectable, not that 0.2 of 100 points is meaningful.',
      ],
      [
        'There is no difference, since 0.2 points is small.',
        'The interval excludes zero, so a small difference is established even if it is unimportant.',
      ],
      [
        'The study is invalid because the effect is tiny.',
        'A small effect is a finding to interpret, not a sign of an invalid study.',
      ],
    ],
    'A',
    'Statistical significance answers whether an effect is distinguishable from zero; practical importance depends on the size of the effect. A very large sample can make a trivial 0.2-point difference significant yet unimportant.',
  ),
  repair: {
    title: 'Set strength, then set scope',
    supportingLine: 'The two traps are overclaiming and declaring a proven null.',
    explanation: [
      'First set strength from the numbers: does the interval include zero, how wide is it, and how big is the effect? An interval crossing zero cannot establish a difference; a narrow interval away from zero can.',
      'Then set scope from the design and sample: label correlational data as association, and keep the claim within the sample, measure, and time. Avoid both overreaching and the false claim that failing to find an effect proves there is none.',
    ],
    visual: boundMap('Strength from the interval and effect size; scope from design and sample.'),
    strategy: 'Read the interval first, choose association or causation from the design, then bound the population.',
    checkYourThinking: 'Is your claim stronger than the interval allows, or broader than the sample supports?',
  },
  recap: {
    title: 'You can bound a conclusion',
    explanation: [
      'You judged differences from confidence intervals, separated association from causation, kept claims within the sample and measure, and distinguished statistical significance from practical importance.',
    ],
    visual: boundMap('A warranted conclusion is no stronger and no broader than the evidence.'),
    takeaway: 'Set claim strength from the effect and its uncertainty; set claim scope from the design and sample.',
  },
};

const { script: WARRANTED_CONCLUSIONS_SCRIPT, presentation: WARRANTED_CONCLUSIONS_PRESENTATION } =
  buildAppNativeLesson({
    id: 'V3-LES-128144',
    contentVersion: 'app-native-conclusions-v1.0.0',
    slug: 'warranted-conclusions',
    title: 'Draw evidence-bounded conclusions',
    internalTitle: 'Data, uncertainty, and evidence-bounded conclusions · app-native candidate',
    subject: 'Scientific inquiry',
    description:
      'Bound conclusions to the evidence: read confidence intervals, separate association from causation, respect sample scope, and tell significance from importance.',
    estimatedMinutes: 15,
    requiredKcs: [
      {
        id: CONCLUSION_KC,
        title: 'Bound scientific conclusions by evidence',
        learnerOutcome:
          'State a conclusion no stronger and no broader than the data and design support.',
        previewCoverage: 'complete-review-focus',
      },
      {
        id: 'V3-KC-102285',
        title: 'Interpret patterns and descriptive statistics',
        learnerOutcome: 'Recall that means and intervals summarize the data being bounded.',
        previewCoverage: 'boundary-map-only',
      },
      {
        id: 'V3-KC-434142',
        title: 'Reason about error and uncertainty',
        learnerOutcome: 'Use confidence intervals to represent uncertainty in an estimate.',
        previewCoverage: 'boundary-map-only',
      },
      {
        id: 'V3-KC-118833',
        title: 'Project data-supported implications',
        learnerOutcome: 'Recognize which implications a bounded result can and cannot support.',
        previewCoverage: 'boundary-map-only',
      },
    ],
    teachingObjective:
      'Given a study result with uncertainty, choose the conclusion whose strength and scope match the evidence and design.',
    intro: {
      id: 'concl-intro',
      title: 'Draw evidence-bounded conclusions',
      outcome: 'Match a conclusion\u2019s strength and scope to the data, uncertainty, and design.',
      details: [
        'Read confidence intervals, separate association from causation, and keep claims within the sample and measure.',
      ],
      kcIds: [CONCLUSION_KC],
    },
    sections: [conclusionSection],
    completion: {
      id: 'concl-complete',
      title: 'You can bound conclusions to evidence',
      summary:
        'You used confidence intervals to judge differences, separated association from causation, kept claims within the sample, and distinguished significance from importance.',
      takeaways: [
        'An interval that includes zero cannot establish a difference.',
        'Correlational data support association, not causation.',
        'Statistical significance is not the same as practical importance.',
      ],
      nextStep: 'Apply evidence-bounding to research passages and experimental data questions.',
      kcIds: [CONCLUSION_KC],
    },
  });

export { WARRANTED_CONCLUSIONS_SCRIPT, WARRANTED_CONCLUSIONS_PRESENTATION };
