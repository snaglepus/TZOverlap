import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: [
      'node_modules/',
      'dist/',
      'dist-perf/',
      'test-results/',
      'playwright-report/',
      '.worktrees/',
      'factory/',
    ],
  },
  js.configs.recommended,
  {
    languageOptions: { ecmaVersion: 2024, sourceType: 'module' },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      eqeqeq: ['error', 'always'],
      'no-var': 'error',
      'prefer-const': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-console': 'off',
    },
  },
  // Browser app code: no Node globals, no console noise, no network APIs.
  {
    files: ['src/**/*.js'],
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      'no-console': 'error',
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: 'TZ Overlap makes no network calls at runtime.' },
        { name: 'XMLHttpRequest', message: 'TZ Overlap makes no network calls at runtime.' },
        { name: 'WebSocket', message: 'TZ Overlap makes no network calls at runtime.' },
        { name: 'EventSource', message: 'TZ Overlap makes no network calls at runtime.' },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'navigator', property: 'sendBeacon', message: 'No analytics or beacons.' },
      ],
    },
  },
  // The service worker also gets the worker globals; the rules above still apply.
  {
    files: ['src/sw.js'],
    languageOptions: { globals: { ...globals.serviceworker } },
  },
  // Tooling, config and tests run in Node.
  {
    files: ['scripts/**/*.js', 'config/**/*.js', 'tests/**/*.js', '*.config.js'],
    languageOptions: { globals: { ...globals.node } },
  },
  // Playwright page.evaluate callbacks run in the browser.
  {
    files: ['tests/e2e/**/*.js', 'tests/perf/**/*.spec.js'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
];
