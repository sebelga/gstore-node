/* eslint-disable max-classes-per-file, no-use-before-define */

import util from 'util';
import is from 'is';

type MessageGetter = (...args: any[]) => string;

export const ERROR_CODES = {
  ERR_ENTITY_NOT_FOUND: 'ERR_ENTITY_NOT_FOUND',
  ERR_GENERIC: 'ERR_GENERIC',
  ERR_VALIDATION: 'ERR_VALIDATION',
  ERR_PROP_TYPE: 'ERR_PROP_TYPE',
  ERR_PROP_VALUE: 'ERR_PROP_VALUE',
  ERR_PROP_NOT_ALLOWED: 'ERR_PROP_NOT_ALLOWED',
  ERR_PROP_REQUIRED: 'ERR_PROP_REQUIRED',
  ERR_PROP_IN_RANGE: 'ERR_PROP_IN_RANGE',
};

export const message = (text: string, ...args: any[]): string => util.format(text, ...args);

const messages: { [key: string]: string | MessageGetter } = {
  ERR_GENERIC: 'An error occured',
  ERR_VALIDATION: (entityKind: string) =>
    message('The entity data does not validate against the "%s" Schema', entityKind),
  ERR_PROP_TYPE: (prop, type) => message('Property "%s" must be a %s', prop, type),
  ERR_PROP_VALUE: (value, prop) => message('"%s" is not a valid value for property "%s"', value, prop),
  ERR_PROP_NOT_ALLOWED: (prop, entityKind) =>
    message('Property "%s" is not allowed for entityKind "%s"', prop, entityKind),
  ERR_PROP_REQUIRED: prop => message('Property "%s" is required but no value has been provided', prop),
  ERR_PROP_IN_RANGE: (prop, range) => message('Property "%s" must be one of [%s]', prop, range && range.join(', ')),
};

export class GstoreError extends Error {
  public code: string;

  constructor(code?: string, msg?: string, args?: any) {
    if (!msg && code && code in messages) {
      if (is.function(messages[code])) {
        msg = (messages[code] as MessageGetter)(...args.messageParams);
      } else {
        msg = messages[code] as string;
      }
    }

    if (!msg) {
      msg = messages.ERR_GENERIC as string;
    }

    super(msg);
    this.name = 'GstoreError';
    this.message = msg;
    this.code = code || ERROR_CODES.ERR_GENERIC;

    if (args) {
      Object.keys(args).forEach(k => {
        if (k !== 'messageParams') {
          (this as any)[k] = args[k];
        }
      });
    }

    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends GstoreError {
  constructor(code: string, msg?: string, args?: any) {
    super(code, msg, args);
    this.name = 'ValidationError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export class TypeError extends GstoreError {
  constructor(code: string, msg?: string, args?: any) {
    super(code, msg, args);
    this.name = 'TypeError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValueError extends GstoreError {
  constructor(code: string, msg?: string, args?: any) {
    super(code, msg, args);
    this.name = 'ValueError';
    Error.captureStackTrace(this, this.constructor);
  }
}
