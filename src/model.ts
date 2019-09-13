/* eslint-disable max-classes-per-file */

'use strict';

import is from 'is';
import arrify from 'arrify';
import extend from 'extend';
import hooks from 'promised-hooks';
import dsAdapterFactory from 'nsql-cache-datastore';
const dsAdapter = dsAdapterFactory();
import get from 'lodash.get';
import set from 'lodash.set';
import Entity from './entity';
import Query from './query';
import { GstoreError, errorCodes } from './errors';
import { populateHelpers } from './helpers';

const { keyToString } = dsAdapter;
const { populateFactory } = populateHelpers;

export class Model extends Entity {
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
         * Create virtual properties (getters and setters for "virtuals" defined on the Schema)
         */
        Object.keys(schema.virtuals)
            .filter(key => ({}.hasOwnProperty.call(schema.virtuals, key)))
            .forEach(key => Object.defineProperty(ModelInstance.prototype, key, {
                get: function getProp() {
                    return schema.virtuals[key].applyGetters({ ...this.entityData });
                },
                set: function setProp(newValue) {
                    schema.virtuals[key].applySetters(newValue, this.entityData);
                },
            }));

        return ModelInstance;

        // ---------------

        // To improve performance and avoid looping over and over the entityData or Schema
        // we keep here some meta data to be used later in models and entities methods
        function metaData() {
            const meta = {};

            Object.keys(schema.paths).forEach(k => {
                switch (schema.paths[k].type) {
                    case 'geoPoint':
                        // This allows us to automatically convert valid lng/lat objects
                        // to Datastore.geoPoints
                        meta.geoPointsProps = meta.geoPointsProps || [];
                        meta.geoPointsProps.push(k);
                        break;
                    case 'entityKey':
                        meta.refProps = meta.refProps || {};
                        meta.refProps[k] = true;
                        break;
                    default:
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
            callQueue[method].pres.forEach(fn => {
                self.pre(method, fn);
            });

            // Add Post hooks
            callQueue[method].post.forEach(fn => {
                self.post(method, fn);
            });
        }
    }

    /**
     * Get and entity from the Datastore
     */
    static get(id, ancestors, namespace, transaction, options = {}) {
        const ids = arrify(id);
        const _this = this;

        const key = this.key(ids, ancestors, namespace);
        const refsToPopulate = [];
        const { dataloader } = options;

        /**
         * If gstore has been initialize with a cache we first fetch
         * the key(s) from it.
         * gstore-cache underneath will call the "fetchHandler" with only the keys that haven't
         * been found. The final response is the merge of the cache result + the fetch.
         */
        const promise = this.fetchEntityByKey(key, transaction, dataloader, options)
            .then(onEntity)
            .then(this.populate(refsToPopulate, { ...options, transaction }));

        promise.populate = populateFactory(refsToPopulate, promise, this);
        return promise;

        // ----------

        function onEntity(entityDataFetched) {
            const entityData = arrify(entityDataFetched);

            if (ids.length === 1
                && (entityData.length === 0 || typeof entityData[0] === 'undefined' || entityData[0] === null)) {
                if (_this.gstore.config.errorOnEntityNotFound) {
                    return Promise.reject(new GstoreError(
                        errorCodes.ERR_ENTITY_NOT_FOUND,
                        `${_this.entityKind} { ${ids[0].toString()} } not found`
                    ));
                }

                return null;
            }

            const entity = entityData
                .map(data => {
                    if (typeof data === 'undefined' || data === null) {
                        return null;
                    }
                    return _this.__model(data, null, null, null, data[_this.gstore.ds.KEY]);
                });

            if (Array.isArray(id)
              && options.preserveOrder
              && entity.every(e => typeof e !== 'undefined' && e !== null)) {
                entity.sort((a, b) => id.indexOf(a.entityKey.id) - id.indexOf(b.entityKey.id));
            }

            return Array.isArray(id) ? entity : entity[0];
        }
    }

    static fetchEntityByKey(key, transaction, dataloader, options) {
        const handler = _keys => {
            const keys = arrify(_keys);
            if (transaction) {
                if (transaction.constructor.name !== 'Transaction') {
                    return Promise.reject(new Error('Transaction needs to be a gcloud Transaction'));
                }
                return transaction.get(keys).then(([result]) => arrify(result));
            }

            if (dataloader) {
                if (dataloader.constructor.name !== 'DataLoader') {
                    return Promise.reject(
                        new GstoreError(errorCodes.ERR_GENERIC, 'dataloader must be a "DataLoader" instance')
                    );
                }
                return dataloader.loadMany(keys).then(result => arrify(result));
            }
            return this.gstore.ds.get(keys).then(([result]) => arrify(result));
        };

        if (this.__hasCache(options)) {
            return this.gstore.cache.keys.read(
                // nsql-cache requires an array for multiple and a single key when *not* multiple
                Array.isArray(key) && key.length === 1 ? key[0] : key, options, handler
            );
        }
        return handler(key);
    }

    static update(id, data, ancestors, namespace, transaction, options) {
        this.__hooksEnabled = true;
        const _this = this;

        let entityUpdated;

        const key = this.key(id, ancestors, namespace);
        const replace = options && options.replace === true;

        let internalTransaction = false;

        /**
         * If options.replace is set to true we don't fetch the entity
         * and save the data directly to the specified key, overriding any previous data.
         */
        if (replace) {
            return saveEntity({ key, data })
                .then(onEntityUpdated)
                .catch(onUpdateError);
        }

        if (typeof transaction === 'undefined' || transaction === null) {
            internalTransaction = true;
            transaction = this.gstore.ds.transaction();
            return transaction
                .run()
                .then(getAndUpdate)
                .catch(onUpdateError);
        }

        if (transaction.constructor.name !== 'Transaction') {
            return Promise.reject(new Error('Transaction needs to be a gcloud Transaction'));
        }

        return getAndUpdate();

        // ---------------------------------------------------------

        function getAndUpdate() {
            return getEntity()
                .then(saveEntity)
                .then(onEntityUpdated);
        }

        function getEntity() {
            return transaction
                .get(key)
                .then(getData => {
                    const entity = getData[0];

                    if (typeof entity === 'undefined') {
                        throw (new GstoreError(
                            errorCodes.ERR_ENTITY_NOT_FOUND,
                            `Entity { ${id.toString()} } to update not found`
                        ));
                    }

                    extend(false, entity, data);

                    const result = {
                        key: entity[_this.gstore.ds.KEY],
                        data: entity,
                    };

                    return result;
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

            if (internalTransaction) {
                // If we created the Transaction instance internally for the update, we commit it
                // otherwise we leave the commit() call to the transaction creator
                return transaction
                    .commit()
                    .then(() => transaction.execPostHooks().catch(err => {
                        entityUpdated[
                            entityUpdated.gstore.ERR_HOOKS
                        ] = (entityUpdated[entityUpdated.gstore.ERR_HOOKS] || []).push(err);
                    }))
                    .then(onTransactionSuccess);
            }

            return onTransactionSuccess();
        }

        function onUpdateError(err) {
            const error = Array.isArray(err) ? err[0] : err;
            if (internalTransaction) {
                // If we created the Transaction instance internally for the update, we rollback it
                // otherwise we leave the rollback() call to the transaction creator
                return transaction.rollback().then(() => {
                    throw error;
                });
            }

            throw error;
        }

        function onTransactionSuccess() {
            /**
             * Make sure to delete the cache for this key
             */
            if (_this.__hasCache(options)) {
                return _this.clearCache(key)
                    .then(() => entityUpdated)
                    .catch(err => {
                        let msg = 'Error while clearing the cache after updating the entity.';
                        msg += 'The entity has been updated successfully though. ';
                        msg += 'Both the cache error and the entity updated have been attached.';
                        const cacheError = new Error(msg);
                        cacheError.__entityUpdated = entityUpdated;
                        cacheError.__cacheError = err;
                        throw cacheError;
                    });
            }

            return entityUpdated;
        }
    }

    static delete(id, ancestors, namespace, transaction, key, options = {}) {
        const _this = this;
        this.__hooksEnabled = true;

        if (!key) {
            key = this.key(id, ancestors, namespace);
        }

        if (transaction && transaction.constructor.name !== 'Transaction') {
            return Promise.reject(new Error('Transaction needs to be a gcloud Transaction'));
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
            return Promise.resolve();
        }

        return this.gstore.ds.delete(key).then(onDelete);

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
                    .then(() => response)
                    .catch(err => {
                        let msg = 'Error while clearing the cache after deleting the entity.';
                        msg += 'The entity has been deleted successfully though. ';
                        msg += 'The cache error has been attached.';
                        const cacheError = new Error(msg);
                        cacheError.__response = response;
                        cacheError.__cacheError = err;
                        throw cacheError;
                    });
            }

            return response;
        }
    }

    static deleteAll(ancestors, namespace) {
        const _this = this;

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

        return createQueryWithLimit().run({ cache: false }).then(onEntities);

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
                return {
                    success: true,
                    message: `All ${_this.entityKind} deleted successfully.`,
                };
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
                    .then(onEntitiesDeleted);
            }

            const keys = entitiesToDelete.map(entity => entity[_this.gstore.ds.KEY]);

            // We only need to clear the Queries from the cache once,
            // so we do it on the first batch.
            const clearQueries = currentBatch === 0;
            return _this.delete.call(_this, null, null, null, null, keys, { clearQueries })
                .then(onEntitiesDeleted);
        }

        function onEntitiesDeleted() {
            currentBatch += 1;

            if (currentBatch < totalBatches) {
                // Still more batches to process
                return new Promise(resolve => {
                    setTimeout(resolve, timeoutBetweenBatches);
                }).then(() => deleteEntities(currentBatch));
            }

            // Re-run the fetch Query in case there are still entities to delete
            return createQueryWithLimit().run().then(onEntities);
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

            ids.forEach(id => {
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
        const _this = this;
        postHooks = arrify(postHooks);

        if (!{}.hasOwnProperty.call(transaction, 'hooks')) {
            transaction.hooks = {
                post: [],
            };
        }

        postHooks.forEach(hook => transaction.hooks.post.push(hook));

        transaction.execPostHooks = function executePostHooks() {
            if (this.hooks.post) {
                return this.hooks.post.reduce((promise, hook) => promise.then(hook.bind(_this)), Promise.resolve());
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

        properties.forEach(prop => {
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
    static sanitize(data, options = { disabled: [] }) {
        const { schema } = this;
        const key = data[this.gstore.ds.KEY]; // save the Key

        if (!is.object(data)) {
            return null;
        }

        const isJoiSchema = schema.isJoi;

        let sanitized;
        let joiOptions;
        if (isJoiSchema) {
            const { error, value } = schema.validateJoi(data);
            if (!error) {
                sanitized = { ...value };
            }
            joiOptions = schema.options.joi.options || {};
        }
        if (sanitized === undefined) {
            sanitized = { ...data };
        }

        const isSchemaExplicitOnly = isJoiSchema
            ? joiOptions.stripUnknown
            : schema.options.explicitOnly === true;

        const isWriteDisabled = options.disabled.includes('write');
        const hasSchemaRefProps = Boolean(schema.__meta.refProps);
        let schemaHasProperty;
        let isPropWritable;
        let propValue;

        Object.keys(data).forEach(k => {
            schemaHasProperty = {}.hasOwnProperty.call(schema.paths, k);
            isPropWritable = schemaHasProperty
                ? schema.paths[k].write !== false
                : true;
            propValue = sanitized[k];

            if ((isSchemaExplicitOnly && !schemaHasProperty) || (!isPropWritable && !isWriteDisabled)) {
                delete sanitized[k];
            } else if (propValue === 'null') {
                sanitized[k] = null;
            } else if (hasSchemaRefProps && schema.__meta.refProps[k] && !this.gstore.ds.isKey(propValue)) {
                // Replace populated entity by their entity Key
                if (is.object(propValue) && propValue[this.gstore.ds.KEY]) {
                    sanitized[k] = propValue[this.gstore.ds.KEY];
                }
            }
        });

        return key ? { ...sanitized, [this.gstore.ds.KEY]: key } : sanitized;
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
            handlers.push(this.gstore.cache.queries.clearQueriesByKind(this.entityKind)
                .catch(e => {
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

    static populate(refs, options = {}) {
        const _this = this;
        const dataloader = options.dataloader || this.gstore.createDataLoader();

        const getPopulateMetaForEntity = (entity, entityRefs) => {
            const keysToFetch = [];
            const mapKeyToPropAndSelect = {};

            const isEntityClass = entity instanceof Model;
            entityRefs.forEach(ref => {
                const { path } = ref;
                const entityData = isEntityClass ? entity.entityData : entity;

                const key = get(entityData, path);
                if (!key) {
                    set(entityData, path, null);
                    return;
                }

                if (!this.gstore.ds.isKey(key)) {
                    throw new Error(`[gstore] ${path} is not a Datastore Key. Reference entity can't be fetched.`);
                }

                // Stringify the key
                const strKey = keyToString(key);
                // Add it to our map
                mapKeyToPropAndSelect[strKey] = { ref };
                // Add to our array to be fetched
                keysToFetch.push(key);
            });

            return { entity, keysToFetch, mapKeyToPropAndSelect };
        };

        return entitiesToProcess => {
            if (!refs || !refs.length) {
                // Nothing to do here...
                return Promise.resolve(entitiesToProcess);
            }

            // Keep track if we provided an array for the response format
            const isArray = Array.isArray(entitiesToProcess);
            const entities = arrify(entitiesToProcess);
            const isEntityClass = entities[0] instanceof Model;

            // Fetches the entity references at the current
            // object tree depth
            const fetchRefsEntitiesRefsAtLevel = entityRefs => {
                // For each one of the entities to process, we gatter some meta data
                // like the keys to fetch for that entity in order to populate its refs.
                // Dataloaader will take care to only fetch unique keys on the Datastore
                const meta = entities.map(entity => getPopulateMetaForEntity(entity, entityRefs));

                const onKeysFetched = (response, { entity, keysToFetch, mapKeyToPropAndSelect }) => {
                    if (!response) {
                        // No keys have been fetched
                        return;
                    }

                    const entityData = isEntityClass ? { ...entity.entityData } : entity;

                    const mergeRefEntitiesToEntityData = (data, i) => {
                        const key = keysToFetch[i];
                        const strKey = keyToString(key);
                        const { ref: { path, select } } = mapKeyToPropAndSelect[strKey];

                        if (!data) {
                            set(entityData, path, data);
                            return;
                        }

                        const EmbeddedModel = _this.gstore.model(key.kind);
                        const embeddedEntity = new EmbeddedModel(data, null, null, null, key);

                        // If "select" fields are provided, we return them,
                        // otherwise we return the entity plain() json
                        const json = select.length && !select.some(s => s === '*')
                            ? select.reduce((acc, field) => ({
                                ...acc,
                                [field]: data[field] || null,
                            }), {})
                            : embeddedEntity.plain();

                        set(entityData, path, { ...json, id: key.name || key.id });

                        if (isEntityClass) {
                            entity.entityData = entityData;
                        }
                    };

                    // Loop over all dataloader.loadMany() responses
                    response.forEach(mergeRefEntitiesToEntityData);
                };

                const promises = meta.map(({ keysToFetch }) => (keysToFetch.length
                    ? this.fetchEntityByKey(keysToFetch, options.transaction, dataloader, options)
                    : Promise.resolve(null)));

                return Promise.all(promises).then(result => {
                    // Loop over all responses from dataloader.loadMany() calls
                    result.forEach((res, i) => onKeysFetched(res, meta[i]));
                });
            };

            return new Promise((resolve, reject) => {
                // At each tree level we fetch the entity references in series.
                refs.reduce((chainedPromise, entityRefs) => chainedPromise.then(() => (
                    fetchRefsEntitiesRefsAtLevel(entityRefs)
                )), Promise.resolve())
                    .then(() => {
                        resolve(isArray ? entities : entities[0]);
                    })
                    .catch(reject);
            });
        };
    }

    /**
     * Returns all the schema properties that are references
     * to other entities (their value is an entity Key)
     */
    static getEntitiesRefsFromSchema() {
        return Object.entries(this.schema.paths)
            .filter(({ 1: pathConfig }) => pathConfig.type === 'entityKey')
            .map(({ 0: ref }) => ref);
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
    static __scopeHook(hook, args, hookName, hookType) {
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
            const id = is.object(args[0]) && {}.hasOwnProperty.call(args[0], '__override')
                ? arrify(args[0].__override)[0]
                : args[0];

            if (is.array(id)) {
                return null;
            }

            let ancestors;
            let namespace;
            let key;

            if (hookType === 'post') {
                ({ key } = args);
                if (is.array(key)) {
                    return null;
                }
            } else {
                ({
                    1: ancestors,
                    2: namespace,
                    4: key,
                } = args);
            }

            if (!id && !ancestors && !namespace && !key) {
                return undefined;
            }

            return _this.__model(null, id, ancestors, namespace, key);
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
        if (this.gstore.cache.config.global === false) {
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
    Object.keys(schema.methods).forEach(method => {
        entity[method] = schema.methods[method];
    });
    return entity;
}

function applyStatics(_Model, schema) {
    Object.keys(schema.statics).forEach(method => {
        if (typeof _Model[method] !== 'undefined') {
            throw new Error(`${method} already declared as static.`);
        }
        _Model[method] = schema.statics[method];
    });
    return _Model;
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

export default Model;
