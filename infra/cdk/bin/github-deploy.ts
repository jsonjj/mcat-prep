#!/usr/bin/env node
import { App } from 'aws-cdk-lib';

import { GithubDeployStack, resolveGithubDeployConfig } from '../lib/github-deploy-stack.js';

/**
 * Separate CDK app for the GitHub OIDC deploy identity. Synthesize/deploy it with:
 *
 *   pnpm --filter @mcat/infra-cdk exec cdk deploy \
 *     --app "pnpm exec tsx bin/github-deploy.ts" \
 *     -c awsAccountId=056956104102 -c awsRegion=us-east-1 \
 *     -c githubOwner=jsonjj -c githubRepo=mcat-prep \
 *     -c permissionsBoundaryArn=arn:aws:iam::056956104102:policy/InternSandboxBoundary
 *
 * The default `cdk.json` app (bin/mcat.ts) is untouched, so CI `cdk synth` and the
 * reviewed nine-stack deployment allowlist are unchanged.
 */
const app = new App();
const config = resolveGithubDeployConfig((key) => app.node.tryGetContext(key), process.env);

new GithubDeployStack(app, 'McatGithubDeploy', {
  stackName: 'mcat-github-deploy',
  description: 'GitHub Actions OIDC deploy identity for the MCAT Mastery automated pipeline.',
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
