'use strict';

/* eslint-disable import/no-extraneous-dependencies */

const optional = require('optional');
const dsAdapter = require('nsql-cache-datastore')();

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
        ds.get(keys).then((res) => {
            const entities = res[0];
            const entitiesByKey = {};
            entities.forEach((entity) => {
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
