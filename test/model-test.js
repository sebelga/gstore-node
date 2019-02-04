
'use strict';

const chai = require('chai');
const sinon = require('sinon');
const is = require('is');
const Joi = require('joi');

const { Gstore } = require('../lib');
const Entity = require('../lib/entity');
const Model = require('../lib/model');
const gstoreErrors = require('../lib/errors');
const datastoreSerializer = require('../lib/serializer').Datastore;
const { validation } = require('../lib/helpers');
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
    let ModelInstance;
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

        ModelInstance = gstore.model('Blog', schema, gstore);
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
            ModelInstance = gstore.model('Blog', schema);
        });

        it('should set properties on compile and return ModelInstance', () => {
            assert.isDefined(ModelInstance.schema);
            assert.isDefined(ModelInstance.gstore);
            assert.isDefined(ModelInstance.entityKind);
        });

        it('should create new models classes', () => {
            const User = Model.compile('User', new Schema({}), gstore);

            expect(User.entityKind).equal('User');
            expect(ModelInstance.entityKind).equal('Blog');
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

            ModelInstance = gstore.model('MyEntity', schema);
            const model = new ModelInstance({ name: 'John', lastname: 'Snow' });

            model.fullName((err, result) => {
                expect(result).equal('John Snow');
            });

            model.getImage.call(model, (err, result) => {
                expect(result).equal(mockEntities[0]);
            });
        });

        it('should execute static methods', () => {
            schema = new Schema({});
            schema.statics.doSomething = () => 123;

            ModelInstance = gstore.model('MyEntity', schema);

            expect(ModelInstance.doSomething()).equal(123);
        });

        it('should throw error is trying to override reserved methods', () => {
            schema = new Schema({});

            schema.statics.get = () => 123;
            const fn = () => gstore.model('MyEntity', schema);

            expect(fn).throw(Error);
        });

        it('should add __meta object', () => {
            ModelInstance = gstore.model('MyEntity', schema);

            assert.isDefined(ModelInstance.schema.__meta);
            expect(ModelInstance.schema.__meta.geoPointsProps).deep.equal(['location']);
        });
    });

    describe('sanitize()', () => {
        it('should remove keys not "writable"', () => {
            let data = { price: 20, unknown: 'hello', name: 'John' };

            data = ModelInstance.sanitize(data);

            assert.isUndefined(data.price);
            assert.isUndefined(data.unknown);
        });

        it('should convert "null" string to null', () => {
            let data = {
                name: 'null',
            };

            data = ModelInstance.sanitize(data);

            expect(data.name).equal(null);
        });

        it('return null if data is not an object', () => {
            let data = 'hello';

            data = ModelInstance.sanitize(data);

            expect(data).equal(null);
        });

        it('should not mutate the entityData passed', () => {
            const data = { name: 'John' };
            const data2 = ModelInstance.sanitize(data);

            expect(data2).not.equal(data);
        });

        it('should remove not writable & unknown props in Joi schema', () => {
            schema = new Schema({
                createdOn: { joi: Joi.date(), write: false },
            }, { joi: true });
            ModelInstance = gstore.model('BlogJoi', schema, gstore);

            const entityData = ModelInstance.sanitize({ createdOn: Date.now(), unknown: 123 });

            assert.isUndefined(entityData.createdOn);
            assert.isUndefined(entityData.unknown);
        });

        it('should *not* remove unknown props in Joi schema', () => {
            schema = new Schema({
                createdOn: { joi: Joi.date(), write: false },
            }, { joi: { options: { allowUnknown: true } } });
            ModelInstance = gstore.model('BlogJoi', schema, gstore);

            const entityData = ModelInstance.sanitize({ createdOn: Date.now(), unknown: 123 });

            assert.isDefined(entityData.unknown);
        });
    });

    describe('key()', () => {
        it('should create from entityKind', () => {
            const key = ModelInstance.key();

            expect(key.path[0]).equal('Blog');
            assert.isUndefined(key.path[1]);
        });

        it('should parse string id "123" to integer', () => {
            const key = ModelInstance.key('123');
            expect(key.path[1]).equal(123);
        });

        it('should create array of ids', () => {
            const keys = ModelInstance.key([22, 69]);

            expect(is.array(keys)).equal(true);
            expect(keys.length).equal(2);
            expect(keys[1].path[1]).equal(69);
        });

        it('should create array of ids with ancestors and namespace', () => {
            const namespace = 'com.mydomain-dev';
            const keys = ModelInstance.key([22, 69], ['Parent', 'keyParent'], namespace);

            expect(keys[0].path[0]).equal('Parent');
            expect(keys[0].path[1]).equal('keyParent');
            expect(keys[1].namespace).equal(namespace);
        });
    });

    describe('get()', () => {
        let entity;

        beforeEach(() => {
            entity = { name: 'John' };
            entity[ds.KEY] = ModelInstance.key(123);
            sinon.stub(ds, 'get').resolves([entity]);
        });

        afterEach(() => {
            ds.get.restore();
        });

        it('passing an integer id', () => {
            return ModelInstance.get(123).then(onEntity);

            function onEntity(_entity) {
                expect(ds.get.getCall(0).args[0][0].constructor.name).equal('Key');
                expect(_entity instanceof Entity).equal(true);
            }
        });

        it('passing an string id', () => ModelInstance.get('keyname').then((_entity) => {
            expect(_entity instanceof Entity).equal(true);
        }));

        it('passing an array of ids', () => {
            ds.get.restore();

            const entity1 = { name: 'John' };
            entity1[ds.KEY] = ds.key(['BlogPost', 22]);

            const entity2 = { name: 'John' };
            entity2[ds.KEY] = ds.key(['BlogPost', 69]);

            sinon.stub(ds, 'get').resolves([[entity2, entity1]]); // not sorted

            return ModelInstance.get([22, 69], null, null, null, { preserveOrder: true }).then(onResult, onError);

            function onResult(_entity) {
                expect(is.array(ds.get.getCall(0).args[0])).equal(true);
                expect(is.array(_entity)).equal(true);
                expect(_entity[0].entityKey.id).equal(22); // sorted
            }

            function onError(err) {
                throw (err);
            }
        });

        it('converting a string integer to real integer', () => ModelInstance.get('123').then(() => {
            assert.isUndefined(ds.get.getCall(0).args[0].name);
            expect(ds.get.getCall(0).args[0][0].id).equal(123);
        }));

        it('not converting string with mix of number and non number', () => ModelInstance.get('123:456').then(() => {
            expect(ds.get.getCall(0).args[0][0].name).equal('123:456');
        }));

        it('passing an ancestor path array', () => {
            const ancestors = ['Parent', 'keyname'];

            return ModelInstance.get(123, ancestors).then(() => {
                expect(ds.get.getCall(0).args[0][0].constructor.name).equal('Key');
                expect(ds.get.getCall(0).args[0][0].parent.kind).equal(ancestors[0]);
                expect(ds.get.getCall(0).args[0][0].parent.name).equal(ancestors[1]);
            });
        });

        it('should allow a namespace', () => {
            const namespace = 'com.mydomain-dev';

            return ModelInstance.get(123, null, namespace).then(() => {
                expect(ds.get.getCall(0).args[0][0].namespace).equal(namespace);
            });
        });

        it('on datastore get error, should reject error', (done) => {
            ds.get.restore();
            const error = { code: 500, message: 'Something went really bad' };
            sinon.stub(ds, 'get').rejects(error);

            ModelInstance.get(123)
                .populate('test')
                .catch((err) => {
                    expect(err).equal(error);
                    done();
                });
        });

        it('on no entity found, should return a "ERR_ENTITY_NOT_FOUND" error', () => {
            ds.get.restore();

            sinon.stub(ds, 'get').resolves([]);

            return ModelInstance.get(123).catch((err) => {
                expect(err.code).equal(gstoreErrors.errorCodes.ERR_ENTITY_NOT_FOUND);
            });
        });

        it('on no entity found, should return a null', () => {
            ds.get.restore();
            gstore.config.errorOnEntityNotFound = false;
            sinon.stub(ds, 'get').resolves([]);

            return ModelInstance.get(123).then((e) => {
                expect(e).equal(null);
            });
        });

        it('should get in a transaction', () => ModelInstance.get(123, null, null, transaction).then((_entity) => {
            expect(transaction.get.called).equal(true);
            expect(ds.get.called).equal(false);
            expect(_entity.className).equal('Entity');
        }));

        it(
            'should throw error if transaction not an instance of glcoud Transaction',
            () => ModelInstance.get(123, null, null, {}).catch((err) => {
                expect(err.message).equal('Transaction needs to be a gcloud Transaction');
            })
        );

        it('should return error from Transaction.get()', () => {
            transaction.get.restore();
            const error = { code: 500, message: 'Houston we really need you' };
            sinon.stub(transaction, 'get').rejects(error);

            return ModelInstance.get(123, null, null, transaction).catch((err) => {
                expect(err).equal(error);
            });
        });

        it('should still work with a callback', () => {
            return ModelInstance.get(123, onResult);

            function onResult(err, _entity) {
                expect(ds.get.getCall(0).args[0].constructor.name).equal('Key');
                expect(_entity instanceof Entity).equal(true);
            }
        });

        it('should get data through a Dataloader instance (singe key)', () => {
            const dataloader = createDataLoader(ds);
            const spy = sinon.stub(dataloader, 'load').resolves(entity);

            return ModelInstance.get(123, null, null, null, { dataloader }).then((res) => {
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

            return ModelInstance.get([123, 456], null, null, null, { dataloader }).then(() => {
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

            ModelInstance.get([123, 456], null, null, null, { dataloader }).then(() => { }, (err) => {
                expect(err.name).equal('GstoreError');
                expect(err.message).equal('dataloader must be a "DataLoader" instance');
                done();
            });
        });

        it('should allow to chain populate() calls and then call the Model.populate() method', () => {
            const spy = sinon.spy(ModelInstance, 'populate');
            const options = { dataLoader: { foo: 'bar' } };

            return ModelInstance
                .get(123, null, null, null, options)
                .populate('company', ['name', 'phone-number'])
                .then(() => {
                    expect(spy.called).equal(true);
                    const { args } = spy.getCall(0);
                    expect(args[0][0]).deep.equal([{ path: 'company', select: ['name', 'phone-number'] }]);
                    expect(args[1]).deep.equal({ ...options, transaction: null });

                    ModelInstance.populate.restore();
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
                sinon.spy(ModelInstance.gstore.cache.keys, 'read');
                const key = ModelInstance.key(123);
                const value = { name: 'Michael' };

                return gstore.cache.keys.set(key, value)
                    .then(() => (
                        ModelInstance.get(123, null, null, null, { ttl: 334455 })
                            .then((response) => {
                                assert.ok(!ds.get.called);
                                expect(response.entityData).include(value);
                                assert.ok(ModelInstance.gstore.cache.keys.read.called);
                                const { args } = ModelInstance.gstore.cache.keys.read.getCall(0);
                                expect(args[0].id).equal(123);
                                expect(args[1].ttl).equal(334455);
                                ModelInstance.gstore.cache.keys.read.restore();
                            })
                    ));
            });

            it('should throw an Error if entity not found in cache', (done) => {
                ds.get.resolves([]);
                ModelInstance.get(12345, null, null, null, { ttl: 334455 })
                    .catch((err) => {
                        expect(err.code).equal(gstoreErrors.errorCodes.ERR_ENTITY_NOT_FOUND);
                        done();
                    });
            });

            it('should return null if entity not found in cache', (done) => {
                ds.get.resolves([]);

                gstore.config.errorOnEntityNotFound = false;

                ModelInstance.get(12345, null, null, null, { ttl: 334455 })
                    .then((en) => {
                        expect(en).equal(null);
                        gstore.config.errorOnEntityNotFound = true;
                        done();
                    });
            });

            it('should *not* get value from cache when deactivated in options', () => {
                const key = ModelInstance.key(123);
                const value = { name: 'Michael' };

                return gstore.cache.keys.set(key, value)
                    .then(() => (
                        ModelInstance.get(123, null, null, null, { cache: false })
                            .then((response) => {
                                assert.ok(ds.get.called);
                                expect(response.entityData).contains(entity);
                                ds.get.reset();
                                ds.get.resolves([entity]);
                            })
                    ))
                    .then(() => (
                        ModelInstance.get(123)
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
                const key = ModelInstance.key(123);

                return gstore.cache.keys.set(key, {})
                    .then(() => (
                        ModelInstance.get(123)
                            .then(() => {
                                assert.ok(ds.get.called);
                                gstore.cache.config.ttl = originalConf;
                            })
                    ));
            });

            it('should get value from fetchHandler', () => (
                ModelInstance.get(123)
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

                return ModelInstance.get(123, null, null, null, { dataloader }).then((res) => {
                    expect(spy.called).equal(true);
                    expect(res.name).equal('John');
                });
            });

            it('should get multiple keys from fetchHandler and Dataloader', () => {
                const entity2 = { name: 'Mick' };
                entity2[ds.KEY] = ModelInstance.key(456);
                const dataloader = createDataLoader(ds);
                const spy = sinon.stub(dataloader, 'loadMany').resolves([entity, entity2]);

                return ModelInstance.get([123, 456], null, null, null, { dataloader }).then((res) => {
                    expect(spy.called).equal(true);
                    expect(res[0].name).equal('John');
                    expect(res[1].name).equal('Mick');
                });
            });

            it('should get value from cache and call the fetchHandler **only** with keys not in the cache', () => {
                const key = ModelInstance.key(456);
                const cacheEntity = { name: 'John' };
                cacheEntity[ds.KEY] = key;

                return gstore.cache.keys.set(key, cacheEntity)
                    .then(() => (
                        ModelInstance.get([123, 456])
                            .then((response) => {
                                assert.ok(ds.get.called);
                                const { args } = ds.get.getCall(0);
                                expect(args[0][0].id).equal(123);
                                expect(response.length).equal(2);
                            })
                    ));
            });

            it('should allow to chain populate() calls and then call the Model.populate() method', () => {
                const spy = sinon.spy(ModelInstance, 'populate');

                const key = ModelInstance.key(123);
                const value = { foo: 'bar' };

                return gstore.cache.keys.set(key, value)
                    .then(() => (
                        ModelInstance.get(123)
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
        it('should run in a transaction', () => ModelInstance.update(123).then(() => {
            expect(ds.transaction.called).equal(true);
            expect(transaction.run.called).equal(true);
            expect(transaction.commit.called).equal(true);
        }));

        it('should return an entity instance', () => ModelInstance.update(123).then((entity) => {
            expect(entity.className).equal('Entity');
        }));

        it('should first get the entity by Key', () => (
            ModelInstance.update(123).then(() => {
                expect(transaction.get.getCall(0).args[0].constructor.name).equal('Key');
                expect(transaction.get.getCall(0).args[0].path[1]).equal(123);
            })
        ));

        it('should not convert a string id with mix of number and alpha chars', () => (
            ModelInstance.update('123:456').then(() => {
                expect(transaction.get.getCall(0).args[0].name).equal('123:456');
            })
        ));

        it('should rollback if error while getting entity', () => {
            transaction.get.restore();
            const error = { code: 500, message: 'Houston we got a problem' };
            sinon.stub(transaction, 'get').rejects(error);

            return ModelInstance.update(123).catch((err) => {
                expect(err).deep.equal(error);
                expect(transaction.rollback.called).equal(true);
                expect(transaction.commit.called).equal(false);
            });
        });

        it('should return "ERR_ENTITY_NOT_FOUND" if entity not found', () => {
            transaction.get.restore();
            sinon.stub(transaction, 'get').resolves([]);

            return ModelInstance.update('keyname').catch((err) => {
                expect(err.code).equal(gstoreErrors.errorCodes.ERR_ENTITY_NOT_FOUND);
            });
        });

        it('should return error if any while saving', () => {
            transaction.run.restore();
            const error = { code: 500, message: 'Houston wee need you.' };
            sinon.stub(transaction, 'run').rejects([error]);

            return ModelInstance.update(123).catch((err) => {
                expect(err).equal(error);
            });
        });

        it('accept an ancestor path', () => {
            const ancestors = ['Parent', 'keyname'];

            return ModelInstance.update(123, {}, ancestors).then(() => {
                expect(transaction.get.getCall(0).args[0].path[0]).equal('Parent');
                expect(transaction.get.getCall(0).args[0].path[1]).equal('keyname');
            });
        });

        it('should allow a namespace', () => {
            const namespace = 'com.mydomain-dev';

            return ModelInstance.update(123, {}, null, namespace).then(() => {
                expect(transaction.get.getCall(0).args[0].namespace).equal(namespace);
            });
        });

        it('should save and replace data', () => {
            const data = { name: 'Mick' };
            return ModelInstance.update(123, data, null, null, null, { replace: true })
                .then((entity) => {
                    expect(entity.entityData.name).equal('Mick');
                    expect(entity.entityData.lastname).equal(null);
                    expect(entity.entityData.email).equal(null);
                });
        });

        it('should accept a DataLoader instance, add it to the entity created and clear the key', () => {
            const dataloader = createDataLoader(ds);
            const spy = sinon.spy(dataloader, 'clear');

            return ModelInstance.update(123, {}, null, null, null, { dataloader })
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
            return ModelInstance.update(123, data, ['Parent', 'keyNameParent'])
                .then((entity) => {
                    expect(entity.entityData.name).equal('Sebas');
                    expect(entity.entityData.lastname).equal('Snow');
                    expect(entity.entityData.email).equal('john@snow.com');
                });
        });

        it('should call save() on the transaction', () => {
            ModelInstance.update(123, {}).then(() => {
                expect(transaction.save.called).equal(true);
            });
        });

        it('should return error and rollback transaction if not passing validation', () => (
            ModelInstance.update(123, { unknown: 1 })
                .catch((err) => {
                    assert.isDefined(err);
                    expect(transaction.rollback.called).equal(true);
                })
        ));

        it('should return error if not passing validation', () => (
            ModelInstance.update(123, { unknown: 1 }, null, null, null, { replace: true })
                .catch((err) => {
                    assert.isDefined(err);
                })
        ));

        it('should run inside an *existing* transaction', () => (
            ModelInstance.update(123, {}, null, null, transaction)
                .then((entity) => {
                    expect(ds.transaction.called).equal(false);
                    expect(transaction.get.called).equal(true);
                    expect(transaction.save.called).equal(true);
                    expect(entity.className).equal('Entity');
                })
        ));

        it('should throw error if transaction passed is not instance of gcloud Transaction', () => (
            ModelInstance.update(123, {}, null, null, {})
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
                sinon.spy(ModelInstance, 'clearCache');
                return ModelInstance.update(123, { name: 'Nuri' }, ['Parent', 'keyNameParent'])
                    .then((entity) => {
                        assert.ok(ModelInstance.clearCache.called);
                        expect(ModelInstance.clearCache.getCall(0).args[0].id).equal(123);
                        expect(entity.name).equal('Nuri');
                        ModelInstance.clearCache.restore();
                    });
            });

            it('on error when clearing the cache, should add the entityUpdated on the error', (done) => {
                const err = new Error('Houston something bad happened');
                sinon.stub(gstore.cache.queries, 'clearQueriesByKind').rejects(err);

                ModelInstance.update(123, { name: 'Nuri' })
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
            ModelInstance.delete(123).then((response) => {
                expect(ds.delete.called).equal(true);
                expect(ds.delete.getCall(0).args[0].constructor.name).equal('Key');
                expect(response.success).equal(true);
            })
        ));

        it('should call ds.delete with correct Key (string id)', () => (
            ModelInstance.delete('keyName')
                .then((response) => {
                    expect(ds.delete.called).equal(true);
                    expect(ds.delete.getCall(0).args[0].path[1]).equal('keyName');
                    expect(response.success).equal(true);
                })
        ));

        it('not converting string id with mix of number and alpha chars', () => (
            ModelInstance.delete('123:456')
                .then(() => {
                    expect(ds.delete.getCall(0).args[0].name).equal('123:456');
                })
        ));

        it('should allow array of ids', () => ModelInstance.delete([22, 69]).then(() => {
            expect(is.array(ds.delete.getCall(0).args[0])).equal(true);
        }));

        it('should allow ancestors', () => ModelInstance.delete(123, ['Parent', 123]).then(() => {
            const key = ds.delete.getCall(0).args[0];

            expect(key.parent.kind).equal('Parent');
            expect(key.parent.id).equal(123);
        }));

        it('should allow a namespace', () => {
            const namespace = 'com.mydomain-dev';

            return ModelInstance.delete('keyName', null, namespace).then(() => {
                const key = ds.delete.getCall(0).args[0];

                expect(key.namespace).equal(namespace);
            });
        });

        it('should delete entity in a transaction', () => (
            ModelInstance.delete(123, null, null, transaction)
                .then(() => {
                    expect(transaction.delete.called).equal(true);
                    expect(transaction.delete.getCall(0).args[0].path[1]).equal(123);
                })
        ));

        it('should deal with empty responses', () => {
            ds.delete.restore();
            sinon.stub(ds, 'delete').resolves();
            return ModelInstance.delete(1).then((response) => {
                assert.isDefined(response.key);
            });
        });

        it('should delete entity in a transaction in sync', () => {
            ModelInstance.delete(123, null, null, transaction);
            expect(transaction.delete.called).equal(true);
            expect(transaction.delete.getCall(0).args[0].path[1]).equal(123);
        });

        it('should throw error if transaction passed is not instance of gcloud Transaction', () => (
            ModelInstance.delete(123, null, null, {})
                .catch((err) => {
                    expect(err.message).equal('Transaction needs to be a gcloud Transaction');
                })
        ));

        it('should set "success" to false if no entity deleted', () => {
            ds.delete.restore();
            sinon.stub(ds, 'delete').resolves([{ indexUpdates: 0 }]);

            return ModelInstance.delete(123).then((response) => {
                expect(response.success).equal(false);
            });
        });

        it('should not set success neither apiRes', () => {
            ds.delete.restore();
            sinon.stub(ds, 'delete').resolves([{}]);

            return ModelInstance.delete(123).then((response) => {
                assert.isUndefined(response.success);
            });
        });

        it('should handle errors', () => {
            ds.delete.restore();
            const error = { code: 500, message: 'We got a problem Houston' };
            sinon.stub(ds, 'delete').rejects(error);

            return ModelInstance.delete(123).catch((err) => {
                expect(err).equal(error);
            });
        });

        it('should call pre hooks', () => {
            const spy = {
                beforeSave: () => Promise.resolve(),
            };
            sinon.spy(spy, 'beforeSave');
            schema.pre('delete', spy.beforeSave);
            ModelInstance = Model.compile('Blog', schema, gstore);

            return ModelInstance.delete(123).then(() => {
                expect(spy.beforeSave.calledBefore(ds.delete)).equal(true);
            });
        });

        it('pre hook should override id passed', () => {
            const spy = {
                beforeSave: () => Promise.resolve({ __override: [666] }),
            };
            sinon.spy(spy, 'beforeSave');
            schema.pre('delete', spy.beforeSave);
            ModelInstance = Model.compile('Blog', schema, gstore);

            return ModelInstance.delete(123).then(() => {
                expect(ds.delete.getCall(0).args[0].id).equal(666);
            });
        });

        it('should set "pre" hook scope to entity being deleted (1)', (done) => {
            schema.pre('delete', function preDelete() {
                expect(this instanceof Entity).equal(true);
                done();
                return Promise.resolve();
            });
            ModelInstance = Model.compile('Blog', schema, gstore);

            ModelInstance.delete(123);
        });

        it('should set "pre" hook scope to entity being deleted (2)', () => {
            schema.pre('delete', function preDelete() {
                expect(this.entityKey.id).equal(777);
                return Promise.resolve();
            });
            ModelInstance = Model.compile('Blog', schema, gstore);

            // ... passing a datastore.key
            return ModelInstance.delete(null, null, null, null, ModelInstance.key(777));
        });

        it('should NOT set "pre" hook scope if deleting an array of ids', () => {
            schema.pre('delete', function preDelete() {
                expect(this).equal(null);
                return Promise.resolve();
            });
            ModelInstance = Model.compile('Blog', schema, gstore);

            return ModelInstance.delete([123, 456], () => { });
        });

        it('should call post hooks', () => {
            const spy = {
                afterDelete: () => Promise.resolve(),
            };
            sinon.spy(spy, 'afterDelete');
            schema.post('delete', spy.afterDelete);
            ModelInstance = Model.compile('Blog', schema, gstore);

            return ModelInstance.delete(123).then(() => {
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
            ModelInstance = Model.compile('Blog', schema, gstore);

            return ModelInstance.delete(123).then(() => { });
        });

        it('should pass array of keys deleted to post hooks', () => {
            const ids = [123, 456];
            schema.post('delete', (response) => {
                expect(response.key.length).equal(ids.length);
                expect(response.key[1].id).equal(456);
                return Promise.resolve();
            });
            ModelInstance = Model.compile('Blog', schema, gstore);

            return ModelInstance.delete(ids).then(() => { });
        });

        it('transaction.execPostHooks() should call post hooks', () => {
            const spy = {
                afterDelete: () => Promise.resolve(),
            };
            sinon.spy(spy, 'afterDelete');
            schema = new Schema({ name: { type: String } });
            schema.post('delete', spy.afterDelete);

            ModelInstance = Model.compile('Blog', schema, gstore);

            return ModelInstance.delete(123, null, null, transaction).then(() => {
                transaction.execPostHooks().then(() => {
                    expect(spy.afterDelete.called).equal(true);
                    expect(spy.afterDelete.calledOnce).equal(true);
                });
            });
        });

        it('should still work passing a callback', () => {
            ModelInstance.delete('keyName', (err, response) => {
                expect(ds.delete.called).equal(true);
                expect(ds.delete.getCall(0).args[0].path[1]).equal('keyName');
                expect(response.success).equal(true);
            });
        });

        it('should accept a DataLoader instance and clear the cached key after deleting', () => {
            const dataloader = createDataLoader(ds);
            const spy = sinon.spy(dataloader, 'clear');

            return ModelInstance.delete(123, null, null, null, null, { dataloader })
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
                sinon.spy(ModelInstance, 'clearCache');

                return ModelInstance.delete(445566)
                    .then((response) => {
                        assert.ok(ModelInstance.clearCache.called);
                        expect(ModelInstance.clearCache.getCall(0).args[0].id).equal(445566);
                        expect(response.success).equal(true);
                        ModelInstance.clearCache.restore();
                    });
            });

            it('on error when clearing the cache, should add the entityUpdated on the error', (done) => {
                const err = new Error('Houston something bad happened');
                sinon.stub(gstore.cache.queries, 'clearQueriesByKind').rejects(err);

                ModelInstance.delete(1234)
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

            sinon.spy(ModelInstance, 'initQuery');
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
            ModelInstance.deleteAll().then(() => {
                expect(ModelInstance.initQuery.called).equal(true);
                expect(ModelInstance.initQuery.getCall(0).args.length).equal(1);
            })
        ));

        it('should catch error if could not fetch entities', () => {
            const error = { code: 500, message: 'Something went wrong' };
            queryMock.run.restore();
            sinon.stub(queryMock, 'run').rejects(error);

            return ModelInstance.deleteAll().catch((err) => {
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

            ModelInstance = gstore.model('NewBlog', schema);
            sinon.spy(ModelInstance, 'delete');

            return ModelInstance.deleteAll().then(() => {
                expect(spies.pre.callCount).equal(mockEntities.length);
                expect(ModelInstance.delete.callCount).equal(mockEntities.length);
                expect(ModelInstance.delete.getCall(0).args.length).equal(5);
                expect(ModelInstance.delete.getCall(0).args[4].constructor.name).equal('Key');
            });
        });

        it('if post hooks, should call "delete" on all entities found (in series)', () => {
            schema = new Schema({});
            const spies = {
                post: () => Promise.resolve(),
            };
            sinon.spy(spies, 'post');
            schema.post('delete', spies.post);

            ModelInstance = gstore.model('NewBlog', schema);
            sinon.spy(ModelInstance, 'delete');

            return ModelInstance.deleteAll().then(() => {
                expect(spies.post.callCount).equal(mockEntities.length);
                expect(ModelInstance.delete.callCount).equal(2);
            });
        });

        it('if NO hooks, should call delete passing an array of keys', () => {
            sinon.spy(ModelInstance, 'delete');

            return ModelInstance.deleteAll().then(() => {
                expect(ModelInstance.delete.callCount).equal(1);

                const { args } = ModelInstance.delete.getCall(0);
                expect(is.array(args[4])).equal(true);
                expect(args[4]).deep.equal([mockEntities[0][ds.KEY], mockEntities[1][ds.KEY]]);

                ModelInstance.delete.restore();
            });
        });

        it('should call with ancestors', () => {
            const ancestors = ['Parent', 'keyname'];

            return ModelInstance.deleteAll(ancestors).then(() => {
                expect(queryMock.hasAncestor.calledOnce).equal(true);
                expect(queryMock.ancestors.path).deep.equal(ancestors);
            });
        });

        it('should call with namespace', () => {
            const namespace = 'com.new-domain.dev';

            return ModelInstance.deleteAll(null, namespace).then(() => {
                expect(ds.createQuery.getCall(0).args[0]).equal(namespace);
            });
        });

        it('should return success:true if all ok', () => ModelInstance.deleteAll().then((response) => {
            expect(response.success).equal(true);
        }));

        it('should return error if any while deleting', () => {
            const error = { code: 500, message: 'Could not delete' };
            sinon.stub(ModelInstance, 'delete').rejects(error);

            return ModelInstance.deleteAll().catch((err) => {
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

            ModelInstance.deleteAll().then(() => {
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

                ModelInstance.deleteAll().then(() => {
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
            ModelInstance.excludeFromIndexes(arr);

            const model = new ModelInstance({});

            expect(model.excludeFromIndexes).deep.equal(['lastname', 'age'].concat(arr));
            expect(schema.path('newProp').optional).equal(true);
        });

        it('should only modifiy excludeFromIndexes on properties that already exist', () => {
            const prop = 'lastname';
            ModelInstance.excludeFromIndexes(prop);

            const model = new ModelInstance({});

            expect(model.excludeFromIndexes).deep.equal(['lastname', 'age']);
            assert.isUndefined(schema.path('lastname').optional);
            expect(schema.path('lastname').excludeFromIndexes).equal(true);
        });
    });

    describe('hooksTransaction()', () => {
        beforeEach(() => {
            delete transaction.hooks;
        });

        it('should add hooks to a transaction', () => {
            ModelInstance.hooksTransaction(transaction, [() => { }, () => { }]);

            assert.isDefined(transaction.hooks.post);
            expect(transaction.hooks.post.length).equal(2);
            assert.isDefined(transaction.execPostHooks);
        });

        it('should not override previous hooks on transaction', () => {
            const fn = () => { };
            transaction.hooks = {
                post: [fn],
            };

            ModelInstance.hooksTransaction(transaction, [() => { }]);

            expect(transaction.hooks.post[0]).equal(fn);
        });

        it('--> execPostHooks() should chain each Promised hook from transaction', () => {
            const postHook1 = sinon.stub().resolves(1);
            const postHook2 = sinon.stub().resolves(2);
            ModelInstance.hooksTransaction(transaction, [postHook1, postHook2]);

            return transaction.execPostHooks().then((result) => {
                expect(postHook1.called).equal(true);
                expect(postHook2.called).equal(true);
                expect(result).equal(2);
            });
        });

        it('--> execPostHooks() should resolve if no hooks', () => {
            ModelInstance.hooksTransaction(transaction, []);
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

            return ModelInstance.clearCache([ModelInstance.key(112233), ModelInstance.key(778899)])
                .then(() => {
                    assert.ok(gstore.cache.keys.del.called);
                    expect(gstore.cache.keys.del.getCall(0).args[0].id).equal(112233);
                    expect(gstore.cache.keys.del.getCall(0).args[1].id).equal(778899);
                    gstore.cache.keys.del.restore();
                });
        });

        it('should clear all queries linked to its entity kind', () => {
            sinon.spy(gstore.cache.queries, 'clearQueriesByKind');
            return ModelInstance.clearCache()
                .then(() => {
                    assert.ok(gstore.cache.queries.clearQueriesByKind.called);
                    const { args } = gstore.cache.queries.clearQueriesByKind.getCall(0);
                    expect(args[0]).equal(ModelInstance.entityKind);
                });
        });

        it('should bubble up errors', (done) => {
            const err = new Error('Houston something bad happened');
            sinon.stub(gstore.cache.queries, 'clearQueriesByKind').rejects(err);
            ModelInstance.clearCache(ModelInstance.key(123))
                .catch((e) => {
                    expect(e).equal(err);
                    done();
                });
        });

        it('should not throw error if Redis is not present', () => {
            const err = new Error('Redis store not founc');
            err.code = 'ERR_NO_REDIS';
            sinon.stub(gstore.cache.queries, 'clearQueriesByKind').rejects(err);

            ModelInstance.clearCache(ModelInstance.key(123))
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
            ModelInstance = gstore.model('ModelTests-populate', schema, gstore);

            key0 = ModelInstance.key(123);
            key1 = ModelInstance.key(456);
            key2 = ModelInstance.key(789);

            entity = new ModelInstance({ name: 'Level0', ref: key1 }, null, null, null, key0);

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
            ModelInstance.populate(refs)(entities)
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
                        ModelInstance.populate(refs)(entities)
                            .then(() => {
                                expect(ds.get.getCalls().length).equal(0);
                            })
                    ))
            ));
        });
    });

    describe('save()', () => {
        let model;
        const data = { name: 'John', lastname: 'Snow' };

        beforeEach(() => {
            model = new ModelInstance(data);
        });

        it('should return the entity saved', () => (
            model.save().then((_entity) => {
                expect(_entity.className).equal('Entity');
            })
        ));

        it('should validate() before', () => {
            const validateSpy = sinon.spy(model, 'validate');

            return model.save().then(() => {
                expect(validateSpy.called).equal(true);
            });
        });

        it('should NOT validate() data before', () => {
            schema = new Schema({}, { validateBeforeSave: false });
            ModelInstance = Model.compile('Blog', schema, gstore);
            model = new ModelInstance({ name: 'John' });
            const validateSpy = sinon.spy(model, 'validate');

            return model.save().then(() => {
                expect(validateSpy.called).equal(false);
            });
        });

        it('should NOT save to Datastore if it didn\'t pass property validation', () => {
            model = new ModelInstance({ unknown: 'John' });

            return model.save().catch((err) => {
                assert.isDefined(err);
                expect(ds.save.called).equal(false);
                expect(err.code).equal(gstoreErrors.errorCodes.ERR_VALIDATION);
            });
        });

        it('should NOT save to Datastore if it didn\'t pass value validation', () => {
            model = new ModelInstance({ website: 'mydomain' });

            return model.save().catch((err) => {
                assert.isDefined(err);
                expect(ds.save.called).equal(false);
            });
        });

        it('should convert to Datastore format before saving to Datastore', () => {
            const spySerializerToDatastore = sinon.spy(datastoreSerializer, 'toDatastore');

            return model.save().then(() => {
                expect(model.gstore.ds.save.calledOnce).equal(true);
                expect(spySerializerToDatastore.called).equal(true);
                expect(spySerializerToDatastore.getCall(0).args[0].className).equal('Entity');
                expect(spySerializerToDatastore.getCall(0).args[0].entityData).equal(model.entityData);
                expect(spySerializerToDatastore.getCall(0).args[0].excludeFromIndexes).equal(model.excludeFromIndexes);
                assert.isDefined(model.gstore.ds.save.getCall(0).args[0].key);
                expect(model.gstore.ds.save.getCall(0).args[0].key.constructor.name).equal('Key');
                assert.isDefined(model.gstore.ds.save.getCall(0).args[0].data);

                spySerializerToDatastore.restore();
            });
        });

        it('should set "upsert" method by default', () => (
            model.save().then(() => {
                expect(model.gstore.ds.save.getCall(0).args[0].method).equal('upsert');
            })
        ));

        describe('options', () => {
            it('should accept a "method" parameter in options', () => (
                model.save(null, { method: 'insert' }).then(() => {
                    expect(model.gstore.ds.save.getCall(0).args[0].method).equal('insert');
                })
            ));

            it('should only allow "update", "insert", "upsert" as method', (done) => {
                model.save(null, { method: 'something' }).catch((e) => {
                    expect(e.message).equal('Method must be either "update", "insert" or "upsert"');

                    model.save(null, { method: 'update' })
                        .then(model.save(null, { method: 'upsert' }))
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

            model = new ModelInstance({});

            return model.save().catch((err) => {
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
            const entity = new OtherModel({});

            return entity.save(transaction)
                .then((_entity) => {
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
            const entity = new OtherModel({});

            entity.save(transaction);

            expect(spyPreHook.called).equal(true);
            expect(transaction.save.called).equal(false);
        });

        it('should save entity in a transaction in sync', () => {
            const schema2 = new Schema({}, { validateBeforeSave: false });
            const ModelInstance2 = gstore.model('NewType', schema2, gstore);
            model = new ModelInstance2({});
            model.save(transaction);

            // dummy test to make sure save method does not block
            expect(true).equal(true);
        });

        it('should save entity in a transaction synchronous when validateBeforeSave desactivated', () => {
            schema = new Schema({ name: { type: String } }, { validateBeforeSave: false });

            const ModelInstanceTemp = gstore.model('BlogTemp', schema, gstore);
            model = new ModelInstanceTemp({});

            model.save(transaction);
            expect(transaction.save.called).equal(true);
        });

        it('should save entity in a transaction synchronous when disabling hook', () => {
            schema = new Schema({
                name: { type: String },
            });

            schema.pre('save', () => Promise.resolve());

            const ModelInstanceTemp = gstore.model('BlogTemp', schema, gstore);
            model = new ModelInstanceTemp({});
            model.preHooksEnabled = false;
            model.save(transaction);

            const model2 = new ModelInstanceTemp({});
            const transaction2 = new Transaction();
            sinon.spy(transaction2, 'save');
            model2.save(transaction2);

            expect(transaction.save.called).equal(true);
            expect(transaction2.save.called).equal(false);
        });

        it('should throw error if transaction not instance of Transaction', () => (
            model.save({ id: 0 }, {})
                .catch((err) => {
                    assert.isDefined(err);
                    expect(err.message).equal('Transaction needs to be a gcloud Transaction');
                })
        ));

        it('should call pre hooks', () => {
            const spyPre = sinon.stub().resolves();

            schema = new Schema({ name: { type: String } });
            schema.pre('save', () => spyPre());
            ModelInstance = Model.compile('Blog', schema, gstore);
            model = new ModelInstance({ name: 'John' });

            return model.save().then(() => {
                expect(spyPre.calledBefore(ds.save)).equal(true);
            });
        });

        it('should call post hooks', () => {
            const spyPost = sinon.stub().resolves(123);
            schema = new Schema({ name: { type: String } });
            schema.post('save', () => spyPost());
            ModelInstance = Model.compile('Blog', schema, gstore);
            model = new ModelInstance({ name: 'John' });

            return model.save().then((result) => {
                expect(spyPost.called).equal(true);
                expect(result.name).equal('John');
            });
        });

        it('error in post hooks should be added to response', () => {
            const error = { code: 500 };
            const spyPost = sinon.stub().rejects(error);
            schema = new Schema({ name: { type: String } });
            schema.post('save', spyPost);
            ModelInstance = Model.compile('Blog', schema, gstore);
            model = new ModelInstance({ name: 'John' });

            return model.save().then((entity) => {
                assert.isDefined(entity[gstore.ERR_HOOKS]);
                expect(entity[gstore.ERR_HOOKS][0]).equal(error);
            });
        });

        it('transaction.execPostHooks() should call post hooks', () => {
            const spyPost = sinon.stub().resolves(123);
            schema = new Schema({ name: { type: String } });
            schema.post('save', spyPost);

            ModelInstance = Model.compile('Blog', schema, gstore);
            model = new ModelInstance({ name: 'John' });

            return model.save(transaction)
                .then(() => transaction.execPostHooks())
                .then(() => {
                    expect(spyPost.called).equal(true);
                    expect(spyPost.callCount).equal(1);
                });
        });

        it('transaction.execPostHooks() should set scope to entity saved', (done) => {
            schema.post('save', function preSave() {
                expect(this instanceof Entity).equal(true);
                expect(this.name).equal('John Jagger');
                done();
            });
            ModelInstance = Model.compile('Blog', schema, gstore);
            model = new ModelInstance({ name: 'John Jagger' });

            model.save(transaction)
                .then(() => transaction.execPostHooks());
        });

        it('if transaction.execPostHooks() is NOT called post middleware should not be called', () => {
            const spyPost = sinon.stub().resolves(123);
            schema = new Schema({ name: { type: String } });
            schema.post('save', spyPost);

            ModelInstance = Model.compile('Blog', schema, gstore);
            model = new ModelInstance({ name: 'John' });

            return model.save(transaction)
                .then(() => {
                    expect(spyPost.called).equal(false);
                });
        });

        it('should update modifiedOn to new Date if property in Schema', () => {
            schema = new Schema({ modifiedOn: { type: 'datetime' } });
            ModelInstance = gstore.model('BlogPost', schema);
            const entity = new ModelInstance({});

            return entity.save().then(() => {
                assert.isDefined(entity.entityData.modifiedOn);
                const diff = Math.abs(entity.entityData.modifiedOn.getTime() - Date.now());
                expect(diff < 10).equal(true);
            });
        });

        it('should convert plain geo object (latitude, longitude) to datastore GeoPoint', () => {
            schema = new Schema({ location: { type: 'geoPoint' } });
            ModelInstance = gstore.model('Car', schema);
            const entity = new ModelInstance({
                location: {
                    latitude: 37.305885314941406,
                    longitude: -89.51815032958984,
                },
            });

            return entity.save().then(() => {
                expect(entity.entityData.location.constructor.name).to.equal('GeoPoint');
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

            it('should call Model.clearCache()', () => {
                sinon.spy(ModelInstance, 'clearCache');
                return model.save().then((entity) => {
                    assert.ok(ModelInstance.clearCache.called);
                    expect(typeof ModelInstance.clearCache.getCall(0).args[0]).equal('undefined');
                    expect(entity.name).equal('John');
                    ModelInstance.clearCache.restore();
                });
            });

            it('on error when clearing the cache, should add the entity saved on the error object', (done) => {
                const err = new Error('Houston something bad happened');
                sinon.stub(gstore.cache.queries, 'clearQueriesByKind').rejects(err);

                model.save()
                    .catch((e) => {
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
            ModelInstance = gstore.model('TestValidate', schema);
            const model = new ModelInstance({ name: 'John' });

            const { error } = model.validate();

            assert.isDefined(error);
            expect(validation.validate.getCall(0).args[0]).deep.equal(model.entityData);
            expect(validation.validate.getCall(0).args[1]).equal(schema);
            expect(validation.validate.getCall(0).args[2]).equal(model.entityKind);
        });

        it('should sanitize the entityData', () => {
            schema = new Schema({ name: { type: String } });
            ModelInstance = gstore.model('TestValidate', schema);
            const model = new ModelInstance({ name: 'John', unknown: 'abc' });

            model.validate();

            assert.isUndefined(model.entityData.unknown);
        });

        it('should maintain the Datastore Key on the entityData with Joi Schema', () => {
            schema = new Schema({ name: { joi: Joi.string() } }, { joi: true });
            ModelInstance = gstore.model('TestValidate3', schema);
            const model = new ModelInstance({ name: 'John', createdOn: 'abc' });
            const key = model.entityData[gstore.ds.KEY];

            model.validate();

            expect(model.entityData[gstore.ds.KEY]).equal(key);
        });
    });
});
