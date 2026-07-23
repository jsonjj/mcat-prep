export interface WebOrigins {
  readonly learner: string;
  readonly staff: string;
}

export function assertExactHttpsOrigin(origin: string): void {
  if (Token.isUnresolved(origin)) {
    if (!origin.startsWith('https://')) {
      throw new Error('Unresolved web origins must retain an explicit HTTPS scheme.');
    }
    return;
  }
  const parsed = new URL(origin);
  if (parsed.protocol !== 'https:' || parsed.origin !== origin) {
    throw new Error(`Web origin must be an exact HTTPS origin: ${origin}`);
  }
}
import { Token } from 'aws-cdk-lib';
