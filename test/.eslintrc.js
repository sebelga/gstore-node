'use strict';

module.exports = {
  extends: ['../.eslintrc.js'],
  rules: {
    'import/no-extraneous-dependencies': ['error', { devDependencies: true }],
  },
  env: {
    node: true,
    mocha: true,
  },
};
