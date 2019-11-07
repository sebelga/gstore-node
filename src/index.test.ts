import chai from 'chai';
import sinon from 'sinon';
import { Datastore, Transaction } from '@google-cloud/datastore';

import pkg from '../package.json';
import MockTransaction from './__jest__/mocks/transaction';
import Model from './model';
import GstoreSchema from './schema';
import { Gstore, instances } from './index';

const { expect, assert } = chai;

const ds = new Datastore({
  namespace: 'com.mydomain',
  apiEndpoint: 'http://localhost:8080',
});

const gstore = new Gstore();
const { Schema } = gstore;

describe('gstore-node', () => {
  let schema: GstoreSchema;
  let ModelInstance: Model;
  let transaction: Transaction;

  beforeEach(() => {
    gstore.models = {};

    schema = new Schema({
      name: { type: String },
      email: { type: String, read: false },
    });
    ModelInstance = gstore.model('Blog', schema);

    transaction = new MockTransaction();
    sinon.spy(transaction, 'save');
    sinon.spy(transaction, 'commit');
    sinon.spy(transaction, 'rollback');
  });

  afterEach(() => {
    (transaction as any).save.restore();
    (transaction as any).commit.restore();
    (transaction as any).rollback.restore();
  });

  test('should initialized its properties', () => {
    assert.isDefined(gstore.models);
    assert.isDefined(gstore.Schema);
  });

  test('should save ds instance', () => {
    gstore.connect(ds);
    expect(gstore.ds).to.equal(ds);
    expect(gstore.ds.constructor.name).equal('Datastore');
  });

  test('should throw an error if ds passed on connect is not a Datastore instance', () => {
    const fn = (): void => {
      gstore.connect({});
    };

    expect(fn).to.throw();
  });

  describe('should create models', () => {
    beforeEach(() => {
      schema = new gstore.Schema({
        title: { type: String },
      });

      gstore.models = {};
    });

    test('and add it with its schema to the cache', () => {
      const BlogModel = gstore.model('Blog', schema);

      assert.isDefined(BlogModel);
      assert.isDefined(gstore.models.Blog);
    });

    test('and attach schema to compiled Model', () => {
      const Blog = gstore.model('Blog', schema);
      const schemaUser = new gstore.Schema({ name: { type: String } });
      const User = gstore.model('User', schemaUser);

      expect(Blog.schema).not.equal(User.schema);
    });

    test('reading them from cache', () => {
      const mockModel = { schema };
      gstore.models.Blog = mockModel as any;

      const model = gstore.model('Blog');

      expect(model).equal(mockModel);
    });

    test('and throw error if trying to override schema', () => {
      const newSchema = new gstore.Schema({});
      const mockModel = { schema };
      gstore.models.Blog = mockModel as any;

      const fn = (): Model => gstore.model('Blog', newSchema);

      expect(fn).to.throw(Error);
    });

    test('and throw error if no Schema is passed', () => {
      const fn = (): Model => gstore.model('Blog');

      expect(fn).to.throw(Error);
    });
  });

  test('should return the models names', () => {
    gstore.models = { Blog: {}, Image: {} } as any;

    const names = gstore.modelNames();

    expect(names).eql(['Blog', 'Image']);
  });

  test('should return the package version', () => {
    const { version } = pkg;

    expect(gstore.version).equal(version);
  });

  test('should create shortcut of datastore.transaction', () => {
    sinon.spy(ds, 'transaction');

    const trans = gstore.transaction();

    expect((ds.transaction as any).called).equal(true);
    expect(trans.constructor.name).equal('Transaction');
  });

  describe('save() alias', () => {
    beforeEach(() => {
      gstore.connect(ds);
      sinon.stub(ds, 'save').resolves();
    });

    afterEach(() => {
      (ds.save as any).restore();
    });

    test('should convert entity instances to datastore Format', () => {
      const entity1 = new ModelInstance({ name: 'John' });
      const entity2 = new ModelInstance({ name: 'Mick' });

      return gstore.save([entity1, entity2]).then(() => {
        const { args } = (ds.save as any).getCall(0);
        const firstEntity = args[0][0];
        assert.isUndefined(firstEntity.__className);
        expect(Object.keys(firstEntity)).deep.equal(['key', 'data', 'excludeLargeProperties']);
      });
    });

    test('should work inside a transaction', () => {
      const entity = new ModelInstance({ name: 'John' });

      gstore.save(entity, transaction);

      expect((transaction.save as any).called).equal(true);
      expect((ds.save as any).called).equal(false);
    });

    test('should throw an error if no entities passed', () => {
      // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
      // @ts-ignore
      const func = (): Promise<any> => gstore.save();

      expect(func).to.throw('No entities passed');
    });

    test('should validate entity before saving', done => {
      schema = new Schema({ name: { type: String } });
      const TestValidateModel = gstore.model('TestValidate', schema);
      const entity1 = new TestValidateModel({ name: 'abc' });
      const entity2 = new TestValidateModel({ name: 123 });
      const entity3 = new TestValidateModel({ name: 'def' });
      sinon.spy(entity1, 'validate');
      sinon.spy(entity3, 'validate');

      gstore.save([entity1, entity2, entity3], undefined, { validate: true }).catch(e => {
        expect(e.code).equal('ERR_VALIDATION');
        expect(entity1.validate.called).equal(true);
        expect(entity3.validate.called).equal(false); // fail fast, exit validation
        done();
      });
    });

    test('should allow to pass a save method ("insert", "update", "upsert")', () => {
      const entity = new ModelInstance({ name: 'John' });

      return gstore.save(entity, undefined, { method: 'insert' }).then(() => {
        const { args } = (ds.save as any).getCall(0);
        expect(args[0].method).equal('insert');
      });
    });
  });

  describe('cache', () => {
    test('should not set any cache by default', () => {
      const gstoreNoCache = new Gstore();
      assert.isUndefined(gstoreNoCache.cache);
    });

    test('should set the default cache to memory lru-cache', () => {
      const gstoreWithCache = new Gstore({ cache: true });
      gstoreWithCache.connect(ds);

      const { cache } = gstoreWithCache;
      assert.isDefined(cache);
      expect(cache!.stores.length).equal(1);
      expect(cache!.stores[0].store).equal('memory');
    });

    test('should create cache instance from config passed', () => {
      const cacheSettings = {
        stores: [{ store: 'memory' }],
        config: {
          ttl: {
            keys: 12345,
            queries: 6789,
          },
        },
      };
      const gstoreWithCache = new Gstore({ cache: cacheSettings });
      gstoreWithCache.connect(ds);
      const { cache } = gstoreWithCache;

      expect(gstoreWithCache.cache).equal(cache);
      expect(gstoreWithCache.cache!.config.ttl.keys).equal(12345);
    });
  });

  describe('multi instances', () => {
    test('should cache instances', () => {
      const gstore1 = new Gstore();
      const gstore2 = new Gstore({ cache: true });

      instances.set('instance-1', gstore1);
      instances.set('instance-2', gstore2);

      const cached1 = instances.get('instance-1');
      const cached2 = instances.get('instance-2');
      expect(cached1).equal(gstore1);
      expect(cached2).equal(gstore2);
    });

    test('should throw Error if wrong config', () => {
      // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
      // @ts-ignore
      const func1 = (): Gstore => new Gstore(0);
      // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
      // @ts-ignore
      const func2 = (): Gstore => new Gstore('some-string');

      expect(func1).throw();
      expect(func2).throw();
    });
  });
});
