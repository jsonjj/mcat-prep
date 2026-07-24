import {
  lazy,
  Suspense,
  useEffect,
  useState,
  type ComponentType,
  type LazyExoticComponent,
} from 'react';
import { Button, Card, Eyebrow, useTheme } from '@mcat/ui-web';
import { getAppNativeLesson, LessonRenderer } from './app-native';
import { CanvasStateScope, canvasStateStorageKey } from './canvas-sdk';
import { DRAFT_LESSONS, DraftLessonRenderer, getDraftLesson } from './draft';

interface LessonRuntimeProps {
  reviewMode: boolean;
}

interface LessonEntry {
  slug: string;
  id: string;
  title: string;
  internalTitle: string;
  description: string;
  subject: string;
  kcs: number;
  component: LazyExoticComponent<ComponentType<LessonRuntimeProps>>;
}

const LESSONS: LessonEntry[] = [
  {
    slug: 'biological-redox',
    id: 'V3-LES-329622',
    title: 'Follow electrons through biological redox',
    internalTitle: 'Trace biological redox carriers and centers',
    description:
      'Practice recognizing oxidation, reduction, electron carriers, and redox centers in living systems.',
    subject: 'Chemical & physical foundations',
    kcs: 1,
    component: lazy(() => import('./lessons/biological-redox')),
  },
  {
    slug: 'research-design',
    id: 'V3-LES-765609',
    title: 'Design studies and judge conclusions',
    internalTitle: 'Research questions, design, and inference limits',
    description:
      'Connect research questions to variables, sampling, ethics, and the claims a study can support.',
    subject: 'Scientific inquiry',
    kcs: 5,
    component: lazy(() => import('./lessons/research-design')),
  },
  {
    slug: 'geometrical-optics',
    id: 'V3-LES-443492',
    title: 'Predict images with lenses and mirrors',
    internalTitle: 'Geometrical optics and image formation',
    description:
      'Use ray diagrams and sign conventions to predict image position, size, and orientation.',
    subject: 'Chemical & physical foundations',
    kcs: 5,
    component: lazy(() => import('./lessons/geometrical-optics')),
  },
  {
    slug: 'associative-learning',
    id: 'V3-LES-225658',
    title: 'Connect cues, consequences, and behavior',
    internalTitle: 'Discriminate and model associative learning',
    description:
      'Distinguish classical and operant conditioning, then apply reinforcement and punishment rules.',
    subject: 'Psychological & social foundations',
    kcs: 4,
    component: lazy(() => import('./lessons/associative-learning')),
  },
  {
    slug: 'argument-structure',
    id: 'V3-LES-386478',
    title: 'Map the structure of an argument',
    internalTitle: 'Reconstruct argument structure',
    description: 'Identify claims, evidence, assumptions, and transitions in a CARS-style passage.',
    subject: 'Critical analysis & reasoning',
    kcs: 3,
    component: lazy(() => import('./lessons/argument-structure')),
  },
];

interface ViewerRoute {
  slug: string | null;
  kind: 'app-native' | 'handcrafted' | 'draft' | null;
  reviewMode: boolean;
}

const flagIsEnabled = (params: URLSearchParams, name: string): boolean => {
  if (!params.has(name)) return false;
  const value = params.get(name)?.trim().toLowerCase() ?? '';
  return !['0', 'false', 'no', 'off'].includes(value);
};

const hasReviewFlag = (params: URLSearchParams): boolean => {
  const mode = params.get('mode')?.trim().toLowerCase();
  return (
    flagIsEnabled(params, 'review') ||
    flagIsEnabled(params, 'reviewer') ||
    flagIsEnabled(params, 'dev') ||
    mode === 'review' ||
    mode === 'reviewer' ||
    mode === 'dev'
  );
};

const routeFromLocation = (): ViewerRoute => {
  const hash = window.location.hash.replace(/^#/, '');
  const queryStart = hash.indexOf('?');
  const hashPath = queryStart === -1 ? hash : hash.slice(0, queryStart);
  const hashQuery = queryStart === -1 ? '' : hash.slice(queryStart + 1);
  const segments = hashPath.split('/').filter(Boolean);

  const reviewRootPath = segments[0] === 'review';
  const reviewAppNativePath =
    reviewRootPath && segments[1] === 'app-native' && segments.length === 3;
  const reviewLegacyPath = reviewRootPath && segments[1] === 'legacy' && segments.length === 3;
  const reviewDraftPath = reviewRootPath && segments[1] === 'draft' && segments.length === 3;
  const appNativePath = segments[0] === 'app-native' && segments.length === 2;
  const reviewPath = reviewRootPath && segments.length <= 2;
  const lessonPath = segments[0] === 'lesson' && segments.length === 2;
  let slug: string | null = null;
  let kind: ViewerRoute['kind'] = null;

  if (reviewAppNativePath) {
    slug = segments[2] ?? null;
    kind = 'app-native';
  } else if (reviewLegacyPath) {
    slug = segments[2] ?? null;
    kind = 'handcrafted';
  } else if (reviewDraftPath) {
    slug = segments[2] ?? null;
    kind = 'draft';
  } else if (appNativePath) {
    slug = segments[1] ?? null;
    kind = 'app-native';
  } else if (reviewPath && segments.length === 2) {
    // Reviewer-only compatibility alias retained for the legacy evaluator and
    // family-exposure checks. New reviewer picker links use /review/app-native.
    slug = segments[1] ?? null;
    kind = 'handcrafted';
  } else if (lessonPath) {
    slug = segments[1] ?? null;
    kind = getAppNativeLesson(slug) === null ? 'handcrafted' : 'app-native';
  }

  return {
    slug,
    kind,
    reviewMode:
      reviewRootPath ||
      reviewPath ||
      reviewDraftPath ||
      hasReviewFlag(new URLSearchParams(window.location.search)) ||
      hasReviewFlag(new URLSearchParams(hashQuery)),
  };
};

function ThemeToggle({ inMenu = false }: { inMenu?: boolean }) {
  const { resolved, setPreference } = useTheme();
  const nextTheme = resolved === 'dark' ? 'light' : 'dark';
  const label = `Switch to ${nextTheme} theme`;

  return (
    <button
      type="button"
      className={inMenu ? 'lv-menu-action' : 'lv-icon-button'}
      aria-label={label}
      title={label}
      onClick={() => setPreference(nextTheme)}
    >
      {resolved === 'dark' ? (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="3.5" />
          <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M20 15.2A8.5 8.5 0 0 1 8.8 4a8.5 8.5 0 1 0 11.2 11.2Z" />
        </svg>
      )}
      <span className={inMenu ? undefined : 'lv-sr-only'}>{label}</span>
    </button>
  );
}

function clearLessonState(scope: string) {
  const prefix = canvasStateStorageKey(scope, '');
  const doomed: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key !== null && key.startsWith(prefix)) doomed.push(key);
  }
  doomed.forEach((key) => localStorage.removeItem(key));
}

export function App() {
  const [route, setRoute] = useState<ViewerRoute>(routeFromLocation);
  const [resetNonce, setResetNonce] = useState(0);

  useEffect(() => {
    const syncRoute = () => setRoute(routeFromLocation());
    window.addEventListener('hashchange', syncRoute);
    window.addEventListener('popstate', syncRoute);
    return () => {
      window.removeEventListener('hashchange', syncRoute);
      window.removeEventListener('popstate', syncRoute);
    };
  }, []);

  const active =
    route.kind === 'handcrafted'
      ? (LESSONS.find((lesson) => lesson.slug === route.slug) ?? null)
      : null;
  const activeAppNative = route.kind === 'app-native' ? getAppNativeLesson(route.slug) : null;
  const activeDraft = route.kind === 'draft' ? getDraftLesson(route.slug) : null;
  const reviewMode = route.reviewMode;
  const lessonIndexHref = reviewMode ? '#/review' : '#/';

  useEffect(() => {
    document.documentElement.dataset.viewerMode = reviewMode ? 'reviewer' : 'learner';
    const activeTitle =
      activeAppNative?.script.title ?? active?.title ?? activeDraft?.metadata.title;
    document.title = activeTitle ? `${activeTitle} | MCAT Mastery` : 'Lessons | MCAT Mastery';

    return () => {
      delete document.documentElement.dataset.viewerMode;
    };
  }, [active, activeAppNative, activeDraft, reviewMode]);

  if (activeAppNative) {
    return (
      <LessonRenderer
        key={`${activeAppNative.script.id}:${activeAppNative.script.contentVersion}`}
        script={activeAppNative.script}
        presentation={activeAppNative.presentation}
        lessonIndexHref={lessonIndexHref}
      />
    );
  }

  if (active) {
    const LessonComponent = active.component;
    return (
      <div
        className="lv-shell lv-shell--lesson"
        data-viewer-mode={reviewMode ? 'reviewer' : 'learner'}
      >
        <header className="lv-topbar lv-topbar--lesson">
          <a className="lv-back-link" href={lessonIndexHref} aria-label="Back to lessons">
            <span aria-hidden="true">←</span>
            <span>Lessons</span>
          </a>
          <p className="lv-current-title" title={`${active.subject} lesson`}>
            {active.subject}
          </p>
          <div className="lv-topbar__actions">
            {reviewMode ? <span className="lv-review-chip">Review</span> : null}
            <details className="lv-options">
              <summary>
                <span aria-hidden="true">•••</span>
                <span className="lv-sr-only">Lesson options</span>
              </summary>
              <div className="lv-options__menu">
                <ThemeToggle inMenu />
                <Button
                  variant="text"
                  className="lv-start-over"
                  onClick={() => {
                    clearLessonState(active.slug);
                    setResetNonce((nonce) => nonce + 1);
                  }}
                >
                  Start lesson over
                </Button>
              </div>
            </details>
          </div>
        </header>

        {reviewMode ? (
          <aside className="lv-review-notice" aria-label="Reviewer workspace">
            <strong>Reviewer workspace</strong>
            <span>
              {active.id} · {active.internalTitle} · {active.kcs} knowledge component
              {active.kcs === 1 ? '' : 's'}
            </span>
          </aside>
        ) : null}

        <main className="lv-lesson-frame cv-root">
          <Suspense
            fallback={
              <div className="lv-loading" role="status">
                Loading lesson…
              </div>
            }
          >
            <CanvasStateScope id={active.slug} key={`${active.slug}-${resetNonce}`}>
              <LessonComponent reviewMode={reviewMode} />
            </CanvasStateScope>
          </Suspense>
        </main>
      </div>
    );
  }

  if (activeDraft) {
    const draftScope = `draft-${activeDraft.metadata.slug}`;
    return (
      <div
        className="lv-shell lv-shell--lesson"
        data-viewer-mode={reviewMode ? 'reviewer' : 'learner'}
      >
        <header className="lv-topbar lv-topbar--lesson">
          <a className="lv-back-link" href={lessonIndexHref} aria-label="Back to lessons">
            <span aria-hidden="true">←</span>
            <span>Lessons</span>
          </a>
          <p className="lv-current-title" title={activeDraft.metadata.title}>
            {activeDraft.metadata.title}
          </p>
          <div className="lv-topbar__actions">
            <span className="draft-internal-label">Internal draft</span>
            {reviewMode ? <span className="lv-review-chip">Review</span> : null}
            <details className="lv-options">
              <summary>
                <span aria-hidden="true">•••</span>
                <span className="lv-sr-only">Lesson options</span>
              </summary>
              <div className="lv-options__menu">
                <ThemeToggle inMenu />
                <Button
                  variant="text"
                  className="lv-start-over"
                  onClick={() => {
                    clearLessonState(draftScope);
                    setResetNonce((nonce) => nonce + 1);
                  }}
                >
                  Start lesson over
                </Button>
              </div>
            </details>
          </div>
        </header>

        {reviewMode ? (
          <aside className="lv-review-notice" aria-label="Reviewer workspace">
            <strong>Reviewer workspace</strong>
            <span>
              {activeDraft.metadata.id} · {activeDraft.metadata.internalTitle} ·{' '}
              {activeDraft.knowledgeComponents.length} knowledge component
              {activeDraft.knowledgeComponents.length === 1 ? '' : 's'}
            </span>
          </aside>
        ) : null}

        <main className="lv-lesson-frame cv-root">
          <CanvasStateScope id={draftScope} key={`${draftScope}-${resetNonce}`}>
            <DraftLessonRenderer lesson={activeDraft} lessonIndexHref={lessonIndexHref} />
          </CanvasStateScope>
        </main>
      </div>
    );
  }

  return (
    <div
      className="lv-shell lv-shell--picker"
      data-viewer-mode={reviewMode ? 'reviewer' : 'learner'}
    >
      <header className="lv-topbar lv-topbar--picker">
        <a className="lv-brand" href={lessonIndexHref} aria-label="MCAT Mastery lessons">
          MCAT Mastery
        </a>
        <ThemeToggle />
      </header>

      <main className="lv-picker">
        <section className="lv-picker__intro">
          <Eyebrow>{reviewMode ? 'Reviewer workspace' : 'Focused MCAT practice'}</Eyebrow>
          <h1 className="lv-title">
            {reviewMode ? 'Choose a lesson to review' : 'Choose your next lesson'}
          </h1>
          <p>
            {reviewMode
              ? 'Review the app-native candidates, or open a quarantined legacy canvas for QA comparison.'
              : 'Build your reasoning with one focused lesson at a time. Your progress is saved on this device.'}
          </p>
        </section>

        {reviewMode ? (
          <aside className="lv-review-notice" aria-label="Review mode enabled">
            <strong>Review mode is enabled</strong>
            <span>
              App-native candidates stay learner-clean. Legacy evaluator surfaces remain available
              from explicit comparison links.
            </span>
          </aside>
        ) : null}

        <section className="lv-lesson-grid" aria-label="Available lessons">
          {LESSONS.map((lesson) => {
            const appNative = getAppNativeLesson(lesson.slug);
            const description = appNative?.script.description ?? lesson.description;
            return (
              <Card key={lesson.slug} as="article" className="lv-lesson-card" elevated={false}>
                <div className="lv-lesson-card__topline">
                  <span className="lv-lesson-subject">{lesson.subject}</span>
                  {reviewMode ? <span className="lv-review-meta">{lesson.id}</span> : null}
                </div>
                <h2>{lesson.title}</h2>
                <p className="lv-lesson-description">{description}</p>
                <div className="lv-lesson-card__footer">
                  <span className="lv-lesson-length">
                    {appNative !== null
                      ? `About ${appNative.script.estimatedMinutes} minutes`
                      : reviewMode
                        ? `${lesson.kcs} knowledge component${lesson.kcs === 1 ? '' : 's'}`
                        : lesson.kcs === 1
                          ? 'Focused lesson'
                          : `${lesson.kcs}-part lesson`}
                  </span>
                  {reviewMode && appNative !== null ? (
                    <div className="lv-candidate-actions">
                      <a
                        className="lv-lesson-action"
                        href={`#/review/app-native/${lesson.slug}`}
                        aria-label={`Review app-native candidate ${lesson.title}`}
                      >
                        Review candidate
                        <span aria-hidden="true">→</span>
                      </a>
                      <a
                        className="lv-legacy-action"
                        href={`#/review/legacy/${lesson.slug}`}
                        aria-label={`Open legacy canvas for ${lesson.title}`}
                      >
                        Legacy canvas
                      </a>
                    </div>
                  ) : (
                    <a
                      className="lv-lesson-action"
                      href={reviewMode ? `#/review/${lesson.slug}` : `#/lesson/${lesson.slug}`}
                      aria-label={`${reviewMode ? 'Review' : 'Start'} ${lesson.title}`}
                    >
                      {reviewMode ? 'Review lesson' : 'Start lesson'}
                      <span aria-hidden="true">→</span>
                    </a>
                  )}
                </div>
              </Card>
            );
          })}
        </section>

        {reviewMode ? (
          <section className="draft-picker-section" aria-labelledby="draft-preview-heading">
            <div className="draft-picker-heading">
              <div>
                <h2 id="draft-preview-heading">Draft lesson previews</h2>
                <p>
                  Data-driven lesson concepts for checking instructional flow, visuals, and learner
                  interactions.
                </p>
              </div>
              <span className="draft-internal-label">Internal draft</span>
            </div>

            <div className="lv-lesson-grid" aria-label="Available draft lesson previews">
              {DRAFT_LESSONS.map((lesson) => (
                <Card
                  key={lesson.metadata.slug}
                  as="article"
                  className="lv-lesson-card"
                  elevated={false}
                >
                  <div className="lv-lesson-card__topline">
                    <span className="lv-lesson-subject">{lesson.metadata.subject}</span>
                    <span className="lv-review-meta">{lesson.metadata.id}</span>
                  </div>
                  <h2>{lesson.metadata.title}</h2>
                  <p className="lv-lesson-description">{lesson.metadata.description}</p>
                  <div className="lv-lesson-card__footer">
                    <span className="lv-lesson-length">
                      {`${lesson.knowledgeComponents.length} knowledge component${
                        Number(lesson.knowledgeComponents.length) === 1 ? '' : 's'
                      }`}
                    </span>
                    <a
                      className="lv-lesson-action"
                      href={`#/review/draft/${lesson.metadata.slug}`}
                      aria-label={`Review draft ${lesson.metadata.title}`}
                    >
                      Review draft
                      <span aria-hidden="true">→</span>
                    </a>
                  </div>
                </Card>
              ))}
            </div>
            <p className="draft-picker-note">
              Internal-only limitation: answers remain inspectable in the client bundle even though
              they are not rendered before submission. This preview path is not production-safe.
            </p>
          </section>
        ) : null}
      </main>
    </div>
  );
}
