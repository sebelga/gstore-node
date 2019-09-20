import extend from 'extend';
import is from 'is';

import { Transaction, Query as DatastoreQuery } from '@google-cloud/datastore';
import { Operator } from '@google-cloud/datastore/build/src/query';

import Model from './model';
import Entity from './entity';
import helpers from './helpers';
import { GstoreError, ERROR_CODES } from './errors';
import { Datastore as datastoreSerializer } from './serializer';
import { PopulateRef, EntityData, EntityFormatType, JSONFormatType, PromiseWithPopulate } from './types';

const { queryHelpers, populateHelpers } = helpers;
const { populateFactory } = populateHelpers;
const { createDatastoreQueryForModel, buildQueryFromOptions } = queryHelpers;

class Query<T extends object> {
  private Model: Model<T>;

  constructor(GstoreModel: Model<T>) {
    this.Model = GstoreModel;
  }

  /**
   * Initialize a query on the Model Entity Kind
   *
   * @param {String} namespace Namespace for the Query
   * @param {Object<Transaction>} transaction The transactioh to execute the query in (optional)
   *
   * @returns {Object} The query to be run
   */
  initQuery<R = QueryResponse<T>>(namespace?: string, transaction?: Transaction): GstoreQuery<T, R> {
    const query = createDatastoreQueryForModel(this.Model, namespace, transaction);

    const runQuery: QueryRunFunc<T, R> = (
      options = {},
      responseHandler = (res: QueryResponse<T>): R => (res as unknown) as R,
    ): PromiseWithPopulate<R> => {
      options = extend(true, {}, this.Model.schema.options.queries, options);

      /**
       * Array to keep all the references entities to fetch
       */
      const refsToPopulate: PopulateRef[][] = [];
      let promise;

      const onResponse = (data: [EntityData<T>[], { moreResults: string; endCursor: string }]): QueryResponse<T> => {
        let entities = data[0];
        const info = data[1];

        // TODO: This whole scope binding needs to be refactored!! Please!! :)
        // Add id property to entities and suppress properties
        // where "read" setting is set to false
        entities = entities.map(entity => datastoreSerializer.fromDatastore(entity, this.Model, options));

        const response: QueryResponse<T> = {
          entities,
        };

        if (info.moreResults !== this.Model.gstore.ds.NO_MORE_RESULTS) {
          response.nextPageCursor = info.endCursor;
        }

        return response;
      };

      // prettier-ignore
      const populateHandler = (response: QueryResponse<T>): QueryResponse<T> | Promise<QueryResponse<T>> =>
        refsToPopulate.length
          ? this.Model.__populate(refsToPopulate, options)(response.entities).then((entitiesPopulated: any) => ({
            ...response,
            entities: entitiesPopulated as EntityData<T>[],
          }))
          : response;

      if (this.Model.__hasCache(options, 'queries')) {
        promise = this.Model.gstore
          .cache!.queries.read(query, options, (query as any).__originalRun.bind(query))
          .then(onResponse)
          .then(populateHandler)
          .then(responseHandler);
      } else {
        promise = (query as any).__originalRun
          .call(query, options)
          .then(onResponse)
          .then(populateHandler)
          .then(responseHandler);
      }

      promise.populate = populateFactory(refsToPopulate, promise, this.Model.schema);
      return promise;
    };

    /* eslint-disable @typescript-eslint/unbound-method */
    // keep a reference to original run() method
    query.__originalRun = ((query as unknown) as DatastoreQuery).run;

    query.run = runQuery;
    /* eslint-enable @typescript-eslint/unbound-method */

    return query;
  }

  list(options: QueryListOptions = {}): PromiseWithPopulate<QueryResponse<T>> {
    // const Model = this.Model || this;

    /**
     * If global options set in schema, we extend it with passed options
     */
    if ({}.hasOwnProperty.call(this.Model.schema.shortcutQueries, 'list')) {
      options = extend({}, this.Model.schema.shortcutQueries.list, options);
    }

    let query = this.initQuery<QueryResponse<T>>(options.namespace);

    /**
     * Build Datastore Query from options passed
     */
    query = buildQueryFromOptions(query, options, this.Model.gstore.ds);

    const { limit, offset, order, select, ancestors, filters, start, ...rest } = options;
    return query.run(rest);
  }

  findOne(
    keyValues: { [propName: string]: any },
    ancestors?: Array<string | number>,
    namespace?: string,
    options?: {
      cache?: boolean;
      ttl?: number | { [propName: string]: number };
    },
  ): PromiseWithPopulate<Entity<T> | null> {
    this.Model.__hooksEnabled = true;

    if (!is.object(keyValues)) {
      throw new Error('[gstore.findOne()]: "Params" has to be an object.');
    }

    const query = this.initQuery<Entity<T> | null>(namespace);
    query.limit(1);

    Object.keys(keyValues).forEach(k => {
      query.filter(k, keyValues[k]);
    });

    if (ancestors) {
      query.hasAncestor(this.Model.gstore.ds.key(ancestors.slice()));
    }

    const responseHandler = ({ entities }: QueryResponse<T>): Entity<T> | null => {
      if (entities.length === 0) {
        if (this.Model.gstore.config.errorOnEntityNotFound) {
          throw new GstoreError(ERROR_CODES.ERR_ENTITY_NOT_FOUND, `${this.Model.entityKind} not found`);
        }
        return null;
      }

      const [e] = entities;
      const entity = this.Model.__model(
        e,
        undefined,
        undefined,
        undefined,
        (e as any)[this.Model.gstore.ds.KEY as any],
      );
      return entity;
    };
    return query.run(options, responseHandler);
  }

  /**
   * Find entities before or after an entity based on a property and a value.
   *
   * @static
   * @param {string} propName The property to look around
   * @param {*} value The property value
   * @param options Additional configuration
   * @returns {Promise<any>}
   * @example
   ```
      // Find the next 20 post after March 1st 2018
      BlogPost.findAround('publishedOn', '2018-03-01', { after: 20 })
      ```
      * @link https://sebloix.gitbook.io/gstore-node/queries/findaround.html
      */
  findAround<U extends QueryFindAroundOptions, E = U['format'] extends EntityFormatType ? Array<Entity<T>> : Array<T>>(
    property: string,
    value: any,
    options: U,
    namespace: string,
  ): PromiseWithPopulate<E> {
    const validateArguments = (): { error: Error | null } => {
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
    };

    const { error } = validateArguments();

    if (error) {
      throw error;
    }

    const query = this.initQuery<E>(namespace);
    const op = options.after ? '>' : '<';
    const descending = !!options.after;

    query.filter(property, op, value);
    query.order(property, { descending });
    query.limit(options.after ? options.after : options.before!);

    const { after, before, ...rest } = options;
    return query.run(rest, (res: any) => res.entities);
  }
}

export interface GstoreQuery<T, R = any> extends Omit<DatastoreQuery, 'run'> {
  __originalRun: DatastoreQuery['run'];
  run: QueryRunFunc<T, R>;
}

type QueryRunFunc<T, R = any> = (
  options?: QueryOptions,
  responseHandler?: (res: QueryResponse<T>) => R,
) => PromiseWithPopulate<R>;
export interface QueryOptions {
  /**
   * Specify either strong or eventual. If not specified, default values are chosen by Datastore for the operation.
   * Learn more about strong and eventual consistency in the link below
   *
   * @type {('strong' | 'eventual')}
   * @link https://cloud.google.com/datastore/docs/articles/balancing-strong-and-eventual-consistency-with-google-cloud-datastore
   */
  consistency?: 'strong' | 'eventual';
  /**
   * If set to true will return all the properties of the entity,
   * regardless of the *read* parameter defined in the Schema
   *
   * @type {boolean}
   * @default false
   */
  readAll?: boolean;
  /**
   * Response format for the entities. Either plain object or entity instances
   *
   * @type {string}
   * @default 'JSON'
   */
  format?: JSONFormatType | EntityFormatType;
  /**
   * Add a "__key" property to the entity data with the complete Key from the Datastore.
   *
   * @type {boolean}
   * @default false
   */
  showKey?: boolean;
  /**
   * If set to true, it will read from the cache and prime the cache with the response of the query.
   *
   * @type {boolean}
   * @default The "global" cache configuration.
   */
  cache?: boolean;
  /**
   * Custom TTL value for the cache. For multi-store it can be an object of ttl values
   *
   * @type {(number | { [propName: string]: number })}
   * @default The cache.ttl.queries value
   */
  ttl?: number | { [propName: string]: number };
}

export interface QueryListOptions extends QueryOptions {
  /**
   * Optional namespace for the Query
   *
   * @type {string}
   */
  namespace?: string;
  /**
   * @type {number}
   */
  limit?: number;
  /**
   * Descending is optional and default to "false"
   *
   * @example ```{ property: 'userName', descending: true }```
   * @type {({ property: 'string', descending?: boolean } | { property: 'string', descending?: boolean }[])}
   */
  order?: { property: string; descending?: boolean } | { property: string; descending?: boolean }[];
  /**
   * @type {(string | string[])}
   */
  select?: string | string[];
  /**
   * @type {([string, any] | [string, string, any] | (any)[][])}
   */
  filters?: [string, any] | [string, Operator, any] | (any)[][];
  /**
   * @type {Array<any>}
   */
  ancestors?: Array<string | number>;
  /**
   * @type {string}
   */
  start?: string;
  /**
   * @type {number}
   */
  offset?: number;
}

export interface QueryFindAroundOptions extends QueryOptions {
  before?: number;
  after?: number;
  readAll?: boolean;
  format?: JSONFormatType | EntityFormatType;
  showKey?: boolean;
}

export interface QueryResponse<T> {
  entities: EntityData<T>[];
  nextPageCursor?: string;
}

export default Query;
