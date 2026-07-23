import { aws_iam as iam } from 'aws-cdk-lib';
import type { IConstruct } from 'constructs';

const SANDBOX_BOUNDARY_ARN = 'arn:aws:iam::056956104102:policy/InternSandboxBoundary';

export function applySandboxPermissionsBoundary(scope: IConstruct): void {
  const boundary = iam.ManagedPolicy.fromManagedPolicyArn(
    scope,
    'SandboxPermissionsBoundary',
    SANDBOX_BOUNDARY_ARN,
  );
  iam.PermissionsBoundary.of(scope).apply(boundary);
}
