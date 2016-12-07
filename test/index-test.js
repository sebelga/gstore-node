
'use strict';

const chai = require('chai');
const sinon = require('sinon');

const expect = chai.expect;
const assert = chai.assert;

const ds = require('@google-cloud/datastore')({
    namespace: 'com.mydomain',
    apiEndpoint: 'http://localhost:8080',
});

const gstore = require('../lib');
const Schema = require('../lib').Schema;
const pkg = require('../package.json');

describe('gstore-node', () => {
    let schema;
    let ModelInstance;

    beforeEach(() => {
        gstore.models = {};
        gstore.modelSchemas = {};

        schema = new Schema({
            name: { type: 'string' },
            email: { type: 'string', read: false },
        });
        ModelInstance = gstore.model('Blog', schema, {});
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
        const version = pkg.version;

        expect(gstore.version).equal(version);
    });

    it('should return the datastore instance', () => {
        gstore.connect(ds);

        expect(gstore.ds).equal(ds);
    });

    it('should create shortcut of datastore.transaction', () => {
        gstore.connect(ds);
        sinon.spy(ds, 'transaction');

        const transaction = gstore.transaction();

        expect(ds.transaction.called).equal(true);
        expect(transaction.constructor.name).equal('Transaction');
    });

    describe('save() alias', () => {
        beforeEach(() => {
            sinon.stub(ds, 'save').resolves();
            gstore.connect(ds);
        });

        afterEach(() => {
            ds.save.restore();
        });

        it('should call datastore save passing the arguments', () => {
            const args = [[1, 2, 3]];

            return gstore.save(...args).then(() => {
                expect(ds.save.called).equal(true);
                expect(ds.save.getCall(0).args).deep.equal(args);
            });
        });

        it('should convert entity instances to datastore Format', () => {
            const model1 = new ModelInstance({ name: 'John' });
            const model2 = new ModelInstance({ name: 'Mick' });

            return gstore.save([model1, model2]).then(() => {
                const args = ds.save.getCall(0).args;
                const firstEntity = args[0][0];
                assert.isUndefined(firstEntity.className);
                expect(Object.keys(firstEntity)).deep.equal(['key', 'data']);
            });
        });

        it('should also work with a callback', () => {
            ds.save.restore();

            sinon.stub(ds, 'save', (...args) => {
                const cb = args.pop();
                return cb();
            });

            const model = new ModelInstance({ name: 'John' });

            return gstore.save(model, () => {
                const args = ds.save.getCall(0).args;
                const firstEntity = args[0];
                assert.isUndefined(firstEntity.className);
                expect(Object.keys(firstEntity)).deep.equal(['key', 'data']);
            });
        });

        it('should forward if no arguments', () => {
            return gstore.save().then(() => {
                expect(ds.save.getCall(0).args.length).equal(0);
            });
        });
    });
});
