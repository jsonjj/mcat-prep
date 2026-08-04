import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { processCommandRunner, runChecked, type CommandRunner, type CommandSpec } from './command';
import { readStackOutputs } from './outputs';
import {
  EXPECTED_ACCOUNT,
  EXPECTED_PROFILE,
  EXPECTED_REGION,
  assertMutationBoundary,
  runLivePreflight,
} from './preflight';

const IMMUTABLE_CACHE = 'public,max-age=31536000,immutable';
const SHELL_CACHE = 'no-cache,must-revalidate';
const FINGERPRINTED_ASSET = /^assets\/(?:[^/]+\/)*[^/]+-[a-z0-9_-]{8,}\.[a-z0-9]+$/i;
const EMBEDDED_PROTECTED_VALUE =
  /(?:proposed_key|correct_choice_id|correctChoiceId)\s*["']?\s*:\s*["'](?:[A-D]|choice-[a-z0-9_-]+)["']|(?:option_rationales|rationales|protected_rationale|rationale_correct|rationale_incorrect)\s*["']?\s*:\s*(?:\{|["'])/i;
const TEXT_EXTENSIONS = new Set([
  '.css',
  '.html',
  '.js',
  '.json',
  '.md',
  '.mjs',
  '.svg',
  '.txt',
  '.webmanifest',
]);
const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.css': 'text/css; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

export interface WebArtifactFile {
  readonly path: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly contentType: string;
  readonly cacheControl: typeof IMMUTABLE_CACHE | typeof SHELL_CACHE;
}

export interface WebArtifactManifest {
  readonly schemaVersion: 1;
  readonly app: 'learner' | 'admin';
  readonly gitCommit: string;
  readonly sha256: string;
  readonly files: readonly WebArtifactFile[];
}

export interface WebPublishTarget {
  readonly bucket: string;
  readonly distributionId: string;
}

export interface WebPublishingConfiguration {
  readonly authorityBaseUrl: string;
  readonly learnerTarget: WebPublishTarget;
  readonly adminTarget: WebPublishTarget;
}

export function webAppsForDeployment(): readonly ['learner'] {
  return ['learner'];
}

export function formatPublishedArtifacts(manifests: readonly WebArtifactManifest[]): string {
  const applications = manifests.map((manifest) => manifest.app).join('/');
  const hashes = manifests.map((manifest) => manifest.sha256).join(', ');
  const noun = manifests.length === 1 ? 'artifact' : 'artifacts';
  return `Published immutable ${applications} ${noun}: ${hashes}.\n`;
}

function digest(value: Uint8Array | string): string {
  return createHash('sha256').update(value).digest('hex');
}

async function walk(root: string, current = root): Promise<string[]> {
  const entries = await readdir(current, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const path = join(current, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Web artifact may not contain a symlink: ${path}`);
    if (entry.isDirectory()) files.push(...(await walk(root, path)));
    else if (entry.isFile()) files.push(relative(root, path).split(sep).join('/'));
  }
  return files;
}

function validateArtifactPath(path: string): void {
  const lower = path.toLowerCase();
  if (lower.endsWith('.map')) throw new Error(`Web artifact source map is forbidden: ${path}`);
  if (lower.endsWith('.pdf')) throw new Error(`Web artifact PDF is forbidden: ${path}`);
  if (lower.includes('research-derivatives')) {
    throw new Error(`Web artifact research derivative is forbidden: ${path}`);
  }
}

function scanProtectedText(path: string, text: string): void {
  if (EMBEDDED_PROTECTED_VALUE.test(text) || /mcat_protected_canary/i.test(text)) {
    throw new Error(`Web artifact contains a protected field value: ${path}`);
  }
  if (
    /AKIA[0-9A-Z]{16}/.test(text) ||
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(text) ||
    /aws_secret_access_key/i.test(text) ||
    /\bsk-[a-z0-9_-]{20,}\b/i.test(text)
  ) {
    throw new Error(`Web artifact contains a credential-shaped value: ${path}`);
  }
}

function contentType(path: string): string {
  const type = CONTENT_TYPES[extname(path).toLowerCase()];
  if (type === undefined) throw new Error(`Web artifact has an unapproved media type: ${path}`);
  return type;
}

export async function buildArtifactManifest(
  app: 'learner' | 'admin',
  artifactRoot: string,
  gitCommit: string,
): Promise<WebArtifactManifest> {
  if (!/^[a-f0-9]{40}$/.test(gitCommit)) throw new Error('A full lowercase Git commit is required');
  const stat = await lstat(artifactRoot);
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw new Error('Web artifact root must be a directory');
  const paths = await walk(artifactRoot);
  if (!paths.includes('index.html')) throw new Error('Web artifact must contain index.html');
  const files: WebArtifactFile[] = [];
  for (const path of paths) {
    validateArtifactPath(path);
    const bytes = await readFile(join(artifactRoot, path));
    if (TEXT_EXTENSIONS.has(extname(path).toLowerCase())) {
      scanProtectedText(path, bytes.toString('utf8'));
    }
    files.push({
      path,
      sha256: digest(bytes),
      bytes: bytes.byteLength,
      contentType: contentType(path),
      cacheControl: FINGERPRINTED_ASSET.test(path) ? IMMUTABLE_CACHE : SHELL_CACHE,
    });
  }
  const sha256 = digest(
    files.map((file) => `${file.path}\0${file.sha256}\0${file.cacheControl}`).join('\n'),
  );
  return { schemaVersion: 1, app, gitCommit, sha256, files };
}

export async function verifyArtifactFile(
  artifactRoot: string,
  expected: Pick<WebArtifactFile, 'path' | 'sha256' | 'bytes'>,
): Promise<void> {
  const bytes = await readFile(join(artifactRoot, expected.path));
  if (bytes.byteLength !== expected.bytes || digest(bytes) !== expected.sha256) {
    throw new Error(`Web artifact changed after scanning: ${expected.path}`);
  }
}

export function verifyUploadedObject(json: string, expected: WebArtifactFile): void {
  let value: unknown;
  try {
    value = JSON.parse(json) as unknown;
  } catch {
    throw new Error(`S3 verification returned invalid JSON for ${expected.path}`);
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`S3 verification failed for ${expected.path}`);
  }
  const object = value as Record<string, unknown>;
  const metadata =
    typeof object.Metadata === 'object' &&
    object.Metadata !== null &&
    !Array.isArray(object.Metadata)
      ? (object.Metadata as Record<string, unknown>)
      : {};
  const expectedChecksum = Buffer.from(expected.sha256, 'hex').toString('base64');
  if (
    object.ContentLength !== expected.bytes ||
    object.CacheControl !== expected.cacheControl ||
    object.ContentType !== expected.contentType ||
    object.ChecksumSHA256 !== expectedChecksum ||
    metadata.sha256 !== expected.sha256
  ) {
    throw new Error(`S3 verification failed for ${expected.path}`);
  }
}

function validateTarget(app: 'learner' | 'admin', target: WebPublishTarget): void {
  const bucket = new RegExp(
    `^mcat-dev-${app}-web-[a-z0-9-]*${EXPECTED_ACCOUNT}-${EXPECTED_REGION}$`,
  );
  if (!bucket.test(target.bucket)) throw new Error(`Unexpected ${app} web artifact bucket`);
  if (!/^E[A-Z0-9]{10,32}$/.test(target.distributionId)) {
    throw new Error(`Unexpected ${app} CloudFront distribution ID`);
  }
}

function authorityBaseUrl(value: string): string {
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.username !== '' ||
    url.password !== '' ||
    !/^d[a-z0-9]+\.cloudfront\.net$/.test(url.hostname) ||
    url.origin !== value
  ) {
    throw new Error('LearnerWebUrl output is not the expected exact CloudFront origin');
  }
  return url.origin;
}

export async function resolveWebPublishingConfiguration(
  runner: CommandRunner,
): Promise<WebPublishingConfiguration> {
  const web = await readStackOutputs(runner, 'mcat-dev-web', [
    'LearnerArtifactBucketName',
    'AdminArtifactBucketName',
  ]);
  const api = await readStackOutputs(runner, 'mcat-dev-api', [
    'LearnerDistributionId',
    'AdminDistributionId',
    'LearnerWebUrl',
  ]);
  const configuration = {
    authorityBaseUrl: authorityBaseUrl(api.LearnerWebUrl ?? ''),
    learnerTarget: {
      bucket: web.LearnerArtifactBucketName ?? '',
      distributionId: api.LearnerDistributionId ?? '',
    },
    adminTarget: {
      bucket: web.AdminArtifactBucketName ?? '',
      distributionId: api.AdminDistributionId ?? '',
    },
  };
  validateTarget('learner', configuration.learnerTarget);
  validateTarget('admin', configuration.adminTarget);
  return configuration;
}

export function planWebPublish(
  manifest: WebArtifactManifest,
  artifactRoot: string,
  target: WebPublishTarget,
): readonly CommandSpec[] {
  validateTarget(manifest.app, target);
  const uploads = orderedArtifactFiles(manifest).map((file) => ({
    command: 'aws',
    args: [
      '--profile',
      EXPECTED_PROFILE,
      '--region',
      EXPECTED_REGION,
      's3',
      'cp',
      resolve(artifactRoot, file.path),
      `s3://${target.bucket}/${file.path}`,
      '--cache-control',
      file.cacheControl,
      '--content-type',
      file.contentType,
      '--metadata-directive',
      'REPLACE',
      '--metadata',
      `sha256=${file.sha256}`,
      '--checksum-algorithm',
      'SHA256',
      '--only-show-errors',
    ],
  }));
  const shellPaths =
    manifest.app === 'learner'
      ? ['/', '/index.html', '/manifest.webmanifest', '/sw.js']
      : ['/', '/index.html'];
  return [
    {
      command: 'aws',
      args: [
        '--profile',
        EXPECTED_PROFILE,
        '--region',
        EXPECTED_REGION,
        's3api',
        'head-bucket',
        '--bucket',
        target.bucket,
        '--expected-bucket-owner',
        EXPECTED_ACCOUNT,
      ],
    },
    ...uploads,
    {
      command: 'aws',
      args: [
        '--profile',
        EXPECTED_PROFILE,
        '--region',
        EXPECTED_REGION,
        'cloudfront',
        'create-invalidation',
        '--distribution-id',
        target.distributionId,
        '--paths',
        ...shellPaths,
      ],
    },
  ];
}

function orderedArtifactFiles(manifest: WebArtifactManifest): readonly WebArtifactFile[] {
  return [...manifest.files].sort((left, right) => {
    const cacheOrder =
      Number(right.cacheControl === IMMUTABLE_CACHE) -
      Number(left.cacheControl === IMMUTABLE_CACHE);
    return cacheOrder === 0 ? left.path.localeCompare(right.path) : cacheOrder;
  });
}

function headObjectCommand(target: WebPublishTarget, file: WebArtifactFile): CommandSpec {
  return {
    command: 'aws',
    args: [
      '--profile',
      EXPECTED_PROFILE,
      '--region',
      EXPECTED_REGION,
      's3api',
      'head-object',
      '--bucket',
      target.bucket,
      '--key',
      file.path,
      '--checksum-mode',
      'ENABLED',
      '--expected-bucket-owner',
      EXPECTED_ACCOUNT,
      '--output',
      'json',
    ],
  };
}

function parseInvalidation(json: string): { readonly id: string; readonly status: string } {
  const value = JSON.parse(json) as { Invalidation?: { Id?: unknown; Status?: unknown } };
  const id = value.Invalidation?.Id;
  const status = value.Invalidation?.Status;
  if (typeof id !== 'string' || !/^I[A-Z0-9]{8,}$/.test(id) || typeof status !== 'string') {
    throw new Error('CloudFront invalidation response is invalid');
  }
  return { id, status };
}

async function writeManifestAtomically(path: string, value: unknown): Promise<void> {
  const output = resolve(path);
  await mkdir(dirname(output), { recursive: true });
  const temporary = `${output}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  await rename(temporary, output);
}

export async function publishWeb(options: {
  readonly repositoryRoot: string;
  readonly reviewManifestPath: string;
  readonly outputManifestPath: string;
  readonly authorityBaseUrl: string;
  readonly learnerTarget: WebPublishTarget;
  readonly adminTarget: WebPublishTarget;
  readonly runner?: CommandRunner;
}): Promise<readonly WebArtifactManifest[]> {
  const runner = options.runner ?? processCommandRunner;
  const preflight = await runLivePreflight({
    repositoryRoot: options.repositoryRoot,
    reviewManifestPath: options.reviewManifestPath,
    runner,
  });
  await runChecked(runner, {
    command: 'pnpm',
    args: ['run', 'scan:protected'],
    cwd: options.repositoryRoot,
  });
  const deploymentApps = webAppsForDeployment();
  for (const app of deploymentApps) {
    await runChecked(runner, {
      command: 'pnpm',
      args: ['--filter', `@mcat/${app}-web`, 'build'],
      cwd: options.repositoryRoot,
      ...(app === 'learner'
        ? {
            env: {
              VITE_AUTHORITY_BASE_URL: authorityBaseUrl(options.authorityBaseUrl),
              // Present the Practice-test dashboard in the published SPA. This is the
              // client presentation flag only; the learner-API plan gate
              // (PRACTICE_TEST_ENABLED, default off) stays authoritative so no
              // practice_test slot is scheduled without a deployed runner backend.
              VITE_PRACTICE_TEST_ENABLED: 'true',
            },
          }
        : {}),
    });
  }
  const manifests = await Promise.all(
    deploymentApps.map((app) =>
      buildArtifactManifest(
        app,
        join(options.repositoryRoot, 'apps', `${app}-web`, 'dist'),
        preflight.review.gitCommit,
      ),
    ),
  );
  const publications: Array<{
    readonly app: 'learner' | 'admin';
    readonly bucket: string;
    readonly distributionId: string;
    readonly invalidationId: string;
    readonly invalidationStatus: string;
  }> = [];
  for (let index = 0; index < manifests.length; index += 1) {
    const manifest = manifests[index];
    const target = manifest?.app === 'learner' ? options.learnerTarget : options.adminTarget;
    if (manifest === undefined || target === undefined)
      throw new Error('Web publication plan is incomplete');
    const root = join(options.repositoryRoot, 'apps', `${manifest.app}-web`, 'dist');
    const files = orderedArtifactFiles(manifest);
    const commands = planWebPublish(manifest, root, target);
    const bucketOwnershipCommand = commands[0];
    if (bucketOwnershipCommand === undefined)
      throw new Error('Web bucket ownership check is missing');
    await assertMutationBoundary(runner, options.repositoryRoot, preflight.review.gitCommit);
    await runChecked(runner, bucketOwnershipCommand);
    for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
      const file = files[fileIndex];
      const command = commands[fileIndex + 1];
      if (file === undefined || command === undefined)
        throw new Error('Web upload plan is incomplete');
      await assertMutationBoundary(runner, options.repositoryRoot, preflight.review.gitCommit);
      await verifyArtifactFile(root, file);
      await runChecked(runner, command);
      verifyUploadedObject(await runChecked(runner, headObjectCommand(target, file)), file);
    }
    const invalidationCommand = commands.at(-1);
    if (invalidationCommand === undefined)
      throw new Error('CloudFront invalidation plan is missing');
    const invalidation = parseInvalidation(await runChecked(runner, invalidationCommand));
    publications.push({
      app: manifest.app,
      bucket: target.bucket,
      distributionId: target.distributionId,
      invalidationId: invalidation.id,
      invalidationStatus: invalidation.status,
    });
  }
  await writeManifestAtomically(options.outputManifestPath, {
    schemaVersion: 1,
    account: EXPECTED_ACCOUNT,
    region: EXPECTED_REGION,
    gitCommit: preflight.review.gitCommit,
    artifacts: manifests,
    publications,
  });
  return manifests;
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) throw new Error(`${name} is required`);
  return value;
}

const invokedPath = process.argv[1] === undefined ? undefined : resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) {
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  const configuration = await resolveWebPublishingConfiguration(processCommandRunner);
  const manifests = await publishWeb({
    repositoryRoot,
    reviewManifestPath: requiredEnvironment('MCAT_DEPLOY_REVIEW_MANIFEST'),
    outputManifestPath: requiredEnvironment('MCAT_WEB_PUBLISH_MANIFEST'),
    authorityBaseUrl: configuration.authorityBaseUrl,
    learnerTarget: configuration.learnerTarget,
    adminTarget: configuration.adminTarget,
  });
  process.stdout.write(formatPublishedArtifacts(manifests));
}
