'use strict';

function toDatastore(obj, nonIndexed) {
    nonIndexed = nonIndexed || [];
    const results = [];

    Object.keys(obj).forEach((k) => {
        if (obj[k] === undefined) {
            return;
        }
        results.push({
            name: k,
            value: obj[k],
            excludeFromIndexes: nonIndexed.indexOf(k) !== -1,
        });
    });
    return results;
}

function fromDatastore(entity, readAll) {
    readAll = typeof readAll === 'undefined' ? false : readAll;

    const schema = this.schema;
    const KEY = this.gstore.ds.KEY;
    const entityKey = entity[KEY];
    const data = {
        id: idFromKey(entityKey),
    };
    data[KEY] = entityKey;

    Object.keys(entity).forEach((k) => {
        if (readAll || !{}.hasOwnProperty.call(schema.paths, k) || schema.paths[k].read !== false) {
            data[k] = entity[k];
        }
    });

    return data;

    // ----------------------

    function idFromKey(key) {
        return key.path[key.path.length - 1];
    }
}

module.exports = {
    toDatastore,
    fromDatastore,
};
