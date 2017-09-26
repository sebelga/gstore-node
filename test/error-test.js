
'use strict';

const chai = require('chai');
const gstore = require('../');
const { GstoreError } = require('../lib/error');
const Model = require('../lib/model');
const Schema = require('../lib/schema');

const { ValidationError, ValidatorError } = GstoreError;
const { expect, assert } = chai;

describe('Datastools Errors', () => {
    it('should extend Error', () => {
        expect(GstoreError.prototype.name).equal('Error');
    });

    it('should set properties in constructor', () => {
        const error = new GstoreError('Something went wrong');

        expect(error.message).equal('Something went wrong');
        expect(error.name).equal('GstoreError');
    });

    it('should have static errors', () => {
        assert.isDefined(GstoreError.ValidationError);
        assert.isDefined(GstoreError.ValidatorError);
    });
});

describe('ValidationError', () => {
    it('should extend Error', () => {
        expect(ValidationError.prototype.name).equal('Error');
    });

    it('should return error data passed in param', () => {
        const errorData = {
            code: 400,
            message: 'Something went really bad',
        };
        const error = new ValidationError(errorData);

        expect(error.message).equal(errorData);
    });

    it('should return "{entityKind} validation failed" if called with entity instance', () => {
        const entityKind = 'Blog';
        const schema = new Schema({});
        const ModelInstance = Model.compile(entityKind, schema, gstore);
        const model = new ModelInstance({});
        const error = new ValidationError(model);

        expect(error.message).equal(`${entityKind} validation failed`);
    });

    it('should return "Validation failed" if called without param', () => {
        const error = new ValidationError();

        expect(error.message).equal('Validation failed');
    });
});

describe('ValidatorError', () => {
    it('should extend Error', () => {
        expect(ValidatorError.prototype.name).equal('Error');
    });

    it('should return error data passed in param', () => {
        const errorData = {
            code: 400,
            message: 'Something went really bad',
        };
        const error = new ValidatorError(errorData);

        expect(error.message.errorName).equal('Wrong format');
        expect(error.message.message).equal(errorData.message);
    });

    it('should set error name passed in param', () => {
        const errorData = {
            code: 400,
            errorName: 'Required',
            message: 'Something went really bad',
        };
        const error = new ValidatorError(errorData);

        expect(error.message.errorName).equal(errorData.errorName);
    });

    it('should return "Validation failed" if called without param', () => {
        const error = new ValidatorError();

        expect(error.message).equal('Value validation failed');
    });
});
