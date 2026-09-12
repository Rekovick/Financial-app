/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Semantic surfaces + ink. Values live in index.css as CSS variables so
        // light/dark swap in exactly one place.
        plane: 'rgb(var(--plane) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        raised: 'rgb(var(--raised) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        hairline: 'rgb(var(--hairline) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        'ink-2': 'rgb(var(--ink-2) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        accent: 'rgb(var(--accent) / <alpha-value>)',
        'accent-soft': 'rgb(var(--accent-soft) / <alpha-value>)',
        good: 'rgb(var(--good) / <alpha-value>)',
        warning: 'rgb(var(--warning) / <alpha-value>)',
        serious: 'rgb(var(--serious) / <alpha-value>)',
        critical: 'rgb(var(--critical) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'sans-serif'],
      },
      borderRadius: {
        xl2: '1rem',
      },
      boxShadow: {
        card: '0 1px 2px rgb(0 0 0 / 0.04), 0 1px 1px rgb(0 0 0 / 0.03)',
        pop: '0 12px 32px -8px rgb(0 0 0 / 0.24), 0 2px 8px -2px rgb(0 0 0 / 0.12)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'sheet-up': {
          from: { transform: 'translateY(100%)' },
          to: { transform: 'translateY(0)' },
        },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
      },
      animation: {
        'fade-in': 'fade-in .16s ease-out',
        'slide-up': 'slide-up .18s cubic-bezier(.2,.8,.2,1)',
        'sheet-up': 'sheet-up .24s cubic-bezier(.2,.8,.2,1)',
      },
    },
  },
  plugins: [],
};
