import type { IncomingMessage, ServerResponse } from 'node:http';
import { BetaLeadError, BetaLeadStore } from './beta-lead-store';
import {
  RequestBodyError,
  clientId,
  isJsonRequest,
  isSameOriginRequest,
  readJsonBody,
  writeJson,
} from './snapshot-api';

export const betaLeadStore = new BetaLeadStore();

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function handleBetaLeadRequest(
  request: IncomingMessage,
  response: ServerResponse,
  store: BetaLeadStore = betaLeadStore,
) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    writeJson(response, 405, { error: 'Use POST to request beta updates.' });
    return;
  }
  if (!isSameOriginRequest(request) || !isJsonRequest(request)) {
    writeJson(response, 403, { error: 'This beta-update request was not accepted.' });
    return;
  }

  void readJsonBody(request)
    .then(async (body) => {
      if (!isObject(body)) {
        throw new BetaLeadError('This beta-update request is invalid.', 400);
      }
      if (typeof body.website === 'string' && body.website.trim()) {
        writeJson(response, 202, { status: 'subscribed' });
        return;
      }

      const result = await store.subscribe(
        {
          email: body.email,
          source: body.source,
          consent: body.consent,
        },
        clientId(request),
      );
      writeJson(response, result.status === 'subscribed' ? 201 : 200, result);
    })
    .catch((error: unknown) => {
      if (error instanceof RequestBodyError) {
        writeJson(response, error.status, { error: error.message });
        return;
      }
      if (error instanceof BetaLeadError) {
        if (error.retryAfterSeconds) {
          response.setHeader('Retry-After', String(error.retryAfterSeconds));
        }
        writeJson(response, error.status, { error: error.message });
        return;
      }
      writeJson(response, 500, {
        error: 'Your email could not be saved right now. Please try again.',
      });
    });
}
