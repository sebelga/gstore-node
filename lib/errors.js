/* eslint no-use-before-define: "off" */

'use strict';

const util = require('util');
const is = require('is');

const errorCodes = {
    ERR_ENTITY_NOT_FOUND: 'ERR_ENTITY_NOT_FOUND',
    ERR_GENERIC: 'ERR_GENERIC',
    ERR_VALIDATION: 'ERR_VALIDATION',
    ERR_PROP_TYPE: 'ERR_PROP_TYPE',
    ERR_PROP_VALUE: 'ERR_PROP_VALUE',
    ERR_PROP_NOT_ALLOWED: 'ERR_PROP_NOT_ALLOWED',
    ERR_PROP_REQUIRED: 'ERR_PROP_REQUIRED',
    ERR_PROP_IN_RANGE: 'ERR_PROP_IN_RANGE',
};

const message = (text, ...args) => util.format(text, ...args);

const messages = {
    ERR_GENERIC: 'An error occured',
    ERR_VALIDATION: entityKind => message('The entity data does not validate against the "%s" Schema', entityKind),
    ERR_PROP_TYPE: (prop, type) => message('Property "%s" must be a %s', prop, type),
    ERR_PROP_VALUE: (value, prop) => message('"%s" is not a valid value for property "%s"', value, prop),
    ERR_PROP_NOT_ALLOWED: (prop, entityKind) => (
        message('Property "%s" is not allowed for entityKind "%s"', prop, entityKind)
    ),
    ERR_PROP_REQUIRED: prop => message('Property "%s" is required but no value has been provided', prop),
    ERR_PROP_IN_RANGE: (prop, range) => message('Property "%s" must be one of [%s]', prop, range && range.join(', ')),
};

class GstoreError extends Error {
    constructor(code, msg, args) {
        if (!msg && code && code in messages) {
            if (is.function(messages[code])) {
                msg = messages[code](...args.messageParams);
            } else {
                msg = messages[code];
            }
        }

        if (!msg) {
            msg = messages.ERR_GENERIC;
        }

        super(msg, code, args);
        this.name = 'GstoreError';
        this.message = msg;
        this.code = code || errorCodes.ERR_GENERIC;

        if (args) {
            Object.keys(args).forEach((k) => {
                if (k !== 'messageParams') {
                    this[k] = args[k];
                }
            });
        }

        Error.captureStackTrace(this, this.constructor);
    }

    static get TypeError() {
        return class extends TypeError {};
    }

    static get ValueError() {
        return class extends ValueError {};
    }

    static get ValidationError() {
        return class extends ValidationError {};
    }
}

class ValidationError extends GstoreError {
    constructor(...args) {
        super(...args);
        this.name = 'ValidationError';
        Error.captureStackTrace(this, this.constructor);
    }
}

class TypeError extends GstoreError {
    constructor(...args) {
        super(...args);
        this.name = 'TypeError';
        Error.captureStackTrace(this, this.constructor);
    }
}

class ValueError extends GstoreError {
    constructor(...args) {
        super(...args);
        this.name = 'ValueError';
        Error.captureStackTrace(this, this.constructor);
    }
}

module.exports = {
    GstoreError,
    ValidationError,
    TypeError,
    ValueError,
    message,
    errorCodes,
};
