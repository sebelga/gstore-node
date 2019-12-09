import chai from 'chai';
import Joi from '@hapi/joi';

import dsFactory from '../../__tests__/mocks/datastore';
import { Gstore, QUERIES_FORMATS } from '../index';
import GstoreModel from '../model';
import Entity from '../entity';
import datastoreSerializer from './datastore';

const ds = dsFactory({
  namespace: 'com.mydomain',
});

const gstore = new Gstore();
const { Schema } = gstore;

const { expect, assert } = chai;
gstore.connect(ds);

describe('Datastore serializer', () => {
  let Model: GstoreModel<any, any>;

  beforeEach(() => {
    gstore.models = {};
  });

  describe('should convert data FROM Datastore format', () => {
    let mockEntityData: any;

    const key = ds.key(['BlogPost', 1234]);

    beforeEach(() => {
      const schema = new Schema({
        name: { type: String },
        email: { type: String, read: false },
        createdOn: { type: Date },
      });
      Model = gstore.model('Blog', schema);

      mockEntityData = {
        name: 'John',
        lastname: 'Snow',
        email: 'john@snow.com',
        createdOn: '2017-12-25',
      };

      mockEntityData[Model.gstore.ds.KEY] = key;
    });

    test('and add Symbol("KEY") id to entity', () => {
      const serialized = datastoreSerializer.fromDatastore(mockEntityData, Model);

      // expect(serialized).equal = mockEntityData;
      expect(serialized.id).equal(key.id);
      assert.isUndefined(serialized.email);
    });

    test('accepting "readAll" param', () => {
      const serialized = datastoreSerializer.fromDatastore(mockEntityData, Model, { readAll: true });

      assert.isDefined(serialized.email);
    });

    test('accepting "showKey" param', () => {
      const serialized = datastoreSerializer.fromDatastore(mockEntityData, Model, { showKey: true });

      expect(serialized.__key).equal(key);
    });

    test('should convert to entity instances', () => {
      const serialized = datastoreSerializer.fromDatastore(mockEntityData, Model, { format: QUERIES_FORMATS.ENTITY });

      expect(serialized instanceof Entity).equal(true);
    });

    test('should convert Datetime prop to Date object if returned as number', () => {
      const date = Date.now();
      mockEntityData.createdOn = date;

      const serialized = datastoreSerializer.fromDatastore(mockEntityData, Model);

      assert.isDefined(serialized.createdOn.getDate);
    });
  });

  describe('should convert data TO Datastore format', () => {
    let entity: Entity;

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

    test('without passing non-indexed properties', () => {
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

    test('not taking into account "undefined" variables', () => {
      const { data } = datastoreSerializer.toDatastore(entity);
      expect({}.hasOwnProperty.call(data, 'lastname')).equal(false);
    });

    test('and set excludeFromIndexes properties', () => {
      const { excludeFromIndexes } = datastoreSerializer.toDatastore(entity);
      expect(excludeFromIndexes).to.deep.equal(['name', 'embedded.description', 'array2[]', 'array2[].*']);
    });

    test('and set excludeLargeProperties flag', () => {
      const schema = new Schema({ name: { type: String } }, { excludeLargeProperties: true });
      Model = gstore.model('Serializer-auto-unindex', schema);
      entity = new Model({ name: 'John' });

      const { excludeLargeProperties } = datastoreSerializer.toDatastore(entity);
      expect(excludeLargeProperties).equal(true);
    });

    test('should set all excludeFromIndexes on all properties of object', () => {
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
