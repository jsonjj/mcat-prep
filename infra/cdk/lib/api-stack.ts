import { fileURLToPath } from 'node:url';

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
  aws_iam as iam,
  aws_lambda as lambda,
  aws_lambda_nodejs as nodejs,
  aws_logs as logs,
  aws_kms as kms,
  aws_secretsmanager as secretsmanager,
  aws_wafv2 as wafv2,
} from 'aws-cdk-lib';
import type { Construct } from 'constructs';

// The vendored lesson catalog the learner runtime reads through its one content
// seam. It is copied INTO the learner Lambda bundle (see the function's
// `commandHooks` below) and located at runtime via the `LESSON_CONTENT_ROOT`
// environment variable, because the runtime resolves several lessons EAGERLY at
// module load (e.g. the L1 vector lesson's definition hash and authored
// bindings) — an empty catalog would crash the handler on load, not merely serve
// empty lessons.
const LEARNER_CONTENT_LESSONS_DIRECTORY = fileURLToPath(
  new URL('../../../content/lessons', import.meta.url),
);
const LAMBDA_CONTENT_LESSONS_PATH = '/var/task/content/lessons';

import type { EnvironmentConfig } from '../config/environments.js';
import {
  LEARNER_SUPABASE_SECRET_NAME,
  learnerSupabaseSecretArnPattern,
} from './supabase-config.js';
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
    // Outbound HTTPS to the internet (via the foundation NAT gateway) so the
    // in-process AI routes (/v1/ai/rewrite, /v1/ai/chat) can reach the external
    // provider. Egress is capped at 443; the provider is fronted by a CDN with
    // rotating public IPs, so it cannot be pinned to a narrower CIDR. Database
    // egress stays restricted to the RDS Proxy security group (5432) above.
    lambdaSecurityGroup.addEgressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      'HTTPS egress to the external AI provider through the NAT gateway.',
    );

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
      // Runs in the PRIVATE_WITH_EGRESS tier so it reaches the external AI
      // provider over the NAT gateway. It still reaches the RDS Proxy, the
      // Secrets Manager / SQS / X-Ray interface endpoints (private DNS resolves
      // them VPC-wide, reached over the local route + the security-group rules
      // above), so no isolated-tier access is lost by the move.
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSecurityGroup],
      environment: {
        DB_NAME: 'mcat',
        DB_PROXY_ENDPOINT: props.data.proxy.endpoint,
        DB_SECRET_ARN: props.data.learnerApiDbSecret.secretArn,
        ORIGIN_VERIFICATION_SECRET_ARN: props.data.originVerificationSecret.secretArn,
        RATE_LIMIT_PEPPER_SECRET_ARN: props.data.rateLimitPepperSecret.secretArn,
        SUPABASE_CONFIG_SECRET_NAME: LEARNER_SUPABASE_SECRET_NAME,
        // WS5 (§6): the scored practice-test RUNNER is now served by this Lambda
        // (`/v1/practice-test/*`, migration 0022), so the planner may reserve a
        // `practice_test` slot into Today's Path — its runner completes end to end.
        // The strict plan still cannot deadlock: a slot is only reserved when the
        // §6 cadence is due, the serve boundary re-checks due-ness, and a completed
        // (or client-skipped) activity advances the in-order pointer.
        PRACTICE_TEST_ENABLED: 'true',
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
        // The vendored lesson catalog is bundled next to the handler (commandHooks
        // below); point the content provider at it. Without this the provider
        // resolves a repo-relative path that does not exist under /var/task, and
        // the runtime's eager L1-lesson resolution crashes the handler on load.
        LESSON_CONTENT_ROOT: LAMBDA_CONTENT_LESSONS_PATH,
      },
      bundling: {
        target: 'node22',
        minify: true,
        sourceMap: false,
        // Vendor the lesson catalog into the asset so the read-only provider finds
        // it at LESSON_CONTENT_ROOT. Copy the directory INTO an existing parent
        // (portable across GNU/BSD cp) so it lands at <asset>/content/lessons.
        commandHooks: {
          beforeBundling: () => [],
          beforeInstall: () => [],
          afterBundling: (_inputDir, outputDir) => [
            `mkdir -p ${shellQuote(`${outputDir}/content`)}`,
            `cp -R ${shellQuote(LEARNER_CONTENT_LESSONS_DIRECTORY)} ${shellQuote(`${outputDir}/content/`)}`,
          ],
        },
      },
    });
    props.data.learnerApiDbSecret.grantRead(learnerHandler);
    props.data.rateLimitPepperSecret.grantRead(learnerHandler);
    props.data.originVerificationSecret.grantRead(learnerHandler);
    // Granted by name rather than by reference: the identity stack that owns this
    // secret depends on this stack for its web origins, so a CDK reference here
    // would close a cycle. See `supabase-config.ts`.
    //
    // This is the whole of the function's identity-related permission. Verifying a
    // Supabase token is local public-key cryptography, so unlike the Cognito
    // arrangement it calls no identity API and needs no action grants at all.
    learnerHandler.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['secretsmanager:GetSecretValue'],
        resources: [learnerSupabaseSecretArnPattern(this.account, this.region)],
      }),
    );
    const appKey = kms.Key.fromKeyArn(
      this,
      'ApplicationKeyReference',
      props.foundation.appKey.keyArn,
    );
    appKey.grantDecrypt(learnerHandler);

    // ── External AI provider configuration ─────────────────────────────────────
    // The two in-process AI routes (/v1/ai/rewrite, /v1/ai/chat) read their
    // provider config (key, base URL, model) from this secret at cold start — the
    // SAME runtime-fetch pattern as DB_SECRET_ARN, so the key is NEVER baked into
    // the CloudFormation template. It is created with EMPTY placeholder values and
    // populated out-of-band (`aws secretsmanager put-secret-value`) so the real
    // key lives only in Secrets Manager. Until it is populated — or if it is ever
    // unreadable/invalid — the handler resolves an empty config and BOTH routes
    // fail closed with 503 (the "AI not configured" path the clients already
    // degrade on), so a missing value never breaks the rest of the API.
    const aiProviderSecret = new secretsmanager.Secret(this, 'AiProviderSecret', {
      secretName: '/mcat/dev/ai/provider',
      description:
        'External AI provider configuration (AI_API_KEY / AI_BASE_URL / AI_MODEL) for the learner API /v1/ai/* routes.',
      encryptionKey: appKey,
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ AI_API_KEY: '', AI_BASE_URL: '', AI_MODEL: '' }),
        generateStringKey: 'placeholder',
      },
    });
    aiProviderSecret.applyRemovalPolicy(RemovalPolicy.RETAIN);
    aiProviderSecret.grantRead(learnerHandler);
    learnerHandler.addEnvironment('AI_CONFIG_SECRET_ARN', aiProviderSecret.secretArn);

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
        managedRule('AWSManagedCommonRuleSet', 'AWSManagedRulesCommonRuleSet', 10, ALLOW_LARGE_JSON_BODY),
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
          'Linked learner sessions are authorized in the runtime using opaque rotating HttpOnly sessions and ownership-derived principals; staff APIs use a separate future authorizer.',
      },
      {
        id: 'AwsSolutions-COG4',
        reason:
          'Credentials are held by Supabase, not a Cognito user pool. The runtime verifies the Supabase token and issues its own opaque session cookie, so no Cognito authorizer exists to attach; the unauthenticated /v1/auth/session and /v1/health routes must also stay reachable without one.',
      },
    );
    Validations.of(aiProviderSecret).acknowledge({
      id: 'AwsSolutions-SMG4',
      reason:
        'Third-party AI provider configuration (a vendor API key plus its base URL and model), not an AWS credential we can rotate programmatically — rotating it means minting a new token in the provider console. It is populated and rotated deliberately via runbook, stays KMS-encrypted, is read only server-side by the learner API, and is never exposed to browsers; the AI routes fail closed (503) whenever it is absent or invalid.',
    });
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
      learnerHandler,
      `AwsSolutions-IAM5[Resource::arn:aws:secretsmanager:${this.region}:${this.account}:secret:${LEARNER_SUPABASE_SECRET_NAME}-*]`,
      'Secrets Manager appends a random suffix to every secret ARN, so a name-based grant must end in a wildcard; the identity stack that owns this secret cannot be referenced directly without closing a stack cycle.',
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

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function managedRule(
  name: string,
  managedRuleGroupName: string,
  priority: number,
  ruleActionOverrides?: wafv2.CfnWebACL.RuleActionOverrideProperty[],
): wafv2.CfnWebACL.RuleProperty {
  return {
    name,
    priority,
    overrideAction: { none: {} },
    statement: {
      managedRuleGroupStatement: {
        name: managedRuleGroupName,
        vendorName: 'AWS',
        ...(ruleActionOverrides ? { ruleActionOverrides } : {}),
      },
    },
    visibilityConfig: {
      cloudWatchMetricsEnabled: true,
      metricName: `mcat-dev-${name.toLowerCase()}`,
      sampledRequestsEnabled: false,
    },
  };
}

// The learner API is a JSON API: the Today's-Path build legitimately POSTs the full
// candidate-lesson catalog (~30-40KB), and the Lambda enforces its OWN body cap. The
// Common Rule Set's SizeRestrictions_BODY blocks bodies >8KB, which rejected that write
// with a 403 before it reached the API. Count (don't block) oversize bodies so large
// JSON writes pass; every other Common Rule Set protection stays on.
const ALLOW_LARGE_JSON_BODY: wafv2.CfnWebACL.RuleActionOverrideProperty[] = [
  { name: 'SizeRestrictions_BODY', actionToUse: { count: {} } },
];
