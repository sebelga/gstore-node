(function() {
    'use strict';

    var EventEmitter = require('events').EventEmitter;
    var utils        = require('./utils');
    var Kareem       = require('kareem');

    class Schema {
        constructor(obj, options) {
            var self              = this;

            this.instanceOfSchema = true;
            this.methods          = {};
            this.defaultQueries   = {};
            this.paths            = {};
            this.callQueue        = [];
            this.options          = defaultOptions(options);

            this.s = {
                hooks: new Kareem(),
                queryHooks: IS_QUERY_HOOK
            };

            Object.keys(obj).forEach((k) => {
                if (reserved[k]) {
                    throw new Error('`' + k + '` may not be used as a schema pathname');
                }
                self.paths[k] = obj[k];
            });
        }

        /**
         * Allow to add custom methods to a Schema
         * @param name
         * @param fn
         */
        method (name, fn) {
            let self = this;
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

        /**
         * Add a default queries settings
         * @param type
         * @param settings
         */
        queries (type, settings) {
            this.defaultQueries[type] = settings;
        }

        /**
         * Set or Get a path
         * @param path
         * @param obj
         */
        path (path, obj) {
            if (typeof obj === 'undefined') {
                if (this.paths[path]) {
                    return this.paths[path];
                } else {
                    return undefined;
                }
            }

            if (reserved[path]) {
                throw new Error('`' + path + '` may not be used as a schema pathname');
            }

            this.paths[path] = obj;
            return this;
        }
    }

    /**
     * Merge options passed with the default option for Schemas
     * @param options
     */
    function defaultOptions(options) {
        let optionsDefault = {
            validateBeforeSave:true,
            typeKey : 'type'
        };
        return utils.options(defaultOptions, options);
    }

    const IS_QUERY_HOOK = {
        update : true
    };

    const reserved = {
        ds:true,
        entityKey:true,
        emit:true,
        on:true,
        once:true,
        listeners:true,
        removeListener:true,
        errors:true,
        init:true,
        isModified:true,
        isNew:true,
        get:true,
        modelName:true,
        save:true,
        schema:true,
        set:true,
        toObject:true,
        validate:true,
        pre:true,
        post:true,
        _pre:true,
        _post:true
    };

    module.exports = exports = Schema;
})();

