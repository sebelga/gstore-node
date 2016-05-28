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

function fromDatastore(obj) {
    obj.data.id = obj.key.path[obj.key.path.length - 1];
    return obj.data;
}

module.exports = {
    toDatastore : toDatastore,
    fromDatastore : fromDatastore
};
