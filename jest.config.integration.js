'use strict';

const defaultConfig = require('./jest.config');

module.exports = {
  ...defaultConfig,
  testRegex: '(/__tests__/integration/.*)\\.ts?$',
};
