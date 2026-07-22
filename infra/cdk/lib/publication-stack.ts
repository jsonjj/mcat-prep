import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  Validations,
  type StackProps,
  aws_cloudwatch as cloudwatch,
  aws_logs as logs,
  aws_sqs as sqs,
  aws_stepfunctions as sfn,
  aws_stepfunctions_tasks as tasks,
} from 'aws-cdk-lib';
import type { aws_kms as kms, aws_s3 as s3 } from 'aws-cdk-lib';
import type { Construct } from 'constructs';

import type { EnvironmentConfig } from '../config/environments.js';
import { applySandboxPermissionsBoundary } from './permissions-boundary.js';
import { applyRequiredTags } from './tags.js';

export interface PublicationStackProps extends StackProps {
  readonly environment: EnvironmentConfig;
  readonly applicationKey: kms.IKey;
  readonly sourceQuarantine: s3.IBucket;
  readonly protectedContent: s3.IBucket;
  readonly authorizedDelivery: s3.IBucket;
}

export interface PublicationResources {
  readonly stateMachine: sfn.IStateMachine;
  readonly approvalQueue: sqs.IQueue;
}

export class PublicationStack extends Stack {
  public readonly resources: PublicationResources;

  public constructor(scope: Construct, id: string, props: PublicationStackProps) {
    super(scope, id, props);

    applySandboxPermissionsBoundary(this);
    applyRequiredTags(this, 'restricted');

    const quarantineObjectsArn = `arn:aws:s3:::mcat-dev-source-quarantine-${props.environment.account}-${props.environment.region}/*`;

    const approvalDlq = new sqs.Queue(this, 'PublicationApprovalDlq', {
      queueName: 'mcat-dev-publication-approval-dlq',
      encryption: sqs.QueueEncryption.KMS,
      encryptionMasterKey: props.applicationKey,
      enforceSSL: true,
      retentionPeriod: Duration.days(14),
    });
    const approvalQueue = new sqs.Queue(this, 'PublicationApprovalQueue', {
      queueName: 'mcat-dev-publication-approval',
      encryption: sqs.QueueEncryption.KMS,
      encryptionMasterKey: props.applicationKey,
      enforceSSL: true,
      retentionPeriod: Duration.days(4),
      visibilityTimeout: Duration.minutes(5),
      deadLetterQueue: { queue: approvalDlq, maxReceiveCount: 5 },
    });
    new cloudwatch.Alarm(this, 'PublicationApprovalDlqAlarm', {
      alarmName: 'mcat-dev-publication-approval-dlq-visible',
      alarmDescription: 'Messages are waiting in the publication approval dead-letter queue.',
      metric: approvalDlq.metricApproximateNumberOfMessagesVisible({
        period: Duration.minutes(1),
        statistic: 'Maximum',
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    const syntheticRejected = new sfn.Fail(this, 'SyntheticContentRejected', {
      error: 'SyntheticContentRejected',
      cause: 'Synthetic and test-only packages can never enter publication.',
    });
    const validateQuarantineObject = new tasks.CallAwsService(this, 'ValidateQuarantineObject', {
      service: 's3',
      action: 'headObject',
      parameters: {
        Bucket: props.sourceQuarantine.bucketName,
        'Key.$': '$.source.key',
        'VersionId.$': '$.source.versionId',
      },
      iamResources: [quarantineObjectsArn],
      resultPath: '$.quarantineHead',
    });
    const compileCandidate = new sfn.Pass(this, 'CompileCandidateManifest', {
      parameters: {
        'logicalId.$': '$.manifest.logicalId',
        'immutableVersion.$': '$.manifest.immutableVersion',
        'sourceHash.$': '$.manifest.sourceHash',
        protectedCandidateBucket: props.protectedContent.bucketName,
        authorizedDeliveryBucket: props.authorizedDelivery.bucketName,
        activationEnabled: false,
      },
      resultPath: '$.candidate',
    });
    const reviewGate = new tasks.SqsSendMessage(this, 'ReviewGate', {
      queue: approvalQueue,
      integrationPattern: sfn.IntegrationPattern.WAIT_FOR_TASK_TOKEN,
      taskTimeout: sfn.Timeout.duration(Duration.days(7)),
      messageBody: sfn.TaskInput.fromObject({
        taskToken: sfn.JsonPath.taskToken,
        executionArn: sfn.JsonPath.stringAt('$$.Execution.Id'),
        'logicalId.$': '$.candidate.logicalId',
        'immutableVersion.$': '$.candidate.immutableVersion',
        'sourceHash.$': '$.candidate.sourceHash',
      }),
      resultPath: '$.review',
    });
    const reviewRejected = new sfn.Fail(this, 'IndependentReviewRejected', {
      error: 'IndependentReviewRejected',
      cause: 'Publication requires an external, independent approval callback.',
    });
    const dryRun = new sfn.Pass(this, 'DryRunPublication', {
      parameters: {
        status: 'DRY_RUN_ONLY',
        activationEnabled: false,
        'logicalId.$': '$.candidate.logicalId',
        'immutableVersion.$': '$.candidate.immutableVersion',
        'sourceHash.$': '$.candidate.sourceHash',
      },
      resultPath: '$.publication',
    });
    const activationDisabled = new sfn.Fail(this, 'ActivationDisabled', {
      error: 'ActivationDisabled',
      cause:
        'Development content activation is fail-closed until validators, two-person authorization, and atomic pointer promotion are connected and approved.',
    });
    const dryRunComplete = new sfn.Succeed(this, 'PublicationDryRunComplete');

    const activationGate = new sfn.Choice(this, 'ActivationMustRemainDisabled')
      .when(sfn.Condition.booleanEquals('$.activationRequested', true), activationDisabled)
      .otherwise(dryRunComplete);
    dryRun.next(activationGate);
    const approvalDecision = new sfn.Choice(this, 'RequireIndependentApproval')
      .when(sfn.Condition.stringEquals('$.review.decision', 'approved'), dryRun)
      .otherwise(reviewRejected);
    reviewGate.next(approvalDecision);
    compileCandidate.next(reviewGate);
    validateQuarantineObject.next(compileCandidate);
    const definition = new sfn.Choice(this, 'RejectForbiddenInput')
      .when(
        sfn.Condition.or(
          sfn.Condition.stringEquals('$.protectionClass', 'synthetic'),
          sfn.Condition.stringEquals('$.protectionClass', 'test-only'),
        ),
        syntheticRejected,
      )
      .otherwise(validateQuarantineObject);

    const logGroup = new logs.LogGroup(this, 'PublicationWorkflowLogGroup', {
      logGroupName: '/aws/vendedlogs/states/mcat-dev-content-publication',
      encryptionKey: props.applicationKey,
      retention: logs.RetentionDays.THREE_MONTHS,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const stateMachine = new sfn.StateMachine(this, 'PublicationStateMachine', {
      stateMachineName: 'mcat-dev-content-publication',
      stateMachineType: sfn.StateMachineType.STANDARD,
      definitionBody: sfn.DefinitionBody.fromChainable(definition),
      encryptionConfiguration: new sfn.CustomerManagedEncryptionConfiguration(
        props.applicationKey,
        Duration.minutes(5),
      ),
      logs: {
        destination: logGroup,
        includeExecutionData: false,
        level: sfn.LogLevel.ALL,
      },
      tracingEnabled: true,
      timeout: Duration.days(8),
    });
    const stateMachineWildcardReason =
      'The workflow must inspect caller-selected immutable objects under the single quarantine bucket, Step Functions log-delivery APIs require wildcard resources, and the CDK KMS grant uses the AWS-defined GenerateDataKey action family. S3 and KMS resources remain scoped to the supplied quarantine bucket and application key, with no authorized-delivery write grant.';
    stateMachine.role.node
      .findChild('DefaultPolicy')
      .node.findChild('Resource')
      .node.addMetadata(Validations.ACKNOWLEDGED_RULES_METADATA_KEY, {
        [`AwsSolutions-IAM5[Resource::${quarantineObjectsArn}]`]: stateMachineWildcardReason,
        'AwsSolutions-IAM5[Action::kms:GenerateDataKey*]': stateMachineWildcardReason,
        'AwsSolutions-IAM5[Resource::*]': stateMachineWildcardReason,
      });

    Validations.of(approvalDlq).acknowledge({
      id: 'AwsSolutions-SQS3',
      reason:
        'This encrypted queue is itself the terminal dead-letter queue for failed approval-message processing.',
    });
    Validations.of(stateMachine).acknowledge({
      id: 'AwsSolutions-SF1',
      reason:
        'Execution logging is enabled at ALL while execution payload data is deliberately excluded to prevent protected content metadata from entering ordinary logs.',
    });

    new CfnOutput(this, 'PublicationStateMachineArn', {
      value: stateMachine.stateMachineArn,
      exportName: 'mcat-dev-publication-state-machine-arn',
    });
    new CfnOutput(this, 'PublicationApprovalQueueUrl', {
      value: approvalQueue.queueUrl,
      exportName: 'mcat-dev-publication-approval-queue-url',
    });
    new CfnOutput(this, 'PublicationActivationEnabled', {
      value: 'false',
      description: 'Fail-closed activation flag; this stack supports dry runs only.',
    });

    this.resources = { stateMachine, approvalQueue };
  }
}
