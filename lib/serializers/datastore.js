'use strict';

const is = require('is');
const arrify = require('arrify');

function toDatastore(entity) {
    const excludeFromIndexes = [...entity.excludeFromIndexes] || [];

    let isTypeArray;
    let isTypeObject;

    let propConfig;
    const data = Object.keys(entity.entityData).map((k) => {
        if (entity.entityData[k] === undefined) {
            return undefined;
        }

        const prop = {
            name: k,
            value: entity.entityData[k],
        };

        /**
         * There is an inconsistency in @google-cloud and we cannot set an array type prop
         * in our "entity.excludeFromIndexes" (see below) to exclude all values of an array
         * We need to specifically set in "on" the property.
         * For "object" type we automatically set all its properties to excludeFromIndexes: true
         * which is what most of us expect.
         */
        propConfig = entity.schema.paths[k];
        isTypeArray = propConfig && (propConfig.type === 'array' ||
            (propConfig.joi && propConfig.joi._type === 'array'));

        isTypeObject = propConfig && (propConfig.type === 'object' ||
            (propConfig.joi && propConfig.joi._type === 'object'));
        if (isTypeArray && propConfig.excludeFromIndexes === true) {
            prop.excludeFromIndexes = true;
        } else if (entity.entityData[k] !== null && isTypeObject && propConfig.excludeFromIndexes === true) {
            Object.keys(entity.entityData[k]).forEach((kk) => {
                // We add the embedded property to our Array of excludedFromIndexes
                excludeFromIndexes.push(`${k}.${kk}`);
            });
        }

        return prop;
    }).filter(v => v !== undefined);

    // const data = Object.keys(entity.entityData).reduce((acc, key) => {
    //     if (typeof entity.entityData[key] !== 'undefined') {
    //         acc[key] = entity.entityData[key];
    //     }
    //     return acc;
    // }, {});

    const datastoreFormat = {
        key: entity.entityKey,
        data,
    };

    if (excludeFromIndexes.length > 0) {
        datastoreFormat.excludeFromIndexes = excludeFromIndexes;
    }

    return datastoreFormat;
}

function fromDatastore(entity, options) {
    options = options || {};

    switch (options.format) {
        case 'ENTITY':
            return convertToEntity.call(this);
        default:
            return convertToJson.call(this);
    }

    // --------------

    function convertToJson() {
        options.readAll = typeof options.readAll === 'undefined' ? false : options.readAll;

        const { schema } = this;
        const { KEY } = this.gstore.ds;
        const entityKey = entity[KEY];
        const data = {
            id: idFromKey(entityKey),
        };
        data[KEY] = entityKey;

        Object.keys(entity).forEach((k) => {
            if (options.readAll || !{}.hasOwnProperty.call(schema.paths, k) || schema.paths[k].read !== false) {
                let value = entity[k];
                if ({}.hasOwnProperty.call(this.schema.paths, k)
                    && this.schema.paths[k].type === 'datetime' && is.number(value)) {
                    // During queries @google-cloud converts datetime to number
                    value = new Date(value / 1000);
                }
                data[k] = value;
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

    const result = entities.map(toDatastore);

    return multiple ? result : result[0];
}

module.exports = {
    toDatastore,
    fromDatastore,
    entitiesToDatastore,
};
