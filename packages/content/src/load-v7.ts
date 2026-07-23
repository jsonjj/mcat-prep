import { QuestionSchema, type Question as V7Question } from './schema';
import { validateV7Question, type ValidationIssue } from './validate';
import { compileV7Question, type CompiledV7Question } from './compile';

/**
 * v7 JSONL load path. Because v7 IS the canonical schema, there is no field
 * remapping here — every line is parsed straight into a canonical v7 record and
 * validated. Invalid lines are collected as errors (never thrown), so a whole
 * batch can be validated and reported at once.
 *
 * This module is pure (no file IO). The CLI (`tools/content-cli`) reads the JSONL
 * file read-only and feeds its text here.
 */

export interface V7LineError {
  source: string;
  line: number;
  message: string;
}

export interface V7SemanticIssue {
  source: string;
  line: number;
  id: string;
  issues: ValidationIssue[];
}

export interface LoadV7Result {
  /** Schema-valid canonical records. */
  items: V7Question[];
  /** Lines rejected by schema validation (malformed / wrong shape). */
  errors: V7LineError[];
  /** Parsed records that carry semantic issues (completeness/consistency). */
  semanticIssues: V7SemanticIssue[];
}

/** Parse one raw object into a canonical v7 record. Throws on schema failure. */
export function parseV7Question(raw: unknown): V7Question {
  return QuestionSchema.parse(raw);
}

/** Load many JSONL sources; invalid lines are collected as errors, never thrown. */
export function loadV7Jsonl(sources: { name: string; text: string }[]): LoadV7Result {
  const items: V7Question[] = [];
  const errors: V7LineError[] = [];
  const semanticIssues: V7SemanticIssue[] = [];

  for (const src of sources) {
    const lines = src.text.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (line.trim().length === 0) return;
      try {
        const q = parseV7Question(JSON.parse(line));
        items.push(q);
        const issues = validateV7Question(q);
        if (issues.length > 0) {
          semanticIssues.push({ source: src.name, line: index + 1, id: q.id, issues });
        }
      } catch (err) {
        errors.push({
          source: src.name,
          line: index + 1,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    });
  }

  return { items, errors, semanticIssues };
}

export interface V7Summary {
  total: number;
  bySection: Record<string, number>;
  withPassage: number;
  withAssets: number;
  schemaErrors: number;
  semanticErrors: number;
  semanticWarnings: number;
}

/** Roll a load result up into report-friendly counts. */
export function summarizeV7(result: LoadV7Result): V7Summary {
  const bySection: Record<string, number> = {};
  let withPassage = 0;
  let withAssets = 0;
  for (const q of result.items) {
    bySection[q.section] = (bySection[q.section] ?? 0) + 1;
    if ((q.passage ?? '').trim().length > 0) withPassage += 1;
    if (q.assets.length > 0) withAssets += 1;
  }
  let semanticErrors = 0;
  let semanticWarnings = 0;
  for (const s of result.semanticIssues) {
    for (const i of s.issues) {
      if (i.severity === 'error') semanticErrors += 1;
      else semanticWarnings += 1;
    }
  }
  return {
    total: result.items.length,
    bySection,
    withPassage,
    withAssets,
    schemaErrors: result.errors.length,
    semanticErrors,
    semanticWarnings,
  };
}

/**
 * Compile every loaded v7 item into { safe, protected } artifacts. The protected
 * half (correct_answer + explanations) must be stored server-only and never
 * shipped to a learner surface.
 */
export function compileV7Bank(items: readonly V7Question[]): CompiledV7Question[] {
  return items.map((q) => compileV7Question(q));
}
