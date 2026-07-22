import type { SnapshotQuestion } from './types';

export const SNAPSHOT_QUESTION_COUNT = 12;
export const SNAPSHOT_EXPECTED_MINUTES = 18;

export const snapshotQuestions: SnapshotQuestion[] = [
  {
    id: 'snapshot-q01',
    domain: 'CARS reasoning',
    skillLabel: 'Function of an analogy',
    passage: `Museum labels are sometimes accused of standing between the viewer and the object, as if words were a fog laid over vision. The complaint is understandable. A label that explains a painting before the eye has had time to wander can turn looking into confirmation: the visitor searches for what has already been named. But the opposite danger is just as real. Without any cue, a difficult object may become mute, not because it lacks meaning but because the viewer has no first handle by which to begin.

The best label is therefore less like a verdict than like the first mark on a trail map. It does not describe every turn, nor does it guarantee the destination. It simply prevents the visitor from mistaking a path for a wall. This is why labels that ask a precise question can be more useful than labels that summarize a whole work. A question preserves the viewer's labor. It directs attention without pretending to finish perception on the viewer's behalf.`,
    stem: 'In the passage, the comparison of a good label to “the first mark on a trail map” primarily serves to:',
    choices: [
      {
        id: 'A',
        text: 'defend labels by suggesting that even partial guidance can ensure viewers reach a work’s intended meaning.',
      },
      {
        id: 'B',
        text: 'illustrate how a label can offer an initial orientation without determining the viewer’s final interpretation.',
      },
      {
        id: 'C',
        text: 'shift the discussion from whether labels guide viewers to how museums should sequence visitors through a gallery.',
      },
      {
        id: 'D',
        text: 'suggest that a label is most useful when it records an interpretive route another viewer has already taken.',
      },
    ],
  },
  {
    id: 'snapshot-q02',
    domain: 'Data interpretation',
    skillLabel: 'Axes and kinetic parameters',
    stimulus:
      'A Lineweaver–Burk plot, with 1/v on the y-axis and 1/[S] on the x-axis, compares an enzyme with and without an inhibitor.',
    visual: 'lineweaver',
    stem: 'Which interpretation is most consistent with the plotted changes?',
    choices: [
      { id: 'A', text: 'Vmax increases while Km decreases.' },
      { id: 'B', text: 'Both Vmax and Km decrease.' },
      { id: 'C', text: 'Vmax decreases while Km remains approximately unchanged.' },
      { id: 'D', text: 'Km decreases while Vmax remains approximately unchanged.' },
    ],
  },
  {
    id: 'snapshot-q03',
    domain: 'Chemical reasoning',
    skillLabel: 'Reference points and energy',
    stimulus:
      'A two-step reaction has reactants at 20 kJ/mol, an intermediate at 10 kJ/mol, transition states at 60 and 75 kJ/mol, and products at 5 kJ/mol.',
    visual: 'reaction-coordinate',
    stem: 'What is the activation energy for the slower forward elementary step?',
    choices: [
      { id: 'A', text: '65 kJ/mol' },
      { id: 'B', text: '55 kJ/mol' },
      { id: 'C', text: '40 kJ/mol' },
      { id: 'D', text: '70 kJ/mol' },
    ],
  },
  {
    id: 'snapshot-q04',
    domain: 'Biochemical reasoning',
    skillLabel: 'Acid–base mechanism',
    stimulus:
      'A serine protease uses an active-site histidine as a general base. The enzyme is tested at pH 5.0 and pH 8.0, with substrate saturating at both pH values.',
    stem: 'Why would activity often be lower at pH 5.0?',
    choices: [
      {
        id: 'A',
        text: 'The histidine side chain is more likely protonated, increasing its ability to accept a proton during catalysis.',
      },
      {
        id: 'B',
        text: 'The histidine side chain is more likely deprotonated, limiting its ability to function as a general base.',
      },
      {
        id: 'C',
        text: 'The histidine side chain is more likely protonated, limiting its ability to accept a proton during catalysis.',
      },
      {
        id: 'D',
        text: 'The lower activity is most likely caused by reduced substrate availability rather than active-site ionization.',
      },
    ],
  },
  {
    id: 'snapshot-q05',
    domain: 'Experimental design',
    skillLabel: 'Causal rescue',
    stimulus:
      'Knockdown of enzyme E reduces cellular NADH production. A researcher wants to test whether the phenotype is specifically due to loss of enzyme E rather than off-target effects of the knockdown reagent.',
    stem: 'Which experiment most directly addresses this concern?',
    choices: [
      {
        id: 'A',
        text: 'Introduce a knockdown-resistant, catalytically inactive enzyme E cDNA and test whether NADH production is restored.',
      },
      {
        id: 'B',
        text: 'Repeat the knockdown with twice the reagent concentration and test whether NADH production falls further.',
      },
      {
        id: 'C',
        text: 'Introduce wild-type enzyme E cDNA that retains the knockdown-target sequence and test whether NADH production is restored.',
      },
      {
        id: 'D',
        text: 'Introduce a knockdown-resistant wild-type enzyme E cDNA and test whether NADH production is restored.',
      },
    ],
  },
  {
    id: 'snapshot-q06',
    domain: 'Data interpretation',
    skillLabel: 'Assay comparison',
    stimulus:
      'Cells are left unstimulated, exposed to growth factor, or pretreated with kinase inhibitor K before growth-factor exposure. A loading control is included.',
    visual: 'western-blot',
    stem: 'Which conclusion is best supported by all three lanes?',
    choices: [
      {
        id: 'A',
        text: 'Inhibitor K blocks the stimulation-associated increase in ERK phosphorylation without detectably changing total ERK abundance.',
      },
      {
        id: 'B',
        text: 'Inhibitor K reduces ERK transcription because total ERK protein is absent after treatment.',
      },
      {
        id: 'C',
        text: 'Growth factor increases total ERK abundance, while inhibitor K leaves ERK phosphorylation unchanged.',
      },
      {
        id: 'D',
        text: 'The blot proves that inhibitor K directly dephosphorylates ERK rather than acting elsewhere in the pathway.',
      },
    ],
  },
  {
    id: 'snapshot-q07',
    domain: 'CARS reasoning',
    skillLabel: 'Applying a qualified principle',
    passage: `Digitized archives have made research wonderfully impatient. A scholar can now locate a phrase in seconds that might once have required a week of turning pages. This efficiency is not a trivial gain; it has opened neglected collections to readers who cannot travel and has made accidental discovery less dependent on institutional privilege. But search also changes the texture of evidence. It encourages the researcher to arrive with a term already in mind and to treat every document as an answer to that term.

Older archival habits were hardly pure. They excluded many people and wasted time. Still, their slowness sometimes forced a useful kind of adjacency. A letter found beside the desired one, a receipt folded into the same packet, or a cataloguer's odd sequence could complicate the question that brought the researcher there. The issue is not whether search should be abandoned. It is whether digital archives can preserve some designed friction, some invitation to encounter what the researcher did not know to request.`,
    stem: "Which archive policy would be most consistent with the author's argument?",
    choices: [
      {
        id: 'A',
        text: 'Show each hit with nearby records only when those neighboring records also contain the search term.',
      },
      {
        id: 'B',
        text: 'Show each hit with thematically similar records from across the archive so unexpected material remains topically relevant.',
      },
      {
        id: 'C',
        text: 'Show each hit with records from the same folder or sequence, even when those records lack the search term.',
      },
      {
        id: 'D',
        text: 'Periodically replace search results with a curator’s selection of records unrelated to the query.',
      },
    ],
  },
  {
    id: 'snapshot-q08',
    domain: 'Data interpretation',
    skillLabel: 'Potency and maximal response',
    stimulus:
      'A dose-response graph compares agonist alone with agonist plus antagonist X or antagonist Y.',
    visual: 'dose-response',
    stem: 'Which comparison is most consistent with the two antagonist curves?',
    choices: [
      {
        id: 'A',
        text: 'X reduces apparent potency without reducing maximal response, whereas Y reduces the maximal response.',
      },
      {
        id: 'B',
        text: 'X reduces the maximal response, whereas Y changes apparent potency without reducing the maximum.',
      },
      {
        id: 'C',
        text: 'Both antagonists increase agonist potency, and only X reduces the maximal response.',
      },
      {
        id: 'D',
        text: 'The graph alone proves that X is competitive and Y binds the receptor irreversibly.',
      },
    ],
  },
  {
    id: 'snapshot-q09',
    domain: 'Physical reasoning',
    skillLabel: 'Model selection and force balance',
    stimulus:
      'A 2.0 kg object with volume 3.0 × 10⁻³ m³ is fully submerged in water and tethered to the bottom. Use ρwater = 1000 kg/m³ and g = 10 m/s².',
    stem: 'If the object is stationary, what is the tension in the tether?',
    choices: [
      { id: 'A', text: '50 N' },
      { id: 'B', text: '10 N' },
      { id: 'C', text: '20 N' },
      { id: 'D', text: '30 N' },
    ],
  },
  {
    id: 'snapshot-q10',
    domain: 'Biological reasoning',
    skillLabel: 'Homeostatic direction',
    stimulus:
      'Phenylephrine raises arterial pressure. An intact animal shows a reflex decrease in heart rate, but an animal with carotid sinus afferents severed shows little change in heart rate.',
    stem: 'Which explanation best accounts for the difference between the animals?',
    choices: [
      {
        id: 'A',
        text: 'Severing the afferents increases stretch detection, producing a larger parasympathetic response.',
      },
      {
        id: 'B',
        text: 'In the intact animal, increased pressure lowers baroreceptor firing and therefore lowers heart rate.',
      },
      {
        id: 'C',
        text: 'Phenylephrine directly inhibits the sinoatrial node only when carotid afferents are intact.',
      },
      {
        id: 'D',
        text: 'Severing the afferents reduces pressure-related signaling to the brainstem, blunting the reflex autonomic response.',
      },
    ],
  },
  {
    id: 'snapshot-q11',
    domain: 'Experimental design',
    skillLabel: 'Controlled comparisons',
    stimulus:
      'Initial rates are measured for A + B → products. Compare trials that change one reactant concentration at a time.',
    visual: 'initial-rates',
    stem: 'Which rate law is supported by the three trials?',
    choices: [
      {
        id: 'A',
        text: 'Rate = k[A]²[B]',
      },
      {
        id: 'B',
        text: 'Rate = k[A][B]²',
      },
      {
        id: 'C',
        text: 'Rate = k[A][B]',
      },
      {
        id: 'D',
        text: 'Rate = k[B]²',
      },
    ],
  },
  {
    id: 'snapshot-q12',
    domain: 'Data interpretation',
    skillLabel: 'Time course and mass balance',
    stimulus:
      'A pulse-chase follows a labeled secreted protein in control cells and cells treated with compound Z. Total recovered label remains nearly constant in both conditions.',
    visual: 'pulse-chase',
    stem: 'Which conclusion is best supported by comparing the two conditions?',
    choices: [
      { id: 'A', text: 'Compound Z prevents synthesis of the labeled protein.' },
      {
        id: 'B',
        text: 'Compound Z accelerates degradation of the labeled protein during the chase.',
      },
      {
        id: 'C',
        text: 'Compound Z specifically blocks release at the plasma membrane after normal ER-to-Golgi transport.',
      },
      {
        id: 'D',
        text: 'Compound Z disrupts transfer from the ER to the Golgi rather than causing rapid degradation.',
      },
    ],
  },
];
