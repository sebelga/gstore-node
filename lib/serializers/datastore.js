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
    var schema = this.schema;
    var data = {};
    data.id  = entity.key.path[entity.key.path.length - 1];

    Object.keys(entity.data).forEach((k) => {
        if (readAll || !schema.paths.hasOwnProperty(k) || schema.paths[k].read !== false) {
            data[k] = entity.data[k];
        }
    });

    return data;
}

module.exports = {
    toDatastore :   toDatastore,
    fromDatastore : fromDatastore
};
