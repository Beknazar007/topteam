/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        surface2: 'var(--surface2)',
        line: 'var(--line)',
        text: 'var(--text)',
        muted: 'var(--muted)',
        accent: 'var(--accent)',
        xp: 'var(--xp)',
        gold: 'var(--gold)',
        rare: 'var(--blue)',
        epic: 'var(--purple)',
        tg: '#2AABEE',
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
      borderRadius: { card: '18px' },
    },
  },
  plugins: [],
};
