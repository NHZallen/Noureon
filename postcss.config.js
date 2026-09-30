import autoprefixer from 'autoprefixer';
import tailwindcss from 'tailwindcss';
import hoverOnly from './scripts/postcss-hover-only.mjs';

export default {
  plugins: [
    tailwindcss(),
    // After Tailwind, so the hand-written CSS is covered too; before autoprefixer.
    hoverOnly(),
    autoprefixer()
  ]
};
