import optional from 'optional';
import arrify from 'arrify';
import datastoreAdapterFactory from 'nsql-cache-datastore';
import { Datastore } from '@google-cloud/datastore';
import DataLoader from 'dataloader'; // eslint-disable-line import/no-extraneous-dependencies

import { EntityKey, EntityData } from './types';

const OptionalDataloader = optional('dataloader');

const dsAdapter = datastoreAdapterFactory();

const { keyToString } = dsAdapter;

/**
 * Create a DataLoader instance
 * @param {Datastore} ds @google-cloud Datastore instance
 */
export const createDataLoader = (
  ds: Datastore,
  options?: { maxBatchSize: number },
): DataLoader<EntityKey[], EntityData> => {
  if (!ds) {
    throw new Error('A Datastore instance has to be passed');
  }

  const fetchHandler = (keys: EntityKey[]): Promise<EntityData> =>
    ds.get(keys).then(([response]: [EntityData | EntityData[]]) => {
      // When providing an Array with 1 Key item, google-datastore
      // returns a single item.
      // For predictable results in gstore, all responses from Datastore.get()
      // calls return an Array
      const entityData = arrify(response);
      const entitiesByKey: { [key: string]: any } = {};
      entityData.forEach(data => {
        entitiesByKey[keyToString(data[ds.KEY as any])] = entityData;
      });

      return keys.map(key => entitiesByKey[keyToString(key)] || null);
    });

  const defaultOptions = {
    cacheKeyFn: (key: EntityKey): string => keyToString(key),
    maxBatchSize: 1000,
  };

  return new OptionalDataloader(fetchHandler, { ...defaultOptions, ...options });
};
