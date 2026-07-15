/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'Noto Sans KR', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          50:  '#eef4ff',
          100: '#dce7ff',
          200: '#bcd0ff',
          300: '#8eabff',
          400: '#597dff',
          500: '#3355f5',
          600: '#1f37db',
          700: '#1a2bb0',
          800: '#1b288c',
          900: '#1c2870',
          950: '#141a45',
        },
        accent: {
          50:  '#e7fbf3',
          200: '#a7f0d1',
          500: '#12b981',
          600: '#059669',
        },
      },
      boxShadow: {
        soft: '0 10px 40px -12px rgba(20, 26, 69, 0.18)',
        card: '0 4px 24px -8px rgba(20, 26, 69, 0.12)',
      },
    },
  },
  plugins: [],
}
