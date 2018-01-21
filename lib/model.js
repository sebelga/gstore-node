/* eslint-disable import/no-extraneous-dependencies */

'use strict';

/*
* Module dependencies.
*/
const is = require('is');
const arrify = require('arrify');
const extend = require('extend');
const hooks = require('promised-hooks');
const ds = require('@google-cloud/datastore')();

const { GstoreError, errorCodes } = require('./errors');
const Entity = require('./entity');
const datastoreSerializer = require('./serializer').Datastore;
const utils = require('./utils');
const { queryHelpers, validation } = require('./helpers');

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

            // retreive properites keys of type "geoPoint"
            // so we can automatically convert valid lng/lat objects to datastore.geoPoints
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
        const _this = this;
        const args = Array.prototype.slice.apply(arguments);
        const multiple = is.array(id);

        cb = args.pop();
        id = multiple ? id.map(parseId) : parseId(id);
        ancestors = args.length > 1 ? args[1] : undefined;
        namespace = args.length > 2 ? args[2] : undefined;
        transaction = args.length > 3 ? args[3] : undefined;
        options = args.length > 4 ? args[4] : {};

        const key = this.key(id, ancestors, namespace);

        if (transaction) {
            if (transaction.constructor.name !== 'Transaction') {
                throw Error('Transaction needs to be a gcloud Transaction');
            }
            return transaction.get(key)
                .then(onEntity, onError);
        }

        if (options.dataloader) {
            if (options.dataloader.constructor.name !== 'DataLoader') {
                return cb(new GstoreError(errorCodes.ERR_GENERIC, 'dataloader must be a "DataLoader" instance'));
            }
            if (multiple) {
                return options.dataloader.loadMany(key).then(onEntity, onError);
            }
            return options.dataloader.load(key).then(onEntity, onError);
        }

        return this.gstore.ds.get(key).then(onEntity, onError);

        // -----------------------------------------------------

        function onEntity(data) {
            if (data.length === 0 || typeof data[0] === 'undefined') {
                return cb({
                    code: 404,
                    message: `${_this.entityKind} { ${id.toString()} } not found`,
                });
            }

            let entity = data[0];

            if (!multiple) {
                entity = [entity];
            }

            entity = entity.map(e => _this.__model(e, null, null, null, e[_this.gstore.ds.KEY]));

            if (multiple && options.preserveOrder) {
                entity.sort((a, b) => id.indexOf(a.entityKey.id) - id.indexOf(b.entityKey.id));
            }

            const response = multiple ? entity : entity[0];
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
                        error = {
                            code: 404,
                            message: `Entity { ${id.toString()} } to update not found`,
                        };

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
            return cb(null, entityUpdated);
        }

        function onTransactionError(transactionData) {
            const apiResponse = transactionData ? transactionData[0] : {};
            extend(apiResponse, error);
            return cb(apiResponse);
        }
    }

    /**
     * Initialize a query for the current Entity Kind of the Model
     *
     * @param {String} namespace Namespace for the Query
     * @param {Object<Transaction>} transaction The transactioh to execute the query in (optional)
     *
     * @returns {Object} The query to be run
     */
    static query(namespace, transaction) {
        const _this = this;
        const query = initQuery(this, namespace, transaction);

        // keep a reference to original run() method
        query.__originalRun = query.run;

        query.run = function runQuery(options, cb) {
            const args = Array.prototype.slice.apply(arguments);
            cb = args.pop();

            options = args.length > 0 ? args[0] : {};
            options = extend(true, {}, _this.schema.options.queries, options);

            return this.__originalRun.call(this).then(onQuery).catch(onError);

            // -----------------------------------------------

            function onQuery(data) {
                let entities = data[0];
                const info = data[1];

                // Add id property to entities and suppress properties
                // where "read" setting is set to false
                entities = entities.map(entity => (
                    datastoreSerializer.fromDatastore.call(_this, entity, options)
                ));

                const response = {
                    entities,
                };

                if (info.moreResults !== ds.NO_MORE_RESULTS) {
                    response.nextPageCursor = info.endCursor;
                }

                cb(null, response);
            }

            function onError(err) {
                return cb(err);
            }
        };

        query.run = utils.promisify(query.run);

        return query;
    }

    static list(options, cb) {
        const _this = this;
        const args = Array.prototype.slice.apply(arguments);

        cb = args.pop();
        options = args.length > 0 ? args[0] : {};

        /**
         * If global options set in schema, we extend the current it with passed options
         */
        if ({}.hasOwnProperty.call(this.schema.shortcutQueries, 'list')) {
            options = extend({}, this.schema.shortcutQueries.list, options);
        }

        let query = initQuery(this, options.namespace);

        // Build Datastore query from options passed
        query = queryHelpers.buildFromOptions(query, options, this.gstore.ds);

        // merge options inside entities option
        options = extend({}, this.schema.options.queries, options);

        return query.run().then(onSuccess, onError);

        // ----------------------------------------

        function onSuccess(queryData) {
            let entities = queryData[0];
            const info = queryData[1];

            // Add id property to entities and suppress properties
            // where "read" setting is set to false
            entities = entities.map(entity => datastoreSerializer.fromDatastore.call(_this, entity, options));

            const response = {
                entities,
            };

            if (info.moreResults !== ds.NO_MORE_RESULTS) {
                response.nextPageCursor = info.endCursor;
            }

            return cb(null, response);
        }

        function onError(err) {
            return cb(err);
        }
    }

    static delete(id, ancestors, namespace, transaction, key, options, cb) {
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

        return createQueryWithLimit().run().then(onEntities, onError);

        // ------------------------------------------------

        function createQueryWithLimit() {
            // We query only limit number in case of big table
            // If we query with more than million data query will hang up
            const query = initQuery(_this, namespace);
            if (ancestors) {
                query.hasAncestor(_this.gstore.ds.key(ancestors.slice()));
            }
            query.select('__key__');
            query.limit(limitDataPerQuery);

            return query;
        }

        function onEntities(data) {
            [entities] = data;

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
            return _this.delete.call(_this, null, null, null, null, keys).then(onEntitiesDeleted, onError);
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

    static findOne(params, ancestors, namespace, cb) {
        this.__hooksEnabled = true;

        const _this = this;
        const args = Array.prototype.slice.apply(arguments);

        cb = args.pop();
        ancestors = args.length > 1 ? args[1] : undefined;
        namespace = args.length > 2 ? args[2] : undefined;

        if (!is.object(params)) {
            return cb({
                code: 400,
                message: 'Params have to be passed as object',
            });
        }

        const query = initQuery(this, namespace);
        query.limit(1);

        Object.keys(params).forEach((k) => {
            query.filter(k, params[k]);
        });

        if (ancestors) {
            query.hasAncestor(this.gstore.ds.key(ancestors.slice()));
        }

        return query.run().then(onSuccess, onError);

        // -----------------------------------------

        function onSuccess(queryData) {
            const entities = queryData ? queryData[0] : null;
            let entity = entities && entities.length > 0 ? entities[0] : null;

            if (!entity) {
                return cb({
                    code: 404,
                    message: `${_this.entityKind} not found`,
                });
            }

            entity = _this.__model(entity, null, null, null, entity[_this.gstore.ds.KEY]);
            return cb(null, entity);
        }

        function onError(err) {
            return cb(err);
        }
    }

    static findAround(property, value, options, namespace, cb) {
        const _this = this;
        const args = Array.prototype.slice.apply(arguments);
        cb = args.pop();

        if (args.length < 3) {
            return cb({
                code: 400,
                message: 'Argument missing',
            });
        }

        [property, value, options] = args;
        namespace = args.length > 3 ? args[3] : undefined;

        if (!is.object(options)) {
            return cb({
                code: 400,
                message: 'Options pased has to be an object',
            });
        }

        if (!{}.hasOwnProperty.call(options, 'after') && !{}.hasOwnProperty.call(options, 'before')) {
            return cb({
                code: 400,
                message: 'You must set "after" or "before" in options',
            });
        }

        if ({}.hasOwnProperty.call(options, 'after') && {}.hasOwnProperty.call(options, 'before')) {
            return cb({
                code: 400,
                message: 'You must chose between after or before',
            });
        }

        const query = initQuery(this, namespace);
        const op = options.after ? '>' : '<';
        const descending = !!options.after;

        query.filter(property, op, value);
        query.order(property, { descending });
        query.limit(options.after ? options.after : options.before);

        options = extend({}, this.schema.options.queries, options);

        return query.run().then(onSuccess, onError);

        // --------------------------

        function onSuccess(queryData) {
            let entities = queryData[0];

            // Add id property to entities and suppress properties
            // where "read" setting is set to false
            entities = entities.map(entity => datastoreSerializer.fromDatastore.call(_this, entity, options));

            return cb(null, entities);
        }

        function onError(err) {
            return cb(err);
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
            multiple = is.array(ids);

            if (!multiple) {
                ids = [ids];
            }

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
                return undefined;
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
}

/**
 *
 * @param self {Model}
 * @param schema {Schema}
 * @returns {Model}
 */
function applyMethods(self, schema) {
    Object.keys(schema.methods).forEach((method) => {
        self[method] = schema.methods[method];
    });
    return self;
}

function applyStatics(self, schema) {
    Object.keys(schema.statics).forEach((method) => {
        if (typeof self[method] !== 'undefined') {
            throw new Error(`${method} already declared as static.`);
        }
        self[method] = schema.statics[method];
    });
    return self;
}

function parseId(id) {
    return id !== null && isFinite(id) ? parseInt(id, 10) : id;
}

function initQuery(self, namespace, transaction) {
    if (transaction && transaction.constructor.name !== 'Transaction') {
        throw Error('Transaction needs to be a gcloud Transaction');
    }

    const createQueryArgs = [self.entityKind];

    if (namespace) {
        createQueryArgs.unshift(namespace);
    }

    if (transaction) {
        return transaction.createQuery.apply(transaction, createQueryArgs);
    }

    return self.gstore.ds.createQuery.apply(self.gstore.ds, createQueryArgs);
}

// Promisify Model methods
Model.get = utils.promisify(Model.get);
Model.update = utils.promisify(Model.update);
Model.delete = utils.promisify(Model.delete);
Model.list = utils.promisify(Model.list);
Model.deleteAll = utils.promisify(Model.deleteAll);
Model.findAround = utils.promisify(Model.findAround);
Model.findOne = utils.promisify(Model.findOne);
Model.prototype.save = utils.promisify(Model.prototype.save);

module.exports = Model;
