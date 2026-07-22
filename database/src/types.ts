export type JsonPrimitive = boolean | number | string | null;

export type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];

export interface JsonObject {
  readonly [key: string]: JsonValue;
}

export interface AcceptedCommand {
  readonly eventId: string;
  readonly learnerId: string;
  readonly idempotencyKey: string;
  readonly sequence: number;
  readonly acceptedAt: string;
  readonly eventType: string;
  readonly contentRelease: string;
  readonly policyVersions: Readonly<Record<string, string>>;
  readonly payload: JsonObject;
  readonly result: JsonObject;
}

export interface LearnerProjectionRecord {
  readonly learnerId: string;
  readonly sequence: number;
  readonly projectionVersion: string;
  readonly state: JsonObject;
  readonly updatedAt: string;
}

export interface OutboxRecord {
  readonly outboxId: string;
  readonly learnerId: string;
  readonly sequence: number;
  readonly topic: string;
  readonly payload: JsonObject;
  readonly createdAt: string;
  readonly publishedAt: string | null;
  readonly attempts: number;
}
