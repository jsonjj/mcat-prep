import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button, Stack } from '@mcat/ui-web';
import { useSignIn } from '../../app/auth-queries';
import { AuthCard } from './AuthCard';
import { GoogleButton } from './GoogleButton';

export function SignIn() {
  const navigate = useNavigate();
  const location = useLocation();
  const signIn = useSignIn();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Where the guard bounced us from, so signing in resumes the interrupted
  // journey instead of always dumping the learner on the home tab.
  const from = (location.state as { from?: string } | null)?.from ?? '/app';

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    signIn.mutate({ email, password }, { onSuccess: () => navigate(from, { replace: true }) });
  };

  return (
    <AuthCard
      eyebrow="Welcome back"
      title="Sign in to keep going."
      error={signIn.error}
      footer={
        <p className="mc-fineprint mc-muted">
          New here? <Link to="/signup">Create an account</Link>
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
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Stack>

          <Button variant="primary" size="lg" fullWidth type="submit" disabled={signIn.isPending}>
            {signIn.isPending ? 'Signing in…' : 'Sign in'}
          </Button>

          <p className="mc-fineprint mc-muted">
            <Link to="/forgot-password">Forgot your password?</Link>
          </p>

          <GoogleButton label="Sign in with Google" />
        </Stack>
      </form>
    </AuthCard>
  );
}
