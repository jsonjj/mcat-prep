import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';

import {
  GithubDeployStack,
  resolveGithubDeployConfig,
  type GithubDeployConfig,
} from '../lib/github-deploy-stack.js';

function contextReader(values: Record<string, string>) {
  return (key: string): unknown => values[key];
}

function synth(overrides: Partial<GithubDeployConfig> = {}): Template {
  const config: GithubDeployConfig = {
    account: '111122223333',
    region: 'us-east-1',
    githubOwner: 'jsonjj',
    githubRepo: 'mcat-prep',
    allowedSubjects: [
      'repo:jsonjj/mcat-prep:ref:refs/heads/main',
      'repo:jsonjj/mcat-prep:environment:aws-dev',
    ],
    roleName: 'mcat-github-deploy',
    cdkQualifier: 'hnb659fds',
    deployEnvironment: 'aws-dev',
    ...overrides,
  };
  const app = new App();
  const stack = new GithubDeployStack(app, 'McatGithubDeploy', {
    env: { account: config.account, region: config.region },
    githubOwner: config.githubOwner,
    githubRepo: config.githubRepo,
    allowedSubjects: config.allowedSubjects,
    roleName: config.roleName,
    cdkQualifier: config.cdkQualifier,
    ...(config.oidcProviderArn === undefined ? {} : { oidcProviderArn: config.oidcProviderArn }),
    ...(config.permissionsBoundaryArn === undefined
      ? {}
      : { permissionsBoundaryArn: config.permissionsBoundaryArn }),
  });
  return Template.fromStack(stack);
}

describe('resolveGithubDeployConfig', () => {
  it('derives ref and environment subjects from owner/repo with clear defaults', () => {
    const config = resolveGithubDeployConfig(
      contextReader({
        awsAccountId: '111122223333',
        githubOwner: 'jsonjj',
        githubRepo: 'mcat-prep',
      }),
      {},
    );

    expect(config.region).toBe('us-east-1');
    expect(config.roleName).toBe('mcat-github-deploy');
    expect(config.cdkQualifier).toBe('hnb659fds');
    expect(config.deployEnvironment).toBe('aws-dev');
    expect(config.allowedSubjects).toEqual([
      'repo:jsonjj/mcat-prep:ref:refs/heads/main',
      'repo:jsonjj/mcat-prep:environment:aws-dev',
    ]);
    expect(config.oidcProviderArn).toBeUndefined();
  });

  it('falls back to CDK/AWS environment variables for account and region', () => {
    const config = resolveGithubDeployConfig(
      contextReader({ githubOwner: 'jsonjj', githubRepo: 'mcat-prep' }),
      { CDK_DEFAULT_ACCOUNT: '444455556666', CDK_DEFAULT_REGION: 'us-west-2' },
    );

    expect(config.account).toBe('444455556666');
    expect(config.region).toBe('us-west-2');
  });

  it('normalizes bare branch names and honors an explicit subject override', () => {
    const derived = resolveGithubDeployConfig(
      contextReader({
        awsAccountId: '111122223333',
        githubOwner: 'jsonjj',
        githubRepo: 'mcat-prep',
        githubAllowedRefs: 'main, release',
        githubDeployEnvironment: 'prod',
      }),
      {},
    );
    expect(derived.allowedSubjects).toEqual([
      'repo:jsonjj/mcat-prep:ref:refs/heads/main',
      'repo:jsonjj/mcat-prep:ref:refs/heads/release',
      'repo:jsonjj/mcat-prep:environment:prod',
    ]);

    const explicit = resolveGithubDeployConfig(
      contextReader({
        awsAccountId: '111122223333',
        githubOwner: 'jsonjj',
        githubRepo: 'mcat-prep',
        githubAllowedSubjects: 'repo:jsonjj/mcat-prep:*',
      }),
      {},
    );
    expect(explicit.allowedSubjects).toEqual(['repo:jsonjj/mcat-prep:*']);
  });

  it('rejects a missing owner, repo, or account', () => {
    expect(() =>
      resolveGithubDeployConfig(contextReader({ githubOwner: 'jsonjj', githubRepo: 'mcat-prep' }), {}),
    ).toThrow(/awsAccountId is required/);
    expect(() =>
      resolveGithubDeployConfig(contextReader({ awsAccountId: '111122223333', githubRepo: 'x' }), {}),
    ).toThrow(/githubOwner is required/);
    expect(() =>
      resolveGithubDeployConfig(
        contextReader({ awsAccountId: '111122223333', githubOwner: 'jsonjj' }),
        {},
      ),
    ).toThrow(/githubRepo is required/);
    expect(() =>
      resolveGithubDeployConfig(
        contextReader({ awsAccountId: 'nope', githubOwner: 'jsonjj', githubRepo: 'mcat-prep' }),
        {},
      ),
    ).toThrow(/12-digit/);
  });
});

describe('GithubDeployStack', () => {
  it('creates the OIDC provider and a web-identity trust scoped to repo subjects', () => {
    const template = synth();

    template.resourceCountIs('Custom::AWSCDKOpenIdConnectProvider', 1);
    template.hasResourceProperties('AWS::IAM::Role', {
      RoleName: 'mcat-github-deploy',
      AssumeRolePolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 'sts:AssumeRoleWithWebIdentity',
            Condition: {
              StringEquals: { 'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com' },
              StringLike: {
                'token.actions.githubusercontent.com:sub': [
                  'repo:jsonjj/mcat-prep:ref:refs/heads/main',
                  'repo:jsonjj/mcat-prep:environment:aws-dev',
                ],
              },
            },
          }),
        ]),
      }),
    });
  });

  it('grants a minimal deploy policy that delegates to the CDK bootstrap roles', () => {
    const policies = JSON.stringify(synth().findResources('AWS::IAM::Policy'));

    expect(policies).toContain('sts:AssumeRole');
    expect(policies).toContain(':role/cdk-hnb659fds-*');
    expect(policies).toContain('cloudformation:DescribeStacks');
    expect(policies).toContain('s3:PutObject');
    expect(policies).toContain('cloudfront:CreateInvalidation');
    // No wildcard admin: the identity never holds raw CloudFormation/IAM mutation rights.
    expect(policies).not.toContain('"Action":"*"');
    expect(policies).not.toContain('iam:PassRole');
  });

  it('exposes the role ARN and provider ARN as stack outputs', () => {
    const outputs = synth().findOutputs('*');

    expect(Object.keys(outputs)).toEqual(
      expect.arrayContaining(['GithubDeployRoleArn', 'GithubOidcProviderArn']),
    );
  });

  it('reuses an existing OIDC provider when its ARN is supplied', () => {
    const template = synth({
      oidcProviderArn:
        'arn:aws:iam::111122223333:oidc-provider/token.actions.githubusercontent.com',
    });

    template.resourceCountIs('Custom::AWSCDKOpenIdConnectProvider', 0);
    const roles = JSON.stringify(template.findResources('AWS::IAM::Role'));
    expect(roles).toContain('oidc-provider/token.actions.githubusercontent.com');
  });

  it('applies an optional permissions boundary when provided', () => {
    const template = synth({
      permissionsBoundaryArn: 'arn:aws:iam::111122223333:policy/InternSandboxBoundary',
    });

    template.hasResourceProperties('AWS::IAM::Role', {
      RoleName: 'mcat-github-deploy',
      PermissionsBoundary: 'arn:aws:iam::111122223333:policy/InternSandboxBoundary',
    });
  });
});
