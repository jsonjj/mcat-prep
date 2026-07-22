import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { AwsSolutionsChecks } from 'cdk-nag';
import { describe, expect, it } from 'vitest';

import { getEnvironment } from '../config/environments.js';
import { WebStack } from '../lib/web-stack.js';

const environment = getEnvironment('dev');

function createWeb(): WebStack {
  return new WebStack(new App(), 'McatDevWeb', {
    env: { account: environment.account, region: environment.region },
    environment,
  });
}

describe('WebStack', () => {
  it('keeps separate learner and admin artifacts private behind CloudFront OAC', () => {
    const template = Template.fromStack(createWeb());

    template.resourceCountIs('AWS::CloudFront::OriginAccessControl', 2);
    template.resourceCountIs('AWS::CloudFront::Distribution', 2);
    template.hasResourceProperties('AWS::WAFv2::WebACL', { Scope: 'CLOUDFRONT' });
    template.allResourcesProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        Restrictions: {
          GeoRestriction: { Locations: ['US'], RestrictionType: 'whitelist' },
        },
        WebACLId: Match.anyValue(),
      }),
    });
    template.allResourcesProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
    expect(JSON.stringify(template.toJSON())).not.toContain('PublicRead');
  });

  it('enforces HTTPS and SPA fallback without caching errors', () => {
    const template = Template.fromStack(createWeb());

    template.allResourcesProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        CustomErrorResponses: Match.arrayWith([
          Match.objectLike({
            ErrorCode: 403,
            ErrorCachingMinTTL: 0,
            ResponseCode: 200,
            ResponsePagePath: '/index.html',
          }),
          Match.objectLike({
            ErrorCode: 404,
            ErrorCachingMinTTL: 0,
            ResponseCode: 200,
            ResponsePagePath: '/index.html',
          }),
        ]),
        DefaultCacheBehavior: Match.objectLike({ ViewerProtocolPolicy: 'redirect-to-https' }),
        HttpVersion: 'http2and3',
      }),
    });
  });

  it('applies a restrictive CSP and noindex to private learner and all admin routes', () => {
    const serialized = JSON.stringify(Template.fromStack(createWeb()).toJSON());

    expect(serialized).toContain("default-src 'none'");
    expect(serialized).toContain("frame-ancestors 'none'");
    expect(serialized).toContain('Permissions-Policy');
    expect(serialized).toContain('X-Robots-Tag');
    expect(serialized).toContain('noindex, nofollow, noarchive');
    expect(serialized).not.toContain('example.test');
  });

  it('uses no-cache defaults and restricts immutable caching to hashed asset paths', () => {
    const distributions = Template.fromStack(createWeb()).findResources(
      'AWS::CloudFront::Distribution',
    );

    for (const distribution of Object.values(distributions)) {
      const config = (distribution.Properties as { DistributionConfig: Record<string, unknown> })
        .DistributionConfig;
      expect(config.DefaultCacheBehavior).toMatchObject({
        CachePolicyId: '4135ea2d-6df8-44a3-9df3-4b5a84be39ad',
      });
      expect(config.CacheBehaviors).toEqual(
        expect.arrayContaining([expect.objectContaining({ PathPattern: 'assets/*' })]),
      );
    }
  });

  it('publishes the exact deployment-tool output contract', () => {
    const outputs = Template.fromStack(createWeb()).toJSON().Outputs;

    expect(outputs).toHaveProperty('LearnerArtifactBucketName');
    expect(outputs).toHaveProperty('LearnerDistributionId');
    expect(outputs).toHaveProperty('AdminArtifactBucketName');
    expect(outputs).toHaveProperty('AdminDistributionId');
    expect(outputs).toHaveProperty('LearnerWebUrl');
    expect(outputs).toHaveProperty('AdminWebUrl');
  });

  it('has no unsuppressed AWS Solutions findings', () => {
    const stack = createWeb();
    const app = stack.node.root as App;
    app.synth();
    const report = new AwsSolutionsChecks(app, { verbose: true }).validateScope(stack);

    expect(report.violations).toEqual([]);
  });
});
