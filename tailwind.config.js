/** @type {import('tailwindcss').Config} */
export default {
  // File generators emit Office/PDF markup, never Tailwind classes. Their LaTeX
  // command and OOXML names (overline, table, underline…) would otherwise be
  // picked up as utilities and grow the startup stylesheet.
  content: ['./index.html', './src/**/*.{html,js}', '!./src/app/ui/files/generators/**'],
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
