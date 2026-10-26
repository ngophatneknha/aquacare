import type { Config } from 'tailwindcss'

// Màu lấy từ biến CSS dạng "r g b" trong index.css để đổi sáng/tối mà vẫn dùng được /opacity của Tailwind
const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: token('bg'),
        surface: token('surface'),
        sunk: token('sunk'),
        ink: token('ink'),
        muted: token('muted'),
        line: token('line'),
        accent: token('accent'),
        accent2: token('accent2'),
        ok: token('ok'),
        warn: token('warn'),
        bad: token('bad'),
      },
      fontFamily: {
        display: ['"Bricolage Grotesque Variable"', '"Segoe UI"', 'system-ui', 'sans-serif'],
        body: ['"Be Vietnam Pro"', '"Segoe UI"', 'system-ui', 'sans-serif'],
        data: ['"JetBrains Mono"', 'ui-monospace', 'Consolas', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgb(var(--shadow) / .06), 0 8px 24px -12px rgb(var(--shadow) / .22)',
      },
      transitionTimingFunction: { out: 'cubic-bezier(.2,.8,.2,1)' },
    },
  },
  plugins: [],
} satisfies Config
