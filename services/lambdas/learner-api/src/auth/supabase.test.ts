import { SignJWT, exportJWK, generateKeyPair, type JWK } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';

import { SupabaseIdentityProvider, parseSupabaseConfig } from './supabase.js';

const PROJECT_URL = 'https://abcdefghijklmnop.supabase.co';
const ISSUER = `${PROJECT_URL}/auth/v1`;
const SUBJECT = '8f1b9a2c-0d3e-4f5a-9b8c-7d6e5f4a3b2c';

/** Derived rather than written as `CryptoKey`, which needs the DOM lib. */
type PrivateKey = Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];

let signingKey: PrivateKey;
let publicJwk: JWK;
/** A second, unrelated pair, standing in for a key we have not pinned. */
let foreignSigningKey: PrivateKey;

beforeAll(async () => {
  const pair = await generateKeyPair('ES256', { extractable: true });
  signingKey = pair.privateKey;
  publicJwk = { ...(await exportJWK(pair.publicKey)), kid: 'live-key', alg: 'ES256', use: 'sig' };

  const foreign = await generateKeyPair('ES256', { extractable: true });
  foreignSigningKey = foreign.privateKey;
});

const provider = (): SupabaseIdentityProvider =>
  new SupabaseIdentityProvider({ projectUrl: PROJECT_URL, jwks: { keys: [publicJwk] } });

interface TokenOverrides {
  readonly issuer?: string;
  readonly audience?: string;
  readonly subject?: string | undefined;
  readonly expiresIn?: string;
  readonly key?: PrivateKey;
  readonly kid?: string;
}

async function token(overrides: TokenOverrides = {}): Promise<string> {
  let jwt = new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: overrides.kid ?? 'live-key' })
    .setIssuedAt()
    .setIssuer(overrides.issuer ?? ISSUER)
    .setAudience(overrides.audience ?? 'authenticated')
    .setExpirationTime(overrides.expiresIn ?? '1h');

  const subject = 'subject' in overrides ? overrides.subject : SUBJECT;
  if (subject !== undefined) jwt = jwt.setSubject(subject);

  return jwt.sign(overrides.key ?? signingKey);
}

describe('SupabaseIdentityProvider.verify', () => {
  it('returns the subject of a well-formed token', async () => {
    const result = await provider().verify(await token());

    expect(result).toEqual({ status: 'verified', identity: { subject: SUBJECT } });
  });

  it('resolves the signing key by kid across a staged rotation', async () => {
    const standby = await generateKeyPair('ES256', { extractable: true });
    const standbyJwk = {
      ...(await exportJWK(standby.publicKey)),
      kid: 'standby-key',
      alg: 'ES256',
      use: 'sig',
    };
    const spanning = new SupabaseIdentityProvider({
      projectUrl: PROJECT_URL,
      jwks: { keys: [publicJwk, standbyJwk] },
    });

    // Both the outgoing and incoming keys verify, which is what lets the config
    // update and the Supabase promotion happen in either order.
    await expect(spanning.verify(await token())).resolves.toMatchObject({ status: 'verified' });
    await expect(
      spanning.verify(await token({ key: standby.privateKey, kid: 'standby-key' })),
    ).resolves.toMatchObject({ status: 'verified' });
  });

  it('rejects a token signed by a key that is not pinned', async () => {
    const result = await provider().verify(await token({ key: foreignSigningKey }));

    expect(result).toEqual({ status: 'invalid' });
  });

  it('rejects a token whose payload was edited after signing', async () => {
    const [header, , signature] = (await token()).split('.');
    const forgedPayload = Buffer.from(
      JSON.stringify({
        iss: ISSUER,
        aud: 'authenticated',
        sub: 'some-other-learner',
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString('base64url');

    const result = await provider().verify(`${header}.${forgedPayload}.${signature}`);

    expect(result).toEqual({ status: 'invalid' });
  });

  it('rejects an HS256 token signed with the public key as the shared secret', async () => {
    // The algorithm-confusion bypass: the public key is not secret, so if HS256
    // were permitted anyone could mint a valid-looking token for any subject.
    const publicKeyAsSecret = new TextEncoder().encode(JSON.stringify(publicJwk));
    const forged = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256', kid: 'live-key' })
      .setIssuedAt()
      .setIssuer(ISSUER)
      .setAudience('authenticated')
      .setSubject('some-other-learner')
      .setExpirationTime('1h')
      .sign(publicKeyAsSecret);

    const result = await provider().verify(forged);

    expect(result).toEqual({ status: 'invalid' });
  });

  it('rejects an unsigned token', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({ iss: ISSUER, aud: 'authenticated', sub: SUBJECT }),
    ).toString('base64url');

    const result = await provider().verify(`${header}.${payload}.`);

    expect(result).toEqual({ status: 'invalid' });
  });

  it('rejects an expired token', async () => {
    const result = await provider().verify(await token({ expiresIn: '-1m' }));

    expect(result).toEqual({ status: 'invalid' });
  });

  it('rejects a token from another Supabase project', async () => {
    const result = await provider().verify(
      await token({ issuer: 'https://someone-elses.supabase.co/auth/v1' }),
    );

    expect(result).toEqual({ status: 'invalid' });
  });

  it('rejects a token that is not addressed to end users', async () => {
    // What the anon/publishable API key looks like. It is shipped to every
    // browser, so accepting it would make everyone the same learner.
    const result = await provider().verify(await token({ audience: 'anon' }));

    expect(result).toEqual({ status: 'invalid' });
  });

  it('rejects a token with no subject rather than keying a session on nothing', async () => {
    const result = await provider().verify(await token({ subject: undefined }));

    expect(result).toEqual({ status: 'invalid' });
  });

  it('rejects garbage without throwing', async () => {
    for (const garbage of ['', 'not-a-jwt', 'a.b.c', '...']) {
      await expect(provider().verify(garbage)).resolves.toEqual({ status: 'invalid' });
    }
  });
});

describe('parseSupabaseConfig', () => {
  const jwks = { keys: [{ kty: 'EC', crv: 'P-256', x: 'x', y: 'y', kid: 'k', alg: 'ES256' }] };

  it('accepts a well-formed secret and trims a trailing slash', () => {
    const config = parseSupabaseConfig(JSON.stringify({ projectUrl: `${PROJECT_URL}/`, jwks }));

    expect(config.projectUrl).toBe(PROJECT_URL);
    expect(config.jwks.keys).toHaveLength(1);
  });

  it('refuses a symmetric key, which would re-open the confusion attack', () => {
    expect(() =>
      parseSupabaseConfig(
        JSON.stringify({ projectUrl: PROJECT_URL, jwks: { keys: [{ kty: 'oct', k: 'secret' }] } }),
      ),
    ).toThrow(/symmetric/i);
  });

  it.each([
    ['malformed json', '{'],
    ['a non-object', '"a string"'],
    ['a missing project url', JSON.stringify({ jwks })],
    ['a plaintext project url', JSON.stringify({ projectUrl: 'http://x.supabase.co', jwks })],
    ['missing keys', JSON.stringify({ projectUrl: PROJECT_URL, jwks: {} })],
    ['a non-array key set', JSON.stringify({ projectUrl: PROJECT_URL, jwks: { keys: {} } })],
  ])('fails at load on %s', (_case, secret) => {
    expect(() => parseSupabaseConfig(secret)).toThrow(/invalid shape/i);
  });

  /**
   * The literal the identity stack seeds this secret with. Kept verbatim so a
   * change to `infra/cdk/lib/identity-stack.ts` that the parser cannot read fails
   * here rather than at cold start in a deployed Lambda. The matching assertion
   * is in `infra/cdk/test/identity-stack.test.ts`.
   */
  it('reads the exact document the identity stack seeds', () => {
    const seeded = JSON.stringify({
      projectUrl: 'https://abcdefghijklmnopqrst.supabase.co',
      jwks: { keys: [] },
    });

    const config = parseSupabaseConfig(seeded);

    expect(config.projectUrl).toBe('https://abcdefghijklmnopqrst.supabase.co');
    expect(config.jwks.keys).toEqual([]);
  });

  it('loads an unsynced empty key set rather than taking the whole function down', () => {
    const config = parseSupabaseConfig(
      JSON.stringify({ projectUrl: PROJECT_URL, jwks: { keys: [] } }),
    );

    expect(config.jwks.keys).toEqual([]);
  });

  it('verifies nothing while the key set is empty', async () => {
    const unsynced = new SupabaseIdentityProvider({ projectUrl: PROJECT_URL, jwks: { keys: [] } });

    // The token is genuine; there is simply no pinned key to check it against, so
    // an unconfigured deployment refuses everyone instead of trusting anyone.
    await expect(unsynced.verify(await token())).resolves.toEqual({ status: 'invalid' });
  });
});
