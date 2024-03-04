import redisStore from 'cache-manager-redis-store';
import chai from 'chai';
import Chance from 'chance';
import { Datastore } from '@google-cloud/datastore';
import { entity } from '@google-cloud/datastore/build/src/entity';

import { Gstore, EntityKey, Model } from '../../src';

const ds = new Datastore({ projectId: 'gstore-integration-tests' });
const chance = new Chance();
const { expect } = chai;

const allKeys: EntityKey[] = [];

const gstore = new Gstore({
  errorOnEntityNotFound: false,
  cache: {
    stores: [{ store: redisStore }],
    config: {
      ttl: {
        keys: 600,
        queries: 600,
      },
    },
  },
});

gstore.connect(ds);

const uniqueId = (): string => chance.string({ pool: 'abcdefghijklmnopqrstuvwxyz0123456789' });
const uniqueNumericId = (): number => Number(`4${chance.string({ numeric: true, length: 15 })}`);

const cleanUp = (cb: any): void => {
  ((ds.delete(allKeys) as unknown) as Promise<any>).then(cb);
};

const addKey = (key: EntityKey): void => {
  if (key) {
    allKeys.push(key);
  }
};

interface MyInterface {
  email: string;
  birthday?: Date;
}

describe('Integration Tests (Cache)', () => {
  let schema;
  const { Schema } = gstore;
  let MyModel: Model<MyInterface>;

  beforeEach(() => {
    gstore.models = {};

    schema = new Schema<MyInterface>({
      email: {
        type: String,
        validate: 'isEmail',
        required: true,
      },
      birthday: {
        type: Date,
        optional: true,
      },
    });

    MyModel = gstore.model('CacheTests-User', schema);
  });

  afterEach((done) => {
    cleanUp(() => done());
  });

  afterAll(() => {
    gstore.cache!.redisClient.quit();
  });

  test('should set KEY symbol on query result', () => {
    const id = uniqueId();
    const user = new MyModel({ email: 'test@test.com' }, id);
    return user.save().then((result) => {
      addKey(result.entityKey);
      return MyModel.get(result.entityKey.name!).then((e) => {
        expect(ds.isKey(e.entityKey)).equal(true);
        expect(e.email).equal('test@test.com');
      });
    });
  });

  test('should successfully return if no entity exists', async () => {
    const id1 = uniqueId();

    const response = await MyModel.get(id1);
    expect(response).to.equal(null, JSON.stringify(response));
  });

  test('should get one or multiple entities from the cache multiple times', async () => {
    const id1 = uniqueId();
    const id2 = uniqueId();

    const user1 = new MyModel({ email: 'test1@test.com', birthday: new Date('2000-01-01T00:00:00.000Z') }, id1);
    const user2 = new MyModel({ email: 'test2@test.com' }, id2);

    const results = await Promise.all([user1.save(), user2.save()]);

    results.forEach((result) => addKey(result.entityKey));

    const responseSingle0 = await MyModel.get(results[0].entityKey.name!);
    const responseSingle1 = await MyModel.get(results[0].entityKey.name!);
    const responseMultiple = await MyModel.get([results[0].entityKey.name!, results[1].entityKey.name!]);

    expect(responseSingle0.email).to.equal('test1@test.com');
    expect(responseSingle0.birthday instanceof Date).to.equal(true);
    expect(+(responseSingle0?.birthday || 0)).to.equal(+new Date('2000-01-01T00:00:00.000Z'));
    expect(responseSingle1.email).to.equal('test1@test.com');
    expect(responseSingle1.birthday instanceof Date).to.equal(true);
    expect(+(responseSingle1?.birthday || 0)).to.equal(+new Date('2000-01-01T00:00:00.000Z'));
    expect(responseMultiple[0].email).to.equal('test1@test.com');
    expect(responseMultiple[0].birthday instanceof Date).to.eq(true);
    expect(responseMultiple[1].email).to.equal('test2@test.com');
    // expect(typeof responseMultiple[1].birthday).to.eq('string');
  });

  test('should load already cached entities with correct datastore entity keys and dates', async () => {
    const id1 = uniqueNumericId();
    const id2 = uniqueNumericId();

    const user1 = new MyModel({ email: 'test3@test.com', birthday: new Date('2000-01-01T00:00:00.000Z') }, id1);
    const user2 = new MyModel({ email: 'test4@test.com', birthday: new Date('2000-01-01T00:00:00.000Z') }, id2);

    const results = await Promise.all([user1.save(), user2.save()]);

    results.forEach((result) => addKey(result.entityKey));

    const responseMultiple0 = await MyModel.list({ format: 'ENTITY', order: { property: 'email', descending: false } });

    responseMultiple0.entities.forEach((entry) => {
      expect(ds.isKey(entry?.entityKey)).to.equal(true);
      expect(typeof entry?.entityKey.id).to.equal('number');
      expect(entry?.birthday instanceof Date).to.eq(true);
    });

    const responseMultiple1 = await MyModel.list({ format: 'ENTITY', order: { property: 'email', descending: false } });

    responseMultiple1.entities.forEach((entry) => {
      expect(ds.isKey(entry?.entityKey)).to.equal(true);
      expect(typeof entry?.entityKey.id).to.equal('number');
      expect(entry?.birthday instanceof Date).to.eq(true);
    });
  });

  test('should query already cached entities with correct ids and data', async () => {
    const id1 = uniqueNumericId();
    const id2 = uniqueNumericId();

    const user1 = new MyModel({ email: 'test3@test.com', birthday: new Date('2000-01-01T00:00:00.000Z') }, id1);
    const user2 = new MyModel({ email: 'test4@test.com', birthday: new Date('2000-01-01T00:00:00.000Z') }, id2);

    const results = await Promise.all([user1.save(), user2.save()]);

    results.forEach((result) => addKey(result.entityKey));

    const response0 = await MyModel.query().limit(1).offset(1).order('email', { descending: true }).run({ cache: true, ttl: 100 });
    expect((response0.entities[0] as any).id).to.equal(id1);
    expect(response0.entities[0].birthday instanceof Date).to.eq(true);
    expect(response0.entities[0].email).to.eq('test3@test.com')
    expect(typeof response0.nextPageCursor).to.eq('string')

    const response1 = await MyModel.query().limit(1).offset(1).order('email', { descending: true }).run({ cache: true, ttl: 100 });

    expect((response1.entities[0] as any).id).to.equal(id1);
    expect(response1.entities[0].birthday instanceof Date).to.eq(true);
    expect(response1.entities[0].email).to.eq('test3@test.com')
    expect(typeof response1.nextPageCursor).to.eq('string')
  });

  test('should find one entity from the cache multiple times', async () => {
    const id = uniqueId();

    const user = new MyModel({ email: 'test3@test.com', birthday: new Date('2000-01-01T00:00:00.000Z') }, id);

    const result = await user.save();

    addKey(result.entityKey);

    const response = await MyModel.findOne({ email: 'test3@test.com' });
    expect(ds.isKey(response?.entityKey)).equal(true);

    expect(response!.email).to.eq('test3@test.com');
    expect(response!.entityKey.name).to.eq(id);
    expect(response!.entityKey instanceof entity.Key).to.eq(true);
    expect(response!.birthday instanceof Date).to.eq(true);

    const response2 = await MyModel.findOne({ email: 'test3@test.com' });

    expect(ds.isKey(response2?.entityKey)).equal(true);

    expect(response2!.email).to.eq('test3@test.com');
    expect(response2!.entityKey.name).to.eq(id);
    expect(response2!.entityKey instanceof entity.Key).to.eq(true);
    expect(response2!.birthday instanceof Date).to.eq(true);
  });
});
