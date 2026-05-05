/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './app.html',
    './privacy.html',
    './changelog/changelog.html',
    './supoort/support.html',
    './jsmind/*.html',
    './md2word/*.html',
    './ai/newai/*.html',
    './editor/*.html',
    './auth*.html',
    './feedback*.html',
    './reset-password.html',
    './auth-callback.html',
  ],
  theme: {
    extend: {
      colors: {
        primary: '#619dff',
        secondary: '#5eb97e',
        accent: '#b88bf1',
        dark: '#1E293B',
        light: '#F8FAFC',
        third: '#f3e8ff'
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    }
  },
  plugins: [],
}
