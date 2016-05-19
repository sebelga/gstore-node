(function() {
    'use strict';

    /*!
    * Module dependencies.
    */
    var EventEmitter = require('events').EventEmitter;
    var hooks = require('hooks-fixed');
    var utils = require('./utils');

    /**
     * Document constructor.
     */
    function Document(obj) {
        this.isNew   = true;
        this.emitter = new EventEmitter();
        this._doc    = this.$__buildDoc(obj);

        if (obj) {
            if (obj instanceof Document) {
                this.isNew = obj.isNew;
            }
        }
    }

    /*!
     * Set up middleware support
     */

    for (var k in hooks) {
        if (k === 'pre' || k === 'post') {
            Document.prototype['$' + k] = Document['$' + k] = hooks[k];
        } else {
            Document.prototype[k] = Document[k] = hooks[k];
        }
    }

    /*!
     * Document exposes the NodeJS event emitter API, so you can use
     * `on`, `once`, etc.
     */
    utils.each(
        ['on', 'once', 'emit', 'listeners', 'removeListener', 'setMaxListeners',
            'removeAllListeners', 'addListener'],
        function(emitterFn) {
            Document.prototype[emitterFn] = function() {
                return this.$__.emitter[emitterFn].apply(this.$__.emitter, arguments);
            };
        });

    Document.prototype.constructor = Document;

    Document.prototype.$__buildDoc = function(obj) {
        var doc = {};
        Object.keys(obj).forEach(function(k) {
            doc[k] = obj[k];
        });

        return doc;
    };

    /**
     * Assigns/compiles `schema` into this documents prototype.
     *
     * @param {Schema} schema
     * @api private
     * @method $__setSchema
     * @memberOf Document
     */

    Document.prototype.$__setSchema = function(schema) {
        this.schema = schema;
    };

    Document.prototype.init = function(doc) {
        // do not prefix this method with $__ since its
        // used by public hooks

        this.isNew = false;

        init(this, doc, this._doc);

        this.emit('init', this);

        return this;
    };


    module.exports = exports = Document;
})();
