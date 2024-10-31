import defaultTheme from 'tailwindcss/defaultTheme';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js,ts}'],
  theme: {
    extend: {
      colors: {
        primaryBlack: '#0D0D0D',
        secondaryBlack: '#191919',
        blue: '#2663EB',
        slate: '#293343',
        primaryWhite: '#EEEEEE',
        secondaryWhite: '#D1D5DB',
      },
      fontFamily: {
        sans: ['Montserrat', ...defaultTheme.fontFamily.sans],
      },
    },
  },
  plugins: [],
};
