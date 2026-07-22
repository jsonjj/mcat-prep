import { App, Stack, aws_kms as kms, aws_s3 as s3 } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { AwsSolutionsChecks } from 'cdk-nag';
import { describe, expect, it } from 'vitest';

import { getEnvironment } from '../config/environments.js';
import { PublicationStack } from '../lib/publication-stack.js';

const environment = getEnvironment('dev');

function createPublication(): PublicationStack {
  const app = new App();
  const fixture = new Stack(app, 'PublicationFixture', {
    env: { account: environment.account, region: environment.region },
  });
  const key = new kms.Key(fixture, 'Key');
  const sourceQuarantine = new s3.Bucket(fixture, 'SourceQuarantine', {
    bucketName: `mcat-dev-source-quarantine-${environment.account}-${environment.region}`,
    encryptionKey: key,
  });
  const protectedContent = new s3.Bucket(fixture, 'ProtectedContent', {
    bucketName: `mcat-dev-protected-content-${environment.account}-${environment.region}`,
    encryptionKey: key,
  });
  const authorizedDelivery = new s3.Bucket(fixture, 'AuthorizedDelivery', {
    bucketName: `mcat-dev-authorized-delivery-${environment.account}-${environment.region}`,
    encryptionKey: key,
  });

  return new PublicationStack(app, 'McatDevPublication', {
    env: { account: environment.account, region: environment.region },
    environment,
    applicationKey: key,
    sourceQuarantine,
    protectedContent,
    authorizedDelivery,
  });
}

describe('PublicationStack', () => {
  it('creates an explicitly invoked Standard workflow with no automatic trigger', () => {
    const template = Template.fromStack(createPublication());

    template.hasResourceProperties('AWS::StepFunctions::StateMachine', {
      StateMachineType: 'STANDARD',
      TracingConfiguration: { Enabled: true },
    });
    template.resourceCountIs('AWS::Events::Rule', 0);
    template.resourceCountIs('AWS::S3::Bucket', 0);
  });

  it('rejects synthetic inputs and makes activation a terminal disabled branch', () => {
    const serialized = JSON.stringify(Template.fromStack(createPublication()).toJSON());

    expect(serialized).toContain('SyntheticContentRejected');
    expect(serialized).toContain('ActivationDisabled');
    expect(serialized).toContain('ValidateQuarantineObject');
    expect(serialized).toContain('CompileCandidateManifest');
    expect(serialized).toContain('DryRunPublication');
  });

  it('requires an external callback token before the dry run can complete', () => {
    const serialized = JSON.stringify(Template.fromStack(createPublication()).toJSON());

    expect(serialized).toContain('sqs:sendMessage.waitForTaskToken');
    expect(serialized).toContain('ReviewGate');
    Template.fromStack(createPublication()).hasResourceProperties('AWS::SQS::Queue', {
      KmsMasterKeyId: Match.anyValue(),
    });
  });

  it('logs executions and does not grant delivery-bucket writes while activation is disabled', () => {
    const template = Template.fromStack(createPublication());
    const serialized = JSON.stringify(template.toJSON());

    template.hasResourceProperties('AWS::Logs::LogGroup', {
      KmsKeyId: Match.anyValue(),
      RetentionInDays: 90,
    });
    expect(serialized).not.toContain('s3:*');
    expect(serialized).not.toContain('states:SendTaskSuccess');
  });

  it('has no unsuppressed AWS Solutions findings', () => {
    const stack = createPublication();
    const app = stack.node.root as App;
    app.synth();
    const report = new AwsSolutionsChecks(app, { verbose: true }).validateScope(stack);

    expect(report.violations).toEqual([]);
  });
});
