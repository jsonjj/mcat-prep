#!/usr/bin/env node
import { App } from 'aws-cdk-lib';

import { SeedStack } from '../lib/seed-stack.js';

/**
 * Separate CDK app for the one-shot content seed stack. Synthesize/deploy it with
 * an EXPLICIT output dir so it never touches the default `cdk.out` a concurrent
 * `cdk deploy McatDev*` uses, and pass the existing infra ids as context:
 *
 *   pnpm --filter @mcat/infra-cdk exec cdk deploy McatDevContentSeed \
 *     --app "pnpm exec tsx bin/seed.ts" --output /tmp/cdk-out-seed \
 *     --require-approval never \
 *     -c vpcId=vpc-... -c azs=us-east-1a,us-east-1b \
 *     -c isolatedSubnetIds=subnet-...,subnet-... \
 *     -c migrationSgId=sg-... -c adminSecretArn=arn:...:secret:/mcat/dev/database/admin-XXXXXX \
 *     -c appKeyArn=arn:aws:kms:... 
 *
 * The default `cdk.json` app (bin/mcat.ts) is untouched, so the reviewed
 * nine-stack deployment allowlist and CI `cdk synth` are unchanged.
 */

const app = new App();
const ctx = (key: string): string | undefined => {
  const value = app.node.tryGetContext(key);
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
};
const required = (key: string): string => {
  const value = ctx(key);
  if (value === undefined) throw new Error(`Missing required -c ${key}`);
  return value;
};
const list = (value: string): string[] =>
  value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

const account = ctx('awsAccountId') ?? process.env.CDK_DEFAULT_ACCOUNT ?? '056956104102';
const region = ctx('awsRegion') ?? process.env.CDK_DEFAULT_REGION ?? 'us-east-1';

new SeedStack(app, 'McatDevContentSeed', {
  stackName: 'mcat-dev-content-seed',
  description: 'One-shot in-VPC MCAT content seeder (questions + passages → Aurora via RDS Proxy).',
  env: { account, region },
  account,
  vpcId: required('vpcId'),
  availabilityZones: list(required('azs')),
  isolatedSubnetIds: list(required('isolatedSubnetIds')),
  migrationSecurityGroupId: required('migrationSgId'),
  adminSecretArn: required('adminSecretArn'),
  appKeyArn: required('appKeyArn'),
  proxyEndpoint:
    ctx('proxyEndpoint') ?? 'mcat-dev-proxy.proxy-c49uy42scra6.us-east-1.rds.amazonaws.com',
  databaseName: ctx('databaseName') ?? 'mcat',
  ...(ctx('corpusDir') === undefined ? {} : { corpusDir: ctx('corpusDir') }),
});
