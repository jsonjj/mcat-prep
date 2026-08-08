// @vitest-environment jsdom
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { ThemeProvider } from '@mcat/ui-web';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from './router';

const bootstrap = vi.hoisted(() => vi.fn());

vi.mock('./queries', () => ({ useBootstrap: () => bootstrap() }));
vi.mock('../screens/Home', () => ({ Home: () => 'Production home route' }));
vi.mock('../screens/OnboardingStart', () => ({
  OnboardingStart: () => 'Production onboarding route',
}));
vi.mock('../screens/auth/SignIn', () => ({ SignIn: () => 'Production sign-in route' }));
vi.mock('../screens/Curriculum', () => ({ Curriculum: () => 'Production curriculum route' }));
vi.mock('../screens/VectorLesson', () => ({ VectorLesson: () => 'Production vector route' }));
vi.mock('../screens/CatalogLesson', () => ({
  CatalogLesson: ({ lessonId }: { lessonId: string }) => `Production catalog route ${lessonId}`,
}));

/**
 * React Router's memory navigation only reads these Request fields for this
 * loader-free tree. jsdom supplies a DOM AbortSignal while Node's native Request
 * insists on its own realm's signal, so a narrow same-realm request stand-in keeps
 * redirect navigation deterministic without replacing any route behavior.
 */
class MemoryNavigationRequest {
  readonly url: string;
  readonly method: string;
  readonly signal: AbortSignal | null;

  constructor(input: string | URL | { readonly url: string }, init: RequestInit = {}) {
    this.url = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
    this.method = init.method ?? 'GET';
    this.signal = init.signal ?? null;
  }
}

type RenderedRoute = {
  readonly renderer: ReactTestRenderer;
  readonly router: ReturnType<typeof createMemoryRouter>;
};

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

async function renderProductionRoute(path: string): Promise<RenderedRoute> {
  const router = createMemoryRouter(APP_ROUTES, {
    initialEntries: [path],
    future: { v7_relativeSplatPath: true },
  });
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(
      createElement(ThemeProvider, {
        initial: 'light',
        children: createElement(RouterProvider, {
          router,
          future: { v7_startTransition: true },
        }),
      }),
    );
  });
  await act(async () => {});
  return { renderer, router };
}

beforeEach(() => {
  bootstrap.mockReset();
});

beforeAll(() => {
  vi.stubGlobal('Request', MemoryNavigationRequest);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('production app route layouts', () => {
  it('renders /app through the ordinary AppShell chrome', async () => {
    bootstrap.mockReturnValue({
      isLoading: false,
      data: { authenticated: true, onboardingComplete: true },
      error: null,
    });

    const { renderer, router } = await renderProductionRoute('/app');

    expect(textOf(renderer.toJSON())).toContain('Production home route');
    expect(renderer.root.findAllByProps({ className: 'mc-shell' })).toHaveLength(1);
    expect(renderer.root.findAllByProps({ className: 'mc-sidebar' })).toHaveLength(1);
    expect(renderer.root.findAllByProps({ className: 'mc-bottomnav' })).toHaveLength(1);
    expect(textOf(renderer.toJSON())).toContain('Account');
    expect(textOf(renderer.toJSON())).toContain('Today');
    expect(textOf(renderer.toJSON())).toContain('Practice');
    expect(textOf(renderer.toJSON())).toContain('Recall');
    router.dispose();
  });

  it('renders a production lesson URL through FocusedLessonShell without global chrome', async () => {
    bootstrap.mockReturnValue({
      isLoading: false,
      data: { authenticated: true, onboardingComplete: true },
      error: null,
    });

    const { renderer, router } = await renderProductionRoute('/app/lessons/v3-les-789208');
    const rendered = textOf(renderer.toJSON());

    expect(rendered).toContain('Production catalog route V3-LES-789208');
    expect(renderer.root.findAllByProps({ className: 'mc-focused-lesson-shell' })).toHaveLength(1);
    expect(renderer.root.findAllByProps({ className: 'mc-shell' })).toHaveLength(0);
    expect(renderer.root.findAllByProps({ className: 'mc-sidebar' })).toHaveLength(0);
    expect(renderer.root.findAllByProps({ className: 'mc-bottomnav' })).toHaveLength(0);
    expect(rendered).not.toContain('Account');
    expect(rendered).not.toContain('Today');
    expect(rendered).not.toContain('Practice');
    expect(rendered).not.toContain('Recall');
    router.dispose();
  });

  it('preserves auth redirect and lesson deep-link state on the production tree', async () => {
    bootstrap.mockReturnValue({
      isLoading: false,
      data: { authenticated: false },
      error: null,
    });

    const deepLink = '/app/lessons/v3-les-789208';
    const { renderer, router } = await renderProductionRoute(deepLink);

    expect(router.state.location.pathname).toBe('/signin');
    expect(router.state.location.state).toEqual({ from: deepLink });
    expect(textOf(renderer.toJSON())).toContain('Production sign-in route');
    expect(textOf(renderer.toJSON())).not.toContain('Production catalog route');
    router.dispose();
  });

  it('preserves mandatory onboarding redirect on the production tree', async () => {
    bootstrap.mockReturnValue({
      isLoading: false,
      data: { authenticated: true, onboardingComplete: false },
      error: null,
    });

    const { renderer, router } = await renderProductionRoute('/app/lessons/v3-les-789208');

    expect(router.state.location.pathname).toBe('/onboarding');
    expect(textOf(renderer.toJSON())).toContain('Production onboarding route');
    expect(textOf(renderer.toJSON())).not.toContain('Production catalog route');
    router.dispose();
  });
});
