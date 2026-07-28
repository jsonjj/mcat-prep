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

  const patterns = await get('/v1/errors/patterns');
  check('patterns group at KC or cluster grain',
    patterns.every((p) => p.grain === 'kc' || p.grain === 'cluster' || p.grain === 'skill'));
  check('every pattern carries a denominator',
    patterns.every((p) => p.attemptedItems >= p.missedItems && p.attemptedItems > 0),
    patterns.map((p) => `${p.missedItems}/${p.attemptedItems} ${p.key}`).join(', ') || 'none yet');

  const path = await post('/v1/plan/today/build', {
    ...envelope(),
    input: {
      recallLoad: { dueLearning: 0, dueReviews: 0, newAvailable: 0, due: 0, estimatedMinutesForDue: 0 },
      candidateLessons: [],
      force: true,
      timezoneOffsetMinutes: new Date().getTimezoneOffset(),
    },
  });
  const open = errors.filter((e) => !e.resolved).length;
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
