'use strict';

const defaultConfig = require('./jest.config');

module.exports = {
  ...defaultConfig,
  testRegex: '(/packages/.*(test|spec))\\.ts?$',
};
