import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { ThemeName } from '@mcat/design-tokens';

export type ThemePreference = ThemeName | 'system';

interface ThemeContextValue {
  preference: ThemePreference;
  resolved: ThemeName;
  setPreference: (p: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);
const STORAGE_KEY = 'mc.theme';

const systemTheme = (): ThemeName =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';

const resolve = (p: ThemePreference): ThemeName => (p === 'system' ? systemTheme() : p);

const applyTheme = (theme: ThemeName): void => {
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = theme;
  }
};

export function ThemeProvider({
  children,
  initial = 'system',
}: {
  children: ReactNode;
  initial?: ThemePreference;
}) {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => {
    if (typeof localStorage === 'undefined') return initial;
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : initial;
  });

  const resolved = resolve(preference);

  useEffect(() => {
    applyTheme(resolved);
  }, [resolved]);

  useEffect(() => {
    if (preference !== 'system' || typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme(systemTheme());
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [preference]);

  const setPreference = useCallback((p: ThemePreference) => {
    setPreferenceState(p);
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, p);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ preference, resolved, setPreference }),
    [preference, resolved, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (ctx === null) throw new Error('useTheme must be used within <ThemeProvider>');
  return ctx;
}

/** Inline script (string) for the HTML <head> to set the theme before first paint (no FOUC). */
export const themeBootstrapScript = `(function(){try{var t=localStorage.getItem('${STORAGE_KEY}');var d=t==='dark'||((t===null||t==='system')&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light';}catch(e){document.documentElement.dataset.theme='light';}})();`;
