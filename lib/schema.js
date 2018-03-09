
/* eslint-disable import/no-extraneous-dependencies */

'use strict';

const extend = require('extend');
const is = require('is');
const Joi = require('joi');

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

// const defaultMiddleware = [
// ];

class Schema {
    constructor(obj, options) {
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

        Object.keys(obj).forEach((k) => {
            if (reserved[k]) {
                throw new Error(`${k} is reserved and can not be used as a schema pathname`);
            }

            self.paths[k] = obj[k];
        });

        // defaultMiddleware.forEach((m) => {
        //     self[m.kind](m.hook, m.fn);
        // });

        if (options) {
            this._joi = buildJoiSchema(obj, options.joi);
        }
    }

    /**
     * Allow to add custom methods to a Schema
     * @param name can be a method name or an object of functions
     * @param fn (optional, the function to execute)
     */
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

    /**
     * Add a default queries settings
     * @param type
     * @param settings
     */
    queries(type, settings) {
        this.shortcutQueries[type] = settings;
    }

    /**
     * Set or Get a path
     * @param path
     * @param obj
     */
    path(path, obj) {
        if (typeof obj === 'undefined') {
            if (this.paths[path]) {
                return this.paths[path];
            }
            return undefined;
        }

        if (reserved[path]) {
            throw new Error(`${path} is reserved and can not be used as a schema pathname`);
        }

        this.paths[path] = obj;
        return this;
    }

    pre(hook, fn) {
        const queue = IS_QUERY_HOOK[hook] ? this.callQueue.model : this.callQueue.entity;

        if (!{}.hasOwnProperty.call(queue, hook)) {
            queue[hook] = {
                pres: [],
                post: [],
            };
        }

        return queue[hook].pres.push(fn);
    }

    post(hook, fn) {
        const queue = IS_QUERY_HOOK[hook] ? this.callQueue.model : this.callQueue.entity;

        if (!{}.hasOwnProperty.call(queue, hook)) {
            queue[hook] = {
                pres: [],
                post: [],
            };
        }

        return queue[hook].post.push(fn);
    }

    virtual(name) {
        if (!{}.hasOwnProperty.call(this.virtuals, name)) {
            this.virtuals[name] = new VirtualType(name);
        }
        return this.virtuals[name];
    }
}

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
