import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
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
  it('keeps separate learner and admin artifact stores private', () => {
    const template = Template.fromStack(createWeb());

    template.resourceCountIs('AWS::CloudFront::OriginAccessControl', 0);
    template.resourceCountIs('AWS::CloudFront::Distribution', 0);
    template.resourceCountIs('AWS::WAFv2::WebACL', 0);
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

  it('uses S3-managed encryption for learner-safe web artifacts without an OAC KMS wildcard', () => {
    const template = Template.fromStack(createWeb());

    template.resourceCountIs('AWS::KMS::Key', 0);
    template.allResourcesProperties('AWS::S3::Bucket', {
      BucketEncryption: {
        ServerSideEncryptionConfiguration: [
          {
            ServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' },
          },
        ],
      },
    });
  });

  it('publishes only the storage half of the deployment-tool output contract', () => {
    const outputs = Template.fromStack(createWeb()).toJSON().Outputs;

    expect(outputs).toHaveProperty('LearnerArtifactBucketName');
    expect(outputs).toHaveProperty('AdminArtifactBucketName');
    expect(outputs).not.toHaveProperty('LearnerDistributionId');
    expect(outputs).not.toHaveProperty('AdminDistributionId');
    expect(outputs).not.toHaveProperty('LearnerWebUrl');
    expect(outputs).not.toHaveProperty('AdminWebUrl');
  });

  it('has no unsuppressed AWS Solutions findings', () => {
    const stack = createWeb();
    const app = stack.node.root as App;
    app.synth();
    const report = new AwsSolutionsChecks(app, { verbose: true }).validateScope(stack);

    expect(report.violations).toEqual([]);
  });
});
