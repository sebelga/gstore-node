(function() {
    'use strict';

    /*!
    * Module dependencies.
    */
    var Entity = require('./entity');

    function Model(doc) {
        Entity.call(this, doc);
    }

    /*!
     * Inherits from Entity.
     *
     * All Model.prototype features are available on
     * top level entites.
     */
    Model.prototype = Object.create(Entity.prototype);
    Model.prototype.constructor = Model;

    Model.init = function() {
        this.schema.emit('init', this);
    };

    /*!
    * Compiler utility.
    *
    * @param {String} name model name
    * @param {Schema} schema
    * @param {gcloud datastore} ds
    * @param {Datastools} base datastools instance
    */
    Model.compile = function compile(name, schema, ds, base) {
        // generate new class
        function ModelInstance(doc) {
            if (!(this instanceof ModelInstance)) {
                return new ModelInstance(doc);
            }
            Model.call(this, doc);
        }

        ModelInstance.prototype = Object.create(Model.prototype);
        ModelInstance.prototype.constructor = ModelInstance;

        // ModelInstance.hooks     = schema.s.hooks.clone(); // Not Used for now
        ModelInstance.base      = base;
        ModelInstance.modelName = name;
        ModelInstance.model     = Model.prototype.model;
        ModelInstance.ds        = ModelInstance.prototype.ds = ds;

        ModelInstance.prototype.$setSchema(schema);

        // apply methods
        applyMethods(ModelInstance, schema);

        ModelInstance.schema = ModelInstance.prototype.schema;
        ModelInstance.init   = Model.init;

        return ModelInstance;
    };

    /*!
    * Register methods for this model
    *
    * @param {Model} model
    * @param {Schema} schema
    */
    var applyMethods = function(model, schema) {
        function apply(method, schema) {
            Object.defineProperty(model.prototype, method, {
                get: function() {
                    var h = {};
                    for (var k in schema.methods[method]) {
                        if (schema.methods[method].hasOwnProperty(k)) {
                            h[k] = schema.methods[method][k].bind(this);
                        }
                    }
                    return h;
                },
                configurable: true
            });
        }

        for (var method in schema.methods) {
            if (schema.methods.hasOwnProperty(method)) {
                if (typeof schema.methods[method] === 'function') {
                    model.prototype[method] = schema.methods[method];
                } else {
                    apply(method, schema);
                }
            }
        }
    };

    Model.prototype.get = function(id, cb) {
        id = isNaN(parseInt(id)) ? id : parseInt(id);

        var args = [];
        for (var i = 0, l = arguments.length; i < l; i++) {
            args.push(arguments[i]);
        }
        cb = args.pop();

        var key;
        if (typeof id.length !== 'undefined') {
            key = this.ds.key(id);
        } else {
            key = this.ds.key([this.modelName, id]);
        }

        this.ds.get(key, function(err, entity) {
            if (err) {
                return cb(err);
            }
            if (!entity) {
                return cb({
                    code   : 404,
                    message: 'Entity not found'
                });
            }

            cb(null, entity);
        });
    };

    /*!
    * Module exports.
    */
    module.exports = exports = Model;
})();
