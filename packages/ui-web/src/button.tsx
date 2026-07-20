import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'text' | 'danger';
export type ButtonSize = 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  loading?: boolean;
  children: ReactNode;
}

/**
 * Accessible button. Minimum 48px target on `lg`. The primary variant carries a
 * decorative teal→periwinkle sheen over a guaranteed-contrast solid base, so the
 * label always meets contrast (unlike the pale reference button).
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', fullWidth = false, loading = false, disabled, children, className = '', ...rest },
  ref,
) {
  const classes = [
    'mc-button',
    `mc-button--${variant}`,
    `mc-button--${size}`,
    fullWidth ? 'mc-button--full' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      ref={ref}
      className={classes}
      disabled={disabled ?? loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span className="mc-button__spinner" aria-hidden="true" /> : null}
      <span className="mc-button__label">{children}</span>
    </button>
  );
});
