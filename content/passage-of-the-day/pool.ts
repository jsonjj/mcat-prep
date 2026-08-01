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
 * any consumer's config and, sitting at the top-level `content/` dir (outside any
 * package), never needs to resolve a workspace module. Its shapes MIRROR the
 * canonical Zod contract in `@mcat/contracts` (`PassageOfTheDayEntry` etc.); the
 * DB-first loader assigns this pool to the contract type, so a drift between the
 * two is a compile error there.
 */

/** A–D. */
type PassageChoiceId = 'A' | 'B' | 'C' | 'D';
/** The coarse AAMC content grouping (mirrors contracts PassageThemeSchema). */
type PassageTheme = 'humanities' | 'social_science';
/** The three AAMC CARS skills (mirrors contracts CarsSkillSchema). */
type CarsSkill = 'FOC' | 'RWT' | 'RBT';

/** Mirrors `@mcat/contracts` PassageChoice — the option itself carries the key. */
interface PassageChoice {
  id: PassageChoiceId;
  text: string;
  correct: boolean;
  misconception: string | null;
  rationale: string;
}

/** Mirrors `@mcat/contracts` PassageQuestion (mutable arrays for structural parity). */
interface PassageQuestion {
  id: string;
  stem: string;
  choices: PassageChoice[];
  explanation: string;
  carsSkill: CarsSkill;
  dok: number;
}

/** Mirrors `@mcat/contracts` PassageOfTheDayEntry. */
interface PassageOfTheDayEntry {
  id: string;
  slug: string;
  title: string;
  discipline: string;
  theme: PassageTheme;
  body: string[];
  source?: string;
  attribution?: string;
  questions: PassageQuestion[];
}

/**
 * The raw entries below carry the passage text plus a COMPACT answer key: each
 * question lists its four `{ id, text }` options, the `correctChoiceId`, the
 * question-level `rationale` (which becomes the canonical `explanation`), and a
 * `choiceRationales` map (why each option is right/wrong). The CARS labels
 * (`theme`, per-question `carsSkill`/`dok`) and the per-choice `correct` /
 * `misconception` fields are layered on deterministically by
 * `hardcodedPassagePool()` — see PASSAGE_THEMES / SKILL_ROTATION / MISCONCEPTIONS —
 * so the ~1,400 lines of vetted prose below stay untouched by the shape change.
 */
interface RawPassageChoice {
  id: PassageChoiceId;
  text: string;
}
interface RawPassageQuestion {
  id: string;
  stem: string;
  choices: RawPassageChoice[];
  correctChoiceId: PassageChoiceId;
  rationale: string;
  choiceRationales: Record<PassageChoiceId, string>;
}
type RawPassageEntry = Omit<
  PassageOfTheDayEntry,
  'slug' | 'theme' | 'source' | 'attribution' | 'questions'
> & { questions: RawPassageQuestion[] };

/**
 * The pool — the hardcoded content source. Rotation cycles through it in array
 * order (see the server module), so the order here is the order learners meet
 * the passages. Keep entries roughly even in difficulty; add to the end rather
 * than reordering, so a given day does not silently change passages for everyone.
 *
 * Deliberately NOT exported: every reader goes through `hardcodedPassagePool()`
 * below (and, above it, the DB-first async loader in the server).
 */
const PASSAGE_OF_THE_DAY_POOL: readonly RawPassageEntry[] = [
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
          {
            id: 'C',
            text: 'obscurity in art is generally a sign of the creator\u2019s carelessness',
          },
          {
            id: 'D',
            text: 'demanding works are usually recognized as indispensable by later critics',
          },
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
      {
        id: 'potd-aesthetics-difficulty-q3',
        stem: 'The example of a "poem about the limits of understanding that could be understood at a glance" is used to illustrate:',
        choices: [
          { id: 'A', text: 'accidental difficulty, which rewards no effort' },
          { id: 'B', text: 'difficulty that is inseparable from a work’s meaning' },
          { id: 'C', text: 'a critic who praises obscurity for its own sake' },
          { id: 'D', text: 'the easy pleasure that a familiar scene provides' },
        ],
        correctChoiceId: 'B',
        rationale:
          'The poem is the author’s case of "constitutive" difficulty: a work about the limits of understanding that was instantly clear "would refute itself," because removing the difficulty would remove its meaning.',
        choiceRationales: {
          A: 'Accidental difficulty "rewards no effort because there is nothing behind it"; this example has meaning behind it.',
          B: 'Correct: the difficulty cannot be removed without removing the very experience the work exists to produce.',
          C: 'The example concerns a kind of difficulty, not a type of reader or critic.',
          D: 'The example is precisely not about easy or familiar pleasure.',
        },
      },
      {
        id: 'potd-aesthetics-difficulty-q4',
        stem: 'According to the passage, the two errors a reader may make share which underlying premise?',
        choices: [
          { id: 'A', text: 'that difficulty always springs from the artist’s carelessness' },
          { id: 'B', text: 'that difficulty is a single thing, to be either avoided or admired' },
          { id: 'C', text: 'that pleasure is the only legitimate purpose of art' },
          { id: 'D', text: 'that demanding works are always vindicated by later critics' },
        ],
        correctChoiceId: 'B',
        rationale:
          'The passage states the two errors "share a premise: that difficulty is a single thing, to be either avoided or admired."',
        choiceRationales: {
          A: 'Carelessness describes only accidental difficulty, not the premise common to both errors.',
          B: 'Correct: both errors treat difficulty as one undifferentiated thing.',
          C: 'The easy-pleasure view is the opening position the author rejects, not the shared premise.',
          D: 'This is an observation about the history of criticism, not the premise the errors share.',
        },
      },
      {
        id: 'potd-aesthetics-difficulty-q5',
        stem: 'The author calls the critic’s task "harder and less comfortable" than the two errors because it requires:',
        choices: [
          { id: 'A', text: 'rejecting every work that cannot be grasped at once' },
          {
            id: 'B',
            text: 'judging each work by whether its difficulty is repaid, rather than applying one rule',
          },
          { id: 'C', text: 'treating unintelligibility as a reliable sign of depth' },
          { id: 'D', text: 'giving up the attempt to evaluate art at all' },
        ],
        correctChoiceId: 'B',
        rationale:
          'Unlike the two errors, which apply a single attitude to all difficulty, the critic must ask "in each case" whether the effort a work demands is repaid by what it discloses.',
        choiceRationales: {
          A: 'Rejecting all demanding works is one of the errors the author criticizes.',
          B: 'Correct: the discomfort lies in forgoing a blanket rule for a case-by-case judgment.',
          C: 'Prizing unintelligibility is the second error, not the disciplined task.',
          D: 'The task is a form of evaluation, not its abandonment.',
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
          {
            id: 'C',
            text: 'introduce the microhistorians\u2019 reframing of what a single case is meant to do',
          },
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
          {
            id: 'A',
            text: 'is inherently more accurate than any single household\u2019s testimony',
          },
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
      {
        id: 'potd-history-microhistory-q3',
        stem: 'The phrase "epistemological rather than metaphysical" indicates that the microhistorians’ wager concerned:',
        choices: [
          { id: 'A', text: 'whether large historical forces exist at all' },
          { id: 'B', text: 'what a change of scale allows a historian to know, not what exists' },
          { id: 'C', text: 'whether individual lives are worth recording' },
          { id: 'D', text: 'which century first produced serious history' },
        ],
        correctChoiceId: 'B',
        rationale:
          'The wager is glossed as "epistemological rather than metaphysical," and the passage adds that they "did not deny that large forces exist" — the claim is about knowledge (what a smaller scale reveals), not existence.',
        choiceRationales: {
          A: 'That would be the metaphysical claim they explicitly avoided; they "did not deny that large forces exist."',
          B: 'Correct: the wager is about what reducing the scale lets a historian see and know.',
          C: 'The passage never doubts that individual lives are worth recording; that is not the wager.',
          D: 'The chronology of the discipline is not what the phrase refers to.',
        },
      },
      {
        id: 'potd-history-microhistory-q4',
        stem: 'The passage as a whole is best described as:',
        choices: [
          { id: 'A', text: 'tracing the twentieth-century decline of large-scale history' },
          {
            id: 'B',
            text: 'presenting microhistory’s rationale and its reply to the charge of unrepresentativeness',
          },
          { id: 'C', text: 'proving that averages always conceal more than they reveal' },
          { id: 'D', text: 'arguing that only richly documented cases deserve study' },
        ],
        correctChoiceId: 'B',
        rationale:
          'The passage introduces microhistory, states its epistemological wager, raises the representativeness objection, and gives the microhistorians’ reply — an exposition and defense.',
        choiceRationales: {
          A: 'Large-scale history is the backdrop, not the subject; its "decline" is never asserted.',
          B: 'Correct: the passage lays out the rationale and answers the objection about atypical cases.',
          C: 'The average’s concealment is one supporting point, not the passage’s overall aim.',
          D: 'The author values well-chosen cases as tests, not as the only worthwhile objects of study.',
        },
      },
      {
        id: 'potd-history-microhistory-q5',
        stem: 'Based on the microhistorians’ reply, a single case succeeds when it:',
        choices: [
          { id: 'A', text: 'proves statistically representative of the wider population' },
          {
            id: 'B',
            text: 'tests whether a general explanation survives contact with a particular life',
          },
          { id: 'C', text: 'avoids any reference to large-scale generalizations' },
          { id: 'D', text: 'is chosen precisely because it is ordinary and thinly documented' },
        ],
        correctChoiceId: 'B',
        rationale:
          'The reply redefines a case as one that "tests whether our general explanations can survive contact with a life actually lived," not as a representative sample.',
        choiceRationales: {
          A: 'The reply explicitly gives up the claim that the chosen case is typical or representative.',
          B: 'Correct: a case earns its worth by testing general explanations against an actual life.',
          C: 'A case is meant to test general explanations, so it engages them rather than avoiding them.',
          D: 'A case is valued for what it can test, not for being ordinary or poorly documented.',
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
          {
            id: 'A',
            text: 'An anomaly should always be treated as a decisive refutation of a theory.',
          },
          {
            id: 'B',
            text: 'Whether an anomaly refutes a theory cannot be settled by logic alone and must be judged by later predictions.',
          },
          {
            id: 'C',
            text: 'Blaming auxiliary assumptions to protect a theory is always an illegitimate maneuver.',
          },
          {
            id: 'D',
            text: 'Theories are confirmed only by the steady accumulation of favorable evidence.',
          },
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
          {
            id: 'A',
            text: 'Setting an anomaly aside while re-checking whether an instrument was calibrated',
          },
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
      {
        id: 'potd-philsci-anomalies-q3',
        stem: 'The author mentions calibration, sample purity, and unnoticed factors primarily in order to:',
        choices: [
          { id: 'A', text: 'list the standard steps of a rigorous experiment' },
          { id: 'B', text: 'explain why a failed prediction cannot, by itself, locate the fault' },
          { id: 'C', text: 'prove that instruments are usually miscalibrated' },
          { id: 'D', text: 'argue that auxiliary assumptions are never worth checking' },
        ],
        correctChoiceId: 'B',
        rationale:
          'These auxiliaries are introduced because "no theory confronts the world alone"; when a prediction fails, "logic alone cannot say whether the fault lies in the theory or in one of these assumptions."',
        choiceRationales: {
          A: 'They are offered not as a procedure but as sources of possible error besides the theory.',
          B: 'Correct: the fault may lie in an assumption rather than the theory, so failure is not decisive.',
          C: 'The author says these assumptions may fail, not that they usually do.',
          D: 'The passage treats checking auxiliaries as legitimate inquiry, the opposite of never worth it.',
        },
      },
      {
        id: 'potd-philsci-anomalies-q4',
        stem: 'The phrase "an occasion for inquiry, not an automatic verdict" most nearly means that a discrepancy should:',
        choices: [
          { id: 'A', text: 'prove the theory false the moment it appears' },
          { id: 'B', text: 'prompt investigation rather than an automatic rejection' },
          { id: 'C', text: 'be ignored by working scientists forever' },
          { id: 'D', text: 'confirm the theory’s central assumptions' },
        ],
        correctChoiceId: 'B',
        rationale:
          'The phrase contrasts investigating where a discrepancy comes from with treating it as an immediate refutation of the theory.',
        choiceRationales: {
          A: 'An "automatic verdict" is exactly what the author denies a discrepancy delivers.',
          B: 'Correct: it calls for inquiry into where the fault lies, not a snap rejection.',
          C: 'The author warns against tolerating anomalies "forever," so indefinite ignoring is not endorsed.',
          D: 'A discrepancy is a problem to investigate, not a confirmation of assumptions.',
        },
      },
      {
        id: 'potd-philsci-anomalies-q5',
        stem: 'The author’s view of the freedom to set anomalies aside is best described as holding that it is:',
        choices: [
          { id: 'A', text: 'always illegitimate, since anomalies must be decisive' },
          {
            id: 'B',
            text: 'legitimate until it permanently shields a theory from any new test',
          },
          { id: 'C', text: 'harmless, because a theory may be protected indefinitely' },
          { id: 'D', text: 'irrelevant, because auxiliary assumptions never fail' },
        ],
        correctChoiceId: 'B',
        rationale:
          'The latitude is "easily abused" yet "often" right; it fails only when a theory is "kept alive long past its usefulness" by never risking a prediction that could come true or not.',
        choiceRationales: {
          A: 'The author says scientists are "often right" to set anomalies aside, so it is not always illegitimate.',
          B: 'Correct: the freedom is legitimate until it becomes a way to avoid ever paying in predictions.',
          C: 'Indefinite protection is precisely the abuse the author condemns, not a harmless option.',
          D: 'The whole argument rests on auxiliaries sometimes being the true source of a failure.',
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
          {
            id: 'D',
            text: 'insistence that the author\u2019s intention is the sole authority over meaning',
          },
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
      {
        id: 'potd-litcrit-author-q3',
        stem: 'The author’s appeal to how "we treat the sentences of others" in ordinary life functions to:',
        choices: [
          { id: 'A', text: 'concede that authorial intention is finally unknowable' },
          { id: 'B', text: 'support the claim that intention remains relevant to meaning' },
          { id: 'C', text: 'prove that readers always recover an author’s exact intention' },
          { id: 'D', text: 'show that everyday speech has no bearing on literary texts' },
        ],
        correctChoiceId: 'B',
        rationale:
          'The author notes that we "treat them as the acts of persons trying to say something, and we are usually right to" — everyday practice offered as evidence that intention still matters.',
        choiceRationales: {
          A: 'The example argues that intention matters, not that it is unknowable.',
          B: 'Correct: ordinary interpretation shows we rightly treat utterances as intended acts.',
          C: '"Usually right" is a modest claim, not a guarantee of recovering exact intention.',
          D: 'The author draws on ordinary speech precisely because it does bear on how we read.',
        },
      },
      {
        id: 'potd-litcrit-author-q4',
        stem: 'The distinction the author says the "strong view erases" is the one between:',
        choices: [
          { id: 'A', text: 'what a competent reader and an incompetent reader notice' },
          { id: 'B', text: 'what a text can be made to mean and what it was meant to mean' },
          { id: 'C', text: 'classroom opinion and genuine scholarship' },
          { id: 'D', text: 'a poem’s words and its punctuation' },
        ],
        correctChoiceId: 'B',
        rationale:
          'The closing sentence names this exact distinction — "between what a text can be made to mean and what it was meant to mean" — as what honesty requires and the strong view erases.',
        choiceRationales: {
          A: 'Competence is not the axis of the distinction the author draws.',
          B: 'Correct: this is precisely the distinction the passage says the strong view erases.',
          C: 'The author does not frame the issue as classroom opinion versus scholarship.',
          D: 'The distinction concerns meaning and intention, not textual mechanics.',
        },
      },
      {
        id: 'potd-litcrit-author-q5',
        stem: 'On the author’s view, a reader who finds in a poem an implication its author would have disowned has:',
        choices: [
          { id: 'A', text: 'proven that the author is the sole authority over meaning' },
          {
            id: 'B',
            text: 'discovered something the words permit though the writer did not intend it',
          },
          { id: 'C', text: 'shown that the author’s intention fully determines the text' },
          { id: 'D', text: 'demonstrated that intention and meaning are identical' },
        ],
        correctChoiceId: 'B',
        rationale:
          'The author offers exactly this middle description: the reader "has found something the words permit but the writer did not intend — a discovery about the text, honestly reported."',
        choiceRationales: {
          A: 'The author rejects "the author is the sole authority" as one of the extremes to avoid.',
          B: 'Correct: it is a discovery the words allow, unintended by the writer and not a decreed meaning.',
          C: 'If intention fully determined the text, no unintended-but-permitted reading could exist.',
          D: 'The example depends on meaning and intention coming apart, not being identical.',
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
          {
            id: 'A',
            text: 'is best justified, like all democracy, by the peaceful counting of votes',
          },
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
      {
        id: 'potd-poli-deliberation-q3',
        stem: 'The skeptics’ objection in the third paragraph is that deliberation:',
        choices: [
          { id: 'A', text: 'always produces decisions defensible to everyone' },
          { id: 'B', text: 'can reproduce power imbalances behind an appearance of reason' },
          { id: 'C', text: 'relies too heavily on the counting of votes' },
          { id: 'D', text: 'eliminates the need for reasons altogether' },
        ],
        correctChoiceId: 'B',
        rationale:
          'Skeptics note that talk is "not evenly distributed," so "a forum meant to neutralize power may quietly reproduce it under the appearance of reason."',
        choiceRationales: {
          A: 'That is the deliberative hope the skeptics are challenging, not their objection.',
          B: 'Correct: unequal capacity to speak lets power persist under a veneer of reasoned discussion.',
          C: 'Vote-counting is the rival tradition, not the target of the skeptics’ worry here.',
          D: 'Deliberation centers on reasons; the skeptics question its fairness, not its use of reasons.',
        },
      },
      {
        id: 'potd-poli-deliberation-q4',
        stem: 'The deliberative theorist’s reply to the skeptics is to:',
        choices: [
          { id: 'A', text: 'deny that talk is ever unequally distributed' },
          {
            id: 'B',
            text: 'grant the worry and recast the promise as conditional on equal standing',
          },
          { id: 'C', text: 'abandon deliberation in favor of majority voting' },
          { id: 'D', text: 'claim the objection shows deliberation is worthless' },
        ],
        correctChoiceId: 'B',
        rationale:
          'The theorist "cannot dismiss this worry, but can reframe it": the promise is "realized where the conditions of genuine equality among speakers are met, and betrayed wherever they are not."',
        choiceRationales: {
          A: 'The reply concedes rather than denies the inequality of talk.',
          B: 'Correct: the worry is granted and the promise made conditional on genuine equality.',
          C: 'The passage does not have the theorist retreat to majority voting.',
          D: 'The author explicitly says the objection is "not that deliberation is worthless."',
        },
      },
      {
        id: 'potd-poli-deliberation-q5',
        stem: 'The contrast between decisions "defensible to all" and those "merely satisfactory to most" highlights that deliberation aims at decisions:',
        choices: [
          { id: 'A', text: 'that please the greatest number of people' },
          {
            id: 'B',
            text: 'whose supporting reasons could be accepted by all, not merely preferred by a majority',
          },
          { id: 'C', text: 'reached fastest by the most fluent speakers' },
          { id: 'D', text: 'that avoid offering any reasons at all' },
        ],
        correctChoiceId: 'B',
        rationale:
          'The phrase distinguishes decisions "defensible to all" — justifiable by reasons others could accept — from those "merely satisfactory to most," which register mere majority preference.',
        choiceRationales: {
          A: '"Satisfactory to most" is exactly the numbers-based aim the contrast sets against deliberation.',
          B: 'Correct: the deliberative aim is justifiability to all, not mere majority preference.',
          C: 'Speed and fluency describe the skeptics’ worry, not deliberation’s aim.',
          D: 'Deliberation is defined by offering reasons, not by avoiding them.',
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
          {
            id: 'A',
            text: 'ethnographers should return to the confident voice of the classic account',
          },
          {
            id: 'B',
            text: 'reflection on the observer\u2019s role should replace description altogether',
          },
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
      {
        id: 'potd-anthro-ethnography-q3',
        stem: 'The sentence "I was among them, therefore I know" captures the classic ethnographer’s assumption that:',
        choices: [
          { id: 'A', text: 'firsthand presence alone guaranteed objective knowledge' },
          { id: 'B', text: 'informants always tell an outsider the truth' },
          { id: 'C', text: 'reflexivity is essential to a trustworthy account' },
          { id: 'D', text: 'no account of another culture can ever be trusted' },
        ],
        correctChoiceId: 'A',
        rationale:
          'The passage says "the authority of the account rested on presence," a confidence later "mistaken for the sound of objectivity itself."',
        choiceRationales: {
          A: 'Correct: the classic voice took being there as enough to know objectively.',
          B: 'The passage later notes informants shape what they tell a stranger — the opposite of this assumption.',
          C: 'Reflexivity is the later corrective, not the classic assumption expressed here.',
          D: 'The sentence expresses over-confidence, not blanket distrust of accounts.',
        },
      },
      {
        id: 'potd-anthro-ethnography-q4',
        stem: 'The author raises the danger of an ethnography that "dwells too long on the anthropologist’s doubts" in order to:',
        choices: [
          { id: 'A', text: 'recommend returning to the classic confident voice' },
          { id: 'B', text: 'temper the reflexive turn without abandoning it' },
          { id: 'C', text: 'prove that self-examination has no value' },
          { id: 'D', text: 'show that describing other cultures is impossible' },
        ],
        correctChoiceId: 'B',
        rationale:
          'The author endorses acknowledging the observer but warns it can go too far, arriving at a "disciplined modesty" — a qualification of reflexivity, not its rejection.',
        choiceRationales: {
          A: 'The confident voice is treated as the original error, not the remedy.',
          B: 'Correct: the danger is raised to bound reflexivity while keeping its honesty.',
          C: 'The author values honest self-account; only its excess is criticized.',
          D: 'The aim is honest description, not the claim that description is impossible.',
        },
      },
      {
        id: 'potd-anthro-ethnography-q5',
        stem: 'Describing the anthropologist as "one of its instruments" suggests that the observer should be treated as:',
        choices: [
          { id: 'A', text: 'the central character whose story the account tells' },
          { id: 'B', text: 'a condition shaping the knowledge that ought to be disclosed' },
          { id: 'C', text: 'an obstacle that makes real knowledge impossible' },
          { id: 'D', text: 'an invisible, perfectly neutral recorder' },
        ],
        correctChoiceId: 'B',
        rationale:
          'An instrument (not a "hero") is part of how the knowledge was produced, to be stated plainly rather than concealed or made the story’s subject.',
        choiceRationales: {
          A: '"Not as its hero" explicitly rejects making the anthropologist the central character.',
          B: 'Correct: an instrument is part of the knowledge-making apparatus, to be acknowledged openly.',
          C: 'The observer shapes the knowledge but does not make it impossible; honesty manages the effect.',
          D: 'The "invisible neutral recorder" is the pane-of-glass illusion the author rejects.',
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
          {
            id: 'C',
            text: 'moral responsibility requires that outcomes never influence our judgments',
          },
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
      {
        id: 'potd-ethics-moral-luck-q3',
        stem: 'The example of the two reckless drivers is used to:',
        choices: [
          { id: 'A', text: 'prove that reckless driving is morally acceptable' },
          {
            id: 'B',
            text: 'bring out the conflict between judging by control and judging by outcomes',
          },
          { id: 'C', text: 'show that luck plays no role in our moral judgments' },
          { id: 'D', text: 'establish that the two drivers deserve identical praise' },
        ],
        correctChoiceId: 'B',
        rationale:
          'The drivers are "identical in every respect they can govern," so the harsher judgment of the one who kills "tracks something neither of them chose" — staging the collision of the two beliefs.',
        choiceRationales: {
          A: 'The example assumes both are reckless; it is not a defense of recklessness.',
          B: 'Correct: equal control but different outcomes dramatizes the conflict between the two beliefs.',
          C: 'The example is designed to show that luck does seem to affect our judgments.',
          D: 'The point is that we judge them differently despite equal control, not that we judge them alike.',
        },
      },
      {
        id: 'potd-ethics-moral-luck-q4',
        stem: 'To say that luck "enters the moral ledger" means that:',
        choices: [
          { id: 'A', text: 'moral judgments ought to be recorded in writing' },
          { id: 'B', text: 'outcomes beyond a person’s control affect how blameworthy they seem' },
          { id: 'C', text: 'responsibility depends only on a person’s intentions' },
          { id: 'D', text: 'luck can be eliminated from moral life entirely' },
        ],
        correctChoiceId: 'B',
        rationale:
          'The "ledger" is a metaphor for what counts toward blame; letting luck in means uncontrolled outcomes change the verdict — "which the whole idea of responsibility seemed designed to keep out."',
        choiceRationales: {
          A: 'The ledger is a metaphor for moral accounting, not literal record-keeping.',
          B: 'Correct: luck in the ledger means uncontrolled factors move the needle on blame.',
          C: 'That describes the control condition, which admitting luck actually strains.',
          D: 'The passage treats luck as hard to keep out, not as something eliminable.',
        },
      },
      {
        id: 'potd-ethics-moral-luck-q5',
        stem: 'The author suggests the puzzle’s chief value is that it:',
        choices: [
          { id: 'A', text: 'supplies a clear rule for assigning blame' },
          {
            id: 'B',
            text: 'exposes a conflict among moral commitments we are unwilling to abandon',
          },
          { id: 'C', text: 'proves that outcomes are morally irrelevant' },
          { id: 'D', text: 'settles whether control is required for responsibility' },
        ],
        correctChoiceId: 'B',
        rationale:
          'The closing lines say the puzzle’s value "is less that it has a solution than that it shows how much of our moral thinking rests on commitments that pull in opposite directions."',
        choiceRationales: {
          A: 'The author denies a clean solution, so no tidy rule is offered.',
          B: 'Correct: its worth lies in exposing the tension between commitments we will not surrender.',
          C: 'The significance of outcomes is treated as a genuine intuition, not shown irrelevant.',
          D: 'The passage leaves the control question unresolved rather than settling it.',
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
          {
            id: 'C',
            text: 'increasing density has no meaningful effect on the value of urban land',
          },
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
      {
        id: 'potd-urban-walkability-q3',
        stem: 'The phrase "displacement wearing the costume of community" suggests that walkability pursued without a housing policy can:',
        choices: [
          { id: 'A', text: 'strengthen community by keeping longtime residents in place' },
          { id: 'B', text: 'push out residents even as it looks like community-building' },
          { id: 'C', text: 'eliminate the need for any housing policy' },
          { id: 'D', text: 'lower land values across the district' },
        ],
        correctChoiceId: 'B',
        rationale:
          'The metaphor warns that displacement can disguise itself as community — the desirable, "lively" district that in fact prices out the people who made it.',
        choiceRationales: {
          A: 'The passage says the longtime tenant is "priced out," the opposite of being kept in place.',
          B: 'Correct: the "costume of community" hides displacement beneath an appealing surface.',
          C: 'The author argues walkability needs a matching housing policy, not that it removes the need.',
          D: 'Density "makes land valuable," so values rise rather than fall.',
        },
      },
      {
        id: 'potd-urban-walkability-q4',
        stem: 'The corner store that "pays the rent of the district it advertises" is used to illustrate how:',
        choices: [
          { id: 'A', text: 'small businesses are exempt from rising rents' },
          {
            id: 'B',
            text: 'a place’s new desirability can price out the very things that made it desirable',
          },
          { id: 'C', text: 'advertising is the main cause of displacement' },
          { id: 'D', text: 'walkability has no effect on local businesses' },
        ],
        correctChoiceId: 'B',
        rationale:
          'The store "pays the rent of the district it advertises": its success raises the rents that then displace it, embodying walkability’s self-undermining cost.',
        choiceRationales: {
          A: 'The example shows the store subject to rising rents, not exempt from them.',
          B: 'Correct: the desirability the store helps create raises rents that price it (and tenants) out.',
          C: 'Advertising is a figure of speech here; the cause is rising land value, not marketing.',
          D: 'The example exists precisely to show a strong effect on local businesses.',
        },
      },
      {
        id: 'potd-urban-walkability-q5',
        stem: 'The author would most likely agree that walkable design is:',
        choices: [
          { id: 'A', text: 'best abandoned, because it always harms communities' },
          { id: 'B', text: 'worthwhile yet insufficient on its own to protect a community' },
          { id: 'C', text: 'a complete social program in its own right' },
          { id: 'D', text: 'less important than the physical engineering of streets' },
        ],
        correctChoiceId: 'B',
        rationale:
          '"None of this is an argument against walkable cities; it is an argument against treating a design pattern as if it were a social program" — good, but not sufficient by itself.',
        choiceRationales: {
          A: 'The author states plainly that this is "not an argument against walkable cities."',
          B: 'Correct: walkability is desirable but must be paired with housing policy to protect residents.',
          C: 'The core warning is precisely against mistaking a design pattern for a social program.',
          D: 'The street/neighborhood contrast raises the human stakes; it does not rank engineering above them.',
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
          {
            id: 'A',
            text: 'improvisation is a hurried and ultimately inferior form of composition',
          },
          { id: 'B', text: 'improvisation is superior to composition because it is spontaneous' },
          {
            id: 'C',
            text: 'improvisation and composition secure different virtues at each other\u2019s cost and should not be ranked against each other',
          },
          {
            id: 'D',
            text: 'the composer and the improviser are pursuing the very same goal by different means',
          },
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
      {
        id: 'potd-music-improvisation-q3',
        stem: 'The remark that the improviser "is not a composer denied a desk" means that improvisation is:',
        choices: [
          { id: 'A', text: 'composition carried out under an unfortunate handicap' },
          { id: 'B', text: 'a different kind of practice rather than deficient composition' },
          { id: 'C', text: 'always superior to written composition' },
          { id: 'D', text: 'an activity requiring no skill a composer would recognize' },
        ],
        correctChoiceId: 'B',
        rationale:
          '"Not a composer denied a desk" rejects seeing the improviser as a hampered composer; the point is a "difference in kind," a distinct medium of real time.',
        choiceRationales: {
          A: 'This is precisely the "hurried cousin" view the sentence is written to deny.',
          B: 'Correct: the improviser works in a different medium, not a diminished version of composition.',
          C: 'The author explicitly declines to crown the improviser superior.',
          D: 'The passage credits the improviser with real, audible skill; it does not deny craft.',
        },
      },
      {
        id: 'potd-music-improvisation-q4',
        stem: 'According to the passage, the improviser’s inability to revise makes possible:',
        choices: [
          { id: 'A', text: 'a flawless, fully polished final product' },
          { id: 'B', text: 'a line of thought heard taking shape, with its risks audible' },
          { id: 'C', text: 'complete independence from any audience' },
          { id: 'D', text: 'the elimination of all risk from performance' },
        ],
        correctChoiceId: 'B',
        rationale:
          '"What is lost — the power to revise — is the condition of what is gained: a line of thought we hear being formed, its risks and recoveries audible."',
        choiceRationales: {
          A: 'Polished perfection is the composer’s gain, bought at the price of the living moment.',
          B: 'Correct: forgoing revision is what lets us hear thought being formed, risks and all.',
          C: 'The improviser works in real time "shared with an audience," not independent of it.',
          D: 'Risk is precisely what becomes audible; it is not eliminated.',
        },
      },
      {
        id: 'potd-music-improvisation-q5',
        stem: 'The author’s overall purpose is to:',
        choices: [
          { id: 'A', text: 'defend the traditional ranking of composer over improviser' },
          { id: 'B', text: 'replace a ranking by quality with an account of a difference in kind' },
          { id: 'C', text: 'rank the improviser above the composer' },
          { id: 'D', text: 'argue that both practices pursue an identical goal' },
        ],
        correctChoiceId: 'B',
        rationale:
          'The passage rejects both the original ranking and its reversal, concluding that the two "were never trying to do the same thing" — a difference in kind, not degree.',
        choiceRationales: {
          A: 'The author sets up that ranking specifically to dismantle it.',
          B: 'Correct: the essay trades a quality ranking for a difference in kind and aim.',
          C: 'The author explicitly refuses to crown the improviser instead.',
          D: 'The photograph/portrait analogy denies that they pursue the same goal.',
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
          {
            id: 'C',
            text: 'Translators should consistently favor the reader over the original text.',
          },
          {
            id: 'D',
            text: 'A single governing rule can be found to guide every act of translation.',
          },
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
      {
        id: 'potd-translation-fidelity-q3',
        stem: 'The "two masters who rarely agree" that a translator serves are:',
        choices: [
          { id: 'A', text: 'the author and the publisher' },
          { id: 'B', text: 'the source text and the reader' },
          { id: 'C', text: 'accuracy and profit' },
          { id: 'D', text: 'the past and the future' },
        ],
        correctChoiceId: 'B',
        rationale:
          'The passage names them directly: "One is the original... The other is the reader," whose demands (fidelity and fluency) pull in opposite directions.',
        choiceRationales: {
          A: 'The publisher is never mentioned; the demands are the text’s and the reader’s.',
          B: 'Correct: fidelity to the original and readability for the reader are the two masters.',
          C: 'Profit plays no part; the tension is between fidelity and fluency.',
          D: 'The masters are the text and its reader, not two moments in time.',
        },
      },
      {
        id: 'potd-translation-fidelity-q4',
        stem: 'A translation that is "smooth, idiomatic" yet a "betrayal" fails, the author says, because it:',
        choices: [
          { id: 'A', text: 'preserves every foreign construction literally' },
          { id: 'B', text: 'replaces the author’s sensibility with the translator’s' },
          { id: 'C', text: 'is too difficult for any reader to follow' },
          { id: 'D', text: 'refuses to make any choices at all' },
        ],
        correctChoiceId: 'B',
        rationale:
          'Leaning entirely toward the reader is "a betrayal — smooth, idiomatic, and quietly substituting the translator’s sensibility for the author’s"; it "forgets whose text it is."',
        choiceRationales: {
          A: 'Preserving every construction literally is the opposite failure — the unreadable, source-bound one.',
          B: 'Correct: the fluent betrayal smuggles in the translator’s voice at the author’s expense.',
          C: 'That describes the over-literal failure, not the smooth, readable one.',
          D: 'The betrayal comes from making the wrong choices, not from making none.',
        },
      },
      {
        id: 'potd-translation-fidelity-q5',
        stem: 'The author would most likely regard a single rule that fixed every translation choice in advance as:',
        choices: [
          { id: 'A', text: 'desirable, since it would guarantee fidelity' },
          { id: 'B', text: 'impossible, because translation requires judgment case by case' },
          { id: 'C', text: 'the actual method of the most skilled translators' },
          { id: 'D', text: 'the only way to serve both masters at once' },
        ],
        correctChoiceId: 'B',
        rationale:
          '"What cannot be had is a rule that decides in advance"; the good translator "manages" the tension "case by case," so no fixed rule can replace judgment.',
        choiceRationales: {
          A: 'The author treats the wish for such a rule as an evasion, not a desirable guarantee.',
          B: 'Correct: the tension is managed by judgment in each case, which no advance rule can supply.',
          C: 'Skilled translators are described as exercising judgment, the opposite of a fixed rule.',
          D: 'The passage denies that any single rule can secure both fidelity and fluency.',
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
          {
            id: 'A',
            text: 'should be discarded by economists because its central premise is false',
          },
          {
            id: 'B',
            text: 'is a useful abstraction whose danger lies in applying it where its "as if" no longer holds',
          },
          {
            id: 'C',
            text: 'gives an accurate description of how individuals actually make decisions',
          },
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
      {
        id: 'potd-econ-rational-choice-q3',
        stem: 'The analogy of a map that "marked every tree" is used to argue that:',
        choices: [
          { id: 'A', text: 'a model should include every available detail' },
          { id: 'B', text: 'leaving out detail is the point of a model, not a flaw' },
          { id: 'C', text: 'maps are inherently more accurate than models' },
          { id: 'D', text: 'prediction is irrelevant to a model’s value' },
        ],
        correctChoiceId: 'B',
        rationale:
          '"A map that marked every tree would be no map at all; abstraction is not a flaw but the point" — simplification is what makes a model useful.',
        choiceRationales: {
          A: 'The analogy says the opposite: a map with every detail "would be no map at all."',
          B: 'Correct: omitting detail is precisely what makes a map — or a model — useful.',
          C: 'The map is an analogy for models, not a claim that maps outrank them.',
          D: 'The passage treats prediction as the very test of a useful model.',
        },
      },
      {
        id: 'potd-econ-rational-choice-q4',
        stem: 'The phrase "as if they were the calculating figure" indicates that the model works when people:',
        choices: [
          { id: 'A', text: 'actually are perfectly rational calculators' },
          { id: 'B', text: 'behave, on average, close enough to the idealized chooser' },
          { id: 'C', text: 'never change their minds or their wants' },
          { id: 'D', text: 'consciously perform the model’s calculations' },
        ],
        correctChoiceId: 'B',
        rationale:
          '"As long as people behave, on average and in the aggregate, roughly as if they were the calculating figure, the fiction earns its keep whether or not any individual fits it."',
        choiceRationales: {
          A: 'The author insists the calculating figure "does not exist"; no one actually is one.',
          B: 'Correct: the "as if" holds when aggregate behavior approximates the ideal, not when anyone truly is it.',
          C: 'Real people do "change their minds"; the model tolerates this at the aggregate level.',
          D: '"As if" explicitly does not require anyone to perform the calculation consciously.',
        },
      },
      {
        id: 'potd-econ-rational-choice-q5',
        stem: 'According to the author, the discipline’s recurring error is:',
        choices: [
          { id: 'A', text: 'using a model whose central premise is unrealistic' },
          {
            id: 'B',
            text: 'forgetting, at the margins, that the model was only ever a convenience',
          },
          { id: 'C', text: 'testing its predictions against actual behavior' },
          { id: 'D', text: 'applying the model to competitive markets for ordinary goods' },
        ],
        correctChoiceId: 'B',
        rationale:
          '"The discipline’s recurring error is not that it uses an unrealistic model but that it forgets, at the edges, that the model was only ever a convenience."',
        choiceRationales: {
          A: 'The author explicitly says the error is "not that it uses an unrealistic model."',
          B: 'Correct: the fault is forgetting the model’s status as a convenience when stretching it to the edges.',
          C: 'Testing predictions against behavior is the standard the author endorses, not the error.',
          D: 'Ordinary competitive markets are where the "as if" plausibly holds — the safe case, not the error.',
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
          {
            id: 'D',
            text: 'prove that recollections are generally accurate about details such as dates',
          },
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
      {
        id: 'potd-memory-oral-history-q3',
        stem: 'The example of the veteran who misremembers a battle’s date but recalls it as "the moment everything changed" illustrates that:',
        choices: [
          { id: 'A', text: 'veterans are unreliable witnesses to their own lives' },
          {
            id: 'B',
            text: 'a recollection can be factually wrong yet still record what an event meant',
          },
          { id: 'C', text: 'documents are unnecessary for writing history' },
          { id: 'D', text: 'dates are the most important facts a historian collects' },
        ],
        correctChoiceId: 'B',
        rationale:
          'The wrong date "tells us little," but remembering it as when "everything changed tells us how the war lodged in a life" — error notwithstanding, the meaning is preserved.',
        choiceRationales: {
          A: 'The point is that the testimony is valuable, not that the veteran is simply unreliable.',
          B: 'Correct: the mistaken date coexists with a reliable record of the event’s significance.',
          C: 'The passage says documents remain indispensable, answering different questions.',
          D: 'The example downplays the date’s importance relative to the event’s meaning.',
        },
      },
      {
        id: 'potd-memory-oral-history-q4',
        stem: 'To use a recollection "as if it were a police report" is to:',
        choices: [
          { id: 'A', text: 'read it carefully for the meaning it records' },
          {
            id: 'B',
            text: 'treat it purely as a factual account, missing what it uniquely offers',
          },
          { id: 'C', text: 'dismiss it entirely as unreliable' },
          { id: 'D', text: 'read it twice, once for fact and once for meaning' },
        ],
        correctChoiceId: 'B',
        rationale:
          '"To use a recollection as if it were a police report is to miss its value and court its unreliability at the same time" — reading it only for facts.',
        choiceRationales: {
          A: 'A police report is read for facts, not for the meaning the passage says testimony records.',
          B: 'Correct: treating testimony as a mere fact-record forfeits the significance that is its real value.',
          C: 'The error is over-reliance on its facts, not outright dismissal.',
          D: 'Reading twice is the author’s recommended corrective, the opposite of the police-report mistake.',
        },
      },
      {
        id: 'potd-memory-oral-history-q5',
        stem: 'The passage suggests that memory and documents are best understood as:',
        choices: [
          { id: 'A', text: 'interchangeable sources that answer the same question' },
          { id: 'B', text: 'sources that answer different questions and so complement each other' },
          { id: 'C', text: 'rivals in which the document must always win' },
          { id: 'D', text: 'equally unreliable and therefore of little use' },
        ],
        correctChoiceId: 'B',
        rationale:
          'The author says memory and documents are not ranked but "answer different questions" — one for meaning, one for verifiable fact.',
        choiceRationales: {
          A: 'The passage stresses they answer different questions, so they are not interchangeable.',
          B: 'Correct: each addresses a distinct question, making them complementary rather than competing.',
          C: '"The document won" is the older view the passage sets out to complicate.',
          D: 'The author finds both valuable, not uniformly unreliable.',
        },
      },
    ],
  },
];

/**
 * Deterministic CARS labels for the seed pool.
 *
 * `PASSAGE_THEMES` balances the 12 passages 6/6 across humanities / social
 * science. `SKILL_ROTATION` gives each passage's five questions a 2-2-1 split of
 * the three CARS skills, rotating which skill takes the single slot so every three
 * passages sum to an even 5/5/5 — the pool-level balance the authoring spec
 * requires (verified in the pool test). `dok` follows the skill, and MISCONCEPTIONS
 * supplies the per-choice misconception for each wrong option. Only these hardcoded
 * seeds derive their labels; an authored passage sets all of them explicitly.
 */
const PASSAGE_THEMES: readonly PassageTheme[] = [
  'humanities', // 0  Aesthetics
  'social_science', // 1  Historiography
  'humanities', // 2  Philosophy of Science
  'humanities', // 3  Literary Criticism
  'social_science', // 4  Political Theory
  'social_science', // 5  Anthropology
  'humanities', // 6  Ethics
  'social_science', // 7  Urban Studies
  'humanities', // 8  Music Criticism
  'humanities', // 9  Translation Studies
  'social_science', // 10 Economics
  'social_science', // 11 Oral History
];

const SKILL_ROTATION: readonly (readonly CarsSkill[])[] = [
  ['FOC', 'RWT', 'FOC', 'RWT', 'RBT'], // minority skill: RBT (FOC×2, RWT×2, RBT×1)
  ['FOC', 'RWT', 'RBT', 'RWT', 'RBT'], // minority skill: FOC (FOC×1, RWT×2, RBT×2)
  ['FOC', 'RWT', 'FOC', 'RBT', 'RBT'], // minority skill: RWT (FOC×2, RWT×1, RBT×2)
];

const DOK_BY_SKILL: Readonly<Record<CarsSkill, number>> = {
  FOC: 2,
  RWT: 3,
  RBT: 3,
};

/**
 * The per-choice misconception layered onto every WRONG option of the seed pool,
 * keyed by question id then choice id — the reasoning trap that option rewards. The
 * correct option always takes a null misconception. Every incorrect option MUST
 * have a non-empty entry here or `hardcodedPassagePool()` throws, so a seed can
 * never ship a wrong choice without the misconception the contract now requires.
 * Authored passages carry their own per-choice misconceptions and never consult
 * this table.
 */
const MISCONCEPTIONS: Readonly<Record<string, Partial<Record<PassageChoiceId, string>>>> = {
  'potd-aesthetics-difficulty-q1': {
    A: 'Treats the easy-pleasure view, which the author introduces only to reject, as the thesis.',
    C: 'Generalizes accidental difficulty to all obscurity, ignoring the constitutive kind.',
    D: 'Mistakes a supporting historical observation for the central evaluative claim.',
  },
  'potd-aesthetics-difficulty-q2': {
    B: 'Confuses the impatient reader with the opposite error of prizing obscurity.',
    C: 'Mistakes the disciplined judgment the author endorses for the error being described.',
    D: 'Assigns the easy-pleasure view to a critic who actually prizes obscurity.',
  },
  'potd-aesthetics-difficulty-q3': {
    A: 'Assumes any difficulty about understanding must be empty, overlooking the meaning behind it.',
    C: 'Reads an example about a kind of difficulty as being about a type of reader.',
    D: 'Takes an example of constitutive difficulty to be about easy, familiar pleasure.',
  },
  'potd-aesthetics-difficulty-q4': {
    A: 'Elevates one description of accidental difficulty into the premise shared by both errors.',
    C: 'Confuses the opening view the author rejects with the premise common to both errors.',
    D: 'Turns a historical observation into the shared premise of the two errors.',
  },
  'potd-aesthetics-difficulty-q5': {
    A: 'Mistakes one of the criticized errors for the demanding task the author praises.',
    C: 'Mistakes the second criticized error for the disciplined critical task.',
    D: 'Reads case-by-case judgment as the abandonment of evaluation.',
  },
  'potd-history-microhistory-q1': {
    A: 'Reads the objection as the conclusion of the passage, ignoring the reply that follows.',
    B: 'Reads a worry about representativeness as an accusation of deliberate deception.',
    D: 'Hardens the tentative may-be-unusual into an absolute rule.',
  },
  'potd-history-microhistory-q2': {
    A: 'Ranks the aggregate as simply more accurate, though each scale shows different things.',
    C: 'Forgets that microhistorians grant that large forces and aggregate data exist.',
    D: 'Reverses the passage: the wide view flattens, while the small scale reveals.',
  },
  'potd-history-microhistory-q3': {
    A: 'Takes the wager to be the metaphysical claim the microhistorians explicitly avoided.',
    C: 'Substitutes a question of worth for the question about knowledge the wager raises.',
    D: 'Reads a claim about knowledge as one about the chronology of the discipline.',
  },
  'potd-history-microhistory-q4': {
    A: 'Mistakes the backdrop for the subject and asserts a decline the passage never claims.',
    C: 'Inflates one supporting point into the overall aim of the passage.',
    D: 'Overstates the value of well-chosen cases into an exclusive rule.',
  },
  'potd-history-microhistory-q5': {
    A: 'Keeps the representativeness standard the reply explicitly gives up.',
    C: 'Assumes a case must avoid generalizations rather than test them.',
    D: 'Values a case for being ordinary rather than for what it can test.',
  },
  'potd-philsci-anomalies-q1': {
    A: 'Adopts the common picture the passage sets out to complicate.',
    C: 'Turns a warning about indefinite abuse into a blanket prohibition.',
    D: 'Restates the simplified picture the passage qualifies.',
  },
  'potd-philsci-anomalies-q2': {
    A: 'Mistakes the legitimate inquiry the author defends for a failure.',
    B: 'Reads paying the predictive debt as a scientific failure.',
    D: 'Labels the response the author recommends a failure.',
  },
  'potd-philsci-anomalies-q3': {
    A: 'Reads examples of possible error sources as a procedure to follow.',
    C: 'Turns may-fail into usually-fail.',
    D: 'Reverses the point: checking auxiliaries is the legitimate inquiry.',
  },
  'potd-philsci-anomalies-q4': {
    A: 'Reads the phrase as endorsing the automatic verdict it denies.',
    C: 'Confuses inquiry with the indefinite ignoring the author warns against.',
    D: 'Treats a problem to investigate as a confirmation.',
  },
  'potd-philsci-anomalies-q5': {
    A: 'Ignores that scientists are often right to set anomalies aside.',
    C: 'Treats the very abuse the author condemns as harmless.',
    D: 'Denies the fallible auxiliaries the whole argument depends on.',
  },
  'potd-litcrit-author-q1': {
    A: 'Overlooks that the author calls the strong view evasive.',
    B: 'Ignores that the author lets readers find implications a text permits.',
    D: 'Assigns the author the sole-authority extreme he explicitly rejects.',
  },
  'potd-litcrit-author-q2': {
    B: 'Confuses rejecting an inference with rejecting the premise the author accepts.',
    C: 'Contradicts the claim that readers can find permitted implications.',
    D: 'Misses that a leap presupposes the two claims differ.',
  },
  'potd-litcrit-author-q3': {
    A: 'Reads an argument for the relevance of intention as a concession of its unknowability.',
    C: 'Hardens the modest usually-right into a guarantee.',
    D: 'Reverses the example, which uses ordinary speech because it bears on reading.',
  },
  'potd-litcrit-author-q4': {
    A: 'Substitutes reader competence for the meaning-versus-intention distinction.',
    C: 'Invents a distinction between opinion and scholarship the author never draws.',
    D: 'Reduces a distinction about meaning to one about textual mechanics.',
  },
  'potd-litcrit-author-q5': {
    A: 'Assigns the sole-authority extreme to a middle-ground case.',
    C: 'Denies the unintended-but-permitted reading the example depends on.',
    D: 'Collapses the gap between intention and meaning the example opens.',
  },
  'potd-poli-deliberation-q1': {
    A: 'Assigns deliberation the numbers-based justification it is contrasted against.',
    C: 'Ignores the concession that unequal talk can reproduce power.',
    D: 'Contradicts the statement that the objection is not that deliberation is worthless.',
  },
  'potd-poli-deliberation-q2': {
    A: 'Confuses a matter of numbers with what distinguishes a reason from a preference.',
    C: 'Applies the description of a preference to a reason.',
    D: 'Borrows the denied premise of the skeptics as if it defined a reason.',
  },
  'potd-poli-deliberation-q3': {
    A: 'Mistakes the deliberative hope under challenge for the objection itself.',
    C: 'Attributes the rival vote-counting tradition to the worry of the skeptics.',
    D: 'Overlooks that deliberation is defined by offering reasons.',
  },
  'potd-poli-deliberation-q4': {
    A: 'Has the theorist deny the inequality the reply actually concedes.',
    C: 'Reads the reframing as a retreat to majority voting.',
    D: 'Contradicts the explicit denial that deliberation is worthless.',
  },
  'potd-poli-deliberation-q5': {
    A: 'Reads the aim as the majority satisfaction the contrast sets against it.',
    C: 'Borrows the worry of the skeptics as the aim of deliberation.',
    D: 'Ignores that deliberation is defined by offering reasons.',
  },
  'potd-anthro-ethnography-q1': {
    A: 'Reads the corrected error as the model to return to.',
    B: 'Ignores the warning against reflexivity that becomes a study of the anthropologist.',
    D: 'Turns a call for honest method into a denial that knowledge is possible.',
  },
  'potd-anthro-ethnography-q2': {
    A: 'Takes one reason the glass is not clear for what the glass itself represents.',
    C: 'Assigns the pane-of-glass image to the later reflexive practitioners.',
    D: 'Confuses the reflexive response with the assumption it responds to.',
  },
  'potd-anthro-ethnography-q3': {
    B: 'Substitutes a claim about informants for one about presence guaranteeing knowledge.',
    C: 'Assigns the later corrective to the classic assumption being expressed.',
    D: 'Reads over-confidence as blanket distrust.',
  },
  'potd-anthro-ethnography-q4': {
    A: 'Treats the original error as the remedy.',
    C: 'Overstates a warning about excess into a denial of all value.',
    D: 'Turns a caution about reflexivity into a denial that description is possible.',
  },
  'potd-anthro-ethnography-q5': {
    A: 'Ignores not-as-its-hero, which rejects making the observer central.',
    C: 'Treats an acknowledged influence as something that voids knowledge.',
    D: 'Revives the pane-of-glass illusion the author rejects.',
  },
  'potd-ethics-moral-luck-q1': {
    A: 'Adopts one horn of the dilemma as the settled conclusion.',
    C: 'Denies the outcome intuition the author treats as genuine.',
    D: 'Ignores that the author finds the value of the puzzle is not a solution.',
  },
  'potd-ethics-moral-luck-q2': {
    A: 'Contradicts the whole point about a conflict among intuitions.',
    C: 'Dismisses the control condition the author treats as compelling.',
    D: 'Reads a reluctant concession as a plain, uncontroversial truth.',
  },
  'potd-ethics-moral-luck-q3': {
    A: 'Misreads an example that assumes recklessness as a defense of it.',
    C: 'Reverses the example, which shows luck does seem to affect judgment.',
    D: 'Ignores that we judge the two differently despite equal control.',
  },
  'potd-ethics-moral-luck-q4': {
    A: 'Reads a metaphor for moral accounting literally.',
    C: 'Describes the control condition that admitting luck actually strains.',
    D: 'Treats luck as eliminable, though the passage finds it hard to keep out.',
  },
  'potd-ethics-moral-luck-q5': {
    A: 'Expects a tidy rule the author denies the puzzle provides.',
    C: 'Denies the outcome intuition the author treats as genuine.',
    D: 'Reads an unresolved tension as a settled question.',
  },
  'potd-urban-walkability-q1': {
    A: 'Ignores the plain statement that this is not an argument against walkable cities.',
    C: 'Contradicts the claim that density makes land valuable.',
    D: 'Erases the sharp street-versus-neighborhood distinction the author draws.',
  },
  'potd-urban-walkability-q2': {
    A: 'Reads a distinction as a ranking of streets over neighborhoods.',
    C: 'Denies the very effect the author warns about.',
    D: 'Turns a warning about costs into a claim about feasibility.',
  },
  'potd-urban-walkability-q3': {
    A: 'Reverses the passage: the longtime tenant is priced out.',
    C: 'Contradicts the call for a matching housing policy.',
    D: 'Ignores that density makes land valuable, raising values.',
  },
  'potd-urban-walkability-q4': {
    A: 'Reverses the example, which shows the store subject to rising rents.',
    C: 'Reads a figure of speech literally, blaming marketing for displacement.',
    D: 'Contradicts an example built to show a strong effect.',
  },
  'potd-urban-walkability-q5': {
    A: 'Ignores the statement that this is not an argument against walkable cities.',
    C: 'Commits the exact error the author warns against.',
    D: 'Reads the street-versus-neighborhood contrast as ranking engineering above people.',
  },
  'potd-music-improvisation-q1': {
    A: 'Adopts the ranking the author sets up in order to reject.',
    B: 'Ignores the refusal to crown the improviser instead.',
    D: 'Contradicts the analogy showing they never aimed at the same thing.',
  },
  'potd-music-improvisation-q2': {
    A: 'Reads incommensurability as a claim about which practice is harder.',
    C: 'Introduces recording, which the analogy is not about.',
    D: 'Draws a general verdict on technology the passage never makes.',
  },
  'potd-music-improvisation-q3': {
    A: 'Restates the hurried-cousin view the sentence denies.',
    C: 'Assigns the improviser a superiority the author refuses to grant.',
    D: 'Denies the audible craft the passage credits to the improviser.',
  },
  'potd-music-improvisation-q4': {
    A: 'Assigns the improviser the polish that belongs to the composer.',
    C: 'Ignores that the improviser works in real time shared with an audience.',
    D: 'Reverses the point: risk is what becomes audible.',
  },
  'potd-music-improvisation-q5': {
    A: 'Mistakes the ranking the author dismantles for the purpose of the passage.',
    C: 'Ignores the explicit refusal to crown the improviser.',
    D: 'Contradicts the analogy denying a shared goal.',
  },
  'potd-translation-fidelity-q1': {
    A: 'Turns one extreme case into a rule about all accurate translation.',
    C: 'Endorses the reader-favoring betrayal the author criticizes.',
    D: 'Contradicts the denial that any rule can decide in advance.',
  },
  'potd-translation-fidelity-q2': {
    A: 'Treats an evasion as a goal worth pursuing.',
    C: 'Assigns skilled translators a judgment-free rule they actually reject.',
    D: 'Ignores the denial that one rule can secure both aims.',
  },
  'potd-translation-fidelity-q3': {
    A: 'Introduces a publisher the passage never mentions.',
    C: 'Substitutes profit for the fidelity-versus-fluency tension.',
    D: 'Reads two masters as two moments in time rather than text and reader.',
  },
  'potd-translation-fidelity-q4': {
    A: 'Attributes the opposite, source-bound failure to the fluent one.',
    C: 'Describes the over-literal failure, not the smooth betrayal.',
    D: 'Locates the betrayal in making no choices rather than the wrong ones.',
  },
  'potd-translation-fidelity-q5': {
    A: 'Treats the wish for a fixed rule as a desirable guarantee.',
    C: 'Assigns a fixed rule to translators the passage says exercise judgment.',
    D: 'Ignores the denial that any rule can serve both aims.',
  },
  'potd-econ-rational-choice-q1': {
    A: 'Ignores the praise of the model as remarkably productive.',
    C: 'Contradicts the insistence that the calculating chooser does not exist.',
    D: 'Reverses the argument that a false premise can still be useful.',
  },
  'potd-econ-rational-choice-q2': {
    A: 'Names the safe case where the as-if plausibly holds.',
    C: 'Targets aggregation, which is part of the defense of the model.',
    D: 'Flags the very standard the author accepts.',
  },
  'potd-econ-rational-choice-q3': {
    A: 'Reads the analogy backwards; a map with every tree would be no map at all.',
    C: 'Takes an analogy for models as a claim ranking maps above them.',
    D: 'Denies the prediction test the passage treats as central.',
  },
  'potd-econ-rational-choice-q4': {
    A: 'Ignores that the calculating figure does not exist.',
    C: 'Denies the changeability the model tolerates at the aggregate level.',
    D: 'Reads as-if as requiring conscious calculation.',
  },
  'potd-econ-rational-choice-q5': {
    A: 'Contradicts the statement that the error is not the use of an unrealistic model.',
    C: 'Labels the endorsed standard the recurring error.',
    D: 'Names the safe case rather than the edge-case error.',
  },
  'potd-memory-oral-history-q1': {
    A: 'Overstates the case; memory answers different questions, not simply more reliable.',
    C: 'Restates the older view the passage complicates.',
    D: 'Ignores the reframing of error as data of another kind.',
  },
  'potd-memory-oral-history-q2': {
    A: 'Treats testimony as a police report, the approach the author warns against.',
    C: 'Contradicts the claim that memory and documents answer different questions.',
    D: 'Ignores the misremembered-date example that denies such reliability.',
  },
  'potd-memory-oral-history-q3': {
    A: 'Reads a point about value as one about simple unreliability.',
    C: 'Overlooks that documents remain indispensable for other questions.',
    D: 'Reverses the example, which downplays the importance of the date.',
  },
  'potd-memory-oral-history-q4': {
    A: 'Assigns the police-report metaphor to the meaning-reading the author recommends.',
    C: 'Reads over-reliance on facts as outright dismissal.',
    D: 'Confuses the corrective with the mistake it corrects.',
  },
  'potd-memory-oral-history-q5': {
    A: 'Ignores that the two answer different questions.',
    C: 'Restates the older view the passage sets out to complicate.',
    D: 'Dismisses both, though the author finds each valuable.',
  },
};

/**
 * The hardcoded pool, fully CARS-labelled and in the per-choice shape — the
 * LAST-RESORT fallback source when neither Postgres nor a local dev store is
 * present. Every reader in the app goes through the async loader in
 * `apps/learner-web/server/passage-pool-source.ts`; this is only its final branch.
 * Each raw question is expanded into canonical choices that carry `correct`, the
 * matching `misconception` (null on the key, from MISCONCEPTIONS otherwise), and
 * the per-choice `rationale`; the question-level `rationale` becomes `explanation`.
 */
export function hardcodedPassagePool(): readonly PassageOfTheDayEntry[] {
  return PASSAGE_OF_THE_DAY_POOL.map((entry, passageIndex) => {
    const theme = PASSAGE_THEMES[passageIndex] ?? 'humanities';
    const pattern = SKILL_ROTATION[passageIndex % SKILL_ROTATION.length]!;
    return {
      ...entry,
      slug: entry.id,
      theme,
      questions: entry.questions.map((question, questionIndex) => {
        const carsSkill = pattern[questionIndex % pattern.length]!;
        const misconceptions = MISCONCEPTIONS[question.id] ?? {};
        const choices: PassageChoice[] = question.choices.map((choice) => {
          const rationale = question.choiceRationales[choice.id];
          if (choice.id === question.correctChoiceId) {
            return { id: choice.id, text: choice.text, correct: true, misconception: null, rationale };
          }
          const misconception = misconceptions[choice.id] ?? '';
          if (misconception.length === 0) {
            throw new Error(
              `Seed pool: missing misconception for ${question.id} choice ${choice.id}`,
            );
          }
          return { id: choice.id, text: choice.text, correct: false, misconception, rationale };
        });
        return {
          id: question.id,
          stem: question.stem,
          choices,
          explanation: question.rationale,
          carsSkill,
          dok: DOK_BY_SKILL[carsSkill],
        };
      }),
    };
  });
}
