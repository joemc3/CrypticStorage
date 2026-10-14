// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useUIStore } from './ui.store';

const root = () => document.documentElement;

describe('ui.store theme', () => {
  beforeEach(() => {
    localStorage.clear();
    root().removeAttribute('data-theme');
    vi.restoreAllMocks();
  });

  it('sets data-theme for explicit values and removes it for system', () => {
    useUIStore.getState().setTheme('dark');
    expect(root().dataset.theme).toBe('dark');
    useUIStore.getState().setTheme('light');
    expect(root().dataset.theme).toBe('light');
    useUIStore.getState().setTheme('system');
    expect(root().hasAttribute('data-theme')).toBe(false);
  });

  it('persists the theme to localStorage', () => {
    useUIStore.getState().setTheme('dark');
    const saved = JSON.parse(localStorage.getItem('cryptic-storage-ui') as string);
    expect(saved.state.theme).toBe('dark');
  });

  it('still updates state and attribute when localStorage.setItem throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => useUIStore.getState().setTheme('dark')).not.toThrow();
    expect(useUIStore.getState().theme).toBe('dark');
    expect(root().dataset.theme).toBe('dark');
  });
});
