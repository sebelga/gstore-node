'use strict';

var GstoreError = require('../error.js');

class ValidationError extends GstoreError {
    constructor(instance) {
        if (instance && instance.constructor.entityKind) {
            super(instance.constructor.entityKind + ' validation failed');
        } else if (instance && instance.constructor.name === 'Object') {
            super(instance);
        } else {
            super('Validation failed');
        }
        this.name = 'ValidationError';
    }
}

module.exports = exports = ValidationError;
