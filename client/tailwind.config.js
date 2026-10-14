/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['selector', '[data-theme="dark"]'],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      screens: { md: '720px' },
      fontFamily: { serif: 'var(--font-serif)', sans: 'var(--font-sans)', mono: 'var(--font-mono)' },
      colors: {
        bg: 'var(--bg)', surface: 'var(--surface)', 'surface-2': 'var(--surface-2)', sunk: 'var(--sunk)',
        line: 'var(--line)', 'line-strong': 'var(--line-strong)',
        ink: 'var(--ink)', 'ink-2': 'var(--ink-2)', 'ink-3': 'var(--ink-3)',
        accent: { DEFAULT: 'var(--accent)', hover: 'var(--accent-hover)', ink: 'var(--accent-ink)', soft: 'var(--accent-soft)', text: 'var(--accent-text)' },
        warn: { text: 'var(--warn-text)', soft: 'var(--warn-soft)', line: 'var(--warn-line)' },
        danger: { DEFAULT: 'var(--danger)', hover: 'var(--danger-hover)', ink: 'var(--danger-ink)', soft: 'var(--danger-soft)', text: 'var(--danger-text)' },
        info: { text: 'var(--info-text)', soft: 'var(--info-soft)' },
      },
    },
  },
  plugins: [],
}
