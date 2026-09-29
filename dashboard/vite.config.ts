import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Strict CSP for the published site only (dev server needs inline scripts / websockets for HMR).
// Style attributes are allowed because bar widths and chart positions are set inline.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "base-uri 'self'",
  "form-action 'none'",
  "object-src 'none'",
].join('; ')

function contentSecurityPolicy(): Plugin {
  return {
    name: 'content-security-policy',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
      )
    },
  }
}

export default defineConfig({
  // Relative base: works at https://<user>.github.io/<repo>/ and locally.
  base: './',
  plugins: [react(), contentSecurityPolicy()],
})
