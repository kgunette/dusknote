/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

// Build-time constants injected in vite.config.ts (from package.json + git).
declare const __BUILD__: string;
declare const __APP_NAME__: string;
declare const __APP_VERSION__: string;

// The ONE per-deployer env var (see .env.example). Everything a person personalizes
// (vocabulary, rating words, watched factors, the condition noun, the report name) is
// user data, set in-app — never an env var.
interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID?: string;
}
