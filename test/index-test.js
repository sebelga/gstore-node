var chai       = require('chai');
var expect     = chai.expect;
var sinon      = require('sinon');
var datastools = require('../lib');
var Model      = require('../lib/model');
var pkg        = require('../package.json');

describe('Datastools', function() {
    "use strict";
    before(function() {
        sinon.stub(Model, 'compile', () => {
           return {
               init:() => {}
           };
        });
    });

    after(function() {
        Model.compile.restore();
    });

    it('should initialized properties', () => {
        expect(datastools.models).to.exist;
        expect(datastools.modelSchemas).to.exist;
        expect(datastools.options).to.exist;
        expect(datastools.Schema).to.exist;
    });

    it('should be able to connect to ds', () => {
        var ds = {};
        datastools.connect(ds);
        expect(datastools.ds).equal(ds);
    });

    describe('should create models', () => {
        beforeEach(() => {
            datastools.models       = {};
            datastools.modelSchemas = {};
            datastools.options      = {};
        });

        it('and add model and schema to cache', () => {
            var schema = {};
            var ds = {};

            datastools.model('Blog', schema);

            expect(datastools.models.Blog).to.exist;
            expect(datastools.modelSchemas.Blog).to.exist;
        });

        it('and not add them to cache', () => {
            var schema = {};
            var ds = {};
            var options = {cache:false};

            datastools.model('Image', schema, options);

            expect(datastools.models.Image).be.undefined;
        });

        it ('reading them from cache', () => {
            var schema             = new datastools.Schema({});
            var mockModel          = {schema: schema};
            datastools.models.Blog = mockModel;
            var ds = {};

            var model = datastools.model('Blog', schema, ds);

            expect(model).equal(mockModel);
        });

        it ('allowing to pass an existing Schema', () => {
            var schema = new datastools.Schema({});
            datastools.modelSchemas.Blog = schema;
            var ds = {};

            var fn = () => {
                datastools.model('Blog', schema);
            };

            expect(fn).to.not.throw(Error);
        });

        it ('and throw error if trying to override schema', () => {
            var schema    = new datastools.Schema({});
            var newSchema = new datastools.Schema({});
            var mockModel = {schema: schema};
            var ds        = {};
            datastools.models.Blog = mockModel;

            var fn = () => {
                return datastools.model('Blog', newSchema, ds);
            };

            expect(fn).to.throw(Error);
        });

        it ('and throw error if no Schema is passed', () => {
            var fn = () => {
                return datastools.model('Blog');
            };

            expect(fn).to.throw(Error);
        });
    });

    it('should return the models names', () => {
        datastools.models = {Blog:{}, Image:{}};

        var names = datastools.modelNames();

        expect(names).eql(['Blog', 'Image']);
    });

    it('should return the package version', () => {
        var version = pkg.version;

        expect(datastools.version).equal(version);
    });
});
