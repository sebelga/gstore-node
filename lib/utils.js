'use strict';

const is = require('is');

/**
 * Wraps a callback style function to conditionally return a promise.
 * Utility function taken from the "google-cloud-node library"
 * Credits: Dave Gramlich
 *
 * @param {function} originalMethod - The method to promisify.
 * @return {function} wrapped
 */
const promisify = (originalMethod) => {
    if (originalMethod.__promisified) {
        return originalMethod;
    }

    const wrapper = function wrapper() {
        const args = Array.prototype.slice.call(arguments);
        const hasCallback = is.fn(args[args.length - 1]);
        const context = this;

        // If the only argument passed is a Transaction object, don't return a Promise
        const inTransaction = ifSyncTransaction(context, originalMethod);

        if (hasCallback || inTransaction) {
            return originalMethod.apply(context, args);
        }

        return new Promise((resolve, reject) => {
            args.push(function callback() {
                const callbackArgs = Array.prototype.slice.call(arguments);
                const err = callbackArgs.shift();

                if (err) {
                    return reject(err);
                }

                return resolve(callbackArgs);
            });

            return originalMethod.apply(context, args);
        });

        // -----------------------------

        function ifSyncTransaction(scope, fn) {
            const hasPreHooks = scope.preHooksEnabled !== false &&
                                scope.__pres &&
                                {}.hasOwnProperty.call(scope.__pres, fn.name);
            const onlyTransactionArg = !!args[0] && args[0].constructor && args[0].constructor.name === 'Transaction';

            return !hasPreHooks && onlyTransactionArg;
        }
    };

    wrapper.__promisified = true;
    return wrapper;
};

module.exports = {
    promisify,
};
