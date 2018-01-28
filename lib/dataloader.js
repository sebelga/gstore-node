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
function createDataLoader(ds) {
    ds = typeof ds !== 'undefined' ? ds : this && this.ds;

    if (!ds) {
        throw new Error('A Datastore instance has to be passed');
    }

    return new DataLoader((keys) => {
        const uuidKeys = keys.map(toString);
        const { length } = keys;

        const sortEntities = entities => entities.sort((a, b) => (
            uuidKeys.indexOf(toString(a[ds.KEY])) - uuidKeys.indexOf(toString(b[ds.KEY]))
        ));

        return ds.get(keys).then((res) => {
            const entities = res[0];

            if (length > entities.length) {
                /**
                 * If the length of the received entities is different from the length
                 * of the keys passed. We need to pass "null" to the entities not found.
                 */

                // Convert the received keys to its string equivalent
                const strIds = entities.map(entity => entity[ds.KEY]).map(toString);

                for (let i = 0; i < length; i += 1) {
                    /**
                     * If the entities that we got back don't contain one of the
                     * sent from DataLoader, we create a fake entity with
                     * a Symbol with the key.
                     */
                    if (strIds.indexOf(uuidKeys[i]) < 0) {
                        const fakeEntity = { __fake__: true };
                        fakeEntity[ds.KEY] = keys[i];
                        entities.push(fakeEntity);
                    }
                }

                // We can now sort the entities and return "null" for the fake ones
                return sortEntities(entities).map((entity) => {
                    if (entity.__fake__) {
                        return null;
                    }
                    return entity;
                });
            }

            if (length === 1) {
                return entities;
            }

            return sortEntities(entities);
        });
    }, { cacheKeyFn: key => toString(key) });
}

module.exports = { createDataLoader };
