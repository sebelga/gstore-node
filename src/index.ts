/* eslint-disable prefer-template, max-classes-per-file */

import is from 'is';

import extend from 'extend';
import hooks from 'promised-hooks';
import NsqlCache, { NsqlCacheConfig } from 'nsql-cache';
import dsAdapter from 'nsql-cache-datastore';
import DataLoader from 'dataloader'; // eslint-disable-line import/no-extraneous-dependencies
import { Datastore, Transaction } from '@google-cloud/datastore';

import pkg from '../package.json';
import Schema from './schema';
import Entity from './entity';
import Model, { generateModel } from './model';
import defaultValues, { DefaultValues } from './helpers/defaultValues';
import { GstoreError, ValidationError, TypeError, ValueError, ERROR_CODES } from './errors';
import { Datastore as datastoreSerializer } from './serializer';
import { createDataLoader } from './dataloader';
import { EntityKey, EntityData } from './types';

interface CacheConfig {
  stores: any[];
  config: NsqlCacheConfig;
}

interface GstoreConfig {
  cache?: boolean | CacheConfig;
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

class Gstore {
  /**
   * Map of Gstore Model created
   */
  public models: { [key: string]: Model<any> };

  /**
   * Alias to Schema class
   */
  public Schema: typeof Schema;

  public config: GstoreConfig;

  /**
   * The underlying gstore-cache instance
   *
   * @type {GstoreCache}
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

  public __ds: Datastore | null = null;

  public __defaultValues: DefaultValues;

  public __pkgVersion: string;

  constructor(config = {}) {
    if (!is.object(config)) {
      throw new Error('Gstore config must be an object.');
    }

    this.models = {};
    this.config = { ...DEFAULT_GSTORE_CONFIG, ...config };
    this.Schema = Schema;
    this.__defaultValues = defaultValues;
    this.__pkgVersion = pkg.version;

    this.errors = {
      GstoreError,
      ValidationError,
      TypeError,
      ValueError,
      codes: ERROR_CODES,
    };

    this.ERR_HOOKS = hooks.ERRORS;
  }

  model<T extends object>(entityKind: string, schema?: Schema<T>): Model<T> {
    // We might be passing a different schema for
    // an existing model entityKind. in this case warn the user,
    if (this.models[entityKind]) {
      if (schema instanceof Schema && schema !== this.models[entityKind].schema) {
        throw new Error(`Trying to override ${entityKind} Model Schema`);
      }
      return this.models[entityKind];
    }

    if (!schema) {
      throw new Error('A Schema needs to be provided to create a Model.');
    }

    const model = generateModel<T>(entityKind, schema, this);

    this.models[entityKind] = model;

    return this.models[entityKind];
  }

  /**
   * Alias to gcloud datastore Transaction method
   */
  transaction(): Transaction {
    return this.__ds!.transaction();
  }

  /**
   * Return an array of model names created on this instance of Gstore
   * @returns {Array}
   */
  modelNames(): string[] {
    const names = Object.keys(this.models);
    return names;
  }

  save(
    entities: Entity | Entity[],
    transaction?: Transaction,
    options: { method?: 'upsert' | 'insert' | 'update'; validate?: boolean } | undefined = {},
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

    /**
     * Validate entities before saving
     */
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
    return this.__ds!.save(entitiesSerialized);
  }

  // Connect to Google Datastore instance
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

  createDataLoader(): DataLoader<EntityKey[], EntityData> {
    return createDataLoader(this.ds);
  }

  /**
   * Expose the defaultValues constants
   */
  get defaultValues(): DefaultValues {
    return this.__defaultValues;
  }

  get version(): string {
    return this.__pkgVersion;
  }

  get ds(): Datastore {
    return this.__ds!;
  }
}

export const instances = {
  __refs: new Map<string, Gstore>(),
  get(id: string): Gstore {
    const instance = this.__refs.get(id);
    if (!instance) {
      throw new Error(`Could not find gstore instance with id "${id}"`);
    }
    return instance;
  },
  set(id: string, instance: Gstore): void {
    this.__refs.set(id, instance);
  },
};

export default Gstore;
