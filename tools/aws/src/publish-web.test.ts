import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildArtifactManifest,
  formatPublishedArtifacts,
  planWebPublish,
  resolveWebPublishingConfiguration,
  webAppsForDeployment,
  verifyArtifactFile,
  verifyUploadedObject,
} from './publish-web';
import type { CommandRunner } from './command';

describe('immutable web publication', () => {
  it('reports only the applications that were actually published', () => {
    expect(
      formatPublishedArtifacts([
        {
          schemaVersion: 1,
          app: 'learner',
          gitCommit: 'a'.repeat(40),
          sha256: 'b'.repeat(64),
          files: [],
        },
      ]),
    ).toBe(`Published immutable learner artifact: ${'b'.repeat(64)}.\n`);
  });

  it('publishes only the learner application while admin artifacts remain protected', () => {
    expect(webAppsForDeployment()).toEqual(['learner']);
  });

  it('builds the learner against its same-origin CloudFront API and reads outputs from their owning stacks', async () => {
    const inspectedStacks: string[] = [];
    const runner: CommandRunner = {
      run: async (spec) => {
        const stackName = spec.args[spec.args.indexOf('--stack-name') + 1] ?? '';
        inspectedStacks.push(stackName);
        const outputs =
          stackName === 'mcat-dev-web'
            ? [
                {
                  OutputKey: 'LearnerArtifactBucketName',
                  OutputValue: 'mcat-dev-learner-web-056956104102-us-east-1',
                },
                {
                  OutputKey: 'AdminArtifactBucketName',
                  OutputValue: 'mcat-dev-admin-web-056956104102-us-east-1',
                },
              ]
            : [
                { OutputKey: 'LearnerDistributionId', OutputValue: 'E1234567890ABC' },
                { OutputKey: 'AdminDistributionId', OutputValue: 'EABCDEFGHIJ123' },
                {
                  OutputKey: 'LearnerWebUrl',
                  OutputValue: 'https://d1234567890abc.cloudfront.net',
                },
              ];
        return {
          exitCode: 0,
          stderr: '',
          stdout: JSON.stringify({
            Stacks: [{ StackName: stackName, StackStatus: 'CREATE_COMPLETE', Outputs: outputs }],
          }),
        };
      },
    };

    await expect(resolveWebPublishingConfiguration(runner)).resolves.toEqual({
      authorityBaseUrl: 'https://d1234567890abc.cloudfront.net',
      learnerTarget: {
        bucket: 'mcat-dev-learner-web-056956104102-us-east-1',
        distributionId: 'E1234567890ABC',
      },
      adminTarget: {
        bucket: 'mcat-dev-admin-web-056956104102-us-east-1',
        distributionId: 'EABCDEFGHIJ123',
      },
    });
    expect(inspectedStacks).toEqual(['mcat-dev-web', 'mcat-dev-api']);
  });

  it('hashes bytes and assigns immutable cache only to fingerprinted assets', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mcat-web-'));
    await mkdir(join(directory, 'assets'));
    await writeFile(join(directory, 'index.html'), '<!doctype html><main>safe</main>');
    await writeFile(join(directory, 'sw.js'), 'self.addEventListener("fetch", () => {});');
    await writeFile(join(directory, 'assets', 'app-a1b2c3d4.js'), 'console.log("safe")');

    const manifest = await buildArtifactManifest('learner', directory, 'a'.repeat(40));
    const index = manifest.files.find((file) => file.path === 'index.html');
    const asset = manifest.files.find((file) => file.path.includes('app-a1b2c3d4.js'));

    expect(index?.cacheControl).toBe('no-cache,must-revalidate');
    expect(asset?.cacheControl).toBe('public,max-age=31536000,immutable');
    expect(manifest.sha256).toMatch(/^[a-f0-9]{64}$/);
    await expect(
      verifyArtifactFile(directory, asset ?? { path: '', sha256: '', bytes: 0 }),
    ).resolves.toBeUndefined();
    await writeFile(join(directory, 'assets', 'app-a1b2c3d4.js'), 'changed');
    await expect(
      verifyArtifactFile(directory, asset ?? { path: '', sha256: '', bytes: 0 }),
    ).rejects.toThrow('changed after scanning');
  });

  it('blocks protected fields, source maps, and non-fingerprinted assets', async () => {
    const protectedDirectory = await mkdtemp(join(tmpdir(), 'mcat-web-protected-'));
    await writeFile(protectedDirectory + '/index.html', '{"correct_choice_id":"choice-b"}');
    await expect(
      buildArtifactManifest('admin', protectedDirectory, 'a'.repeat(40)),
    ).rejects.toThrow('protected field');

    const mapDirectory = await mkdtemp(join(tmpdir(), 'mcat-web-map-'));
    await writeFile(mapDirectory + '/index.html', 'safe');
    await writeFile(mapDirectory + '/app.js.map', '{}');
    await expect(buildArtifactManifest('admin', mapDirectory, 'a'.repeat(40))).rejects.toThrow(
      'source map',
    );
  });

  it('allows learner code to handle authorized post-attempt fields without embedding an answer', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mcat-web-safe-handler-'));
    await writeFile(
      join(directory, 'index.html'),
      '<script>function render(result){return result.correctChoiceId}</script>',
    );

    await expect(
      buildArtifactManifest('learner', directory, 'a'.repeat(40)),
    ).resolves.toMatchObject({ app: 'learner' });
  });

  it('publishes with explicit argv and invalidates only shell paths', () => {
    const manifest = {
      schemaVersion: 1 as const,
      app: 'learner' as const,
      gitCommit: 'a'.repeat(40),
      sha256: 'b'.repeat(64),
      files: [
        {
          path: 'index.html',
          sha256: 'c'.repeat(64),
          bytes: 42,
          contentType: 'text/html; charset=utf-8',
          cacheControl: 'no-cache,must-revalidate',
        },
      ],
    } as const;
    const commands = planWebPublish(manifest, '/repo/apps/learner-web/dist', {
      bucket: 'mcat-dev-learner-web-artifacts-056956104102-us-east-1',
      distributionId: 'E1234567890ABC',
    });

    expect(commands[0]).toMatchObject({
      command: 'aws',
      args: expect.arrayContaining(['s3', 'cp']),
    });
    expect(commands.at(-1)?.args).toEqual(
      expect.arrayContaining(['cloudfront', 'create-invalidation', '/index.html', '/sw.js']),
    );
    expect(commands.flatMap((command) => command.args)).not.toContain('--delete');
    expect(() =>
      verifyUploadedObject(
        JSON.stringify({
          ContentLength: 42,
          CacheControl: 'no-cache,must-revalidate',
          ContentType: 'text/html; charset=utf-8',
          ChecksumSHA256: Buffer.from('c'.repeat(64), 'hex').toString('base64'),
          Metadata: { sha256: 'c'.repeat(64) },
        }),
        manifest.files[0]!,
      ),
    ).not.toThrow();
    expect(() => verifyUploadedObject('{}', manifest.files[0]!)).toThrow('S3 verification');
  });
});
