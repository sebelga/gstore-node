(function() {
    'use strict';

    var is     = require('is');
    var utils  = require('./utils');
    var Schema = require('./schema');
    var Model  = require('./model');

    var pkg = require('../package.json');

    class Gstore {
        constructor() {
            this.models       = {};
            this.modelSchemas = {};
            this.options      = {};
            this.Schema       = Schema;
        }

        // Set Google Datastore instance
        connect(ds) {
            if (ds.constructor.name !== 'Datastore') {
                throw new Error('A Datastore instances required on connect');
            }
            this._ds = ds;
        }

        /**
         * Defines a Model and retreives it
         * @param name
         * @param schema
         * @param skipInit
         */
        model(name, schema, skipInit) {
            if (is.object(schema) && !(schema.instanceOfSchema)) {
                schema = new Schema(schema);
            }

            var options;
            if (skipInit && is.object(skipInit)) {
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
                    throw new Error('Trying to override ' + name + ' Model Schema');
                }
                return this.models[name];
            }

            var ds = options.ds || this._ds;
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
         * Alias to gcloud datastore Transaction method
         */
        transaction() {
            return this._ds.transaction();
        }

        /**
         * Return an array of model names created on this instance of Gstore
         * @returns {Array}
         */
        modelNames() {
            var names = Object.keys(this.models);
            return names;
        }

        get version() {
            return pkg.version;
        }

        get ds() {
            return this._ds;
        }
    }

    module.exports = exports = new Gstore();
})();
