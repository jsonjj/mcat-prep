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

interface PassageSentence {
  readonly id: string;
  readonly label: string;
  readonly text: string;
}

const ANCHOR_PARAGRAPHS: readonly [
  readonly [PassageSentence, PassageSentence, PassageSentence, PassageSentence],
  readonly [PassageSentence, PassageSentence, PassageSentence, PassageSentence],
  readonly [PassageSentence, PassageSentence, PassageSentence, PassageSentence],
] = [
  [
    {
      id: 's1',
      label: 'S1',
      text: 'In many community museums, fragile tools remain behind glass while replicas sit on handling tables.',
    },
    {
      id: 's2',
      label: 'S2',
      text: 'Curators often describe this arrangement as a compromise between preservation and access.',
    },
    {
      id: 's3',
      label: 'S3',
      text: 'But a handling replica should be treated as an interpretation, not merely as a second-best copy.',
    },
    {
      id: 's4',
      label: 'S4',
      text: 'In a pilot described by one fictional museum, visitors who lifted a replica plane wrote more often about the tool’s weight than visitors who saw only a photograph.',
    },
  ],
  [
    {
      id: 's5',
      label: 'S5',
      text: 'Weight, after all, directs attention to the repeated bodily effort that the tool demanded.',
    },
    {
      id: 's6',
      label: 'S6',
      text: 'A visitor may, for example, imagine why a craftsperson shifted grip during a long task.',
    },
    {
      id: 's7',
      label: 'S7',
      text: 'Touch does not, however, recover the whole history of work.',
    },
    {
      id: 's8',
      label: 'S8',
      text: 'The replica cannot by itself disclose wages, workshop noise, or workers’ own judgments.',
    },
  ],
  [
    {
      id: 's9',
      label: 'S9',
      text: 'Some curators object that labels emphasizing reconstruction will make visitors distrust every display.',
    },
    {
      id: 's10',
      label: 'S10',
      text: 'That concern is reasonable when a warning is so elaborate that it overwhelms the object.',
    },
    {
      id: 's11',
      label: 'S11',
      text: 'Yet a brief label can state what was reconstructed and what remains unknown without inviting wholesale doubt.',
    },
    {
      id: 's12',
      label: 'S12',
      text: 'Museums should therefore pair touchable replicas with concise limits labels, expanding access while making interpretation visible.',
    },
  ],
];

function anchorPassage(
  focus: readonly { readonly id: string; readonly annotation?: string }[] = [],
  caption?: string,
): PassageVisualPreview {
  const focusMap = new Map(focus.map((item) => [item.id, item.annotation]));
  const focusDescription =
    focus.length === 0
      ? 'No sentences are highlighted.'
      : `Highlighted sentences: ${focus
          .map(({ id, annotation }) =>
            annotation === undefined ? id.toUpperCase() : `${id.toUpperCase()} as ${annotation}`,
          )
          .join('; ')}.`;
  const paragraphs = ANCHOR_PARAGRAPHS.map((sentences, index) => ({
    id: `paragraph-${index + 1}`,
    sentences: sentences.map((sentence) => {
      const focused = focusMap.has(sentence.id);
      const annotation = focusMap.get(sentence.id);
      return {
        ...sentence,
        ...(focused ? { focused: true } : {}),
        ...(annotation === undefined ? {} : { annotation }),
      };
    }),
  })) as unknown as PassageVisualPreview['paragraphs'];

  return {
    kind: 'passage',
    alt: 'Complete passage about touchable museum replicas and limits labels',
    textEquivalent: `The complete three-paragraph passage is shown with sentence labels. ${focusDescription}`,
    title: 'What a Replica Can Admit',
    paragraphs,
    caption,
  };
}

function question(
  title: string,
  prompt: string,
  choices: ChoiceSet,
  correctOptionId: ChoiceId,
  explanation: string,
  focus: readonly { readonly id: string; readonly annotation?: string }[],
  help?: string,
  supportingLine?: string,
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
  return {
    title,
    supportingLine,
    prompt,
    options,
    correctOptionId,
    feedbackByOption: Object.fromEntries(ids.map((id, index) => [id, choices[index][1]])),
    explanation,
    help,
    visual: anchorPassage(focus),
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

const ARGUMENT_SECTIONS: readonly LessonSectionAuthoring[] = [
  {
    key: 'argument-elements',
    kcId: 'V3-KC-189442',
    stageLabel: 'Argument elements',
    nextActionLabel: 'Map how the parts relate',
    starting: question(
      'Find the passage’s final recommendation',
      'Which sentence states the conclusion the whole passage is building toward?',
      [
        [
          'S3, because it introduces replicas as interpretations.',
          'S3 is an important intermediate conclusion, but the final paragraph carries the argument farther.',
        ],
        [
          'S4, because it reports a pilot comparison.',
          'S4 is evidence offered in support of the interpretation claim.',
        ],
        [
          'S9, because it presents a concern from some curators.',
          'S9 is an objection the author later answers.',
        ],
        [
          'S12, because it gives the final recommendation supported by the earlier parts.',
          'Correct. S12 is the endpoint the passage asks the reader to accept.',
        ],
      ],
      'D',
      'A conclusion is a claim another passage part gives you a reason to accept. The final conclusion is the broadest endpoint supported across the passage.',
      [{ id: 's12' }],
      'Ask which sentence the other reasons, limits, and reply are organized to support.',
      'Read the full passage before classifying one sentence.',
    ),
    model: {
      title: 'Classify a sentence by the job it performs',
      supportingLine: 'Content alone does not determine role; relation to nearby sentences does.',
      explanation: [
        'A claim asks the reader to accept an idea; a conclusion is a claim supported by other passage parts. Evidence reports an observation or record, while an illustration supplies a concrete case that makes an idea easier to see.',
        'Background frames the issue without doing the immediate supporting work. A warrant is the reasoning bridge that explains why evidence bears on a claim; in this passage, S5 explains why noticing weight matters for treating the replica as interpretation.',
      ],
      visual: anchorPassage(
        [
          { id: 's1', annotation: 'background' },
          { id: 's3', annotation: 'intermediate conclusion' },
          { id: 's4', annotation: 'reported evidence' },
          { id: 's5', annotation: 'reasoning bridge' },
          { id: 's6', annotation: 'illustration' },
        ],
        'The highlighted labels describe each sentence’s role in this passage.',
      ),
      takeaway:
        'Find the support arrow: the reason or evidence is the source, and the supported conclusion is its target.',
    },
    understandingCheck: question(
      'Check evidence against warrant',
      'S4 reports that handling-replica visitors wrote more often about weight. S5 explains why attention to weight matters. What is S5 doing?',
      [
        [
          'Supplying the warrant that connects the reported pattern to the interpretation claim.',
          'Correct. S5 explains the relevance of S4 to S3.',
        ],
        [
          'Reporting a second pilot result.',
          'S5 gives reasoning, not another observation from the pilot.',
        ],
        ['Stating the passage’s final conclusion.', 'The final recommendation appears in S12.'],
        ['Providing neutral background.', 'S5 performs immediate supporting work.'],
      ],
      'A',
      'Evidence supplies an observed basis; a warrant explains why that basis bears on a claim. S5 is the bridge from noticing weight to understanding the replica as interpretive.',
      [
        { id: 's3', annotation: 'claim' },
        { id: 's4', annotation: 'evidence' },
        { id: 's5', annotation: 'warrant' },
      ],
      'Ask whether the sentence reports what happened or explains why it matters.',
    ),
    worked: {
      title: 'Work backward from the final conclusion',
      explanation: [
        'S12 recommends pairing touchable replicas with concise limits labels. That recommendation is not a reported observation, so begin by marking it as the final conclusion.',
        'Then trace what supports it: S3 establishes interpretive value, S7 limits that value, and S11 answers the objection while preserving a concise-label solution. Notice that S4 is evidence for S3, not the final conclusion itself.',
      ],
      visual: anchorPassage(
        [
          { id: 's3', annotation: 'intermediate claim' },
          { id: 's4', annotation: 'evidence for S3' },
          { id: 's7', annotation: 'scope limit' },
          { id: 's11', annotation: 'reply and support' },
          { id: 's12', annotation: 'final conclusion' },
        ],
        'Work from the recommendation backward to the parts that make it reasonable.',
      ),
      takeaway:
        'What to notice: the same passage can contain intermediate and final conclusions at different levels.',
    },
    guided: question(
      'Classify a reported observation',
      'What is the primary role of S4?',
      [
        ['Final conclusion.', 'S12, not S4, gives the passage’s final recommendation.'],
        [
          'Evidence.',
          'Correct. S4 reports a comparison offered as a basis for the interpretation claim in S3.',
        ],
        [
          'Illustration.',
          'S4 reports an observed pattern rather than imagining one possible case.',
        ],
        ['Background.', 'S4 does immediate supporting work for the argument.'],
      ],
      'B',
      'Reported findings function as evidence when the author uses them to support a claim.',
      [{ id: 's3' }, { id: 's4' }],
      'Ask whether the sentence reports something observed or merely imagines a case.',
    ),
    reducedSupport: question(
      'Separate evidence from illustration',
      'What is the primary role of S6?',
      [
        ['Conclusion.', 'S6 does not ask the reader to accept a general claim.'],
        ['Evidence.', 'No observation or record is reported.'],
        ['Illustration.', 'Correct. It offers one imaginable visitor case that makes S5 concrete.'],
        [
          'Background.',
          'The example develops the nearby reasoning rather than merely framing the topic.',
        ],
      ],
      'C',
      'Words such as “for example” can signal illustration, but the decisive feature is that the sentence supplies a possible instance rather than a reported basis.',
      [{ id: 's5' }, { id: 's6' }],
    ),
    independent: question(
      'Distinguish an intermediate conclusion',
      'What is the primary role of S3?',
      [
        [
          'An intermediate conclusion supported by S4 and S5.',
          'Correct. S3 is supported locally and later helps support S12.',
        ],
        [
          'Background only.',
          'S3 states a contested interpretive claim rather than neutral context.',
        ],
        ['A reported observation.', 'S3 reports no pilot result; S4 does.'],
        ['An illustration.', 'S3 is a general claim, not a concrete example.'],
      ],
      'A',
      'An intermediate conclusion can be the target of earlier support and then become a reason for a later conclusion.',
      [{ id: 's3' }, { id: 's4' }, { id: 's5' }],
    ),
    near: question(
      'Locate support for a limit',
      'What is the primary role of S8?',
      [
        [
          'Support for S7’s qualification.',
          'Correct. The missing historical information explains why touch cannot recover the whole history.',
        ],
        ['The final conclusion.', 'S8 states a limitation rather than the recommendation.'],
        ['An unrelated background fact.', 'It directly explains the scope limit in S7.'],
        [
          'An objection to all replicas.',
          'It limits what replicas reveal without rejecting their interpretive value.',
        ],
      ],
      'A',
      'A reason can support a qualification just as evidence can support a positive claim.',
      [{ id: 's7' }, { id: 's8' }],
    ),
    changed: question(
      'Reconstruct the conclusion hierarchy',
      'Which description best captures the roles of S3 and S12?',
      [
        [
          'S3 is an intermediate conclusion; S12 is the final conclusion.',
          'Correct. S3 is supported and later contributes to the broader recommendation in S12.',
        ],
        ['Both are background.', 'Both make claims the author wants the reader to accept.'],
        [
          'S3 is evidence; S12 is an illustration.',
          'Neither sentence reports an observation or supplies a concrete example.',
        ],
        [
          'S3 is the final conclusion; S12 is unrelated.',
          'S12 integrates the passage’s value, limits, and reply into the final recommendation.',
        ],
      ],
      'A',
      'Reconstruction can be hierarchical: one supported claim becomes a premise for a broader conclusion later in the passage.',
      [{ id: 's3' }, { id: 's12' }],
    ),
    repair: {
      title: 'Draw the support arrow before choosing a role',
      explanation: [
        'Ask whether another sentence supplies a reason for the target. If so, the target is functioning as a conclusion at that level, while the source may be evidence, a reason, or an example.',
        'Then distinguish sources by form: a reported observation is evidence; a possible concrete case is an illustration; context that does not support the immediate claim is background.',
      ],
      visual: relations(
        'Argument-element repair',
        'Reported evidence and reasoning can support an intermediate conclusion, which can then support a final conclusion. An illustration makes a reason concrete without becoming reported evidence.',
        [
          {
            label: 'Immediate support',
            nodes: [
              { label: 'S4', detail: 'reported evidence' },
              { label: 'S5', detail: 'reasoning bridge' },
              { label: 'S3', detail: 'intermediate conclusion', emphasis: 'active' },
            ],
            links: ['joins', 'supports'],
          },
          {
            label: 'Larger argument',
            nodes: [
              { label: 'S3', detail: 'interpretive value' },
              { label: 'S12', detail: 'final recommendation', emphasis: 'active' },
            ],
            links: ['helps support'],
          },
        ],
      ),
      strategy:
        'For the target sentence, finish the phrase “The author gives me ___ as a reason to accept this.”',
      checkYourThinking:
        'Is the sentence a supported endpoint, a reported basis, a concrete example, or framing context?',
    },
    recap: {
      title: 'The passage now has labeled parts',
      explanation: [
        'You identified background, evidence, illustration, reasoning, intermediate conclusions, and the final conclusion without importing outside knowledge. Next, map how those parts support, oppose, concede, or qualify one another.',
      ],
      visual: anchorPassage(
        [
          { id: 's3', annotation: 'intermediate conclusion' },
          { id: 's4', annotation: 'evidence' },
          { id: 's6', annotation: 'illustration' },
          { id: 's12', annotation: 'final conclusion' },
        ],
        'Role labels are the starting point for relation mapping.',
      ),
      takeaway: 'Classify each part in context before asking what relation it has to another part.',
    },
  },
  {
    key: 'argument-relations',
    kcId: 'V3-KC-730249',
    stageLabel: 'Argument relations',
    nextActionLabel: 'Check whether links are genuine',
    starting: question(
      'Read a qualification',
      'What relation does S7 have to S3?',
      [
        [
          'Direct support, because it gives the main reason to accept S3.',
          'S7 does not establish the interpretive value claimed in S3.',
        ],
        [
          'Qualification, because it narrows what touch can recover without rejecting S3.',
          'Correct. S7 limits the scope of the earlier claim.',
        ],
        [
          'Objection, because it rejects the use of replicas.',
          'S7 preserves interpretive value while stating a boundary.',
        ],
        ['Unrelated background.', 'The contrast word and shared topic directly connect it to S3.'],
      ],
      'B',
      'A qualification narrows a claim’s scope or strength while leaving its central point standing.',
      [{ id: 's3' }, { id: 's7' }],
      'Ask whether the later sentence rejects the claim or tells you how far it can go.',
      'Move from sentence roles to the arrows between them.',
    ),
    model: {
      title: 'Name the direction and effect of each relation',
      explanation: [
        'Support gives a reason to accept a target claim. Qualification narrows that claim, while an objection challenges it. A concession grants a bounded part of an objection without surrendering the author’s conclusion.',
        'A warrant explains why a reason or piece of evidence bears on its target. Mapping the warrant prevents a mere topic overlap from being mistaken for genuine support.',
      ],
      visual: anchorPassage(
        [
          { id: 's3', annotation: 'claim' },
          { id: 's4', annotation: 'supports S3' },
          { id: 's5', annotation: 'warrant for S3' },
          { id: 's7', annotation: 'qualifies S3' },
          { id: 's8', annotation: 'supports S7' },
        ],
        'The first two paragraphs combine support with a deliberate scope limit.',
      ),
      takeaway:
        'Describe what one sentence does to a specific target: strengthens, narrows, challenges, grants, or answers.',
    },
    understandingCheck: question(
      'Check whether the claim survives',
      'S7 says touch does not recover the whole history of work. What does that sentence do to S3’s claim that a replica is an interpretation?',
      [
        [
          'It qualifies S3 by limiting what the interpretation can recover.',
          'Correct. The central value claim remains, but its scope narrows.',
        ],
        [
          'It rejects all interpretive value in replicas.',
          'S7 limits completeness without denying that handling shapes interpretation.',
        ],
        ['It supplies the pilot evidence for S3.', 'S4 contains the reported comparison.'],
        [
          'It changes to an unrelated topic.',
          'Both sentences concern what a replica can disclose.',
        ],
      ],
      'A',
      'A qualification preserves the central claim while narrowing its reach. S7 does not cancel S3; it establishes that the interpretation remains partial.',
      [
        { id: 's3', annotation: 'value claim' },
        { id: 's7', annotation: 'scope limit' },
        { id: 's8', annotation: 'support for the limit' },
      ],
      'Ask whether the later sentence removes the claim or sets a boundary around it.',
    ),
    worked: {
      title: 'Map objection, concession, and reply',
      explanation: [
        'S9 raises an objection: reconstruction labels might make visitors distrust every display. S10 concedes only the case in which a warning becomes so elaborate that it overwhelms the object.',
        'S11 answers the objection by proposing a brief label that states limits without producing wholesale doubt. That reply supports S12’s recommendation for concise limits labels rather than ignoring the concern.',
      ],
      visual: anchorPassage(
        [
          { id: 's9', annotation: 'objection' },
          { id: 's10', annotation: 'bounded concession' },
          { id: 's11', annotation: 'response' },
          { id: 's12', annotation: 'supported conclusion' },
        ],
        'The author grants a narrow concern, then answers it with a more precise proposal.',
      ),
      takeaway:
        'What to notice: a concession can strengthen the final argument by narrowing the reply to the objection’s valid part.',
    },
    guided: question(
      'Map complementary support',
      'How do S4 and S5 relate to S3?',
      [
        [
          'S4 provides reported evidence and S5 explains why that evidence supports S3.',
          'Correct. Observation and reasoning work together.',
        ],
        ['Both object to S3.', 'Both develop the case for S3.'],
        ['S4 qualifies S5 and leaves S3 unrelated.', 'The nearby argument points toward S3.'],
        [
          'S5 is only background because it contains no number.',
          'Reasons need not be numerical to provide a warrant.',
        ],
      ],
      'A',
      'Evidence supplies a basis; the warrant explains the relevance of that basis to the claim.',
      [{ id: 's3' }, { id: 's4' }, { id: 's5' }],
      'Ask what was observed, then why that observation matters.',
    ),
    reducedSupport: question(
      'Trace support for a qualification',
      'What relation does S8 have to S7?',
      [
        [
          'It supports S7 by naming information touch cannot reveal.',
          'Correct. The examples justify the limit stated in S7.',
        ],
        ['It rejects S7.', 'S8 develops rather than opposes the limitation.'],
        ['It gives the final recommendation.', 'No policy recommendation appears in S8.'],
        [
          'It illustrates S4’s pilot result.',
          'Its target is the limitation on historical recovery in S7.',
        ],
      ],
      'A',
      'A support relation can point toward a limiting claim; support is not reserved for the author’s broadest conclusion.',
      [{ id: 's7' }, { id: 's8' }],
    ),
    independent: question(
      'Identify an objection’s target',
      'What relation does S9 have to the recommendation developed in S12?',
      [
        [
          'Objection: it presents a reason some curators resist reconstruction labels.',
          'Correct. It challenges a key part of the eventual recommendation.',
        ],
        [
          'Direct support: distrust makes labels necessary.',
          'The sentence is attributed as a concern, not offered as the author’s supporting reason.',
        ],
        [
          'Qualification: it only narrows label length.',
          'S10 supplies the narrower concession; S9 raises the broader challenge.',
        ],
        ['Illustration: it gives a concrete museum case.', 'No specific case is described.'],
      ],
      'A',
      'An objection supplies pressure against a claim; later sentences may concede part of it and answer the rest.',
      [{ id: 's9' }, { id: 's12' }],
    ),
    near: question(
      'Recognize a bounded concession',
      'What is S10 doing in relation to S9?',
      [
        [
          'Granting that overly elaborate warnings can create the stated problem.',
          'Correct. It accepts a limited version of the concern.',
        ],
        ['Rejecting every part of the concern.', 'S10 explicitly calls one version reasonable.'],
        ['Providing pilot evidence for S3.', 'It addresses the label objection, not the pilot.'],
        ['Stating the final conclusion.', 'The recommendation appears in S12.'],
      ],
      'A',
      'A concession says, in effect, “this part of the objection is fair,” preparing a narrower response.',
      [{ id: 's9' }, { id: 's10' }],
    ),
    changed: question(
      'Reconstruct the final support map',
      'Which map best explains how the passage reaches S12?',
      [
        [
          'S3 supplies interpretive value, S7 sets a limit, and S11 answers the label objection; together they support S12.',
          'Correct. The conclusion integrates value, boundary, and response.',
        ],
        ['S9 alone proves S12.', 'S9 challenges the label proposal and requires a reply.'],
        [
          'S4 directly proves every part of S12.',
          'The pilot result supports S3 but does not by itself establish limits labels.',
        ],
        [
          'S7 cancels S3, so S12 has no support.',
          'S7 qualifies rather than rejects interpretive value.',
        ],
      ],
      'A',
      'A full reconstruction can combine positive support, a scope limit, and an answered objection without treating those roles as contradictions.',
      [{ id: 's3' }, { id: 's7' }, { id: 's11' }, { id: 's12' }],
    ),
    repair: {
      title: 'Name the target before naming the relation',
      explanation: [
        'Write “source → target” before choosing a relation. Then ask whether the source makes the target more acceptable, narrows it, challenges it, grants part of a challenge, or responds to that challenge.',
        'Transition words are clues, not answers. Confirm the relation by paraphrasing what changes about the target after the source is added.',
      ],
      visual: relations(
        'Argument-relation repair',
        'Evidence and a warrant support a claim, a qualification narrows it, an objection challenges a conclusion, a concession grants part of the objection, and a response restores support for a bounded conclusion.',
        [
          {
            label: 'Value and limit',
            nodes: [
              { label: 'S4 + S5', detail: 'evidence and warrant' },
              { label: 'S3', detail: 'interpretive value', emphasis: 'active' },
              { label: 'S7', detail: 'qualification' },
            ],
            links: ['support', 'narrowed by'],
          },
          {
            label: 'Challenge and reply',
            nodes: [
              { label: 'S9', detail: 'objection' },
              { label: 'S10', detail: 'concession' },
              { label: 'S11', detail: 'response' },
              { label: 'S12', detail: 'conclusion', emphasis: 'active' },
            ],
            links: ['partly granted by', 'then answered by', 'supports'],
          },
        ],
      ),
      strategy:
        'Complete the sentence “Adding the source makes the target ___” with stronger, narrower, challenged, partly granted, or answered.',
      checkYourThinking:
        'Have you identified both endpoints of the relation and described its effect on the target?',
    },
    recap: {
      title: 'The passage now has a relation map',
      explanation: [
        'S4 and S5 support S3; S7 qualifies it and S8 supports that limit. S9 objects, S10 concedes a bounded concern, and S11 answers it before supporting S12. The final step is to check whether each asserted arrow has a real text-grounded bridge.',
      ],
      visual: anchorPassage([
        { id: 's4', annotation: 'evidence' },
        { id: 's5', annotation: 'warrant' },
        { id: 's7', annotation: 'qualification' },
        { id: 's9', annotation: 'objection' },
        { id: 's10', annotation: 'concession' },
        { id: 's11', annotation: 'response' },
      ]),
      takeaway:
        'A relation label is only as strong as the passage language connecting its source to its target.',
    },
  },
  {
    key: 'argument-links',
    kcId: 'V3-KC-072322',
    stageLabel: 'Argument links',
    nextActionLabel: 'Finish the lesson',
    starting: question(
      'Check an asserted connection',
      'Does S5 genuinely connect S4 to S3?',
      [
        [
          'Yes. S5 explains why noticing weight makes a replica interpretive rather than merely a copy.',
          'Correct. It supplies the reasoning bridge from the reported observation to the claim.',
        ],
        [
          'No. A reason must repeat the exact words of the evidence.',
          'A warrant explains relevance; it need not duplicate wording.',
        ],
        [
          'No. Passage evidence can never support an interpretive claim.',
          'The passage itself supplies both the observation and its stated significance.',
        ],
        [
          'Yes, but only because outside museum research confirms it.',
          'The connection is available from S4 and S5 without outside knowledge.',
        ],
      ],
      'A',
      'A genuine link has a text-grounded bridge that explains why the source bears on the target.',
      [{ id: 's3' }, { id: 's4' }, { id: 's5' }],
      'Paraphrase the missing “because” between the source and target.',
      'Evaluate the connection using only the passage.',
    ),
    model: {
      title: 'Use the bridge check',
      explanation: [
        'First state the source and target in plain language. Then ask what unstated or stated bridge would make the source a reason for the target, and whether the passage actually supplies that bridge.',
        'Shared topic is not enough. A transition can sound smooth while changing the issue, the scope, or the kind of support needed. Evaluate the author’s connection using passage language rather than outside agreement.',
      ],
      visual: relations(
        'Text-grounded bridge check',
        'A source connects to a target only when a stated or clearly licensed warrant explains why the source supports, limits, opposes, or illustrates that target.',
        [
          {
            label: 'Three-part check',
            nodes: [
              { label: 'Source', detail: 'what is given' },
              { label: 'Bridge', detail: 'why it matters', emphasis: 'active' },
              { label: 'Target', detail: 'what follows' },
            ],
            links: ['requires', 'licenses'],
          },
          {
            label: 'Warning sign',
            nodes: [
              { label: 'Same topic' },
              { label: 'No relevance link', emphasis: 'muted' },
              { label: 'Apparent connection only' },
            ],
            links: ['but', 'means'],
          },
        ],
      ),
      takeaway:
        'Write the missing “because” clause; if the passage cannot supply it, treat the asserted arrow cautiously.',
    },
    understandingCheck: question(
      'Check for a genuine bridge',
      'Two sentences discuss replicas, but the passage gives no reason one makes the other more likely. What should the argument map show?',
      [
        [
          'No direct support arrow unless a passage-licensed bridge can be stated.',
          'Correct. Shared topic is not enough to establish a support relation.',
        ],
        [
          'A direct arrow because both sentences use the same subject.',
          'Topic overlap does not explain why the source supports the target.',
        ],
        [
          'A direct arrow based on outside museum knowledge.',
          'CARS reconstruction must use the passage’s own language and scope.',
        ],
        [
          'An objection relation automatically.',
          'Missing support does not by itself make one sentence oppose the other.',
        ],
      ],
      'A',
      'A genuine arrow needs source, target, and a warranted relevance bridge. If the bridge is absent, the sentences may be adjacent or indirectly connected through another claim, but direct support is not established.',
      [
        { id: 's4', annotation: 'possible source' },
        { id: 's7', annotation: 'different target' },
        { id: 's8', annotation: 'actual support for S7' },
      ],
      'Complete a “because” clause using passage language only.',
    ),
    worked: {
      title: 'Compare a genuine link with an apparent one',
      explanation: [
        'S11 genuinely supports S12: a brief label can disclose reconstruction and uncertainty without producing wholesale distrust, so concise limits labels answer the objection while preserving access.',
        'By contrast, S4 does not directly support S7. The pilot shows that handling directs attention to weight; it does not establish which histories replicas cannot disclose. S8, not S4, supplies the bridge for S7.',
      ],
      visual: anchorPassage(
        [
          { id: 's4', annotation: 'supports S3, not S7' },
          { id: 's7', annotation: 'needs S8' },
          { id: 's8', annotation: 'genuine support for S7' },
          { id: 's11', annotation: 'genuine support for S12' },
          { id: 's12', annotation: 'target' },
        ],
        'A sentence can be relevant to the passage without directly supporting every nearby claim.',
      ),
      takeaway:
        'What to notice: direct, indirect, and merely adjacent relations should not be collapsed.',
    },
    guided: question(
      'Supply the warrant',
      'Which paraphrase best states the bridge from S4 and S5 to S3?',
      [
        [
          'Because handling changes what visitors notice and how they imagine use, a replica shapes interpretation rather than functioning as a neutral copy.',
          'Correct. It connects the observation and reason to the interpretive claim.',
        ],
        [
          'Because museums contain fragile tools, every replica is historically complete.',
          'The passage explicitly denies complete historical recovery.',
        ],
        [
          'Because visitors wrote about weight, labels always create distrust.',
          'The pilot does not address label distrust.',
        ],
        [
          'Because photographs exist, replicas should replace original tools.',
          'No replacement claim appears.',
        ],
      ],
      'A',
      'The warranted bridge preserves the concepts and scope in the source and target.',
      [{ id: 's3' }, { id: 's4' }, { id: 's5' }],
      'Use only ideas the passage itself places between noticing weight and interpretation.',
    ),
    reducedSupport: question(
      'Verify an illustration link',
      'Does S6 genuinely illustrate S5?',
      [
        [
          'Yes. Imagining a shifted grip is a concrete case of attention to bodily effort.',
          'Correct. The example instantiates the general reason in S5.',
        ],
        [
          'No. Illustrations must report measured outcomes.',
          'An illustration can be hypothetical or imagined.',
        ],
        ['No. S6 is the passage’s final conclusion.', 'S6 is a concrete visitor example.'],
        [
          'Yes, because it proves workers actually shifted grip.',
          'The sentence asks the reader to imagine a possibility; it does not report historical proof.',
        ],
      ],
      'A',
      'A genuine example link requires the case to instantiate the idea without being mistaken for reported evidence.',
      [{ id: 's5' }, { id: 's6' }],
    ),
    independent: question(
      'Distinguish direct from indirect support',
      'What is the best description of S4’s relation to S12?',
      [
        [
          'It contributes indirectly through S3, but does not by itself justify concise limits labels.',
          'Correct. The pilot supports interpretive value, one component of the final argument.',
        ],
        [
          'It directly proves every part of S12.',
          'It does not address limits labels or the objection.',
        ],
        ['It is wholly unrelated to S12.', 'Its support for S3 contributes to the larger case.'],
        [
          'It opposes S12.',
          'The pilot supports access through handling rather than challenging the recommendation.',
        ],
      ],
      'A',
      'Argument maps can contain multi-step support. Mark intermediate targets instead of drawing an unjustified direct arrow.',
      [{ id: 's3' }, { id: 's4' }, { id: 's12' }],
    ),
    near: question(
      'Check the reply-to-conclusion link',
      'Why does S11 genuinely support S12?',
      [
        [
          'It shows how a concise label can disclose limits without triggering the objection’s broad distrust.',
          'Correct. The proposed response directly licenses the label recommendation.',
        ],
        [
          'It reports that every visitor trusted every display.',
          'No such observation is reported.',
        ],
        [
          'It proves touch recovers the whole history of work.',
          'The passage maintains the opposite limit.',
        ],
        [
          'It changes the subject from labels to wages.',
          'S11 remains focused on reconstruction labels and unknowns.',
        ],
      ],
      'A',
      'The source answers the precise concern that could otherwise block the recommendation.',
      [{ id: 's9' }, { id: 's11' }, { id: 's12' }],
    ),
    changed: question(
      'Reconstruct after a sentence is removed',
      'Suppose S8 is removed. Which part of the argument becomes least supported?',
      [
        [
          'S7’s claim that touch cannot recover the whole history of work.',
          'Correct. S8 names the kinds of history the replica cannot disclose.',
        ],
        ['S4’s pilot comparison.', 'S4 reports its own observation independently of S8.'],
        ['S9’s attributed objection.', 'The objection is still stated in S9.'],
        ['S6’s visitor illustration.', 'S6 continues to illustrate S5.'],
      ],
      'A',
      'Removing a genuine support sentence weakens its target most directly. This counterfactual is a useful way to check the map.',
      [{ id: 's7' }, { id: 's8' }],
    ),
    repair: {
      title: 'Reconstruct the missing “because”',
      explanation: [
        'Write the proposed source and target as two short statements. Insert “because” between them and complete the bridge using only passage language.',
        'If the bridge changes topic, expands scope, or imports a fact the passage never supplies, the direct link is unsupported. It may still be indirect through an intermediate claim, so look for that missing node.',
      ],
      visual: relations(
        'Argument-link repair',
        'A genuine direct link preserves topic and scope through a passage-licensed warrant. An indirect link passes through an intermediate claim. An apparent link has no adequate bridge.',
        [
          {
            label: 'Direct',
            nodes: [
              { label: 'S8', detail: 'missing histories' },
              { label: 'Bridge', detail: 'shows the limit', emphasis: 'active' },
              { label: 'S7', detail: 'touch is incomplete' },
            ],
            links: ['because', 'supports'],
          },
          {
            label: 'Indirect',
            nodes: [
              { label: 'S4', detail: 'pilot evidence' },
              { label: 'S3', detail: 'interpretive value' },
              { label: 'S12', detail: 'recommendation' },
            ],
            links: ['supports', 'contributes to'],
          },
        ],
      ),
      strategy:
        'State source, bridge, and target explicitly; add an intermediate node when the direct bridge is too large.',
      checkYourThinking:
        'Can the passage complete the “because” clause without changing topic, scope, or evidence type?',
    },
    recap: {
      title: 'The argument has been reconstructed from the passage',
      explanation: [
        'You classified elements, mapped support and constraint, and checked whether each arrow had a real bridge. The result preserves the author’s scope: replicas can expand access and shape interpretation, but they remain partial and should be paired with concise limits labels.',
      ],
      visual: anchorPassage(
        [
          { id: 's3', annotation: 'value claim' },
          { id: 's7', annotation: 'limit' },
          { id: 's9', annotation: 'objection' },
          { id: 's11', annotation: 'reply' },
          { id: 's12', annotation: 'bounded conclusion' },
        ],
        'The final map keeps claim, evidence, warrant, qualifier, objection, and reply connected at the passage’s own scope.',
      ),
      takeaway:
        'CARS reasoning is passage reconstruction: every role and relation must be licensed by the text.',
    },
  },
] as const;

const INTRO_NODE = {
  id: 'argument-intro',
  kcIds: ['V3-KC-189442', 'V3-KC-730249', 'V3-KC-072322'],
  kind: 'intro',
  title: 'Map the structure of an argument',
  outcome:
    'Keep one passage intact while you identify its parts, map their relations, and check whether each connection is genuine.',
  details: ['Use passage language and scope only; no outside knowledge is needed.'],
} as const;

const COMPLETION_NODE = {
  id: 'argument-complete',
  kcIds: ['V3-KC-189442', 'V3-KC-730249', 'V3-KC-072322'],
  kind: 'completion',
  title: 'You can reconstruct an argument from its text',
  summary:
    'You kept the passage visible while moving from sentence roles to relation mapping and link checks.',
  takeaways: [
    'A sentence’s role comes from the job it performs in context.',
    'Support, qualification, objection, concession, and reply describe effects on a specific target.',
    'A genuine link needs a passage-licensed bridge; shared topic alone is not enough.',
  ],
  nextStep:
    'On a new passage, work backward from the final conclusion and justify every arrow with passage language.',
} as const;

export const ARGUMENT_STRUCTURE_SCRIPT = defineLessonScriptPreview({
  schemaVersion: 'lesson-script-preview/v2',
  status: 'internal-preview',
  id: 'V3-LES-386478',
  contentVersion: 'app-native-argument-v2.1.0-review-flow',
  slug: 'argument-structure',
  title: 'Map the structure of an argument',
  internalTitle: 'Reconstruct argument structure',
  subject: 'Critical analysis & reasoning',
  description:
    'Identify argument elements, map how they constrain one another, and verify text-grounded links.',
  estimatedMinutes: 41,
  requiredKcs: [
    {
      id: 'V3-KC-189442',
      title: 'Distinguish Claims, Conclusions, and Evidence',
      learnerOutcome:
        'Distinguish supported claims from evidence, illustrations, and background in context.',
      previewCoverage: 'complete-review-focus',
    },
    {
      id: 'V3-KC-730249',
      title: 'Map Argument Support and Relation',
      learnerOutcome:
        'Map support, qualification, objection, concession, and reply between passage parts.',
      previewCoverage: 'complete-review-focus',
    },
    {
      id: 'V3-KC-072322',
      title: 'Test an Apparent Argument Link',
      learnerOutcome:
        'Determine whether a stated or implied connection has a genuine text-grounded bridge.',
      previewCoverage: 'complete-review-focus',
    },
  ],
  teachingObjective:
    'Reconstruct one intact argument progressively, using only passage language to classify roles and justify relations.',
  nodes: [
    INTRO_NODE,
    ...ARGUMENT_SECTIONS.flatMap((section) => buildSectionNodes(section)),
    COMPLETION_NODE,
  ],
  modelNodeIds: ARGUMENT_SECTIONS.map((section) => sectionNodeId(section, 'model')) as unknown as [
    string,
    ...string[],
  ],
  workedExplanationNodeIds: ARGUMENT_SECTIONS.map((section) =>
    sectionNodeId(section, 'worked'),
  ) as unknown as [string, ...string[]],
  practice: {
    guidedNodeIds: ARGUMENT_SECTIONS.map((section) =>
      sectionNodeId(section, 'guided'),
    ) as unknown as [string, ...string[]],
    reducedSupportNodeIds: ARGUMENT_SECTIONS.map((section) =>
      sectionNodeId(section, 'reduced-support'),
    ) as unknown as [string, ...string[]],
    independentNodeIds: ARGUMENT_SECTIONS.map((section) =>
      sectionNodeId(section, 'independent'),
    ) as unknown as [string, ...string[]],
  },
  exit: {
    nearNodeIds: ARGUMENT_SECTIONS.map((section) =>
      sectionNodeId(section, 'exit-near'),
    ) as unknown as [string, ...string[]],
    changedNodeIds: ARGUMENT_SECTIONS.map((section) =>
      sectionNodeId(section, 'exit-changed'),
    ) as unknown as [string, ...string[]],
  },
  repairNodeIds: ARGUMENT_SECTIONS.map((section) =>
    sectionNodeId(section, 'repair'),
  ) as unknown as [string, ...string[]],
  completionNodeId: COMPLETION_NODE.id,
});

export { ARGUMENT_SECTIONS };
