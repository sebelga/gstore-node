
'use strict';

const chai = require('chai');
const sinon = require('sinon');
const is = require('is');
const Joi = require('joi');

const gstoreErrors = require('../lib/errors');

const { expect, assert } = chai;

const ds = require('./mocks/datastore')({
    namespace: 'com.mydomain',
});

const Transaction = require('./mocks/transaction');
const Query = require('./mocks/query');

const gstore = require('../')();

const Entity = require('../lib/entity');
const datastoreSerializer = require('../lib/serializer').Datastore;
const { queryHelpers, validation } = require('../lib/helpers');
const { createDataLoader } = require('../lib/dataloader');

const { Schema } = gstore;
let Model = require('../lib/model');

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

        gstore.connect(ds);

        schema = new Schema({
            name: { type: 'string' },
            lastname: { type: 'string', excludeFromIndexes: true },
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

        mockEntity = {
            name: 'John',
            lastname: 'Snow',
            email: 'john@snow.com',
        };

        mockEntity[ds.KEY] = ds.key(['BlogPost', 1234]);

        const mockEntity2 = { name: 'John', lastname: 'Snow', password: 'xxx' };
        mockEntity2[ds.KEY] = ds.key(['BlogPost', 1234]);

        const mockEntit3 = { name: 'Mick', lastname: 'Jagger' };
        mockEntit3[ds.KEY] = ds.key(['BlogPost', 'keyname']);

        mockEntities = [mockEntity2, mockEntit3];
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

        it('should sanitize with Joi.strip()', () => {
            schema = new Schema({
                createdOn: { joi: Joi.strip() },
            }, { joi: true });
            ModelInstance = gstore.model('BlogJoi', schema, gstore);

            const entityData = ModelInstance.sanitize({ createdOn: 'abc' });

            assert.isUndefined(entityData.createdOn);
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
            entity[ds.KEY] = ds.key(['BlogPost', 123]);
            sinon.stub(ds, 'get').resolves([entity]);
        });

        afterEach(() => {
            ds.get.restore();
        });

        it('passing an integer id', () => {
            return ModelInstance.get(123).then(onEntity);

            function onEntity(_entity) {
                expect(ds.get.getCall(0).args[0].constructor.name).equal('Key');
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

            return ModelInstance.get([22, 69], null, null, null, { preserveOrder: true }).then(onResult);

            function onResult(_entity) {
                expect(is.array(ds.get.getCall(0).args[0])).equal(true);
                expect(is.array(_entity)).equal(true);
                expect(_entity[0].entityKey.id).equal(22); // sorted
            }
        });

        it('converting a string integer to real integer', () => ModelInstance.get('123').then(() => {
            assert.isUndefined(ds.get.getCall(0).args[0].name);
            expect(ds.get.getCall(0).args[0].id).equal(123);
        }));

        it('not converting string with mix of number and non number', () => ModelInstance.get('123:456').then(() => {
            expect(ds.get.getCall(0).args[0].name).equal('123:456');
        }));

        it('passing an ancestor path array', () => {
            const ancestors = ['Parent', 'keyname'];

            return ModelInstance.get(123, ancestors).then(() => {
                expect(ds.get.getCall(0).args[0].constructor.name).equal('Key');
                expect(ds.get.getCall(0).args[0].parent.kind).equal(ancestors[0]);
                expect(ds.get.getCall(0).args[0].parent.name).equal(ancestors[1]);
            });
        });

        it('should allow a namespace', () => {
            const namespace = 'com.mydomain-dev';

            return ModelInstance.get(123, null, namespace).then(() => {
                expect(ds.get.getCall(0).args[0].namespace).equal(namespace);
            });
        });

        it('on datastore get error, should reject error', () => {
            ds.get.restore();
            const error = { code: 500, message: 'Something went really bad' };
            sinon.stub(ds, 'get').rejects(error);

            return ModelInstance.get(123)
                .catch((err) => {
                    expect(err).equal(error);
                });
        });

        it('on no entity found, should return a 404 error', () => {
            ds.get.restore();

            sinon.stub(ds, 'get').resolves([]);

            return ModelInstance.get(123).catch((err) => {
                expect(err.code).equal(404);
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
            const spy = sinon.stub(dataloader, 'load').resolves([{}]);

            return ModelInstance.get(123, null, null, null, { dataloader }).then(() => {
                expect(spy.called).equal(true);

                const args = spy.getCall(0).args[0];
                const key = ds.key({ path: ['Blog', 123], namespace: 'com.mydomain' });
                expect(args).deep.equal(key);
            });
        });

        it('should get data through a Dataloader instance (multiple key)', () => {
            const dataloader = createDataLoader(ds);
            const spy = sinon.stub(dataloader, 'loadMany').resolves([[{}, {}]]);

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

            ModelInstance.get([123, 456], null, null, null, { dataloader }).then(() => {}, (err) => {
                expect(err.name).equal('GstoreError');
                expect(err.message).equal('dataloader must be a "DataLoader" instance');
                done();
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

        it('should first get the entity by Key', () => ModelInstance.update(123).then(() => {
            expect(transaction.get.getCall(0).args[0].constructor.name).equal('Key');
            expect(transaction.get.getCall(0).args[0].path[1]).equal(123);
        }));

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

        it('should return 404 if entity not found', () => {
            transaction.get.restore();
            sinon.stub(transaction, 'get').resolves([]);

            return ModelInstance.update('keyname').catch((err) => {
                expect(err.code).equal(404);
            });
        });

        it('should return error if any while saving', () => {
            transaction.run.restore();
            const error = { code: 500, message: 'Houston wee need you.' };
            sinon.stub(transaction, 'run').rejects(error);

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
            const data = {
                name: 'Mick',
            };
            return ModelInstance.update(123, data, null, null, null, { replace: true })
                .then((entity) => {
                    expect(entity.entityData.name).equal('Mick');
                    expect(entity.entityData.lastname).equal(null);
                    expect(entity.entityData.email).equal(null);
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

        it('should run inside an EXISTING transaction', () => (
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

        it('should still work passing a callback', () => ModelInstance.update(123, (err, entity) => {
            expect(entity.className).equal('Entity');
        }));
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

        it(
            'should call ds.delete with correct Key (string id)',
            () => ModelInstance.delete('keyName')
                .then((response) => {
                    expect(ds.delete.called).equal(true);
                    expect(ds.delete.getCall(0).args[0].path[1]).equal('keyName');
                    expect(response.success).equal(true);
                })
        );

        it(
            'not converting string id with mix of number and alpha chars',
            () => ModelInstance.delete('123:456')
                .then(() => {
                    expect(ds.delete.getCall(0).args[0].name).equal('123:456');
                })
        );

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

        it(
            'should delete entity in a transaction',
            () => ModelInstance.delete(123, null, null, transaction)
                .then(() => {
                    expect(transaction.delete.called).equal(true);
                    expect(transaction.delete.getCall(0).args[0].path[1]).equal(123);
                })
        );

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

        it(
            'should throw error if transaction passed is not instance of gcloud Transaction',
            () => ModelInstance.delete(123, null, null, {})
                .catch((err) => {
                    expect(err.message).equal('Transaction needs to be a gcloud Transaction');
                })
        );

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

        it('should set "pre" hook scope to entity being deleted (1)', () => {
            schema.pre('delete', function preDelete() {
                expect(this.className).equal('Entity');
                return Promise.resolve();
            });
            ModelInstance = Model.compile('Blog', schema, gstore);

            return ModelInstance.delete(123);
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

        it('should pass key deleted to post hooks', () => {
            schema.post('delete', (response) => {
                expect(response.key.constructor.name).equal('Key');
                expect(response.key.id).equal(123);
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
            schema = new Schema({ name: { type: 'string' } });
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

    describe('gcloud-node queries', () => {
        let query;
        let responseQueries;

        beforeEach(() => {
            responseQueries = [mockEntities, {
                moreResults: ds.MORE_RESULTS_AFTER_LIMIT,
                endCursor: 'abcdef',
            }];

            query = ModelInstance.query();
            sinon.stub(query, '__originalRun').resolves(responseQueries);
        });

        it('should create gcloud-node Query object', () => {
            query = ModelInstance.query();

            expect(query.constructor.name).equal('Query');
        });

        it('should be able to execute all gcloud-node queries', () => {
            const fn = () => {
                query = ModelInstance.query()
                    .filter('name', '=', 'John')
                    .groupBy(['name'])
                    .select(['name'])
                    .order('lastname', { descending: true })
                    .limit(1)
                    .offset(1)
                    .start('X');
                return query;
            };

            expect(fn).to.not.throw(Error);
        });

        it('should throw error if calling unregistered query method', () => {
            const fn = () => {
                query = ModelInstance.query()
                    .unkown('test', false);
                return query;
            };

            expect(fn).to.throw(Error);
        });

        it('should run query', () => query.run().then((response) => {
            // We add manually the id in the mocks to be able to deep compare
            mockEntities[0].id = 1234;
            mockEntities[1].id = 'keyname';

            // we delete from the mock the property
            // 'password' it has been defined with read: false
            delete mockEntities[0].password;

            expect(query.__originalRun.called).equal(true);
            expect(response.entities.length).equal(2);
            assert.isUndefined(response.entities[0].password);
            expect(response.entities).deep.equal(mockEntities);
            expect(response.nextPageCursor).equal('abcdef');

            delete mockEntities[0].id;
            delete mockEntities[1].id;
        }));

        it('should add id to entities', () => (
            query.run()
                .then((response) => {
                    expect(response.entities[0].id).equal(mockEntities[0][ds.KEY].id);
                    expect(response.entities[1].id).equal(mockEntities[1][ds.KEY].name);
                })
        ));

        it('should accept "readAll" option', () => (
            query.run(({ readAll: true }))
                .then((response) => {
                    assert.isDefined(response.entities[0].password);
                })
        ));

        it('should accept "showKey" option', () => (
            query.run(({ showKey: true }))
                .then((response) => {
                    assert.isDefined(response.entities[0].__key);
                })
        ));

        it('should not add endCursor to response', () => {
            query.__originalRun.restore();
            sinon.stub(query, '__originalRun').resolves([[], { moreResults: ds.NO_MORE_RESULTS }]);

            return query.run().then((response) => {
                assert.isUndefined(response.nextPageCursor);
            });
        });

        it('should catch error thrown in query run()', () => {
            const error = { code: 400, message: 'Something went wrong doctor' };
            query.__originalRun.restore();
            sinon.stub(query, '__originalRun').rejects(error);

            return query.run().catch((err) => {
                expect(err).equal(error);
            });
        });

        it('should allow a namespace for query', () => {
            const namespace = 'com.mydomain-dev';
            query = ModelInstance.query(namespace);

            expect(query.namespace).equal(namespace);
        });

        it('should create query on existing transaction', () => {
            query = ModelInstance.query(null, transaction);
            expect(query.scope.constructor.name).equal('Transaction');
        });

        it('should not set transaction if not an instance of gcloud Transaction', () => {
            const fn = () => {
                query = ModelInstance.query(null, {});
            };

            expect(fn).to.throw(Error);
        });

        it('should still work with a callback', () => {
            query = ModelInstance.query()
                .filter('name', 'John');
            sinon.stub(query, '__originalRun').resolves(responseQueries);

            return query.run((err, response) => {
                expect(query.__originalRun.called).equal(true);
                expect(response.entities.length).equal(2);
                expect(response.nextPageCursor).equal('abcdef');
            });
        });
    });

    describe('shortcut queries', () => {
        let queryMock;
        beforeEach(() => {
            queryMock = new Query(ds, { entities: mockEntities });
            sinon.stub(ds, 'createQuery').callsFake(() => queryMock);
            sinon.spy(queryHelpers, 'buildFromOptions');
            sinon.spy(queryMock, 'run');
            sinon.spy(queryMock, 'filter');
            sinon.spy(queryMock, 'hasAncestor');
            sinon.spy(queryMock, 'order');
            sinon.spy(queryMock, 'limit');
            sinon.spy(queryMock, 'offset');
        });

        afterEach(() => {
            ds.createQuery.restore();
            queryHelpers.buildFromOptions.restore();
            queryMock.run.restore();
            queryMock.filter.restore();
            queryMock.hasAncestor.restore();
            queryMock.order.restore();
            queryMock.limit.restore();
            queryMock.offset.restore();
        });

        describe('list', () => {
            it('should work with no settings defined', () => (
                ModelInstance.list().then((response) => {
                    expect(response.entities.length).equal(2);
                    expect(response.nextPageCursor).equal('abcdef');
                    assert.isUndefined(response.entities[0].password);
                })
            ));

            it('should add id to entities', () => (
                ModelInstance.list().then((response) => {
                    expect(response.entities[0].id).equal(mockEntities[0][ds.KEY].id);
                    expect(response.entities[1].id).equal(mockEntities[1][ds.KEY].name);
                })
            ));

            it('should not add endCursor to response', () => {
                ds.createQuery.restore();
                sinon.stub(ds, 'createQuery').callsFake(() => (
                    new Query(ds, { entities: mockEntities }, { moreResults: ds.NO_MORE_RESULTS })));

                return ModelInstance.list().then((response) => {
                    assert.isUndefined(response.nextPageCursor);
                });
            });

            it('should read settings passed', () => {
                const querySettings = {
                    limit: 10,
                    offset: 10,
                    format: gstore.Queries.formats.ENTITY,
                };
                schema.queries('list', querySettings);
                ModelInstance = Model.compile('Blog', schema, gstore);

                return ModelInstance.list().then((response) => {
                    expect(queryHelpers.buildFromOptions.getCall(0).args[1].limit).equal(querySettings.limit);
                    expect(queryMock.limit.getCall(0).args[0]).equal(querySettings.limit);
                    expect(queryHelpers.buildFromOptions.getCall(0).args[1].offset).equal(querySettings.offset);
                    expect(queryMock.offset.getCall(0).args[0]).equal(querySettings.offset);
                    expect(response.entities[0].className).equal('Entity');
                });
            });

            it('should override global setting with options', () => {
                const querySettings = {
                    limit: 10,
                    offset: 10,
                    readAll: true,
                    showKey: true,
                };
                schema.queries('list', querySettings);
                ModelInstance = Model.compile('Blog', schema, gstore);

                return ModelInstance.list({ limit: 15, offset: 15 }).then((response) => {
                    expect(queryHelpers.buildFromOptions.getCall(0).args[1]).not.deep.equal(querySettings);
                    expect(queryMock.limit.getCall(0).args[0]).equal(15);
                    expect(queryMock.offset.getCall(0).args[0]).equal(15);
                    assert.isDefined(response.entities[0].password);
                    assert.isDefined(response.entities[0].__key);
                });
            });

            it('should deal with err response', () => {
                queryMock.run.restore();
                const error = { code: 500, message: 'Server error' };
                sinon.stub(queryMock, 'run').rejects(error);

                return ModelInstance.list().catch((err) => {
                    expect(err).equal(err);
                });
            });

            it('should accept a namespace ', () => {
                const namespace = 'com.mydomain-dev';

                return ModelInstance.list({ namespace }).then(() => {
                    expect(queryHelpers.buildFromOptions.getCall(0).args[1]).deep.equal({ namespace });
                });
            });

            it('should still work with a callback', () => ModelInstance.list((err, response) => {
                expect(response.entities.length).equal(2);
                expect(response.nextPageCursor).equal('abcdef');
                assert.isUndefined(response.entities[0].password);
            }));
        });

        describe('deleteAll()', () => {
            beforeEach(() => {
                sinon.stub(ds, 'delete').callsFake(() => {
                    // We need to update our mock response of the Query
                    // to not enter in an infinite loop as we recursivly query
                    // until there are no more entities
                    ds.createQuery.restore();
                    sinon.stub(ds, 'createQuery').callsFake(() => new Query(ds, { entities: [] }));
                    return Promise.resolve([{ indexUpdates: 3 }]);
                });
            });

            afterEach(() => {
                ds.delete.restore();
            });

            it('should get all entities through Query', () => ModelInstance.deleteAll().then(() => {
                expect(queryMock.run.called).equal(true);
                expect(ds.createQuery.getCall(0).args.length).equal(1);
            }));

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
                    expect(args.length).equal(5);
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
        });

        describe('findAround()', () => {
            it('should get 3 entities after a given date', () => (
                ModelInstance.findAround('createdOn', '2016-1-1', { after: 3 })
                    .then((entities) => {
                        expect(queryMock.filter.getCall(0).args)
                            .deep.equal(['createdOn', '>', '2016-1-1']);
                        expect(queryMock.order.getCall(0).args)
                            .deep.equal(['createdOn', { descending: true }]);
                        expect(queryMock.limit.getCall(0).args[0]).equal(3);

                        // Make sure to not show properties where read is set to false
                        assert.isUndefined(entities[0].password);
                    })
            ));

            it('should get 3 entities before a given date', () => (
                ModelInstance.findAround('createdOn', '2016-1-1', { before: 12 }).then(() => {
                    expect(queryMock.filter.getCall(0).args).deep.equal(['createdOn', '<', '2016-1-1']);
                    expect(queryMock.limit.getCall(0).args[0]).equal(12);
                })
            ));

            it('should throw error if not all arguments are passed', () =>
                ModelInstance.findAround('createdOn', '2016-1-1')
                    .catch((err) => {
                        expect(err.code).equal(400);
                        expect(err.message).equal('Argument missing');
                    }));

            it('should validate that options passed is an object', () =>
                ModelInstance.findAround('createdOn', '2016-1-1', 'string', (err) => {
                    expect(err.code).equal(400);
                }));

            it('should validate that options has a "after" or "before" property', () =>
                ModelInstance.findAround('createdOn', '2016-1-1', {}, (err) => {
                    expect(err.code).equal(400);
                }));

            it('should validate that options has not both "after" & "before" properties', () =>
                ModelInstance.findAround('createdOn', '2016-1-1', { after: 3, before: 3 }, (err) => {
                    expect(err.code).equal(400);
                }));

            it('should add id to entities', () => (
                ModelInstance.findAround('createdOn', '2016-1-1', { before: 3 }).then((entities) => {
                    expect(entities[0].id).equal(mockEntities[0][ds.KEY].id);
                    expect(entities[1].id).equal(mockEntities[1][ds.KEY].name);
                })
            ));

            it('should read all properties', () => (
                ModelInstance.findAround('createdOn', '2016-1-1', { before: 3, readAll: true, format: 'ENTITY' })
                    .then((entities) => {
                        assert.isDefined(entities[0].password);
                        expect(entities[0].className).equal('Entity');
                    })
            ));

            it('should add entities key', () => (
                ModelInstance.findAround('createdOn', '2016-1-1', { before: 3, showKey: true })
                    .then((entities) => {
                        assert.isDefined(entities[0].__key);
                    })
            ));

            it('should accept a namespace', () => {
                const namespace = 'com.new-domain.dev';
                ModelInstance.findAround('createdOn', '2016-1-1', { before: 3 }, namespace).then(() => {
                    expect(ds.createQuery.getCall(0).args[0]).equal(namespace);
                });
            });

            it('should deal with err response', () => {
                queryMock.run.restore();
                const error = { code: 500, message: 'Server error' };
                sinon.stub(queryMock, 'run').rejects(error);

                return ModelInstance.findAround('createdOn', '2016-1-1', { after: 3 }).catch((err) => {
                    expect(err).equal(error);
                });
            });

            it(
                'should still work passing a callback',
                () => ModelInstance.findAround('createdOn', '2016-1-1', { after: 3 }, (err, entities) => {
                    expect(queryMock.filter.getCall(0).args)
                        .deep.equal(['createdOn', '>', '2016-1-1']);
                    expect(queryMock.order.getCall(0).args)
                        .deep.equal(['createdOn', { descending: true }]);
                    expect(queryMock.limit.getCall(0).args[0]).equal(3);

                    // Make sure to not show properties where read is set to false
                    assert.isUndefined(entities[0].password);
                })
            );
        });

        describe('findOne()', () => {
            it('should call pre and post hooks', () => {
                const spies = {
                    pre: () => Promise.resolve(),
                    post: () => Promise.resolve(),
                };
                sinon.spy(spies, 'pre');
                sinon.spy(spies, 'post');
                schema.pre('findOne', spies.pre);
                schema.post('findOne', spies.post);
                ModelInstance = Model.compile('Blog', schema, gstore);

                ModelInstance.findOne({}).then(() => {
                    expect(spies.pre.calledOnce).equal(true);
                    expect(spies.post.calledOnce).equal(true);
                    expect(spies.pre.calledBefore(queryMock.run)).equal(true);
                    expect(spies.post.calledAfter(queryMock.run)).equal(true);
                });
            });

            it('should run correct gcloud Query', () => (
                ModelInstance.findOne({ name: 'John', email: 'john@snow.com' }).then(() => {
                    expect(queryMock.filter.getCall(0).args)
                        .deep.equal(['name', 'John']);

                    expect(queryMock.filter.getCall(1).args)
                        .deep.equal(['email', 'john@snow.com']);
                })
            ));

            it('should return a Model instance', () => (
                ModelInstance.findOne({ name: 'John' }).then((entity) => {
                    expect(entity.entityKind).equal('Blog');
                    expect(entity instanceof Model).equal(true);
                })
            ));

            it('should validate that params passed are object', () => (
                ModelInstance.findOne('some string').catch((err) => {
                    expect(err.code).equal(400);
                })
            ));

            it('should accept ancestors', () => {
                const ancestors = ['Parent', 'keyname'];

                return ModelInstance.findOne({ name: 'John' }, ancestors, () => {
                    expect(queryMock.hasAncestor.getCall(0).args[0].path)
                        .deep.equal(ancestors);
                });
            });

            it('should accept a namespace', () => {
                const namespace = 'com.new-domain.dev';

                return ModelInstance.findOne({ name: 'John' }, null, namespace, () => {
                    expect(ds.createQuery.getCall(0).args[0]).equal(namespace);
                });
            });

            it('should deal with err response', () => {
                queryMock.run.restore();
                const error = { code: 500, message: 'Server error' };
                sinon.stub(queryMock, 'run').rejects(error);

                return ModelInstance.findOne({ name: 'John' }).catch((err) => {
                    expect(err).equal(error);
                });
            });

            it('if entity not found should return 404', () => {
                queryMock.run.restore();
                sinon.stub(queryMock, 'run').resolves();

                return ModelInstance.findOne({ name: 'John' }).catch((err) => {
                    expect(err.code).equal(404);
                });
            });

            it('should still work with a callback', () => (
                ModelInstance.findOne({ name: 'John' }, (err, entity) => {
                    expect(entity.entityKind).equal('Blog');
                    expect(entity instanceof Model).equal(true);
                })
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

            Model = gstore.model('TransactionHooks', schema, gstore);
            const entity = new Model({});

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
            Model = gstore.model('TransactionHooks', schema, gstore);
            const entity = new Model({});

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
            schema = new Schema({ name: { type: 'string' } }, { validateBeforeSave: false });

            const ModelInstanceTemp = gstore.model('BlogTemp', schema, gstore);
            model = new ModelInstanceTemp({});

            model.save(transaction);
            expect(transaction.save.called).equal(true);
        });

        it('should save entity in a transaction synchronous when disabling hook', () => {
            schema = new Schema({
                name: { type: 'string' },
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

            schema = new Schema({ name: { type: 'string' } });
            schema.pre('save', () => spyPre());
            ModelInstance = Model.compile('Blog', schema, gstore);
            model = new ModelInstance({ name: 'John' });

            return model.save().then(() => {
                expect(spyPre.calledBefore(ds.save)).equal(true);
            });
        });

        it('should call post hooks', () => {
            const spyPost = sinon.stub().resolves(123);
            schema = new Schema({ name: { type: 'string' } });
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
            schema = new Schema({ name: { type: 'string' } });
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
            schema = new Schema({ name: { type: 'string' } });
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

        it('if transaction.execPostHooks() is NOT called post middleware should not be called', () => {
            const spyPost = sinon.stub().resolves(123);
            schema = new Schema({ name: { type: 'string' } });
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
    });

    describe('validate()', () => {
        beforeEach(() => {
            sinon.spy(validation, 'validate');
        });

        afterEach(() => {
            validation.validate.restore();
        });

        it('should call "Validation" helper passing entityData, Schema & entityKind', () => {
            schema = new Schema({ name: { type: 'string' } });
            ModelInstance = gstore.model('TestValidate', schema);
            const model = new ModelInstance({ name: 'John' });

            const { error } = model.validate();

            assert.isDefined(error);
            expect(validation.validate.getCall(0).args[0]).deep.equal(model.entityData);
            expect(validation.validate.getCall(0).args[1]).equal(schema);
            expect(validation.validate.getCall(0).args[2]).equal(model.entityKind);
        });

        it('should sanitize the entityData', () => {
            schema = new Schema({ name: { type: 'string' }, createdOn: { write: false } });
            ModelInstance = gstore.model('TestValidate', schema);
            const model = new ModelInstance({ name: 'John', createdOn: 'abc' });

            const schema2 = new Schema({ createdOn: { joi: Joi.string().strip() } }, { joi: true });
            const ModelInstance2 = gstore.model('TestValidate2', schema2);
            const model2 = new ModelInstance2({ createdOn: 'abc' });

            const { value } = model.validate();
            const { value: value2 } = model2.validate();

            assert.isUndefined(value.createdOn);
            assert.isUndefined(value2.createdOn);
        });
    });
});
