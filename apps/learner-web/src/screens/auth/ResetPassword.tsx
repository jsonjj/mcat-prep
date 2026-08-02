import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Button, Stack } from '@mcat/ui-web';
import { useUpdatePassword } from '../../app/auth-queries';
import { AuthCard } from './AuthCard';

/**
 * Reached only from a recovery link, and only through {@link AuthCallback}.
 *
 * There is no current-password field and no code field: the link itself is the
 * proof, and Supabase has already put the browser in a recovery session by the
 * time this renders. Setting the password also completes the sign-in, so the
 * learner does not have to type the new one straight back in.
 */
export function ResetPassword() {
  const navigate = useNavigate();
  const update = useUpdatePassword();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');

  const mismatch = confirmation !== '' && confirmation !== password;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (mismatch) return;
    update.mutate(password, { onSuccess: () => navigate('/app', { replace: true }) });
  };

  if (update.isSuccess) return <Navigate to="/app" replace />;

  return (
    <AuthCard
      eyebrow="Password reset"
      title="Choose a new password."
      intro="You’ll be signed in once it’s saved."
      error={update.error}
    >
      <form onSubmit={onSubmit}>
        <Stack gap={4}>
          <Stack gap={2}>
            <label className="mc-label" htmlFor="password">
              New password
            </label>
            <input
              id="password"
              className="mc-input"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Stack>

          <Stack gap={2}>
            <label className="mc-label" htmlFor="confirmation">
              Confirm new password
            </label>
            <input
              id="confirmation"
              className="mc-input"
              type="password"
              autoComplete="new-password"
              required
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              aria-invalid={mismatch}
              aria-describedby={mismatch ? 'confirmation-error' : undefined}
            />
            {mismatch ? (
              <p id="confirmation-error" className="mc-fineprint mc-muted">
                Those don’t match.
              </p>
            ) : null}
          </Stack>

          <Button
            variant="primary"
            size="lg"
            fullWidth
            type="submit"
            disabled={update.isPending || mismatch}
          >
            {update.isPending ? 'Saving…' : 'Save and sign in'}
          </Button>
        </Stack>
      </form>
    </AuthCard>
  );
}
