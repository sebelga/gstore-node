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
            this.ds         = ModelInstance.ds = ds;
            this.entityName = name;
            this.schema     = schema;

            applyMethods(Model.prototype, schema);

            ModelInstance.hooks     = schema.s.hooks.clone();
            ModelInstance.base      = base;
            ModelInstance.prototype.entityName = ModelInstance.entityName = name;

            return ModelInstance;
        }

        static findOne(test) {
            var _this = this;

            this.hooks.execPre('findOne', _this, (done) => {
                // Pre methods done
                // [process here...]

                _this.hooks.execPost('findOne', null, [], () => {
                    // all post hooks are done
                });
            });
        }

        save () {
            console.log('Saving Model:', this.entityData, '\n');
            this.emit('save');
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
