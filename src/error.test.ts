import util from 'util';
import chai from 'chai';
import { GstoreError, TypeError, message } from './errors';

const { expect, assert } = chai;

const doSomethingBad = (code?: string): void => {
  code = code || 'ERR_GENERIC';
  throw new GstoreError(code);
};

describe('message()', () => {
  test('should return string passed', () => {
    expect(message('My message')).equal('My message');
  });

  test('should return string passed with arguments', () => {
    expect(message('Hello %s %s', 'John', 'Snow')).equal('Hello John Snow');
    expect(message('Age: %d years old', 27)).equal('Age: 27 years old');
  });
});

describe('GstoreError', () => {
  test('should create a custom Error', () => {
    try {
      doSomethingBad();
    } catch (e) {
      expect(e.name).equal('GstoreError');
      expect(e instanceof GstoreError);
      expect(e instanceof Error);

      // The error should be recognized by Node.js' util#isError
      expect(util.isError(e)).equal(true);
      assert.isDefined(e.stack);
      expect(e.toString()).equal('GstoreError: An error occured');

      // The stack should start with the default error message formatting
      expect(e.stack.split('\n')[0]).equal('GstoreError: An error occured');

      // The first stack frame should be the function where the error was thrown.
      expect(e.stack.split('\n')[1].indexOf('doSomethingBad')).equal(7);

      // The error code should be set
      expect(e.code).equal('ERR_GENERIC');
    }
  });

  test('should fall back to generic if no message passed', () => {
    const func = (): void => {
      throw new GstoreError();
    };

    try {
      func();
    } catch (e) {
      expect(e.code).equal('ERR_GENERIC');
      expect(e.toString()).equal('GstoreError: An error occured');
    }
  });
});

describe('TypeError', () => {
  test('should create a TypeError', () => {
    const throwTypeError = (code?: string): void => {
      code = code || 'ERR_GENERIC';
      throw new TypeError(code);
    };

    try {
      throwTypeError();
    } catch (e) {
      expect(e.name).equal('TypeError');
      expect(e instanceof TypeError);
      expect(e instanceof GstoreError);
      expect(e instanceof Error);
    }
  });
});
