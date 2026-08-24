/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        banana: {
          DEFAULT: '#FFC926',
          soft: '#FFF6D6',
          dark: '#E5B110',
          ink: '#8A6500'
        },
        trade: {
          green: '#1A8A4A',
          'green-soft': '#E6F4EC',
          red: '#D2392F',
          'red-soft': '#FBEAE8',
          blue: '#2563EB',
          'blue-soft': '#E7EFFD'
        },
        surface: {
          light: '#FFFFFF',
          'light-2': '#F8F9FA',
          border: '#E9ECEF',
          dark: '#0E1116',
          'dark-card': '#161A20',
          'dark-border': '#272D36'
        }
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
        display: ['"Space Grotesk"', 'sans-serif'],
        mono: ['ui-monospace', '"SF Mono"', 'Menlo', 'Consolas', 'monospace']
      }
    },
  },
  plugins: [],
}
