import '@mcat/design-tokens/tokens.css';
import '@mcat/ui-web/styles.css';
import './styles.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '@mcat/ui-web';
import { App } from './App';

const el = document.getElementById('root');
if (!el) throw new Error('#root not found');

createRoot(el).render(
  <StrictMode>
    <ThemeProvider initial="light">
      <App />
    </ThemeProvider>
  </StrictMode>,
);
