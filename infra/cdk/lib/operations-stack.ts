import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  type StackProps,
  aws_cloudwatch as cloudwatch,
  aws_cloudwatch_actions as cloudwatchActions,
  aws_ec2 as ec2,
  aws_logs as logs,
  aws_sns as sns,
  aws_sns_subscriptions as subscriptions,
} from 'aws-cdk-lib';
import type {
  aws_apigateway as apigateway,
  aws_cloudfront as cloudfront,
  aws_kms as kms,
  aws_lambda as lambda,
  aws_rds as rds,
  aws_sqs as sqs,
  aws_stepfunctions as sfn,
} from 'aws-cdk-lib';
import type { Construct } from 'constructs';

import type { EnvironmentConfig } from '../config/environments.js';
import { applySandboxPermissionsBoundary } from './permissions-boundary.js';
import { applyRequiredTags } from './tags.js';

export interface OperationsStackProps extends StackProps {
  readonly environment: EnvironmentConfig;
  readonly vpc: ec2.IVpc;
  readonly auditKey: kms.IKey;
  readonly restApi: apigateway.IRestApi;
  readonly functions: readonly lambda.IFunction[];
  readonly cluster: rds.IDatabaseCluster;
  readonly proxy: rds.IDatabaseProxy;
  readonly dlqs: readonly sqs.IQueue[];
  readonly publicationStateMachine: sfn.IStateMachine;
  readonly distributions: readonly cloudfront.IDistribution[];
  readonly budgetName: string;
}

export interface OperationsResources {
  readonly dashboard: cloudwatch.Dashboard;
  readonly alarms: readonly cloudwatch.Alarm[];
  readonly notificationTopic: sns.ITopic;
}

export class OperationsStack extends Stack {
  public readonly resources: OperationsResources;

  public constructor(scope: Construct, id: string, props: OperationsStackProps) {
    super(scope, id, props);

    if (props.functions.length === 0) throw new Error('At least one monitored Lambda is required.');
    if (props.dlqs.length === 0) throw new Error('At least one monitored DLQ is required.');
    if (props.distributions.length === 0) {
      throw new Error('At least one monitored CloudFront distribution is required.');
    }
    applySandboxPermissionsBoundary(this);
    applyRequiredTags(this, 'internal');

    const flowLogGroup = new logs.LogGroup(this, 'VpcFlowLogGroup', {
      logGroupName: '/aws/vpc/mcat-dev-flow-logs',
      encryptionKey: props.auditKey,
      retention: logs.RetentionDays.THREE_MONTHS,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    new ec2.FlowLog(this, 'VpcFlowLog', {
      resourceType: ec2.FlowLogResourceType.fromVpc(props.vpc),
      destination: ec2.FlowLogDestination.toCloudWatchLogs(flowLogGroup),
      trafficType: ec2.FlowLogTrafficType.ALL,
      maxAggregationInterval: ec2.FlowLogMaxAggregationInterval.ONE_MINUTE,
    });

    const notificationTopic = new sns.Topic(this, 'OperationsNotificationTopic', {
      topicName: 'mcat-dev-operations-alerts',
      displayName: 'MCAT development operations alerts',
      enforceSSL: true,
      masterKey: props.auditKey,
    });
    notificationTopic.addSubscription(
      new subscriptions.EmailSubscription(props.environment.budgetEmail),
    );

    const apiMetricDimensions = {
      ApiName: props.restApi.restApiName,
      Stage: props.restApi.deploymentStage.stageName,
    };
    const api5xx = new cloudwatch.Metric({
      namespace: 'AWS/ApiGateway',
      metricName: '5XXError',
      dimensionsMap: apiMetricDimensions,
      period: Duration.minutes(1),
      statistic: 'Sum',
    });
    const apiLatency = new cloudwatch.Metric({
      namespace: 'AWS/ApiGateway',
      metricName: 'Latency',
      dimensionsMap: apiMetricDimensions,
      period: Duration.minutes(1),
      statistic: 'p95',
    });
    const auroraCapacity = new cloudwatch.Metric({
      namespace: 'AWS/RDS',
      metricName: 'ServerlessDatabaseCapacity',
      dimensionsMap: { DBClusterIdentifier: props.cluster.clusterIdentifier },
      period: Duration.minutes(1),
      statistic: 'Maximum',
    });
    const proxyBorrowLatency = new cloudwatch.Metric({
      namespace: 'AWS/RDS',
      metricName: 'DatabaseConnectionsBorrowLatency',
      dimensionsMap: { DBProxyName: props.proxy.dbProxyName },
      period: Duration.minutes(1),
      statistic: 'p95',
    });
    const publicationFailures = props.publicationStateMachine.metricFailed({
      period: Duration.minutes(5),
      statistic: 'Sum',
    });
    const wafBlocked = new cloudwatch.Metric({
      namespace: 'AWS/WAFV2',
      metricName: 'BlockedRequests',
      dimensionsMap: {
        Region: props.environment.region,
        Rule: 'ALL',
        WebACL: 'mcat-dev-api',
      },
      period: Duration.minutes(5),
      statistic: 'Sum',
    });

    const alarms: cloudwatch.Alarm[] = [
      createAlarm(this, 'Api5xxAlarm', 'mcat-dev-api-5xx', api5xx, 1, 1),
      createAlarm(this, 'ApiLatencyAlarm', 'mcat-dev-api-latency-p95', apiLatency, 500, 3),
    ];
    for (const [index, handler] of props.functions.entries()) {
      alarms.push(
        createAlarm(
          this,
          `LambdaErrorsAlarm${index + 1}`,
          `mcat-dev-lambda-errors-${index + 1}`,
          handler.metricErrors({ period: Duration.minutes(1), statistic: 'Sum' }),
          1,
          1,
        ),
        createAlarm(
          this,
          `LambdaThrottlesAlarm${index + 1}`,
          `mcat-dev-lambda-throttles-${index + 1}`,
          handler.metricThrottles({ period: Duration.minutes(1), statistic: 'Sum' }),
          1,
          1,
        ),
      );
    }
    alarms.push(
      createAlarm(this, 'AuroraCapacityAlarm', 'mcat-dev-aurora-capacity', auroraCapacity, 1.8, 5),
      createAlarm(
        this,
        'ProxyBorrowLatencyAlarm',
        'mcat-dev-proxy-borrow-latency',
        proxyBorrowLatency,
        500,
        3,
      ),
    );
    for (const [index, dlq] of props.dlqs.entries()) {
      alarms.push(
        createAlarm(
          this,
          `DlqVisibleAlarm${index + 1}`,
          `mcat-dev-dlq-visible-${index + 1}`,
          dlq.metricApproximateNumberOfMessagesVisible({
            period: Duration.minutes(1),
            statistic: 'Maximum',
          }),
          1,
          1,
        ),
        createAlarm(
          this,
          `QueueAgeAlarm${index + 1}`,
          `mcat-dev-queue-age-${index + 1}`,
          dlq.metricApproximateAgeOfOldestMessage({
            period: Duration.minutes(1),
            statistic: 'Maximum',
          }),
          300,
          2,
        ),
      );
    }
    alarms.push(
      createAlarm(
        this,
        'PublicationFailuresAlarm',
        'mcat-dev-publication-failures',
        publicationFailures,
        1,
        1,
      ),
    );
    for (const [index, distribution] of props.distributions.entries()) {
      alarms.push(
        createAlarm(
          this,
          `CloudFront5xxAlarm${index + 1}`,
          `mcat-dev-cloudfront-5xx-${index + 1}`,
          cloudFront5xxMetric(distribution, {
            period: Duration.minutes(5),
            statistic: 'Average',
          }),
          1,
          2,
        ),
      );
    }
    alarms.push(createAlarm(this, 'WafBlockedAlarm', 'mcat-dev-waf-blocked', wafBlocked, 50, 1));
    const notificationAction = new cloudwatchActions.SnsAction(notificationTopic);
    for (const alarm of alarms) alarm.addAlarmAction(notificationAction);

    const dashboard = new cloudwatch.Dashboard(this, 'OperationsDashboard', {
      dashboardName: 'mcat-dev-operations',
      defaultInterval: Duration.hours(6),
    });
    dashboard.addWidgets(
      new cloudwatch.TextWidget({
        width: 24,
        height: 2,
        markdown: `# MCAT development operations\nAWS Budget: **${props.budgetName}** (50%/80% forecast, 100% actual notifications).`,
      }),
      new cloudwatch.GraphWidget({
        title: 'AWS/ApiGateway errors and p95 latency',
        left: [api5xx],
        right: [apiLatency],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'AWS/Lambda errors and throttles',
        left: props.functions.map((handler) => handler.metricErrors()),
        right: props.functions.map((handler) => handler.metricThrottles()),
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'AWS/RDS Aurora capacity and proxy borrow latency',
        left: [auroraCapacity],
        right: [proxyBorrowLatency],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'AWS/SQS DLQ visibility and age',
        left: props.dlqs.map((queue) => queue.metricApproximateNumberOfMessagesVisible()),
        right: props.dlqs.map((queue) => queue.metricApproximateAgeOfOldestMessage()),
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'AWS/States publication failures',
        left: [publicationFailures],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'AWS/CloudFront 5xx and AWS/WAFV2 blocks',
        left: props.distributions.map((distribution) => cloudFront5xxMetric(distribution)),
        right: [wafBlocked],
        width: 12,
      }),
    );

    new CfnOutput(this, 'OperationsDashboardName', {
      value: dashboard.dashboardName,
      exportName: 'mcat-dev-operations-dashboard-name',
    });
    new CfnOutput(this, 'OperationsNotificationTopicArn', {
      value: notificationTopic.topicArn,
      exportName: 'mcat-dev-operations-notification-topic-arn',
    });

    this.resources = { dashboard, alarms, notificationTopic };
  }
}

function createAlarm(
  scope: Construct,
  id: string,
  alarmName: string,
  metric: cloudwatch.IMetric,
  threshold: number,
  evaluationPeriods: number,
): cloudwatch.Alarm {
  return new cloudwatch.Alarm(scope, id, {
    alarmName,
    alarmDescription: `${alarmName} exceeded its reviewed development threshold.`,
    metric,
    threshold,
    evaluationPeriods,
    datapointsToAlarm: evaluationPeriods,
    comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
    treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
  });
}

function cloudFront5xxMetric(
  distribution: cloudfront.IDistribution,
  options: cloudwatch.MetricOptions = {},
): cloudwatch.Metric {
  return new cloudwatch.Metric({
    namespace: 'AWS/CloudFront',
    metricName: '5xxErrorRate',
    dimensionsMap: { DistributionId: distribution.distributionId, Region: 'Global' },
    period: Duration.minutes(5),
    statistic: 'Average',
    ...options,
  });
}
