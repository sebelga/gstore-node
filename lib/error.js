
'use strict';

class GstoreError extends Error {
    constructor(msg) {
        super();
        this.constructor.captureStackTrace(this);

        this.message = msg;
        this.name    = 'GstoreError';
    }

    static get ValidationError() {
        return require('./error/validation');
    }

    static get ValidatorError() {
        return require('./error/validator');
    }
}

module.exports = exports = GstoreError;
