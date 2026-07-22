import { App, Stack, aws_s3 as s3 } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';

import {
  EnvironmentNotProvisionedError,
  assertCdkTarget,
  getEnvironment,
} from '../config/environments.js';
import { applyRequiredTags } from '../lib/tags.js';

describe('AWS environment configuration', () => {
  it('pins the development account and region', () => {
    expect(getEnvironment('dev')).toEqual({
      stage: 'dev',
      account: '056956104102',
      region: 'us-east-1',
      deployable: true,
      budgetUsd: 100,
      budgetEmail: 'jonathan.thomas@alphaaiengineering.com',
    });
  });

  it.each(['staging', 'production'] as const)('fails closed for %s', (stage) => {
    expect(() => getEnvironment(stage)).toThrow(EnvironmentNotProvisionedError);
    expect(() => getEnvironment(stage)).toThrow(`${stage} environment is not provisioned`);
  });

  it('rejects unknown stage names', () => {
    expect(() => getEnvironment('preview')).toThrow('Unsupported deployment stage: preview');
  });

  it('rejects an AWS account mismatch before synthesis', () => {
    const config = getEnvironment('dev');

    expect(() =>
      assertCdkTarget(config, {
        CDK_DEFAULT_ACCOUNT: '999999999999',
        CDK_DEFAULT_REGION: config.region,
      }),
    ).toThrow('AWS account mismatch');
  });

  it('rejects an AWS region mismatch before synthesis', () => {
    const config = getEnvironment('dev');

    expect(() =>
      assertCdkTarget(config, {
        CDK_DEFAULT_ACCOUNT: config.account,
        CDK_DEFAULT_REGION: 'us-west-2',
      }),
    ).toThrow('AWS region mismatch');
  });

  it('requires CDK to resolve both target coordinates', () => {
    const config = getEnvironment('dev');

    expect(() => assertCdkTarget(config, {})).toThrow('CDK_DEFAULT_ACCOUNT is required');
  });

  it('accepts only the exact development account and region', () => {
    const config = getEnvironment('dev');

    expect(() =>
      assertCdkTarget(config, {
        CDK_DEFAULT_ACCOUNT: config.account,
        CDK_DEFAULT_REGION: config.region,
      }),
    ).not.toThrow();
  });
});

describe('required AWS resource tags', () => {
  it('applies the complete development tag set to taggable resources', () => {
    const app = new App();
    const stack = new Stack(app, 'TaggedStack');
    applyRequiredTags(stack, 'restricted');
    new s3.CfnBucket(stack, 'Bucket');

    Template.fromStack(stack).hasResourceProperties('AWS::S3::Bucket', {
      Tags: Match.arrayWith([
        { Key: 'Application', Value: 'mcat-mastery' },
        { Key: 'DataClassification', Value: 'restricted' },
        { Key: 'Environment', Value: 'dev' },
        { Key: 'ManagedBy', Value: 'cdk' },
        { Key: 'Owner', Value: 'jonathan-thomas' },
      ]),
    });
  });

  it('rejects an empty data classification', () => {
    const stack = new Stack(new App(), 'InvalidTagStack');

    expect(() => applyRequiredTags(stack, '  ')).toThrow('Data classification is required');
  });
});
