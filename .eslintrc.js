module.exports = {
  parser: '@typescript-eslint/parser',
  root: true,
  parserOptions: {
    ecmaVersion: 2018,
    sourceType: 'module',
    project: './tsconfig.json',
  },
  extends: [
    'airbnb-base',
    'plugin:@typescript-eslint/eslint-recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'prettier/@typescript-eslint',
    'plugin:prettier/recommended',
  ],
  env: {
    node: true,
    mocha: true,
  },
  plugins: ['@typescript-eslint'],
  settings: {
    'import/resolver': {
      node: {
        extensions: ['.js', '.jsx', '.ts', '.tsx'],
      },
    },
  },
  rules: {
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-non-null-assertion': 'off',
    'arrow-parens': ['error', 'as-needed'],
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
        devDependencies: ['**/test/**/*.js'],
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
    // 'mocha/no-exclusive-tests': 'error',
    'comma-dangle': [
      'error',
      {
        arrays: 'always-multiline',
        objects: 'always-multiline',
        functions: 'ignore',
      },
    ],
  },
};
