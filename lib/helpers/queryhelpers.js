'use strict';

var is = require('is');

function buildFromOptions(query, options, ds) {
    if (!query || query.constructor.name !== 'Query') {
        throw new Error('Query not passed');
    }

    if (!options || typeof options !== 'object') {
        return query;
    }

    if (options.limit) {
        query.limit(options.limit);
    }

    if (options.order) {
        if (!options.order.length) {
            options.order = [options.order];
        }
        options.order.forEach((order) => {
            query.order(order.property, {descending:order.hasOwnProperty('descending') ? order.descending : false});
        });
    }

    if (options.select) {
        query.select(options.select);
    }

    if (options.ancestors) {
        if (!ds || ds.constructor.name !== 'Datastore') {
            throw new Error('Datastore instance not passed');
        }
        query.hasAncestor(ds.key(options.ancestors.slice()));
    }

    if (options.filters) {
        if (!is.array(options.filters)) {
            throw new Error ('Wrong format for filters option');
        }

        if (!is.array(options.filters[0])) {
            options.filters = [options.filters];
        }

        if (options.filters[0].length > 1) {
            options.filters.forEach((filter) => {
                query.filter.apply(query, filter);
            });
        }
    }

    if (options.start) {
        query.start(options.start);
    }

    return query;
}

module.exports = {
    buildFromOptions : buildFromOptions
};
