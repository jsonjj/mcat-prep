import {
  defineLessonScriptPreview,
  type OpticsRayStepPreview,
  type OpticsRayVisualPreview,
} from './contract';

const OPTICS_LABELS = {
  axis: 'principal axis',
  element: 'converging lens',
  object: 'object beyond near 2F',
  nearFocus: 'near F',
  farFocus: 'far F',
  nearTwoFocus: 'near 2F',
  farTwoFocus: 'far 2F',
  image: 'real, inverted, reduced image',
  firstRay: 'ray 1 · parallel in → far F out',
  secondRay: 'ray 2 · through center → straight',
  intersection: 'solid rays meet at the image tip',
} as const;

function rayVisual(
  step: OpticsRayStepPreview,
  alt: string,
  textEquivalent: string,
  caption?: string,
): OpticsRayVisualPreview {
  return {
    kind: 'optics-rays',
    step,
    labels: OPTICS_LABELS,
    alt,
    textEquivalent,
    caption,
  };
}

export const OPTICS_V2_SCRIPT = defineLessonScriptPreview({
  schemaVersion: 'lesson-script-preview/v2',
  status: 'internal-preview',
  id: 'V3-LES-443492',
  contentVersion: 'app-native-optics-v2.2.0-review-flow',
  slug: 'geometrical-optics',
  title: 'Predict images with lenses and mirrors',
  internalTitle: 'Geometrical optics and image formation · app-native candidate',
  subject: 'Chemical & physical foundations',
  description: 'Build one converging-lens ray diagram by making one optical decision at a time.',
  estimatedMinutes: 12,
  requiredKcs: [
    {
      id: 'V3-KC-599193',
      title: 'Plane reflection',
      learnerOutcome:
        'Apply equality of incidence and reflection angles and locate plane-mirror images.',
      previewCoverage: 'boundary-map-only',
    },
    {
      id: 'V3-KC-493500',
      title: 'Refraction, dispersion, and TIR',
      learnerOutcome: 'Use refractive index, Snell’s law, dispersion, and critical conditions.',
      previewCoverage: 'boundary-map-only',
    },
    {
      id: 'V3-KC-853697',
      title: 'Spherical mirrors',
      learnerOutcome: 'Use mirror geometry, principal rays, and signs to classify images.',
      previewCoverage: 'boundary-map-only',
    },
    {
      id: 'V3-KC-393396',
      title: 'Thin lenses',
      learnerOutcome:
        'Classify a thin lens, draw principal rays, and infer image location and properties.',
      previewCoverage: 'complete-review-focus',
    },
    {
      id: 'V3-KC-729762',
      title: 'Compound thin-element systems',
      learnerOutcome:
        'Propagate object and image relations through multiple thin optical elements.',
      previewCoverage: 'boundary-map-only',
    },
  ],
  teachingObjective:
    'Given a converging lens, principal axis, focal points, and a real object beyond the focal point, construct two principal rays, locate their physical intersection, and infer image side, reality, orientation, and relative size.',
  nodes: [
    {
      id: 'optics-intro',
      kind: 'intro',
      kcIds: ['V3-KC-393396'],
      title: 'Build a ray diagram one decision at a time',
      outcome:
        'Place the geometry, draw two principal rays, then read the image from where they meet.',
      details: [
        'You will build one thin-lens image from the axis and focal points through the completed ray intersection.',
        'The lesson map keeps plane reflection, refraction, spherical mirrors, and compound systems as separate skill boundaries.',
      ],
    },
    {
      id: 'optics-starting-check',
      kind: 'question',
      stage: 'starting-check',
      kcIds: ['V3-KC-393396'],
      title: 'Find the reference line',
      prompt:
        'A thin lens stands vertically. Which line should you draw first to organize the ray diagram?',
      options: [
        { id: 'A', label: 'A horizontal principal axis through the lens center.' },
        { id: 'B', label: 'A line along the outside edge of the lens.' },
        { id: 'C', label: 'A diagonal line fixed at 45°.' },
        { id: 'D', label: 'Any line through the object tip.' },
      ],
      help: 'The reference line passes through the optical center and both focal points.',
      evaluation: {
        correctOptionId: 'A',
        feedbackByOption: {
          A: 'Yes. The principal axis fixes one shared reference for the lens center, focal points, and image height.',
          B: 'The lens edge shows its shape, but it does not pass through the focal geometry used to construct rays.',
          C: 'A fixed diagonal angle would not stay tied to the optical center or focal points.',
          D: 'Rays begin at the object tip only after the optical reference geometry has been placed.',
        },
        explanation:
          'The principal axis is the reference line through the optical center and both focal points. It makes ray directions and image height comparable on the same coordinate line.',
        incorrectHeading: 'That answer is incorrect. We’ll work through it together.',
      },
    },
    {
      id: 'optics-lesson-map',
      kind: 'explanation',
      kcIds: ['V3-KC-599193', 'V3-KC-493500', 'V3-KC-853697', 'V3-KC-393396', 'V3-KC-729762'],
      title: 'See the lesson boundaries',
      supportingLine:
        'Work one complete thin-lens sequence without mixing its rules with other elements.',
      explanation: [
        'Each boundary marks a separate optics skill. Here, you will work through thin lenses from reference geometry to image properties.',
      ],
      visual: {
        kind: 'lesson-map',
        focusKcId: 'V3-KC-393396',
        items: [
          {
            kcId: 'V3-KC-599193',
            title: 'Plane reflection',
            boundaryLabel: 'Future section boundary',
          },
          {
            kcId: 'V3-KC-493500',
            title: 'Refraction, dispersion, and TIR',
            boundaryLabel: 'Future section boundary',
          },
          {
            kcId: 'V3-KC-853697',
            title: 'Spherical mirrors',
            boundaryLabel: 'Future section boundary',
          },
          {
            kcId: 'V3-KC-393396',
            title: 'Thin lenses',
            boundaryLabel: 'Current lesson focus',
          },
          {
            kcId: 'V3-KC-729762',
            title: 'Compound thin-element systems',
            boundaryLabel: 'Future section boundary',
          },
        ],
        alt: 'Ordered map of five optics knowledge components with thin lenses highlighted as the current lesson focus.',
        textEquivalent:
          'The lesson contains plane reflection; refraction, dispersion, and TIR; spherical mirrors; thin lenses; and compound thin-element systems. Thin lenses is the current focus. The other four remain visible boundaries for future sections.',
      },
      takeaway: 'Thin lenses are the current focus; the other optics skills remain separate.',
    },
    {
      id: 'optics-model-geometry',
      kind: 'explanation',
      kcIds: ['V3-KC-393396'],
      title: 'Place the optical geometry',
      supportingLine: 'Element, axis, focal points, object—nothing else yet.',
      explanation: [
        'The principal axis is the straight reference line through the optical center, the lens point used by the center-ray rule. Each focal point marks where rays parallel to that axis converge after a converging lens, and equal spacing shows the same focal length on both sides. Place the object beyond the near focal point so the construction can produce a physical far-side intersection.',
      ],
      visual: rayVisual(
        'geometry',
        'Converging lens centered on a principal axis with F and 2F marked on both sides and an upright object beyond near 2F.',
        'A vertical converging lens crosses a horizontal principal axis. Near F and far F are equally spaced from the lens, with 2F twice that distance on each side. An upright object stands beyond near 2F.',
        'Decision 1: establish the reference geometry.',
      ),
      takeaway: 'Anchor the lens center, axis, and equal focal distances before drawing rays.',
    },
    {
      id: 'optics-check-geometry',
      kind: 'question',
      stage: 'understanding-check',
      kcIds: ['V3-KC-393396'],
      title: 'Check the focal scale',
      prompt: 'Which placement makes the reference geometry internally consistent?',
      options: [
        {
          id: 'A',
          label: 'Near F and far F are equally spaced from the lens, with each 2F twice as far.',
        },
        { id: 'B', label: 'Both focal points sit on the object side of the lens.' },
        { id: 'C', label: 'The principal axis can miss the optical center.' },
        { id: 'D', label: 'The object and image must be the same distance from the lens.' },
      ],
      help: 'Focal length is measured from the optical center along the principal axis.',
      evaluation: {
        correctOptionId: 'A',
        feedbackByOption: {
          A: 'Correct. Equal focal lengths on the two sides establish one shared scale, and 2F is twice that distance.',
          B: 'A converging-lens construction needs a focal reference on each side.',
          C: 'The principal axis must pass through the optical center and both focal points.',
          D: 'Object and image distances depend on the object position; they are not generally equal.',
        },
        explanation:
          'Place the optical center first, then measure the same focal length to F on both sides. Marking 2F at twice that distance lets later ray intersections show size and location without guessing.',
      },
    },
    {
      id: 'optics-model-first-ray',
      kind: 'explanation',
      kcIds: ['V3-KC-393396'],
      title: 'Draw the first principal ray',
      supportingLine: 'Begin parallel to the axis.',
      explanation: [
        'A principal ray is a construction shortcut whose path is known without measuring an angle; it is not the only ray leaving the object. From the object tip, draw one ray parallel to the axis. The far focal point is defined by where parallel rays are brought together, so this ray must leave the converging lens through far F.',
      ],
      visual: rayVisual(
        'first-ray',
        'First principal ray travels parallel to the axis and then refracts through the far focal point.',
        'A solid ray leaves the object tip horizontally, reaches the converging lens, and bends downward through the focal point on the far side.',
        'Ray 1: parallel in, through far F out.',
      ),
      takeaway: 'Known input condition: parallel in → through far focus out.',
    },
    {
      id: 'optics-check-first-ray',
      kind: 'question',
      stage: 'understanding-check',
      kcIds: ['V3-KC-393396'],
      title: 'Check the first transform',
      prompt: 'A ray arrives parallel to the principal axis. Which point fixes its outgoing path?',
      options: [
        { id: 'A', label: 'Near F on the object side.' },
        { id: 'B', label: 'Far F on the opposite side.' },
        { id: 'C', label: 'Near 2F.' },
        { id: 'D', label: 'The object base.' },
      ],
      help: 'Name the incoming condition, then use the matching principal-ray rule.',
      evaluation: {
        correctOptionId: 'B',
        feedbackByOption: {
          A: 'Near F belongs to a different construction rule; this ray arrives parallel.',
          B: 'Correct. A converging lens sends a parallel incoming ray through far F.',
          C: 'The 2F marker helps read location and size, but it does not set this ray’s bend.',
          D: 'The ray begins at the object tip; the object base does not determine its outgoing path.',
        },
        explanation:
          'Far F is defined by the convergence of rays that enter parallel to the axis. That definition makes the outgoing segment a fixed construction rather than an estimated angle.',
      },
    },
    {
      id: 'optics-model-second-ray',
      kind: 'explanation',
      kcIds: ['V3-KC-393396'],
      title: 'Draw the second principal ray',
      supportingLine: 'Use the optical center as the checkpoint.',
      explanation: [
        'Draw a second ray from the same object tip through the optical center. In the thin-lens approximation, the small direction changes at the two lens surfaces cancel for this center path, so it is drawn straight through. Together, two independently known paths are enough to locate the common image point.',
      ],
      visual: rayVisual(
        'second-ray',
        'Second principal ray passes through the optical center without changing direction.',
        'The first principal ray remains visible. A second solid ray leaves the object tip, passes through the exact center of the lens, and continues along the same straight line.',
        'Ray 2: through center, straight through.',
      ),
      takeaway: 'Second construction rule: through optical center → straight through.',
    },
    {
      id: 'optics-check-second-ray',
      kind: 'question',
      stage: 'understanding-check',
      kcIds: ['V3-KC-393396'],
      title: 'Check the center ray',
      prompt: 'Why is the second principal ray drawn straight through the optical center?',
      options: [
        {
          id: 'A',
          label: 'The thin-lens model treats the small bends at the two surfaces as canceling.',
        },
        { id: 'B', label: 'Every ray through a lens remains horizontal.' },
        { id: 'C', label: 'The optical center is another focal point.' },
        { id: 'D', label: 'The ray reflects from the center of the lens.' },
      ],
      help: 'This is a thin-lens construction rule, not a claim that the lens has no effect on other rays.',
      evaluation: {
        correctOptionId: 'A',
        feedbackByOption: {
          A: 'Correct. The center path is represented as undeviated in the thin-lens approximation.',
          B: 'Only this selected center path is drawn straight; other paths refract.',
          C: 'The optical center and focal points play different geometric roles.',
          D: 'A lens transmits and refracts light; the center ray is not a reflected ray.',
        },
        explanation:
          'For a ray through the optical center, the thin-lens approximation replaces two small surface refractions with one straight construction line. It provides an independent known path from the same object tip.',
      },
    },
    {
      id: 'optics-worked-intersection',
      kind: 'explanation',
      kcIds: ['V3-KC-393396'],
      title: 'Use the physical intersection',
      supportingLine: 'Do not guess the image before the rays meet.',
      explanation: [
        'All rays leaving one object point must correspond to the same image point, so the intersection of two valid construction rays locates the image tip. Here the solid outgoing rays physically meet on the far side, meaning light actually passes through that point and the image is real. If diverging rays met only after dashed backward extensions, the image would be virtual—an apparent source rather than a physical crossing.',
      ],
      visual: rayVisual(
        'intersection',
        'Two refracted principal rays physically intersect on the far side of the converging lens.',
        'The parallel-then-focus ray and the undeviated center ray cross below the principal axis on the far side of the lens. Their crossing is marked as a physical intersection.',
        'Decision 4: locate the image from the rays.',
      ),
      takeaway: 'Solid rays meet → real; only backward extensions meet → virtual.',
    },
    {
      id: 'optics-check-intersection',
      kind: 'question',
      stage: 'understanding-check',
      kcIds: ['V3-KC-393396'],
      title: 'Check what the crossing means',
      prompt:
        'Two solid outgoing rays physically cross on the far side of the lens. What follows first?',
      options: [
        { id: 'A', label: 'The image is real at that crossing.' },
        { id: 'B', label: 'The image is virtual on the object side.' },
        { id: 'C', label: 'The image must be upright.' },
        { id: 'D', label: 'The ray rules need to be reversed.' },
      ],
      help: 'Decide whether actual rays or only backward extensions meet.',
      evaluation: {
        correctOptionId: 'A',
        feedbackByOption: {
          A: 'Correct. Light physically passes through the crossing, so it locates a real image point.',
          B: 'A virtual image is located where backward extensions, not solid rays, appear to meet.',
          C: 'Orientation is read separately from whether the intersection lies above or below the axis.',
          D: 'A common crossing confirms that the two independent ray constructions agree.',
        },
        explanation:
          'Reality comes from the type of intersection. A physical crossing of solid rays means light reaches the image point; dashed backward extensions would identify only an apparent source.',
      },
    },
    {
      id: 'optics-worked-properties',
      kind: 'explanation',
      kcIds: ['V3-KC-393396'],
      title: 'Read the image properties',
      supportingLine: 'Location first; properties follow.',
      explanation: [
        'Place the image base on the principal axis and its tip at the ray intersection. A tip below the axis points opposite the upright object, so the image is inverted. Compare arrow heights only after locating the intersection: the shorter image arrow has a magnification below one in magnitude, meaning it is reduced.',
      ],
      visual: rayVisual(
        'properties',
        'Completed converging-lens ray diagram with a real, inverted, reduced image on the far side.',
        'An inverted image arrow is drawn from the principal axis down to the physical ray intersection on the far side of the converging lens. The image arrow is shorter than the upright object arrow.',
        'Completed trace: real, inverted, reduced.',
      ),
      takeaway: 'Read in order: crossing type, tip direction, then relative arrow height.',
    },
    {
      id: 'optics-practice-guided',
      kind: 'question',
      stage: 'guided',
      kcIds: ['V3-KC-393396'],
      title: 'Choose the first ray',
      prompt:
        'From the object tip, a ray reaches a converging lens parallel to the principal axis. What should it do next?',
      options: [
        { id: 'A', label: 'Continue parallel.' },
        { id: 'B', label: 'Travel through the far focal point.' },
        { id: 'C', label: 'Reflect back through the near focal point.' },
        { id: 'D', label: 'Stop at the lens center.' },
      ],
      help: 'Name the incoming condition first: parallel to the principal axis.',
      evaluation: {
        correctOptionId: 'B',
        feedbackByOption: {
          A: 'A converging lens changes a parallel ray’s direction; continuing parallel would ignore its focal action.',
          B: 'Correct. Far F is defined by where incoming rays parallel to the axis are brought together.',
          C: 'The lens refracts the ray through to the far side; reflecting it backward uses the wrong optical element.',
          D: 'The lens center is a checkpoint for another principal ray, not a place where this ray terminates.',
        },
        explanation:
          'The first principal ray is chosen because its incoming direction is easy to draw and its outgoing path is fixed by the focal-point definition. For a converging lens, parallel in maps to through far F out.',
      },
    },
    {
      id: 'optics-practice-reduced-support',
      kind: 'question',
      stage: 'reduced-support',
      kcIds: ['V3-KC-393396'],
      title: 'Choose the second ray',
      prompt:
        'You already drew the parallel-to-far-focus ray. Which second ray gives a simple independent construction?',
      options: [
        { id: 'A', label: 'A ray through the lens center that continues straight.' },
        { id: 'B', label: 'A second horizontal ray from the object base.' },
        { id: 'C', label: 'A ray that stops at the near focal point.' },
        { id: 'D', label: 'A reflected ray back toward the object.' },
      ],
      help: 'Use a ray whose thin-lens transformation has no angle calculation.',
      evaluation: {
        correctOptionId: 'A',
        feedbackByOption: {
          A: 'Correct. The optical-center path is treated as straight in the thin-lens model, giving an independent construction line.',
          B: 'A ray from the object base locates the image base, not the image tip shared by the first ray.',
          C: 'A near-F ray can be useful, but it must travel from the object tip through near F and onward to the lens.',
          D: 'A thin lens transmits and refracts this ray; a backward reflected path uses a mirror rule.',
        },
        explanation:
          'The center ray supplies a second known path without an angle calculation. Its intersection with the first ray locates where light from the object tip is imaged.',
      },
    },
    {
      id: 'optics-practice-independent',
      kind: 'question',
      stage: 'independent',
      kcIds: ['V3-KC-393396'],
      title: 'Interpret the intersection',
      prompt:
        'Two outgoing rays physically meet below the axis on the side opposite the object. Which image description follows?',
      options: [
        { id: 'A', label: 'Real and inverted.' },
        { id: 'B', label: 'Virtual and upright.' },
        { id: 'C', label: 'Real and upright.' },
        { id: 'D', label: 'Virtual and inverted.' },
      ],
      help: 'Use two separate cues: whether physical rays meet, then whether the tip is above or below the axis.',
      evaluation: {
        correctOptionId: 'A',
        feedbackByOption: {
          A: 'Correct. Physical convergence makes the image real, and the tip below the axis makes it inverted.',
          B: 'A virtual image is located where backward extensions appear to meet, not where solid rays physically cross.',
          C: 'The physical crossing makes the image real, but a tip below the axis makes it inverted rather than upright.',
          D: 'The below-axis cue is inverted, but physical ray convergence makes the image real rather than virtual.',
        },
        explanation:
          'Read two independent cues after locating the intersection. Solid outgoing rays meeting means real; placing the image tip below the axis means inverted.',
        repairNodeId: 'optics-repair-intersection',
      },
    },
    {
      id: 'optics-repair-intersection',
      kind: 'repair',
      kcIds: ['V3-KC-393396'],
      sourceQuestionIds: ['optics-practice-independent'],
      title: 'Repair the intersection read',
      explanation: [
        'A real image forms where solid rays physically carry light through the same point; a virtual image is located where dashed backward extensions only appear to originate. Decide which kind of lines meet before reading orientation. Then compare the image tip with the axis to determine upright or inverted.',
      ],
      visual: rayVisual(
        'intersection',
        'Repair diagram emphasizing the physical intersection of two solid outgoing rays below the axis.',
        'Two solid outgoing rays cross on the far side of the lens. The crossing is below the principal axis. No dashed backward extensions are used.',
      ),
      strategy: 'Read “solid or dashed?” before “above or below?”',
      checkYourThinking: 'If two solid outgoing rays meet, is the image real or virtual?',
    },
    {
      id: 'optics-exit-near',
      kind: 'question',
      stage: 'exit-near',
      kcIds: ['V3-KC-393396'],
      title: 'Final check · same construction',
      prompt:
        'An object is beyond 2F of a converging lens. Your parallel ray and center ray meet between F and 2F on the far side, below the axis. What image is formed?',
      options: [
        { id: 'A', label: 'Real, inverted, reduced.' },
        { id: 'B', label: 'Virtual, upright, enlarged.' },
        { id: 'C', label: 'Real, upright, reduced.' },
        { id: 'D', label: 'Virtual, inverted, reduced.' },
      ],
      help: 'Physical intersection gives reality and side; compare image direction and height last.',
      evaluation: {
        correctOptionId: 'A',
        feedbackByOption: {
          A: 'Correct. The physical far-side crossing is real, the below-axis tip is inverted, and the shorter arrow is reduced.',
          B: 'The rays physically meet, so the image is real; below-axis placement also rules out upright.',
          C: 'The physical crossing is real, but the intersection below the axis makes the image inverted.',
          D: 'Physical convergence makes the image real, and the supplied shorter height makes it reduced.',
        },
        explanation:
          'For an object beyond 2F, the construction places the image between F and 2F on the far side. The crossing type, direction from the axis, and relative height then give real, inverted, and reduced.',
        repairNodeId: 'optics-repair-properties',
      },
    },
    {
      id: 'optics-repair-properties',
      kind: 'repair',
      kcIds: ['V3-KC-393396'],
      sourceQuestionIds: ['optics-exit-near'],
      title: 'Repair the property order',
      explanation: [
        'Property words should come from separate visible cues, not a memorized case label. Solid rays meeting determines real, the tip below the axis determines inverted, and a shorter arrow determines reduced. Keeping those checks separate makes the method transfer when object position changes.',
      ],
      visual: rayVisual(
        'properties',
        'Repair diagram pairing each visible image cue with real, inverted, and reduced.',
        'Solid rays meet at an image arrow on the far side, so it is real. The image arrow points below the axis, so it is inverted. It is shorter than the object arrow, so it is reduced.',
      ),
      strategy: 'Point to one diagram feature before naming each property.',
      checkYourThinking: 'Which visible feature tells you the image is inverted?',
    },
    {
      id: 'optics-exit-changed',
      kind: 'question',
      stage: 'exit-changed',
      kcIds: ['V3-KC-393396'],
      title: 'Final check · changed object position',
      prompt:
        'A real object moves between F and 2F of a converging lens. Two physical rays meet beyond 2F on the far side, below the axis, with a taller image arrow. Which description fits?',
      options: [
        { id: 'A', label: 'Real, inverted, enlarged.' },
        { id: 'B', label: 'Virtual, upright, enlarged.' },
        { id: 'C', label: 'Real, upright, reduced.' },
        { id: 'D', label: 'Virtual, inverted, reduced.' },
      ],
      help: 'The construction rules are unchanged; only the resulting intersection and image height moved.',
      evaluation: {
        correctOptionId: 'A',
        feedbackByOption: {
          A: 'Correct. The physical far-side intersection is real, below-axis placement is inverted, and greater height is enlarged.',
          B: 'Physical outgoing rays meet, so the image is real; below-axis placement also contradicts upright.',
          C: 'The image is real, but below-axis and greater height mean inverted and enlarged.',
          D: 'The solid crossing, below-axis tip, and taller arrow each contradict one part of this choice.',
        },
        explanation:
          'Moving the object changes where the two unchanged principal-ray rules intersect; it does not change the rules themselves. The new physical crossing beyond 2F, below the axis, with greater height gives real, inverted, and enlarged.',
        repairNodeId: 'optics-repair-transfer',
      },
    },
    {
      id: 'optics-repair-transfer',
      kind: 'repair',
      kcIds: ['V3-KC-393396'],
      sourceQuestionIds: ['optics-exit-changed'],
      title: 'Repair without a case table',
      explanation: [
        'Object position changes the angles of the drawn rays, but not their transformation rules: parallel still maps through far F, and the center path stays straight. Redraw those paths from the new object tip and let their intersection set the image location. Then infer orientation and size from that new geometry.',
      ],
      visual: rayVisual(
        'first-ray',
        'Transfer repair emphasizing that the parallel-to-far-focus rule stays fixed when object position changes.',
        'The object position is treated as variable, while the first principal ray still travels parallel to the axis and then through the far focal point. The center-ray rule also remains unchanged.',
      ),
      strategy: 'Redraw the rays; do not swap rules when the object moves.',
      checkYourThinking: 'Which two ray transformations remain unchanged?',
    },
    {
      id: 'optics-complete',
      kind: 'completion',
      kcIds: ['V3-KC-393396'],
      title: 'You built the image from the rays',
      summary:
        'You established the optical geometry, applied two principal-ray transforms, located their intersection, and inferred image properties from visible evidence.',
      takeaways: [
        'Place the lens, axis, focal points, and object before drawing rays.',
        'Parallel → far focus; optical center → undeviated.',
        'Physical intersection means real; extensions only mean virtual.',
      ],
      nextStep:
        'Next, reuse the same decision order when the object position changes: geometry, ray one, ray two, intersection, properties.',
    },
  ],
  modelNodeIds: [
    'optics-lesson-map',
    'optics-model-geometry',
    'optics-model-first-ray',
    'optics-model-second-ray',
  ],
  workedExplanationNodeIds: ['optics-worked-intersection', 'optics-worked-properties'],
  practice: {
    guidedNodeIds: ['optics-practice-guided'],
    reducedSupportNodeIds: ['optics-practice-reduced-support'],
    independentNodeIds: ['optics-practice-independent'],
  },
  exit: {
    nearNodeIds: ['optics-exit-near'],
    changedNodeIds: ['optics-exit-changed'],
  },
  repairNodeIds: [
    'optics-repair-intersection',
    'optics-repair-properties',
    'optics-repair-transfer',
  ],
  completionNodeId: 'optics-complete',
});
