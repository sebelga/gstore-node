import extend from 'extend';
import is from 'is';

import { Transaction, Query as DatastoreQuery } from '@google-cloud/datastore';

import Model from './model';
import { EntityResponse } from './entity';
import helpers from './helpers';
import { GstoreError, ERROR_CODES } from './errors';
import { datastoreSerializer } from './serializers';
import {
  PopulateRef,
  EntityData,
  EntityFormatType,
  JSONFormatType,
  PromiseWithPopulate,
  DatastoreOperator,
  OrderOptions,
} from './types';

const { queryHelpers, populateHelpers } = helpers;
const { populateFactory } = populateHelpers;
const { createDatastoreQueryForModel, buildQueryFromOptions } = queryHelpers;

class Query<T extends object, M extends object> {
  public Model: Model<T, M>;

  constructor(model: Model<T, M>) {
    this.Model = model;
  }

  initQuery<R = QueryResponse<T>>(namespace?: string, transaction?: Transaction): GstoreQuery<T, R> {
    const query: DatastoreQuery = createDatastoreQueryForModel(this.Model, namespace, transaction);

    const enhancedQueryRun = (
      options?: QueryOptions,
      responseHandler = (res: QueryResponse<T>): QueryResponse<T> => res,
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

        // Convert to JSON or ENTITY acording to which format is passed. (default = JSON)
        // If JSON => Add id property to entities and suppress properties with "read" config is set to `false`
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
    // ((query as unknown) as GstoreQuery<T, QueryResponse<T>>).__originalRun = ((query as unknown) as DatastoreQuery).run;
    ((query as unknown) as GstoreQuery<T, R>).__originalRun = query.run;
    (query as any).run = enhancedQueryRun;
    /* eslint-enable @typescript-eslint/unbound-method */

    return (query as unknown) as GstoreQuery<T, R>;
  }

  list<
    U extends QueryListOptions<T>,
    Outputformat = U['format'] extends EntityFormatType ? EntityResponse<T> : EntityData<T>
  >(options: U = {} as U): PromiseWithPopulate<QueryResponse<T, Outputformat[]>> {
    // If global options set in schema, we extend it with passed options
    if ({}.hasOwnProperty.call(this.Model.schema.shortcutQueries, 'list')) {
      options = extend({}, this.Model.schema.shortcutQueries.list, options);
    }

    let query = this.initQuery<QueryResponse<T, Outputformat[]>>(options && options.namespace);

    // Build Datastore Query from options passed
    query = buildQueryFromOptions<T, QueryResponse<T, Outputformat[]>>(query, options, this.Model.gstore.ds);

    const { limit, offset, order, select, ancestors, filters, start, ...rest } = options;
    return query.run(rest);
  }

  findOne(
    keyValues: { [P in keyof Partial<T>]: T[P] },
    ancestors?: Array<string | number>,
    namespace?: string,
    options?: {
      readAll?: boolean;
      cache?: boolean;
      ttl?: number | { [key: string]: number };
    },
  ): PromiseWithPopulate<EntityResponse<T> | null> {
    this.Model.__hooksEnabled = true;

    if (!is.object(keyValues)) {
      return Promise.reject(new Error('[gstore.findOne()]: "Params" has to be an object.')) as PromiseWithPopulate<
        never
      >;
    }

    const query = this.initQuery<EntityResponse<T> | null>(namespace);
    query.limit(1);

    Object.keys(keyValues).forEach(k => {
      query.filter(k as keyof T, keyValues[k as keyof T]);
    });

    if (ancestors) {
      query.hasAncestor(this.Model.gstore.ds.key(ancestors.slice()));
    }

    const responseHandler = ({ entities }: QueryResponse<T>): EntityResponse<T> | null => {
      if (entities.length === 0) {
        if (this.Model.gstore.config.errorOnEntityNotFound) {
          throw new GstoreError(ERROR_CODES.ERR_ENTITY_NOT_FOUND, `${this.Model.entityKind} not found`);
        }
        return null;
      }

      const [e] = entities;
      const entity = new this.Model(e, undefined, undefined, undefined, (e as any)[this.Model.gstore.ds.KEY]);
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
   * @link https://sebloix.gitbook.io/gstore-node/queries/findaround
   */
  findAround<
    U extends QueryFindAroundOptions,
    Outputformat = U['format'] extends EntityFormatType ? EntityResponse<T> : EntityData<T>
  >(property: keyof T, value: any, options: U, namespace?: string): PromiseWithPopulate<Outputformat[]> {
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
      return Promise.reject(error) as PromiseWithPopulate<never>;
    }

    const query = this.initQuery<Outputformat[]>(namespace);
    const op = options.after ? '>' : '<';
    const descending = !!options.after;

    query.filter(property, op, value);
    query.order(property, { descending });
    query.limit(options.after ? options.after : options.before!);

    const { after, before, ...rest } = options;
    return query.run(rest, (res: QueryResponse<T>) => (res.entities as unknown) as Outputformat[]);
  }
}

export interface GstoreQuery<T, R> extends Omit<DatastoreQuery, 'run' | 'filter' | 'order'> {
  __originalRun: DatastoreQuery['run'];
  run: QueryRunFunc<T, R>;
  filter<P extends keyof T>(property: P, value: T[P]): DatastoreQuery;
  filter<P extends keyof T>(property: P, operator: DatastoreOperator, value: T[P]): DatastoreQuery;
  order(property: keyof T, options?: OrderOptions): this;
}

type QueryRunFunc<T, R> = (
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
   * @type {'JSON' | 'ENTITY'}
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

export interface QueryListOptions<T> extends QueryOptions {
  /**
   * Optional namespace for the query.
   */
  namespace?: string;
  /**
   * The total number of entities to return from the query.
   */
  limit?: number;
  /**
   * Descending is optional and default to "false"
   *
   * @example ```{ property: 'userName', descending: true }```
   */
  order?: { property: keyof T; descending?: boolean } | { property: keyof T; descending?: boolean }[];
  /**
   * Retrieve only select properties from the matched entities.
   */
  select?: string | string[];
  /**
   * Supported comparison operators are =, <, >, <=, and >=.
   * "Not equal" and IN operators are currently not supported.
   */
  filters?: [string, any] | [string, DatastoreOperator, any] | (any)[][];
  /**
   * Filter a query by ancestors.
   */
  ancestors?: Array<string | number>;
  /**
   * Set a starting cursor to a query.
   */
  start?: string;
  /**
   * Set an offset on a query.
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

export interface QueryResponse<T, F = EntityData<T>[]> {
  entities: F;
  nextPageCursor?: string;
}

export default Query;
