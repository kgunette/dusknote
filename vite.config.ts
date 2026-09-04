import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// The app's one name and version, from package.json ("displayName" / "version"). Everything
// derives from these: the title and manifest here, and src/config.ts's APP_NAME / APP_VERSION
// via the defines below. Renaming the product is a one-line package.json change.
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const APP_NAME: string = pkg.displayName;

// A short build id shown in Settings so the deployed version is verifiable at a glance. On Vercel
// it's the commit being built; locally it's the current git short SHA; 'dev' if neither is available.
const buildId =
  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ??
  (() => {
    try {
      return execSync('git rev-parse --short HEAD').toString().trim();
    } catch {
      return 'dev';
    }
  })();

export default defineConfig({
  define: {
    __BUILD__: JSON.stringify(buildId),
    __APP_NAME__: JSON.stringify(APP_NAME),
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    react(),
    // index.html can't read TS constants, so %APP_NAME% placeholders are swapped here.
    {
      name: 'app-name-html',
      transformIndexHtml: (html: string) => html.replaceAll('%APP_NAME%', APP_NAME),
    },
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: APP_NAME,
        short_name: APP_NAME,
        description: 'A calm, local-device-first tracker for any ongoing health condition',
        display: 'standalone',
        background_color: '#12151d',
        theme_color: '#12151d',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,woff2,woff}'],
        navigateFallback: '/index.html',
        // The lazy report/PDF chunk (pdfmake + the embedded Source Serif font) is a few MB.
        // Raise the precache ceiling so it's cached for offline report generation on a plane.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024
      }
    })
  ],
  server: { port: 5173, strictPort: true }
});
