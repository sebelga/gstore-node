
'use strict';

const is = require('is');
const hooks = require('promised-hooks');

const utils = require('./utils');
const datastoreSerializer = require('./serializer').Datastore;
const defaultValues = require('./helpers/defaultValues');

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
        this.entityData = buildEntityData(this, data);

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
            this.addVirtuals(this.entityData);
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
    datastoreEntity(cb) {
        const _this = this;

        return this.gstore.ds.get(this.entityKey).then(onSuccess, onError);

        // ------------------------

        function onSuccess(result) {
            const datastoreEntity = result ? result[0] : null;

            if (!datastoreEntity) {
                return cb({
                    code: 404,
                    message: 'Entity not found',
                });
            }

            _this.entityData = datastoreEntity;
            return cb(null, _this);
        }

        function onError(err) {
            return cb(err);
        }
    }

    addVirtuals() {
        const virtuals = this.schema.virtuals;
        const entityData = this.entityData;

        Object.keys(virtuals).forEach((k) => {
            if ({}.hasOwnProperty.call(entityData, k)) {
                virtuals[k].applySetters(entityData[k], entityData);
            } else {
                virtuals[k].applyGetters(entityData);
            }
        });

        return this.entityData;
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
        if (is.string(id)) {
            id = isFinite(id) ? parseInt(id, 10) : id;
        } else if (!is.number(id)) {
            throw new Error('id must be a string or a number');
        }
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

function buildEntityData(self, data) {
    const schema = self.schema;
    const entityData = {};

    if (data) {
        Object.keys(data).forEach((k) => {
            entityData[k] = data[k];
        });
    }

    // set default values & excludedFromIndex
    Object.keys(schema.paths).forEach((k) => {
        const schemaProperty = schema.paths[k];

        if (!{}.hasOwnProperty.call(entityData, k) &&
            (!{}.hasOwnProperty.call(schemaProperty, 'optional') || schemaProperty.optional === false)) {
            let value;
            if ({}.hasOwnProperty.call(schemaProperty, 'default')) {
                if (typeof schemaProperty.default === 'function') {
                    value = schemaProperty.default();
                } else {
                    value = schemaProperty.default;
                }
            } else {
                value = null;
            }

            if (({}).hasOwnProperty.call(defaultValues.__map__, value)) {
                /**
                 * If default value is in the gstore.defaultValue hashTable
                 * then execute the handler for that shortcut
                 */
                value = defaultValues.__handler__(value);
            } else if (value === null && {}.hasOwnProperty.call(schemaProperty, 'values')) {
                value = schemaProperty.values[0];
            }

            entityData[k] = value;
        }
        if (schemaProperty.excludeFromIndexes === true) {
            self.excludeFromIndexes.push(k);
        }
    });

    // add Symbol Key to data
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

module.exports = exports = Entity;
