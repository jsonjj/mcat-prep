import {
  CfnOutput,
  Duration,
  Lazy,
  RemovalPolicy,
  Size,
  Stack,
  Validations,
  type StackProps,
  aws_apigateway as apigateway,
  aws_ec2 as ec2,
  aws_lambda as lambda,
  aws_lambda_nodejs as nodejs,
  aws_logs as logs,
  aws_kms as kms,
  aws_wafv2 as wafv2,
} from 'aws-cdk-lib';
import type { Construct } from 'constructs';

import type { EnvironmentConfig } from '../config/environments.js';
import type { ApiResources, DataResources, FoundationResources } from './interfaces.js';
import { acknowledgeCdkNagFinding } from './nag.js';
import { applySandboxPermissionsBoundary } from './permissions-boundary.js';
import { applyRequiredTags } from './tags.js';
import { createWebDelivery, type WebResources } from './web-stack.js';

export interface ApiStackProps extends StackProps {
  readonly environment: EnvironmentConfig;
  readonly foundation: FoundationResources;
  readonly data: DataResources;
  readonly web: WebResources;
  readonly learnerRuntimeEntry: string;
}

export class ApiStack extends Stack {
  public readonly resources: ApiResources;

  public constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    applySandboxPermissionsBoundary(this);
    applyRequiredTags(this, 'restricted');

    const lambdaSecurityGroup = new ec2.SecurityGroup(this, 'LearnerApiSecurityGroup', {
      vpc: props.foundation.vpc,
      allowAllOutbound: false,
      description: 'Allows the learner API Lambda to reach only approved private services.',
      securityGroupName: 'mcat-dev-learner-api',
    });
    lambdaSecurityGroup.addEgressRule(
      props.data.proxySecurityGroup,
      ec2.Port.tcp(5432),
      'Connect to the TLS-only RDS Proxy.',
    );
    new ec2.CfnSecurityGroupIngress(this, 'ProxyIngressFromLearnerApi', {
      groupId: props.data.proxySecurityGroup.securityGroupId,
      sourceSecurityGroupId: lambdaSecurityGroup.securityGroupId,
      ipProtocol: 'tcp',
      fromPort: 5432,
      toPort: 5432,
      description: 'Allow PostgreSQL only from the learner API Lambda security group.',
    });

    const endpointSecurityGroup = props.foundation.serviceEndpointSecurityGroup;
    lambdaSecurityGroup.addEgressRule(
      endpointSecurityGroup,
      ec2.Port.tcp(443),
      'Call approved AWS services through private VPC endpoints.',
    );
    new ec2.CfnSecurityGroupIngress(this, 'EndpointIngressFromLearnerApi', {
      groupId: endpointSecurityGroup.securityGroupId,
      sourceSecurityGroupId: lambdaSecurityGroup.securityGroupId,
      ipProtocol: 'tcp',
      fromPort: 443,
      toPort: 443,
      description: 'Allow only the learner API Lambda to call approved AWS services.',
    });

    const learnerLogGroup = new logs.LogGroup(this, 'LearnerApiLogGroup', {
      logGroupName: '/aws/lambda/mcat-dev-learner-api',
      retention: logs.RetentionDays.THREE_MONTHS,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const originVerificationValue = props.data.originVerificationSecret.secretValue.unsafeUnwrap();
    const deliveryReference: { learnerOrigin?: string } = {};
    const learnerHandler = new nodejs.NodejsFunction(this, 'LearnerApiFunction', {
      functionName: 'mcat-dev-learner-api',
      description: 'Authoritative MCAT learner command and projection API.',
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      entry: props.learnerRuntimeEntry,
      handler: 'handler',
      logGroup: learnerLogGroup,
      memorySize: 1024,
      timeout: Duration.seconds(29),
      reservedConcurrentExecutions: 20,
      tracing: lambda.Tracing.ACTIVE,
      vpc: props.foundation.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [lambdaSecurityGroup],
      environment: {
        DB_NAME: 'mcat',
        DB_PROXY_ENDPOINT: props.data.proxy.endpoint,
        DB_SECRET_ARN: props.data.learnerApiDbSecret.secretArn,
        ORIGIN_VERIFICATION_SECRET_ARN: props.data.originVerificationSecret.secretArn,
        RATE_LIMIT_PEPPER_SECRET_ARN: props.data.rateLimitPepperSecret.secretArn,
        LEARNER_WEB_ORIGIN: Lazy.string({
          produce: () => {
            if (deliveryReference.learnerOrigin === undefined) {
              throw new Error('Learner web delivery is unresolved.');
            }
            return deliveryReference.learnerOrigin;
          },
        }),
        NODE_EXTRA_CA_CERTS: '/var/runtime/ca-cert.pem',
        NODE_OPTIONS: '--enable-source-maps',
      },
      bundling: {
        target: 'node22',
        minify: true,
        sourceMap: false,
      },
    });
    props.data.learnerApiDbSecret.grantRead(learnerHandler);
    props.data.rateLimitPepperSecret.grantRead(learnerHandler);
    props.data.originVerificationSecret.grantRead(learnerHandler);
    const appKey = kms.Key.fromKeyArn(
      this,
      'ApplicationKeyReference',
      props.foundation.appKey.keyArn,
    );
    appKey.grantDecrypt(learnerHandler);

    const accessLogGroup = new logs.LogGroup(this, 'ApiAccessLogGroup', {
      logGroupName: '/aws/apigateway/mcat-dev-learner-api-access',
      retention: logs.RetentionDays.THREE_MONTHS,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const restApi = new apigateway.RestApi(this, 'LearnerRestApi', {
      restApiName: 'mcat-dev-learner-api',
      description: 'Versioned MCAT Mastery learner REST API.',
      endpointTypes: [apigateway.EndpointType.REGIONAL],
      minCompressionSize: Size.kibibytes(1),
      cloudWatchRole: true,
      deployOptions: {
        stageName: 'dev',
        accessLogDestination: new apigateway.LogGroupLogDestination(accessLogGroup),
        accessLogFormat: apigateway.AccessLogFormat.custom(
          '{"requestId":"$context.requestId","extendedRequestId":"$context.extendedRequestId","method":"$context.httpMethod","path":"$context.resourcePath","status":"$context.status","latency":"$context.responseLatency"}',
        ),
        dataTraceEnabled: false,
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        metricsEnabled: true,
        throttlingBurstLimit: 100,
        throttlingRateLimit: 50,
        tracingEnabled: true,
      },
    });
    const v1 = restApi.root.addResource('v1');
    v1.addProxy({
      anyMethod: true,
      defaultIntegration: new apigateway.LambdaIntegration(learnerHandler, {
        allowTestInvoke: false,
        proxy: true,
      }),
    });
    const apiWebAcl = new wafv2.CfnWebACL(this, 'ApiWebAcl', {
      name: 'mcat-dev-api',
      description:
        'Managed request filtering for the API origin, client-IP throttling runs at CloudFront.',
      scope: 'REGIONAL',
      defaultAction: { allow: {} },
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: 'mcat-dev-api-waf',
        sampledRequestsEnabled: false,
      },
      rules: [
        {
          name: 'RequireCloudFrontOriginVerification',
          priority: 0,
          action: { block: {} },
          statement: {
            notStatement: {
              statement: {
                byteMatchStatement: {
                  fieldToMatch: {
                    singleHeader: { Name: 'x-mcat-origin-verify' },
                  },
                  positionalConstraint: 'EXACTLY',
                  searchString: originVerificationValue,
                  textTransformations: [{ priority: 0, type: 'NONE' }],
                },
              },
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'mcat-dev-api-origin-verification',
            sampledRequestsEnabled: false,
          },
        },
        managedRule('AWSManagedCommonRuleSet', 'AWSManagedRulesCommonRuleSet', 10),
        managedRule('AWSManagedKnownBadInputsRuleSet', 'AWSManagedRulesKnownBadInputsRuleSet', 20),
      ],
    });
    new wafv2.CfnWebACLAssociation(this, 'ApiWebAclAssociation', {
      resourceArn: restApi.deploymentStage.stageArn,
      webAclArn: apiWebAcl.attrArn,
    });
    const delivery = createWebDelivery(this, {
      restApi,
      apiStageName: 'dev',
      originVerificationHeaderValue: originVerificationValue,
      web: props.web,
    });
    deliveryReference.learnerOrigin = delivery.learnerOrigin;
    for (const [constructId, responseType] of [
      ['Default4xxNoStore', apigateway.ResponseType.DEFAULT_4XX],
      ['Default5xxNoStore', apigateway.ResponseType.DEFAULT_5XX],
    ] as const) {
      new apigateway.GatewayResponse(this, constructId, {
        restApi,
        type: responseType,
        responseHeaders: {
          'Cache-Control': "'no-store'",
          Pragma: "'no-cache'",
          'X-Content-Type-Options': "'nosniff'",
        },
      });
    }

    const apiUrl = restApi.url;
    new CfnOutput(this, 'LearnerApiUrl', {
      value: apiUrl,
      exportName: 'mcat-dev-learner-api-url',
    });
    new CfnOutput(this, 'LearnerApiFunctionName', {
      value: learnerHandler.functionName,
      exportName: 'mcat-dev-learner-api-function-name',
    });
    new CfnOutput(this, 'ApiWebAclArn', {
      value: apiWebAcl.attrArn,
      exportName: 'mcat-dev-api-web-acl-arn',
    });
    new CfnOutput(this, 'LearnerWebUrl', {
      value: delivery.learnerOrigin,
      exportName: 'mcat-dev-learner-web-origin',
    });
    new CfnOutput(this, 'AdminWebUrl', {
      value: delivery.adminOrigin,
      exportName: 'mcat-dev-admin-web-origin',
    });
    new CfnOutput(this, 'LearnerDistributionId', {
      value: delivery.learnerDistribution.distributionId,
      exportName: 'mcat-dev-learner-web-distribution-id',
    });
    new CfnOutput(this, 'AdminDistributionId', {
      value: delivery.adminDistribution.distributionId,
      exportName: 'mcat-dev-admin-web-distribution-id',
    });

    Validations.of(restApi).acknowledge(
      {
        id: 'AwsSolutions-APIG2',
        reason:
          'The Lambda runtime applies versioned Zod validation, strict content types, and a 64 KiB body ceiling before command dispatch; generic API Gateway models cannot represent the route-specific unions.',
      },
      {
        id: 'AwsSolutions-APIG4',
        reason:
          'Guest and linked learner sessions are authorized in the runtime using opaque rotating HttpOnly sessions and ownership-derived principals; staff APIs use a separate future authorizer.',
      },
      {
        id: 'AwsSolutions-COG4',
        reason:
          'This learner API intentionally supports secure guest sessions before account linking and therefore cannot require a Cognito authorizer on every method.',
      },
    );
    Validations.of(learnerHandler).acknowledge({
      id: 'AwsSolutions-L1',
      reason: 'The function uses the current project-standard Node.js 22 managed runtime.',
    });
    acknowledgeCdkNagFinding(
      learnerHandler,
      'AwsSolutions-IAM4[Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole]',
      'The CDK-managed Lambda role uses the AWS basic execution policy only for writes to the function-owned, 30-day log group.',
    );
    acknowledgeCdkNagFinding(
      learnerHandler,
      'AwsSolutions-IAM4[Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole]',
      'The CDK-managed Lambda VPC policy provides only the ENI lifecycle permissions required for isolated-subnet execution.',
    );
    acknowledgeCdkNagFinding(
      learnerHandler,
      'AwsSolutions-IAM5[Resource::*]',
      'AWS X-Ray PutTraceSegments and PutTelemetryRecords do not support resource-level permissions; all database secret and KMS grants remain resource-scoped.',
    );
    acknowledgeCdkNagFinding(
      restApi,
      'AwsSolutions-IAM4[Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AmazonAPIGatewayPushToCloudWatchLogs]',
      'API Gateway requires its service-managed log-delivery policy for execution logging; the generated role has the mandatory sandbox permissions boundary.',
    );

    this.resources = {
      restApi,
      learnerHandler,
      serviceEndpointSecurityGroup: endpointSecurityGroup,
      apiUrl,
      learnerDistribution: delivery.learnerDistribution,
      adminDistribution: delivery.adminDistribution,
      learnerOrigin: delivery.learnerOrigin,
      adminOrigin: delivery.adminOrigin,
    };
  }
}

function managedRule(
  name: string,
  managedRuleGroupName: string,
  priority: number,
): wafv2.CfnWebACL.RuleProperty {
  return {
    name,
    priority,
    overrideAction: { none: {} },
    statement: {
      managedRuleGroupStatement: { name: managedRuleGroupName, vendorName: 'AWS' },
    },
    visibilityConfig: {
      cloudWatchMetricsEnabled: true,
      metricName: `mcat-dev-${name.toLowerCase()}`,
      sampledRequestsEnabled: false,
    },
  };
}
