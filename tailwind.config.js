/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Cairo', 'system-ui', 'Segoe UI', 'Tahoma', 'sans-serif'],
      },
      colors: {
        brand: { green: '#006C35', gold: '#C9A227', silver: '#BFC5CB', ink: '#11221A' },
      },
    },
  },
  plugins: [],
}
