import { z } from 'zod';
import { CLUSTER_INFO, ContentIdSchema, SkillClusterSchema, type OperationTag } from '@mcat/contracts';
import { QuestionSchema, StimulusSchema, type Question, type Stimulus } from './schema';

/**
 * Importer for externally-generated candidate items (the `question-bank/*.jsonl`
 * files). It maps a candidate into the canonical schema as UNVERIFIED draft
 * content: status "draft", review pending, delivery {mastery_eligible:false,
 * protected:true, test_only:true}. Keys/rationales are preserved on the canonical
 * Question so `compileQuestion` can split them into a protected payload; they must
 * never reach a learner-safe surface.
 */

const LETTERS = ['A', 'B', 'C', 'D'] as const;

/** Loose shape of a candidate line; only the fields we consume are declared. */
const CandidateSchema = z
  .object({
    candidate_id: z.string().min(1),
    choices: z.array(z.string().min(1)).length(4),
    proposed_key: z.enum(LETTERS),
    option_rationales: z.record(z.enum(LETTERS), z.string()),
    learner_visible: z.object({
      passage: z.string().default(''),
      stem: z.string().min(1),
    }),
    target: z.object({ skill: z.string().min(1), subject: z.string().optional() }),
    blueprint: z
      .object({
        operation: z.string().optional(),
        learning_objective: z.string().optional(),
        content_topic: z.string().optional(),
      })
      .partial()
      .default({}),
    retrieval_item_ids: z.array(z.string()).default([]),
  })
  .passthrough();

export interface ImportedItem {
  question: Question;
  stimulus: Stimulus | null;
}

export interface ImportResult {
  items: ImportedItem[];
  errors: { source: string; line: number; message: string }[];
}

const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

function mapOperation(op: string | undefined): OperationTag {
  const s = (op ?? '').toLowerCase();
  if (/predict/.test(s)) return 'P';
  if (/synthes|infer|integrat|thesis/.test(s)) return 'I';
  if (/calculat|quantit|comput/.test(s)) return 'Q';
  if (/recall|knowled|identif|define/.test(s)) return 'K';
  if (/experiment|design|evaluat/.test(s)) return 'E';
  return 'A';
}

const splitParagraphs = (passage: string): string[] =>
  passage
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

/** Map a single candidate object into a canonical (draft, unverified) item. Throws on invalid input. */
export function parseCandidateQuestion(raw: unknown): ImportedItem {
  const c = CandidateSchema.parse(raw);
  const cluster = SkillClusterSchema.parse(c.target.skill);
  const section = CLUSTER_INFO[cluster].section;
  const id = ContentIdSchema.parse(c.candidate_id);

  const provenance = {
    origin: 'original' as const,
    source_refs: c.retrieval_item_ids,
    rights_status: 'cleared' as const, // confirmed by the author; still requires human content review
    ai_assisted: true,
  };
  const review = {
    content_status: 'pending' as const,
    copy_status: 'pending' as const,
    accessibility_status: 'pending' as const,
    reviewer_ids: [] as string[],
  };

  const hasPassage = c.learner_visible.passage.trim().length > 0;
  const stimulusId = hasPassage ? `${c.candidate_id}-stim` : null;
  const stimulusType = section === 'cars' ? ('passage' as const) : ('experiment' as const);
  const stimulus: Stimulus | null = hasPassage
    ? StimulusSchema.parse({
        schema_version: '1.0',
        id: stimulusId,
        version: 1,
        status: 'draft',
        type: stimulusType,
        section,
        body: splitParagraphs(c.learner_visible.passage),
        media_ids: [],
        provenance,
        test_only: true,
      })
    : null;

  const rationaleChoices: Record<string, string> = {};
  for (const letter of LETTERS) {
    rationaleChoices[letter] = c.option_rationales[letter] ?? '(no rationale provided)';
  }

  const format = stimulus
    ? stimulus.type === 'passage'
      ? ('passage_mcq' as const)
      : ('experiment_mcq' as const)
    : ('discrete_mcq' as const);

  const question = QuestionSchema.parse({
    schema_version: '1.0',
    id,
    version: 1,
    status: 'draft',
    section,
    skill_cluster: cluster,
    internal_skill_ids: [c.target.skill],
    template_tags: [mapOperation(c.blueprint.operation)],
    learning_objective: c.blueprint.learning_objective ?? c.learner_visible.stem.slice(0, 140),
    format,
    difficulty: 3,
    stimulus_id: stimulusId,
    stem: c.learner_visible.stem,
    choices: c.choices.map((text, i) => ({ id: LETTERS[i], text, distractor_families: [] })),
    correct_choice_id: c.proposed_key,
    rationales: {
      correct: c.option_rationales[c.proposed_key] ?? '(no rationale provided)',
      choices: rationaleChoices,
    },
    prerequisite_ids: [],
    content_tags: c.blueprint.content_topic ? [c.blueprint.content_topic] : [],
    estimated_seconds: section === 'cars' ? 110 : 90,
    media_ids: [],
    family_id: c.blueprint.content_topic ? `fam-${slug(c.blueprint.content_topic)}` : c.candidate_id,
    provenance,
    review,
    delivery: {
      diagnostic_eligible: false,
      mastery_eligible: false,
      protected: true,
      test_only: true,
    },
  });

  return { question, stimulus };
}

/** Import many JSONL sources; invalid lines are collected as errors, never thrown. */
export function importCandidates(sources: { name: string; text: string }[]): ImportResult {
  const items: ImportedItem[] = [];
  const errors: ImportResult['errors'] = [];
  for (const src of sources) {
    const lines = src.text.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (line.trim().length === 0) return;
      try {
        items.push(parseCandidateQuestion(JSON.parse(line)));
      } catch (err) {
        errors.push({
          source: src.name,
          line: index + 1,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    });
  }
  return { items, errors };
}
