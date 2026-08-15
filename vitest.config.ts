import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

// Unit tests for the app's pure logic (sync merge, guard, serialization, counting).
// Node environment: these tests never touch the DOM, IndexedDB, or the network, by design.
// The data-safety logic lives in pure functions precisely so it can be tested this way.
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
  // The same build-time constants vite.config.ts injects, so modules that read them (config.ts)
  // load under the test runner. Values are read from package.json to stay in step; the build id
  // is irrelevant to unit tests.
  define: {
    __APP_NAME__: JSON.stringify(pkg.displayName),
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD__: JSON.stringify('test'),
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
