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
        brand: {
          DEFAULT: '#1E3A8A',       // Deep Slate Blue Primary Accent
          hover: '#1E40AF',
          light: '#2563EB',
          dark: '#172554',
          soft: '#EFF6FF',
          muted: '#3B82F6',
          border: '#BFDBFE'
        },
        gold: {
          DEFAULT: '#D97706',       // Muted, sophisticated gold
          soft: '#FEF3C7',
          dark: '#B45309',
          border: '#FDE68A'
        },
        trade: {
          green: '#15803D',         // Darkened, saturated high-contrast green (Light)
          'green-dark': '#22C55E',  // Saturated green (Dark mode)
          'green-soft': '#DCFCE7',  // High-contrast soft green background
          red: '#DC2626',           // High-contrast red (Light)
          'red-dark': '#EF4444',    // Saturated red (Dark mode)
          'red-soft': '#FEE2E2',    // Soft red background
          blue: '#1E3A8A',
          'blue-soft': '#EFF6FF'
        },
        surface: {
          light: '#FFFFFF',
          'light-2': '#F8F9FA',
          border: '#E2E8F0',
          dark: '#0E1116',
          'dark-card': '#161A20',
          'dark-border': '#272D36'
        }
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
        display: ['Inter', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', '"SF Mono"', 'Menlo', 'monospace']
      }
    },
  },
  plugins: [],
}
