(function() {
    'use strict';

    /*
    * Module dependencies.
    */
    var validator    = require('validator');
    var moment       = require('moment');
    var Entity       = require('./entity');
    var serializer   = require('./services/serializer');

    class Model extends Entity{
        constructor (data, id) {
            super(data, id);
            this.ModelInstance = ModelInstance;
        }

        static compile(name, schema, ds, base) {

            this.entityName = name;
            this.schema     = schema;

            applyMethods(Model.prototype, schema);

            ModelInstance.prototype.ds         = ModelInstance.ds = ds;
            ModelInstance.hooks                = schema.s.hooks.clone();
            ModelInstance.base                 = base;
            ModelInstance.prototype.entityName = ModelInstance.entityName = name;

            return ModelInstance;
        }

        static findOne(query, cb) {
            var _this = this;

            this.hooks.execPre('findOne', _this, () => {
                // Pre methods done
                // [process here...]

                _this.hooks.execPost('findOne', null, [], () => {
                    // all post hooks are done
                });
            });
        }

        save (transaction, cb) {
            var args = [];
            for (var i = 0; i < arguments.length; i++) {
                args.push(arguments[i]);
            }
            cb = args.pop();
            transaction = args.length > 0 ? args[0] : undefined;

            var _this = this;

            var entity = {
                key : this.entityKey,
                data : serializer.ds.toDatastore(this.entityData, this.excludedFromIndexes)
            };

            if (typeof transaction === 'undefined') {
                this.ds.save(entity, (err) => {
                    if (err) {
                        return cb(err);
                    }
                    _this.emit('save');
                    cb(null, entity);
                });
            } else {
                // TODO save to transaction
                /**
                 * transaction.save(.....)
                 */
            }

        }

        validate(cb) {
            // console.log('validating....', this.entityData, this.schema);
            let error;
            var self   = this;
            var schema = this.schema;

            Object.keys(this.entityData).forEach((k) => {
                // Properties dict
                if (!schema.paths.hasOwnProperty(k)) {
                    error = {
                        success : false,
                        code:400,
                        message:'Property not allowed ' + k
                    };
                }

                // Properties type
                if (!error && self.entityData[k] !== null && schema.paths[k].hasOwnProperty('type')) {
                    if (schema.paths[k].type === 'datetime') {
                        if (self.entityData.birthday.constructor.name !== 'Date' &&
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
                        if (typeof self.entityData[k] !== 'object' || typeof self.entityData[k].length === 'undefined' || self.entityData[k].constructor.name !== 'Array') {
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

                // Validate
                if (!error && schema.paths[k].hasOwnProperty('validate') && self.entityData[k] && self.entityData[k] !== '') {
                    if (!validator[schema.paths[k].validate](self.entityData[k])) {
                        error = {
                            success: false,
                            code   : 401,
                            message: 'Wrong format for property {' + k + '}'
                        };
                    }
                }

                // Default values
                if (!error && schema.paths[k].hasOwnProperty('values') && self.entityData[k] !== '') {
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

    class ModelInstance extends Model {
        constructor (data, id) {
            super(data, id);
        }

        static init() {
        }
    }

    module.exports = exports = Model;
})();
