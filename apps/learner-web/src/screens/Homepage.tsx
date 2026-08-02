import type { ComponentType, SVGProps } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Card, Eyebrow, Stack, useTheme } from '@mcat/ui-web';
import { useBootstrap } from '../app/queries';
import { BrainAtlas } from '../components/BrainAtlas';
import { IconMistakesX, IconMoon, IconProgress, IconSun, IconToday } from '../components/icons';

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

const PILLARS: Array<{ eyebrow: string; title: string; body: string; Icon: IconComponent }> = [
  {
    eyebrow: 'Diagnose before reveal',
    title: 'Name what failed before you read the explanation.',
    body: 'Every miss asks whether it came from content, setup, representation, execution, or inference — so the fix targets the actual break, not the topic label.',
    Icon: IconMistakesX,
  },
  {
    eyebrow: 'Help fades, proof gets harder',
    title: 'Assisted work and independent evidence stay separate.',
    body: 'Scaffolded practice teaches. Mastery is only claimed once you have shown the same reasoning unaided, in a new context, after time has passed.',
    Icon: IconProgress,
  },
  {
    eyebrow: 'One next task, with reasons',
    title: 'Your plan says why today’s task comes next.',
    body: 'Prerequisites, unresolved errors, stale evidence, and the time you actually have all feed one calm recommendation you can act on.',
    Icon: IconToday,
  },
];

/**
 * The public front door. Everything past it requires an account, so this page has
 * exactly one job: explain what the app claims and hand the visitor to sign-up or
 * sign-in. It reads bootstrap only to bounce an already-signed-in learner onward.
 */
export function Homepage() {
  const bootstrap = useBootstrap();
  const { resolved, setPreference } = useTheme();

  if (bootstrap.data?.authenticated) return <Navigate to="/app" replace />;

  return (
    <div className="mc-landing">
      <header className="mc-landing__header">
        <span className="mc-brand">
          <span className="mc-brand__mark" aria-hidden="true" />
          <span className="mc-brand__name">MCAT Mastery</span>
        </span>
        <div className="mc-landing__header-actions">
          <button
            type="button"
            className="mc-iconbtn"
            aria-label={resolved === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            onClick={() => setPreference(resolved === 'dark' ? 'light' : 'dark')}
          >
            {resolved === 'dark' ? <IconSun /> : <IconMoon />}
          </button>
          <Link className="mc-button mc-button--secondary mc-linkbtn" to="/signin">
            Sign in
          </Link>
        </div>
      </header>

      <main id="main" className="mc-landing__main">
        <section className="mc-landing__hero">
          <div className="mc-landing__hero-copy">
            <Stack gap={4}>
              <Eyebrow>Evidence-first MCAT preparation</Eyebrow>
              <h1 className="mc-landing__title">
                Know what to study next — and what counts as progress.
              </h1>
              <p className="mc-muted">
                Most prep tells you what you covered. This tells you what you can actually do, where
                the reasoning broke, and the one thing worth doing next. Your evidence is private by
                default.
              </p>
              <div className="mc-landing__cta">
                <Link
                  className="mc-button mc-button--primary mc-button--lg mc-linkbtn"
                  to="/signup"
                >
                  Create your account
                </Link>
                <Link
                  className="mc-button mc-button--secondary mc-button--lg mc-linkbtn"
                  to="/signin"
                >
                  Sign in
                </Link>
              </div>
              <p className="mc-fineprint mc-muted">
                No score is guaranteed. Placement is provisional and refines as you go.
              </p>
            </Stack>
          </div>
          <div className="mc-landing__hero-visual">
            <BrainAtlas glowing={3} />
          </div>
        </section>

        <section className="mc-landing__section" aria-labelledby="pillars-heading">
          <Stack gap={5}>
            <Stack gap={2}>
              <Eyebrow>What makes it different</Eyebrow>
              <h2 className="mc-h2" id="pillars-heading">
                Built around evidence, not completion.
              </h2>
            </Stack>
            <div className="mc-landing__grid">
              {PILLARS.map(({ eyebrow, title, body, Icon }) => (
                <Card key={eyebrow}>
                  <Stack gap={3}>
                    <Icon className="mc-landing__card-icon" aria-hidden="true" />
                    <Eyebrow>{eyebrow}</Eyebrow>
                    <h3 className="mc-h3">{title}</h3>
                    <p className="mc-muted">{body}</p>
                  </Stack>
                </Card>
              ))}
            </div>
          </Stack>
        </section>

        <section className="mc-landing__section mc-landing__section--closing">
          <Card elevated>
            <Stack gap={4}>
              <Eyebrow>Start where you are</Eyebrow>
              <h2 className="mc-h2">A short placement, then a plan that adapts.</h2>
              <p className="mc-muted">
                Create an account and the first thing you will see is a brief, provisional placement
                — not a graded test. Everything after it is built from what you show.
              </p>
              <div className="mc-landing__cta">
                <Link
                  className="mc-button mc-button--primary mc-button--lg mc-linkbtn"
                  to="/signup"
                >
                  Create your account
                </Link>
              </div>
            </Stack>
          </Card>
        </section>
      </main>

      <footer className="mc-landing__footer">
        <p className="mc-fineprint mc-muted">
          MCAT is a registered trademark of the AAMC, which does not endorse this product.
        </p>
      </footer>
    </div>
  );
}
