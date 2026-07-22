import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { BetaUpdateSource } from '../beta-update-types';
import { ArrowRightIcon, CheckIcon, CloseIcon, SparkIcon } from './icons';

interface BetaUpdatesDialogProps {
  open: boolean;
  onClose: () => void;
  source: BetaUpdateSource;
}

type SubmissionStatus = 'idle' | 'submitting' | 'subscribed' | 'already-subscribed';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function BetaUpdatesDialog({ open, onClose, source }: BetaUpdatesDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const successHeadingRef = useRef<HTMLHeadingElement>(null);
  const [status, setStatus] = useState<SubmissionStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      setStatus('idle');
      setError(null);
      dialog.showModal();
      requestAnimationFrame(() => emailInputRef.current?.focus({ preventScroll: true }));
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    if (status === 'subscribed' || status === 'already-subscribed') {
      requestAnimationFrame(() => successHeadingRef.current?.focus({ preventScroll: true }));
    }
  }, [status]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus('submitting');
    setError(null);
    const form = event.currentTarget;
    const formData = new FormData(form);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10_000);

    try {
      const response = await fetch('/api/beta-updates', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.get('email'),
          source,
          consent: formData.get('consent') === 'on',
          website: formData.get('website'),
        }),
      });
      const payload = (await response.json().catch(() => null)) as unknown;
      if (!response.ok) {
        const message =
          isObject(payload) && typeof payload.error === 'string'
            ? payload.error
            : 'Your email could not be saved right now. Please try again.';
        throw new Error(message);
      }
      const result =
        isObject(payload) && payload.status === 'already-subscribed'
          ? 'already-subscribed'
          : 'subscribed';
      setStatus(result);
      form.reset();
    } catch (requestError) {
      setStatus('idle');
      setError(
        requestError instanceof Error && requestError.name !== 'AbortError'
          ? requestError.message
          : 'The request timed out. Please try again.',
      );
    } finally {
      window.clearTimeout(timeout);
    }
  };

  const submitted = status === 'subscribed' || status === 'already-subscribed';

  return (
    <dialog
      ref={dialogRef}
      className="lp-access-dialog"
      aria-labelledby="beta-updates-title"
      onClose={onClose}
    >
      <div className="lp-access-dialog__topline">
        <span className="lp-pill lp-pill--preview">Optional · never a gate</span>
        <button className="lp-icon-button" type="button" onClick={() => dialogRef.current?.close()}>
          <span className="lp-visually-hidden">Close beta updates</span>
          <CloseIcon />
        </button>
      </div>

      {submitted ? (
        <div className="lp-access-success" role="status">
          <span className="lp-access-success__icon">
            <CheckIcon />
          </span>
          <p className="lp-eyebrow">Beta updates</p>
          <h2 id="beta-updates-title" ref={successHeadingRef} tabIndex={-1}>
            {status === 'already-subscribed'
              ? 'That email is already on the list.'
              : 'Your email is on the beta-updates list.'}
          </h2>
          <p>
            We will use it only for occasional beta-launch and product-testing updates. It is not
            linked to Snapshot answers.
          </p>
          <button
            className="lp-button lp-button--primary"
            type="button"
            onClick={() => dialogRef.current?.close()}
          >
            Continue
          </button>
        </div>
      ) : (
        <>
          <span className="lp-access-dialog__lock" aria-hidden="true">
            <SparkIcon />
          </span>
          <p className="lp-eyebrow">Optional beta updates</p>
          <h2 id="beta-updates-title">Hear when the broader app is ready to try.</h2>
          <p id="beta-updates-description" className="lp-access-dialog__intro">
            Leave your email for occasional beta-launch and product-testing updates. The Snapshot
            and its report remain available without it.
          </p>

          <form
            className="lp-access-form"
            onSubmit={(event) => void handleSubmit(event)}
            aria-describedby="beta-updates-description beta-updates-privacy"
            aria-busy={status === 'submitting'}
          >
            <label htmlFor="beta-update-email">Email address</label>
            <input
              ref={emailInputRef}
              id="beta-update-email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              maxLength={254}
              placeholder="you@example.com"
              required
            />
            <div className="lp-form-honeypot" aria-hidden="true">
              <label htmlFor="beta-update-website">Website</label>
              <input
                id="beta-update-website"
                name="website"
                type="text"
                autoComplete="off"
                tabIndex={-1}
              />
            </div>
            <label className="lp-access-form__consent">
              <input name="consent" type="checkbox" required />
              <span>
                I agree to receive occasional beta-launch and product-testing emails. I can
                unsubscribe from any message.
              </span>
            </label>
            {error ? (
              <p className="lp-access-form__error" role="alert">
                {error}
              </p>
            ) : null}
            <button
              className="lp-button lp-button--primary lp-button--full"
              type="submit"
              disabled={status === 'submitting'}
            >
              {status === 'submitting' ? 'Saving your email…' : 'Send me beta updates'}
              {status !== 'submitting' ? <ArrowRightIcon /> : null}
            </button>
          </form>

          <p id="beta-updates-privacy" className="lp-access-dialog__notice">
            Stored separately from Snapshot responses. No confirmation email is sent by this pilot.
          </p>
        </>
      )}
    </dialog>
  );
}
