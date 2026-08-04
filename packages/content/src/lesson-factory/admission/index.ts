import { admitIntake, IntakeRefusal } from './intake';
import { packetSemanticErrors } from './packet-semantics';

export * from './canonical-json';
export * from './intake';
export * from './json-schema-subset';
export * from './packet-semantics';
export * from './reference-model';
export { AdmissionAuthorityUnavailable } from './authority';

export interface TaskSourcePacketV5AdmissionRequest {
  readonly bytes: string;
  readonly locator: `${string}/${string}`;
}

export interface TaskSourcePacketV5AdmissionResult {
  readonly admission: 'ADMITTED' | 'REJECTED';
  readonly semantic_validation: {
    readonly validator: 'PACKET_SEMANTICS_V1';
    readonly status: 'PASS' | 'FAIL' | 'NOT_RUN';
    readonly error_count: number;
  };
}

export interface TaskSourcePacketV5AdmissionDiagnostic {
  readonly stage: 'IDENTITY' | 'SCHEMA' | 'REFERENCES' | 'INPUTS' | 'SEMANTICS' | 'ADMITTED';
  readonly code:
    | 'ADMITTED'
    | 'UNIDENTIFIABLE'
    | 'UNKNOWN_CONTRACT'
    | 'LOCATOR_NOT_CANONICAL'
    | 'SCHEMA_INVALID'
    | 'REFERENCES_UNRESOLVED'
    | 'INPUTS_UNRESOLVED'
    | 'PACKET_SEMANTICS_INVALID';
  readonly paths: readonly string[];
  readonly problems: readonly string[];
}

export function admitTaskSourcePacketV5(
  request: TaskSourcePacketV5AdmissionRequest,
): TaskSourcePacketV5AdmissionResult {
  const record = admitIntake({
    bytes: Buffer.from(request.bytes, 'utf8'),
    locator: request.locator,
  });
  if (record.semantic_validation.status === 'NOT_APPLICABLE') {
    throw new TypeError('admitTaskSourcePacketV5 accepts only task-source packet bytes');
  }
  return {
    admission: record.admission,
    semantic_validation: {
      validator: record.semantic_validation.validator,
      status: record.semantic_validation.status,
      error_count: record.semantic_validation.error_count,
    },
  };
}

export function diagnoseTaskSourcePacketV5(
  request: TaskSourcePacketV5AdmissionRequest,
): TaskSourcePacketV5AdmissionDiagnostic {
  let record;
  try {
    record = admitIntake({
      bytes: Buffer.from(request.bytes, 'utf8'),
      locator: request.locator,
    });
  } catch (error) {
    if (!(error instanceof IntakeRefusal)) throw error;
    return {
      stage: 'IDENTITY',
      code: error.code,
      paths: ['/'],
      problems: [error.message],
    };
  }
  if (record.semantic_validation.status === 'NOT_APPLICABLE') {
    throw new TypeError('diagnoseTaskSourcePacketV5 accepts only task-source packet bytes');
  }
  const code = record.refusal_code ?? 'ADMITTED';
  const stage =
    code === 'ADMITTED'
      ? 'ADMITTED'
      : code === 'SCHEMA_INVALID'
        ? 'SCHEMA'
        : code === 'REFERENCES_UNRESOLVED'
          ? 'REFERENCES'
          : code === 'INPUTS_UNRESOLVED'
            ? 'INPUTS'
            : 'SEMANTICS';
  const semanticProblems =
    code === 'PACKET_SEMANTICS_INVALID' ? packetSemanticErrors(JSON.parse(request.bytes)) : [];
  const paths =
    code === 'REFERENCES_UNRESOLVED'
      ? record.resolver_validation.references
          .filter((reference) => !['RESOLVED', 'IDENTITY_ONLY'].includes(reference.status))
          .map((reference) => reference.field)
      : code === 'INPUTS_UNRESOLVED'
        ? record.input_validation.inputs
            .filter(
              (input) => input.fileStatus !== 'RESOLVED' || input.contentStatus !== 'RESOLVED',
            )
            .map((input) => input.field)
        : code === 'ADMITTED'
          ? []
          : ['/'];
  return {
    stage,
    code,
    paths: [...new Set(paths)].sort(),
    problems: semanticProblems,
  };
}
