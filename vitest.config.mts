import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // The `vscode` module only exists inside the editor: the host's unit tests load a fake of the slice it uses.
    alias: { vscode: fileURLToPath(new URL('hosts/vscode/src/testing/vscode.ts', import.meta.url)) },
  },
  test: {
    // One run for every workspace: the extension and the core packages. The tests use the globals
    // (describe, it, expect) or import vitest, which the root node_modules provides.
    include: ['hosts/vscode/src/**/*.test.ts', 'core/reader/src/**/*.test.ts', 'core/panel/src/**/*.test.ts', 'core/i18n/src/**/*.test.ts'],
    globals: true,
    environment: 'node',
    // The suites share no module state, so the files can reuse one module graph per worker.
    isolate: false,
    coverage: {
      provider: 'v8',
      include: ['hosts/vscode/src/**/*.ts', 'core/reader/src/**/*.ts', 'core/panel/src/**/*.ts', 'core/i18n/src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/integration/**', 'hosts/vscode/src/testing/**'],
      reporter: ['text-summary', 'text'],
      // Floors per package, equal to what was measured (rounded down). Raise them when coverage grows; never lower one
      // to make a change pass.
      thresholds: {
        'core/i18n/src/**': { lines: 100, branches: 100, functions: 100 },
        'core/reader/src/**': { lines: 97, branches: 90, functions: 100 },
        'core/panel/src/**': { lines: 94, branches: 90, functions: 97 },
        'hosts/vscode/src/**': { lines: 92, branches: 87, functions: 86 },
      },
    },
  },
});
