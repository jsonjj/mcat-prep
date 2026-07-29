# Error Records and Open Learner Models — Evidence Review

**Research question.** What makes an error log / mistake record actually improve learning, and how
should accumulated errors be displayed to a learner?

**Provenance conventions.** `[read]` means the full text was retrieved and every figure cited below
was verified against that text; where I read targeted sections rather than the whole paper this is
stated in the entry. `[abstract]` means I had only the abstract plus publisher/search-returned
excerpts — treat those numbers as unconfirmed. `[secondary]` means the claim comes from another
paper's description of the work, and I never saw the original. Where a working paper and a
published version disagree on a number, both are given.

---

## Bottom line before the details

The specific artifact the team is proposing — *an accumulated record of a learner's mistakes,
displayed back to them* — has, as far as I can find, **no direct empirical evaluation anywhere in the
research literature**. Not in education research, not in test prep, not in medical education. There
is no controlled study of an error notebook, a `cuoti ben`, an LSAT blind-review log, or a question-bank
"incorrects" view against a matched control.

What exists is evidence for and against four *mechanisms* that such a record might deliver. They do
not point the same way, and the difference between them is the whole design problem:

| Mechanism the record could deliver | Evidence | Direction |
| --- | --- | --- |
| Error generation followed by correct-answer feedback | Strong, decades of controlled work | Clearly positive |
| Prompted self-explanation of the error | Meta-analytic, g = 0.55 | Clearly positive |
| Re-retrieval of previously missed items | Strong, very large effects | Positive — **but see the trap below** |
| A dashboard summarising accumulated performance | Systematic review of 38 studies | No detectable effect on achievement |

**The trap.** The strongest single result bearing on error-log architecture is Karpicke & Roediger
(2008), and it cuts *against* the way error logs are normally built. Their design directly compared
"keep testing everything" with "drop an item from testing once you get it right." Dropping correct
items from re-testing cut one-week recall from **~80% to 36% and 33%** — d = 4.03, non-overlapping
distributions. An error log is, by construction, a queue that contains only items you got wrong; if
it *replaces* review of the whole corpus rather than supplementing it, it implements the losing
condition of that experiment. The intuition that you should focus your effort on your mistakes is
the specific belief that study falsifies.

---

## Q1. Error notebooks, error journals, reflective review protocols

### 1. Metcalfe, J. (2017). Learning from Errors. *Annual Review of Psychology* 68, 465–489. `[read]`
<https://files.eric.ed.gov/fulltext/ED574569.pdf> · doi:10.1146/annurev-psych-010416-044022

The single most useful source for this question. It is the authoritative review of whether engaging
with errors helps, and it is unusually explicit about where the evidence runs out.

**DOK 1**
- Kornell et al. (2009) compared being given an answer directly against guessing first and nearly
  always erring before being shown the answer, with study time on the correct answer equated. Error
  generation produced **considerably better** final recall. Trials where no error was actually
  generated (**under 10%** of cases) were excluded.
- Huelser & Metcalfe (2012) measured the error-generation benefit at **20%**, which Metcalfe glosses
  as "roughly the difference between a C− and an A, if it had been a course grade." Participants who
  had just experienced that 20% benefit **believed the error-free condition had worked better**.
- The benefit requires the error be **semantically related** to the target. Grimaldi & Karpicke
  (2012), Knight et al. (2012) and Kang et al. (2011) all found **no benefit** for unrelated guesses
  or forced guessing with no relevant knowledge.
- The benefit requires the error be **self-generated**. When the experimenter presented an incorrect
  word during what would have been the generation period, **memory for the correct answer was
  harmed** relative to control (Grimaldi & Karpicke 2012). Constraining what the learner could
  generate was also harmful.
- Corrective feedback must contain the correct answer. Metcalfe, citing Pashler et al. (2005):
  people get "virtually no benefit" from being told only whether they were right or wrong.
- **Hypercorrection.** Errors committed with high confidence are corrected more readily than
  low-confidence errors, replicated across roughly two dozen cited studies, at immediate and delayed
  retest. Mechanism: surprise-driven attentional capture at the moment of feedback, evidenced by a
  confidence-graded P3a, by impaired concurrent tone detection during high-confidence feedback, and
  by anterior cingulate / rTPJ / rDLPFC activation.
- **Exceptions.** Amnesic patients are harmed by errorful learning. Older adults show a much
  attenuated hypercorrection effect.
- Butler, Fazio & Marsh (2011): the hypercorrection effect persists over a week, **but high-confidence
  errors return**.
- Siegler (1995) three-condition comparison: feedback only < "why do you think that?" <
  **"how do you think I knew that?"** (explain the *correct* reasoning) — the last was most effective.
- On after-action review (the US Army's structured post-failure debrief, and the closest
  institutional analogue to an error log): "there is little experimental research on this method,"
  though "there appears, nevertheless, to be considerable consensus about its efficacy."

**DOK 2**
- The self-generation requirement is the most consequential finding for our design and the easiest
  to violate. **Re-displaying a learner's past wrong answer as text is not error generation** — it is
  closer to the experimenter-presented-error condition that *harmed* memory. A record that shows
  "three months ago you picked B" without making the learner re-attempt the item is plausibly worse
  than showing nothing. Any error view should therefore be a **re-attempt surface, not a reading
  surface**.
- Hypercorrection is a *prioritisation rule we can implement cheaply*: capture per-item confidence
  at answer time, and rank the error record by confidence-in-the-error descending. High-confidence
  errors are both the most correctable and, on the semantic-similarity account, the ones where the
  learner is nearest the right answer. This is the clearest actionable finding in the whole review.
- The "high-confidence errors return" result means correction is **not** permanent after one pass.
  Whatever we surface must be re-surfaced on a schedule, not retired after a single successful review.
- Metcalfe's own admission that AAR is essentially untested experimentally is the honest ceiling for
  every claim in the practitioner literature about structured error review protocols.

**Limitations.** Almost all of the core evidence is laboratory work with word pairs and
general-knowledge questions. The generalisation to multi-step MCAT passage reasoning is a bridge
Metcalfe does not build. The classroom evidence (Stevenson & Stigler's US/Japan video study) is
observational and confounded with everything else that differs between two national school systems;
Metcalfe presents it as suggestive, not causal.

---

### 2. Keith, N., & Frese, M. (2008). Effectiveness of error management training: A meta-analysis. *Journal of Applied Psychology* 93(1), 59–69. `[read]` (targeted read: abstract, method, results table, discussion)
<https://doi.org/10.1037/0021-9010.93.1.59>
<!-- Original citation pointed at an incidental third-party PDF mirror; replaced with the DOI.
     The mirrored filename matched the paper, so this is a URL-quality fix, not a retraction. -->

**DOK 1**
- **24 studies, N = 2,183.** Overall effect of error management training versus training that does
  not encourage errors: **d = 0.44**, 95% CI [0.27, 0.61].
- **Within-training performance: d = 0.15** (k = 4, N = 505, non-significant).
  **Post-training transfer: d = 0.56** (k = 20, N = 1,678).
- **Analogical transfer: d = 0.20** (k = 13, N = 1,647).
  **Adaptive (structurally novel) transfer: d = 0.80** (k = 11, N = 536).
- Clarity of task feedback: high **d = 0.56** (k = 17), low **d = 0.19** (k = 7, non-significant),
  moderator p = .08.
- Versus proceduralized training **d = 0.58** (k = 16); versus exploratory training without error
  encouragement **d = 0.19** (k = 13). Error *encouragement* contributes over and above exploration.
- **11 of 24 studies were unpublished** (theses, technical reports, manuscripts in preparation) —
  the authors made a real effort against publication bias.
- 18 of 24 trainings taught software skills; 3 database search; 3 a computerised decision task.

**DOK 2**
- The moderator structure says the payoff of error-focused training is **in transfer, not in
  practice performance**. Applied here: an error-review feature should be evaluated against
  performance on *new, unseen* items, never against improvement on the logged items themselves.
  Re-testing the same missed item and watching accuracy rise is the within-training measure, where
  EMT's effect was d = 0.15 and not significant.
- The "error encouragement" component — explicit instructions that errors are expected and
  informative — carries d = 0.19 *on its own*, independent of the exploration it accompanies. This
  is the cheapest thing in the review to ship: framing copy at the top of the error view.

**Limitations.** All but one study was a laboratory experiment, mostly software training, mostly
university students. The comparison is always against an *alternative training*, never against no
training, so d = 0.44 is a relative figure. The homogeneity test was non-significant, meaning the
moderator analyses were run on theoretical grounds rather than because variance demanded them.

---

### 3. Bisra, K., Liu, Q., Nesbit, J. C., Salimi, F., & Winne, P. H. (2018). Inducing Self-Explanation: A Meta-Analysis. *Educational Psychology Review* 30(3), 703–725. `[read]` (targeted read: abstract, results table, discussion)
<https://gwern.net/doc/psychology/spaced-repetition/2018-bisra.pdf>

**DOK 1**
- **69 effect sizes from 64 reports, 5,917 participants.** Random-effects **g = 0.552**,
  95% CI [0.454, 0.650], p < .001, SE = 0.050.
- Heterogeneity Q = 196.63, df = 68, p < .001.
- 20 moderators coded. **Only three showed differences with implications for theory or practice**:
  comparison treatment, type of self-explanation elicited, and region.
- The authors benchmark g = 0.55 against Hattie's estimates for mastery learning (d = 0.50) and peer
  tutoring (d = 0.55), below reciprocal teaching (0.74), feedback (0.73) and spaced learning (0.71).
- Their own stated limitation: reliance on **instructor-scripted prompts**, and they specifically
  call for research on computer-generated self-explanation prompts.

**DOK 2**
- This is the strongest quantitative warrant for the *reflective* half of an error log. It licenses
  "make the learner articulate why the right answer is right" as a designed prompt. It does **not**
  license a free-text notes field: the effect is for *induced* self-explanation with a specific
  prompt, and near-zero moderator structure means we cannot claim any particular prompt wording is
  better than another.
- Combined with Siegler (via Metcalfe): the prompt to use is "why is the correct answer correct?"
  rather than "why did you pick what you picked?" or an open reflection box.

**Limitations.** Mostly short-duration laboratory and single-session classroom studies; the
meta-analysis says nothing about whether prompted self-explanation survives months of daily use, or
whether learners keep complying once the novelty passes. Q is large and largely unexplained.

---

### 4. Karpicke, J. D., & Roediger, H. L. (2008). The Critical Importance of Retrieval for Learning. *Science* 319(5865), 966–968. `[read]`
<https://web.mit.edu/jbelcher/www/learner/retrieval.pdf> · doi:10.1126/science.1152408

**Read this one against your own product spec.** It is the closest thing in the literature to a
direct test of error-log logic, and it is a refutation.

**DOK 1**
- College students learned **40 Swahili–English word pairs**. After an item was first recalled
  correctly it was either kept in both study and test (ST), dropped from study but still tested
  (SNT), dropped from test but still studied (STN), or dropped from both (SNTN).
- **Learning curves were identical across all four conditions**; performance was near-perfect by the
  end of the learning phase.
- One week later: **ST and SNT ≈ 80% recall. STN = 36%. SNTN = 33%.**
- Repeated retrieval versus dropping from testing: **d = 4.03**, and the distributions did not
  overlap — drop-from-testing ranged 10–60%, repeated-testing ranged 63–95%.
- Students' predictions were **equivalent across conditions** (predicted words recalled: ST 20.8,
  SNT 20.4, STN 22.0, SNTN 20.3; F < 1) and averaged ~50% against actual outcomes of 33–80%.
- The authors name the target belief explicitly: dropping learned material "is implicitly endorsed
  by contemporary theories of study-time allocation and is explicitly encouraged in many popular
  study guides."

**DOK 2**
- **The architectural implication is unambiguous.** If the error record is the *review queue*, and
  items leave the queue when answered correctly, the product implements STN/SNTN. The learner will
  feel efficient — the learning curve looks the same — and will lose roughly half of long-term
  retention relative to a queue that keeps re-testing everything.
- SNT is the condition to copy: **stop re-*studying* items once they are recalled, but never stop
  re-*testing* them.** SNT matched ST at ~80% while doing strictly less work. That is a real
  efficiency win and it is available; the error log just must not be the mechanism that decides what
  gets retested.
- The metacognitive result reframes what an error display is *for*. Students could not tell 33% from
  80% in advance. The value of showing an accumulated record is not motivation or reflection; it is
  substituting an external record for a judgement the learner demonstrably cannot make.

**Limitations.** Swahili vocabulary, one week, one experiment, college students. MCAT content is not
paired associates, and the extrapolation of d = 4.03 to passage-based reasoning is not warranted —
the *direction* transfers far more safely than the magnitude. The study also does not test a
spaced/adaptive scheduler, which is a smarter comparator than "test everything every time."

---

### 5. Große, C. S., & Renkl, A. (2007). Finding and fixing errors in worked examples: Can this foster learning outcomes? *Learning and Instruction* 17(6), 612–634. `[abstract]`
<https://eric.ed.gov/?id=EJ780439>

**DOK 1**
- Two experiments, probability problems, 2×3 design (correct+incorrect with errors highlighted /
  correct+incorrect without highlighting / correct only) × (self-explanation prompts / none).
- **Aptitude–treatment interaction, replicated in Experiment 2**: mixing correct and incorrect
  solutions improved far transfer **only for learners with favourable prior knowledge**. For learners
  with poor prior knowledge, **correct solutions only was better**.
- Experiment 2: exposure to incorrect solutions produced new types of effective self-explanation but
  **substantially reduced the amount of principle-based self-explanation**, which the authors call
  "very important."

**DOK 2**
- Error-focused material is not universally good; it is good for people who already have the
  schema. An MCAT population is heterogeneous on exactly this dimension, so a single error-review
  treatment applied to everyone is the wrong default. The plausible gate is prior mastery of the
  relevant KC, which our model already estimates.
- The principle-based-self-explanation displacement is a warning against error-heavy review as a
  *substitute* for principle instruction. Errors should be a layer on top of the concept, not the
  entry point to it.

**Limitations.** Abstract-only; I did not verify the effect sizes or the operationalisation of
"prior knowledge." Single domain (probability), German university students.

---

### 6. Conditions for Effective Learning from Erroneous Examples: A Systematic Review (2025). *Educational Psychology Review*. `[read]` (targeted: results section on contrasted-erroneous-example comparisons)
<https://link.springer.com/article/10.1007/s10648-025-10071-x>

**DOK 1**
- Of the comparisons contrasting correct-plus-erroneous examples against correct-only examples,
  **9 of 12 showed a benefit for the erroneous-example condition, 3 showed no difference, and none
  favoured correct-only.** Eight of the nine were in mathematics; one in psychology (Corral &
  Carpenter 2020).
- Durkin & Rittle-Johnson (2012) additionally found erroneous examples reduced misconceptions.
- Loibl & Leuders (2018): prompt-based erroneous examples improved "negative knowledge" in unit one
  and conceptual knowledge in unit two, but did not produce further negative-knowledge gains.
- Null results: Booth et al. (2013, Exp. 1), Chen et al. (2020), van Peppen et al. (2021).
- The review identified **12 distinct prompt categories** across studies.

**DOK 2**
- This is a favourable but narrow evidence base: 12 comparisons, overwhelmingly mathematics,
  overwhelmingly with explicit prompts attached. It supports "show errors with a prompt," not "show
  errors."
- The 12-prompt-category finding is a caution: the field has not converged on what an error prompt
  should say, which means any specific wording we ship is an untested design choice, not an
  implementation of a finding.

**Limitations.** Vote-counting, not effect-size pooling, in the section I read. These are
*instructionally designed* erroneous examples authored by researchers, which is a different object
from a learner's own accumulated mistakes.

---

### 7. Exam wrappers — the closest classroom analogue, and the null results

**7a. Soicher, R. N., & Gurung, R. A. R. (2017). Do exam wrappers increase metacognition and
performance? A single course intervention. *Psychology Learning & Teaching* 16(1), 64–73.**
`[abstract]` <https://doi.org/10.1177/1475725716661872>

- **N = 86**, three conditions: exam wrapper (metacognitive instruction), sham wrapper (same
  exercise, no metacognitive instruction), control.
- **No improvement on any of three exams, on final grades, or on metacognitive ability** (MAI)
  across conditions.
- All students' MAI scores rose over the semester **regardless of condition**.

**7b. Stephenson, B., Craig, M., Zingaro, D., Horton, D., Heap, D., & Huynh, E. (2018). Exam
Wrappers. *ITiCSE '18*.** `[abstract]`
<https://doi.org/10.1145/3209635.3209655>

- Two studies at two major Canadian universities with complementary designs. The exam-wrapper review
  below attributes to "Stephenson et al. (2017)" a Study 1 of N = 289 (quasi-experimental interrupted
  time series) and a Study 2 of N = 752 (randomised controlled trial); **I could not confirm that
  this is the same work as the 2018 ITiCSE paper**, so treat the sample sizes as provisional.
- **Neither study produced evidence of a significant effect on final exam scores or on course drop
  rates.**
- Wrapper use *was* associated with improved rates of test pickup and higher scores on a course
  evaluation item about fairness of evaluation.
- The authors' own recommendation: instructors considering wrappers "should review the evidence for
  other possible interventions that may more effectively serve the same goals."

**7c. The use of exam wrappers to promote metacognition (2019). *Currents in Pharmacy Teaching and
Learning*.** `[abstract]` <https://pubmed.ncbi.nlm.nih.gov/31171251/>

- Pharmacy pathophysiology course; wrappers before exams 2–5. **Self-selected groups**: 53 students
  used at least one wrapper, 35 never did.
- Mixed-effects modelling found a **non-significant increase in average exam performance,
  p = 0.142**.

**7d. Exam wrappers literature review (2025). *[Journal not identified in the retrieved PDF]*,
ERIC EJ1479768.** `[read]` (targeted: method, evidence tables, achievement section)
<https://files.eric.ed.gov/fulltext/EJ1479768.pdf>

- **n = 30 studies. Only five were randomised controlled trials.** 16 quantitative, 10 mixed
  methods, 4 qualitative. **26 of 30 in STEM.**
- Study identification used **chain-referral (snowball) sampling from 20 seed articles**, not a
  systematic database protocol — the authors acknowledge sampling bias and reduced generalisability.
- The review is broadly positive in tone while its own tables record: Soicher & Gurung no
  achievement or metacognition difference; Stephenson et al. no final-exam effect; Hodges et al.
  (2020) "limited metacognitive gains"; Knight et al. (2022, N = 496) frequency of metacognitive
  responses **not predictive** of grade increase; Chen et al. (2017) exam-score prediction accuracy
  associated with **incoming standardized test scores, not wrappers**.
- A companion critique ("Amp Up The Wrappers") notes that several papers claiming positive effects
  (Achacoso 2005; Gezer-Templeton et al. 2017) **report no actual data**, so their claims cannot be
  evaluated.

**DOK 2 for the exam-wrapper cluster**
- The exam wrapper is the error notebook's academic cousin: a structured post-assessment reflection
  on what you got wrong and why. **It is the one version of this practice that has been tested, and
  it mostly does not work.** Multiple RCTs, including one with N = 752, find no achievement effect.
- Where positive effects are reported, they cluster in quasi-experimental designs and self-selected
  samples — precisely the confound Kaliisa et al. flag for dashboards.
- The one wrapper-family intervention that *does* replicate (Chen et al. 2017, below) differs in a
  specific way: it is **prospective and plan-forming**, administered *before* an exam, and it asks
  about resources and strategy rather than about past errors. That distinction is the most
  actionable thing in this cluster.

---

### 8. Chen, P., Chavez, O., Ong, D. C., & Gunderson, B. (2017). Strategic Resource Use for Learning. *Psychological Science* 28(6), 774–785. `[abstract]`
<https://doi.org/10.1177/0956797617696456>

**DOK 1**
- Two randomised cohorts of a college introductory statistics class (per the wrapper review above:
  Study 1 N = 178, Study 2 N = 203).
- **Before each exam**, treatment students strategised which resources they would use, why each
  would be useful, and how they would use it.
- Treatment students outperformed controls by **an average of one third of a letter grade**;
  reported per the Stanford release as **+3.45 percentage points in Study 1 and +4.65 in Study 2**.
- Self-reported effect mediated by increased self-reflection and more effective resource use.
- Per the wrapper review's table: **exam-score prediction accuracy was associated with incoming
  standardized test scores, not with the intervention**, and the self-reflection score increase
  appeared in Study 2 only.

**DOK 2**
- Timing and orientation are the differentiators. This is a **forward-looking planning prompt tied
  to an upcoming high-stakes event**, not a backward-looking inventory of failures. The MCAT
  equivalent is surfacing the error record *before a scheduled full-length*, framed as "here is what
  to work on in the next ten days," not *after a session*, framed as "here is what you got wrong."
- The mediation is through **resource use**, i.e. behaviour change. An error display with no
  attached action affordance is missing the mediator.

**Limitations.** Abstract-only for the primary source; the percentage-point figures come from a
university press release, which is a weaker provenance than the paper. Single institution, single
subject, self-reported mediators. The finding that prediction accuracy tracked prior test scores
rather than the intervention undercuts a metacognitive-calibration explanation.

---

### 9. Drake, E., Phillips, J. P., & Kovar-Gough, I. (2021). Exploring Preparation for the USMLE Step 2 Exams to Inform Best Practices. *PRiMER* 5:26. `[read]`
<https://pmc.ncbi.nlm.nih.gov/articles/PMC8437322/>

The only study I found that measures the medical-board-prep behaviour of reviewing missed questions
against an outcome.

**DOK 1**
- **51 respondents of 205 invited (25% response rate)**, single US allopathic medical school, class
  of 2020. Mean Step 1 = 232, Step 2 CK = 248.
- **35 of 51 (69%) reported "reviewed the educational content or feedback on missed (incorrect)
  questions."** 36 (71%) reported spending more time working questions than reading or watching
  videos. 27 (53%) used practice-test results to alter their study plan.
- Significant positive correlations with Step 2 CK: Step 1 score **r = .844**; average percent
  correct in the question bank **r = .550**; **percent of question bank completed r = .290**.
- **Reviewing missed questions does not appear among the significant correlations at all.** Neither
  does "utilised practice test results to alter my study plan."
- **Negative** correlations with score: *Step 2 Secrets* r = −.380, *OnlineMedEd* r = −.438,
  *Master the Boards* r = −.367, *First Aid for Step 2 CK* r = −.335.
- In hierarchical regression controlling for entry pathway, MCAT percentile and Step 1, **only
  completing more questions remained predictive, and "the impact was small."**
- 48 of 48 (100%) used the UWorld Step 2 CK question bank, rated 4.94/5 for importance.

**DOK 2**
- In the closest population to ours, with near-universal question-bank use and two thirds of students
  reporting deliberate review of incorrects, **the error-review behaviour has no measurable
  association with the outcome, while raw volume of questions does.** That is not proof it does not
  work — the study is small and correlational — but it is the only outcome-linked measurement of the
  practice I could find, and it is null.
- The negative correlations on review books are almost certainly reverse causation (struggling
  students buy more resources), which is a reminder that the positive correlations are equally
  vulnerable. Treat the whole table as hypothesis-generating.
- The 100%/4.94 UWorld figure is the cleanest available evidence that in board prep the *question
  bank* is the product and everything else is auxiliary.

**Limitations.** n = 51, 25% response, single school, self-report, correlational, no effect sizes for
the regression. Small-sample nulls are weak evidence of absence. The authors themselves conclude only
that students should work case-based questions.

---

### 10. LSAT "blind review" — practitioner practice with no research base whatsoever

I searched specifically for empirical evaluation of LSAT blind review and found **none**. Every
source is a test-prep vendor blog or content-marketing page. Representative examples, all
**practitioner opinion, not research**:

- Odyssey Test Prep, "Why Blind Review Should Be a Key Part of Your LSAT Prep Strategy."
  <https://odysseytestprep.com/blog/why-blind-review-should-be-a-key-part-of-your-lsat-prep-strategy/> `[read]`
- Manhattan Prep, "Love Is Blind… But Is Your LSAT Review Process?"
  <https://www.manhattanprep.com/lsat/blog/love-is-blind-but-is-your-lsat-review-process/> `[read]`
- lsatscorecalculator.com, "LSAT Blind Review Method."
  <https://lsatscorecalculator.com/lsat-blind-review-method/> `[read]`

**DOK 1**
- The method as described: take a section timed, mark every uncertain item, re-attempt the marked
  items untimed before seeing the key, then compare timed answers, untimed answers, and the key.
- The lsatscorecalculator page asserts blind review is "the most evidence-backed approach to LSAT
  improvement." **It cites no evidence.** The same page asserts "taking 10 practice sections without
  systematic review produces far less improvement than taking 5 sections with full blind review" —
  again with no source. Manhattan Prep asserts "studies show that taking too many (more than 16!) is
  actually correlated with lower LSAT scores," also uncited.

**DOK 2**
- Two of the three practices blind review bundles *are* independently evidenced, which is probably
  why it survives: the untimed re-attempt is self-generated retrieval on an item you got wrong
  (Metcalfe), and "be able to explain why each answer choice is right or wrong" is an induced
  self-explanation prompt (Bisra et al.). The third component — the accumulated log of patterns — is
  the unevidenced part.
- Worth noting what blind review does that a conventional error log does not: it separates *"wrong
  because I didn't know"* from *"wrong because I ran out of time"* by re-attempting untimed **before**
  seeing the answer. That decomposition is cheap for us to implement and is the only genuinely
  novel idea in the practitioner literature.

**Limitations.** Vendor content with a commercial interest in the method. Uncited statistical claims
in this literature should be treated as fabricated until a source appears.

---

### 11. Chinese error notebooks (`错题本` / `纠错本`, *cuoti ben*) — no retrievable controlled evidence

**DOK 1**
- Searches in English and Chinese returned **no controlled or quasi-experimental study in an
  English-language peer-reviewed journal.** What exists is a large body of Chinese master's theses
  and practitioner periodicals, e.g. "初中数学教学中纠错本运用的实践研究" (a practical study of error-notebook
  use in junior-high mathematics) and "高中化学有效纠错本的建立与实践" (GlobeThesis IDs 2557307070950759 and
  2417330548471817). `[secondary]` — indexed titles and abstracts only; I did not obtain full texts,
  and these are unpublished master's theses.
- One Chinese practitioner article summarises the observed failure mode of the practice as
  **"记得不好，看得不勤，学得不精"** — recorded badly, reviewed infrequently, learned superficially.
  <https://www.ppdoc.com/tags/%E7%BA%A0%E9%94%99%E6%9C%AC> `[abstract]` — this is a search-result
  excerpt from an aggregator page, not a retrieved article, and is practitioner observation.
- The commercial ecosystem is substantial: dedicated loose-leaf error notebooks are mass-market
  retail products, and app implementations (`错题宝`) exist with OCR capture, AI categorisation and
  similar-item generation. <https://azlog.org/posts/错题宝-初中生智能错题管理app-详细方案mimo版/> `[read]` —
  a product design document, not research.

**DOK 2**
- The scale of adoption in Chinese secondary education is enormous and the research base I can reach
  is approximately zero. This is the clearest case in the review of **practice mass vastly exceeding
  evidence mass**, and it should not be read as evidence in either direction.
- The practitioner-reported failure mode is worth taking seriously precisely because it comes from
  people who like the technique: the binding constraint is not capture, it is *review frequency*.
  A digital implementation removes the capture cost, which is the part the practice already does
  well, and does nothing about the part it does badly unless review is scheduled by the system.

**Limitations.** I do not read Chinese academic databases (CNKI) directly and could not access full
texts. There may be controlled studies there. **I cannot claim the practice is unevidenced globally
— only that I could not find evidence.**

---

## Q2. Open learner models

### 12. Long, Y., & Aleven, V. (2013). Supporting Students' Self-Regulated Learning with an Open Learner Model in a Linear Equation Tutor. *AIED 2013*, LNCS 7926, 219–228. `[read]`
<https://www.cs.cmu.edu/~ylong/papers/SupportSRLwithOLM.pdf>

The paper that first demonstrated an OLM causally improving learning, and it is smaller and more
qualified than its reputation.

**DOK 1**
- **2×2 design (OLM present/absent × problem selection present/absent), 62 seventh-graders**, five
  41-minute sessions. **56 reached mastery and were analysed.**
- Main effect of OLM on **overall post-test**: F(3,52) = 4.903, **p = .031, partial η² = .078**.
  On **conceptual items**: F(3,52) = 5.212, **p = .026, η² = .082**. **No significant effect on
  procedural items.**
- Whole-sample pre→post gain: overall F(1,52) = 13.927, η² = .211; procedural F(1,52) = 35.239,
  η² = .404. **No significant improvement on conceptual items overall.**
- Process measures: OLM conditions had marginally fewer incorrect attempts (p = .062, η² = .059) and
  a significantly lower assistance score (p = .009, η² = .116).
- **Self-assessment accuracy: no significant differences among conditions.** Confidence ratings rose
  pre→post in all conditions equally (F(1,52) = 13.078, p = .001, η² = .201).
- **No significant main effect of problem-selection control** on any post-test measure.
- The OLM's three design features were: self-assessment prompts, **delaying the update of the skill
  bars**, and progress information at the problem-type level.

**DOK 2**
- The OLM improved *learning* while leaving *self-assessment accuracy* unchanged. That severs the
  usual causal story ("showing learners the model calibrates them, calibration improves study
  choices, study choices improve learning"). Whatever the OLM did here, it was not calibration.
- The effect landed on **conceptual** items and not procedural ones — i.e., on the thing the tutor
  was *not* directly drilling. Weak but suggestive support for reflective displays affecting
  understanding rather than fluency.
- **Delaying the skill-bar update is a deliberate design choice with a rationale**: it forces the
  learner to self-assess before the system's answer appears. Our error record should consider the
  same — ask the learner to predict before revealing the model's estimate.

**Limitations.** N = 56 analysed, one teacher, three classes, one school, middle-school algebra,
five days. η² ≈ .08 is a small effect. Multiple outcome measures without correction.

### 12b. Long, Y., & Aleven, V. (2017). Enhancing learning outcomes through self-regulated learning support with an Open Learner Model. *User Modeling and User-Adapted Interaction* 27, 55–88. `[abstract]`
<https://dl.acm.org/doi/10.1007/s11257-016-9186-6>

- Two classroom experiments, **302 seventh- and eighth-graders total**.
- **Experiment 1 confirmed** the OLM main effect on learning; no main effect of shared control of
  problem selection; no interaction.
- **Experiment 2, the larger one, did not confirm the main effects.** Only an interaction survived:
  OLM students learned significantly better *when shared control over problem selection was also
  offered*.
- This is the honest state of the strongest OLM evidence: **one small positive, one larger
  non-replication, and a post-hoc interaction.**

---

### 13. Mitrovic, A., & Martin, B. (2002). Evaluating the Effects of Open Student Models on Learning. *Adaptive Hypermedia and Adaptive Web-Based Systems (AH 2002)*, 296–305. `[read]`
<https://files01.core.ac.uk/download/pdf/35457563.pdf>

The most-cited "OLMs help weaker students" result. Its actual numbers are very thin.

**DOK 1**
- SQL-Tutor, 159 enrolled, **100 sat the pre-test**, three groups (control 34, OLM experimental 33,
  problem-selection 33). Use of the system was **voluntary**; 80 logged on, 9 attempted no problems.
- **Only 12 students per group could have pre- and post-tests matched.** Control pre 4.42 → post 6.42;
  experimental pre 4.50 → post 6.67.
- The authors state plainly: **"we have not seen any significant difference in the post-test scores
  of the control and the experimental group."**
- The headline claim rests on a subgroup: less-able experimental students scored higher than less-able
  controls at **t = 1.43, p < 0.1**.
- More-able OLM students abandoned significantly fewer problems.
- None of the session statistics (time, problems solved, completion rate) differed significantly.

**DOK 2**
- A marginal subgroup difference at p < .1 with 12 matched students per cell, in a voluntary-use
  study, is not a finding. When later work — including the 2007 IJAIED paper below — reports that
  "performance of less able students becomes significantly better," it is compressing this.
- I flag this because "OLMs especially help weaker students" is repeated widely and, at its origin,
  it is one marginal subgroup contrast.

### 13b. Mitrovic, A., & Martin, B. (2007). Evaluating the Effect of Open Student Models on Self-Assessment. *International Journal of Artificial Intelligence in Education* 17(2), 121–144. `[abstract]`
<https://doi.org/10.3233/irg-2007-17(2)03>

- Reports skill-meter OLMs in SQL-Tutor and KERMIT. Claims positive effects on learning and
  metacognitive skills; students appreciated access; less-able students' performance "becomes
  significantly better"; OLMs "can help students learn to select better problems."
- I could not retrieve the full text and therefore **cannot verify which of these claims rests on
  new data versus on the 2002 study above.**

---

### 14. Bodily, R., Kay, J., Aleven, V., Jivet, I., Davis, D., Xhakaj, F., & Verbert, K. (2018). Open learner models and learning analytics dashboards: a systematic review. *LAK '18*. `[abstract]`
<https://research.ou.nl/ws/files/9583293/LAK18_OLM_preprint.pdf>

**DOK 1**
- Comparing the OLM and LAD literatures: OLM papers are **interactive in 81% of cases versus 31% for
  LADs**; **report evaluations 76% versus 59%**; **use assessment data 100% versus 37%**; **provide a
  comparison standard 52% versus 38%**; use behavioural metrics **33% versus 75%**.
- In reports of new OLMs, **almost 60% are based on a single type of data**; 30–40% use behavioural
  metrics, support user input, or have complex models; **just 6% involve multiple applications.**

**DOK 2**
- The methodological gap is the useful part: OLM research evaluates more often and uses assessment
  data rather than clickstream. When we borrow evidence for a "show the learner our model" feature,
  we should borrow from the OLM literature, not the dashboard literature — the constructs differ.
- 100% assessment-data usage in OLMs versus 37% in LADs also explains the outcome gap in Q4: most
  dashboards are showing learners *how much they clicked*, which has no reason to change achievement.

**Limitations.** Abstract-only; I did not verify the percentages against the body.

---

### 15. Documented harms and limits of open learner models

The honest summary is that **the OLM literature documents very few harms because it has largely not
looked for them.** What I can support:

- **Distrust / disbelief in the model.** Mitrovic & colleagues (ICCE 2009, EER-Tutor, control =
  skill meters only, experimental = skill meters plus concept list/hierarchy/map): **53% of the
  control group thought the open student model correctly reflected their ability, versus 80% of the
  experimental group** (Fisher's exact, p = 0.1, marginal). `[abstract]`
  <https://library.apsce.net/index.php/ICCE/article/download/44/28/56>
  The implication is that a *coarser* model is *less believed*. Skill meters alone were disbelieved
  by nearly half the students.
- **Overwhelm from complexity.** Guerra et al. (2018), navigation support in complex OLMs: the
  Concept-Circle visualisation was simultaneously among the most-preferred *and* frequently rated
  worst, for "overwhelming" complexity; the authors link this to Mabbott & Bull (2004) finding the
  same visualisation rated best by some students and worst by others. `[abstract]`
  <https://www.lrdc.pitt.edu/schunn/papers/guerra-et-al2018.pdf>
- **Gaming.** I found **no** study measuring learners gaming an open learner model — e.g.
  deliberately answering to move the display. This is a real and obvious risk for a product where
  the model gates content, and it is unstudied.
- **Discouragement.** The Valle et al. (2021b) RCT under Q4 is the only quantified negative-affect
  finding I have: self-efficacy **d = −0.260**, control beliefs **d = −0.243** for dashboard
  exposure. That is a dashboard, not an OLM, but it is the nearest measurement.

---

## Q3. How should error data be aggregated for display?

**The direct comparison the question asks for does not exist.** I found no study comparing
individual-missed-question display against pattern display against skill-summary display against
trend-over-time display, on a learning outcome. What exists is (a) preference studies on OLM
granularity, (b) a reference-frame literature, and (c) an adjacent finding on feedback specificity.
Everything below is weaker than the question deserves.

### 16. Granularity: preference evidence, mixed and self-contradictory

- **Mitrovic et al. (ICCE 2009)**, EER-Tutor, above: given four representations, **53% of the
  experimental group preferred the simple skill meters** and **nobody preferred the concept map** —
  yet the richer model was the one students believed (80% vs 53%). `[abstract]`
- **"Fine-Grained Open Learner Models," UMAP '17** (authors not verified in the record I retrieved).
  Six visualisations of varying complexity screened by questionnaire, then three variants tested in a
  controlled study. The most useful variant for **finding suitable learning material** combined a
  basic coloured grid, an extended bar chart indicating related concepts, and a learning gauge —
  i.e. **a composite, not the simplest option.** `[abstract]`
  <https://doi.org/10.1145/3079628.3079682>
- **Guerra et al. (2018).** Participants significantly preferred all fine-grained options over the
  simple coarse-grained option, F(5,190) = 27.220, p < .001, **partial η² = .417**; Whole-Bars was
  the overall winner; bars beat circles. `[abstract]`
- **"A Fine-Grained Open Learner Model for an Introductory Programming Course," UMAP '18** (authors
  not verified). A fine-grained OLM showing knowledge at both topic and concept level "considerably
  impacts student choice of learning activities, making student learning more efficient," and
  specific design features "could affect students' confidence and persistence." `[abstract]`
  <https://dl.acm.org/doi/10.1145/3209219.3209242>

**DOK 2.** The pattern across these is that learners *say* they prefer simple, *believe* detailed,
and *act better* on composite displays that pair a coarse summary with drill-down. That argues for
a two-level error view — skill-level summary as the default surface, individual items one tap
below — rather than a choice between them. It emphatically does not license claiming that any grain
improves learning; every one of these outcomes is a preference, a belief, or a navigation choice.

**Counter-consideration from within this repo.** Sinharay & Haberman's subscore work, already in
`diagnostic-source-knowledge-tree.md` (entry 4), establishes that reporting grain is constrained by
*measurement*, not only by usability: a subscore needs ~20 items and disattenuated correlation below
0.85 to carry information the total does not. An error display broken out by 422 KCs will be
reporting noise at that grain no matter how well designed the visualisation is. **The measurement
constraint binds before the design constraint does.**

### 17. Reference frames: self versus peers

- **Jivet, I., Scheffel, M., Drachsler, H., & Specht, M. (2017). Awareness is not enough: pitfalls
  of learning analytics dashboards in the educational practice. *EC-TEL 2017*, LNCS 10474, 82–96.**
  `[abstract]` <https://research.ou.nl/ws/files/10647100/115_ECTEL_preprint.pdf>
  Systematic review of the theoretical grounding of learner-facing dashboards. Finding: "current
  designs foster **competition between learners rather than knowledge mastery**, offering misguided
  frames of reference for comparison." Social framing is the most common reference frame, and only
  two theories (social comparison, achievement goal orientation) would justify it.
- **Gallagher et al. (2022), Comparison with Self vs Comparison with Others.** `[abstract]`
  <https://mixality.de/wp-content/uploads/2026/01/Gallagher2022Comparison.pdf>
  Distinguishes progress (temporal, self-referenced) from social reference frames; argues temporal
  comparison drives learners toward detailed task feedback ("what can I do to improve") whereas
  social comparison drives focus on out-performing peers.
- **Harvey & Keyes (2019/2020)**, via Kaliisa et al.'s table: graphs of relative engagement versus
  classmates affected self-esteem with **d = 0.414**, direction depending on whether the information
  shown was positive or negative. `[secondary]`

**DOK 2.** The one aggregation decision with a defensible evidence base is **not to include a peer
comparison in the error record.** Azmat et al. (entry 20) gives the causal version of this at scale.
Temporal self-comparison is the theoretically preferred frame, though I found no experiment showing
it improves outcomes.

### 18. Goodman, J. S., Wood, R. E., & Hendrickx, M. (2004). Feedback Specificity, Exploration, and Learning. *Journal of Applied Psychology* 89(2), 248–262; and Goodman & Wood (2004), *JAP* 89(5), 809–821. `[abstract]`
<https://doi.org/10.1037/0021-9010.89.5.809>

**DOK 1**
- Increasing feedback specificity **improved practice performance but its benefits "did not endure
  over time or modification of the task."**
- Specificity **negatively affected exploration** during practice.
- More specific feedback was **beneficial for learning how to respond to good performance and
  detrimental for learning how to respond to poor performance.**
- Goodman, Wood & Chen (2011, *OBHDP* 115(2), 253–267, 48 trainees, verbal protocol): higher
  specificity **reduced explicit information processing** and reduced exposure to challenging task
  conditions; less specific feedback led to more explicit processing and more exposure.

**DOK 2**
- This is the strongest available argument against maximally granular error display. A record that
  tells the learner exactly which step of which item was wrong is high-specificity feedback: good for
  the next attempt on that item, worse for transfer.
- Applied: the error record should be specific enough to locate the problem and vague enough to
  require the learner to work out the fix. "You missed three acid–base equilibrium items" is
  probably the right grain; "you inverted the Henderson–Hasselbalch ratio on item 4,431" is probably
  over-specified.

**Limitations.** Abstract-only. Managerial simulation tasks (Furniture Factory), small samples
(n = 48 in the 2011 study), organisational-psychology rather than education setting.

---

## Q4. Negative and null findings on dashboards and progress displays

### 19. Kaliisa, R., Misiejuk, K., López-Pernas, S., Khalil, M., & Saqr, M. (2024). Have Learning Analytics Dashboards Lived Up to the Hype? A Systematic Review of Impact on Students' Achievement, Motivation, Participation and Attitude. *LAK '24*. `[read]`
<https://dl.acm.org/doi/fullHtml/10.1145/3636555.3636884>

The single best source for characterising this evidence base honestly, because it publishes the
per-study effect-size table rather than a pooled number.

**DOK 1**
- 527 records after deduplication → **38 studies** meeting criteria (empirical, quantitative,
  controlled design, peer-reviewed).
- Study designs: **57.9% quasi-experimental, 23.7% RCT (9 studies), 15.8% single-group.**
  68.4% higher education. 50% STEM.
- **Achievement: 14 studies (41.2%) negligible, 12 (35.3%) small — 26 of 34 (76.5%) negligible or
  small.** 3 (8.8%) medium, 5 (14.7%) large.
- **Every medium and large effect is confounded.** Two of the three medium effects compared dashboard
  users against non-users; the third measured a teacher intervention triggered by the dashboard. Two
  of the five large effects compared usage levels; one compared a technology-enabled arm against
  paper-and-pen; two measured collaborative activities.
- **"Our systematic review did not include a single well-powered controlled study that assessed a
  LAD with properly randomised samples."**
- Sample size ran opposite to effect size: all large-effect studies were underpowered, while the
  largest studies reported near-zero — **Davis et al. (2016), RCT, N = 3,188: pass rate d = 0.093**;
  **Hellings et al. (2022), RCT, N = 556: course grade d = 0.110**; **Amarasinghe et al. (2020), RCT,
  N = 813: perceived learning outcomes d = 0.103**.
- **Motivation and attitudes skew negative in the well-designed studies.** Valle et al. (2021b), RCT,
  N = 146: quiz grade **d = 0.002**, final exam **d = 0.017**, intrinsic goal **d = −0.060**,
  extrinsic goal **d = −0.338**, task value **d = −0.023**, control beliefs **d = −0.243**,
  **self-efficacy d = −0.260**, test anxiety d = −0.145. Aguilar et al. (2021), N = 202: effort and
  persistence **d = −0.295**. Yang et al. (2022), RCT, N = 47: learning motivation d = −0.011,
  reading speed d = −0.006. Toyokawa et al. (2023): vocabulary **d = −0.487**.
- **Participation is the one bright spot**: LMS access d = 0.821, discussion threads d = 1.379,
  discussion board access d = 0.916 (Aljohani et al. 2019, quasi-experimental, N = 86); unique
  reading days d = 0.890, books d = 0.655, minutes d = 0.649 (Yang et al. 2022).
- Authors' conclusion, verbatim: **"As we currently stand, there is no evidence to support the
  conclusion that LADs can improve academic achievement."**
- They **could not perform a meta-analysis** because too few studies reported congruent designs and
  complete statistics.

**DOK 2**
- The most important structural finding is that **dashboards move behaviour but not learning.**
  Participation effects are medium-to-large and achievement effects are zero. The obvious reading is
  that dashboards induce activity that is not itself productive — clicking, logging in, posting —
  which is exactly the failure mode an error display invites (opening the error list feels like
  studying).
- **The negative motivation coefficients are concentrated in the RCTs.** Valle et al. is the
  best-designed motivation measurement in the set and every construct it measured moved the wrong
  way or not at all. Self-efficacy at d = −0.26 from a dashboard is a real, if small, documented
  harm and directly answers the question about discouragement.
- The users-vs-non-users confound is worth naming explicitly because we will be tempted by it: our
  own analytics will show that learners who use the error view score better, and that comparison is
  worthless.

**Limitations.** No pooled estimate, so "76.5% negligible or small" is vote-counting. Effect sizes
were converted to Cohen's d across heterogeneous measures. Publication bias is not assessed. The
review covers dashboards generally, most of which display behavioural rather than assessment data —
which, per Bodily et al., makes them a pessimistic comparator for an assessment-based error record.

**Counterevidence to hold alongside it.** Two meta-analyses report positive pooled effects for
*learning analytics interventions* more broadly: 23 studies / 9,710 participants, **g = 0.359,
95% CI [0.230, 0.487]** (*Journal of Research on Technology in Education*, 2025,
<https://doi.org/10.1080/15391523.2025.2536571>, `[abstract]`), and 33 studies / 3,098 participants
reporting "a large effect size" (Zheng et al., *Interactive Learning Environments*, 2023,
<https://doi.org/10.1080/10494820.2023.2255231>, `[abstract]`). **These are not in direct conflict
with Kaliisa et al.** — "learning analytics intervention" includes instructor-triggered outreach,
adaptive content, and early-warning systems, not just showing a display to a learner — but I have
not verified their inclusion criteria, and anyone citing the dashboard evidence as uniformly null
should be shown these two first.

---

### 20. Azmat, G., Bagues, M., Cabrales, A., & Iriberri, N. (2019). What You Don't Know… Can't Hurt You? A Natural Field Experiment on Relative Performance Feedback in Higher Education. *Management Science* 65(8), 3714–3736. `[read]` (IZA DP 9853 working-paper version)
<https://docs.iza.org/dp9853.pdf> · <https://doi.org/10.2139/ssrn.2757963>

**DOK 1**
- Randomised field experiment at Universidad Carlos III, a cohort of ~1,000 students (per J-PAL: 977
  students, **354 treatment / 623 control**), feedback on decile rank in the grade distribution
  refreshed **every six months over three years**.
- Baseline miscalibration: **the average student's prediction of their own rank was off by 22
  percentiles and underestimated it by 18 percentiles.** Gender, entry grade and first-year
  performance explain ~50% of that gap; underestimation was stronger among women.
- **Treatment significantly improved self-assessment accuracy** and **significantly increased
  self-reported satisfaction**.
- **Treatment significantly reduced academic performance.** The published/HAL version reports
  **0.36 fewer exams passed (0.1 SD)** and **GPA lower by 0.20 SD, significant at 1%**. The SSRN
  working-paper text I read instead reports **GPA 0.05 SD lower and 0.4 fewer course modules
  (0.1 SD)**. **The two versions disagree on the GPA magnitude by a factor of four**; the exam-count
  effect is stable. I have not resolved which is authoritative.
- The effect is **driven by students who had been underestimating their rank** — i.e. by those for
  whom the feedback was *good news*. Students who had been overestimating "if anything, respond
  positively."
- **Effects are short-lived**: after end-of-year resit opportunities, treated students had completed
  the same number of modules, and by graduation accumulated GPA and graduation rates were similar.

**DOK 2**
- This is the cleanest causal evidence anywhere in the review that **an accurate performance display
  can reduce performance while increasing satisfaction.** Both halves matter for us: a feature can
  test well on self-report and damage the outcome.
- The mechanism is the load-bearing part: harm came from *favourable* information relieving effort.
  An MCAT error record that says "you have fixed most of your gaps" is the analogous message, and it
  will land on the students who were unduly pessimistic — a large group among pre-meds.
- "Effects wash out by graduation" is cold comfort in our setting. MCAT preppers have a single
  administration and no resit window inside their study cycle. **A transient effect over one
  semester maps onto a permanent effect for us.**

**Limitations.** Rank feedback is a social reference frame, which is the specific thing Jivet et al.
warn against; an error record with no peer comparison is a different object. Spanish economics
undergraduates. Version disagreement on the headline number, noted above.

---

### 21. Macnamara, B. N., & Burgoyne, A. P. (2023). Do growth mindset interventions impact students' academic achievement? A systematic review and meta-analysis with recommendations for best practices. *Psychological Bulletin* 149(3–4), 133–173. `[abstract]`
<https://doi.org/10.1037/bul0000352> · preprint <https://doi.org/10.31234/osf.io/ba7pe>

**DOK 1**
- Across all studies, **d̄ = 0.05, 95% CI [0.02, 0.09]** — **non-significant after correcting for
  publication bias.**
- Restricted to studies where the intervention demonstrably shifted mindsets as intended
  (13 studies, N = 18,355): **d̄ = 0.04, 95% CI [−0.01, 0.10]**, non-significant.
- Restricted to the highest-quality evidence (6 studies, N = 13,571): **d̄ = 0.02,
  95% CI [−0.06, 0.10]**, non-significant.
- Authors note financial incentives among some intervention authors, and conclude apparent effects
  "are likely attributable to inadequate study design, reporting flaws, and bias."
- For contrast, Sisk et al. (2018) found **d̄ = 0.08, 95% CI [0.02, 0.14]** and themselves cautioned
  that claims of "large gains" are unwarranted.

**DOK 2**
- Growth-mindset framing is the default rhetorical solution to "how do we show failure kindly," and
  its meta-analytic effect on achievement is indistinguishable from zero. **Framing copy is not a
  countermeasure to a demotivating display**; it is at best free.

---

## Q5. Framing effects on displaying failure

### 22. Yeager, D. S., et al. (2019). A national experiment reveals where a growth mindset improves achievement. *Nature* 573, 364–369. `[read]` (targeted: primary outcome and moderator sections)
<https://www.nature.com/articles/s41586-019-1466-y>

**DOK 1**
- Stratified random sample of **65 US high schools**, ninth-graders individually randomised, short
  online intervention.
- Pre-registered primary outcome, lower-achieving students (**n = 6,320, k = 65**): **B = 0.10 grade
  points, 95% CI [0.04, 0.16], SE = 0.03, t = 3.51, P = 0.001, standardized effect size 0.11.**
- Effects were **smaller in higher-achieving schools**: interaction B = −0.07, SE = 0.03, z = −2.76,
  P = 0.006, β = −0.25.
- Effects were **larger where peer norms supported challenge-seeking**: interaction B = 0.11,
  95% CI [0.01, 0.21], z = 2.18, P = 0.029, β = 0.23.
- Per the associated press release: the intervention reduced the proportion of lower-achieving
  students with a D or F average by over 5 percentage points overall, and by 8 points in
  medium/lower-performing schools with supportive norms. `[secondary]`

**DOK 2**
- Read together with Macnamara & Burgoyne: the best-designed single trial finds a real but very
  small effect (0.11 SD) **concentrated in low achievers in contexts where the surrounding norms
  already support challenge**. The norms moderator is the transferable design idea — the framing has
  to be reinforced by what the product actually rewards, not just by the words on the error screen.
- Our population is not the population where this worked. Pre-meds are high-achieving and
  self-selected; the intervention's benefit was specific to lower-achieving students.

**Limitations.** One intervention, one country, ninth grade, GPA outcome, effect size 0.11. The
moderator analyses are the paper's most-contested claims.

---

### 23. Error climate: Steuer, G., Rosentritt-Brunn, G., & Dresel, M. (2013). Dealing with errors in mathematics classrooms: Structure and relevance of perceived error climate. *Contemporary Educational Psychology* 38(3), 196–210. `[abstract]`
<https://doi.org/10.1016/j.cedpsych.2013.03.002>
and "Positive error climate promotes learning outcomes through students' adaptive reactions towards errors" (2022). *Learning and Instruction* 80, 101627. `[abstract]` — authors not verified.
<https://doi.org/10.1016/j.learninstruc.2022.101627>
and "Learning from errors in mathematics classrooms: Development over 2 years in dependence of perceived error climate" (2024). *British Journal of Educational Psychology*. `[abstract]` — authors not verified.
<https://doi.org/10.1111/bjep.12697>

**DOK 1**
- Two distinct constructs, empirically separable across at least five studies: **affective–motivational
  adaptivity** (maintaining positive affect and motivation after an error) and **action adaptivity**
  (initiating cognitive work to overcome the misconception). Measured by a validated 13-item scale
  (6 + 7 items).
- **Affective–motivational adaptivity predicts action adaptivity, but not the reverse**
  (Grassinger et al. 2018).
- Perceived error climate predicts both, **above and beyond classroom goal structures and personal
  achievement motivation** (Steuer et al. 2013), and is partially mediated onto the quantity and
  self-regulation of student effort.
- Across mathematics, German and English, the error-climate → **affective–motivational** link is
  consistently stronger (β = .48 / .52 / .55) than error-climate → **action** (β = .43 / .42 / .45);
  explained variance r² = .30 to .70. From "Is dealing with errors in the classroom specific for
  school subjects?" (2020), *European Journal of Psychology of Education*,
  <https://doi.org/10.1007/s10212-020-00525-x>, `[abstract]`.
- Longitudinally, reactions to errors **decline over two years**, and a positive perceived error
  climate slows but does not reverse that decline.

**DOK 2**
- The causal ordering is the design instruction: **you cannot get a learner to work productively on
  an error until they can look at it without dropping motivation.** Affective adaptivity is the
  gate. A product that opens with a wall of accumulated failures is optimising the second construct
  while damaging the first, which the mediation says is backwards.
- The two-year decline is a caution about the long horizon we care about. Whatever error framing we
  ship should be expected to lose potency over months of study, not hold constant.

**Limitations.** All correlational / longitudinal survey work with self-reported climate; no
experimental manipulation of error climate that I retrieved. School mathematics classrooms in
Germany and Italy, adolescent samples. Effect sizes are standardised regression coefficients from
multilevel models, not intervention effects.

---

### 24. Metcalfe (2017) on emotional consequences — `[read]`, same source as entry 1

**DOK 1**
- Metcalfe's overall verdict: "The concern that errors might evoke dysfunctional emotional reactions
  **appears to be exaggerated.**"
- The error-related negativity ERP literature is about simple motor slips and its relation to
  cognitive errors is unclear; the fronto-central negativity Butterfield & Mangels (2003) found in
  the hypercorrection paradigm "was not correlated in any discernible way with error correction."
- The fMRI activation to high-confidence error feedback peaked in areas "most strongly associated
  with cognition rather than emotion."
- Documented severe emotional consequences (physician and police error literature) concern **errors
  on the test that counts**, not practice errors, and Metcalfe explicitly excludes them.
- **Regulatory focus matters**: prevention-focused individuals are demotivated by failure on a
  difficult task and produce fewer solutions (Crowe & Higgins 1997); Metcalfe & Miele (2014) found
  prevention-focused learners showed a larger *immediate* hypercorrection effect that did not persist
  at delay, **with no overall learning differences**.
- Buffering works: Heimbeck et al. (2003) found EMT's benefit **improved when participants received
  instructions designed to counteract the negative emotional connotations of errors**; Cohen et al.
  (2009) self-affirmation reduces stereotype-threat stress.

**DOK 2**
- The best available answer to "does showing accumulated mistakes hurt?" is: **the practice-error
  literature says less than product intuition assumes**, and the demonstrated harms in this review
  come from *rank and dashboard displays* (Azmat; Valle) rather than from error content itself.
- "Errors are diagnostic information" framing has a specific empirical warrant — Heimbeck et al. and
  the Keith & Frese error-encouragement moderator (d = 0.19 on its own) — which "growth mindset"
  framing does not. **Prefer error-management framing to mindset framing**; it is the same cost and
  it is the one with a controlled result behind it.

---

## Q6. When to surface an error record

### 25. Fyfe, E. R., et al. (2021). ManyClasses 1: Assessing the Generalizable Effect of Immediate Feedback Versus Delayed Feedback Across Many College Classes. *Advances in Methods and Practices in Psychological Science* 4(3). `[read]`
<https://journals.sagepub.com/doi/10.1177/25152459211027575>

**DOK 1**
- **38 classes across 15 institutions**, 2,917 enrolled, **2,081 participating students** in the
  final analysis; within-student randomisation of Canvas quiz feedback to immediate or
  delayed-by-a-few-days.
- **Overall effect of feedback timing: Δz = 0.002, 95% HDI [−0.05, 0.05].** With incentive to view
  feedback: 0.00, HDI [−0.06, 0.06]. Without: 0.00, HDI [−0.08, 0.08]. Difference between incentive
  conditions: 0.00, HDI [−0.10, 0.10].
- Between-class heterogeneity was small: SD of class effects **0.06**, HDI [0.01, 0.14] and
  [0.0004, 0.16].
- **Every moderator's 95% HDI contained zero.** The closest to crossing was the proportion of
  retrieval-based exam items.
- Authors' inference: "under routine implementations… there is no broadly generalizable difference
  in learning performance… when students receive immediate feedback compared with delayed feedback."
- Caveat they raise themselves: 17 of 38 classes had only one or two quizzes per condition, so the
  high-dosage region of the design space is thinly sampled and uncertain.

**DOK 2**
- The best-powered, most ecologically valid test of feedback timing in existence finds **nothing**.
  The strong prior that error information must be delivered immediately after a session is not
  supported.
- This is liberating rather than constraining: **because timing does not appear to matter for
  learning, we should schedule the error record on whatever cadence maximises the behaviour we
  want** — which, per Chen et al., is pre-exam planning, and per Karpicke & Roediger, is
  re-retrieval.

**Limitations.** "Delayed" meant a few days, not weeks. Canvas quizzes in college classes; outcomes
were subsequent class assessments. Within-student design, so it tests timing, not
presence-versus-absence of feedback.

---

### 26. Kandemir, E. N., et al. (2026). A Meta-Analysis of the Impact of Feedback Timing on Learning Outcomes in Computer-Assisted Learning. *Educational Psychology Review* 38(1), 13. `[abstract]`
<https://hal.science/hal-05546645v1/file/Meta_HAL_submission.pdf> · doi:10.1007/s10648-026-10117-8

**DOK 1**
- **51 studies, 1988–2024, 160 effect sizes**, meta-regression with robust variance estimation.
- **g = 0.03, 95% CI [−0.08, 0.13], p = .61.** Substantial between-study heterogeneity.
- Delays ranged from **1 second to 7 days** (time-based) and **1 to 60 intervening items**
  (item-based).
- Significant moderators: educational level, learning domain, response-time constraints — but the
  authors note **partial confounding of moderators** limits interpretation.
- Explicit limitation: **"relatively few studies involving delays of one day or longer,"** so the
  multi-day delays typical of real study schedules are poorly covered.
- Supersedes Kulik & Kulik (1988), the previous meta-analysis (53 studies), which had found
  immediate better in classrooms and delayed better in laboratories. `[secondary]`

**DOK 2**
- Converges with ManyClasses on approximately zero. Two independent syntheses agreeing on a null is
  as good as this literature gets.
- The gap both papers flag — delays longer than a day — is exactly our regime. **An error record
  reviewed weekly or pre-exam is outside the evidence base of both.** We would be extrapolating.

---

### 27. Metcalfe et al. (2009) on delayed feedback, reported in Metcalfe (2017) `[secondary]`

- Immediate feedback versus feedback delayed by up to a week, **with lag-to-test controlled at one
  week from feedback in both conditions**, and with attention to feedback enforced (participants had
  to type the answer).
- **College students performed equally well in immediate and delayed conditions. Children in grades
  3–5 did better with delayed feedback.**
- Metcalfe's synthesis of the Kulik & Kulik classroom/lab split: the operative variable is **whether
  the learner attends to the feedback**, not the delay itself. Classroom learners attend immediately
  after a test and "their interest flags with a long delay, especially if the feedback is cursory."

**DOK 2.** This is the most useful timing heuristic in the review and it is not about timing:
**delay is free as long as attention is re-engaged.** If the error record is surfaced days later, it
must reignite interest in the question — which argues for surfacing it as a *re-attempt* (the
learner has to answer again) rather than as a *summary* (the learner has to read).

---

### 28. Timing evidence from the intervention literature

- **Chen et al. (2017)**, entry 8: the intervention that worked was administered **before each
  exam**.
- **Exam wrappers**, entry 7: administered **after each exam**, and mostly did not work. One
  quasi-experimental study in the wrapper review (Angell et al. 2024, Biology, N = 233) reported that
  **pre-exam** assignment wrappers produced moderate score increases specifically for students with
  lower incoming standardised test scores. `[secondary]`
- I found **no** study comparing on-demand access against system-pushed delivery of a learner-facing
  performance record.

**DOK 2.** The pre/post contrast is confounded with everything else that differs between these
interventions, and one should not over-read it. But it is consistent, it is consistent with Chen's
mediation through resource use, and it costs nothing to adopt: **anchor the error record to an
upcoming event rather than a completed one.**

---

## The five most valuable sources, ranked

1. **Karpicke & Roediger (2008), *Science*.** Because it is the only source that directly tests the
   architectural premise of an error log — concentrate practice on what you got wrong — and finds it
   halves retention. 80% versus 33–36%, d = 4.03, non-overlapping distributions, and learners
   completely blind to the difference. Nothing else in the review is this decisive about a design
   decision we are actually about to make.

2. **Metcalfe (2017), *Annual Review of Psychology*.** The authoritative synthesis of whether
   engaging with errors helps, and the source of the two constraints that determine whether our
   feature is worth building at all: errors must be **self-generated** (experimenter-presented errors
   *harmed* memory), and feedback must contain the **correct answer**. It also hands us a free
   prioritisation rule in hypercorrection, and it is candid that the closest institutional analogue
   (after-action review) has almost no experimental support.

3. **Kaliisa et al. (2024), *LAK '24*.** The honest characterisation of the dashboard evidence base
   that the brief asks for, with the per-study table to back it: 76.5% of achievement effects
   negligible or small, every large effect confounded, not one well-powered randomised study in the
   whole corpus, and a set of *negative* motivation coefficients (self-efficacy d = −0.26) from the
   best-designed RCT in the set. If we ship a display and measure user-versus-non-user grade
   differences, this paper is the reason that number will be meaningless.

4. **Azmat, Bagues, Cabrales & Iriberri (2019), *Management Science*.** The causal demonstration
   that an accurate performance display can **raise satisfaction and lower performance
   simultaneously**, driven by learners who discover they were doing better than they thought. It
   also quantifies baseline miscalibration (off by 22 percentiles, underestimating by 18), which is
   the strongest available justification for showing learners *anything* — and then shows that
   fixing the miscalibration is what caused the harm.

5. **Keith & Frese (2008), *Journal of Applied Psychology*.** The only meta-analysis on
   deliberately error-centred instruction, and its moderator structure is directly actionable:
   effects appear in transfer (d = 0.56) not within-training performance (d = 0.15, ns), and are
   largest for structurally novel problems (d = 0.80) — which is what the MCAT is. It also isolates
   error-encouragement framing as an independently effective component (d = 0.19), giving us an
   evidence-backed alternative to growth-mindset copy.

*Runners-up worth reading:* Bisra et al. (2018) for the self-explanation effect size that justifies
the reflective prompt; Fyfe et al. (2021) for the timing null; Long & Aleven (2013/2017) as the
honest high-water mark of OLM evidence.

---

## Evidence-backed versus widespread practice

**This distinction is the most important output of the review, and the gap is very wide.**

### Widespread practice with no supporting research I could find

- **The error notebook as an artifact.** No controlled study, in any language I could access, of
  keeping and reviewing a personal log of missed questions. The Chinese `cuoti ben` tradition is
  enormous — mass-market stationery, dedicated apps, a whole genre of teacher-facing periodical
  articles — and the retrievable research is master's theses I could not obtain.
- **LSAT blind review.** Zero research. Every source is a prep-company blog. At least one vendor page
  calls it "the most evidence-backed approach to LSAT improvement" while citing nothing, and two
  separate pages make uncited quantitative claims ("more than 16 practice tests correlates with
  lower scores"; "5 sections with blind review beats 10 without"). Treat these as marketing.
- **The USMLE "review your incorrects" protocol.** Universal advice in board prep. The one study that
  measured it against an outcome (Drake et al. 2021) found no association, while raw question volume
  survived regression. The elaborate error-taxonomy protocols circulating in Step 2 CK prep
  ("classify each miss as content / reasoning / execution") are practitioner opinion published on
  coaching sites, with no evaluation whatsoever.
- **Comparing yourself to other test-takers.** Ubiquitous in test-prep products. The one causal
  experiment on rank feedback in education found it *reduced* performance.
- **Any specific display grain.** Nobody has compared item-level, pattern-level, skill-level and
  trend displays on a learning outcome. Every product that claims its analytics view is
  evidence-based is overstating.
- **Gaming of open learner models.** Unstudied, despite being an obvious risk.

### Evidence-backed

- **Generating an error and then receiving the correct answer improves memory for the correct
  answer** — provided the error is related to the target and self-generated. Many controlled
  experiments; ~20% benefit in Huelser & Metcalfe.
- **High-confidence errors are corrected preferentially.** Replicated across behavioural, ERP and
  fMRI paradigms, at immediate and delayed retest.
- **Prompted self-explanation improves learning**, g = 0.55, 95% CI [0.45, 0.65], 69 effects,
  5,917 participants.
- **Error-encouraging training beats error-avoidant training on transfer**, d = 0.56, and on
  structurally novel problems, d = 0.80.
- **Repeated retrieval, including of already-correct items, is what produces retention**;
  dropping correct items from re-testing is catastrophic (80% → 33–36%).
- **Learners cannot predict which study method worked.** Karpicke & Roediger's judgements were
  uncorrelated with an outcome range of 33–80%; Huelser & Metcalfe's participants believed the
  condition that lost by 20 points had won.
- **Learners systematically misjudge their standing** — off by 22 percentiles on average, biased
  toward underestimation.

### Evidenced *against*, or evidenced as null

- **Post-exam reflection worksheets (exam wrappers) do not improve achievement.** Multiple RCTs
  including N = 752 and N = 86.
- **Learner-facing dashboards do not improve achievement**, and the best-designed RCT in the corpus
  found negative effects on self-efficacy, control beliefs and extrinsic goal orientation.
- **Relative-rank feedback reduces performance** while increasing satisfaction.
- **Growth-mindset framing has an achievement effect indistinguishable from zero** in the
  bias-corrected meta-analysis, and 0.11 SD in the best single trial, in a population unlike ours.
- **Feedback timing (immediate vs. a few days delayed) does not matter**, per two independent
  syntheses.
- **Detailed, highly specific feedback helps immediate performance and hurts transfer.**

### The synthesis this implies

The evidenced components are all about **doing something with an error**, and the unevidenced or
counter-evidenced components are all about **looking at a record of errors**. The distinction is not
subtle and it maps cleanly onto a build decision:

> A queue that makes you re-attempt items you got wrong, prioritised by how confident you were when
> you got them wrong, prompting you to explain why the right answer is right, scheduled around an
> upcoming full-length, and layered on top of — never replacing — continued retrieval of material you
> have already got right, is assembled entirely from evidenced parts.
>
> A screen that shows you your accumulated mistakes is assembled entirely from parts that have been
> tested and found not to work.

Those two things are easily confused in a product spec, and they cost about the same to build.

---

## What I could not find or verify

**Could not find:**

1. **Any direct evaluation of an error log / error notebook / mistake record** as an intervention,
   in any domain, in any language I could search. This is the central gap and it is total.
2. **Any comparison of display aggregations** — individual items vs. patterns vs. skill summaries
   vs. trends — against a learning outcome. The question in the brief cannot be answered from the
   literature.
3. **Any study of when to surface a performance record** (immediately / weekly / pre-exam /
   on demand). Feedback-timing research covers seconds to a few days; the multi-day and multi-week
   regime is explicitly flagged as under-studied by the 2026 meta-analysis itself.
4. **Any study of learners gaming an open learner model**, despite gaming being well documented for
   ITS hint systems generally.
5. **Any research on `cuoti ben` in an English-language peer-reviewed venue.** I could not access
   CNKI; there may be Chinese-language empirical work I am blind to. **I am not claiming the practice
   is unevidenced — only that I could not reach the evidence.**
6. **Any evaluation of blind review, error-type taxonomies, or "distractor reset" protocols** in
   LSAT or medical board prep.
7. **Any study of long-run engagement with an error record.** Everything here is days to one
   semester. Our horizon is months, and the one longitudinal error-related finding (Steuer et al.,
   BJEP) is that reactions to errors *decay* over two years.
8. **Any error-log or OLM research in a high-stakes, single-administration, adult, self-funded
   population.** Every population in this review is enrolled students, mostly in low-stakes course
   contexts. Pre-meds paying for MCAT prep are a different animal on motivation, self-selection and
   consequence.

**Could not verify:**

- **Azmat et al.'s headline GPA effect.** The SSRN working paper says 0.05 SD; the HAL 2018 version
  and the published abstract say 0.20 SD. A fourfold discrepancy on the paper's central number that
  I did not resolve. The 0.36-fewer-exams figure is consistent across versions.
- **Mitrovic & Martin (2007) IJAIED.** I could not retrieve it and therefore cannot tell which of its
  claims rest on new data and which restate the 2002 study, whose actual result was a null main
  effect with a p < .1 subgroup contrast on 12 matched students per cell.
- **Große & Renkl (2007) effect sizes.** Abstract only; the aptitude–treatment interaction direction
  is well attested but I did not verify magnitudes or how prior knowledge was split.
- **The two positive learning-analytics meta-analyses** (g = 0.359; "large effect size"). Abstracts
  only. Their inclusion criteria almost certainly differ from Kaliisa et al.'s, but I did not check,
  and until someone does, the claim "the dashboard evidence is null" is not fully safe.
- **Chen et al. (2017) percentage-point figures** (+3.45, +4.65). These come from a Stanford press
  release, not the paper.
- **The exam-wrapper review's journal of publication.** ERIC EJ1479768; the retrieved PDF did not
  make the venue clear, and the review used snowball rather than systematic sampling.
- **Yeager et al.'s D/F reduction figures** (5 and 8 percentage points). From the press release; the
  GPA figures I did verify in the paper.
- **Everything attributed to the Chinese practitioner literature**, which I saw only as
  search-aggregator excerpts.
