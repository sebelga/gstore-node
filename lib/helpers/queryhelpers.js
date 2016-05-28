'use strict';

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
        query.hasAncestor(ds.key(['Parent', 123]));
    }

    if (options.filters) {
        if (typeof options.filters.length === 'undefined' || options.filters.constructor.name !== 'Array') {
            throw new Error ('Wrong format for filters option');
        }

        if (typeof options.filters[0].length === 'undefined' || options.filters[0].constructor.name !== 'Array') {
            options.filters = [options.filters];
        }

        options.filters.forEach((filter) => {
            query.filter.apply(query, filter);
        });
    }

    return query;
}

module.exports = {
    buildFromOptions : buildFromOptions
};
