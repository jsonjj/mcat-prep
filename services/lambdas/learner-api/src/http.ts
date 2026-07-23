export interface ApiGatewayV2Event {
  readonly version: '2.0';
  readonly rawPath: string;
  readonly rawQueryString?: string | undefined;
  readonly headers: Readonly<Record<string, string | undefined>>;
  readonly cookies?: readonly string[] | undefined;
  readonly requestContext: {
    readonly requestId: string;
    readonly http: {
      readonly method: string;
      readonly path: string;
      readonly sourceIp: string;
    };
  };
  readonly body?: string | undefined;
  readonly isBase64Encoded?: boolean | undefined;
}

export interface ApiGatewayV2Result {
  readonly statusCode: number;
  readonly headers?: Readonly<Record<string, string>>;
  readonly cookies?: readonly string[];
  readonly body?: string;
}

export interface ApiGatewayV1Event {
  readonly httpMethod: string;
  readonly path: string;
  readonly queryStringParameters?: Readonly<Record<string, string | undefined>> | null;
  readonly headers: Readonly<Record<string, string | undefined>>;
  readonly multiValueHeaders?: Readonly<Record<string, readonly string[] | undefined>>;
  readonly requestContext: {
    readonly requestId: string;
    readonly identity: { readonly sourceIp: string };
  };
  readonly body: string | null;
  readonly isBase64Encoded?: boolean;
}

export interface ApiGatewayV1Result {
  readonly statusCode: number;
  readonly headers?: Readonly<Record<string, string>>;
  readonly multiValueHeaders?: Readonly<Record<string, readonly string[]>>;
  readonly body?: string;
}

export type LambdaApiGatewayEvent = ApiGatewayV1Event | ApiGatewayV2Event;
export type LambdaApiGatewayResult = ApiGatewayV1Result | ApiGatewayV2Result;

export interface SafeLogEvent {
  readonly requestId: string;
  readonly route: string;
  readonly method: string;
  readonly status: number;
  readonly latencyMs: number;
  readonly principalKind: 'anonymous' | 'guest' | 'linked';
  readonly learnerHash?: string;
  readonly outcome: 'success' | 'denied' | 'invalid' | 'error';
}

export interface SafeLogger {
  info(event: SafeLogEvent): void;
}

export interface RateLimitInput {
  readonly key: string;
  readonly route: string;
  readonly method: string;
}

export interface RateLimiter {
  allow(input: RateLimitInput): Promise<boolean>;
}

export function normalizedHeaders(
  headers: Readonly<Record<string, string | undefined>>,
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(headers)
      .filter((entry): entry is [string, string] => entry[1] !== undefined)
      .map(([name, value]) => [name.toLowerCase(), value]),
  );
}
