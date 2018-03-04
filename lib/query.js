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
        const query = initQuery(Model, namespace, transaction);

        // keep a reference to original run() method
        query.__originalRun = query.run;

        query.run = function runQuery(options, cb) {
            const args = Array.prototype.slice.apply(arguments);
            cb = args.pop();

            options = args.length > 0 ? args[0] : {};
            options = extend(true, {}, Model.schema.options.queries, options);

            if (Model.__hasCache(options)) {
                return Model.gstore.cache.queries.read(this, options, this.__originalRun.bind(this))
                    .then(onQuery).catch(onError);
            }

            return this.__originalRun.call(this).then(onQuery).catch(onError);

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
         * If global options set in schema, we extend the current it with passed options
         */
        if ({}.hasOwnProperty.call(Model.schema.shortcutQueries, 'list')) {
            options = extend({}, Model.schema.shortcutQueries.list, options);
        }

        let query = initQuery(Model, options.namespace);

        // Build Datastore query from options passed
        query = queryHelpers.buildFromOptions(query, options, Model.gstore.ds);

        // merge options inside entities option
        options = extend({}, Model.schema.options.queries, options);

        return query.run().then(onSuccess, onError);

        // ----------------------------------------

        function onSuccess(queryData) {
            let entities = queryData[0];
            const info = queryData[1];

            // Add id property to entities and suppress properties
            // where "read" setting is set to false
            entities = entities.map(entity => datastoreSerializer.fromDatastore.call(Model, entity, options));

            const response = {
                entities,
            };

            if (info.moreResults !== Model.gstore.ds.NO_MORE_RESULTS) {
                response.nextPageCursor = info.endCursor;
            }

            return cb(null, response);
        }

        function onError(err) {
            return cb(err);
        }
    }

    findOne(params, ancestors, namespace, cb) {
        const Model = this.Model || this;
        Model.__hooksEnabled = true;

        const args = Array.prototype.slice.apply(arguments);

        cb = args.pop();
        ancestors = args.length > 1 ? args[1] : undefined;
        namespace = args.length > 2 ? args[2] : undefined;

        if (!is.object(params)) {
            return cb({
                code: 400,
                message: 'Params have to be passed as object',
            });
        }

        const query = initQuery(this, namespace);
        query.limit(1);

        Object.keys(params).forEach((k) => {
            query.filter(k, params[k]);
        });

        if (ancestors) {
            query.hasAncestor(Model.gstore.ds.key(ancestors.slice()));
        }

        return query.run().then(onSuccess, onError);

        // -----------------------------------------

        function onSuccess(queryData) {
            const entities = queryData ? queryData[0] : null;
            let entity = entities && entities.length > 0 ? entities[0] : null;

            if (!entity) {
                return cb(new GstoreError(
                    errorCodes.ERR_ENTITY_NOT_FOUND,
                    `${Model.entityKind} not found`
                ));
            }

            entity = Model.__model(entity, null, null, null, entity[Model.gstore.ds.KEY]);
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

        const query = initQuery(Model, namespace);
        const op = options.after ? '>' : '<';
        const descending = !!options.after;

        query.filter(property, op, value);
        query.order(property, { descending });
        query.limit(options.after ? options.after : options.before);

        options = extend({}, Model.schema.options.queries, options);

        return query.run().then(onSuccess, onError);

        // --------------------------

        function onSuccess(queryData) {
            let entities = queryData[0];

            // Add id property to entities and suppress properties
            // where "read" setting is set to false
            entities = entities.map(entity => datastoreSerializer.fromDatastore.call(Model, entity, options));

            return cb(null, entities);
        }

        function onError(err) {
            return cb(err);
        }
    }
}

// ----------

function initQuery(Model, namespace, transaction) {
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

Query.prototype.list = utils.promisify(Query.prototype.list);
Query.prototype.findOne = utils.promisify(Query.prototype.findOne);
Query.prototype.findAround = utils.promisify(Query.prototype.findAround);

module.exports = Query;
