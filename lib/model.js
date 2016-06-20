(function() {
    'use strict';

    /*
    * Module dependencies.
    */
    var validator           = require('validator');
    var moment              = require('moment');
    var async               = require('async');
    var is                  = require('is');
    var arrify              = require('arrify');
    var extend              = require('extend');
    var gcloud              = require('gcloud');
    var Entity              = require('./entity');
    var datastoreSerializer = require('./serializer').Datastore;
    var utils               = require('./utils');
    var queryHelpers        = require('./helper').QueryHelpers;
    var DatastoolsError     = require('./error.js');

    class Model extends Entity{
        constructor (data, id, ancestors, namespace, key) {
            super(data, id, ancestors, namespace, key);
        }

        static compile(kind, schema, ds, base) {
            var ModelInstance = class extends Model {
                constructor (data, id, ancestors, namespace, key) {
                    super(data, id, ancestors, namespace, key);
                }
                static init() {
                }
            };

            ModelInstance.schema = schema;
            applyMethods(ModelInstance.prototype, schema);

            ModelInstance.prototype.entityKind = ModelInstance.entityKind = kind;
            ModelInstance.prototype.ds         = ModelInstance.ds = ds;
            ModelInstance.hooks                = schema.s.hooks.clone();
            ModelInstance.base                 = base;

            return ModelInstance;
        }

        static get(id, ancestors, namespace, transaction, cb) {
            let _this = this;
            let args  = arrayArguments(arguments);
            let multiple = is.array(id);

            cb          = args.pop();
            id          = is.array(id) || isNaN(parseInt(id)) ? id : parseInt(id);
            ancestors   = args.length > 1 ? args[1] : undefined;
            namespace   = args.length > 2 ? args[2] : undefined;
            transaction = args.length > 3 ? args[3] : undefined;

            let key     = this.createKey(id, ancestors, namespace);

            if (transaction) {
                if (transaction.constructor.name !== 'Transaction') {
                    throw Error('Transaction needs to be a gcloud Transaction');
                }
                return transaction.get(key, onEntity);
            }

            this.ds.get(key, onEntity);

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

                cb(null, multiple ? entity : entity[0]);
            }
        }

        static update(id, data, ancestors, namespace, transaction, cb) {
            var _this = this;

            var error;
            var entityUpdated;
            var infoTransaction;

            let args = arrayArguments(arguments);

            cb          = args.pop();
            id          = isNaN(parseInt(id)) ? id : parseInt(id);
            ancestors   = args.length > 2 ? args[2] : undefined;
            namespace   = args.length > 3 ? args[3] : undefined;
            transaction = args.length > 4 ? args[4] : undefined;

            let key = this.createKey(id, ancestors, namespace);

            if (typeof transaction === 'undefined') {
                this.ds.runInTransaction(function(transaction, done) {
                    runInTransaction(transaction, done);
                }, onTransaction);
            } else {
                if (transaction.constructor.name !== 'Transaction') {
                    throw Error('Transaction needs to be a gcloud Transaction');
                }
                runInTransaction(transaction, onTransaction);
            }

            ///////////////////

            function runInTransaction(transaction, done) {
                transaction.get(key, (err, entity) => {
                    if (err) {
                        error = err;
                        transaction.rollback(done);
                        return;
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

                    let model = _this.__model(entity.data, null, null, null, entity.key);

                    model.save(transaction, {op:'update'}, (err, entity, info) => {
                        if (err) {
                            error = err;
                            transaction.rollback(done);
                            return;
                        }

                        entityUpdated   = entity;
                        infoTransaction = info;
                        done();
                    });
                });
            }

            function onTransaction(transactionError) {
                if (transactionError || error) {
                    cb(transactionError || error);
                } else {
                    _this.prototype.emit('update');
                    cb(null, entityUpdated, infoTransaction);
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

                _this.ds.runQuery(query, onQuery);

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
            query = queryHelpers.buildFromOptions(query, options, this.ds);

            // merge options inside entities option
            options = extend({}, this.schema.options.queries, options);

            this.ds.runQuery(query, (err, entities, info) => {
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
            id          = is.array(id) || isNaN(parseInt(id)) ? id : parseInt(id);
            ancestors   = args.length > 1 ? args[1]: undefined;
            namespace   = args.length > 2 ? args[2]: undefined;
            transaction = args.length > 3 ? args[3]: undefined;
            key         = args.length > 4 ? args[4]: undefined;

            if (!key) {
                key = this.createKey(id, ancestors, namespace);
            }

            /**
             * In a transaction we don't need to pass a callback. In case we pass a Transaction
             * without callback we need to delete the callback and set the transaction accordingly
             */
            if (!transaction && !is.fn(cb) && cb.constructor && cb.constructor.name === 'Transaction') {
                transaction = cb;
                cb = undefined;
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
                    entity = _this.__model(null, id, ancestors, namespace);
                }
                return _this.hooks.execPre('delete', entity ? entity : null, callback);
            }

            function executeDelete(callback) {
                if (!transaction) {
                    _this.ds.delete(key, onDelete);
                } else {
                    transaction.delete(key);
                    transaction.addHook('post', function() {
                        _this.hooks.execPost('delete', _this, [key], () => {});
                    });

                    if (cb) {
                        return cb();
                    } else {
                        return;
                    }
                }

                function onDelete(err, apiRes) {
                    if (err) {
                        return callback(err);
                    }

                    let response = {};
                    if (apiRes) {
                        let success = apiRes.indexUpdates > 0;
                        response    = {success:success, apiRes:apiRes}
                    }

                    callback(null, response);
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
                query.hasAncestor(this.ds.key(ancestors.slice()))
            }

            this.ds.runQuery(query, (err, entities) => {
                if (err) {
                    return cb(err);
                }

                async.eachSeries(entities, function deleteEntity(entity, cb) {
                    _this.delete.call(_this, null, null, null, null, entity.key, cb);
                }, function done(err) {
                    if (err) {
                        return cb(err);
                    }
                    cb(null, {
                        success: true,
                        message: 'All ' + _this.entityKind + ' deleted successfully.'
                    });
                });
            });
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
                query.hasAncestor(this.ds.key(ancestors.slice()));
            }

            this.hooks.execPre('findOne', _this, () => {
                // Pre methods done
                _this.ds.runQuery(query, (err, entities) => {
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

            this.ds.runQuery(query, (err, entities) => {
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

        static createKey(ids, ancestors, namespace) {
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
                    key = _this.ds.key({
                        namespace : namespace,
                        path : path
                    });
                } else {
                    key = _this.ds.key(path);
                }
                return key;
            }

            function getPath(id, ancestors) {
                let path = [_this.entityKind];

                if (typeof id !== 'undefined' && id !== null) {
                    path.push(id)
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
                }

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
            let M = this.compile(this.entityKind, this.schema, this.ds, this.base);
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
                this.ds.save(entity, (err) => {
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
                            errors[k] = new DatastoolsError.ValidationError({
                                message: 'Data type error for ' + k
                            });
                        }
                    }
                }

                // Value Validation
                if (!skip && schema.paths.hasOwnProperty(k) && schema.paths[k].hasOwnProperty('validate') && self.entityData[k] && self.entityData[k] !== '') {
                    if (!validator[schema.paths[k].validate](self.entityData[k])) {
                        errors[k] = new DatastoolsError.ValidatorError({
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

        /**
         * Return a Model from Datastools
         * @param name : model name
         */
        model(name) {
            return this.constructor.base.model(name);
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

    function arrayArguments(args) {
        let a = [];
        for (let i = 0, l = args.length; i < l; i++) {
            a.push(args[i]);
        }
        return a;
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
            return self.ds.createQuery.apply(self.ds, createQueryArgs);
        }
    }

    module.exports = exports = Model;
})();

