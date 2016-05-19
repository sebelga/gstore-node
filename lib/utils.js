/**
 *  Utils from mongoose.js lib/utils.js
 *  All credits to them
 *  https://github.com/Automattic/mongoose/blob/master/lib/utils.js
 */


/*!
 * Module dependencies.
 */

var cloneRegExp = require('regexp-clone');

/*!
 * Object clone
 *
 * If options.minimize is true, creates a minimal data object. Empty objects and undefined values will not be cloned. This makes the data payload sent to MongoDB as small as possible.
 *
 * Functions are never cloned.
 *
 * @param {Object} obj the object to clone
 * @param {Object} options
 * @return {Object} the cloned object
 * @api private
 */

exports.clone = function clone(obj, options) {
    if (obj === undefined || obj === null) {
        return obj;
    }

    if (Array.isArray(obj)) {
        return cloneArray(obj, options);
    }

    if (obj.constructor) {
        switch (exports.getFunctionName(obj.constructor)) {
            case 'Object':
                return cloneObject(obj, options);
            case 'Date':
                return new obj.constructor(+obj);
            case 'RegExp':
                return cloneRegExp(obj);
            default:
                // ignore
                break;
        }
    }

    if (!obj.constructor && exports.isObject(obj)) {
        // object created with Object.create(null)
        return cloneObject(obj, options);
    }

    if (obj.valueOf) {
        return obj.valueOf();
    }
};
var clone = exports.clone;

/*!
 * ignore
 */

function cloneObject(obj, options) {
    var retainKeyOrder = options && options.retainKeyOrder,
        minimize = options && options.minimize,
        ret = {},
        hasKeys,
        keys,
        val,
        k,
        i;

    if (retainKeyOrder) {
        for (k in obj) {
            val = clone(obj[k], options);

            if (!minimize || (typeof val !== 'undefined')) {
                hasKeys || (hasKeys = true);
                ret[k] = val;
            }
        }
    } else {
        // faster

        keys = Object.keys(obj);
        i = keys.length;

        while (i--) {
            k = keys[i];
            val = clone(obj[k], options);

            if (!minimize || (typeof val !== 'undefined')) {
                if (!hasKeys) {
                    hasKeys = true;
                }
                ret[k] = val;
            }
        }
    }

    return minimize
        ? hasKeys && ret
        : ret;
}

function cloneArray(arr, options) {
    var ret = [];
    for (var i = 0, l = arr.length; i < l; i++) {
        ret.push(clone(arr[i], options));
    }
    return ret;
}

/*!
 * Shallow copies defaults into options.
 *
 * @param {Object} defaults
 * @param {Object} options
 * @return {Object} the merged object
 * @api private
 */

exports.options = function(defaults, options) {
    var keys = Object.keys(defaults),
        i = keys.length,
        k;

    options = options || {};

    while (i--) {
        k = keys[i];
        if (!(k in options)) {
            options[k] = defaults[k];
        }
    }

    return options;
};

/*!
 * Determines if `arg` is an object.
 *
 * @param {Object|Array|String|Function|RegExp|any} arg
 * @api private
 * @return {Boolean}
 */

exports.isObject = function(arg) {
    if (Buffer.isBuffer(arg)) {
        return true;
    }
    return toString.call(arg) === '[object Object]';
};

exports.getFunctionName = function(fn) {
    if (fn.name) {
        return fn.name;
    }
    return (fn.toString().trim().match(/^function\s*([^\s(]+)/) || [])[1];
};

/**
 * Executes a function on each element of an array (like _.each)
 *
 * @param {Array} arr
 * @param {Function} fn
 * @api private
 */

exports.each = function(arr, fn) {
    for (var i = 0; i < arr.length; ++i) {
        fn(arr[i]);
    }
};
