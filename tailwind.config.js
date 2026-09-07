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
          'Inter',
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
        slide: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(250%)' },
        },
      },
      animation: {
        slide: 'slide 1.4s cubic-bezier(0.4, 0, 0.2, 1) infinite',
      },
    },
  },
  plugins: [],
};
