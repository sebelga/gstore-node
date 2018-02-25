'use strict';

/* eslint-disable import/no-extraneous-dependencies */

const DataLoader = require('dataloader');
const { utils } = require('gstore-cache');

const { dsKeyToString } = utils.datastore;

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
                entitiesByKey[dsKeyToString(entity[ds.KEY])] = entity;
            });

            return keys.map(key => entitiesByKey[dsKeyToString(key)] || null);
        })
    ), { cacheKeyFn: _key => dsKeyToString(_key) });
}

module.exports = { createDataLoader };
