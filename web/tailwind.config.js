/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)', surface: 'var(--surface)', 'surface-2': 'var(--surface-2)',
        border: 'var(--border)', 'border-strong': 'var(--border-strong)',
        text: 'var(--text)', muted: 'var(--text-muted)', faint: 'var(--text-faint)',
        accent: 'var(--accent)', 'accent-ink': 'var(--accent-ink)',
        green: 'var(--green)', amber: 'var(--amber)', red: 'var(--red)',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      keyframes: { pulseSoft: { '0%,100%': { opacity: '1' }, '50%': { opacity: '.4' } } },
      animation: { 'pulse-soft': 'pulseSoft 1.4s ease-in-out infinite' },
    },
  },
  plugins: [],
}
