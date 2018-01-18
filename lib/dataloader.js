'use strict';

const DataLoader = require('dataloader');

/**
 * Convert a Google Datastore Key to a unique identifier (uuid)
 * It concatenates the namespace with the key path array
 * @param {Datastore.Key} key The Google Datastore Key
 */
const uuid = (key) => {
    let id = '';

    if (key.namespace) {
        id += key.namespace;
    }

    id += key.path.join('');

    return id;
};

const isSameKey = (keyA, keyB) => uuid(keyA) === uuid(keyB);

/**
 * Create a DataLoader instance
 * @param {Datastore} ds @google-cloud Datastore instance
 */
const createDataLoader = (ds) => {
    if (!ds) {
        throw new Error('A Datastore instance has to be passed');
    }

    return new DataLoader((keys) => {
        const uuidKeys = keys.map(uuid);

        return ds.get(keys).then(entities => (
            entities.sort((a, b) => uuidKeys.indexOf(uuid(a[ds.KEY])) - uuidKeys.indexOf(b[ds.KEY]))
        ));
    }, {
        cacheKeyFn: key => uuid(key),
    });
};

module.exports = { createDataLoader, isSameKey };
