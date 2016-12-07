'use strict';

const chai = require('chai');
const Schema = require('../lib').Schema;

const expect = chai.expect;
const assert = chai.assert;

describe('Schema', () => {
    describe('contructor', () => {
        it('should initialized properties', () => {
            const schema = new Schema({});

            assert.isDefined(schema.methods);
            assert.isDefined(schema.shortcutQueries);
            assert.isDefined(schema.paths);
            assert.isDefined(schema.callQueue);
            assert.isDefined(schema.options);
            expect(schema.options.queries).deep.equal({ readAll: false, format: 'JSON' });
        });

        it('should merge options passed', () => {
            const schema = new Schema({}, {
                newOption: 'myValue',
                queries: { simplifyResult: false },
            });

            expect(schema.options.newOption).equal('myValue');
            expect(schema.options.queries.simplifyResult).equal(false);
        });

        it('should create its paths from obj passed', () => {
            const schema = new Schema({
                property1: { type: 'string' },
                property2: { type: 'number' },
            });

            assert.isDefined(schema.paths.property1);
            assert.isDefined(schema.paths.property2);
        });

        it('should not allowed reserved properties on schema', () => {
            const fn = () => {
                const schema = new Schema({ ds: 123 });
                return schema;
            };

            expect(fn).to.throw(Error);
        });

        it('should register default middelwares', () => {
            const schema = new Schema({});

            assert.isDefined(schema.callQueue.entity.save);
            expect(schema.callQueue.entity.save.pres.length).equal(1);
        });
    });

    describe('add method', () => {
        let schema;

        beforeEach(() => {
            schema = new Schema({});
            schema.methods = {};
        });

        it('should add it to its methods table', () => {
            const fn = () => { };
            schema.method('doSomething', fn);

            assert.isDefined(schema.methods.doSomething);
            expect(schema.methods.doSomething).to.equal(fn);
        });

        it('should not do anything if value passed is not a function', () => {
            schema.method('doSomething', 123);

            assert.isUndefined(schema.methods.doSomething);
        });

        it('should allow to pass a table of functions and validate type', () => {
            const fn = () => { };
            schema.method({
                doSomething: fn,
                doAnotherThing: 123,
            });

            assert.isDefined(schema.methods.doSomething);
            expect(schema.methods.doSomething).to.equal(fn);
            assert.isUndefined(schema.methods.doAnotherThing);
        });

        it('should only allow function and object to be passed', () => {
            schema.method(10, () => { });

            expect(Object.keys(schema.methods).length).equal(0);
        });
    });

    describe('modify / access paths table', () => {
        it('should read', () => {
            const data = { keyname: { type: 'string' } };
            const schema = new Schema(data);

            const pathValue = schema.path('keyname');

            expect(pathValue).to.equal(data.keyname);
        });

        it('should not return anything if does not exist', () => {
            const schema = new Schema({});

            const pathValue = schema.path('keyname');

            assert.isUndefined(pathValue);
        });

        it('should set', () => {
            const schema = new Schema({});
            schema.path('keyname', { type: 'string' });

            assert.isDefined(schema.paths.keyname);
        });

        it('should not allow to set reserved key', () => {
            const schema = new Schema({});

            const fn = () => {
                schema.path('ds', {});
            };

            expect(fn).to.throw(Error);
        });
    });

    describe('callQueue', () => {
        it('should add pre hooks to callQueue', () => {
            const preMiddleware = () => { };
            const schema = new Schema({});
            schema.callQueue = { model: {}, entity: {} };

            schema.pre('save', preMiddleware);

            assert.isDefined(schema.callQueue.entity.save);
            expect(schema.callQueue.entity.save.pres[0]).equal(preMiddleware);
        });

        it('should add post hooks to callQueue', () => {
            const postMiddleware = () => { };
            const schema = new Schema({});
            schema.callQueue = { model: {}, entity: {} };

            schema.post('save', postMiddleware);

            assert.isDefined(schema.callQueue.entity.save);
            expect(schema.callQueue.entity.save.post[0]).equal(postMiddleware);
        });
    });

    describe('virtual()', () => {
        it('should create new VirtualType', () => {
            const schema = new Schema({});
            const fn = () => {};
            schema.virtual('fullname', fn);

            expect(schema.virtuals.fullname.constructor.name).equal('VirtualType');
        });
    });

    it('add shortCut queries settings', () => {
        const schema = new Schema({});
        const listQuerySettings = { limit: 10, filters: [] };

        schema.queries('list', listQuerySettings);

        assert.isDefined(schema.shortcutQueries.list);
        expect(schema.shortcutQueries.list).to.equal(listQuerySettings);
    });
});
