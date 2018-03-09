
'use strict';

const util = require('util');
const chai = require('chai');
const errors = require('../lib/errors');

const { GstoreError, TypeError, message } = errors;
const { expect, assert } = chai;

const doSomethingBad = (code) => {
    code = code || 'ERR_GENERIC';
    throw new GstoreError(code);
};

describe('message()', () => {
    it('should return string passed', () => {
        expect(message('My message')).equal('My message');
    });

    it('should return string passed with arguments', () => {
        expect(message('Hello %s %s', 'John', 'Snow')).equal('Hello John Snow');
        expect(message('Age: %d years old', 27)).equal('Age: 27 years old');
    });
});

describe('GstoreError', () => {
    it('should create a custom Error', () => {
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

    it('should fall back to generic if no message passed', () => {
        const func = () => {
            throw new GstoreError();
        };

        try {
            func();
        } catch (e) {
            expect(e.code).equal('ERR_GENERIC');
            expect(e.toString()).equal('GstoreError: An error occured');
        }
    });

    it('should have static errors', () => {
        assert.isDefined(GstoreError.TypeError);
        assert.isDefined(GstoreError.ValueError);
        assert.isDefined(GstoreError.ValidationError);
    });
});

describe('TypeError', () => {
    it('should create a TypeError', () => {
        const throwTypeError = (code) => {
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

            // The error should be recognized by Node.js' util#isError
            // expect(util.isError(e)).equal(true);
            // assert.isDefined(e.stack);
            // expect(e.toString()).equal('GstoreError: An error occured');

            // // The stack should start with the default error message formatting
            // expect(e.stack.split('\n')[0]).equal('GstoreError: An error occured');

            // // The first stack frame should be the function where the error was thrown.
            // expect(e.stack.split('\n')[1].indexOf('doSomethingBad')).equal(7);

            // // The error code should be set
            // expect(e.code).equal('ERR_GENERIC');
        }
    });

    // it('should extend Error', () => {
    //     expect(ValidationError.prototype.name).equal('Error');
    // });

    // it('should return error data passed in param', () => {
    //     const errorData = {
    //         code: 400,
    //         message: 'Something went really bad',
    //     };
    //     const error = new ValidationError(errorData);

    //     expect(error.message).equal(errorData);
    // });

    // it('should return "{entityKind} validation failed" if called with entity instance', () => {
    //     const entityKind = 'Blog';
    //     const schema = new Schema({});
    //     const ModelInstance = Model.compile(entityKind, schema, gstore);
    //     const model = new ModelInstance({});
    //     const error = new ValidationError(model);

    //     expect(error.message).equal(`${entityKind} validation failed`);
    // });

    // it('should return "Validation failed" if called without param', () => {
    //     const error = new ValidationError();

    //     expect(error.message).equal('Validation failed');
    // });
});

describe('ValidatorError', () => {
    // it('should extend Error', () => {
    //     expect(ValidatorError.prototype.name).equal('Error');
    // });

    // it('should return error data passed in param', () => {
    //     const errorData = {
    //         code: 400,
    //         message: 'Something went really bad',
    //     };
    //     const error = new ValidatorError(errorData);

    //     expect(error.message.errorName).equal('Wrong format');
    //     expect(error.message.message).equal(errorData.message);
    // });

    // it('should set error name passed in param', () => {
    //     const errorData = {
    //         code: 400,
    //         errorName: 'Required',
    //         message: 'Something went really bad',
    //     };
    //     const error = new ValidatorError(errorData);

    //     expect(error.message.errorName).equal(errorData.errorName);
    // });

    // it('should return "Validation failed" if called without param', () => {
    //     const error = new ValidatorError();

    //     expect(error.message).equal('Value validation failed');
    // });
});
