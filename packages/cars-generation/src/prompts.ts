/**
 * Prompt construction.
 *
 * Every prompt here is built from a *blueprint*, never from source material. No real
 * passage, stem, option, or rationale is ever placed in a prompt — that is both the
 * copyright posture and, independently, the architecture the evidence supports: the
 * pipeline with the best published key-validity numbers works from an approved
 * structural template rather than from examples.
 *
 * Prompts request JSON because the outputs are parsed against the Zod schemas in
 * `schema.ts`. A schema rejection is a generation failure, not a parsing inconvenience.
 */

import { archetypeById } from './archetypes';
import { familyById } from './distractors';
import { type ItemModel, type PassageBlueprint } from './blueprint';
import { FORM_BLUEPRINT } from './taxonomy';
import { type AiMessage } from '@mcat/ai-gateway';
import { type GeneratedItem, type GeneratedPassage } from './schema';

/**
 * Standing constraints repeated in every generation prompt. These are the [OFFICIAL]
 * rules restated as instructions; the self-containment rule in particular is the one an
 * unguided model violates most often.
 */
const CONSTRAINTS = [
  'The passage must be entirely self-contained: a careful reader with no background in the topic must be able to answer every question using only the passage. Define specialized terms in place.',
  'Never require outside factual knowledge. If a fact matters to an answer, the passage must supply it.',
  'The passage must argue, not merely describe. It needs a position, support for it, and at least one view the author reports without endorsing.',
  'Write original prose. Do not reproduce, adapt, or imitate any published text.',
  'Use no headings, lists, or formatting inside the passage. Continuous prose in paragraphs only.',
].join('\n- ');

export function buildPassagePrompt(blueprint: PassageBlueprint): AiMessage[] {
  const plan = blueprint.paragraphPlan
    .map((p, i) => `  ${i + 1}. [${p.role}] ${p.content}`)
    .join('\n');

  const perspectives = blueprint.reportedPerspectives
    .map((p) => `  - ${p.party}: holds that ${p.position}. The author ${p.authorStance} this view.`)
    .join('\n');

  const thesisInstruction: Record<PassageBlueprint['thesisPosition'], string> = {
    opening: 'State the thesis in the first two sentences.',
    'mid-text': 'Withhold the thesis until the middle of the passage; open with material that does not announce it.',
    'delayed-close': 'Build toward the thesis and state it only in the final paragraph.',
    distributed: 'Never state the thesis in one place; distribute it so it must be assembled from several paragraphs.',
  };

  return [
    {
      role: 'system',
      content:
        'You write original argumentative prose for a reading-comprehension assessment. You follow structural specifications exactly. You output only JSON.',
    },
    {
      role: 'user',
      content: `Write one passage to this specification.

Discipline: ${blueprint.discipline} (${blueprint.domain})
Topic: ${blueprint.topic}
Thesis: ${blueprint.thesis}
Thesis placement: ${thesisInstruction[blueprint.thesisPosition]}
Rhetorical structure: ${blueprint.structure}
Authorial tone: ${blueprint.tone}
Authorial purpose: ${blueprint.purpose}
Length: ${FORM_BLUEPRINT.passageWordsMin}-${FORM_BLUEPRINT.passageWordsMax} words, in ${blueprint.paragraphPlan.length} paragraphs.

Paragraph plan — follow in order, one paragraph each:
${plan}

Claims that must appear in HEDGED, QUALIFIED form (not asserted absolutely). This matters: questions will turn on the difference between what the author claims tentatively and what a careless reader would take as certain.
${blueprint.hedgedClaims.map((c) => `  - ${c}`).join('\n')}

Views the author REPORTS but does not simply assert as their own:
${perspectives}

${blueprint.termsToDefineInPlace.length > 0 ? `Terms that must be defined within the passage itself:\n${blueprint.termsToDefineInPlace.map((t) => `  - ${t}`).join('\n')}\n` : ''}
Constraints:
- ${CONSTRAINTS}

Output JSON only:
{"title": "<short descriptive title, not a thesis statement>", "paragraphs": ["<paragraph 1>", "..."]}`,
    },
  ];
}

/**
 * Item generation. The distractor plan is passed through explicitly because the
 * distractor stage is where generation fails roughly twice as often as everything else:
 * in one study 70% of generated stems and keys were judged valid against only 37% of
 * distractor sets. Leaving distractors to the model's discretion is the single largest
 * quality risk in the pipeline.
 */
export function buildItemPrompt(
  model: ItemModel,
  passage: GeneratedPassage,
  paragraphOffset = 1,
): AiMessage[] {
  const archetype = archetypeById(model.archetype);
  if (!archetype) throw new Error(`unknown archetype: ${model.archetype}`);

  const numbered = passage.paragraphs
    .map((p, i) => `[${i + paragraphOffset}] ${p}`)
    .join('\n\n');

  const distractorSpec = model.distractorPlan
    .map((d, i) => {
      const family = familyById(d.family);
      return `  Distractor ${i + 1} — family "${d.family}" (${family?.title ?? 'unknown'})
    Construction rule: ${family?.construction ?? 'n/a'}
    This distractor specifically must: ${d.intent}`;
    })
    .join('\n');

  const evidenceList = model.evidenceParagraphs.map((p) => p + paragraphOffset).join(', ');

  return [
    {
      role: 'system',
      content:
        'You write multiple-choice reading-comprehension items to exact specifications. Exactly one option is defensible. You output only JSON.',
    },
    {
      role: 'user',
      content: `Write one four-option item on the passage below.

Passage (paragraphs numbered):
${numbered}

Item type: ${archetype.title}
Cognitive operation: ${archetype.operation}
Stem shape — follow this structure, filling the slots from the passage:
${archetype.stemShapes.map((s) => `  - ${s}`).join('\n')}
Option style: ${archetype.choiceGeometry === 'phrase-completion' ? 'short phrases that complete the stem, which should end with a colon' : 'complete, independent sentences'}

What the correct answer must establish: ${model.keyProposition}
The key must rest on paragraph(s) ${evidenceList} and nowhere else.
${archetype.keyRequirement}
${model.stemSuppliedInformation ? `\nThe stem must itself supply this new information, which is absent from the passage: ${model.stemSuppliedInformation}` : ''}

Write exactly three distractors, one per specification:
${distractorSpec}

Hard requirements:
- Exactly one option is defensible from the passage. Every other option must be wrong for the specific reason given above.
- No option may be correct because of outside knowledge.
- Do not make the correct option the longest. Keep all four options within a similar length range.
- Quote the passage spans that establish the key, verbatim and exactly as written.
- Give a rationale for every option, including the key.

Output JSON only:
{"stem": "<stem>",
 "choices": [{"label":"A","text":"..."},{"label":"B","text":"..."},{"label":"C","text":"..."},{"label":"D","text":"..."}],
 "correctChoice": "<A|B|C|D>",
 "evidenceQuotes": ["<verbatim span from the passage>"],
 "rationales": [{"label":"A","rationale":"...","family":"<distractor family id, omit for the key>"}, ...]}`,
    },
  ];
}

/**
 * Adjudication: argue *for* every option in turn, then decide how many survive.
 *
 * The target failure mode is the modal LLM item defect — more than one defensible
 * option, which accounted for half of all invalid items in the one study that
 * categorised them. The method itself is unvalidated, so its output routes to human
 * review and should be logged against human decisions until a local agreement rate
 * exists.
 */
export function buildAdjudicationPrompt(item: GeneratedItem, passage: GeneratedPassage): AiMessage[] {
  const options = item.choices.map((c) => `${c.label}. ${c.text}`).join('\n');
  return [
    {
      role: 'system',
      content:
        'You audit multiple-choice items for defensibility. You argue in good faith for every option before judging. You output only JSON.',
    },
    {
      role: 'user',
      content: `Passage:
${passage.paragraphs.join('\n\n')}

Question: ${item.stem}

${options}

Task, in order:
1. For each option A-D, construct the strongest good-faith case that it is the credited answer, citing specific passage text. If no honest case exists, say so.
2. Decide which options are genuinely defensible from the passage alone.
3. Note any option that is defensible only by importing outside knowledge — that is a defect, not a defence.

Output JSON only:
{"perOption": [{"label":"A","caseFor":"...","defensible":true|false,"requiresOutsideKnowledge":true|false}, ...],
 "defensibleLabels": ["A"],
 "verdict": "single-defensible" | "multiple-defensible" | "none-defensible",
 "notes": "..."}`,
    },
  ];
}

/**
 * Targeted revision. The critic that works is a checklist with a named target, not a
 * general instruction to improve — and iteration has a measured prose cost, so the
 * failing checks are named explicitly and the model is told to change nothing else.
 */
export function buildRevisionPrompt(
  item: GeneratedItem,
  passage: GeneratedPassage,
  failures: readonly string[],
): AiMessage[] {
  return [
    {
      role: 'system',
      content:
        'You repair specific defects in assessment items without rewriting what already works. You output only JSON.',
    },
    {
      role: 'user',
      content: `This item failed specific quality checks. Fix exactly those defects and change nothing else.

Passage:
${passage.paragraphs.join('\n\n')}

Current item:
Stem: ${item.stem}
${item.choices.map((c) => `${c.label}. ${c.text}`).join('\n')}
Credited answer: ${item.correctChoice}

Failing checks:
${failures.map((f) => `  - ${f}`).join('\n')}

Preserve the item's type, the credited answer's underlying proposition, and each distractor's intended error class. Do not lengthen the correct option.

Output JSON only, in the same shape as the original item:
{"stem": "...", "choices": [...], "correctChoice": "...", "evidenceQuotes": [...], "rationales": [...]}`,
    },
  ];
}

/** Strips code fences and extracts the outermost JSON object from a model response. */
export function extractJson(text: string): unknown {
  const withoutFences = text.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
  const start = withoutFences.indexOf('{');
  const end = withoutFences.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('no JSON object found in model response');
  }
  return JSON.parse(withoutFences.slice(start, end + 1));
}
