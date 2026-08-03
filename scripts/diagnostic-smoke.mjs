#!/usr/bin/env node
/**
 * End-to-end smoke test for the diagnostic, over real HTTP against a running
 * learner-web dev server.
 *
 *   pnpm --filter @mcat/learner-web dev
 *   node scripts/diagnostic-smoke.mjs [--base http://localhost:5173]
 *
 * This exists because the multistage design was once chosen in simulation,
 * shipped, and found never to have run on the production axis. Everything it
 * reports is read off the wire — block count, block sizes, the items served —
 * rather than off the design object, so a design the app does not actually
 * serve fails here instead of passing a unit test that asks the design what it
 * would have done.
 *
 * It spends four sessions, against a store that allows twelve an hour per
 * client, so it can be run twice before the rate limiter has anything to say.
 * It also clears the dev authority's learner progress, which is in-memory and
 * single-learner, so that the mastery seed write has something to move.
 */

const args = process.argv.slice(2);
const baseIndex = args.indexOf('--base');
const BASE = baseIndex === -1 ? 'http://localhost:5173' : args[baseIndex + 1];

const CHOICES = ['A', 'B', 'C', 'D'];

let failures = 0;

const check = (label, ok, detail = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`);
};

async function post(path, body) {
  const response = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`${path} returned non-JSON (${response.status}): ${text.slice(0, 200)}`);
  }
  if (!response.ok) throw new Error(`${path} ${response.status}: ${json.error ?? text}`);
  return json;
}

async function get(path) {
  const response = await fetch(`${BASE}${path}`, { headers: { accept: 'application/json' } });
  const text = await response.text();
  if (!response.ok) throw new Error(`${path} ${response.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

async function del(path) {
  const response = await fetch(`${BASE}${path}`, { method: 'DELETE' });
  if (!response.ok) throw new Error(`${path} ${response.status}`);
}

const next = (sessionToken) => post('/v1/diagnostic/next', sessionToken ? { sessionToken } : {});

const submit = (view, answers) =>
  post('/v1/diagnostic/block', {
    sessionToken: view.sessionToken,
    blockToken: view.blockToken,
    stageId: view.stageId,
    answers,
  });

const ids = (view) => view.questions.map((q) => q.id);

/** Every question the same choice, as the learner's first pass at the block. */
const uniform = (view, choice) => Object.fromEntries(ids(view).map((id) => [id, choice]));

/**
 * Walk a whole session answering every question the same way, optionally
 * drafting each block one way and revising it before commit, and fingerprint
 * what came back.
 *
 * The route, the contention-allocated content of every block after the first,
 * and the result all follow from which answers were committed — but none of
 * them follows from any *one* answer, because the client cannot see the key and
 * so cannot know which single flip would move a cut. Fingerprinting the whole
 * sitting is the strongest statement a client-side harness can make.
 */
async function fingerprintRun(choice, draftedAs) {
  const served = [];
  let view = await next(null);
  while (!view.done) {
    // Only the final value of a revised answer is ever sent, which is exactly
    // what the UI does with a block the learner moved back through.
    const answers = draftedAs === undefined ? {} : uniform(view, draftedAs);
    for (const id of ids(view)) answers[id] = choice;
    served.push(...ids(view));
    view = await submit(view, answers);
  }
  return [
    served.join(),
    view.result.topPriorities.map((p) => p.cluster).join(),
    view.result.perCluster.map((s) => s.gap.toFixed(9)).join(),
  ].join('#');
}

async function main() {
  console.log(`diagnostic smoke against ${BASE}\n`);

  // --- the whole form, block by block ---------------------------------------
  let view = await next(null);
  const stageCount = view.stageCount;
  const totalItems = view.totalItems;
  const servedSizes = [];
  const servedIds = [];

  for (let block = 1; ; block += 1) {
    if (view.done) break;
    if (block > 40) throw new Error('the form did not terminate');

    servedSizes.push(view.questions.length);
    check(
      `block ${block}: numbered ${view.stageNumber} of ${view.stageCount}, ${view.questions.length} questions`,
      view.stageNumber === block && view.questions.length > 0,
    );
    check(
      `block ${block}: continues the question count from ${view.itemsCommitted + 1}`,
      view.itemsCommitted === servedIds.length,
      `wire says ${view.itemsCommitted}, ${servedIds.length} served so far`,
    );

    // A refresh mid-block. The stage is derived from the response log, so it
    // must come back identical; only the one-use block token is reissued.
    const before = ids(view);
    const again = await next(view.sessionToken);
    check(
      `block ${block}: re-requesting an open block returns the same items`,
      again.stageId === view.stageId && ids(again).join() === before.join(),
    );
    check(
      `block ${block}: the re-serve mints a fresh block token`,
      again.blockToken !== null && again.blockToken !== view.blockToken,
    );
    view = again;

    // Draft the block one way, then revise every answer before committing.
    const answers = uniform(view, 'A');
    before.forEach((id, i) => {
      answers[id] = CHOICES[(i + block) % CHOICES.length];
    });
    servedIds.push(...before);

    const committed = await submit(view, answers);
    check(
      `block ${block}: commit scored ${committed.itemsScored - (view.itemsCommitted ?? 0)} items`,
      committed.itemsScored === servedIds.length,
      `wire says ${committed.itemsScored}`,
    );
    view = committed;
  }

  console.log('');
  check(`served ${servedSizes.length} blocks (wire stageCount ${stageCount})`, servedSizes.length === stageCount);
  console.log(`        block sizes actually served: [${servedSizes.join(', ')}]`);
  check(
    `served ${servedIds.length} items in total (wire totalItems ${totalItems})`,
    servedIds.length === totalItems,
  );
  check('no item was served twice', new Set(servedIds).size === servedIds.length);

  // --- the result -----------------------------------------------------------
  const result = view.result;
  check(
    'the form completed with a result',
    view.done === true && result !== null && result !== undefined,
  );
  check(
    `two priorities reported (${(result?.topPriorities ?? []).map((p) => p.cluster).join(', ')})`,
    (result?.topPriorities ?? []).length === 2,
  );
  const perCluster = result?.perCluster ?? [];
  check(
    `a read for every concept (${perCluster.length}), each with items behind it`,
    perCluster.length > 0 && perCluster.every((s) => s.itemsSeen > 0),
  );
  check(
    'every concept carries a gap, a certainty and a title',
    perCluster.every(
      (s) => typeof s.gap === 'number' && typeof s.certainty === 'number' && s.title !== s.cluster,
    ),
  );
  check(
    'no per-item correctness or answer key crossed the wire',
    !JSON.stringify(view).includes('correct_answer') && !JSON.stringify(view).includes('"correct"'),
  );
  const perBucket = Object.fromEntries(perCluster.map((s) => [s.cluster, s.itemsSeen]));
  console.log(`        items per concept: ${JSON.stringify(perBucket)}`);

  // --- the mastery seed write ----------------------------------------------
  const seed = result?.masterySeed;
  // KC grain, not lesson grain: a lesson has no stored P(L), so the diagnostic
  // seeds the KCs beneath each concept and the lesson readout is rolled up from
  // them. `lessonPriors` is no longer a key the authority will even accept.
  const priorCount = Object.keys(seed?.kcPriors ?? {}).length;
  check(`the result carries ${priorCount} KC priors to seed`, priorCount > 0);
  check(
    'the result carries no lesson-grain priors, which the authority would reject',
    seed !== undefined && seed !== null && !('lessonPriors' in seed),
  );

  await post('/v1/bootstrap', {});
  // The seeding write only ever initializes lessons the learner has not
  // practised, so on a dev authority that already holds a seed it is correctly
  // a no-op and there would be nothing to observe. Clearing first is what makes
  // "the write fired" a checkable claim rather than a hopeful one.
  await del('/v1/account/progress');
  const priorsOf = async () =>
    new Map((await get('/v1/progress/lessons')).map((l) => [l.lessonId, l.pL]));
  const before = await priorsOf();
  const accepted = await post('/v1/hooks/mastery-seed', { seed });
  check('the authority accepted the mastery seed write', typeof accepted.eventId === 'string');

  const after = await priorsOf();
  const moved = [...after].filter(([id, pL]) => before.get(id) !== pL);
  check(
    `the write moved ${moved.length} lesson readouts on the authority`,
    moved.length > 0,
    `${before.size} lessons before, ${after.size} after`,
  );
  // The membership that connects a seeded KC to a lesson readout lives in
  // @mcat/content, which this script does not load, so the checkable claim is the
  // one that matters: a seed moves where a learner starts and can never approach
  // mastery. SEED_PRIOR_CAP is 0.4 against BKT's 0.95 cut.
  check(
    'no seeded lesson readout came near the mastery cut',
    moved.every(([, pL]) => pL <= 0.4),
    `highest seeded readout ${Math.max(...moved.map(([, pL]) => pL))}`,
  );

  // --- an answer changed inside a block ------------------------------------
  // Three whole sittings: one committing the original draft, one committing the
  // revision, and one that drafted the original and then changed every answer
  // before submitting each block. The revised sitting must be the revision's,
  // not the draft's.
  const asDrafted = await fingerprintRun('A');
  const asRevised = await fingerprintRun('D');
  const revisedInPlace = await fingerprintRun('D', 'A');

  check(
    'committing a different set of answers produces a different sitting',
    asDrafted !== asRevised,
  );
  check(
    'a block drafted one way and revised before commit is scored as revised',
    revisedInPlace === asRevised && revisedInPlace !== asDrafted,
  );

  console.log(`\n${failures === 0 ? 'PASS' : `FAIL (${failures})`}`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((error) => {
  console.error(`\nsmoke run failed: ${error.message}`);
  process.exitCode = 1;
});
