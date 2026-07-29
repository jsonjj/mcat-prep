/**
 * Two further hand-authored CARS-style passage sets, for previewing output quality.
 *
 * Original prose written for this repository. Neither passage is adapted from, and
 * neither bears any relation to, any published passage or any real MCAT item.
 *
 * WHAT THESE ARE AND ARE NOT
 * These were authored against the same blueprint constraints the generator is prompted
 * with, and they are scored by the same harness. They are therefore a fair preview of the
 * *target*, and an optimistic one: a careful author beats the pipeline, which has to hit
 * the same constraints without seeing the audit result. Read them as the ceiling the
 * generator is aiming at, not as a sample of what it currently emits.
 *
 * Set A withholds its thesis to mid-text and Set B states it in the opening sentence.
 * That contrast is deliberate — thesis position is the best-evidenced difficulty lever
 * available, so the two sets should not feel equally hard.
 */

import { type PassageSetBlueprint } from '../blueprint';
import { type GeneratedPassageSet } from '../schema';
import { PIPELINE_VERSION } from '../pipeline';

/* ------------------------------------------------------------------ Set A ---------- */

export const SKILL_BLUEPRINT: PassageSetBlueprint = {
  passage: {
    id: 'cars-bp-skill-01',
    domain: 'social-sciences',
    discipline: 'sociology',
    topic:
      'Whether the category of unskilled labour describes a property of work or records a social judgement about who performs it',
    thesis:
      'The classification tracks the visibility of training rather than its duration, so it records which kinds of learning a society has agreed to notice',
    thesisPosition: 'mid-text',
    structure: 'concession-and-rebuttal',
    tone: 'critical',
    purpose: 'persuade',
    difficulty: 'demanding',
    hedgedClaims: [
      'The critical account is not wholly circular, and its stronger forms overreach',
      'Competence is real and unevenly distributed, so some substitutions genuinely fail',
    ],
    reportedPerspectives: [
      {
        party: 'the technical school',
        position:
          'skill measures the training interval a task requires, which is an empirical matter rather than a social verdict',
        authorStance: 'qualifies',
      },
      {
        party: 'those who treat skill as pure social construction',
        position: 'the category is entirely a product of social judgement with no empirical content',
        authorStance: 'rejects',
      },
    ],
    termsToDefineInPlace: ['training interval'],
    paragraphPlan: [
      { role: 'setup', content: 'The phrase behaves like a measured property, and the bureaucratic work it does' },
      { role: 'concession', content: 'The technical school has a real case: some occupations genuinely take longer to learn' },
      { role: 'rebuttal', content: 'The measured interval correlates poorly with the classification' },
      { role: 'thesis', content: 'What is tracked is the visibility of training, not its length' },
      { role: 'qualification', content: 'The critical account overreaches when it denies competence is real' },
      { role: 'consequence', content: 'A wage set by reference to skill reproduces the classification while appearing to measure' },
    ],
  },
  items: [
    {
      id: 'cars-im-skill-01-thesis',
      archetype: 'central-thesis',
      skill: 'RWT',
      keyProposition:
        'The classification records which kinds of learning are publicly legible rather than how long the work takes to master',
      evidenceParagraphs: [3, 4, 5],
      distractorPlan: [
        { family: 'too-narrow', intent: 'State the interval mismatch, true and drawn from one paragraph only' },
        { family: 'too-extreme', intent: 'Deny any empirical content to skill, as the author explicitly refuses' },
        { family: 'true-but-irrelevant', intent: 'State the wage consequence, supported but not what the stem asks' },
      ],
    },
    {
      id: 'cars-im-skill-01-attitude',
      archetype: 'author-attitude',
      skill: 'FOC',
      keyProposition:
        'The author regards the phrase as concealing a judgement beneath the appearance of measurement',
      evidenceParagraphs: [0],
      distractorPlan: [
        { family: 'distortion', intent: 'Convert the critique of a category into an accusation of deliberate deceit' },
        { family: 'too-broad', intent: 'Generalise into hostility toward all occupational classification' },
        { family: 'true-but-irrelevant', intent: 'Report the concession accurately as though it were the attitude' },
      ],
    },
    {
      id: 'cars-im-skill-01-attribution',
      archetype: 'perspective-attribution',
      skill: 'RWT',
      keyProposition:
        'The technical school holds that the time required to learn a task is an empirical question',
      evidenceParagraphs: [1, 4],
      distractorPlan: [
        { family: 'author-confusion', intent: "Attribute the author's own conclusion to the technical school" },
        { family: 'opposite', intent: 'Attribute the pure-construction position to the technical school' },
        { family: 'outside-knowledge', intent: 'Offer a plausible claim about credentialing the passage never makes' },
      ],
    },
    {
      id: 'cars-im-skill-01-newinfo',
      archetype: 'new-information-effect',
      skill: 'RBT',
      keyProposition:
        'A long apprenticeship classified as unskilled strengthens the claim that duration is not what is tracked',
      evidenceParagraphs: [2],
      stemSuppliedInformation:
        'A study finds that workers in an occupation classified as unskilled require four years to reach full productivity',
      distractorPlan: [
        { family: 'reversal', intent: 'Claim the finding undercuts rather than supports the argument' },
        { family: 'too-narrow', intent: 'Restrict the significance to that single occupation' },
        { family: 'outside-knowledge', intent: 'Attribute the finding to measurement error the passage never discusses' },
      ],
    },
    {
      id: 'cars-im-skill-01-application',
      archetype: 'principle-application',
      skill: 'RBT',
      keyProposition:
        'The analogous case is one where an informal competence goes unrecorded because it was never certified',
      evidenceParagraphs: [3, 4],
      stemSuppliedInformation: 'Four situations outside paid work, to be judged for analogy to the passage account',
      distractorPlan: [
        { family: 'distortion', intent: 'Offer a case of open credential fraud, which inverts the passage mechanism' },
        { family: 'too-narrow', intent: 'Offer a case turning on pay rather than on legibility' },
        { family: 'true-but-irrelevant', intent: 'Offer a genuine difficulty with no question of recognition' },
      ],
    },
    {
      id: 'cars-im-skill-01-meaning',
      archetype: 'meaning-in-context',
      skill: 'FOC',
      keyProposition:
        'The word natural marks the appearance of inevitability the vocabulary supplies to a hierarchy',
      evidenceParagraphs: [5],
      distractorPlan: [
        { family: 'outside-knowledge', intent: 'Import the biological sense of the word, unlicensed by the passage' },
        { family: 'wrong-question', intent: 'Explain what the hierarchy is rather than what the word does' },
        { family: 'too-extreme', intent: 'Read the word as asserting the hierarchy is wholly invented' },
      ],
    },
  ],
  approvedBy: 'authored-in-repo',
  approvedAt: '2026-07-29T00:00:00.000Z',
};

export const SKILL_PARAGRAPHS: readonly string[] = [
  'The phrase unskilled labour survives in wage tables and policy memoranda as though it named a property of the work itself, in the way that tensile strength names a property of a cable. Economists reach for it when they sort occupations into tiers; legislators reach for it when they set floors beneath them. The term plainly does useful administrative work, and its long survival suggests it answers to something real. Whether that something is a feature of the tasks it sorts is a different question, and one the phrase is remarkably good at discouraging.',
  'A defence of the category is available, and it deserves to be met rather than dismissed. Some occupations demand years of accumulated judgement that cannot be handed over by instruction, while others can be performed acceptably after an afternoon of demonstration. A surgeon and a shelf-stacker are not interchangeable, and no rearrangement of vocabulary will make them so. Those who press this defence, whom I will call the technical school, hold that skill measures the training interval a task requires, meaning the time a competent adult needs before the work can be done to standard, and that this interval is an empirical matter rather than a social verdict.',
  'The trouble is that the interval, once anyone troubles to measure it, sorts occupations differently from the classification it is supposed to justify. Harvesting soft fruit without bruising it, settling a frightened child, judging by touch when a batch of dough has proved: each of these takes far longer to acquire than the category permits, and each sits on the unskilled side of the ledger. Meanwhile a range of occupations entered through short credentialing courses are counted as skilled without anyone objecting. If the interval were doing the sorting, a good many of these cases would fall the other way.',
  'What the classification tracks is not the difficulty of the work but the visibility of the training. Where competence is acquired in a classroom and certified on paper, it becomes legible as skill; where it is acquired in a kitchen or a field or at a bedside, it registers instead as temperament, or patience, or a knack. The category is therefore a record of which kinds of learning a society has agreed to notice, and the agreement is old enough that it no longer looks like one.',
  'This is not to say that the opposing account escapes difficulty, and its stronger formulations overreach badly. Those who treat skill as pure social construction owe us an explanation of why certain substitutions fail so plainly, and they seldom provide one. A hospital cannot staff its operating theatres out of goodwill, and a bridge will not stand because its builders were confident. The technical school is right that competence is real and unevenly distributed; what it mistakes is the relation between that competence and the word we have chosen for it.',
  'The consequence is practical rather than merely semantic. A wage set by reference to skill will reproduce whatever the classification already contained, and will reproduce it wearing the expression of a measurement. That expression is the whole of the difficulty. The phrase does not simply describe a hierarchy of work; it hands that hierarchy a vocabulary in which it can be defended as natural, and a hierarchy so defended is very hard to argue with, because the argument has been relocated into a word that looks like a fact.',
];

export const SKILL_SET: GeneratedPassageSet = {
  passage: {
    id: 'cars-p-skill-01',
    blueprintId: 'cars-bp-skill-01',
    title: 'The Grammar of Skill',
    paragraphs: [...SKILL_PARAGRAPHS],
  },
  items: [
    {
      id: 'cars-q-skill-01',
      itemModelId: 'cars-im-skill-01-thesis',
      familyId: 'cars-im-skill-01-thesis',
      archetype: 'central-thesis',
      skill: 'RWT',
      stem: 'The central argument of the passage is that the category of unskilled labour:',
      choices: [
        { label: 'A', text: 'sorts occupations differently from the way measured learning times would sort them.' },
        { label: 'B', text: 'has no empirical content whatever and is entirely a product of social judgement.' },
        { label: 'C', text: 'registers which forms of learning a society has consented to recognise.' },
        { label: 'D', text: 'allows wages to be set in a manner that resembles measurement.' },
      ],
      correctChoice: 'C',
      rationales: [
        {
          label: 'A',
          rationale:
            'True, and established in the third paragraph, but it is the evidence for the argument rather than the argument. The passage uses the mismatch to reach a conclusion about what the category is recording.',
          family: 'too-narrow',
        },
        {
          label: 'B',
          rationale:
            'Overstates the case in precisely the way the fifth paragraph refuses, where the author grants that competence is real and unevenly distributed and that some substitutions plainly fail.',
          family: 'too-extreme',
        },
        {
          label: 'C',
          rationale:
            'The fourth paragraph states that the category is a record of which kinds of learning a society has agreed to notice, and the fifth supplies the qualification that separates this from the pure-construction position.',
        },
        {
          label: 'D',
          rationale:
            'Supported by the closing paragraph, but it is the consequence the author draws from the argument, not the argument itself. It answers a narrower question than the stem asks.',
          family: 'true-but-irrelevant',
        },
      ],
      evidenceQuotes: [
        'a record of which kinds of learning a society has agreed to notice',
        'competence is real and unevenly distributed',
      ],
    },
    {
      id: 'cars-q-skill-02',
      itemModelId: 'cars-im-skill-01-attitude',
      familyId: 'cars-im-skill-01-attitude',
      archetype: 'author-attitude',
      skill: 'FOC',
      stem: 'The author’s attitude toward the phrase unskilled labour is best described as:',
      choices: [
        { label: 'A', text: 'wary of a term whose air of measurement conceals a judgement.' },
        { label: 'B', text: 'convinced that those who employ the term intend to mislead.' },
        { label: 'C', text: 'opposed in principle to any scheme that sorts occupations into tiers.' },
        { label: 'D', text: 'satisfied that the term marks a genuine difference between occupations.' },
      ],
      correctChoice: 'A',
      rationales: [
        {
          label: 'A',
          rationale:
            'The first paragraph notes that the phrase behaves as though it named a property of the work itself and is remarkably good at discouraging the question of whether it does. The closing paragraph completes the thought.',
        },
        {
          label: 'B',
          rationale:
            'Converts a critique of a category into an accusation about motive. The passage attributes the phrase’s force to an old and forgotten agreement, not to anyone’s intent to deceive.',
          family: 'distortion',
        },
        {
          label: 'C',
          rationale:
            'Generalises well past the argument. The passage grants that the term does useful administrative work and never objects to sorting occupations as such.',
          family: 'too-broad',
        },
        {
          label: 'D',
          rationale:
            'Reports the second-paragraph concession faithfully, but the concession is not the attitude. The author grants the difference and then denies that the phrase tracks it.',
          family: 'true-but-irrelevant',
        },
      ],
      evidenceQuotes: [
        'the phrase is remarkably good at discouraging',
        'The term plainly does useful administrative work',
      ],
    },
    {
      id: 'cars-q-skill-03',
      itemModelId: 'cars-im-skill-01-attribution',
      familyId: 'cars-im-skill-01-attribution',
      archetype: 'perspective-attribution',
      skill: 'RWT',
      stem: 'According to the passage, the technical school maintains which of the following?',
      choices: [
        { label: 'A', text: 'Recognition of competence follows the setting in which it happened to be learned.' },
        { label: 'B', text: 'Occupational categories carry no content beyond the judgements of those who assign them.' },
        { label: 'C', text: 'Credentialing courses have grown too short to certify the competences they name.' },
        { label: 'D', text: 'How long a task takes to master is a question that observation can settle.' },
      ],
      correctChoice: 'D',
      rationales: [
        {
          label: 'A',
          rationale:
            'This is the author’s own conclusion in the fourth paragraph, not the technical school’s. The item turns on holding the author apart from the position being reported.',
          family: 'author-confusion',
        },
        {
          label: 'B',
          rationale:
            'This is the pure-construction position that the fifth paragraph criticises, attributed to the school that opposes it.',
          family: 'opposite',
        },
        {
          label: 'C',
          rationale:
            'A plausible complaint the passage never makes. Short credentialing courses are mentioned only to show the classification ignores measured intervals.',
          family: 'outside-knowledge',
        },
        {
          label: 'D',
          rationale:
            'The second paragraph attributes to the technical school the view that skill measures the training interval a task requires and that this interval is an empirical matter rather than a social verdict.',
        },
      ],
      evidenceQuotes: [
        'this interval is an empirical matter rather than a social verdict',
        'The technical school is right that competence is real',
      ],
    },
    {
      id: 'cars-q-skill-04',
      itemModelId: 'cars-im-skill-01-newinfo',
      familyId: 'cars-im-skill-01-newinfo',
      archetype: 'new-information-effect',
      skill: 'RBT',
      stem: 'Suppose researchers establish that workers in an occupation classified as unskilled require four years to reach full productivity. This finding would most likely be regarded by the author as:',
      choices: [
        { label: 'A', text: 'evidence that the occupation in question has been misfiled within an otherwise sound scheme.' },
        { label: 'B', text: 'support for the claim that duration is not what the classification is recording.' },
        { label: 'C', text: 'a reason to doubt the reliability of the productivity measures being reported.' },
        { label: 'D', text: 'grounds for abandoning the view that measured learning time can be established at all.' },
      ],
      correctChoice: 'B',
      rationales: [
        {
          label: 'A',
          rationale:
            'Treats the case as a filing error inside a working system. The third paragraph presents such cases as systematic rather than exceptional, which is why they bear on the category itself.',
          family: 'too-narrow',
        },
        {
          label: 'B',
          rationale:
            'The third paragraph argues that measured intervals sort occupations differently from the classification. A four-year interval on the unskilled side is exactly that mismatch, so it supports the argument of the fourth paragraph.',
        },
        {
          label: 'C',
          rationale:
            'Attributes the result to measurement error, a move the passage never makes. The argument depends on measured intervals being trustworthy.',
          family: 'outside-knowledge',
        },
        {
          label: 'D',
          rationale:
            'Reverses the author’s relation to measurement. The passage relies on intervals being measurable; it is the classification, not the measurement, that the finding embarrasses.',
          family: 'reversal',
        },
      ],
      evidenceQuotes: [
        'sorts occupations differently from the classification it is supposed to justify',
      ],
    },
    {
      id: 'cars-q-skill-05',
      itemModelId: 'cars-im-skill-01-application',
      familyId: 'cars-im-skill-01-application',
      archetype: 'principle-application',
      skill: 'RBT',
      stem: 'Which situation is most closely analogous to the relation the passage describes between competence and its classification?',
      choices: [
        { label: 'A', text: 'A gardener’s long-acquired judgement goes unrecorded because no examination covers it.' },
        { label: 'B', text: 'A consultant secures an appointment by claiming a qualification never actually obtained.' },
        { label: 'C', text: 'Two employees performing identical duties are paid at different hourly rates.' },
        { label: 'D', text: 'A craft proves difficult to learn because few practitioners remain to teach it.' },
      ],
      correctChoice: 'A',
      rationales: [
        {
          label: 'A',
          rationale:
            'Reproduces the mechanism of the fourth paragraph: competence genuinely acquired, but acquired in a setting that generates no certificate, and therefore not legible as skill.',
        },
        {
          label: 'B',
          rationale:
            'Inverts the mechanism. The passage describes real competence that goes unrecognised, not absent competence that is falsely claimed.',
          family: 'distortion',
        },
        {
          label: 'C',
          rationale:
            'Turns on pay rather than on legibility. Wages appear in the closing paragraph as a consequence of the classification, not as the relation itself.',
          family: 'too-narrow',
        },
        {
          label: 'D',
          rationale:
            'A genuine difficulty of learning, but nothing in it concerns whether the resulting competence is recognised, which is what the passage relation requires.',
          family: 'true-but-irrelevant',
        },
      ],
      evidenceQuotes: [
        'Where competence is acquired in a classroom and certified on paper, it becomes legible as skill',
        'it registers instead as temperament, or patience, or a knack',
      ],
    },
    {
      id: 'cars-q-skill-06',
      itemModelId: 'cars-im-skill-01-meaning',
      familyId: 'cars-im-skill-01-meaning',
      archetype: 'meaning-in-context',
      skill: 'FOC',
      stem: 'In the final sentence, the author’s use of the word natural serves to indicate that:',
      choices: [
        { label: 'A', text: 'the arrangement is grounded in biological differences among those who perform the work.' },
        { label: 'B', text: 'occupational tiers are ordered by the length of preparation each of them demands.' },
        { label: 'C', text: 'the arrangement has acquired an appearance of inevitability from the words available to defend it.' },
        { label: 'D', text: 'the arrangement is a pure invention that answers to nothing outside the language used for it.' },
      ],
      correctChoice: 'C',
      rationales: [
        {
          label: 'A',
          rationale:
            'Imports the biological sense of the word from outside. The passage is concerned with certification and visibility, and says nothing about the attributes of workers themselves.',
          family: 'outside-knowledge',
        },
        {
          label: 'B',
          rationale:
            'Describes what the tiers supposedly rest on rather than what the word is doing in the sentence. The stem asks about the function of the term.',
          family: 'wrong-question',
        },
        {
          label: 'C',
          rationale:
            'The closing sentence says the phrase hands the hierarchy a vocabulary in which it can be defended as natural, and that the argument has been relocated into a word that looks like a fact. The word marks borrowed inevitability.',
        },
        {
          label: 'D',
          rationale:
            'Pushes past the passage into the pure-construction view the fifth paragraph rejects. The author holds that competence is real while its classification is not measured.',
          family: 'too-extreme',
        },
      ],
      evidenceQuotes: [
        'a vocabulary in which it can be defended as natural',
        'the argument has been relocated into a word that looks like a fact',
      ],
    },
  ],
  provenance: {
    model: 'hand-authored',
    generatedAt: '2026-07-29T00:00:00.000Z',
    pipelineVersion: PIPELINE_VERSION,
  },
};

/* ------------------------------------------------------------------ Set B ---------- */

export const PERFORMANCE_BLUEPRINT: PassageSetBlueprint = {
  passage: {
    id: 'cars-bp-performance-01',
    domain: 'humanities',
    discipline: 'music',
    topic:
      'Whether a musical performance delivers a work that already exists or completes one that does not',
    thesis:
      'A performance completes a musical work rather than merely transmitting it, because notation underdetermines the sounding result in ways no amount of fidelity can close',
    thesisPosition: 'opening',
    structure: 'thesis-and-illustration',
    tone: 'ambivalent',
    purpose: 'persuade',
    difficulty: 'moderate',
    hedgedClaims: [
      'Some performances are simply wrong, so the latitude notation leaves is not unlimited',
      'The fidelity school is right that a score constrains, though it mistakes constraint for determination',
    ],
    reportedPerspectives: [
      {
        party: 'the fidelity school',
        position:
          'the performer recovers the composer’s intention and contributes nothing of their own to the work',
        authorStance: 'qualifies',
      },
      {
        party: 'the improvisatory critics',
        position: 'a score is merely an occasion for performance and imposes no real constraint',
        authorStance: 'rejects',
      },
    ],
    termsToDefineInPlace: ['articulation'],
    paragraphPlan: [
      { role: 'thesis', content: 'A performance completes rather than delivers the work' },
      { role: 'illustration', content: 'What notation fixes and what it leaves open; articulation defined' },
      { role: 'first position', content: 'The fidelity school treats the gaps as recoverable intention' },
      { role: 'complication', content: 'Historical conventions were never written down, so intention underdetermines too' },
      { role: 'qualification', content: 'The improvisatory critics overreach; some performances are wrong' },
    ],
  },
  items: [
    {
      id: 'cars-im-performance-01-claim',
      archetype: 'explicit-claim',
      skill: 'FOC',
      keyProposition: 'Notation fixes pitch and relative duration while leaving other dimensions open',
      evidenceParagraphs: [1],
      distractorPlan: [
        { family: 'too-extreme', intent: 'Claim notation fixes nothing at all' },
        { family: 'outside-knowledge', intent: 'Offer a plausible claim about recording technology never made' },
        { family: 'wrong-question', intent: 'Answer why notation is used rather than what it fixes' },
      ],
    },
    {
      id: 'cars-im-performance-01-inference',
      archetype: 'integrative-inference',
      skill: 'RWT',
      keyProposition:
        'Appealing to composer intention cannot close the gap, because the conventions that would fill it went unrecorded',
      evidenceParagraphs: [1, 2, 3],
      distractorPlan: [
        { family: 'half-right', intent: 'Get the underdetermination right but locate it in the performer’s taste' },
        { family: 'true-but-irrelevant', intent: 'State the articulation point, true but not the inference' },
        { family: 'outside-knowledge', intent: 'Introduce a claim about notation reform the passage never makes' },
      ],
    },
    {
      id: 'cars-im-performance-01-function',
      archetype: 'rhetorical-function',
      skill: 'FOC',
      keyProposition:
        'The account of unwritten conventions shows the fidelity standard is underdetermined on its own terms',
      evidenceParagraphs: [3],
      distractorPlan: [
        { family: 'too-narrow', intent: 'Reduce it to historical background' },
        { family: 'reversal', intent: 'Cast it as supporting the fidelity school' },
        { family: 'true-but-irrelevant', intent: 'Describe its content rather than its function' },
      ],
    },
    {
      id: 'cars-im-performance-01-application',
      archetype: 'principle-application',
      skill: 'RBT',
      keyProposition:
        'The analogous case is one where a set of instructions constrains an outcome without determining it',
      evidenceParagraphs: [0, 4],
      stemSuppliedInformation: 'Four situations outside music, to be judged for analogy to the passage account',
      distractorPlan: [
        { family: 'too-extreme', intent: 'Offer a case with no constraint at all' },
        { family: 'reversal', intent: 'Offer a case fully determined by its instructions' },
        { family: 'true-but-irrelevant', intent: 'Offer a case of difficulty without underdetermination' },
      ],
    },
    {
      id: 'cars-im-performance-01-newinfo',
      archetype: 'new-information-effect',
      skill: 'RBT',
      keyProposition:
        'Identical scores yielding defensible but incompatible readings supports the completion thesis',
      evidenceParagraphs: [0],
      stemSuppliedInformation:
        'Two performers working from the same score produce readings that are incompatible yet both judged defensible',
      distractorPlan: [
        { family: 'reversal', intent: 'Claim the case tells against the completion thesis' },
        { family: 'outside-knowledge', intent: 'Attribute the divergence to instrument differences the stem excludes' },
        { family: 'too-narrow', intent: 'Restrict the significance to disputed repertoire' },
      ],
    },
  ],
  approvedBy: 'authored-in-repo',
  approvedAt: '2026-07-29T00:00:00.000Z',
};

export const PERFORMANCE_PARAGRAPHS: readonly string[] = [
  'A score is not a recipe, though it is constantly described as one. What I want to argue is that a performance completes a musical work rather than merely delivering it, and that the completing is constitutive rather than decorative. This sounds like a claim about performers and their licence. It is really a claim about notation, and about how little of a piece of music the marks on a page are able to hold.',
  'Consider what a score actually fixes. It fixes pitch with great precision and relative duration almost as precisely, and beyond that its grip loosens quickly. Articulation, meaning the manner in which successive notes are joined to or separated from one another, is indicated by a small vocabulary of marks that admit of wide interpretation. Dynamics arrive as a handful of words borrowed from Italian. Tempo is given, when it is given at all, by a term that names a character rather than a speed. None of this is carelessness on the composer’s part; it is the outer limit of what the notation can carry.',
  'One response is to treat every gap as a question with a recoverable answer. Call this the fidelity school: on its account the performer’s task is to determine what the composer intended and to supply exactly that, adding nothing. The position has obvious appeal, and it has produced scholarship of real value, since much can in fact be recovered from letters, treatises, and the instruments of the period. An oboe built to eighteenth-century specifications will not produce a nineteenth-century sound however it is played, and that is a fact about the world rather than a matter of preference. A performer who ignores such evidence is not being free but merely careless, and the distinction matters.',
  'The difficulty is that intention runs out well before the gaps do. The conventions a composer took for granted were, precisely because they were taken for granted, the least likely things to be written down. Performers of the period knew how to inflect a phrase of that shape, and knew it so thoroughly that nobody thought to record it. What survives is the notation, which is silent on exactly the questions the fidelity school most needs answered. To ask what the composer intended is often to ask a question that has no determinate answer rather than one whose answer has been mislaid.',
  'None of this licenses the opposite extreme. There are critics who conclude that a score is merely an occasion for performance and constrains nothing, and they are plainly mistaken. A reading that ignores the written pitches is not an interpretation of the work but a departure from it, and audiences have no difficulty telling the difference. The fidelity school is right that a score constrains; what it mistakes is constraint for determination. A performance is answerable to the score without being derivable from it, and that gap is where the work is finished rather than merely reproduced.',
];

export const PERFORMANCE_SET: GeneratedPassageSet = {
  passage: {
    id: 'cars-p-performance-01',
    blueprintId: 'cars-bp-performance-01',
    title: 'The Performer’s Share',
    paragraphs: [...PERFORMANCE_PARAGRAPHS],
  },
  items: [
    {
      id: 'cars-q-performance-01',
      itemModelId: 'cars-im-performance-01-claim',
      familyId: 'cars-im-performance-01-claim',
      archetype: 'explicit-claim',
      skill: 'FOC',
      stem: 'According to the passage, notation specifies which of the following most precisely?',
      choices: [
        { label: 'A', text: 'The character that the composer wished a movement to convey in performance.' },
        { label: 'B', text: 'The pitches to be sounded and the durations they hold relative to one another.' },
        { label: 'C', text: 'Nothing whatever, since every marking is open to the performer’s construction.' },
        { label: 'D', text: 'The reasons a composer preferred writing to demonstrating a passage directly.' },
      ],
      correctChoice: 'B',
      rationales: [
        {
          label: 'A',
          rationale:
            'The second paragraph offers character as an example of what notation holds *loosely*: tempo is given by a term naming a character rather than a speed. It is the imprecise case, not the precise one.',
          family: 'true-but-irrelevant',
        },
        {
          label: 'B',
          rationale:
            'The second paragraph states that a score fixes pitch with great precision and relative duration almost as precisely, and that beyond this its grip loosens.',
        },
        {
          label: 'C',
          rationale:
            'Overstates the argument into the position the final paragraph rejects, where critics who hold that a score constrains nothing are said to be plainly mistaken.',
          family: 'too-extreme',
        },
        {
          label: 'D',
          rationale:
            'Asks after the composer’s motives for using notation, which the passage never discusses, and in any case answers a different question than the stem poses.',
          family: 'wrong-question',
        },
      ],
      evidenceQuotes: [
        'It fixes pitch with great precision and relative duration almost as precisely',
      ],
    },
    {
      id: 'cars-q-performance-02',
      itemModelId: 'cars-im-performance-01-inference',
      familyId: 'cars-im-performance-01-inference',
      archetype: 'integrative-inference',
      skill: 'RWT',
      stem: 'The passage implies that the fidelity school’s programme is limited chiefly because:',
      choices: [
        { label: 'A', text: 'the marks available for articulation admit of unusually wide interpretation.' },
        { label: 'B', text: 'performers are inclined to prefer their own taste to the evidence of the period.' },
        { label: 'C', text: 'a reformed notation would remove the ambiguities that presently trouble performers.' },
        { label: 'D', text: 'the practices a composer assumed were for that reason the least likely to be written down.' },
      ],
      correctChoice: 'D',
      rationales: [
        {
          label: 'A',
          rationale:
            'True, and stated in the second paragraph, but it describes the gap rather than explaining why appealing to intention cannot close it. The stem asks for the limitation on the programme.',
          family: 'true-but-irrelevant',
        },
        {
          label: 'B',
          rationale:
            'Half right: the passage does hold that intention underdetermines, but it locates the reason in the historical record, not in the performer’s inclinations. The third paragraph calls a performer who ignores the evidence careless.',
          family: 'half-right',
        },
        {
          label: 'C',
          rationale:
            'Introduces a proposal about reforming notation that appears nowhere in the passage.',
          family: 'outside-knowledge',
        },
        {
          label: 'D',
          rationale:
            'The fourth paragraph states that conventions taken for granted were, precisely for that reason, the least likely things to be written down, which is why the notation is silent on what the fidelity school most needs.',
        },
      ],
      evidenceQuotes: [
        'the least likely things to be written down',
        'silent on exactly the questions the fidelity school most needs answered',
      ],
    },
    {
      id: 'cars-q-performance-03',
      itemModelId: 'cars-im-performance-01-function',
      familyId: 'cars-im-performance-01-function',
      archetype: 'rhetorical-function',
      skill: 'FOC',
      stem: 'The discussion of unwritten period conventions (fourth paragraph) functions primarily to:',
      choices: [
        { label: 'A', text: 'supply historical background about how performers of the period were trained.' },
        { label: 'B', text: 'strengthen the case for recovering intention from treatises and instruments.' },
        { label: 'C', text: 'show that the standard of fidelity is underdetermined by its own evidence.' },
        { label: 'D', text: 'record that certain ways of inflecting a phrase were once widely understood.' },
      ],
      correctChoice: 'C',
      rationales: [
        {
          label: 'A',
          rationale:
            'Reduces an argumentative move to background. The paragraph is doing work against a position, not setting a scene.',
          family: 'too-narrow',
        },
        {
          label: 'B',
          rationale:
            'Reverses the direction of the argument. Recovery from treatises and instruments is the fidelity school’s resource, granted in the third paragraph; the fourth paragraph limits it.',
          family: 'reversal',
        },
        {
          label: 'C',
          rationale:
            'The paragraph establishes that what the fidelity school needs is exactly what went unrecorded, so asking after intention often poses a question with no determinate answer. That undercuts the standard from inside.',
        },
        {
          label: 'D',
          rationale:
            'States the paragraph’s content accurately but answers what it says rather than what it does, which is what the stem asks.',
          family: 'true-but-irrelevant',
        },
      ],
      evidenceQuotes: [
        'a question that has no determinate answer rather than one whose answer has been mislaid',
      ],
    },
    {
      id: 'cars-q-performance-04',
      itemModelId: 'cars-im-performance-01-application',
      familyId: 'cars-im-performance-01-application',
      archetype: 'principle-application',
      skill: 'RBT',
      stem: 'Which situation best exemplifies the relation between score and performance that the passage defends?',
      choices: [
        { label: 'A', text: 'A statute settles the outcome of a case as soon as its terms are correctly read.' },
        { label: 'B', text: 'A brief given to an architect rules out many buildings while specifying none of them.' },
        { label: 'C', text: 'A translator works from a text whose language no living reader can construe.' },
        { label: 'D', text: 'A game admits any move at all, so that its rules place nothing beyond reach.' },
      ],
      correctChoice: 'B',
      rationales: [
        {
          label: 'A',
          rationale:
            'Makes the instructions fully determining, which is precisely the equation of constraint with determination that the final paragraph identifies as the fidelity school’s error.',
          family: 'reversal',
        },
        {
          label: 'B',
          rationale:
            'Reproduces the relation the passage argues for: real constraint that narrows the possibilities without fixing the result, so the outcome is answerable to the brief without being derivable from it.',
        },
        {
          label: 'C',
          rationale:
            'A genuine difficulty, but one of access rather than of underdetermination. The passage’s point is that notation is clear and still insufficient.',
          family: 'true-but-irrelevant',
        },
        {
          label: 'D',
          rationale:
            'Removes constraint altogether, which is the improvisatory position the passage calls plainly mistaken.',
          family: 'too-extreme',
        },
      ],
      evidenceQuotes: [
        'answerable to the score without being derivable from it',
        'what it mistakes is constraint for determination',
      ],
    },
    {
      id: 'cars-q-performance-05',
      itemModelId: 'cars-im-performance-01-newinfo',
      familyId: 'cars-im-performance-01-newinfo',
      archetype: 'new-information-effect',
      skill: 'RBT',
      stem: 'Two performers working from the same score produce readings that are incompatible with one another, yet both are judged defensible by informed listeners. For the passage argument, this observation would:',
      choices: [
        { label: 'A', text: 'weaken it, by showing that listeners cannot distinguish a reading from a departure.' },
        { label: 'B', text: 'bear on it only where the repertoire itself is a matter of scholarly dispute.' },
        { label: 'C', text: 'leave it untouched, since differences of instrument would explain the divergence.' },
        { label: 'D', text: 'support it, by exhibiting the latitude that the notation cannot itself resolve.' },
      ],
      correctChoice: 'D',
      rationales: [
        {
          label: 'A',
          rationale:
            'Reverses the implication. The final paragraph insists listeners can tell an interpretation from a departure; the case describes two readings both judged defensible, which is a different matter.',
          family: 'reversal',
        },
        {
          label: 'B',
          rationale:
            'Confines the case to contested repertoire, but the argument of the first two paragraphs is about notation as such, not about disputed works.',
          family: 'too-narrow',
        },
        {
          label: 'C',
          rationale:
            'Attributes the divergence to instruments, which the described case excludes by holding the score fixed and varying only the performers.',
          family: 'outside-knowledge',
        },
        {
          label: 'D',
          rationale:
            'Exactly the completion thesis of the first paragraph: if two defensible readings can differ, the sounding result was not contained in the score, so the performance completes rather than delivers the work.',
        },
      ],
      evidenceQuotes: [
        'a performance completes a musical work rather than merely delivering it',
      ],
    },
  ],
  provenance: {
    model: 'hand-authored',
    generatedAt: '2026-07-29T00:00:00.000Z',
    pipelineVersion: PIPELINE_VERSION,
  },
};
