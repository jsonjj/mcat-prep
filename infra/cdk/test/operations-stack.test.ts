import {
  App,
  Duration,
  Stack,
  aws_apigateway as apigateway,
  aws_cloudfront as cloudfront,
  aws_ec2 as ec2,
  aws_lambda as lambda,
  aws_kms as kms,
  aws_rds as rds,
  aws_s3 as s3,
  aws_sqs as sqs,
  aws_stepfunctions as sfn,
} from 'aws-cdk-lib';
import { S3BucketOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { AwsSolutionsChecks } from 'cdk-nag';
import { describe, expect, it } from 'vitest';

import { getEnvironment } from '../config/environments.js';
import { OperationsStack } from '../lib/operations-stack.js';

const environment = getEnvironment('dev');

function createOperations(): OperationsStack {
  const app = new App();
  const fixture = new Stack(app, 'OperationsFixture', {
    env: { account: environment.account, region: environment.region },
  });
  const vpc = new ec2.Vpc(fixture, 'Vpc', {
    natGateways: 0,
    maxAzs: 2,
    subnetConfiguration: [
      { name: 'isolated', subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
    ],
  });
  const auditKey = new kms.Key(fixture, 'AuditKey');
  const cluster = new rds.DatabaseCluster(fixture, 'Cluster', {
    engine: rds.DatabaseClusterEngine.auroraPostgres({
      version: rds.AuroraPostgresEngineVersion.VER_17_9,
    }),
    writer: rds.ClusterInstance.serverlessV2('Writer'),
    vpc,
    vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
  });
  const proxy = cluster.addProxy('Proxy', {
    secrets: [cluster.secret!],
    vpc,
    vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
  });
  const restApi = new apigateway.RestApi(fixture, 'Api', {
    deployOptions: { stageName: 'dev' },
  });
  restApi.root.addMethod('GET', new apigateway.MockIntegration());
  const handler = new lambda.Function(fixture, 'Handler', {
    runtime: lambda.Runtime.NODEJS_22_X,
    code: lambda.Code.fromInline('exports.handler=async()=>({statusCode:200})'),
    handler: 'index.handler',
  });
  const dlq = new sqs.Queue(fixture, 'Dlq', { retentionPeriod: Duration.days(14) });
  const publicationStateMachine = new sfn.StateMachine(fixture, 'Publication', {
    definitionBody: sfn.DefinitionBody.fromChainable(new sfn.Succeed(fixture, 'Success')),
  });
  const bucket = new s3.Bucket(fixture, 'Origin');
  const distribution = new cloudfront.Distribution(fixture, 'Distribution', {
    defaultBehavior: {
      origin: S3BucketOrigin.withOriginAccessControl(bucket),
    },
  });

  return new OperationsStack(app, 'McatDevOperations', {
    env: { account: environment.account, region: environment.region },
    environment,
    vpc,
    auditKey,
    restApi,
    functions: [handler],
    cluster,
    proxy,
    dlqs: [dlq],
    publicationStateMachine,
    distributions: [distribution],
    budgetName: 'mcat-dev-monthly',
  });
}

describe('OperationsStack', () => {
  it('monitors but does not own the API WAF association', () => {
    const template = Template.fromStack(createOperations());

    template.resourceCountIs('AWS::WAFv2::WebACL', 0);
    template.resourceCountIs('AWS::WAFv2::WebACLAssociation', 0);
  });

  it('creates an operations dashboard covering API, compute, data, queue, publication, and edge', () => {
    const serialized = JSON.stringify(Template.fromStack(createOperations()).toJSON());

    Template.fromStack(createOperations()).resourceCountIs('AWS::CloudWatch::Dashboard', 1);
    for (const signal of [
      'AWS/ApiGateway',
      'AWS/Lambda',
      'AWS/RDS',
      'AWS/SQS',
      'AWS/States',
      'AWS/CloudFront',
      'mcat-dev-monthly',
    ]) {
      expect(serialized).toContain(signal);
    }
  });

  it('alarms on approved error, latency, capacity, queue, publication, and edge signals', () => {
    const serialized = JSON.stringify(Template.fromStack(createOperations()).toJSON());

    Template.fromStack(createOperations()).resourceCountIs('AWS::CloudWatch::Alarm', 11);
    for (const alarmNameFragment of [
      'api-5xx',
      'api-latency',
      'lambda-errors',
      'lambda-throttles',
      'aurora-capacity',
      'proxy-borrow-latency',
      'dlq-visible',
      'queue-age',
      'publication-failures',
      'cloudfront-5xx',
      'waf-blocked',
    ]) {
      expect(serialized).toContain(alarmNameFragment);
    }
    expect(serialized).not.toContain('OutboxOldestAgeSeconds');
  });

  it('captures all VPC traffic in an encrypted retained CloudWatch log group', () => {
    const template = Template.fromStack(createOperations());

    template.hasResourceProperties('AWS::EC2::FlowLog', {
      LogDestinationType: 'cloud-watch-logs',
      ResourceType: 'VPC',
      TrafficType: 'ALL',
    });
    template.hasResourceProperties('AWS::Logs::LogGroup', {
      KmsKeyId: Match.anyValue(),
      RetentionInDays: 90,
    });
  });

  it('routes every actionable alarm to the encrypted operations email topic', () => {
    const template = Template.fromStack(createOperations());

    template.hasResourceProperties('AWS::SNS::Topic', { KmsMasterKeyId: Match.anyValue() });
    template.hasResourceProperties('AWS::SNS::Subscription', {
      Endpoint: environment.budgetEmail,
      Protocol: 'email',
    });
    for (const alarm of Object.values(template.findResources('AWS::CloudWatch::Alarm'))) {
      expect((alarm.Properties as { AlarmActions?: unknown[] }).AlarmActions).toHaveLength(1);
    }
  });

  it('has no unsuppressed AWS Solutions findings', () => {
    const stack = createOperations();
    const app = stack.node.root as App;
    app.synth();
    const report = new AwsSolutionsChecks(app, { verbose: true }).validateScope(stack);

    expect(report.violations).toEqual([]);
  });
});
