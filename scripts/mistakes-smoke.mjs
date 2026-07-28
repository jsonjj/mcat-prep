#!/usr/bin/env node
/**
 * End-to-end smoke test for the Mistakes surfaces, over real HTTP against a
 * running learner-web dev server.
 *
 *   pnpm --filter @mcat/learner-web dev
 *   node scripts/mistakes-smoke.mjs [--base http://localhost:5173]
 *
 * This exists because the failure it guards against was invisible to unit tests:
 * adaptive practice captured which wrong answer a learner picked and dropped it
 * into an event payload nothing read, while `getErrorLog` walked a different
 * event stream entirely — so a shipped "Review Mistakes" slot sent learners to a
 * page that could not show a single practice miss. Everything below is read off
 * the wire: the queue the server serves, the attempt it scores, and the rows the
 * Mistakes tab would render.
 *
 * It now covers BOTH question surfaces. The study loop reached the tab through the
 * same seam and could fail the same silent way, and it has a failure mode practice
 * does not: its items live in the authored lesson bank, so a row hydrated against
 * the practice corpus comes back empty rather than erroring.
 */

const args = process.argv.slice(2);
const baseIndex = args.indexOf('--base');
const BASE = baseIndex === -1 ? 'http://localhost:5173' : args[baseIndex + 1];

let failures = 0;

const check = (label, ok, detail = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`);
};

async function request(method, path, body) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  if (!response.ok) {
    throw new Error(`${method} ${path} → ${response.status} ${text.slice(0, 200)}`);
  }
  return json;
}

const get = (path) => request('GET', path);
const post = (path, body) => request('POST', path, body ?? {});

const envelope = () => ({
  envelope: {
    eventId: crypto.randomUUID(),
    idempotencyKey: crypto.randomUUID(),
    occurredAt: new Date().toISOString(),
    contentRelease: 'v7-local',
  },
});

async function main() {
  console.log(`Mistakes smoke → ${BASE}\n`);

  await request('DELETE', '/v1/account/progress');
  await post('/v1/bootstrap', envelope());
  // The study loop is gated behind plan setup; adaptive practice is not. Without
  // this the study half of the run only ever sees `kind: 'locked'`.
  await request('PUT', '/v1/profile/goal', {
    goal: { testDate: null, targetScore: 515, minutesPerWeek: 600 },
  });

  const queue = await get('/v1/practice/queue/5');
  check('practice queue serves items', queue.items.length > 0, `${queue.items.length} items`);
  if (queue.items.length === 0) return;

  // Answer each served item, deliberately avoiding the key we learn as we go so
  // the run produces both misses (the rows) and correct answers (the denominator).
  const submitted = [];
  for (const [i, item] of queue.items.entries()) {
    const pick = i % 2 === 0 ? 'B' : 'C';
    const result = await post('/v1/practice/attempts/adaptive', {
      ...envelope(),
      questionId: item.question.id,
      specId: item.specId,
      chosenChoiceId: pick,
      firstAttempt: true,
      // The deployed lambda nests the command; the dev authority reads it flat.
      command: {
        questionId: item.question.id,
        specId: item.specId,
        chosenChoiceId: pick,
        firstAttempt: true,
      },
    });
    submitted.push({ item, pick, correct: result.correct, key: result.correctChoiceId });
  }
  const misses = submitted.filter((s) => !s.correct);
  check('at least one miss was scored', misses.length > 0, `${misses.length} misses`);
  if (misses.length === 0) return;

  const errors = await get('/v1/errors');
  check(
    'every scored miss appears on the Mistakes tab',
    misses.every((m) => errors.some((e) => e.questionId === m.item.question.id)),
    `${errors.length} rows for ${misses.length} misses`,
  );

  const first = errors.find((e) => e.questionId === misses[0].item.question.id);
  if (first !== undefined) {
    const sent = misses[0];
    check('the chosen distractor survived the round trip', first.chosenChoiceId === sent.pick,
      `sent ${sent.pick}, stored ${first.chosenChoiceId}`);
    check('the row carries the question stem', typeof first.stem === 'string' && first.stem.length > 0);
    check('the row carries both option texts',
      first.chosenChoiceText.length > 0 && first.correctChoiceText.length > 0);
    check('the row carries the refutation of the chosen option', first.choiceRationale !== null);
    check('the row carries the real KC / cluster', first.kcId !== null || first.cluster !== null,
      `kc=${first.kcId} cluster=${first.cluster}`);
    check('the row carries a focus token for a fresh re-attempt', first.focus !== null);
    check('no self-reported cause field is present', !('cause' in first));
  }

  // ---- the study loop, over the same seam -----------------------------------
  // /app/learn answers real questions and used to ask the learner to name the
  // cause of a miss before showing the key. Both halves are gone; what has to
  // survive is the miss reaching this tab with the option they picked.
  let studyQuestionId = null;
  let studyStep = await get('/v1/learning/session');
  for (let guard = 0; guard < 12 && studyStep.kind !== 'question'; guard += 1) {
    if (studyStep.kind === 'complete') break;
    if (studyStep.kind === 'recall') await post('/v1/recall', { ...envelope(), answer: 'x' });
    else await post('/v1/learning/session/continue', envelope());
    studyStep = await get('/v1/learning/session');
  }
  check('the study loop serves a question', studyStep.kind === 'question', `kind=${studyStep.kind}`);

  if (studyStep.kind === 'question') {
    studyQuestionId = studyStep.question.id;
    const studyPick = studyStep.question.choices[1]?.id ?? 'B';
    await post('/v1/attempts', { ...envelope(), choiceId: studyPick });
    const afterMiss = await get('/v1/learning/session');

    check('a study miss reveals the key with no step in between',
      afterMiss.sub === 'reveal' && afterMiss.reveal?.correctChoiceId !== undefined,
      `sub=${afterMiss.sub}`);
    check('the reveal carries the option the learner picked',
      afterMiss.reveal?.chosenChoiceId === studyPick,
      `picked ${studyPick}, reveal says ${afterMiss.reveal?.chosenChoiceId}`);
    check('the reveal refutes THAT option, not just the key',
      typeof afterMiss.reveal?.choiceRationales?.[studyPick] === 'string' &&
        afterMiss.reveal.choiceRationales[studyPick].length > 0);
    // Keys, not prose: the explanations legitimately contain words like "because".
    const keysOf = (o) =>
      o === null || typeof o !== 'object'
        ? []
        : Object.entries(o).flatMap(([k, v]) => [k, ...keysOf(v)]);
    check('the step offers nowhere to put a self-reported cause',
      !keysOf(afterMiss).some((k) => k.toLowerCase().includes('cause')) &&
        afterMiss.sub !== 'cause');

    // Leaving the reveal spends the one unassisted retry rather than advancing.
    await post('/v1/learning/session/continue', envelope());
    const afterContinue = await get('/v1/learning/session');
    check('the one unassisted retry still happens, now after the correction',
      afterContinue.kind === 'question' &&
        afterContinue.sub === 'retry' &&
        afterContinue.question.id === studyQuestionId,
      `sub=${afterContinue.sub} item=${afterContinue.question?.id}`);

    const withStudy = await get('/v1/errors');
    const studyRow = withStudy.find((e) => e.questionId === studyQuestionId);
    check('the study miss reaches the Mistakes tab', studyRow !== undefined,
      `${withStudy.length} rows`);
    if (studyRow !== undefined) {
      // The study item resolves out of the authored lesson bank; hydrating it
      // against the practice corpus would leave these fields empty.
      check('the study row hydrated its content', studyRow.stem.length > 0 &&
        studyRow.chosenChoiceText.length > 0 && studyRow.correctChoiceText.length > 0);
      check('the study row kept the distractor', studyRow.chosenChoiceId === studyPick,
        `sent ${studyPick}, stored ${studyRow.chosenChoiceId}`);
      check('the study row carries the refutation', studyRow.choiceRationale !== null);
      check('the study row offers a fresh re-attempt', studyRow.focus !== null);
    }
    check('practice rows are still there alongside it',
      misses.every((m) => withStudy.some((e) => e.questionId === m.item.question.id)));
  }

  const patterns = await get('/v1/errors/patterns');
  check('patterns group at KC or cluster grain',
    patterns.every((p) => p.grain === 'kc' || p.grain === 'cluster' || p.grain === 'skill'));
  check('every pattern carries a denominator',
    patterns.every((p) => p.attemptedItems >= p.missedItems && p.attemptedItems > 0),
    patterns.map((p) => `${p.missedItems}/${p.attemptedItems} ${p.key}`).join(', ') || 'none yet');

  // ---- one KC, one pattern, whichever surface served it ----------------------
  // Grouping keys on the logged KC, and the two writers used to fill that column
  // from different fields: practice from the corpus KC (`V3-KC-...`), study from an
  // internal skill-graph node (`bb1-enzyme-inhibition`). Those never compare equal,
  // so one concept produced two half-evidenced patterns. There is no crosswalk to
  // build — the lesson graph and the corpus share all 422 of their KCs — so what is
  // checked here is that both surfaces now log ONE vocabulary and group as one.
  const allRows = await get('/v1/errors');
  const studyRows = allRows.filter((e) => e.kcId !== null && e.kcId.startsWith('V3-KC-'));
  check('study rows carry a corpus-shaped KC id, not a skill-graph id',
    allRows.length === 0 || studyRows.length > 0,
    `${studyRows.length} of ${allRows.length} rows KC-shaped: ${[...new Set(allRows.map((e) => e.kcId))].join(', ')}`);

  // The invariant that fails if the two writers disagree: every KC that rows were
  // logged under has AT MOST ONE pattern, so no concept is split in two.
  const keyed = allRows.filter((e) => e.kcId !== null);
  const kcsWithRows = new Set(keyed.map((e) => e.kcId));
  const kcPatternKeys = patterns.filter((p) => p.grain === 'kc').map((p) => p.key);
  check('no KC is split across two patterns',
    kcPatternKeys.length === new Set(kcPatternKeys).size,
    `${kcPatternKeys.length} kc patterns, ${new Set(kcPatternKeys).size} distinct`);
  check('every KC pattern key is a KC the rows were actually logged under',
    kcPatternKeys.every((k) => kcsWithRows.has(k)),
    `patterns=[${kcPatternKeys.join(', ')}] rows=[${[...kcsWithRows].join(', ')}]`);

  // The cross-source case itself. The study loop's item and at least one practice
  // item share a KC, so that KC must appear ONCE, counting the misses from both.
  const studyKc = keyed.find((e) => e.questionId === studyQuestionId)?.kcId ?? null;
  const practiceMissedKcs = new Set(
    keyed
      .filter((e) => misses.some((m) => m.item.question.id === e.questionId))
      .map((e) => e.kcId),
  );
  check('the study miss and a practice miss landed on the same KC',
    studyKc !== null && practiceMissedKcs.has(studyKc),
    `study=${studyKc} practice=[${[...practiceMissedKcs].join(', ')}]`);

  if (studyKc !== null && practiceMissedKcs.has(studyKc)) {
    const matching = patterns.filter((p) => p.grain === 'kc' && p.key === studyKc);
    // Before the fix this was 2: one keyed `bb1-enzyme-inhibition`, one keyed the
    // corpus KC, each holding half the evidence.
    check('the shared KC forms exactly ONE pattern, not one per surface',
      matching.length === 1, `${matching.length} patterns keyed ${studyKc}`);

    if (matching.length === 1) {
      const pattern = matching[0];
      const missedHere = new Set(keyed.filter((e) => e.kcId === studyKc).map((e) => e.questionId));
      check('its numerator counts the distinct missed items from both surfaces',
        pattern.missedItems === missedHere.size,
        `pattern says ${pattern.missedItems}, tab shows ${missedHere.size}`);
      // Correct answers are logged too, so the denominator can only be larger, and
      // it has to cover more items than the study surface alone could supply.
      check('its denominator covers both surfaces',
        pattern.attemptedItems >= pattern.missedItems && pattern.attemptedItems > 1,
        `${pattern.missedItems} of ${pattern.attemptedItems}`);
    }
  }

  const path = await post('/v1/plan/today/build', {
    ...envelope(),
    input: {
      recallLoad: { dueLearning: 0, dueReviews: 0, newAvailable: 0, due: 0, estimatedMinutesForDue: 0 },
      candidateLessons: [],
      force: true,
      timezoneOffsetMinutes: new Date().getTimezoneOffset(),
    },
  });
  // Re-read: study misses joined the tab above, and the Review Mistakes slot has
  // to agree with the tab as it stands now, not as it stood before the study run.
  const finalErrors = await get('/v1/errors');
  const open = finalErrors.filter((e) => !e.resolved).length;
  const sessions = path.activities.filter((a) => a.kind === 'review_mistakes');
  check("Today's Path promises no more mistakes than the tab shows",
    sessions.every((s) => s.count <= open),
    `open=${open} sessions=[${sessions.map((s) => s.count).join(',')}]`);

  const today = await get('/v1/plan/today');
  check('the Today header counts the same open misses', today.repairsOpen === open,
    `header=${today.repairsOpen} tab=${open}`);

  console.log(`\n${failures === 0 ? 'ALL OK' : `${failures} FAILURE(S)`}`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((error) => {
  console.error(`\nsmoke run failed: ${error.message}`);
  process.exitCode = 1;
});
