import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  type StackProps,
  aws_cloudwatch as cloudwatch,
  aws_ec2 as ec2,
  aws_events as events,
  aws_events_targets as targets,
  aws_kms as kms,
  aws_lambda as lambda,
  aws_lambda_event_sources as eventSources,
  aws_lambda_nodejs as nodejs,
  aws_logs as logs,
  aws_sqs as sqs,
} from 'aws-cdk-lib';
import type { Construct } from 'constructs';

import type { EnvironmentConfig } from '../config/environments.js';
import type { AsyncResources, DataResources, FoundationResources } from './interfaces.js';
import { acknowledgeCdkNagFinding } from './nag.js';
import { applySandboxPermissionsBoundary } from './permissions-boundary.js';
import { applyRequiredTags } from './tags.js';

export interface WorkerRuntimeEntries {
  readonly outboxPublisher: {
    readonly entry: string;
    readonly handler: string;
  };
  readonly projectionConsumer: {
    readonly entry: string;
    readonly handler: string;
  };
}

export interface AsyncStackProps extends StackProps {
  readonly environment: EnvironmentConfig;
  readonly foundation: FoundationResources;
  readonly data: DataResources;
  readonly runtimeEntries: WorkerRuntimeEntries;
}

export class AsyncStack extends Stack {
  public readonly resources: AsyncResources;

  public constructor(scope: Construct, id: string, props: AsyncStackProps) {
    super(scope, id, props);

    applySandboxPermissionsBoundary(this);
    applyRequiredTags(this, 'restricted');

    const workerSecurityGroup = new ec2.SecurityGroup(this, 'WorkerSecurityGroup', {
      vpc: props.foundation.vpc,
      allowAllOutbound: false,
      description: 'Allows projection workers to reach only the TLS-only RDS Proxy.',
      securityGroupName: 'mcat-dev-workers',
    });
    workerSecurityGroup.addEgressRule(
      props.data.proxySecurityGroup,
      ec2.Port.tcp(5432),
      'Connect to the TLS-only RDS Proxy.',
    );
    workerSecurityGroup.addEgressRule(
      props.foundation.serviceEndpointSecurityGroup,
      ec2.Port.tcp(443),
      'Call Secrets Manager, SQS, and X-Ray through private VPC endpoints.',
    );
    new ec2.CfnSecurityGroupIngress(this, 'EndpointIngressFromWorkers', {
      groupId: props.foundation.serviceEndpointSecurityGroup.securityGroupId,
      sourceSecurityGroupId: workerSecurityGroup.securityGroupId,
      ipProtocol: 'tcp',
      fromPort: 443,
      toPort: 443,
      description: 'Allow only the async worker Lambdas to call approved AWS services.',
    });
    new ec2.CfnSecurityGroupIngress(this, 'ProxyIngressFromWorkers', {
      groupId: props.data.proxySecurityGroup.securityGroupId,
      sourceSecurityGroupId: workerSecurityGroup.securityGroupId,
      ipProtocol: 'tcp',
      fromPort: 5432,
      toPort: 5432,
      description: 'Allow PostgreSQL only from the async worker security group.',
    });

    const commonEnvironment = {
      DB_NAME: 'mcat',
      DB_PROXY_ENDPOINT: props.data.proxy.endpoint,
      DB_SECRET_ARN: props.data.workersDbSecret.secretArn,
      NODE_EXTRA_CA_CERTS: '/var/runtime/ca-cert.pem',
      NODE_OPTIONS: '--enable-source-maps',
      PROJECTION_QUEUE_URL: props.data.projectionQueue.queueUrl,
    } as const;
    const outboxLogGroup = new logs.LogGroup(this, 'OutboxPublisherLogGroup', {
      logGroupName: '/aws/lambda/mcat-dev-outbox-publisher',
      retention: logs.RetentionDays.THREE_MONTHS,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const outboxPublisher = new nodejs.NodejsFunction(this, 'OutboxPublisherFunction', {
      functionName: 'mcat-dev-outbox-publisher',
      description: 'Claims transactional outbox rows and publishes ordered projection messages.',
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      entry: props.runtimeEntries.outboxPublisher.entry,
      handler: props.runtimeEntries.outboxPublisher.handler,
      logGroup: outboxLogGroup,
      memorySize: 512,
      timeout: Duration.seconds(30),
      reservedConcurrentExecutions: 1,
      tracing: lambda.Tracing.ACTIVE,
      vpc: props.foundation.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [workerSecurityGroup],
      environment: {
        ...commonEnvironment,
      },
      bundling: { target: 'node22', minify: true, sourceMap: false },
    });
    const projectionLogGroup = new logs.LogGroup(this, 'ProjectionConsumerLogGroup', {
      logGroupName: '/aws/lambda/mcat-dev-projection-consumer',
      retention: logs.RetentionDays.THREE_MONTHS,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const projectionConsumer = new nodejs.NodejsFunction(this, 'ProjectionConsumerFunction', {
      functionName: 'mcat-dev-projection-consumer',
      description: 'Consumes ordered learner events and updates authoritative projections.',
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      entry: props.runtimeEntries.projectionConsumer.entry,
      handler: props.runtimeEntries.projectionConsumer.handler,
      logGroup: projectionLogGroup,
      memorySize: 1024,
      timeout: Duration.seconds(60),
      reservedConcurrentExecutions: 4,
      tracing: lambda.Tracing.ACTIVE,
      vpc: props.foundation.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [workerSecurityGroup],
      environment: {
        ...commonEnvironment,
      },
      bundling: { target: 'node22', minify: true, sourceMap: false },
    });

    props.data.workersDbSecret.grantRead(outboxPublisher);
    props.data.workersDbSecret.grantRead(projectionConsumer);
    const appKey = kms.Key.fromKeyArn(
      this,
      'ApplicationKeyReference',
      props.foundation.appKey.keyArn,
    );
    appKey.grantDecrypt(outboxPublisher);
    appKey.grantDecrypt(projectionConsumer);
    props.data.projectionQueue.grantSendMessages(outboxPublisher);
    projectionConsumer.addEventSource(
      new eventSources.SqsEventSource(props.data.projectionQueue, {
        batchSize: 10,
        maxConcurrency: 4,
        reportBatchItemFailures: true,
      }),
    );

    const outboxSchedule = new events.Rule(this, 'OutboxSchedule', {
      ruleName: 'mcat-dev-outbox-schedule',
      description: 'Poll the transactional outbox once per minute.',
      enabled: true,
      schedule: events.Schedule.rate(Duration.minutes(1)),
    });
    const outboxScheduleDlq = new sqs.Queue(this, 'OutboxScheduleDlq', {
      queueName: 'mcat-dev-outbox-schedule-dlq',
      encryption: sqs.QueueEncryption.KMS,
      encryptionMasterKey: appKey,
      enforceSSL: true,
      retentionPeriod: Duration.days(14),
    });
    outboxSchedule.addTarget(
      new targets.LambdaFunction(outboxPublisher, {
        deadLetterQueue: outboxScheduleDlq,
        maxEventAge: Duration.hours(1),
        retryAttempts: 2,
      }),
    );

    const dlqs: readonly sqs.IQueue[] = [
      props.data.projectionDlq,
      props.data.asyncDlqs.analytics,
      props.data.asyncDlqs.publication,
      props.data.asyncDlqs.privacy,
      props.data.asyncDlqs.notifications,
      outboxScheduleDlq,
    ];
    for (const [index, dlq] of dlqs.entries()) {
      new cloudwatch.Alarm(this, `DeadLetterQueueAlarm${index + 1}`, {
        alarmName: `mcat-dev-${dlq.node.id.toLowerCase()}-visible`,
        alarmDescription: `Messages are waiting in ${dlq.queueName}.`,
        metric: dlq.metricApproximateNumberOfMessagesVisible({
          period: Duration.minutes(1),
          statistic: 'Maximum',
        }),
        threshold: 1,
        evaluationPeriods: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });
    }

    for (const handler of [outboxPublisher, projectionConsumer]) {
      acknowledgeCdkNagFinding(
        handler,
        'AwsSolutions-L1',
        'The function uses the current project-standard Node.js 22 managed runtime.',
      );
      acknowledgeCdkNagFinding(
        handler,
        'AwsSolutions-IAM4[Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole]',
        'The CDK-managed Lambda role uses the AWS basic execution policy only for writes to its function-owned, 30-day log group.',
      );
      acknowledgeCdkNagFinding(
        handler,
        'AwsSolutions-IAM4[Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole]',
        'The CDK-managed Lambda VPC policy provides only the ENI lifecycle permissions required for isolated-subnet execution.',
      );
      acknowledgeCdkNagFinding(
        handler,
        'AwsSolutions-IAM5[Resource::*]',
        'AWS X-Ray and EC2 network-interface lifecycle actions require wildcard resources; all queue, secret, and KMS grants remain resource-scoped.',
      );
    }
    acknowledgeCdkNagFinding(
      outboxPublisher,
      'AwsSolutions-IAM5[Action::kms:ReEncrypt*]',
      'The CDK SQS KMS grant uses the AWS-defined ReEncrypt action family on only the projection queue encryption key.',
    );
    acknowledgeCdkNagFinding(
      outboxPublisher,
      'AwsSolutions-IAM5[Action::kms:GenerateDataKey*]',
      'The CDK SQS KMS grant uses the AWS-defined GenerateDataKey action family on only the projection queue encryption key.',
    );
    acknowledgeCdkNagFinding(
      outboxScheduleDlq,
      'AwsSolutions-SQS3',
      'This encrypted queue is itself the EventBridge target dead-letter queue; cdk-nag does not infer that relationship from the generated queue resource policy.',
    );

    new CfnOutput(this, 'OutboxPublisherFunctionName', {
      value: outboxPublisher.functionName,
      exportName: 'mcat-dev-outbox-publisher-function-name',
    });
    new CfnOutput(this, 'ProjectionConsumerFunctionName', {
      value: projectionConsumer.functionName,
      exportName: 'mcat-dev-projection-consumer-function-name',
    });

    this.resources = { outboxPublisher, projectionConsumer };
  }
}
