
var chai = require('chai');
var expect = chai.expect;

var GstoreError = require('../lib/error');

describe('Datastools Errors', () => {
    "use strict";

    it ('should extend Error', () => {
        expect(GstoreError.prototype.name).equal('Error');
    });

    it('should set properties in constructor', () => {
        var error = new GstoreError('Something went wrong');

        expect(error.message).equal('Something went wrong');
        expect(error.name).equal('GstoreError');
    });

    it('should have static errors', () => {
        expect(GstoreError.ValidationError).exist;
        expect(GstoreError.ValidatorError).exist;
    });
});
