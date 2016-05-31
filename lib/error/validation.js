'use strict';

var DatastoolsError = require('../error.js');

class ValidationError extends DatastoolsError {
    constructor(instance) {
        if (instance && instance.constructor.entityName) {
            super(instance.constructor.entityName + ' validation failed');
        } else if (instance && instance.constructor.name === 'Object') {
            super(instance);
        } else {
            super('Validation failed');
        }
        this.name = 'ValidationError';
    }
}

module.exports = exports = ValidationError;
