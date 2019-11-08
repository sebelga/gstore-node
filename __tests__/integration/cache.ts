import redisStore from 'cache-manager-redis-store';
import chai from 'chai';
import Chance from 'chance';
import { Datastore } from '@google-cloud/datastore';

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

  afterEach(done => {
    cleanUp(() => done());

  afterAll(() => {
    gstore.cache!.redisClient.quit();
  });

  test('should set KEY symbol on query result', () => {
    const id = uniqueId();
    const user = new MyModel({ email: 'test@test.com' }, id);
    return user.save().then(entity => {
      addKey(entity.entityKey);
      return MyModel.get(entity.entityKey.name!).then(e => {
        expect(e.email).equal('test@test.com');
      });
    });
  });

  test('should get one or multiple entities fron the cache', async () => {
    const id1 = uniqueId();
    const id2 = uniqueId();

    const user1 = new MyModel({ email: 'test1@test.com' }, id1);
    const user2 = new MyModel({ email: 'test2@test.com' }, id2);

    const result = await Promise.all([user1.save(), user2.save()]);

    result.forEach(entity => addKey(entity.entityKey));

    const responseSingle = await MyModel.get(result[0].entityKey.name!);
    const responseMultiple = await MyModel.get([result[0].entityKey.name!, result[1].entityKey.name!]);

    expect(responseSingle.email).to.equal('test1@test.com');
    expect(responseMultiple[0].email).to.equal('test1@test.com');
    expect(responseMultiple[1].email).to.equal('test2@test.com');
  });
});
