
'use strict';

class DatastoolsError extends Error {
    constructor(msg) {
        super();
        this.constructor.captureStackTrace(this);

        this.message = msg;
        this.name    = 'DatastoolsError';
    }

    static get ValidationError() {
        return require('./error/validation');
    }

    static get ValidatorError() {
        return require('./error/validator');
    }
}

module.exports = exports = DatastoolsError;
