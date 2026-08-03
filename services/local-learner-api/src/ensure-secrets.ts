import { ensureGeneratedSecrets } from './env-file';

/**
 * The step `pnpm dev` runs before the API and Vite start in parallel, so both
 * read the same `ORIGIN_VERIFICATION_SECRET` on the very first run. Doing it
 * here rather than inside either process is what keeps that run from needing a
 * restart.
 */
const generated = ensureGeneratedSecrets();

if (generated.length > 0) {
  process.stdout.write(
    `Wrote ${generated.map((secret) => secret.name).join(' and ')} to .env.local.\n`,
  );
}
