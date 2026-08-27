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
        ink: {
          DEFAULT: '#111827', // Tailwind gray-900: Rich, heavy charcoal primary text
          muted: '#6B7280',   // Tailwind gray-500: Secondary metadata & labels
          subtle: '#9CA3AF',  // Tailwind gray-400: Neutral silhouette icons
          light: '#F9FAFB',   // Tailwind gray-50: Dark mode primary text
          'light-muted': '#9CA3AF'
        },
        trade: {
          green: '#16A34A',         // Crisp accessible semantic green
          'green-dark': '#22C55E',
          red: '#DC2626',           // Stark semantic red
          'red-dark': '#EF4444'
        },
        surface: {
          light: '#FFFFFF',
          'light-2': '#F9FAFB',
          border: '#E5E7EB',
          dark: '#0B0F17',
          'dark-card': '#111827',
          'dark-border': '#1F2937'
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
