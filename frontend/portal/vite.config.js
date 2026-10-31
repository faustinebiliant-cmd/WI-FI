import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Built website only: the browser may run code from this site and nothing else.
// Even if someone slipped code into a page, it would not run, so it could not
// read the logins saved in the browser. (Not used by "npm run dev", which needs
// inline scripts.) The portal uses no web font: the phone's own font is used.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: https:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'"
].join('; ')

const contentSecurityPolicy = () => ({
  name: 'content-security-policy',
  apply: 'build',
  transformIndexHtml: () => [
    { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CONTENT_SECURITY_POLICY }, injectTo: 'head-prepend' }
  ]
})

export default defineConfig({
  base: '/portal/',
  plugins: [react(), contentSecurityPolicy()],
  server: { port: 3000 }
})
