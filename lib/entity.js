
'use strict';

const is = require('is');
const hooks = require('promised-hooks');
const arrify = require('arrify');

const datastoreSerializer = require('./serializer').Datastore;
const defaultValues = require('./helpers/defaultValues');
const { errorCodes } = require('./errors');
const { validation, populateHelpers } = require('./helpers');

const { populateFactory } = populateHelpers;

class Entity {
    constructor(data, id, ancestors, namespace, key) {
        this.className = 'Entity';
        this.schema = this.constructor.schema;
        this.excludeFromIndexes = {};

        /**
         * Object to store custom data for the entity.
         * In some cases we might want to add custom data onto the entity
         * and as Typescript won't allow random properties to be added, this
         * is the place to add data based on the context.
         */
        this.context = {};

        if (key) {
            if (!this.gstore.ds.isKey(key)) {
                throw new Error('Entity Key must be a Datastore Key');
            }
            this.entityKey = key;
        } else {
            this.entityKey = createKey(this, id, ancestors, namespace);
        }

        this.setId();

        // create entityData from data provided
        this.____buildEntityData(data || {});

        /**
         * Create virtual properties (getters and setters for entityData object)
         */
        Object.keys(this.schema.paths)
            .filter(pathKey => ({}.hasOwnProperty.call(this.schema.paths, pathKey)))
            .forEach(pathKey => Object.defineProperty(this, pathKey, {
                get: function getProp() { return this.entityData[pathKey]; },
                set: function setProp(newValue) {
                    this.entityData[pathKey] = newValue;
                },
            }));

        // wrap entity with hook methods
        hooks.wrap(this);

        // add middleware defined on Schena
        registerHooksFromSchema(this);
    }

    save(transaction, opts = {}) {
        this.__hooksEnabled = true;
        const _this = this;
        const options = {
            method: 'upsert',
            sanitizeEntityData: true,
            ...opts,
        };

        // Sanitize
        if (options.sanitizeEntityData) {
            this.entityData = this.constructor.sanitize.call(
                this.constructor, this.entityData, { disabled: ['write'] }
            );
        }

        // Validate
        const { error } = validate();
        if (error) {
            return Promise.reject(error);
        }

        this.entityData = prepareData.call(this);

        const entity = datastoreSerializer.toDatastore(this);
        entity.method = options.method;

        if (transaction) {
            if (transaction.constructor.name !== 'Transaction') {
                return Promise.reject(new Error('Transaction needs to be a gcloud Transaction'));
            }

            addPostHooksTransaction.call(this);
            transaction.save(entity);

            return Promise.resolve(this);
        }

        return this.gstore.ds.save(entity).then(onSuccess);

        // --------------------------

        function onSuccess() {
            /**
             * Make sure to clear the cache for this Entity Kind
             */
            if (_this.constructor.__hasCache(options)) {
                return _this.constructor.clearCache()
                    .then(() => _this)
                    .catch(err => {
                        let msg = 'Error while clearing the cache after saving the entity.';
                        msg += 'The entity has been saved successfully though. ';
                        msg += 'Both the cache error and the entity saved have been attached.';
                        const cacheError = new Error(msg);
                        cacheError.__entity = _this;
                        cacheError.__cacheError = err;
                        throw cacheError;
                    });
            }

            _this.setId();

            return _this;
        }

        function validate() {
            let { error: err } = validateEntityData();

            if (!err) {
                ({ error: err } = validateMethod(options.method));
            }

            return { error: err };
        }

        function validateEntityData() {
            if (_this.schema.options.validateBeforeSave) {
                return _this.validate();
            }

            return { error: null };
        }

        function validateMethod(method) {
            const allowed = {
                update: true,
                insert: true,
                upsert: true,
            };

            return !allowed[method]
                ? { error: new Error('Method must be either "update", "insert" or "upsert"') }
                : { error: null };
        }

        /**
         * Process some basic formatting to the entity data before save
         * - automatically set the modifiedOn property to current date (if exists on schema)
         * - convert object with latitude/longitude to Datastore GeoPoint
         */
        function prepareData() {
            updateModifiedOn.call(this);
            convertGeoPoints.call(this);

            return this.entityData;

            //--------------------------

            /**
             * If the schema has a "modifiedOn" property we automatically
             * update its value to the current dateTime
            */
            function updateModifiedOn() {
                if ({}.hasOwnProperty.call(this.schema.paths, 'modifiedOn')) {
                    this.entityData.modifiedOn = new Date();
                }
            }

            /**
             * If the entityData has some property of type 'geoPoint'
             * and its value is an js object with "latitude" and "longitude"
             * we convert it to a datastore GeoPoint.
            */
            function convertGeoPoints() {
                if (!{}.hasOwnProperty.call(this.schema.__meta, 'geoPointsProps')) {
                    return;
                }

                this.schema.__meta.geoPointsProps.forEach(property => {
                    if ({}.hasOwnProperty.call(_this.entityData, property)
                        && _this.entityData[property] !== null
                        && _this.entityData[property].constructor.name !== 'GeoPoint') {
                        _this.entityData[property] = _this.gstore.ds.geoPoint(_this.entityData[property]);
                    }
                });
            }
        }

        /**
         * If it is a transaction, we create a hooks.post array that will be executed
         * when transaction succeeds by calling transaction.execPostHooks() (returns a Promises)
         */
        function addPostHooksTransaction() {
            // disable (post) hooks, we will only trigger them on transaction succceed
            this.__hooksEnabled = false;
            this.constructor.hooksTransaction.call(
                _this,
                transaction,
                this.__posts
                    ? this.__posts.save
                    : undefined
            );
        }
    }

    validate() {
        const {
            entityData, schema, entityKind, gstore,
        } = this;

        return validation.validate(
            entityData,
            schema,
            entityKind,
            gstore.ds
        );
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

    setId() {
        this.id = this.entityKey.id || this.entityKey.name;
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
    datastoreEntity(options = {}) {
        const _this = this;

        if (this.constructor.__hasCache(options)) {
            return this.gstore.cache.keys
                .read(this.entityKey, options)
                .then(onSuccess);
        }
        return this.gstore.ds.get(this.entityKey).then(onSuccess);

        // ------------------------

        function onSuccess(result) {
            const datastoreEntity = result ? result[0] : null;

            if (!datastoreEntity) {
                if (_this.gstore.config.errorOnEntityNotFound) {
                    const error = new Error('Entity not found');
                    error.code = errorCodes.ERR_ENTITY_NOT_FOUND;
                    throw error;
                }

                return null;
            }

            _this.entityData = datastoreEntity;
            return _this;
        }
    }

    populate(path, propsToSelect) {
        const refsToPopulate = [];

        const promise = Promise.resolve(this)
            .then(this.constructor.populate(refsToPopulate));

        promise.populate = populateFactory(refsToPopulate, promise, this.constructor);
        promise.populate(path, propsToSelect);
        return promise;
    }

    getEntityDataWithVirtuals() {
        const { virtuals } = this.schema;
        const entityData = { ...this.entityData };

        Object.keys(virtuals).forEach(k => {
            if ({}.hasOwnProperty.call(entityData, k)) {
                virtuals[k].applySetters(entityData[k], entityData);
            } else {
                virtuals[k].applyGetters(entityData);
            }
        });

        return entityData;
    }

    ____buildEntityData(data) {
        const { schema } = this;
        const isJoiSchema = schema.isJoi;

        // If Joi schema, get its default values
        if (isJoiSchema) {
            const { error, value } = schema.validateJoi(data);

            if (!error) {
                this.entityData = { ...value };
            }
        }

        this.entityData = { ...this.entityData, ...data };

        let isArray;
        let isObject;

        Object.entries(schema.paths).forEach(([key, prop]) => {
            const hasValue = {}.hasOwnProperty.call(this.entityData, key);
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

                this.entityData[key] = value;
            }

            // Set excludeFromIndexes
            // ----------------------
            isArray = prop.type === Array || (prop.joi && prop.joi._type === 'array');
            isObject = prop.type === Object || (prop.joi && prop.joi._type === 'object');

            if (prop.excludeFromIndexes === true) {
                if (isArray) {
                    // We exclude both the array values + all the child properties of object items
                    this.excludeFromIndexes[key] = [`${key}[]`, `${key}[].*`];
                } else if (isObject) {
                    // We exclude the emmbeded entity + all its properties
                    this.excludeFromIndexes[key] = [key, `${key}.*`];
                } else {
                    this.excludeFromIndexes[key] = [key];
                }
            } else if (prop.excludeFromIndexes !== false) {
                const excludedArray = arrify(prop.excludeFromIndexes);
                if (isArray) {
                    // The format to exclude a property from an embedded entity inside
                    // an array is: "myArrayProp[].embeddedKey"
                    this.excludeFromIndexes[key] = excludedArray.map(propExcluded => `${key}[].${propExcluded}`);
                } else if (isObject) {
                // The format to exclude a property from an embedded entity
                    // is: "myEmbeddedEntity.key"
                    this.excludeFromIndexes[key] = excludedArray.map(propExcluded => `${key}.${propExcluded}`);
                }
            }
        });

        // add Symbol Key to the entityData
        this.entityData[this.gstore.ds.KEY] = this.entityKey;
    }
}

// Private
// -------
function createKey(self, id, ancestors, namespace) {
    if (id && !is.number(id) && !is.string(id)) {
        throw new Error('id must be a string or a number');
    }

    const hasAncestors = typeof ancestors !== 'undefined' && ancestors !== null && is.array(ancestors);

    /*
    /* Create copy of ancestors to avoid mutating the Array
    */
    if (hasAncestors) {
        ancestors = ancestors.slice();
    }

    let path;
    if (id) {
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
        callQueue[method].pres.forEach(fn => {
            self.pre(method, fn);
        });

        // Add Pre hooks
        callQueue[method].post.forEach(fn => {
            self.post(method, fn);
        });
    }
    return self;
}

module.exports = Entity;
