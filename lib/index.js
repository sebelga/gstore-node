'use strict';

/* eslint-disable prefer-template */

const is = require('is');
const extend = require('extend');
const hooks = require('promised-hooks');
const NsqlCache = require('nsql-cache');
const dsAdapter = require('nsql-cache-datastore');

const Schema = require('./schema');
const Model = require('./model');
const { queries } = require('./constants');
const {
    GstoreError,
    ValidationError,
    TypeError,
    ValueError,
    errorCodes,
} = require('./errors');
const defaultValues = require('./helpers/defaultValues');
const datastoreSerializer = require('./serializer').Datastore;
const { createDataLoader } = require('./dataloader');

const pkg = require('../package.json');

const defaultConfig = {
    cache: undefined,
    errorOnEntityNotFound: true,
};

class Gstore {
    constructor(config = {}) {
        if (!is.object(config)) {
            throw new Error('Gstore config must be an object.');
        }

        this.models = {};
        this.modelSchemas = {};
        this.options = {};
        this.config = Object.assign({}, defaultConfig, config);
        this.Schema = Schema;
        this.Queries = queries;
        this._defaultValues = defaultValues;
        this._pkgVersion = pkg.version;

        this.errors = {
            GstoreError,
            ValidationError,
            TypeError,
            ValueError,
            codes: errorCodes,
        };
        this.ERR_HOOKS = hooks.ERRORS;
        this.createDataLoader = createDataLoader;
    }

    model(entityKind, schema, options) {
        if (is.object(schema) && !(schema.instanceOfSchema)) {
            schema = new Schema(schema);
        }

        options = options || {};

        // look up schema in cache
        if (!this.modelSchemas[entityKind]) {
            if (schema) {
                // cache it so we only apply plugins once
                this.modelSchemas[entityKind] = schema;
            } else {
                throw new Error(`Schema ${entityKind} missing`);
            }
        }

        // we might be passing a different schema for
        // an existing model entityKind. in this case don't read from cache.
        if (this.models[entityKind] && options.cache !== false) {
            if (schema && schema.instanceOfSchema && schema !== this.models[entityKind].schema) {
                throw new Error('Trying to override ' + entityKind + ' Model Schema');
            }
            return this.models[entityKind];
        }

        const model = Model.compile(entityKind, schema, this);

        if (options.cache === false) {
            return model;
        }

        this.models[entityKind] = model;

        return this.models[entityKind];
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

    save(entities, transaction, options = {}) {
        if (!entities) {
            throw new Error('No entities passed');
        }

        /**
         * Validate entities before saving
         */
        if (options.validate) {
            let error;
            const validateEntity = (entity) => {
                ({ error } = entity.validate());
                if (error) {
                    throw error;
                }
            };
            try {
                if (Array.isArray(entities)) {
                    entities.forEach(validateEntity);
                } else {
                    validateEntity(entities);
                }
            } catch (err) {
                return Promise.reject(err);
            }
        }

        // Convert gstore entities to datastore forma ({key, data})
        const entitiesSerialized = datastoreSerializer.entitiesToDatastore(entities, options);

        if (transaction) {
            return transaction.save(entitiesSerialized);
        }

        // We forward the call to google-datastore
        return this._ds.save.call(this._ds, entitiesSerialized);
    }

    // Connect to Google Datastore instance
    connect(ds) {
        if (!ds.constructor || ds.constructor.name !== 'Datastore') {
            throw new Error('No @google-cloud/datastore instance provided.');
        }

        this._ds = ds;

        if (this.config.cache) {
            const defaultCacheSettings = {
                config: {
                    wrapClient: false,
                },
            };
            const cacheSettings = this.config.cache === true
                ? defaultCacheSettings
                : extend(true, {}, defaultCacheSettings, this.config.cache);
            const { stores, config } = cacheSettings;
            const db = dsAdapter(ds);
            this.cache = new NsqlCache({ db, stores, config });
            delete this.config.cache;
        }
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

const instances = {
    refs: new Map(),
    get(id) {
        return this.refs.get(id);
    },
    set(id, instance) {
        this.refs.set(id, instance);
    },
};

module.exports = {
    Gstore,
    instances,
};
