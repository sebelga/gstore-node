'use strict';

class Datastore {

    toDatastore(obj, nonIndexed) {
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
    };
}

module.exports.ds = new Datastore();
