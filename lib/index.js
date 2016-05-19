(function() {
    'use strict';

    var utils = require('./utils');
    var Schema = require('./schema');
    var Model = require('./model');

    var pkg    = require('../package.json');

    function Datastoore() {
        this.models       = {};
        this.modelSchemas = {};
        this.options      = {};
        //
        // var conn = this.createConnection();
        // conn.models = this.models;

    }

    // Connect to Google Datastore
    Datastoore.prototype.connect = function(gcloud, configDatastore) {
        configDatastore = typeof configDatastore === 'undefined' ? {} : configDatastore;
        this.ds = gcloud.datastore(configDatastore);
        return this.ds;
    };
    Datastoore.prototype.connect.$hasSideEffects = true;

    /**
     * Defines a Model and retreives it
     * @param name
     * @param schema
     * @param skipInit
     * @returns {*}
     */
    Datastoore.prototype.model = function(name, schema, skipInit) {

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
    Datastoore.prototype.model.$hasSideEffects = true;

    /**
     * Returns an array of model names created on this instance of Datastoore.
     *
     * ####Note:
     *
     * _Does not include names of models created using `connection.model()`._
     *
     * @api public
     * @return {Array}
     */

    // Datastoore.prototype.modelNames = function() {
    //     var names = Object.keys(this.models);
    //     return names;
    // };
    // Datastoore.prototype.modelNames.$hasSideEffects = true;


    /**
     * The Datastoore version
     *
     * @property version
     * @api public
     */

    Datastoore.prototype.version = pkg.version;

    /**
     * The Datastoore constructor
     *
     * The exports of the mongoose module is an instance of this class.
     *
     * ####Example:
     *
     *     var datastoore = require('datastoore');
     *     var datastoore2 = new datastoore.Datastoore();
     *
     * @method Mongoose
     * @api public
     */

    Datastoore.prototype.Datastoore = Datastoore;

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

    Datastoore.prototype.Schema = Schema;

    /**
     * The Datastoore [Model](#model_Model) constructor.
     *
     * @method Model
     * @api public
     */

    //Datastoore.prototype.Model = Model;


    /*!
    * The exports object is an instance of Datastoore.
    *
    * @api public
    */

    var datastoore = module.exports = exports = new Datastoore();

})();
