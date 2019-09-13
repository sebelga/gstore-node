/* eslint-disable import/no-extraneous-dependencies */

'use strict';

import optional from 'optional';
import extend from 'extend';
import is from 'is';

const Joi = optional('@hapi/joi') || optional('joi');

import { queries } from './constants';
import VirtualType from './virtualType';
import { ValidationError, errorCodes } from './errors';

const IS_QUERY_HOOK = {
    update: true,
    delete: true,
    findOne: true,
};

const reserved = {
    _events: true,
    _eventsCount: true,
    _lazySetupHooks: true,
    _maxListeners: true,
    _posts: true,
    _pres: true,
    className: true,
    constructor: true,
    delete: true,
    domain: true,
    ds: true,
    emit: true,
    entityData: true,
    entityKey: true,
    errors: true,
    excludeFromIndexes: true,
    get: true,
    getEntityDataWithVirtuals: true,
    gstore: true,
    hook: true,
    init: true,
    isModified: true,
    isNew: true,
    listeners: true,
    model: true,
    modelName: true,
    on: true,
    once: true,
    plain: true,
    post: true,
    pre: true,
    removeListener: true,
    removePost: true,
    removePre: true,
    save: true,
    schema: true,
    set: true,
    toObject: true,
    update: true,
    validate: true,
};

class Schema {
    constructor(properties, options) {
        const self = this;

        this.instanceOfSchema = true;
        this.methods = {};
        this.statics = {};
        this.virtuals = {};
        this.shortcutQueries = {};
        this.paths = {};
        this.callQueue = {
            model: {},
            entity: {},
        };

        this.options = defaultOptions(options);

        Object.keys(properties).forEach(k => {
            if (reserved[k]) {
                throw new Error(`${k} is reserved and can not be used as a schema pathname`);
            }

            self.paths[k] = properties[k];
        });

        // defaultMiddleware.forEach((m) => {
        //     self[m.kind](m.hook, m.fn);
        // });

        if (options) {
            this._joi = buildJoiSchema(properties, this.options.joi);
        }
    }

    method(name, fn) {
        const self = this;
        if (typeof name !== 'string') {
            if (typeof name !== 'object') {
                return;
            }
            Object.keys(name).forEach(k => {
                if (typeof name[k] === 'function') {
                    self.methods[k] = name[k];
                }
            });
        } else if (typeof fn === 'function') {
            this.methods[name] = fn;
        }
    }

    queries(type, settings) {
        this.shortcutQueries[type] = settings;
    }

    path(propName, definition) {
        if (typeof definition === 'undefined') {
            if (this.paths[propName]) {
                return this.paths[propName];
            }
            return undefined;
        }

        if (reserved[propName]) {
            throw new Error(`${propName} is reserved and can not be used as a schema pathname`);
        }

        this.paths[propName] = definition;
        return this;
    }

    pre(method, fn) {
        const queue = IS_QUERY_HOOK[method] ? this.callQueue.model : this.callQueue.entity;

        if (!{}.hasOwnProperty.call(queue, method)) {
            queue[method] = {
                pres: [],
                post: [],
            };
        }

        return queue[method].pres.push(fn);
    }

    post(method, fn) {
        const queue = IS_QUERY_HOOK[method] ? this.callQueue.model : this.callQueue.entity;

        if (!{}.hasOwnProperty.call(queue, method)) {
            queue[method] = {
                pres: [],
                post: [],
            };
        }

        return queue[method].post.push(fn);
    }

    virtual(propName) {
        if (reserved[propName]) {
            throw new Error(`${propName} is reserved and can not be used as virtual property.`);
        }
        if (!{}.hasOwnProperty.call(this.virtuals, propName)) {
            this.virtuals[propName] = new VirtualType(propName);
        }
        return this.virtuals[propName];
    }

    validateJoi(entityData) {
        if (!this.isJoi) {
            return {
                error: new ValidationError(
                    errorCodes.ERR_GENERIC,
                    'Schema does not have a joi configuration object'
                ),
                value: entityData,
            };
        }
        return this._joi.validate(entityData, this.options.joi.options || {});
    }

    get isJoi() {
        return !is.undef(this._joi);
    }
}

/**
 * Static properties
 */
Schema.Types = {
    Double: 'double',
    GeoPoint: 'geoPoint',
    Key: 'entityKey',
};

/**
 * Merge options passed with the default option for Schemas
 * @param options
 */
function defaultOptions(options) {
    const optionsDefault = {
        validateBeforeSave: true,
        explicitOnly: true,
        excludeLargeProperties: false,
        queries: {
            readAll: false,
            format: queries.formats.JSON,
        },
    };
    options = extend(true, {}, optionsDefault, options);
    if (options.joi) {
        const joiOptionsDefault = {
            options: {
                allowUnknown: options.explicitOnly !== true,
            },
        };
        if (is.object(options.joi)) {
            options.joi = extend(true, {}, joiOptionsDefault, options.joi);
        } else {
            options.joi = { ...joiOptionsDefault };
        }
        if (!Object.prototype.hasOwnProperty.call(options.joi.options, 'stripUnknown')) {
            options.joi.options.stripUnknown = options.joi.options.allowUnknown !== true;
        }
    }
    return options;
}

function buildJoiSchema(schema, joiConfig) {
    if (!is.object(joiConfig)) {
        return undefined;
    }

    const hasExtra = is.object(joiConfig.extra);
    const joiKeys = {};

    Object.keys(schema).forEach(k => {
        if ({}.hasOwnProperty.call(schema[k], 'joi')) {
            joiKeys[k] = schema[k].joi;
        }
    });

    let joiSchema = Joi.object().keys(joiKeys);
    let args;

    if (hasExtra) {
        Object.keys(joiConfig.extra).forEach(k => {
            if (is.function(joiSchema[k])) {
                args = joiConfig.extra[k];
                joiSchema = joiSchema[k].apply(joiSchema, args);
            }
        });
    }

    return joiSchema;
}

export default Schema;
