import chai from 'chai';
import Joi from '@hapi/joi';
import { DatastoreAdatper } from 'gstore-datastore-adapter';

import { Gstore } from './index';
import GstoreSchema from './schema';
import dsFactory from '../../../__tests__/mocks/datastore';

const ds = dsFactory();
const gstore = new Gstore({ adapter: new DatastoreAdatper(ds) });
const { expect, assert } = chai;
const { Schema } = gstore;

gstore.connect(ds);

describe('Schema', () => {
  describe('contructor', () => {
    test('should initialized properties', () => {
      const schema = new Schema({});

      assert.isDefined(schema.methods);
      assert.isDefined(schema.shortcutQueries);
      assert.isDefined(schema.paths);
      assert.isDefined(schema.__callQueue);
      assert.isDefined(schema.options);
      expect(schema.options.queries).deep.equal({ readAll: false, format: 'JSON' });
    });

    test('should merge options passed', () => {
      const schema = new Schema({}, {
        newOption: 'myValue',
        queries: { simplifyResult: false },
      } as any);

      expect((schema.options as any).newOption).equal('myValue');
      expect((schema.options.queries as any).simplifyResult).equal(false);
    });

    test('should create its paths from obj passed', () => {
      const schema = new Schema({
        property1: { type: String },
        property2: { type: Number },
      });

      assert.isDefined(schema.paths.property1);
      assert.isDefined(schema.paths.property2);
    });

    test('should not allowed reserved properties on schema', () => {
      const fn = (): GstoreSchema => {
        const schema = new Schema({ ds: 123 } as any);
        return schema;
      };

      expect(fn).to.throw(Error);
    });

    test('should create the "excludedFromIndexes" map', () => {
      const schema = new Schema({
        name: { excludeFromIndexes: true },
        age: { excludeFromIndexes: true, type: Number },
        embedded: { type: Object, excludeFromIndexes: ['prop1', 'prop2'] },
        embedded2: { type: Object, excludeFromIndexes: true },
        arrayValue: { excludeFromIndexes: 'property', type: Array },
        // Array in @google-cloud have to be set on the data value
        arrayValue2: { excludeFromIndexes: true, type: Array },
        arrayValue3: { excludeFromIndexes: true, joi: Joi.array() },
      });

      expect(schema.excludedFromIndexes).deep.equal({
        name: ['name'],
        age: ['age'],
        embedded: ['embedded.prop1', 'embedded.prop2'],
        embedded2: ['embedded2', 'embedded2.*'],
        arrayValue: ['arrayValue[].property'],
        arrayValue2: ['arrayValue2[]', 'arrayValue2[].*'],
        arrayValue3: ['arrayValue3[]', 'arrayValue3[].*'],
      });
    });

    // TODO fix this test for __meta object (previously in model.test.ts)
    // test('should add __meta object', () => {
    //   const MyModel = gstore.model('MyEntity', schema);
    //   assert.isDefined(MyModel.schema.__meta);
    //   expect(MyModel.schema.__meta.geoPointsProps).deep.equal(['location']);
    // });
  });

  describe('add method', () => {
    let schema: GstoreSchema;

    beforeEach(() => {
      schema = new Schema({});
    });

    test('should add it to its methods table', () => {
      const fn = (): void => undefined;
      schema.method('doSomething', fn);

      assert.isDefined(schema.methods.doSomething);
      expect(schema.methods.doSomething).to.equal(fn);
    });

    test('should not do anything if value passed is not a function', () => {
      // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
      // @ts-ignore
      schema.method('doSomething', 123);

      assert.isUndefined(schema.methods.doSomething);
    });

    test('should allow to pass a map of functions and validate type', () => {
      const fn = (): void => undefined;
      // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
      // @ts-ignore
      schema.method({
        doSomething: fn,
        doAnotherThing: 123,
      });

      assert.isDefined(schema.methods.doSomething);
      expect(schema.methods.doSomething).to.equal(fn);
      assert.isUndefined(schema.methods.doAnotherThing);
    });

    test('should only allow function and object to be passed', () => {
      // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
      // @ts-ignore
      schema.method(10, () => undefined);

      expect(Object.keys(schema.methods).length).equal(0);
    });
  });

  describe('modify / access paths table', () => {
    test('should read', () => {
      const data = { keyname: { type: String } };
      const schema = new Schema(data);

      const pathValue = schema.path('keyname');

      expect(pathValue).to.equal(data.keyname);
    });

    test('should not return anything if does not exist', () => {
      const schema = new Schema({});

      const pathValue = schema.path('keyname');

      assert.isUndefined(pathValue);
    });

    test('should set', () => {
      const schema = new Schema({});
      schema.path('keyname', { type: String });

      assert.isDefined(schema.paths.keyname);
    });

    test('should not allow to set reserved key', () => {
      const schema = new Schema({});

      const fn = (): void => {
        schema.path('ds', {});
      };

      expect(fn).to.throw(Error);
    });
  });

  describe('callQueue', () => {
    test('should add pre hooks to callQueue', () => {
      const preMiddleware = (): Promise<any> => Promise.resolve();
      const schema = new Schema({});
      schema.__callQueue = { model: {}, entity: {} };

      schema.pre('save', preMiddleware);
      schema.pre('save', preMiddleware); // we add 2 so we test both cases L140

      assert.isDefined(schema.__callQueue.entity.save);
      expect(schema.__callQueue.entity.save.pres[0]).equal(preMiddleware);
      expect(schema.__callQueue.entity.save.pres[1]).equal(preMiddleware);
    });

    test('should add post hooks to callQueue', () => {
      const postMiddleware = (): Promise<any> => Promise.resolve();
      const schema = new Schema({});
      schema.__callQueue = { model: {}, entity: {} };

      schema.post('save', postMiddleware);

      assert.isDefined(schema.__callQueue.entity.save);
      expect(schema.__callQueue.entity.save.post[0]).equal(postMiddleware);
    });
  });

  describe('virtual()', () => {
    test('should create new VirtualType', () => {
      const schema = new Schema({});
      schema.virtual('fullname');

      expect(schema.__virtuals.fullname.constructor.name).equal('VirtualType');
    });

    test('should set the scope on the entityData', () => {
      const schema = new Schema({ id: {} });
      const Model = gstore.model('VirtualTest', schema);
      const entity = new Model({ id: 123 });

      function virtualFunc(this: any): void {
        expect(this).deep.equal(entity.entityData);
      }

      schema.virtual('fullname').get(virtualFunc);

      entity.plain({ virtuals: true });
    });
  });

  test('add shortCut queries settings', () => {
    const schema = new Schema({});
    const listQuerySettings = { limit: 10, filters: [] };

    schema.queries('list', listQuerySettings);

    assert.isDefined(schema.shortcutQueries.list);
    expect(schema.shortcutQueries.list).to.equal(listQuerySettings);
  });

  describe('Joi', () => {
    let schema: GstoreSchema;

    beforeEach(() => {
      schema = new Schema(
        {
          name: { joi: Joi.string().required() },
          notJoi: { type: String },
        },
        {
          joi: true,
        },
      );
    });

    test('should build Joi schema', () => {
      assert.isDefined(schema.joiSchema);
    });
  });
});
