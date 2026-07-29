/**
 * An original, hand-authored CARS-style passage set.
 *
 * This is original prose written for this repository. It is not adapted from, and bears
 * no relation to, any published passage or any real MCAT item.
 *
 * It serves three purposes:
 *  1. It is the harness's positive control. A validation battery that only ever rejects
 *     is untestable; this set establishes that the gates accept content built to
 *     specification, which is what stops the thresholds from drifting stricter than the
 *     real corpus they were calibrated against.
 *  2. It documents the target quality concretely — what a defensible key, a specified
 *     distractor, and a verbatim evidence quote actually look like.
 *  3. It is the reference output shape for the generator, so a live run can be diffed
 *     against something known-good rather than judged by eye.
 */

import { type PassageSetBlueprint } from '../blueprint';
import { type GeneratedPassageSet } from '../schema';
import { PIPELINE_VERSION } from '../pipeline';

/**
 * The blueprint the passage was authored against. Note the deliberate choices: the
 * thesis is withheld to the closing paragraph (the best-evidenced difficulty lever),
 * and two rival traditions are reported so that perspective-attribution items have a
 * key and the `author-confusion` distractor family has something to draw on.
 */
export const EXAMPLE_BLUEPRINT: PassageSetBlueprint = {
  passage: {
    id: 'cars-bp-cartography-01',
    domain: 'humanities',
    discipline: 'philosophy',
    topic:
      'Whether a map should be understood as a neutral record of terrain or as an argument about what deserves to be represented',
    thesis:
      'A map is best understood as an argument constructed to resemble an observation, and its persuasive force depends on concealing the choices behind it',
    thesisPosition: 'delayed-close',
    structure: 'point-and-counterpoint',
    tone: 'skeptical',
    purpose: 'persuade',
    difficulty: 'demanding',
    hedgedClaims: [
      'The critical tradition is closer to the truth than the documentary one, though only in a narrowed form',
      'The world constrains maps, so no map is purely rhetorical',
    ],
    reportedPerspectives: [
      {
        party: 'the documentary school',
        position:
          'cartographic history is a steady approach toward one correct depiction, with error retreating as instruments improve',
        authorStance: 'qualifies',
      },
      {
        party: 'critical cartographers',
        position: 'every map asserts which distinctions matter, so its omissions carry its meaning',
        authorStance: 'qualifies',
      },
    ],
    termsToDefineInPlace: ['projection'],
    paragraphPlan: [
      { role: 'setup', content: 'The intuition that a map is an instrument rather than an opinion, and why it is not foolish' },
      { role: 'complication', content: 'Every map begins in subtraction; projection makes the trade-offs unavoidable' },
      { role: 'first position', content: 'The documentary school treats the trade-offs as engineering problems, and can cite real gains' },
      { role: 'counterposition', content: 'Critical cartographers hold that a map asserts which distinctions matter' },
      { role: 'qualification', content: 'The author sides with the second tradition but rejects its stronger form' },
      { role: 'thesis', content: 'A map is an argument built to look like an observation' },
    ],
  },
  items: [
    {
      id: 'cars-im-cartography-01-thesis',
      archetype: 'central-thesis',
      skill: 'RWT',
      keyProposition:
        'Maps persuade most effectively when the interpretive choices behind them are least visible',
      // The thesis is assembled from the counterposition, the author's qualification of
      // it, and the closing statement, which is what makes this an integration item.
      evidenceParagraphs: [3, 4, 5],
      distractorPlan: [
        { family: 'too-narrow', intent: 'State the projection trade-off, which is true and drawn from one paragraph only' },
        { family: 'too-extreme', intent: 'Restate the critical position absolutely, as the author explicitly refuses to' },
        { family: 'true-but-irrelevant', intent: 'State the historical accuracy gain, which the passage supports but which does not answer the stem' },
      ],
    },
    {
      id: 'cars-im-cartography-01-attribution',
      archetype: 'perspective-attribution',
      skill: 'RWT',
      keyProposition: 'The documentary school holds that error recedes as instruments improve',
      evidenceParagraphs: [2, 4],
      distractorPlan: [
        { family: 'author-confusion', intent: "Attribute the author's own qualified conclusion to the documentary school" },
        { family: 'opposite', intent: 'Attribute the rival tradition\'s position to the documentary school' },
        { family: 'outside-knowledge', intent: 'Offer a plausible modern claim about surveying that the passage never makes' },
      ],
    },
    {
      id: 'cars-im-cartography-01-function',
      archetype: 'rhetorical-function',
      skill: 'FOC',
      keyProposition:
        'The projection explanation establishes that a map\'s trade-offs precede any drawing',
      evidenceParagraphs: [1],
      distractorPlan: [
        { family: 'too-narrow', intent: 'Reduce the passage to term definition, a real but insufficient function' },
        { family: 'wrong-question', intent: 'Answer what the paragraph says rather than what it does' },
        { family: 'distortion', intent: 'Convert the argument about unavoidable choice into an accusation of deceit' },
      ],
    },
    {
      id: 'cars-im-cartography-01-newinfo',
      archetype: 'new-information-effect',
      skill: 'RBT',
      keyProposition:
        'Divergent maps from identical data support the claim that a map asserts which distinctions matter',
      evidenceParagraphs: [3],
      stemSuppliedInformation:
        'Two cartographers working from identical surveys with the same projection produced maps differing in which settlements they named',
      distractorPlan: [
        { family: 'opposite', intent: 'Claim the finding undercuts the interpretive-choice view' },
        { family: 'true-but-irrelevant', intent: 'Redirect to the projection trade-off, which the finding holds constant' },
        { family: 'outside-knowledge', intent: 'Attribute the divergence to instrument quality, which the stem rules out' },
      ],
    },
    {
      id: 'cars-im-cartography-01-analogy',
      archetype: 'principle-application',
      skill: 'RBT',
      keyProposition:
        'The analogous case is one where an ordering quietly establishes significance while appearing merely practical',
      evidenceParagraphs: [4, 5],
      stemSuppliedInformation: 'Four situations outside cartography, to be judged for analogy to the passage account',
      distractorPlan: [
        { family: 'distortion', intent: 'Offer open persuasion, which inverts the concealment the passage requires' },
        { family: 'too-narrow', intent: 'Offer deliberate falsification, which the author distinguishes from concealed choice' },
        { family: 'true-but-irrelevant', intent: 'Offer a trade-off with no concealed claim about significance' },
      ],
    },
  ],
  approvedBy: 'authored-in-repo',
  approvedAt: '2026-07-29T00:00:00.000Z',
};

/**
 * The passage. Written to the blueprint above: six paragraphs, thesis withheld until the
 * last, `projection` defined in place, and both traditions reported rather than asserted.
 */
export const EXAMPLE_PARAGRAPHS: readonly string[] = [
  'A map seems the least argumentative of documents. It offers no claims to weigh and no evidence to interrogate, only a surface on which places sit where they belong. Travellers consult maps as they consult clocks, expecting an instrument rather than an opinion. This confidence is not foolish, and it is renewed every time a map turns out to be useful. A map that misplaced a river would be a bad map, and its badness would be a matter of fact rather than of taste.',
  'Yet every map begins in subtraction. The cartographer inherits a world of unlimited detail and must decide, before drawing anything at all, what will not appear. A projection, meaning the mathematical rule by which a curved surface is flattened onto a plane, cannot preserve area, shape, distance, and direction at once; improving any one of them distorts another. No settlement of these compromises is neutral, because each of them answers a question about what the map is for, and that question is not itself answered by measurement.',
  'One tradition treats such compromises as engineering problems awaiting better solutions. Call it the documentary school: on this account the history of cartography records a steady approach toward a single correct depiction, with error retreating as instruments improve. Its adherents can point to real gains. Coastlines drawn in 1600 were wrong in ways that coastlines drawn in 1900 were not, and no amount of interpretive subtlety makes the earlier ones right. Progress of that kind is not an illusion, and an account of maps unable to acknowledge it has conceded too much before it begins.',
  'A second tradition finds this account naive. Critical cartographers argue that a map is always a claim about which distinctions matter, and that to render a settlement as a dot while rendering a forest as a texture is to assert something about the comparative significance of people and trees. On this reading the silences of a map are its most eloquent passages, and the appearance of mere description is itself a rhetorical accomplishment rather than an absence of rhetoric. Each legend encodes a judgement that its own tidiness works to disguise.',
  'The second tradition seems to me nearer the truth, though its stronger formulations overreach. If a map were only an argument, it would be hard to explain why some maps leave travellers lost while others do not; the world does push back, and it pushes back unevenly. What the critical account establishes is narrower than its advocates sometimes claim, and more interesting: that accuracy, however genuine, is always accuracy about something chosen.',
  'This suggests that a map is best read as an argument built to look like an observation. Its persuasiveness lies precisely in its refusal to appear persuasive, in the flatness of a legend and the authority of a scale bar and the implication that nobody decided any of it. To read a map well is therefore to recover the decisions it has concealed, not because the map lies, but because it has been finished too smoothly to seem to have been made.',
];

/**
 * The generated-shape artefact. Every `evidenceQuotes` entry appears verbatim in the
 * paragraphs above; the `evidence-quotes-verbatim` check enforces that, and it is the
 * cheapest guard against a key that was never actually grounded in the text.
 */
export const EXAMPLE_SET: GeneratedPassageSet = {
  passage: {
    id: 'cars-p-cartography-01',
    blueprintId: 'cars-bp-cartography-01',
    title: 'Maps and the Concealment of Choice',
    paragraphs: [...EXAMPLE_PARAGRAPHS],
  },
  items: [
    {
      id: 'cars-q-cartography-01',
      itemModelId: 'cars-im-cartography-01-thesis',
      familyId: 'cars-im-cartography-01-thesis',
      archetype: 'central-thesis',
      skill: 'RWT',
      stem: 'The main idea of the passage is that:',
      choices: [
        { label: 'A', text: 'no flattening rule can retain area, shape, distance, and bearing together.' },
        { label: 'B', text: 'a map carries no genuine claim to correctness, being wholly a work of persuasion.' },
        { label: 'C', text: 'a map argues most effectively when the choices behind it stay out of sight.' },
        { label: 'D', text: 'depictions of coastlines grew demonstrably better over three centuries.' },
      ],
      correctChoice: 'C',
      rationales: [
        {
          label: 'A',
          rationale:
            'True, and stated in the second paragraph, but it supports the argument rather than being it. The passage uses the trade-off to reach a conclusion about how maps persuade.',
          family: 'too-narrow',
        },
        {
          label: 'B',
          rationale:
            'Overstates the critical tradition in exactly the way the author refuses. The fifth paragraph grants that the world pushes back and that accuracy is genuine.',
          family: 'too-extreme',
        },
        {
          label: 'C',
          rationale:
            'The closing paragraph states that a map is read best as an argument built to look like an observation, whose force lies in refusing to appear persuasive. The fifth paragraph supplies the qualification that makes this the passage conclusion rather than the critical tradition\'s.',
        },
        {
          label: 'D',
          rationale:
            'Supported by the third paragraph, but it is the documentary school\'s evidence, not the passage main idea. It answers a narrower question than the stem asks.',
          family: 'true-but-irrelevant',
        },
      ],
      evidenceQuotes: [
        'a map is best read as an argument built to look like an observation',
        'accuracy, however genuine, is always accuracy about something chosen',
      ],
    },
    {
      id: 'cars-q-cartography-02',
      itemModelId: 'cars-im-cartography-01-attribution',
      familyId: 'cars-im-cartography-01-attribution',
      archetype: 'perspective-attribution',
      skill: 'RWT',
      stem: 'The passage suggests that the documentary school held which of the following views?',
      choices: [
        { label: 'A', text: 'Inaccuracy recedes from cartography as the instruments of measurement improve.' },
        { label: 'B', text: 'Whatever correctness a map achieves is correctness about a selected subject.' },
        { label: 'C', text: 'What a map declines to show carries more meaning than what it shows.' },
        { label: 'D', text: 'Contemporary survey technology has settled the disputes that once divided mapmakers.' },
      ],
      correctChoice: 'A',
      rationales: [
        {
          label: 'A',
          rationale:
            'The third paragraph attributes to the documentary school a steady approach toward one correct depiction, with error retreating as instruments improve.',
        },
        {
          label: 'B',
          rationale:
            'This is the author\'s own qualified conclusion in the fifth paragraph, not the documentary school\'s position. The item turns on keeping the author separate from the views reported.',
          family: 'author-confusion',
        },
        {
          label: 'C',
          rationale:
            'This is the rival tradition\'s claim about eloquent silences, attributed to the wrong school. The passage presents the two accounts as opposed.',
          family: 'opposite',
        },
        {
          label: 'D',
          rationale:
            'A plausible modern belief that the passage never advances. Nothing in the text discusses contemporary technology or the settlement of disputes.',
          family: 'outside-knowledge',
        },
      ],
      evidenceQuotes: [
        'the history of cartography records a steady approach toward a single correct depiction, with error retreating as instruments improve',
      ],
    },
    {
      id: 'cars-q-cartography-03',
      itemModelId: 'cars-im-cartography-01-function',
      familyId: 'cars-im-cartography-01-function',
      archetype: 'rhetorical-function',
      skill: 'FOC',
      stem: 'The explanation of what a projection is (second paragraph) functions primarily to:',
      choices: [
        { label: 'A', text: 'introduce a technical term that later paragraphs rely upon.' },
        { label: 'B', text: 'establish that unavoidable trade-offs precede any line the mapmaker draws.' },
        { label: 'C', text: 'demonstrate that curved surfaces resist flattening without mathematical loss.' },
        { label: 'D', text: 'suggest that mapmakers knowingly mislead the people who use their work.' },
      ],
      correctChoice: 'B',
      rationales: [
        {
          label: 'A',
          rationale:
            'The paragraph does define the term, but definition is incidental. The stem asks what the explanation accomplishes in the argument, and its work is to make the trade-offs unavoidable.',
          family: 'too-narrow',
        },
        {
          label: 'B',
          rationale:
            'The paragraph states that the cartographer must decide before drawing anything at all what will not appear, and that no settlement of the compromises is neutral. Its function is to place choice logically prior to depiction.',
        },
        {
          label: 'C',
          rationale:
            'This restates the paragraph\'s content rather than naming its function. It answers a different question about the same sentences.',
          family: 'wrong-question',
        },
        {
          label: 'D',
          rationale:
            'Converts an argument about unavoidable selection into one about deceit. The passage explicitly denies that the map lies.',
          family: 'distortion',
        },
      ],
      evidenceQuotes: [
        'must decide, before drawing anything at all, what will not appear',
        'No settlement of these compromises is neutral',
      ],
    },
    {
      id: 'cars-q-cartography-04',
      itemModelId: 'cars-im-cartography-01-newinfo',
      familyId: 'cars-im-cartography-01-newinfo',
      archetype: 'new-information-effect',
      skill: 'RBT',
      stem: 'Suppose two mapmakers worked from identical surveys using the same projection, yet produced maps that differed in which settlements they named. That finding would most directly:',
      choices: [
        { label: 'A', text: 'weaken the position that mapmaking involves choices about significance.' },
        { label: 'B', text: 'confirm that flattening a curved surface must distort area or bearing.' },
        { label: 'C', text: 'indicate that one of the two was working with inferior measuring equipment.' },
        { label: 'D', text: 'strengthen the position that a map asserts which distinctions deserve notice.' },
      ],
      correctChoice: 'D',
      rationales: [
        {
          label: 'A',
          rationale:
            'Reverses the bearing of the evidence. Identical data yielding different maps is precisely what the interpretive-choice account predicts.',
          family: 'opposite',
        },
        {
          label: 'B',
          rationale:
            'True of projections generally, but the stem holds the projection constant, so the finding says nothing about it.',
          family: 'true-but-irrelevant',
        },
        {
          label: 'C',
          rationale:
            'Attributes the divergence to instrument quality, which the stem excludes by specifying identical surveys. It is the answer a reader supplies from general expectation rather than from the case described.',
          family: 'outside-knowledge',
        },
        {
          label: 'D',
          rationale:
            'The fourth paragraph holds that a map is always a claim about which distinctions matter. Two mapmakers diverging on identical data isolates that choice from measurement, which is what the claim requires.',
        },
      ],
      evidenceQuotes: ['a map is always a claim about which distinctions matter'],
    },
    {
      id: 'cars-q-cartography-05',
      itemModelId: 'cars-im-cartography-01-analogy',
      familyId: 'cars-im-cartography-01-analogy',
      archetype: 'principle-application',
      skill: 'RBT',
      stem: 'Which situation is most closely analogous to the account of how maps persuade?',
      choices: [
        { label: 'A', text: 'A speaker who urges an audience directly and openly to adopt a contested position.' },
        { label: 'B', text: 'An exhibit floor plan whose ordering of rooms quietly settles which works seem central.' },
        { label: 'C', text: 'A photograph altered after the fact to remove a figure the photographer disliked.' },
        { label: 'D', text: 'A translation that keeps a poem\'s sense intact while giving up its original metre.' },
      ],
      correctChoice: 'B',
      rationales: [
        {
          label: 'A',
          rationale:
            'Inverts the mechanism. The passage locates persuasive force in the refusal to appear persuasive, so open advocacy is the contrasting case rather than the analogous one.',
          family: 'distortion',
        },
        {
          label: 'B',
          rationale:
            'Matches the relation the passage describes: an arrangement that appears merely practical while quietly establishing significance, with the decision concealed by the form.',
        },
        {
          label: 'C',
          rationale:
            'Deliberate falsification, which the passage distinguishes from concealed choice when it says the map does not lie.',
          family: 'too-narrow',
        },
        {
          label: 'D',
          rationale:
            'A genuine trade-off, but one that advances no hidden claim about what matters, so it captures the second paragraph rather than the account of persuasion.',
          family: 'true-but-irrelevant',
        },
      ],
      evidenceQuotes: [
        'Its persuasiveness lies precisely in its refusal to appear persuasive',
        'not because the map lies',
      ],
    },
  ],
  provenance: {
    model: 'human-authored',
    generatedAt: '2026-07-29T00:00:00.000Z',
    pipelineVersion: PIPELINE_VERSION,
  },
};
