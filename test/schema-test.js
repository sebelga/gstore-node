/*jshint -W030 */
var chai       = require('chai');
var expect     = chai.expect;

var Schema = require('../lib').Schema;

describe('Schema', () => {
    "use strict";

    describe('contructor', () => {
        it('should initialized properties', () => {
            let schema = new Schema({});

            expect(schema.methods).to.exist;
            expect(schema.shortcutQueries).to.exist;
            expect(schema.paths).to.exist;
            expect(schema.callQueue).to.exist;
            expect(schema.s).to.exist;
            expect(schema.s.hooks.constructor.name).to.equal('Kareem');
            expect(schema.options).to.exist;
            expect(schema.options.queries).deep.equal({
                simplifyResult:true
            });
        });

        it ('should merge options passed', () => {
            let schema = new Schema({}, {
                newOption:'myValue',
                queries:{
                    simplifyResult:false
                }
            });

            expect(schema.options.newOption).equal('myValue');
            expect(schema.options.queries.simplifyResult).be.false;
        });

        it ('should create its paths from obj passed', () => {
            let schema = new Schema({
                property1:{type:'string'},
                property2:{type:'number'}
            });

            expect(schema.paths.property1).to.exist;
            expect(schema.paths.property2).to.exist;
        });

        // it('if no type passed, default to string', () => {
        //     let schema = new Schema({name:{}});
        //
        //     expect(schema.paths.name.type).equal('string');
        // });

        it ('should not allowed reserved properties on schema', function() {
            let fn = () => {
                let schema = new Schema({ds:123});
            };

            expect(fn).to.throw(Error);
        });

        it('should register default middelwares', () => {
            let schema = new Schema({});

            expect(schema.callQueue.length).equal(1);
            expect(schema.callQueue[0][0]).equal('pre');
            expect(schema.callQueue[0][1][0]).equal('save');
        });
    });

    describe('add method', () => {
        let schema;

        beforeEach(function() {
            schema = new Schema({});
            schema.methods = {};
        });

        it ('should add it to its methods table', () => {
            let fn = () => {};
            schema.method('doSomething', fn);

            expect(schema.methods.doSomething).to.exist;
            expect(schema.methods.doSomething).to.equal(fn);
        });

        it ('should not do anything if value passed is not a function', () => {
            schema.method('doSomething', 123);

            expect(schema.methods.doSomething).to.not.exist;
        });

        it ('should allow to pass a table of functions and validate type', () => {
            let fn = () => {};
            schema.method({
                doSomething:fn,
                doAnotherThing:123
            });

            expect(schema.methods.doSomething).exist;
            expect(schema.methods.doSomething).to.equal(fn);
            expect(schema.methods.doAnotherThing).not.exist;
        });

        it ('should only allow function and object to be passed', () => {
            schema.method(10, () => {});

            expect(Object.keys(schema.methods).length).equal(0);
        });
    });

    describe('modify / access paths table', () => {
        it ('should read', function() {
            let data   = {keyname: {type: 'string'}};
            let schema = new Schema(data);

            let pathValue = schema.path('keyname');

            expect(pathValue).to.equal(data.keyname);
        });

        it ('should not return anything if does not exist', () => {
            let schema = new Schema({});

            let pathValue = schema.path('keyname');

            expect(pathValue).to.not.exist;
        });

        it ('should set', function() {
            let schema = new Schema({});
            schema.path('keyname', {type:'string'});

            expect(schema.paths.keyname).to.exist;
        });

        it ('should not allow to set reserved key', function() {
            let schema = new Schema({});

            let fn = () => {
                schema.path('ds', {});
            };

            expect(fn).to.throw(Error);
        });
    });

    describe('callQueue', () => {
        it('should add pre hooks to callQueue', () => {
            let schema = new Schema({});
            schema.callQueue = [];

            schema.pre('save', (next) => {
                next();
            });

            expect(schema.callQueue.length).equal(1);
        });

        it('should add post hooks to callQueue', () => {
            let schema = new Schema({});
            schema.callQueue = [];

            schema.post('save', (next) => {
                next();
            });

            expect(schema.callQueue.length).equal(1);
        });
    });

    describe('query hooks', () => {
        it('should add pre findOne query hook to Kareem', () => {
            let schema = new Schema({});

            schema.pre('findOne', (next) => {
                next();
            });

            expect(schema.s.hooks._pres.findOne).to.exist;
        });

        it('should add post findOne query hook to Kareem', () => {
            let schema = new Schema({});

            schema.post('findOne', () => {});

            expect(schema.s.hooks._posts.findOne).to.exist;
        });
    });

    it('add shortCut queries settings', () => {
        let schema = new Schema({});
        let listQuerySettings = {limit:10, filters:[]};

        schema.queries('list', listQuerySettings);

        expect(schema.shortcutQueries.list).to.exist;
        expect(schema.shortcutQueries.list).to.equal(listQuerySettings);
    });
});
