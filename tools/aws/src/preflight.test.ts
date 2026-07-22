import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  EXPECTED_ACCOUNT,
  EXPECTED_PROFILE,
  EXPECTED_REGION,
  MINIMUM_BOOTSTRAP_VERSION,
  APPROVED_STACKS,
  assertNoRawAwsCredentials,
  assertReviewedArtifactUnchanged,
  createDeploymentReviewDraft,
  findOrganizationDeniedActions,
  validateMutationBoundary,
  validatePreflightEvidence,
  verifyReviewedArtifact,
} from './preflight';

const validEvidence = {
  account: EXPECTED_ACCOUNT,
  region: EXPECTED_REGION,
  profile: EXPECTED_PROFILE,
  bootstrapVersion: MINIMUM_BOOTSTRAP_VERSION,
  gitClean: true,
  repositoryVisibility: 'PRIVATE' as const,
  repositoryRemote: 'https://github.com/jsonjj/mcat-prep.git',
  deployedStackNames: ['mcat-dev-foundation'],
  organizationDeniedActions: [],
};

describe('AWS development preflight', () => {
  it('rejects an unexpected account before CDK mutation', () => {
    expect(() => validatePreflightEvidence({ ...validEvidence, account: '000000000000' })).toThrow(
      'expected AWS account 056956104102',
    );
  });

  it.each([
    [{ ...validEvidence, region: 'us-west-2' }, 'expected AWS region us-east-1'],
    [{ ...validEvidence, profile: 'default' }, 'expected AWS profile sbsandbox'],
    [{ ...validEvidence, bootstrapVersion: 31 }, 'bootstrap version must be at least 32'],
    [{ ...validEvidence, gitClean: false }, 'Git worktree must be clean'],
    [{ ...validEvidence, repositoryVisibility: 'PUBLIC' as const }, 'repository must be private'],
    [
      { ...validEvidence, organizationDeniedActions: ['ec2:CreateVpc'] },
      'organization policy denies required AWS mutations (ec2:CreateVpc)',
    ],
    [
      { ...validEvidence, deployedStackNames: ['mcat-production-api'] },
      'staging/production stack is present',
    ],
  ])('fails closed when evidence is unsafe', (evidence, message) => {
    expect(() => validatePreflightEvidence(evidence)).toThrow(message);
  });

  it('fails closed when IAM simulation omits or denies a required organization decision', () => {
    expect(
      findOrganizationDeniedActions({
        EvaluationResults: [
          {
            EvalActionName: 'ec2:CreateVpc',
            OrganizationsDecisionDetail: { AllowedByOrganizations: true },
          },
          {
            EvalActionName: 'ec2:CreateSecurityGroup',
            OrganizationsDecisionDetail: { AllowedByOrganizations: false },
          },
        ],
      }),
    ).toEqual([
      'ec2:CreateSecurityGroup',
      'rds:CreateDBCluster',
      'rds:CreateDBInstance',
      'cloudfront:CreateDistribution',
    ]);
  });

  it('ignores organization-managed staging labels while still rejecting MCAT staging stacks', () => {
    expect(() =>
      validatePreflightEvidence({
        ...validEvidence,
        deployedStackNames: ['StackSet-CloudFixOrgStackSet-staging-12345678'],
      }),
    ).not.toThrow();
    expect(() =>
      validatePreflightEvidence({
        ...validEvidence,
        deployedStackNames: ['StackSet-CloudFixOrgStackSet-staging-12345678', 'mcat-staging-api'],
      }),
    ).toThrow('staging/production stack is present');
  });

  it('accepts only a reviewed artifact whose bytes and Git commit still match', () => {
    const review = {
      schemaVersion: 1 as const,
      stage: 'dev' as const,
      account: EXPECTED_ACCOUNT,
      region: EXPECTED_REGION,
      profile: EXPECTED_PROFILE,
      gitCommit: 'a'.repeat(40),
      stacks: ['McatDevFoundation'],
      synth: { path: 'synth.json', sha256: 'b'.repeat(64) },
      diff: { path: 'diff.txt', sha256: 'c'.repeat(64) },
      review: {
        approved: true,
        reviewer: 'security-owner@example.com',
        reviewedAt: '2026-07-21T12:00:00.000Z',
      },
    };
    const actual = {
      gitCommit: 'a'.repeat(40),
      synthSha256: 'b'.repeat(64),
      diffSha256: 'c'.repeat(64),
      diffText: 'Stack McatDevFoundation\nThere were no differences\n',
    };

    expect(verifyReviewedArtifact(review, actual).stacks).toEqual(['McatDevFoundation']);
    expect(() =>
      verifyReviewedArtifact(review, {
        ...actual,
        diffText: ' \n',
      }),
    ).toThrow('diff must not be empty');
  });

  it('rejects stale, unreviewed, or over-broad deployment evidence', () => {
    const review = {
      schemaVersion: 1 as const,
      stage: 'dev' as const,
      account: EXPECTED_ACCOUNT,
      region: EXPECTED_REGION,
      profile: EXPECTED_PROFILE,
      gitCommit: 'a'.repeat(40),
      stacks: ['McatDevFoundation', 'SurpriseStack'],
      synth: { path: 'synth.json', sha256: 'b'.repeat(64) },
      diff: { path: 'diff.txt', sha256: 'c'.repeat(64) },
      review: {
        approved: true,
        reviewer: 'reviewer',
        reviewedAt: '2026-07-21T12:00:00.000Z',
      },
    };

    expect(() =>
      verifyReviewedArtifact(review, {
        gitCommit: review.gitCommit,
        synthSha256: review.synth.sha256,
        diffSha256: review.diff.sha256,
      }),
    ).toThrow('unapproved stack SurpriseStack');
    expect(() =>
      verifyReviewedArtifact(
        { ...review, stacks: ['McatDevFoundation'], review: { ...review.review, approved: false } },
        {
          gitCommit: review.gitCommit,
          synthSha256: review.synth.sha256,
          diffSha256: review.diff.sha256,
        },
      ),
    ).toThrow('explicit approval');
  });

  it('rejects raw AWS credentials and last-moment mutation-boundary drift', () => {
    expect(() => assertNoRawAwsCredentials({ AWS_ACCESS_KEY_ID: 'AKIAEXAMPLE' })).toThrow(
      'raw AWS credential environment',
    );
    expect(() =>
      validateMutationBoundary(
        { gitStatus: ' M file.ts', gitCommit: 'a'.repeat(40), account: EXPECTED_ACCOUNT },
        'a'.repeat(40),
      ),
    ).toThrow('worktree changed');
    expect(() =>
      validateMutationBoundary(
        { gitStatus: '', gitCommit: 'b'.repeat(40), account: EXPECTED_ACCOUNT },
        'a'.repeat(40),
      ),
    ).toThrow('commit changed');
  });

  it('creates an unapproved draft over the entire reviewed cloud assembly', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mcat-review-'));
    const assembly = join(directory, 'cdk.out');
    await mkdir(assembly);
    await writeFile(
      join(assembly, 'manifest.json'),
      JSON.stringify({
        artifacts: Object.fromEntries(
          APPROVED_STACKS.map((id) => [id, { type: 'aws:cloudformation:stack' }]),
        ),
      }),
    );
    await writeFile(join(assembly, 'McatDevFoundation.template.json'), '{}');
    const diff = join(directory, 'diff.txt');
    await writeFile(diff, '');

    await expect(
      createDeploymentReviewDraft({
        synthPath: assembly,
        diffPath: diff,
        gitCommit: 'a'.repeat(40),
      }),
    ).rejects.toThrow('diff must not be empty');

    await writeFile(diff, 'There were no differences\n');

    const draft = await createDeploymentReviewDraft({
      synthPath: assembly,
      diffPath: diff,
      gitCommit: 'a'.repeat(40),
    });

    expect(draft.review.approved).toBe(false);
    expect(draft.stacks).toEqual(APPROVED_STACKS);
    expect(draft.synth.sha256).toMatch(/^[a-f0-9]{64}$/);
    await expect(
      assertReviewedArtifactUnchanged(assembly, draft.synth.sha256),
    ).resolves.toBeUndefined();
    await writeFile(join(assembly, 'McatDevFoundation.template.json'), '{"changed":true}');
    await expect(assertReviewedArtifactUnchanged(assembly, draft.synth.sha256)).rejects.toThrow(
      'changed after review',
    );
  });
});
