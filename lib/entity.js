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
    function Entity(obj) {
        this.isNew   = true;
        this.emitter = new EventEmitter();
        this.emitter.setMaxListeners(0);
        this.$registerHooksFromSchema();

        this.entityData = this.$buildEntityData(obj);

        if (obj) {
            if (obj instanceof Entity) {
                this.isNew = obj.isNew;
            }
        }
    }

    for (var k in hooks) {
        Entity.prototype[k] = Entity[k] = hooks[k];
    }

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

    Entity.prototype.isValid = function() {
        console.log('Chekcing if Entity is Valid.......');
        return true;
    };

    /*!
     * Set up middleware support
     */

    // for (var k in hooks) {
    //     if (k === 'pre' || k === 'post') {
    //         Entity.prototype['$' + k] = Entity['$' + k] = hooks[k];
    //     } else {
    //         Entity.prototype[k] = Entity[k] = hooks[k];
    //     }
    // }

    Entity.prototype.constructor = Entity;

    Entity.prototype.$buildEntityData = function(obj) {
        var data = {};
        Object.keys(obj).forEach(function(k) {
            data[k] = obj[k];
        });

        return data;
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

    Entity.prototype.init = function(doc) {
        this.isNew = false;

        init(this, doc, this._doc);

        this.emit('init', this);

        return this;
    };

    /*!
    * Init helper.
    *
    * @param {Object} self entity instance
    * @param {Object} obj raw datastore entity data
    * @param {Object} doc object we are initializing
    * @api private
    */

    function init(self, obj, doc, prefix) {
        prefix = prefix || '';

        var keys = Object.keys(obj),
            len = keys.length,
            schema,
            path,
            i;

        while (len--) {
            i = keys[len];
            path = prefix + i;
            schema = self.schema.path(path);

            if (!schema && utils.isObject(obj[i]) &&
                (!obj[i].constructor || utils.getFunctionName(obj[i].constructor) === 'Object')) {
                // assume nested object
                if (!doc[i]) {
                    doc[i] = {};
                }
                init(self, obj[i], doc[i], path + '.');
            } else {
                if (obj[i] === null) {
                    doc[i] = null;
                } else if (obj[i] !== undefined) {
                    if (schema) {
                        try {
                            doc[i] = schema.cast(obj[i], self, true);
                        } catch (e) {
                            self.invalidate(e.path, new ValidatorError({
                                path: e.path,
                                message: e.message,
                                type: 'cast',
                                value: e.value
                            }));
                        }
                    } else {
                        doc[i] = obj[i];
                    }
                }
                // mark as hydrated
                if (!self.isModified(path)) {
                    self.$__.activePaths.init(path);
                }
            }
        }
    }

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

        // if (toWrap.set) {
        //     // Set hooks also need to be sync
        //     if (toWrap.set.pre) {
        //         toWrap.set.pre.forEach(function(args) {
        //             _this.pre.apply(_this, args);
        //         });
        //     }
        //     if (toWrap.set.post) {
        //         toWrap.set.post.forEach(function(args) {
        //             _this.post.apply(_this, args);
        //         });
        //     }
        //     delete toWrap.set;
        // }

        Object.keys(toWrap).forEach(function(method) {
            toWrap[method].pre.forEach(function(args) {
                var fn = args.pop();
                _this.pre(method, fn);
            });
            toWrap[method].post.forEach(function(args) {
                var fn = args.pop();
                _this.post(method, fn);
            });
        });

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

    Entity.prototype.save = function(cb) {
        console.log('saving Model........');
        this.emit('save', this);
        cb(null, {message:'todo'});
    };

    module.exports = exports = Entity;
})();
