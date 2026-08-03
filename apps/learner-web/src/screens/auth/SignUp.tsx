import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Stack } from '@mcat/ui-web';
import { useSignUp } from '../../app/auth-queries';
import { AuthCard } from './AuthCard';
import { GoogleButton } from './GoogleButton';

export function SignUp() {
  const navigate = useNavigate();
  const signUp = useSignUp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    signUp.mutate(
      { email, password },
      {
        onSuccess: (outcome) => {
          // A project with email confirmation off signs the learner in during the
          // mutation, so there is nothing to confirm and we go straight in.
          if (outcome.status === 'signed_in') navigate('/app', { replace: true });
          else navigate('/check-email', { replace: true, state: { email } });
        },
      },
    );
  };

  return (
    <AuthCard
      eyebrow="Create your account"
      title="Your progress, saved from the first question."
      intro="We keep your evidence private and use it only to plan your studying."
      error={signUp.error}
      footer={
        <p className="mc-fineprint mc-muted">
          Already have an account? <Link to="/signin">Sign in</Link>
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

          <Stack gap={2}>
            <label className="mc-label" htmlFor="password">
              Password
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
              aria-describedby="password-hint"
            />
            <p id="password-hint" className="mc-fineprint mc-muted">
              At least 8 characters. Your provider may ask for more.
            </p>
          </Stack>

          <Button variant="primary" size="lg" fullWidth type="submit" disabled={signUp.isPending}>
            {signUp.isPending ? 'Creating your account…' : 'Create account'}
          </Button>

          <GoogleButton label="Sign up with Google" />
        </Stack>
      </form>
    </AuthCard>
  );
}
