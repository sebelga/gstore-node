module.exports = {
  rootDir: '../',
  transform: {
    '^.+\\.ts?$': 'ts-jest',
  },
  testRegex: '/test/integration/.*\\.ts?$',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
};
