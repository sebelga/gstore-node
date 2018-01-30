'use strict';

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

module.exports = {
    key: {
        toString,
    },
};
