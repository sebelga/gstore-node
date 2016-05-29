'use strict';

/**
 * Create shallow copy of option
 * @param defaultOptions
 * @param options
 */
exports.options = function(defaultOptions, options) {
    options = options || {};

    Object.keys(defaultOptions).forEach((k) => {
        if (!options.hasOwnProperty(k)) {
            options[k] = defaultOptions[k];
        }
    });
    return options;
};
