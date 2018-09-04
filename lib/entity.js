
'use strict';

const is = require('is');
const hooks = require('promised-hooks');
const arrify = require('arrify');

const utils = require('./utils');
const datastoreSerializer = require('./serializer').Datastore;
const defaultValues = require('./helpers/defaultValues');
const { errorCodes } = require('./errors');

class Entity {
    constructor(data, id, ancestors, namespace, key) {
        this.className = 'Entity';

        this.schema = this.constructor.schema;
        this.excludeFromIndexes = [];

        if (key) {
            if (key.constructor.name === 'Key') {
                this.entityKey = key;
            } else {
                throw new Error('Entity Key must be an instance of gcloud Key');
            }
        } else {
            this.entityKey = createKey(this, id, ancestors, namespace);
        }

        // create entityData from data passed
        this.entityData = buildEntityData(this, data || {});

        // wrap entity with hook methods
        hooks.wrap(this);

        // add middleware defined on Schena
        registerHooksFromSchema(this);
    }

    plain(options) {
        options = typeof options === 'undefined' ? {} : options;

        if (typeof options !== 'undefined' && !is.object(options)) {
            throw new Error('Options must be an Object');
        }
        const readAll = !!options.readAll || false;
        const virtuals = !!options.virtuals || false;
        const showKey = !!options.showKey || false;

        if (virtuals) {
            this.entityData = this.getEntityDataWithVirtuals();
        }

        const data = datastoreSerializer.fromDatastore.call(this, this.entityData, { readAll, showKey });

        return data;
    }

    get(path) {
        if ({}.hasOwnProperty.call(this.schema.virtuals, path)) {
            return this.schema.virtuals[path].applyGetters(this.entityData);
        }
        return this.entityData[path];
    }

    set(path, value) {
        if ({}.hasOwnProperty.call(this.schema.virtuals, path)) {
            return this.schema.virtuals[path].applySetters(value, this.entityData);
        }

        this.entityData[path] = value;
        return this;
    }

    /**
     * Return a Model from Gstore
     * @param name : model name
     */
    model(name) {
        return this.constructor.gstore.model(name);
    }

    /**
     * Fetch entity from Datastore
     *
     * @param {Function} cb Callback
     */
    datastoreEntity(...args) {
        const _this = this;
        const cb = args.pop();
        const options = args[0] || {};

        if (this.constructor.__hasCache(options)) {
            return this.gstore.cache.keys
                .read(this.entityKey, options)
                .then(e => onSuccess([e]), onError);
        }
        return this.gstore.ds.get(this.entityKey).then(onSuccess, onError);

        // ------------------------

        function onSuccess(result) {
            const datastoreEntity = result ? result[0] : null;

            if (!datastoreEntity) {
                if (_this.gstore.config.errorOnEntityNotFound) {
                    return cb({
                        code: errorCodes.ERR_ENTITY_NOT_FOUND,
                        message: 'Entity not found',
                    });
                }

                return cb(null, null);
            }

            _this.entityData = datastoreEntity;
            return cb(null, _this);
        }

        function onError(err) {
            return cb(err);
        }
    }

    getEntityDataWithVirtuals() {
        const { virtuals } = this.schema;
        const entityData = Object.assign({}, this.entityData);

        Object.keys(virtuals).forEach((k) => {
            if ({}.hasOwnProperty.call(entityData, k)) {
                virtuals[k].applySetters(entityData[k], entityData);
            } else {
                virtuals[k].applyGetters(entityData);
            }
        });

        return entityData;
    }
}

// Private
// -------
function createKey(self, id, ancestors, namespace) {
    const hasAncestors = typeof ancestors !== 'undefined' && ancestors !== null && is.array(ancestors);

    /*
    /* Create copy of ancestors to avoid mutating the Array
    */
    if (hasAncestors) {
        ancestors = ancestors.slice();
    }

    let path;
    if (id) {
        id = parseId(self, id);
        path = hasAncestors ? ancestors.concat([self.entityKind, id]) : [self.entityKind, id];
    } else {
        if (hasAncestors) {
            ancestors.push(self.entityKind);
        }
        path = hasAncestors ? ancestors : self.entityKind;
    }

    if (namespace && !is.array(path)) {
        path = [path];
    }
    return namespace ? self.gstore.ds.key({ namespace, path }) : self.gstore.ds.key(path);
}

/**
 * Parse the id and according to the keyType config in the Schema ("name"|"id"|<undefined>)
 * it will convert an '123'(string) id to 123 (int).
 * @param {*} self -- the entity instance
 * @param {*} id -- id passed in constructor
 */
function parseId(self, id) {
    const { options } = self.schema;

    if (is.string(id)) {
        if (options && options.keyType === 'name') {
            return id;
        } else if (options.keyType === 'id') {
            return self.gstore.ds.int(id);
        }
        // auto convert string number to number
        return isFinite(id) ? self.gstore.ds.int(id) : id;
    } else if (!is.number(id)) {
        throw new Error('id must be a string or a number');
    }

    return id;
}

function buildEntityData(self, data) {
    const { schema } = self;
    const isJoiSchema = !is.undef(schema._joi);

    let entityData;

    // If Joi schema, get its default values
    if (isJoiSchema) {
        const { error, value } = schema._joi.validate(data);

        if (!error) {
            entityData = Object.assign({}, value);
        }
    }

    entityData = Object.assign({}, entityData, data);

    let isTypeArray;

    Object.keys(schema.paths).forEach((k) => {
        const prop = schema.paths[k];
        const hasValue = {}.hasOwnProperty.call(entityData, k);
        const isOptional = {}.hasOwnProperty.call(prop, 'optional') && prop.optional !== false;
        const isRequired = {}.hasOwnProperty.call(prop, 'required') && prop.required === true;

        // Set Default Values
        if (!isJoiSchema && !hasValue && !isOptional) {
            let value = null;

            if ({}.hasOwnProperty.call(prop, 'default')) {
                if (typeof prop.default === 'function') {
                    value = prop.default();
                } else {
                    value = prop.default;
                }
            }

            if (({}).hasOwnProperty.call(defaultValues.__map__, value)) {
                /**
                 * If default value is in the gstore.defaultValue hashTable
                 * then execute the handler for that shortcut
                 */
                value = defaultValues.__handler__(value);
            } else if (value === null && {}.hasOwnProperty.call(prop, 'values') && !isRequired) {
                // Default to first value of the allowed values if **not** required
                [value] = prop.values;
            }

            entityData[k] = value;
        }

        // Set excludeFromIndexes
        // ----------------------
        isTypeArray = prop.type === 'array' || (prop.joi && prop.joi._type === 'array');

        if (prop.excludeFromIndexes === true && !isTypeArray) {
            self.excludeFromIndexes.push(k);
        } else if (!is.boolean(prop.excludeFromIndexes)) {
            // For embedded entities we can set which properties are excluded from indexes
            // by passing a string|array of properties

            let formatted;
            const exFromIndexes = arrify(prop.excludeFromIndexes);

            if (prop.type === 'array') {
                // The format to exclude a property from an embedded entity inside
                // an array is: "myArrayProp[].embeddedKey"
                formatted = exFromIndexes.map(excluded => `${k}[].${excluded}`);
            } else {
                // The format to exclude a property from an embedded entity
                // is: "myEmbeddedEntity.key"
                formatted = exFromIndexes.map(excluded => `${k}.${excluded}`);
            }

            self.excludeFromIndexes = [...self.excludeFromIndexes, ...formatted];
        }
    });

    // add Symbol Key to the entityData
    entityData[self.gstore.ds.KEY] = self.entityKey;

    return entityData;
}

function registerHooksFromSchema(self) {
    const callQueue = self.schema.callQueue.entity;

    if (!Object.keys(callQueue).length) {
        return self;
    }

    Object.keys(callQueue).forEach(addHooks);

    // ---------------------------------------

    function addHooks(method) {
        if (!self[method]) {
            return;
        }

        // Add Pre hooks
        callQueue[method].pres.forEach((fn) => {
            self.pre(method, fn);
        });

        // Add Pre hooks
        callQueue[method].post.forEach((fn) => {
            self.post(method, fn);
        });
    }
    return self;
}

// Promisify Entity methods
Entity.prototype.datastoreEntity = utils.promisify(Entity.prototype.datastoreEntity);

module.exports = Entity;
