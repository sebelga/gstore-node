'use strict';

const chai = require('chai');
const ds = require('../mocks/datastore')({
    namespace: 'com.mydomain',
});

const gstore = require('../../lib');
const { Schema } = require('../../lib');
const datastoreSerializer = require('../../lib/serializer').Datastore;

const { expect, assert } = chai;

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
        let entityMock;

        beforeEach(() => {
            entityMock = {
                entityKey: ds.key(['BlogPost', 1234]),
                entityData: {
                    name: 'John',
                    lastname: undefined,
                    embedded: {
                        description: 'Long string (...)',
                    },
                },
            };
        });

        it('without passing non-indexed properties', () => {
            const expected = {
                key: entityMock.entityKey,
                data: {
                    name: 'John',
                    embedded: {
                        description: 'Long string (...)',
                    },
                },
            };
            const serialized = datastoreSerializer.toDatastore(entityMock);
            expect(serialized).to.deep.equal(expected);
        });

        it('and not into account undefined variables', () => {
            const serialized = datastoreSerializer.toDatastore(entityMock);
            expect({}.hasOwnProperty.call(serialized.data, 'lastname')).equal(false);
        });

        it('and set excludeFromIndexes properties', () => {
            entityMock.excludeFromIndexes = ['name', 'embedded.description'];
            const serialized = datastoreSerializer.toDatastore(entityMock);
            expect(serialized.excludeFromIndexes).to.deep.equal(['name', 'embedded.description']);
        });
    });
});

