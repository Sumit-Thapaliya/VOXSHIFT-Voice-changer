import type { Config } from 'tailwindcss';
export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#090c15',
        foreground: '#eff2fa',
        cyan: '#6ee7ef',
        violet: '#ad80ff',
        muted: '#81889d',
        line: '#252937',
      },
      fontFamily: { sans: ['Inter', 'sans-serif'], display: ['Space Grotesk', 'sans-serif'] },
    },
  },
  plugins: [],
} satisfies Config;
