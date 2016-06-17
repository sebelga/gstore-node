(function() {
    'use strict';

    var extend       = require('extend');
    var utils        = require('./utils');
    var Kareem       = require('kareem');

    var DatastoolsError   = require('./error.js');

    class Schema {
        constructor(obj, options) {
            var self              = this;

            this.instanceOfSchema = true;
            this.methods          = {};
            this.shortcutQueries  = {};
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

                // if (!obj[k].hasOwnProperty('type')) {
                //     obj[k].type = 'string';
                // }

                self.paths[k] = obj[k];
            });

            defaultMiddleware.forEach(function(m) {
                self[m.kind](m.hook, !!m.isAsync, m.fn);
            });
        }

        /**
         * Allow to add custom methods to a Schema
         * @param name can be a method name or an object of functions
         * @param fn (optional, the function to execute)
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
            this.shortcutQueries[type] = settings;
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

        pre () {
            var hook = arguments[0];

            if (IS_QUERY_HOOK[hook]) {
                this.s.hooks.pre.apply(this.s.hooks, arguments);
                return this;
            }
            return this.queue('pre', arguments);
        }

        post(method, fn) {
            if (IS_QUERY_HOOK[method]) {
                this.s.hooks.post.apply(this.s.hooks, arguments);
                return this;
            }
            return this.queue('on', [method, fn]);
        }

        queue(fn, args) {
            this.callQueue.push([fn, args]);
        }
    }

    /**
     * Merge options passed with the default option for Schemas
     * @param options
     */
    function defaultOptions(options) {
        let optionsDefault = {
            validateBeforeSave:true,
            queries : {
                simplifyResult : true,
                readAll : false
            }
        };
        options = extend(true, {}, optionsDefault, options);
        return options;
    }

    const defaultMiddleware = [
        /* Validate Schema Middleware */
        {
            kind:'pre',
            hook:'save',
            fn: function(next) {
                var shouldValidate = this.schema.options.validateBeforeSave;
                // Validate
                if (shouldValidate) {
                    this.validate((result) => {
                        if (!result.success) {
                            delete result.success;
                            next(result.errors[Object.keys(result.errors)[0]]);
                        } else {
                            next();
                        }
                    });
                } else {
                    next();
                }
            }
        }
    ];
    const IS_QUERY_HOOK = {
        update : true,
        delete : true,
        findOne : true
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

