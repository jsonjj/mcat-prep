import type { StatePort } from '@mcat/client-core';

/**
 * localStorage-backed state store with an in-memory fallback (private mode /
 * disabled storage). Only non-authoritative local state lives here; in production
 * the authoritative record lives server-side and the offline event queue uses
 * IndexedDB. This keeps the local demo functional without a server.
 */
export function createLocalStateStore<T>(key: string): StatePort<T> {
  let memory: T | null = null;
  const canUseLocalStorage = (): boolean => {
    try {
      const probe = '__mc_probe__';
      window.localStorage.setItem(probe, '1');
      window.localStorage.removeItem(probe);
      return true;
    } catch {
      return false;
    }
  };
  const useLs = typeof window !== 'undefined' && canUseLocalStorage();

  return {
    load(): T | null {
      if (!useLs) return memory;
      const raw = window.localStorage.getItem(key);
      if (raw === null) return null;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return null;
      }
    },
    save(state: T): void {
      if (!useLs) {
        memory = state;
        return;
      }
      window.localStorage.setItem(key, JSON.stringify(state));
    },
    clear(): void {
      memory = null;
      if (useLs) window.localStorage.removeItem(key);
    },
  };
}
