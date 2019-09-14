/* eslint-disable import/no-extraneous-dependencies */

'use strict';

import optional from 'optional';
import extend from 'extend';
import is from 'is';

// TODO: Open PR in @google-cloud repo to expose those types
import { Operator } from "@google-cloud/datastore/build/src/query";

const Joi = optional('@hapi/joi') || optional('joi');

import { QUERIES_FORMATS } from './constants';
import VirtualType from './virtualType';
import { ValidationError, ERROR_CODES } from './errors';

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

class Schema<T = { [key: string]: SchemaPathDefinition }> {
  public readonly methods: { [propName: string]: FunctionType };
  public readonly paths: { [P in keyof T]: SchemaPathDefinition };

  private virtuals: { [key: string]: VirtualType };
  private shortcutQueries: { [key: string]: QueryListOptions };
  private callQueue: {
    model: {
      [key: string]: {
        pres: FuncReturningPromise[] | FuncReturningPromise[][],
        post: FuncReturningPromise[] | FuncReturningPromise[][],
      }
    },
    entity: {
      [key: string]: {
        pres: FuncReturningPromise[] | FuncReturningPromise[][],
        post: FuncReturningPromise[] | FuncReturningPromise[][],
      }
    },
  };
  private options: SchemaOptions;
  private joiSchema: any;


  constructor(properties: { [P in keyof T]: SchemaPathDefinition }, options?: SchemaOptions) {
    this.methods = {};
    this.virtuals = {};
    this.shortcutQueries = {};
    this.paths = {} as any;
    this.callQueue = {
      model: {},
      entity: {}
    };
    this.options = this.initSchemaOptions(options);

    Object.entries(properties).forEach(([key, definition]) => {
      if (RESERVED_PROPERTY_NAMES[key]) {
        throw new Error(`${key} is reserved and can not be used as a schema pathname`);
      }

      this.paths[key as keyof T] = definition as SchemaPathDefinition;
    });

    if (options) {
      this.joiSchema = this.initJoiSchema(properties, this.options.joi);
    }
  }

  method(name: string | { [key: string]: FunctionType }, fn: FunctionType) {
    if (typeof name !== 'string') {
      if (typeof name !== 'object') {
        return;
      }
      Object.keys(name).forEach(k => {
        if (typeof name[k] === 'function') {
          this.methods[k] = name[k];
        }
      });
    } else if (typeof fn === 'function') {
      this.methods[name] = fn;
    }
  }

  queries(type: 'list', settings: QueryListOptions) {
    this.shortcutQueries[type] = settings;
  }

  /**
     * Getter / Setter for Schema paths.
     *
     * @param {string} propName The entity property
     * @param {SchemaPathDefinition} [definition] The property definition
     * @link https://sebelga.gitbooks.io/gstore-node/content/schema/schema-methods/path.html
     */
  path(propName: string, definition: SchemaPathDefinition) {
    if (typeof definition === 'undefined') {
      if (this.paths[propName]) {
        return this.paths[propName];
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
     * Register a middleware to be executed before "save()", "delete()", "findOne()" or any of your custom method. The callback will receive the original argument(s) passed to the target method. You can modify them in your resolve passing an object with an __override property containing the new parameter(s) for the target method.
     *
     * @param {string} method The target method to add the hook to
     * @param {(...args: any[]) => Promise<any>} fn Function to execute before the target method. It must return a Promise
     * @link https://sebelga.gitbooks.io/gstore-node/content/middleware-hooks/pre-hooks.html
     */
  pre(method: string, fn: FuncReturningPromise | FuncReturningPromise[]) {
    const queue = IS_QUERY_HOOK[method] ? this.callQueue.model : this.callQueue.entity;

    if (!{}.hasOwnProperty.call(queue, method)) {
      queue[method] = {
        pres: [],
        post: [],
      };
    }

    return queue[method].pres.push(fn as any);
  }

  /**
     * Register a "post" middelware to execute after a target method.
     *
     * @param {string} method The target method to add the hook to
     * @param {(response: any) => Promise<any>} callback Function to execute after the target method. It must return a Promise
     * @link https://sebelga.gitbooks.io/gstore-node/content/middleware-hooks/post-hooks.html
     */
  post(method: string, fn: FuncReturningPromise | FuncReturningPromise[]) {
    const queue = IS_QUERY_HOOK[method] ? this.callQueue.model : this.callQueue.entity;

    if (!{}.hasOwnProperty.call(queue, method)) {
      queue[method] = {
        pres: [],
        post: [],
      };
    }

    return queue[method].post.push(fn as any);
  }

  /**
     * Getter / Setter of a virtual property.
     * Virtual properties are created dynamically and not saved in the Datastore.
     *
     * @param {string} propName The virtual property name
     * @link https://sebelga.gitbooks.io/gstore-node/content/schema/schema-methods/virtual.html
     */
  virtual(propName: string) {
    if (RESERVED_PROPERTY_NAMES[propName]) {
      throw new Error(`${propName} is reserved and can not be used as virtual property.`);
    }
    if (!{}.hasOwnProperty.call(this.virtuals, propName)) {
      this.virtuals[propName] = new VirtualType(propName);
    }
    return this.virtuals[propName];
  }

  validateJoi(entityData: any) {
    if (!this.isJoi) {
      return {
        error: new ValidationError(
          ERROR_CODES.ERR_GENERIC,
          'Schema does not have a joi configuration object'
        ),
        value: entityData,
      };
    }
    return this.joiSchema.validate(entityData, (this.options.joi as JoiConfig).options || {});
  }

  get isJoi() {
    return !is.undefined(this.joiSchema);
  }

  private initSchemaOptions(provided?: SchemaOptions): SchemaOptions {
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
        (options.joi as JoiConfig).options.stripUnknown = (options.joi as JoiConfig).options.allowUnknown !== true;
      }
    }
    return options;
  }

  private initJoiSchema(schema: { [P in keyof T]: SchemaPathDefinition }, joiConfig?: boolean | JoiConfig) {
    if (!is.object(joiConfig)) {
      return undefined;
    }

    const hasExtra = is.object((joiConfig as JoiConfig).extra);
    const joiKeys: { [key: string]: SchemaPathDefinition['joi'] } = {};

    Object.entries(schema).forEach(([key, definition]) => {
      if ({}.hasOwnProperty.call(definition, 'joi')) {
        joiKeys[key] = (definition as SchemaPathDefinition).joi;
      }
    });

    let joiSchema = Joi.object().keys(joiKeys);
    let args;

    if (hasExtra) {
      Object.keys((joiConfig as JoiConfig).extra).forEach(k => {
        if (is.function(joiSchema[k])) {
          args = (joiConfig as JoiConfig).extra[k];
          joiSchema = joiSchema[k].apply(joiSchema, args);
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

type FuncReturningPromise = (...args: any[]) => Promise<any>;
type FunctionType = (...args: any[]) => any;
type EntityFormatType = "ENTITY";
type JSONFormatType = "JSON";

export interface SchemaPathDefinition {
  type?: PropType;
  validate?:
  | string
  | { rule: string | ((...args: any[]) => boolean); args: any[] };
  optional?: boolean;
  default?: any;
  excludeFromIndexes?: boolean | string | string[];
  read?: boolean;
  excludeFromRead?: string[];
  write?: boolean;
  required?: boolean;
  joi?: any;
  ref?: string;
}

type JoiConfig = { extra?: any; options?: any };

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
  order?:
  | { property: string; descending?: boolean }
  | { property: string; descending?: boolean }[];
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

export interface QueryOptions {
  /**
   * Specify either strong or eventual. If not specified, default values are chosen by Datastore for the operation. Learn more about strong and eventual consistency in the link below
   *
   * @type {('strong' | 'eventual')}
   * @link https://cloud.google.com/datastore/docs/articles/balancing-strong-and-eventual-consistency-with-google-cloud-datastore
   */
  consistency?: "strong" | "eventual";
  /**
   * If set to true will return all the properties of the entity, regardless of the *read* parameter defined in the Schema
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

export type PropType =
  | "string"
  | "int"
  | "double"
  | "boolean"
  | "datetime"
  | "array"
  | "object"
  | "geoPoint"
  | "buffer"
  | "entityKey"
  | NumberConstructor
  | StringConstructor
  | ObjectConstructor
  | ArrayConstructor
  | BooleanConstructor
  | DateConstructor
  | typeof Buffer;
