var chai       = require('chai');
var expect     = chai.expect;
var sinon      = require('sinon');
var datastools = require('../lib');
var Model      = require('../lib/model');
var pkg        = require('../package.json');

describe('Datastools', function() {
    "use strict";
    before(function() {
        sinon.stub(Model, 'compile', function() {
           return {
               init:function() {}
           };
        });
    });

    it('should initialized properties', function() {
        expect(datastools.models).to.exist;
        expect(datastools.modelSchemas).to.exist;
        expect(datastools.options).to.exist;
        expect(datastools.Schema).to.exist;
    });

    it('should be able to connect to ds', function() {
        var ds = {};
        datastools.connect(ds);
        expect(datastools.ds).equal(ds);
    });

    describe('should create models', function() {
        beforeEach(function() {
            datastools.models       = {};
            datastools.modelSchemas = {};
            datastools.options      = {};
        });

        it('and add model and schema to cache', function() {
            var schema = {};
            var ds = {};

            datastools.model('Blog', schema);

            expect(datastools.models.Blog).to.exist;
            expect(datastools.modelSchemas.Blog).to.exist;
        });

        it('and not add them to cache', function() {
            var schema = {};
            var ds = {};
            var options = {cache:false};

            datastools.model('Image', schema, options);

            expect(datastools.models.Image).be.undefined;
        });

        it ('reading them from cache', function() {
            var schema             = new datastools.Schema({});
            var mockModel          = {schema: schema};
            datastools.models.Blog = mockModel;
            var ds = {};

            var model = datastools.model('Blog', schema, ds);

            expect(model).equal(mockModel);
        });

        it ('allowing to pass an existing Schema', function() {
            var schema = new datastools.Schema({});
            datastools.modelSchemas.Blog = schema;
            var ds = {};

            var fn = function() {
                datastools.model('Blog', schema);
            };

            expect(fn).to.not.throw(Error);
        });

        it ('and throw error if trying to override schema', function() {
            var schema    = new datastools.Schema({});
            var newSchema = new datastools.Schema({});
            var mockModel = {schema: schema};
            var ds        = {};
            datastools.models.Blog = mockModel;

            var fn = function() {
                return datastools.model('Blog', newSchema, ds);
            };

            expect(fn).to.throw(Error);
        });

        it ('and throw error if no Schema is passed', function() {
            var fn = function() {
                return datastools.model('Blog');
            };

            expect(fn).to.throw(Error);
        });
    });

    it('should return the models names', function() {
        datastools.models = {Blog:{}, Image:{}};

        var names = datastools.modelNames();

        expect(names).eql(['Blog', 'Image']);
    });

    it('should return the package version', () => {
        var version = pkg.version;

        expect(datastools.version).equal(version);
    });
});
