var chai       = require('chai');
var expect     = chai.expect;

var datastools = require('../lib');
var Schema     = require('../lib').Schema;
var Entity     = require('../lib/entity');
var Model      = require('../lib');

describe('Schema', () => {
    "use strict";

    describe('contructor', () => {
        it('should initialized properties', () => {
            var schema = new Schema({});

            expect(schema.methods).to.exist;
            expect(schema.defaultQueries).to.exist;
            expect(schema.paths).to.exist;
            expect(schema.callQueue).to.exist;
            expect(schema.options).to.exist;
            expect(schema.s).to.exist;
        });

        it ('should merge options passed', () => {
            var schema = new Schema({}, {keyOption:'pass'});

            expect(schema.options.keyOption).equal('pass');
        });

        it ('should create path with obj passed', () => {
            var schema = new Schema({prop1:{type:'string'}, prop2:{type:'number'}});

            expect(schema.paths.prop1).to.exist;
            expect(schema.paths.prop2).to.exist;
        });

        it ('should not allowed reserved properties on schema', function() {
            var fn = () => {
                var schema = new Schema({ds:123, emit:123});
            };

            expect(fn).to.throw(Error);
        });
    });

    describe('add method', () => {
        var schema;

        beforeEach(function() {
            schema = new Schema({});
            schema.methods = {};
        });

        it ('should add it to its methods table', () => {
            schema.method('doSomething', () => {});

            expect(schema.methods.doSomething).exist;
        });

        it ('should not add if value is not a function', () => {
            schema.method('doSomething', 123);

            expect(schema.methods.doSomething).to.not.exist;
        });

        it ('should allow to pass a table of functions and validate type', () => {
            schema.method({doSomething:() => {}, doAnotherThing:123});

            expect(schema.methods.doSomething).exist;
            expect(schema.methods.doAnotherThing).not.exist;
        });

        it ('should only allow function and object to be passed', () => {
            schema.method(10, () => {});

            expect(Object.keys(schema.methods).length).equal(0);
        });

    });

    it ('should add custom queries to its defaultQueries table', () => {
        var schema = new Schema({});

        schema.queries('list', {limit:10, filters:[]});

        expect(schema.defaultQueries.list).to.exist;
    });

    describe('modify / access paths table', () => {
        it ('should read', function() {
            var data = {keyname:{type:'string'}};
            var schema = new Schema(data);

            var pathValue = schema.path('keyname');

            expect(pathValue).equal(data.keyname);
        });

        it ('should not return anything if does not exist', () => {
            var schema = new Schema({});

            var pathValue = schema.path('keyname');

            expect(pathValue).to.not.exist;
        });

        it ('should set', function() {
            var schema = new Schema({});
            schema.path('keyname', {type:'string'});

            expect(schema.paths.keyname).to.exist;
        });

        it ('should not allow to set reserved key', function() {

            var schema = new Schema({});
            var fn = () => {
                schema.path('ds', {});
            };

            expect(fn).to.throw(Error);
        });
    })

});
