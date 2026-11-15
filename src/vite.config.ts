import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { staticAnswers } from './scripts/static-answers.ts'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), {
    name: 'static-answers',
    apply: 'build',
    transformIndexHtml: (html) => html.replace('<div id="root"></div>', `<div id="root"></div>${staticAnswers()}`),
  }],
})
