
'use strict';

/**
 * Make sure that we are starting from a fresh gstore instance
 */
delete require.cache[require.resolve('../lib')];

const chai = require('chai');
const sinon = require('sinon');
const { Datastore } = require('@google-cloud/datastore');

const { expect, assert } = chai;

const ds = new Datastore({
    namespace: 'com.mydomain',
    apiEndpoint: 'http://localhost:8080',
});

const { Gstore, instances } = require('../lib');

const gstore = new Gstore();
const { Schema } = gstore;
const pkg = require('../package.json');
const Transaction = require('./mocks/transaction');

describe('gstore-node', () => {
    let schema;
    let ModelInstance;
    let transaction;

    beforeEach(() => {
        gstore.models = {};
        gstore.modelSchemas = {};

        schema = new Schema({
            name: { type: 'string' },
            email: { type: 'string', read: false },
        });
        ModelInstance = gstore.model('Blog', schema, {});

        transaction = new Transaction();
        sinon.spy(transaction, 'save');
        sinon.spy(transaction, 'commit');
        sinon.spy(transaction, 'rollback');
    });

    afterEach(() => {
        transaction.save.restore();
        transaction.commit.restore();
        transaction.rollback.restore();
    });

    it('should initialized its properties', () => {
        assert.isDefined(gstore.models);
        assert.isDefined(gstore.modelSchemas);
        assert.isDefined(gstore.options);
        assert.isDefined(gstore.Schema);
    });

    it('should save ds instance', () => {
        gstore.connect(ds);
        expect(gstore.ds).to.equal(ds);
        expect(gstore.ds.constructor.name).equal('Datastore');
    });

    it('should throw an error if ds passed on connect is not a Datastore instance', () => {
        const fn = () => {
            gstore.connect({});
        };

        expect(fn).to.throw();
    });

    describe('should create models', () => {
        beforeEach(() => {
            schema = new gstore.Schema({
                title: { type: 'string' },
            });

            gstore.models = {};
            gstore.modelSchemas = {};
            gstore.options = {};
        });

        it('and add it with its schema to the cache', () => {
            const Model = gstore.model('Blog', schema);

            assert.isDefined(Model);
            assert.isDefined(gstore.models.Blog);
            assert.isDefined(gstore.modelSchemas.Blog);
        });

        it('and convert schema object to Schema class instance', () => {
            schema = {};

            const Model = gstore.model('Blog', schema);

            expect(Model.schema.constructor.name).to.equal('Schema');
        });

        it('and attach schema to compiled Model', () => {
            const Blog = gstore.model('Blog', schema);
            const schemaUser = new gstore.Schema({ name: { type: 'string' } });
            const User = gstore.model('User', schemaUser);

            expect(Blog.schema).not.equal(User.schema);
        });

        it('and not add them to cache if told so', () => {
            const options = { cache: false };

            gstore.model('Image', schema, options);

            assert.isUndefined(gstore.models.Image);
        });

        it('reading them from cache', () => {
            const mockModel = { schema };
            gstore.models.Blog = mockModel;

            const model = gstore.model('Blog', schema);

            expect(model).equal(mockModel);
        });

        it('allowing to pass an existing Schema', () => {
            gstore.modelSchemas.Blog = schema;

            const model = gstore.model('Blog', schema);

            expect(model.schema).to.equal(schema);
        });

        it('and throw error if trying to override schema', () => {
            const newSchema = new gstore.Schema({});
            const mockModel = { schema };
            gstore.models.Blog = mockModel;

            const fn = () => gstore.model('Blog', newSchema);

            expect(fn).to.throw(Error);
        });

        it('and throw error if no Schema is passed', () => {
            const fn = () => gstore.model('Blog');

            expect(fn).to.throw(Error);
        });
    });

    it('should return the models names', () => {
        gstore.models = { Blog: {}, Image: {} };

        const names = gstore.modelNames();

        expect(names).eql(['Blog', 'Image']);
    });

    it('should return the package version', () => {
        const { version } = pkg;

        expect(gstore.version).equal(version);
    });

    it('should create shortcut of datastore.transaction', () => {
        sinon.spy(ds, 'transaction');

        const trans = gstore.transaction();

        expect(ds.transaction.called).equal(true);
        expect(trans.constructor.name).equal('Transaction');
    });

    describe('save() alias', () => {
        beforeEach(() => {
            gstore.connect(ds);
            sinon.stub(ds, 'save').resolves();
        });

        afterEach(() => {
            ds.save.restore();
        });

        it('should convert entity instances to datastore Format', () => {
            const entity1 = new ModelInstance({ name: 'John' });
            const entity2 = new ModelInstance({ name: 'Mick' });

            return gstore.save([entity1, entity2]).then(() => {
                const { args } = ds.save.getCall(0);
                const firstEntity = args[0][0];
                assert.isUndefined(firstEntity.className);
                expect(Object.keys(firstEntity)).deep.equal(['key', 'data']);
            });
        });

        it('should work inside a transaction', () => {
            const entity = new ModelInstance({ name: 'John' });

            gstore.save(entity, transaction);

            expect(transaction.save.called).equal(true);
            expect(ds.save.called).equal(false);
        });

        it('should throw an error if no entities passed', () => {
            const func = () => gstore.save();

            expect(func).to.throw('No entities passed');
        });

        it('should validate entity before saving', done => {
            schema = new Schema({ name: { type: String } });
            const Model = gstore.model('TestValidate', schema);
            const entity1 = new Model({ name: 'abc' });
            const entity2 = new Model({ name: 123 });
            const entity3 = new Model({ name: 'def' });
            sinon.spy(entity1, 'validate');
            sinon.spy(entity3, 'validate');

            gstore.save([entity1, entity2, entity3], undefined, { validate: true })
                .catch(e => {
                    expect(e.code).equal('ERR_VALIDATION');
                    expect(entity1.validate.called).equal(true);
                    expect(entity3.validate.called).equal(false); // fail fast, exit validation
                    done();
                });
        });

        it('should allow to pass a save method ("insert", "update", "upsert")', () => {
            const entity = new ModelInstance({ name: 'John' });

            return gstore.save(entity, undefined, { method: 'insert' })
                .then(() => {
                    const { args } = ds.save.getCall(0);
                    expect(args[0].method).equal('insert');
                });
        });
    });

    describe('cache', () => {
        /* eslint-disable global-require  */
        it('should not set any cache by default', () => {
            const gstoreNoCache = new Gstore();
            assert.isUndefined(gstoreNoCache.cache);
        });

        it('should set the default cache to memory lru-cache', () => {
            const gstoreWithCache = new Gstore({ cache: true });
            gstoreWithCache.connect(ds);

            const { cache } = gstoreWithCache;
            assert.isDefined(cache);
            expect(cache.stores.length).equal(1);
            expect(cache.stores[0].store).equal('memory');
        });

        it('should create cache instance from config passed', () => {
            const cacheSettings = {
                stores: [{ store: 'memory' }],
                config: {
                    ttl: {
                        keys: 12345,
                        queries: 6789,
                    },
                },
            };
            const gstoreWithCache = new Gstore({ cache: cacheSettings });
            gstoreWithCache.connect(ds);
            const { cache } = gstoreWithCache;

            expect(gstoreWithCache.cache).equal(cache);
            expect(gstoreWithCache.cache.config.ttl.keys).equal(12345);
        });
    });

    describe('multi instances', () => {
        it('should cache instances', () => {
            const gstore1 = new Gstore();
            const gstore2 = new Gstore({ cache: true });

            instances.set('instance-1', gstore1);
            instances.set('instance-2', gstore2);

            const cached1 = instances.get('instance-1');
            const cached2 = instances.get('instance-2');
            expect(cached1).equal(gstore1);
            expect(cached2).equal(gstore2);
        });

        it('should throw Error if wrong config', () => {
            const func1 = () => new Gstore(0);
            const func2 = () => new Gstore('some-string');

            expect(func1).throw();
            expect(func2).throw();
        });
    });
});
