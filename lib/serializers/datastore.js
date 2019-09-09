'use strict';

const is = require('is');
const arrify = require('arrify');

function toDatastore(entity, options = {}) {
    // For now the more robust excudeFromIndexes Array declaration
    // has an issue with Arrays ("Exclude from indexes cannot be set on a list value")
    // and cannot be used for now
    // See issue: https://github.com/googleapis/nodejs-datastore/issues/14

    const data = Object.entries(entity.entityData).reduce((acc, [key, value]) => {
        if (typeof value !== 'undefined') {
            acc[key] = value;
        }
        return acc;
    }, {});

    const excludeFromIndexes = getExcludeFromIndexes();

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

    // ---------

    function getExcludeFromIndexes() {
        const excluded = [...entity.excludeFromIndexes] || [];
        let isArray;
        let isObject;
        let propConfig;
        let propValue;

        Object.keys(data).forEach(prop => {
            propValue = entity.entityData[prop];
            if (propValue === null) {
                return;
            }
            propConfig = entity.schema.paths[prop];

            isArray = propConfig && (propConfig.type === 'array'
              || (propConfig.joi && propConfig.joi._type === 'array'));

            isObject = propConfig && (propConfig.type === 'object'
            || (propConfig.joi && propConfig.joi._type === 'object'));

            if (isArray && propConfig.excludeFromIndexes === true) {
                // We exclude all the primitives from Array
                // The format is "entityProp[]"
                excluded.push(`${prop}[]`);
            } else if (isObject && propConfig.excludeFromIndexes === true) {
                // For "object" type we automatically set all its properties to excludeFromIndexes: true
                // which is what most of us expect.
                Object.keys(propValue).forEach(k => {
                    // We add the embedded property to our Array of excludedFromIndexes
                    // The format is "entityProp.entityKey"
                    excluded.push(`${prop}.${k}`);
                });
            }
        });

        return excluded;
    }
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

        Object.keys(entity).forEach(k => {
            if (options.readAll || !{}.hasOwnProperty.call(schema.paths, k) || schema.paths[k].read !== false) {
                let value = entity[k];

                if ({}.hasOwnProperty.call(this.schema.paths, k)) {
                    // During queries @google-cloud converts datetime to number
                    if (this.schema.paths[k].type === 'datetime' && is.number(value)) {
                        value = new Date(value / 1000);
                    }

                    // Sanitise embedded objects
                    if (typeof this.schema.paths[k].excludeFromRead !== 'undefined'
                        && is.array(this.schema.paths[k].excludeFromRead)
                        && !options.readAll) {
                        this.schema.paths[k].excludeFromRead.forEach(prop => {
                            const segments = prop.split('.');
                            let v = value;

                            while (segments.length > 1 && v !== undefined) {
                                v = v[segments.shift()];
                            }

                            const segment = segments.pop();

                            if (v !== undefined && segment in v) {
                                delete v[segment];
                            }
                        });
                    }
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
