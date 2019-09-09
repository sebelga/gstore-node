'use strict';

const chai = require('chai');
const sinon = require('sinon');
const Joi = require('@hapi/joi');
const { Datastore } = require('@google-cloud/datastore');

const ds = new Datastore({
    namespace: 'com.mydomain',
    apiEndpoint: 'http://localhost:8080',
});
const Entity = require('../lib/entity');
const gstoreErrors = require('../lib/errors');
const datastoreSerializer = require('../lib/serializer').Datastore;
const { Gstore } = require('../lib');
const { validation } = require('../lib/helpers');
const Transaction = require('./mocks/transaction');

const gstore = new Gstore();
const gstoreWithCache = new Gstore({ cache: { config: { ttl: { keys: 600 } } } });
const { Schema } = gstore;

const { expect, assert } = chai;

describe('Entity', () => {
    let schema;
    let GstoreModel;
    let entity;
    let transaction;

    beforeEach(() => {
        gstore.models = {};
        gstore.modelSchemas = {};
        gstore.options = {};
        gstore.connect(ds);
        gstoreWithCache.connect(ds);

        schema = new Schema({
            name: { type: String, default: 'Mick' },
            lastname: { type: String },
            password: { type: String, read: false },
            website: { type: String, validate: 'isURL' },
        });

        schema.virtual('fullname').get(function getFullName() {
            return `${this.name} ${this.lastname}`;
        });

        schema.virtual('fullname').set(function setFullName(name) {
            const split = name.split(' ');
            [this.name, this.lastname] = split;
        });

        GstoreModel = gstore.model('User', schema);
        transaction = new Transaction();

        sinon.stub(ds, 'save').resolves();
        sinon.spy(transaction, 'save');
    });

    afterEach(() => {
        ds.save.restore();
        transaction.save.restore();
    });

    describe('intantiate', () => {
        it('should initialized properties', () => {
            entity = new GstoreModel({}, 'keyid');

            assert.isDefined(entity.entityData);
            assert.isDefined(entity.entityKey);
            assert.isDefined(entity.schema);
            assert.isDefined(entity.pre);
            assert.isDefined(entity.post);
            expect(entity.excludeFromIndexes).deep.equal([]);
        });

        it('should add data passed to entityData', () => {
            entity = new GstoreModel({ name: 'John' });
            expect(entity.entityData.name).to.equal('John');
        });

        it('should have default if no data passed', () => {
            entity = new GstoreModel();
            expect(entity.entityData.name).to.equal('Mick');
        });

        it('should not add any data if nothing is passed', () => {
            schema = new Schema({
                name: { type: 'string', optional: true },
            });
            GstoreModel = gstore.model('BlogPost', schema);

            entity = new GstoreModel();

            expect(Object.keys(entity.entityData).length).to.equal(0);
        });

        it('should set default values or null from schema', () => {
            function fn() {
                return 'generatedValue';
            }

            schema = new Schema({
                name: { type: 'string', default: 'John' },
                lastname: { type: 'string' },
                email: { optional: true },
                generatedValue: { type: 'string', default: fn },
                availableValues: { values: ['a', 'b', 'c'] },
                availableValuesRequired: { values: ['a', 'b', 'c'], required: true },
            });

            GstoreModel = gstore.model('BlogPost', schema);

            entity = new GstoreModel({});

            expect(entity.entityData.name).equal('John');
            expect(entity.entityData.lastname).equal(null);
            expect(entity.entityData.email).equal(undefined);
            expect(entity.entityData.generatedValue).equal('generatedValue');
            expect(entity.entityData.availableValues).equal('a');
            expect(entity.entityData.availableValuesRequired).equal(null);
        });

        it('should set values from Joi schema', () => {
            const generateFullName = context => (
                `${context.name} ${context.lastname}`
            );

            schema = new Schema({
                name: { joi: Joi.string() },
                lastname: { joi: Joi.string().default('Jagger') },
                fullname: { joi: Joi.string().default(generateFullName, 'generated fullname') },
            }, { joi: true });

            GstoreModel = gstore.model('EntityKind', schema);

            const user = new GstoreModel({ name: 'Mick' });

            expect(user.entityData.lastname).equal('Jagger');
            expect(user.entityData.fullname).equal('Mick Jagger');
        });

        it('should not set default if Joi validation does not pass', () => {
            schema = new Schema({
                name: { joi: Joi.string().default('test').required() },
                lastname: { joi: Joi.string().default('Jagger') },
                age: { joi: Joi.number() },
            }, { joi: true });

            GstoreModel = gstore.model('EntityKind', schema);

            const user = new GstoreModel({ age: 77 });

            expect(user.age).equal(77);
            assert.isUndefined(user.entityData.lastname);
        });

        it('should call handler for default values in gstore.defaultValues constants', () => {
            sinon.spy(gstore.defaultValues, '__handler__');
            schema = new Schema({
                createdOn: { type: 'dateTime', default: gstore.defaultValues.NOW },
            });
            GstoreModel = gstore.model('BlogPost', schema);
            entity = new GstoreModel({});

            expect(gstore.defaultValues.__handler__.calledOnce).equal(true);
            return entity;
        });

        it('should not add default to optional properties', () => {
            schema = new Schema({
                name: { type: 'string' },
                email: { optional: true },
            });
            GstoreModel = gstore.model('BlogPost', schema);

            entity = new GstoreModel({});

            expect(entity.entityData.email).equal(undefined);
        });

        it('should create its array of excludeFromIndexes', () => {
            schema = new Schema({
                name: { excludeFromIndexes: true },
                age: { excludeFromIndexes: true, type: 'int' },
                embedded: { excludeFromIndexes: ['prop1', 'prop2'] },
                arrayValue: { excludeFromIndexes: 'property', type: 'array' },
                // Array in @google-cloud have to be set on the data value
                arrayValue2: { excludeFromIndexes: true, type: 'array' },
                arrayValue3: { excludeFromIndexes: true, joi: Joi.array() },
            });
            GstoreModel = gstore.model('BlogPost', schema);

            entity = new GstoreModel({ name: 'John' });

            expect(entity.excludeFromIndexes).deep.equal([
                'name', 'age', 'embedded.prop1', 'embedded.prop2', 'arrayValue[].property',
            ]);
        });

        describe('should create Datastore Key', () => {
            beforeEach(() => {
                sinon.spy(ds, 'key');

                GstoreModel = gstore.model('BlogPost', schema);
            });

            afterEach(() => {
                ds.key.restore();
            });

            it('---> with a full Key (String keyname passed)', () => {
                entity = new GstoreModel({}, 'keyid');

                expect(entity.entityKey.kind).equal('BlogPost');
                expect(entity.entityKey.name).equal('keyid');
            });

            it('---> with a full Key (String with including numbers)', () => {
                entity = new GstoreModel({}, '123:456');

                expect(entity.entityKey.name).equal('123:456');
            });

            it('---> with a full Key (Integer keyname passed)', () => {
                entity = new GstoreModel({}, 123);

                expect(entity.entityKey.id).equal(123);
            });

            it('---> with a full Key ("string" Integer keyname passed)', () => {
                entity = new GstoreModel({}, '123');

                expect(entity.entityKey.id).equal('123');
            });

            it('---> with a full Key ("string" Integer **not** converted)', () => {
                schema = new Schema({
                    name: { type: 'string' },
                }, { keyType: 'name' });
                GstoreModel = gstore.model('EntityKind', schema);

                entity = new GstoreModel({}, '123');

                expect(entity.entityKey.name).equal('123');
            });

            it('---> throw error is id passed is not string or number', () => {
                const fn = () => {
                    entity = new GstoreModel({}, {});
                    return entity;
                };

                expect(fn).throw(Error);
            });

            it('---> with a partial Key (auto-generated id)', () => {
                entity = new GstoreModel({});

                expect(entity.entityKey.kind).to.deep.equal('BlogPost');
            });

            it('---> with an ancestor path (auto-generated id)', () => {
                entity = new GstoreModel({}, null, ['Parent', 1234]);

                expect(entity.entityKey.parent.kind).equal('Parent');
                expect(entity.entityKey.parent.id).equal(1234);
                expect(entity.entityKey.kind).equal('BlogPost');
            });

            it('---> with an ancestor path (manual id)', () => {
                entity = new GstoreModel({}, 'entityKind', ['Parent', 1234]);

                expect(entity.entityKey.parent.kind).equal('Parent');
                expect(entity.entityKey.parent.id).equal(1234);
                expect(entity.entityKey.kind).equal('BlogPost');
                expect(entity.entityKey.name).equal('entityKind');
            });

            it('---> with a namespace', () => {
                entity = new GstoreModel({}, null, null, 'com.otherdomain');

                expect(entity.entityKey.namespace).equal('com.otherdomain');
            });

            it('---> with a gcloud Key', () => {
                const key = ds.key('BlogPost', 1234);

                entity = new GstoreModel({}, null, null, null, key);

                expect(entity.entityKey).equal(key);
            });

            it('---> throw error if key is not instance of Key', () => {
                function fn() {
                    entity = new GstoreModel({}, null, null, null, {});
                    return entity;
                }

                expect(fn).to.throw();
            });
        });

        describe('should register schema hooks', () => {
            let spyOn;

            beforeEach(() => {
                spyOn = {
                    fnHookPre: () => Promise.resolve(),
                    fnHookPost: () => Promise.resolve({ __override: 1234 }),
                };

                sinon.spy(spyOn, 'fnHookPre');
                sinon.spy(spyOn, 'fnHookPost');
            });

            afterEach(() => {
                spyOn.fnHookPost.restore();
                spyOn.fnHookPre.restore();
            });

            it('should call pre hooks before saving and override arguments', () => {
                schema.pre('save', spyOn.fnHookPre);
                GstoreModel = gstore.model('BlogPost', schema);
                entity = new GstoreModel({ name: 'John' });

                return entity.save().then(() => {
                    expect(spyOn.fnHookPre.callCount).to.equal(1);
                });
            });

            it('should call pre and post hooks on custom method', () => {
                schema.method('newmethod', () => Promise.resolve());
                schema.pre('newmethod', spyOn.fnHookPre);
                schema.post('newmethod', spyOn.fnHookPost);
                GstoreModel = gstore.model('BlogPost', schema);
                entity = new GstoreModel({ name: 'John' });

                return entity.newmethod().then(() => {
                    expect(spyOn.fnHookPre.callCount).to.equal(1);
                    expect(spyOn.fnHookPost.callCount).to.equal(1);
                });
            });

            it('should call post hooks after saving and override resolve', () => {
                schema.post('save', spyOn.fnHookPost);
                GstoreModel = gstore.model('BlogPost', schema);
                entity = new GstoreModel({});

                return entity.save().then(result => {
                    expect(spyOn.fnHookPost.called).equal(true);
                    expect(result).equal(1234);
                });
            });

            it('should not do anything if no hooks on schema', () => {
                schema.callQueue = { model: {}, entity: {} };
                GstoreModel = gstore.model('BlogPost', schema);
                entity = new GstoreModel({ name: 'John' });

                assert.isUndefined(entity.__pres);
                assert.isUndefined(entity.__posts);
            });

            it('should not register unknown methods', () => {
                schema.callQueue = { model: {}, entity: {} };
                schema.pre('unknown', () => { });
                GstoreModel = gstore.model('BlogPost', schema);
                entity = new GstoreModel({});

                assert.isUndefined(entity.__pres);
                assert.isUndefined(entity.__posts);
            });
        });
    });

    describe('get / set', () => {
        let user;

        beforeEach(() => {
            user = new GstoreModel({ name: 'John', lastname: 'Snow' });
        });

        it('should get an entityData property', () => {
            const name = user.get('name');

            expect(name).equal('John');
        });

        it('should return virtual', () => {
            const fullname = user.get('fullname');

            expect(fullname).equal('John Snow');
        });

        it('should set an entityData property', () => {
            user.set('name', 'Gregory');

            const name = user.get('name');

            expect(name).equal('Gregory');
        });

        it('should set virtual', () => {
            user.set('fullname', 'Peter Jackson');

            expect(user.entityData.name).equal('Peter');
        });

        it('should get data on entity properties from the entity data', () => {
            GstoreModel = gstore.model('BlogPost', schema);

            entity = new GstoreModel({
                name: 'Jane',
                lastname: 'Does',
                password: 'JanesPassword',
            });

            expect(entity.name).to.equal('Jane');
            expect(entity.lastname).to.equal('Does');
            expect(entity.password).to.equal('JanesPassword');
        });

        it('should reflect changes to entity properties in the entity data', () => {
            GstoreModel = gstore.model('BlogPost', schema);

            entity = new GstoreModel({
                name: 'Jane',
                lastname: 'Does',
                password: 'JanesPassword',
            });

            entity.name = 'John';
            entity.lastname = 'Doe';
            entity.password = 'JoesPassword';

            expect(entity.entityData.name).to.equal('John');
            expect(entity.entityData.lastname).to.equal('Doe');
            expect(entity.entityData.password).to.equal('JoesPassword');
        });
    });

    describe('plain()', () => {
        beforeEach(() => {
            sinon.spy(datastoreSerializer, 'fromDatastore');
        });

        afterEach(() => {
            datastoreSerializer.fromDatastore.restore();
        });

        it('should throw an error is options is not of type Object', () => {
            const fn = () => {
                entity = new GstoreModel({ name: 'John' });
                entity.plain(true);
            };

            expect(fn).throw(Error);
        });

        it('should call datastoreSerializer "fromDatastore"', () => {
            entity = new GstoreModel({ name: 'John', password: 'test' });
            const { entityData } = entity;

            const output = entity.plain();

            expect(datastoreSerializer.fromDatastore.getCall(0).args[0]).deep.equal(entityData);
            expect(datastoreSerializer.fromDatastore.getCall(0).args[1]).deep.equal({ readAll: false, showKey: false });
            assert.isUndefined(output.password);
        });

        it('should call datastoreSerializer "fromDatastore" passing readAll parameter', () => {
            entity = new GstoreModel({ name: 'John', password: 'test' });

            const output = entity.plain({ readAll: true });

            expect(datastoreSerializer.fromDatastore.getCall(0).args[1]).deep.equal({ readAll: true, showKey: false });
            assert.isDefined(output.password);
        });

        it('should pass showKey parameter', () => {
            entity = new GstoreModel({});

            entity.plain({ showKey: true });

            expect(datastoreSerializer.fromDatastore.getCall(0).args[1]).deep.equal({ readAll: false, showKey: true });
        });

        it('should add virtuals', () => {
            entity = new GstoreModel({ name: 'John' });
            sinon.spy(entity, 'getEntityDataWithVirtuals');

            entity.plain({ virtuals: true });

            expect(entity.getEntityDataWithVirtuals.called).equal(true);
        });

        it('should clear embedded object excluded properties', () => {
            schema = new Schema({
                embedded: { excludeFromRead: ['prop1', 'prop2'] },
            });

            GstoreModel = gstore.model('HasEmbedded', schema);

            entity = new GstoreModel({ embedded: { prop1: '1', prop2: '2', prop3: '3' } });
            const plain = entity.plain({});

            assert.isUndefined(plain.embedded.prop1);
            assert.isUndefined(plain.embedded.prop2);
            expect(plain.embedded.prop3).equal('3');
        });

        it('should clear nested embedded object excluded properties', () => {
            schema = new Schema({
                embedded: { excludeFromRead: ['prop1', 'prop2.p1', 'prop3.p1.p11'] },
            });

            GstoreModel = gstore.model('HasEmbedded', schema);

            entity = new GstoreModel({
                embedded: {
                    prop1: '1',
                    prop2: { p1: 'p1', p2: 'p2' },
                    prop3: { p1: { p11: 'p11', p12: 'p12' }, p2: 'p2' },
                    prop4: '4',
                },
            });

            const plain = entity.plain({});

            assert.isUndefined(plain.embedded.prop1);
            expect(typeof plain.embedded.prop2).equal('object');
            assert.isUndefined(plain.embedded.prop2.p1);
            expect(plain.embedded.prop2.p2).equal('p2');
            expect(typeof plain.embedded.prop3).equal('object');
            expect(typeof plain.embedded.prop3.p1).equal('object');
            assert.isUndefined(plain.embedded.prop3.p1.p11);
            expect(plain.embedded.prop3.p1.p12).equal('p12');
            expect(plain.embedded.prop3.p2).equal('p2');
            expect(plain.embedded.prop4).equal('4');
        });

        it('should ignore incorrectly specified nested embedded object property paths', () => {
            schema = new Schema({
                embedded: { excludeFromRead: ['prop3.wrong.p1', 'prop4', 'prop4.p1.p2', 'prop5.p1'] },
            });

            GstoreModel = gstore.model('HasEmbedded', schema);

            entity = new GstoreModel({
                embedded: {
                    prop1: '1',
                    prop2: { p1: { p2: 'p2' } },
                    prop3: { p1: { p2: { p3: 'p3' } } },
                },
            });

            const plain = entity.plain();

            expect(plain.embedded.prop1).equal('1');
            expect(plain.embedded.prop2.p1.p2).equal('p2');
            expect(plain.embedded.prop3.p1.p2.p3).equal('p3');
        });

        it('should not clear nested embedded object excluded properties when specifying readAll: true', () => {
            schema = new Schema({
                embedded: { excludeFromRead: ['prop1', 'prop2.p1', 'prop3.p1.p11'] },
            });

            GstoreModel = gstore.model('HasEmbedded', schema);

            entity = new GstoreModel({
                embedded: {
                    prop1: '1',
                    prop2: { p1: 'p1', p2: 'p2' },
                    prop3: { p1: { p11: 'p11', p12: 'p12' }, p2: 'p2' },
                    prop4: '4',
                },
            });

            const plain = entity.plain({ readAll: true });

            expect(typeof plain.embedded.prop1).equal('string');
            expect(typeof plain.embedded.prop2).equal('object');
            expect(typeof plain.embedded.prop3).equal('object');
            expect(typeof plain.embedded.prop4).equal('string');
            expect(plain.embedded.prop1).equal('1');
            expect(plain.embedded.prop2.p1).equal('p1');
            expect(plain.embedded.prop2.p2).equal('p2');
            expect(plain.embedded.prop3.p1.p11).equal('p11');
            expect(plain.embedded.prop3.p1.p12).equal('p12');
            expect(plain.embedded.prop3.p2).equal('p2');
            expect(plain.embedded.prop4).equal('4');
        });
    });

    describe('datastoreEntity()', () => {
        it('should get the data from the Datastore and merge it into the entity', () => {
            const mockData = { name: 'John' };
            sinon.stub(ds, 'get').resolves([mockData]);

            entity = new GstoreModel({});

            return entity.datastoreEntity().then(_entity => {
                expect(ds.get.called).equal(true);
                expect(ds.get.getCall(0).args[0]).equal(entity.entityKey);
                expect(_entity.className).equal('Entity');
                expect(_entity.entityData).equal(mockData);

                ds.get.restore();
            });
        });

        it('should return 404 not found if no entity returned', () => {
            sinon.stub(ds, 'get').resolves([]);

            entity = new GstoreModel({});

            return entity.datastoreEntity().catch(err => {
                expect(err.code).equal(gstore.errors.codes.ERR_ENTITY_NOT_FOUND);
                expect(err.message).equal('Entity not found');
                ds.get.restore();
            });
        });

        it('should return 404 not found if no entity returned (2)', () => {
            sinon.stub(ds, 'get').resolves();

            entity = new GstoreModel({});

            return entity.datastoreEntity().catch(err => {
                expect(err.code).equal(gstore.errors.codes.ERR_ENTITY_NOT_FOUND);
                ds.get.restore();
            });
        });

        it('should return null if no entity returned', () => {
            gstore.config.errorOnEntityNotFound = false;

            sinon.stub(ds, 'get').resolves([]);

            entity = new GstoreModel({});

            return entity.datastoreEntity().then(_entity => {
                expect(_entity).equal(null);
                ds.get.restore();
            });
        });

        it('should bubble up error fetching the entity', () => {
            const error = { code: 500, message: 'Something went bad' };
            sinon.stub(ds, 'get').rejects(error);

            entity = new GstoreModel({});

            return entity.datastoreEntity().catch(err => {
                expect(err).equal(error);

                ds.get.restore();
            });
        });

        context('when cache is active', () => {
            let key;
            let mockData;

            beforeEach(() => {
                gstore.cache = gstoreWithCache.cache;

                key = GstoreModel.key(123);
                mockData = { name: 'John' };
                mockData[gstore.ds.KEY] = key;
            });

            afterEach(() => {
                // empty the cache
                gstore.cache.reset();
                delete gstore.cache;
            });

            it('should get value from cache', () => {
                const value = mockData;
                entity = new GstoreModel(mockData);
                entity.entityKey = key;

                sinon.spy(entity.gstore.cache.keys, 'read');
                sinon.stub(ds, 'get').resolves([mockData]);

                return gstore.cache.keys.set(key, value)
                    .then(() => (
                        entity.datastoreEntity({ ttl: 123456 })
                            .then(response => {
                                assert.ok(!ds.get.called);
                                expect(response.entityData).include(value);
                                assert.ok(entity.gstore.cache.keys.read.called);
                                const { args } = entity.gstore.cache.keys.read.getCall(0);
                                expect(args[0]).equal(key);
                                expect(args[1].ttl).equal(123456);

                                entity.gstore.cache.keys.read.restore();
                                ds.get.restore();
                            })
                    ));
            });

            it('should **not** get value from cache', () => {
                const value = mockData;
                entity = new GstoreModel(mockData);
                entity.entityKey = key;

                sinon.spy(entity.gstore.cache.keys, 'read');
                sinon.stub(ds, 'get').resolves([mockData]);

                return gstore.cache.keys.set(key, value)
                    .then(() => (
                        entity.datastoreEntity({ cache: false })
                            .then(() => {
                                assert.ok(ds.get.called);
                                assert.ok(!entity.gstore.cache.keys.read.called);

                                entity.gstore.cache.keys.read.restore();
                                ds.get.restore();
                            })
                    ));
            });
        });
    });

    describe('model()', () => {
        it('should be able to return model instances', () => {
            const imageSchema = new Schema({});
            const ImageModel = gstore.model('Image', imageSchema);

            const blog = new GstoreModel({});

            expect(blog.model('Image')).equal(ImageModel);
        });

        it('should be able to execute methods from other model instances', () => {
            const imageSchema = new Schema({});
            const ImageModel = gstore.model('Image', imageSchema);
            const mockEntities = [{ key: ds.key(['BlogPost', 1234]) }];

            sinon.stub(ImageModel, 'get').callsFake(() => Promise.resolve(mockEntities[0]));

            const blog = new GstoreModel({});

            return blog.model('Image')
                .get()
                .then(_entity => {
                    expect(_entity).equal(mockEntities[0]);
                });
        });
    });

    describe('getEntityDataWithVirtuals()', () => {
        let model;
        let User;

        beforeEach(() => {
            schema = new Schema({ firstname: {}, lastname: {} });

            schema.virtual('fullname').get(function getFullName() {
                return `${this.firstname} ${this.lastname}`;
            });

            schema.virtual('fullname').set(function setFullName(name) {
                const split = name.split(' ');
                [this.firstname, this.lastname] = split;
            });

            User = gstore.model('Client', schema);

            model = new User({ firstname: 'John', lastname: 'Snow' });
        });

        it('should add add virtuals on instance', () => {
            assert.isDefined(model.fullname);
        });

        it('setting on instance should modify entityData', () => {
            expect(model.fullname).equal('John Snow');
        });

        it('should add virtuals properties on entity instance', () => {
            expect(model.fullname).equal('John Snow');
            model.firstname = 'Mick';
            expect(model.fullname).equal('Mick Snow');
            model.fullname = 'Andre Agassi';
            expect(model.firstname).equal('Andre');
            expect(model.lastname).equal('Agassi');
            expect(model.entityData).deep.equal({ firstname: 'Andre', lastname: 'Agassi' });
        });

        it('should Not override', () => {
            model = new User({ firstname: 'John', lastname: 'Snow', fullname: 'Jooohn' });
            const entityData = model.getEntityDataWithVirtuals();

            expect(entityData.fullname).equal('Jooohn');
        });

        it('should read and parse virtual (set)', () => {
            model = new User({ fullname: 'John Snow' });

            const entityData = model.getEntityDataWithVirtuals();

            expect(entityData.firstname).equal('John');
            expect(entityData.lastname).equal('Snow');
        });

        it('should override existing', () => {
            model = new User({ firstname: 'Peter', fullname: 'John Snow' });

            const entityData = model.getEntityDataWithVirtuals();

            expect(entityData.firstname).equal('John');
        });

        it('should not allow reserved name for virtuals', () => {
            const func = () => {
                schema.virtual('plain').get(function getFullName() {
                    return `${this.firstname} ${this.lastname}`;
                });
            };

            expect(func).throws();
        });
    });

    describe('save()', () => {
        const data = { name: 'John', lastname: 'Snow' };

        beforeEach(() => {
            entity = new GstoreModel(data);
        });

        it('should return the entity saved', () => (
            entity.save().then(_entity => {
                expect(_entity.className).equal('Entity');
            })
        ));

        it('should validate() before', () => {
            const validateSpy = sinon.spy(entity, 'validate');

            return entity.save().then(() => {
                expect(validateSpy.called).equal(true);
            });
        });

        it('should NOT validate() data before', () => {
            schema = new Schema({}, { validateBeforeSave: false });
            GstoreModel = gstore.model('Blog', schema);
            entity = new GstoreModel({ name: 'John' });
            const validateSpy = sinon.spy(entity, 'validate');

            return entity.save().then(() => {
                expect(validateSpy.called).equal(false);
            });
        });

        it('should NOT save to Datastore if it didn\'t pass property validation', done => {
            entity = new GstoreModel({ unknown: 'John' });

            entity
                .save(null, { sanitizeEntityData: false })
                .then(() => {
                    throw new Error('Should not enter here.');
                })
                .catch(err => {
                    assert.isDefined(err);
                    expect(err.message).not.equal('Should not enter here.');
                    expect(ds.save.called).equal(false);
                    expect(err.code).equal(gstoreErrors.errorCodes.ERR_VALIDATION);
                    done();
                });
        });

        it('should NOT save to Datastore if it didn\'t pass value validation', done => {
            entity = new GstoreModel({ website: 'mydomain' });

            entity.save().catch(err => {
                assert.isDefined(err);
                expect(ds.save.called).equal(false);
                done();
            });
        });

        it('should convert to Datastore format before saving to Datastore', () => {
            const spySerializerToDatastore = sinon.spy(datastoreSerializer, 'toDatastore');

            return entity.save().then(() => {
                expect(entity.gstore.ds.save.calledOnce).equal(true);
                expect(spySerializerToDatastore.called).equal(true);
                expect(spySerializerToDatastore.getCall(0).args[0].className).equal('Entity');
                expect(spySerializerToDatastore.getCall(0).args[0].entityData).equal(entity.entityData);
                expect(spySerializerToDatastore.getCall(0).args[0].excludeFromIndexes).equal(entity.excludeFromIndexes);
                assert.isDefined(entity.gstore.ds.save.getCall(0).args[0].key);
                expect(entity.gstore.ds.save.getCall(0).args[0].key.constructor.name).equal('Key');
                assert.isDefined(entity.gstore.ds.save.getCall(0).args[0].data);

                spySerializerToDatastore.restore();
            });
        });

        it('should set "upsert" method by default', () => (
            entity.save().then(() => {
                expect(entity.gstore.ds.save.getCall(0).args[0].method).equal('upsert');
            })
        ));

        describe('options', () => {
            it('should accept a "method" parameter in options', () => (
                entity.save(null, { method: 'insert' }).then(() => {
                    expect(entity.gstore.ds.save.getCall(0).args[0].method).equal('insert');
                })
            ));

            it('should only allow "update", "insert", "upsert" as method', done => {
                entity.save(null, { method: 'something' }).catch(e => {
                    expect(e.message).equal('Method must be either "update", "insert" or "upsert"');

                    entity.save(null, { method: 'update' })
                        .then(() => entity.save(null, { method: 'upsert' }))
                        .then(() => {
                            done();
                        });
                });
            });
        });

        it('on Datastore error, return the error', () => {
            ds.save.restore();

            const error = {
                code: 500,
                message: 'Server Error',
            };
            sinon.stub(ds, 'save').rejects(error);

            entity = new GstoreModel({});

            return entity.save().catch(err => {
                expect(err).equal(error);
            });
        });

        it('should save entity in a transaction and execute "pre" hooks first', () => {
            schema = new Schema({});
            const spyPreHook = sinon.spy();
            schema.pre('save', () => {
                spyPreHook();
                return Promise.resolve();
            });

            const OtherModel = gstore.model('TransactionHooks', schema, gstore);
            entity = new OtherModel({});

            return entity.save(transaction)
                .then(_entity => {
                    expect(spyPreHook.called).equal(true);
                    expect(transaction.save.called).equal(true);
                    expect(spyPreHook.calledBefore(transaction.save)).equal(true);
                    assert.isDefined(_entity.entityData);
                });
        });

        it('should *not* save entity in a transaction if there are "pre" hooks', () => {
            schema = new Schema({});
            const spyPreHook = sinon.spy();
            schema.pre('save', () => {
                spyPreHook();
                return Promise.resolve();
            });
            const OtherModel = gstore.model('TransactionHooks', schema, gstore);
            entity = new OtherModel({});

            entity.save(transaction);

            expect(spyPreHook.called).equal(true);
            expect(transaction.save.called).equal(false);
        });

        it('should save entity in a transaction in sync', done => {
            const schema2 = new Schema({}, { validateBeforeSave: false });
            const ModelInstance2 = gstore.model('NewType', schema2, gstore);
            entity = new ModelInstance2({});
            entity.save(transaction);

            done();
        });

        it('should save entity in a transaction synchronous when validateBeforeSave desactivated', () => {
            schema = new Schema({ name: { type: String } }, { validateBeforeSave: false });

            const ModelInstanceTemp = gstore.model('BlogTemp', schema, gstore);
            entity = new ModelInstanceTemp({});

            entity.save(transaction);
            expect(transaction.save.called).equal(true);
        });

        it('should save entity in a transaction synchronous when disabling hook', () => {
            schema = new Schema({
                name: { type: String },
            });

            schema.pre('save', () => Promise.resolve());

            const ModelInstanceTemp = gstore.model('BlogTemp', schema, gstore);
            entity = new ModelInstanceTemp({});
            entity.preHooksEnabled = false;
            entity.save(transaction);

            const model2 = new ModelInstanceTemp({});
            const transaction2 = new Transaction();
            sinon.spy(transaction2, 'save');
            model2.save(transaction2);

            expect(transaction.save.called).equal(true);
            expect(transaction2.save.called).equal(false);
        });

        it('should throw error if transaction not instance of Transaction', () => (
            entity.save({ id: 0 }, {})
                .catch(err => {
                    assert.isDefined(err);
                    expect(err.message).equal('Transaction needs to be a gcloud Transaction');
                })
        ));

        it('should call pre hooks', () => {
            const spyPre = sinon.stub().resolves();

            schema = new Schema({ name: { type: String } });
            schema.pre('save', () => spyPre());
            GstoreModel = gstore.model('Blog', schema);
            entity = new GstoreModel({ name: 'John' });

            return entity.save().then(() => {
                expect(spyPre.calledBefore(ds.save)).equal(true);
            });
        });

        it('should call post hooks', () => {
            const spyPost = sinon.stub().resolves(123);
            schema = new Schema({ name: { type: String } });
            schema.post('save', () => spyPost());
            GstoreModel = gstore.model('Blog', schema);
            entity = new GstoreModel({ name: 'John' });

            return entity.save().then(result => {
                expect(spyPost.called).equal(true);
                expect(result.name).equal('John');
            });
        });

        it('error in post hooks should be added to response', () => {
            const error = { code: 500 };
            const spyPost = sinon.stub().rejects(error);
            schema = new Schema({ name: { type: String } });
            schema.post('save', spyPost);
            GstoreModel = gstore.model('Blog', schema);
            entity = new GstoreModel({ name: 'John' });

            return entity.save().then(_entity => {
                assert.isDefined(_entity[gstore.ERR_HOOKS]);
                expect(_entity[gstore.ERR_HOOKS][0]).equal(error);
            });
        });

        it('transaction.execPostHooks() should call post hooks', () => {
            const spyPost = sinon.stub().resolves(123);
            schema = new Schema({ name: { type: String } });
            schema.post('save', spyPost);

            GstoreModel = gstore.model('Blog', schema);
            entity = new GstoreModel({ name: 'John' });

            return entity.save(transaction)
                .then(() => transaction.execPostHooks())
                .then(() => {
                    expect(spyPost.called).equal(true);
                    expect(spyPost.callCount).equal(1);
                });
        });

        it('transaction.execPostHooks() should set scope to entity saved', done => {
            schema.post('save', function preSave() {
                expect(this instanceof Entity).equal(true);
                expect(this.name).equal('John Jagger');
                done();
            });
            GstoreModel = gstore.model('Blog', schema);
            entity = new GstoreModel({ name: 'John Jagger' });

            entity.save(transaction)
                .then(() => transaction.execPostHooks());
        });

        it('if transaction.execPostHooks() is NOT called post middleware should not be called', () => {
            const spyPost = sinon.stub().resolves(123);
            schema = new Schema({ name: { type: String } });
            schema.post('save', spyPost);

            GstoreModel = gstore.model('Blog', schema);
            entity = new GstoreModel({ name: 'John' });

            return entity.save(transaction)
                .then(() => {
                    expect(spyPost.called).equal(false);
                });
        });

        it('should update modifiedOn to new Date if property in Schema', () => {
            schema = new Schema({ modifiedOn: { type: 'datetime' } });
            GstoreModel = gstore.model('BlogPost', schema);
            entity = new GstoreModel({});

            return entity.save().then(() => {
                assert.isDefined(entity.entityData.modifiedOn);
                const diff = Math.abs(entity.entityData.modifiedOn.getTime() - Date.now());
                expect(diff < 10).equal(true);
            });
        });

        it('should convert plain geo object (latitude, longitude) to datastore GeoPoint', () => {
            schema = new Schema({ location: { type: 'geoPoint' } });
            GstoreModel = gstore.model('Car', schema);
            entity = new GstoreModel({
                location: {
                    latitude: 37.305885314941406,
                    longitude: -89.51815032958984,
                },
            });

            return entity.save().then(() => {
                expect(entity.entityData.location.constructor.name).to.equal('GeoPoint');
            });
        });

        it('should sanitize the entityData', () => {
            schema = new Schema({ name: { type: String } });
            GstoreModel = gstore.model('TestValidate', schema);
            entity = new GstoreModel({ name: 'John', unknown: 'abc' });

            return entity.save().then(() => {
                assert.isUndefined(entity.entityData.unknown);
            });
        });

        context('when cache is active', () => {
            beforeEach(() => {
                gstore.cache = gstoreWithCache.cache;
            });

            afterEach(() => {
                // empty the cache
                gstore.cache.reset();
                delete gstore.cache;
            });

            it('should call GstoreModel.clearCache()', () => {
                sinon.spy(GstoreModel, 'clearCache');
                return entity.save().then(_entity => {
                    assert.ok(GstoreModel.clearCache.called);
                    expect(typeof GstoreModel.clearCache.getCall(0).args[0]).equal('undefined');
                    expect(_entity.name).equal('John');
                    GstoreModel.clearCache.restore();
                });
            });

            it('on error when clearing the cache, should add the entity saved on the error object', done => {
                const err = new Error('Houston something bad happened');
                sinon.stub(gstore.cache.queries, 'clearQueriesByKind').rejects(err);

                entity.save()
                    .catch(e => {
                        expect(e.__entity.name).equal('John');
                        expect(e.__cacheError).equal(err);
                        gstore.cache.queries.clearQueriesByKind.restore();
                        done();
                    });
            });
        });
    });

    describe('validate()', () => {
        beforeEach(() => {
            sinon.spy(validation, 'validate');
        });

        afterEach(() => {
            validation.validate.restore();
        });

        it('should call "Validation" helper passing entityData, Schema & entityKind', () => {
            schema = new Schema({ name: { type: String } });
            GstoreModel = gstore.model('TestValidate', schema);
            entity = new GstoreModel({ name: 'John' });

            const { error } = entity.validate();

            assert.isDefined(error);
            expect(validation.validate.getCall(0).args[0]).deep.equal(entity.entityData);
            expect(validation.validate.getCall(0).args[1]).equal(schema);
            expect(validation.validate.getCall(0).args[2]).equal(entity.entityKind);
        });

        it('should maintain the Datastore Key on the entityData with Joi Schema', () => {
            schema = new Schema({ name: { joi: Joi.string() } }, { joi: true });
            GstoreModel = gstore.model('TestValidate3', schema);
            entity = new GstoreModel({ name: 'John', createdOn: 'abc' });
            const key = entity.entityData[gstore.ds.KEY];

            entity.validate();

            expect(entity.entityData[gstore.ds.KEY]).equal(key);
        });
    });
});
