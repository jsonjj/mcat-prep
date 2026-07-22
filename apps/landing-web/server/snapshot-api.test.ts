import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ChoiceId } from '../src/diagnostic/types';
import { createLandingServer } from './production-server';

const keys: ChoiceId[] = ['B', 'C', 'A', 'C', 'D', 'A', 'C', 'A', 'B', 'D', 'B', 'D'];
const server = createLandingServer();
let origin = '';

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  origin = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

describe('snapshot production API', () => {
  it('issues and consumes a one-use scoring attempt', async () => {
    const attemptResponse = await fetch(`${origin}/api/snapshot/attempt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const attempt = (await attemptResponse.json()) as { attemptToken: string };
    expect(attemptResponse.status).toBe(201);
    expect(attempt.attemptToken.length).toBeGreaterThanOrEqual(32);

    const submission = {
      attemptToken: attempt.attemptToken,
      responses: keys.map((choiceId, index) => ({
        questionId: `snapshot-q${String(index + 1).padStart(2, '0')}`,
        choiceId,
      })),
    };

    const invalidScore = await fetch(`${origin}/api/snapshot/score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attemptToken: attempt.attemptToken, responses: [] }),
    });
    expect(invalidScore.status).toBe(400);

    const firstScore = await fetch(`${origin}/api/snapshot/score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(submission),
    });
    const reportText = await firstScore.text();
    expect(firstScore.status).toBe(200);
    expect(reportText).toContain('"version":"snapshot-pilot-v2"');
    expect(reportText).not.toContain('sourceCandidateId');
    expect(reportText).not.toContain('correctChoices');

    const repeatedScore = await fetch(`${origin}/api/snapshot/score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...submission, responses: [...submission.responses].reverse() }),
    });
    expect(repeatedScore.status).toBe(200);
    expect(await repeatedScore.text()).toBe(reportText);

    const changedSubmission = {
      ...submission,
      responses: submission.responses.map((response, index) =>
        index === 0 ? { ...response, choiceId: 'A' } : response,
      ),
    };
    const changedScore = await fetch(`${origin}/api/snapshot/score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(changedSubmission),
    });
    expect(changedScore.status).toBe(409);

    const crossSiteAttempt = await fetch(`${origin}/api/snapshot/attempt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://example.invalid',
      },
      body: '{}',
    });
    expect(crossSiteAttempt.status).toBe(403);
  });
});
