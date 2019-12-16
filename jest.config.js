'use strict';

module.exports = {
  globals: {
    'ts-jest': {
      tsConfig: '<rootDir>/packages/gstore-node/tsconfig.json',
      diagnostics: true,
    },
  },
  roots: ['<rootDir>/packages', '<rootDir>/__tests__'],
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts?$': 'ts-jest',
  },
  testRegex: '(/__tests__/integration/.*|(\\.|/)(test|spec))\\.ts?$',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  collectCoverageFrom: ['packages/**/*.ts', '!packages/**/*.test.ts', '!packages/**/lib/**/*.*'],
  moduleNameMapper: {
    '^gstore-datastore-adapter$': '<rootDir>/packages/gstore-datastore-adapter/src/index.ts',
    '^gstore-node': '<rootDir>/packages/gstore-node/src/index.ts',
    '^gstore-node/(.*)$': '<rootDir>/packages/gstore-node/src/$1',
  },
};
