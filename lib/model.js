'use strict';

const is = require('is');
const arrify = require('arrify');
const extend = require('extend');
const hooks = require('promised-hooks');

const Entity = require('./entity');
const Query = require('./query');
const datastoreSerializer = require('./serializer').Datastore;
const utils = require('./utils');
const { GstoreError, errorCodes } = require('./errors');
const { validation } = require('./helpers');

const sanitize = (data, schema) => {
    if (!is.object(data)) {
        return null;
    }

    if (!is.undef(schema._joi)) {
        const { value } = schema._joi.validate(data);
        return value;
    }

    const newData = Object.assign({}, data);

    Object.keys(data).forEach((k) => {
        if (schema.options.explicitOnly !== false &&
            (!{}.hasOwnProperty.call(schema.paths, k) || schema.paths[k].write === false)) {
            delete newData[k];
        } else if (newData[k] === 'null') {
            newData[k] = null;
        }
    });

    return newData;
};

class Model extends Entity {
    static compile(kind, schema, gstore) {
        const ModelInstance = class extends Model { };

        // Wrap the Model to add "pre" and "post" hooks functionalities
        hooks.wrap(ModelInstance);

        ModelInstance.schema = schema;
        ModelInstance.schema.__meta = metaData();
        ModelInstance.registerHooksFromSchema();

        /**
         * Add schema "custom" methods on the prototype
         * to be accesible from Entity instances
         */
        applyMethods(ModelInstance.prototype, schema);
        applyStatics(ModelInstance, schema);

        ModelInstance.prototype.entityKind = kind;
        ModelInstance.entityKind = kind;

        ModelInstance.prototype.gstore = gstore;
        ModelInstance.gstore = gstore;

        /**
         * Create virtual properties (getters and setters for entityData object)
         */
        Object.keys(schema.paths)
            .filter(key => ({}.hasOwnProperty.call(schema.paths, key)))
            .forEach(key => Object.defineProperty(ModelInstance.prototype, key, {
                get: function getProp() { return this.entityData[key]; },
                set: function setProp(newValue) {
                    this.entityData[key] = newValue;
                },
            }));

        return ModelInstance;

        // ---------------

        // To improve performance and avoid looping over and over the entityData or Schema
        // we keep here some meta data to be used later in models and entities methods
        function metaData() {
            const meta = {};

            // retreive "geoPoint" type props
            // so we can automatically convert valid lng/lat objects
            // to datastore.geoPoints
            Object.keys(schema.paths).forEach((k) => {
                if (schema.paths[k].type === 'geoPoint') {
                    meta.geoPointsProps = meta.geoPointsProps || [];
                    meta.geoPointsProps.push(k);
                }
            });

            return meta;
        }
    }

    /**
     * Pass all the "pre" and "post" hooks from schema to
     * the current ModelInstance
     */
    static registerHooksFromSchema() {
        const self = this;
        const callQueue = this.schema.callQueue.model;

        if (!Object.keys(callQueue).length) {
            return this;
        }

        Object.keys(callQueue).forEach(addHooks);

        return self;

        // --------------------------------------

        function addHooks(method) {
            // Add Pre hooks
            callQueue[method].pres.forEach((fn) => {
                self.pre(method, fn);
            });

            // Add Post hooks
            callQueue[method].post.forEach((fn) => {
                self.post(method, fn);
            });
        }
    }

    /**
     * Get and entity from the Datastore
     */
    static get(id, ancestors, namespace, transaction, options, cb) {
        let ids = arrify(id);
        const _this = this;
        const args = Array.prototype.slice.apply(arguments);

        cb = args.pop();
        ids = ids.map(parseId);
        ancestors = args.length > 1 ? args[1] : undefined;
        namespace = args.length > 2 ? args[2] : undefined;
        transaction = args.length > 3 ? args[3] : undefined;
        options = args.length > 4 ? args[4] : {};

        const key = this.key(ids, ancestors, namespace);

        /**
         * If gstore has been initialize with a cache we first fetch
         * the key(s) from it.
         * gstore-cache underneath will call the "fetchHandler" with only the keys that haven't
         * been found. The final response is the merge of the cache result + the fetch.
         */
        if (this.__hasCache(options)) {
            const fetchHandler = keys => fetchEntity(keys);
            return this.gstore.cache.keys.read(key, options, fetchHandler)
                .then(res => [res]) // google-cloud returns entity(ies) in response[0]
                .then(onEntity)
                .catch(onError);
        }

        return fetchEntity(key)
            .then(onEntity)
            .catch(onError);

        // ----------

        function fetchEntity(keys = key) {
            keys = arrify(keys);
            const isMultiple = keys.length > 1;
            const { dataloader } = options;

            if (transaction) {
                if (transaction.constructor.name !== 'Transaction') {
                    throw Error('Transaction needs to be a gcloud Transaction');
                }
                return transaction.get(keys);
            }

            if (dataloader) {
                if (dataloader.constructor.name !== 'DataLoader') {
                    return cb(new GstoreError(errorCodes.ERR_GENERIC, 'dataloader must be a "DataLoader" instance'));
                }
                if (isMultiple) {
                    return dataloader.loadMany(keys);
                }
                return dataloader.load(keys[0]);
            }
            keys = isMultiple ? keys : keys[0];
            return _this.gstore.ds.get(keys);
        }

        function onEntity(data) {
            data = arrify(data);

            if (data.length === 0 || typeof data[0] === 'undefined') {
                return cb(new GstoreError(
                    errorCodes.ERR_ENTITY_NOT_FOUND,
                    `${_this.entityKind} { ${id.toString()} } not found`
                ));
            }

            let entity = arrify(data[0]).filter(_entity => typeof _entity !== 'undefined');
            const isMultiple = ids.length > 1;

            entity = entity.map(_entity => _this.__model(_entity, null, null, null, _entity[_this.gstore.ds.KEY]));

            if (isMultiple && options.preserveOrder) {
                entity.sort((a, b) => id.indexOf(a.entityKey.id) - id.indexOf(b.entityKey.id));
            }

            const response = isMultiple ? entity : entity[0];

            return cb(null, response);
        }

        function onError(err) {
            return cb(err);
        }
    }

    static update(id, data, ancestors, namespace, transaction, options, cb) {
        this.__hooksEnabled = true;

        const _this = this;
        const args = Array.prototype.slice.apply(arguments);

        let entityUpdated;
        let error = {};

        cb = args.pop();
        id = parseId(id);
        ancestors = args.length > 2 ? args[2] : undefined;
        namespace = args.length > 3 ? args[3] : undefined;
        transaction = args.length > 4 ? args[4] : undefined;
        options = args.length > 5 ? args[5] : undefined;

        const key = this.key(id, ancestors, namespace);
        const override = options && options.replace === true;

        /**
         * If options.replace is set to true we don't fetch the entity
         * and save the data directly to the specified key, overriding any previous data.
         */
        if (override) {
            return saveEntity({ key, data })
                .then(onEntityUpdated, onUpdateError);
        }

        if (typeof transaction === 'undefined' || transaction === null) {
            transaction = this.gstore.ds.transaction();
            return transaction
                .run()
                .then(getAndUpdate)
                .catch(onTransactionError);
        }

        if (transaction.constructor.name !== 'Transaction') {
            throw Error('Transaction needs to be a gcloud Transaction');
        }

        return getAndUpdate()
            .catch(onTransactionError);

        // ---------------------------------------------------------

        function getAndUpdate() {
            return getEntity()
                .then(saveEntity)
                .then(onEntityUpdated, onUpdateError);
        }

        function getEntity() {
            return new Promise((resolve, reject) => {
                return transaction.get(key).then(onEntity, onGetError);

                function onEntity(getData) {
                    const entity = getData[0];

                    if (typeof entity === 'undefined') {
                        error = new GstoreError(
                            errorCodes.ERR_ENTITY_NOT_FOUND,
                            `Entity { ${id.toString()} } to update not found`
                        );
                        return reject(error);
                    }

                    extend(false, entity, data);

                    const result = {
                        key: entity[_this.gstore.ds.KEY],
                        data: entity,
                    };

                    return resolve(result);
                }

                function onGetError(err) {
                    error = err;
                    reject(error);
                }
            });
        }

        function saveEntity(getData) {
            const entityKey = getData.key;
            const entityData = getData.data;
            const model = _this.__model(entityData, null, null, null, entityKey);

            /**
             * If a DataLoader instance is passed in the options
             * attach it to the entity so it is available in "pre" hooks
             */
            if (options && options.dataloader) {
                model.dataloader = options.dataloader;
            }

            return model.save(transaction);
        }

        function onEntityUpdated(entity) {
            entityUpdated = entity;

            if (options && options.dataloader) {
                options.dataloader.clear(key);
            }

            if (transaction) {
                return transaction.commit().then(onTransactionSuccess);
            }

            return onTransactionSuccess();
        }

        function onUpdateError(err) {
            error = err;
            if (transaction) {
                return transaction.rollback().then(onTransactionError);
            }

            return onTransactionError([err]);
        }

        function onTransactionSuccess() {
            /**
             * Make sure to delete the cache for this key
             */
            if (_this.__hasCache(options)) {
                return _this.clearCache(key)
                    .then(() => cb(null, entityUpdated))
                    .catch((err) => {
                        let msg = 'Error while clearing the cache after updating the entity.';
                        msg += 'The entity has been updated successfully though. ';
                        msg += 'Both the cache error and the entity updated have been attached.';
                        const cacheError = new Error(msg);
                        cacheError.__entityUpdated = entityUpdated;
                        cacheError.__cacheError = err;
                        return cb(cacheError);
                    });
            }

            return cb(null, entityUpdated);
        }

        function onTransactionError(transactionData) {
            const apiResponse = transactionData ? transactionData[0] : {};
            extend(apiResponse, error);
            return cb(apiResponse);
        }
    }

    static delete(id, ancestors, namespace, transaction, key, options, cb) {
        const _this = this;
        this.__hooksEnabled = true;

        const args = Array.prototype.slice.apply(arguments);
        const multiple = is.array(id);

        cb = args.pop();
        id = multiple ? id.map(parseId) : parseId(id);
        ancestors = args.length > 1 ? args[1] : undefined;
        namespace = args.length > 2 ? args[2] : undefined;
        transaction = args.length > 3 ? args[3] : undefined;
        key = args.length > 4 ? args[4] : undefined;
        options = args.length > 5 ? args[5] : {};

        if (!key) {
            key = this.key(id, ancestors, namespace);
        }

        if (transaction && transaction.constructor.name !== 'Transaction') {
            throw Error('Transaction needs to be a gcloud Transaction');
        }

        /**
         * If it is a transaction, we create a hooks.post array that will be executed
         * when transaction succeeds by calling transaction.execPostHooks() ---> returns a Promise
         */
        if (transaction) {
            // disable (post) hooks, to only trigger them if transaction succeeds
            this.__hooksEnabled = false;
            this.hooksTransaction(transaction, this.__posts ? this.__posts.delete : undefined);
            transaction.delete(key);
            return cb();
        }

        return this.gstore.ds.delete(key).then(onDelete, onError);

        // -------------------------------------------------------

        function onDelete(results) {
            const response = results ? results[0] : {};
            response.key = key;

            /**
             * If we passed a DataLoader instance, we clear its cache
             */
            if (options.dataloader) {
                options.dataloader.clear(key);
            }

            if (typeof response.indexUpdates !== 'undefined') {
                response.success = response.indexUpdates > 0;
            }

            /**
             * Make sure to delete the cache for this key
             */
            if (_this.__hasCache(options)) {
                return _this.clearCache(key, options.clearQueries)
                    .then(() => cb(null, response))
                    .catch((err) => {
                        let msg = 'Error while clearing the cache after deleting the entity.';
                        msg += 'The entity has been deleted successfully though. ';
                        msg += 'The cache error has been attached.';
                        const cacheError = new Error(msg);
                        cacheError.__response = response;
                        cacheError.__cacheError = err;
                        return cb(cacheError);
                    });
            }

            return cb(null, response);
        }

        function onError(err) {
            return cb(err);
        }
    }

    static deleteAll(ancestors, namespace, cb) {
        const _this = this;
        const args = Array.prototype.slice.apply(arguments);

        cb = args.pop();
        ancestors = args.length > 0 ? args[0] : undefined;
        namespace = args.length > 1 ? args[1] : undefined;

        const maxEntitiesPerBatch = 500;
        const timeoutBetweenBatches = 500;

        /**
         * We limit the number of entities fetched to 100.000 to avoid hang up the system when
         * there are > 1 million of entities to delete
         */
        const limitDataPerQuery = 100000;

        let currentBatch;
        let entities;
        let totalBatches;

        return createQueryWithLimit().run({ cache: false }).then(onEntities, onError);

        // ------------------------------------------------

        function createQueryWithLimit() {
            // We query only limit number in case of big table
            // If we query with more than million data query will hang up
            const query = _this.initQuery(namespace);
            if (ancestors) {
                query.hasAncestor(_this.gstore.ds.key(ancestors.slice()));
            }
            query.select('__key__');
            query.limit(limitDataPerQuery);

            return query;
        }

        function onEntities(data) {
            // [entities] = data;
            ({ entities } = data);

            if (entities.length === 0) {
                // No more Data in table
                return cb(null, {
                    success: true,
                    message: `All ${_this.entityKind} deleted successfully.`,
                });
            }

            currentBatch = 0;

            // We calculate the total batches we will need to process
            // The Datastore does not allow more than 500 keys at once when deleting.
            totalBatches = Math.ceil(entities.length / maxEntitiesPerBatch);

            return deleteEntities(currentBatch);
        }

        function deleteEntities(batch) {
            const indexStart = batch * maxEntitiesPerBatch;
            const indexEnd = indexStart + maxEntitiesPerBatch;
            const entitiesToDelete = entities.slice(indexStart, indexEnd);

            if ((_this.__pres && {}.hasOwnProperty.call(_this.__pres, 'delete'))) {
                // We execute delete in serie (chaining Promises) --> so we call each possible pre & post hooks
                return entitiesToDelete.reduce(chainPromise, Promise.resolve())
                    .then(onEntitiesDeleted, onError);
            }

            const keys = entitiesToDelete.map(entity => entity[_this.gstore.ds.KEY]);

            // We only need to clear the Queries from the cache once,
            // so we do it on the first batch.
            const clearQueries = currentBatch === 0;
            return _this.delete.call(_this, null, null, null, null, keys, { clearQueries })
                .then(onEntitiesDeleted, onError);
        }

        function onError(err) {
            return cb(err);
        }

        function onEntitiesDeleted() {
            currentBatch += 1;

            if (currentBatch < totalBatches) {
                // Still more batches to process
                return setTimeout(() => deleteEntities(currentBatch), timeoutBetweenBatches);
            }

            // Re-run the fetch Query in case there are still entities to delete
            return createQueryWithLimit().run().then(onEntities, onError);
        }

        function chainPromise(promise, entity) {
            return promise.then(() => _this.delete.call(_this, null, null, null, null, entity[_this.gstore.ds.KEY]));
        }
    }

    /**
     * Generate one or an Array of Google Datastore entity keys
     * based on the current entity kind
     *
     * @param {Number|String|Array} ids Id of the entity(ies)
     * @param {Array} ancestors Ancestors path (otional)
     * @namespace {String} namespace The namespace where to store the entity
     */
    static key(ids, ancestors, namespace) {
        const _this = this;
        const keys = [];

        let multiple = false;

        if (typeof ids !== 'undefined' && ids !== null) {
            ids = arrify(ids);

            multiple = ids.length > 1;

            ids.forEach((id) => {
                const key = getKey(id);
                keys.push(key);
            });
        } else {
            const key = getKey(null);
            keys.push(key);
        }

        return multiple ? keys : keys[0];

        // ----------------------------------------

        function getKey(id) {
            const path = getPath(id);
            let key;

            if (typeof namespace !== 'undefined' && namespace !== null) {
                key = _this.gstore.ds.key({
                    namespace,
                    path,
                });
            } else {
                key = _this.gstore.ds.key(path);
            }
            return key;
        }

        function getPath(id) {
            let path = [_this.entityKind];

            if (typeof id !== 'undefined' && id !== null) {
                id = parseId(id);
                path.push(id);
            }

            if (ancestors && is.array(ancestors)) {
                path = ancestors.concat(path);
            }

            return path;
        }
    }

    /**
     * Add "post" hooks to a transaction
     */
    static hooksTransaction(transaction, postHooks) {
        postHooks = arrify(postHooks);

        if (!{}.hasOwnProperty.call(transaction, 'hooks')) {
            transaction.hooks = {
                post: [],
            };
        }

        postHooks.forEach(hook => transaction.hooks.post.push(hook));

        transaction.execPostHooks = function executePostHooks() {
            if (this.hooks.post) {
                return this.hooks.post.reduce((promise, hook) => promise.then(hook), Promise.resolve());
            }

            return Promise.resolve();
        };
    }

    /**
     * Dynamic properties (in non explicitOnly Schemas) are indexes by default
     * This method allows to exclude from indexes those properties if needed
     * @param properties {Array} or {String}
     * @param cb
     */
    static excludeFromIndexes(properties) {
        properties = arrify(properties);

        properties.forEach((prop) => {
            if (!{}.hasOwnProperty.call(this.schema.paths, prop)) {
                this.schema.path(prop, { optional: true, excludeFromIndexes: true });
            } else {
                this.schema.paths[prop].excludeFromIndexes = true;
            }
        });
    }

    /**
     * Sanitize user data before saving to Datastore
     * @param data : userData
     */
    static sanitize(data) {
        return sanitize(data, this.schema);
    }

    /**
     * Clears all the cache related to the Model Entity Kind
     * If keys are passed, it will delete those keys, otherwise it will delete
     * all the queries in the cache linked to the Model Entity kind.
     * @param {DatastoreKeys} keys Keys to delete from the cache
     */
    static clearCache(_keys, clearQueries = true) {
        const handlers = [];

        if (clearQueries) {
            handlers.push(this.gstore.cache.queries.clearQueriesEntityKind(this.entityKind)
                .catch((e) => {
                    if (e.code === 'ERR_NO_REDIS') {
                        // Silently fail if no Redis Client
                        return;
                    }
                    throw e;
                }));
        }

        if (_keys) {
            const keys = arrify(_keys);
            handlers.push(this.gstore.cache.keys.del(...keys));
        }

        return Promise.all(handlers).then(() => ({ success: true }));
    }

    save(transaction, options, cb) {
        this.__hooksEnabled = true;
        const _this = this;
        const args = Array.prototype.slice.apply(arguments);
        const defaultOptions = {
            method: 'upsert',
        };

        cb = args.pop();
        transaction = args.length > 0 ? args[0] : undefined;
        options = args.length > 1 && args[1] !== null ? args[1] : {};
        extend(defaultOptions, options);

        const { error } = validateEntityData();

        if (error) {
            return cb(error);
        }

        validateMethod(defaultOptions.method);
        addPostHooksTransaction.call(this);

        this.entityData = prepareData.call(this);

        const entity = datastoreSerializer.toDatastore(this);
        entity.method = defaultOptions.method;

        if (!transaction) {
            return this.gstore.ds.save(entity).then(onSuccess, onError);
        }

        if (transaction.constructor.name !== 'Transaction') {
            throw Error('Transaction needs to be a gcloud Transaction');
        }

        transaction.save(entity);

        return cb(null, _this);

        // --------------------------

        function onSuccess() {
            /**
             * Make sure to clear the cache for this Entity Kind
             */
            if (_this.constructor.__hasCache(options)) {
                return _this.constructor.clearCache()
                    .then(() => cb(null, _this))
                    .catch((err) => {
                        let msg = 'Error while clearing the cache after saving the entity.';
                        msg += 'The entity has been saved successfully though. ';
                        msg += 'Both the cache error and the entity saved have been attached.';
                        const cacheError = new Error(msg);
                        cacheError.__entity = _this;
                        cacheError.__cacheError = err;
                        return cb(cacheError);
                    });
            }

            return cb(null, _this);
        }

        function onError(err) {
            return cb(err);
        }

        function validateEntityData() {
            if (_this.schema.options.validateBeforeSave) {
                return _this.validate();
            }

            return {};
        }

        function validateMethod(method) {
            const allowed = {
                update: true,
                insert: true,
                upsert: true,
            };

            if (!allowed[method]) {
                throw new Error('Method must be either "update", "insert" or "upsert"');
            }
        }

        /**
         * Process some basic formatting to the entity data before save
         * - automatically set the modifiedOn property to current date (if exists on schema)
         * - convert object with latitude/longitude to Datastore GeoPoint
         */
        function prepareData() {
            updateModifiedOn.call(this);
            convertGeoPoints.call(this);

            return this.entityData;

            //--------------------------

            /**
             * If the schema has a modifiedOn property we automatically
             * update its value to the current dateTime
            */
            function updateModifiedOn() {
                if ({}.hasOwnProperty.call(this.schema.paths, 'modifiedOn')) {
                    this.entityData.modifiedOn = new Date();
                }
            }

            /**
             * If the entityData has some property of type 'geoPoint'
             * and its value is an js object with "latitude" and "longitude"
             * we convert it to a datastore GeoPoint.
            */
            function convertGeoPoints() {
                if (!{}.hasOwnProperty.call(this.schema.__meta, 'geoPointsProps')) {
                    return;
                }

                this.schema.__meta.geoPointsProps.forEach((property) => {
                    if ({}.hasOwnProperty.call(_this.entityData, property) &&
                        _this.entityData[property] !== null &&
                        _this.entityData[property].constructor.name !== 'GeoPoint') {
                        _this.entityData[property] = _this.gstore.ds.geoPoint(_this.entityData[property]);
                    }
                });
            }
        }

        /**
         * If it is a transaction, we create a hooks.post array that will be executed
         * when transaction succeeds by calling transaction.execPostHooks() (returns a Promises)
         */
        function addPostHooksTransaction() {
            if (transaction) {
                // disable (post) hooks, we will only trigger them on transaction succceed
                this.__hooksEnabled = false;
                this.constructor.hooksTransaction(transaction, this.__posts ? this.__posts.save : undefined);
            }
        }
    }

    validate() {
        const { schema, entityKind } = this;
        let { entityData } = this;

        /**
         * If not a Joi schema, we sanitize before
         * Joi is going to do it for us
         */
        if (is.undef(schema._joi)) {
            entityData = sanitize(entityData, schema);
        }

        return validation.validate(entityData, schema, entityKind);
    }

    // ------------------------------------------------------------------------
    // "Private" methods
    // ------------------------------------------------------------------------

    /**
     * Creates an entity instance of a Model
     * @param data (entity data)
     * @param id
     * @param ancestors
     * @param namespace
     * @param key (gcloud entity Key)
     * @returns {Entity} Entity --> Model instance
     * @private
     */
    static __model(data, id, ancestors, namespace, key) {
        const M = this.compile(this.entityKind, this.schema, this.gstore);
        return new M(data, id, ancestors, namespace, key);
    }

    /**
     * Helper to change the function scope for a hook if necessary
     *
     * @param {String} hook The name of the hook (save, delete...)
     * @param {Array} args The arguments passed to the original method
     */
    static __scopeHook(hook, args) {
        const _this = this;

        switch (hook) {
            case 'delete':
                return getScopeForDeleteHooks();
            default:
                return _this;
        }

        /**
         * For "delete" hooks we want to set the scope to
         * the entity instance we are going to delete
         * We won't have any entity data inside the entity but, if needed,
         * we can then call the "datastoreEntity()" helper on the scope (this)
         * from inside the hook.
         * For "multiple" ids to delete, we obviously can't set any scope.
         */
        function getScopeForDeleteHooks() {
            let id = is.object(args[0]) && {}.hasOwnProperty.call(args[0], '__override') ?
                arrify(args[0].__override)[0] :
                args[0];

            const multiple = is.array(id);
            id = parseId(id);

            const ancestors = args.length > 1 ? args[1] : undefined;
            const namespace = args.length > 2 ? args[2] : undefined;
            const key = args.length > 4 ? args[4] : undefined;

            if (!id && !ancestors && !namespace && !key) {
                return undefined;
            }

            return multiple ? null : _this.__model(null, id, ancestors, namespace, key);
        }
    }

    /**
     * Helper to know if the cache is "on" to fetch entities or run a query
     *
     * @static
     * @private
     * @param {any} options The query options object
     * @param {string} [type='keys'] The type of fetching. Can either be 'keys' or 'queries'
     * @returns {boolean}
     * @memberof Model
     */
    static __hasCache(options = {}, type = 'keys') {
        if (typeof this.gstore.cache === 'undefined') {
            return false;
        }
        if (typeof options.cache !== 'undefined') {
            return options.cache;
        }
        if (this.gstore.cache.config.global === false && options.cache !== true) {
            return false;
        }
        if (this.gstore.cache.config.ttl[type] === -1) {
            return false;
        }
        return true;
    }
}

/**
 * Add custom methods declared on the Schema to the Entity Class
 *
 * @param {Entity} entity Model.prototype
 * @param {any} schema Model Schema
 * @returns Model.prototype
 */
function applyMethods(entity, schema) {
    Object.keys(schema.methods).forEach((method) => {
        entity[method] = schema.methods[method];
    });
    return entity;
}

function applyStatics(_Model, schema) {
    Object.keys(schema.statics).forEach((method) => {
        if (typeof _Model[method] !== 'undefined') {
            throw new Error(`${method} already declared as static.`);
        }
        _Model[method] = schema.statics[method];
    });
    return _Model;
}

function parseId(id) {
    return id !== null && isFinite(id) ? parseInt(id, 10) : id;
}

// Bind Query methods
const {
    initQuery,
    list,
    findOne,
    findAround,
} = new Query();

Model.initQuery = initQuery;
Model.query = initQuery; // create alias
Model.list = list;
Model.findOne = findOne;
Model.findAround = findAround;

// Promisify Model methods
Model.get = utils.promisify(Model.get);
Model.update = utils.promisify(Model.update);
Model.delete = utils.promisify(Model.delete);
Model.deleteAll = utils.promisify(Model.deleteAll);
Model.prototype.save = utils.promisify(Model.prototype.save);

module.exports = Model;
