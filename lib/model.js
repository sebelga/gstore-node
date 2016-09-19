(function() {
    'use strict';

    /*
    * Module dependencies.
    */
    var moment              = require('moment');
    var async               = require('async');
    var is                  = require('is');
    var arrify              = require('arrify');
    var extend              = require('extend');
    var gcloud              = require('google-cloud');
    var validator           = require('validator');

    var Entity              = require('./entity');
    var datastoreSerializer = require('./serializer').Datastore;
    var utils               = require('./utils');
    var queryHelpers        = require('./helper').QueryHelpers;
    var GstoreError         = require('./error.js');

    class Model extends Entity{
        constructor (data, id, ancestors, namespace, key) {
            super(data, id, ancestors, namespace, key);
        }

        static compile(kind, schema, gstore) {
            var ModelInstance = class extends Model {
                constructor (data, id, ancestors, namespace, key) {
                    super(data, id, ancestors, namespace, key);
                }
                static init() {
                }
            };

            ModelInstance.schema = schema;
            applyMethods(ModelInstance.prototype, schema);
            applyStatics(ModelInstance, schema);

            ModelInstance.prototype.entityKind = ModelInstance.entityKind = kind;
            ModelInstance.hooks                = schema.s.hooks.clone();
            ModelInstance.prototype.gstore     = ModelInstance.gstore = gstore;

            return ModelInstance;
        }

        static get(id, ancestors, namespace, transaction, options, cb) {
            let _this = this;
            let args  = arrayArguments(arguments);
            let multiple = is.array(id);

            cb          = args.pop();
            id          = parseId(id);
            ancestors   = args.length > 1 ? args[1] : undefined;
            namespace   = args.length > 2 ? args[2] : undefined;
            transaction = args.length > 3 ? args[3] : undefined;
            options     = args.length > 4 ? args[4] : {};

            let key     = this.key(id, ancestors, namespace);

            if (transaction) {
                if (transaction.constructor.name !== 'Transaction') {
                    throw Error('Transaction needs to be a gcloud Transaction');
                }
                return transaction.get(key, onEntity);
            }

            this.gstore.ds.get(key, onEntity);

            ////////////////////

            function onEntity(err, entity) {
                if (err) {
                    return cb(err);
                }

                if (!entity) {
                    return cb({
                        code   : 404,
                        message: _this.entityKind + ' {' + id.toString() + '} not found'
                    });
                }

                if (!is.array(entity)) {
                    entity = [entity];
                }

                entity = entity.map((e) => {
                    return _this.__model(e.data, null, null, null, e.key);
                });

                if (entity.length>1 && options.preserveOrder) {
                    entity.sort(function(a, b){
                        return id.indexOf(a.entityKey.id) - id.indexOf(b.entityKey.id);
                    });
                }

                cb(null, multiple ? entity : entity[0]);
            }
        }

        static update(id, data, ancestors, namespace, transaction, options, cb) {
            var _this = this;

            var error;
            var entityUpdated;
            var infoTransaction;

            let args = arrayArguments(arguments);

            cb          = args.pop();
            id          = parseId(id);
            ancestors   = args.length > 2 ? args[2] : undefined;
            namespace   = args.length > 3 ? args[3] : undefined;
            transaction = args.length > 4 ? args[4] : undefined;
            options     = args.length > 5 ? args[5] : undefined;

            let key = this.key(id, ancestors, namespace);

            /**
             * If options.replace is set to true we don't fetch the entity
             * and save the data directly to the specified key, replacing any previous data.
             */
            if (options && options.replace === true) {
                return save(key, data, null, cb);
            }

            if (typeof transaction === 'undefined' || transaction === null) {
                transaction = this.gstore.ds.transaction();
                transaction.run(function(err){
                    if (err) {
                        return onTransaction(err);
                    } else {
                        getInTransaction(transaction, function(err) {
                            if (err) {
                                onTransaction(err);
                            } else {
                                transaction.commit(onTransaction);
                            }
                        });
                    }
                });
            } else {
                if (transaction.constructor.name !== 'Transaction') {
                    throw Error('Transaction needs to be a gcloud Transaction');
                }
                getInTransaction(transaction, onTransaction);
            }

            ///////////////////

            function getInTransaction(transaction, done) {
                transaction.get(key, (err, entity) => {
                    if (err) {
                        error = err;
                        return done(err);
                    }

                    if (!entity) {
                        error = {
                            code   : 404,
                            message: 'Entity {' + id.toString() + '} to update not found'
                        };
                        transaction.rollback(done);
                        return;
                    }

                    extend(true, entity.data, data);

                    save(entity.key, entity.data, transaction, done);
                });
            }

            function save(key, data, transaction, done) {
                let model = _this.__model(data, null, null, null, key);

                if (transaction === null) {
                    // we need to pass an empty object instead of null for a bug related with pre hooks that does
                    // not allow null as first parameter
                    transaction = {};
                }

                model.save(transaction, {op:'update'}, (err, entity, info) => {
                    if (err) {
                        error = err;
                        if (!transaction || is.object(transaction) && Object.keys(transaction).length === 0) {
                            return done(err);
                        } else {
                            transaction.rollback(done);
                            return;
                        }
                    }

                    entityUpdated   = entity;
                    infoTransaction = info;
                    done(null, entity);
                });
            }

            function onTransaction(transactionError, apiResponse) {
                if (transactionError || error) {
                    cb(transactionError || error);
                } else {
                    _this.prototype.emit('update');
                    apiResponse = typeof apiResponse === 'undefined' ? {} : apiResponse;
                    extend(apiResponse, infoTransaction);
                    cb(null, entityUpdated, apiResponse);
                }
            }
        }

        static query(namespace, transaction) {
            let _this = this;

            let query = initQuery(this, namespace, transaction);

            query.run = function(options, cb) {
                let args = [];
                for (let i = 0; i < arguments.length; i++) {
                    args.push(arguments[i]);
                }
                cb = args.pop();

                options = args.length > 0 ? args[0] : {};
                options = extend(true, {}, _this.schema.options.queries, options);

                _this.gstore.ds.runQuery(query, onQuery);

                ////////////////////

                function onQuery(err, entities, info) {
                    if (err) {
                        return cb(err);
                    }
                    if (options.simplifyResult) {
                        entities = entities.map((entity) => {
                            return datastoreSerializer.fromDatastore.call(_this, entity, options.readAll);
                        });
                    }

                    var response = {
                        entities : entities
                    };

                    if (info.moreResults !== gcloud.datastore.NO_MORE_RESULTS) {
                        response.nextPageCursor = info.endCursor;
                    }

                    cb(null, response);
                }
            };

            return query;
        }

        static list(options, cb) {
            var _this = this;
            let args  = arrayArguments(arguments);

            cb      = args.pop();
            options = args.length > 0 ? args[0] : {};

            if(this.schema.shortcutQueries.hasOwnProperty('list')) {
                options = extend({}, this.schema.shortcutQueries.list, options);
            }

            let query = initQuery(this, options.namespace);

            // Build query from options passed
            query = queryHelpers.buildFromOptions(query, options, this.gstore.ds);

            // merge options inside entities option
            options = extend({}, this.schema.options.queries, options);

            this.gstore.ds.runQuery(query, (err, entities, info) => {
                if (err) {
                    return cb(err);
                }
                if (options.simplifyResult) {
                    entities = entities.map((entity) => {
                        return datastoreSerializer.fromDatastore.call(_this, entity, options.readAll);
                    });
                }

                var response = {
                    entities : entities
                };

                if (info.moreResults !== gcloud.datastore.NO_MORE_RESULTS) {
                    response.nextPageCursor = info.endCursor;
                }

                cb(null, response);
            });
        }

        static delete(id, ancestors, namespace, transaction, key, cb) {
            let _this    = this;
            let args     = arrayArguments(arguments);
            let multiple = is.array(id);

            cb          = args.pop();
            id          = parseId(id);
            ancestors   = args.length > 1 ? args[1]: undefined;
            namespace   = args.length > 2 ? args[2]: undefined;
            transaction = args.length > 3 ? args[3]: undefined;
            key         = args.length > 4 ? args[4]: undefined;

            if (!key) {
                key = this.key(id, ancestors, namespace);
            } else {
                multiple = is.array(key);
            }

            if (transaction && transaction.constructor.name !== 'Transaction') {
                throw Error('Transaction needs to be a gcloud Transaction');
            }

            /**
             * If it is a transaction, we create a hooks.post array to be executed
             * after transaction succeeds if needed with transaction.execPostHooks()
             */
            if (transaction) {
                this.hooksTransaction(transaction);
            }

            /**
             * Call pre hooks, then delete, then post hooks
             */
            async.series([pre, executeDelete, post], allDone);

            //////////

            function pre(callback) {
                let entity;

                if (!multiple) {
                    entity = _this.__model(null, id, ancestors, namespace, key);
                }
                return _this.hooks.execPre('delete', entity ? entity : null, callback);
            }

            function executeDelete(callback) {
                if (!transaction) {
                    _this.gstore.ds.delete(key, onDelete);
                } else {
                    transaction.delete(key);
                    transaction.addHook('post', function() {
                        _this.hooks.execPost('delete', _this, [key], () => {});
                    });

                    return cb();
                }

                function onDelete(err, apiRes) {
                    if (err) {
                        return callback(err);
                    }

                    if (apiRes) {
                        apiRes.success = apiRes.indexUpdates > 0;
                    }

                    callback(null, apiRes);
                }
            }

            function post(callback) {
                return _this.hooks.execPost('delete', _this, [key], callback);
            }

            function allDone(err, results) {
                if (err) {
                    return cb(err);
                }
                let response = results[1];
                return cb(null, response);
            }
        }

        static deleteAll(ancestors, namespace, cb) {
            var _this = this;

            let args = arrayArguments(arguments);

            cb        = args.pop();
            ancestors = args.length > 0 ? args[0] : undefined;
            namespace = args.length > 1 ? args[1] : undefined;

            let query = initQuery(this, namespace);

            if (ancestors) {
                query.hasAncestor(this.gstore.ds.key(ancestors.slice()));
            }

            this.gstore.ds.runQuery(query, (err, entities) => {
                if (err) {
                    return cb(err);
                }
                if (_this.hooks._pres.hasOwnProperty('delete') || _this.hooks._posts.hasOwnProperty('delete')) {
                    // We execute delete in serie, calling each pre / post hooks
                    async.eachSeries(entities, function deleteEntity(entity, cb) {
                        _this.delete.call(_this, null, null, null, null, entity.key, cb);
                    }, onEntitiesDeleted);
                } else {
                    // No pre or post hooks so we can delete them all at once
                    let keys = entities.map((entity) => {
                        return entity.key;
                    });
                    _this.delete.call(_this, null, null, null, null, keys, onEntitiesDeleted);
                }
            });

            //////////

            function onEntitiesDeleted(err) {
                if (err) {
                    return cb(err);
                }
                cb(null, {
                    success: true,
                    message: 'All ' + _this.entityKind + ' deleted successfully.'
                });
            }
        }

        static findOne(params, ancestors, namespace, cb) {
            let _this = this;
            let args  = arrayArguments(arguments);

            cb = args.pop();

            ancestors = args.length > 1 ? args[1] : undefined;
            namespace = args.length > 2 ? args[2] : undefined;

            if (!is.object(params)) {
                return cb({
                    code : 400,
                    message : 'Params have to be passed as object'
                });
            }

            let query = initQuery(this, namespace);

            query.limit(1);

            Object.keys(params).forEach((k) => {
                query.filter(k, params[k]);
            });

            if (ancestors) {
                query.hasAncestor(this.gstore.ds.key(ancestors.slice()));
            }

            this.hooks.execPre('findOne', _this, () => {
                // Pre methods done
                _this.gstore.ds.runQuery(query, (err, entities) => {
                    if (err) {
                        return cb(err);
                    }

                    let entity = entities && entities.length > 0 ? entities[0] : null;

                    if (!entity) {
                        return cb({
                            code:    404,
                            message: _this.entityKind + ' not found'
                        });
                    } else {
                        entity = _this.__model(entity.data, null, null, null, entity.key);
                    }

                    _this.hooks.execPost('findOne', null, [], () => {
                        // all post hooks are done
                        cb(null, entity);
                    });
                });
            });
        }

        static findAround(property, value, options, namespace, cb) {
            var _this = this;

            let args  = arrayArguments(arguments);

            cb = args.pop();

            if (args.length < 3) {
                return cb({
                    code : 400,
                    message : 'Argument missing'
                });
            }

            property  = args[0];
            value     = args[1];
            options   = args[2];
            namespace = args.length > 3 ? args[3] : undefined;

            if (!is.object(options)) {
                return cb({
                    code : 400,
                    message : 'Options pased has to be an object'
                });
            }

            if (!options.hasOwnProperty('after') && !options.hasOwnProperty('before')) {
                return cb({
                    code : 400,
                    message : 'You must set "after" or "before" in options'
                });
            }

            if (options.hasOwnProperty('after') && options.hasOwnProperty('before')) {
                return cb({
                    code : 400,
                    message : 'You must chose between after or before'
                });
            }

            let query = initQuery(this, namespace);

            let op = options.after ? '>' : '<';
            let descending = options.after ? false : true;

            query.filter(property, op, value);
            query.order(property, {descending: descending});
            query.limit(options.after ? options.after : options.before);

            this.gstore.ds.runQuery(query, (err, entities) => {
                if (err) {
                    return cb(err);
                }

                let simplifyResult = typeof options.simplifyResult !== 'undefined' ? options.simplifyResult : _this.schema.options.queries.simplifyResult;

                if (simplifyResult) {
                    entities = entities.map((entity) => {
                        return datastoreSerializer.fromDatastore.call(_this, entity, options.readAll);
                    });
                }

                cb(null, entities);
            });
        };

        static key(ids, ancestors, namespace) {
            let _this    = this;
            let multiple = false;

            let keys = [];

            if (typeof ids !== 'undefined' && ids !== null) {
                multiple = is.array(ids);

                if (!multiple) {
                    ids = [ids];
                }

                ids.forEach((id) => {
                    let key  = getKey(id, ancestors, namespace);
                    keys.push(key);
                });
            } else {
                let key  = getKey(null, ancestors, namespace);
                keys.push(key);
            }

            return multiple ? keys : keys[0];

            ////////////////////

            function getKey(id, ancestors, namespace) {
                let path = getPath(id, ancestors);
                let key;
                if (typeof namespace !== 'undefined' && namespace !== null) {
                    key = _this.gstore.ds.key({
                        namespace : namespace,
                        path : path
                    });
                } else {
                    key = _this.gstore.ds.key(path);
                }
                return key;
            }

            function getPath(id, ancestors) {
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

        static hooksTransaction(transaction) {
            var _this = this;

            if (!transaction.hasOwnProperty('hooks')) {
                transaction.hooks = {
                    post:[]
                };

                transaction.addHook = function(type, fn) {
                    this.hooks[type].push(fn.bind(_this));
                };

                transaction.execPostHooks = executePostHooks.bind(transaction);

                function executePostHooks() {
                    this.hooks.post.forEach(function(fn) {
                        fn.call(_this);
                    });
                }
            }
        }

        /**
         * Dynamic properties (in non explicitOnly Schemas) are indexes by default
         * This method allows to exclude from indexes those properties if needed
         * @param properties {Array} or {String}
         * @param cb
         */
        static excludeFromIndexes(properties) {
            if (!is.array(properties)) {
                properties = arrify(properties);
            }
            properties.forEach((p) => {
                if (!this.schema.paths.hasOwnProperty(p)) {
                    this.schema.path(p, {optional:true, excludeFromIndexes: true});
                } else {
                    this.schema.paths[p].excludeFromIndexes = true;
                }
            });
        }

        /**
         * Sanitize user data before saving to Datastore
         * @param data : userData
         */
        static sanitize(data) {
            if(!is.object(data)) {
                return null;
            }

            Object.keys(data).forEach((k) => {
                if (!this.schema.paths.hasOwnProperty(k) || this.schema.paths[k].write === false) {
                    delete data[k];
                } else {
                    if (data[k] === 'null') {
                        data[k] = null;
                    }
                }
            });

            return data;
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
            let M = this.compile(this.entityKind, this.schema, this.gstore);
            return new M(data, id, ancestors, namespace, key);
        }

        save (transaction, options, cb) {
            let _this = this;
            let args  = arrayArguments(arguments);
            let saveOptions = {
                op:'save'
            };

            cb          = args.pop();
            transaction = args.length > 0 ? args[0] : undefined;
            options     = args.length > 1 && args[1] !== null ? args[1] : {};

            /*
            * Fix when passing {} as transaction (pre hooks does not allow null value as first argument...)
            */
            if (is.object(transaction) && Object.keys(transaction).length === 0) {
                transaction = null;
            }

            /**
             * In a transaction we don't need to pass a callback. In case we pass a Transaction
             * without callback we need to delete the callback and set the transaction accordingly
             */
            if (!transaction && !is.fn(cb) && cb.constructor && cb.constructor.name === 'Transaction') {
                transaction = cb;
                cb = undefined;
            }

            /**
             * If it is a transaction, we create a hooks.post array to be executed
             * after transaction succeeds if needed with transaction.execPostHooks()
             */
            if (transaction) {
                this.constructor.hooksTransaction(transaction);
            }

            extend(saveOptions, options);

            if (this.schema.paths.hasOwnProperty('modifiedOn')) {
                this.entityData.modifiedOn = new Date();
            }

            var entity = {
                key : this.entityKey,
                data : datastoreSerializer.toDatastore(this.entityData, this.excludeFromIndexes)
            };

            let info = {
                op : saveOptions.op
            };

            if (!transaction) {
                this.gstore.ds.save(entity, (err) => {
                    if (err) {
                        return cb(err);
                    }

                    _this.emit('save');

                    cb(null, _this, info);
                });
            } else {
                if (transaction.constructor.name !== 'Transaction') {
                    throw Error('Transaction needs to be a gcloud Transaction');
                }

                transaction.save(entity);
                transaction.addHook('post', function() {
                    _this.emit('save');
                });
                if (cb) {
                    cb(null, _this, info);
                }
            }
        }

        validate(cb) {
            let errors = {};
            var self   = this;
            var schema = this.schema;

            Object.keys(this.entityData).forEach((k) => {
                let skip = false;

                if (schema.virtuals.hasOwnProperty(k)) {
                    // Virtual, remove it and skip the rest
                    delete self.entityData[k];
                    skip = true;
                }

                // Properties dict
                if (!schema.paths.hasOwnProperty(k) && schema.options.explicitOnly === false) {
                    // No more validation, key does not exist but it is allowed
                    skip = true;
                }

                if (!skip && !schema.paths.hasOwnProperty(k)) {
                    errors.properties = new Error ('Property not allowed {' + k + '} for ' + this.entityKind + ' Entity');
                }

                // Properties type
                if (!skip && schema.paths.hasOwnProperty(k) && self.entityData[k] !== null && schema.paths[k].hasOwnProperty('type')) {
                    var typeValid = true;
                    if (schema.paths[k].type === 'datetime') {
                        // Validate datetime "format"
                        let error = validateDateTime(self.entityData[k], k);
                        if (error !== null) {
                            errors.datetime = error;
                        }
                    } else {
                        let value = self.entityData[k];
                        if (schema.paths[k].type === 'array') {
                            // Array
                            typeValid = is.array(value);
                        } else if (schema.paths[k].type === 'int') {
                            // Integer
                            let isIntInstance = value.constructor.name === 'Int';
                            if (isIntInstance) {
                                typeValid = !isNaN(parseInt(value.value));
                            } else {
                                typeValid = isInt(value);
                            }
                        } else if (schema.paths[k].type === 'double') {
                            // Double
                            let isIntInstance = value.constructor.name === 'Double';
                            if (isIntInstance) {

                                typeValid = isFloat(parseFloat(value.value, 10)) || isInt(parseFloat(value.value, 10));
                            } else {
                                typeValid = isFloat(value) || isInt(value);
                            }
                        } else if (schema.paths[k].type === 'buffer') {
                            // Double
                            typeValid = value instanceof Buffer;
                        } else if (schema.paths[k].type === 'geoPoint') {
                            // GeoPoint
                            typeValid = value.constructor.name === 'GeoPoint';
                        } else {
                            // Other
                            typeValid = typeof value === schema.paths[k].type;
                        }

                        if (!typeValid) {
                            errors[k] = new GstoreError.ValidationError({
                                message: 'Data type error for ' + k
                            });
                        }
                    }
                }

                // Value Validation
                if (!skip && schema.paths.hasOwnProperty(k) && schema.paths[k].hasOwnProperty('validate') && self.entityData[k] && self.entityData[k] !== '' && self.entityData[k] !== null) {
                    if (!validator[schema.paths[k].validate](self.entityData[k])) {
                        errors[k] = new GstoreError.ValidatorError({
                            message: 'Wrong format for property {' + k + '}'
                        });
                    }
                }

                // Preset values
                if (!skip && schema.paths.hasOwnProperty(k) && schema.paths[k].hasOwnProperty('values') && self.entityData[k] !== '') {
                    if (schema.paths[k].values.indexOf(self.entityData[k]) < 0) {
                        errors[k] = new Error('Value not allowed for ' + k + '. It must be in the range: ' + schema.paths[k].values);
                    }
                }
            });

            if (cb) {
                var payload =  Object.keys(errors).length > 0 ? {success:false, errors:errors} : {success:true};
                cb(payload);
            } else {
                return Object.keys(errors).length > 0 ? {success:false, errors:errors} : {success:true};
            }

            function validateDateTime(value, k) {
                if (value.constructor.name !== 'Date' &&
                    (typeof value !== 'string' ||
                        !value.match(/\d{4}-\d{2}-\d{2}([ ,T])?(\d{2}:\d{2}:\d{2})?(\.\d{1,3})?/) ||
                        !moment(value).isValid())) {
                    return {
                        error:'Wrong format',
                        message: 'Wrong date format for ' + k
                    };
                }
                return null;
            }

            function isInt(n){
                return Number(n) === n && n % 1 === 0;
            }

            function isFloat(n){
                return Number(n) === n && n % 1 !== 0;
            }
        }
    }

    /**
     *
     * @param self {Model}
     * @param schema {Schema}
     * @returns {Model}
     */
    function applyMethods (self, schema) {
        Object.keys(schema.methods).forEach((method) => {
            self[method] = schema.methods[method];
        });
        return self;
    }

    function applyStatics(Model, schema) {
        Object.keys(schema.statics).forEach((method) => {
            if (typeof Model[method] !== 'undefined') {
                throw new Error('`' + method + '` already declared as static.');
            }
            Model[method] = schema.statics[method];
        });
        return Model;
    }

    function arrayArguments(args) {
        let a = [];
        for (let i = 0, l = args.length; i < l; i++) {
            a.push(args[i]);
        }
        return a;
    }

    function parseId(id) {
        return isFinite(id) ? parseInt(id, 10) : id;
    }

    function initQuery(self, namespace, transaction) {
        if (transaction && transaction.constructor.name !== 'Transaction') {
            throw Error('Transaction needs to be a gcloud Transaction');
        }
        let createQueryArgs = [self.entityKind];

        if (namespace) {
            createQueryArgs.unshift(namespace);
        }

        if (transaction) {
            return transaction.createQuery.apply(transaction, createQueryArgs);
        } else {
            return self.gstore.ds.createQuery.apply(self.gstore.ds, createQueryArgs);
        }
    }

    module.exports = exports = Model;
})();

