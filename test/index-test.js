/*jshint -W030 */
var chai       = require('chai');
var expect     = chai.expect;
var sinon      = require('sinon');
var datastools = require('../lib');
var Model      = require('../lib/model');
var pkg        = require('../package.json');

describe('Datastools', function() {
    "use strict";

    let schema;

    it('should initialized its properties', () => {
        expect(datastools.models).to.exist;
        expect(datastools.modelSchemas).to.exist;
        expect(datastools.options).to.exist;
        expect(datastools.Schema).to.exist;
    });

    it('should be able to connect to ds', () => {
        let ds = {};
        datastools.connect(ds);
        expect(datastools.ds).to.equal(ds);
    });

    describe('should create models', () => {
        beforeEach(() => {
            schema = new datastools.Schema({
                title : {type:'string'}
            });

            datastools.models       = {};
            datastools.modelSchemas = {};
            datastools.options      = {};
        });

        it('and add it with its schema to the cache', () => {
            var Model = datastools.model('Blog', schema);

            expect(Model).to.exist;
            expect(datastools.models.Blog).to.exist;
            expect(datastools.modelSchemas.Blog).to.exist;
        });

        it('and convert schema object to Schema class instance', () => {
            schema = {};

            var Model = datastools.model('Blog', schema);

            expect(Model.schema.constructor.name).to.equal('Schema');
        });

        it('should attach schema to compiled Model', () => {
            let Blog       = datastools.model('Blog', schema);
            let schemaUser = new datastools.Schema({name: {type: 'string'}});
            let User       = datastools.model('User', schemaUser);

            expect(Blog.schema).not.equal(User.schema);
        });

        it('and not add them to cache if told so', () => {
            let options = {cache:false};

            datastools.model('Image', schema, options);

            expect(datastools.models.Image).be.undefined;
        });

        it ('reading them from cache', () => {
            let mockModel          = {schema: schema};
            datastools.models.Blog = mockModel;

            let model = datastools.model('Blog', schema);

            expect(model).equal(mockModel);
        });

        it ('allowing to pass an existing Schema', () => {
            datastools.modelSchemas.Blog = schema;

            let model = datastools.model('Blog', schema);

            expect(model.schema).to.equal(schema);
        });

        it ('and throw error if trying to override schema', () => {
            let newSchema = new datastools.Schema({});
            let mockModel = {schema: schema};
            datastools.models.Blog = mockModel;

            let fn = () => {
                return datastools.model('Blog', newSchema);
            };

            expect(fn).to.throw(Error);
        });

        it ('and throw error if no Schema is passed', () => {
            let fn = () => {
                return datastools.model('Blog');
            };

            expect(fn).to.throw(Error);
        });
    });

    it('should return the models names', () => {
        datastools.models = {Blog:{}, Image:{}};

        let names = datastools.modelNames();

        expect(names).eql(['Blog', 'Image']);
    });

    it('should return the package version', () => {
        let version = pkg.version;

        expect(datastools.version).equal(version);
    });
});
