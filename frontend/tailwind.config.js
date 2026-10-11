const c = (v) => `rgb(var(--${v}) / <alpha-value>)`
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: { ink: c('ink'), panel: c('panel'), raise: c('raise'), line: c('line'), fg: c('text'), muted: c('muted'),
        cyan: c('cyan'), violet: c('violet'), amber: c('amber'), danger: c('red'), ok: c('green') },
      fontFamily: {
        sans: ['"Sora Variable"', 'system-ui', '-apple-system', '"Segoe UI"', 'sans-serif'],
        mono: ['"JetBrains Mono Variable"', 'ui-monospace', 'SFMono-Regular', 'Consolas', 'monospace'],
      },
      borderRadius: { pane: '3px' },
    },
  },
  plugins: [],
}
