import { afterEach } from 'vitest';

// Component tests run under jsdom; node-environment tests have no DOM to clean.
if (typeof document !== 'undefined') {
  const { cleanup } = await import('@testing-library/react');
  await import('@testing-library/jest-dom/vitest');
  afterEach(() => cleanup());

  // Newer Node versions ship their own experimental localStorage global, which
  // shadows jsdom's and lacks clear(). Fall back to a small in-memory Storage.
  if (typeof globalThis.localStorage?.clear !== 'function') {
    class MemoryStorage {
      private data = new Map<string, string>();
      get length() { return this.data.size; }
      key(i: number) { return [...this.data.keys()][i] ?? null; }
      getItem(k: string) { return this.data.has(k) ? (this.data.get(k) as string) : null; }
      setItem(k: string, v: string) { this.data.set(k, String(v)); }
      removeItem(k: string) { this.data.delete(k); }
      clear() { this.data.clear(); }
    }
    Object.defineProperty(globalThis, 'Storage', { value: MemoryStorage, configurable: true });
    Object.defineProperty(globalThis, 'localStorage', { value: new MemoryStorage(), configurable: true });
  }
}
