import { SkillGraphSchema, type SkillGraph } from '@mcat/domain';
import type { SkillCluster } from '@mcat/contracts';
import { QuestionSchema, StimulusSchema, type BankManifest, type Question, type Stimulus } from './schema';
import {
  HintLadderSchema,
  LessonSchema,
  RecallPromptSchema,
  SimulationSpecSchema,
  type HintLadder,
  type Lesson,
  type RecallPrompt,
  type SimulationSpec,
} from './instruction';
import { compileQuestion, type CompiledQuestion } from './compile';
import { validateQuestion } from './validate';
import {
  syntheticHintLadders,
  syntheticLessons,
  syntheticQuestions,
  syntheticRecallPrompts,
  syntheticSimulations,
  syntheticSkillGraph,
  syntheticStimuli,
} from './synthetic/enzyme-bank';

export interface LoadedBank {
  contentRelease: string;
  isSynthetic: boolean;
  skillGraph: SkillGraph;
  questions: Question[]; // full (server-side) records
  stimuli: Stimulus[];
  lessons: Lesson[];
  hintLadders: HintLadder[];
  recallPrompts: RecallPrompt[];
  simulations: SimulationSpec[];
  manifest: BankManifest;
  compiled: Map<string, CompiledQuestion>;
}

function buildManifest(release: string, questions: Question[], stimuli: Stimulus[]): BankManifest {
  const familiesByCluster: Partial<Record<SkillCluster, Set<string>>> = {};
  for (const q of questions) {
    const set = familiesByCluster[q.skill_cluster] ?? new Set<string>();
    set.add(q.family_id);
    familiesByCluster[q.skill_cluster] = set;
  }
  const counts = {
    questions: questions.length,
    stimuli: stimuli.length,
    testOnly: questions.filter((q) => q.delivery.test_only).length,
  };
  const familiesRecord: Partial<Record<SkillCluster, number>> = {};
  for (const [cluster, set] of Object.entries(familiesByCluster)) {
    familiesRecord[cluster as SkillCluster] = set.size;
  }
  return {
    contentRelease: release,
    publishedAt: new Date().toISOString(),
    counts,
    familiesByCluster: familiesRecord,
  };
}

/**
 * Load the synthetic BB1 enzyme bank. Parses every record through its schema and
 * fails loudly if a fixture is invalid — fixtures must always be schema-valid.
 */
export function loadSyntheticBank(): LoadedBank {
  const release = 'synthetic-2026.07';
  const skillGraph = SkillGraphSchema.parse(syntheticSkillGraph);
  const stimuli = syntheticStimuli.map((s) => StimulusSchema.parse(s));
  const questions = syntheticQuestions.map((raw) => {
    const parsed = QuestionSchema.parse(raw);
    const issues = validateQuestion(parsed).filter((i) => i.severity === 'error');
    if (issues.length > 0) {
      throw new Error(`Invalid synthetic question ${parsed.id}: ${issues.map((i) => i.code).join(', ')}`);
    }
    return parsed;
  });

  const compiled = new Map<string, CompiledQuestion>();
  for (const q of questions) compiled.set(q.id, compileQuestion(q));

  return {
    contentRelease: release,
    isSynthetic: true,
    skillGraph,
    questions,
    stimuli,
    lessons: syntheticLessons.map((l) => LessonSchema.parse(l)),
    hintLadders: syntheticHintLadders.map((h) => HintLadderSchema.parse(h)),
    recallPrompts: syntheticRecallPrompts.map((r) => RecallPromptSchema.parse(r)),
    simulations: syntheticSimulations.map((s) => SimulationSpecSchema.parse(s)),
    manifest: buildManifest(release, questions, stimuli),
    compiled,
  };
}
