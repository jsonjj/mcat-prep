import { buildAppNativeLesson, question, relations } from './authoring-helpers';
import type { LessonSectionAuthoring } from './section-authoring';

const GEOMETRY_KC = 'V3-KC-053877';

function domainMap(caption?: string) {
  return relations(
    'Electron-domain count mapped to molecular shape',
    'Two domains give a linear 180-degree shape, three give trigonal planar at 120 degrees, and four give tetrahedral at 109.5 degrees. Lone pairs occupy domains and compress the remaining bond angles.',
    [
      {
        label: 'Domains → base shape',
        nodes: [
          { label: '2 domains', detail: 'linear · 180°' },
          { label: '3 domains', detail: 'trigonal planar · 120°' },
          { label: '4 domains', detail: 'tetrahedral · 109.5°', emphasis: 'active' },
        ],
        links: ['more', 'more'],
      },
      {
        label: 'Lone pairs bend the shape',
        continuationLabel: 'each lone pair pushes bonds closer together',
        nodes: [
          { label: '4 bonds', detail: 'tetrahedral (CH₄)' },
          { label: '1 lone pair', detail: 'pyramidal (NH₃)' },
          { label: '2 lone pairs', detail: 'bent (H₂O)', emphasis: 'active' },
        ],
        links: ['then', 'then'],
      },
    ],
    caption,
  );
}

const geometrySection: LessonSectionAuthoring = {
  key: 'geom-vsepr',
  kcId: GEOMETRY_KC,
  stageLabel: 'Molecular geometry',
  nextActionLabel: 'Finish the lesson',
  starting: question(
    'Shape from four bonds',
    'In methane (CH₄), carbon has four bonding pairs and no lone pairs. What is the shape and approximate bond angle?',
    [
      ['Tetrahedral, about 109.5°.', 'Correct. Four electron domains spread as far apart as possible in three dimensions.'],
      ['Square planar, 90°.', 'Four bonds do not lie in a plane at 90°; that geometry needs lone pairs in specific positions.'],
      ['Trigonal planar, 120°.', 'That is the three-domain shape; methane has four domains.'],
      ['Linear, 180°.', 'Linear is the two-domain shape and cannot hold four bonds.'],
    ],
    'A',
    'VSEPR says electron domains arrange to minimize repulsion. Four bonding domains point to the corners of a tetrahedron, giving 109.5° angles.',
    'Count the electron domains around the central atom first.',
    'Shape follows the number of electron domains that repel one another.',
    domainMap('Four domains point to tetrahedral corners.'),
  ),
  model: {
    title: 'Count domains, then place lone pairs',
    supportingLine: 'Electron domains repel; lone pairs repel most.',
    explanation: [
      'An electron domain is any group of electrons around the central atom: a single, double, or triple bond each count as one domain, and each lone pair counts as one. Domains spread out to minimize repulsion, setting the base geometry.',
      'Lone pairs take up domains but are invisible in the named molecular shape, and they push harder than bonding pairs. So four domains give a tetrahedral arrangement, but one lone pair makes the shape trigonal pyramidal and two lone pairs make it bent, with angles a bit smaller than 109.5°.',
    ],
    visual: domainMap('The electron arrangement sets the base; lone pairs bend the visible shape.'),
    takeaway: 'Name the shape from the atoms you can see, but set the angles from all domains.',
  },
  understandingCheck: question(
    'Shape of water',
    'Oxygen in water (H₂O) has two bonding pairs and two lone pairs. What is the molecular shape?',
    [
      ['Bent, with an angle near 104.5°.', 'Correct. Four domains give a tetrahedral base, and two lone pairs bend it and compress the angle.'],
      ['Linear, 180°.', 'Two lone pairs plus two bonds do not lie in a straight line.'],
      ['Tetrahedral, 109.5°.', 'The electron arrangement is tetrahedral, but the visible shape of the atoms is bent.'],
      ['Trigonal planar, 120°.', 'That is a three-domain shape; water has four domains.'],
    ],
    'A',
    'Water has four electron domains (two bonds, two lone pairs). The electron arrangement is tetrahedral, but only the two O–H bonds define the visible bent shape, with the angle compressed below 109.5°.',
    'Include lone pairs when counting domains, then describe only the atoms for the shape name.',
  ),
  worked: {
    title: 'Work through ammonia',
    supportingLine: 'From domains to name to angle.',
    explanation: [
      'Ammonia (NH₃) has three N–H bonds and one lone pair on nitrogen: four domains total. The base electron arrangement is tetrahedral.',
      'Because one domain is a lone pair, the visible shape of the three hydrogens is trigonal pyramidal. The lone pair pushes the bonds together, giving an angle of about 107°, between water\u2019s 104.5° and methane\u2019s 109.5°.',
    ],
    visual: relations(
      'Ammonia reasoning chain',
      'Four domains give a tetrahedral base; one lone pair makes the visible shape trigonal pyramidal with a 107-degree angle.',
      [
        {
          label: 'NH₃ analysis',
          nodes: [
            { label: '4 domains', detail: '3 bonds + 1 lone pair' },
            { label: 'Tetrahedral base', detail: 'electron arrangement' },
            { label: 'Trigonal pyramidal', detail: '~107°', emphasis: 'active' },
          ],
          links: ['base', 'visible shape'],
        },
      ],
    ),
    takeaway: 'What to notice: more lone pairs means a smaller bond angle (109.5 → 107 → 104.5).',
  },
  guided: question(
    'Shape of carbon dioxide',
    'Carbon in CO₂ has two double bonds and no lone pairs. What is the shape?',
    [
      ['Linear, 180°.', 'Correct. Each double bond is one domain, so two domains point in opposite directions.'],
      ['Bent, 120°.', 'Bending would require a lone pair on carbon, which CO₂ does not have.'],
      ['Tetrahedral, 109.5°.', 'That needs four domains; carbon here has only two.'],
      ['Trigonal planar, 120°.', 'That is three domains; the two double bonds count as two.'],
    ],
    'A',
    'A double bond counts as a single electron domain. With two domains and no lone pairs, CO₂ is linear at 180°.',
    'Remember a double bond is still one domain.',
  ),
  reducedSupport: question(
    'Shape of boron trifluoride',
    'Boron in BF₃ has three bonding pairs and no lone pairs. What is the shape?',
    [
      ['Trigonal planar, 120°.', 'Correct. Three domains and no lone pairs spread evenly in a plane.'],
      ['Trigonal pyramidal, 107°.', 'Pyramidal requires a lone pair; boron here has none.'],
      ['Tetrahedral, 109.5°.', 'That is four domains; BF₃ has three.'],
      ['Bent, 104.5°.', 'Bending needs lone pairs on the central atom.'],
    ],
    'A',
    'Three bonding domains with no lone pairs arrange in a flat triangle at 120°: trigonal planar.',
    'No lone pairs means the electron arrangement and the visible shape match.',
  ),
  independent: question(
    'Shape of the hydronium ion',
    'In H₃O⁺, oxygen has three bonding pairs and one lone pair. What is the molecular shape?',
    [
      ['Trigonal pyramidal, near 107°.', 'Correct. Four domains give a tetrahedral base; one lone pair makes the visible shape pyramidal.'],
      ['Trigonal planar, 120°.', 'That would require no lone pair; here one domain is a lone pair.'],
      ['Tetrahedral, 109.5°.', 'That names the electron arrangement, not the shape of the three hydrogens.'],
      ['Bent, 104.5°.', 'Bent needs two lone pairs; H₃O⁺ has one.'],
    ],
    'A',
    'Hydronium has four domains (three bonds, one lone pair). Like ammonia, the visible shape is trigonal pyramidal with an angle near 107°.',
  ),
  near: question(
    'Order the bond angles',
    'Rank the H–X–H bond angles in CH₄, NH₃, and H₂O from largest to smallest.',
    [
      ['CH₄ (109.5°) > NH₃ (107°) > H₂O (104.5°)', 'Correct. Each added lone pair pushes the bonds closer, shrinking the angle.'],
      ['H₂O > NH₃ > CH₄', 'That reverses the effect of lone pairs, which shrink the angle.'],
      ['All equal at 109.5° because all have four domains.', 'The four-domain base is shared, but lone pairs compress the visible angle.'],
      ['NH₃ > CH₄ > H₂O', 'Methane has no lone pairs and the widest angle, so it must rank first.'],
    ],
    'A',
    'All three have four domains, but lone pairs repel more strongly than bonds. Zero, one, and two lone pairs give 109.5°, 107°, and 104.5° respectively.',
  ),
  changed: question(
    'From shape to polarity',
    'Both CO₂ and H₂O contain polar bonds, yet CO₂ is nonpolar and H₂O is polar. Why?',
    [
      [
        'CO₂ is linear, so its bond dipoles point opposite and cancel; H₂O is bent, so its dipoles add to a net dipole.',
        'Correct. Molecular polarity depends on geometry, not just on having polar bonds.',
      ],
      [
        'CO₂ has no polar bonds, unlike water.',
        'Both molecules have polar bonds; the difference is whether the dipoles cancel.',
      ],
      [
        'Water\u2019s bonds are ionic while CO₂\u2019s are covalent.',
        'Both are polar covalent; the geometry, not the bond type, sets the net polarity.',
      ],
      [
        'CO₂ is larger, so its dipoles average out.',
        'Size does not cancel dipoles; the symmetric linear shape does.',
      ],
    ],
    'A',
    'Bond dipoles are vectors. In linear CO₂ they point in exact opposite directions and cancel, so the molecule is nonpolar. In bent H₂O they do not cancel, leaving a net dipole, so it is polar.',
  ),
  repair: {
    title: 'Domains first, then shape, then dipoles',
    supportingLine: 'Skipping lone pairs is the most common shape error.',
    explanation: [
      'Count every electron domain around the central atom, counting each multiple bond as one. Set the base arrangement, then subtract lone pairs to name the visible shape and compress the angle.',
      'For polarity, draw each bond dipole as an arrow toward the more electronegative atom, then add the arrows using the geometry. Symmetric shapes cancel; asymmetric shapes leave a net dipole.',
    ],
    visual: domainMap('Count domains, place lone pairs, then combine bond dipoles by geometry.'),
    strategy: 'Number the domains, mark lone pairs, name the shape, then test whether dipoles cancel.',
    checkYourThinking: 'Did you count lone pairs as domains and let geometry decide polarity?',
  },
  recap: {
    title: 'You can build shapes from domains',
    explanation: [
      'You counted electron domains, placed lone pairs to compress angles, and connected geometry to polarity. The same domain count predicts shapes for ions and larger central atoms.',
    ],
    visual: domainMap('One rule — domain count plus lone pairs — predicts shape and polarity.'),
    takeaway: 'Domain count sets the arrangement; lone pairs set the shape; geometry sets polarity.',
  },
};

const { script: MOLECULAR_GEOMETRY_SCRIPT, presentation: MOLECULAR_GEOMETRY_PRESENTATION } =
  buildAppNativeLesson({
    id: 'V3-LES-623852',
    contentVersion: 'app-native-geometry-v1.0.0',
    slug: 'molecular-geometry',
    title: 'Predict molecular shape and polarity',
    internalTitle: 'Covalent structure, geometry, and polarity · app-native candidate',
    subject: 'Chemical & physical foundations',
    description:
      'Use VSEPR electron-domain counting to predict molecular shape and bond angles, then connect geometry to overall molecular polarity.',
    estimatedMinutes: 14,
    requiredKcs: [
      {
        id: GEOMETRY_KC,
        title: 'Predict molecular geometry and bonding',
        learnerOutcome:
          'Predict molecular shape and bond angles from electron-domain counts using VSEPR.',
        previewCoverage: 'complete-review-focus',
      },
      {
        id: 'V3-KC-840512',
        title: 'Infer bond polarity and dipoles',
        learnerOutcome: 'Combine bond dipoles with geometry to judge overall molecular polarity.',
        previewCoverage: 'boundary-map-only',
      },
      {
        id: 'V3-KC-096110',
        title: 'Construct Lewis and resonance representations',
        learnerOutcome: 'Recall that a Lewis structure supplies the domain counts used here.',
        previewCoverage: 'boundary-map-only',
      },
      {
        id: 'V3-KC-533129',
        title: 'Relate multiple bonds to structure',
        learnerOutcome: 'Treat each multiple bond as a single electron domain for shape.',
        previewCoverage: 'boundary-map-only',
      },
    ],
    teachingObjective:
      'Given a central atom with a known set of bonds and lone pairs, predict the molecular shape, approximate bond angle, and whether the molecule is polar.',
    intro: {
      id: 'geom-intro',
      title: 'Predict molecular shape and polarity',
      outcome: 'Turn an electron-domain count into a shape, a bond angle, and a polarity judgment.',
      details: [
        'Use VSEPR to count domains, place lone pairs, name shapes, and decide whether bond dipoles cancel.',
      ],
      kcIds: [GEOMETRY_KC],
    },
    sections: [geometrySection],
    completion: {
      id: 'geom-complete',
      title: 'You can predict shape and polarity',
      summary:
        'You counted electron domains, adjusted for lone pairs, named shapes and angles, and used geometry to judge molecular polarity.',
      takeaways: [
        'Each bond (single, double, or triple) and each lone pair is one electron domain.',
        'Lone pairs stay hidden in the shape name but compress bond angles.',
        'A molecule is polar only if its bond dipoles fail to cancel by symmetry.',
      ],
      nextStep: 'Use shape and polarity to predict intermolecular forces and solubility later on.',
      kcIds: [GEOMETRY_KC],
    },
  });

export { MOLECULAR_GEOMETRY_SCRIPT, MOLECULAR_GEOMETRY_PRESENTATION };
