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
        expect(e.email).equal('test@test.com');
      });
    });
  });

  test('should get one or multiple entities from the cache', async () => {
    const id1 = uniqueId();
    const id2 = uniqueId();

    const user1 = new MyModel({ email: 'test1@test.com' }, id1);
    const user2 = new MyModel({ email: 'test2@test.com' }, id2);

    const results = await Promise.all([user1.save(), user2.save()]);

    results.forEach((result) => addKey(result.entityKey));

    const responseSingle = await MyModel.get(results[0].entityKey.name!);
    const responseMultiple = await MyModel.get([results[0].entityKey.name!, results[1].entityKey.name!]);

    expect(responseSingle.email).to.equal('test1@test.com');
    expect(responseMultiple[0].email).to.equal('test1@test.com');
    expect(responseMultiple[1].email).to.equal('test2@test.com');
  });

  test('should find one entity from the cache', async () => {
    const id = uniqueId();

    const user = new MyModel({ email: 'test2@test.com' }, id);

    const result = await user.save();

    addKey(result.entityKey);

    const response = await MyModel.findOne({ email: 'test2@test.com' });

    expect(response!.email).to.eq('test2@test.com');
    expect(response!.entityKey.name).to.eq(id);
    expect(response!.entityKey instanceof entity.Key).to.eq(true);
  });
});
