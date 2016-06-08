(function() {
    'use strict';

    /*
    * Module dependencies.
    */
    var validator           = require('validator');
    var moment              = require('moment');
    var async               = require('async');
    var is                  = require('is');
    var extend              = require('extend');
    var gcloud              = require('gcloud');
    var Entity              = require('./entity');
    var datastoreSerializer = require('./serializer').Datastore;
    var utils               = require('./utils');
    var queryHelpers        = require('./helper').QueryHelpers;

    class Model extends Entity{
        constructor (data, id, ancestors, namespace, key) {
            super(data, id, ancestors, namespace, key);
        }

        static compile(name, schema, ds, base) {
            var ModelInstance = class extends Model {
                constructor (data, id, ancestors, namespace, key) {
                    super(data, id, ancestors, namespace, key);
                }
                static init() {
                }
            }

            ModelInstance.schema = schema;
            applyMethods(ModelInstance.prototype, schema);

            ModelInstance.prototype.entityName = ModelInstance.entityName = name;
            ModelInstance.prototype.ds         = ModelInstance.ds = ds;
            ModelInstance.hooks                = schema.s.hooks.clone();
            ModelInstance.base                 = base;

            return ModelInstance;
        }

        static get(id, ancestors, cb) {
            let _this = this;
            let args  = arrayArguments(arguments);

            cb        = args.pop();
            id        = isNaN(parseInt(id)) ? id : parseInt(id);
            ancestors = args.length > 1 ? args[1] : undefined;

            let key = this.createKey(id, ancestors);

            this.ds.get(key, (err, entity) => {
                if (err) {
                    return cb(err);
                }

                if (!entity) {
                    return cb({
                        code   : 404,
                        message: _this.entityName + ' {' + id.toString() + '} not found'
                    });
                }

                entity = _this.__model(entity.data, null, null, null, entity.key);

                cb(null, entity);
            });
        }

        static update(id, data, ancestors, cb) {
            var _this = this;

            let args = arrayArguments(arguments);

            cb        = args.pop();
            id        = isNaN(parseInt(id)) ? id : parseInt(id);
            ancestors = args.length > 2 ? args[2] : undefined;

            let key = this.createKey(id, ancestors);

            this.ds.get(key, (err, entity) => {
                if (err) {
                    return cb(err);
                }

                if (!entity) {
                    return cb({
                        code   : 404,
                        message: 'Entity {' + id.toString() + '} to update not found'
                    });
                }

                extend(true, entity.data, data);

                let model = _this.__model(entity.data, null, null, null, entity.key);

                model.save({op:'update'}, (err, entity, info) => {
                    if (err) {
                        return cb(err);
                    }

                    cb(null, entity, info);
                });
            });
        }

        static query(namespace) {
            let _this = this;

            let query = initQuery(this, namespace);

            query.run = function(options, cb) {
                let args = [];
                for (let i = 0; i < arguments.length; i++) {
                    args.push(arguments[i]);
                }
                cb = args.pop();

                options = args.length > 0 ? args[0] : {};
                options = utils.options(_this.schema.options.entities, options);

                _this.ds.runQuery(query, (err, entities, info) => {
                    if (err) {
                        return cb(err);
                    }
                    if (options.simplifyResult) {
                        entities = entities.map(datastoreSerializer.fromDatastore);
                    }

                    var response = {
                        entities : entities
                    };

                    if (info.moreResults !== gcloud.datastore.NO_MORE_RESULTS) {
                        response.nextPageCursor = info.endCursor;
                    }

                    cb(null, response);
                });
            };

            return query;
        }

        static list(options, cb) {
            let _this = this;
            let args  = arrayArguments(arguments);

            cb      = args.pop();
            options = args.length > 0 ? args[0] : {};

            if(this.schema.shortcutQueries.hasOwnProperty('list')) {
                options = utils.options(this.schema.shortcutQueries.list, options);
            }

            let query = initQuery(this, options.namespace);

            // Build query from options passed
            query = queryHelpers.buildFromOptions(query, options, this.ds);

            // merge options inside entities option
            options = utils.options(_this.schema.options.entities, options);

            this.ds.runQuery(query, (err, entities, info) => {
                if (err) {
                    return cb(err);
                }
                if (options.simplifyResult) {
                    entities = entities.map(datastoreSerializer.fromDatastore);
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

        static delete(id, ancestors, cb) {
            let _this = this;
            let args  = arrayArguments(arguments);

            cb = args.pop();
            id = isNaN(parseInt(id)) ? id : parseInt(id);

            let path = [this.entityName, id];
            path     = ancestors && is.array(ancestors) ? ancestors.concat(path) : path;
            let key  = this.ds.key(path);

            /**
             * Call pre hooks, then delete, then post hooks
             */
            async.series([pre, executeDelete, post], allDone);

            //////////

            function pre(cb) {
                return _this.hooks.execPre('delete', _this, cb);
            }

            function executeDelete(cb) {
                _this.ds.delete(key, (err, apiRes) => {
                    if (err) {
                        return cb(err);
                    }

                    let success = apiRes.indexUpdates > 0;
                    cb(null, {success:success, apiRes:apiRes});
                });
            }

            function post(cb) {
                return _this.hooks.execPost('delete', _this, [], cb);
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
                    let id        = entity.key.path[entity.key.path.length - 1];
                    let ancestors = entity.key.path.slice(0,-2);
                    _this.delete.call(_this, id, ancestors, cb);
                }, function done(err) {
                    if (err) {
                        return cb(err);
                    }
                    cb(null, {
                        success: true,
                        message: 'All ' + _this.entityName + ' deleted successfully.'
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
                            message: 'Not found'
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

        static findAround(property, value, options, cb) {
            let args = arrayArguments(arguments);

            cb = args.pop();

            if (args.length < 3) {
                return cb({
                    code : 400,
                    message : 'Argument missing'
                });
            }

            property = args[0];
            value    = args[1];
            options  = args[2];

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

            let query = initQuery(this, options.namespace);

            let op = options.after ? '>' : '<';

            query.filter(property, op, value);
            query.limit(options.after ? options.after : options.before);

            this.ds.runQuery(query, (err, entities) => {
                if (err) {
                    return cb(err);
                }

                cb(null, entities);
            });
        };

        static createKey(id, ancestors) {
            var key;
            if (ancestors && is.array(ancestors)) {
                key = this.ds.key(ancestors.concat([this.entityName, id]));
            } else {
                key = this.ds.key([this.entityName, id]);
            }
            return key;
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
            let M = this.compile(this.entityName, this.schema, this.ds);
            return new M(data, id, ancestors, namespace, key);
        }

        save (options, cb) {
            let _this = this;
            let args  = arrayArguments(arguments);
            let saveOptions = {
                op:'save',
                transaction:false
            };
            cb      = args.pop();
            options = args.length > 0 && args[0] !== null ? args[0] : {};

            extend(saveOptions, options);

            let entity = {
                key : this.entityKey,
                data : datastoreSerializer.toDatastore(this.entityData, this.excludeFromIndexes)
            };

            if (!saveOptions.transaction) {
                this.ds.save(entity, (err) => {
                    if (err) {
                        return cb(err);
                    }

                    let info = {
                        op : saveOptions.op
                    };

                    _this.emit('save');
                    // emit both save && other calling operation (probably update)
                    if (saveOptions.op !== 'save') {
                        _this.emit(saveOptions.op);
                    }

                    cb(null, _this, info);
                });
            } else {
                // TODO save to transaction
                /**
                 * transaction.save(.....)
                 */
            }
        }

        validate(cb) {
            let error;
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
                    error = {
                        success : false,
                        code:400,
                        message:'Property not allowed ' + k
                    };
                }

                // Properties type
                if (!skip && !error && self.entityData[k] !== null && schema.paths[k].hasOwnProperty('type')) {
                    if (schema.paths[k].type === 'datetime') {
                        if (self.entityData[k].constructor.name !== 'Date' &&
                            (typeof self.entityData[k] !== 'string' ||
                                !self.entityData[k].match(/\d{4}-\d{2}-\d{2}([ ,T])?(\d{2}:\d{2}:\d{2})?(\.\d{1,3})?/) ||
                                !moment(self.entityData[k]).isValid())) {
                            error = {
                                success: false,
                                code   : 400,
                                message: 'Wrong date format for ' + k
                            };
                        }
                    } else if (schema.paths[k].type === 'array') {
                        if (typeof self.entityData[k] !== 'object' || !is.array(self.entityData[k])) {
                            error = {
                                success: false,
                                code   : 400,
                                message: 'Data type error for ' + k
                            };
                        }
                    } else {
                        if (typeof self.entityData[k] !== schema.paths[k].type) {
                            error = {
                                success: false,
                                code   : 400,
                                message: 'Data type error for ' + k
                            };
                        }
                    }
                }

                // Value Validation
                if (!skip && !error && schema.paths[k].hasOwnProperty('validate') && self.entityData[k] && self.entityData[k] !== '') {
                    if (!validator[schema.paths[k].validate](self.entityData[k])) {
                        error = {
                            success: false,
                            code   : 401,
                            message: 'Wrong format for property {' + k + '}'
                        };
                    }
                }

                // Preset values
                if (!skip && !error && schema.paths[k].hasOwnProperty('values') && self.entityData[k] !== '') {
                    if (schema.paths[k].values.indexOf(self.entityData[k]) < 0) {
                        error = {
                            success: false,
                            code   : 400,
                            message: 'Value not allowed for ' + k
                        };
                    }
                }
            });

            if (cb) {
                var payload =  error ? error : {success:true};
                cb(payload);
            } else {
                return error ? error : {success:true};
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

    function initQuery(self, namespace) {
        let createQueryArgs = [self.entityName];

        if (namespace) {
            createQueryArgs.unshift(namespace);
        }

        return self.ds.createQuery.apply(self.ds, createQueryArgs);
    }

    module.exports = exports = Model;
})();

