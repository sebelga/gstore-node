import { entity } from '@google-cloud/datastore/build/src/entity';
import Entity from './entity';

export type EntityKey = entity.Key;

export type EntityData<T = { [key: string]: any }> = { [P in keyof T]: T[P] };

export type FuncReturningPromise = (...args: any[]) => Promise<any>;

export type FunctionType = (...args: any[]) => any;

export type GenericObject = { [key: string]: any };

export type IdType = string | number;

export type Ancestor = (IdType)[];

export type EntityFormatType = 'ENTITY';

export type JSONFormatType = 'JSON';

export type PopulateRef = { path: string; select: string[] };

export type PopulateMetaForEntity = {
  entity: Entity | EntityData;
  keysToFetch: EntityKey[];
  mapKeyToPropAndSelect: { [key: string]: { ref: PopulateRef } };
};

export type PopulateFunction<T extends object> = (
  entitiesToProcess: null | Entity<T> | Array<Entity<T> | EntityData<T> | null>,
) => Promise<Entity<T> | EntityData<T> | null | Array<Entity<T> | EntityData<T> | null>>;

export interface PromiseWithPopulate<T> extends Promise<T> {
  populate: <U extends string | string[]>(
    refs?: U,
    properties?: U extends Array<string> ? undefined : string | string[],
  ) => PromiseWithPopulate<T>;
}
