'use strict';

/* eslint-disable import/no-extraneous-dependencies */

const DataLoader = require('dataloader');

/**
 * Convert a Google Datastore Key to a unique string id
 * It concatenates the namespace with the key path Array
 * @param {Datastore.Key} key The Google Datastore Key
 */
const toString = (key) => {
    let id = key.namespace || '';
    id += key.path.join('');
    return id;
};

/**
 * Create a DataLoader instance
 * @param {Datastore} ds @google-cloud Datastore instance
 */
const createDataLoader = (ds) => {
    if (!ds) {
        throw new Error('A Datastore instance has to be passed');
    }

    return new DataLoader((keys) => {
        const uuidKeys = keys.map(toString);

        return ds.get(keys).then((res) => {
            const entities = res[0];

            if (keys.length === 1) {
                return entities;
            }

            return entities.sort((a, b) => (
                uuidKeys.indexOf(toString(a[ds.KEY])) - uuidKeys.indexOf(toString(b[ds.KEY]))
            ));
        });
    }, {
        cacheKeyFn: key => toString(key),
    });
};

module.exports = { createDataLoader };
