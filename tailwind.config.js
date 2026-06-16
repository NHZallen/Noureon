/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{html,js}'],
  darkMode: 'class',
  safelist: [
    'hidden',
    'block',
    'inline-block',
    'inline-flex',
    'flex',
    'grid',
    'visible',
    'invisible',
    'opacity-0',
    'opacity-100',
    'translate-x-0',
    'translate-x-full',
    '-translate-x-full',
    'translate-y-0',
    'translate-y-full',
    '-translate-y-full'
  ],
  theme: {
    extend: {}
  },
  plugins: []
};
