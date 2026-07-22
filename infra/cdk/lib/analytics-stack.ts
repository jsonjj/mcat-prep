import {
  CfnOutput,
  RemovalPolicy,
  Stack,
  Validations,
  type StackProps,
  aws_athena as athena,
  aws_glue as glue,
  aws_iam as iam,
  aws_kinesisfirehose as firehose,
  aws_logs as logs,
} from 'aws-cdk-lib';
import type { aws_kms as kms, aws_s3 as s3 } from 'aws-cdk-lib';
import type { Construct } from 'constructs';

import type { EnvironmentConfig } from '../config/environments.js';
import { applySandboxPermissionsBoundary } from './permissions-boundary.js';
import { applyRequiredTags } from './tags.js';

export interface AnalyticsStackProps extends StackProps {
  readonly environment: EnvironmentConfig;
  readonly analyticsBucket: s3.IBucket;
  readonly auditKey: kms.IKey;
}

export interface AnalyticsResources {
  readonly deliveryStream: firehose.CfnDeliveryStream;
  readonly database: glue.CfnDatabase;
  readonly table: glue.CfnTable;
  readonly workGroup: athena.CfnWorkGroup;
}

export class AnalyticsStack extends Stack {
  public readonly resources: AnalyticsResources;

  public constructor(scope: Construct, id: string, props: AnalyticsStackProps) {
    super(scope, id, props);

    applySandboxPermissionsBoundary(this);
    applyRequiredTags(this, 'restricted');

    const analyticsBucketArn = `arn:aws:s3:::mcat-dev-analytics-${props.environment.account}-${props.environment.region}`;

    const firehoseLogGroup = new logs.LogGroup(this, 'FirehoseLogGroup', {
      logGroupName: '/aws/kinesisfirehose/mcat-dev-first-party-events',
      encryptionKey: props.auditKey,
      retention: logs.RetentionDays.THREE_MONTHS,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const firehoseLogStream = new logs.LogStream(this, 'FirehoseLogStream', {
      logGroup: firehoseLogGroup,
      logStreamName: 's3-delivery',
    });
    const deliveryRole = new iam.Role(this, 'FirehoseDeliveryRole', {
      roleName: 'mcat-dev-firehose-delivery',
      assumedBy: new iam.ServicePrincipal('firehose.amazonaws.com', {
        conditions: {
          ArnLike: {
            'aws:SourceArn': `arn:aws:firehose:${props.environment.region}:${props.environment.account}:deliverystream/mcat-dev-first-party-events`,
          },
          StringEquals: { 'aws:SourceAccount': props.environment.account },
        },
      }),
      description: 'Writes strict first-party analytics events to the encrypted analytics lake.',
    });
    deliveryRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'ReadAnalyticsBucketMetadata',
        actions: ['s3:GetBucketLocation', 's3:ListBucket', 's3:ListBucketMultipartUploads'],
        resources: [analyticsBucketArn],
      }),
    );
    deliveryRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'WriteAnalyticsPartitions',
        actions: ['s3:AbortMultipartUpload', 's3:GetObject', 's3:PutObject'],
        resources: [`${analyticsBucketArn}/events/*`, `${analyticsBucketArn}/errors/*`],
      }),
    );
    deliveryRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'UseAnalyticsEncryptionKey',
        actions: ['kms:Decrypt', 'kms:DescribeKey', 'kms:Encrypt', 'kms:GenerateDataKey'],
        resources: [props.auditKey.keyArn],
      }),
    );
    deliveryRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'WriteFirehoseDeliveryLogs',
        actions: ['logs:PutLogEvents'],
        resources: [
          `${firehoseLogGroup.logGroupArn}:log-stream:${firehoseLogStream.logStreamName}`,
        ],
      }),
    );
    const firehoseWildcardReason =
      'Firehose creates timestamped object names that are unknowable at synthesis. Wildcard resources are limited to the events/ and errors/ prefixes of the single encrypted analytics bucket; actions and the KMS key remain explicitly scoped.';
    deliveryRole.node
      .findChild('DefaultPolicy')
      .node.findChild('Resource')
      .node.addMetadata(Validations.ACKNOWLEDGED_RULES_METADATA_KEY, {
        ...Object.fromEntries(
          [`${analyticsBucketArn}/events/*`, `${analyticsBucketArn}/errors/*`].map((resource) => [
            `AwsSolutions-IAM5[Resource::${resource}]`,
            firehoseWildcardReason,
          ]),
        ),
      });

    const deliveryStream = new firehose.CfnDeliveryStream(this, 'FirstPartyEventStream', {
      deliveryStreamName: 'mcat-dev-first-party-events',
      deliveryStreamType: 'DirectPut',
      deliveryStreamEncryptionConfigurationInput: {
        keyArn: props.auditKey.keyArn,
        keyType: 'CUSTOMER_MANAGED_CMK',
      },
      extendedS3DestinationConfiguration: {
        bucketArn: props.analyticsBucket.bucketArn,
        roleArn: deliveryRole.roleArn,
        bufferingHints: { intervalInSeconds: 60, sizeInMBs: 5 },
        cloudWatchLoggingOptions: {
          enabled: true,
          logGroupName: firehoseLogGroup.logGroupName,
          logStreamName: firehoseLogStream.logStreamName,
        },
        compressionFormat: 'GZIP',
        encryptionConfiguration: {
          kmsEncryptionConfig: { awskmsKeyArn: props.auditKey.keyArn },
        },
        errorOutputPrefix:
          'errors/result=!{firehose:error-output-type}/year=!{timestamp:yyyy}/month=!{timestamp:MM}/day=!{timestamp:dd}/',
        prefix:
          'events/year=!{timestamp:yyyy}/month=!{timestamp:MM}/day=!{timestamp:dd}/hour=!{timestamp:HH}/',
      },
    });
    deliveryStream.node.addDependency(firehoseLogStream);

    const database = new glue.CfnDatabase(this, 'AnalyticsDatabase', {
      catalogId: props.environment.account,
      databaseInput: {
        name: 'mcat_dev_first_party',
        description: 'Governed first-party MCAT development event catalog.',
        parameters: { classification: 'first-party-analytics' },
      },
    });
    const table = new glue.CfnTable(this, 'AnalyticsEventsTable', {
      catalogId: props.environment.account,
      databaseName: database.ref,
      tableInput: {
        name: 'events_v1',
        description: 'Allowlisted privacy-filtered analytics event envelope, schema version 1.',
        tableType: 'EXTERNAL_TABLE',
        parameters: {
          classification: 'json',
          'projection.enabled': 'true',
          'projection.year.type': 'integer',
          'projection.year.range': '2026,2100',
          'projection.month.type': 'integer',
          'projection.month.range': '1,12',
          'projection.month.digits': '2',
          'projection.day.type': 'integer',
          'projection.day.range': '1,31',
          'projection.day.digits': '2',
          'projection.hour.type': 'integer',
          'projection.hour.range': '0,23',
          'projection.hour.digits': '2',
          'storage.location.template': `${props.analyticsBucket.s3UrlForObject(
            'events',
          )}/year=\${year}/month=\${month}/day=\${day}/hour=\${hour}/`,
        },
        partitionKeys: ['year', 'month', 'day', 'hour'].map((name) => ({
          name,
          type: 'string',
        })),
        storageDescriptor: {
          columns: [
            { name: 'event_id', type: 'string' },
            { name: 'event_name', type: 'string' },
            { name: 'occurred_at', type: 'timestamp' },
            { name: 'environment', type: 'string' },
            { name: 'schema_version', type: 'int' },
            { name: 'pseudonymous_learner_id', type: 'string' },
            { name: 'content_release_id', type: 'string' },
            { name: 'policy_version', type: 'string' },
          ],
          inputFormat: 'org.apache.hadoop.mapred.TextInputFormat',
          outputFormat: 'org.apache.hadoop.hive.ql.io.HiveIgnoreKeyTextOutputFormat',
          location: props.analyticsBucket.s3UrlForObject('events/'),
          serdeInfo: {
            serializationLibrary: 'org.openx.data.jsonserde.JsonSerDe',
            parameters: { 'ignore.malformed.json': 'false' },
          },
        },
      },
    });

    const workGroup = new athena.CfnWorkGroup(this, 'AnalyticsWorkGroup', {
      name: 'mcat-dev-first-party',
      description: 'Cost-bounded queries over allowlisted first-party development events.',
      recursiveDeleteOption: false,
      state: 'ENABLED',
      workGroupConfiguration: {
        bytesScannedCutoffPerQuery: 10_737_418_240,
        enforceWorkGroupConfiguration: true,
        publishCloudWatchMetricsEnabled: true,
        requesterPaysEnabled: false,
        resultConfiguration: {
          outputLocation: props.analyticsBucket.s3UrlForObject('athena-results/'),
          encryptionConfiguration: {
            encryptionOption: 'SSE_KMS',
            kmsKey: props.auditKey.keyArn,
          },
        },
      },
    });

    new CfnOutput(this, 'AnalyticsDeliveryStreamName', {
      value: deliveryStream.ref,
      exportName: 'mcat-dev-analytics-delivery-stream-name',
    });
    new CfnOutput(this, 'AnalyticsGlueDatabaseName', {
      value: database.ref,
      exportName: 'mcat-dev-analytics-glue-database-name',
    });
    new CfnOutput(this, 'AnalyticsAthenaWorkGroupName', {
      value: workGroup.ref,
      exportName: 'mcat-dev-analytics-athena-workgroup-name',
    });

    this.resources = { deliveryStream, database, table, workGroup };
  }
}
