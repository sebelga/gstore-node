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

function fromDatastore(entity, options) {
    options = options || {};

    switch (options.format) {
        case 'ENTITY' :
            return convertToEntity.call(this);
        default:
            return convertToJson.call(this);
    }

    // --------------

    function convertToJson() {
        options.readAll = typeof options.readAll === 'undefined' ? false : options.readAll;

        const schema = this.schema;
        const KEY = this.gstore.ds.KEY;
        const entityKey = entity[KEY];
        const data = {
            id: idFromKey(entityKey),
        };
        data[KEY] = entityKey;

        Object.keys(entity).forEach((k) => {
            if (options.readAll || !{}.hasOwnProperty.call(schema.paths, k) || schema.paths[k].read !== false) {
                data[k] = entity[k];
            }
        });

        return data;

        // ----------------------

        function idFromKey(key) {
            return key.path[key.path.length - 1];
        }
    }

    function convertToEntity() {
        const key = entity[this.gstore.ds.KEY];
        return this.__model(entity, null, null, null, key);
    }
}


module.exports = {
    toDatastore,
    fromDatastore,
};
