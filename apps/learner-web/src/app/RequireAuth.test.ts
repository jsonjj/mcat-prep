// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ApiClientError } from '@mcat/client-core';
import { RequireAuth } from './RequireAuth';

/**
 * The guard is the only thing standing between a signed-out browser and every
 * learner surface, so these cover the three answers bootstrap can give — pending,
 * signed out, signed in — plus the transport failure that must NOT be read as
 * "signed out", because bouncing on a network blip would loop the learner through
 * a sign-in they do not need.
 */

const bootstrap = vi.fn();
vi.mock('./queries', () => ({ useBootstrap: () => bootstrap() }));

async function renderGuardAt(pathname: string): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(
      createElement(
        MemoryRouter,
        { initialEntries: [pathname] },
        createElement(Routes, null, [
          createElement(Route, {
            key: 'guarded',
            path: '/app/progress',
            element: createElement(
              RequireAuth,
              null,
              createElement('span', null, 'learner surface'),
            ),
          }),
          createElement(Route, {
            key: 'signin',
            path: '/signin',
            element: createElement('span', null, 'sign in screen'),
          }),
        ]),
      ),
    );
  });
  return renderer;
}

const text = (renderer: ReactTestRenderer): string => JSON.stringify(renderer.toJSON());

describe('RequireAuth', () => {
  it('renders the learner surface for a signed-in caller', async () => {
    bootstrap.mockReturnValue({ isLoading: false, data: { authenticated: true }, error: null });

    const renderer = await renderGuardAt('/app/progress');

    expect(text(renderer)).toContain('learner surface');
  });

  it('sends a signed-out visitor to sign-in instead of the learner surface', async () => {
    bootstrap.mockReturnValue({ isLoading: false, data: { authenticated: false }, error: null });

    const renderer = await renderGuardAt('/app/progress');

    expect(text(renderer)).toContain('sign in screen');
    expect(text(renderer)).not.toContain('learner surface');
  });

  it('treats a 401 from bootstrap as signed out', async () => {
    bootstrap.mockReturnValue({
      isLoading: false,
      data: undefined,
      error: ApiClientError.from({
        code: 'unauthorized',
        message: 'A valid learner session is required.',
        requestId: 'request-1',
        retryable: false,
      }),
    });

    const renderer = await renderGuardAt('/app/progress');

    expect(text(renderer)).toContain('sign in screen');
  });

  it('does not sign a learner out over a transport failure', async () => {
    bootstrap.mockReturnValue({
      isLoading: false,
      data: undefined,
      error: ApiClientError.from({
        code: 'unavailable',
        message: 'The service is unavailable.',
        requestId: 'request-2',
        retryable: true,
      }),
    });

    const renderer = await renderGuardAt('/app/progress');

    expect(text(renderer)).not.toContain('sign in screen');
    expect(text(renderer)).not.toContain('learner surface');
  });

  it('shows nothing of the learner surface while bootstrap is still in flight', async () => {
    bootstrap.mockReturnValue({ isLoading: true, data: undefined, error: null });

    const renderer = await renderGuardAt('/app/progress');

    expect(text(renderer)).not.toContain('learner surface');
    expect(text(renderer)).not.toContain('sign in screen');
  });
});
