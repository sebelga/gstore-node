'use strict';

module.exports = {
  root: true,
  parserOptions: {
    sourceType: 'script',
  },
  extends: ['airbnb-base', 'plugin:prettier/recommended'],
  env: {
    node: true,
    jest: true,
  },
  plugins: ['jest'],
  settings: {
    'import/resolver': {
      node: {
        extensions: ['.js', '.jsx'],
      },
    },
  },
  rules: {
    strict: ['error', 'global'],
    indent: [
      'error',
      2,
      {
        SwitchCase: 1,
      },
    ],
    'import/no-extraneous-dependencies': [
      'error',
      {
        devDependencies: ['**/__tests__/**/*.ts', '/**/*.test.ts'],
      },
    ],
    'no-use-before-define': [
      'error',
      {
        functions: false,
      },
    ],
    'import/prefer-default-export': 'off',
    'prefer-rest-params': 'off',
    'prefer-spread': 'off',
    'no-restricted-globals': 'off',
    'no-underscore-dangle': 'off',
    'no-param-reassign': 'off',
    'max-len': ['error', { code: 120, ignoreUrls: true }],
    'import/extensions': ['error', 'never', { json: 'always' }],
    'jest/no-focused-tests': 'error',
    'jest/no-identical-title': 'error',
  },
};
