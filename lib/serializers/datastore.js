'use strict';

function toDatastore(obj, nonIndexed) {
    nonIndexed  = nonIndexed || [];
    var results = [];
    Object.keys(obj).forEach(function (k) {
        if (obj[k] === undefined) {
            return;
        }
        results.push({
            name              : k,
            value             : obj[k],
            excludeFromIndexes: nonIndexed.indexOf(k) !== -1
        });
    });
    return results;
}

function fromDatastore(entity, readAll) {
    readAll = typeof readAll === 'undefined' ? false : readAll;
    const schema = this.schema;

    // Before @google-cloud/datastore 0.5.0 the entity returned by the Datastore was an object {key:{}, data:{}}
    const isLegacy = Object.keys(entity).length === 2 && entity.hasOwnProperty('key') && entity.hasOwnProperty('data');

    if (isLegacy) {
        let data = {};
        data.id  = idFromKey(entity.key);

        Object.keys(entity.data).forEach((k) => {
            if (readAll || !schema.paths.hasOwnProperty(k) || schema.paths[k].read !== false) {
                data[k] = entity.data[k];
            }
        });
        return data;
    } else {
        const key = entity[this.gstore.ds.KEY];
        entity.id = idFromKey(key);
        Object.keys(entity).forEach((k) => {
            if (!readAll && schema.paths.hasOwnProperty(k) && schema.paths[k].read === false) {
                delete entity[k];
            }
        });
        return entity;
    }

    /////////

    function idFromKey(key) {
        return key.path[key.path.length - 1];
    }
}

module.exports = {
    toDatastore:   toDatastore,
    fromDatastore: fromDatastore
};
