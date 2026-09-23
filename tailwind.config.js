/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  // The theme provider toggles a `.dark` class on <html>; without this Tailwind
  // would only ever follow the OS preference and the toggle would do nothing.
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
      boxShadow: {
        card: '0 1px 2px rgba(24, 24, 27, 0.04), 0 16px 48px -16px rgba(24, 24, 27, 0.14)',
        'card-dark': '0 1px 2px rgba(0, 0, 0, 0.4), 0 16px 48px -16px rgba(0, 0, 0, 0.6)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'pop-in': {
          from: { opacity: '0', transform: 'translate(-50%, -50%) scale(0.97)' },
          to: { opacity: '1', transform: 'translate(-50%, -50%) scale(1)' },
        },
        slide: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(250%)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.18s ease-out',
        'pop-in': 'pop-in 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
        slide: 'slide 1.4s cubic-bezier(0.4, 0, 0.2, 1) infinite',
      },
    },
  },
  plugins: [],
};
