'use strict';

const is = require('is');

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

    if (options.offset) {
        query.offset(options.offset);
    }

    if (options.order) {
        if (!options.order.length) {
            options.order = [options.order];
        }
        options.order.forEach((order) => {
            query.order(order.property, {
                descending: {}.hasOwnProperty.call(order, 'descending') ? order.descending : false,
            });
        });
    }

    if (options.select) {
        query.select(options.select);
    }

    if (options.ancestors) {
        if (!ds || ds.constructor.name !== 'Datastore') {
            throw new Error('Datastore instance not passed');
        }

        const ancestorKey = options.namespace
            ? ds.key({ namespace: options.namespace, path: options.ancestors.slice() })
            : ds.key(options.ancestors.slice());

        query.hasAncestor(ancestorKey);
    }

    if (options.filters) {
        if (!is.array(options.filters)) {
            throw new Error('Wrong format for filters option');
        }

        if (!is.array(options.filters[0])) {
            options.filters = [options.filters];
        }

        if (options.filters[0].length > 1) {
            options.filters.forEach((filter) => {
                // We check if the value is a function
                // if it is, we execute it.
                let value = filter[filter.length - 1];
                value = is.fn(value) ? value() : value;
                const f = filter.slice(0, -1).concat([value]);

                query.filter.apply(query, f);
            });
        }
    }

    if (options.start) {
        query.start(options.start);
    }

    return query;
}

module.exports = {
    buildFromOptions,
};
