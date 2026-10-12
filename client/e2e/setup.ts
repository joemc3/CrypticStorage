/**
 * Minimal browser shims so the real client services can run under Node
 * against a live API. Only what the services touch is provided.
 */

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
}

const g = globalThis as unknown as Record<string, unknown>;
g.localStorage = new MemoryStorage();
if (!g.window) {
  g.window = { dispatchEvent: () => true, addEventListener: () => undefined, isSecureContext: true, location: { hash: '' } };
}

// The services read the API base URL at import time.
process.env.VITE_API_BASE_URL = process.env.E2E_API_URL ?? 'http://127.0.0.1:4100/api';
