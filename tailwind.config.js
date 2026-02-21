import typography from '@tailwindcss/typography';

export default {
  content: [
    "./index.html",
    "./main.js",
  ],
  theme: {
    extend: {
      colors: {
        background: '#0a0a0a',
        surface: '#171717',
        primary: '#ffffff',
        secondary: '#a3a3a3',
        border: '#262626',
        accent: '#3b82f6',
        error: '#ef4444',
        success: '#22c55e',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      letterSpacing: {
        widest: '.2em',
      }
    },
  },
  plugins: [
    typography,
  ],
}
