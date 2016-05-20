(function() {
    'use strict';

    var utils = require('./utils');
    var Schema = require('./schema');
    var Model = require('./model');
    var Entity = require('./entity');

    var pkg = require('../package.json');

    function Datastools() {
        this.models       = {};
        this.modelSchemas = {};
        this.options      = {};
    }

    // Connect to Google Datastore
    Datastools.prototype.connect = function(ds) {
        this.ds = ds;
        return this.ds;
    };
    Datastools.prototype.connect.$hasSideEffects = true;

    /**
     * Defines a Model and retreives it
     * @param name
     * @param schema
     * @param skipInit
     * @returns {*}
     */
    Datastools.prototype.model = function(name, schema, skipInit) {

        if (utils.isObject(schema) && !(schema.instanceOfSchema)) {
            schema = new Schema(schema);
        }

        // handle internal options from connection.model()
        var options;
        if (skipInit && utils.isObject(skipInit)) {
            options = skipInit;
            skipInit = true;
        } else {
            options = {};
        }

        // look up schema for the collection.
        if (!this.modelSchemas[name]) {
            if (schema) {
                // cache it so we only apply plugins once
                this.modelSchemas[name] = schema;
            } else {
                throw new Error('Model Schema missing...');
            }
        }

        var model;

        // connection.model() may be passing a different schema for
        // an existing model name. in this case don't read from cache.
        if (this.models[name] && options.cache !== false) {
            if (schema && schema.instanceOfSchema && schema !== this.models[name].schema) {
                throw new Error('Trying to override Model Schema');
            }
            return this.models[name];
        }

        // ensure a schema exists
        if (!schema) {
            schema = this.modelSchemas[name];
            if (!schema) {
                throw new Error('Schema ' + name + ' missing');
            }
        }

        var ds = options.ds || this.ds;
        model = Model.compile(name, schema, ds, this);

        if (!skipInit) {
            model.init();
        }

        if (options.cache === false) {
            return model;
        }

        this.models[name] = model;
        return this.models[name];
    };
    Datastools.prototype.model.$hasSideEffects = true;

    /**
     * Returns an array of model names created on this instance of Datastools.
     *
     * ####Note:
     *
     * _Does not include names of models created using `connection.model()`._
     *
     * @api public
     * @return {Array}
     */

    // Datastools.prototype.modelNames = function() {
    //     var names = Object.keys(this.models);
    //     return names;
    // };
    // Datastools.prototype.modelNames.$hasSideEffects = true;


    /**
     * The Datastools version
     *
     * @property version
     * @api public
     */

    Datastools.prototype.version = pkg.version;

    /**
     * The Datastools constructor
     *
     * The exports of the mongoose module is an instance of this class.
     *
     * ####Example:
     *
     *     var datastoore = require('datastoore');
     *     var datastoore2 = new datastoore.Datastools();
     *
     * @method Mongoose
     * @api public
     */

    Datastools.prototype.Datastools = Datastools;

    /**
     * The Mongoose [Schema](#schema_Schema) constructor
     *
     * ####Example:
     *
     *     var mongoose = require('mongoose');
     *     var Schema = mongoose.Schema;
     *     var CatSchema = new Schema(..);
     *
     * @method Schema
     * @api public
     */

    Datastools.prototype.Schema = Schema;

    /**
     * The Datastools [Model](#model_Model) constructor.
     *
     * @method Model
     * @api public
     */

    Datastools.prototype.Model = Model;

    /**
     * The Datastools Entity constructor.
     *
     * @method Document
     * @api public
     */

    Datastools.prototype.Entity = Entity;


    /*!
    * The exports object is an instance of Datastools.
    *
    * @api public
    */
    module.exports = exports = new Datastools();
})();
