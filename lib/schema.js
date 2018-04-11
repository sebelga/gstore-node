/* eslint-disable import/no-extraneous-dependencies */

'use strict';

const optional = require('optional');
const extend = require('extend');
const is = require('is');

const Joi = optional('joi');

const { queries } = require('./constants');
const VirtualType = require('./virtualType');

const IS_QUERY_HOOK = {
    update: true,
    delete: true,
    findOne: true,
};

const reserved = {
    constructor: true,
    ds: true,
    gstore: true,
    entityKey: true,
    entityData: true,
    className: true,
    domain: true,
    excludeFromIndexes: true,
    emit: true,
    on: true,
    once: true,
    listeners: true,
    removeListener: true,
    errors: true,
    init: true,
    isModified: true,
    isNew: true,
    get: true,
    modelName: true,
    save: true,
    schema: true,
    set: true,
    toObject: true,
    validate: true,
    hook: true,
    pre: true,
    post: true,
    removePre: true,
    removePost: true,
    _pres: true,
    _posts: true,
    _events: true,
    _eventsCount: true,
    _lazySetupHooks: true,
    _maxListeners: true,
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

        Object.keys(properties).forEach((k) => {
            if (reserved[k]) {
                throw new Error(`${k} is reserved and can not be used as a schema pathname`);
            }

            self.paths[k] = properties[k];
        });

        // defaultMiddleware.forEach((m) => {
        //     self[m.kind](m.hook, m.fn);
        // });

        if (options) {
            this._joi = buildJoiSchema(properties, options.joi);
        }
    }

    method(name, fn) {
        const self = this;
        if (typeof name !== 'string') {
            if (typeof name !== 'object') {
                return;
            }
            Object.keys(name).forEach((k) => {
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
        if (!{}.hasOwnProperty.call(this.virtuals, propName)) {
            this.virtuals[propName] = new VirtualType(propName);
        }
        return this.virtuals[propName];
    }
}

/**
 * Static properties
 */
Schema.Types = {
    Double: 'double',
    GeoPoint: 'geoPoint',
};

/**
 * Merge options passed with the default option for Schemas
 * @param options
 */
function defaultOptions(options) {
    const optionsDefault = {
        validateBeforeSave: true,
        queries: {
            readAll: false,
            format: queries.formats.JSON,
        },
    };
    options = extend(true, {}, optionsDefault, options);
    return options;
}

function buildJoiSchema(schema, joiConfig) {
    if (is.undef(joiConfig)) {
        return undefined;
    }

    const hasExtra = is.object(joiConfig) && is.object(joiConfig.extra);
    const rawJoiSchema = {};

    Object.keys(schema).forEach((k) => {
        if ({}.hasOwnProperty.call(schema[k], 'joi')) {
            rawJoiSchema[k] = schema[k].joi;
        }
    });

    let joiSchema = Joi.object(rawJoiSchema);
    let args;

    if (hasExtra) {
        Object.keys(joiConfig.extra).forEach((k) => {
            if (is.function(joiSchema[k])) {
                args = joiConfig.extra[k];
                joiSchema = joiSchema[k].apply(joiSchema, args);
            }
        });
    }

    return joiSchema;
}

module.exports = Schema;
