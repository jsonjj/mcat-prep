import { Authority } from '@mcat/authority-core';
import {
  AcceptedCommandResponseSchema,
  type AcceptedCommandResponse,
  type Clock,
} from '@mcat/contracts';
import type { AcceptedCommand, AuthorityRepository, OutboxRecord } from '@mcat/database';
import { activePolicyVersions } from '@mcat/policies';

import { applyAuthorityCommand, parseAuthorityCommand } from './commands';
import {
  AuthorityKernelError,
  forbidden,
  notFound,
  streamConflict,
  type Principal,
} from './context';
import {
  buildLearnerSnapshot,
  learnerStateFromProjection,
  toJsonObject,
  toProjectionRecord,
} from './views';

export interface AuthorityKernelDependencies {
  readonly repository: AuthorityRepository;
  readonly clock: Clock;
  readonly bank: Authority['bank'];
}

export class AuthorityKernel {
  private readonly repository: AuthorityRepository;
  private readonly clock: Clock;
  private readonly bank: Authority['bank'];

  constructor(dependencies: AuthorityKernelDependencies) {
    this.repository = dependencies.repository;
    this.clock = dependencies.clock;
    this.bank = dependencies.bank;
  }

  async handle(input: unknown, principal: Principal): Promise<AcceptedCommandResponse> {
    const command = parseAuthorityCommand(input);

    return this.repository.transaction(async (tx) => {
      const projection = await tx.lockLearner(principal.learnerId);
      if (projection.learnerId !== principal.learnerId) {
        throw forbidden();
      }

      const duplicate = await tx.findAcceptedByIdempotency(
        principal.learnerId,
        command.envelope.idempotencyKey,
      );
      if (duplicate !== null) {
        return AcceptedCommandResponseSchema.parse(duplicate.result);
      }
      if (projection.sequence !== command.envelope.expectedStreamVersion) {
        throw streamConflict(projection.sequence);
      }
      if (command.envelope.contentRelease !== this.bank.contentRelease) {
        throw new AuthorityKernelError({
          code: 'content_version_conflict',
          message: 'The content release is no longer current.',
        });
      }

      const authority = new Authority(this.bank, this.clock);
      const state = learnerStateFromProjection(projection);
      const application = applyAuthorityCommand(authority, state, command);
      const sequence = projection.sequence + 1;
      const acceptedAt = this.clock.now();
      state.nextSequence = sequence;

      const response = AcceptedCommandResponseSchema.parse({
        eventId: command.envelope.eventId,
        sequence,
        streamVersion: sequence,
        acceptedAt,
      });
      const policyVersions = Object.fromEntries(
        activePolicyVersions().map(({ policyId, version }) => [policyId, version]),
      );
      const accepted: AcceptedCommand = {
        eventId: command.envelope.eventId,
        learnerId: principal.learnerId,
        idempotencyKey: command.envelope.idempotencyKey,
        sequence,
        acceptedAt,
        eventType: application.eventType,
        contentRelease: this.bank.contentRelease,
        policyVersions,
        payload: application.payload,
        result: toJsonObject(response),
      };
      const outbox: OutboxRecord = {
        outboxId: command.envelope.eventId,
        learnerId: principal.learnerId,
        sequence,
        topic: 'learner.command.accepted',
        payload: toJsonObject({
          eventId: command.envelope.eventId,
          eventType: application.eventType,
          contentRelease: this.bank.contentRelease,
          policyVersions,
        }),
        createdAt: acceptedAt,
        publishedAt: null,
        attempts: 0,
      };

      await tx.appendAccepted(accepted);
      await tx.saveProjection(toProjectionRecord(state, sequence, acceptedAt));
      await tx.appendOutbox(outbox);
      return response;
    });
  }

  async snapshot(principal: Principal, learnerId = principal.learnerId) {
    if (learnerId !== principal.learnerId) {
      throw forbidden();
    }
    const projection = await this.repository.loadProjection(principal.learnerId);
    if (projection === null) {
      throw notFound();
    }
    const authority = new Authority(this.bank, this.clock);
    const state = learnerStateFromProjection(projection);
    return buildLearnerSnapshot(authority, state, projection.sequence);
  }
}
