import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { processCommandRunner, runChecked, type CommandRunner, type CommandSpec } from './command';
import { readStackOutputs } from './outputs';
import {
  APPROVED_STACKS,
  EXPECTED_PROFILE,
  EXPECTED_REGION,
  assertMutationBoundary,
  assertReviewedArtifactUnchanged,
  runLivePreflight,
} from './preflight';

export const EXACT_STACK_ORDER = APPROVED_STACKS;

export const DEPLOYMENT_WAVES = {
  foundation: EXACT_STACK_ORDER.slice(0, 3),
  authority: EXACT_STACK_ORDER.slice(3, 8),
  edge: EXACT_STACK_ORDER.slice(8),
} as const;

export interface WaveAttestation {
  readonly schemaVersion: 1;
  readonly kind: 'migration' | 'smoke';
  readonly account: string;
  readonly region: string;
  readonly gitCommit: string;
  readonly evidenceSha256: string;
  readonly verifiedAt: string;
  readonly checks?: readonly string[];
}

export function validateWavePrerequisite(
  wave: keyof typeof DEPLOYMENT_WAVES,
  expectedCommit: string,
  attestation?: WaveAttestation,
): void {
  if (wave === 'foundation') return;
  const expectedKind = wave === 'authority' ? 'migration' : 'smoke';
  if (attestation === undefined || attestation.kind !== expectedKind) {
    throw new Error(`${expectedKind} attestation is required before the ${wave} wave`);
  }
  if (
    attestation.schemaVersion !== 1 ||
    attestation.account !== '056956104102' ||
    attestation.region !== EXPECTED_REGION ||
    attestation.gitCommit !== expectedCommit ||
    !/^[a-f0-9]{64}$/.test(attestation.evidenceSha256) ||
    Number.isNaN(Date.parse(attestation.verifiedAt))
  ) {
    throw new Error(`${expectedKind} attestation does not match the reviewed deployment`);
  }
  if (
    expectedKind === 'smoke' &&
    ![
      'health',
      'cors',
      'guest-bootstrap-cookies',
      'goal-idempotency',
      'authorized-reads',
      'protected-negative-boundaries',
      'direct-origin-blocked',
    ].every((check) => attestation.checks?.includes(check) === true)
  ) {
    throw new Error('smoke attestation is missing a required boundary check');
  }
}

async function readWaveAttestation(path: string): Promise<WaveAttestation> {
  return JSON.parse(await readFile(path, 'utf8')) as WaveAttestation;
}

export function planDeploymentCommands(
  stacks: readonly string[],
  reviewedCloudAssembly = '/reviewed/cdk.out',
): readonly CommandSpec[] {
  if (
    stacks.length !== EXACT_STACK_ORDER.length ||
    stacks.some((stack, index) => stack !== EXACT_STACK_ORDER[index])
  ) {
    throw new Error('Development deployment requires the exact stack order and complete allowlist');
  }
  return stacks.map((stack) => ({
    command: 'pnpm',
    args: [
      '--filter',
      '@mcat/infra-cdk',
      'exec',
      'cdk',
      'deploy',
      stack,
      '--exclusively',
      '--app',
      resolve(reviewedCloudAssembly),
      '--profile',
      EXPECTED_PROFILE,
      '--require-approval',
      'never',
    ],
  }));
}

export async function withIsolatedCloudAssembly<T>(
  reviewedCloudAssembly: string,
  operation: (isolatedCloudAssembly: string) => Promise<T>,
): Promise<T> {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'mcat-cdk-deploy-'));
  const isolatedCloudAssembly = join(temporaryDirectory, 'cdk.out');
  try {
    await cp(resolve(reviewedCloudAssembly), isolatedCloudAssembly, {
      recursive: true,
      force: false,
      errorOnExist: true,
      preserveTimestamps: true,
    });
    return await operation(isolatedCloudAssembly);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

export async function deployReviewedWave(options: {
  readonly repositoryRoot: string;
  readonly reviewManifestPath: string;
  readonly wave: keyof typeof DEPLOYMENT_WAVES;
  readonly attestation?: WaveAttestation;
  readonly runner?: CommandRunner;
}): Promise<void> {
  const runner = options.runner ?? processCommandRunner;
  const preflight = await runLivePreflight({
    repositoryRoot: options.repositoryRoot,
    reviewManifestPath: options.reviewManifestPath,
    runner,
  });
  if (
    preflight.review.stacks.length !== EXACT_STACK_ORDER.length ||
    preflight.review.stacks.some((stack, index) => stack !== EXACT_STACK_ORDER[index])
  ) {
    throw new Error('Reviewed deployment does not cover the exact development stack order');
  }
  const reviewedSynthPath = resolve(
    dirname(resolve(options.reviewManifestPath)),
    preflight.review.synth.path,
  );
  const cloudAssembly = preflight.review.synth.path.endsWith('manifest.json')
    ? dirname(reviewedSynthPath)
    : reviewedSynthPath;
  const wave = DEPLOYMENT_WAVES[options.wave];
  if (wave === undefined) throw new Error('Deployment wave must be foundation, authority, or edge');
  validateWavePrerequisite(options.wave, preflight.review.gitCommit, options.attestation);
  const prerequisiteStacks =
    options.wave === 'authority'
      ? ['mcat-dev-foundation', 'mcat-dev-data', 'mcat-dev-web']
      : options.wave === 'edge'
        ? [
            'mcat-dev-api',
            'mcat-dev-identity',
            'mcat-dev-async',
            'mcat-dev-publication',
            'mcat-dev-operations',
          ]
        : [];
  for (const stackName of prerequisiteStacks) {
    await readStackOutputs(runner, stackName, []);
  }
  for (const stack of wave) {
    await assertMutationBoundary(runner, options.repositoryRoot, preflight.review.gitCommit);
    await assertReviewedArtifactUnchanged(cloudAssembly, preflight.review.synth.sha256);
    await withIsolatedCloudAssembly(cloudAssembly, async (isolatedCloudAssembly) => {
      const command = planDeploymentCommands(EXACT_STACK_ORDER, isolatedCloudAssembly).find(
        (candidate) => candidate.args.includes(stack),
      );
      if (command === undefined) throw new Error(`No reviewed deployment command for ${stack}`);
      await runChecked(runner, {
        ...command,
        cwd: options.repositoryRoot,
        env: { AWS_PROFILE: EXPECTED_PROFILE, AWS_REGION: EXPECTED_REGION, MCAT_STAGE: 'dev' },
      });
    });
  }
}

const invokedPath = process.argv[1] === undefined ? undefined : resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) {
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  const reviewManifestPath = process.env.MCAT_DEPLOY_REVIEW_MANIFEST;
  const wave = process.env.MCAT_DEPLOY_WAVE;
  if (
    reviewManifestPath === undefined ||
    reviewManifestPath.length === 0 ||
    (wave !== 'foundation' && wave !== 'authority' && wave !== 'edge')
  ) {
    throw new Error(
      'MCAT_DEPLOY_REVIEW_MANIFEST and MCAT_DEPLOY_WAVE=foundation|authority|edge are required',
    );
  }
  const attestationPath =
    wave === 'authority'
      ? process.env.MCAT_MIGRATION_ATTESTATION_PATH
      : wave === 'edge'
        ? process.env.MCAT_SMOKE_ATTESTATION_PATH
        : undefined;
  if (wave !== 'foundation' && attestationPath === undefined) {
    throw new Error(
      wave === 'authority'
        ? 'MCAT_MIGRATION_ATTESTATION_PATH is required'
        : 'MCAT_SMOKE_ATTESTATION_PATH is required',
    );
  }
  const attestation =
    attestationPath === undefined ? undefined : await readWaveAttestation(attestationPath);
  await deployReviewedWave({
    repositoryRoot,
    reviewManifestPath,
    wave,
    ...(attestation === undefined ? {} : { attestation }),
  });
  process.stdout.write(`Reviewed McatDev ${wave} wave deployed in the approved order.\n`);
}
