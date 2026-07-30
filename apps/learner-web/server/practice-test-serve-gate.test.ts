import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { describe, expect, it } from 'vitest';
import { PracticeTestBank } from './practice-test-bank';
import { practiceTestSessionStore } from './practice-test-api';
import {
  handlePracticeTestNextRequest,
  type PracticeTestAuthorityRecorder,
} from './practice-test-api';
import type { PulledCorpus, PulledProtected, PulledQuestion } from './db-pull';

/**
 * The §6 cadence is enforced at the SERVING boundary, not only in Today's Path:
 * `POST /api/practice-test/next` consults the injected recorder's `gate()` before
 * it will CREATE a new sitting, so a test cannot be started off-cadence even by
 * calling the API directly. A resumed sitting (a session token in hand) is never
 * re-gated. This drives the real HTTP handler with mock req/res + a stub gate.
 */

const CLUSTER: Record<'cp' | 'cars' | 'bb' | 'ps', string[]> = {
  cp: ['CP1', 'CP2'],
  cars: ['CA1', 'CA2'],
  bb: ['BB1', 'BB2'],
  ps: ['PS2', 'PS3'],
};
// Rotate science skills so all reasoning ops (and CARS sub-skills) are present,
// which the real tier blueprints (short + standard) floor on.
const SCI_SKILL = ['SIRS1', 'SIRS2', 'SIRS2', 'SIRS3', 'SIRS4'];
const CARS_SKILL = ['CARS_FOC', 'CARS_RWT', 'CARS_RBT'];

/** A corpus ample enough to satisfy the short AND standard tier blueprints. */
function makeCorpus(perSection = 20): PulledCorpus {
  const questions: PulledQuestion[] = [];
  const keys: PulledProtected[] = [];
  for (const section of ['cp', 'cars', 'bb', 'ps'] as const) {
    for (let i = 0; i < perSection; i += 1) {
      const id = `q-${section}-${i}`;
      const cluster = CLUSTER[section][i % CLUSTER[section].length]!;
      const isCars = section === 'cars';
      questions.push({
        question_id: id,
        section,
        cluster,
        kc_id: isCars ? null : `kc-${cluster}`,
        lesson_id: null,
        family_id: `fam-${id}`,
        subject: null,
        primary_skill: isCars ? CARS_SKILL[i % CARS_SKILL.length]! : SCI_SKILL[i % SCI_SKILL.length]!,
        dok_level: (i % 3) + 1,
        stem: `Stem ${id}`,
        passage: `Passage for ${id}`, // every item passage_mcq
        choices: { A: 'alpha', B: 'beta', C: 'gamma', D: 'delta' },
        status: 'production_candidate',
      });
      keys.push({
        question_id: id,
        correct_answer: (['A', 'B', 'C', 'D'] as const)[i % 4]!,
        explanations: { A: 'a', B: 'b', C: 'c', D: 'd' },
      });
    }
  }
  return { questions, protectedById: new Map(keys.map((k) => [k.question_id, k])) };
}

const bank = new PracticeTestBank(makeCorpus());

function makeReq(body: Record<string, unknown>): IncomingMessage {
  const stream = Readable.from([JSON.stringify(body)]);
  Object.assign(stream, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    socket: { remoteAddress: '127.0.0.1' },
  });
  return stream as unknown as IncomingMessage;
}

interface Captured {
  statusCode: number;
  body: unknown;
}

function makeRes(): { res: ServerResponse; done: Promise<Captured> } {
  let resolve!: (c: Captured) => void;
  const done = new Promise<Captured>((r) => (resolve = r));
  const res = {
    statusCode: 200,
    setHeader() {},
    end(payload?: string) {
      resolve({
        statusCode: (this as { statusCode: number }).statusCode,
        body: payload ? JSON.parse(payload) : null,
      });
    },
  } as unknown as ServerResponse;
  return { res, done };
}

const gateRecorder = (
  gate: PracticeTestAuthorityRecorder['gate'],
): PracticeTestAuthorityRecorder => ({
  gate,
  recordCompleted: () => {},
  recordReviewed: () => {},
});

describe('practice-test serve boundary — cadence gate on /next', () => {
  it('refuses to START a new sitting when the gate says none is due (409 + reason)', async () => {
    const { res, done } = makeRes();
    handlePracticeTestNextRequest(
      makeReq({}),
      res,
      bank,
      gateRecorder(() => ({ due: false, reason: 'not_due_recent', tier: 'standard' })),
    );
    const out = await done;
    expect(out.statusCode).toBe(409);
    expect((out.body as { reason: string }).reason).toBe('not_due_recent');
  });

  it('starts a new sitting when the gate says one is due, sized to the gate tier', async () => {
    const { res, done } = makeRes();
    handlePracticeTestNextRequest(
      makeReq({}),
      res,
      bank,
      gateRecorder(() => ({ due: true, reason: 'baseline', tier: 'short' })),
    );
    const out = await done;
    expect(out.statusCode).toBe(200);
    const body = out.body as { questions: unknown[]; totalItems: number; sessionToken: string };
    expect(body.questions.length).toBeGreaterThan(0);
    // The short tier is ~30 items — much smaller than the long full-length.
    expect(body.totalItems).toBeLessThanOrEqual(35);
    expect(typeof body.sessionToken).toBe('string');
  });

  it('does NOT re-gate a resumed sitting (a token in hand serves regardless)', async () => {
    // Pre-create a session for this client, then resume it with a gate that would
    // otherwise refuse — the resume path must ignore the gate.
    const { sessionToken } = practiceTestSessionStore.create('127.0.0.1');
    const { res, done } = makeRes();
    handlePracticeTestNextRequest(
      makeReq({ sessionToken }),
      res,
      bank,
      gateRecorder(() => ({ due: false, reason: 'capped_today', tier: 'standard' })),
    );
    const out = await done;
    expect(out.statusCode).toBe(200);
    expect((out.body as { questions: unknown[] }).questions.length).toBeGreaterThan(0);
  });
});
