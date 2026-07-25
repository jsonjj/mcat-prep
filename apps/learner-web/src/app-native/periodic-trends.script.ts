import { buildAppNativeLesson, question, relations } from './authoring-helpers';
import type { LessonSectionAuthoring } from './section-authoring';

const TRENDS_KC = 'V3-KC-707554';

function trendGrid(caption?: string) {
  return relations(
    'Two-axis map of periodic trends',
    'Moving right across a period raises effective nuclear charge, shrinking radius and raising ionization energy and electronegativity. Moving down a group adds shells, enlarging radius and lowering ionization energy and electronegativity.',
    [
      {
        label: 'Across a period (left → right)',
        nodes: [
          { label: 'More protons', detail: 'same shell', emphasis: 'active' },
          { label: 'Higher Zeff', detail: 'tighter pull' },
          { label: 'Smaller radius', detail: 'higher IE / EN' },
        ],
        links: ['so', 'so'],
      },
      {
        label: 'Down a group (top → bottom)',
        continuationLabel: 'a new shell is added each row',
        nodes: [
          { label: 'More shells', detail: 'larger n', emphasis: 'active' },
          { label: 'More shielding', detail: 'weaker pull' },
          { label: 'Larger radius', detail: 'lower IE / EN' },
        ],
        links: ['so', 'so'],
      },
    ],
    caption,
  );
}

const trendsSection: LessonSectionAuthoring = {
  key: 'periodic-trends',
  kcId: TRENDS_KC,
  stageLabel: 'Periodic trends',
  nextActionLabel: 'Finish the lesson',
  starting: question(
    'Read the radius trend',
    'Across period 3 from Na to Cl, atomic radius mostly decreases. Which reason is correct?',
    [
      [
        'Increasing nuclear charge pulls the same outer shell inward.',
        'Correct. Protons are added while electrons fill the same principal shell, so effective nuclear charge rises and the shell contracts.',
      ],
      [
        'Electrons are added to new, larger shells.',
        'Within one period the outer electrons stay in the same principal shell; the new charge, not a new shell, drives the change.',
      ],
      [
        'More electrons always require more space, enlarging the atom.',
        'Electron count rises, but the stronger nuclear pull dominates within a period, so the atom shrinks.',
      ],
      [
        'The period number increases from Na to Cl.',
        'They share period 3; only the group changes across the row.',
      ],
    ],
    'A',
    'Across a period, protons increase while electrons occupy the same shell. Effective nuclear charge rises, so the outer electrons are held more tightly and the radius decreases.',
    'Ask what changes across a row: the shell number or the nuclear charge?',
    'Trends follow effective nuclear charge and the number of occupied shells.',
    trendGrid('Radius shrinks rightward and grows downward.'),
  ),
  model: {
    title: 'Two forces set every trend',
    supportingLine: 'Effective nuclear charge pulls in; added shells push out.',
    explanation: [
      'Effective nuclear charge (Zeff) is the net positive pull an outer electron feels after inner electrons shield some of the nuclear charge. Higher Zeff pulls electrons closer.',
      'Across a period, Zeff rises with no new shell, so radius decreases while ionization energy and electronegativity increase. Down a group, each row adds a principal shell, so radius increases while ionization energy and electronegativity decrease.',
    ],
    visual: trendGrid('Right and up: smaller, harder to ionize, more electronegative.'),
    takeaway: 'Radius grows down-and-left; ionization energy and electronegativity grow up-and-right.',
  },
  understandingCheck: question(
    'Compare ionization energy',
    'Which has the higher first ionization energy, sodium (Na) or chlorine (Cl)?',
    [
      ['Chlorine, because its higher Zeff and smaller radius hold electrons more tightly.', 'Correct. Cl sits farther right in the same period, so its outer electrons are harder to remove.'],
      ['Sodium, because it has fewer electrons to hold.', 'Fewer electrons does not mean a looser hold; Na has a low Zeff and loses its electron easily.'],
      ['They are equal, since both are in period 3.', 'Same period does not mean equal pull; Zeff rises across the row.'],
      ['Sodium, because metals always resist ionization.', 'Metals like Na have low ionization energies, which is why they form cations readily.'],
    ],
    'A',
    'Ionization energy tracks how tightly the outer electron is held. Chlorine has the larger Zeff and smaller radius, so its first ionization energy is higher than sodium\u2019s.',
    'Higher Zeff and smaller radius mean a tighter hold and higher ionization energy.',
  ),
  worked: {
    title: 'Compare across and down',
    supportingLine: 'Pick the axis that changes, then apply the rule.',
    explanation: [
      'Na versus Cl differ across a period: Cl has more protons in the same shell, so it is smaller with a higher ionization energy. Na versus Cs differ down a group: Cs has more shells, so it is much larger with a lower ionization energy.',
      'When two atoms differ on both axes, compare using the dominant change or use a known anchor such as fluorine (small, very electronegative) or cesium (large, easily ionized).',
    ],
    visual: relations(
      'Worked comparisons on each axis',
      'Na to Cl is a period comparison, so Cl is smaller. Na to Cs is a group comparison, so Cs is larger.',
      [
        {
          label: 'Period comparison',
          nodes: [
            { label: 'Na', detail: 'larger, low IE' },
            { label: 'Cl', detail: 'smaller, high IE', emphasis: 'active' },
          ],
          links: ['right → smaller'],
        },
        {
          label: 'Group comparison',
          nodes: [
            { label: 'Na', detail: 'period 3' },
            { label: 'Cs', detail: 'period 6, larger', emphasis: 'active' },
          ],
          links: ['down → larger'],
        },
      ],
    ),
    takeaway: 'What to notice: identify whether the atoms differ across a period or down a group first.',
  },
  guided: question(
    'Rank atomic radius',
    'Order lithium (Li), carbon (C), and fluorine (F) from largest to smallest atomic radius.',
    [
      ['Li > C > F', 'Correct. All are in period 2, and radius decreases left to right as Zeff rises.'],
      ['F > C > Li', 'That reverses the trend; fluorine is the smallest in period 2, not the largest.'],
      ['C > Li > F', 'Carbon is not the largest; lithium sits farthest left and is biggest.'],
      ['Li > F > C', 'Fluorine is smaller than carbon, so it cannot sit in the middle.'],
    ],
    'A',
    'Across period 2, effective nuclear charge increases from Li to F, so radius shrinks in that order: Li largest, F smallest.',
    'Same period means compare left-to-right: leftmost is largest.',
  ),
  reducedSupport: question(
    'Compare down a group',
    'Which has the larger atomic radius, magnesium (Mg) or barium (Ba)?',
    [
      ['Barium, because it lies lower in group 2 with more electron shells.', 'Correct. Added principal shells down a group enlarge the atom.'],
      ['Magnesium, because it has fewer electrons.', 'Fewer electrons does not make an atom larger; more shells do.'],
      ['They are equal, since both are group 2 metals.', 'Same group does not mean same size; radius grows down the column.'],
      ['Magnesium, because lighter atoms are always bigger.', 'Atomic mass does not set radius; shell count and Zeff do.'],
    ],
    'A',
    'Down group 2, each element adds a principal shell. Barium has more shells than magnesium, so its atomic radius is larger.',
    'Down a group, more shells win: the lower element is larger.',
  ),
  independent: question(
    'Find the most electronegative',
    'Among nitrogen (N), oxygen (O), and fluorine (F), which is the most electronegative?',
    [
      ['Fluorine', 'Correct. Electronegativity rises across a period, and F is the most electronegative element.'],
      ['Nitrogen', 'Nitrogen is the least electronegative of the three; it sits farthest left.'],
      ['Oxygen', 'Oxygen is high, but fluorine to its right is higher.'],
      ['They are equal within period 2.', 'Electronegativity increases across the row, so they are not equal.'],
    ],
    'A',
    'Electronegativity increases up and to the right (excluding noble gases). Fluorine is the most electronegative element on the table.',
  ),
  near: question(
    'Find the smallest radius',
    'Which has the smallest atomic radius: Na, Mg, Al, or Cl?',
    [
      ['Cl', 'Correct. It sits farthest right in period 3, where Zeff is highest and radius smallest.'],
      ['Na', 'Sodium is the largest of these four, not the smallest.'],
      ['Mg', 'Magnesium is smaller than Na but larger than Al and Cl.'],
      ['Al', 'Aluminum is smaller than Mg but still larger than chlorine.'],
    ],
    'A',
    'All four are period 3. Radius decreases left to right, so chlorine, farthest right, is the smallest.',
  ),
  changed: question(
    'Compare an ion to its atom',
    'How does the radius of a sodium cation (Na⁺) compare to a neutral sodium atom (Na)?',
    [
      [
        'Na⁺ is smaller, because losing the 3s electron removes the outer shell and raises pull per electron.',
        'Correct. Na⁺ is isoelectronic with neon and has no third shell, so it is much smaller than Na.',
      ],
      [
        'Na⁺ is larger, because the positive charge repels nearby electrons outward.',
        'Removing an electron reduces electron–electron repulsion and drops a shell, shrinking the ion.',
      ],
      [
        'They are the same size, since the nucleus is unchanged.',
        'The electron count and shell occupancy change, which changes the radius.',
      ],
      [
        'Na⁺ is larger, because cations always exceed their atoms.',
        'Cations are smaller than their parent atoms; anions are larger.',
      ],
    ],
    'A',
    'Forming Na⁺ removes the lone 3s electron and the entire third shell, and the remaining electrons feel a higher effective pull. The cation is therefore markedly smaller than the neutral atom.',
  ),
  repair: {
    title: 'Name the axis, then apply the force',
    supportingLine: 'Most misses come from mixing up the period and group directions.',
    explanation: [
      'First decide whether the atoms differ across a period (same shell, changing Zeff) or down a group (changing shell count). Then apply the matching rule.',
      'Radius grows down and to the left. Ionization energy and electronegativity grow up and to the right. For ions, remember cations shrink and anions expand relative to their atoms.',
    ],
    visual: trendGrid('Use the two-axis map to place any pair before predicting.'),
    strategy: 'Locate both species on the table, identify the changing axis, then read the trend.',
    checkYourThinking: 'Are you comparing along a period, down a group, or between an atom and its ion?',
  },
  recap: {
    title: 'You can predict properties from position',
    explanation: [
      'You tied radius, ionization energy, and electronegativity to two forces: rising effective nuclear charge across a period and added shells down a group. The same logic explains why cations shrink and anions grow.',
    ],
    visual: trendGrid('Position on the table predicts size and how tightly electrons are held.'),
    takeaway: 'Effective nuclear charge and shell count explain every main-group periodic trend.',
  },
};

const { script: PERIODIC_TRENDS_SCRIPT, presentation: PERIODIC_TRENDS_PRESENTATION } =
  buildAppNativeLesson({
    id: 'V3-LES-263440',
    contentVersion: 'app-native-periodic-trends-v1.0.0',
    slug: 'periodic-trends',
    title: 'Predict periodic property trends',
    internalTitle: 'Electronic structure and periodic behavior · app-native candidate',
    subject: 'Chemical & physical foundations',
    description:
      'Predict atomic radius, ionization energy, and electronegativity from effective nuclear charge across a period and added shells down a group.',
    estimatedMinutes: 13,
    requiredKcs: [
      {
        id: TRENDS_KC,
        title: 'Predict periodic property trends',
        learnerOutcome:
          'Predict radius, ionization energy, and electronegativity from an element\u2019s position on the periodic table.',
        previewCoverage: 'complete-review-focus',
      },
      {
        id: 'V3-KC-207115',
        title: 'Construct bounded electron configurations',
        learnerOutcome: 'Recall that shell filling underlies the periodic trends practiced here.',
        previewCoverage: 'boundary-map-only',
      },
      {
        id: 'V3-KC-477123',
        title: 'Classify periodic groups electronically',
        learnerOutcome: 'Connect group position to the valence structure that drives trends.',
        previewCoverage: 'boundary-map-only',
      },
      {
        id: 'V3-KC-809542',
        title: 'Relate electronic transitions and spectra',
        learnerOutcome: 'See that the same electronic structure governs spectra (covered elsewhere).',
        previewCoverage: 'boundary-map-only',
      },
      {
        id: 'V3-KC-990902',
        title: 'Infer electronic magnetic behavior',
        learnerOutcome: 'Note that unpaired-electron reasoning shares this electronic basis.',
        previewCoverage: 'boundary-map-only',
      },
    ],
    teachingObjective:
      'Given two species and their positions, predict and compare atomic radius, ionization energy, and electronegativity using effective nuclear charge and shell count.',
    intro: {
      id: 'periodic-intro',
      title: 'Predict periodic property trends',
      outcome: 'Use table position to predict size and how tightly an atom holds its electrons.',
      details: [
        'Reason from effective nuclear charge and shell count to compare radius, ionization energy, and electronegativity.',
      ],
      kcIds: [TRENDS_KC],
    },
    sections: [trendsSection],
    completion: {
      id: 'periodic-complete',
      title: 'You can read the table as a trend map',
      summary:
        'You predicted radius, ionization energy, and electronegativity from position and explained why ions differ from their atoms.',
      takeaways: [
        'Across a period, rising effective nuclear charge shrinks atoms and tightens their hold.',
        'Down a group, added shells enlarge atoms and loosen their hold.',
        'Cations are smaller and anions larger than their parent atoms.',
      ],
      nextStep: 'Use these trends to predict bond polarity and reactivity in later chemistry lessons.',
      kcIds: [TRENDS_KC],
    },
  });

export { PERIODIC_TRENDS_SCRIPT, PERIODIC_TRENDS_PRESENTATION };
