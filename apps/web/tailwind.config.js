/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'color-mix(in srgb, var(--bg) calc(<alpha-value> * 100%), transparent)',
        surface: 'color-mix(in srgb, var(--surface) calc(<alpha-value> * 100%), transparent)',
        surface2: 'color-mix(in srgb, var(--surface2) calc(<alpha-value> * 100%), transparent)',
        line: 'color-mix(in srgb, var(--line) calc(<alpha-value> * 100%), transparent)',
        text: 'color-mix(in srgb, var(--text) calc(<alpha-value> * 100%), transparent)',
        muted: 'color-mix(in srgb, var(--muted) calc(<alpha-value> * 100%), transparent)',
        accent: 'color-mix(in srgb, var(--accent) calc(<alpha-value> * 100%), transparent)',
        xp: 'color-mix(in srgb, var(--xp) calc(<alpha-value> * 100%), transparent)',
        gold: 'color-mix(in srgb, var(--gold) calc(<alpha-value> * 100%), transparent)',
        rare: 'color-mix(in srgb, var(--blue) calc(<alpha-value> * 100%), transparent)',
        epic: 'color-mix(in srgb, var(--purple) calc(<alpha-value> * 100%), transparent)',
        tg: '#2AABEE',
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
      borderRadius: { card: '18px' },
    },
  },
  plugins: [],
};
