(function() {
    'use strict';

    /*!
    * Module dependencies.
    */
    var EventEmitter = require('events').EventEmitter;
    var Entity       = require('./entity');
    var serializer    = require('./services/serializer');

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
                data : serializer.ds.toDatastore(this.entityData, [])
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
