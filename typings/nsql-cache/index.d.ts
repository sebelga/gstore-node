declare module 'nsql-cache' {
  import { entity } from '@google-cloud/datastore/build/src/entity';
  import { Query } from "@google-cloud/datastore/build/src/query";

  export interface NsqlCacheConfig {
    ttl?: {
        keys?: number,
        queries?: number,
        memory?: {
            keys: number,
            queries: number
        },
        redis?: {
            keys: number,
            queries: number
        },
        [key: string]: {
            keys: number,
            queries: number
        } | number | undefined,

    },
    cachePrefix?: {
        keys?: string;
        queries?: string;
    },
    hashCacheKeys?: boolean,
    wrapClient?: boolean,
    global?: boolean;
}

  /**
   * gstore-cache Instance
   *
   * @class Cache
   */
  class NsqlCache {
    constructor(settings: { db: any, stores?: any[], config: NsqlCacheConfig })

    public config: any;

    public stores: any;

    public redisClient: any;

    keys: {
      read(
        keys: entity.Key | entity.Key[],
        options?: { ttl?: number | { [propName: string]: number } },
        fetchHandler?: (keys: entity.Key | entity.Key[]) => Promise<any>
      ): Promise<any>;
      get(key: entity.Key): Promise<any>;
      mget(...keys: entity.Key[]): Promise<any>;
      set(key: entity.Key, data: any, options?: { ttl: number | { [propName: string]: number } }): Promise<any>;
      mset(...args: any[]): Promise<any>;
      del(...keys: entity.Key[]): Promise<any>;
    };

    queries: {
      read(
        query: Omit<Query, 'run'>,
        options?: { ttl?: number | { [propName: string]: number } },
        fetchHandler?: (query: Query) => Promise<any>
      ): Promise<any>;
      get(query: Query): Promise<any>;
      mget(...queries: Query[]): Promise<any>;
      set(
        query: Query,
        data: any,
        options?: { ttl: number | { [propName: string]: number } }
      ): Promise<any>;
      mset(...args: any[]): Promise<any>;
      kset(key: string, data: any, entityKinds: string | string[], options?: { ttl: number }): Promise<any>;
      clearQueriesByKind(entityKinds: string | string[]): Promise<any>;
      del(...queries: Query[]): Promise<any>;
    };

    /**
     * Retrieve an element from the cache
     *
     * @param {string} key The cache key
     */
    get(key: string): Promise<any>;

    /**
     * Retrieve multiple elements from the cache
     *
     * @param {...string[]} keys Unlimited number of keys
     */
    mget(...keys: string[]): Promise<any[]>;

    /**
     * Add an element to the cache
     *
     * @param {string} key The cache key
     * @param {*} value The data to save in the cache
     */
    set(key: string, value: any): Promise<any>;

    /**
     * Add multiple elements into the cache
     *
     * @param {...any[]} args Key Value pairs (key1, data1, key2, data2...)
     */
    mset(...args: any[]): Promise<any>;

    /**
     * Remove one or multiple elements from the cache
     *
     * @param {string[]} keys The keys to remove
     */
    del(keys: string[]): Promise<any>;

    /**
     * Clear the cache
     */
    reset(): Promise<void>;
  }

  export default NsqlCache;
}
