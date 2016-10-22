'use strict';

var GstoreError = require('../error.js');

class ValidatorError extends GstoreError {
    constructor(data) {
        if (data && data.constructor.name === 'Object') {
            data.errorName = data.errorName || 'Wrong format';
            super(data);
        } else {
            super('Value validation failed');
        }
        this.name = 'ValidatorError';
    }
}

module.exports = exports = ValidatorError;
