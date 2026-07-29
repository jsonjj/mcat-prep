import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Source contract for the error-handling decisions in
 * docs/design/error-handling-design.md that live in the UI layer:
 *
 *  - BOTH question flows — adaptive Practice and the older Study loop — ask for no
 *    self-reported cause (§2.2–§2.3: expert κ = 0.000–0.063 on cause),
 *  - adaptive Practice withholds the correct answer until a SECOND miss (§3.3 as
 *    amended 2026-07-28), and the withheld key is unreachable from the component
 *    that renders the card,
 *  - each keeps its same-item retry, now placed after the correction,
 *  - every mutation that can write or clear a miss invalidates the Mistakes tab's
 *    own query keys,
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

  /**
   * §3.3 was amended again on 2026-07-29, reversing the 2026-07-28 revision: the
   * key is disclosed immediately on a miss. This pin has now been inverted twice,
   * so state the reasoning rather than only the expectation. The withhold was
   * defensible only as a *deferral*, and only while the same item returning
   * guaranteed the key still arrived. Once the re-test became a different item on
   * the same KC × skill, that guarantee was gone and the original's key would never
   * have landed — the permanent-silence case Pashler et al. (2005) rules out. The
   * two therefore move together, which is what the next test guards.
   */
  it('discloses the key on every scored attempt, miss included', () => {
    const flow = code('apps/learner-web/src/screens/practice/session-flow.ts');
    expect(session).toMatch(/setSub\(subAfterAttempt\(\)\)/);
    expect(flow).toMatch(/export const subAfterAttempt = \(\): Sub => 'reveal'/);
    // Two steps only. A third would be somewhere for a deferral to live again.
    expect(flow).toMatch(/'answering' \| 'reveal'/);
    expect(flow).not.toMatch(/'feedback'|'retry'|'diagnose'/);
  });

  /**
   * The card still takes a `Feedback` rather than the raw result. Nothing is
   * redacted from it any more, but the boundary is what keeps the choice list from
   * being able to mark the right option before an answer is submitted.
   */
  it('renders the card from Feedback, and never lets the chooser see correctness', () => {
    const card = session.slice(session.indexOf('function FeedbackCard'));
    expect(card).not.toBe('');
    expect(card).not.toMatch(/PracticeAttemptResult|result\./);
    expect(session).toMatch(/feedback: Feedback;/);
    expect(session).toMatch(/feedbackFor\(result, choice\)/);

    const chooser = session.slice(
      session.indexOf('function ChoiceList'),
      session.indexOf('function FeedbackCard'),
    );
    expect(chooser).not.toBe('');
    expect(chooser).not.toMatch(/correct/i);
  });

  /**
   * The withhold and the same-item re-ask were removed as a pair, and neither may
   * come back alone: a re-ask without a withhold asks a question whose answer the
   * learner was just given, and a withhold without a re-ask is permanent silence.
   * A lag-0 re-ask is separately the one arrangement in this literature with direct
   * evidence of harm (Karpicke & Roediger 2007: .19 at two days vs .60 at lag 5,
   * and worse than not retrying at all), which the old end-of-session clamp
   * produced whenever a miss landed in the last few steps.
   */
  it('re-asks nothing in-session: no gap constant, no clamp, no retry slot', () => {
    const flow = read('apps/learner-web/src/screens/practice/session-flow.ts');
    expect(flow).not.toMatch(/RETRY_GAP/);
    expect(flow).not.toMatch(/resurfaceAt/);
    expect(flow).not.toMatch(/Math\.min\(index \+ 1 \+ gap/);
    expect(session).not.toMatch(/resurfaceAt|kind: 'retry'|firstChoice/);
    // The sequence is seeded from the queue and never spliced, so no step can be
    // inserted behind the learner.
    expect(session).toMatch(/setSequence\(loaded\)/);
    expect(session).not.toMatch(/\.splice\(/);
  });

  it('still refutes the specific distractor that was chosen', () => {
    expect(session).toMatch(/feedback\.wrongChoiceRationale/);
    expect(session).toMatch(/Why \$\{feedback\.wrongChoiceId\} misses/);
    expect(code('apps/learner-web/src/screens/practice/session-flow.ts')).toMatch(
      /wrongChoiceRationale:\s*\n?\s*wrongChoiceId === null \? null : \(result\.choiceRationales\[wrongChoiceId\] \?\? null\)/,
    );
  });

  it('sends exactly one command per item, so nothing can double-count a miss', () => {
    // One `submit.mutate` in the file. With the in-session re-ask gone there is no
    // second scoring path to guard, but the pin stays: a duplicate would write a
    // second `attempt_results` row and inflate the Mistakes tab's open count.
    //
    // Whether an attempt is the learner's first is no longer the client's to assert.
    // It left `PracticeAttemptCommandSchema` because it was a claim about
    // server-held state, and the authority derives it from its own exposure records;
    // sending it would now fail the route's exact-key body check.
    expect([...session.matchAll(/submit\.mutate\(/g)]).toHaveLength(1);
    expect(session).not.toMatch(/firstAttempt/);
  });
});

/**
 * The cache-invalidation half of the same bug. `getErrorLog` was returning the new
 * miss correctly; the tab read a stale React Query cache because adaptive practice
 * invalidated six mastery keys and neither of the two the tab queries under.
 */
describe('every mutation that can write or clear a miss drops the tab’s caches', () => {
  it('keeps the key sets in one dependency-free module rather than per-hook literals', () => {
    const keys = read('apps/learner-web/src/app/invalidation-keys.ts');
    expect(keys).not.toBe('');
    expect(keys).toMatch(/MISTAKE_KEYS = \['errors', 'error-patterns', 'shaky-wins'\]/);
    // No imports: the sets stay unit-testable without a browser or the authority.
    expect(code('apps/learner-web/src/app/invalidation-keys.ts')).not.toMatch(/^import /m);
  });

  it('has each query module import its set instead of restating it', () => {
    for (const [path, symbol] of [
      ['apps/learner-web/src/app/practice-queries.ts', 'PRACTICE_INVALIDATE_KEYS'],
      ['apps/learner-web/src/app/queries.ts', 'LEARNER_KEYS'],
      ['apps/learner-web/src/app/today-queries.ts', 'PLAN_ACTIVITY_COMPLETE_INVALIDATE'],
    ] as const) {
      const source = read(path);
      expect(source, `${path} must import ${symbol}`).toMatch(
        new RegExp(`${symbol}[\\s\\S]{0,120}from '\\./invalidation-keys'`),
      );
      expect(source, `${path} must not restate the key list`).not.toMatch(
        new RegExp(`const ${symbol}\\s*(:|=)`),
      );
    }
  });

  it('scopes the plan-activity case to a completion', () => {
    // in_progress / skipped move no mistake state; only completing a Review
    // Mistakes slot advances `mistakesReviewedThrough`.
    const today = read('apps/learner-web/src/app/today-queries.ts');
    expect(today).toMatch(
      /v\.status === 'complete' \? PLAN_ACTIVITY_COMPLETE_INVALIDATE : TODAYS_PATH_INVALIDATE/,
    );
    expect(read('packages/authority-core/src/authority.ts')).toMatch(
      /activity\.kind === 'review_mistakes'\) state\.mistakesReviewedThrough/,
    );
  });

  it('leaves recall out of it', () => {
    // An FSRS lapse never writes the attempt log and never appears on the tab.
    expect(read('apps/learner-web/src/app/recall-queries.ts')).not.toMatch(
      /'errors'|'error-patterns'/,
    );
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

  it('names the picked misconception but keeps the raw error_models map server-only, grain unchanged', () => {
    // Phase-0 corrected the premise this used to rest on ("error_models populated
    // on 0 items"): the corpus is ~100% filled, so WS2/WS3 DO surface the picked
    // distractor's misconception (post-answer) and the pattern's leaning — as
    // derived fields, never the raw per-choice map, and never a new grain.
    const ui = code('apps/learner-web/src/screens/Mistakes.tsx');
    expect(ui).toMatch(/chosenMisconception/);
    expect(ui).toMatch(/leaningMisconception/);
    // The raw server-only map never appears in the UI or on the learner view (the
    // learner view carries only the two derived strings).
    expect(ui).not.toMatch(/error_models|errorModels/);
    expect(code('packages/contracts/src/learner-views.ts')).not.toMatch(/error_models|errorModels/);
    // The pattern grain stays KC / cluster — misconception is a description on it.
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

describe('WS3 — calibration ordering, shaky wins, and the picked misconception', () => {
  const mistakes = read('apps/learner-web/src/screens/Mistakes.tsx');

  it('orders confidently-wrong misses first', () => {
    // The sort ranks confidently_wrong ahead of the rest — worst-first, for
    // hypercorrection — and the miss list is rendered through it.
    expect(mistakes).toMatch(/calibration === 'confidently_wrong'/);
    expect(mistakes).toMatch(/\.sort\(missOrder\)/);
  });

  it('renders a distinct shaky-wins group from the separate read', () => {
    expect(mistakes).toMatch(/useShakyWins/);
    expect(mistakes).toMatch(/ShakyWinRow/);
    expect(mistakes).toMatch(/Wins worth locking in/);
    // The shaky-wins list is its own section, not merged into the misses list.
    expect(mistakes).toMatch(/shaky\.map/);
  });

  it('names the picked distractor’s misconception on a miss card', () => {
    expect(mistakes).toContain('entry.chosenMisconception');
  });

  it('names the leaned-toward misconception on a pattern row', () => {
    expect(mistakes).toContain('pattern.leaningMisconception');
  });

  it('still routes every card to a fresh practice item, shaky wins included', () => {
    // The shaky-win card reuses the same focus→queue routing as a miss card.
    const shaky = mistakes.slice(mistakes.indexOf('function ShakyWinRow'));
    expect(shaky).not.toBe('');
    expect(shaky).toMatch(/onTryAgain\(entry\.focus\)/);
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

  /**
   * The distractor log is written on the same path as exposure and repair,
   * asserted by MEMBERSHIP of `submitPracticeAttempt` rather than by textual
   * proximity. Proximity was the original spelling and it says less than it
   * looks: it never checked that the three calls were in one method at all, and
   * it failed on a reordering that kept every one of them where it belongs.
   */
  it('writes the chosen distractor on the same path as exposure and repair', () => {
    const start = authority.indexOf('async submitPracticeAttempt(');
    const end = authority.indexOf('private buildPracticeSnapshot');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const body = authority.slice(start, end);

    const order = ['recordExposure(', 'recordPracticeAttempt(', 'queueRepair('].map((call) =>
      body.indexOf(call),
    );
    expect(order.every((at) => at > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(body).toMatch(/chosenChoiceId: cmd\.chosenChoiceId/);
  });

  it('logs a Study first attempt additively, without touching scoring or repair', () => {
    const start = authority.indexOf('private async logStudyAttempt');
    const end = authority.indexOf('requestReveal(state: LearnerState)');
    expect(start).toBeGreaterThan(-1);
    const body = authority.slice(start, end);
    expect(body).toMatch(/activityType: 'study'/);
    expect(body).toMatch(/firstAttempt: true/);
    // Only the log is written: no mastery, no evidence, no repair spec. Not calling
    // `queueRepair` is a scope decision, not an id-space one — the KC logged here IS
    // a corpus KC and would match items (see the 422-KC block below).
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

/**
 * The KC grain both write paths log, and the reason no crosswalk belongs here.
 *
 * Pattern grouping keys on `attempt_results.kc_id`. Practice fills it from the v7
 * corpus (`questions.kc_id`); Study used to fill it from `internal_skill_ids[0]`, a
 * node in the internal skill graph. Those never compare equal, so one concept
 * produced two half-evidenced patterns.
 *
 * The two sources are NOT disjoint id spaces and need no mapping table: the lesson
 * graph and the question corpus carry the SAME 422 KCs — 422 distinct ids in each,
 * all 422 present in both, none unique to either side. Only the manifest is asserted
 * here; the corpus lives under a gitignored path and is absent in CI.
 */
describe('the study path logs a real KC from the shared 422-KC set', () => {
  const KC_ID = /^V3-KC-\d{6}$/;

  const manifestKcIds = (): Set<string> => {
    const raw = read('curriculum/v3/v3-lesson-authoring-manifest.json');
    expect(raw, 'the v3 lesson authoring manifest must be committed').not.toBe('');
    const manifest = JSON.parse(raw) as { curriculum: { kcs: { kc_id: string }[] } };
    return new Set(manifest.curriculum.kcs.map((kc) => kc.kc_id));
  };

  it('has 422 KCs in the lesson graph, the set the corpus also draws from', () => {
    const ids = manifestKcIds();
    expect(ids.size).toBe(422);
    expect([...ids].every((id) => KC_ID.test(id))).toBe(true);
  });

  it('gives the synthetic dev fixture real KC ids rather than invented ones', () => {
    const fixture = read('packages/content/src/synthetic/enzyme-bank.ts');
    const declared = [...fixture.matchAll(/'(V3-KC-\d{6})'/g)].map((m) => m[1]!);
    expect(declared.length).toBeGreaterThan(0);

    // The dev fallback bank stands in for the corpus, so an invented id would let
    // dev and CI exercise a KC vocabulary production never sees — the exact drift
    // that hid this bug.
    const real = manifestKcIds();
    for (const id of new Set(declared)) {
      expect(real.has(id), `${id} must be a real v3 KC`).toBe(true);
    }
  });

  it('logs the KC field, not the skill-graph field, and keeps the other three columns', () => {
    const authority = read('packages/authority-core/src/authority.ts');
    const start = authority.indexOf('private async logStudyAttempt');
    const end = authority.indexOf('requestReveal(state: LearnerState)');
    expect(start).toBeGreaterThan(-1);
    const body = authority.slice(start, end);
    expect(body).toMatch(/kcId: q\?\.kc_ids\[0\] \?\? null/);
    expect(body).not.toMatch(/kcId: q\?\.internal_skill_ids/);
    // The other grain columns already agreed with practice; they stay item-derived.
    expect(body).toMatch(/cluster: q\?\.skill_cluster \?\? null/);
    expect(body).toMatch(/familyId: q\?\.family_id \?\? null/);
  });

  it('keeps `internal_skill_ids` doing its own job: the display skill', () => {
    // Repurposing the field would have been the cheap fix and would have broken
    // skill resolution and the hard-prerequisite edges keyed on the skill graph.
    const authority = read('packages/authority-core/src/authority.ts');
    expect(authority).toMatch(/internal_skill_ids\[0\] \?\? ENZYME_SKILL/);
    expect(read('packages/content/src/synthetic/enzyme-bank.ts')).toMatch(
      /internal_skill_ids: \[SKILL_INHIB\]/,
    );
  });

  it('builds no crosswalk, mapping table or id translation layer', () => {
    for (const path of [
      'packages/authority-core/src/authority.ts',
      'packages/authority-core/src/practice.ts',
      'packages/content/src/synthetic/enzyme-bank.ts',
      'database/migrations/0012_study_attempt_kc_grain.sql',
    ]) {
      expect(code(path), `${path} must not translate between KC id spaces`).not.toMatch(
        /kcCrosswalk|KC_CROSSWALK|kcAliases|toCorpusKc|skillIdToKc/,
      );
    }
    // The tempting one-liner: rewriting the old value to the new one in SQL. That is
    // a crosswalk baked into a migration, and true only of one dev fixture.
    expect(read('database/migrations/0012_study_attempt_kc_grain.sql')).not.toMatch(
      /set kc_id = 'V3-KC-/,
    );
  });

  it('corrects the record in a new migration rather than editing an applied one', () => {
    // `runMigrations` hashes each file and throws on drift, so 0010/0011 are frozen
    // the moment any database has applied them.
    expect(read('database/src/migrate.ts')).toMatch(/Checksum drift detected for migration/);

    const migration = read('database/migrations/0012_study_attempt_kc_grain.sql');
    expect(migration).not.toBe('');
    expect(migration).toMatch(/422/);
    expect(migration).toMatch(/NOT DISJOINT|not disjoint/);
    // Forward-only, and no schema change: the column's meaning changed, not its shape.
    expect(migration).not.toMatch(/create table|alter table|drop column/);
    expect(migration).not.toMatch(/\btimestamp\s+(?!with time zone)/);
    // A shape predicate, not a mapping — and scoped to the one activity type whose
    // writer changed.
    expect(migration).toMatch(/kc_id !~ '\^V3-KC-\[0-9\]\+\$'/);
    expect(migration).toMatch(/activity_type = 'study'/);
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
    // 0014's timing columns are probed the same way, for the same reason.
    expect(repository).toMatch(/has_timing === true/);
  });

  it('is forward-only and adds no new table', () => {
    expect(migration).not.toMatch(/create table/);
    expect(migration).not.toMatch(/\btimestamp\s+(?!with time zone)/);
  });
});

/**
 * WS0's timing capture extends the same attempt log again: `elapsed_ms` and
 * `answer_changes`, nullable so "not captured" stays distinct from a real 0.
 */
describe('the timing migration adds capture columns to the attempt log', () => {
  const migration = read('database/migrations/0014_attempt_timing.sql');

  it('adds elapsed_ms and answer_changes to attempt_results rather than a new table', () => {
    expect(migration).not.toBe('');
    expect(migration).toMatch(/alter table attempt_results/);
    expect(migration).not.toMatch(/create table/);
    expect(migration).toMatch(/add column elapsed_ms integer/);
    expect(migration).toMatch(/add column answer_changes integer/);
  });

  it('keeps them nullable with a non-negative check, and no legacy column types', () => {
    // Nullable + default NULL: "not captured" must be distinct from a real 0.
    expect(migration).not.toMatch(/elapsed_ms integer not null/);
    expect(migration).not.toMatch(/answer_changes integer not null/);
    expect(migration).toMatch(/elapsed_ms is null or elapsed_ms >= 0/);
    expect(migration).toMatch(/answer_changes is null or answer_changes >= 0/);
    expect(migration).not.toMatch(/\btimestamp\s+(?!with time zone)/);
    expect(migration).not.toMatch(/\b(serial|varchar|char)\s*\(/);
  });
});
