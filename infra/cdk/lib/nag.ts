import { Validations } from 'aws-cdk-lib';
import type { IConstruct } from 'constructs';

export function acknowledgeCdkNagFinding(scope: IConstruct, id: string, reason: string): void {
  if (id.includes('::')) {
    scope.node.addMetadata(Validations.ACKNOWLEDGED_RULES_METADATA_KEY, {
      [id]: reason,
    });
    return;
  }
  Validations.of(scope).acknowledge({ id, reason });
}
