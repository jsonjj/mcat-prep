import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { AwsSolutionsChecks } from 'cdk-nag';
import { describe, expect, it } from 'vitest';

import { getEnvironment } from '../config/environments.js';
import { AsyncStack } from '../lib/async-stack.js';
import { DataStack } from '../lib/data-stack.js';
import { FoundationStack } from '../lib/foundation-stack.js';

const environment = getEnvironment('dev');
const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const workerEntries = {
  outboxPublisher: {
    entry: path.join(repoRoot, 'services/lambdas/workers/src/lambda.ts'),
    handler: 'outboxHandler',
  },
  projectionConsumer: {
    entry: path.join(repoRoot, 'services/lambdas/workers/src/lambda.ts'),
    handler: 'projectionHandler',
  },
} as const;

function createAsync(): { readonly app: App; readonly stack: AsyncStack } {
  const app = new App();
  const env = { account: environment.account, region: environment.region };
  const foundation = new FoundationStack(app, 'McatDevFoundation', { env, environment });
  const data = new DataStack(app, 'McatDevData', {
    env,
    environment,
    foundation: foundation.resources,
  });
  const stack = new AsyncStack(app, 'McatDevAsync', {
    env,
    environment,
    foundation: foundation.resources,
    data: data.resources,
    runtimeEntries: workerEntries,
  });
  return { app, stack };
}

describe('AsyncStack', () => {
  it('creates scheduled outbox publication with bounded concurrency', () => {
    const { stack } = createAsync();
    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::Events::Rule', {
      Name: 'mcat-dev-outbox-schedule',
      ScheduleExpression: 'rate(1 minute)',
      State: 'ENABLED',
    });
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'mcat-dev-outbox-publisher',
      Handler: 'index.outboxHandler',
      ReservedConcurrentExecutions: 1,
      Runtime: 'nodejs22.x',
    });
  });

  it('consumes the FIFO projection queue with partial batch failure', () => {
    const { stack } = createAsync();
    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::Lambda::EventSourceMapping', {
      BatchSize: 10,
      FunctionResponseTypes: ['ReportBatchItemFailures'],
      ScalingConfig: { MaximumConcurrency: 4 },
    });
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'mcat-dev-projection-consumer',
      Handler: 'index.projectionHandler',
      ReservedConcurrentExecutions: 4,
      Runtime: 'nodejs22.x',
    });
  });

  it('places both workers in isolated subnets with TLS proxy connectivity', () => {
    const { stack } = createAsync();
    const template = Template.fromStack(stack);

    template.resourceCountIs('AWS::Lambda::Function', 2);
    template.allResourcesProperties('AWS::Lambda::Function', {
      Environment: {
        Variables: Match.objectLike({
          NODE_EXTRA_CA_CERTS: '/var/runtime/ca-cert.pem',
        }),
      },
      TracingConfig: { Mode: 'Active' },
      VpcConfig: Match.objectLike({
        SecurityGroupIds: Match.anyValue(),
        SubnetIds: Match.anyValue(),
      }),
    });
    template.hasResourceProperties('AWS::EC2::SecurityGroupEgress', {
      FromPort: 5432,
      IpProtocol: 'tcp',
      ToPort: 5432,
    });
    template.hasResourceProperties('AWS::EC2::SecurityGroupEgress', {
      FromPort: 443,
      IpProtocol: 'tcp',
      ToPort: 443,
    });
    template.hasResourceProperties('AWS::EC2::SecurityGroupIngress', {
      FromPort: 443,
      IpProtocol: 'tcp',
      SourceSecurityGroupId: Match.anyValue(),
      ToPort: 443,
    });
  });

  it('grants bounded queue and database-secret permissions without IAM DB auth', () => {
    const { stack } = createAsync();
    const policies = JSON.stringify(Template.fromStack(stack).findResources('AWS::IAM::Policy'));

    expect(policies).toContain('sqs:SendMessage');
    expect(policies).toContain('sqs:ReceiveMessage');
    expect(policies).toContain('secretsmanager:GetSecretValue');
    expect(policies).toContain('kms:Decrypt');
    expect(policies).not.toContain('rds-db:connect');
  });

  it('alarms on every domain dead-letter queue', () => {
    const { stack } = createAsync();
    const template = Template.fromStack(stack);

    template.resourceCountIs('AWS::CloudWatch::Alarm', 6);
    template.allResourcesProperties('AWS::CloudWatch::Alarm', {
      ComparisonOperator: 'GreaterThanOrEqualToThreshold',
      EvaluationPeriods: 1,
      MetricName: 'ApproximateNumberOfMessagesVisible',
      Namespace: 'AWS/SQS',
      Threshold: 1,
      TreatMissingData: 'notBreaching',
    });
  });

  it('retains worker logs and applies the sandbox boundary to every role', () => {
    const { stack } = createAsync();
    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::Logs::LogGroup', {
      LogGroupName: '/aws/lambda/mcat-dev-outbox-publisher',
      RetentionInDays: 90,
    });
    template.hasResourceProperties('AWS::Logs::LogGroup', {
      LogGroupName: '/aws/lambda/mcat-dev-projection-consumer',
      RetentionInDays: 90,
    });
    template.allResourcesProperties('AWS::IAM::Role', {
      PermissionsBoundary: 'arn:aws:iam::056956104102:policy/InternSandboxBoundary',
    });
  });

  it('has no unsuppressed AWS Solutions findings', () => {
    const { app } = createAsync();
    app.synth();
    const report = new AwsSolutionsChecks(app, { verbose: true }).validateScope(app);

    expect(report.violations).toEqual([]);
    expect(report.success).toBe(true);
  });
});
