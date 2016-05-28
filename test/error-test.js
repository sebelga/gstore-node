
var chai = require('chai');
var expect = chai.expect;

var DatastoolsError = require('../lib/error');

describe('Datastools Errors', () => {
    "use strict";

    it ('should extend Error', () => {
        expect(DatastoolsError.prototype.name).equal('Error');
    });

    it('should set properties in constructor', () => {
        var error = new DatastoolsError('Something went wrong');

        expect(error.message).equal('Something went wrong');
        expect(error.name).equal('DatastoolsError');
    });

    it('should have static errors', () => {
        expect(DatastoolsError.ValidationError).exist;
        expect(DatastoolsError.ValidatorError).exist;
    });
});
