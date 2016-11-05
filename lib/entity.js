(function() {
    'use strict';

    /*
    * Module dependencies.
    */
    var async        = require('async');
    var is           = require('is');
    var extend       = require('extend');
    var EventEmitter = require('events').EventEmitter;
    var hooks        = require('hooks-fixed');

    var datastoreSerializer = require('./serializer').Datastore;
    const defaultValues = require('./helpers/defaultValues');
    var GstoreError     = require('./error.js');

    class Entity extends EventEmitter {
        constructor(data, id, ancestors, namespace, key) {
            super();
            this.className = 'Entity';
            this.setMaxListeners(0);

            this.schema              = this.constructor.schema;
            this.excludeFromIndexes = [];

            if (key) {
                if(key.constructor.name === 'Key') {
                    this.entityKey = key;
                } else {
                    throw new Error('Entity Key must be an instance of gcloud Key');
                }
            } else {
                this.entityKey = createKey(this, id, ancestors, namespace);
            }

            // add entityData from data passed
            this.entityData = buildEntityData(this, data);

            // Adding 'pre', 'post' and 'hooks' method to our Entity (hooks-fixed)
            Object.keys(hooks).forEach((k) => {
                this[k] = hooks[k];
            });

            registerHooksFromSchema(this);
        }

        plain (options) {
            options = typeof options === 'undefined' ? {} : options;

            if (typeof options !== 'undefined' && !is.object(options)) {
                throw new Error('Options must be an Object');
            }
            let readAll  = options.hasOwnProperty('readAll') ? options.readAll : false;
            let virtuals = options.hasOwnProperty('virtuals') ? options.virtuals : false;

            if (virtuals) {
                this.addVirtuals(this.entityData);
            }

            var data = datastoreSerializer.fromDatastore.call(this, this.entityData, readAll);

            return data;
        };

        get (path) {
            if (this.schema.virtuals.hasOwnProperty(path)) {
                return this.schema.virtuals[path].applyGetters(this.entityData);
            }
            return this.entityData[path];
        }

        set (path, value) {
            if (this.schema.virtuals.hasOwnProperty(path)) {
                return this.schema.virtuals[path].applySetters(value, this.entityData);
            }
            this.entityData[path] = value;
        }

        /**
         * Return a Model from Gstore
         * @param name : model name
         */
        model(name) {
            return this.constructor.gstore.model(name);
        }

        // Fetch entity from Datastore
        datastoreEntity(cb) {
            let _this = this;
            this.gstore.ds.get(this.entityKey, (err, entity) => {
                if (err) {
                    return cb(err);
                }

                if (!entity) {
                    return cb({
                        code: 404,
                        message: 'Entity not found'
                    });
                }

                _this.entityData = entity;
                cb(null, _this);
            });
        }

        addVirtuals() {
            let virtuals   = this.schema.virtuals;
            let entityData = this.entityData;

            Object.keys(virtuals).forEach((k) => {
                if (entityData.hasOwnProperty(k)) {
                    virtuals[k].applySetters(entityData[k], entityData);
                } else {
                    virtuals[k].applyGetters(entityData);
                }
            });

            return this.entityData;
        }
    }

    // Private
    // -------
    function createKey(self, id, ancestors, namespace) {
        let hasAncestors = typeof ancestors !== 'undefined' && ancestors !== null && is.array(ancestors);

        /*
        /* Create copy of ancestors to avoid mutating the Array
        */
        if (hasAncestors) {
            ancestors = ancestors.slice();
        }

        let path;
        if (id) {
            if (is.string(id)) {
                id = isFinite(id) ? parseInt(id, 10) : id;
            } else if (!is.number(id)) {
                throw new Error('id must be a string or a number');
            }
            path = hasAncestors ? ancestors.concat([self.entityKind, id]) : [self.entityKind, id];
        } else {
            if (hasAncestors) {
                ancestors.push(self.entityKind);
            }
            path = hasAncestors ? ancestors : self.entityKind;
        }

        if (namespace && !is.array(path)) {
            path = [path];
        }
        return namespace ? self.gstore.ds.key({namespace:namespace, path:path}) : self.gstore.ds.key(path);
    }

    function buildEntityData(self, data) {
        var schema     = self.schema;
        var entityData = {};

        if (data) {
            Object.keys(data).forEach(function (k) {
                entityData[k] = data[k];
            });
        }

        //set default values & excludedFromIndex
        Object.keys(schema.paths).forEach((k) => {
            if (!entityData.hasOwnProperty(k) && (!schema.paths[k].hasOwnProperty('optional') || schema.paths[k].optional === false)) {
                let value = schema.paths[k].hasOwnProperty('default') ? schema.paths[k].default : null;

                if (({}).hasOwnProperty.call(defaultValues.__map__, value)) {
                    /**
                     * If default value is in the gstore.defaultValue map
                     * then execute the handler for that shortcut
                     */
                    value = defaultValues.__handler__(value);
                } else if (value === null && schema.paths[k].hasOwnProperty('values')) {
                    value = schema.paths[k].values[0];
                }

                entityData[k] = value; 
            }
            if (schema.paths[k].excludeFromIndexes === true) {
                self.excludeFromIndexes.push(k);
            }
        });

        // add Symbol Key to data
        entityData[self.gstore.ds.KEY] = self.entityKey;

        return entityData;
    }

    function registerHooksFromSchema(self) {
        var queue = self.schema && self.schema.callQueue;
        if (!queue.length) {
            return self;
        }

        var toWrap = queue.reduce(function(seed, pair) {
            var args = [].slice.call(pair[1]);
            var pointCut = pair[0] === 'on' ? 'post' : args[0];

            if (!(pointCut in seed)) {
                seed[pointCut] = {post: [], pre: []};
            }

            if (pair[0] === 'on') {
                seed.post.push(args);
            } else {
                seed[pointCut].pre.push(args);
            }

            return seed;
        }, {post: []});

        // 'post' hooks
        toWrap.post.forEach(function(args) {
            self.on.apply(self, args);
        });
        delete toWrap.post;

        Object.keys(toWrap).forEach(function(pointCut) {
            if (!self[pointCut]) {
                return;
            }
            toWrap[pointCut].pre.forEach(function(args) {
                args[0] = pointCut;
                let fn = args.pop();
                args.push(fn.bind(self));
                self.pre.apply(self, args);
            });
        });

        return self;
    }

    module.exports = exports = Entity;
})();
