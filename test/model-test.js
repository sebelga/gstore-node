
'use strict';

const chai = require('chai');
const sinon = require('sinon');
const is = require('is');
const Joi = require('joi');

const { Gstore } = require('../lib');
const Entity = require('../lib/entity');
const Model = require('../lib/model');
const gstoreErrors = require('../lib/errors');
const ds = require('./mocks/datastore')({ namespace: 'com.mydomain' });
const Transaction = require('./mocks/transaction');
const { generateEntities } = require('./mocks/entities');
const Query = require('./mocks/query');

const gstore = new Gstore();
const gstoreWithCache = new Gstore({ cache: { config: { ttl: { queries: 600 } } } });
const { expect, assert } = chai;
const { Schema, createDataLoader } = gstore;

describe('Model', () => {
    let schema;
    let GstoreModel;
    let mockEntity;
    let mockEntities;
    let transaction;

    beforeEach('Before each Model (global)', () => {
        gstore.models = {};
        gstore.modelSchemas = {};
        gstore.options = {};
        gstore.cache = undefined;
        gstore.config.errorOnEntityNotFound = true;

        gstore.connect(ds);
        gstoreWithCache.connect(ds);

        schema = new Schema({
            name: { type: String },
            lastname: { type: String, excludeFromIndexes: true },
            password: { read: false },
            age: { type: 'int', excludeFromIndexes: true },
            birthday: { type: 'datetime' },
            street: {},
            website: { validate: 'isURL' },
            email: { validate: 'isEmail' },
            ip: { validate: { rule: 'isIP', args: [4] } },
            ip2: { validate: { rule: 'isIP' } }, // no args passed
            modified: { type: 'boolean' },
            tags: { type: 'array' },
            prefs: { type: 'object' },
            price: { type: 'double', write: false },
            icon: { type: 'buffer' },
            location: { type: 'geoPoint' },
        });
        schema.virtual('fullname').get(() => { });

        ({ mockEntity, mockEntities } = generateEntities());
        transaction = new Transaction();

        sinon.spy(ds, 'save');
        sinon.stub(ds, 'transaction').callsFake(() => transaction);
        sinon.spy(transaction, 'save');
        sinon.spy(transaction, 'commit');
        sinon.spy(transaction, 'rollback');
        sinon.stub(transaction, 'get').resolves([mockEntity]);
        sinon.stub(transaction, 'run').resolves([transaction, { apiData: 'ok' }]);

        GstoreModel = gstore.model('Blog', schema, gstore);
    });

    afterEach(() => {
        ds.save.restore();
        ds.transaction.restore();
        transaction.save.restore();
        transaction.commit.restore();
        transaction.rollback.restore();
    });

    describe('compile()', () => {
        beforeEach('Reset before compile', () => {
            gstore.models = {};
            gstore.modelSchemas = {};
            GstoreModel = gstore.model('Blog', schema);
        });

        it('should set properties on compile and return GstoreModel', () => {
            assert.isDefined(GstoreModel.schema);
            assert.isDefined(GstoreModel.gstore);
            assert.isDefined(GstoreModel.entityKind);
        });

        it('should create new models classes', () => {
            const User = Model.compile('User', new Schema({}), gstore);

            expect(User.entityKind).equal('User');
            expect(GstoreModel.entityKind).equal('Blog');
        });

        it('should execute methods passed to schema.methods', () => {
            const imageSchema = new Schema({});
            const ImageModel = gstore.model('Image', imageSchema);
            sinon.stub(ImageModel, 'get').callsFake((id, cb) => {
                cb(null, mockEntities[0]);
            });
            schema.methods.fullName = function fullName(cb) {
                return cb(null, `${this.get('name')} ${this.get('lastname')}`);
            };
            schema.methods.getImage = function getImage(cb) {
                return this.model('Image').get(this.entityData.imageIdx, cb);
            };

            GstoreModel = gstore.model('MyEntity', schema);
            const entity = new GstoreModel({ name: 'John', lastname: 'Snow' });

            entity.fullName((err, result) => {
                expect(result).equal('John Snow');
            });

            entity.getImage.call(entity, (err, result) => {
                expect(result).equal(mockEntities[0]);
            });
        });

        it('should execute static methods', () => {
            schema = new Schema({});
            schema.statics.doSomething = () => 123;

            GstoreModel = gstore.model('MyEntity', schema);

            expect(GstoreModel.doSomething()).equal(123);
        });

        it('should throw error is trying to override reserved methods', () => {
            schema = new Schema({});

            schema.statics.get = () => 123;
            const fn = () => gstore.model('MyEntity', schema);

            expect(fn).throw(Error);
        });

        it('should add __meta object', () => {
            GstoreModel = gstore.model('MyEntity', schema);

            assert.isDefined(GstoreModel.schema.__meta);
            expect(GstoreModel.schema.__meta.geoPointsProps).deep.equal(['location']);
        });
    });

    describe('sanitize()', () => {
        it('should remove keys not "writable"', () => {
            let data = { price: 20, unknown: 'hello', name: 'John' };

            data = GstoreModel.sanitize(data);

            assert.isUndefined(data.price);
            assert.isUndefined(data.unknown);
        });

        it('should convert "null" string to null', () => {
            let data = {
                name: 'null',
            };

            data = GstoreModel.sanitize(data);

            expect(data.name).equal(null);
        });

        it('return null if data is not an object', () => {
            let data = 'hello';

            data = GstoreModel.sanitize(data);

            expect(data).equal(null);
        });

        it('should not mutate the entityData passed', () => {
            const data = { name: 'John' };
            const data2 = GstoreModel.sanitize(data);

            expect(data2).not.equal(data);
        });

        it('should remove not writable & unknown props in Joi schema', () => {
            schema = new Schema({
                createdOn: { joi: Joi.date(), write: false },
            }, { joi: true });
            GstoreModel = gstore.model('BlogJoi', schema, gstore);

            const entityData = GstoreModel.sanitize({ createdOn: Date.now(), unknown: 123 });

            assert.isUndefined(entityData.createdOn);
            assert.isUndefined(entityData.unknown);
        });

        it('should *not* remove unknown props in Joi schema', () => {
            schema = new Schema({
                createdOn: { joi: Joi.date(), write: false },
            }, { joi: { options: { allowUnknown: true } } });
            GstoreModel = gstore.model('BlogJoi', schema, gstore);

            const entityData = GstoreModel.sanitize({ createdOn: Date.now(), unknown: 123 });

            assert.isDefined(entityData.unknown);
        });

        it('should preserve the datastore.KEY', () => {
            const key = GstoreModel.key(123);
            let data = { foo: 'bar' };
            data[GstoreModel.gstore.ds.KEY] = key;

            data = GstoreModel.sanitize(data);

            expect(data[GstoreModel.gstore.ds.KEY]).to.equal(key);
        });

        it('should preserve the datastore.KEY with Joi Schemas', () => {
            schema = new Schema({}, { joi: true });
            GstoreModel = gstore.model('SanitizeJoiSchemaPreserveKEY', schema, gstore);
            const key = GstoreModel.key(123);
            const data = { foo: 'bar' };
            data[GstoreModel.gstore.ds.KEY] = key;

            const sanitized = GstoreModel.sanitize(data);

            expect(sanitized[gstore.ds.KEY]).to.equal(key);
        });

        describe('populated entities', () => {
            beforeEach(() => {
                schema = new Schema({ ref: { type: Schema.Types.Key } });
                GstoreModel = gstore.model('SanitizeReplacePopulatedEntity', schema, gstore);
            });

            it('should replace a populated entity ref with its entity key', () => {
                const key = GstoreModel.key('abc');
                const data = {
                    ref: {
                        title: 'Entity title populated',
                        [gstore.ds.KEY]: key,
                    },
                };

                const sanitized = GstoreModel.sanitize(data);

                assert.isTrue(gstore.ds.isKey(sanitized.ref));
                expect(sanitized.ref).to.equal(key);
            });

            it('should not replace a ref that is not an object', () => {
                const data = { ref: null };

                const sanitized = GstoreModel.sanitize(data);

                assert.isFalse(gstore.ds.isKey(sanitized.ref));
                expect(sanitized.ref).to.equal(null);
            });
        });
    });

    describe('key()', () => {
        it('should create from entityKind', () => {
            const key = GstoreModel.key();

            expect(key.path[0]).equal('Blog');
            assert.isUndefined(key.path[1]);
        });

        it('should parse string id "123" to integer', () => {
            const key = GstoreModel.key('123');
            expect(key.path[1]).equal(123);
        });

        it('should create array of ids', () => {
            const keys = GstoreModel.key([22, 69]);

            expect(is.array(keys)).equal(true);
            expect(keys.length).equal(2);
            expect(keys[1].path[1]).equal(69);
        });

        it('should create array of ids with ancestors and namespace', () => {
            const namespace = 'com.mydomain-dev';
            const keys = GstoreModel.key([22, 69], ['Parent', 'keyParent'], namespace);

            expect(keys[0].path[0]).equal('Parent');
            expect(keys[0].path[1]).equal('keyParent');
            expect(keys[1].namespace).equal(namespace);
        });
    });

    describe('get()', () => {
        let entity;

        beforeEach(() => {
            entity = { name: 'John' };
            entity[ds.KEY] = GstoreModel.key(123);
            sinon.stub(ds, 'get').resolves([entity]);
        });

        afterEach(() => {
            ds.get.restore();
        });

        it('passing an integer id', () => {
            return GstoreModel.get(123).then(onEntity);

            function onEntity(_entity) {
                expect(ds.get.getCall(0).args[0][0].constructor.name).equal('Key');
                expect(_entity instanceof Entity).equal(true);
            }
        });

        it('passing an string id', () => GstoreModel.get('keyname').then((_entity) => {
            expect(_entity instanceof Entity).equal(true);
        }));

        it('passing an array of ids', () => {
            ds.get.restore();

            const entity1 = { name: 'John' };
            entity1[ds.KEY] = ds.key(['BlogPost', 22]);

            const entity2 = { name: 'John' };
            entity2[ds.KEY] = ds.key(['BlogPost', 69]);

            sinon.stub(ds, 'get').resolves([[entity2, entity1]]); // not sorted

            return GstoreModel
                .get([22, 69], null, null, null, { preserveOrder: true })
                .then((_entity) => {
                    expect(is.array(ds.get.getCall(0).args[0])).equal(true);
                    expect(is.array(_entity)).equal(true);
                    expect(_entity[0].entityKey.id).equal(22); // sorted
                });
        });

        it('should consistently return an array when providing id as an Array', () => GstoreModel
            .get(['abc'])
            .then((_entity) => {
                assert.isTrue(is.array(_entity));
            }));

        it('converting a string integer to real integer', () => GstoreModel.get('123').then(() => {
            assert.isUndefined(ds.get.getCall(0).args[0].name);
            expect(ds.get.getCall(0).args[0][0].id).equal(123);
        }));

        it('not converting string with mix of number and non number', () => GstoreModel.get('123:456').then(() => {
            expect(ds.get.getCall(0).args[0][0].name).equal('123:456');
        }));

        it('passing an ancestor path array', () => {
            const ancestors = ['Parent', 'keyname'];

            return GstoreModel.get(123, ancestors).then(() => {
                expect(ds.get.getCall(0).args[0][0].constructor.name).equal('Key');
                expect(ds.get.getCall(0).args[0][0].parent.kind).equal(ancestors[0]);
                expect(ds.get.getCall(0).args[0][0].parent.name).equal(ancestors[1]);
            });
        });

        it('should allow a namespace', () => {
            const namespace = 'com.mydomain-dev';

            return GstoreModel.get(123, null, namespace).then(() => {
                expect(ds.get.getCall(0).args[0][0].namespace).equal(namespace);
            });
        });

        it('on datastore get error, should reject error', (done) => {
            ds.get.restore();
            const error = { code: 500, message: 'Something went really bad' };
            sinon.stub(ds, 'get').rejects(error);

            GstoreModel.get(123)
                .populate('test')
                .catch((err) => {
                    expect(err).equal(error);
                    done();
                });
        });

        it('on no entity found, should return a "ERR_ENTITY_NOT_FOUND" error', () => {
            ds.get.restore();

            sinon.stub(ds, 'get').resolves([]);

            return GstoreModel.get(123).catch((err) => {
                expect(err.code).equal(gstoreErrors.errorCodes.ERR_ENTITY_NOT_FOUND);
            });
        });

        it('on no entity found, should return a null', () => {
            ds.get.restore();
            gstore.config.errorOnEntityNotFound = false;
            sinon.stub(ds, 'get').resolves([]);

            return GstoreModel.get(123).then((e) => {
                expect(e).equal(null);
            });
        });

        it('should get in a transaction', () => GstoreModel.get(123, null, null, transaction).then((_entity) => {
            expect(transaction.get.called).equal(true);
            expect(ds.get.called).equal(false);
            expect(_entity.className).equal('Entity');
        }));

        it(
            'should throw error if transaction not an instance of glcoud Transaction',
            () => GstoreModel.get(123, null, null, {}).catch((err) => {
                expect(err.message).equal('Transaction needs to be a gcloud Transaction');
            })
        );

        it('should return error from Transaction.get()', () => {
            transaction.get.restore();
            const error = { code: 500, message: 'Houston we really need you' };
            sinon.stub(transaction, 'get').rejects(error);

            return GstoreModel.get(123, null, null, transaction).catch((err) => {
                expect(err).equal(error);
            });
        });

        it('should still work with a callback', () => {
            return GstoreModel.get(123, onResult);

            function onResult(err, _entity) {
                expect(ds.get.getCall(0).args[0].constructor.name).equal('Key');
                expect(_entity instanceof Entity).equal(true);
            }
        });

        it('should get data through a Dataloader instance (singe key)', () => {
            const dataloader = createDataLoader(ds);
            const spy = sinon.stub(dataloader, 'load').resolves(entity);

            return GstoreModel.get(123, null, null, null, { dataloader }).then((res) => {
                expect(spy.called).equal(true);

                const args = spy.getCall(0).args[0];
                const key = ds.key({ path: ['Blog', 123], namespace: 'com.mydomain' });
                expect(args).deep.equal(key);
                expect(res.name).equal('John');
            });
        });

        it('should get data through a Dataloader instance (multiple key)', () => {
            const dataloader = createDataLoader(ds);
            const spy = sinon.stub(dataloader, 'loadMany').resolves([{}, {}]);

            return GstoreModel.get([123, 456], null, null, null, { dataloader }).then(() => {
                expect(spy.called).equal(true);

                const args = spy.getCall(0).args[0];
                const key1 = ds.key({ path: ['Blog', 123], namespace: 'com.mydomain' });
                const key2 = ds.key({ path: ['Blog', 456], namespace: 'com.mydomain' });

                expect(args[0]).deep.equal(key1);
                expect(args[1]).deep.equal(key2);
            });
        });

        it('should throw an error if dataloader is not a DataLoader instance', (done) => {
            const dataloader = {};

            GstoreModel.get([123, 456], null, null, null, { dataloader }).then(() => { }, (err) => {
                expect(err.name).equal('GstoreError');
                expect(err.message).equal('dataloader must be a "DataLoader" instance');
                done();
            });
        });

        it('should allow to chain populate() calls and then call the Model.populate() method', () => {
            const populateSpy = sinon.spy(GstoreModel, 'populate');
            const options = { dataLoader: { foo: 'bar' } };

            return GstoreModel
                .get(123, null, null, null, options)
                .populate('company', ['name', 'phone-number'])
                .then(() => {
                    expect(populateSpy.called).equal(true);
                    const { args } = populateSpy.getCall(0);
                    expect(args[0][0]).deep.equal([{ path: 'company', select: ['name', 'phone-number'] }]);
                    expect(args[1]).deep.equal({ ...options, transaction: null });

                    GstoreModel.populate.restore();
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

            it('should get value from cache', () => {
                sinon.spy(GstoreModel.gstore.cache.keys, 'read');
                const key = GstoreModel.key(123);
                const value = { name: 'Michael' };

                return gstore.cache.keys.set(key, value)
                    .then(() => (
                        GstoreModel.get(123, null, null, null, { ttl: 334455 })
                            .then((response) => {
                                assert.ok(!ds.get.called);
                                expect(response.entityData).include(value);
                                assert.ok(GstoreModel.gstore.cache.keys.read.called);
                                const { args } = GstoreModel.gstore.cache.keys.read.getCall(0);
                                expect(args[0].id).equal(123);
                                expect(args[1].ttl).equal(334455);
                                GstoreModel.gstore.cache.keys.read.restore();
                            })
                    ));
            });

            it('should throw an Error if entity not found in cache', (done) => {
                ds.get.resolves([]);
                GstoreModel.get(12345, null, null, null, { ttl: 334455 })
                    .catch((err) => {
                        expect(err.code).equal(gstoreErrors.errorCodes.ERR_ENTITY_NOT_FOUND);
                        done();
                    });
            });

            it('should return null if entity not found in cache', (done) => {
                ds.get.resolves([]);

                gstore.config.errorOnEntityNotFound = false;

                GstoreModel.get(12345, null, null, null, { ttl: 334455 })
                    .then((en) => {
                        expect(en).equal(null);
                        gstore.config.errorOnEntityNotFound = true;
                        done();
                    });
            });

            it('should *not* get value from cache when deactivated in options', () => {
                const key = GstoreModel.key(123);
                const value = { name: 'Michael' };

                return gstore.cache.keys.set(key, value)
                    .then(() => (
                        GstoreModel.get(123, null, null, null, { cache: false })
                            .then((response) => {
                                assert.ok(ds.get.called);
                                expect(response.entityData).contains(entity);
                                ds.get.reset();
                                ds.get.resolves([entity]);
                            })
                    ))
                    .then(() => (
                        GstoreModel.get(123)
                            .then(() => {
                                // Make sure we get from the cache
                                // if no options config is passed
                                assert.ok(!ds.get.called);
                            })
                    ));
            });

            it('should *not* get value from cache when global ttl === -1', () => {
                const originalConf = gstore.cache.config.ttl;
                gstore.cache.config.ttl = Object.assign({}, gstore.cache.config.ttl, { keys: -1 });
                const key = GstoreModel.key(123);

                return gstore.cache.keys.set(key, {})
                    .then(() => (
                        GstoreModel.get(123)
                            .then(() => {
                                assert.ok(ds.get.called);
                                gstore.cache.config.ttl = originalConf;
                            })
                    ));
            });

            it('should get value from fetchHandler', () => (
                GstoreModel.get(123)
                    .then((response) => {
                        assert.ok(ds.get.called);
                        const { args } = ds.get.getCall(0);
                        expect(args[0][0].id).equal(123);
                        expect(response.entityData).include(entity);
                    })
            ));

            it('should get key from fetchHandler and Dataloader', () => {
                const dataloader = createDataLoader(ds);
                const spy = sinon.stub(dataloader, 'load').resolves(entity);

                return GstoreModel.get(123, null, null, null, { dataloader }).then((res) => {
                    expect(spy.called).equal(true);
                    expect(res.name).equal('John');
                });
            });

            it('should get multiple keys from fetchHandler and Dataloader', () => {
                const entity2 = { name: 'Mick' };
                entity2[ds.KEY] = GstoreModel.key(456);
                const dataloader = createDataLoader(ds);
                const spy = sinon.stub(dataloader, 'loadMany').resolves([entity, entity2]);

                return GstoreModel.get([123, 456], null, null, null, { dataloader }).then((res) => {
                    expect(spy.called).equal(true);
                    expect(res[0].name).equal('John');
                    expect(res[1].name).equal('Mick');
                });
            });

            it('should get value from cache and call the fetchHandler **only** with keys not in the cache', () => {
                const key = GstoreModel.key(456);
                const cacheEntity = { name: 'John' };
                cacheEntity[ds.KEY] = key;

                return gstore.cache.keys.set(key, cacheEntity)
                    .then(() => (
                        GstoreModel.get([123, 456])
                            .then((response) => {
                                assert.ok(ds.get.called);
                                const { args } = ds.get.getCall(0);
                                expect(args[0][0].id).equal(123);
                                expect(response.length).equal(2);
                            })
                    ));
            });

            it('should allow to chain populate() calls and then call the Model.populate() method', () => {
                const spy = sinon.spy(GstoreModel, 'populate');

                const key = GstoreModel.key(123);
                const value = { foo: 'bar' };

                return gstore.cache.keys.set(key, value)
                    .then(() => (
                        GstoreModel.get(123)
                            .populate('company', ['name', 'phone-number'])
                            .then(() => {
                                expect(spy.called).equal(true);
                                const { args } = spy.getCall(0);
                                expect(args[0][0]).deep.equal([
                                    { path: 'company', select: ['name', 'phone-number'] },
                                ]);
                            })
                    ));
            });
        });
    });

    describe('update()', () => {
        it('should run in a transaction', () => GstoreModel.update(123).then(() => {
            expect(ds.transaction.called).equal(true);
            expect(transaction.run.called).equal(true);
            expect(transaction.commit.called).equal(true);
        }));

        it('should return an entity instance', () => GstoreModel.update(123).then((entity) => {
            expect(entity.className).equal('Entity');
        }));

        it('should first get the entity by Key', () => (
            GstoreModel.update(123).then(() => {
                expect(transaction.get.getCall(0).args[0].constructor.name).equal('Key');
                expect(transaction.get.getCall(0).args[0].path[1]).equal(123);
            })
        ));

        it('should not convert a string id with mix of number and alpha chars', () => (
            GstoreModel.update('123:456').then(() => {
                expect(transaction.get.getCall(0).args[0].name).equal('123:456');
            })
        ));

        it('should rollback if error while getting entity', () => {
            transaction.get.restore();
            const error = { code: 500, message: 'Houston we got a problem' };
            sinon.stub(transaction, 'get').rejects(error);

            return GstoreModel.update(123).catch((err) => {
                expect(err).deep.equal(error);
                expect(transaction.rollback.called).equal(true);
                expect(transaction.commit.called).equal(false);
            });
        });

        it('should return "ERR_ENTITY_NOT_FOUND" if entity not found', () => {
            transaction.get.restore();
            sinon.stub(transaction, 'get').resolves([]);

            return GstoreModel.update('keyname').catch((err) => {
                expect(err.code).equal(gstoreErrors.errorCodes.ERR_ENTITY_NOT_FOUND);
            });
        });

        it('should return error if any while saving', () => {
            transaction.run.restore();
            const error = { code: 500, message: 'Houston wee need you.' };
            sinon.stub(transaction, 'run').rejects([error]);

            return GstoreModel.update(123).catch((err) => {
                expect(err).equal(error);
            });
        });

        it('accept an ancestor path', () => {
            const ancestors = ['Parent', 'keyname'];

            return GstoreModel.update(123, {}, ancestors).then(() => {
                expect(transaction.get.getCall(0).args[0].path[0]).equal('Parent');
                expect(transaction.get.getCall(0).args[0].path[1]).equal('keyname');
            });
        });

        it('should allow a namespace', () => {
            const namespace = 'com.mydomain-dev';

            return GstoreModel.update(123, {}, null, namespace).then(() => {
                expect(transaction.get.getCall(0).args[0].namespace).equal(namespace);
            });
        });

        it('should save and replace data', () => {
            const data = { name: 'Mick' };
            return GstoreModel.update(123, data, null, null, null, { replace: true })
                .then((entity) => {
                    expect(entity.entityData.name).equal('Mick');
                    expect(entity.entityData.lastname).equal(null);
                    expect(entity.entityData.email).equal(null);
                });
        });

        it('should accept a DataLoader instance, add it to the entity created and clear the key', () => {
            const dataloader = createDataLoader(ds);
            const spy = sinon.spy(dataloader, 'clear');

            return GstoreModel.update(123, {}, null, null, null, { dataloader })
                .then((entity) => {
                    const keyToClear = spy.getCalls()[0].args[0];
                    expect(keyToClear.kind).equal('Blog');
                    expect(keyToClear.id).equal(123);
                    expect(entity.dataloader).equal(dataloader);
                });
        });

        it('should merge the new data with the entity data', () => {
            const data = {
                name: 'Sebas',
                lastname: 'Snow',
            };
            return GstoreModel.update(123, data, ['Parent', 'keyNameParent'])
                .then((entity) => {
                    expect(entity.entityData.name).equal('Sebas');
                    expect(entity.entityData.lastname).equal('Snow');
                    expect(entity.entityData.email).equal('john@snow.com');
                });
        });

        it('should call save() on the transaction', () => {
            GstoreModel.update(123, {}).then(() => {
                expect(transaction.save.called).equal(true);
            });
        });

        it('should return error and rollback transaction if not passing validation', () => (
            GstoreModel.update(123, { unknown: 1 })
                .catch((err) => {
                    assert.isDefined(err);
                    expect(transaction.rollback.called).equal(true);
                })
        ));

        it('should return error if not passing validation', () => (
            GstoreModel.update(123, { unknown: 1 }, null, null, null, { replace: true })
                .catch((err) => {
                    assert.isDefined(err);
                })
        ));

        it('should run inside an *existing* transaction', () => (
            GstoreModel.update(123, {}, null, null, transaction)
                .then((entity) => {
                    expect(ds.transaction.called).equal(false);
                    expect(transaction.get.called).equal(true);
                    expect(transaction.save.called).equal(true);
                    expect(entity.className).equal('Entity');
                })
        ));

        it('should throw error if transaction passed is not instance of gcloud Transaction', () => (
            GstoreModel.update(123, {}, null, null, {})
                .catch((err) => {
                    expect(err.message).equal('Transaction needs to be a gcloud Transaction');
                })
        ));

        context('when cache is active', () => {
            beforeEach(() => {
                gstore.cache = gstoreWithCache.cache;
            });

            afterEach(() => {
                // empty the cache
                gstore.cache.reset();
                delete gstore.cache;
            });

            it('should call Model.clearCache() passing the key updated', () => {
                sinon.spy(GstoreModel, 'clearCache');
                return GstoreModel.update(123, { name: 'Nuri' }, ['Parent', 'keyNameParent'])
                    .then((entity) => {
                        assert.ok(GstoreModel.clearCache.called);
                        expect(GstoreModel.clearCache.getCall(0).args[0].id).equal(123);
                        expect(entity.name).equal('Nuri');
                        GstoreModel.clearCache.restore();
                    });
            });

            it('on error when clearing the cache, should add the entityUpdated on the error', (done) => {
                const err = new Error('Houston something bad happened');
                sinon.stub(gstore.cache.queries, 'clearQueriesByKind').rejects(err);

                GstoreModel.update(123, { name: 'Nuri' })
                    .catch((e) => {
                        expect(e.__entityUpdated.name).equal('Nuri');
                        expect(e.__cacheError).equal(err);
                        gstore.cache.queries.clearQueriesByKind.restore();
                        done();
                    });
            });
        });
    });

    describe('delete()', () => {
        beforeEach(() => {
            sinon.stub(ds, 'delete').resolves([{ indexUpdates: 3 }]);
            sinon.stub(transaction, 'delete').callsFake(() => true);
        });

        afterEach(() => {
            ds.delete.restore();
            transaction.delete.restore();
        });

        it('should call ds.delete with correct Key (int id)', () => (
            GstoreModel.delete(123).then((response) => {
                expect(ds.delete.called).equal(true);
                expect(ds.delete.getCall(0).args[0].constructor.name).equal('Key');
                expect(response.success).equal(true);
            })
        ));

        it('should call ds.delete with correct Key (string id)', () => (
            GstoreModel.delete('keyName')
                .then((response) => {
                    expect(ds.delete.called).equal(true);
                    expect(ds.delete.getCall(0).args[0].path[1]).equal('keyName');
                    expect(response.success).equal(true);
                })
        ));

        it('not converting string id with mix of number and alpha chars', () => (
            GstoreModel.delete('123:456')
                .then(() => {
                    expect(ds.delete.getCall(0).args[0].name).equal('123:456');
                })
        ));

        it('should allow array of ids', () => GstoreModel.delete([22, 69]).then(() => {
            expect(is.array(ds.delete.getCall(0).args[0])).equal(true);
        }));

        it('should allow ancestors', () => GstoreModel.delete(123, ['Parent', 123]).then(() => {
            const key = ds.delete.getCall(0).args[0];

            expect(key.parent.kind).equal('Parent');
            expect(key.parent.id).equal(123);
        }));

        it('should allow a namespace', () => {
            const namespace = 'com.mydomain-dev';

            return GstoreModel.delete('keyName', null, namespace).then(() => {
                const key = ds.delete.getCall(0).args[0];

                expect(key.namespace).equal(namespace);
            });
        });

        it('should delete entity in a transaction', () => (
            GstoreModel.delete(123, null, null, transaction)
                .then(() => {
                    expect(transaction.delete.called).equal(true);
                    expect(transaction.delete.getCall(0).args[0].path[1]).equal(123);
                })
        ));

        it('should deal with empty responses', () => {
            ds.delete.restore();
            sinon.stub(ds, 'delete').resolves();
            return GstoreModel.delete(1).then((response) => {
                assert.isDefined(response.key);
            });
        });

        it('should delete entity in a transaction in sync', () => {
            GstoreModel.delete(123, null, null, transaction);
            expect(transaction.delete.called).equal(true);
            expect(transaction.delete.getCall(0).args[0].path[1]).equal(123);
        });

        it('should throw error if transaction passed is not instance of gcloud Transaction', () => (
            GstoreModel.delete(123, null, null, {})
                .catch((err) => {
                    expect(err.message).equal('Transaction needs to be a gcloud Transaction');
                })
        ));

        it('should set "success" to false if no entity deleted', () => {
            ds.delete.restore();
            sinon.stub(ds, 'delete').resolves([{ indexUpdates: 0 }]);

            return GstoreModel.delete(123).then((response) => {
                expect(response.success).equal(false);
            });
        });

        it('should not set success neither apiRes', () => {
            ds.delete.restore();
            sinon.stub(ds, 'delete').resolves([{}]);

            return GstoreModel.delete(123).then((response) => {
                assert.isUndefined(response.success);
            });
        });

        it('should handle errors', () => {
            ds.delete.restore();
            const error = { code: 500, message: 'We got a problem Houston' };
            sinon.stub(ds, 'delete').rejects(error);

            return GstoreModel.delete(123).catch((err) => {
                expect(err).equal(error);
            });
        });

        it('should call pre hooks', () => {
            const spy = {
                beforeSave: () => Promise.resolve(),
            };
            sinon.spy(spy, 'beforeSave');
            schema.pre('delete', spy.beforeSave);
            GstoreModel = Model.compile('Blog', schema, gstore);

            return GstoreModel.delete(123).then(() => {
                expect(spy.beforeSave.calledBefore(ds.delete)).equal(true);
            });
        });

        it('pre hook should override id passed', () => {
            const spy = {
                beforeSave: () => Promise.resolve({ __override: [666] }),
            };
            sinon.spy(spy, 'beforeSave');
            schema.pre('delete', spy.beforeSave);
            GstoreModel = Model.compile('Blog', schema, gstore);

            return GstoreModel.delete(123).then(() => {
                expect(ds.delete.getCall(0).args[0].id).equal(666);
            });
        });

        it('should set "pre" hook scope to entity being deleted (1)', (done) => {
            schema.pre('delete', function preDelete() {
                expect(this instanceof Entity).equal(true);
                done();
                return Promise.resolve();
            });
            GstoreModel = Model.compile('Blog', schema, gstore);

            GstoreModel.delete(123);
        });

        it('should set "pre" hook scope to entity being deleted (2)', () => {
            schema.pre('delete', function preDelete() {
                expect(this.entityKey.id).equal(777);
                return Promise.resolve();
            });
            GstoreModel = Model.compile('Blog', schema, gstore);

            // ... passing a datastore.key
            return GstoreModel.delete(null, null, null, null, GstoreModel.key(777));
        });

        it('should NOT set "pre" hook scope if deleting an array of ids', () => {
            schema.pre('delete', function preDelete() {
                expect(this).equal(null);
                return Promise.resolve();
            });
            GstoreModel = Model.compile('Blog', schema, gstore);

            return GstoreModel.delete([123, 456], () => { });
        });

        it('should call post hooks', () => {
            const spy = {
                afterDelete: () => Promise.resolve(),
            };
            sinon.spy(spy, 'afterDelete');
            schema.post('delete', spy.afterDelete);
            GstoreModel = Model.compile('Blog', schema, gstore);

            return GstoreModel.delete(123).then(() => {
                expect(spy.afterDelete.called).equal(true);
            });
        });

        it('should pass key deleted to post hooks and set the scope to the entity deleted', () => {
            schema.post('delete', function postDeleteHook({ key }) {
                expect(key.constructor.name).equal('Key');
                expect(key.id).equal(123);
                expect(this instanceof Entity).equal(true);
                expect(this.entityKey).equal(key);
                return Promise.resolve();
            });
            GstoreModel = Model.compile('Blog', schema, gstore);

            return GstoreModel.delete(123).then(() => { });
        });

        it('should pass array of keys deleted to post hooks', () => {
            const ids = [123, 456];
            schema.post('delete', (response) => {
                expect(response.key.length).equal(ids.length);
                expect(response.key[1].id).equal(456);
                return Promise.resolve();
            });
            GstoreModel = Model.compile('Blog', schema, gstore);

            return GstoreModel.delete(ids).then(() => { });
        });

        it('transaction.execPostHooks() should call post hooks', () => {
            const spy = {
                afterDelete: () => Promise.resolve(),
            };
            sinon.spy(spy, 'afterDelete');
            schema = new Schema({ name: { type: String } });
            schema.post('delete', spy.afterDelete);

            GstoreModel = Model.compile('Blog', schema, gstore);

            return GstoreModel.delete(123, null, null, transaction).then(() => {
                transaction.execPostHooks().then(() => {
                    expect(spy.afterDelete.called).equal(true);
                    expect(spy.afterDelete.calledOnce).equal(true);
                });
            });
        });

        it('should still work passing a callback', () => {
            GstoreModel.delete('keyName', (err, response) => {
                expect(ds.delete.called).equal(true);
                expect(ds.delete.getCall(0).args[0].path[1]).equal('keyName');
                expect(response.success).equal(true);
            });
        });

        it('should accept a DataLoader instance and clear the cached key after deleting', () => {
            const dataloader = createDataLoader(ds);
            const spy = sinon.spy(dataloader, 'clear');

            return GstoreModel.delete(123, null, null, null, null, { dataloader })
                .then(() => {
                    const keyToClear = spy.getCalls()[0].args[0];
                    expect(keyToClear.kind).equal('Blog');
                    expect(keyToClear.id).equal(123);
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

            it('should call Model.clearCache() passing the key deleted', () => {
                sinon.spy(GstoreModel, 'clearCache');

                return GstoreModel.delete(445566)
                    .then((response) => {
                        assert.ok(GstoreModel.clearCache.called);
                        expect(GstoreModel.clearCache.getCall(0).args[0].id).equal(445566);
                        expect(response.success).equal(true);
                        GstoreModel.clearCache.restore();
                    });
            });

            it('on error when clearing the cache, should add the entityUpdated on the error', (done) => {
                const err = new Error('Houston something bad happened');
                sinon.stub(gstore.cache.queries, 'clearQueriesByKind').rejects(err);

                GstoreModel.delete(1234)
                    .catch((e) => {
                        expect(e.__response.success).equal(true);
                        expect(e.__cacheError).equal(err);
                        gstore.cache.queries.clearQueriesByKind.restore();
                        done();
                    });
            });
        });
    });

    describe('deleteAll()', () => {
        let queryMock;

        beforeEach(() => {
            queryMock = new Query(ds, { entities: mockEntities });
            sinon.spy(queryMock, 'run');
            sinon.spy(queryMock, 'hasAncestor');
            sinon.stub(ds, 'createQuery').callsFake(() => queryMock);

            sinon.stub(ds, 'delete').callsFake(() => {
                // We need to update our mock response of the Query
                // to not enter in an infinite loop as we recursivly query
                // until there are no more entities
                ds.createQuery.restore();
                sinon.stub(ds, 'createQuery').callsFake(() => new Query(ds, { entities: [] }));
                return Promise.resolve([{ indexUpdates: 3 }]);
            });

            sinon.spy(GstoreModel, 'initQuery');
        });

        afterEach(() => {
            ds.delete.restore();
            ds.createQuery.restore();
            if (queryMock.run.restore) {
                queryMock.run.restore();
            }
            if (queryMock.hasAncestor.restore) {
                queryMock.hasAncestor.restore();
            }
        });

        it('should get all entities through Query', () => (
            GstoreModel.deleteAll().then(() => {
                expect(GstoreModel.initQuery.called).equal(true);
                expect(GstoreModel.initQuery.getCall(0).args.length).equal(1);
            })
        ));

        it('should catch error if could not fetch entities', () => {
            const error = { code: 500, message: 'Something went wrong' };
            queryMock.run.restore();
            sinon.stub(queryMock, 'run').rejects(error);

            return GstoreModel.deleteAll().catch((err) => {
                expect(err).equal(error);
            });
        });

        it('if pre hooks, should call "delete" on all entities found (in series)', () => {
            schema = new Schema({});
            const spies = {
                pre: () => Promise.resolve(),
            };
            sinon.spy(spies, 'pre');

            schema.pre('delete', spies.pre);

            GstoreModel = gstore.model('NewBlog', schema);
            sinon.spy(GstoreModel, 'delete');

            return GstoreModel.deleteAll().then(() => {
                expect(spies.pre.callCount).equal(mockEntities.length);
                expect(GstoreModel.delete.callCount).equal(mockEntities.length);
                expect(GstoreModel.delete.getCall(0).args.length).equal(5);
                expect(GstoreModel.delete.getCall(0).args[4].constructor.name).equal('Key');
            });
        });

        it('if post hooks, should call "delete" on all entities found (in series)', () => {
            schema = new Schema({});
            const spies = {
                post: () => Promise.resolve(),
            };
            sinon.spy(spies, 'post');
            schema.post('delete', spies.post);

            GstoreModel = gstore.model('NewBlog', schema);
            sinon.spy(GstoreModel, 'delete');

            return GstoreModel.deleteAll().then(() => {
                expect(spies.post.callCount).equal(mockEntities.length);
                expect(GstoreModel.delete.callCount).equal(2);
            });
        });

        it('if NO hooks, should call delete passing an array of keys', () => {
            sinon.spy(GstoreModel, 'delete');

            return GstoreModel.deleteAll().then(() => {
                expect(GstoreModel.delete.callCount).equal(1);

                const { args } = GstoreModel.delete.getCall(0);
                expect(is.array(args[4])).equal(true);
                expect(args[4]).deep.equal([mockEntities[0][ds.KEY], mockEntities[1][ds.KEY]]);

                GstoreModel.delete.restore();
            });
        });

        it('should call with ancestors', () => {
            const ancestors = ['Parent', 'keyname'];

            return GstoreModel.deleteAll(ancestors).then(() => {
                expect(queryMock.hasAncestor.calledOnce).equal(true);
                expect(queryMock.ancestors.path).deep.equal(ancestors);
            });
        });

        it('should call with namespace', () => {
            const namespace = 'com.new-domain.dev';

            return GstoreModel.deleteAll(null, namespace).then(() => {
                expect(ds.createQuery.getCall(0).args[0]).equal(namespace);
            });
        });

        it('should return success:true if all ok', () => GstoreModel.deleteAll().then((response) => {
            expect(response.success).equal(true);
        }));

        it('should return error if any while deleting', () => {
            const error = { code: 500, message: 'Could not delete' };
            sinon.stub(GstoreModel, 'delete').rejects(error);

            return GstoreModel.deleteAll().catch((err) => {
                expect(err).equal(error);
            });
        });

        it('should delete entites by batches of 500', (done) => {
            ds.createQuery.restore();

            const entities = [];
            const entity = { name: 'Mick', lastname: 'Jagger' };
            entity[ds.KEY] = ds.key(['BlogPost', 'keyname']);

            for (let i = 0; i < 1200; i += 1) {
                entities.push(entity);
            }

            const queryMock2 = new Query(ds, { entities });
            sinon.stub(ds, 'createQuery').callsFake(() => queryMock2);

            GstoreModel.deleteAll().then(() => {
                expect(false).equal(false);
                done();
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

            it('should delete all the keys from the cache and clear the Queries', (done) => {
                ds.createQuery.restore();

                const entities = [];
                const entity = { name: 'Mick', lastname: 'Jagger' };
                entity[ds.KEY] = ds.key(['BlogPost', 'keyname']);
                for (let i = 0; i < 1200; i += 1) {
                    entities.push(entity);
                }

                queryMock = new Query(ds, { entities });
                sinon.stub(ds, 'createQuery').callsFake(() => (
                    // Check
                    queryMock));
                sinon.spy(gstore.cache.keys, 'del');
                sinon.spy(gstore.cache.queries, 'clearQueriesByKind');

                GstoreModel.deleteAll().then(() => {
                    expect(gstore.cache.queries.clearQueriesByKind.callCount).equal(1);
                    expect(gstore.cache.keys.del.callCount).equal(3);
                    const keys1 = gstore.cache.keys.del.getCall(0).args;
                    const keys2 = gstore.cache.keys.del.getCall(1).args;
                    const keys3 = gstore.cache.keys.del.getCall(2).args;
                    expect(keys1.length + keys2.length + keys3.length).equal(1200);

                    gstore.cache.keys.del.restore();
                    gstore.cache.queries.clearQueriesByKind.restore();
                    done();
                });
            });
        });
    });

    describe('excludeFromIndexes', () => {
        it('should add properties to schema as optional', () => {
            const arr = ['newProp', 'url'];
            GstoreModel.excludeFromIndexes(arr);

            const entity = new GstoreModel({});

            expect(entity.excludeFromIndexes).deep.equal(['lastname', 'age'].concat(arr));
            expect(schema.path('newProp').optional).equal(true);
        });

        it('should only modifiy excludeFromIndexes on properties that already exist', () => {
            const prop = 'lastname';
            GstoreModel.excludeFromIndexes(prop);

            const entity = new GstoreModel({});

            expect(entity.excludeFromIndexes).deep.equal(['lastname', 'age']);
            assert.isUndefined(schema.path('lastname').optional);
            expect(schema.path('lastname').excludeFromIndexes).equal(true);
        });
    });

    describe('hooksTransaction()', () => {
        beforeEach(() => {
            delete transaction.hooks;
        });

        it('should add hooks to a transaction', () => {
            GstoreModel.hooksTransaction(transaction, [() => { }, () => { }]);

            assert.isDefined(transaction.hooks.post);
            expect(transaction.hooks.post.length).equal(2);
            assert.isDefined(transaction.execPostHooks);
        });

        it('should not override previous hooks on transaction', () => {
            const fn = () => { };
            transaction.hooks = {
                post: [fn],
            };

            GstoreModel.hooksTransaction(transaction, [() => { }]);

            expect(transaction.hooks.post[0]).equal(fn);
        });

        it('--> execPostHooks() should chain each Promised hook from transaction', () => {
            const postHook1 = sinon.stub().resolves(1);
            const postHook2 = sinon.stub().resolves(2);
            GstoreModel.hooksTransaction(transaction, [postHook1, postHook2]);

            return transaction.execPostHooks().then((result) => {
                expect(postHook1.called).equal(true);
                expect(postHook2.called).equal(true);
                expect(result).equal(2);
            });
        });

        it('--> execPostHooks() should resolve if no hooks', () => {
            GstoreModel.hooksTransaction(transaction, []);
            delete transaction.hooks.post;

            return transaction.execPostHooks().then(() => {
                expect(true).equal(true);
            });
        });
    });

    describe('clearCache', () => {
        beforeEach(() => {
            gstore.cache = gstoreWithCache.cache;
        });

        afterEach(() => {
            // empty the cache
            gstore.cache.reset();

            if (gstore.cache.queries.clearQueriesByKind.restore) {
                gstore.cache.queries.clearQueriesByKind.restore();
            }

            delete gstore.cache;
        });

        it('should delete the cache', () => {
            sinon.spy(gstore.cache.keys, 'del');

            return GstoreModel.clearCache([GstoreModel.key(112233), GstoreModel.key(778899)])
                .then(() => {
                    assert.ok(gstore.cache.keys.del.called);
                    expect(gstore.cache.keys.del.getCall(0).args[0].id).equal(112233);
                    expect(gstore.cache.keys.del.getCall(0).args[1].id).equal(778899);
                    gstore.cache.keys.del.restore();
                });
        });

        it('should clear all queries linked to its entity kind', () => {
            sinon.spy(gstore.cache.queries, 'clearQueriesByKind');
            return GstoreModel.clearCache()
                .then(() => {
                    assert.ok(gstore.cache.queries.clearQueriesByKind.called);
                    const { args } = gstore.cache.queries.clearQueriesByKind.getCall(0);
                    expect(args[0]).equal(GstoreModel.entityKind);
                });
        });

        it('should bubble up errors', (done) => {
            const err = new Error('Houston something bad happened');
            sinon.stub(gstore.cache.queries, 'clearQueriesByKind').rejects(err);
            GstoreModel.clearCache(GstoreModel.key(123))
                .catch((e) => {
                    expect(e).equal(err);
                    done();
                });
        });

        it('should not throw error if Redis is not present', () => {
            const err = new Error('Redis store not founc');
            err.code = 'ERR_NO_REDIS';
            sinon.stub(gstore.cache.queries, 'clearQueriesByKind').rejects(err);

            GstoreModel.clearCache(GstoreModel.key(123))
                .then((res) => {
                    expect(res.success).equal(true);
                });
        });
    });

    describe('populate()', () => {
        let entity;
        let key0;
        let key1;
        let key2;
        let fetchData1;
        let fetchData2;
        let refs;
        let entities;

        beforeEach(() => {
            gstore.connect(ds);
            schema = new Schema({
                name: { type: String },
                ref: { type: Schema.Types.Key },
            });
            GstoreModel = gstore.model('ModelTests-populate', schema, gstore);

            key0 = GstoreModel.key(123);
            key1 = GstoreModel.key(456);
            key2 = GstoreModel.key(789);

            entity = new GstoreModel({ name: 'Level0', ref: key1 }, null, null, null, key0);

            fetchData1 = { name: 'Level1', ref: key2 };
            fetchData1[ds.KEY] = key1;

            fetchData2 = { name: 'Level2' };
            fetchData2[ds.KEY] = key2;

            refs = [
                [{ path: 'ref', select: ['*'] }], // level 0
                [{ path: 'ref.ref', select: ['*'] }], // level 1
            ];
            entities = [entity];

            const stub = sinon.stub(ds, 'get');
            stub.onCall(0).returns(Promise.resolve([fetchData1]));
            stub.onCall(1).returns(Promise.resolve([fetchData2]));
        });

        afterEach(() => {
            ds.get.restore();
        });

        it('should recursively fetch the keys at each level of the entityData tree', () => (
            GstoreModel.populate(refs)(entities)
                .then(({ 0: { entityData } }) => {
                    expect(entityData.ref.id).equal(456);
                    expect(entityData.ref.name).equal('Level1');
                    expect(entityData.ref.ref.id).equal(789);
                    expect(entityData.ref.ref.name).equal('Level2');
                    expect(ds.get.getCalls().length).equal(2);
                })
        ));

        context('when cache is active', () => {
            beforeEach(() => {
                gstore.cache = gstoreWithCache.cache;
            });

            afterEach(() => {
                // empty the cache
                gstore.cache.reset();
                delete gstore.cache;
            });

            it('should get the keys from the cache and not fetch from the Datastore', () => (
                gstore.cache.keys.mset(key1, fetchData1, key2, fetchData2)
                    .then(() => (
                        GstoreModel.populate(refs)(entities)
                            .then(() => {
                                expect(ds.get.getCalls().length).equal(0);
                            })
                    ))
            ));
        });
    });
});
