import type { SkillCluster } from '@mcat/contracts';
import type { ChoiceLetter } from '../schema';

/**
 * Synthetic v7 diagnostic fixture corpus (diagnostic-synthetic-v1).
 *
 * These are SHADOW / provisional items — authored to be MCAT-authentic (one
 * clearly-correct answer, plausible misconception distractors) but NOT yet
 * calibrated or SME-certified. They exist so the balanced-adaptive diagnostic
 * has a real, coverage-complete pool to route over. They are `test_only` and
 * MUST NOT be published to a production release.
 *
 * Routing: each item carries a real V3 `lesson_id` so it resolves through the
 * production `resolveV7Placement` adapter (KC/lesson → one of the 15 clusters).
 * One cluster the pinned V3 registry does not yet map to a lesson (PS1 —
 * Research & Statistics) uses an explicit `cluster_hint` fallback; see
 * `../v7-cluster-map.ts` for the adapter seam.
 */

/** One representative V3 lesson id per cluster (drives the adapter). null = registry gap. */
export const CLUSTER_LESSON: Readonly<Record<SkillCluster, string | null>> = {
  R1: 'V3-LES-130923',
  R2: 'V3-LES-128144',
  R3: 'V3-LES-275615',
  CP1: 'V3-LES-094421',
  CP2: 'V3-LES-020428',
  CP3: 'V3-LES-041222',
  BB1: 'V3-LES-207028',
  BB2: 'V3-LES-044045',
  BB3: 'V3-LES-006619',
  BB4: 'V3-LES-018986',
  PS1: null, // registry gap: no V3 lesson maps to PS1 yet -> cluster_hint fallback
  PS2: 'V3-LES-053947',
  PS3: 'V3-LES-134007',
  CA1: 'V3-LES-505131',
  CA2: 'V3-LES-095827',
};

/** v7 section code for each cluster's rollup. */
export const CLUSTER_V7_SECTION: Readonly<Record<SkillCluster, 'CP' | 'BB' | 'PS' | 'CARS'>> = {
  R1: 'CP',
  R2: 'CP',
  R3: 'CP',
  CP1: 'CP',
  CP2: 'CP',
  CP3: 'CP',
  BB1: 'BB',
  BB2: 'BB',
  BB3: 'BB',
  BB4: 'BB',
  PS1: 'PS',
  PS2: 'PS',
  PS3: 'PS',
  CA1: 'CARS',
  CA2: 'CARS',
};

export interface DiagnosticDraft {
  cluster: SkillCluster;
  /** Family suffix; items sharing a family are locally dependent (one confirmation). */
  family: string;
  stem: string;
  choices: { A: string; B: string; C: string; D: string };
  correct: ChoiceLetter;
  explanations: { A: string; B: string; C: string; D: string };
  passage?: string;
  dok?: number;
  /**
   * Pins the lesson an item routes through, overriding `CLUSTER_LESSON[cluster]`.
   * Used only by the FC-coverage generator below, so a synthetic item can be
   * placed on a specific Foundational Concept regardless of which cluster its
   * lesson happens to roll up to.
   */
  lessonId?: string;
}

/**
 * The hand-authored drafts. >= 2 families per cluster and enough per section to
 * clear the DiagnosticConfig floors (cp>=8, cars>=6, bb>=8, ps>=8). These carry
 * MCAT-authentic content and drive the cluster-15 coverage the bank tests pin.
 *
 * They are combined with the FC-coverage generator (below) to form
 * `DIAGNOSTIC_DRAFTS`, the corpus the bank actually builds from.
 */
const HAND_AUTHORED_DRAFTS: readonly DiagnosticDraft[] = [
  // ---- R1 Quantitative Reasoning (cp) ----
  {
    cluster: 'R1',
    family: 'units',
    stem: 'A drug is dosed at 5 mg per kg of body mass. For a 70 kg patient, what single dose is required?',
    choices: { A: '35 mg', B: '75 mg', C: '350 mg', D: '3500 mg' },
    correct: 'C',
    explanations: {
      A: 'This subtracts rather than multiplies the rate by the mass.',
      B: 'This adds the two numbers instead of applying the per-kg rate.',
      C: 'Correct: 5 mg/kg × 70 kg = 350 mg, and the kg units cancel.',
      D: 'This is off by a factor of ten — a common place-value slip.',
    },
    dok: 1,
  },
  {
    cluster: 'R1',
    family: 'scaling',
    stem: 'If a spherical cell doubles its radius, by what factor does its surface area increase?',
    choices: { A: '2', B: '4', C: '6', D: '8' },
    correct: 'B',
    explanations: {
      A: 'Surface area does not scale linearly with radius.',
      B: 'Correct: area ∝ r², so doubling r multiplies area by 2² = 4.',
      C: 'This is neither the area nor the volume scaling factor.',
      D: 'This is the volume factor (r³), not surface area.',
    },
    dok: 2,
  },
  // ---- R2 Data & Representations (cp) ----
  {
    cluster: 'R2',
    family: 'slope',
    stem: 'On a plot of reaction rate (y) versus substrate concentration (x), the curve rises steeply then flattens. What does the flattening region indicate?',
    choices: {
      A: 'Rate increases without bound',
      B: 'The enzyme is approaching saturation',
      C: 'Substrate is being consumed faster than added',
      D: 'The reaction has reversed direction',
    },
    correct: 'B',
    explanations: {
      A: 'A plateau means the rate is no longer increasing.',
      B: 'Correct: a plateau in a rate-vs-[S] curve reflects enzyme saturation (Vmax).',
      C: 'The plot shows rate versus concentration, not a time course of consumption.',
      D: 'Nothing on the axes indicates a reversal of direction.',
    },
    dok: 2,
  },
  {
    cluster: 'R2',
    family: 'logaxis',
    stem: 'A quantity plotted on a logarithmic y-axis appears as a straight line. What does this imply about the underlying growth?',
    choices: {
      A: 'Linear growth',
      B: 'Exponential growth',
      C: 'No growth',
      D: 'Growth that is slowing over time',
    },
    correct: 'B',
    explanations: {
      A: 'Linear growth is a straight line on linear axes, not log axes.',
      B: 'Correct: a straight line on a log axis indicates a constant fractional (exponential) rate.',
      C: 'A horizontal line would indicate no growth; the line has slope.',
      D: 'A concave-down curve on log axes would suggest slowing growth.',
    },
    dok: 2,
  },
  // ---- R3 Experiments & Evidence (cp) ----
  {
    cluster: 'R3',
    family: 'control',
    stem: 'To test whether a fertilizer increases plant height, which comparison best isolates the fertilizer’s effect?',
    choices: {
      A: 'Fertilized plants in sun vs. unfertilized plants in shade',
      B: 'Fertilized plants vs. identical unfertilized plants under the same conditions',
      C: 'Fertilized plants measured before vs. after watering',
      D: 'Fertilized plants of one species vs. unfertilized plants of another',
    },
    correct: 'B',
    explanations: {
      A: 'Light differs between groups, confounding the fertilizer effect.',
      B: 'Correct: holding all else constant isolates the single manipulated variable.',
      C: 'Watering is a second change, and there is no unfertilized control.',
      D: 'Species differences confound the comparison.',
    },
    dok: 2,
  },
  {
    cluster: 'R3',
    family: 'causation',
    stem: 'A study finds coffee drinkers have lower rates of a disease. Which conclusion is best supported?',
    choices: {
      A: 'Coffee prevents the disease',
      B: 'The disease prevents coffee drinking',
      C: 'Coffee intake is associated with lower disease rates',
      D: 'Everyone should drink coffee',
    },
    correct: 'C',
    explanations: {
      A: 'An observational association does not establish causation.',
      B: 'Reverse causation is possible but not demonstrated here.',
      C: 'Correct: an observational study supports association, not a causal or prescriptive claim.',
      D: 'This is a recommendation that overreaches the evidence.',
    },
    dok: 2,
  },
  // ---- CP1 Mechanics & Fluids (cp) ----
  {
    cluster: 'CP1',
    family: 'buoyancy',
    stem: 'A block floats with half its volume submerged in water. What is the block’s density relative to water?',
    choices: { A: 'One-quarter', B: 'One-half', C: 'Equal', D: 'Twice' },
    correct: 'B',
    explanations: {
      A: 'This does not follow from the floating condition.',
      B: 'Correct: at equilibrium the submerged fraction equals the density ratio, so ρ = 0.5 ρ_water.',
      C: 'Equal density would leave the block fully submerged and neutrally buoyant.',
      D: 'A denser-than-water block would sink.',
    },
    dok: 2,
  },
  {
    cluster: 'CP1',
    family: 'energy',
    stem: 'A ball is dropped from height h (ignore air resistance). Its speed just before impact depends on:',
    choices: {
      A: 'Its mass only',
      B: 'The drop height only',
      C: 'Both mass and height',
      D: 'Neither mass nor height',
    },
    correct: 'B',
    explanations: {
      A: 'Mass cancels in mgh = ½mv².',
      B: 'Correct: v = √(2gh) depends on height and g, not mass.',
      C: 'Mass does not affect the impact speed in free fall.',
      D: 'Height clearly matters.',
    },
    dok: 2,
  },
  // ---- CP2 Electricity, Waves & Optics (cp) ----
  {
    cluster: 'CP2',
    family: 'ohms',
    stem: 'In a simple circuit, if resistance doubles while voltage is held constant, the current:',
    choices: { A: 'Doubles', B: 'Is halved', C: 'Is unchanged', D: 'Quadruples' },
    correct: 'B',
    explanations: {
      A: 'Current is inversely, not directly, related to resistance.',
      B: 'Correct: I = V/R, so doubling R at fixed V halves I.',
      C: 'Current changes when resistance changes at constant voltage.',
      D: 'This inverts and exaggerates the relationship.',
    },
    dok: 1,
  },
  {
    cluster: 'CP2',
    family: 'optics',
    stem: 'An object is placed beyond the focal point of a converging lens. The image formed is:',
    choices: {
      A: 'Virtual and upright',
      B: 'Real and inverted',
      C: 'Virtual and inverted',
      D: 'Always the same size as the object',
    },
    correct: 'B',
    explanations: {
      A: 'A virtual upright image forms when the object is inside the focal length.',
      B: 'Correct: an object beyond f in a converging lens forms a real, inverted image.',
      C: 'Real images from a single lens are inverted, not virtual.',
      D: 'Image size varies with object distance.',
    },
    dok: 2,
  },
  // ---- CP3 Chemical Systems (cp) ----
  {
    cluster: 'CP3',
    family: 'acidbase',
    stem: 'A buffer resists pH change most effectively when:',
    choices: {
      A: 'The acid is fully dissociated',
      B: 'Only the conjugate base is present',
      C: 'Weak acid and conjugate base are present in comparable amounts',
      D: 'The solution is extremely dilute',
    },
    correct: 'C',
    explanations: {
      A: 'A strong (fully dissociated) acid does not buffer.',
      B: 'A buffer needs both a weak acid and its conjugate base.',
      C: 'Correct: buffering is maximal near equal concentrations (pH ≈ pKa).',
      D: 'Extreme dilution reduces buffering capacity.',
    },
    dok: 2,
  },
  {
    cluster: 'CP3',
    family: 'equilibrium',
    stem: 'For an exothermic reaction at equilibrium, increasing temperature will:',
    choices: {
      A: 'Shift the equilibrium toward products',
      B: 'Shift the equilibrium toward reactants',
      C: 'Have no effect on the equilibrium position',
      D: 'Stop the reaction entirely',
    },
    correct: 'B',
    explanations: {
      A: 'Adding heat favors the endothermic (reverse) direction here.',
      B: 'Correct: by Le Châtelier, heating an exothermic reaction shifts it toward reactants.',
      C: 'Temperature changes shift the equilibrium constant for reactions with a heat term.',
      D: 'Equilibrium shifts; it does not halt the reaction.',
    },
    dok: 3,
  },
  // ---- BB1 Biomolecules & Metabolism (bb) ----
  {
    cluster: 'BB1',
    family: 'inhibition',
    stem: 'A competitive inhibitor of an enzyme increases the apparent Km while leaving Vmax unchanged because it:',
    choices: {
      A: 'Binds the active site reversibly, competing with substrate',
      B: 'Binds only the enzyme-substrate complex',
      C: 'Permanently denatures the enzyme',
      D: 'Increases substrate affinity',
    },
    correct: 'A',
    explanations: {
      A: 'Correct: competition at the active site is overcome by more substrate, so Vmax is unchanged but Km rises.',
      B: 'That describes an uncompetitive inhibitor.',
      C: 'Denaturation would reduce Vmax and is not reversible competition.',
      D: 'Higher affinity would lower, not raise, apparent Km.',
    },
    dok: 3,
  },
  {
    cluster: 'BB1',
    family: 'glycolysis',
    stem: 'The net ATP yield from glycolysis (glucose to two pyruvate) is:',
    choices: { A: '0 ATP', B: '2 ATP', C: '4 ATP', D: '36 ATP' },
    correct: 'B',
    explanations: {
      A: 'Glycolysis has a net positive ATP yield.',
      B: 'Correct: 4 ATP produced minus 2 invested = net 2 ATP.',
      C: 'This is the gross, not net, ATP produced.',
      D: 'That figure includes oxidative phosphorylation, not glycolysis alone.',
    },
    dok: 1,
  },
  // ---- BB2 Cells & Genetics (bb) ----
  {
    cluster: 'BB2',
    family: 'transport',
    stem: 'A molecule moves across a membrane down its concentration gradient through a channel protein without ATP. This is:',
    choices: {
      A: 'Primary active transport',
      B: 'Facilitated diffusion',
      C: 'Endocytosis',
      D: 'Secondary active transport',
    },
    correct: 'B',
    explanations: {
      A: 'Active transport moves solutes against a gradient using ATP.',
      B: 'Correct: protein-assisted movement down a gradient without ATP is facilitated diffusion.',
      C: 'Endocytosis engulfs material in vesicles.',
      D: 'Secondary active transport uses an ion gradient to move a solute against its gradient.',
    },
    dok: 2,
  },
  {
    cluster: 'BB2',
    family: 'genetics',
    stem: 'Two heterozygous parents (Aa × Aa) have a child. What is the probability the child is homozygous recessive (aa)?',
    choices: { A: '0%', B: '25%', C: '50%', D: '75%' },
    correct: 'B',
    explanations: {
      A: 'Both parents can pass a recessive allele.',
      B: 'Correct: the Punnett square gives 1/4 aa.',
      C: '50% is the heterozygous (Aa) fraction.',
      D: '75% is the fraction showing the dominant phenotype.',
    },
    dok: 1,
  },
  // ---- BB3 Signaling & Organ Systems (bb) ----
  {
    cluster: 'BB3',
    family: 'baroreflex',
    stem: 'A sudden drop in blood pressure triggers the baroreceptor reflex, which will:',
    choices: {
      A: 'Decrease heart rate',
      B: 'Increase heart rate and vasoconstriction',
      C: 'Dilate blood vessels only',
      D: 'Have no effect until pressure normalizes',
    },
    correct: 'B',
    explanations: {
      A: 'Lowering heart rate would worsen the hypotension.',
      B: 'Correct: the reflex raises heart rate and constricts vessels to restore pressure.',
      C: 'Vasodilation would further lower pressure.',
      D: 'The reflex acts rapidly to correct the drop.',
    },
    dok: 3,
  },
  {
    cluster: 'BB3',
    family: 'nephron',
    stem: 'Antidiuretic hormone (ADH) acts on the kidney primarily to:',
    choices: {
      A: 'Increase water reabsorption in the collecting duct',
      B: 'Increase sodium excretion',
      C: 'Decrease blood volume',
      D: 'Block glucose reabsorption',
    },
    correct: 'A',
    explanations: {
      A: 'Correct: ADH inserts aquaporins in the collecting duct, increasing water reabsorption.',
      B: 'Sodium handling is governed mainly by aldosterone.',
      C: 'Water retention increases, not decreases, blood volume.',
      D: 'ADH does not act on glucose transporters.',
    },
    dok: 2,
  },
  // ---- BB4 Immunity & Development (bb) ----
  {
    cluster: 'BB4',
    family: 'immunity',
    stem: 'Which cell type produces antibodies?',
    choices: { A: 'Cytotoxic T cell', B: 'Plasma cell', C: 'Macrophage', D: 'Neutrophil' },
    correct: 'B',
    explanations: {
      A: 'Cytotoxic T cells kill infected cells directly.',
      B: 'Correct: plasma cells are differentiated B cells that secrete antibodies.',
      C: 'Macrophages phagocytose and present antigen but do not make antibodies.',
      D: 'Neutrophils are phagocytes of the innate response.',
    },
    dok: 1,
  },
  {
    cluster: 'BB4',
    family: 'development',
    stem: 'During early development, the process by which cells become specialized for specific functions is called:',
    choices: { A: 'Determination', B: 'Differentiation', C: 'Cleavage', D: 'Fertilization' },
    correct: 'B',
    explanations: {
      A: 'Determination commits a cell to a fate but precedes visible specialization.',
      B: 'Correct: differentiation is the acquisition of specialized structure and function.',
      C: 'Cleavage is early cell division without growth.',
      D: 'Fertilization is the fusion of gametes.',
    },
    dok: 2,
  },
  // ---- PS1 Research & Statistics (ps) — registry gap, uses cluster_hint ----
  {
    cluster: 'PS1',
    family: 'design',
    stem: 'A researcher randomly assigns participants to a treatment or placebo group. Randomization primarily helps to:',
    choices: {
      A: 'Guarantee a large effect size',
      B: 'Balance confounding variables across groups',
      C: 'Eliminate the need for a control group',
      D: 'Prove causation without statistics',
    },
    correct: 'B',
    explanations: {
      A: 'Randomization does not determine effect size.',
      B: 'Correct: random assignment distributes confounders evenly, supporting causal inference.',
      C: 'A control (placebo) group is still required.',
      D: 'Statistical analysis is still needed to draw conclusions.',
    },
    dok: 2,
  },
  {
    cluster: 'PS1',
    family: 'stats',
    stem: 'A result reported as p < 0.05 means:',
    choices: {
      A: 'The hypothesis is proven true',
      B: 'There is less than a 5% probability the result is due to chance under the null hypothesis',
      C: 'The effect is large',
      D: '95% of participants improved',
    },
    correct: 'B',
    explanations: {
      A: 'A p-value does not prove a hypothesis.',
      B: 'Correct: it is the probability of data this extreme assuming the null is true.',
      C: 'Statistical significance is distinct from effect size.',
      D: 'It does not describe the proportion of participants who improved.',
    },
    dok: 2,
  },
  {
    cluster: 'PS1',
    family: 'measurement',
    stem: 'A questionnaire that yields very different scores each time the same stable trait is measured lacks:',
    choices: { A: 'Reliability', B: 'Validity', C: 'A hypothesis', D: 'A control group' },
    correct: 'A',
    explanations: {
      A: 'Correct: inconsistent repeated measurements indicate low reliability.',
      B: 'Validity concerns whether it measures the intended construct, not consistency.',
      C: 'A hypothesis is unrelated to measurement consistency.',
      D: 'Control groups pertain to experimental design, not instrument consistency.',
    },
    dok: 2,
  },
  // ---- PS2 Mind & Behavior (ps) ----
  {
    cluster: 'PS2',
    family: 'memory',
    stem: 'Information is held briefly and manipulated for a current task in:',
    choices: { A: 'Sensory memory', B: 'Working memory', C: 'Long-term memory', D: 'Procedural memory' },
    correct: 'B',
    explanations: {
      A: 'Sensory memory is a very brief buffer of raw input.',
      B: 'Correct: working memory holds and manipulates information for immediate tasks.',
      C: 'Long-term memory is durable storage, not active manipulation.',
      D: 'Procedural memory stores skills and habits.',
    },
    dok: 2,
  },
  {
    cluster: 'PS2',
    family: 'conditioning',
    stem: 'A dog salivates to a bell after the bell was repeatedly paired with food. The bell is the:',
    choices: {
      A: 'Unconditioned stimulus',
      B: 'Conditioned stimulus',
      C: 'Unconditioned response',
      D: 'Conditioned response',
    },
    correct: 'B',
    explanations: {
      A: 'The food is the unconditioned stimulus.',
      B: 'Correct: the previously neutral bell becomes a conditioned stimulus.',
      C: 'Salivation to food is the unconditioned response.',
      D: 'Salivation to the bell is the conditioned response, not the bell itself.',
    },
    dok: 2,
  },
  {
    cluster: 'PS2',
    family: 'cognition',
    stem: 'Relying on how easily examples come to mind to judge frequency is the:',
    choices: {
      A: 'Availability heuristic',
      B: 'Representativeness heuristic',
      C: 'Confirmation bias',
      D: 'Framing effect',
    },
    correct: 'A',
    explanations: {
      A: 'Correct: the availability heuristic uses ease of recall as a frequency cue.',
      B: 'Representativeness judges by similarity to a prototype.',
      C: 'Confirmation bias favors information that supports prior beliefs.',
      D: 'Framing concerns how options are presented.',
    },
    dok: 3,
  },
  // ---- PS3 People & Society (ps) ----
  {
    cluster: 'PS3',
    family: 'attribution',
    stem: 'Attributing a stranger’s rudeness to their personality while ignoring their situation illustrates:',
    choices: {
      A: 'The fundamental attribution error',
      B: 'Self-serving bias',
      C: 'Groupthink',
      D: 'Social facilitation',
    },
    correct: 'A',
    explanations: {
      A: 'Correct: overweighting disposition over situation for others is the fundamental attribution error.',
      B: 'Self-serving bias concerns explanations of one’s own outcomes.',
      C: 'Groupthink is a group decision-making failure.',
      D: 'Social facilitation concerns performance in the presence of others.',
    },
    dok: 3,
  },
  {
    cluster: 'PS3',
    family: 'stratification',
    stem: 'The idea that health outcomes worsen with each step down the socioeconomic ladder is best described as:',
    choices: {
      A: 'A social gradient in health',
      B: 'Random variation',
      C: 'The placebo effect',
      D: 'Genetic determinism',
    },
    correct: 'A',
    explanations: {
      A: 'Correct: the graded association between socioeconomic status and health is the social gradient.',
      B: 'The pattern is systematic, not random.',
      C: 'The placebo effect concerns expectation-driven responses.',
      D: 'The gradient is social, not purely genetic.',
    },
    dok: 2,
  },
  // ---- CA1 Passage Structure & Evidence (cars) ----
  {
    cluster: 'CA1',
    family: 'main-idea',
    passage:
      'The author argues that public museums, far from being neutral storehouses, actively shape what a society chooses to remember. By deciding which objects to display and how to label them, curators narrate a version of history that visitors often accept as given.',
    stem: 'Which statement best captures the passage’s central claim?',
    choices: {
      A: 'Museums store objects without influencing interpretation.',
      B: 'Museums shape collective memory through curatorial choices.',
      C: 'Visitors always question museum labels.',
      D: 'Curators should display every object they own.',
    },
    correct: 'B',
    explanations: {
      A: 'The author explicitly rejects the "neutral storehouse" view.',
      B: 'Correct: the thesis is that curatorial decisions shape what society remembers.',
      C: 'The passage says visitors often accept the narrative as given.',
      D: 'The author makes no such recommendation.',
    },
    dok: 2,
  },
  {
    cluster: 'CA1',
    family: 'function',
    passage:
      'Early in the essay the writer concedes that critics have a point: some reforms did produce short-term disruption. Only after this concession does the writer marshal evidence that the long-term gains outweighed those costs.',
    stem: 'What is the function of the writer’s concession to critics?',
    choices: {
      A: 'To abandon the writer’s own thesis',
      B: 'To acknowledge a valid objection before rebutting it',
      C: 'To introduce an unrelated topic',
      D: 'To summarize the essay’s conclusion',
    },
    correct: 'B',
    explanations: {
      A: 'The writer goes on to defend the thesis, not abandon it.',
      B: 'Correct: the concession grants a point in order to strengthen the later rebuttal.',
      C: 'The concession is directly related to the reforms under discussion.',
      D: 'It appears early and sets up, rather than summarizes, the argument.',
    },
    dok: 3,
  },
  {
    cluster: 'CA1',
    family: 'tone',
    passage:
      'The reviewer calls the novel "technically flawless yet strangely lifeless," praising its craft while lamenting that it never moved her.',
    stem: 'The reviewer’s attitude toward the novel is best described as:',
    choices: {
      A: 'Unqualified admiration',
      B: 'Admiration for craft mixed with disappointment',
      C: 'Total contempt',
      D: 'Indifference',
    },
    correct: 'B',
    explanations: {
      A: '"Strangely lifeless" is not unqualified praise.',
      B: 'Correct: the reviewer admires the technique but is emotionally unmoved — a mixed stance.',
      C: 'She praises the craft, so it is not contempt.',
      D: 'Her strong evaluative language is not indifference.',
    },
    dok: 2,
  },
  // ---- CA2 Inference & Argument (cars) ----
  {
    cluster: 'CA2',
    family: 'assumption',
    passage:
      'The columnist claims that because a policy raised employment in one city, adopting it nationwide will raise employment everywhere.',
    stem: 'The argument most depends on which assumption?',
    choices: {
      A: 'The one city is representative of conditions nationwide.',
      B: 'Employment is impossible to measure.',
      C: 'The policy was unpopular locally.',
      D: 'No other city has tried the policy.',
    },
    correct: 'A',
    explanations: {
      A: 'Correct: generalizing from one city requires that it represent the whole.',
      B: 'The argument relies on employment being measurable.',
      C: 'Local popularity is irrelevant to the inference.',
      D: 'Whether others tried it does not bridge the local-to-national gap.',
    },
    dok: 3,
  },
  {
    cluster: 'CA2',
    family: 'weaken',
    passage:
      'A critic argues that a rise in a city’s test scores proves its new teaching method works.',
    stem: 'Which finding would most weaken the critic’s argument?',
    choices: {
      A: 'Scores rose the same amount in nearby cities that kept the old method.',
      B: 'The new method was expensive.',
      C: 'Teachers liked the new method.',
      D: 'The city has many schools.',
    },
    correct: 'A',
    explanations: {
      A: 'Correct: an equal rise without the method shows the method may not be the cause.',
      B: 'Cost does not bear on whether it works.',
      C: 'Teacher preference does not address effectiveness.',
      D: 'The number of schools is irrelevant to causation.',
    },
    dok: 3,
  },
  {
    cluster: 'CA2',
    family: 'application',
    passage:
      'The author holds that genuine expertise requires not just knowledge but the judgment to know when a rule does not apply.',
    stem: 'Which scenario best exemplifies the author’s notion of expertise?',
    choices: {
      A: 'A physician who follows a protocol regardless of the patient’s unusual symptoms',
      B: 'A physician who recognizes when a standard protocol fits poorly and adapts',
      C: 'A student who memorizes every rule in a textbook',
      D: 'A clerk who applies the same form to every case',
    },
    correct: 'B',
    explanations: {
      A: 'Rigid rule-following ignores the judgment the author emphasizes.',
      B: 'Correct: adapting when a rule fits poorly reflects the judgment the author describes.',
      C: 'Memorization is knowledge without the applied judgment.',
      D: 'Uniform application shows no situational judgment.',
    },
    dok: 3,
  },
];

// ---------------------------------------------------------------------------
// FC-coverage generator (synthetic, test_only, uncalibrated).
//
// The production diagnostic reports on the 10 AAMC Foundational Concepts, and
// the 140-item MST form needs a sizeable pool PER concept — its contention
// allocation can ask a single bucket for up to 26 items across one sitting, and
// each bucket must span DOK 1/2/3. The hand-authored drafts above touch only six
// FCs and a couple of items each, so in CI (where the real bank is absent and
// the loader falls back to this fixture) the form cannot be assembled.
//
// This generator fills every FC bucket so the synthetic bank mirrors the REAL
// bank's Foundational-Concept profile bucket-for-bucket — the fc-15 FC rows in
// packages/policies/src/data/bank-profiles.generated.ts. Matching that profile
// lets the exact same diagnostic suite pass whether or not the real pull is on
// disk, rather than needing a separate, weaker set of CI assertions.
//
// Routing: every generated item pins a real V3 lesson whose FIRST listed
// foundational concept is the target FC (each pairing is verified against
// packages/policies/src/data/fc-lessons.generated.ts). That lesson also resolves
// to a cluster through the production adapter (see ./data/v3-cluster-map.data),
// so these items route via the real seam and never touch the cluster_hint
// fallback — leaving PS1 as the sole documented fallback the bank tests expect.
//
// The text is synthetic filler with one designated-correct option and three
// distractors: enough to satisfy QuestionSchema and the learner-safe compiler,
// and explicitly NOT real MCAT content or answer keys.
// ---------------------------------------------------------------------------

type FcId =
  | 'FC1'
  | 'FC2'
  | 'FC3'
  | 'FC4'
  | 'FC5'
  | 'FC6'
  | 'FC7'
  | 'FC8'
  | 'FC9'
  | 'FC10';

const FC_IDS: readonly FcId[] = [
  'FC1',
  'FC2',
  'FC3',
  'FC4',
  'FC5',
  'FC6',
  'FC7',
  'FC8',
  'FC9',
  'FC10',
];

/**
 * Target in-scope (eligible + FC-tagged) item count per concept per DOK
 * [dok1, dok2, dok3], copied from the fc-15 FC rows of the real bank profile.
 * The generator tops the hand-authored contribution up to exactly these totals.
 */
const FC_TARGET: Readonly<Record<FcId, readonly [number, number, number]>> = {
  FC1: [61, 184, 35],
  FC2: [26, 69, 16],
  FC3: [47, 130, 26],
  FC4: [72, 295, 47],
  FC5: [59, 180, 40],
  FC6: [21, 75, 24],
  FC7: [31, 99, 25],
  FC8: [24, 62, 17],
  FC9: [20, 66, 20],
  FC10: [4, 32, 4],
};

/** One real lesson whose first listed FC is the keyed concept (drives bucketing). */
const FC_LESSON: Readonly<Record<FcId, string>> = {
  FC1: 'V3-LES-137490',
  FC2: 'V3-LES-018986',
  FC3: 'V3-LES-006619',
  FC4: 'V3-LES-020428',
  FC5: 'V3-LES-041222',
  FC6: 'V3-LES-153695',
  FC7: 'V3-LES-053947',
  FC8: 'V3-LES-228369',
  FC9: 'V3-LES-134007',
  FC10: 'V3-LES-404423',
};

/**
 * The cluster each lesson resolves to through the adapter. Used to stamp a
 * generated item's cluster (and thus its section) so it stays coherent with the
 * routing the bank builder derives — the two must agree.
 */
const LESSON_CLUSTER: Readonly<Record<string, SkillCluster>> = {
  'V3-LES-137490': 'BB2',
  'V3-LES-018986': 'BB4',
  'V3-LES-006619': 'BB3',
  'V3-LES-020428': 'CP2',
  'V3-LES-041222': 'CP3',
  'V3-LES-153695': 'PS2',
  'V3-LES-053947': 'PS2',
  'V3-LES-228369': 'PS3',
  'V3-LES-134007': 'PS3',
  'V3-LES-404423': 'PS3',
};

/**
 * Lesson -> FC for the FC-tagged lessons the hand-authored drafts already route
 * through (via `CLUSTER_LESSON`). Lets the generator subtract their existing
 * contribution so the combined corpus lands on `FC_TARGET` exactly. Lessons not
 * listed here (reasoning/CARS, and PS1's null) carry no FC and are ignored.
 */
const LESSON_FC: Readonly<Record<string, FcId>> = {
  'V3-LES-137490': 'FC1',
  'V3-LES-018986': 'FC2',
  'V3-LES-044045': 'FC2',
  'V3-LES-207028': 'FC2',
  'V3-LES-006619': 'FC3',
  'V3-LES-020428': 'FC4',
  'V3-LES-094421': 'FC4',
  'V3-LES-041222': 'FC5',
  'V3-LES-153695': 'FC6',
  'V3-LES-053947': 'FC7',
  'V3-LES-228369': 'FC8',
  'V3-LES-134007': 'FC9',
  'V3-LES-404423': 'FC10',
};

const zeros = (): [number, number, number] => [0, 0, 0];

/** Per-FC-per-DOK counts the hand-authored drafts already place in scope. */
function handAuthoredFcContribution(): Record<FcId, [number, number, number]> {
  const acc = Object.fromEntries(FC_IDS.map((fc) => [fc, zeros()])) as Record<
    FcId,
    [number, number, number]
  >;
  for (const draft of HAND_AUTHORED_DRAFTS) {
    const lessonId = draft.lessonId ?? CLUSTER_LESSON[draft.cluster];
    const fc = lessonId === null ? undefined : LESSON_FC[lessonId];
    if (fc === undefined) continue;
    const row = acc[fc];
    const idx = (draft.dok ?? 2) - 1;
    row[idx] = (row[idx] ?? 0) + 1;
  }
  return acc;
}

const CHOICE_LETTERS: readonly ChoiceLetter[] = ['A', 'B', 'C', 'D'];

/** One valid, clearly-answerable synthetic item routed onto `fc`. */
function makeSyntheticDraft(
  fc: FcId,
  cluster: SkillCluster,
  lessonId: string,
  dok: number,
  index: number,
): DiagnosticDraft {
  const tag = `${fc}-d${dok}-${String(index).padStart(3, '0')}`;
  const correct = CHOICE_LETTERS[(dok + index) % CHOICE_LETTERS.length]!;
  const choices = {
    A: `Synthetic ${fc} response A (${tag})`,
    B: `Synthetic ${fc} response B (${tag})`,
    C: `Synthetic ${fc} response C (${tag})`,
    D: `Synthetic ${fc} response D (${tag})`,
  };
  const explain = (letter: ChoiceLetter): string =>
    letter === correct
      ? `Correct: response ${letter} is the designated answer for synthetic item ${tag}.`
      : `Response ${letter} is a synthetic distractor for item ${tag}.`;
  return {
    cluster,
    family: `gen-${tag}`,
    stem:
      `Synthetic uncalibrated diagnostic item ${tag} for ${fc} (test_only fixture, ` +
      `not real MCAT content). Which response is designated correct?`,
    choices,
    correct,
    explanations: {
      A: explain('A'),
      B: explain('B'),
      C: explain('C'),
      D: explain('D'),
    },
    dok,
    lessonId,
  };
}

/** Enough synthetic items to bring every FC bucket up to `FC_TARGET`. */
function generateFcCoverageDrafts(): DiagnosticDraft[] {
  const existing = handAuthoredFcContribution();
  const out: DiagnosticDraft[] = [];
  for (const fc of FC_IDS) {
    const lessonId = FC_LESSON[fc];
    const cluster = LESSON_CLUSTER[lessonId]!;
    for (let dokIdx = 0; dokIdx < 3; dokIdx += 1) {
      const need = FC_TARGET[fc][dokIdx]! - existing[fc][dokIdx]!;
      if (need < 0) {
        throw new Error(
          `FC-coverage generator: ${fc} DOK ${dokIdx + 1} is over-supplied by hand-authored drafts ` +
            `(${existing[fc][dokIdx]} > target ${FC_TARGET[fc][dokIdx]}); adjust FC_TARGET.`,
        );
      }
      for (let i = 0; i < need; i += 1) {
        out.push(makeSyntheticDraft(fc, cluster, lessonId, dokIdx + 1, i));
      }
    }
  }
  return out;
}

/**
 * The corpus the bank builds from: the hand-authored drafts (cluster coverage)
 * plus generated items that fill each Foundational Concept to the real bank's
 * profile so the 140-item production form can be assembled without the pull.
 */
export const DIAGNOSTIC_DRAFTS: readonly DiagnosticDraft[] = [
  ...HAND_AUTHORED_DRAFTS,
  ...generateFcCoverageDrafts(),
];
