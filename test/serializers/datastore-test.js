'use strict';

const chai = require('chai');
const Joi = require('@hapi/joi');

const { Gstore, QUERIES_FORMATS } = require('../../lib');
const ds = require('../mocks/datastore')({
  namespace: 'com.mydomain',
});
const { datastoreSerializer } = require('../../lib/serializers');

const gstore = new Gstore();
const { Schema } = gstore;

const { expect, assert } = chai;
gstore.connect(ds);

describe('Datastore serializer', () => {
  let Model;

  beforeEach(() => {
    gstore.models = {};
    gstore.modelSchemas = {};
  });

  describe('should convert data FROM Datastore format', () => {
    let datastoreMock;

    const key = ds.key(['BlogPost', 1234]);

    let data;

    beforeEach(() => {
      const schema = new Schema({
        name: { type: 'string' },
        email: { type: 'string', read: false },
        createdOn: { type: 'datetime' },
      });
      Model = gstore.model('Blog', schema, {});

      data = {
        name: 'John',
        lastname: 'Snow',
        email: 'john@snow.com',
        createdOn: '2017-12-25',
      };

      datastoreMock = data;
      datastoreMock[Model.gstore.ds.KEY] = key;
    });

    it('and add Symbol("KEY") id to entity', () => {
      const serialized = datastoreSerializer.fromDatastore(datastoreMock, Model);

      // expect(serialized).equal = datastoreMock;
      expect(serialized.id).equal(key.id);
      assert.isUndefined(serialized.email);
    });

    it('accepting "readAll" param', () => {
      const serialized = datastoreSerializer.fromDatastore(datastoreMock, Model, { readAll: true });

      assert.isDefined(serialized.email);
    });

    it('accepting "showKey" param', () => {
      const serialized = datastoreSerializer.fromDatastore(datastoreMock, Model, { showKey: true });

      expect(serialized.__key).equal(key);
    });

    it('should convert to entity instances', () => {
      const serialized = datastoreSerializer.fromDatastore(datastoreMock, Model, { format: QUERIES_FORMATS.ENTITY });

      expect(serialized.className).equal('Entity');
    });

    it('should convert Datetime prop to Date object if returned as number', () => {
      const date = Date.now();
      datastoreMock.createdOn = date;

      const serialized = datastoreSerializer.fromDatastore(datastoreMock, Model);

      assert.isDefined(serialized.createdOn.getDate);
    });
  });

  describe('should convert data TO Datastore format', () => {
    let entity;

    beforeEach(() => {
      const schema = new Schema({
        name: { type: String, excludeFromIndexes: true },
        lastname: { type: String },
        embedded: { type: Object, excludeFromIndexes: 'description' },
        array: { type: Array, excludeFromIndexes: true },
        array2: { type: Array, excludeFromIndexes: true, joi: Joi.array() },
        array3: { type: Array, excludeFromIndexes: true, optional: true },
      });
      Model = gstore.model('Serializer', schema);

      entity = new Model({
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
      const { data, excludeLargeProperties } = datastoreSerializer.toDatastore(entity);
      expect(data).to.deep.equal(expected);
      expect(excludeLargeProperties).to.equal(false);
    });

    it('not taking into account "undefined" variables', () => {
      const { data } = datastoreSerializer.toDatastore(entity);
      expect({}.hasOwnProperty.call(data, 'lastname')).equal(false);
    });

    it('and set excludeFromIndexes properties', () => {
      const { excludeFromIndexes } = datastoreSerializer.toDatastore(entity);
      expect(excludeFromIndexes).to.deep.equal(['name', 'embedded.description', 'array2[]', 'array2[].*']);
    });

    it('and set excludeLargeProperties flag', () => {
      const schema = new Schema({ name: String }, { excludeLargeProperties: true });
      Model = gstore.model('Serializer-auto-unindex', schema);
      entity = new Model({ name: 'John' });

      const { excludeLargeProperties } = datastoreSerializer.toDatastore(entity);
      expect(excludeLargeProperties).equal(true);
    });

    it('should set all excludeFromIndexes on all properties of object', () => {
      const schema = new Schema({
        embedded: { type: Object, excludeFromIndexes: true },
        embedded2: { joi: Joi.object(), excludeFromIndexes: true },
        embedded3: { joi: Joi.object(), excludeFromIndexes: true },
      });
      Model = gstore.model('Serializer2', schema);

      entity = new Model({
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
      expect(serialized.excludeFromIndexes).to.deep.equal(['embedded', 'embedded.*', 'embedded2', 'embedded2.*']);
    });
  });
});
