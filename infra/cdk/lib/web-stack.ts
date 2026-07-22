import {
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
import { S3BucketOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import type { Construct } from 'constructs';

import type { EnvironmentConfig } from '../config/environments.js';
import { applySandboxPermissionsBoundary } from './permissions-boundary.js';
import { applyRequiredTags } from './tags.js';

export interface WebStackProps extends StackProps {
  readonly environment: EnvironmentConfig;
}

export interface WebResources {
  readonly learnerBucket: s3.IBucket;
  readonly adminBucket: s3.IBucket;
  readonly learnerDistribution: cloudfront.IDistribution;
  readonly adminDistribution: cloudfront.IDistribution;
  readonly learnerOrigin: string;
  readonly adminOrigin: string;
}

const STRICT_CSP = [
  "default-src 'none'",
  "base-uri 'none'",
  "connect-src 'self' https://*.execute-api.us-east-1.amazonaws.com https://cognito-idp.us-east-1.amazonaws.com https://*.auth.us-east-1.amazoncognito.com",
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

    const edgeWebAcl = new wafv2.CfnWebACL(this, 'EdgeWebAcl', {
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

    const publicHeaders = createResponseHeadersPolicy(this, 'PublicResponseHeaders', false);
    const privateHeaders = createResponseHeadersPolicy(this, 'PrivateResponseHeaders', true);
    const adminHeaders = createResponseHeadersPolicy(this, 'AdminResponseHeaders', true);

    const learnerDistribution = createDistribution(this, 'LearnerDistribution', {
      comment: 'MCAT development learner PWA',
      bucket: learnerBucket,
      accessLogs,
      responseHeadersPolicy: publicHeaders,
      privateResponseHeadersPolicy: privateHeaders,
      webAclId: edgeWebAcl.attrArn,
    });
    const adminDistribution = createDistribution(this, 'AdminDistribution', {
      comment: 'MCAT development admin console (artifact publishing remains disabled)',
      bucket: adminBucket,
      accessLogs,
      responseHeadersPolicy: adminHeaders,
      privateResponseHeadersPolicy: adminHeaders,
      webAclId: edgeWebAcl.attrArn,
    });

    const learnerOrigin = `https://${learnerDistribution.distributionDomainName}`;
    const adminOrigin = `https://${adminDistribution.distributionDomainName}`;
    new CfnOutput(this, 'LearnerWebUrl', {
      value: learnerOrigin,
      exportName: 'mcat-dev-learner-web-origin',
    });
    new CfnOutput(this, 'AdminWebUrl', {
      value: adminOrigin,
      exportName: 'mcat-dev-admin-web-origin',
    });
    new CfnOutput(this, 'LearnerArtifactBucketName', {
      value: learnerBucket.bucketName,
      exportName: 'mcat-dev-learner-web-bucket-name',
    });
    new CfnOutput(this, 'LearnerDistributionId', {
      value: learnerDistribution.distributionId,
      exportName: 'mcat-dev-learner-web-distribution-id',
    });
    new CfnOutput(this, 'AdminArtifactBucketName', {
      value: adminBucket.bucketName,
      exportName: 'mcat-dev-admin-web-bucket-name',
    });
    new CfnOutput(this, 'AdminDistributionId', {
      value: adminDistribution.distributionId,
      exportName: 'mcat-dev-admin-web-distribution-id',
    });

    Validations.of(accessLogs).acknowledge({
      id: 'AwsSolutions-S1',
      reason:
        'This is the dedicated CloudFront and S3 access-log sink; recursive server-access logging would create an unbounded loop.',
    });
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
            'Development uses the generated cloudfront.net hostname because no reviewed custom domain or ACM certificate exists yet. The default CloudFront certificate cannot accept a configurable minimum TLS policy; HTTPS redirect remains mandatory, and a TLSv1.2_2021 custom certificate is a production promotion gate.',
        },
      );
    }

    this.resources = {
      learnerBucket,
      adminBucket,
      learnerDistribution,
      adminDistribution,
      learnerOrigin,
      adminOrigin,
    };
  }
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
    enforceSSL: true,
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
): cloudfront.ResponseHeadersPolicy {
  return new cloudfront.ResponseHeadersPolicy(scope, id, {
    responseHeadersPolicyName: `mcat-dev-${id.replaceAll(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()}`,
    comment: 'Strict security and privacy headers for MCAT development web delivery.',
    securityHeadersBehavior: {
      contentSecurityPolicy: { contentSecurityPolicy: STRICT_CSP, override: true },
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
}

function createDistribution(
  scope: Construct,
  id: string,
  options: DistributionOptions,
): cloudfront.Distribution {
  const origin = S3BucketOrigin.withOriginAccessControl(options.bucket, {
    originAccessLevels: [cloudfront.AccessLevel.READ],
  });
  const distribution = new cloudfront.Distribution(scope, id, {
    comment: options.comment,
    defaultRootObject: 'index.html',
    defaultBehavior: {
      origin,
      allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
      cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
      cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
      compress: true,
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
        responseHeadersPolicy: options.privateResponseHeadersPolicy,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
    },
    errorResponses: [403, 404].map((httpStatus) => ({
      httpStatus,
      responseHttpStatus: 200,
      responsePagePath: '/index.html',
      ttl: Duration.seconds(0),
    })),
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
