import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Source contract for the error-handling decisions in
 * docs/design/error-handling-design.md that live in the UI layer:
 *
 *  - adaptive Practice asks for no self-reported cause and reveals immediately
 *    (§2.2–§2.3: expert κ = 0.000–0.063 on cause, .71 vs .71 on withhold),
 *  - the spaced same-item resurface survives that removal,
 *  - the Mistakes tab leads with content and a "try again" action rather than a
 *    cause headline and a repair pill (§6.4, the highest-priority single change),
 *  - the patterns section always shows a denominator and never asserts a cohort
 *    comparison (§6.5–§6.6),
 *  - the older Study flow, which still owns `ProbableCause`, is left alone.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (path: string): string =>
  existsSync(join(root, path)) ? readFileSync(join(root, path), 'utf8') : '';

/** Source with comments stripped, for "this file must not do X" assertions. */
const code = (path: string): string =>
  read(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

describe('adaptive practice asks for no cause', () => {
  const session = read('apps/learner-web/src/screens/practice/PracticeSession.tsx');

  it('has no cause picker, and no state to hold one', () => {
    const source = code('apps/learner-web/src/screens/practice/PracticeSession.tsx');
    expect(source).not.toBe('');
    expect(source).not.toMatch(/DiagnosePicker|onCausePicked|const CAUSES|mc-causegrid|mc-cause/);
    expect(source).not.toMatch(/'diagnose'/);
    expect(source).not.toMatch(/selectCause|cause_selected/);
  });

  it('sends a scored first attempt straight to the reveal', () => {
    const flow = read('apps/learner-web/src/screens/practice/session-flow.ts');
    expect(session).toMatch(/setSub\(subAfterFirstAttempt\(r\.correct\)\)/);
    expect(flow).toMatch(/export const subAfterFirstAttempt[\s\S]{0,120}=>\s*'reveal'/);
    // No step remains between the answer and the answer key.
    expect(code('apps/learner-web/src/screens/practice/session-flow.ts')).toMatch(
      /'answering' \| 'retry' \| 'reveal'/,
    );
  });

  it('keeps the spaced resurface of the missed item', () => {
    const flow = read('apps/learner-web/src/screens/practice/session-flow.ts');
    expect(flow).toMatch(/RETRY_GAP = 3/);
    expect(flow).toMatch(/Math\.min\(index \+ 1 \+ gap, sequenceLength\)/);
    expect(session).toMatch(/resurfaceAt\(index, sequence\.length\)/);
    expect(session).toMatch(/kind: 'retry'/);
  });

  it('still refutes the specific distractor that was chosen', () => {
    expect(session).toMatch(/choiceRationales\[wrongChoice\]/);
    expect(session).toMatch(/Why \$\{wrongChoice\} misses/);
  });
});

describe('the older Study flow keeps its own diagnose step', () => {
  it('leaves the shared ProbableCause type and the Study picker in place', () => {
    expect(read('apps/learner-web/src/screens/Study.tsx')).toMatch(/mc-cause/);
    expect(read('packages/contracts/src/events.ts')).toMatch(/ProbableCauseSchema/);
    expect(read('packages/contracts/src/events.ts')).toMatch(/cause_selected/);
  });
});

describe('Mistakes tab leads with content, not a cause label', () => {
  const mistakes = read('apps/learner-web/src/screens/Mistakes.tsx');

  it('drops the cause headline and the repair pill', () => {
    const source = code('apps/learner-web/src/screens/Mistakes.tsx');
    expect(source).not.toBe('');
    expect(source).not.toMatch(/CAUSE_LABEL|\.cause\b/);
    expect(source).not.toMatch(/Repaired|repair pending/);
  });

  it('renders the miss itself: stem, both options, the refutation, the date', () => {
    for (const field of [
      'entry.stem',
      'entry.chosenChoiceText',
      'entry.correctChoiceText',
      'entry.choiceRationale',
      'entry.occurredAt',
    ]) {
      expect(mistakes, `Mistakes tab must render ${field}`).toContain(field);
    }
  });

  it('makes every row a re-attempt on a FRESH item, not a re-read', () => {
    expect(mistakes).toMatch(/onTryAgain/);
    // Routes into the existing adaptive queue with a focus token; the queue's own
    // exposure/repair seam guarantees freshness, so there is no second selector.
    expect(mistakes).toMatch(/'\/app\/practice\/session'/);
    expect(mistakes).toMatch(/focus/);
    expect(mistakes).not.toMatch(/entry\.questionId.*practice\/items|getPracticeItem/);
  });

  it('shows resolved items behind a filter rather than in the main list', () => {
    expect(mistakes).toMatch(/showResolved/);
    expect(mistakes).toMatch(/!e\.resolved/);
  });

  it('adds no running total, streak, or cohort comparison', () => {
    expect(code('apps/learner-web/src/screens/Mistakes.tsx')).not.toMatch(
      /streak|total mistakes|compared with|other learners|percentile/i,
    );
  });

  it('preserves the Today’s Path return contract', () => {
    expect(mistakes).toMatch(/returnTo/);
    expect(mistakes).toMatch(/completedActivityId: activityId/);
    expect(mistakes).toMatch(/Done — back to plan/);
  });
});

describe('pattern analysis stays at KC / cluster grain', () => {
  const mistakes = read('apps/learner-web/src/screens/Mistakes.tsx');
  const views = read('packages/contracts/src/learner-views.ts');

  it('never names a misconception grain (error_models is populated on 0 items)', () => {
    expect(code('apps/learner-web/src/screens/Mistakes.tsx')).not.toMatch(
      /misconception|error_model|errorModel/i,
    );
    expect(views).not.toMatch(/misconceptionId|errorModelId/);
    expect(views).toMatch(/grain: z\.enum\(\['kc', 'cluster', 'skill'\]\)/);
  });

  it('always renders the denominator alongside the count', () => {
    expect(mistakes).toMatch(/pattern\.missedItems/);
    expect(mistakes).toMatch(/pattern\.attemptedItems/);
    expect(mistakes).toMatch(/of \{pattern\.attemptedItems\}/);
  });

  it('hedges instead of asserting when the sample is small', () => {
    expect(mistakes).toMatch(/pattern\.assertable/);
    expect(mistakes).toMatch(/too few so far/);
  });

  it('ends each pattern row in a re-attempt action', () => {
    expect(mistakes).toMatch(/onTryAgain\(pattern\.focus\)/);
  });
});

describe('the practice attempt log is the error log’s source', () => {
  const authority = read('packages/authority-core/src/authority.ts');

  it('reads logged attempts rather than walking the event store', () => {
    const start = authority.indexOf('async getErrorLog');
    const end = authority.indexOf('async getMistakePatterns');
    expect(start).toBeGreaterThan(-1);
    const body = authority.slice(start, end);
    expect(body).toMatch(/listPracticeAttempts/);
    // The two accidental scopings that made practice misses invisible.
    expect(body).not.toMatch(/state\.events/);
    expect(body).not.toMatch(/bank\.compiled\.get/);
    expect(body).not.toMatch(/ENZYME_SKILL/);
  });

  it('keeps the event store itself intact for the older Study flow', () => {
    expect(authority).toMatch(/attempt_submitted/);
    expect(authority).toMatch(/cause_selected/);
  });

  it('writes the chosen distractor next to the existing exposure/repair calls', () => {
    expect(authority).toMatch(
      /recordExposure\([\s\S]{0,600}recordPracticeAttempt\([\s\S]{0,600}queueRepair\(/,
    );
    expect(authority).toMatch(/chosenChoiceId: cmd\.chosenChoiceId/);
  });
});

describe('the practice attempt migration extends the unused table', () => {
  const migration = read('database/migrations/0010_practice_attempt_log.sql');

  it('adds the chosen choice to attempt_results rather than creating a new table', () => {
    expect(migration).not.toBe('');
    expect(migration).toMatch(/alter table attempt_results/);
    expect(migration).not.toMatch(/create table/);
    for (const column of [
      'question_id',
      'kc_id',
      'skill',
      'cluster',
      'chosen_choice_id',
      'first_attempt',
      'activity_type',
      'occurred_at',
    ]) {
      expect(migration, `migration must add ${column}`).toMatch(
        new RegExp(`add column ${column}`),
      );
    }
  });

  it('keeps one first-attempt row per learner and item', () => {
    expect(migration).toMatch(
      /create unique index[\s\S]*?on attempt_results \(learner_id, question_id\)/,
    );
    expect(migration).toMatch(/where activity_type = 'practice' and first_attempt/);
  });

  it('uses UTC instants and no legacy column types', () => {
    expect(migration).not.toMatch(/\btimestamp\s+(?!with time zone)/);
    expect(migration).not.toMatch(/\b(serial|varchar|char)\s*\(/);
  });
});
