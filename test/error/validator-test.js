var chai = require('chai');
var expect= chai.expect;

var ValidatorError = require('../../lib/error/validator');

describe('ValidatorError', () => {
    "use strict";

    it('should extend Error', () => {
        expect(ValidatorError.prototype.name).equal('Error');
    });

    it('should return error data passed in param', () => {
        let errorData = {
            code : 400,
            message: 'Something went really bad'
        };
        let error = new ValidatorError(errorData);

        expect(error.message).equal(errorData);
    });

    it('should return "Validation failed" if called without param', () => {
        let error = new ValidatorError();

        expect(error.message).equal('Value validation failed');
    });
});
