/**
 * Passage of the Day — vetted content pool.
 *
 * A small, hand-authored pool of CARS-style passages (humanities / social
 * science, MCAT-CARS tone). Every passage is ORIGINAL, written for this app: no
 * text is adapted from, or derived from, any real published work or reference
 * question material. Each passage is CONTENT-AGNOSTIC — everything needed to
 * answer its questions is present in the passage itself, requiring no outside or
 * specialized knowledge, exactly as CARS intends.
 *
 * This module is SERVER-ONLY. It carries answer keys and per-choice rationales
 * and is imported solely by the dev/preview passage handler
 * (`apps/learner-web/server/passage-of-day.ts`), which hands the browser a
 * learner-safe view (no key, no rationale) and scores server-side. It must never
 * be imported by the browser bundle — mirroring the diagnostic and practice
 * banks, the key never crosses the client boundary.
 *
 * The file is deliberately self-contained (no imports) so it type-checks under
 * any consumer's config and can never pull server-only or browser-only code into
 * the wrong graph.
 */

export type PassageChoiceId = 'A' | 'B' | 'C' | 'D';

export interface PassageChoice {
  readonly id: PassageChoiceId;
  readonly text: string;
}

export interface PassageQuestion {
  readonly id: string;
  readonly stem: string;
  /** Exactly four options, A–D. */
  readonly choices: readonly PassageChoice[];
  readonly correctChoiceId: PassageChoiceId;
  /** Why the correct answer is correct (shown after the learner commits). */
  readonly rationale: string;
  /** One short note per option, keyed A–D (the "why this misses" material). */
  readonly choiceRationales: Readonly<Record<PassageChoiceId, string>>;
}

export interface PassageOfTheDayEntry {
  readonly id: string;
  /** A short, evocative title for the passage (shown as the runner heading). */
  readonly title: string;
  /** The humanities / social-science field, shown as an eyebrow. */
  readonly discipline: string;
  /** The passage text, one string per paragraph. */
  readonly body: readonly string[];
  /** One or two MCQs assessing the passage. */
  readonly questions: readonly PassageQuestion[];
}

/**
 * The pool. Rotation cycles through it in array order (see the server module),
 * so the order here is the order learners meet the passages. Keep entries
 * roughly even in difficulty; add to the end rather than reordering, so a given
 * day does not silently change passages for everyone.
 */
export const PASSAGE_OF_THE_DAY_POOL: readonly PassageOfTheDayEntry[] = [
  {
    id: 'potd-aesthetics-difficulty',
    title: 'The Uses of Difficulty',
    discipline: 'Aesthetics',
    body: [
      'It is often assumed that the value of a work of art lies in the pleasure it provides, and that pleasure is greatest when it comes easily. On this view, a poem that must be reread, a piece of music that resists a first hearing, or a painting that refuses to resolve into a familiar scene has failed in its basic duty to delight. Yet the history of criticism is full of works that were at first found forbidding and later judged indispensable. If difficulty were simply a defect, this pattern would be inexplicable.',
      'A more careful account distinguishes between two kinds of difficulty. The first is accidental: it arises from carelessness or obscurity, from an artist who has not mastered the materials, and it rewards no effort because there is nothing behind it. The second is constitutive: the difficulty is the meaning, or is inseparable from it, and to remove it would be to remove the very experience the work exists to produce. A poem about the limits of understanding that could be understood at a glance would refute itself.',
      'The reader who confuses the two makes one of two errors. He may dismiss a demanding work as merely obscure, mistaking his own impatience for a judgment about the work; or he may praise obscurity for its own sake, treating unintelligibility as a guarantee of depth. Both errors share a premise: that difficulty is a single thing, to be either avoided or admired. The critic\u2019s task is harder and less comfortable \u2014 to ask, in each case, whether the effort a work demands is repaid by what the effort discloses.',
    ],
    questions: [
      {
        id: 'potd-aesthetics-difficulty-q1',
        stem: 'The central claim of the passage is that:',
        choices: [
          { id: 'A', text: 'art should aim above all to provide pleasure that comes easily' },
          {
            id: 'B',
            text: 'the difficulty of a work should be judged by whether the effort it demands is rewarded',
          },
          { id: 'C', text: 'obscurity in art is generally a sign of the creator\u2019s carelessness' },
          { id: 'D', text: 'demanding works are usually recognized as indispensable by later critics' },
        ],
        correctChoiceId: 'B',
        rationale:
          'The argument builds to the final sentence: because difficulty is not one thing to be simply avoided or admired, the critic must ask whether the effort a work demands is "repaid by what the effort discloses." That evaluative test is the passage\u2019s central claim.',
        choiceRationales: {
          A: 'This is the view the author sets up in order to reject it, not the claim being advanced.',
          B: 'Correct: the passage concludes that difficulty must be judged case by case, by whether the effort it requires is repaid.',
          C: 'Carelessness describes only "accidental" difficulty, one of two kinds; the author does not generalize it to obscurity as such.',
          D: 'The passage says the history of criticism is "full of" such works, which supports its point but is not the claim it defends.',
        },
      },
      {
        id: 'potd-aesthetics-difficulty-q2',
        stem: 'A critic who "praises obscurity for its own sake" would most likely:',
        choices: [
          { id: 'A', text: 'admire a bewildering poem simply because it is bewildering' },
          { id: 'B', text: 'reject a challenging poem after a single reading' },
          { id: 'C', text: 'carefully distinguish accidental from constitutive difficulty' },
          { id: 'D', text: 'insist that all valuable art is easy to grasp' },
        ],
        correctChoiceId: 'A',
        rationale:
          'The passage defines this error as "treating unintelligibility as a guarantee of depth" \u2014 valuing difficulty in itself, without asking whether it discloses anything.',
        choiceRationales: {
          A: 'Correct: to praise obscurity for its own sake is to treat unintelligibility itself as a mark of depth.',
          B: 'That describes the opposite error \u2014 the impatient reader who dismisses a demanding work.',
          C: 'Drawing that distinction is the disciplined move the author endorses, not the error described.',
          D: 'This contradicts a critic who prizes obscurity; it is closer to the easy-pleasure view the author rejects.',
        },
      },
    ],
  },
  {
    id: 'potd-history-microhistory',
    title: 'The Grain of the Past',
    discipline: 'Historiography',
    body: [
      'For much of the twentieth century, the ambition of historians was to explain the large: the rise of states, the movement of prices, the slow transformation of populations. The individual appeared, if at all, as an instance of a trend \u2014 a single point in a series. Against this ambition a countercurrent arose, one that took as its subject a single village, a single trial, sometimes a single obscure person, and asked what the world looked like from there.',
      'The practitioners of this microhistory did not deny that large forces exist. Their wager was epistemological rather than metaphysical: that a reduction in scale reveals structures the wide view flattens. A tax record read across a province yields an average; the same record read against one household\u2019s testimony can expose the negotiations, evasions, and misunderstandings the average conceals. What is lost in generality, they argued, is regained in depth.',
      'Critics pressed the obvious objection. If a case is chosen because it is richly documented, it may be documented precisely because it was unusual; the vivid exception is a poor guide to the silent rule. The microhistorians\u2019 reply was not to claim that their cases were typical but to redefine what a case is for. A well-chosen instance, they held, does not stand in for the many; it tests whether our general explanations can survive contact with a life actually lived.',
    ],
    questions: [
      {
        id: 'potd-history-microhistory-q1',
        stem: 'The author discusses the critics\u2019 objection (paragraph 3) primarily in order to:',
        choices: [
          { id: 'A', text: 'demonstrate that microhistory has been thoroughly discredited' },
          { id: 'B', text: 'show that microhistorians chose atypical cases in order to mislead' },
          { id: 'C', text: 'introduce the microhistorians\u2019 reframing of what a single case is meant to do' },
          { id: 'D', text: 'establish that richly documented cases are always unusual' },
        ],
        correctChoiceId: 'C',
        rationale:
          'The objection is raised so the author can present the microhistorians\u2019 reply: a case is not meant to be typical but to test whether general explanations "can survive contact with a life actually lived."',
        choiceRationales: {
          A: 'The author gives microhistory a persuasive reply, not a discrediting; the movement is treated seriously.',
          B: 'No deceptive intent is attributed to microhistorians; the concern is about representativeness, not manipulation.',
          C: 'Correct: the objection sets up the reframing that follows \u2014 a case as a test of explanations, not a stand-in for the many.',
          D: 'The critics suggest a documented case "may" be unusual; the author does not endorse the absolute "always."',
        },
      },
      {
        id: 'potd-history-microhistory-q2',
        stem: 'The passage suggests that an "average" drawn from a provincial tax record:',
        choices: [
          { id: 'A', text: 'is inherently more accurate than any single household\u2019s testimony' },
          { id: 'B', text: 'can conceal the particular negotiations that lie behind the numbers' },
          { id: 'C', text: 'is dismissed by microhistorians as essentially worthless' },
          { id: 'D', text: 'reveals structures that a reduction in scale would flatten' },
        ],
        correctChoiceId: 'B',
        rationale:
          'The passage says the same record read against a household\u2019s testimony "can expose the negotiations, evasions, and misunderstandings the average conceals" \u2014 the average hides those particulars.',
        choiceRationales: {
          A: 'The passage does not rank the average as more accurate; it says each scale reveals different things.',
          B: 'Correct: the average "conceals" the negotiations and evasions that the smaller scale can expose.',
          C: 'Microhistorians "did not deny that large forces exist," so they do not treat aggregate data as worthless.',
          D: 'This reverses the passage: the wide view flattens structure, while the reduction in scale reveals it.',
        },
      },
    ],
  },
  {
    id: 'potd-philsci-anomalies',
    title: 'What the Exception Knows',
    discipline: 'Philosophy of Science',
    body: [
      'A common picture of science holds that theories are confirmed by the accumulation of favorable evidence and abandoned when the evidence turns against them. On this picture an anomaly \u2014 an observation a theory cannot accommodate \u2014 should count decisively against the theory. Yet working scientists routinely set anomalies aside, and they are often right to do so.',
      'The reason is that no theory confronts the world alone. Any prediction depends on a web of auxiliary assumptions: that the instruments are calibrated, that the sample is pure, that no unnoticed factor intrudes. When a prediction fails, logic alone cannot say whether the fault lies in the theory or in one of these assumptions. A discrepancy is therefore an occasion for inquiry, not an automatic verdict.',
      'This latitude is easily abused. A theory can be protected indefinitely if its defenders are always willing to blame the auxiliaries, and the history of science includes ideas kept alive long past their usefulness by exactly this maneuver. The mark of a healthy science is not that it refuses to tolerate anomalies, nor that it tolerates them forever, but that it treats the decision to tolerate or abandon as one that must eventually be paid for in predictions that either come true or do not.',
    ],
    questions: [
      {
        id: 'potd-philsci-anomalies-q1',
        stem: 'Which of the following best captures the main idea of the passage?',
        choices: [
          { id: 'A', text: 'An anomaly should always be treated as a decisive refutation of a theory.' },
          {
            id: 'B',
            text: 'Whether an anomaly refutes a theory cannot be settled by logic alone and must be judged by later predictions.',
          },
          {
            id: 'C',
            text: 'Blaming auxiliary assumptions to protect a theory is always an illegitimate maneuver.',
          },
          { id: 'D', text: 'Theories are confirmed only by the steady accumulation of favorable evidence.' },
        ],
        correctChoiceId: 'B',
        rationale:
          'The passage argues that a failed prediction cannot, by logic alone, locate the fault; the decision to keep or abandon a theory is ultimately settled by whether later predictions come true.',
        choiceRationales: {
          A: 'This is the "common picture" the author complicates, not the view being defended.',
          B: 'Correct: logic cannot assign the blame, so the verdict must be paid for in subsequent predictions.',
          C: 'The author says setting anomalies aside is often right; the problem is only its indefinite abuse.',
          D: 'This restates the simplified picture the passage sets out to qualify.',
        },
      },
      {
        id: 'potd-philsci-anomalies-q2',
        stem: 'The author would most likely regard which situation as a failure of a healthy science?',
        choices: [
          { id: 'A', text: 'Setting an anomaly aside while re-checking whether an instrument was calibrated' },
          { id: 'B', text: 'Abandoning a theory after a run of failed predictions' },
          {
            id: 'C',
            text: 'Blaming auxiliary assumptions indefinitely so a theory never risks a new prediction',
          },
          { id: 'D', text: 'Treating a single discrepancy as an occasion for further inquiry' },
        ],
        correctChoiceId: 'C',
        rationale:
          'The author\u2019s test is that a theory must eventually be "paid for in predictions." A theory shielded forever by blaming auxiliaries never pays that price, which is the abuse the passage warns against.',
        choiceRationales: {
          A: 'This is exactly the legitimate inquiry the author defends \u2014 checking an auxiliary assumption.',
          B: 'Abandoning a theory after repeated failures is paying the predictive debt, not failing.',
          C: 'Correct: perpetual protection that never risks a new prediction is the maneuver the author condemns.',
          D: 'Treating a discrepancy as an occasion for inquiry is precisely what the author recommends.',
        },
      },
    ],
  },
  {
    id: 'potd-litcrit-author',
    title: 'The Vanishing Author',
    discipline: 'Literary Criticism',
    body: [
      'A once-radical idea has become a classroom commonplace: that the meaning of a text is not fixed by its author\u2019s intentions. The author, having written, departs; what remains is a structure of words open to whatever a competent reader can make it say. On the strongest version of this view, to ask "what did the writer mean?" is to ask an irrelevant, even unanswerable, question.',
      'There is something bracing in this liberation of the reader, and something evasive. It is true that writers do not control the afterlife of their words, that texts say more and other than their makers knew. But the move from "intention does not exhaust meaning" to "intention is irrelevant to meaning" is a leap, not a deduction. We do not, in ordinary life, treat the sentences of others as free-floating structures; we treat them as the acts of persons trying to say something, and we are usually right to.',
      'The interesting cases lie between the extremes. When a reader finds in a poem an implication its author would have disowned, we need not choose between "the author is the sole authority" and "the author does not matter." We can say instead that the reader has found something the words permit but the writer did not intend \u2014 a discovery about the text, honestly reported, rather than a meaning simply decreed. What such honesty requires is exactly the distinction the strong view erases: between what a text can be made to mean and what it was meant to mean.',
    ],
    questions: [
      {
        id: 'potd-litcrit-author-q1',
        stem: 'The author\u2019s attitude toward the view that "intention is irrelevant to meaning" is best described as:',
        choices: [
          { id: 'A', text: 'complete endorsement of it as a liberation of the reader' },
          { id: 'B', text: 'rejection of any role at all for the reader in making meaning' },
          {
            id: 'C',
            text: 'partial agreement \u2014 granting that intention does not exhaust meaning, but denying that it is therefore irrelevant',
          },
          { id: 'D', text: 'insistence that the author\u2019s intention is the sole authority over meaning' },
        ],
        correctChoiceId: 'C',
        rationale:
          'The author accepts that texts "say more and other than their makers knew" yet treats the jump to "irrelevant" as an unjustified leap, staking out a middle position.',
        choiceRationales: {
          A: 'The author calls the strong view "evasive" and challenges it, so this is not full endorsement.',
          B: 'The author allows readers to find implications a text permits, so the reader clearly has a role.',
          C: 'Correct: the passage grants the weaker premise but resists the stronger conclusion.',
          D: 'The author explicitly rejects treating the writer as the "sole authority."',
        },
      },
      {
        id: 'potd-litcrit-author-q2',
        stem: 'By calling the move from "intention does not exhaust meaning" to "intention is irrelevant" a "leap, not a deduction," the author implies that:',
        choices: [
          { id: 'A', text: 'the conclusion does not follow logically from the premise' },
          { id: 'B', text: 'the premise itself is false' },
          { id: 'C', text: 'readers can never find unintended implications in a text' },
          { id: 'D', text: 'the two statements say precisely the same thing' },
        ],
        correctChoiceId: 'A',
        rationale:
          'A "leap, not a deduction" marks a gap in reasoning: the stronger claim is not entailed by the weaker one the author grants.',
        choiceRationales: {
          A: 'Correct: "not a deduction" means the conclusion is not logically entailed by the premise.',
          B: 'The author accepts the premise as true; the objection is to the inference drawn from it.',
          C: 'The author affirms that readers can find implications a text permits; this misreads the point.',
          D: 'If they meant the same thing there would be no "leap" between them; the author distinguishes them.',
        },
      },
    ],
  },
  {
    id: 'potd-poli-deliberation',
    title: 'Government by Discussion',
    discipline: 'Political Theory',
    body: [
      'Democracies are often justified by appeal to numbers: the majority decides, and the counting of heads substitutes peacefully for the breaking of them. A rival tradition locates the value of democracy not in voting but in talk. On this deliberative view, a decision is legitimate not because more people preferred it but because it could survive open discussion among those it binds \u2014 because reasons, not merely preferences, were offered and weighed.',
      'The appeal of the deliberative ideal is that it asks citizens to justify their demands to one another rather than simply to register them. A preference need answer to no one; a reason can be challenged, refined, or exposed as special pleading. Deliberation, its defenders hope, filters out claims that cannot be stated in terms others could accept, and so tends toward decisions defensible to all rather than merely satisfactory to most.',
      'Skeptics doubt the filter works. Talk, they note, is not evenly distributed: the confident, the fluent, and the leisured speak more and are heard more, so a forum meant to neutralize power may quietly reproduce it under the appearance of reason. The deliberative theorist cannot dismiss this worry, but can reframe it. The objection is not that deliberation is worthless but that its promise is conditional \u2014 realized where the conditions of genuine equality among speakers are met, and betrayed wherever they are not.',
    ],
    questions: [
      {
        id: 'potd-poli-deliberation-q1',
        stem: 'The main point of the passage is that deliberative democracy:',
        choices: [
          { id: 'A', text: 'is best justified, like all democracy, by the peaceful counting of votes' },
          {
            id: 'B',
            text: 'locates legitimacy in reasoned discussion, though its promise depends on equality among speakers',
          },
          { id: 'C', text: 'reliably neutralizes differences of power among citizens' },
          { id: 'D', text: 'has been shown by skeptics to be worthless in practice' },
        ],
        correctChoiceId: 'B',
        rationale:
          'The passage presents deliberation as grounding legitimacy in reasons rather than numbers, then concedes that this promise is "conditional" on genuine equality among speakers.',
        choiceRationales: {
          A: 'Counting votes is the rival, numbers-based justification the deliberative view is contrasted against.',
          B: 'Correct: legitimacy through discussion, with the promise realized only under conditions of equality.',
          C: 'The author agrees with skeptics that unequal talk can reproduce power, so the filter is not reliable.',
          D: 'The author explicitly says the objection is "not that deliberation is worthless."',
        },
      },
      {
        id: 'potd-poli-deliberation-q2',
        stem: 'According to the passage, a "reason" differs from a "preference" in that a reason:',
        choices: [
          { id: 'A', text: 'is always held by a majority of citizens' },
          { id: 'B', text: 'can be challenged and must be stated in terms others could accept' },
          { id: 'C', text: 'need answer to no one' },
          { id: 'D', text: 'is distributed evenly across all speakers' },
        ],
        correctChoiceId: 'B',
        rationale:
          'The passage contrasts them directly: "A preference need answer to no one; a reason can be challenged, refined, or exposed as special pleading," and must be stated in terms others could accept.',
        choiceRationales: {
          A: 'Being held by a majority is a matter of numbers, not what distinguishes a reason from a preference.',
          B: 'Correct: a reason is answerable \u2014 open to challenge and statable in commonly acceptable terms.',
          C: 'That is the passage\u2019s description of a preference, not a reason.',
          D: 'Even distribution of talk is what skeptics deny; it is not part of the reason/preference contrast.',
        },
      },
    ],
  },
  {
    id: 'potd-anthro-ethnography',
    title: 'The Observer in the Frame',
    discipline: 'Anthropology',
    body: [
      'The classic ethnography spoke in a confident voice. The anthropologist had been there, had seen, and reported what the people did and believed as though through a clear pane of glass. The authority of the account rested on presence: I was among them, therefore I know. For a long time this voice was mistaken for the sound of objectivity itself.',
      'Later practitioners grew uneasy. The pane of glass, they realized, was never clear. The observer arrives with questions that shape what counts as an answer, is present at some events and absent from others, is told what informants think a stranger should be told. To write as if none of this intervened was not neutrality but a concealment of the conditions under which the knowledge was produced. Honesty seemed to demand that the anthropologist appear in the account, not as its hero but as one of its instruments.',
      'This reflexive turn carried its own danger. An ethnography that dwells too long on the anthropologist\u2019s doubts can become a study of the anthropologist, the people it set out to describe receding into a backdrop for a drama of conscience. The corrective to false confidence is not endless self-regard but a disciplined modesty: an account that states plainly how it came to know what it claims, and then gets on with the work of saying it.',
    ],
    questions: [
      {
        id: 'potd-anthro-ethnography-q1',
        stem: 'The passage as a whole is best understood as arguing that:',
        choices: [
          { id: 'A', text: 'ethnographers should return to the confident voice of the classic account' },
          { id: 'B', text: 'reflection on the observer\u2019s role should replace description altogether' },
          {
            id: 'C',
            text: 'acknowledging the observer\u2019s role is necessary but should not displace the description it was meant to make honest',
          },
          { id: 'D', text: 'genuine knowledge of another culture is impossible' },
        ],
        correctChoiceId: 'C',
        rationale:
          'The author criticizes both false confidence and excessive self-regard, endorsing a "disciplined modesty" that states how knowledge was produced and then proceeds to describe.',
        choiceRationales: {
          A: 'The author treats the confident voice as a mistake to be corrected, not a model to return to.',
          B: 'The author warns against reflexivity that turns the account into a "study of the anthropologist."',
          C: 'Correct: acknowledge the observer, then get on with the description \u2014 the "disciplined modesty" the author urges.',
          D: 'The passage seeks honest knowledge, not the claim that such knowledge is impossible.',
        },
      },
      {
        id: 'potd-anthro-ethnography-q2',
        stem: 'The image of a "pane of glass" is used in the passage to represent:',
        choices: [
          { id: 'A', text: 'the deliberate deceptions practiced by informants' },
          { id: 'B', text: 'the assumption that the observer reports reality without distortion' },
          { id: 'C', text: 'the private doubts that trouble the reflexive anthropologist' },
          { id: 'D', text: 'the modern, reflexive turn in ethnographic writing' },
        ],
        correctChoiceId: 'B',
        rationale:
          'The "clear pane of glass" stands for the classic assumption of transparent observation \u2014 reporting "as though" nothing mediated the view. The author then insists it "was never clear."',
        choiceRationales: {
          A: 'Informants shaping what they tell a stranger is one reason the glass is not clear, not what the glass itself represents.',
          B: 'Correct: the pane of glass figures the belief that observation is transparent and undistorted.',
          C: 'The doubts belong to the later, reflexive practitioners who reject the pane-of-glass assumption.',
          D: 'The reflexive turn is the response to the pane-of-glass assumption, not the assumption itself.',
        },
      },
    ],
  },
  {
    id: 'potd-ethics-moral-luck',
    title: 'The Ledger of Luck',
    discipline: 'Ethics',
    body: [
      'We ordinarily believe two things that turn out to be hard to hold together. The first is that people are morally assessable only for what is within their control; we do not blame a person for the weather. The second is that outcomes matter to our judgments: the reckless driver who kills is condemned more harshly than the equally reckless driver who, by luck, reaches home without incident.',
      'But whether a pedestrian steps into the road is not within either driver\u2019s control. If the two are identical in every respect they can govern \u2014 the same recklessness, the same disregard \u2014 then the difference in our judgments tracks something neither of them chose. Either our first belief is wrong, and control is not a condition of moral assessment, or our second is, and the lethal outcome should add nothing to our condemnation.',
      'Attempts to dissolve the paradox tend to save one belief by sacrificing the other, and each sacrifice costs something we are reluctant to give up. To say the unlucky driver is no worse offends the intuition that killing is graver than merely risking. To say he is worse concedes that luck enters the moral ledger, which the whole idea of responsibility seemed designed to keep out. The value of the puzzle is less that it has a solution than that it shows how much of our moral thinking rests on commitments that pull in opposite directions.',
    ],
    questions: [
      {
        id: 'potd-ethics-moral-luck-q1',
        stem: 'The main idea of the passage is that:',
        choices: [
          {
            id: 'A',
            text: 'the reckless driver who kills is plainly no more blameworthy than the one who does not',
          },
          {
            id: 'B',
            text: 'two ordinary moral beliefs \u2014 that we are assessable only for what we control, and that outcomes matter \u2014 conflict, and relieving the conflict has a cost either way',
          },
          { id: 'C', text: 'moral responsibility requires that outcomes never influence our judgments' },
          { id: 'D', text: 'the paradox of moral luck admits of a clear and satisfying solution' },
        ],
        correctChoiceId: 'B',
        rationale:
          'The passage shows that the control condition and the significance of outcomes cannot both be fully honored, and that abandoning either one "costs something we are reluctant to give up."',
        choiceRationales: {
          A: 'This is only one horn of the dilemma; the author presents it as costly, not as the settled conclusion.',
          B: 'Correct: two intuitive commitments collide, and resolving the collision sacrifices something valued.',
          C: 'The author treats the significance of outcomes as a genuine intuition, not something to be denied outright.',
          D: 'The author says the puzzle\u2019s value "is less that it has a solution," implying no clean solution.',
        },
      },
      {
        id: 'potd-ethics-moral-luck-q2',
        stem: 'The author would most likely agree with which of the following?',
        choices: [
          { id: 'A', text: 'Our moral intuitions together form a fully consistent system.' },
          { id: 'B', text: 'Some widely held moral commitments cannot all be satisfied at once.' },
          { id: 'C', text: 'Control is obviously irrelevant to moral assessment.' },
          { id: 'D', text: 'Luck plainly and uncontroversially belongs in the moral ledger.' },
        ],
        correctChoiceId: 'B',
        rationale:
          'The passage\u2019s point is that our moral thinking "rests on commitments that pull in opposite directions" \u2014 they cannot all be honored together.',
        choiceRationales: {
          A: 'The whole passage is devoted to showing an inconsistency, so this is the opposite of the author\u2019s view.',
          B: 'Correct: the author holds that these commitments conflict and cannot be jointly satisfied.',
          C: 'The author treats the control condition as a compelling intuition, not something obviously irrelevant.',
          D: 'Admitting luck into the ledger is described as a reluctant concession, not a plain, uncontroversial truth.',
        },
      },
    ],
  },
  {
    id: 'potd-urban-walkability',
    title: 'The Walkable City',
    discipline: 'Urban Studies',
    body: [
      'The walkable neighborhood has become the reigning ideal of city planning: dense enough to put shops, work, and homes within a short stroll, various enough that the streets stay lively through the day. Its advantages are real and well rehearsed \u2014 less dependence on cars, more chance encounters, a fabric a person on foot can actually take in. Enthusiasm for the ideal, however, has outrun attention to what securing it can cost.',
      'Density that makes walking worthwhile also makes land valuable, and rising land values do not respect the residents who made a place worth walking in. The corner store praised in the brochure pays the rent of the district it advertises; the longtime tenant is priced out by the very desirability the plan produced. Walkability, pursued without a housing policy to match, can become a mechanism of displacement wearing the costume of community.',
      'None of this is an argument against walkable cities; it is an argument against treating a design pattern as if it were a social program. A street can be engineered; a neighborhood is made of people who can be moved. Planners who forget the difference may congratulate themselves on a lively district while the residents whose presence they measured as vitality are counted, a few years on, somewhere else.',
    ],
    questions: [
      {
        id: 'potd-urban-walkability-q1',
        stem: 'The central argument of the passage is that:',
        choices: [
          { id: 'A', text: 'walkable cities should be abandoned because they drive displacement' },
          {
            id: 'B',
            text: 'walkability is desirable, but without a matching housing policy it can displace the residents who made a place valuable',
          },
          { id: 'C', text: 'increasing density has no meaningful effect on the value of urban land' },
          { id: 'D', text: 'a neighborhood and a street are essentially the same kind of thing' },
        ],
        correctChoiceId: 'B',
        rationale:
          'The author endorses walkability while warning that, pursued without housing policy, it "can become a mechanism of displacement" \u2014 a design pattern mistaken for a social program.',
        choiceRationales: {
          A: 'The author states plainly that "none of this is an argument against walkable cities."',
          B: 'Correct: walkability is good, but it needs a housing policy or it displaces the very residents it counts as vitality.',
          C: 'The passage says density "makes land valuable," the opposite of no effect.',
          D: 'The author draws a sharp distinction between engineering a street and the people who make a neighborhood.',
        },
      },
      {
        id: 'potd-urban-walkability-q2',
        stem: 'The author distinguishes engineering "a street" from making "a neighborhood" chiefly to:',
        choices: [
          { id: 'A', text: 'argue that streets matter more than the neighborhoods around them' },
          {
            id: 'B',
            text: 'suggest that planners can control physical design but not the human consequences it sets in motion',
          },
          { id: 'C', text: 'claim that neighborhoods cannot be affected by planning decisions' },
          { id: 'D', text: 'demonstrate that true walkability is impossible to achieve' },
        ],
        correctChoiceId: 'B',
        rationale:
          'The contrast underscores that design ("a street can be engineered") is within a planner\u2019s power, while the people who constitute a neighborhood "can be moved" \u2014 an effect design alone cannot control.',
        choiceRationales: {
          A: 'The point is not to rank streets above neighborhoods but to separate physical design from social effects.',
          B: 'Correct: planners command the physical form but not the displacement it can trigger.',
          C: 'Neighborhoods clearly are affected by planning \u2014 that is exactly the danger the author describes.',
          D: 'The author affirms walkability\u2019s real advantages; the concern is its costs, not its feasibility.',
        },
      },
    ],
  },
  {
    id: 'potd-music-improvisation',
    title: 'Made and Found',
    discipline: 'Music Criticism',
    body: [
      'It is tempting to rank the composer above the improviser. The composer, we suppose, deliberates, revises, and commands the whole, while the improviser merely reacts, taking what the moment offers and hoping it holds together. On this view improvisation is composition\u2019s hurried cousin, admirable chiefly for the difficulty of doing quickly what would be done better slowly.',
      'The ranking mistakes a difference in kind for a difference in quality. The improviser is not a composer denied a desk. He works in a medium the composer never enters: real time, shared with an audience and often with other players, where a choice once made cannot be unmade and the next choice must answer it. What is lost \u2014 the power to revise \u2014 is the condition of what is gained: a line of thought we hear being formed, its risks and recoveries audible, the mind at work rather than its polished result.',
      'This is not to reverse the hierarchy and crown the improviser instead. The point is that each practice buys its virtues with the other\u2019s. The composer purchases perfection at the price of the living moment; the improviser purchases presence at the price of permanence. To ask which is superior is like asking whether a photograph is better than a portrait \u2014 a question that dissolves the moment one notices they were never trying to do the same thing.',
    ],
    questions: [
      {
        id: 'potd-music-improvisation-q1',
        stem: 'The main idea of the passage is that:',
        choices: [
          { id: 'A', text: 'improvisation is a hurried and ultimately inferior form of composition' },
          { id: 'B', text: 'improvisation is superior to composition because it is spontaneous' },
          {
            id: 'C',
            text: 'improvisation and composition secure different virtues at each other\u2019s cost and should not be ranked against each other',
          },
          { id: 'D', text: 'the composer and the improviser are pursuing the very same goal by different means' },
        ],
        correctChoiceId: 'C',
        rationale:
          'The passage rejects both the ranking that favors the composer and its reversal, concluding that "each practice buys its virtues with the other\u2019s," so the two should not be compared on a single scale.',
        choiceRationales: {
          A: 'This is the view the author sets up in order to reject in paragraph two.',
          B: 'The author explicitly declines "to reverse the hierarchy and crown the improviser instead."',
          C: 'Correct: different virtues bought at different costs \u2014 not a ranking but a difference in kind.',
          D: 'The photograph/portrait analogy shows they "were never trying to do the same thing."',
        },
      },
      {
        id: 'potd-music-improvisation-q2',
        stem: 'The comparison between a "photograph" and a "portrait" is meant to illustrate that:',
        choices: [
          { id: 'A', text: 'one of the two art forms is clearly more demanding than the other' },
          { id: 'B', text: 'judging the two practices by a single standard misunderstands them' },
          { id: 'C', text: 'improvisation, unlike composition, cannot be recorded or preserved' },
          { id: 'D', text: 'technological media are always inferior to handmade ones' },
        ],
        correctChoiceId: 'B',
        rationale:
          'The analogy dissolves the "which is superior" question by noting the two forms "were never trying to do the same thing" \u2014 so a single yardstick is the wrong tool.',
        choiceRationales: {
          A: 'The point is the incommensurability of the two, not that one is harder than the other.',
          B: 'Correct: comparing them on one standard misses that they aim at different things.',
          C: 'Recording is not the issue; the analogy concerns how the two practices differ in aim.',
          D: 'The passage draws no general verdict about technology versus handwork.',
        },
      },
    ],
  },
  {
    id: 'potd-translation-fidelity',
    title: 'The Translator\u2019s Bind',
    discipline: 'Translation Studies',
    body: [
      'Every translator serves two masters who rarely agree. One is the original \u2014 its exact words, its rhythms, the shape of its thought in a language that arranges thought differently. The other is the reader, who has come for something he can actually read, not a word-for-word transcript that preserves the letter of the source by sacrificing its life. Fidelity and fluency pull in opposite directions, and no translation escapes the tension by pretending it does not exist.',
      'A translation that leans entirely toward the source can be strictly accurate and practically unreadable \u2014 every idiom rendered literally, every foreign construction preserved, the result a kind of learned nonsense faithful to nothing that matters. A translation that leans entirely toward the reader can be a pleasure and a betrayal \u2014 smooth, idiomatic, and quietly substituting the translator\u2019s sensibility for the author\u2019s. The first forgets that a text is meant to be read; the second forgets whose text it is.',
      'The good translator does not resolve the tension so much as manage it, case by case, deciding here to keep a strangeness because it carries meaning and there to smooth one away because it carries only friction. What cannot be had is a rule that decides in advance. The demand for one \u2014 for a single principle that would make the translator\u2019s judgment unnecessary \u2014 is really a wish to be spared the labor that translation is.',
    ],
    questions: [
      {
        id: 'potd-translation-fidelity-q1',
        stem: 'Which statement best expresses the main idea of the passage?',
        choices: [
          { id: 'A', text: 'Strictly accurate translations are, without exception, unreadable.' },
          {
            id: 'B',
            text: 'Translation requires managing an unavoidable tension between fidelity and readability through case-by-case judgment.',
          },
          { id: 'C', text: 'Translators should consistently favor the reader over the original text.' },
          { id: 'D', text: 'A single governing rule can be found to guide every act of translation.' },
        ],
        correctChoiceId: 'B',
        rationale:
          'The passage frames fidelity and fluency as competing demands that cannot be jointly maximized, resolved only by the translator\u2019s judgment "case by case."',
        choiceRationales: {
          A: 'The passage describes this only as the extreme of leaning "entirely toward the source," not a rule about all accurate translation.',
          B: 'Correct: an unavoidable tension, managed by judgment rather than by any fixed formula.',
          C: 'Leaning entirely toward the reader is called "a betrayal," so the author does not endorse it.',
          D: 'The author states plainly that no rule can decide the matter in advance.',
        },
      },
      {
        id: 'potd-translation-fidelity-q2',
        stem: 'The author characterizes the wish for "a single principle that would make the translator\u2019s judgment unnecessary" as:',
        choices: [
          { id: 'A', text: 'a reasonable aim that translators ought to pursue' },
          { id: 'B', text: 'an evasion of the effort that translation actually demands' },
          { id: 'C', text: 'the very method employed by the most skilled translators' },
          { id: 'D', text: 'a reliable way to achieve fidelity and fluency simultaneously' },
        ],
        correctChoiceId: 'B',
        rationale:
          'The final sentence calls that wish "really a wish to be spared the labor that translation is" \u2014 an attempt to avoid the judgment the work requires.',
        choiceRationales: {
          A: 'The author treats the wish as an evasion, not a goal worth pursuing.',
          B: 'Correct: it is a wish to escape the labor and judgment translation demands.',
          C: 'Skilled translators are said to exercise judgment case by case \u2014 the opposite of a judgment-free rule.',
          D: 'The passage denies that any single rule can secure both aims at once.',
        },
      },
    ],
  },
  {
    id: 'potd-econ-rational-choice',
    title: 'The Useful Fiction',
    discipline: 'Economics',
    body: [
      'Much of economics is built on a figure who does not exist: a chooser who knows his preferences, ranks his options, and selects the one that serves him best. No one has met this person. We are inconsistent, we are swayed, we want incompatible things and change our minds about which. The premise is plainly false \u2014 and economics has been remarkably productive all the same. The puzzle is why a false premise should work so well.',
      'The defense usually offered is that the model need not be true, only useful: it predicts, and prediction is the test. A map that marked every tree would be no map at all; abstraction is not a flaw but the point. As long as people behave, on average and in the aggregate, roughly as if they were the calculating figure, the fiction earns its keep whether or not any individual fits it.',
      'The defense is sound within limits and dangerous past them. It licenses the model where the "as if" holds \u2014 competitive markets for ordinary goods, perhaps \u2014 and quietly extends it where it may not, to decisions made under fear, addiction, or deep uncertainty, where treating people as if they calculated can mislead precisely because it flatters them. The discipline\u2019s recurring error is not that it uses an unrealistic model but that it forgets, at the edges, that the model was only ever a convenience.',
    ],
    questions: [
      {
        id: 'potd-econ-rational-choice-q1',
        stem: 'The main idea of the passage is that the rational-chooser model:',
        choices: [
          { id: 'A', text: 'should be discarded by economists because its central premise is false' },
          {
            id: 'B',
            text: 'is a useful abstraction whose danger lies in applying it where its "as if" no longer holds',
          },
          { id: 'C', text: 'gives an accurate description of how individuals actually make decisions' },
          { id: 'D', text: 'shows that a model must be literally true in order to be useful' },
        ],
        correctChoiceId: 'B',
        rationale:
          'The passage grants the model\u2019s productivity as an abstraction but warns that its defense is "dangerous past" its limits, when the "as if" is extended to cases it does not fit.',
        choiceRationales: {
          A: 'The author calls the model "remarkably productive," so wholesale discarding is not the recommendation.',
          B: 'Correct: useful where the "as if" holds, misleading where it is stretched beyond that.',
          C: 'The author insists the model\u2019s chooser "does not exist," so it is not an accurate description.',
          D: 'The passage argues the reverse \u2014 a false premise can still be useful.',
        },
      },
      {
        id: 'potd-econ-rational-choice-q2',
        stem: 'Based on the passage, the author would be most wary of applying the rational-choice model to:',
        choices: [
          { id: 'A', text: 'purchases of ordinary goods in a competitive market' },
          { id: 'B', text: 'decisions made under addiction or deep uncertainty' },
          { id: 'C', text: 'any analysis that relies on aggregate averages' },
          { id: 'D', text: 'predictions that are tested against actual behavior' },
        ],
        correctChoiceId: 'B',
        rationale:
          'Paragraph three names "fear, addiction, or deep uncertainty" as the cases where treating people as calculators "can mislead," so those are where the author is most cautious.',
        choiceRationales: {
          A: 'Competitive markets for ordinary goods are offered as where the "as if" plausibly holds.',
          B: 'Correct: these are the edge cases the author flags as where the model may not fit.',
          C: 'Aggregation is part of the model\u2019s defense, not a case the author warns against.',
          D: 'Testing against behavior is the standard the author accepts, not a misuse.',
        },
      },
    ],
  },
  {
    id: 'potd-memory-oral-history',
    title: 'The Witness and the Record',
    discipline: 'Oral History',
    body: [
      'Historians long treated memory as evidence\u2019s poor relation. Documents were the gold standard \u2014 dated, fixed, indifferent to how anyone felt about them \u2014 while the recollections of those who were present were suspect, softened by time and shaped by the desire to have been braver, wiser, or more central than one was. Where a memory contradicted a document, the document won.',
      'Oral historians proposed a subtler view. A recollection can be factually wrong and historically valuable at once, because it records something a document rarely does: the meaning an event carried for the person who lived it. That a veteran misremembers the date of a battle tells us little; that he remembers it as the moment everything changed tells us how the war lodged in a life. The "error" is data of a different kind, evidence not of what happened but of what it came to mean.',
      'This does not make memory infallible or documents dispensable; it makes them answer different questions. To use a recollection as if it were a police report is to miss its value and court its unreliability at the same time. The skilled practitioner reads a testimony twice \u2014 once for the facts it may get wrong, and once for the significance it almost never does \u2014 and keeps the two readings from being confused.',
    ],
    questions: [
      {
        id: 'potd-memory-oral-history-q1',
        stem: 'The passage is primarily concerned with arguing that recollections:',
        choices: [
          { id: 'A', text: 'are, on the whole, a more reliable source than written documents' },
          {
            id: 'B',
            text: 'though sometimes factually wrong, are valuable evidence of what events meant to those who lived them',
          },
          { id: 'C', text: 'should give way to documents whenever the two conflict' },
          { id: 'D', text: 'are rendered useless to historians by their factual errors' },
        ],
        correctChoiceId: 'B',
        rationale:
          'The passage\u2019s core claim is that a recollection "can be factually wrong and historically valuable at once," because it preserves the meaning an event held for the person who lived it.',
        choiceRationales: {
          A: 'The author denies memory is simply more reliable; it "answers different questions" than documents.',
          B: 'Correct: factual error notwithstanding, testimony records meaning, which is its distinctive value.',
          C: 'That is the older view ("the document won") the passage sets out to complicate.',
          D: 'The author reframes the "error" as data of another kind, not as something that voids the testimony.',
        },
      },
      {
        id: 'potd-memory-oral-history-q2',
        stem: 'The author recommends reading a testimony "twice" in order to:',
        choices: [
          { id: 'A', text: 'verify each of its facts against an independent document' },
          {
            id: 'B',
            text: 'separate what the recollection may get wrong from the meaning it reliably records',
          },
          { id: 'C', text: 'show that memory and documents answer the same underlying question' },
          { id: 'D', text: 'prove that recollections are generally accurate about details such as dates' },
        ],
        correctChoiceId: 'B',
        rationale:
          'The two readings are "once for the facts it may get wrong, and once for the significance it almost never does," keeping the fallible facts and the reliable meaning distinct.',
        choiceRationales: {
          A: 'Cross-checking every fact treats testimony "as if it were a police report," which the author warns against.',
          B: 'Correct: one reading for possibly mistaken facts, one for the meaning testimony records reliably.',
          C: 'The author says memory and documents "answer different questions," not the same one.',
          D: 'The example of the misremembered date shows the author does not claim reliability about such details.',
        },
      },
    ],
  },
];
