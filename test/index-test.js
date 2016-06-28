/*jshint -W030 */

var chai       = require('chai');
var expect     = chai.expect;
var sinon      = require('sinon');
var gstore = require('../lib');
var Model      = require('../lib/model');
var pkg        = require('../package.json');

var gcloud = require('gcloud')({
    projectId: 'my-project'
});
var ds = gcloud.datastore({
    namespace : 'com.mydomain',
    apiEndpoint: 'http://localhost:8080'
});

describe('Datastools', function() {
    "use strict";

    let schema;

    it('should initialized its properties', () => {
        expect(gstore.models).to.exist;
        expect(gstore.modelSchemas).to.exist;
        expect(gstore.options).to.exist;
        expect(gstore.Schema).to.exist;
    });

    it('should save ds instance', () => {
        gstore.connect(ds);
        expect(gstore.ds).to.equal(ds);
    });

    it('should throw an error if ds passed on connect is not a Datastore instance', function() {
        let fn = () => {
            gstore.connect({});
        };

        expect(fn).to.throw();
    });

    describe('should create models', () => {
        beforeEach(() => {
            schema = new gstore.Schema({
                title : {type:'string'}
            });

            gstore.models       = {};
            gstore.modelSchemas = {};
            gstore.options      = {};
        });

        it('and add it with its schema to the cache', () => {
            var Model = gstore.model('Blog', schema);

            expect(Model).to.exist;
            expect(gstore.models.Blog).to.exist;
            expect(gstore.modelSchemas.Blog).to.exist;
        });

        it('and convert schema object to Schema class instance', () => {
            schema = {};

            var Model = gstore.model('Blog', schema);

            expect(Model.schema.constructor.name).to.equal('Schema');
        });

        it('and attach schema to compiled Model', () => {
            let Blog       = gstore.model('Blog', schema);
            let schemaUser = new gstore.Schema({name: {type: 'string'}});
            let User       = gstore.model('User', schemaUser);

            expect(Blog.schema).not.equal(User.schema);
        });

        it('and not add them to cache if told so', () => {
            let options = {cache:false};

            gstore.model('Image', schema, options);

            expect(gstore.models.Image).be.undefined;
        });

        it ('reading them from cache', () => {
            let mockModel          = {schema: schema};
            gstore.models.Blog = mockModel;

            let model = gstore.model('Blog', schema);

            expect(model).equal(mockModel);
        });

        it ('allowing to pass an existing Schema', () => {
            gstore.modelSchemas.Blog = schema;

            let model = gstore.model('Blog', schema);

            expect(model.schema).to.equal(schema);
        });

        it ('and throw error if trying to override schema', () => {
            let newSchema = new gstore.Schema({});
            let mockModel = {schema: schema};
            gstore.models.Blog = mockModel;

            let fn = () => {
                return gstore.model('Blog', newSchema);
            };

            expect(fn).to.throw(Error);
        });

        it ('and throw error if no Schema is passed', () => {
            let fn = () => {
                return gstore.model('Blog');
            };

            expect(fn).to.throw(Error);
        });
    });

    it('should return the models names', () => {
        gstore.models = {Blog:{}, Image:{}};

        let names = gstore.modelNames();

        expect(names).eql(['Blog', 'Image']);
    });

    it('should return the package version', () => {
        let version = pkg.version;

        expect(gstore.version).equal(version);
    });

    it('should return the datastore instance', () => {
        gstore.connect(ds);

        expect(gstore.ds).equal(ds);
    });

    it('should create shortcut of datastore.runInTransaction', () => {
        gstore.connect(ds);
        let fn = () => {};
        let cb = () => {};
        sinon.spy(ds, 'runInTransaction');

        gstore.runInTransaction(fn, cb);

        expect(ds.runInTransaction.called).be.true;
        expect(ds.runInTransaction.getCall(0).args[0]).equal(fn);
        expect(ds.runInTransaction.getCall(0).args[1]).equal(cb);
    });
});
