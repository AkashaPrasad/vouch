/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        'surface-2': 'var(--surface-2)',
        border: 'var(--border)',
        'border-strong': 'var(--border-strong)',
        text: 'var(--text)',
        muted: 'var(--text-muted)',
        faint: 'var(--text-faint)',
        accent: 'var(--accent)',
        'accent-ink': 'var(--accent-ink)',
        green: 'var(--green)',
        amber: 'var(--amber)',
        red: 'var(--red)',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      keyframes: {
        shimmer: { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
        marquee: { '0%': { transform: 'translateX(0)' }, '100%': { transform: 'translateX(-50%)' } },
        pulseSoft: { '0%,100%': { opacity: '1' }, '50%': { opacity: '.45' } },
        shine: { '0%': { backgroundPosition: '200% 0' }, '100%': { backgroundPosition: '-200% 0' } },
      },
      animation: {
        shimmer: 'shimmer 1.6s linear infinite',
        marquee: 'marquee 40s linear infinite',
        'pulse-soft': 'pulseSoft 1.6s ease-in-out infinite',
        shine: 'shine 3s linear infinite',
      },
    },
  },
  plugins: [],
}
