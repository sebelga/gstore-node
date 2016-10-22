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
    const key = entity[this.gstore.ds.KEY];
    let data = {
        id: idFromKey(key)
    };
    
    Object.keys(entity).forEach((k) => {
        if (readAll || !schema.paths.hasOwnProperty(k) || schema.paths[k].read !== false) {
            data[k] = entity[k];
        }
    });
    
    return data;

    /////////

    function idFromKey(key) {
        return key.path[key.path.length - 1];
    }
}

module.exports = {
    toDatastore:   toDatastore,
    fromDatastore: fromDatastore
};
