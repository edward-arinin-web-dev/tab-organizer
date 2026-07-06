import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...svelte.configs['flat/recommended'],
  {
    languageOptions: {
      parserOptions: {
        extraFileExtensions: ['.svelte'],
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // <script lang="ts"> blocks need the TS parser inside svelte-eslint-parser.
    files: ['**/*.svelte'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
      },
    },
    rules: {
      // Redundant with the TS type-checker (svelte-check / tsc), which knows
      // the real ambient globals (chrome, window, timers). eslint doesn't.
      'no-undef': 'off',
    },
  },
  {
    // design/*.mjs are local Playwright harnesses whose page.evaluate() bodies
    // run in the browser — node-globals linting just produces no-undef noise.
    ignores: [
      '.wxt/',
      '.output/',
      'dist/',
      'node_modules/',
      'test-results/',
      'playwright-report/',
      'design/',
      'public/', // vendored assets (minified ORT wasm loader) — not our code
    ],
  },
);
