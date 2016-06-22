var chai = require('chai');
var expect= chai.expect;

var Model           = require('../../lib/model');
var Schema          = require('../../lib/schema');
var ValidationError = require('../../lib/error/validation');

describe('ValidationError', () => {
    "use strict";

    it('should extend Error', () => {
        expect(ValidationError.prototype.name).equal('Error');
    });

    it('should return error data passed in param', () => {
        let errorData = {
            code : 400,
            message: 'Something went really bad'
        };
        let error = new ValidationError(errorData);

        expect(error.message).equal(errorData);
    });

    it('should return "{entityKind} validation failed" if called with entity instance', () => {
        let entityKind    = 'Blog';
        let schema        = new Schema({});
        let ModelInstance = Model.compile(entityKind, schema, {key:()=> {}});
        let model         = new ModelInstance({});
        let error         = new ValidationError(model);

        expect(error.message).equal(entityKind + ' validation failed');
    });

    it('should return "Validation failed" if called without param', () => {
        let error = new ValidationError();

        expect(error.message).equal('Validation failed');
    });
});
