(function() {
    'use strict';

    /*!
    * Module dependencies.
    */
    var EventEmitter = require('events').EventEmitter;
    var hooks        = require('hooks-fixed');
    var utils        = require('./utils');

    /**
     * Entity constructor.
     */
    function Entity(data, id) {
        this.isNew   = true;
        this.emitter = new EventEmitter();
        this.emitter.setMaxListeners(0);
        this.$registerHooksFromSchema();

        if (data) {
            if (data instanceof Entity) {
                this.isNew = data.isNew;
            } else {
                this.init(data, id);
            }
        }
    }

    // for (var k in hooks) {
    //     Entity.prototype[k] = Entity[k] = hooks[k];
    // }

    /*!
     * Entity exposes the NodeJS event emitter API, so you can use
     * `on`, `once`, etc.
     */
    utils.each(['on', 'once', 'emit', 'listeners', 'removeListener', 'setMaxListeners',
            'removeAllListeners', 'addListener'], function(emitterFn) {
            Entity.prototype[emitterFn] = function() {
                return this.emitter[emitterFn].apply(this.emitter, arguments);
            };
        });

    /*!
     * Set up middleware support
     */

    for (var k in hooks) {
        if (hooks.hasOwnProperty(k)) {
            Entity.prototype[k] = Entity[k] = hooks[k];
        }
    }

    Entity.prototype.constructor = Entity;

    Entity.prototype.$buildEntityData = function(obj) {
        if (obj) {
            var data = {};
            Object.keys(obj).forEach(function(k) {
                data[k] = obj[k];
            });

            return data;
        }
    };

    /**
     * Assigns/compiles `schema` into this documents prototype.
     *
     * @param {Schema} schema
     * @api private
     * @method $__setSchema
     * @memberOf Entity
     */

    Entity.prototype.$setSchema = function(schema) {
        this.schema = schema;
    };

    Entity.prototype.init = function(data, id) {
        this.isNew      = false;
        this.entityData = this.$buildEntityData(data);

        if (this.schema.hasOwnProperty.modifiedOn) {
            this.entityData.modifiedOn = new Date();
        }

        if (id) {
            id  = isNaN(parseInt(id, 10)) ? id : parseInt(id, 10);
            this.entityKey = this.ds.key([this.entityName, id]);
        } else {
            this.entityKey = this.ds.key(this.entityName);
        }

        this.emit('init', this);
        return this;
    };

    Entity.prototype.$registerHooksFromSchema = function() {
        var _this = this;

        var queue = _this.schema && _this.schema.callQueue;
        if (!queue.length) {
            return _this;
        }

        var toWrap = queue.reduce(function(seed, pair) {
            if (pair[0] !== 'pre' && pair[0] !== 'post' && pair[0] !== 'on') {
                _this[pair[0]].apply(_this, pair[1]);
                return seed;
            }
            var args = [].slice.call(pair[1]);
            var pointCut = pair[0] === 'on' ? 'post' : args[0];
            if (!(pointCut in seed)) {
                seed[pointCut] = {post: [], pre: []};
            }
            if (pair[0] === 'post') {
                seed[pointCut].post.push(args);
            } else if (pair[0] === 'on') {
                seed[pointCut].push(args);
            } else {
                seed[pointCut].pre.push(args);
            }
            return seed;
        }, {post: []});

        // // 'post' hooks are simpler
        toWrap.post.forEach(function(args) {
            _this.on.apply(_this, args);
        });
        delete toWrap.post;

        if (toWrap.set) {
            // Set hooks also need to be sync
            if (toWrap.set.pre) {
                toWrap.set.pre.forEach(function(args) {
                    _this.pre.apply(_this, args);
                });
            }
            if (toWrap.set.post) {
                toWrap.set.post.forEach(function(args) {
                    _this.post.apply(_this, args);
                });
            }
            delete toWrap.set;
        }

        Object.keys(toWrap).forEach(function(pointCut) {

            if (!_this[pointCut]) {
                return;
            }
            toWrap[pointCut].pre.forEach(function(args) {
                args[0] = pointCut;
                _this.pre.apply(_this, args);
            });
            toWrap[pointCut].post.forEach(function(args) {
                args[0] = pointCut;
                _this.post.apply(_this, args);
            });
        });
        return _this;
        // Object.keys(toWrap).forEach(function(method) {
        //     toWrap[method].pre.forEach(function(args) {
        //         var fn = args.pop();
        //         _this.pre(method, fn);
        //     });
        // });
        // return _this;

        // Object.keys(toWrap).forEach(function(pointCut) {
            // // this is so we can wrap everything into a promise;
            // var newName = ('$__original_' + pointCut);
            // if (!_this[pointCut]) {
            //     return;
            // }
            // _this[newName] = _this[pointCut];
            // _this[pointCut] = function wrappedPointCut() {
                // var args = [].slice.call(arguments);
                // var lastArg = args.pop();
                // var fn;

                // return new Promise.ES6(function(resolve, reject) {
                //     if (lastArg && typeof lastArg !== 'function') {
                //         args.push(lastArg);
                //     } else {
                //         fn = lastArg;
                //     }
                //     args.push(function(error, result) {
                //         if (error) {
                //             _this.$__handleReject(error);
                //             fn && fn(error);
                //             reject(error);
                //             return;
                //         }
                //
                //         fn && fn.apply(null, [null].concat(Array.prototype.slice.call(arguments, 1)));
                //         resolve(result);
                //     });
                //
                //     _this[newName].apply(_this, args);
                // });
        //     };
        //
        //     toWrap[pointCut].pre.forEach(function(args) {
        //         args[0] = newName;
        //         _this.$pre.apply(_this, args);
        //     });
        //     toWrap[pointCut].post.forEach(function(args) {
        //         args[0] = newName;
        //         _this.$post.apply(_this, args);
        //     });
        // });
        // return _this;
    };
    
    module.exports = exports = Entity;
})();
