import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');
// `--production`: the build vscode:prepublish runs for the .vsix, minified and without source maps.
const production = process.argv.includes('--production');

const common = {
  bundle: true,
  sourcemap: !production,
  minify: production,
  logLevel: 'info',
};

// `--integration`: only the integration test (src/integration/), in out/integration/, outside the .vsix and dist/.
// The npm packages stay outside the bundle, except the @plan-relay/* workspaces: they point at .ts sources, which
// Node cannot load from out/, so they are bundled like in the extension.
const integration = [
  {
    ...common,
    entryPoints: ['src/integration/run-tests.ts', 'src/integration/suite.ts'],
    outdir: 'out/integration',
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    external: ['vscode', '@vscode/test-electron'],
  },
];

const extension = [
  {
    ...common,
    entryPoints: ['src/extension.ts'],
    outfile: 'dist/extension.js',
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    external: ['vscode'],
  },
  {
    ...common,
    entryPoints: ['src/webview/main.ts'],
    outfile: 'dist/webview.js',
    platform: 'browser',
    format: 'iife',
    target: 'es2022',
  },
  {
    // The give-up confirmation, in its own tab.
    ...common,
    entryPoints: ['src/webview/confirmation.ts'],
    outfile: 'dist/confirmation.js',
    platform: 'browser',
    format: 'iife',
    target: 'es2022',
  },
  {
    // The core/panel CSS with the VS Code theme (media/panel.css imports the core one).
    ...common,
    entryPoints: ['media/panel.css'],
    outfile: 'dist/panel.css',
  },
];

const builds = process.argv.includes('--integration') ? integration : extension;

if (watch) {
  for (const options of builds) {
    const context = await esbuild.context(options);
    await context.watch();
  }
} else {
  await Promise.all(builds.map((options) => esbuild.build(options)));
}
