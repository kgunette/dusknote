import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig, loadEnv, type PluginOption } from 'vite';
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

// The public try-it demo counts its visits with Google Analytics. The tag goes in only when this
// is the demo build (VITE_DEMO=1) and the demo's Vercel project supplies the Measurement ID
// (VITE_GA_ID). A personal copy sets neither, so its page never carries the tag and the security
// policy in index.html stays exactly as written there. For the demo, the policy's meta tag is
// widened here to admit the three Google Analytics hosts; vercel.json widens the header copy of
// the same policy for demo.dusknote.app alone, so the two stay in step on every deployment.
// The gtag bootstrap lives in its own file (analytics.js) rather than inline, because the policy
// allows no inline scripts and that stays true on the demo.
function demoAnalytics(env: Record<string, string | undefined>): PluginOption {
  const id = env.VITE_GA_ID;
  if (env.VITE_DEMO !== '1' || !id) return false;
  const widen = (html: string) => {
    const out = html
      .replace("script-src 'self';", "script-src 'self' https://www.googletagmanager.com;")
      .replace(
        "img-src 'self' data:;",
        "img-src 'self' data: https://*.google-analytics.com https://www.googletagmanager.com;"
      )
      .replace(
        "connect-src 'self' ",
        "connect-src 'self' https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com "
      );
    if (out.split('googletagmanager').length !== 4) {
      throw new Error(
        'demo-analytics: the security policy in index.html no longer matches; update the widening here and in vercel.json'
      );
    }
    return out;
  };
  return {
    name: 'demo-analytics',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'analytics.js',
        source: `window.dataLayer = window.dataLayer || [];\nfunction gtag(){dataLayer.push(arguments);}\ngtag('js', new Date());\ngtag('config', '${id}');\n`,
      });
    },
    transformIndexHtml(html: string) {
      return {
        html: widen(html),
        tags: [
          {
            tag: 'script',
            attrs: { async: true, src: `https://www.googletagmanager.com/gtag/js?id=${id}` },
            injectTo: 'head',
          },
          { tag: 'script', attrs: { src: '/analytics.js' }, injectTo: 'head' },
        ],
      };
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  return {
    define: {
      __BUILD__: JSON.stringify(buildId),
      __APP_NAME__: JSON.stringify(APP_NAME),
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
    plugins: [
      react(),
      demoAnalytics(env),
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
          description: 'A calm, local-device-first tracker for anything about your health you want to keep notes on',
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
  };
});
