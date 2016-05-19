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
        this.emitter.setMaxListeners(0);
        // this.$__registerHooksFromSchema();

    }

    for (var k in hooks) {
        Document[k] = hooks[k];
    }

    Document.prototype.save = function(cb) {
        cb(null, {message:'todo'});
    }

    // Document.hook('save', Document.prototype.save);

    Document.pre('save', function validate (next) {
        // The `this` context inside of `pre` and `post` functions
        // is the Document instance
        if (this.isValid()) {
            next();
        } else {
            next(new Error("Invalid"));
        }
    });

    Document.prototype.isValid = function() {
        console.log('Chekcing if Document is Valid.......');
        return true;
    }

    /*!
     * Set up middleware support
     */

    // for (var k in hooks) {
    //     if (k === 'pre' || k === 'post') {
    //         Document.prototype['$' + k] = Document['$' + k] = hooks[k];
    //     } else {
    //         Document.prototype[k] = Document[k] = hooks[k];
    //     }
    // }

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

        //init(this, doc, this._doc);

        this.emit('init', this);

        return this;
    };

    // Document.prototype.$__registerHooksFromSchema = function() {
    //
    //     var _this = this;
    //     var q = _this.schema && _this.schema.callQueue;
    //     if (!q.length) {
    //         return _this;
    //     }
    //
    //     // we are only interested in 'pre' hooks, and group by point-cut
    //     var toWrap = q.reduce(function(seed, pair) {
    //         if (pair[0] !== 'pre' && pair[0] !== 'post' && pair[0] !== 'on') {
    //             _this[pair[0]].apply(_this, pair[1]);
    //             return seed;
    //         }
    //         var args = [].slice.call(pair[1]);
    //         var pointCut = pair[0] === 'on' ? 'post' : args[0];
    //         if (!(pointCut in seed)) {
    //             seed[pointCut] = {post: [], pre: []};
    //         }
    //         if (pair[0] === 'post') {
    //             seed[pointCut].post.push(args);
    //         } else if (pair[0] === 'on') {
    //             seed[pointCut].push(args);
    //         } else {
    //             seed[pointCut].pre.push(args);
    //         }
    //         return seed;
    //     }, {post: []});
    //
    //     console.log(toWrap);
    //
    //     //'post' hooks are simpler
    //     toWrap.post.forEach(function(args) {
    //         _this.on.apply(_this, args);
    //     });
    //     delete toWrap.post;
    //
    //     if (toWrap.set) {
    //         // Set hooks also need to be sync
    //         if (toWrap.set.pre) {
    //             toWrap.set.pre.forEach(function(args) {
    //                 _this.$pre.apply(_this, args);
    //             });
    //         }
    //         if (toWrap.set.post) {
    //             toWrap.set.post.forEach(function(args) {
    //                 _this.$post.apply(_this, args);
    //             });
    //         }
    //         delete toWrap.set;
    //     }
    //
    //     // Object.keys(toWrap).forEach(function(pointCut) {
    //         // // this is so we can wrap everything into a promise;
    //         // var newName = ('$__original_' + pointCut);
    //         // if (!_this[pointCut]) {
    //         //     return;
    //         // }
    //         // _this[newName] = _this[pointCut];
    //         // _this[pointCut] = function wrappedPointCut() {
    //             // var args = [].slice.call(arguments);
    //             // var lastArg = args.pop();
    //             // var fn;
    //
    //             // return new Promise.ES6(function(resolve, reject) {
    //             //     if (lastArg && typeof lastArg !== 'function') {
    //             //         args.push(lastArg);
    //             //     } else {
    //             //         fn = lastArg;
    //             //     }
    //             //     args.push(function(error, result) {
    //             //         if (error) {
    //             //             _this.$__handleReject(error);
    //             //             fn && fn(error);
    //             //             reject(error);
    //             //             return;
    //             //         }
    //             //
    //             //         fn && fn.apply(null, [null].concat(Array.prototype.slice.call(arguments, 1)));
    //             //         resolve(result);
    //             //     });
    //             //
    //             //     _this[newName].apply(_this, args);
    //             // });
    //     //     };
    //     //
    //     //     toWrap[pointCut].pre.forEach(function(args) {
    //     //         args[0] = newName;
    //     //         _this.$pre.apply(_this, args);
    //     //     });
    //     //     toWrap[pointCut].post.forEach(function(args) {
    //     //         args[0] = newName;
    //     //         _this.$post.apply(_this, args);
    //     //     });
    //     // });
    //     // return _this;
    // };

    module.exports = exports = Document;
})();
