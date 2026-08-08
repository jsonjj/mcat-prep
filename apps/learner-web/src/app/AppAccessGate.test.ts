// @vitest-environment jsdom
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppAccessGate } from './AppAccessGate';

const bootstrap = vi.fn();
vi.mock('./queries', () => ({ useBootstrap: () => bootstrap() }));

const textOf = (node: unknown): string => {
  const strings: string[] = [];
  const walk = (value: unknown): void => {
    if (typeof value === 'string') strings.push(value);
    else if (Array.isArray(value)) value.forEach(walk);
    else if (value !== null && typeof value === 'object' && 'children' in value) {
      walk((value as { children: unknown }).children);
    }
  };
  walk(node);
  return strings.join(' ');
};

async function renderGate(): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(
      createElement(
        MemoryRouter,
        {
          initialEntries: ['/app/lessons/v3-les-789208'],
          future: { v7_startTransition: true, v7_relativeSplatPath: true },
        },
        createElement(
          Routes,
          null,
          createElement(
            Route,
            { path: '/app', element: createElement(AppAccessGate) },
            createElement(Route, {
              path: 'lessons/v3-les-789208',
              element: createElement('p', null, 'Focused lesson destination'),
            }),
          ),
          createElement(Route, {
            path: '/signin',
            element: createElement('p', null, 'Sign-in destination'),
          }),
          createElement(Route, {
            path: '/onboarding',
            element: createElement('p', null, 'Mandatory placement destination'),
          }),
        ),
      ),
    );
  });
  return renderer;
}

beforeEach(() => bootstrap.mockReset());

describe('AppAccessGate', () => {
  it('admits a linked learner only after mandatory placement and plan onboarding', async () => {
    bootstrap.mockReturnValue({
      isLoading: false,
      data: { authenticated: true, onboardingComplete: true },
      error: null,
    });

    expect(textOf((await renderGate()).toJSON())).toContain('Focused lesson destination');
  });

  it('preserves the mandatory onboarding redirect for an incomplete linked learner', async () => {
    bootstrap.mockReturnValue({
      isLoading: false,
      data: { authenticated: true, onboardingComplete: false },
      error: null,
    });

    const rendered = textOf((await renderGate()).toJSON());
    expect(rendered).toContain('Mandatory placement destination');
    expect(rendered).not.toContain('Focused lesson destination');
  });

  it('preserves the auth redirect for a signed-out lesson deep link', async () => {
    bootstrap.mockReturnValue({
      isLoading: false,
      data: { authenticated: false },
      error: null,
    });

    const rendered = textOf((await renderGate()).toJSON());
    expect(rendered).toContain('Sign-in destination');
    expect(rendered).not.toContain('Focused lesson destination');
  });

  it('does not reveal a lesson while bootstrap is pending', async () => {
    bootstrap.mockReturnValue({ isLoading: true, data: undefined, error: null });

    expect(textOf((await renderGate()).toJSON())).not.toContain('Focused lesson destination');
  });
});
