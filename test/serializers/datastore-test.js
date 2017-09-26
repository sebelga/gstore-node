'use strict';

const chai = require('chai');
const ds = require('../mocks/datastore')({
    namespace: 'com.mydomain',
});

const gstore = require('../../lib');
const Schema = require('../../lib').Schema;
const datastoreSerializer = require('../../lib/serializer').Datastore;

const expect = chai.expect;
const assert = chai.assert;

describe('Datastore serializer', () => {
    let ModelInstance;

    beforeEach(() => {
        gstore.models = {};
        gstore.modelSchemas = {};

        const schema = new Schema({
            name: { type: 'string' },
            email: { type: 'string', read: false },
            createdOn: { type: 'datetime' },
        });
        ModelInstance = gstore.model('Blog', schema, {});
    });

    describe('should convert data FROM Datastore format', () => {
        let datastoreMock;

        const key = ds.key(['BlogPost', 1234]);

        let data;

        beforeEach(() => {
            data = {
                name: 'John',
                lastname: 'Snow',
                email: 'john@snow.com',
                createdOn: '2017-12-25',
            };

            datastoreMock = data;
            datastoreMock[ModelInstance.gstore.ds.KEY] = key;
        });

        it('and add Symbol("KEY") id to entity', () => {
            const serialized = datastoreSerializer.fromDatastore.call(ModelInstance, datastoreMock);

            // expect(serialized).equal = datastoreMock;
            expect(serialized.id).equal(key.id);
            assert.isUndefined(serialized.email);
        });

        it('accepting "readAll" param', () => {
            const serialized = datastoreSerializer.fromDatastore.call(ModelInstance, datastoreMock, { readAll: true });

            assert.isDefined(serialized.email);
        });

        it('accepting "showKey" param', () => {
            const serialized = datastoreSerializer.fromDatastore.call(ModelInstance, datastoreMock, { showKey: true });

            expect(serialized.__key).equal(key);
        });

        it('should convert to entity instances', () => {
            const serialized = datastoreSerializer
                .fromDatastore
                .call(ModelInstance, datastoreMock, { format: gstore.Queries.formats.ENTITY });

            expect(serialized.className).equal('Entity');
        });

        it('should convert Datetime prop to Date object if returned as number', () => {
            const date = Date.now();
            datastoreMock.createdOn = date;

            const serialized = datastoreSerializer
                .fromDatastore
                .call(ModelInstance, datastoreMock);

            assert.isDefined(serialized.createdOn.getDate);
        });
    });


    describe('should convert data TO Datastore format', () => {
        it('without passing non-indexed properties', () => {
            const expected = {
                name: 'name',
                value: 'John',
                excludeFromIndexes: false,
            };
            const serialized = datastoreSerializer.toDatastore({ name: 'John' });
            expect(serialized[0]).to.deep.equal(expected);
        });

        it('and not into account undefined variables', () => {
            const serialized = datastoreSerializer.toDatastore({ name: 'John', lastname: undefined });
            assert.isUndefined(serialized[0].lastname);
        });

        it('and set excludeFromIndexes properties', () => {
            const serialized = datastoreSerializer.toDatastore({ name: 'John' }, ['name']);
            expect(serialized[0].excludeFromIndexes).equal(true);
        });
    });
});

