import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { handleBetaLeadRequest } from './beta-lead-api';
import { BetaLeadError, BetaLeadStore } from './beta-lead-store';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function temporaryStore(options: { maxSubmissionsPerWindow?: number } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'mcat-beta-leads-'));
  temporaryDirectories.push(directory);
  const filePath = join(directory, 'leads.jsonl');
  return {
    filePath,
    store: new BetaLeadStore({ filePath, ...options }),
  };
}

describe('beta-update lead capture', () => {
  it('requires consent, normalizes email, persists once, and does not store client IDs', async () => {
    const { filePath, store } = await temporaryStore();

    await expect(
      store.subscribe({ email: 'student@example.com', source: 'hero', consent: false }, 'client-a'),
    ).rejects.toEqual(new BetaLeadError('Consent is required for beta-update emails.', 400));

    await expect(
      store.subscribe(
        { email: '  Student+Pilot@Example.COM ', source: 'hero', consent: true },
        'client-a',
      ),
    ).resolves.toEqual({ status: 'subscribed' });
    await expect(
      store.subscribe(
        { email: 'student+pilot@example.com', source: 'footer', consent: true },
        'client-b',
      ),
    ).resolves.toEqual({ status: 'already-subscribed' });

    const lines = (await readFile(filePath, 'utf8')).trim().split('\n');
    expect(lines).toHaveLength(1);
    const record = JSON.parse(lines[0] ?? '{}') as Record<string, unknown>;
    expect(record).toMatchObject({
      email: 'student+pilot@example.com',
      source: 'hero',
      consentVersion: 'beta-updates-v1',
    });
    expect(record).not.toHaveProperty('clientId');
    expect(record).not.toHaveProperty('snapshotResponses');
  });

  it('rate-limits repeated submissions from one client', async () => {
    const { store } = await temporaryStore({ maxSubmissionsPerWindow: 1 });
    await store.subscribe(
      { email: 'first@example.com', source: 'header', consent: true },
      'client-a',
    );

    await expect(
      store.subscribe({ email: 'second@example.com', source: 'header', consent: true }, 'client-a'),
    ).rejects.toMatchObject({ status: 429 });
  });

  it('accepts same-origin API submissions and blocks cross-site requests', async () => {
    const { filePath, store } = await temporaryStore();
    const server = createServer((request, response) =>
      handleBetaLeadRequest(request, response, store),
    );
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as AddressInfo;
    const origin = `http://127.0.0.1:${address.port}`;

    try {
      const accepted = await fetch(origin, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'pilot@example.com',
          source: 'snapshot-intro',
          consent: true,
          website: '',
        }),
      });
      expect(accepted.status).toBe(201);
      await expect(accepted.json()).resolves.toEqual({ status: 'subscribed' });

      const duplicate = await fetch(origin, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'pilot@example.com',
          source: 'snapshot-report',
          consent: true,
        }),
      });
      expect(duplicate.status).toBe(200);
      await expect(duplicate.json()).resolves.toEqual({ status: 'already-subscribed' });

      const crossSite = await fetch(origin, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://example.invalid',
        },
        body: JSON.stringify({
          email: 'blocked@example.com',
          source: 'hero',
          consent: true,
        }),
      });
      expect(crossSite.status).toBe(403);

      const lines = (await readFile(filePath, 'utf8')).trim().split('\n');
      expect(lines).toHaveLength(1);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});
