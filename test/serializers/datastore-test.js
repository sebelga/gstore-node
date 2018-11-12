'use strict';

const chai = require('chai');
const Joi = require('joi');
const ds = require('../mocks/datastore')({
    namespace: 'com.mydomain',
});

const gstore = require('../../lib')();
const { Schema } = require('../../lib')();
const datastoreSerializer = require('../../lib/serializer').Datastore;

const { expect, assert } = chai;
gstore.connect(ds);

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
        let entity;

        beforeEach(() => {
            const schema = new Schema({
                name: { type: 'string', excludeFromIndexes: true },
                lastname: { type: 'string' },
                embedded: { type: 'object', excludeFromIndexes: 'description' },
                array: { type: 'array', excludeFromIndexes: true },
                array2: { type: 'array', excludeFromIndexes: true, joi: Joi.array() },
                array3: { type: 'array', excludeFromIndexes: true, optional: true },
            });
            ModelInstance = gstore.model('Serializer', schema);

            entity = new ModelInstance({
                name: 'John',
                lastname: undefined,
                embedded: {
                    description: 'Long string (...)',
                },
                array2: [1, 2, 3],
            });
        });

        it('without passing non-indexed properties', () => {
            const expected = {
                name: 'John',
                embedded: {
                    description: 'Long string (...)',
                },
                array2: [1, 2, 3],
                array: null,
            };
            const { data } = datastoreSerializer.toDatastore(entity);
            expect(data).to.deep.equal(expected);
        });

        it('not taking into account "undefined" variables', () => {
            const { data } = datastoreSerializer.toDatastore(entity);
            expect({}.hasOwnProperty.call(data, 'lastname')).equal(false);
        });

        it('and set excludeFromIndexes properties', () => {
            const { excludeFromIndexes } = datastoreSerializer.toDatastore(entity);
            expect(excludeFromIndexes).to.deep.equal(['name', 'embedded.description', 'array2[]']);
        });

        it('should set all excludeFromIndexes on all properties of object', () => {
            const schema = new Schema({
                embedded: { type: 'object', excludeFromIndexes: true },
                embedded2: { joi: Joi.object(), excludeFromIndexes: true },
                embedded3: { joi: Joi.object(), excludeFromIndexes: true },
            });
            ModelInstance = gstore.model('Serializer2', schema);

            entity = new ModelInstance({
                embedded: {
                    prop1: 123,
                    prop2: 123,
                    prop3: 123,
                },
                embedded2: {
                    prop1: 123,
                    prop2: 123,
                    prop3: 123,
                },
            });

            const serialized = datastoreSerializer.toDatastore(entity);
            expect(serialized.excludeFromIndexes).to.deep.equal([
                'embedded', 'embedded2', 'embedded3',
                'embedded.prop1', 'embedded.prop2', 'embedded.prop3',
                'embedded2.prop1', 'embedded2.prop2', 'embedded2.prop3',
            ]);
        });
    });
});
