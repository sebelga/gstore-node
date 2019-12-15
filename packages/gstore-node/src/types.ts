import { entity } from '@google-cloud/datastore/build/src/entity';
import { Datastore, Transaction as DatastoreTransaction } from '@google-cloud/datastore';

import GstoreEntity from './entity';

export type DocId = string | { id: string | number } | { name: string } | { key: EntityKey };

export type EntityKey = entity.Key;

export type EntityData<T = { [key: string]: any }> = { [P in keyof T]: T[P] };

export type FuncReturningPromise = (...args: any[]) => Promise<any>;

export type FunctionType = (...args: any[]) => any;

export type CustomEntityFunction<T extends object> = (this: GstoreEntity<T>, ...args: any[]) => any;

export type GenericObject = { [key: string]: any };

export type IdType = string | number; // TODO removed after refactor

export type Ancestor = IdType[];

export type EntityFormatType = 'ENTITY';

export type JSONFormatType = 'JSON';

export type DatastoreSaveMethod = 'upsert' | 'insert' | 'update';

export type PopulateRef = { path: string; select: string[] };

export type Transaction = DatastoreTransaction;

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

export interface GstoreAdapter {
  buildKey(options: { type: string; id: DocId; ancestors?: Ancestor; namespace?: string }): EntityKey;
  get(id: DocId): void;
}

declare let GstoreAdapter: {
  new (client: Datastore): GstoreAdapter;
};

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
