import is from 'is';
import arrify from 'arrify';
import extend from 'extend';
import hooks from 'promised-hooks';
import dsAdapterFactory from 'nsql-cache-datastore';
import get from 'lodash.get';
import set from 'lodash.set';

import { Transaction } from '@google-cloud/datastore';

import Gstore from './index';
import Schema, { JoiConfig } from './schema';
import Entity from './entity';
import Query, { QueryResponse } from './query';
import { GstoreError, ERROR_CODES } from './errors';
import helpers from './helpers';
import {
  FuncReturningPromise,
  IdType,
  Ancestor,
  EntityKey,
  EntityData,
  PopulateRef,
  PopulateMetaForEntity,
  PopulateFunction,
  PromiseWithPopulate,
  GenericObject,
} from './types';

const dsAdapter = dsAdapterFactory();
const { populateHelpers } = helpers;

const { keyToString } = dsAdapter;
const { populateFactory } = populateHelpers;

export interface Model<T extends object = { [propName: string]: any }> {
  new (data: EntityData<T>, id?: IdType, ancestors?: Ancestor, namespace?: string, key?: EntityKey): Entity;
  /**
   * gstore-node instance
   */
  gstore: Gstore;

  /**
   * The Model Schema
   */
  schema: Schema;

  /**
   * The Model Datastore Entity Kind
   */
  entityKind: string;

  __hooksEnabled: boolean;

  // The static "pre" method is added by the "promised-hooks" lib
  // static pre: (method: string, fn: FuncReturningPromise | FuncReturningPromise[]) => any;

  // The static "post" method is added by the "promised-hooks" lib
  // static post: (method: string, fn: FuncReturningPromise | FuncReturningPromise[]) => any;

  /**
   * Generates one or several entity key(s) for the Model.
   *
   * @static
   * @param {(string | number)} id Entity id or name
   * @param {(Array<string | number>)} [ancestors] The entity Ancestors
   * @param {string} [namespace] The entity Namespace
   * @returns {entity.Key}
   * @link https://sebloix.gitbook.io/gstore-node/model/key.html
   */
  key<U extends IdType | IdType[], R = U extends Array<IdType> ? EntityKey[] : EntityKey>(
    id: U,
    ancestors?: Array<string | number>,
    namespace?: string,
  ): R;

  /**
   * Fetch an Entity by KEY from the Datastore
   *
   * @param {(string | number | string[] | number[])} id The entity ID
   * @param {(Array<string | number>)} [ancestors] The entity Ancestors
   * @param {string} [namespace] The entity Namespace
   * @param {*} [transaction] The current Datastore Transaction (if any)
   * @param [options] Additional configuration
   * @returns {Promise<any>} The entity fetched from the Datastore
   * @link https://sebloix.gitbook.io/gstore-node/model/methods/get
   */
  get<U extends string | number | Array<string | number>>(
    id: U,
    ancestors?: Array<string | number>,
    namespace?: string,
    transaction?: Transaction,
    options?: GetOptions,
  ): PromiseWithPopulate<U extends Array<string | number> ? Entity<T>[] : Entity<T>>;

  /**
   * Update an Entity in the Datastore
   *
   * @static
   * @param {(string | number)} id Entity id or name
   * @param {*} data The data to update (it will be merged with the data in the Datastore
   * unless options.replace is set to "true")
   * @param {(Array<string | number>)} [ancestors] The entity Ancestors
   * @param {string} [namespace] The entity Namespace
   * @param {*} [transaction] The current transaction (if any)
   * @param {{ dataloader?: any, replace?: boolean }} [options] Additional configuration
   * @returns {Promise<any>} The entity updated in the Datastore
   * @link https://sebloix.gitbook.io/gstore-node/model/methods/update
   */
  update(
    id: IdType,
    data: EntityData,
    ancestors?: Ancestor,
    namespace?: string,
    transaction?: Transaction,
    options?: GenericObject,
  ): Promise<Entity<T>>;

  /**
   * Delete an Entity from the Datastore
   *
   * @static
   * @param {(string | number)} id Entity id or name
   * @param {(Array<string | number>)} [ancestors] The entity Ancestors
   * @param {string} [namespace] The entity Namespace
   * @param {*} [transaction] The current transaction (if any)
   * @param {(entity.Key | entity.Key[])} [keys] If you already know the Key, you can provide it instead of passing
   * an id/ancestors/namespace. You might then as well just call "gstore.ds.delete(Key)",
   * but then you would not have the "hooks" triggered in case you have added some in your Schema.
   * @returns {Promise<{ success: boolean, key: entity.Key, apiResponse: any }>}
   * @link https://sebloix.gitbook.io/gstore-node/model/methods/delete
   */
  delete(
    id?: IdType | IdType[],
    ancestors?: Ancestor,
    namespace?: string,
    transaction?: Transaction,
    key?: EntityKey | EntityKey[],
    options?: DeleteOptions,
  ): Promise<DeleteResponse>;

  /**
   * Clear all the Queries from the cache *linked* to the Model Entity Kind.
   * One or multiple keys can also be passed to delete them from the cache. We normally don't have to call this method
   * as gstore-node does it automatically each time an entity is added/edited or deleted.
   *
   * @static
   * @param {(entity.Key | entity.Key[])} [keys] Optional entity Keys to remove from the cache with the Queries
   * @returns {Promise<void>}
   * @link https://sebloix.gitbook.io/gstore-node/model/methods/clearcache
   */
  clearCache(keys?: EntityKey | EntityKey[]): Promise<{ success: boolean }>;

  /**
   * Dynamically remove a property from indexes. If you have set `explicityOnly: false` in your Schema options,
   * then all the properties not declared in the Schema will be included in the indexes.
   * This method allows you to dynamically exclude from indexes certain properties.
   *
   * @static
   * @param {(string | string[])} propName Property name (can be one or an Array of properties)
   * @link https://sebloix.gitbook.io/gstore-node/model/other-methods.html
   */
  excludeFromIndexes(propName: string | string[]): void;

  /**
   * Sanitize the data. It will remove all the properties marked as "write: false" and convert "null" (string) to `null`
   *
   * @param {*} data The data to sanitize
   * @returns {*} The data sanitized
   * @link https://sebloix.gitbook.io/gstore-node/model/sanitize.html
   */
  sanitize(data: { [propName: string]: any }): { [P in keyof T]: T[P] } | GenericObject;

  /**
   * Register a middleware to be executed before "save()", "delete()", "findOne()" or any of your custom method.
   * The callback will receive the original argument(s) passed to the target method.
   * You can modify them in your resolve passing an object with an __override property containing the new parameter(s)
   * for the target method.
   *
   * @param {string} method The target method to add the hook to
   * @param {(...args: any[]) => Promise<any>} callback Function to execute before the target method.
   * It must return a Promise
   * @link https://sebloix.gitbook.io/gstore-node/middleware-hooks/pre-hooks.html
   */
  pre(method: string, callback: FuncReturningPromise | FuncReturningPromise[]): void;

  /**
   * Register a "post" middelware to execute after a target method.
   *
   * @param {string} method The target method to add the hook to
   * @param {(response: any) => Promise<any>} callback Function to execute after the target method.
   * It must return a Promise
   * @link https://sebloix.gitbook.io/gstore-node/middleware-hooks/post-hooks.html
   */
  post(method: string, callback: FuncReturningPromise | FuncReturningPromise[]): void;

  query: Query<T>['initQuery'];

  list: Query<T>['list'];

  findOne: Query<T>['findOne'];

  findAround: Query<T>['findAround'];

  // __compile(kind: string, schema: Schema, gstore: Gstore): Model;

  /**
   * Creates an entity instance from a Model
   * @param data (entity data)
   * @param id
   * @param ancestors
   * @param namespace
   * @param key (gcloud entity Key)
   * @returns {Entity} Entity --> Model instance
   * @private
   */
  __model(data: EntityData, id?: IdType, ancestors?: Ancestor, namespace?: string, key?: EntityKey): Entity<T>;

  __fetchEntityByKey(key: EntityKey, transaction?: Transaction, dataloader?: any, options?: GetOptions): Promise<any>;

  __hasCache(options: { cache?: any }, type: string): boolean;

  __populate(refs?: PopulateRef[][], options?: PopulateOptions): PopulateFunction<T>;

  __hooksTransaction(transaction: Transaction, postHooks: FuncReturningPromise[]): void;

  __scopeHook(hook: string, args: GenericObject, hookName: string, hookType: 'pre' | 'post'): any;

  // __generateMeta(): GenericObject;

  // __registerHooksFromSchema(): Model;
}

/**
 * To improve performance and avoid looping over and over the entityData or Schema config
 * we generate a meta object to cache useful data used later in models and entities methods.
 */
const extractMetaFromSchema = (schema: Schema): GenericObject => {
  const meta: GenericObject = {};

  Object.keys(schema.paths).forEach(k => {
    switch (schema.paths[k].type) {
      case 'geoPoint':
        // This allows us to automatically convert valid lng/lat objects
        // to Datastore.geoPoints
        meta.geoPointsProps = meta.geoPointsProps || [];
        meta.geoPointsProps.push(k);
        break;
      case 'entityKey':
        meta.refProps = meta.refProps || {};
        meta.refProps[k] = true;
        break;
      default:
    }
  });

  return meta;
};

/**
 * Pass all the "pre" and "post" hooks from schema to
 * the current ModelInstance
 */
const registerHooksFromSchema = <T extends object>(model: Model<T>, schema: Schema): void => {
  const callQueue = schema.__callQueue.model;

  if (!Object.keys(callQueue).length) {
    return;
  }

  Object.keys(callQueue).forEach((method: string) => {
    // Add Pre hooks
    callQueue[method].pres.forEach(fn => {
      (model as any).pre(method, fn);
    });

    // Add Post hooks
    callQueue[method].post.forEach(fn => {
      (model as any).post(method, fn);
    });
  });
};

export const generateModel = <T extends object>(kind: string, schema: Schema, gstore: Gstore): Model<T> => {
  if (!schema.__meta) {
    schema.__meta = extractMetaFromSchema(schema);
  }
  const model: Model<T> = class NewModel extends Entity<T> {
    static gstore: Gstore = gstore;

    static schema: Schema = schema;

    static entityKind: string = kind;

    static __hooksEnabled = true;

    // TODO: Clean up by typing from Model interface
    // e.g. static key:Model['key] = () => { ... }
    static key<U extends IdType | IdType[], R = U extends Array<IdType> ? EntityKey[] : EntityKey>(
      ids: U,
      ancestors?: Ancestor,
      namespace?: string,
    ): R {
      const keys: EntityKey[] = [];

      let isMultiple = false;

      const getPath = (id?: IdType | null): IdType[] => {
        let path: IdType[] = [this.entityKind];

        if (typeof id !== 'undefined' && id !== null) {
          path.push(id);
        }

        if (ancestors && is.array(ancestors)) {
          path = ancestors.concat(path);
        }

        return path;
      };

      const getKey = (id?: IdType | null): EntityKey => {
        const path = getPath(id);
        let key;

        if (typeof namespace !== 'undefined' && namespace !== null) {
          key = this.gstore.ds.key({
            namespace,
            path,
          });
        } else {
          key = this.gstore.ds.key(path);
        }
        return key;
      };

      if (typeof ids !== 'undefined' && ids !== null) {
        const idsArray = arrify(ids);

        isMultiple = idsArray.length > 1;

        idsArray.forEach(id => {
          const key = getKey(id);
          keys.push(key);
        });
      } else {
        const key = getKey(null);
        keys.push(key);
      }

      return isMultiple ? ((keys as unknown) as R) : ((keys[0] as unknown) as R);
    }

    static get<U extends IdType | Array<IdType>>(
      id: U,
      ancestors?: Ancestor,
      namespace?: string,
      transaction?: Transaction,
      options: GetOptions = {},
    ): PromiseWithPopulate<U extends Array<string | number> ? Entity<T>[] : Entity<T>> {
      const ids = arrify(id);

      const key = this.key(ids, ancestors, namespace);
      const refsToPopulate: PopulateRef[][] = [];
      const { dataloader } = options;

      const onEntity = (
        entityDataFetched: EntityData<T> | EntityData<T>[],
      ): Entity<T> | null | Array<Entity<T> | null> => {
        const entityData = arrify(entityDataFetched);

        if (
          ids.length === 1 &&
          (entityData.length === 0 || typeof entityData[0] === 'undefined' || entityData[0] === null)
        ) {
          if (this.gstore.config.errorOnEntityNotFound) {
            throw new GstoreError(
              ERROR_CODES.ERR_ENTITY_NOT_FOUND,
              `${this.entityKind} { ${ids[0].toString()} } not found`,
            );
          }

          return null;
        }

        // Convert entityData to Entity instance
        const entity = (entityData as EntityData[]).map((data: EntityData) => {
          if (typeof data === 'undefined' || data === null) {
            return null;
          }
          return this.__model(data, undefined, undefined, undefined, data[this.gstore.ds.KEY as any]);
        });

        // TODO: Check if this is still useful??
        if (Array.isArray(id) && options.preserveOrder && entity.every(e => typeof e !== 'undefined' && e !== null)) {
          (entity as Entity[]).sort((a, b) => id.indexOf(a.entityKey.id) - id.indexOf(b.entityKey.id));
        }

        return Array.isArray(id) ? (entity as Entity<T>[]) : entity[0];
      };

      /**
       * If gstore has been initialize with a cache we first fetch
       * the key(s) from it.
       * gstore-cache underneath will call the "fetchHandler" with only the keys that haven't
       * been found. The final response is the merge of the cache result + the fetch.
       */
      const promise = this.__fetchEntityByKey(key, transaction, dataloader, options)
        .then(onEntity)
        .then(this.__populate(refsToPopulate, { ...options, transaction }));

      (promise as any).populate = populateFactory(refsToPopulate, promise, this.schema);

      return promise as PromiseWithPopulate<U extends Array<string | number> ? Entity<T>[] : Entity<T>>;
    }

    static update(
      id: IdType,
      data: EntityData,
      ancestors?: Ancestor,
      namespace?: string,
      transaction?: Transaction,
      options?: GenericObject,
    ): Promise<Entity<T>> {
      this.__hooksEnabled = true;

      let entityDataUpdated: Entity;
      let internalTransaction = false;

      const key = this.key(id, ancestors, namespace);
      const replace = options && options.replace === true;

      const getEntity = (): Promise<{ key: EntityKey; data: EntityData<T> }> => {
        return transaction!.get(key).then(([entityData]: [EntityData<T>]) => {
          if (typeof entityData === 'undefined') {
            throw new GstoreError(ERROR_CODES.ERR_ENTITY_NOT_FOUND, `Entity { ${id.toString()} } to update not found`);
          }

          extend(false, entityData, data);

          const result = {
            key: (entityData as any)[this.gstore.ds.KEY as any] as EntityKey,
            data: entityData,
          };

          return result;
        });
      };

      const saveEntity = (datastoreFormat: { key: EntityKey; data: EntityData }): Promise<Entity<T>> => {
        const { key: entityKey, data: entityData } = datastoreFormat;
        const entity = this.__model(entityData, undefined, undefined, undefined, entityKey);

        /**
         * If a DataLoader instance is passed in the options
         * attach it to the entity so it is available in "pre" hooks
         */
        if (options && options.dataloader) {
          entity.dataloader = options.dataloader;
        }

        return entity.save(transaction);
      };

      const onTransactionSuccess = (): Promise<Entity<T>> => {
        /**
         * Make sure to delete the cache for this key
         */
        if (this.__hasCache(options)) {
          return this.clearCache(key)
            .then(() => entityDataUpdated as Entity<T>)
            .catch(err => {
              let msg = 'Error while clearing the cache after updating the entity.';
              msg += 'The entity has been updated successfully though. ';
              msg += 'Both the cache error and the entity updated have been attached.';
              const cacheError = new Error(msg);
              (cacheError as any).__entityUpdated = entityDataUpdated;
              (cacheError as any).__cacheError = err;
              throw cacheError;
            });
        }

        return Promise.resolve(entityDataUpdated as Entity<T>);
      };

      const onEntityUpdated = (entity: Entity<T>): Promise<Entity<T>> => {
        entityDataUpdated = entity;

        if (options && options.dataloader) {
          options.dataloader.clear(key);
        }

        if (internalTransaction) {
          // If we created the Transaction instance internally for the update, we commit it
          // otherwise we leave the commit() call to the transaction creator
          return transaction!
            .commit()
            .then(() =>
              transaction!.execPostHooks().catch((err: any) => {
                (entityDataUpdated as any)[entityDataUpdated.gstore!.ERR_HOOKS] = (
                  (entityDataUpdated as any)[entityDataUpdated.gstore!.ERR_HOOKS] || []
                ).push(err);
              }),
            )
            .then(onTransactionSuccess);
        }

        return onTransactionSuccess();
      };

      const getAndUpdate = (): Promise<Entity<T>> =>
        getEntity()
          .then(saveEntity)
          .then(onEntityUpdated);

      const onUpdateError = (err: Error | Error[]): Promise<any> => {
        const error = Array.isArray(err) ? err[0] : err;
        if (internalTransaction) {
          // If we created the Transaction instance internally for the update, we rollback it
          // otherwise we leave the rollback() call to the transaction creator

          // TODO: Check why transaction!.rollback does not return a Promise by default
          return (transaction!.rollback as any)().then(() => {
            throw error;
          });
        }

        throw error;
      };

      /**
       * If options.replace is set to true we don't fetch the entity
       * and save the data directly to the specified key, overriding any previous data.
       */
      if (replace) {
        return saveEntity({ key, data })
          .then(onEntityUpdated)
          .catch(onUpdateError);
      }

      if (typeof transaction === 'undefined' || transaction === null) {
        internalTransaction = true;
        transaction = this.gstore.ds.transaction();
        return transaction
          .run()
          .then(getAndUpdate)
          .catch(onUpdateError);
      }

      if (transaction.constructor.name !== 'Transaction') {
        throw new Error('Transaction needs to be a gcloud Transaction');
      }

      return getAndUpdate();
    }

    static delete(
      id?: IdType | IdType[],
      ancestors?: Ancestor,
      namespace?: string,
      transaction?: Transaction,
      key?: EntityKey | EntityKey[],
      options: DeleteOptions = {},
    ): Promise<DeleteResponse> {
      this.__hooksEnabled = true;

      if (!key) {
        key = this.key(id!, ancestors, namespace);
      }

      if (transaction && transaction.constructor.name !== 'Transaction') {
        return Promise.reject(new Error('Transaction needs to be a gcloud Transaction'));
      }

      /**
       * If it is a transaction, we create a hooks.post array that will be executed
       * when transaction succeeds by calling transaction.execPostHooks() ---> returns a Promise
       */
      if (transaction) {
        // disable (post) hooks, to only trigger them if transaction succeeds
        this.__hooksEnabled = false;
        this.__hooksTransaction(transaction, (this as any).__posts ? (this as any).__posts.delete : undefined);
        transaction.delete(key);
        return Promise.resolve({ key: key! });
      }

      return ((this.gstore.ds.delete(key) as unknown) as Promise<any>).then((results?: [{ indexUpdates?: number }]) => {
        const response: DeleteResponse = results ? results[0] : {};
        response.key = key;

        /**
         * If we passed a DataLoader instance, we clear its cache
         */
        if (options.dataloader) {
          options.dataloader.clear(key);
        }

        if (response.indexUpdates !== undefined) {
          response.success = response.indexUpdates > 0;
        }

        /**
         * Make sure to delete the cache for this key
         */
        if (this.__hasCache(options)) {
          return this.clearCache(key!, options.clearQueries)
            .then(() => response)
            .catch(err => {
              let msg = 'Error while clearing the cache after deleting the entity.';
              msg += 'The entity has been deleted successfully though. ';
              msg += 'The cache error has been attached.';
              const cacheError = new Error(msg);
              (cacheError as any).__response = response;
              (cacheError as any).__cacheError = err;
              throw cacheError;
            });
        }

        return response;
      });
    }

    static deleteAll(ancestors?: Ancestor, namespace?: string): Promise<DeleteAllResponse> {
      const maxEntitiesPerBatch = 500;
      const timeoutBetweenBatches = 500;

      /**
       * We limit the number of entities fetched to 100.000 to avoid hang up the system when
       * there are > 1 million of entities to delete
       */
      const QUERY_LIMIT = 100000;

      let currentBatch: number;
      let totalBatches: number;
      let entities: EntityData[];

      const runQueryAndDeleteEntities = (): Promise<DeleteAllResponse> => {
        const deleteEntities = (batch: number): Promise<DeleteResponse> => {
          const onEntitiesDeleted = (): Promise<DeleteResponse> => {
            currentBatch += 1;

            if (currentBatch < totalBatches) {
              // Still more batches to process
              return new Promise((resolve): void => {
                setTimeout(resolve, timeoutBetweenBatches);
              }).then(() => deleteEntities(currentBatch));
            }

            // Re-run the fetch Query in case there are still entities to delete
            return runQueryAndDeleteEntities();
          };

          const indexStart = batch * maxEntitiesPerBatch;
          const indexEnd = indexStart + maxEntitiesPerBatch;
          const entitiesToDelete = entities.slice(indexStart, indexEnd);

          if ((this as any).__pres && {}.hasOwnProperty.call((this as any).__pres, 'delete')) {
            // We execute delete in serie (chaining Promises) --> so we call each possible pre & post hooks
            return entitiesToDelete
              .reduce(
                (promise, entity) =>
                  promise.then(() =>
                    this.delete(undefined, undefined, undefined, undefined, entity[this.gstore.ds.KEY as any]),
                  ),
                Promise.resolve(),
              )
              .then(onEntitiesDeleted);
          }

          const keys = entitiesToDelete.map(entity => entity[this.gstore.ds.KEY as any]);

          // We only need to clear the Queries from the cache once,
          // so we do it on the first batch.
          const clearQueries = currentBatch === 0;
          return this.delete(undefined, undefined, undefined, undefined, keys, { clearQueries }).then(
            onEntitiesDeleted,
          );
        };

        const onQueryResponse = (data: QueryResponse<T>): Promise<DeleteAllResponse | DeleteResponse> => {
          ({ entities } = data);

          if (entities.length === 0) {
            // No more Data in table
            return Promise.resolve({
              success: true,
              message: `All ${this.entityKind} deleted successfully.`,
            });
          }

          currentBatch = 0;

          // We calculate the total batches we will need to process
          // The Datastore does not allow more than 500 keys at once when deleting.
          totalBatches = Math.ceil(entities.length / maxEntitiesPerBatch);

          return deleteEntities(currentBatch);
        };

        // We query only limit number in case of big table
        // If we query with more than million data query will hang up
        const query = this.query(namespace);
        if (ancestors) {
          query.hasAncestor(this.gstore.ds.key(ancestors.slice()));
        }
        query.select('__key__');
        query.limit(QUERY_LIMIT);

        return query.run({ cache: false }).then(onQueryResponse);
      };

      return runQueryAndDeleteEntities();
    }

    static clearCache(keys: EntityKey | EntityKey[], clearQueries = true): Promise<{ success: boolean }> {
      const handlers = [];

      if (clearQueries) {
        handlers.push(
          this.gstore.cache!.queries.clearQueriesByKind(this.entityKind).catch(e => {
            if (e.code === 'ERR_NO_REDIS') {
              // Silently fail if no Redis Client
              return;
            }
            throw e;
          }),
        );
      }

      if (keys) {
        const keysArray = arrify(keys);
        handlers.push(this.gstore.cache!.keys.del(...keysArray));
      }

      return Promise.all(handlers).then(() => ({ success: true }));
    }

    /**
     * Dynamic properties (in non explicitOnly Schemas) are indexes by default
     * This method allows to exclude from indexes those properties if needed
     * @param properties {Array} or {String}
     * @param cb
     */
    static excludeFromIndexes(properties: string | string[]): void {
      properties = arrify(properties);

      properties.forEach(prop => {
        if (!{}.hasOwnProperty.call(this.schema.paths, prop)) {
          this.schema.path(prop, { optional: true, excludeFromIndexes: true });
        } else {
          this.schema.paths[prop].excludeFromIndexes = true;
        }
      });
    }

    /**
     * Sanitize user data before saving to Datastore
     * @param data : userData
     */
    static sanitize(
      data: GenericObject,
      options: { disabled: string[] } = { disabled: [] },
    ): { [P in keyof T]: T[P] } | GenericObject {
      const key = data[this.gstore.ds.KEY as any]; // save the Key

      if (!is.object(data)) {
        return data;
      }

      const isJoiSchema = schema.isJoi;

      let sanitized: GenericObject | undefined;
      let joiOptions: JoiConfig['options'];
      if (isJoiSchema) {
        const { error, value } = schema.validateJoi(data);
        if (!error) {
          sanitized = { ...value };
        }
        joiOptions = (schema.options.joi as JoiConfig).options || {};
      }
      if (sanitized === undefined) {
        sanitized = { ...data };
      }

      const isSchemaExplicitOnly = isJoiSchema ? joiOptions!.stripUnknown : schema.options.explicitOnly === true;

      const isWriteDisabled = options.disabled.includes('write');
      const hasSchemaRefProps = Boolean(schema.__meta.refProps);
      let schemaHasProperty;
      let isPropWritable;
      let propValue;

      Object.keys(data).forEach(k => {
        schemaHasProperty = {}.hasOwnProperty.call(schema.paths, k);
        isPropWritable = schemaHasProperty ? schema.paths[k].write !== false : true;
        propValue = sanitized![k];

        if ((isSchemaExplicitOnly && !schemaHasProperty) || (!isPropWritable && !isWriteDisabled)) {
          delete sanitized![k];
        } else if (propValue === 'null') {
          sanitized![k] = null;
        } else if (hasSchemaRefProps && schema.__meta.refProps[k] && !this.gstore.ds.isKey(propValue)) {
          // Replace populated entity by their entity Key
          if (is.object(propValue) && propValue[this.gstore.ds.KEY]) {
            sanitized![k] = propValue[this.gstore.ds.KEY];
          }
        }
      });

      return key ? { ...sanitized, [this.gstore.ds.KEY]: key } : sanitized;
    }

    // ------------------------------------
    // Private methods
    // ------------------------------------

    // static __compile<NewType extends object>(kind: string, schema: Schema, gstore: Gstore): Model<NewType> {
    //   return generateModel<NewType>(kind, schema, gstore);
    // }

    static __model(
      data: EntityData,
      id?: IdType,
      ancestors?: Ancestor,
      namespace?: string,
      key?: EntityKey,
    ): Entity<T> {
      // const NewModel = this.__compile(this.entityKind, this.schema, this.gstore);
      // return new NewModel(data, id, ancestors, namespace, key);

      // TODO: Check if this is ok
      // const NewModel = this;
      return new this(data, id, ancestors, namespace, key);
    }

    static __fetchEntityByKey(
      key: EntityKey | EntityKey[],
      transaction?: Transaction,
      dataloader?: any,
      options?: GetOptions,
    ): Promise<EntityData<T> | EntityData<T>[]> {
      const handler = (keys: EntityKey | EntityKey[]): Promise<EntityData<T> | EntityData<T>[]> => {
        const keysArray = arrify(keys);
        if (transaction) {
          if (transaction.constructor.name !== 'Transaction') {
            return Promise.reject(new Error('Transaction needs to be a gcloud Transaction'));
          }
          return transaction.get(keysArray).then(([result]) => arrify(result));
        }

        if (dataloader) {
          if (dataloader.constructor.name !== 'DataLoader') {
            return Promise.reject(
              new GstoreError(ERROR_CODES.ERR_GENERIC, 'dataloader must be a "DataLoader" instance'),
            );
          }
          return dataloader.loadMany(keysArray).then((result: EntityData) => arrify(result));
        }
        return this.gstore.ds.get(keysArray).then(([result]: [any]) => arrify(result));
      };

      if (this.__hasCache(options)) {
        return this.gstore.cache!.keys.read(
          // nsql-cache requires an array for multiple and a single key when *not* multiple
          Array.isArray(key) && key.length === 1 ? key[0] : key,
          options,
          handler,
        );
      }
      return handler(key);
    }

    /**
     * Helper to know if the cache is "on" to fetch entities or run a query
     *
     * @static
     * @private
     * @param {any} options The query options object
     * @param {string} [type='keys'] The type of fetching. Can either be 'keys' or 'queries'
     * @returns {boolean}
     */
    static __hasCache(options: { cache?: any } = {}, type = 'keys'): boolean {
      if (typeof this.gstore.cache === 'undefined') {
        return false;
      }
      if (typeof options.cache !== 'undefined') {
        return options.cache;
      }
      if (this.gstore.cache.config.global === false) {
        return false;
      }
      if (this.gstore.cache.config.ttl[type] === -1) {
        return false;
      }
      return true;
    }

    static __populate(refs?: PopulateRef[][], options: PopulateOptions = {}): PopulateFunction<T> {
      const dataloader = options.dataloader || this.gstore.createDataLoader();

      const getPopulateMetaForEntity = (
        entity: Entity | EntityData,
        entityRefs: PopulateRef[],
      ): PopulateMetaForEntity => {
        const keysToFetch: EntityKey[] = [];
        const mapKeyToPropAndSelect: { [key: string]: { ref: PopulateRef } } = {};

        const isEntityClass = entity instanceof Entity;
        entityRefs.forEach(ref => {
          const { path } = ref;
          const entityData: EntityData = isEntityClass ? entity.entityData : entity;

          const key = get(entityData, path);

          if (!key) {
            set(entityData, path, null);
            return;
          }

          if (!this.gstore.ds.isKey(key)) {
            throw new Error(`[gstore] ${path} is not a Datastore Key. Reference entity can't be fetched.`);
          }

          // Stringify the key
          const strKey = keyToString(key);
          // Add it to our map
          mapKeyToPropAndSelect[strKey] = { ref };
          // Add to our array to be fetched
          keysToFetch.push(key);
        });

        return { entity, keysToFetch, mapKeyToPropAndSelect };
      };

      const populateFn: PopulateFunction<T> = entitiesToProcess => {
        if (!refs || !refs.length || entitiesToProcess === null) {
          // Nothing to do here...
          return Promise.resolve(entitiesToProcess);
        }

        // Keep track if we provided an array for the response format
        const isArray = Array.isArray(entitiesToProcess);
        const entities = arrify(entitiesToProcess);
        const isEntityClass = entities[0] instanceof Entity;

        // Fetches the entity references at the current
        // object tree depth
        const fetchRefsEntitiesRefsAtLevel = (entityRefs: PopulateRef[]): Promise<void> => {
          // For each one of the entities to process, we gatter some meta data
          // like the keys to fetch for that entity in order to populate its refs.
          // Dataloaader will take care to only fetch unique keys on the Datastore
          const meta = (entities as Entity<T>[]).map(entity => getPopulateMetaForEntity(entity, entityRefs));

          const onKeysFetched = (
            response: EntityData[] | null,
            { entity, keysToFetch, mapKeyToPropAndSelect }: PopulateMetaForEntity,
          ): void => {
            if (!response) {
              // No keys have been fetched
              return;
            }

            const entityData = isEntityClass ? { ...entity.entityData } : entity;

            const mergeRefEntitiesToEntityData = (data: EntityData, i: number): void => {
              const key = keysToFetch[i];
              const strKey = keyToString(key);
              const {
                ref: { path, select },
              } = mapKeyToPropAndSelect[strKey];

              if (!data) {
                set(entityData, path, data);
                return;
              }

              const EmbeddedModel = this.gstore.model(key.kind);
              const embeddedEntity = new EmbeddedModel(data, undefined, undefined, undefined, key);

              // prettier-ignore
              // If "select" fields are provided, we return them,
              // otherwise we return the entity plain() json
              const json =
                select.length && !select.some(s => s === '*')
                  ? select.reduce(
                    (acc, field) => {
                      acc = {
                        ...acc,
                        [field]: data[field] || null,
                      };
                      return acc;
                    },
                      {} as { [key: string]: any }
                  )
                  : embeddedEntity.plain();

              set(entityData, path, { ...json, id: key.name || key.id });

              if (isEntityClass) {
                entity.entityData = entityData;
              }
            };

            // Loop over all dataloader.loadMany() responses
            response.forEach(mergeRefEntitiesToEntityData);
          };

          const promises = meta.map(({ keysToFetch }) =>
            keysToFetch.length
              ? (this.__fetchEntityByKey(keysToFetch, options.transaction, dataloader, options) as Promise<
                  EntityData[]
                >)
              : Promise.resolve(null),
          );

          return Promise.all(promises).then(result => {
            // Loop over all responses from dataloader.loadMany() calls
            result.forEach((res, i) => onKeysFetched(res, meta[i]));
          });
        };

        return new Promise((resolve, reject): void => {
          // At each tree level we fetch the entity references in series.
          refs
            .reduce(
              (chainedPromise, entityRefs) => chainedPromise.then(() => fetchRefsEntitiesRefsAtLevel(entityRefs)),
              Promise.resolve(),
            )
            .then(() => {
              resolve(isArray ? entities : entities[0]);
            })
            .catch(reject);
        });
      };

      return populateFn;
    }

    /**
     * Add "post" hooks to a transaction
     */
    static __hooksTransaction(transaction: Transaction, postHooks: FuncReturningPromise[]): void {
      const _this = this; // eslint-disable-line @typescript-eslint/no-this-alias
      postHooks = arrify(postHooks);

      if (!{}.hasOwnProperty.call(transaction, 'hooks')) {
        transaction.hooks = {
          post: [],
        };
      }

      transaction.hooks.post = [...transaction.hooks.post, ...postHooks];

      transaction.execPostHooks = function executePostHooks(): Promise<any> {
        return (this.hooks.post as FuncReturningPromise[]).reduce(
          (promise, hook) => promise.then(hook.bind(_this)),
          Promise.resolve() as Promise<any>,
        );
      };
    }

    /**
     * Helper to change the function scope for a hook if necessary
     * This is called by the promised-hooks lib....
     *
     * TODO: Refactor this (in promised hookd) to make it explicit that the handler is being called
     *
     * @param {String} hook The name of the hook (save, delete...)
     * @param {Array} args The arguments passed to the original method
     */
    static __scopeHook(hook: string, args: GenericObject, hookName: string, hookType: 'pre' | 'post'): any {
      const _this = this; // eslint-disable-line @typescript-eslint/no-this-alias

      /**
       * For "delete" hooks we want to set the scope to
       * the entity instance we are going to delete
       * We won't have any entity data inside the entity but, if needed,
       * we can then call the "datastoreEntity()" helper on the scope (this)
       * from inside the hook.
       * For "multiple" ids to delete, we obviously can't set any scope.
       */
      const getScopeForDeleteHooks = (): any => {
        const id =
          is.object(args[0]) && {}.hasOwnProperty.call(args[0], '__override') ? arrify(args[0].__override)[0] : args[0];

        if (is.array(id)) {
          return null;
        }

        let ancestors;
        let namespace;
        let key;

        if (hookType === 'post') {
          ({ key } = args);
          if (is.array(key)) {
            return null;
          }
        } else {
          ({ 1: ancestors, 2: namespace, 4: key } = args);
        }

        if (!id && !ancestors && !namespace && !key) {
          return undefined;
        }

        return _this.__model({}, id, ancestors, namespace, key);
      };

      switch (hook) {
        case 'delete':
          return getScopeForDeleteHooks();
        default:
          return this;
      }
    }

    // -----------------------------------------------------------
    // Other properties and methods attached to the Model Class
    // -----------------------------------------------------------

    static pre: any; // Is added below when wrapping with hooks

    static post: any; // Is added below when wrapping with hooks

    static query: any; // Is added below from the Query instance

    static findOne: any; // Is added below from the Query instance

    static list: any; // Is added below from the Query instance

    static findAround: any; // Is added below from the Query instance
  };

  // Wrap the Model to add "pre" and "post" hooks functionalities
  hooks.wrap(model);
  registerHooksFromSchema(model, schema);

  const query = new Query<T>(model);
  const { initQuery, list, findOne, findAround } = query;

  model.query = initQuery;
  model.list = list;
  model.findOne = findOne;
  model.findAround = findAround;

  return model;
};

interface GetOptions {
  /**
   * If you have provided an Array of ids, the order returned by the Datastore is not guaranteed.
   * If you need the entities back in the same order of the IDs provided, then set `preserveOrder: true`
   *
   * @type {boolean}
   * @default false
   */
  preserveOrder?: boolean;
  /**
   * An optional Dataloader instance.
   *
   * @type {*}
   * @link https://sebloix.gitbook.io/gstore-node/dataloader.html#dataloader
   */
  dataloader?: any;
  /**
   * Only if the cache has been activated.
   * Fetch the entity from the cache first.
   * If you want to bypass the cache and go to the Datastore directly, set `cache: false`.
   *
   * @type {boolean}
   * @default The "global" cache configuration
   * @link https://sebloix.gitbook.io/gstore-node/cache.html
   */
  cache?: boolean;
  /**
   * Only if the cache has been activated.
   * After the entty has been fetched from the Datastore it will be added to the cache.
   * You can specify here a custom ttl (Time To Live) for the entity.
   *
   * @type {(number | { [propName: string] : number })}
   * @default The "ttl.keys" cache configuration
   * @link https://sebloix.gitbook.io/gstore-node/cache.html
   */
  ttl?: number | { [propName: string]: number };
}

interface DeleteOptions {
  dataloader?: any;
  cache?: any;
  clearQueries?: boolean;
}

interface DeleteResponse {
  key?: EntityKey | EntityKey[];
  success?: boolean;
  apiResponse?: any;
  indexUpdates?: number;
}

interface DeleteAllResponse {
  success: boolean;
  message: string;
}

interface PopulateOptions extends GetOptions {
  transaction?: Transaction;
}

export default Model;
