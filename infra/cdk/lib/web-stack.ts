import {
  ArnFormat,
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  Validations,
  type StackProps,
  aws_cloudfront as cloudfront,
  aws_s3 as s3,
  aws_wafv2 as wafv2,
} from 'aws-cdk-lib';
import type { aws_apigateway as apigateway } from 'aws-cdk-lib';
import { HttpOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import type { Construct } from 'constructs';

import type { EnvironmentConfig } from '../config/environments.js';
import { applySandboxPermissionsBoundary } from './permissions-boundary.js';
import { supabaseProjectUrlFor } from './supabase-config.js';
import { applyRequiredTags } from './tags.js';

export interface WebStackProps extends StackProps {
  readonly environment: EnvironmentConfig;
}

export interface WebResources {
  readonly learnerBucket: s3.IBucket;
  readonly adminBucket: s3.IBucket;
  readonly accessLogs: s3.IBucket;
}

export interface WebDeliveryResources {
  readonly learnerDistribution: cloudfront.IDistribution;
  readonly adminDistribution: cloudfront.IDistribution;
  readonly learnerOrigin: string;
  readonly adminOrigin: string;
}

/**
 * `connect-src` names the Supabase project because the browser now authenticates
 * against it directly — email/password, confirmation, and reset are all `fetch`
 * calls to `<project>.supabase.co/auth/v1`. It is the exact project origin rather
 * than a `*.supabase.co` wildcard, so a compromised script cannot exfiltrate to
 * some other Supabase project.
 *
 * Google sign-in needs nothing here: it is a top-level navigation to Supabase,
 * which `connect-src` does not govern, and the browser returns to `'self'`.
 */
const strictCsp = (supabaseOrigin?: string): string =>
  [
    "default-src 'none'",
    "base-uri 'none'",
    [
      "connect-src 'self' https://*.execute-api.us-east-1.amazonaws.com",
      ...(supabaseOrigin === undefined ? [] : [supabaseOrigin]),
    ].join(' '),
    "font-src 'self' data:",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "img-src 'self' data: blob:",
    "manifest-src 'self'",
    "media-src 'self' blob:",
    "object-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "worker-src 'self' blob:",
    'upgrade-insecure-requests',
  ].join('; ');

export class WebStack extends Stack {
  public readonly resources: WebResources;

  public constructor(scope: Construct, id: string, props: WebStackProps) {
    super(scope, id, props);

    if (props.environment.region !== 'us-east-1') {
      throw new Error('The CloudFront WAF stack must be synthesized in us-east-1.');
    }
    applySandboxPermissionsBoundary(this);
    applyRequiredTags(this, 'internal');

    const accessLogs = new s3.Bucket(this, 'WebAccessLogsBucket', {
      bucketName: `mcat-dev-web-access-logs-${props.environment.account}-${props.environment.region}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      objectOwnership: s3.ObjectOwnership.OBJECT_WRITER,
      versioned: true,
      lifecycleRules: [
        {
          expiration: Duration.days(365),
          noncurrentVersionExpiration: Duration.days(90),
        },
      ],
      removalPolicy: RemovalPolicy.RETAIN,
    });
    const learnerBucket = createArtifactBucket(
      this,
      'LearnerArtifactsBucket',
      `mcat-dev-learner-web-${props.environment.account}-${props.environment.region}`,
      accessLogs,
    );
    const adminBucket = createArtifactBucket(
      this,
      'AdminArtifactsBucket',
      `mcat-dev-admin-web-${props.environment.account}-${props.environment.region}`,
      accessLogs,
    );

    new CfnOutput(this, 'LearnerArtifactBucketName', {
      value: learnerBucket.bucketName,
      exportName: 'mcat-dev-learner-web-bucket-name',
    });
    new CfnOutput(this, 'AdminArtifactBucketName', {
      value: adminBucket.bucketName,
      exportName: 'mcat-dev-admin-web-bucket-name',
    });

    Validations.of(accessLogs).acknowledge({
      id: 'AwsSolutions-S1',
      reason:
        'This is the dedicated CloudFront and S3 access-log sink; recursive server-access logging would create an unbounded loop.',
    });
    for (const bucket of [learnerBucket, adminBucket]) {
      Validations.of(bucket).acknowledge({
        id: 'AwsSolutions-S10',
        reason:
          'The API delivery stack installs the final bucket policy because it owns the exact CloudFront distribution ARN. The storage-only stack deploys empty, public-blocked buckets before that policy is composed.',
      });
    }
    this.resources = { learnerBucket, adminBucket, accessLogs };
  }
}

export function createWebDelivery(
  scope: Construct,
  options: {
    readonly restApi: apigateway.RestApiBase;
    readonly apiStageName: string;
    readonly originVerificationHeaderValue: string;
    readonly web: WebResources;
  },
): WebDeliveryResources {
  const edgeWebAcl = new wafv2.CfnWebACL(scope, 'EdgeWebAcl', {
    name: 'mcat-dev-web',
    description: 'Managed edge protections and source-IP rate limiting for development web apps.',
    scope: 'CLOUDFRONT',
    defaultAction: { allow: {} },
    visibilityConfig: {
      cloudWatchMetricsEnabled: true,
      metricName: 'mcat-dev-web-waf',
      sampledRequestsEnabled: false,
    },
    rules: [
      managedRule('AWSManagedCommonRuleSet', 'AWSManagedRulesCommonRuleSet', 10),
      managedRule('AWSManagedKnownBadInputsRuleSet', 'AWSManagedRulesKnownBadInputsRuleSet', 20),
      {
        name: 'SourceIpRateLimit',
        priority: 30,
        action: { block: {} },
        statement: {
          rateBasedStatement: {
            aggregateKeyType: 'IP',
            evaluationWindowSec: 300,
            limit: 2_000,
          },
        },
        visibilityConfig: {
          cloudWatchMetricsEnabled: true,
          metricName: 'mcat-dev-web-source-ip-rate-limit',
          sampledRequestsEnabled: false,
        },
      },
    ],
  });
  // Only the learner app authenticates against Supabase, so only its CSP names
  // that origin. The admin console keeps the tighter default.
  const learnerCsp = strictCsp(supabaseProjectUrlFor(scope));
  const adminCsp = strictCsp();
  const publicHeaders = createResponseHeadersPolicy(
    scope,
    'PublicResponseHeaders',
    false,
    learnerCsp,
  );
  const privateHeaders = createResponseHeadersPolicy(
    scope,
    'PrivateResponseHeaders',
    true,
    learnerCsp,
  );
  const adminHeaders = createResponseHeadersPolicy(scope, 'AdminResponseHeaders', true, adminCsp);
  const learnerDistribution = createDistribution(scope, 'LearnerDistribution', {
    comment: 'MCAT development learner PWA',
    bucket: options.web.learnerBucket,
    accessLogs: options.web.accessLogs,
    responseHeadersPolicy: publicHeaders,
    privateResponseHeadersPolicy: privateHeaders,
    webAclId: edgeWebAcl.attrArn,
    restApi: options.restApi,
    apiStageName: options.apiStageName,
    apiOriginVerificationHeaderValue: options.originVerificationHeaderValue,
  });
  const adminDistribution = createDistribution(scope, 'AdminDistribution', {
    comment: 'MCAT development admin console (artifact publishing remains disabled)',
    bucket: options.web.adminBucket,
    accessLogs: options.web.accessLogs,
    responseHeadersPolicy: adminHeaders,
    privateResponseHeadersPolicy: adminHeaders,
    webAclId: edgeWebAcl.attrArn,
  });
  createArtifactBucketPolicy(
    scope,
    'LearnerArtifactsBucketPolicy',
    options.web.learnerBucket,
    learnerDistribution,
  );
  createArtifactBucketPolicy(
    scope,
    'AdminArtifactsBucketPolicy',
    options.web.adminBucket,
    adminDistribution,
  );
  for (const distribution of [learnerDistribution, adminDistribution]) {
    Validations.of(distribution).acknowledge(
      {
        id: 'AwsSolutions-CFR3',
        reason:
          'CloudFront standard access logging is enabled to the dedicated retained access-log bucket; real-time logging is intentionally deferred for cost containment in development.',
      },
      {
        id: 'AwsSolutions-CFR4',
        reason:
          'Development uses the generated cloudfront.net hostname because no reviewed custom domain or ACM certificate exists yet. HTTPS redirect remains mandatory; a custom ACM certificate is a production promotion gate.',
      },
    );
  }
  return {
    learnerDistribution,
    adminDistribution,
    learnerOrigin: `https://${learnerDistribution.distributionDomainName}`,
    adminOrigin: `https://${adminDistribution.distributionDomainName}`,
  };
}

function createArtifactBucket(
  scope: Construct,
  id: string,
  bucketName: string,
  accessLogs: s3.IBucket,
): s3.Bucket {
  return new s3.Bucket(scope, id, {
    bucketName,
    blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    encryption: s3.BucketEncryption.S3_MANAGED,
    enforceSSL: false,
    versioned: true,
    serverAccessLogsBucket: accessLogs,
    serverAccessLogsPrefix: `${id.toLowerCase()}/`,
    lifecycleRules: [{ noncurrentVersionExpiration: Duration.days(30) }],
    removalPolicy: RemovalPolicy.RETAIN,
  });
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
      managedRuleGroupStatement: {
        name: managedRuleGroupName,
        vendorName: 'AWS',
      },
    },
    visibilityConfig: {
      cloudWatchMetricsEnabled: true,
      metricName: `mcat-dev-${name.toLowerCase()}`,
      sampledRequestsEnabled: false,
    },
  };
}

function createResponseHeadersPolicy(
  scope: Construct,
  id: string,
  noindex: boolean,
  csp: string,
): cloudfront.ResponseHeadersPolicy {
  return new cloudfront.ResponseHeadersPolicy(scope, id, {
    responseHeadersPolicyName: `mcat-dev-${id.replaceAll(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()}`,
    comment: 'Strict security and privacy headers for MCAT development web delivery.',
    securityHeadersBehavior: {
      contentSecurityPolicy: { contentSecurityPolicy: csp, override: true },
      contentTypeOptions: { override: true },
      frameOptions: { frameOption: cloudfront.HeadersFrameOption.DENY, override: true },
      referrerPolicy: {
        referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
        override: true,
      },
      strictTransportSecurity: {
        accessControlMaxAge: Duration.days(365),
        includeSubdomains: true,
        preload: true,
        override: true,
      },
      xssProtection: { protection: true, modeBlock: true, override: true },
    },
    customHeadersBehavior: {
      customHeaders: [
        {
          header: 'Permissions-Policy',
          value: 'camera=(), geolocation=(), payment=(), usb=()',
          override: true,
        },
        ...(noindex
          ? [
              {
                header: 'X-Robots-Tag',
                value: 'noindex, nofollow, noarchive',
                override: true,
              },
            ]
          : []),
      ],
    },
  });
}

interface DistributionOptions {
  readonly comment: string;
  readonly bucket: s3.IBucket;
  readonly accessLogs: s3.IBucket;
  readonly responseHeadersPolicy: cloudfront.IResponseHeadersPolicy;
  readonly privateResponseHeadersPolicy: cloudfront.IResponseHeadersPolicy;
  readonly webAclId: string;
  readonly restApi?: apigateway.RestApiBase;
  readonly apiStageName?: string;
  readonly apiOriginVerificationHeaderValue?: string;
}

function createDistribution(
  scope: Construct,
  id: string,
  options: DistributionOptions,
): cloudfront.Distribution {
  const originAccessControl = new cloudfront.S3OriginAccessControl(
    scope,
    `${id}OriginAccessControl`,
    {
      originAccessControlName: `mcat-dev-${id.replaceAll(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()}`,
    },
  );
  const origin = new ExplicitPolicyS3Origin(options.bucket, originAccessControl);
  const spaRewrite = new cloudfront.Function(scope, `${id}SpaRewrite`, {
    functionName: `mcat-dev-${id.toLowerCase()}-spa-rewrite`,
    comment: 'Rewrites extensionless browser routes to the static SPA shell.',
    code: cloudfront.FunctionCode.fromInline(`function handler(event) {
  var request = event.request;
  var uri = request.uri;
  if (!uri.startsWith('/v1/') && !uri.startsWith('/assets/') && uri.indexOf('.') === -1) {
    request.uri = '/index.html';
  }
  return request;
}`),
  });
  const functionAssociations = [
    {
      eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
      function: spaRewrite,
    },
  ];
  const distribution = new cloudfront.Distribution(scope, id, {
    comment: options.comment,
    defaultRootObject: 'index.html',
    defaultBehavior: {
      origin,
      allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
      cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
      cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
      compress: true,
      functionAssociations,
      responseHeadersPolicy: options.responseHeadersPolicy,
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
    },
    additionalBehaviors: {
      'assets/*': {
        origin,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        compress: true,
        responseHeadersPolicy: options.responseHeadersPolicy,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      'app/*': {
        origin,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        compress: true,
        functionAssociations,
        responseHeadersPolicy: options.privateResponseHeadersPolicy,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      ...(options.restApi === undefined
        ? {}
        : {
            'v1/*': {
              origin: new HttpOrigin(
                `${options.restApi.restApiId}.execute-api.${Stack.of(scope).region}.${Stack.of(scope).urlSuffix}`,
                {
                  originPath: `/${options.apiStageName ?? 'dev'}`,
                  protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
                  originSslProtocols: [cloudfront.OriginSslPolicy.TLS_V1_2],
                  customHeaders: {
                    'x-mcat-origin-verify': options.apiOriginVerificationHeaderValue ?? '',
                  },
                },
              ),
              allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
              cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
              cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
              compress: true,
              originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
              viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
            },
          }),
    },
    enableIpv6: true,
    enableLogging: true,
    geoRestriction: cloudfront.GeoRestriction.allowlist('US'),
    logBucket: options.accessLogs,
    logFilePrefix: `${id.toLowerCase()}/`,
    httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
    minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
    priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
    webAclId: options.webAclId,
  });

  return distribution;
}

class ExplicitPolicyS3Origin extends cloudfront.OriginBase {
  public constructor(bucket: s3.IBucket, originAccessControl: cloudfront.IOriginAccessControl) {
    super(bucket.bucketRegionalDomainName, {
      originAccessControlId: originAccessControl.originAccessControlId,
    });
  }

  protected override renderS3OriginConfig(): cloudfront.CfnDistribution.S3OriginConfigProperty {
    return { originAccessIdentity: '' };
  }
}

function createArtifactBucketPolicy(
  scope: Construct,
  id: string,
  bucket: s3.IBucket,
  distribution: cloudfront.IDistribution,
): void {
  const stack = Stack.of(scope);
  const distributionArn = stack.formatArn({
    service: 'cloudfront',
    region: '',
    resource: 'distribution',
    resourceName: distribution.distributionId,
    arnFormat: ArnFormat.SLASH_RESOURCE_NAME,
  });
  new s3.CfnBucketPolicy(scope, id, {
    bucket: bucket.bucketName,
    policyDocument: {
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'DenyInsecureTransport',
          Effect: 'Deny',
          Principal: '*',
          Action: 's3:*',
          Resource: [bucket.bucketArn, bucket.arnForObjects('*')],
          Condition: { Bool: { 'aws:SecureTransport': 'false' } },
        },
        {
          Sid: 'AllowExactCloudFrontDistributionRead',
          Effect: 'Allow',
          Principal: { Service: 'cloudfront.amazonaws.com' },
          Action: 's3:GetObject',
          Resource: bucket.arnForObjects('*'),
          Condition: {
            StringEquals: {
              'AWS:SourceAccount': stack.account,
              'AWS:SourceArn': distributionArn,
            },
          },
        },
      ],
    },
  });
}
