(function() {
    'use strict';

    var utils  = require('./utils');
    var Schema = require('./schema');
    var Model  = require('./model');

    var pkg = require('../package.json');

    class Datastools {
        constructor() {
            this.models       = {};
            this.modelSchemas = {};
            this.options      = {};
            this.Schema       = Schema;
        }

        // Set Google Datastore instance
        connect(ds) {
            this.ds = ds;
        }

        /**
         * Defines a Model and retreives it
         * @param name
         * @param schema
         * @param skipInit
         */
        model(name, schema, skipInit) {
            if (utils.isObject(schema) && !(schema.instanceOfSchema)) {
                schema = new Schema(schema);
            }

            var options;
            if (skipInit && utils.isObject(skipInit)) {
                options = skipInit;
                skipInit = true;
            } else {
                options = {};
            }

            // look up schema in cache
            if (!this.modelSchemas[name]) {
                if (schema) {
                    // cache it so we only apply plugins once
                    this.modelSchemas[name] = schema;
                } else {
                    throw new Error('Schema ' + name + ' missing');
                }
            }

            var model;

            // we might be passing a different schema for
            // an existing model name. in this case don't read from cache.
            if (this.models[name] && options.cache !== false) {
                if (schema && schema.instanceOfSchema && schema !== this.models[name].schema) {
                    throw new Error('Trying to override Model Schema');
                }
                return this.models[name];
            }

            var ds = options.ds || this.ds;
            model = Model.compile(name, schema, ds, this);
            if (!skipInit) {
                model.init();
            }

            if (options.cache === false) {
                return model;
            }

            this.models[name] = model;

            return this.models[name];
        }

        /**
         * Return an array of model names created on this instance of Datastools
         * @returns {Array}
         */
        modelNames() {
            var names = Object.keys(this.models);
            return names;
        }

        get version() {
            return pkg.version;
        }
    }

    module.exports = exports = new Datastools();
})();
