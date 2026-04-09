// @ts-check
const eslint = require('@eslint/js');
const tseslint = require('typescript-eslint');
const globals = require('globals');
const prettierConfig = require('eslint-config-prettier');

module.exports = tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  prettierConfig,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**', 'test/fixtures/**', 'coverage/**'],
  },
);
