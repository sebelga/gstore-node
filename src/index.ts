import is from 'is';
import extend from 'extend';
import hooks from 'promised-hooks';
import NsqlCache, { NsqlCacheConfig } from 'nsql-cache';
import dsAdapter from 'nsql-cache-datastore';
import DataLoader from 'dataloader';
import { Datastore, Transaction } from '@google-cloud/datastore';
// import pkg from '../package.json';
import Schema from './schema';
import Entity from './entity';
import Model, { generateModel } from './model';
import defaultValues, { DefaultValues } from './helpers/defaultValues';
import { GstoreError, ValidationError, TypeError, ValueError, ERROR_CODES } from './errors';
import { datastoreSerializer } from './serializers';
import { createDataLoader } from './dataloader';
import { EntityKey, EntityData, DatastoreSaveMethod } from './types';

interface CacheConfig {
  stores: any[];
  config: NsqlCacheConfig;
}

interface GstoreConfig {
  cache?: boolean | CacheConfig;
  /**
   * If set to `true` (defaut), when fetching an entity by key and the entity is not found in the Datastore,
   * gstore will throw an `"ERR_ENTITY_NOT_FOUND"` error.
   * If set to `false`, `null` will be returned
   */
  errorOnEntityNotFound: boolean;
}
const DEFAULT_GSTORE_CONFIG = {
  cache: undefined,
  errorOnEntityNotFound: true,
};

const DEFAULT_CACHE_SETTINGS = {
  config: {
    wrapClient: false,
  },
};

export class Gstore {
  /**
   * Map of Gstore Model created
   */
  public models: { [key: string]: Model<any> };

  /**
   * Gstore Schema class
   */
  public Schema: typeof Schema;

  /**
   * Gstore instance configuration
   */
  public config: GstoreConfig;

  /**
   * The underlying gstore-cache instance
   */
  public cache: NsqlCache | undefined;

  /**
   * The symbol to access possible errors thrown
   * in a "post" hooks
   */
  public ERR_HOOKS: symbol;

  public errors: {
    GstoreError: typeof GstoreError;
    ValidationError: typeof ValidationError;
    TypeError: typeof TypeError;
    ValueError: typeof ValueError;
    codes: typeof ERROR_CODES;
  };

  public __ds: Datastore | undefined;

  public __defaultValues: DefaultValues;

  public __pkgVersion = '7.1.0'; // TODO Fix this!

  constructor(config = {}) {
    if (!is.object(config)) {
      throw new Error('Gstore config must be an object.');
    }

    this.models = {};
    this.config = { ...DEFAULT_GSTORE_CONFIG, ...config };
    this.Schema = Schema;
    this.__defaultValues = defaultValues;
    // this.__pkgVersion = pkg.version;

    this.errors = {
      GstoreError,
      ValidationError,
      TypeError,
      ValueError,
      codes: ERROR_CODES,
    };

    this.ERR_HOOKS = hooks.ERRORS;
  }

  /**
   * Initalize a gstore-node Model
   *
   * @param {string} entityKind The Google Entity Kind
   * @param {Schema} schema A gstore schema instance
   * @returns {Model} A gstore Model
   */
  model<T extends object, M extends object>(entityKind: string, schema?: Schema<T, M>): Model<T, M> {
    if (this.models[entityKind]) {
      // Don't allow overriding Model schema
      if (schema instanceof Schema && schema !== undefined) {
        throw new Error(`Trying to override ${entityKind} Model Schema`);
      }
      return this.models[entityKind];
    }

    if (!schema) {
      throw new Error('A Schema needs to be provided to create a Model.');
    }

    const model = generateModel<T, M>(entityKind, schema, this);

    this.models[entityKind] = model;

    return this.models[entityKind];
  }

  /**
   * Initialize a @google-cloud/datastore Transaction
   */
  transaction(): Transaction {
    return this.ds.transaction();
  }

  /**
   * Return an array of model names created on this instance of Gstore
   * @returns {Array}
   */
  modelNames(): string[] {
    const names = Object.keys(this.models);
    return names;
  }

  /**
   * Alias to the underlying @google-cloud/datastore `save()` method
   * but instead of passing entity _keys_ this methods accepts one or multiple gstore **_entity_** instance(s).
   *
   * @param {(Entity | Entity[])} entity The entity(ies) to delete (any Entity Kind). Can be one or many (Array).
   * @param {Transaction} [transaction] An Optional transaction to save the entities into
   * @returns {Promise<any>}
   * @link https://sebloix.gitbook.io/gstore-node/gstore-methods/save
   */
  save(
    entities: Entity | Entity[],
    transaction?: Transaction,
    options: { method?: DatastoreSaveMethod; validate?: boolean } | undefined = {},
  ): Promise<
    [
      {
        mutationResults?: any;
        indexUpdates?: number | null;
      },
    ]
  > {
    if (!entities) {
      throw new Error('No entities passed');
    }

    // Validate entities before saving
    if (options.validate) {
      let error;
      const validateEntity = (entity: Entity): void => {
        ({ error } = entity.validate());
        if (error) {
          throw error;
        }
      };
      try {
        if (Array.isArray(entities)) {
          entities.forEach(validateEntity);
        } else {
          validateEntity(entities);
        }
      } catch (err) {
        return Promise.reject(err);
      }
    }

    // Convert gstore entities to datastore forma ({key, data})
    const entitiesSerialized = datastoreSerializer.entitiesToDatastore(entities, options);

    if (transaction) {
      return transaction.save(entitiesSerialized);
    }

    // We forward the call to google-datastore
    return this.ds.save(entitiesSerialized);
  }

  /**
   * Connect gstore node to the Datastore instance
   *
   * @param {Datastore} datastore A Datastore instance
   */
  connect(datastore: Datastore): void {
    if (!datastore.constructor || datastore.constructor.name !== 'Datastore') {
      throw new Error('No @google-cloud/datastore instance provided.');
    }

    this.__ds = datastore;

    if (this.config.cache) {
      const cacheSettings =
        this.config.cache === true
          ? extend(true, {}, DEFAULT_CACHE_SETTINGS)
          : extend(true, {}, DEFAULT_CACHE_SETTINGS, this.config.cache);

      const { stores, config } = cacheSettings as CacheConfig;

      const db = dsAdapter(datastore);
      this.cache = new NsqlCache({ db, stores, config });
      delete this.config.cache;
    }
  }

  /**
   * Create a DataLoader instance.
   * Follow the link below for more info about Dataloader.
   *
   * @returns {DataLoader} The DataLoader instance
   * @link https://sebloix.gitbook.io/gstore-node/cache-dataloader/dataloader
   */
  createDataLoader(): DataLoader<EntityKey[], EntityData> {
    return createDataLoader(this.ds);
  }

  /**
   * Default values for schema properties
   */
  get defaultValues(): DefaultValues {
    return this.__defaultValues;
  }

  get version(): string {
    return this.__pkgVersion;
  }

  /**
   * The unerlying google-cloud Datastore instance
   */
  get ds(): Datastore {
    if (this.__ds === undefined) {
      throw new Error('Trying to access Datastore instance but none was provided.');
    }
    return this.__ds;
  }
}

export const instances = {
  __refs: new Map<string, Gstore>(),
  /**
   * Retrieve a previously saved gstore instance.
   *
   * @param id The instance id
   */
  get(id: string): Gstore {
    const instance = this.__refs.get(id);
    if (!instance) {
      throw new Error(`Could not find gstore instance with id "${id}"`);
    }
    return instance;
  },
  /**
   * Save a gstore instance.
   *
   * @param id A unique name for the gstore instance
   * @param instance A gstore instance
   */
  set(id: string, instance: Gstore): void {
    this.__refs.set(id, instance);
  },
};

export { QUERIES_FORMATS } from './constants';

export default Gstore;
