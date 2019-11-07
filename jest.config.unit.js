'use strict';

const defaultConfig = require('./jest.config');

module.exports = {
  ...defaultConfig,
  testRegex: '(/src/.*(test|spec))\\.ts?$',
};
