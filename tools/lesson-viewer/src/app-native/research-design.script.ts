import type {
  LessonQuestionOptionPreview,
  PassageVisualPreview,
  RelationVisualPreview,
} from './contract';
import { defineLessonScriptPreview } from './contract';
import type { LessonSectionAuthoring, SectionQuestionAuthoring } from './section-authoring';
import { buildSectionNodes, sectionNodeId } from './section-authoring';

type ChoiceId = 'A' | 'B' | 'C' | 'D';
type ChoiceSet = readonly [
  readonly [string, string],
  readonly [string, string],
  readonly [string, string],
  readonly [string, string],
];

function question(
  title: string,
  prompt: string,
  choices: ChoiceSet,
  correctOptionId: ChoiceId,
  explanation: string,
  help?: string,
  supportingLine?: string,
  visual?: PassageVisualPreview | RelationVisualPreview,
): SectionQuestionAuthoring {
  const ids: readonly ChoiceId[] = ['A', 'B', 'C', 'D'];
  const options = ids.map((id, index) => ({
    id,
    label: choices[index][0],
  })) as unknown as readonly [
    LessonQuestionOptionPreview,
    LessonQuestionOptionPreview,
    LessonQuestionOptionPreview,
    LessonQuestionOptionPreview,
  ];
  const feedbackByOption = Object.fromEntries(ids.map((id, index) => [id, choices[index][1]]));
  return {
    title,
    supportingLine,
    prompt,
    options,
    correctOptionId,
    feedbackByOption,
    explanation,
    help,
    visual,
  };
}

const CBR_STEPS = [
  ['Question', 'breathing versus quiet sitting'],
  ['Variables', 'assigned routine and quiz score'],
  ['People and measures', 'one-course volunteers and named measures'],
  ['Protections', 'voluntary choice and protected data'],
  ['Conclusion', 'bounded by design and result'],
] as const;

function cbrFlow(activeIndex: number, caption?: string): RelationVisualPreview {
  return {
    kind: 'relations',
    alt: 'Continuous CBR-24 study flow arranged in two connected rows',
    textEquivalent:
      'CBR-24 moves continuously from a focused question to defined variables, a recruited and measured sample, participant protections, and a conclusion bounded by the design. The second row continues directly from the first.',
    caption,
    lanes: [
      {
        label: 'Build the study',
        nodes: CBR_STEPS.slice(0, 3).map(([label, detail], index) => ({
          label,
          detail,
          emphasis:
            index === activeIndex
              ? ('active' as const)
              : index > activeIndex
                ? ('muted' as const)
                : undefined,
        })) as unknown as RelationVisualPreview['lanes'][number]['nodes'],
        links: ['define', 'study'],
      },
      {
        label: 'Complete the audit',
        continuationLabel: 'then protect participants and bound the claim',
        nodes: CBR_STEPS.slice(3).map(([label, detail], localIndex) => {
          const index = localIndex + 3;
          return {
            label,
            detail,
            emphasis:
              index === activeIndex
                ? ('active' as const)
                : index > activeIndex
                  ? ('muted' as const)
                  : undefined,
          };
        }) as unknown as RelationVisualPreview['lanes'][number]['nodes'],
        links: ['infer'],
      },
    ],
  };
}

function relations(
  alt: string,
  textEquivalent: string,
  lanes: RelationVisualPreview['lanes'],
  caption?: string,
): RelationVisualPreview {
  return { kind: 'relations', alt, textEquivalent, lanes, caption };
}

const RESEARCH_SECTIONS: readonly LessonSectionAuthoring[] = [
  {
    key: 'research-question',
    kcId: 'V3-KC-231348',
    stageLabel: 'Question and hypothesis',
    nextActionLabel: 'Define the variables',
    starting: question(
      'Start with an observable question',
      'CBR-24 asks whether a two-minute paced-breathing routine before a quiz improves first-year students’ performance. Which question can this study answer?',
      [
        [
          'Does assignment to paced breathing rather than quiet sitting change mean score on the next quiz?',
          'Yes. The comparison, outcome, people, and time are all observable in the planned study.',
        ],
        [
          'Does paced breathing make every student a better learner?',
          '“Every student” and “better learner” go beyond the recruited group and the named outcome.',
        ],
        [
          'Is paced breathing inherently good?',
          'That is a value judgment rather than an empirical question with an observable decision rule.',
        ],
        [
          'Does paced breathing work by reducing amygdala activity?',
          'The study records no neural measure, so it cannot evaluate that mechanism.',
        ],
      ],
      'A',
      'A testable question must match what the study can vary or compare and what it can actually record.',
      'Look for a comparison, a named measurement, a bounded group, and a time.',
      'Use only what the described study can observe.',
      cbrFlow(0),
    ),
    model: {
      title: 'Turn broad ideas into measurable parts',
      supportingLine: 'Operationalization gives each important word an observable meaning.',
      explanation: [
        'A question is testable when a possible observation could count for or against an answer. Name who is studied, what is compared, what outcome is recorded, and when it is recorded.',
        'Operationalization means translating an idea into a specific procedure or measure. In CBR-24, “performance” becomes mean score on the next quiz; that choice makes the question answerable but also limits what the answer can mean.',
      ],
      visual: cbrFlow(0, 'The question sets the boundary for every later design choice.'),
      takeaway:
        'If a claim word has no matching assignment, comparison, or measurement, this study cannot support it.',
    },
    understandingCheck: question(
      'Check the operational boundary',
      'CBR-24 defines performance as mean score on the immediate next quiz. Which phrase now has a matching observation?',
      [
        [
          'Mean immediate quiz performance.',
          'Correct. The scoring rule and time are both named in the study.',
        ],
        [
          'Permanent intelligence growth.',
          'Neither intelligence nor a lasting change is measured.',
        ],
        [
          'Benefit for every student.',
          'A group mean cannot establish the same effect for every person.',
        ],
        ['Reduced amygdala activity.', 'No neural measure is part of CBR-24.'],
      ],
      'A',
      'Operationalization licenses only the construct and time represented by the chosen procedure. Here, the observable result is a mean score on one immediate quiz.',
      'Match the phrase to a named measure and time.',
    ),
    worked: {
      title: 'Build the CBR-24 question one part at a time',
      supportingLine: 'The wording should mirror the planned observation.',
      explanation: [
        'Start with the people: volunteers from one first-year course. Add the comparison: assignment to paced breathing or quiet sitting. Then add the outcome and time: mean score on the immediate next quiz.',
        'The resulting hypothesis predicts a difference between assigned groups. Notice that it does not add permanence, a neural pathway, or all students, because CBR-24 does not measure those ideas.',
      ],
      visual: relations(
        'Parts of the CBR-24 research question',
        'Course volunteers are assigned to paced breathing or quiet sitting, then mean immediate quiz score is compared.',
        [
          {
            label: 'Question construction',
            nodes: [
              { label: 'Who?', detail: 'course volunteers' },
              { label: 'Compare?', detail: 'assigned routines', emphasis: 'active' },
              { label: 'Measure?', detail: 'mean quiz score' },
              { label: 'When?', detail: 'next quiz' },
            ],
            links: ['add', 'add', 'bound'],
          },
        ],
        'Each noun in the hypothesis has a matching part of the study.',
      ),
      takeaway:
        'What to notice: the study can support a narrow answer even when the motivating idea is broad.',
    },
    guided: question(
      'Keep the hypothesis inside the design',
      'Which hypothesis is best aligned with CBR-24?',
      [
        [
          'Students assigned to paced breathing will have a different mean next-quiz score than students assigned to quiet sitting.',
          'Correct. Every term maps to the study’s assignment, group comparison, outcome, and time.',
        ],
        [
          'Paced breathing permanently improves intelligence.',
          'Permanence and intelligence are not measured.',
        ],
        [
          'Paced breathing helps all university students.',
          'The volunteer sample cannot represent every university student by wording alone.',
        ],
        [
          'Paced breathing lowers stress hormones and therefore raises scores.',
          'Neither stress hormones nor that mechanism is measured.',
        ],
      ],
      'A',
      'A hypothesis is a proposed answer to the research question, so it must stay within the same observable boundary.',
      'Match each phrase to a study operation.',
    ),
    reducedSupport: question(
      'Operationalize the outcome',
      'Which definition makes “quiz performance” most directly usable in CBR-24?',
      [
        [
          'The number of correct answers on the 20-item quiz given immediately after the routine.',
          'Correct. It specifies the scoring rule, scale, and time.',
        ],
        ['How successful each student becomes.', 'Success has no defined observation or time.'],
        [
          'Whether students feel generally smarter.',
          'This substitutes a different, still vague construct.',
        ],
        [
          'Any academic result collected in the future.',
          'The measure and time remain unspecified.',
        ],
      ],
      'A',
      'An operational definition states exactly how a construct is produced or measured in this study.',
      'Prefer a named instrument or scoring rule and a named time.',
    ),
    independent: question(
      'Reject an unsupported mechanism',
      'CBR-24 records routine assignment and quiz score only. Which claim is outside its testable boundary?',
      [
        [
          'Mean immediate quiz scores differ between assigned routine groups.',
          'That is the direct comparison CBR-24 records.',
        ],
        [
          'Assignment to paced breathing changes mean immediate quiz score in the sample.',
          'The randomized design can later determine whether this bounded causal wording is warranted.',
        ],
        [
          'Paced breathing changes amygdala activity, which then changes quiz score.',
          'Correct. No neural measure or mediator is included.',
        ],
        [
          'The observed group means differ by 2.1 points.',
          'That is a descriptive result the study can calculate.',
        ],
      ],
      'C',
      'A plausible explanation is not automatically a measured explanation. Mechanism claims require observations that distinguish that mechanism.',
    ),
    near: question(
      'Check the same boundary',
      'CBR-24 compares paced breathing with quiet sitting and records the next quiz. Which conclusion is directly answerable?',
      [
        [
          'The assigned routines differ in mean immediate quiz score in this sample.',
          'Correct. This copies the people, comparison, outcome, and time from the study.',
        ],
        [
          'Breathing improves academic ability for life.',
          'Lifetime academic ability is not measured.',
        ],
        [
          'Breathing benefits every learner.',
          'The claim exceeds both the sample and an average group result.',
        ],
        ['Breathing acts through a specific brain circuit.', 'No circuit measure appears.'],
      ],
      'A',
      'The strongest answerable claim is the one whose scope matches the observation exactly.',
    ),
    changed: question(
      'Audit a revised CBR-24 claim',
      'The team adds a validated stress score immediately before and after the routine but still collects no long-term outcomes. Which new question becomes testable?',
      [
        [
          'Does assignment to paced breathing change the immediate stress score relative to quiet sitting?',
          'Correct. The added measure creates an observable immediate stress comparison.',
        ],
        [
          'Does breathing prevent stress for the rest of college?',
          'No long-term follow-up was added.',
        ],
        ['Does breathing improve every kind of learning?', 'Only one quiz outcome is defined.'],
        [
          'Is breathing morally preferable to quiet sitting?',
          'The added score does not turn a value judgment into the study’s empirical question.',
        ],
      ],
      'A',
      'Adding a measure expands the questions the study can address only to the construct and time that measure represents.',
    ),
    repair: {
      title: 'Copy the study into the claim',
      supportingLine: 'Broad language often hides a missing operation.',
      explanation: [
        'Rewrite the claim using four slots: people, comparison, measurement, and time. Then underline every extra word and ask what observation would support it.',
        'For CBR-24, “course volunteers,” “assigned routines,” “mean immediate quiz score,” and “next quiz” all have operations. “Permanent,” “all students,” and a brain mechanism do not.',
      ],
      visual: relations(
        'Claim-boundary repair',
        'A supported claim copies the study’s people, comparison, measurement, and time; unsupported additions sit outside that boundary.',
        [
          {
            label: 'Keep',
            nodes: [
              { label: 'People', detail: 'course volunteers', emphasis: 'active' },
              { label: 'Comparison', detail: 'assigned routines', emphasis: 'active' },
              { label: 'Measure', detail: 'mean quiz score', emphasis: 'active' },
              { label: 'Time', detail: 'immediate' },
            ],
            links: ['+', '+', '+'],
          },
          {
            label: 'Do not add without evidence',
            nodes: [
              { label: 'All students', emphasis: 'muted' },
              { label: 'Permanent effect', emphasis: 'muted' },
              { label: 'Neural mechanism', emphasis: 'muted' },
            ],
            links: ['or', 'or'],
          },
        ],
      ),
      strategy: 'Fill the four slots first, then remove any word with no matching study operation.',
      checkYourThinking:
        'Can you point to the assignment or measurement that supports every important word?',
    },
    recap: {
      title: 'The question now has a boundary',
      explanation: [
        'CBR-24 can ask whether assigned routines change mean immediate quiz score in its volunteers. The next step is to name what the study changes, measures, holds constant, and accidentally lets vary.',
      ],
      visual: cbrFlow(1),
      takeaway: 'A precise question prevents later conclusions from drifting beyond the study.',
    },
  },
  {
    key: 'research-variables',
    kcId: 'V3-KC-136063',
    stageLabel: 'Variables and confounds',
    nextActionLabel: 'Inspect people and measures',
    starting: question(
      'Name variables by their role',
      'CBR-24 assigns a routine, records quiz score, and keeps quiz version and preparation time the same. Which map is correct?',
      [
        [
          'Routine is independent; score is dependent; quiz version is controlled.',
          'Correct. The roles follow what the study varies, measures, and holds comparable.',
        ],
        [
          'Score is independent; routine is dependent.',
          'The assigned factor and measured response are reversed.',
        ],
        [
          'Quiz version is a confound simply because it can affect score.',
          'A factor held the same does not vary with group and therefore is not an actual confound here.',
        ],
        [
          'Preparation time is the outcome.',
          'It is standardized rather than measured as the primary response.',
        ],
      ],
      'A',
      'Variable names come from the variable’s job in this design, not from the topic it represents.',
      'Ask what is varied, what is measured, and what is kept comparable.',
      'Track the role each feature plays.',
      cbrFlow(1),
    ),
    model: {
      title: 'Use actions before labels',
      supportingLine: 'A confound must vary with the groups and plausibly affect the outcome.',
      explanation: [
        'The independent variable is what the comparison varies; the dependent variable is the measured response. A control is deliberately held comparable so it cannot explain the group difference.',
        'A confound is an alternative cause that differs systematically with the comparison groups and can affect the outcome. Merely being related to quiz scores is not enough; it must also track routine group in this study.',
      ],
      visual: relations(
        'Variable roles in CBR-24',
        'Assigned routine is varied, quiz score is measured, and shared quiz procedures are held comparable. A factor becomes a confound only if it also tracks group.',
        [
          {
            label: 'Designed roles',
            nodes: [
              { label: 'Assigned routine', detail: 'varied', emphasis: 'active' },
              { label: 'Quiz score', detail: 'measured response' },
              { label: 'Quiz and room', detail: 'held comparable' },
            ],
            links: ['compare on', 'protect with'],
          },
        ],
      ),
      takeaway:
        'Classify the relationship to the comparison and outcome, not the variable’s name alone.',
    },
    understandingCheck: question(
      'Check the confound test',
      'Time of day can affect quiz score, but both routine groups are balanced across morning and evening sessions. What is time of day in this design?',
      [
        [
          'A controlled feature, because it does not systematically track routine group.',
          'Correct. Its possible effect is prevented from lining up with the comparison.',
        ],
        [
          'A confound, simply because it can affect score.',
          'A possible cause is not an actual confound unless it also differs with group.',
        ],
        ['The dependent variable.', 'Quiz score remains the measured response.'],
        [
          'A mediator caused by routine.',
          'The schedule is set by design rather than caused by routine.',
        ],
      ],
      'A',
      'A confound needs two links: it must vary with the comparison and plausibly affect the outcome. Balancing time removes the first link, so it functions as a control.',
      'Check whether the factor changes whenever the routine changes.',
    ),
    worked: {
      title: 'Find the competing cause',
      supportingLine: 'Change one design detail and the same factor can change roles.',
      explanation: [
        'Suppose every breathing session occurs in the morning and every quiet-sitting session in the evening. Time of day now changes whenever routine changes and could also affect quiz performance.',
        'That makes time of day a confound: the observed score difference cannot be cleanly attributed to routine. Notice that scheduling both groups across the same times would turn time of day from a confound into a controlled feature.',
      ],
      visual: relations(
        'Confounded and controlled schedules',
        'When routine and time of day always change together, either could cause the score difference. Balancing time across routines removes that systematic link.',
        [
          {
            label: 'Confounded',
            nodes: [
              { label: 'Breathing', detail: 'morning only', emphasis: 'active' },
              { label: 'Time of day', detail: 'changes with routine', emphasis: 'active' },
              { label: 'Quiz score', detail: 'either may affect it' },
            ],
            links: ['bundled with', 'may change'],
          },
          {
            label: 'Controlled',
            nodes: [
              { label: 'Both routines', detail: 'morning and evening' },
              { label: 'Time of day', detail: 'balanced' },
              { label: 'Quiz score', detail: 'cleaner comparison' },
            ],
            links: ['share', 'protects'],
          },
        ],
      ),
      takeaway: 'What to notice: a confound is a competing causal path created by the design.',
    },
    guided: question(
      'Separate a control from a confound',
      'Both CBR-24 groups use the same quiz version in the same room. What role do those features play?',
      [
        [
          'Controlled variables that reduce alternative explanations.',
          'Correct. They are deliberately kept comparable across groups.',
        ],
        ['Dependent variables because they affect score.', 'They are not the measured responses.'],
        [
          'Confounds because any influence on score is a confound.',
          'They do not differ systematically by routine group.',
        ],
        [
          'Mediators because they occur during the study.',
          'They are neither caused by the routine nor part of its causal pathway.',
        ],
      ],
      'A',
      'A controlled feature can influence the outcome in principle while still being prevented from explaining the group contrast.',
      'Ask whether the feature differs with the assigned groups.',
    ),
    reducedSupport: question(
      'Use timing to distinguish a mediator',
      'CBR-24 finds that paced breathing lowers immediate stress, which then predicts quiz score. If the routine caused the stress change, stress is best described as:',
      [
        [
          'A mediator on a possible routine-to-score pathway.',
          'Correct. It occurs after assignment and may carry part of the effect.',
        ],
        [
          'A preexisting confound.',
          'A confound precedes exposure and helps cause both exposure and outcome.',
        ],
        ['The independent variable.', 'Routine assignment remains the independent variable.'],
        ['A controlled variable.', 'The stress change is observed, not held constant.'],
      ],
      'A',
      'Timing matters: a mediator follows the proposed cause, whereas a confound is an earlier common cause.',
      'Place the variable before or after routine assignment.',
    ),
    independent: question(
      'Identify what assignment changes',
      'The team replaces self-selection with random assignment. Which threat is most directly reduced?',
      [
        [
          'Systematic baseline differences between the routine groups.',
          'Correct. Random assignment makes preexisting causes less likely to track one condition.',
        ],
        ['Imprecision in the pulse sensor.', 'Assignment does not calibrate a device.'],
        [
          'Lack of representativeness of the one-course sample.',
          'Assignment does not change recruitment.',
        ],
        [
          'Ambiguity in the definition of quiz score.',
          'Operationalization must be fixed directly.',
        ],
      ],
      'A',
      'Random assignment protects the comparison inside the recruited sample by weakening links between baseline factors and condition.',
    ),
    near: question(
      'Audit the CBR-24 schedule',
      'All breathing sessions occur in the morning and all quiet-sitting sessions occur in the evening. What is the main interpretation problem?',
      [
        [
          'Time of day is confounded with routine.',
          'Correct. It changes with group and may affect score.',
        ],
        ['Quiz score becomes the independent variable.', 'Quiz score remains the outcome.'],
        ['Routine becomes controlled.', 'Routine is still the intended comparison.'],
        ['The sample becomes representative.', 'Scheduling cannot repair recruitment.'],
      ],
      'A',
      'Because routine and time change together, the score contrast cannot identify which one produced the difference.',
    ),
    changed: question(
      'Trace a common cause',
      'Before randomization is introduced, more motivated students choose breathing, and motivation also predicts higher quiz scores. Motivation is:',
      [
        [
          'A confound that can create a routine–score association.',
          'Correct. It precedes and influences both exposure choice and outcome.',
        ],
        [
          'A mediator caused by breathing.',
          'The scenario places motivation before routine choice.',
        ],
        ['A control because it was mentioned.', 'Nothing says it was held comparable.'],
        ['The dependent variable.', 'Quiz score remains the measured outcome.'],
      ],
      'A',
      'An earlier common cause creates an alternative path from group membership to the outcome.',
    ),
    repair: {
      title: 'Draw the relationships before naming the variable',
      explanation: [
        'First mark the intended comparison and outcome. Then ask whether the candidate factor is held comparable, changes with group, or occurs after the comparison.',
        'Held comparable means control. An earlier factor linked to both group and outcome can confound. A later factor caused by the exposure may mediate.',
      ],
      visual: relations(
        'Variable-role decision paths',
        'A control is held comparable, a confound is an earlier common cause of group and outcome, and a mediator follows the exposure on a possible pathway to the outcome.',
        [
          {
            label: 'Control',
            nodes: [{ label: 'Same procedure', emphasis: 'active' }, { label: 'Both groups' }],
            links: ['shared by'],
          },
          {
            label: 'Confound',
            nodes: [
              { label: 'Earlier factor', emphasis: 'active' },
              { label: 'Group choice' },
              { label: 'Outcome' },
            ],
            links: ['affects', 'also affects'],
          },
          {
            label: 'Mediator',
            nodes: [
              { label: 'Routine' },
              { label: 'Later change', emphasis: 'active' },
              { label: 'Outcome' },
            ],
            links: ['causes', 'may carry effect'],
          },
        ],
      ),
      strategy:
        'Use two checks: where is the factor in time, and does it systematically track the comparison?',
      checkYourThinking:
        'Would the factor still differ between groups if the routine labels were swapped at random?',
    },
    recap: {
      title: 'The comparison now has a causal structure',
      explanation: [
        'CBR-24 varies routine, measures quiz score, and holds procedures comparable. Random assignment reduces baseline confounding, but it does not decide who entered the study or whether the measurements mean what the team claims.',
      ],
      visual: cbrFlow(2),
      takeaway:
        'Assignment protects group comparability; sampling and measurement answer different questions.',
    },
  },
  {
    key: 'research-sampling',
    kcId: 'V3-KC-678042',
    stageLabel: 'Sampling and measurement',
    nextActionLabel: 'Protect participants and data',
    starting: question(
      'Separate sampling from assignment',
      'CBR-24 recruits volunteers from one introductory course, then randomly assigns those volunteers to routines. What does random assignment accomplish?',
      [
        [
          'It supports comparability of routine groups within the volunteer sample.',
          'Correct. Assignment operates after recruitment and strengthens the within-sample comparison.',
        ],
        [
          'It makes the volunteers representative of all first-year students.',
          'Assignment cannot change how the sample entered.',
        ],
        [
          'It guarantees every measurement is accurate.',
          'Assignment does not validate or calibrate a measure.',
        ],
        [
          'It eliminates nonresponse during recruitment.',
          'Nonresponse is a sampling issue that occurs before assignment.',
        ],
      ],
      'A',
      'Sampling selects people from a population; assignment allocates sampled people to conditions.',
      'Ask whether the decision changes who entered or what condition entrants received.',
      'Two design decisions answer two different questions.',
      cbrFlow(2),
    ),
    model: {
      title: 'Judge people and measures on separate axes',
      explanation: [
        'Sampling determines which population a result may represent; random assignment determines whether groups inside that sample are fairly comparable. A narrow sample can support a strong within-sample contrast while still limiting generalization.',
        'Measurement quality also has distinct dimensions. Precision is tight clustering, accuracy is closeness to a reference, reliability is consistency, and validity is whether the score supports the intended meaning.',
      ],
      visual: relations(
        'Sampling, assignment, and measurement',
        'Recruitment connects a population to a sample, assignment creates comparison groups inside that sample, and measurement turns outcomes into recorded values.',
        [
          {
            label: 'People',
            nodes: [
              { label: 'Target population', detail: 'first-year students' },
              { label: 'Volunteer sample', detail: 'one course', emphasis: 'active' },
              { label: 'Assigned groups', detail: 'breathing or sitting' },
            ],
            links: ['recruit', 'allocate'],
          },
          {
            label: 'Measures',
            nodes: [
              { label: 'Construct', detail: 'stress or performance' },
              { label: 'Instrument', detail: 'scale or quiz' },
              { label: 'Recorded value', detail: 'score' },
            ],
            links: ['represent with', 'produces'],
          },
        ],
      ),
      takeaway:
        'Do not let good assignment stand in for representative sampling or good measurement.',
    },
    understandingCheck: question(
      'Check the sampling–assignment split',
      'CBR-24 randomly assigns volunteers from one course. Which conclusion follows from assignment alone?',
      [
        [
          'The routine groups can be compared more fairly within those volunteers.',
          'Correct. Assignment operates inside the sample after recruitment.',
        ],
        [
          'The volunteers now represent all first-year students.',
          'Assignment does not change who volunteered or the sampling frame.',
        ],
        [
          'The quiz automatically measures every form of learning.',
          'Measurement validity requires separate evidence.',
        ],
        [
          'The sample has no generalization limits.',
          'One-course recruitment still limits population reach.',
        ],
      ],
      'A',
      'Random assignment strengthens the sample-to-groups bridge. It cannot repair the earlier population-to-sample bridge or prove what an instrument means.',
      'Ask whether the decision changes entry into the sample or allocation after entry.',
    ),
    worked: {
      title: 'Audit the CBR-24 sample and sensor',
      explanation: [
        'The one-course volunteer sample may differ from students at other campuses, so broad population transport remains uncertain even after random assignment. Inside that sample, assignment can still support a fair routine comparison.',
        'Now compare pulse readings of 80, 80, and 81 with a reference of 72. The readings cluster tightly, so they are precise, but they sit far from the reference, so they are inaccurate.',
      ],
      visual: relations(
        'Two independent quality checks',
        'One-course recruitment limits population reach. Pulse readings that cluster around 80 when the reference is 72 are precise but inaccurate.',
        [
          {
            label: 'Generalization',
            nodes: [
              { label: 'One course', detail: 'sampling frame', emphasis: 'active' },
              { label: 'All students', detail: 'target claim', emphasis: 'muted' },
            ],
            links: ['does not automatically represent'],
          },
          {
            label: 'Measurement',
            nodes: [
              { label: '80, 80, 81', detail: 'tight cluster', emphasis: 'active' },
              { label: 'Reference 72', detail: 'far away' },
            ],
            links: ['compare with'],
          },
        ],
      ),
      takeaway:
        'What to notice: quality terms describe different comparisons, so one strength cannot prove the others.',
    },
    guided: question(
      'Distinguish reliability from validity',
      'CBR-24’s stress scale gives nearly the same score minutes apart, but evidence shows it mainly captures familiarity with the quiz room rather than stress. Which description fits?',
      [
        [
          'Reliable but weak in construct validity.',
          'Correct. The score is consistent but does not represent the intended construct well.',
        ],
        [
          'Valid because it is reliable.',
          'Consistency is useful but does not prove the intended interpretation.',
        ],
        [
          'Accurate because the numbers repeat.',
          'Accuracy needs a relevant reference, not repetition alone.',
        ],
        [
          'Representative because all participants use it.',
          'Using one measure consistently does not address sampling.',
        ],
      ],
      'A',
      'Reliability asks whether a measure repeats; validity asks whether the resulting interpretation is warranted.',
      'A consistently wrong or mis-targeted measure can still be reliable.',
    ),
    reducedSupport: question(
      'Read precision and accuracy',
      'A calibrated reference is 72. A device reports 80, 80, and 81. The readings are:',
      [
        ['Precise but inaccurate.', 'Correct. They cluster tightly but miss the reference.'],
        ['Accurate but imprecise.', 'The readings do not center near 72.'],
        ['Both accurate and precise.', 'Tight clustering does not erase the systematic offset.'],
        [
          'Neither, because there are only three readings.',
          'The observed pattern is enough to identify tight clustering and distance from the reference.',
        ],
      ],
      'A',
      'Precision compares readings with one another; accuracy compares them with a relevant reference.',
    ),
    independent: question(
      'Bound the population claim',
      'The randomized CBR-24 result comes from volunteers in one commuter-campus course. Which statement is best?',
      [
        [
          'The routine comparison may be internally strong while generalization to all students remains uncertain.',
          'Correct. Assignment and sampling quality can differ.',
        ],
        [
          'Random assignment makes the sample nationally representative.',
          'Assignment occurs only after the sample is formed.',
        ],
        [
          'A sample of 240 guarantees external validity.',
          'Sample size does not repair a narrow or biased frame.',
        ],
        [
          'No conclusion can be drawn inside the sample.',
          'The randomized comparison can still be informative for those participants.',
        ],
      ],
      'A',
      'A study can support causal inference within its sample without automatically supporting transport to a broader population.',
    ),
    near: question(
      'Check measurement meaning',
      'The stress scale is highly consistent across repeated administrations but mostly reflects quiz familiarity. What is the clearest limitation?',
      [
        [
          'Weak construct validity despite good reliability.',
          'Correct. It repeats but represents the wrong construct.',
        ],
        ['Low reliability because it repeats.', 'Repetition supports reliability.'],
        ['Poor random assignment.', 'Assignment cannot determine what the scale represents.'],
        ['Sampling bias in the instrument.', 'The issue is measurement meaning, not who entered.'],
      ],
      'A',
      'Consistency cannot substitute for evidence that the score means what the researchers say it means.',
    ),
    changed: question(
      'Identify a sampling limitation',
      'CBR-24 emails every student in the course, but only students already interested in breathing exercises volunteer. What is the main concern?',
      [
        [
          'Volunteer selection may limit how well the sample represents the course.',
          'Correct. Interest is related to who enters the sample.',
        ],
        [
          'Random assignment inside the sample becomes impossible.',
          'Volunteers can still be randomly assigned after recruitment.',
        ],
        ['Quiz score is no longer a dependent variable.', 'Its role does not change.'],
        ['The breathing routine becomes a confound.', 'Routine remains the assigned comparison.'],
      ],
      'A',
      'Selection into the sample can limit generalization even when condition assignment is well controlled.',
    ),
    repair: {
      title: 'Ask which bridge is being judged',
      explanation: [
        'Population to sample is the sampling bridge. Sample to groups is the assignment bridge. Construct to score is the measurement bridge.',
        'Evaluate the bridge named by the claim. Random assignment strengthens the group comparison, but it cannot make one course represent everyone or make a stress scale measure stress.',
      ],
      visual: relations(
        'Three study-quality bridges',
        'Sampling links population to sample, assignment links sample to groups, and measurement links a construct to a score.',
        [
          {
            label: 'Sampling bridge',
            nodes: [{ label: 'Population' }, { label: 'Sample', emphasis: 'active' }],
            links: ['represented by?'],
          },
          {
            label: 'Assignment bridge',
            nodes: [{ label: 'Sample' }, { label: 'Groups', emphasis: 'active' }],
            links: ['balanced into?'],
          },
          {
            label: 'Measurement bridge',
            nodes: [{ label: 'Construct' }, { label: 'Score', emphasis: 'active' }],
            links: ['represented by?'],
          },
        ],
      ),
      strategy:
        'Underline the claim’s target—population, group contrast, or construct—before choosing the quality criterion.',
      checkYourThinking:
        'Would fixing assignment change who volunteered or what the instrument measures?',
    },
    recap: {
      title: 'People and measurements now have limits',
      explanation: [
        'CBR-24 can compare assigned groups within its volunteers, but one-course recruitment limits broad generalization. Its scores also need evidence of consistency and meaning. The next audit follows participants from recruitment through data storage.',
      ],
      visual: cbrFlow(3),
      takeaway:
        'Sampling, assignment, and measurement each support a different part of the final inference.',
    },
  },
  {
    key: 'research-ethics',
    kcId: 'V3-KC-965248',
    stageLabel: 'Ethics and integrity',
    nextActionLabel: 'Bound the conclusion',
    starting: question(
      'Check more than consent',
      'CBR-24 recruits adults for a minimal-risk behavioral intervention and collects identifiable stress data. Which statement is strongest?',
      [
        [
          'Prospective review should consider risk, selection, privacy, consent, and monitoring as applicable.',
          'Correct. Ethical acceptability depends on a system of safeguards.',
        ],
        [
          'A signed consent form makes every other design choice acceptable.',
          'Consent does not replace risk minimization, fair selection, data protection, or review.',
        ],
        [
          'Minimal physical risk makes confidentiality unnecessary.',
          'Identifiable sensitive data can still create informational harm.',
        ],
        [
          'Scientific value allows the instructor to require participation.',
          'Potential value does not remove voluntariness.',
        ],
      ],
      'A',
      'Different safeguards address different risks, so no single checkbox makes an entire protocol ethical.',
      'Follow the participant through recruitment, intervention, and data handling.',
      'Audit each point where choice, welfare, or information could be harmed.',
      cbrFlow(3),
    ),
    model: {
      title: 'Follow the participant through the protocol',
      explanation: [
        'Ethical review asks whether participation is voluntary, selection is fair, risks are proportionate and minimized, and private information is protected. Independent review matters because researchers may underestimate burdens in their own plan.',
        'Privacy concerns access to people or personal information; confidentiality concerns protecting information already collected. Scientific integrity is another obligation: the record must not be fabricated, falsified, or presented misleadingly.',
      ],
      visual: relations(
        'Participant and data flow',
        'A participant is recruited, chooses whether to consent, completes the study, and has data stored and reported. Each step needs a matching safeguard.',
        [
          {
            label: 'Participant path',
            nodes: [
              { label: 'Recruit', detail: 'fair and unpressured' },
              { label: 'Choose', detail: 'informed and voluntary', emphasis: 'active' },
              { label: 'Participate', detail: 'minimize risk' },
              { label: 'Store data', detail: 'limit access' },
              { label: 'Report', detail: 'preserve the record' },
            ],
            links: ['then', 'then', 'then', 'then'],
          },
        ],
      ),
      takeaway:
        'Match each risk to the safeguard that directly reduces it; strengths elsewhere do not cancel a failure.',
    },
    understandingCheck: question(
      'Check the matching safeguard',
      'CBR-24 has already collected identifiable stress scores. Which safeguard most directly reduces disclosure risk?',
      [
        [
          'Separate the identity key, restrict access, and set a deletion schedule.',
          'Correct. These steps directly change who can connect records to people and for how long.',
        ],
        [
          'Randomly assign the routines again.',
          'Assignment protects a comparison, not stored data.',
        ],
        [
          'Recruit more participants.',
          'Sample size does not limit access to identifiable records.',
        ],
        [
          'Describe the routine as minimal risk.',
          'A label does not protect sensitive information.',
        ],
      ],
      'A',
      'Once data exist, confidentiality depends on linkage, access, storage, disclosure, and deletion. The safeguard should directly change one of those paths.',
      'Follow the risk to the point where the information is stored or released.',
    ),
    worked: {
      title: 'Audit pressure and disclosure risk',
      explanation: [
        'Suppose the instructor who assigns grades recruits their own students and offers a large grade bonus. Authority plus a large academic incentive can compromise voluntariness even if a consent form is signed.',
        'The team also stores identifiable stress scores. Neutral recruitment and an equivalent nonresearch option address pressure; minimizing identifiers, separating the key, limiting access, and setting deletion rules address disclosure risk.',
      ],
      visual: relations(
        'Risk-to-safeguard matching',
        'Instructor authority and a large grade bonus threaten voluntary choice. Identifiable stress records create disclosure risk. Neutral recruitment and secure data handling address different problems.',
        [
          {
            label: 'Choice',
            nodes: [
              { label: 'Instructor authority', detail: 'pressure risk', emphasis: 'active' },
              { label: 'Neutral recruiter', detail: 'equivalent alternative' },
            ],
            links: ['reduce with'],
          },
          {
            label: 'Information',
            nodes: [
              { label: 'Identifiable scores', detail: 'disclosure risk', emphasis: 'active' },
              { label: 'Limited access', detail: 'separate key and delete' },
            ],
            links: ['protect with'],
          },
        ],
      ),
      takeaway:
        'What to notice: consent addresses informed choice, while recruitment power and data security require additional safeguards.',
    },
    guided: question(
      'Separate privacy and confidentiality',
      'CBR-24 has already collected identifiable stress scores. Which action most directly protects confidentiality?',
      [
        [
          'Store coded data with the identity key separate and restrict access.',
          'Correct. This reduces unauthorized disclosure of collected information.',
        ],
        ['Recruit a larger sample.', 'Sample size does not protect stored information.'],
        ['Randomly assign routines.', 'Assignment protects comparison, not data access.'],
        ['Call the intervention minimal risk.', 'A label does not secure data.'],
      ],
      'A',
      'Confidentiality concerns how collected information is stored, accessed, linked, and disclosed.',
      'Choose the safeguard that changes access to the existing records.',
    ),
    reducedSupport: question(
      'Protect voluntary choice',
      'The grading instructor offers a large course-credit bonus for joining CBR-24 and no equivalent alternative. What is the central concern?',
      [
        [
          'Undue influence may compromise voluntariness.',
          'Correct. Authority and a large academic incentive can distort free choice.',
        ],
        ['The quiz score is imprecise.', 'No measurement pattern is given.'],
        [
          'The routine is not an independent variable.',
          'Variable classification does not resolve recruitment pressure.',
        ],
        ['Confidentiality alone.', 'The scenario centers on choice before data collection.'],
      ],
      'A',
      'Voluntariness depends on a realistic ability to decline without disproportionate loss or pressure.',
    ),
    independent: question(
      'Protect the research record',
      'The CBR-24 team removes valid low scores from the breathing group solely because the result becomes less favorable, then reports no exclusion. This is best described as:',
      [
        [
          'Falsification of the research record.',
          'Correct. Selective manipulation or omission makes the reported record misleading.',
        ],
        [
          'Fabrication because all values were invented.',
          'The values existed; the problem is undisclosed manipulation of the record.',
        ],
        ['A privacy safeguard.', 'Omitting results for favorability does not protect identities.'],
        [
          'Random assignment.',
          'Assignment happened earlier and does not justify selective deletion.',
        ],
      ],
      'A',
      'Fabrication makes up data; falsification manipulates materials, procedures, or reporting so the record is not accurately represented.',
    ),
    near: question(
      'Find two independent failures',
      'CBR-24 stores identifiable stress scores on a public class drive and tells students participation is required for course credit. Which evaluation is strongest?',
      [
        [
          'Both voluntariness and confidentiality require correction.',
          'Correct. The protocol fails at choice and at data protection.',
        ],
        [
          'Only confidentiality is a concern.',
          'Required participation also threatens voluntariness.',
        ],
        [
          'No concern exists because breathing is minimal risk.',
          'Minimal physical risk does not erase informational or coercion risks.',
        ],
        [
          'Only measurement validity matters.',
          'The stated failures are ethical safeguards, not score interpretation.',
        ],
      ],
      'A',
      'Multiple protections can fail at once; each needs a direct correction.',
    ),
    changed: question(
      'Audit deidentified reporting',
      'The team removes names but releases a table containing rare combinations of course, age, and exact stress score that can identify individuals. What remains at risk?',
      [
        [
          'Confidentiality, because the released combinations may permit reidentification.',
          'Correct. Removing names is not enough when remaining fields can reveal identity.',
        ],
        ['Random assignment.', 'Publication fields do not change condition allocation.'],
        ['Precision.', 'The concern is disclosure, not clustering of readings.'],
        [
          'The existence of informed consent only.',
          'Consent does not automatically authorize avoidable reidentification risk.',
        ],
      ],
      'A',
      'Data protection depends on realistic identifiability, not merely whether a name column was removed.',
    ),
    repair: {
      title: 'Match each failure to its own safeguard',
      explanation: [
        'Walk through recruitment, choice, intervention, storage, and reporting. At each step name the specific harm before choosing a correction.',
        'Neutral recruitment cannot encrypt a file, and coding a file cannot remove instructor pressure. Ethical reasoning is strongest when each safeguard is tied to the risk it changes.',
      ],
      visual: relations(
        'Ethics repair map',
        'Recruitment pressure is reduced by neutral choice procedures, intervention risk by minimization and monitoring, data disclosure by access controls, and misleading reporting by research integrity.',
        [
          {
            label: 'Risk and response',
            nodes: [
              { label: 'Pressure', detail: 'neutral choice', emphasis: 'active' },
              { label: 'Study harm', detail: 'minimize and monitor' },
              { label: 'Disclosure', detail: 'limit and secure' },
              { label: 'Misleading record', detail: 'report faithfully' },
            ],
            links: ['next check', 'next check', 'next check'],
          },
        ],
      ),
      strategy:
        'Name the threatened interest—choice, welfare, information, or integrity—before selecting a safeguard.',
      checkYourThinking:
        'Does the proposed correction directly change the risk described in the scenario?',
    },
    recap: {
      title: 'The protocol now protects people and evidence',
      explanation: [
        'CBR-24 needs voluntary recruitment, proportionate risk, appropriate review, protected data, and an accurate research record. With those safeguards and the earlier design checks in place, the final task is to decide how strong and how broad the conclusion may be.',
      ],
      visual: cbrFlow(4),
      takeaway:
        'Ethical acceptability and scientific validity are distinct, but both constrain a warranted conclusion.',
    },
  },
  {
    key: 'research-inference',
    kcId: 'V3-KC-388302',
    stageLabel: 'Inference and limits',
    nextActionLabel: 'Finish the lesson',
    starting: question(
      'Find the alternative explanation',
      'Before randomization, more motivated CBR-24 students choose breathing, and motivation predicts quiz score. Why does this weaken a causal claim?',
      [
        [
          'Motivation is an earlier common cause of exposure choice and outcome.',
          'Correct. It can create an association even if breathing has no effect.',
        ],
        [
          'Motivation must be a mediator after breathing.',
          'The scenario places it before exposure choice.',
        ],
        ['Quiz score becomes the independent variable.', 'Quiz score remains the outcome.'],
        [
          'Any association proves the reverse cause.',
          'The issue is unresolved alternatives, not proof of one reverse pathway.',
        ],
      ],
      'A',
      'Causal inference requires the proposed cause to precede the outcome and a design that makes major alternatives less plausible.',
      'Look for a factor that existed before both routine choice and score.',
      'Use all earlier design decisions to bound the final claim.',
      cbrFlow(4),
    ),
    model: {
      title: 'Move from design to the strongest warranted claim',
      explanation: [
        'Association means two variables vary together; causation adds a claim that changing one produced a change in the other. Temporality is necessary, but strong causal inference also needs manipulation or another design basis, comparison, and control of plausible alternatives.',
        'Random assignment can support a bounded causal contrast inside the study sample. It does not by itself establish a mechanism, an effect for every person, permanence, or automatic generalization to people who were not sampled.',
      ],
      visual: relations(
        'Causal-inference ladder',
        'The proposed cause comes first, the routine is manipulated, assignment balances alternatives, a concurrent group provides comparison, and the claim remains bounded to the measured outcome and sample.',
        [
          {
            label: 'Warrant',
            nodes: [
              { label: 'Cause first', detail: 'temporality' },
              { label: 'Routine assigned', detail: 'manipulation', emphasis: 'active' },
              { label: 'Groups compared', detail: 'concurrent control' },
              { label: 'Alternatives reduced', detail: 'randomization and procedures' },
              { label: 'Claim bounded', detail: 'sample, outcome, time' },
            ],
            links: ['plus', 'plus', 'plus', 'then'],
          },
        ],
      ),
      takeaway:
        'Choose causal language from the design, then choose its scope from the sample, measures, time, and result.',
    },
    understandingCheck: question(
      'Check warrant before scope',
      'Random assignment supports a causal contrast for CBR-24. Which limit still remains?',
      [
        [
          'The claim must stay with the volunteer sample, measured outcome, and immediate time.',
          'Correct. Randomization strengthens the causal verb without expanding the study’s nouns or duration.',
        ],
        [
          'The groups can only be described as associated.',
          'That underclaims what manipulation and random assignment can support.',
        ],
        [
          'Every participant must have improved by the same amount.',
          'A difference in group means does not imply one identical individual effect.',
        ],
        [
          'The study has established a neural mechanism.',
          'No mechanism measure was added by random assignment.',
        ],
      ],
      'A',
      'Design quality determines whether causal language is warranted. Sampling, measurement, time, and result level separately determine how far that causal sentence may travel.',
      'Choose the verb from design, then copy the study’s scope into the claim.',
    ),
    worked: {
      title: 'Read the complete CBR-24 result',
      explanation: [
        'CBR-24 randomly assigns 240 volunteers, uses a concurrent quiet-sitting group, conceals condition labels from scorers, and retains 232 participants with low balanced attrition. Mean immediate quiz score is 15.2 with breathing and 13.1 with sitting; the reported 95% interval for the 2.1-point difference is 0.4 to 3.8.',
        'The design supports saying assignment to paced breathing caused a higher mean immediate quiz score in this volunteer sample. Notice the limits: the result is a group average for one immediate quiz, not proof of benefit for every person, permanent intelligence change, a neural mechanism, or all students.',
      ],
      visual: relations(
        'From CBR-24 result to conclusion',
        'Random assignment and a concurrent comparison support a bounded causal contrast: breathing assignment raised mean immediate quiz score by 2.1 points in this volunteer sample.',
        [
          {
            label: 'Design',
            nodes: [
              { label: 'Random assignment' },
              { label: 'Concurrent control' },
              { label: 'Blinded scoring' },
              { label: 'Balanced retention' },
            ],
            links: ['+', '+', '+'],
          },
          {
            label: 'Result and claim',
            nodes: [
              { label: '15.2 vs 13.1', detail: 'mean scores' },
              { label: '+2.1 points', detail: 'interval 0.4 to 3.8', emphasis: 'active' },
              { label: 'Bounded causal effect', detail: 'sample and immediate quiz' },
            ],
            links: ['difference', 'supports'],
          },
        ],
      ),
      takeaway: 'What to notice: a causal claim can be justified and still be deliberately narrow.',
    },
    guided: question(
      'Distinguish association from causation',
      'If students choose their own routine and the team only observes that breathing users score higher, which conclusion is safest?',
      [
        [
          'Routine choice is associated with quiz score; self-selection leaves alternative explanations.',
          'Correct. The observed relationship does not isolate breathing from prior differences.',
        ],
        [
          'Breathing caused the score difference.',
          'Self-selection allows common causes such as motivation.',
        ],
        [
          'Quiz score caused students to choose breathing afterward.',
          'The scenario does not establish this reverse path.',
        ],
        [
          'No relationship exists because the design is observational.',
          'The association can be described even when causation is unresolved.',
        ],
      ],
      'A',
      'Observational data can support an association while leaving direction and confounding uncertain.',
      'Describe what co-varies without claiming the design changed one factor.',
    ),
    reducedSupport: question(
      'Bound a randomized conclusion',
      'CBR-24 is randomized and measures only the immediate quiz. Which phrase still overreaches?',
      [
        [
          'Caused a higher mean immediate quiz score in the volunteer sample.',
          'That matches the randomized contrast and measured outcome.',
        ],
        ['Produced a 2.1-point difference in group means.', 'That describes the reported result.'],
        [
          'Permanently increased intelligence in all students.',
          'Correct. Time, construct, universality, and population all exceed the evidence.',
        ],
        [
          'Changed the measured group-average score under these study conditions.',
          'That remains bounded.',
        ],
      ],
      'C',
      'Randomization strengthens the causal verb but does not expand the sample, outcome, duration, or level from average to every person.',
    ),
    independent: question(
      'State the strongest conclusion',
      'CBR-24 randomly assigns volunteers, has low balanced attrition, and finds a 2.1-point higher mean immediate score with breathing. Which conclusion is strongest without overclaiming?',
      [
        [
          'Breathing assignment caused a higher mean immediate quiz score in this study sample.',
          'Correct. It uses the design’s causal strength and preserves its scope limits.',
        ],
        [
          'Breathing permanently raises intelligence in all first-year students.',
          'The construct, duration, universality, and population are unsupported.',
        ],
        [
          'The variables are associated, but randomized studies can never support causation.',
          'That underclaims what manipulation and random assignment can support.',
        ],
        [
          'Every participant benefited by exactly 2.1 points.',
          'A difference in group means is not an identical individual effect.',
        ],
      ],
      'A',
      'The best conclusion avoids both extremes: causal overreach and the false rule that a randomized study can only show association.',
    ),
    near: question(
      'Check the full warrant',
      'Which feature most directly supports interpreting the CBR-24 group difference causally?',
      [
        [
          'Random assignment to the breathing or sitting routine before the quiz.',
          'Correct. It establishes temporality and reduces systematic baseline differences.',
        ],
        ['A large title on the study report.', 'Presentation does not change the design.'],
        [
          'Measuring scores to one decimal place.',
          'More digits do not control alternative causes.',
        ],
        ['Recruiting from one course.', 'That describes the sample and may limit generalization.'],
      ],
      'A',
      'Assignment before the outcome changes the exposure and weakens common-cause explanations for the group contrast.',
    ),
    changed: question(
      'Locate a new limitation',
      'A revised CBR-24 still randomizes, but 35% of the breathing group and 5% of the sitting group leave before the quiz. What becomes harder to defend?',
      [
        [
          'That the analyzed groups remain comparable after differential attrition.',
          'Correct. Unequal loss can undo the balance created at assignment.',
        ],
        ['That routine assignment occurred before the quiz.', 'Temporality remains clear.'],
        ['That quiz score is the measured outcome.', 'The outcome role is unchanged.'],
        [
          'That paced breathing was the assigned intervention.',
          'The intervention remains named; postassignment loss is the problem.',
        ],
      ],
      'A',
      'Randomization protects the initial groups. Large differential attrition can create new differences among those who remain.',
    ),
    repair: {
      title: 'Use two passes: warrant, then scope',
      explanation: [
        'First audit the causal warrant: cause before outcome, manipulation, assignment, comparison, consistent procedures, and plausible alternatives. Then audit scope: people, outcome, time, average versus individual, and measured versus unmeasured mechanisms.',
        'A weakness in warrant changes whether causal language is justified. A scope limit changes how far an otherwise justified causal claim may travel.',
      ],
      visual: relations(
        'Two-pass inference repair',
        'The first pass asks whether the design supports causation. The second pass restricts the claim to the sample, measured outcome, time, and level of result.',
        [
          {
            label: 'Pass 1 · Warrant',
            nodes: [
              { label: 'Temporality' },
              { label: 'Assignment' },
              { label: 'Comparison' },
              { label: 'Alternatives', emphasis: 'active' },
            ],
            links: ['+', '+', '+'],
          },
          {
            label: 'Pass 2 · Scope',
            nodes: [
              { label: 'Sample' },
              { label: 'Outcome' },
              { label: 'Time' },
              { label: 'Group average', emphasis: 'active' },
            ],
            links: ['+', '+', '+'],
          },
        ],
      ),
      strategy:
        'Decide the verb from the design, then copy the study’s nouns and time into the conclusion.',
      checkYourThinking:
        'Are you denying a causal warrant the design earned, or adding a population, mechanism, duration, or individual effect it did not?',
    },
    recap: {
      title: 'CBR-24 now supports a bounded conclusion',
      explanation: [
        'The question, variables, sample, measures, protections, and randomized comparison now line up. CBR-24 supports a causal effect of breathing assignment on mean immediate quiz score in its volunteer sample, while leaving long-term effects, mechanisms, individual uniformity, and broad population transport open.',
      ],
      visual: cbrFlow(4, 'Every design decision contributes to what the final sentence may say.'),
      takeaway:
        'Strong scientific reasoning states the most informative claim the design warrants—no weaker and no broader.',
    },
  },
] as const;

const INTRO_NODE = {
  id: 'research-intro',
  kcIds: ['V3-KC-231348', 'V3-KC-136063', 'V3-KC-678042', 'V3-KC-965248', 'V3-KC-388302'],
  kind: 'intro',
  title: 'Design studies and judge conclusions',
  outcome:
    'Follow one study from a focused question to the strongest conclusion its design can support.',
  details: [
    'Use CBR-24 to connect questions, variables, participants, measurements, protections, and inference.',
  ],
} as const;

const COMPLETION_NODE = {
  id: 'research-complete',
  kcIds: ['V3-KC-231348', 'V3-KC-136063', 'V3-KC-678042', 'V3-KC-965248', 'V3-KC-388302'],
  kind: 'completion',
  title: 'You can audit a study from question to claim',
  summary:
    'You followed CBR-24 as each design choice changed what could be measured, protected, compared, generalized, and concluded.',
  takeaways: [
    'A testable question matches a comparison, measurement, people, and time.',
    'Sampling, assignment, controls, and measurement quality support different parts of an inference.',
    'Causal language comes from design; the sample, outcome, time, and result set its limits.',
  ],
  nextStep: 'On a new study, draw the design flow first and make the conclusion mirror it.',
} as const;

export const RESEARCH_DESIGN_SCRIPT = defineLessonScriptPreview({
  schemaVersion: 'lesson-script-preview/v2',
  status: 'internal-preview',
  id: 'V3-LES-765609',
  contentVersion: 'app-native-research-v2.1.0-review-flow',
  slug: 'research-design',
  title: 'Design studies and judge conclusions',
  internalTitle: 'Research questions, design, and inference limits',
  subject: 'Scientific inquiry',
  description:
    'Connect research questions to variables, sampling, ethics, and the claims a study can support.',
  estimatedMinutes: 57,
  requiredKcs: [
    {
      id: 'V3-KC-231348',
      title: 'Form testable questions and hypotheses',
      learnerOutcome:
        'Match a question or hypothesis to the comparison and observations a study can make.',
      previewCoverage: 'complete-review-focus',
    },
    {
      id: 'V3-KC-136063',
      title: 'Identify variables, controls, and confounds',
      learnerOutcome:
        'Classify variable roles and explain how controls or confounds change interpretation.',
      previewCoverage: 'complete-review-focus',
    },
    {
      id: 'V3-KC-678042',
      title: 'Evaluate sampling and measurement quality',
      learnerOutcome:
        'Separate sampling from assignment and judge accuracy, precision, reliability, and validity.',
      previewCoverage: 'complete-review-focus',
    },
    {
      id: 'V3-KC-965248',
      title: 'Evaluate research ethics',
      learnerOutcome:
        'Match participant, data, and integrity risks to the safeguards that address them.',
      previewCoverage: 'complete-review-focus',
    },
    {
      id: 'V3-KC-388302',
      title: 'Bound causal inference by design',
      learnerOutcome:
        'Use temporality, assignment, control, and limitations to distinguish association from bounded causation.',
      previewCoverage: 'complete-review-focus',
    },
  ],
  teachingObjective:
    'Use one coherent study to show how each design decision changes the strongest warranted conclusion.',
  nodes: [
    INTRO_NODE,
    ...RESEARCH_SECTIONS.flatMap((section) => buildSectionNodes(section)),
    COMPLETION_NODE,
  ],
  modelNodeIds: RESEARCH_SECTIONS.map((section) => sectionNodeId(section, 'model')) as unknown as [
    string,
    ...string[],
  ],
  workedExplanationNodeIds: RESEARCH_SECTIONS.map((section) =>
    sectionNodeId(section, 'worked'),
  ) as unknown as [string, ...string[]],
  practice: {
    guidedNodeIds: RESEARCH_SECTIONS.map((section) =>
      sectionNodeId(section, 'guided'),
    ) as unknown as [string, ...string[]],
    reducedSupportNodeIds: RESEARCH_SECTIONS.map((section) =>
      sectionNodeId(section, 'reduced-support'),
    ) as unknown as [string, ...string[]],
    independentNodeIds: RESEARCH_SECTIONS.map((section) =>
      sectionNodeId(section, 'independent'),
    ) as unknown as [string, ...string[]],
  },
  exit: {
    nearNodeIds: RESEARCH_SECTIONS.map((section) =>
      sectionNodeId(section, 'exit-near'),
    ) as unknown as [string, ...string[]],
    changedNodeIds: RESEARCH_SECTIONS.map((section) =>
      sectionNodeId(section, 'exit-changed'),
    ) as unknown as [string, ...string[]],
  },
  repairNodeIds: RESEARCH_SECTIONS.map((section) =>
    sectionNodeId(section, 'repair'),
  ) as unknown as [string, ...string[]],
  completionNodeId: COMPLETION_NODE.id,
});

export { RESEARCH_SECTIONS };
