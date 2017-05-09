'use strict';

const is = require('is');
const arrify = require('arrify');

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

        if (options.showKey) {
            data.__key = entityKey;
        } else {
            delete data.__key;
        }

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

/**
 * Convert one or several entities instance (gstore) to Datastore format
 *
 * @param {any} entities Entity(ies) to format
 * @returns {array} the formated entity(ies)
 */
function entitiesToDatastore(entities) {
    const multiple = is.array(entities);
    entities = arrify(entities);

    if (entities[0].className !== 'Entity') {
        // Not an entity instance, nothing to do here...
        return entities;
    }

    const result = entities.map(entity => ({
        key: entity.entityKey,
        data: toDatastore(entity.entityData, entity.excludeFromIndexes),
    }));

    return multiple ? result : result[0];
}

module.exports = {
    toDatastore,
    fromDatastore,
    entitiesToDatastore,
};
