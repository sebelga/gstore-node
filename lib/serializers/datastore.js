'use strict';

const is = require('is');
const arrify = require('arrify');

function toDatastore(entity, options = {}) {
    const excludeFromIndexes = [...entity.excludeFromIndexes] || [];

    let isArray;
    let isObject;
    let propConfig;

    // For now the more robust excudeFromIndexes Array declaration
    // has an issue with Arrays ("Exclude from indexes cannot be set on a list value")
    // and cannot be used for now
    // See issue: https://github.com/googleapis/nodejs-datastore/issues/14

    const data = Object.keys(entity.entityData).reduce((acc, key) => {
        if (typeof entity.entityData[key] !== 'undefined') {
            acc[key] = entity.entityData[key];
        }
        return acc;
    }, {});

    Object.keys(data).forEach((k) => {
        if (entity.entityData[k] !== null) {
            propConfig = entity.schema.paths[k];

            isArray = propConfig && (propConfig.type === 'array' ||
                (propConfig.joi && propConfig.joi._type === 'array'));

            isObject = propConfig && (propConfig.type === 'object' ||
                (propConfig.joi && propConfig.joi._type === 'object'));

            if (isArray && propConfig.excludeFromIndexes === true) {
                // We exclude all the primitives from Array
                // The format is "entityProp[]"
                excludeFromIndexes.push(`${k}[]`);
            } else if (isObject && propConfig.excludeFromIndexes === true) {
                // For "object" type we automatically set all its properties to excludeFromIndexes: true
                // which is what most of us expect.
                Object.keys(entity.entityData[k]).forEach((kk) => {
                    // We add the embedded property to our Array of excludedFromIndexes
                    // The format is "entityProp.entityKey"
                    excludeFromIndexes.push(`${k}.${kk}`);
                });
            }
        }
    });

    const datastoreFormat = {
        key: entity.entityKey,
        data,
    };

    if (excludeFromIndexes.length > 0) {
        datastoreFormat.excludeFromIndexes = excludeFromIndexes;
    }

    if (options.method) {
        datastoreFormat.method = options.method;
    }

    return datastoreFormat;
}

function fromDatastore(entity, options = {}) {
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
function entitiesToDatastore(entities, options) {
    const multiple = is.array(entities);
    entities = arrify(entities);

    if (entities[0].className !== 'Entity') {
        // Not an entity instance, nothing to do here...
        return entities;
    }

    const result = entities.map(e => toDatastore(e, options));

    return multiple ? result : result[0];
}

module.exports = {
    toDatastore,
    fromDatastore,
    entitiesToDatastore,
};
