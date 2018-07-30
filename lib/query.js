'use strict';

const extend = require('extend');
const is = require('is');

const utils = require('./utils');
const { queryHelpers } = require('./helpers');
const { GstoreError, errorCodes } = require('./errors');
const datastoreSerializer = require('./serializer').Datastore;

class Query {
    constructor(Model) {
        this.Model = Model;
    }

    /**
     * Initialize a query on the Model Entity Kind
     *
     * @param {String} namespace Namespace for the Query
     * @param {Object<Transaction>} transaction The transactioh to execute the query in (optional)
     *
     * @returns {Object} The query to be run
     */
    initQuery(namespace, transaction) {
        const Model = this.Model || this;
        const query = createDatastoreQuery(Model, namespace, transaction);

        // keep a reference to original run() method
        query.__originalRun = query.run;

        query.run = function runQuery(options, cb) {
            const args = Array.prototype.slice.apply(arguments);
            cb = args.pop();

            options = args.length > 0 ? args[0] : {};
            options = extend(true, {}, Model.schema.options.queries, options);

            if (Model.__hasCache(options, 'queries')) {
                return Model.gstore.cache.queries.read(query, options, query.__originalRun.bind(query))
                    .then(onQuery).catch(onError);
            }

            return this.__originalRun.call(query, options).then(onQuery).catch(onError);

            // -----------------------------------------------

            function onQuery(data) {
                let entities = data[0];
                const info = data[1];

                // Add id property to entities and suppress properties
                // where "read" setting is set to false
                entities = entities.map(entity => (
                    datastoreSerializer.fromDatastore.call(Model, entity, options)
                ));

                const response = {
                    entities,
                };

                if (info.moreResults !== Model.gstore.ds.NO_MORE_RESULTS) {
                    response.nextPageCursor = info.endCursor;
                }

                cb(null, response);
            }

            function onError(err) {
                return cb(err);
            }
        };

        query.run = utils.promisify(query.run);

        return query;
    }

    list(options, cb) {
        const Model = this.Model || this;
        const args = Array.prototype.slice.apply(arguments);

        cb = args.pop();
        options = args.length > 0 ? args[0] : {};

        /**
         * If global options set in schema, we extend it with passed options
         */
        if ({}.hasOwnProperty.call(Model.schema.shortcutQueries, 'list')) {
            options = extend({}, Model.schema.shortcutQueries.list, options);
        }

        /**
         * Query.initQuery() has been binded to Model.query() method
         */
        let query = Model.query(options.namespace);

        /**
         * Build Datastore Query from options passed
         */
        query = queryHelpers.buildFromOptions(query, options, Model.gstore.ds);

        const passThrough = removePropsObject(options, [
            'limit',
            'offset',
            'order',
            'select',
            'ancestors',
            'filters',
            'start',
        ]);
        return query.run(passThrough).then(response => cb(null, response), err => cb(err));
    }

    findOne(params, ancestors, namespace, options, cb) {
        const Model = this.Model || this;
        Model.__hooksEnabled = true;

        const args = Array.prototype.slice.apply(arguments);

        cb = args.pop();
        ancestors = args.length > 1 ? args[1] : undefined;
        namespace = args.length > 2 ? args[2] : undefined;
        options = args.length > 3 ? args[3] : undefined;

        if (!is.object(params)) {
            return cb({
                code: 400,
                message: 'Params have to be passed as object',
            });
        }

        const query = Model.query(namespace);
        query.limit(1);

        Object.keys(params).forEach((k) => {
            query.filter(k, params[k]);
        });

        if (ancestors) {
            query.hasAncestor(Model.gstore.ds.key(ancestors.slice()));
        }

        return query.run(options).then(onSuccess, onError);

        // -----------------------------------------

        function onSuccess(queryData) {
            const { entities } = queryData;

            if (entities.length === 0) {
                return cb(new GstoreError(
                    errorCodes.ERR_ENTITY_NOT_FOUND,
                    `${Model.entityKind} not found`
                ));
            }

            const [e] = entities;
            const entity = Model.__model(e, null, null, null, e[Model.gstore.ds.KEY]);
            return cb(null, entity);
        }

        function onError(err) {
            return cb(err);
        }
    }

    findAround(property, value, options, namespace, cb) {
        const Model = this.Model || this;
        const args = Array.prototype.slice.apply(arguments);
        cb = args.pop();

        if (args.length < 3) {
            return cb({
                code: 400,
                message: 'Argument missing',
            });
        }

        [property, value, options] = args;
        namespace = args.length > 3 ? args[3] : undefined;

        if (!is.object(options)) {
            return cb({
                code: 400,
                message: 'Options pased has to be an object',
            });
        }

        if (!{}.hasOwnProperty.call(options, 'after') && !{}.hasOwnProperty.call(options, 'before')) {
            return cb({
                code: 400,
                message: 'You must set "after" or "before" in options',
            });
        }

        if ({}.hasOwnProperty.call(options, 'after') && {}.hasOwnProperty.call(options, 'before')) {
            return cb({
                code: 400,
                message: 'You must chose between after or before',
            });
        }

        const query = Model.query(namespace);
        const op = options.after ? '>' : '<';
        const descending = !!options.after;

        query.filter(property, op, value);
        query.order(property, { descending });
        query.limit(options.after ? options.after : options.before);

        const passThrough = removePropsObject(options, ['after', 'before']);
        return query.run(passThrough).then(({ entities }) => cb(null, entities), err => cb(err));
    }
}

// ----------

function createDatastoreQuery(Model, namespace, transaction) {
    if (transaction && transaction.constructor.name !== 'Transaction') {
        throw Error('Transaction needs to be a gcloud Transaction');
    }

    const createQueryArgs = [Model.entityKind];

    if (namespace) {
        createQueryArgs.unshift(namespace);
    }

    if (transaction) {
        return transaction.createQuery.apply(transaction, createQueryArgs);
    }

    return Model.gstore.ds.createQuery.apply(Model.gstore.ds, createQueryArgs);
}

/**
 * As Node 6 does not support deconstructing object to "extract" properties
 * we do it manually here
 * @param {any} options options object
 * @param {*} props Array of properties to remove from options
 */
function removePropsObject(input, props) {
    const output = Object.assign({}, input);
    props.forEach(p => delete output[p]);
    return output;
}

Query.prototype.list = utils.promisify(Query.prototype.list);
Query.prototype.findOne = utils.promisify(Query.prototype.findOne);
Query.prototype.findAround = utils.promisify(Query.prototype.findAround);

module.exports = Query;
