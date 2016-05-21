(function() {
    'use strict';

    /*!
    * Module dependencies.
    */
    var EventEmitter = require('events').EventEmitter;
    var Entity       = require('./entity');
    var serializer    = require('./services/serializer');

    class Model {
        constructor (data, id) {
            console.log('Model created', 'data:', data, 'id:', id);
            //super.call(data, id);
        }

        static compile(name, schema, ds, base) {
            this.ds = ds;
            this.entityName = name;

            ModelInstance.applyMethods(schema);
            return ModelInstance;
        }
    }

    class ModelInstance extends Model {
        constructor (data, id) {
            super(data, id);
        }

        /*
         * Register methods for this model
         * @param {Schema} schema
         */
        static applyMethods (schema) {
            for (var method in schema.methods) {
                if (schema.methods.hasOwnProperty(method)) {
                    if (typeof schema.methods[method] === 'function') {
                        this[method] = schema.methods[method];
                    }
                }
            }

            return this;
        }

        static init() {
            console.log('recu! ....initializing static');
        }
    }

    module.exports = exports = Model;

})();
