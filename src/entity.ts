import is from 'is';
import hooks from 'promised-hooks';
import arrify from 'arrify';
import { Transaction } from '@google-cloud/datastore';
import DataLoader from 'dataloader';

import defaultValues from './helpers/defaultValues';
import helpers from './helpers';
import Gstore from './index';
import Schema, { SchemaPathDefinition } from './schema';
import Model from './model';
import { datastoreSerializer } from './serializers';
import { ERROR_CODES, ValidationError } from './errors';
import {
  EntityKey,
  EntityData,
  IdType,
  Ancestor,
  GenericObject,
  DatastoreSaveMethod,
  PopulateRef,
  PromiseWithPopulate,
} from './types';
import { ValidateResponse } from './helpers/validation';
import { PopulateHandler } from './helpers/populateHelpers';

const { validation, populateHelpers } = helpers;
const { populateFactory } = populateHelpers;

export class Entity<T extends object = GenericObject> {
  /* The entity Key */
  public entityKey: EntityKey;

  /* The entity data */
  public entityData: { [P in keyof T]: T[P] } = {} as any;

  /**
   * If you provided a dataloader instance when saving the entity, it will
   * be added as property. You will then have access to it in your "pre" save() hooks.
   */
  public dataloader: DataLoader<EntityKey[], EntityData> | undefined;

  public context: GenericObject;

  public __gstore: Gstore | undefined; // Added when creating the Model

  public __schema: Schema<T> | undefined; // Added when creating the Model

  public __entityKind: string | undefined; // Added when creating the Model

  public __className: string;

  public __excludeFromIndexes: { [P in keyof T]?: string[] };

  public __hooksEnabled = true;

  constructor(data?: EntityData<T>, id?: IdType, ancestors?: Ancestor, namespace?: string, key?: EntityKey) {
    this.__className = 'Entity';

    this.__excludeFromIndexes = {};

    /**
     * Object to store custom data for the entity.
     * In some cases we might want to add custom data onto the entity
     * and as Typescript won't allow random properties to be added, this
     * is the place to add data based on the context.
     */
    this.context = {};

    if (key) {
      if (!this.gstore.ds.isKey(key)) {
        throw new Error('Entity Key must be a Datastore Key');
      }
      this.entityKey = key;
    } else {
      this.entityKey = this.__createKey(id, ancestors, namespace);
    }

    // create entityData from data provided
    this.__buildEntityData(data || {});

    this.__addAliasAndVirtualProperties();

    this.__addCustomMethodsFromSchema();

    // Wrap entity with hook "pre" and "post" methods
    hooks.wrap(this);

    // Add the middlewares defined on the Schena
    this.__registerHooksFromSchema();
  }

  /**
   * Save the entity in the Datastore
   *
   * @param {Transaction} transaction The optional transaction to save the entity into
   * @param options Additional configuration
   * @returns {Promise<Entity<T>>}
   * @link https://sebloix.gitbook.io/gstore-node/entity/methods/save
   */
  save(transaction?: Transaction, opts?: SaveOptions): Promise<EntityResponse<T>> {
    this.__hooksEnabled = true;

    const options = {
      method: 'upsert' as DatastoreSaveMethod,
      sanitizeEntityData: true,
      ...opts,
    } as SaveOptions;

    // ------------------------ HANDLERS ---------------------------------
    // -------------------------------------------------------------------

    const validateEntityData = (): Partial<ValidateResponse> => {
      if (this.schema.options.validateBeforeSave) {
        return this.validate();
      }

      return { error: null };
    };

    const validateMethod = (method: DatastoreSaveMethod): { error: Error | null } => {
      const allowed: { [key: string]: boolean } = {
        update: true,
        insert: true,
        upsert: true,
      };

      return !allowed[method]
        ? { error: new Error('Method must be either "update", "insert" or "upsert"') }
        : { error: null };
    };

    const validateDataAndMethod = (): { error: ValidationError | Error | null } => {
      const { error: entityDataError } = validateEntityData();
      let methodError: Error | null;
      if (!entityDataError) {
        ({ error: methodError } = validateMethod(options.method!));
      }

      return { error: entityDataError || methodError! };
    };

    const onEntitySaved = (): Promise<EntityResponse<T>> => {
      /**
       * Make sure to clear the cache for this Entity Kind
       */
      if ((this.constructor as Model).__hasCache(options)) {
        return (this.constructor as Model)
          .clearCache()
          .then(() => (this as unknown) as EntityResponse<T>)
          .catch((err: any) => {
            let msg = 'Error while clearing the cache after saving the entity.';
            msg += 'The entity has been saved successfully though. ';
            msg += 'Both the cache error and the entity saved have been attached.';
            const cacheError = new Error(msg);
            (cacheError as any).__entity = this;
            (cacheError as any).__cacheError = err;
            throw cacheError;
          });
      }

      return Promise.resolve((this as unknown) as EntityResponse<T>);
    };

    /**
     * If it is a transaction, we create a hooks.post array that will be executed
     * when transaction succeeds by calling transaction.execPostHooks() (returns a Promises)
     */
    const attachPostHooksToTransaction = (): void => {
      // Disable the "post" hooks as we will only run them after the transaction succcees
      this.__hooksEnabled = false;
      (this.constructor as Model).__hooksTransaction.call(
        this,
        transaction!,
        (this as any).__posts ? (this as any).__posts.save : undefined,
      );
    };

    // ------------------------ END HANDLERS --------------------------------

    if (options.sanitizeEntityData) {
      // this.entityData = (this.constructor as Model<T>).sanitize.call(this.constructor, this.entityData, {
      this.entityData = (this.constructor as Model<T>).sanitize.call(this.constructor, this.entityData, {
        disabled: ['write'],
      });
    }

    const { error } = validateDataAndMethod();
    if (error) {
      return Promise.reject(error);
    }

    this.__serializeEntityData();

    const datastoreEntity = datastoreSerializer.toDatastore(this);
    datastoreEntity.method = options.method;

    if (transaction) {
      if (transaction.constructor.name !== 'Transaction') {
        return Promise.reject(new Error('Transaction needs to be a gcloud Transaction'));
      }

      attachPostHooksToTransaction();
      transaction.save(datastoreEntity);

      return Promise.resolve((this as unknown) as EntityResponse<T>);
    }

    return this.gstore.ds.save(datastoreEntity).then(onEntitySaved);
  }

  /**
   * Validate the entity data. It returns an object with an `error` and a `value` property.
   * If the error is `null`, the validation has passed.
   * The `value` returned is the entityData sanitized (unknown properties removed).
   *
   * @link https://sebloix.gitbook.io/gstore-node/entity/methods/validate
   */
  validate(): ValidateResponse {
    const { entityData, schema, entityKind, gstore } = this;

    return validation.validate(entityData, schema, entityKind, gstore.ds);
  }

  /**
   * Returns a JSON object of the entity data along with the entity id/name.
   * The properties on the Schema where "read" has been set to "false" won't be added
   * unless `readAll: true` is passed in the options.
   *
   * @param options Additional configuration
   * @link https://sebloix.gitbook.io/gstore-node/entity/methods/plain
   */
  plain(options: PlainOptions | undefined = {}): Partial<EntityData<T>> {
    if (!is.object(options)) {
      throw new Error('Options must be an Object');
    }
    const readAll = !!options.readAll || false;
    const virtuals = !!options.virtuals || false;
    const showKey = !!options.showKey || false;

    if (virtuals) {
      // Add any possible virtual properties to the object
      this.entityData = this.__getEntityDataWithVirtuals();
    }

    const data = datastoreSerializer.fromDatastore(this.entityData, this.constructor as Model, {
      readAll,
      showKey,
    });

    return data;
  }

  get<P extends keyof T>(path: P): any {
    if ({}.hasOwnProperty.call(this.schema.__virtuals, path)) {
      return this.schema.__virtuals[path as string].applyGetters(this.entityData);
    }
    return this.entityData[path];
  }

  set<P extends keyof T>(path: P, value: any): EntityResponse<T> {
    if ({}.hasOwnProperty.call(this.schema.__virtuals, path)) {
      this.schema.__virtuals[path as string].applySetters(value, this.entityData);
      return (this as unknown) as EntityResponse<T>;
    }

    this.entityData[path] = value;
    return (this as unknown) as EntityResponse<T>;
  }

  /**
   * Access any gstore Model from the entity instance.
   *
   * @param {string} entityKind The entity kind
   * @returns {Model} The Model
   * @example
  ```
  const user = new User({ name: 'john', pictId: 123});
  const ImageModel = user.model('Image');
  ImageModel.get(user.pictId).then(...);
  ```
   * @link https://sebloix.gitbook.io/gstore-node/entity/methods/model
   */
  model(name: string): Model {
    return this.gstore.model(name);
  }

  // TODO: Rename this function "fetch" (and create alias to this for backward compatibility)
  /**
   * Fetch entity from Datastore
   *
   * @link https://sebloix.gitbook.io/gstore-node/entity/methods/datastoreentity
   */
  datastoreEntity(options = {}): Promise<EntityResponse<T> | null> {
    const onEntityFetched = (result: [EntityData<T> | null]): EntityResponse<T> | null => {
      const entityData = result ? result[0] : null;

      if (!entityData) {
        if (this.gstore.config.errorOnEntityNotFound) {
          const error = new Error('Entity not found');
          (error as any).code = ERROR_CODES.ERR_ENTITY_NOT_FOUND;
          throw error;
        }

        return null;
      }

      this.entityData = entityData;
      return (this as unknown) as EntityResponse<T>;
    };

    if ((this.constructor as Model<T>).__hasCache(options)) {
      return this.gstore.cache!.keys.read(this.entityKey, options).then(onEntityFetched);
    }
    return this.gstore.ds.get(this.entityKey).then(onEntityFetched);
  }

  /**
   * Populate entity references (whose properties are an entity Key) and merge them in the entity data.
   *
   * @param refs The entity references to fetch from the Datastore. Can be one (string) or multiple (array of string)
   * @param properties The properties to return from the reference entities. If not specified, all properties will be returned
   * @link https://sebloix.gitbook.io/gstore-node/entity/methods/populate
   */
  populate<U extends string | string[]>(
    path?: U,
    propsToSelect?: U extends Array<string> ? never : string | string[],
  ): PromiseWithPopulate<EntityResponse<T>> {
    const refsToPopulate: PopulateRef[][] = [];

    const promise = Promise.resolve(this).then((this.constructor as Model<T>).__populate(refsToPopulate));

    ((promise as any).populate as PopulateHandler) = populateFactory(refsToPopulate, promise, this.schema);
    ((promise as any).populate as PopulateHandler)(path, propsToSelect);
    return promise as any;
  }

  get id(): string | number {
    return this.entityKey.id || this.entityKey.name!;
  }

  /**
   * The gstore instance
   */
  get gstore(): Gstore {
    if (this.__gstore === undefined) {
      throw new Error('No gstore instance attached to entity');
    }
    return this.__gstore;
  }

  /**
   * The entity Model Schema
   */
  get schema(): Schema<T> {
    if (this.__schema === undefined) {
      throw new Error('No schema instance attached to entity');
    }
    return this.__schema;
  }

  /**
   * The Datastore entity kind
   */
  get entityKind(): string {
    if (this.__entityKind === undefined) {
      throw new Error('No entity kind attached to entity');
    }
    return this.__entityKind;
  }

  __buildEntityData(data: GenericObject): void {
    const { schema } = this;
    const isJoiSchema = schema.isJoi;

    // If Joi schema, get its default values
    if (isJoiSchema) {
      const { error, value } = schema.validateJoi(data);

      if (!error) {
        this.entityData = { ...value };
      }
    }

    this.entityData = { ...this.entityData, ...data };

    let isArray;
    let isObject;

    Object.entries(schema.paths as { [k: string]: SchemaPathDefinition }).forEach(([key, prop]) => {
      const hasValue = {}.hasOwnProperty.call(this.entityData, key);
      const isOptional = {}.hasOwnProperty.call(prop, 'optional') && prop.optional !== false;
      const isRequired = {}.hasOwnProperty.call(prop, 'required') && prop.required === true;

      // Set Default Values
      if (!isJoiSchema && !hasValue && !isOptional) {
        let value = null;

        if ({}.hasOwnProperty.call(prop, 'default')) {
          if (typeof prop.default === 'function') {
            value = prop.default();
          } else {
            value = prop.default;
          }
        }

        if ({}.hasOwnProperty.call(defaultValues.__map__, value)) {
          /**
           * If default value is in the gstore.defaultValue hashTable
           * then execute the handler for that shortcut
           */
          value = defaultValues.__handler__(value);
        } else if (value === null && {}.hasOwnProperty.call(prop, 'values') && !isRequired) {
          // Default to first value of the allowed values if **not** required
          [value] = prop.values as any[];
        }

        this.entityData[key as keyof T] = value;
      }

      // Set excludeFromIndexes
      // ----------------------
      isArray = prop.type === Array || (prop.joi && prop.joi._type === 'array');
      isObject = prop.type === Object || (prop.joi && prop.joi._type === 'object');

      if (prop.excludeFromIndexes === true) {
        if (isArray) {
          // We exclude both the array values + all the child properties of object items
          this.__excludeFromIndexes[key as keyof T] = [`${key}[]`, `${key}[].*`];
        } else if (isObject) {
          // We exclude the emmbeded entity + all its properties
          this.__excludeFromIndexes[key as keyof T] = [key, `${key}.*`];
        } else {
          this.__excludeFromIndexes[key as keyof T] = [key];
        }
      } else if (prop.excludeFromIndexes !== false) {
        const excludedArray = arrify(prop.excludeFromIndexes) as string[];
        if (isArray) {
          // The format to exclude a property from an embedded entity inside
          // an array is: "myArrayProp[].embeddedKey"
          this.__excludeFromIndexes[key as keyof T] = excludedArray.map(propExcluded => `${key}[].${propExcluded}`);
        } else if (isObject) {
          // The format to exclude a property from an embedded entity
          // is: "myEmbeddedEntity.key"
          this.__excludeFromIndexes[key as keyof T] = excludedArray.map(propExcluded => `${key}.${propExcluded}`);
        }
      }
    });

    // add Symbol Key to the entityData
    (this.entityData as any)[this.gstore.ds.KEY] = this.entityKey;
  }

  __createKey(id?: IdType, ancestors?: Ancestor, namespace?: string): EntityKey {
    if (id && !is.number(id) && !is.string(id)) {
      throw new Error('id must be a string or a number');
    }

    const hasAncestors = typeof ancestors !== 'undefined' && ancestors !== null && is.array(ancestors);

    let path: (string | number)[] = hasAncestors ? [...ancestors!] : [];

    if (id) {
      path = [...path, this.entityKind, id];
    } else {
      path.push(this.entityKind);
    }

    return namespace ? this.gstore.ds.key({ namespace, path }) : this.gstore.ds.key(path);
  }

  __addAliasAndVirtualProperties(): void {
    const { schema } = this;

    // Create virtual properties (getters and setters for entityData object)
    Object.keys(schema.paths)
      .filter(pathKey => ({}.hasOwnProperty.call(schema.paths, pathKey)))
      .forEach(pathKey =>
        Object.defineProperty(this, pathKey, {
          get: function getProp() {
            return this.entityData[pathKey];
          },
          set: function setProp(newValue) {
            this.entityData[pathKey] = newValue;
          },
        }),
      );

    // Create virtual properties (getters and setters for "virtuals" defined on the Schema)

    Object.keys(schema.__virtuals)
      .filter(key => ({}.hasOwnProperty.call(schema.__virtuals, key)))
      .forEach(key =>
        Object.defineProperty(this, key, {
          get: function getProp() {
            return schema.__virtuals[key].applyGetters({ ...this.entityData });
          },
          set: function setProp(newValue) {
            schema.__virtuals[key].applySetters(newValue, this.entityData);
          },
        }),
      );
  }

  __registerHooksFromSchema(): Entity<T> {
    const callQueue = this.schema.__callQueue.entity;

    if (!Object.keys(callQueue).length) {
      return this;
    }

    Object.keys(callQueue).forEach(method => {
      if (!(this as any)[method]) {
        return;
      }

      // Add Pre hooks
      callQueue[method].pres.forEach(fn => {
        (this as any).pre(method, fn);
      });

      // Add Pre hooks
      callQueue[method].post.forEach(fn => {
        (this as any).post(method, fn);
      });
    });

    return this;
  }

  __addCustomMethodsFromSchema(): void {
    Object.entries(this.schema.methods).forEach(([method, handler]) => {
      (this as any)[method] = handler;
    });
  }

  __getEntityDataWithVirtuals(): EntityData<T> & { [key: string]: any } {
    const { __virtuals } = this.schema;
    const entityData: EntityData<T> & { [key: string]: any } = { ...this.entityData };

    Object.keys(__virtuals).forEach(k => {
      if ({}.hasOwnProperty.call(entityData, k)) {
        __virtuals[k].applySetters(entityData[k], entityData);
      } else {
        __virtuals[k].applyGetters(entityData);
      }
    });

    return entityData;
  }

  /**
   * Process some basic formatting to the entity data before save
   * - automatically set the modifiedOn property to current date (if the property exists on schema)
   * - convert object with latitude/longitude to Datastore GeoPoint
   */
  __serializeEntityData(): void {
    /**
     * If the schema has a "modifiedOn" property we automatically
     * update its value to the current dateTime
     */
    if ({}.hasOwnProperty.call(this.schema.paths, 'modifiedOn')) {
      (this.entityData as any).modifiedOn = new Date();
    }

    /**
     * If the entityData has 'geoPoint' property(ies)
     * and its value is an object with "latitude" and "longitude"
     * we convert it to a datastore GeoPoint.
     */
    if ({}.hasOwnProperty.call(this.schema.__meta, 'geoPointsProps')) {
      this.schema.__meta.geoPointsProps.forEach((property: string) => {
        const propValue = (this.entityData as any)[property];
        if (
          {}.hasOwnProperty.call(this.entityData, property) &&
          propValue !== null &&
          propValue.constructor.name !== 'GeoPoint'
        ) {
          (this.entityData as any)[property] = this.gstore.ds.geoPoint(propValue);
        }
      });
    }

    if ({}.hasOwnProperty.call(this.schema.__meta, 'dateProps')) {
      this.schema.__meta.dateProps.forEach((property: string) => {
        const propValue = (this.entityData as any)[property];
        if (
          {}.hasOwnProperty.call(this.entityData, property) &&
          propValue !== null &&
          propValue instanceof Date === false
        ) {
          (this.entityData as any)[property] = new Date(propValue);
        }
      });
    }
  }
}

export default Entity;

export type EntityResponse<T extends object> = Entity<T> & T;

interface SaveOptions {
  method?: DatastoreSaveMethod;
  sanitizeEntityData?: boolean;
  cache?: any;
}

interface PlainOptions {
  /**
   * Output all the entity data properties, regardless of the Schema `read` setting.
   *
   * @type {boolean}
   * @default false
   */
  readAll?: boolean;
  /**
   * Add the _virtual_ properties defined for the entity on the Schema.
   *
   * @type {boolean}
   * @default false
   * @link https://sebloix.gitbook.io/gstore-node/schema/methods/virtual
   */
  virtuals?: boolean;
  /**
   * Add the full entity _Key_ object at the a "__key" property
   *
   * @type {boolean}
   * @default false
   */
  showKey?: boolean;
}
