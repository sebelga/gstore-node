(function() {
    'use strict';

    /*
    * Module dependencies.
    */
    var is           = require('is');
    var EventEmitter = require('events').EventEmitter;
    var hooks        = require('hooks-fixed');

    var datastoreSerializer = require('./serializer').Datastore;

    class Entity extends EventEmitter {
        constructor(data, id, ancestors, namespace, key) {
            super();
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

        plain () {
            return datastoreSerializer.fromDatastore({key:this.entityKey, data:this.entityData});
        };

        get (path) {
            return this.entityData[path];
        }

        set (path, value) {
            this.entityData[path] = value;
        }
    }

    // Private
    // -------
    function createKey(self, id, ancestors, namespace) {
        let hasAncestors = typeof ancestors !== 'undefined' && ancestors !== null && is.array(ancestors);

        /*
        /* Create Shallow copy of ancestors to avoid modifying it
        */
        if (hasAncestors) {
            ancestors = ancestors.slice();
        }

        let path;
        if (id) {
            id   = isNaN(parseInt(id, 10)) ? id : parseInt(id, 10);
            path = hasAncestors ? ancestors.concat([self.entityName, id]) : [self.entityName, id];
        } else {
            if (hasAncestors) {
                ancestors.push(self.entityName);
            }
            path = hasAncestors ? ancestors : self.entityName;
        }

        if (namespace && !is.array(path)) {
            path = [path];
        }
        return namespace ? self.ds.key({namespace:namespace, path:path}) : self.ds.key(path);
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
                entityData[k] = schema.paths[k].hasOwnProperty('default') ? schema.paths[k].default : null;
                if (entityData[k] === null && schema.paths[k].hasOwnProperty('values')) {
                    entityData[k] = schema.paths[k].values[0];
                }
            }
            if (schema.paths[k].excludeFromIndexes === true) {
                self.excludeFromIndexes.push(k);
            }
        });

        if (schema.paths.hasOwnProperty('modifiedOn')) {
            entityData.modifiedOn = new Date();
        }

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
