import chai from 'chai';
import sinon from 'sinon';
import is from 'is';
import Joi from '@hapi/joi';
import { Transaction as DatastoreTransaction } from '@google-cloud/datastore';

import GstoreEntity, { Entity } from './entity';
import GstoreSchema, { SchemaPathDefinition } from './schema';
import Model from './model';
import { Gstore, EntityKey } from './index';
import { ERROR_CODES } from './errors';
import dsFactory from '../__tests__/mocks/datastore';
import Transaction from '../__tests__/mocks/transaction';
import entitiesMock from '../__tests__/mocks/entities';
import Query from '../__tests__/mocks/query';

const ds = dsFactory({ namespace: 'com.mydomain' });

const gstore = new Gstore();
const gstoreWithCache = new Gstore({ cache: { config: { ttl: { queries: 600 } } } });

gstore.connect(ds);
gstoreWithCache.connect(ds);

const { expect, assert } = chai;
const { generateEntities } = entitiesMock;
const { Schema } = gstore;

describe('Model', () => {
  let Blog: Model<any>;
  let schema: GstoreSchema<any>;
  let mockEntity;
  let mockEntities: any;
  let transaction: DatastoreTransaction;

  beforeEach(() => {
    gstore.models = {};
    gstore.cache = undefined;
    gstore.config.errorOnEntityNotFound = true;

    ({ mockEntity, mockEntities } = generateEntities());
    transaction = new Transaction();

    sinon.spy(ds, 'save');
    sinon.stub(ds, 'transaction').callsFake(() => transaction);
    sinon.spy(transaction, 'save');
    sinon.spy(transaction, 'commit');
    sinon.spy(transaction, 'rollback');
    sinon.stub(transaction, 'get').resolves([mockEntity]);
    sinon.stub(transaction, 'run').resolves([transaction, { apiData: 'ok' }]);

    schema = new Schema<any>({
      name: { type: String },
      lastname: { type: String, excludeFromIndexes: true },
      password: { read: false },
      age: { type: Number, excludeFromIndexes: true },
      birthday: { type: Date },
      street: {},
      website: { validate: 'isURL' },
      email: { validate: 'isEmail' },
      ip: { validate: { rule: 'isIP', args: [4] } },
      ip2: { validate: { rule: 'isIP' } }, // no args passed
      modified: { type: Boolean },
      tags: { type: Array },
      prefs: { type: Object },
      price: { type: Schema.Types.Double, write: false },
      icon: { type: Buffer },
      location: { type: Schema.Types.GeoPoint },
    });
    schema.virtual('fullname').get(() => undefined);

    Blog = gstore.model('Blog', schema);
  });

  afterEach(() => {
    ds.save.restore();
    ds.transaction.restore();
    (transaction.save as any).restore();
    (transaction.commit as any).restore();
    (transaction.rollback as any).restore();
  });

  describe('compile()', () => {
    test('should set properties on compile and return GstoreModel', () => {
      assert.isDefined(Blog.schema);
      assert.isDefined(Blog.gstore);
      assert.isDefined(Blog.entityKind);
    });

    test('should create different Model classes', () => {
      const User = gstore.model('User', new Schema({}));

      expect(User.entityKind).equal('User');
      expect(Blog.entityKind).equal('Blog');
    });

    test('should execute methods passed to schema.methods', async () => {
      const imageSchema = new Schema({});
      const ImageModel = gstore.model('Image', imageSchema);
      sinon.stub(ImageModel, 'get').resolves(mockEntities[0]);
      schema.methods.fullName = function fullName(): any {
        return Promise.resolve(`${this.get('name')} ${this.get('lastname')}`);
      };
      schema.methods.getImage = function getImage(): any {
        return ImageModel.get(this.entityData.imageIdx);
      };

      const MyModel = gstore.model('MyModel', schema);
      const entity = new MyModel({ name: 'John', lastname: 'Snow' });

      const response1 = await entity.fullName();
      expect(response1).equal('John Snow');

      const response2 = await entity.getImage();
      expect(response2).equal(mockEntities[0]);
    });
  });

  describe('sanitize()', () => {
    test('should remove keys not "writable"', () => {
      let data: any = { price: 20, unknown: 'hello', name: 'John' };

      data = Blog.sanitize(data);

      assert.isUndefined(data.price);
      assert.isUndefined(data.unknown);
    });

    test('should convert "null" string to null', () => {
      let data: any = {
        name: 'null',
      };

      data = Blog.sanitize(data);

      expect(data.name).equal(null);
    });

    test('return an empty object if data is not an object', () => {
      let data = 'hello';

      // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
      // @ts-ignore
      data = Blog.sanitize(data);

      expect(data).deep.equal({});
    });

    test('should not mutate the entityData passed', () => {
      const data = { name: 'John' };
      const data2 = Blog.sanitize(data);

      expect(data2).not.equal(data);
    });

    test('should remove not writable & unknown props in Joi schema', () => {
      const myJoiSchema = new Schema<any>(
        {
          createdOn: { joi: Joi.date(), write: false },
        },
        { joi: true },
      );
      const BlogJoi = gstore.model('BlogJoi', myJoiSchema);

      const entityData = BlogJoi.sanitize({ createdOn: Date.now(), unknown: 123 });

      assert.isUndefined(entityData.createdOn);
      assert.isUndefined(entityData.unknown);
    });

    test('should *not* remove unknown props in Joi schema', () => {
      const myJoiSchema = new Schema<any>(
        {
          createdOn: { joi: Joi.date(), write: false },
        },
        { joi: { options: { allowUnknown: true } } },
      );
      const BlogJoi = gstore.model('BlogJoi', myJoiSchema);

      const entityData = BlogJoi.sanitize({ createdOn: Date.now(), unknown: 123 });

      assert.isDefined(entityData.unknown);
    });

    test('should return the same value object from Model.sanitize and Entity.validate in Joi schema', () => {
      const myJoiSchema = new Schema<any>(
        {
          foo: { joi: Joi.object({ bar: Joi.any() }).required() },
          // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
          // @ts-ignoree
          createdOn: { joi: Joi.date().default(() => new Date('01-01-2019'), 'static createdOn') },
        },
        { joi: true },
      );
      const BlogWithJoi = gstore.model('BlogJoi', myJoiSchema);

      const data = { foo: { unknown: 123 } };
      const entityData = BlogWithJoi.sanitize(data);
      const { value: validationData, error: validationError } = new BlogWithJoi(data).validate();

      assert.isUndefined(entityData.foo.unknown);
      assert.isNull(validationError);
      assert.deepEqual(entityData, validationData);
    });

    test('should preserve the datastore.KEY', () => {
      const key = Blog.key({ id: 123 });
      let data: any = { foo: 'bar' };
      data[Blog.gstore.ds.KEY] = key;

      data = Blog.sanitize(data);

      expect(data[Blog.gstore.ds.KEY]).to.equal(key);
    });

    test('should preserve the datastore.KEY with Joi Schemas', () => {
      const myJoiSchema = new Schema({}, { joi: true });
      const MyModel = gstore.model('SanitizeJoiSchemaPreserveKEY', myJoiSchema);
      const key = MyModel.key({ id: 123 });
      const data: any = { foo: 'bar' };
      data[MyModel.gstore.ds.KEY] = key;

      const sanitized = MyModel.sanitize(data);

      expect(sanitized[gstore.ds.KEY as any]).to.equal(key);
    });

    describe('populated entities', () => {
      const mySchema = new Schema({ ref: { type: Schema.Types.Key } });
      const PopulateModel = gstore.model('SanitizeReplacePopulatedEntity', mySchema);

      test('should replace a populated entity ref with its entity key', () => {
        const key = PopulateModel.key('abc');
        const data = {
          ref: {
            title: 'Entity title populated',
            [gstore.ds.KEY]: key,
          },
        };

        const sanitized = PopulateModel.sanitize(data);

        assert.isTrue(gstore.ds.isKey(sanitized.ref as {}));
        expect(sanitized.ref).to.equal(key);
      });

      test('should not replace a ref that is not an object', () => {
        const data = { ref: null };

        const sanitized = PopulateModel.sanitize(data);

        assert.isFalse(gstore.ds.isKey(sanitized.ref as {}));
        expect(sanitized.ref).to.equal(null);
      });
    });
  });

  describe('key()', () => {
    test('should create from entityKind', () => {
      const key = Blog.key();

      expect(key.path[0]).equal('Blog');
      assert.isUndefined(key.path[1]);
    });

    test('should create array of ids', () => {
      const keys = Blog.key([{ id: 22 }, { id: 69 }]);

      expect(is.array(keys)).equal(true);
      expect(keys.length).equal(2);
      expect(keys[1].path[1]).equal(69);
    });

    test('should create array of ids with ancestors and namespace', () => {
      const namespace = 'com.mydomain-dev';
      const keys = Blog.key([{ id: 22 }, { id: 69 }], ['Parent', 'keyParent'], namespace);

      expect(keys[0].path[0]).equal('Parent');
      expect(keys[0].path[1]).equal('keyParent');
      expect(keys[1].namespace).equal(namespace);
    });
  });

  describe('get()', () => {
    const entityFetched: Entity<any> = { name: 'John' };

    beforeEach(() => {
      entityFetched[ds.KEY] = Blog.key({ id: 123 });
      sinon.stub(ds, 'get').resolves([entityFetched]);
    });

    afterEach(() => {
      ds.get.restore();
    });

    test('passing an integer id', async () => {
      const entity = await Blog.get({ id: 123 });

      expect(ds.get.getCall(0).args[0].constructor.name).equal('Key');
      expect(entity instanceof GstoreEntity).equal(true);
    });

    test('passing an string id', () =>
      Blog.get('keyname').then(_entity => {
        expect(_entity instanceof GstoreEntity).equal(true);
      }));

    // test('passing an array of ids', () => {
    //   ds.get.restore();

    //   const entity1: any = { name: 'John' };
    //   entity1[ds.KEY] = ds.key(['BlogPost', 22]);

    //   const entity2: any = { name: 'John' };
    //   entity2[ds.KEY] = ds.key(['BlogPost', 69]);

    //   sinon.stub(ds, 'get').resolves([[entity2, entity1]]); // not sorted

    //   return GstoreModel.get([22, 69], undefined, undefined, undefined, { preserveOrder: true }).then(_entity => {
    //     expect(is.array(ds.get.getCall(0).args[0])).equal(true);
    //     expect(is.array(_entity)).equal(true);
    //     expect(_entity[0].entityKey.id).equal(22); // sorted
    //   });
    // });

    // test('should consistently return an array when providing id as an Array', () =>
    //   GstoreModel.get(['abc']).then(_entity => {
    //     assert.isTrue(is.array(_entity));
    //   }));

    test('not converting string with mix of number and non number', () =>
      Blog.get('123:456').then(() => {
        expect(ds.get.getCall(0).args[0].name).equal('123:456');
      }));

    test('passing an ancestor path array', () => {
      const ancestors = ['Parent', 'keyname'];

      return Blog.get({ id: 123 }, { ancestors }).then(() => {
        expect(ds.get.getCall(0).args[0].constructor.name).equal('Key');
        expect(ds.get.getCall(0).args[0].parent.kind).equal(ancestors[0]);
        expect(ds.get.getCall(0).args[0].parent.name).equal(ancestors[1]);
      });
    });

    test('should allow a namespace', () => {
      const namespace = 'com.mydomain-dev';

      return Blog.get({ id: 123 }, { namespace }).then(() => {
        expect(ds.get.getCall(0).args[0].namespace).equal(namespace);
      });
    });

    test('on datastore get error, should reject error', done => {
      ds.get.restore();
      const error = { code: 500, message: 'Something went really bad' };
      sinon.stub(ds, 'get').rejects(error);

      Blog.get({ id: 123 })
        .populate('test')
        .catch(err => {
          expect(err).equal(error);
          done();
        });
    });

    test('on no entity found, should return a "ERR_ENTITY_NOT_FOUND" error', () => {
      ds.get.restore();

      sinon.stub(ds, 'get').resolves([]);

      return Blog.get({ id: 123 }).catch(err => {
        expect(err.code).equal(ERROR_CODES.ERR_ENTITY_NOT_FOUND);
      });
    });

    test('on no entity found, should return a null', () => {
      ds.get.restore();
      gstore.config.errorOnEntityNotFound = false;
      sinon.stub(ds, 'get').resolves([]);

      return Blog.get({ id: 123 }).then(e => {
        expect(e).equal(null);
      });
    });

    test('should get in a transaction', () =>
      Blog.get({ id: 123 }, { transaction }).then(_entity => {
        expect((transaction.get as any).called).equal(true);
        expect(ds.get.called).equal(false);
        expect(_entity instanceof GstoreEntity).equal(true);
      }));

    test('should throw error if transaction not an instance of glcoud Transaction', () =>
      // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
      // @ts-ignore
      Blog.get(123, undefined, undefined, {}).catch(err => {
        expect(err.message).equal('Transaction needs to be a gcloud Transaction');
      }));

    test('should return error from Transaction.get()', () => {
      (transaction.get as any).restore();
      const error = { code: 500, message: 'Houston we really need you' };
      sinon.stub(transaction, 'get').rejects(error);

      return Blog.get({ id: 123 }, { transaction }).catch(err => {
        expect(err).equal(error);
      });
    });

    test('should get data through a Dataloader instance (singe key)', () => {
      const dataloader = gstore.createDataLoader();
      const spy = sinon.stub(dataloader, 'load').resolves(entityFetched);

      return Blog.get({ id: 123 }, { dataloader }).then(res => {
        expect(spy.called).equal(true);

        const args = spy.getCall(0).args[0];
        const key = ds.key({ path: ['Blog', 123], namespace: 'com.mydomain' });
        expect(args).deep.equal(key);
        expect(res.name).equal('John');
      });
    });

    // test('should get data through a Dataloader instance (multiple key)', () => {
    //   const dataloader = gstore.createDataLoader();
    //   const spy = sinon.stub(dataloader, 'loadMany').resolves([{}, {}]);

    //   return GstoreModel.get([123, 456], undefined, undefined, undefined, { dataloader }).then(() => {
    //     expect(spy.called).equal(true);

    //     const args = spy.getCall(0).args[0];
    //     const key1 = ds.key({ path: ['Blog', 123], namespace: 'com.mydomain' });
    //     const key2 = ds.key({ path: ['Blog', 456], namespace: 'com.mydomain' });

    //     expect(args[0]).deep.equal(key1);
    //     expect(args[1]).deep.equal(key2);
    //   });
    // });

    // test('should throw an error if dataloader is not a DataLoader instance', done => {
    //   const dataloader = {};

    //   GstoreModel.get([123, 456], undefined, undefined, undefined, { dataloader }).then(
    //     () => undefined,
    //     err => {
    //       expect(err.name).equal('GstoreError');
    //       expect(err.message).equal('dataloader must be a "DataLoader" instance');
    //       done();
    //     },
    //   );
    // });

    test('should allow to chain populate() calls and then call the Model.populate() method', () => {
      const populateSpy = sinon.spy(Blog, '__populate');
      const options = { dataLoader: { foo: 'bar' } };

      return Blog.get({ id: 123 }, options as any)
        .populate('company', ['name', 'phone-number'])
        .then(() => {
          expect(populateSpy.called).equal(true);
          const { args } = populateSpy.getCall(0);
          expect(args[0]![0]).deep.equal([{ path: 'company', select: ['name', 'phone-number'] }]);
          expect(args[1]).deep.equal({ ...options, transaction: undefined });

          (Blog.__populate as any).restore();
        });
    });

    describe('when cache is active', () => {
      beforeEach(() => {
        gstore.cache = gstoreWithCache.cache;
      });

      afterEach(() => {
        // empty the cache
        gstore.cache!.reset();
        delete gstore.cache;
      });

      test('should get value from cache', () => {
        sinon.spy(Blog.gstore.cache!.keys, 'read');
        const key = Blog.key({ id: 123 });
        const value = { name: 'Michael' };

        return gstore.cache!.keys.set(key, value).then(() =>
          Blog.get({ id: 123 }, { ttl: 334455 }).then(response => {
            assert.ok(!ds.get.called);
            expect(response.entityData).include(value);
            assert.ok((Blog.gstore.cache!.keys.read as any).called);
            const { args } = (Blog.gstore.cache!.keys.read as any).getCall(0);
            expect(args[0].id).equal(123);
            expect(args[1].ttl).equal(334455);
            (Blog.gstore.cache!.keys.read as any).restore();
          }),
        );
      });

      test('should throw an Error if entity not found in cache', done => {
        ds.get.resolves([]);
        Blog.get({ id: 12345 }, { ttl: 334455 }).catch(err => {
          expect(err.code).equal(ERROR_CODES.ERR_ENTITY_NOT_FOUND);
          done();
        });
      });

      test('should return null if entity not found in cache', done => {
        ds.get.resolves([]);

        gstore.config.errorOnEntityNotFound = false;

        Blog.get({ id: 12345 }, { ttl: 334455 }).then(en => {
          expect(en).equal(null);
          gstore.config.errorOnEntityNotFound = true;
          done();
        });
      });

      test('should *not* get value from cache when deactivated in options', () => {
        const key = Blog.key({ id: 123 });
        const value = { name: 'Michael' };

        return gstore
          .cache!.keys.set(key, value)
          .then(() =>
            Blog.get({ id: 123 }, { cache: false }).then(response => {
              assert.ok(ds.get.called);
              expect(response.entityData).contains(entityFetched);
              ds.get.reset();
              ds.get.resolves([entityFetched]);
            }),
          )
          .then(() =>
            Blog.get({ id: 123 }).then(() => {
              // Make sure we get from the cache
              // if no options config is passed
              assert.ok(!ds.get.called);
            }),
          );
      });

      test('should *not* get value from cache when global ttl === -1', () => {
        const originalConf = gstore.cache!.config.ttl;
        gstore.cache!.config.ttl = { ...gstore.cache!.config.ttl, keys: -1 };
        const key = Blog.key({ id: 123 });

        return gstore.cache!.keys.set(key, {}).then(() =>
          Blog.get({ id: 123 }).then(() => {
            assert.ok(ds.get.called);
            gstore.cache!.config.ttl = originalConf;
          }),
        );
      });

      test('should get value from fetchHandler', () =>
        Blog.get({ id: 123 }).then(response => {
          assert.ok(ds.get.called);
          const { args } = ds.get.getCall(0);
          expect(args[0].id).equal(123);
          expect(response.entityData).include(entityFetched);
        }));

      test('should get key from fetchHandler and Dataloader', () => {
        const dataloader = gstore.createDataLoader();
        const spy = sinon.stub(dataloader, 'load').resolves(entityFetched);

        return Blog.get({ id: 123 }, { dataloader }).then(res => {
          expect(spy.called).equal(true);
          expect(res.name).equal('John');
        });
      });

      // test('should get multiple keys from fetchHandler and Dataloader', () => {
      //   const entity2: any = { name: 'Mick' };
      //   entity2[ds.KEY] = GstoreModel.key({ id: 456 });
      //   const dataloader = gstore.createDataLoader();
      //   const spy = sinon.stub(dataloader, 'loadMany').resolves([entity, entity2]);

      //   return GstoreModel.get([123, 456], undefined, undefined, undefined, { dataloader }).then(res => {
      //     expect(spy.called).equal(true);
      //     expect(res[0].name).equal('John');
      //     expect(res[1].name).equal('Mick');
      //   });
      // });

      // test('should get value from cache and call the fetchHandler **only** with keys not in the cache', () => {
      //   const key = GstoreModel.key({ id: 456 });
      //   const cacheEntity: any = { name: 'John' };
      //   cacheEntity[ds.KEY] = key;

      //   return gstore.cache!.keys.set(key, cacheEntity).then(() =>
      //     GstoreModel.get([123, 456]).then(response => {
      //       assert.ok(ds.get.called);
      //       const { args } = ds.get.getCall(0);
      //       expect(args[0][0].id).equal(123);
      //       expect(response.length).equal(2);
      //     }),
      //   );
      // });

      test('should allow to chain populate() calls and then call the Model.populate() method', () => {
        const spy = sinon.spy(Blog, '__populate');

        const key = Blog.key({ id: 123 });
        const value = { foo: 'bar' };

        return gstore.cache!.keys.set(key, value).then(() =>
          Blog.get({ id: 123 })
            .populate('company', ['name', 'phone-number'])
            .then(() => {
              expect(spy.called).equal(true);
              const { args } = spy.getCall(0);
              expect(args[0]![0]).deep.equal([{ path: 'company', select: ['name', 'phone-number'] }]);

              (Blog.__populate as any).restore();
            }),
        );
      });
    });
  });

  describe('update()', () => {
    test('should run in a transaction', () =>
      Blog.update({ id: 123 }, {}).then(() => {
        expect(ds.transaction.called).equal(true);
        expect((transaction.run as any).called).equal(true);
        expect((transaction.commit as any).called).equal(true);
      }));

    test('should return an entity instance', () =>
      Blog.update({ id: 123 }, {}).then(entity => {
        expect(entity instanceof GstoreEntity).equal(true);
      }));

    test('should first get the entity by Key', () =>
      Blog.update({ id: 123 }, {}).then(() => {
        expect((transaction.get as any).getCall(0).args[0].constructor.name).equal('Key');
        expect((transaction.get as any).getCall(0).args[0].path[1]).equal(123);
      }));

    test('should not convert a string id with mix of number and alpha chars', () =>
      Blog.update('123:456', {}).then(() => {
        expect((transaction.get as any).getCall(0).args[0].name).equal('123:456');
      }));

    test('should rollback if error while getting entity', () => {
      (transaction.get as any).restore();
      const error = { code: 500, message: 'Houston we got a problem' };
      sinon.stub(transaction, 'get').rejects(error);

      return Blog.update({ id: 123 }, {}).catch(err => {
        expect(err).deep.equal(error);
        expect((transaction.rollback as any).called).equal(true);
        expect((transaction.commit as any).called).equal(false);
      });
    });

    test('should return "ERR_ENTITY_NOT_FOUND" if entity not found', () => {
      (transaction.get as any).restore();
      sinon.stub(transaction, 'get').resolves([]);

      return Blog.update('keyname', {}).catch(err => {
        expect(err.code).equal(ERROR_CODES.ERR_ENTITY_NOT_FOUND);
      });
    });

    test('should return error if any while saving', done => {
      (transaction.run as any).restore();
      const error = { code: 500, message: 'Houston wee need you.' };
      sinon.stub(transaction, 'run').rejects([error]);

      Blog.update({ id: 123 }, {}).catch(err => {
        expect(err).equal(error);
        done();
      });
    });

    test('accept an ancestor path', () => {
      const ancestors = ['Parent', 'keyname'];

      return Blog.update({ id: 123 }, {}, ancestors).then(() => {
        expect((transaction.get as any).getCall(0).args[0].path[0]).equal('Parent');
        expect((transaction.get as any).getCall(0).args[0].path[1]).equal('keyname');
      });
    });

    test('should allow a namespace', () => {
      const namespace = 'com.mydomain-dev';

      return Blog.update({ id: 123 }, {}, undefined, namespace).then(() => {
        expect((transaction.get as any).getCall(0).args[0].namespace).equal(namespace);
      });
    });

    test('should save and replace data', () => {
      const data = { name: 'Mick' };
      return Blog.update({ id: 123 }, data, undefined, undefined, undefined, { replace: true }).then(entity => {
        expect(entity.entityData.name).equal('Mick');
        expect(entity.entityData.lastname).equal(null);
        expect(entity.entityData.email).equal(null);
      });
    });

    test('should accept a DataLoader instance, add it to the entity created and clear the key', () => {
      const dataloader = gstore.createDataLoader();
      const spy = sinon.spy(dataloader, 'clear');

      return Blog.update({ id: 123 }, {}, undefined, undefined, undefined, { dataloader }).then(entity => {
        const keyToClear = spy.getCalls()[0].args[0];
        expect(keyToClear.kind).equal('Blog');
        expect(keyToClear.id).equal(123);
        expect(entity.dataloader).equal(dataloader);
      });
    });

    test('should merge the new data with the entity data', () => {
      const data = {
        name: 'Sebas',
        lastname: 'Snow',
      };
      return Blog.update({ id: 123 }, data, ['Parent', 'keyNameParent']).then(entity => {
        expect(entity.entityData.name).equal('Sebas');
        expect(entity.entityData.lastname).equal('Snow');
        expect(entity.entityData.email).equal('john@snow.com');
      });
    });

    test('should call save() on the transaction', () => {
      return Blog.update({ id: 123 }, {}, undefined, undefined, transaction).then(() => {
        expect((transaction.save as any).called).equal(true);
      });
    });

    test('should return error and rollback transaction if not passing validation', () =>
      Blog.update({ id: 123 }, { unknown: 1 }).catch(err => {
        assert.isDefined(err);
        expect((transaction.rollback as any).called).equal(true);
      }));

    test('should return error if not passing validation', () =>
      Blog.update({ id: 123 }, { unknown: 1 }, undefined, undefined, undefined, { replace: true }).catch(err => {
        assert.isDefined(err);
      }));

    test('should run inside an *existing* transaction', () =>
      Blog.update({ id: 123 }, {}, undefined, undefined, transaction).then(entity => {
        expect(ds.transaction.called).equal(false);
        expect((transaction.get as any).called).equal(true);
        expect((transaction.save as any).called).equal(true);
        expect(entity instanceof GstoreEntity).equal(true);
      }));

    test('should throw error if transaction passed is not instance of gcloud Transaction', () =>
      // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
      // @ts-ignore
      Blog.update({ id: 123 }, {}, undefined, undefined, {}).catch(err => {
        expect(err.message).equal('Transaction needs to be a gcloud Transaction');
      }));

    describe('when cache is active', () => {
      beforeEach(() => {
        gstore.cache = gstoreWithCache.cache;
      });

      afterEach(() => {
        // empty the cache
        gstore.cache!.reset();
        delete gstore.cache;
      });

      test('should call Model.clearCache() passing the key updated', () => {
        sinon.spy(Blog, 'clearCache');
        return Blog.update({ id: 123 }, { name: 'Nuri' }, ['Parent', 'keyNameParent']).then(entity => {
          assert.ok((Blog.clearCache as any).called);
          expect((Blog.clearCache as any).getCall(0).args[0].id).equal(123);
          expect(entity.name).equal('Nuri');
          (Blog.clearCache as any).restore();
        });
      });

      test('on error when clearing the cache, should add the entityUpdated on the error', done => {
        const err = new Error('Houston something bad happened');
        sinon.stub(gstore.cache!.queries, 'clearQueriesByKind').rejects(err);

        Blog.update({ id: 123 }, { name: 'Nuri' }).catch(e => {
          expect(e.__entityUpdated.name).equal('Nuri');
          expect(e.__cacheError).equal(err);
          (gstore.cache!.queries.clearQueriesByKind as any).restore();
          done();
        });
      });
    });
  });

  describe('delete()', () => {
    beforeEach(() => {
      sinon.stub(ds, 'delete').resolves([{ indexUpdates: 3 }]);
      sinon.stub(transaction, 'delete').callsFake(() => true);
    });

    afterEach(() => {
      ds.delete.restore();
      (transaction.delete as any).restore();
    });

    test('should call ds.delete with correct Key (int id)', () =>
      Blog.delete({ id: 123 }).then(response => {
        expect(ds.delete.called).equal(true);
        expect(ds.delete.getCall(0).args[0].constructor.name).equal('Key');
        expect(response.success).equal(true);
      }));

    test('should call ds.delete with correct Key (string id)', () =>
      Blog.delete('keyName').then(response => {
        expect(ds.delete.called).equal(true);
        expect(ds.delete.getCall(0).args[0].path[1]).equal('keyName');
        expect(response.success).equal(true);
      }));

    test('not converting string id with mix of number and alpha chars', () =>
      Blog.delete('123:456').then(() => {
        expect(ds.delete.getCall(0).args[0].name).equal('123:456');
      }));

    // test('should allow array of ids', () =>
    //   Blog.delete([22, 69]).then(() => {
    //     expect(is.array(ds.delete.getCall(0).args[0])).equal(true);
    //   }));

    test('should allow ancestors', () =>
      Blog.delete({ id: 123 }, ['Parent', 123]).then(() => {
        const key = ds.delete.getCall(0).args[0];

        expect(key.parent.kind).equal('Parent');
        expect(key.parent.id).equal(123);
      }));

    test('should allow a namespace', () => {
      const namespace = 'com.mydomain-dev';

      return Blog.delete('keyName', undefined, namespace).then(() => {
        const key = ds.delete.getCall(0).args[0];

        expect(key.namespace).equal(namespace);
      });
    });

    test('should delete entity in a transaction', () =>
      Blog.delete({ id: 123 }, undefined, undefined, transaction).then(() => {
        expect((transaction.delete as any).called).equal(true);
        expect((transaction.delete as any).getCall(0).args[0].path[1]).equal(123);
      }));

    test('should deal with empty responses', () => {
      ds.delete.restore();
      sinon.stub(ds, 'delete').resolves();
      return Blog.delete({ id: 123 }).then(response => {
        assert.isDefined(response.key);
      });
    });

    test('should delete entity in a transaction in sync', () => {
      Blog.delete({ id: 123 }, undefined, undefined, transaction);
      expect((transaction.delete as any).called).equal(true);
      expect((transaction.delete as any).getCall(0).args[0].path[1]).equal(123);
    });

    test('should throw error if transaction passed is not instance of gcloud Transaction', () =>
      // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
      // @ts-ignore
      Blog.delete({ id: 123 }, undefined, undefined, {}).catch(err => {
        expect(err.message).equal('Transaction needs to be a gcloud Transaction');
      }));

    test('should set "success" to false if no entity deleted', () => {
      ds.delete.restore();
      sinon.stub(ds, 'delete').resolves([{ indexUpdates: 0 }]);

      return Blog.delete({ id: 123 }).then(response => {
        expect(response.success).equal(false);
      });
    });

    test('should not set success neither apiRes', () => {
      ds.delete.restore();
      sinon.stub(ds, 'delete').resolves([{}]);

      return Blog.delete({ id: 123 }).then(response => {
        assert.isUndefined(response.success);
      });
    });

    test('should handle errors', () => {
      ds.delete.restore();
      const error = { code: 500, message: 'We got a problem Houston' };
      sinon.stub(ds, 'delete').rejects(error);

      return Blog.delete({ id: 123 }).catch(err => {
        expect(err).equal(error);
      });
    });

    test('should call pre hooks', () => {
      const spy = {
        beforeSave: (): Promise<void> => Promise.resolve(),
      };
      sinon.spy(spy, 'beforeSave');
      schema.pre('delete', spy.beforeSave);
      const MyModel = gstore.model('Blog-1', schema);

      return MyModel.delete({ id: 123 }).then(() => {
        expect((spy.beforeSave as any).calledBefore(ds.delete)).equal(true);
      });
    });

    test('pre hook should override id passed', () => {
      const spy = {
        beforeSave: (): Promise<any> => Promise.resolve({ __override: [{ id: 666 }] }),
      };
      sinon.spy(spy, 'beforeSave');
      schema.pre('delete', spy.beforeSave);
      const MyModel = gstore.model('Blog-2', schema);

      return MyModel.delete({ id: 123 }).then(() => {
        expect(ds.delete.getCall(0).args[0].id).equal(666);
      });
    });

    test('should set "pre" hook scope to entity being deleted (1)', done => {
      schema.pre('delete', function preDelete(this: any) {
        expect(this instanceof GstoreEntity).equal(true);
        done();
        return Promise.resolve();
      });
      const MyModel = gstore.model('Blog-3', schema);

      MyModel.delete({ id: 123 });
    });

    test('should set "pre" hook scope to entity being deleted (2)', () => {
      const mySchema = new Schema({});
      mySchema.pre('delete', function preDelete(this: any) {
        expect(this.entityKey.id).equal(777);
        return Promise.resolve();
      });
      const MyModel = gstore.model('Blog-4', mySchema);

      // ... passing a datastore.key
      return MyModel.delete({ key: MyModel.key({ id: 777 }) });
    });

    // test('should NOT set "pre" hook scope if deleting an array of ids', () => {
    //   let scope: any;
    //   schema.pre('delete', function preDelete(this: any) {
    //     scope = this;
    //     return Promise.resolve();
    //   });
    //   const MyModel = gstore.model('Blog-5', schema);

    //   return MyModel.delete([123, 456]).then(() => {
    //     expect(scope).equal(null);
    //   });
    // });

    test('should call post hooks', () => {
      const spy = {
        afterDelete: (): Promise<void> => Promise.resolve(),
      };
      sinon.spy(spy, 'afterDelete');
      schema.post('delete', spy.afterDelete);
      const MyModel = gstore.model('Blog-6', schema);

      return MyModel.delete({ id: 123 }).then(() => {
        expect((spy.afterDelete as any).called).equal(true);
      });
    });

    test('should pass key deleted to post hooks and set the scope to the entity deleted', done => {
      const mySchema = new Schema({});
      mySchema.post('delete', function postDeleteHook(this: any, { key }) {
        expect(key.constructor.name).equal('Key');
        expect(key.id).equal(123);
        expect(this instanceof GstoreEntity).equal(true);
        expect(this.entityKey).equal(key);
        done();
        return Promise.resolve();
      });
      const MyModel = gstore.model('Blog-7', mySchema);

      MyModel.delete({ id: 123 });
    });

    // test('should pass array of keys deleted to post hooks', () => {
    //   const ids = [123, 456];
    //   schema.post('delete', response => {
    //     expect(response.key.length).equal(ids.length);
    //     expect(response.key[1].id).equal(456);
    //     return Promise.resolve();
    //   });
    //   const MyModel = gstore.model('Blog-8', schema);

    //   return MyModel.delete(ids).then(() => undefined);
    // });

    test('transaction.execPostHooks() should call post hooks', () => {
      const spy = {
        afterDelete: (): Promise<void> => Promise.resolve(),
      };
      sinon.spy(spy, 'afterDelete');
      const mySchema = new Schema({ name: { type: String } });
      mySchema.post('delete', spy.afterDelete);

      const MyModel = gstore.model('Blog-9', mySchema);

      return MyModel.delete({ id: 123 }, undefined, undefined, transaction).then(() => {
        transaction.execPostHooks().then(() => {
          expect((spy.afterDelete as any).called).equal(true);
          expect((spy.afterDelete as any).calledOnce).equal(true);
        });
      });
    });

    test('should accept a DataLoader instance and clear the cached key after deleting', () => {
      const dataloader = gstore.createDataLoader();
      const spy = sinon.spy(dataloader, 'clear');

      return Blog.delete({ id: 123 }, undefined, undefined, undefined, { dataloader }).then(() => {
        const keyToClear = spy.getCalls()[0].args[0];
        expect(keyToClear.kind).equal('Blog');
        expect(keyToClear.id).equal(123);
      });
    });

    describe('when cache is active', () => {
      beforeEach(() => {
        gstore.cache = gstoreWithCache.cache;
      });

      afterEach(() => {
        // empty the cache
        gstore.cache!.reset();
        delete gstore.cache;
      });

      test('should call Model.clearCache() passing the key deleted', () => {
        sinon.spy(Blog, 'clearCache');

        return Blog.delete({ id: 445566 }).then(response => {
          assert.ok((Blog.clearCache as any).called);
          expect((Blog.clearCache as any).getCall(0).args[0].id).equal(445566);
          expect(response.success).equal(true);
          (Blog.clearCache as any).restore();
        });
      });

      test('on error when clearing the cache, should add the entityUpdated on the error', done => {
        const err = new Error('Houston something bad happened');
        sinon.stub(gstore.cache!.queries, 'clearQueriesByKind').rejects(err);

        Blog.delete({ id: 1234 }).catch(e => {
          expect(e.__response.success).equal(true);
          expect(e.__cacheError).equal(err);
          (gstore.cache!.queries.clearQueriesByKind as any).restore();
          done();
        });
      });
    });
  });

  describe('deleteAll()', () => {
    let queryMock: any;

    beforeEach(() => {
      queryMock = new Query(ds, { entities: mockEntities });
      sinon.spy(queryMock, 'run');
      sinon.spy(queryMock, 'hasAncestor');
      sinon.stub(ds, 'createQuery').callsFake(() => queryMock);

      sinon.stub(ds, 'delete').callsFake(() => {
        // We need to update our mock response of the Query
        // to not enter in an infinite loop as we recursivly query
        // until there are no more entities
        ds.createQuery.restore();
        sinon.stub(ds, 'createQuery').callsFake(() => new Query(ds, { entities: [] }));
        return Promise.resolve([{ indexUpdates: 3 }]);
      });

      sinon.spy(Blog, 'query');
    });

    afterEach(() => {
      ds.delete.restore();
      ds.createQuery.restore();
      if (queryMock.run.restore) {
        queryMock.run.restore();
      }
      if (queryMock.hasAncestor.restore) {
        queryMock.hasAncestor.restore();
      }
      (Blog.query as any).restore();
    });

    test('should get all entities through Query', () =>
      Blog.deleteAll().then(() => {
        expect((Blog.query as any).called).equal(true);
        expect((Blog.query as any).getCall(0).args.length).equal(1);
      }));

    test('should catch error if could not fetch entities', () => {
      const error = { code: 500, message: 'Something went wrong' };
      queryMock.run.restore();
      sinon.stub(queryMock, 'run').rejects(error);

      return Blog.deleteAll().catch(err => {
        expect(err).equal(error);
      });
    });

    test('if pre hooks, should call "delete" on all entities found (in series)', () => {
      const mySchema = new Schema({});
      const spies = {
        pre: (): Promise<void> => Promise.resolve(),
      };
      sinon.spy(spies, 'pre');

      mySchema.pre('delete', spies.pre);

      const MyModel = gstore.model('NewBlog', mySchema);
      sinon.spy(MyModel, 'delete');

      return MyModel.deleteAll().then(() => {
        expect((spies.pre as any).callCount).equal(mockEntities.length);
        expect((MyModel.delete as any).callCount).equal(mockEntities.length);
        expect((MyModel.delete as any).getCall(0).args[0].key.constructor.name).equal('Key');
      });
    });

    test('if post hooks, should call "delete" on all entities found (in series)', () => {
      const mySchema = new Schema({});
      const spies = {
        post: (): Promise<void> => Promise.resolve(),
      };
      sinon.spy(spies, 'post');
      mySchema.post('delete', spies.post);

      const MyModel = gstore.model('NewBlog', mySchema);
      sinon.spy(MyModel, 'delete');

      return MyModel.deleteAll().then(() => {
        expect((spies.post as any).callCount).equal(mockEntities.length);
        expect((MyModel.delete as any).callCount).equal(2);
      });
    });

    test('if NO hooks, should call delete passing an array of keys', () => {
      sinon.spy(Blog, 'delete');

      return Blog.deleteAll().then(() => {
        expect((Blog.delete as any).callCount).equal(1);

        const { args } = (Blog.delete as any).getCall(0);
        expect(is.array(args[0])).equal(true);
        expect(args[0]).deep.equal([{ key: mockEntities[0][ds.KEY] }, { key: mockEntities[1][ds.KEY] }]);

        (Blog.delete as any).restore();
      });
    });

    test('should call with ancestors', () => {
      const ancestors = ['Parent', 'keyname'];

      return Blog.deleteAll(ancestors).then(() => {
        expect(queryMock.hasAncestor.calledOnce).equal(true);
        expect(queryMock.ancestors.path).deep.equal(ancestors);
      });
    });

    test('should call with namespace', () => {
      const namespace = 'com.new-domain.dev';

      return Blog.deleteAll(undefined, namespace).then(() => {
        expect(ds.createQuery.getCall(0).args[0]).equal(namespace);
      });
    });

    test('should return success:true if all ok', () =>
      Blog.deleteAll().then(response => {
        expect(response.success).equal(true);
      }));

    test('should return error if any while deleting', async done => {
      const error = { code: 500, message: 'Could not delete' };
      sinon.stub(Blog, 'delete').rejects(error);

      try {
        await Blog.deleteAll();
      } catch (err) {
        expect(err).equal(error);
      }
      (Blog.delete as any).restore();
      done();
    });

    test('should delete entites by batches of 500', done => {
      ds.createQuery.restore();

      const entities = [];
      const entity: any = { name: 'Mick', lastname: 'Jagger' };
      entity[ds.KEY] = ds.key(['BlogPost', 'keyname']);

      for (let i = 0; i < 1200; i += 1) {
        entities.push(entity);
      }

      const queryMock2 = new Query(ds, { entities });
      sinon.stub(ds, 'createQuery').callsFake(() => queryMock2);

      Blog.deleteAll().then(() => {
        expect(false).equal(false);
        done();
      });
    });

    describe('when cache is active', () => {
      beforeEach(() => {
        gstore.cache = gstoreWithCache.cache;
      });

      afterEach(() => {
        // empty the cache
        gstore.cache!.reset();
        delete gstore.cache;
      });

      test('should delete all the keys from the cache and clear the Queries', done => {
        ds.createQuery.restore();

        const entities = [];
        const entity: any = { name: 'Mick', lastname: 'Jagger' };
        entity[ds.KEY] = ds.key(['BlogPost', 'keyname']);
        for (let i = 0; i < 1200; i += 1) {
          entities.push(entity);
        }

        queryMock = new Query(ds, { entities });
        sinon.stub(ds, 'createQuery').callsFake(
          () =>
            // Check
            queryMock,
        );
        sinon.spy(gstore.cache!.keys, 'del');
        sinon.spy(gstore.cache!.queries, 'clearQueriesByKind');

        Blog.deleteAll().then(() => {
          expect((gstore.cache!.queries.clearQueriesByKind as any).callCount).equal(1);
          expect((gstore.cache!.keys.del as any).callCount).equal(3);
          const keys1 = (gstore.cache!.keys.del as any).getCall(0).args;
          const keys2 = (gstore.cache!.keys.del as any).getCall(1).args;
          const keys3 = (gstore.cache!.keys.del as any).getCall(2).args;
          expect(keys1.length + keys2.length + keys3.length).equal(1200);

          (gstore.cache!.keys.del as any).restore();
          (gstore.cache!.queries.clearQueriesByKind as any).restore();
          done();
        });
      });
    });
  });

  describe('excludeFromIndexes', () => {
    test('should add properties to schema as optional', () => {
      const arr = ['newProp', 'url'];
      Blog.excludeFromIndexes(arr);

      expect(Blog.schema.excludedFromIndexes).deep.equal({
        lastname: ['lastname'],
        age: ['age'],
        newProp: ['newProp'],
        url: ['url'],
        tags: [],
        prefs: [],
      });
      expect((schema.path('newProp')! as SchemaPathDefinition).optional).equal(true);
    });

    test('should only modifiy excludeFromIndexes on properties that already exist', () => {
      const prop = 'lastname';
      Blog.excludeFromIndexes(prop);

      expect(Blog.schema.excludedFromIndexes).deep.equal({
        lastname: ['lastname'],
        age: ['age'],
        tags: [],
        prefs: [],
      });
      assert.isUndefined((schema.path('lastname')! as SchemaPathDefinition).optional);
      expect((schema.path('lastname')! as SchemaPathDefinition).excludeFromIndexes).equal(true);
    });
  });

  describe('hooksTransaction()', () => {
    beforeEach(() => {
      delete transaction.hooks;
    });

    test('should add hooks to a transaction', () => {
      Blog.__hooksTransaction(transaction, [(): any => Promise.resolve(), (): any => Promise.resolve()]);

      assert.isDefined(transaction.hooks.post);
      expect(transaction.hooks.post.length).equal(2);
      assert.isDefined(transaction.execPostHooks);
    });

    test('should not override previous hooks on transaction', () => {
      const fn = (): void => undefined;
      transaction.hooks = {
        post: [fn],
      };

      Blog.__hooksTransaction(transaction, [(): any => Promise.resolve()]);

      expect(transaction.hooks.post[0]).equal(fn);
    });

    test('--> execPostHooks() should chain each Promised hook from transaction', () => {
      const postHook1 = sinon.stub().resolves(1);
      const postHook2 = sinon.stub().resolves(2);
      Blog.__hooksTransaction(transaction, [postHook1, postHook2]);

      return transaction.execPostHooks().then((result: any) => {
        expect(postHook1.called).equal(true);
        expect(postHook2.called).equal(true);
        expect(result).equal(2);
      });
    });

    test('--> execPostHooks() should resolve if no hooks', () => {
      Blog.__hooksTransaction(transaction, []);
      delete transaction.hooks.post;

      return transaction.execPostHooks().then(() => {
        expect(true).equal(true);
      });
    });
  });

  describe('clearCache', () => {
    beforeEach(() => {
      gstore.cache = gstoreWithCache.cache;
    });

    afterEach(() => {
      // empty the cache
      gstore.cache!.reset();

      if ((gstore.cache!.queries.clearQueriesByKind as any).restore) {
        (gstore.cache!.queries.clearQueriesByKind as any).restore();
      }

      delete gstore.cache;
    });

    test('should delete the cache', () => {
      sinon.spy(gstore.cache!.keys, 'del');

      return Blog.clearCache([Blog.key({ id: 112233 }), Blog.key({ id: 778899 })]).then(() => {
        assert.ok((gstore.cache!.keys.del as any).called);
        expect((gstore.cache!.keys.del as any).getCall(0).args[0].id).equal(112233);
        expect((gstore.cache!.keys.del as any).getCall(0).args[1].id).equal(778899);
        (gstore.cache!.keys.del as any).restore();
      });
    });

    test('should clear all queries linked to its entity kind', () => {
      sinon.spy(gstore.cache!.queries, 'clearQueriesByKind');
      return Blog.clearCache().then(() => {
        assert.ok((gstore.cache!.queries.clearQueriesByKind as any).called);
        const { args } = (gstore.cache!.queries.clearQueriesByKind as any).getCall(0);
        expect(args[0]).equal(Blog.entityKind);
      });
    });

    test('should bubble up errors', done => {
      const err = new Error('Houston something bad happened');
      sinon.stub(gstore.cache!.queries, 'clearQueriesByKind').rejects(err);
      Blog.clearCache(Blog.key({ id: 123 })).catch(e => {
        expect(e).equal(err);
        done();
      });
    });

    test('should not throw error if Redis is not present', () => {
      const err: any = new Error('Redis store not founc');
      err.code = 'ERR_NO_REDIS';
      sinon.stub(gstore.cache!.queries, 'clearQueriesByKind').rejects(err);

      Blog.clearCache(Blog.key({ id: 123 })).then(res => {
        expect(res.success).equal(true);
      });
    });
  });

  describe('populate()', () => {
    let PopulateModel: Model<any>;
    let entity;
    let key0: EntityKey;
    let key1: EntityKey;
    let key2: EntityKey;
    let fetchData1: any;
    let fetchData2: any;
    let refs: any;
    let entities: any;

    beforeEach(() => {
      gstore.connect(ds);
      schema = new Schema({
        name: { type: String },
        ref: { type: Schema.Types.Key },
      });
      PopulateModel = gstore.model('ModelTests-populate', schema);

      key0 = PopulateModel.key({ id: 123 });
      key1 = PopulateModel.key({ id: 456 });
      key2 = PopulateModel.key({ id: 789 });

      entity = new PopulateModel({ name: 'Level0', ref: key1 }, { key: key0 });

      fetchData1 = { name: 'Level1', ref: key2 };
      fetchData1[ds.KEY] = key1;

      fetchData2 = { name: 'Level2' };
      fetchData2[ds.KEY] = key2;

      refs = [
        [{ path: 'ref', select: ['*'] }], // level 0
        [{ path: 'ref.ref', select: ['*'] }], // level 1
      ];
      entities = [entity];

      const stub = sinon.stub(ds, 'get');
      stub.onCall(0).returns(Promise.resolve([fetchData1]));
      stub.onCall(1).returns(Promise.resolve([fetchData2]));
    });

    afterEach(() => {
      ds.get.restore();
    });

    test('should recursively fetch the keys at each level of the entityData tree', () =>
      PopulateModel.__populate(refs)(entities).then(({ 0: { entityData } }: any) => {
        expect(entityData.ref.id).equal(456);
        expect(entityData.ref.name).equal('Level1');
        expect(entityData.ref.ref.id).equal(789);
        expect(entityData.ref.ref.name).equal('Level2');
        expect(ds.get.getCalls().length).equal(2);
      }));

    describe('when cache is active', () => {
      beforeEach(() => {
        gstore.cache = gstoreWithCache.cache;
      });

      afterEach(() => {
        // empty the cache
        gstore.cache!.reset();
        delete gstore.cache;
      });

      test('should get the keys from the cache and not fetch from the Datastore', () =>
        gstore.cache!.keys.mset(key1, fetchData1, key2, fetchData2).then(() =>
          PopulateModel.__populate(refs)(entities).then(() => {
            expect(ds.get.getCalls().length).equal(0);
          }),
        ));
    });
  });
});
