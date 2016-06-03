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
    var Entity              = require('./entity');
    var datastoreSerializer = require('./serializer').Datastore;
    var utils               = require('./utils');
    var queryHelpers        = require('./helper').QueryHelpers;

    class Model extends Entity{
        constructor (data, id, ancestors, namespace) {
            super(data, id, ancestors, namespace);
        }

        static compile(name, schema, ds, base) {
            var ModelInstance = class extends Model {
                constructor (data, id, ancestors, namespace) {
                    super(data, id, ancestors, namespace);
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

                entity.simplify = () => {
                    return datastoreSerializer.fromDatastore(entity);
                };
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
            let M   = this.compile(this.entityName, this.schema, this.ds);

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

                let model  = new M(entity.data, id, ancestors);

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

            let createQueryArgs = [this.entityName];

            if (namespace) {
                createQueryArgs.unshift(namespace);
            }

            let query = this.ds.createQuery.apply(this.ds, createQueryArgs);

            query.run = function(options, cb) {
                let args = [];
                for (let i = 0; i < arguments.length; i++) {
                    args.push(arguments[i]);
                }
                cb = args.pop();

                options = args.length > 0 ? args[0] : {};
                options = utils.options(_this.schema.options.entities, options);

                _this.ds.runQuery(query, (err, entities) => {
                    if (err) {
                        return cb(err);
                    }
                    if (options.simplifyResult) {
                        entities = entities.map(datastoreSerializer.fromDatastore);
                    }
                    cb(null, entities);
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

            let createQueryArgs = [this.entityName];
            if (options.namespace) {
                createQueryArgs.unshift(options.namespace);
            }

            let query = this.ds.createQuery.apply(this.ds, createQueryArgs);

            // update query with options settings
            query = queryHelpers.buildFromOptions(query, options, this.ds);

            // merge entities option
            options = utils.options(_this.schema.options.entities, options);

            this.ds.runQuery(query, (err, entities) => {
                if (err) {
                    return cb(err);
                }
                if (options.simplifyResult) {
                    entities = entities.map(datastoreSerializer.fromDatastore);
                }
                cb(null, entities);
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

            let createQueryArgs = [this.entityName];

            if (namespace) {
                createQueryArgs.unshift(namespace);
            }

            let query = this.ds.createQuery.apply(this.ds, createQueryArgs);

            if (ancestors) {
                query.hasAncestor(this.ds.key(ancestors.slice()))
            }

            this.ds.runQuery(query, (err, entities) => {
                if (err) {
                    return cb(err);
                }

                async.eachSeries(entities, function deleteEntity(entity, cb) {
                    _this.delete.call(_this, entity.key.id || entity.key.name, cb);
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

        static findOne(query, cb) {
            let _this = this;

            this.hooks.execPre('findOne', _this, () => {
                // Pre methods done
                // [process here...]

                _this.hooks.execPost('findOne', null, [], () => {
                    // all post hooks are done
                });
            });
        }

        static createKey(id, ancestors) {
            var key;
            if (ancestors && is.array(ancestors)) {
                key = this.ds.key(ancestors.concat([this.entityName, id]));
            } else {
                key = this.ds.key([this.entityName, id]);
            }
            return key;
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
                data : datastoreSerializer.toDatastore(this.entityData, this.excludedFromIndexes)
            };

            if (!saveOptions.transaction) {
                this.ds.save(entity, (err) => {
                    if (err) {
                        return cb(err);
                    }

                    let entitySaved = {
                        key:_this.entityKey,
                        data:_this.entityData
                    };

                    let info = {
                        op : saveOptions.op
                    };

                    entitySaved.simplify = () => {
                        return datastoreSerializer.fromDatastore(entitySaved);
                    };

                    _this.emit(saveOptions.op);

                    cb(null, entitySaved, info);
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
                if (!schema.paths.hasOwnProperty(k) && schema.options.unknownProperties === true) {
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

    module.exports = exports = Model;
})();
