/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'noctis-bg': 'var(--color-bg)',
        'noctis-frame': 'var(--color-frame)',
        'noctis-border': 'var(--color-border)',
        'noctis-text': 'var(--color-text)',
        'noctis-dim': 'var(--color-text-dim)',
      },
      borderRadius: {
        'std': 'var(--corner-radius)',
      }
    },
  },
  plugins: [],
}
