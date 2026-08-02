import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Stack } from '@mcat/ui-web';
import { useRequestPasswordReset } from '../../app/auth-queries';
import { AuthCard } from './AuthCard';

/**
 * Requests a reset link and nothing more. The second half of recovery — choosing
 * the new password — happens on the callback route the link lands on, because the
 * link is what authorises the change and a learner who opens it on their phone
 * should not need the tab they started in.
 */
export function ForgotPassword() {
  const navigate = useNavigate();
  const request = useRequestPasswordReset();
  const [email, setEmail] = useState('');

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    // Move on regardless of whether the address is registered: the destination
    // must not reveal which addresses have accounts.
    request.mutate(email, {
      onSuccess: () => navigate('/check-email', { replace: true, state: { email } }),
    });
  };

  return (
    <AuthCard
      eyebrow="Password reset"
      title="We’ll email you a reset link."
      error={request.error}
      footer={
        <p className="mc-fineprint mc-muted">
          Remembered it? <Link to="/signin">Sign in</Link>
        </p>
      }
    >
      <form onSubmit={onSubmit}>
        <Stack gap={4}>
          <Stack gap={2}>
            <label className="mc-label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              className="mc-input"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Stack>
          <Button variant="primary" size="lg" fullWidth type="submit" disabled={request.isPending}>
            {request.isPending ? 'Sending…' : 'Send reset link'}
          </Button>
        </Stack>
      </form>
    </AuthCard>
  );
}
