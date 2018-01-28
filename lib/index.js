'use strict';

/* eslint-disable prefer-template */

const is = require('is');
const hooks = require('promised-hooks');

const Schema = require('./schema');
const Model = require('./model');
const Queries = require('./queries');
const defaultValues = require('./helpers/defaultValues');
const datastoreSerializer = require('./serializer').Datastore;
const { createDataLoader } = require('./dataloader');

const pkg = require('../package.json');

const gstoreInstances = {};
const gstoreDefaultNamespace = 'com.github.gstore-node';

class Gstore {
    constructor() {
        this.models = {};
        this.modelSchemas = {};
        this.options = {};
        this.Schema = Schema;
        this.Queries = Queries;
        this._defaultValues = defaultValues;
        this._pkgVersion = pkg.version;

        this.ERR_HOOKS = hooks.ERRORS;
        this.createDataLoader = createDataLoader;
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

        let options;
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
                throw new Error(`Schema ${name} missing`);
            }
        }

        // we might be passing a different schema for
        // an existing model name. in this case don't read from cache.
        if (this.models[name] && options.cache !== false) {
            if (schema && schema.instanceOfSchema && schema !== this.models[name].schema) {
                throw new Error('Trying to override ' + name + ' Model Schema');
            }
            return this.models[name];
        }

        const model = Model.compile(name, schema, this);

        // if (!skipInit) {
        //     model.init();
        // }

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
        const names = Object.keys(this.models);
        return names;
    }

    save(entities, transaction) {
        if (!entities) {
            throw new Error('No entities passed');
        }

        const args = Array.prototype.slice.apply(arguments);

        // Convert gstore entities to datastore forma ({key, data})
        args[0] = datastoreSerializer.entitiesToDatastore(entities);

        if (args.length > 1 && !is.fn(args[1])) {
            // Save inside a transaction
            return transaction.save(args[0]);
        }

        // We forward the call to google-datastore
        return this._ds.save.apply(this._ds, args);
    }

    // Connect to Google Datastore instance
    connect(ds) {
        if (!ds.constructor || ds.constructor.name !== 'Datastore') {
            throw new Error('No @google-cloud/datastore instance provided.');
        }

        this._ds = ds;
    }

    /**
     * Expose the defaultValues constants
     */
    get defaultValues() {
        return this._defaultValues;
    }

    get version() {
        return this._pkgVersion;
    }

    get ds() {
        return this._ds;
    }
}

const instanceManager = (config) => {
    if (!is.undef(config) && !is.object(config)) {
        throw new Error('Wrong config format for gstore');
    } else if (config && !{}.hasOwnProperty.call(config, 'namespace')) {
        throw new Error('Missing "namespace" property on config');
    }

    const namespace = config && config.namespace ? config.namespace : gstoreDefaultNamespace;

    if ({}.hasOwnProperty.call(gstoreInstances, namespace)) {
        return gstoreInstances[namespace];
    }

    const gstore = new Gstore();

    gstoreInstances[namespace] = gstore;

    return gstore;
};

module.exports = instanceManager;
