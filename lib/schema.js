(function() {
    'use strict';

    var EventEmitter = require('events').EventEmitter;
    var utils        = require('./utils');
    var Kareem       = require('kareem');

    // From mongoose, not used for now
    // var IS_QUERY_HOOK = {
    //     count: true,
    //     find: true,
    //     findOne: true,
    //     findOneAndUpdate: true,
    //     findOneAndRemove: true,
    //     update: true
    // };

    function Schema(obj, options) {
        if (!(this instanceof Schema)) {
            return new Schema(obj, options);
        }

        this.methods = {};
        this.paths   = {};
        this.callQueue = [];
        this.options = this.defaultOptions(options);

        // Not Used for now
        // this.s = {
        //     hooks: new Kareem(),
        //     queryHooks: IS_QUERY_HOOK
        // };

        for (var i = 0; i < this._defaultMiddleware.length; ++i) {
            var m = this._defaultMiddleware[i];
            this[m.kind](m.hook, !!m.isAsync, m.fn);
        }

        var _this = this;
        Object.keys(obj).forEach(function(k, v) {
            _this.paths[k] = obj[k];
        });
    }

    /*!
    * Inherit from EventEmitter.
    */
    Schema.prototype = Object.create(EventEmitter.prototype);
    Schema.prototype.constructor = Schema;
    Schema.prototype.instanceOfSchema = true;

    /**
     * Default middleware attached to a schema. Cannot be changed.
     *
     * This field is used to make sure discriminators don't get multiple copies of
     * built-in middleware. Declared as a constant because changing this at runtime
     * may lead to instability with Model.prototype.discriminator().
     *
     * @api private
     * @property _defaultMiddleware
     */
    Object.defineProperty(Schema.prototype, '_defaultMiddleware', {
        configurable: false,
        enumerable: false,
        writable: false,
        value: [{
            kind: 'pre',
            hook: 'save',
            fn: function(next, options) {
                var hasValidateBeforeSaveOption = options &&
                    (typeof options === 'object') &&
                    ('validateBeforeSave' in options);

                var shouldValidate;
                if (hasValidateBeforeSaveOption) {
                    shouldValidate = !!options.validateBeforeSave;
                } else {
                    shouldValidate = this.schema.options.validateBeforeSave;
                }

                // Validate
                if (shouldValidate) {
                    console.log('Should Validate Schema before saving!!!');
                    next();
                    // this.validate({__noPromise: true}, function(error) {
                    //     next(error);
                    // });
                } else {
                    console.log('Not validating Schema before saving...');
                    next();
                }
            }
        }]
    });

    /**
     * Returns default options for this schema, merged with `options`.
     *
     * @param {Object} options
     * @return {Object}
     * @api private
     */

    Schema.prototype.defaultOptions = function(options) {
        options = utils.options({
            validateBeforeSave: true,
            typeKey: 'type'
        }, options);

        return options;
    };

    /**
     * Adds key path / schema type pairs to this schema.
     *
     * ####Example:
     *
     *     var ToySchema = new Schema;
     *     ToySchema.add({ name: 'string', color: 'string', price: 'number' });
     *
     * @param {Object} obj
     * @param {String} prefix
     * @api public
     */

    Schema.prototype.add = function add(obj, prefix) {
        prefix = prefix || '';
        var keys = Object.keys(obj);

        for (var i = 0; i < keys.length; ++i) {
            var key = keys[i];

            if (obj[key] === null) {
                throw new TypeError('Invalid value for schema path `' + prefix + key + '`');
            }

            this.paths[prefix + key] = obj[key];
        }
    };

    /**
     * Adds a method call to the queue.
     *
     * @param {String} name name of the document method to call later
     * @param {Array} args arguments to pass to the method
     * @api public
     */

    Schema.prototype.queue = function(name, args) {
        this.callQueue.push([name, args]);
        return this;
    };

    /**
    * Defines a pre hook for the document.
    *
    * ####Example
    *
    *     var blogPost = new Schema(..);
    *
    *     blogPost.pre('save', function (next) {
    *       if (!this.created) this.created = new Date;
    *       next();
    *     })
    *
    *     blogPost.pre('validate', function (next) {
    *       if (this.name !== 'Woody') this.name = 'Woody';
    *       next();
    *     })
    *
    * @param {String} method
    * @param {Function} callback
    * @see hooks.js https://github.com/bnoguchi/hooks-js/tree/31ec571cef0332e21121ee7157e0cf9728572cc3
    * @api public
    */

    Schema.prototype.pre = function() {
        // var name = arguments[0];
        // if (IS_QUERY_HOOK[name]) {
        //     this.s.hooks.pre.apply(this.s.hooks, arguments);
        //     return this;
        // }
        return this.queue('pre', arguments);
    };

    /**
     * Defines a post hook for the document
     *
     * Post hooks fire `on` the event emitted from document instances of Models compiled from this schema.
     *
     *     var schema = new Schema(..);
     *     schema.post('save', function (doc) {
     *       console.log('this fired after a document was saved');
     *     });
     *
     *     var Model = datastoore.model('Model', schema);
     *
     *     var m = new Model(..);
     *     m.save(function (err) {
     *       console.log('this fires after the `post` hook');
     *     });
     *
     * @param {String} method name of the method to hook
     * @param {Function} fn callback
     * @see hooks.js https://github.com/bnoguchi/hooks-js/tree/31ec571cef0332e21121ee7157e0cf9728572cc3
     * @api public
     */

    Schema.prototype.post = function(method, fn) {
        // if (IS_QUERY_HOOK[method]) {
        //     this.s.hooks.post.apply(this.s.hooks, arguments);
        //     return this;
        // }
        // assuming that all callbacks with arity < 2 are synchronous post hooks
        if (fn.length < 2) {
            return this.queue('on', [arguments[0], function(doc) {
                return fn.call(doc, doc);
            }]);
        }

        return this.queue('post', [arguments[0], function(next) {
            // wrap original function so that the callback goes last,
            // for compatibility with old code that is using synchronous post hooks
            var _this = this;
            var args = Array.prototype.slice.call(arguments, 1);
            fn.call(this, this, function(err) {
                return next.apply(_this, [err].concat(args));
            });
        }]);
    };

    /**
     * Adds an instance method to documents constructed from Models compiled from this schema.
     *
     * ####Example
     *
     *     var schema = kittySchema = new Schema(..);
     *
     *     schema.method('meow', function () {
     *       console.log('meeeeeoooooooooooow');
     *     })
     *
     *     var Kitty = mongoose.model('Kitty', schema);
     *
     *     var fizz = new Kitty;
     *     fizz.meow(); // meeeeeooooooooooooow
     *
     * If a hash of name/fn pairs is passed as the only argument, each name/fn pair will be added as methods.
     *
     *     schema.method({
     *         purr: function () {}
     *       , scratch: function () {}
     *     });
     *
     *     // later
     *     fizz.purr();
     *     fizz.scratch();
     *
     * @param {String|Object} method name
     * @param {Function} [fn]
     * @api public
     */

    Schema.prototype.method = function(name, fn) {
        if (typeof name !== 'string') {
            for (var i in name) {
                if (name.hasOwnProperty(i)) {
                    this.methods[i] = name[i];
                }
            }
        } else {
            this.methods[name] = fn;
        }
        return this;
    };

    /*!
    * Module exports.
    */
    module.exports = exports = Schema;

})();
