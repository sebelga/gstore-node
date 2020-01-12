import { entity } from '@google-cloud/datastore/build/src/entity';
import GstoreEntity, { Entity } from './entity';

export type EntityKey = entity.Key;

export type EntityData<T = { [key: string]: any }> = { [P in keyof T]: T[P] };

export type FuncReturningPromise = (...args: any[]) => Promise<any>;

export type FunctionType = (...args: any[]) => any;

export type CustomEntityFunction<T extends object> = (this: Entity<T>, ...args: any[]) => any;

export type GenericObject = { [key: string]: any };

export type IdType = string | number;

export type Ancestor = IdType[];

export type EntityFormatType = 'ENTITY';

export type JSONFormatType = 'JSON';

export type DatastoreSaveMethod = 'upsert' | 'insert' | 'update';

export type PopulateRef = { path: string; select: string[] };

export type PopulateMetaForEntity = {
  entity: GstoreEntity | EntityData;
  keysToFetch: EntityKey[];
  mapKeyToPropAndSelect: { [key: string]: { ref: PopulateRef } };
};

export type PopulateFunction<T extends object> = (
  entitiesToProcess: null | GstoreEntity<T> | Array<GstoreEntity<T> | EntityData<T> | null>,
) => Promise<GstoreEntity<T> | EntityData<T> | null | Array<GstoreEntity<T> | EntityData<T> | null>>;

export interface PromiseWithPopulate<T> extends Promise<T> {
  populate: <U extends string | string[]>(
    refs?: U,
    properties?: U extends Array<string> ? never : string | string[],
  ) => PromiseWithPopulate<T>;
}

/**
 * ---------------------------------------------------
 * Google Datastore Types
 * ---------------------------------------------------
 */

// From '@google-cloud/datastore/build/src/query';
export type DatastoreOperator = '=' | '<' | '>' | '<=' | '>=' | 'HAS_ANCESTOR';

export interface OrderOptions {
  descending?: boolean;
}
