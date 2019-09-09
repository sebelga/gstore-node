'use strict';

/* eslint-disable import/no-extraneous-dependencies */

const optional = require('optional');
const dsAdapter = require('nsql-cache-datastore')();
const arrify = require('arrify');

const DataLoader = optional('dataloader');
const { keyToString } = dsAdapter;

/**
 * Create a DataLoader instance
 * @param {Datastore} ds @google-cloud Datastore instance
 */
function createDataLoader(ds) {
    ds = typeof ds !== 'undefined' ? ds : this && this.ds;

    if (!ds) {
        throw new Error('A Datastore instance has to be passed');
    }

    return new DataLoader(keys => (
        ds.get(keys).then(([res]) => {
            // When providing an Array with 1 Key item, google-datastore
            // returns a single item.
            // For predictable results in gstore, all responses from Datastore.get()
            // calls return an Array
            const entities = arrify(res);
            const entitiesByKey = {};
            entities.forEach(entity => {
                entitiesByKey[keyToString(entity[ds.KEY])] = entity;
            });

            return keys.map(key => entitiesByKey[keyToString(key)] || null);
        })
    ), {
        cacheKeyFn: _key => keyToString(_key),
        maxBatchSize: 1000,
    });
}

module.exports = { createDataLoader };
