import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Source contract for the error-handling decisions in
 * docs/design/error-handling-design.md that live in the UI layer:
 *
 *  - BOTH question flows — adaptive Practice and the older Study loop — ask for no
 *    self-reported cause and reveal immediately (§2.2–§2.3: expert
 *    κ = 0.000–0.063 on cause, .71 vs .71 on withhold),
 *  - each keeps its same-item retry, now placed after the correction,
 *  - the Mistakes tab leads with content and a "try again" action rather than a
 *    cause headline and a repair pill (§6.4, the highest-priority single change),
 *  - the patterns section always shows a denominator and never asserts a cohort
 *    comparison (§6.5–§6.6),
 *  - nothing anywhere can still ask for, transport, or store a cause.
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

describe('the Study flow asks for no cause either', () => {
  const study = read('apps/learner-web/src/screens/Study.tsx');

  it('has no cause picker, no picker markup, and no picker styles', () => {
    const source = code('apps/learner-web/src/screens/Study.tsx');
    expect(source).not.toBe('');
    expect(source).not.toMatch(/CausePicker|const CAUSES|mc-causegrid|mc-cause/);
    expect(source).not.toMatch(/selectCause|useSelectCause|ProbableCause/);
    // The picker's copy asserted the opposite of what the evidence supports.
    expect(source).not.toMatch(/Naming the cause/);
    // The CSS was retained by the previous commit only because Study used it.
    expect(read('apps/learner-web/src/styles/app.css')).not.toMatch(/mc-cause/);
  });

  it('sends a miss straight to the reveal, refuting the option the server recorded', () => {
    // 'cause' is no longer a representable substate. The one surviving mention of
    // the string is the resume path for a session persisted on the old step, which
    // rewrites it to 'reveal' — see the QuestionSubState assertion below.
    expect(code('packages/authority-core/src/types.ts')).toMatch(
      /QuestionSubState = 'answering' \| 'retry' \| 'reveal'/,
    );
    expect(code('packages/authority-core/src/authority.ts')).toMatch(
      /\(s\.sub as string\) === 'cause'[\s\S]{0,80}s\.sub = 'reveal'/,
    );
    expect(code('packages/contracts/src/learner-views.ts')).not.toMatch(/'cause'/);
    // The chosen option is server-carried: this screen's local selection state is
    // cleared by the step change, so reading it there would drop the refutation.
    expect(study).toMatch(/reveal\.chosenChoiceId/);
    expect(study).toMatch(/Why \$\{chosen\} misses/);
    expect(study).not.toMatch(/chosen=\{choice\}/);
  });

  it('keeps the one unassisted retry, after the reveal rather than before it', () => {
    const authority = read('packages/authority-core/src/authority.ts');
    expect(study).toMatch(/step\.sub === 'retry'/);
    expect(study).toMatch(/Try once more/);
    expect(authority).toMatch(/retryPending = true/);
    expect(authority).toMatch(/s\.sub = 'retry';/);
    expect(authority).toMatch(/kind: 'diagnostic_retry'/);
  });
});

describe('no surface can still ask for, transport, or store a cause', () => {
  it('drops the event type, the schema, the command, the route and the port method', () => {
    expect(read('packages/contracts/src/events.ts')).not.toMatch(
      /ProbableCauseSchema|CauseSelectedSchema|'cause_selected'/,
    );
    expect(read('packages/client-core/src/port.ts')).not.toMatch(/selectCause/);
    expect(read('packages/client-core/src/http.ts')).not.toMatch(/attempts\/cause/);
    expect(read('services/lambdas/learner-api/src/routes.ts')).not.toMatch(/CauseCommandBody/);
    expect(read('services/lambdas/learner-api/src/workflow.ts')).not.toMatch(/handleCause/);
    expect(read('services/local-authority/src/in-process.ts')).not.toMatch(/selectCause/);
  });

  it('leaves stored history readable: nothing parses accepted_events by type', () => {
    // The union is what dropped `cause_selected`, so replay safety rests on
    // historical rows never being validated against it.
    expect(read('database/migrations/0001_authority.sql')).toMatch(/event_type text not null,/);
    expect(read('database/migrations/0001_authority.sql')).not.toMatch(
      /event_type[^\n]*check[^\n]*cause/,
    );
    // The projection is rehydrated by an unchecked cast, not a schema parse.
    expect(read('services/authority-kernel/src/views.ts')).toMatch(
      /structuredClone\(record\.state\) as unknown as LearnerState/,
    );
    expect(read('services/authority-kernel/src/views.ts')).not.toMatch(/LearnerEventSchema/);
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

describe('the attempt log is the error log’s source, for both flows', () => {
  const authority = read('packages/authority-core/src/authority.ts');

  it('reads logged attempts rather than walking the event store', () => {
    const start = authority.indexOf('async getErrorLog');
    const end = authority.indexOf('async getMistakePatterns');
    expect(start).toBeGreaterThan(-1);
    const body = authority.slice(start, end);
    expect(body).toMatch(/listPracticeAttempts/);
    // The two accidental scopings that made practice misses invisible.
    expect(body).not.toMatch(/state\.events/);
    expect(body).not.toMatch(/ENZYME_SKILL/);
  });

  it('hydrates a practice row through the port and only a study row from the bank', () => {
    const source = code('packages/authority-core/src/authority.ts');
    const start = source.indexOf('private async hydrateAttempt');
    const end = source.indexOf('async getErrorLog');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const body = source.slice(start, end);
    // A study item comes from the authored lesson bank, which is the only place it
    // exists — the deployed practice corpus does not carry it.
    expect(body).toMatch(/activityType === 'study'/);
    expect(body).toMatch(/bank\.compiled\.get/);
    // The practice branch must stay free of any dependency on that bank being
    // loaded — the regression 0010 fixed was exactly such a hidden coupling.
    const practiceBranch = body.slice(body.indexOf('practiceBank.getQuestion'));
    expect(practiceBranch).not.toMatch(/bank\.compiled/);
  });

  it('keeps the event store itself intact', () => {
    expect(authority).toMatch(/attempt_submitted/);
    expect(authority).toMatch(/reveal_requested/);
  });

  it('writes the chosen distractor next to the existing exposure/repair calls', () => {
    expect(authority).toMatch(
      /recordExposure\([\s\S]{0,600}recordPracticeAttempt\([\s\S]{0,600}queueRepair\(/,
    );
    expect(authority).toMatch(/chosenChoiceId: cmd\.chosenChoiceId/);
  });

  it('logs a Study first attempt additively, without touching scoring or repair', () => {
    const start = authority.indexOf('private async logStudyAttempt');
    const end = authority.indexOf('requestReveal(state: LearnerState)');
    expect(start).toBeGreaterThan(-1);
    const body = authority.slice(start, end);
    expect(body).toMatch(/activityType: 'study'/);
    expect(body).toMatch(/firstAttempt: true/);
    // Only the log is written: no mastery, no evidence, no repair spec keyed on a
    // KC the practice corpus cannot match.
    expect(body).not.toMatch(/queueRepair|applyMasteryAttempt|appendEvidence|recordAttempt\(/);
    // In-lesson comprehension checks stay off the tab (§6.5).
    expect(body).toMatch(/phase === 'guided'/);
  });

  it('reads both displayed activity types out of Postgres', () => {
    const repository = read('services/persistence-postgres/src/practice-attempt-repository.ts');
    expect(repository).toMatch(/DISPLAYED_ACTIVITY_TYPES = \['practice', 'study'\]/);
    expect(repository).toMatch(/activity_type = any\(\$2\)/);
    // The read used to hard-code the type on the way back out, which would send
    // every study row hunting for its content in the wrong corpus.
    expect(read('services/persistence-postgres/src/practice-exposure-repository.ts')).not.toMatch(
      /activityType: 'practice',/,
    );
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

  it('uses UTC instants and no legacy column types', () => {
    expect(migration).not.toMatch(/\btimestamp\s+(?!with time zone)/);
    expect(migration).not.toMatch(/\b(serial|varchar|char)\s*\(/);
  });
});

describe('the study migration widens what 0010 scoped to one activity type', () => {
  const migration = read('database/migrations/0011_study_attempt_log.sql');
  const repository = read('services/persistence-postgres/src/practice-attempt-repository.ts');

  it('keys the first-attempt uniqueness by activity type as well as item', () => {
    expect(migration).not.toBe('');
    expect(migration).toMatch(
      /create unique index attempt_results_question_first_attempt_uidx\s*\n\s*on attempt_results \(learner_id, activity_type, question_id\)/,
    );
    expect(migration).toMatch(/where activity_type in \('practice', 'study'\) and first_attempt/);
    // The old, practice-only arbiter must not survive alongside it.
    expect(migration).toMatch(/drop index if exists attempt_results_practice_first_attempt_uidx/);
  });

  it('matches the arbiter the insert infers, predicate included', () => {
    expect(repository).toMatch(/on conflict \(learner_id, activity_type, question_id\)/);
    expect(repository).toMatch(
      /where activity_type in \('practice', 'study'\) and first_attempt\s*\n\s*do nothing/,
    );
  });

  it('degrades instead of erroring on a database that predates it', () => {
    // Probing only for 0010's column would accept a database whose index the
    // insert then fails to infer — a runtime error on every logged attempt.
    expect(repository).toMatch(/attempt_results_question_first_attempt_uidx/);
    expect(repository).toMatch(/has_column === true && row\.has_index === true/);
  });

  it('is forward-only and adds no new table', () => {
    expect(migration).not.toMatch(/create table/);
    expect(migration).not.toMatch(/\btimestamp\s+(?!with time zone)/);
  });
});
