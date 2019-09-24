import optional from 'optional';
import extend from 'extend';
import is from 'is';

// TODO: Open PR in @google-cloud repo to expose those types
import { Operator } from '@google-cloud/datastore/build/src/query';

import { QUERIES_FORMATS } from './constants';
import VirtualType from './virtualType';
import { ValidationError, ERROR_CODES } from './errors';
import { FunctionType, FuncReturningPromise, CustomEntityFunction, GenericObject } from './types';

const Joi = optional('@hapi/joi') || optional('joi');

type EntityFormatType = 'ENTITY';
type JSONFormatType = 'JSON';

const IS_QUERY_HOOK: { [key: string]: boolean } = {
  update: true,
  delete: true,
  findOne: true,
};

const DEFAULT_OPTIONS = {
  validateBeforeSave: true,
  explicitOnly: true,
  excludeLargeProperties: false,
  queries: {
    readAll: false,
    format: QUERIES_FORMATS.JSON,
  },
};

const RESERVED_PROPERTY_NAMES: { [key: string]: boolean } = {
  _events: true,
  _eventsCount: true,
  _lazySetupHooks: true,
  _maxListeners: true,
  _posts: true,
  _pres: true,
  className: true,
  constructor: true,
  delete: true,
  domain: true,
  ds: true,
  emit: true,
  entityData: true,
  entityKey: true,
  errors: true,
  excludeFromIndexes: true,
  get: true,
  getEntityDataWithVirtuals: true,
  gstore: true,
  hook: true,
  init: true,
  isModified: true,
  isNew: true,
  listeners: true,
  model: true,
  modelName: true,
  on: true,
  once: true,
  plain: true,
  post: true,
  pre: true,
  removeListener: true,
  removePost: true,
  removePre: true,
  save: true,
  schema: true,
  set: true,
  toObject: true,
  update: true,
  validate: true,
};

/**
 * gstore-node Schema
 */
class Schema<T extends object = { [key: string]: any }, M extends object = { [key: string]: CustomEntityFunction<T> }> {
  // public readonly methods: { [propName: string]: CustomEntityFunction<T> };
  public readonly methods: { [P in keyof M]: CustomEntityFunction<T> };

  public readonly paths: { [P in keyof T]: SchemaPathDefinition };

  public readonly options: SchemaOptions = {};

  public __meta: GenericObject = {};

  public readonly __virtuals: { [key: string]: VirtualType };

  public __callQueue: {
    model: {
      [key: string]: {
        pres: (FuncReturningPromise | FuncReturningPromise[])[];
        post: (FuncReturningPromise | FuncReturningPromise[])[];
      };
    };
    entity: {
      [key: string]: {
        pres: (FuncReturningPromise | FuncReturningPromise[])[];
        post: (FuncReturningPromise | FuncReturningPromise[])[];
      };
    };
  };

  public readonly shortcutQueries: { [key: string]: QueryListOptions };

  public joiSchema?: GenericObject;

  constructor(properties: { [P in keyof T]: SchemaPathDefinition }, options?: SchemaOptions) {
    this.methods = {} as any;
    this.__virtuals = {};
    this.shortcutQueries = {};
    this.paths = {} as { [P in keyof T]: SchemaPathDefinition };
    this.__callQueue = {
      model: {},
      entity: {},
    };

    this.options = Schema.initSchemaOptions(options);

    Object.entries(properties).forEach(([key, definition]) => {
      if (RESERVED_PROPERTY_NAMES[key]) {
        throw new Error(`${key} is reserved and can not be used as a schema pathname`);
      }

      this.paths[key as keyof T] = definition as SchemaPathDefinition;
    });

    if (options) {
      this.joiSchema = Schema.initJoiSchema(properties, this.options.joi);
    }
  }

  /**
   * Add custom methods to entities.
   * @link https://sebloix.gitbook.io/gstore-node/schema/custom-methods
   *
   * @example
   * ```
   * schema.methods.profilePict = function() {
       return this.model('Image').get(this.imgIdx)
   * }
   * ```
  */
  method(name: string | { [key: string]: FunctionType }, fn: FunctionType): void {
    if (typeof name !== 'string') {
      if (typeof name !== 'object') {
        return;
      }
      Object.keys(name).forEach(k => {
        if (typeof name[k] === 'function') {
          this.methods[k as keyof M] = name[k];
        }
      });
    } else if (typeof fn === 'function') {
      this.methods[name as keyof M] = fn;
    }
  }

  queries(type: 'list', settings: QueryListOptions): void {
    this.shortcutQueries[type] = settings;
  }

  /**
   * Getter / Setter for Schema paths.
   *
   * @param {string} propName The entity property
   * @param {SchemaPathDefinition} [definition] The property definition
   * @link https://sebloix.gitbook.io/gstore-node/schema/schema-methods/path
   */
  path(propName: string, definition: SchemaPathDefinition): Schema<T> | SchemaPathDefinition | undefined {
    if (typeof definition === 'undefined') {
      if (this.paths[propName as keyof T]) {
        return this.paths[propName as keyof T];
      }
      return undefined;
    }

    if (RESERVED_PROPERTY_NAMES[propName]) {
      throw new Error(`${propName} is reserved and can not be used as a schema pathname`);
    }

    this.paths[propName as keyof T] = definition;
    return this;
  }

  /**
   * Register a middleware to be executed before "save()", "delete()", "findOne()" or any of your custom method.
   * The callback will receive the original argument(s) passed to the target method. You can modify them
   * in your resolve passing an object with an __override property containing the new parameter(s)
   * for the target method.
   *
   * @param {string} method The target method to add the hook to
   * @param {(...args: any[]) => Promise<any>} fn Function to execute before the target method.
   * It must return a Promise
   * @link https://sebloix.gitbook.io/gstore-node/middleware-hooks/pre-hooks
   */
  pre(method: string, fn: FuncReturningPromise | FuncReturningPromise[]): number {
    const queue = IS_QUERY_HOOK[method] ? this.__callQueue.model : this.__callQueue.entity;

    if (!{}.hasOwnProperty.call(queue, method)) {
      queue[method] = {
        pres: [],
        post: [],
      };
    }

    return queue[method].pres.push(fn);
  }

  /**
   * Register a "post" middelware to execute after a target method.
   *
   * @param {string} method The target method to add the hook to
   * @param {(response: any) => Promise<any>} callback Function to execute after the target method.
   * It must return a Promise
   * @link https://sebloix.gitbook.io/gstore-node/middleware-hooks/post-hooks
   */
  post(method: string, fn: FuncReturningPromise | FuncReturningPromise[]): number {
    const queue = IS_QUERY_HOOK[method] ? this.__callQueue.model : this.__callQueue.entity;

    if (!{}.hasOwnProperty.call(queue, method)) {
      queue[method] = {
        pres: [],
        post: [],
      };
    }

    return queue[method].post.push(fn);
  }

  /**
   * Getter / Setter of a virtual property.
   * Virtual properties are created dynamically and not saved in the Datastore.
   *
   * @param {string} propName The virtual property name
   * @link https://sebloix.gitbook.io/gstore-node/schema/methods/virtual
   */
  virtual(propName: string): VirtualType {
    if (RESERVED_PROPERTY_NAMES[propName]) {
      throw new Error(`${propName} is reserved and can not be used as virtual property.`);
    }
    if (!{}.hasOwnProperty.call(this.__virtuals, propName)) {
      this.__virtuals[propName] = new VirtualType(propName);
    }
    return this.__virtuals[propName];
  }

  /**
   * Executes joi.validate on given data. If the schema does not have a joi config object data is returned.
   *
   * @param {*} data The data to sanitize
   * @returns {*} The data sanitized
   */
  validateJoi(entityData: any): any {
    if (!this.isJoi) {
      return {
        error: new ValidationError(ERROR_CODES.ERR_GENERIC, 'Schema does not have a joi configuration object'),
        value: entityData,
      };
    }
    return this.joiSchema!.validate(entityData, (this.options.joi as JoiConfig).options || {});
  }

  /**
   * Flag that returns "true" if the schema has a joi config object.
   */
  get isJoi(): boolean {
    return !is.undefined(this.joiSchema);
  }

  static initSchemaOptions(provided?: SchemaOptions): SchemaOptions {
    const options = extend(true, {}, DEFAULT_OPTIONS, provided);

    if (options.joi) {
      const joiOptionsDefault = {
        options: {
          allowUnknown: options.explicitOnly !== true,
        },
      };
      if (is.object(options.joi)) {
        options.joi = extend(true, {}, joiOptionsDefault, options.joi);
      } else {
        options.joi = { ...joiOptionsDefault };
      }
      if (!Object.prototype.hasOwnProperty.call((options.joi as JoiConfig).options, 'stripUnknown')) {
        (options.joi as JoiConfig).options!.stripUnknown = (options.joi as JoiConfig).options!.allowUnknown !== true;
      }
    }

    return options;
  }

  static initJoiSchema(
    schema: { [key: string]: SchemaPathDefinition },
    joiConfig?: boolean | JoiConfig,
  ): GenericObject | undefined {
    if (!is.object(joiConfig)) {
      return undefined;
    }

    const hasExtra = is.object((joiConfig as JoiConfig).extra);
    const joiKeys: { [key: string]: SchemaPathDefinition['joi'] } = {};

    Object.entries(schema).forEach(([key, definition]) => {
      if ({}.hasOwnProperty.call(definition, 'joi')) {
        joiKeys[key] = definition.joi;
      }
    });

    let joiSchema = Joi.object().keys(joiKeys);
    let args;

    if (hasExtra) {
      Object.keys((joiConfig as JoiConfig).extra!).forEach(k => {
        if (is.function(joiSchema[k])) {
          args = (joiConfig as JoiConfig).extra![k];
          joiSchema = joiSchema[k](...args);
        }
      });
    }

    return joiSchema;
  }

  static Types = {
    Double: 'double',
    GeoPoint: 'geoPoint',
    Key: 'entityKey',
  };
}

export default Schema;

export interface SchemaPathDefinition {
  type?: PropType;
  validate?: Validator;
  optional?: boolean;
  default?: any;
  excludeFromIndexes?: boolean | string | string[];
  read?: boolean;
  excludeFromRead?: string[];
  write?: boolean;
  required?: boolean;
  values?: any[];
  joi?: any;
  ref?: string;
}

export type JoiConfig = { extra?: GenericObject; options?: GenericObject };

export interface SchemaOptions {
  validateBeforeSave?: boolean;
  explicitOnly?: boolean;
  excludeLargeProperties?: boolean;
  queries?: {
    readAll?: boolean;
    format?: JSONFormatType | EntityFormatType;
    showKey?: string;
  };
  joi?: boolean | JoiConfig;
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
  filters?: [string, unknown] | [string, Operator, unknown] | (unknown)[][];
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

export type Validator = string | { rule: string | ((...args: any[]) => boolean); args: any[] };

export type PropType =
  | 'string'
  | 'int'
  | 'double'
  | 'boolean'
  | 'datetime'
  | 'array'
  | 'object'
  | 'geoPoint'
  | 'buffer'
  | 'entityKey'
  | NumberConstructor
  | StringConstructor
  | ObjectConstructor
  | ArrayConstructor
  | BooleanConstructor
  | DateConstructor
  | typeof Buffer;
