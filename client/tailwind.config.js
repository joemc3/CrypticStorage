/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Cipher Color Palette
        cipher: {
          black: 'rgb(var(--cipher-black) / <alpha-value>)',
          obsidian: 'rgb(var(--cipher-obsidian) / <alpha-value>)',
          charcoal: 'rgb(var(--cipher-charcoal) / <alpha-value>)',
          slate: 'rgb(var(--cipher-slate) / <alpha-value>)',
          steel: 'rgb(var(--cipher-steel) / <alpha-value>)',
          phosphor: 'rgb(var(--cipher-phosphor) / <alpha-value>)',
          amber: 'rgb(var(--cipher-amber) / <alpha-value>)',
          crimson: 'rgb(var(--cipher-crimson) / <alpha-value>)',
          cyan: 'rgb(var(--cipher-cyan) / <alpha-value>)',
          violet: 'rgb(var(--cipher-violet) / <alpha-value>)',
        },
        text: {
          primary: 'rgb(var(--cipher-text-primary) / <alpha-value>)',
          secondary: 'rgb(var(--cipher-text-secondary) / <alpha-value>)',
          muted: 'rgb(var(--cipher-text-muted) / <alpha-value>)',
        },
      },
      fontFamily: {
        display: ['Instrument Serif', 'Georgia', 'serif'],
        body: ['DM Sans', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      animation: {
        'decrypt': 'decrypt 0.6s ease-out forwards',
        'float': 'float 6s ease-in-out infinite',
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'shimmer': 'shimmer 1.5s infinite',
        'scanline': 'scanline 3s linear infinite',
        'spin-slow': 'spin 3s linear infinite',
        'fade-in': 'fadeIn 0.5s ease-out forwards',
        'slide-up': 'slideUp 0.5s ease-out forwards',
        'slide-down': 'slideDown 0.5s ease-out forwards',
        'slide-left': 'slideLeft 0.5s ease-out forwards',
        'slide-right': 'slideRight 0.5s ease-out forwards',
        'scale-in': 'scaleIn 0.3s ease-out forwards',
      },
      keyframes: {
        decrypt: {
          '0%': {
            opacity: '0',
            transform: 'translateY(10px) scale(0.95)',
            filter: 'blur(4px)'
          },
          '100%': {
            opacity: '1',
            transform: 'translateY(0) scale(1)',
            filter: 'blur(0)'
          },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        'pulse-glow': {
          '0%, 100%': {
            opacity: '1',
            boxShadow: '0 0 10px rgb(var(--cipher-phosphor) / 0.3)'
          },
          '50%': {
            opacity: '0.8',
            boxShadow: '0 0 40px rgb(var(--cipher-phosphor) / 0.5)'
          },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        scanline: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100vh)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideDown: {
          '0%': { transform: 'translateY(-20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideLeft: {
          '0%': { transform: 'translateX(20px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        slideRight: {
          '0%': { transform: 'translateX(-20px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.9)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
      boxShadow: {
        'glow-sm': '0 0 10px rgb(var(--cipher-phosphor) / 0.3)',
        'glow-md': '0 0 20px rgb(var(--cipher-phosphor) / 0.4)',
        'glow-lg': '0 0 40px rgb(var(--cipher-phosphor) / 0.5)',
        'glow-amber': '0 0 20px rgb(var(--cipher-amber) / 0.4)',
        'card': '0 4px 20px rgb(0 0 0 / 0.5), 0 0 0 1px rgb(var(--cipher-slate) / 0.3)',
        'deep': '0 25px 50px -12px rgb(0 0 0 / 0.8)',
      },
      backgroundImage: {
        'gradient-cipher': 'linear-gradient(135deg, rgb(var(--cipher-phosphor) / 0.1) 0%, rgb(var(--cipher-amber) / 0.05) 100%)',
        'gradient-terminal': 'linear-gradient(180deg, rgb(var(--cipher-obsidian)) 0%, rgb(var(--cipher-black)) 100%)',
        'gradient-glow': 'radial-gradient(ellipse at center, rgb(var(--cipher-phosphor) / 0.15) 0%, transparent 70%)',
        'grid-cipher': 'linear-gradient(rgb(var(--cipher-slate) / 0.1) 1px, transparent 1px), linear-gradient(90deg, rgb(var(--cipher-slate) / 0.1) 1px, transparent 1px)',
      },
      borderRadius: {
        'cipher-sm': '4px',
        'cipher-md': '8px',
        'cipher-lg': '12px',
        'cipher-xl': '16px',
      },
      transitionDuration: {
        '250': '250ms',
        '400': '400ms',
      },
      transitionTimingFunction: {
        'bounce-custom': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
    },
  },
  plugins: [],
}
