import chai from 'chai';
import sinon from 'sinon';
import Joi from '@hapi/joi';
import { Datastore, Transaction as DatastoreTransaction } from '@google-cloud/datastore';
import { DatastoreAdatper } from 'gstore-datastore-adapter';

import GstoreEntity, { Entity } from './entity';
import GstoreSchema from './schema';
import Model from './model';
import helpers from './helpers';
import Transaction from '../../../__tests__/mocks/transaction';
import { ERROR_CODES } from './errors';
import { datastoreSerializer } from './serializers';
import { Gstore } from './index';

const ds = new Datastore({
  namespace: 'com.mydomain',
  apiEndpoint: 'http://localhost:8080',
});

const gstore = new Gstore({ adapter: new DatastoreAdatper(ds) });
const gstoreWithCache = new Gstore({ adapter: new DatastoreAdatper(ds), cache: { config: { ttl: { keys: 600 } } } });
const { Schema } = gstore;
const { expect, assert } = chai;
const { validation } = helpers;

describe('GstoreEntity', () => {
  let schema: GstoreSchema;
  let GstoreModel: Model<any>;
  let entity: Entity<{ [key: string]: any }>;
  let transaction: DatastoreTransaction;

  beforeEach(() => {
    gstore.models = {};
    gstore.connect(ds);
    gstoreWithCache.connect(ds);

    schema = new Schema({
      name: { type: String, default: 'Mick' },
      lastname: { type: String },
      password: { type: String, read: false },
      website: { type: String, validate: 'isURL' },
    });

    schema.virtual('fullname').get(function getFullName(this: any) {
      return `${this.name} ${this.lastname}`;
    });

    schema.virtual('fullname').set(function setFullName(this: any, name) {
      const split = name.split(' ');
      [this.name, this.lastname] = split;
    });

    GstoreModel = gstore.model('User', schema);
    transaction = new Transaction();

    sinon.stub(ds, 'save').resolves();
    sinon.spy(transaction, 'save');
  });

  afterEach(() => {
    (ds.save as any).restore();
    (transaction.save as any).restore();
  });

  describe('intantiate', () => {
    test('should initialized properties', () => {
      entity = new GstoreModel({}, 'keyid');

      assert.isDefined(entity.entityData);
      assert.isDefined(entity.entityKey);
      assert.isDefined(entity.schema);
      assert.isDefined((entity as any).pre);
      assert.isDefined((entity as any).post);
    });

    test('should add data passed to entityData', () => {
      entity = new GstoreModel({ name: 'John' });
      expect(entity.entityData.name).to.equal('John');
    });

    test('should have default if no data passed', () => {
      entity = new GstoreModel();
      expect(entity.entityData.name).to.equal('Mick');
    });

    test('should not add any data if nothing is passed', () => {
      schema = new Schema({
        name: { type: String, optional: true },
      });
      GstoreModel = gstore.model('BlogPost', schema);

      entity = new GstoreModel();

      expect(Object.keys(entity.entityData).length).to.equal(0);
    });

    test('should set default values or null from schema', () => {
      function fn(): string {
        return 'generatedValue';
      }

      schema = new Schema({
        name: { type: String, default: 'John' },
        lastname: { type: String },
        email: { optional: true },
        generatedValue: { type: String, default: fn },
        availableValues: { values: ['a', 'b', 'c'] },
        availableValuesRequired: { values: ['a', 'b', 'c'], required: true },
      });

      GstoreModel = gstore.model('BlogPost', schema);

      entity = new GstoreModel({});

      expect(entity.entityData.name).equal('John');
      expect(entity.entityData.lastname).equal(null);
      expect(entity.entityData.email).equal(undefined);
      expect(entity.entityData.generatedValue).equal('generatedValue');
      expect(entity.entityData.availableValues).equal('a');
      expect(entity.entityData.availableValuesRequired).equal(null);
    });

    test('should set values from Joi schema', () => {
      const generateFullName = (context: any): string => `${context.name} ${context.lastname}`;

      schema = new Schema(
        {
          name: { joi: Joi.string() },
          lastname: { joi: Joi.string().default('Jagger') },
          // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
          // @ts-ignore
          fullname: { joi: Joi.string().default(generateFullName) },
        },
        { joi: true },
      );

      GstoreModel = gstore.model('EntityKind', schema);

      const user = new GstoreModel({ name: 'Mick' });

      expect(user.entityData.lastname).equal('Jagger');
      expect(user.entityData.fullname).equal('Mick Jagger');
    });

    test('should not set default if Joi validation does not pass', () => {
      schema = new Schema(
        {
          name: {
            joi: Joi.string()
              .default('test')
              .required(),
          },
          lastname: { joi: Joi.string().default('Jagger') },
          age: { joi: Joi.number() },
        },
        { joi: true },
      );

      GstoreModel = gstore.model('EntityKind', schema);

      const user = new GstoreModel({ age: 77 });

      expect(user.age).equal(77);
      assert.isUndefined(user.entityData.lastname);
    });

    test('should call handler for default values in gstore.defaultValues constants', () => {
      sinon.spy(gstore.defaultValues, '__handler__');
      schema = new Schema({
        createdOn: { type: Date, default: gstore.defaultValues.NOW },
      });
      GstoreModel = gstore.model('BlogPost', schema);
      entity = new GstoreModel({});

      expect((gstore.defaultValues.__handler__ as any).calledOnce).equal(true);
    });

    test('should not add default to optional properties', () => {
      schema = new Schema({
        name: { type: String },
        email: { optional: true },
      });
      GstoreModel = gstore.model('BlogPost', schema);

      entity = new GstoreModel({});

      expect(entity.entityData.email).equal(undefined);
    });

    describe('should create Datastore Key', () => {
      beforeEach(() => {
        sinon.spy(ds, 'key');

        GstoreModel = gstore.model('BlogPost', schema);
      });

      afterEach(() => {
        (ds.key as any).restore();
      });

      test('---> with a full Key (String keyname passed)', () => {
        entity = new GstoreModel({}, 'keyid');

        expect(entity.entityKey.kind).equal('BlogPost');
        expect(entity.entityKey.name).equal('keyid');
      });

      test('---> with a full Key (String with including numbers)', () => {
        entity = new GstoreModel({}, '123:456');

        expect(entity.entityKey.name).equal('123:456');
      });

      test('---> with a full Key (Integer keyname passed)', () => {
        entity = new GstoreModel({}, { id: 123 });

        expect(entity.entityKey.id).equal(123);
      });

      test('---> with a full Key ("string" Integer keyname passed)', () => {
        entity = new GstoreModel({}, { id: '123' });
        expect(entity.entityKey.id).equal(123);
      });

      test('---> with a partial Key (auto-generated id)', () => {
        entity = new GstoreModel({});

        expect(entity.entityKey.kind).to.deep.equal('BlogPost');
      });

      test('---> with an ancestor path (auto-generated id)', () => {
        entity = new GstoreModel({}, undefined, ['Parent', 1234]);

        expect(entity.entityKey.parent!.kind).equal('Parent');
        expect(entity.entityKey.parent!.id).equal(1234);
        expect(entity.entityKey.kind).equal('BlogPost');
      });

      test('---> with an ancestor path (manual id)', () => {
        entity = new GstoreModel({}, 'entityKind', ['Parent', 1234]);

        expect(entity.entityKey.parent!.kind).equal('Parent');
        expect(entity.entityKey.parent!.id).equal(1234);
        expect(entity.entityKey.kind).equal('BlogPost');
        expect(entity.entityKey.name).equal('entityKind');
      });

      test('---> with a namespace', () => {
        entity = new GstoreModel({}, undefined, undefined, 'com.otherdomain');

        expect(entity.entityKey.namespace).equal('com.otherdomain');
      });

      test('---> with a gcloud Key', () => {
        const key = ds.key(['BlogPost', 1234]);

        entity = new GstoreModel({}, { key });

        expect(entity.entityKey).equal(key);
      });

      test('---> throw error if key is not instance of Key', () => {
        function fn(): Entity {
          // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
          // @ts-ignore
          entity = new GstoreModel({}, { key: {} });
          return entity;
        }

        expect(fn).to.throw();
      });
    });

    describe('should register schema hooks', () => {
      let spyOn: any;

      beforeEach(() => {
        spyOn = {
          fnHookPre: (): Promise<void> => Promise.resolve(),
          fnHookPost: (): Promise<any> => Promise.resolve({ __override: 1234 }),
        };

        sinon.spy(spyOn, 'fnHookPre');
        sinon.spy(spyOn, 'fnHookPost');
      });

      afterEach(() => {
        spyOn.fnHookPost.restore();
        spyOn.fnHookPre.restore();
      });

      test('should call pre hooks before saving and override arguments', () => {
        schema.pre('save', spyOn.fnHookPre);
        GstoreModel = gstore.model('BlogPost', schema);
        entity = new GstoreModel({ name: 'John' });

        return entity.save().then(() => {
          expect(spyOn.fnHookPre.callCount).to.equal(1);
        });
      });

      test('should call pre and post hooks on custom method', () => {
        schema.method('newmethod', () => Promise.resolve());
        schema.pre('newmethod', spyOn.fnHookPre);
        schema.post('newmethod', spyOn.fnHookPost);
        GstoreModel = gstore.model('BlogPost', schema);
        entity = new GstoreModel({ name: 'John' });

        return (entity as any).newmethod().then(() => {
          expect(spyOn.fnHookPre.callCount).to.equal(1);
          expect(spyOn.fnHookPost.callCount).to.equal(1);
        });
      });

      test('should call post hooks after saving and override resolve', () => {
        schema.post('save', spyOn.fnHookPost);
        GstoreModel = gstore.model('BlogPost', schema);
        entity = new GstoreModel({});

        return entity.save().then(result => {
          expect(spyOn.fnHookPost.called).equal(true);
          expect(result).equal(1234);
        });
      });

      test('should not do anything if no hooks on schema', () => {
        schema.__callQueue = { model: {}, entity: {} };
        GstoreModel = gstore.model('BlogPost', schema);
        entity = new GstoreModel({ name: 'John' });

        assert.isUndefined((entity as any).__pres);
        assert.isUndefined((entity as any).__posts);
      });

      test('should not register unknown methods', () => {
        schema.__callQueue = { model: {}, entity: {} };
        schema.pre('unknown', () => Promise.resolve());
        GstoreModel = gstore.model('BlogPost', schema);
        entity = new GstoreModel({});

        assert.isUndefined((entity as any).__pres);
        assert.isUndefined((entity as any).__posts);
      });
    });
  });

  describe('get / set', () => {
    let user: Entity<any>;

    beforeEach(() => {
      user = new GstoreModel({ name: 'John', lastname: 'Snow' });
    });

    test('should get an entityData property', () => {
      const name = user.get('name');

      expect(name).equal('John');
    });

    test('should return virtual', () => {
      const fullname = user.get('fullname');

      expect(fullname).equal('John Snow');
    });

    test('should set an entityData property', () => {
      user.set('name', 'Gregory');

      const name = user.get('name');

      expect(name).equal('Gregory');
    });

    test('should set virtual', () => {
      user.set('fullname', 'Peter Jackson');

      expect(user.entityData.name).equal('Peter');
    });

    test('should get data on entity properties from the entity data', () => {
      GstoreModel = gstore.model('BlogPost', schema) as any;

      entity = new GstoreModel({
        name: 'Jane',
        lastname: 'Does',
        password: 'JanesPassword',
      });

      expect(entity.name).to.equal('Jane');
      expect(entity.lastname).to.equal('Does');
      expect(entity.password).to.equal('JanesPassword');
    });

    test('should reflect changes to entity properties in the entity data', () => {
      GstoreModel = gstore.model('BlogPost', schema);

      entity = new GstoreModel({
        name: 'Jane',
        lastname: 'Does',
        password: 'JanesPassword',
      });

      entity.name = 'John';
      entity.lastname = 'Doe';
      entity.password = 'JoesPassword';

      expect(entity.entityData.name).to.equal('John');
      expect(entity.entityData.lastname).to.equal('Doe');
      expect(entity.entityData.password).to.equal('JoesPassword');
    });
  });

  describe('plain()', () => {
    beforeEach(() => {
      sinon.spy(datastoreSerializer, 'fromDatastore');
    });

    afterEach(() => {
      (datastoreSerializer.fromDatastore as any).restore();
    });

    test('should throw an error is options is not of type Object', () => {
      const fn = (): void => {
        entity = new GstoreModel({ name: 'John' });
        // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
        // @ts-ignore
        entity.plain(true);
      };

      expect(fn).throw(Error);
    });

    test('should call datastoreSerializer "fromDatastore"', () => {
      entity = new GstoreModel({ name: 'John', password: 'test' });
      const { entityData } = entity;

      const output = entity.plain();

      expect((datastoreSerializer.fromDatastore as any).getCall(0).args[0]).deep.equal(entityData);
      expect((datastoreSerializer.fromDatastore as any).getCall(0).args[2]).deep.equal({
        readAll: false,
        showKey: false,
      });
      assert.isUndefined(output.password);
    });

    test('should call datastoreSerializer "fromDatastore" passing readAll parameter', () => {
      entity = new GstoreModel({ name: 'John', password: 'test' });

      const output = entity.plain({ readAll: true });

      expect((datastoreSerializer.fromDatastore as any).getCall(0).args[2]).deep.equal({
        readAll: true,
        showKey: false,
      });
      assert.isDefined(output.password);
    });

    test('should pass showKey parameter', () => {
      entity = new GstoreModel({});

      entity.plain({ showKey: true });

      expect((datastoreSerializer.fromDatastore as any).getCall(0).args[2]).deep.equal({
        readAll: false,
        showKey: true,
      });
    });

    test('should add virtuals', () => {
      const userSchame = new Schema({ firstName: {}, lastName: {} });
      userSchame.virtual('fullName').get(function fullName(this: any) {
        return `${this.firstName} ${this.lastName}`;
      });
      const UserModel = gstore.model('UserWithVirtuals', userSchame);
      const user = new UserModel({ firstName: 'John', lastName: 'Snow' });

      const output = user.plain({ virtuals: true });
      expect(output.fullName).to.equal('John Snow');
    });

    test('should clear embedded object excluded properties', () => {
      schema = new Schema({
        embedded: { excludeFromRead: ['prop1', 'prop2'] },
      });

      GstoreModel = gstore.model('HasEmbedded', schema);

      entity = new GstoreModel({ embedded: { prop1: '1', prop2: '2', prop3: '3' } });
      const plain = entity.plain({});

      assert.isUndefined(plain.embedded.prop1);
      assert.isUndefined(plain.embedded.prop2);
      expect(plain.embedded.prop3).equal('3');
    });

    test('should clear nested embedded object excluded properties', () => {
      schema = new Schema({
        embedded: { excludeFromRead: ['prop1', 'prop2.p1', 'prop3.p1.p11'] },
      });

      GstoreModel = gstore.model('HasEmbedded', schema);

      entity = new GstoreModel({
        embedded: {
          prop1: '1',
          prop2: { p1: 'p1', p2: 'p2' },
          prop3: { p1: { p11: 'p11', p12: 'p12' }, p2: 'p2' },
          prop4: '4',
        },
      });

      const plain = entity.plain({});

      assert.isUndefined(plain.embedded.prop1);
      expect(typeof plain.embedded.prop2).equal('object');
      assert.isUndefined(plain.embedded.prop2.p1);
      expect(plain.embedded.prop2.p2).equal('p2');
      expect(typeof plain.embedded.prop3).equal('object');
      expect(typeof plain.embedded.prop3.p1).equal('object');
      assert.isUndefined(plain.embedded.prop3.p1.p11);
      expect(plain.embedded.prop3.p1.p12).equal('p12');
      expect(plain.embedded.prop3.p2).equal('p2');
      expect(plain.embedded.prop4).equal('4');
    });

    test('should ignore incorrectly specified nested embedded object property paths', () => {
      schema = new Schema({
        embedded: { excludeFromRead: ['prop3.wrong.p1', 'prop4', 'prop4.p1.p2', 'prop5.p1'] },
      });

      GstoreModel = gstore.model('HasEmbedded', schema);

      entity = new GstoreModel({
        embedded: {
          prop1: '1',
          prop2: { p1: { p2: 'p2' } },
          prop3: { p1: { p2: { p3: 'p3' } } },
        },
      });

      const plain = entity.plain();

      expect(plain.embedded.prop1).equal('1');
      expect(plain.embedded.prop2.p1.p2).equal('p2');
      expect(plain.embedded.prop3.p1.p2.p3).equal('p3');
    });

    test('should not clear nested embedded object excluded properties when specifying readAll: true', () => {
      schema = new Schema({
        embedded: { excludeFromRead: ['prop1', 'prop2.p1', 'prop3.p1.p11'] },
      });

      GstoreModel = gstore.model('HasEmbedded', schema);

      entity = new GstoreModel({
        embedded: {
          prop1: '1',
          prop2: { p1: 'p1', p2: 'p2' },
          prop3: { p1: { p11: 'p11', p12: 'p12' }, p2: 'p2' },
          prop4: '4',
        },
      });

      const plain = entity.plain({ readAll: true });

      expect(typeof plain.embedded.prop1).equal('string');
      expect(typeof plain.embedded.prop2).equal('object');
      expect(typeof plain.embedded.prop3).equal('object');
      expect(typeof plain.embedded.prop4).equal('string');
      expect(plain.embedded.prop1).equal('1');
      expect(plain.embedded.prop2.p1).equal('p1');
      expect(plain.embedded.prop2.p2).equal('p2');
      expect(plain.embedded.prop3.p1.p11).equal('p11');
      expect(plain.embedded.prop3.p1.p12).equal('p12');
      expect(plain.embedded.prop3.p2).equal('p2');
      expect(plain.embedded.prop4).equal('4');
    });
  });

  describe('datastoreEntity()', () => {
    test('should get the data from the Datastore and merge it into the entity', () => {
      const mockData = { name: 'John' };
      sinon.stub(ds, 'get').resolves([mockData]);

      entity = new GstoreModel({});

      return entity.datastoreEntity().then(_entity => {
        expect((ds.get as any).called).equal(true);
        expect((ds.get as any).getCall(0).args[0]).equal(entity.entityKey);
        expect(_entity instanceof GstoreEntity).equal(true);
        expect(_entity!.entityData).equal(mockData);

        (ds.get as any).restore();
      });
    });

    test('should return 404 not found if no entity returned', () => {
      sinon.stub(ds, 'get').resolves([]);

      entity = new GstoreModel({});

      return entity.datastoreEntity().catch(err => {
        expect(err.code).equal(gstore.errors.codes.ERR_ENTITY_NOT_FOUND);
        expect(err.message).equal('Entity not found');
        (ds.get as any).restore();
      });
    });

    test('should return 404 not found if no entity returned (2)', () => {
      sinon.stub(ds, 'get').resolves();

      entity = new GstoreModel({});

      return entity.datastoreEntity().catch(err => {
        expect(err.code).equal(gstore.errors.codes.ERR_ENTITY_NOT_FOUND);
        (ds.get as any).restore();
      });
    });

    test('should return null if no entity returned', () => {
      gstore.config.errorOnEntityNotFound = false;

      sinon.stub(ds, 'get').resolves([]);

      entity = new GstoreModel({});

      return entity.datastoreEntity().then(_entity => {
        expect(_entity).equal(null);
        (ds.get as any).restore();
      });
    });

    test('should bubble up error fetching the entity', () => {
      const error = { code: 500, message: 'Something went bad' };
      sinon.stub(ds, 'get').rejects(error);

      entity = new GstoreModel({});

      return entity.datastoreEntity().catch(err => {
        expect(err).equal(error);

        (ds.get as any).restore();
      });
    });

    describe('when cache is active', () => {
      let key: any;
      let mockData: any;

      beforeEach(() => {
        gstore.cache = gstoreWithCache.cache;

        key = GstoreModel.key({ id: 123 });
        mockData = { name: 'John' };
        mockData[gstore.ds.KEY] = key;
      });

      afterEach(() => {
        // empty the cache
        gstore.cache!.reset();
        delete gstore.cache;
      });

      test('should get value from cache', () => {
        const value = mockData;
        entity = new GstoreModel(mockData);
        entity.entityKey = key;

        sinon.spy(entity.gstore.cache!.keys, 'read');
        sinon.stub(ds, 'get').resolves([mockData]);

        return gstore.cache!.keys.set(key, value).then(() =>
          entity.datastoreEntity({ ttl: 123456 }).then(response => {
            assert.ok(!(ds.get as any).called);
            expect(response!.entityData).include(value);
            assert.ok((entity.gstore.cache!.keys.read as any).called);
            const { args } = (entity.gstore.cache!.keys.read as any).getCall(0);
            expect(args[0]).equal(key);
            expect(args[1].ttl).equal(123456);

            (entity.gstore.cache!.keys.read as any).restore();
            (ds.get as any).restore();
          }),
        );
      });

      test('should **not** get value from cache', () => {
        const value = mockData;
        entity = new GstoreModel(mockData);
        entity.entityKey = key;

        sinon.spy(entity.gstore.cache!.keys, 'read');
        sinon.stub(ds, 'get').resolves([mockData]);

        return gstore.cache!.keys.set(key, value).then(() =>
          entity.datastoreEntity({ cache: false }).then(() => {
            assert.ok((ds.get as any).called);
            expect((entity.gstore.cache!.keys.read as any).called).equal(false);
            (entity.gstore.cache!.keys.read as any).restore();
            (ds.get as any).restore();
          }),
        );
      });
    });
  });

  describe('model()', () => {
    test('should be able to return model instances', () => {
      const imageSchema = new Schema({});
      const ImageModel = gstore.model('Image', imageSchema);

      const blog = new GstoreModel({});

      expect(blog.model('Image')).equal(ImageModel);
    });

    test('should be able to execute methods from other model instances', () => {
      const imageSchema = new Schema({});
      const ImageModel = gstore.model('Image', imageSchema);
      const mockEntities = [{ key: ds.key(['BlogPost', 1234]) }];

      sinon.stub(ImageModel, 'get').callsFake(() => Promise.resolve(mockEntities[0]) as any);

      const blog = new GstoreModel({});

      return blog
        .model('Image')
        .get()
        .then((_entity: any) => {
          expect(_entity).equal(mockEntities[0]);
        });
    });
  });

  describe('getEntityDataWithVirtuals()', () => {
    let User: Model;

    beforeEach(() => {
      schema = new Schema({ firstname: {}, lastname: {} });

      schema.virtual('fullname').get(function getFullName(this: any) {
        return `${this.firstname} ${this.lastname}`;
      });

      schema.virtual('fullname').set(function setFullName(this: any, name) {
        const split = name.split(' ');
        [this.firstname, this.lastname] = split;
      });

      User = gstore.model('Client', schema);

      entity = new User({ firstname: 'John', lastname: 'Snow' });
    });

    test('should add add virtuals on instance', () => {
      assert.isDefined(entity.fullname);
    });

    test('setting on instance should modify entityData', () => {
      expect(entity.fullname).equal('John Snow');
    });

    test('should add virtuals properties on entity instance', () => {
      expect(entity.fullname).equal('John Snow');
      entity.firstname = 'Mick';
      expect(entity.fullname).equal('Mick Snow');
      entity.fullname = 'Andre Agassi';
      expect(entity.firstname).equal('Andre');
      expect(entity.lastname).equal('Agassi');
      expect(entity.entityData).deep.equal({ firstname: 'Andre', lastname: 'Agassi' });
    });

    test('should Not override', () => {
      entity = new User({ firstname: 'John', lastname: 'Snow', fullname: 'Jooohn' });
      const output = entity.plain({ virtuals: true });

      expect(output.fullname).equal('Jooohn');
    });

    test('should read and parse virtual (set)', () => {
      entity = new User({ fullname: 'John Snow' });

      const output = entity.plain({ virtuals: true });

      expect(output.firstname).equal('John');
      expect(output.lastname).equal('Snow');
    });

    test('should override existing', () => {
      entity = new User({ firstname: 'Peter', fullname: 'John Snow' });

      const output = entity.plain({ virtuals: true });

      expect(output.firstname).equal('John');
    });

    test('should not allow reserved name for virtuals', () => {
      const func = (): void => {
        schema.virtual('plain').get(function getFullName(this: any) {
          return `${this.firstname} ${this.lastname}`;
        });
      };

      expect(func).throws();
    });
  });

  describe('save()', () => {
    const data = { name: 'John', lastname: 'Snow' };

    beforeEach(() => {
      entity = new GstoreModel(data);
    });

    test('should return the entity saved', () =>
      entity.save().then(_entity => {
        expect(_entity instanceof GstoreEntity).equal(true);
      }));

    test('should validate() before', () => {
      const validateSpy = sinon.spy(entity, 'validate');

      return entity.save().then(() => {
        expect(validateSpy.called).equal(true);
      });
    });

    test('should NOT validate() data before', () => {
      schema = new Schema({}, { validateBeforeSave: false });
      GstoreModel = gstore.model('Blog', schema);
      entity = new GstoreModel({ name: 'John' });
      const validateSpy = sinon.spy(entity, 'validate');

      return entity.save().then(() => {
        expect(validateSpy.called).equal(false);
      });
    });

    test("should NOT save to Datastore if it didn't pass property validation", done => {
      entity = new GstoreModel({ unknown: 'John' });

      entity
        .save(undefined, { sanitizeEntityData: false })
        .then(() => {
          throw new Error('Should not enter here.');
        })
        .catch((err: any) => {
          assert.isDefined(err);
          expect(err.message).not.equal('Should not enter here.');
          expect((ds.save as any).called).equal(false);
          expect(err.code).equal(ERROR_CODES.ERR_VALIDATION);
          done();
        });
    });

    test("should NOT save to Datastore if it didn't pass value validation", done => {
      entity = new GstoreModel({ website: 'mydomain' });

      entity.save().catch(err => {
        assert.isDefined(err);
        expect((ds.save as any).called).equal(false);
        done();
      });
    });

    test('should convert to Datastore format before saving to Datastore', () => {
      const spySerializerToDatastore = sinon.spy(datastoreSerializer, 'toDatastore');

      return entity.save().then(() => {
        expect((entity.gstore.ds.save as any).calledOnce).equal(true);
        expect(spySerializerToDatastore.called).equal(true);
        expect(spySerializerToDatastore.getCall(0).args[0] instanceof GstoreEntity).equal(true);
        expect(spySerializerToDatastore.getCall(0).args[0].entityData).equal(entity.entityData);
        assert.isDefined((entity.gstore.ds.save as any).getCall(0).args[0].key);
        expect((entity.gstore.ds.save as any).getCall(0).args[0].key.constructor.name).equal('Key');
        assert.isDefined((entity.gstore.ds.save as any).getCall(0).args[0].data);

        spySerializerToDatastore.restore();
      });
    });

    test('should set "upsert" method by default', () =>
      entity.save().then(() => {
        expect((entity.gstore.ds.save as any).getCall(0).args[0].method).equal('upsert');
      }));

    describe('options', () => {
      test('should accept a "method" parameter in options', () =>
        entity.save(undefined, { method: 'insert' }).then(() => {
          expect((entity.gstore.ds.save as any).getCall(0).args[0].method).equal('insert');
        }));

      test('should only allow "update", "insert", "upsert" as method', done => {
        // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
        // @ts-ignore
        entity.save(undefined, { method: 'something' }).catch(e => {
          expect(e.message).equal('Method must be either "update", "insert" or "upsert"');

          entity
            .save(undefined, { method: 'update' })
            .then(() => entity.save(undefined, { method: 'upsert' }))
            .then(() => {
              done();
            });
        });
      });
    });

    test('on Datastore error, return the error', () => {
      (ds.save as any).restore();

      const error = {
        code: 500,
        message: 'Server Error',
      };
      sinon.stub(ds, 'save').rejects(error);

      entity = new GstoreModel({});

      return entity.save().catch(err => {
        expect(err).equal(error);
      });
    });

    test('should save entity in a transaction and execute "pre" hooks first', () => {
      schema = new Schema({});
      const spyPreHook = sinon.spy();
      schema.pre('save', () => {
        spyPreHook();
        return Promise.resolve();
      });

      const OtherModel = gstore.model('TransactionHooks', schema);
      entity = new OtherModel({});

      return entity.save(transaction).then(_entity => {
        expect(spyPreHook.called).equal(true);
        expect((transaction.save as any).called).equal(true);
        expect(spyPreHook.calledBefore(transaction.save as any)).equal(true); // eslint-disable-line @typescript-eslint/unbound-method
        assert.isDefined(_entity.entityData);
      });
    });

    test('should *not* save entity in a transaction if there are "pre" hooks', () => {
      schema = new Schema({});
      const spyPreHook = sinon.spy();
      schema.pre('save', () => {
        spyPreHook();
        return Promise.resolve();
      });
      const OtherModel = gstore.model('TransactionHooks', schema);
      entity = new OtherModel({});

      entity.save(transaction);

      expect(spyPreHook.called).equal(true);
      expect((transaction.save as any).called).equal(false);
    });

    test('should save entity in a transaction in sync', done => {
      const schema2 = new Schema({}, { validateBeforeSave: false });
      const ModelInstance2 = gstore.model('NewType', schema2);
      entity = new ModelInstance2({});
      entity.save(transaction);

      done();
    });

    test('should save entity in a transaction synchronous when validateBeforeSave desactivated', () => {
      schema = new Schema({ name: { type: String } }, { validateBeforeSave: false });

      const ModelInstanceTemp = gstore.model('BlogTemp', schema);
      entity = new ModelInstanceTemp({});

      entity.save(transaction);
      expect((transaction.save as any).called).equal(true);
    });

    test('should save entity in a transaction synchronous when disabling hook', () => {
      schema = new Schema({
        name: { type: String },
      });

      schema.pre('save', () => Promise.resolve());

      const ModelInstanceTemp = gstore.model('BlogTemp', schema);
      entity = new ModelInstanceTemp({});
      entity.preHooksEnabled = false;
      entity.save(transaction);

      const model2 = new ModelInstanceTemp({});
      const transaction2 = new Transaction();
      sinon.spy(transaction2, 'save');
      model2.save(transaction2);

      expect((transaction.save as any).called).equal(true);
      expect(transaction2.save.called).equal(false);
    });

    test('should throw error if transaction not instance of Transaction', () =>
      // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
      // @ts-ignore
      entity.save({ id: 0 }, {}).catch((err: any) => {
        assert.isDefined(err);
        expect(err.message).equal('Transaction needs to be a gcloud Transaction');
      }));

    test('should call pre hooks', () => {
      const spyPre = sinon.stub().resolves();

      schema = new Schema({ name: { type: String } });
      schema.pre('save', () => spyPre());
      GstoreModel = gstore.model('Blog', schema);
      entity = new GstoreModel({ name: 'John' });

      return entity.save().then(() => {
        expect(spyPre.calledBefore(ds.save as any)).equal(true); // eslint-disable-line @typescript-eslint/unbound-method
      });
    });

    test('should call post hooks', () => {
      const spyPost = sinon.stub().resolves(123);
      schema = new Schema({ name: { type: String } });
      schema.post('save', () => spyPost());
      GstoreModel = gstore.model('Blog', schema);
      entity = new GstoreModel({ name: 'John' });

      return entity.save().then(result => {
        expect(spyPost.called).equal(true);
        expect(result.name).equal('John');
      });
    });

    test('error in post hooks should be added to response', () => {
      const error = { code: 500 };
      const spyPost = sinon.stub().rejects(error);
      schema = new Schema({ name: { type: String } });
      schema.post('save', spyPost);
      GstoreModel = gstore.model('Blog', schema);
      entity = new GstoreModel({ name: 'John' });

      return entity.save().then(_entity => {
        assert.isDefined(_entity[gstore.ERR_HOOKS as any]);
        expect(_entity[gstore.ERR_HOOKS as any][0]).equal(error);
      });
    });

    test('transaction.execPostHooks() should call post hooks', () => {
      const spyPost = sinon.stub().resolves(123);
      schema = new Schema({ name: { type: String } });
      schema.post('save', spyPost);

      GstoreModel = gstore.model('Blog', schema);
      entity = new GstoreModel({ name: 'John' });

      return entity
        .save(transaction)
        .then(() => transaction.execPostHooks())
        .then(() => {
          expect(spyPost.called).equal(true);
          expect(spyPost.callCount).equal(1);
        });
    });

    test('transaction.execPostHooks() should set scope to entity saved', done => {
      schema.post('save', function preSave(this: any) {
        expect(this instanceof GstoreEntity).equal(true);
        expect(this.name).equal('John Jagger');
        done();
        return Promise.resolve();
      });
      GstoreModel = gstore.model('Blog', schema);
      entity = new GstoreModel({ name: 'John Jagger' });

      entity.save(transaction).then(() => transaction.execPostHooks());
    });

    test('if transaction.execPostHooks() is NOT called post middleware should not be called', () => {
      const spyPost = sinon.stub().resolves(123);
      schema = new Schema({ name: { type: String } });
      schema.post('save', spyPost);

      GstoreModel = gstore.model('Blog', schema);
      entity = new GstoreModel({ name: 'John' });

      return entity.save(transaction).then(() => {
        expect(spyPost.called).equal(false);
      });
    });

    test('should update modifiedOn to new Date if property in Schema', () => {
      schema = new Schema({ modifiedOn: { type: Date } });
      GstoreModel = gstore.model('BlogPost', schema);
      entity = new GstoreModel({});

      return entity.save().then(() => {
        assert.isDefined(entity.entityData.modifiedOn);
        const diff = Math.abs(entity.entityData.modifiedOn.getTime() - Date.now());
        expect(diff < 10).equal(true);
      });
    });

    test('should convert plain geo object (latitude, longitude) to datastore GeoPoint', () => {
      schema = new Schema({ location: { type: Schema.Types.GeoPoint } });
      GstoreModel = gstore.model('Car', schema);
      entity = new GstoreModel({
        location: {
          latitude: 37.305885314941406,
          longitude: -89.51815032958984,
        },
      });

      return entity.save().then(() => {
        expect(entity.entityData.location.constructor.name).to.equal('GeoPoint');
      });
    });

    test('should convert string date to Date object', () => {
      schema = new Schema({ birthday: { type: Date } });
      GstoreModel = gstore.model('TestDateConversion', schema);
      entity = new GstoreModel({ birthday: '2001-01-20' });

      return entity.save().then(() => {
        expect(entity.entityData.birthday instanceof Date).to.equal(true);
      });
    });

    test('should sanitize the entityData', () => {
      schema = new Schema({ name: { type: String } });
      GstoreModel = gstore.model('TestValidate', schema);
      entity = new GstoreModel({ name: 'John', unknown: 'abc' });

      return entity.save().then(() => {
        assert.isUndefined(entity.entityData.unknown);
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

      test('should call GstoreModel.clearCache()', () => {
        sinon.spy(GstoreModel, 'clearCache');
        return entity.save().then(_entity => {
          assert.ok((GstoreModel.clearCache as any).called);
          expect(typeof (GstoreModel.clearCache as any).getCall(0).args[0]).equal('undefined');
          expect(_entity.name).equal('John');
          (GstoreModel.clearCache as any).restore();
        });
      });

      test('on error when clearing the cache, should add the entity saved on the error object', done => {
        const err = new Error('Houston something bad happened');
        sinon.stub(gstore.cache!.queries, 'clearQueriesByKind').rejects(err);

        entity.save().catch(e => {
          expect(e.__entity.name).equal('John');
          expect(e.__cacheError).equal(err);
          (gstore.cache!.queries.clearQueriesByKind as any).restore();
          done();
        });
      });
    });
  });

  describe('validate()', () => {
    beforeEach(() => {
      sinon.spy(validation, 'validate');
    });

    afterEach(() => {
      (validation.validate as any).restore();
    });

    test('should call "Validation" helper passing entityData, Schema & entityKind', () => {
      schema = new Schema({ name: { type: String } });
      GstoreModel = gstore.model('TestValidate', schema);
      entity = new GstoreModel({ name: 'John' });

      const { error } = entity.validate();

      assert.isDefined(error);
      expect((validation.validate as any).getCall(0).args[0]).deep.equal(entity.entityData);
      expect((validation.validate as any).getCall(0).args[1]).equal(schema);
      expect((validation.validate as any).getCall(0).args[2]).equal(entity.entityKind);
    });

    test('should maintain the Datastore Key on the entityData with Joi Schema', () => {
      schema = new Schema({ name: { joi: Joi.string() } }, { joi: true });
      GstoreModel = gstore.model('TestValidate3', schema);
      entity = new GstoreModel({ name: 'John', createdOn: 'abc' });
      const key = entity.entityData[gstore.ds.KEY as any];

      entity.validate();

      expect(entity.entityData[gstore.ds.KEY as any]).equal(key);
    });
  });
});
