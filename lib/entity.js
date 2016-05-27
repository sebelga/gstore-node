(function() {
    'use strict';

    /*
    * Module dependencies.
    */
    var EventEmitter = require('events').EventEmitter;
    var hooks        = require('hooks-fixed');
    //var utils        = require('./utils');


    class Entity extends EventEmitter {
        constructor(data, id) {
            super();

            this.setMaxListeners(0);
            this.schema = this.constructor.schema;
            this.excludedFromIndexes = [];

            // Adding 'pre', 'post' and 'hooks' method to our Entity (hooks-fixed)
            Object.keys(hooks).forEach((k) => {
                this[k] = hooks[k];
            });

            init(this, data, id);

            registerHooksFromSchema(this);
        }
    }

    // Private
    // -------
    function init(self, data, id) {
        // add entityData from data passed
        self.entityData = buildEntityData(data);

        //set default values & excludedFromIndex
        Object.keys(self.schema.paths).forEach((k) => {
            if (!self.entityData.hasOwnProperty(k) && (!self.schema.paths[k].hasOwnProperty('optional') || self.schema.paths[k].optional === false)) {
                self.entityData[k] = self.schema.paths[k].hasOwnProperty('default') ? self.schema.paths[k].default : null;
                if (self.entityData[k] === null && self.schema.paths[k].hasOwnProperty('values')) {
                    self.entityData[k] = self.schema.paths[k].values[0];
                }
            }
            if (self.schema.paths[k].excludedFromIndex === true) {
                self.excludedFromIndexes.push(k);
            }
        });

        if (self.schema.paths.hasOwnProperty('modifiedOn')) {
            self.entityData.modifiedOn = new Date();
        }

        if (id) {
            id  = isNaN(parseInt(id, 10)) ? id : parseInt(id, 10);
            self.entityKey = self.ds.key([self.entityName, id]);
        } else {
            self.entityKey = self.ds.key(self.entityName);
        }
    }

    function buildEntityData(data) {
        var entityData = {};

        if (data) {
            Object.keys(data).forEach(function (k) {
                entityData[k] = data[k];
            });
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
