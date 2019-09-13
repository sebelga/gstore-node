'use strict';

import extend from 'extend';
import is from 'is';
import { queryHelpers, populateHelpers } from './helpers';
import { GstoreError, errorCodes } from './errors';
import { Datastore as datastoreSerializer } from './serializer';

const { populateFactory } = populateHelpers;

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

        query.run = function runQuery(options = {}, responseHandler = res => res) {
            options = extend(true, {}, Model.schema.options.queries, options);

            /**
             * Array to keep all the references entities to fetch
             */
            const refsToPopulate = [];
            let promise;

            const populateHandler = response => (refsToPopulate.length
                ? Model.populate(refsToPopulate, options)(response.entities)
                    .then(entities => ({ ...response, entities }))
                : response);

            if (Model.__hasCache(options, 'queries')) {
                promise = Model.gstore.cache.queries.read(query, options, query.__originalRun.bind(query))
                    .then(onQuery)
                    .then(populateHandler)
                    .then(responseHandler);
            } else {
                promise = this.__originalRun.call(query, options)
                    .then(onQuery)
                    .then(populateHandler)
                    .then(responseHandler);
            }

            promise.populate = populateFactory(refsToPopulate, promise, Model);
            return promise;

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

                return response;
            }
        };

        return query;
    }

    list(options = {}) {
        const Model = this.Model || this;

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

        const {
            limit, offset, order, select, ancestors, filters, start, ...rest
        } = options;
        return query.run(rest);
    }

    findOne(params, ancestors, namespace, options) {
        const Model = this.Model || this;
        Model.__hooksEnabled = true;

        if (!is.object(params)) {
            return Promise.reject(new Error('[gstore.findOne()]: "Params" has to be an object.'));
        }

        const query = Model.query(namespace);
        query.limit(1);

        Object.keys(params).forEach(k => {
            query.filter(k, params[k]);
        });

        if (ancestors) {
            query.hasAncestor(Model.gstore.ds.key(ancestors.slice()));
        }

        const responseHandler = ({ entities }) => {
            if (entities.length === 0) {
                if (Model.gstore.config.errorOnEntityNotFound) {
                    throw new GstoreError(
                        errorCodes.ERR_ENTITY_NOT_FOUND,
                        `${Model.entityKind} not found`
                    );
                }
                return null;
            }

            const [e] = entities;
            const entity = Model.__model(e, null, null, null, e[Model.gstore.ds.KEY]);
            return entity;
        };
        return query.run(options, responseHandler);
    }

    findAround(property, value, options, namespace) {
        const Model = this.Model || this;

        const { error } = validateArguments();
        if (error) {
            return Promise.reject(error);
        }

        const query = Model.query(namespace);
        const op = options.after ? '>' : '<';
        const descending = !!options.after;

        query.filter(property, op, value);
        query.order(property, { descending });
        query.limit(options.after ? options.after : options.before);

        const { after, before, ...rest } = options;
        return query.run(rest, ({ entities }) => entities);

        // -----------

        function validateArguments() {
            if (!property || !value || !options) {
                return { error: new Error('[gstore.findAround()]: Not all the arguments were provided.') };
            }

            if (!is.object(options)) {
                return { error: new Error('[gstore.findAround()]: Options pased has to be an object.') };
            }

            if (!{}.hasOwnProperty.call(options, 'after') && !{}.hasOwnProperty.call(options, 'before')) {
                return { error: new Error('[gstore.findAround()]: You must set "after" or "before" in options.') };
            }

            if ({}.hasOwnProperty.call(options, 'after') && {}.hasOwnProperty.call(options, 'before')) {
                return { error: new Error('[gstore.findAround()]: You can\'t set both "after" and "before".') };
            }

            return { error: null };
        }
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

export default Query;
