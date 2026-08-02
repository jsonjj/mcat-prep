import type { ReactNode } from 'react';
import { Callout, Card, Eyebrow, Stack } from '@mcat/ui-web';

/**
 * The shared frame for the four credential screens. They differ only in their
 * fields, so keeping the chrome in one place is what makes them look like one
 * flow rather than four pages that happen to sit next to each other.
 */
export function AuthCard({
  eyebrow,
  title,
  intro,
  error,
  children,
  footer,
}: {
  eyebrow: string;
  title: string;
  intro?: ReactNode;
  error?: unknown;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="mc-onboarding mc-auth">
      <Card elevated>
        <Stack gap={5}>
          <Stack gap={2}>
            <Eyebrow>{eyebrow}</Eyebrow>
            <h1 className="mc-h2">{title}</h1>
            {intro ? <p className="mc-muted">{intro}</p> : null}
          </Stack>
          {error ? (
            <Callout tone="warning" title="That didn’t work">
              {messageFor(error)}
            </Callout>
          ) : null}
          {children}
        </Stack>
      </Card>
      {footer ? <div className="mc-auth__footer">{footer}</div> : null}
    </div>
  );
}

/**
 * The authority already writes learner-facing error copy and deliberately keeps
 * credential failures vague, so we surface its message as-is rather than
 * re-interpreting it here — anything more specific would leak what it withheld.
 */
function messageFor(error: unknown): string {
  if (error instanceof Error && error.message.trim() !== '') return error.message;
  return 'Something went wrong. Please try again.';
}
