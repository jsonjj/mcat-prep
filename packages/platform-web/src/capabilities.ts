import type { Capabilities } from '@mcat/contracts';

/** Detect browser capabilities. Capabilities select enhancements, never academic access. */
export function detectCapabilities(): Capabilities {
  const hasWindow = typeof window !== 'undefined';
  let webgl = false;
  if (hasWindow) {
    try {
      const canvas = document.createElement('canvas');
      webgl = Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
    } catch {
      webgl = false;
    }
  }
  const reducedMotion =
    hasWindow && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const push = hasWindow && 'PushManager' in window && 'serviceWorker' in navigator;
  const persistentStorage = hasWindow && 'storage' in navigator && 'persist' in navigator.storage;
  const online = !hasWindow || navigator.onLine;
  return { webgl, reducedMotion, push, persistentStorage, online };
}
