import { App, Stack, aws_kms as kms, aws_s3 as s3 } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { AwsSolutionsChecks } from 'cdk-nag';
import { describe, expect, it } from 'vitest';

import { getEnvironment } from '../config/environments.js';
import { AnalyticsStack } from '../lib/analytics-stack.js';

const environment = getEnvironment('dev');

function createAnalytics(): AnalyticsStack {
  const app = new App();
  const fixture = new Stack(app, 'AnalyticsFixture', {
    env: { account: environment.account, region: environment.region },
  });
  const key = new kms.Key(fixture, 'Key');
  const analyticsBucket = new s3.Bucket(fixture, 'AnalyticsBucket', {
    bucketName: `mcat-dev-analytics-${environment.account}-${environment.region}`,
    encryptionKey: key,
  });

  return new AnalyticsStack(app, 'McatDevAnalytics', {
    env: { account: environment.account, region: environment.region },
    environment,
    analyticsBucket,
    auditKey: key,
  });
}

describe('AnalyticsStack', () => {
  it('limits Firehose role assumption to the exact account and delivery stream', () => {
    Template.fromStack(createAnalytics()).hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 'sts:AssumeRole',
            Condition: {
              ArnLike: {
                'aws:SourceArn': `arn:aws:firehose:${environment.region}:${environment.account}:deliverystream/mcat-dev-first-party-events`,
              },
              StringEquals: { 'aws:SourceAccount': environment.account },
            },
            Principal: { Service: 'firehose.amazonaws.com' },
          }),
        ]),
      },
    });
  });

  it('delivers first-party events to encrypted, time-partitioned S3', () => {
    const template = Template.fromStack(createAnalytics());

    template.hasResourceProperties('AWS::KinesisFirehose::DeliveryStream', {
      DeliveryStreamEncryptionConfigurationInput: {
        KeyARN: Match.anyValue(),
        KeyType: 'CUSTOMER_MANAGED_CMK',
      },
      ExtendedS3DestinationConfiguration: Match.objectLike({
        CompressionFormat: 'GZIP',
        ErrorOutputPrefix: Match.stringLikeRegexp('errors/'),
        Prefix: Match.stringLikeRegexp('year=!\\{timestamp:yyyy\\}'),
      }),
    });
    const serialized = JSON.stringify(template.toJSON());
    expect(serialized).toContain('s3:GetObject');
    expect(serialized).toContain(
      `arn:aws:s3:::mcat-dev-analytics-${environment.account}-${environment.region}/events/*`,
    );
    expect(serialized).toContain(
      `arn:aws:s3:::mcat-dev-analytics-${environment.account}-${environment.region}/errors/*`,
    );
  });

  it('authorizes Firehose to write only to the real pre-created log stream ARN', () => {
    const template = Template.fromStack(createAnalytics());
    const policies = template.findResources('AWS::IAM::Policy');
    const serialized = JSON.stringify(policies);
    const expected =
      'arn:aws:logs:us-east-1:056956104102:log-group:/aws/kinesisfirehose/mcat-dev-first-party-events:log-stream:s3-delivery';

    expect(serialized).toContain(expected);
    expect(serialized).not.toContain(':*:log-stream:s3-delivery');
  });

  it('defines a strict allowlisted Glue schema without research or sensitive payload fields', () => {
    const template = Template.fromStack(createAnalytics());
    const serialized = JSON.stringify(template.toJSON());

    template.resourceCountIs('AWS::Glue::Database', 1);
    template.hasResourceProperties('AWS::Glue::Table', {
      TableInput: Match.objectLike({
        Parameters: Match.objectLike({ classification: 'json' }),
        StorageDescriptor: Match.objectLike({ Columns: Match.anyValue() }),
      }),
    });
    expect(serialized).not.toContain('answer_key');
    expect(serialized).not.toContain('raw_audio');
    expect(serialized).not.toContain('email');
  });

  it('enforces encrypted Athena results and a per-query byte scan ceiling', () => {
    const template = Template.fromStack(createAnalytics());
    template.hasResourceProperties('AWS::Athena::WorkGroup', {
      WorkGroupConfiguration: Match.objectLike({
        BytesScannedCutoffPerQuery: 10_737_418_240,
        EnforceWorkGroupConfiguration: true,
        ResultConfiguration: Match.objectLike({
          EncryptionConfiguration: Match.objectLike({ EncryptionOption: 'SSE_KMS' }),
          OutputLocation: Match.anyValue(),
        }),
      }),
    });
    expect(JSON.stringify(template.toJSON())).toContain('athena-results/');
  });

  it('does not provision QuickSight and keeps IAM grants resource-scoped', () => {
    const serialized = JSON.stringify(Template.fromStack(createAnalytics()).toJSON());

    expect(serialized).not.toContain('AWS::QuickSight::');
    expect(serialized).not.toContain('s3:*');
    expect(serialized).not.toContain('kms:*');
  });

  it('has no unsuppressed AWS Solutions findings', () => {
    const stack = createAnalytics();
    const app = stack.node.root as App;
    app.synth();
    const report = new AwsSolutionsChecks(app, { verbose: true }).validateScope(stack);

    expect(report.violations).toEqual([]);
  });
});
