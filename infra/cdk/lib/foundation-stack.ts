import {
  Duration,
  RemovalPolicy,
  Stack,
  Validations,
  type StackProps,
  aws_budgets as budgets,
  aws_ec2 as ec2,
  aws_kms as kms,
} from 'aws-cdk-lib';
import type { Construct } from 'constructs';

import type { EnvironmentConfig } from '../config/environments.js';
import type { FoundationResources } from './interfaces.js';
import { applySandboxPermissionsBoundary } from './permissions-boundary.js';
import { applyRequiredTags } from './tags.js';

export interface FoundationStackProps extends StackProps {
  readonly environment: EnvironmentConfig;
}

const REQUIRED_RESOURCE_TAGS: budgets.CfnBudget.ResourceTagProperty[] = [
  { key: 'Application', value: 'mcat-mastery' },
  { key: 'Environment', value: 'dev' },
  { key: 'ManagedBy', value: 'cdk' },
  { key: 'Owner', value: 'jonathan-thomas' },
  { key: 'DataClassification', value: 'internal' },
];

export class FoundationStack extends Stack {
  public readonly resources: FoundationResources;

  public constructor(scope: Construct, id: string, props: FoundationStackProps) {
    super(scope, id, props);

    applySandboxPermissionsBoundary(this);
    applyRequiredTags(this, 'internal');

    const vpc = new ec2.Vpc(this, 'Vpc', {
      vpcName: 'mcat-dev-vpc',
      ipAddresses: ec2.IpAddresses.cidr('10.42.0.0/16'),
      maxAzs: 2,
      natGateways: 0,
      restrictDefaultSecurityGroup: true,
      subnetConfiguration: [
        {
          name: 'public',
          cidrMask: 24,
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          name: 'isolated',
          cidrMask: 24,
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
      ],
    });
    vpc.addGatewayEndpoint('S3GatewayEndpoint', {
      service: ec2.GatewayVpcEndpointAwsService.S3,
      subnets: [{ subnetType: ec2.SubnetType.PRIVATE_ISOLATED }],
    });

    const appKey = new kms.Key(this, 'ApplicationKey', {
      alias: 'alias/mcat/dev/application',
      description: 'Encrypts MCAT Mastery development application data.',
      enableKeyRotation: true,
      rotationPeriod: Duration.days(365),
      removalPolicy: RemovalPolicy.RETAIN,
    });
    const auditKey = new kms.Key(this, 'AuditKey', {
      alias: 'alias/mcat/dev/audit',
      description: 'Encrypts MCAT Mastery development analytics and audit data.',
      enableKeyRotation: true,
      rotationPeriod: Duration.days(365),
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const budgetName = 'mcat-dev-monthly';
    new budgets.CfnBudget(this, 'MonthlyBudget', {
      budget: {
        budgetLimit: { amount: props.environment.budgetUsd, unit: 'USD' },
        budgetName,
        budgetType: 'COST',
        timeUnit: 'MONTHLY',
      },
      notificationsWithSubscribers: [
        createBudgetNotification(50, 'FORECASTED', props.environment.budgetEmail),
        createBudgetNotification(80, 'FORECASTED', props.environment.budgetEmail),
        createBudgetNotification(100, 'ACTUAL', props.environment.budgetEmail),
      ],
      resourceTags: REQUIRED_RESOURCE_TAGS,
    });

    Validations.of(vpc).acknowledge({
      id: 'AwsSolutions-VPC7',
      reason:
        'VPC flow-log delivery is intentionally owned by the Phase 4C operations stack so log retention, encryption, and alarms are configured together before deployment.',
    });

    this.resources = { vpc, appKey, auditKey, budgetName };
  }
}

function createBudgetNotification(
  threshold: number,
  notificationType: 'ACTUAL' | 'FORECASTED',
  email: string,
): budgets.CfnBudget.NotificationWithSubscribersProperty {
  return {
    notification: {
      comparisonOperator: 'GREATER_THAN',
      notificationType,
      threshold,
      thresholdType: 'PERCENTAGE',
    },
    subscribers: [{ address: email, subscriptionType: 'EMAIL' }],
  };
}
