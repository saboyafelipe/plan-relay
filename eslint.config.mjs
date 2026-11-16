// ESLint for the extension and the TypeScript in core/. The type-checked recommended
// typescript-eslint rules (which include no-floating-promises and no-misused-promises), with no
// style rule: style belongs to Prettier (.prettierrc.json).
//
// It also draws the import boundary of each layer (no-restricted-imports). The project references
// already refuse a core file that imports from hosts/ or from a package it does not declare; what
// they cannot refuse is a module that resolves anyway, which is the job of the blocks below:
// - core/ never imports vscode: it serves any host.
// - core/panel and core/i18n run in the browser: no Node module, and the panel does not reach for
//   the Node side of the reader.
// - core/reader keeps every Node API in src/node.ts (the @plan-relay/reader/node entry), so the rest
//   of the reader is the part the panel can import in the browser. The test fixture
//   (src/testing/, @plan-relay/reader/testing) reads from disk too.
// The rule only sees static imports; architecture.test.ts covers `import('vscode')` and `require`.
import tseslint from 'typescript-eslint';
import { builtinModules } from 'node:module';

const CORE = ['core/reader/**/*.ts', 'core/panel/**/*.ts', 'core/i18n/**/*.ts'];
const BROWSER = ['core/panel/**/*.ts', 'core/i18n/**/*.ts'];
const READER_NODE = ['core/reader/src/node.ts', 'core/reader/src/testing/**/*.ts'];
// Tests run in Node under vitest and may read fixtures from disk.
const TESTS = ['**/*.test.ts'];

const noVscode = {
  name: 'vscode',
  message: 'core/ serves any host: the editor API belongs to hosts/.',
};
const noVscodePattern = {
  regex: '^vscode/',
  message: noVscode.message,
};
const nodeModules = `^(?:node:|(?:${builtinModules.filter((m) => !m.startsWith('_')).join('|')})(?:/|$))`;
const noNode = {
  regex: nodeModules,
  message: 'This package runs in the browser: no Node module.',
};
const noNodeInReader = {
  regex: nodeModules,
  message: 'The reader keeps its Node side in src/node.ts: the rest of it runs in the browser too.',
};
const noReaderNode = {
  regex: '^@plan-relay/reader/node$',
  message: 'The panel runs in the browser: take the reader without its Node side (@plan-relay/reader).',
};

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '**/out/**'] },
  {
    files: ['hosts/vscode/src/**/*.ts', ...CORE],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      // Typed rules read each file's types through the TypeScript language service, which finds the
      // nearest tsconfig.json (and its references to the test projects) by itself.
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // Like tsc's noUnusedLocals: a name starting with _ is discarded on purpose
      // (const { key: _ignored, ...rest } = x).
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: false }],
    },
  },
  {
    // Exception: require-await is off in tests. Their fakes implement the async interfaces of the
    // code under test (a file system, a prompt) with in-memory answers, so `async` with no `await`
    // is how they match the signature; a plain function would have to wrap each result in a promise.
    files: TESTS,
    rules: { '@typescript-eslint/require-await': 'off' },
  },
  {
    files: CORE,
    ignores: BROWSER,
    rules: {
      'no-restricted-imports': ['error', { paths: [noVscode], patterns: [noVscodePattern] }],
    },
  },
  {
    files: ['core/reader/**/*.ts'],
    ignores: [...READER_NODE, ...TESTS],
    rules: {
      'no-restricted-imports': ['error', { paths: [noVscode], patterns: [noVscodePattern, noNodeInReader] }],
    },
  },
  {
    files: BROWSER,
    ignores: TESTS,
    rules: {
      'no-restricted-imports': ['error', { paths: [noVscode], patterns: [noVscodePattern, noNode, noReaderNode] }],
    },
  },
  {
    files: ['core/panel/**/*.test.ts', 'core/i18n/**/*.test.ts'],
    rules: {
      'no-restricted-imports': ['error', { paths: [noVscode], patterns: [noVscodePattern] }],
    },
  },
);
