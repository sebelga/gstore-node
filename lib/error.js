/* eslint no-use-before-define: "off" */

'use strict';

class GstoreError extends Error {

    constructor(msg) {
        super();
        this.constructor.captureStackTrace(this);

        this.message = msg;
        this.name = 'GstoreError';
    }

    static get ValidationError() {
        return class extends ValidationError {};
    }

    static get ValidatorError() {
        return class extends ValidatorError {};
    }
}

class ValidationError extends GstoreError {
    constructor(instance) {
        if (instance && instance.constructor.entityKind) {
            super(`${instance.constructor.entityKind} validation failed`);
        } else if (instance && instance.constructor.name === 'Object') {
            super(instance);
        } else {
            super('Validation failed');
        }
        this.name = 'ValidationError';
    }
}

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

module.exports = {
    GstoreError,
    ValidationError,
    ValidatorError,
};
