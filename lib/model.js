(function() {
    'use strict';

    /*!
    * Module dependencies.
    */
    var Document = require('./document');

    function Model(doc) {
        Document.call(this, doc);
    }

    /*!
     * Inherits from Document.
     *
     * All Model.prototype features are available on
     * top level (non-sub) documents.
     */

    Model.prototype.__proto__ = Document.prototype;

    /**
     * Connection the model uses.
     *
     * @api public
     * @property ds
     */

    Model.prototype.ds;


    /**
     * The name of the model
     *
     * @api public
     * @property modelName
     */

    Model.prototype.modelName;

    /*!
    * Compiler utility.
    *
    * @param {String} name model name
    * @param {Schema} schema
    * @param {gcloud datastore} ds
    * @param {Datastoore} base datastoore instance
    */
    Model.compile = function compile(name, schema, ds, base) {
        // generate new class
        function model(doc) {
            if (!(this instanceof model)) {
                return new model(doc);
            }
            Model.call(this, doc);
        }

        model.hooks = schema.s.hooks.clone();
        model.base = base;
        model.modelName = name;
        model.__proto__ = Model;
        model.prototype.__proto__ = Model.prototype;
        model.model = Model.prototype.model;
        model.ds = model.prototype.ds = ds;

        model.prototype.$__setSchema(schema);

        // apply methods and statics
        applyMethods(model, schema);

        model.schema = model.prototype.schema;

        return model;
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

    /**
     * Called when the model compiles.
     *
     * @api private
     */

    Model.init = function init() {
        this.schema.emit('init', this);
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

    // Model.prototype.save = function(cb) {
    //     cb(null, {message:'todo'});
    // };

    /*!
    * Module exports.
    */
    module.exports = exports = Model;
})();
