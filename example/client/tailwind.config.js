const colors = require('tailwindcss/colors');

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        background: colors.zinc,
        accent: colors.sky,
        foreground: colors.slate,
      },
    },
  },
  plugins: [require('tailwind-scrollbar')({ nocompatible: true })],
};
