'use strict';

const redisStore = require('cache-manager-redis-store');
const chai = require('chai');
const Chance = require('chance');
const { Datastore } = require('@google-cloud/datastore');

const { Gstore } = require('../../lib');

const ds = new Datastore({ projectId: 'gstore-integration-tests' });
const chance = new Chance();
const { expect } = chai;

const allKeys = [];

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

const uniqueId = () => chance.string({ pool: 'abcdefghijklmnopqrstuvwxyz0123456789' });

const cleanUp = cb => {
  ds.delete(allKeys).then(cb);
};

const addKey = key => {
  if (key) {
    allKeys.push(key);
  }
};

describe('Integration Tests (Cache)', () => {
  let schema;
  const { Schema } = gstore;
  let Model;

  beforeEach(() => {
    gstore.models = {};
    gstore.modelSchemas = {};

    schema = new Schema({
      email: {
        type: String,
        validate: 'isEmail',
        required: true,
      },
    });

    Model = gstore.model('CacheTests-User', schema);
  });

  afterEach(done => {
    cleanUp(() => done());
  });

  it('should set KEY symbol on query result', () => {
    const id = uniqueId();
    const user = new Model({ email: 'test@test.com' }, id);
    return user.save().then(entity => {
      addKey(entity.entityKey);
      return Model.get(entity.entityKey.name).then(e => {
        expect(e.email).equal('test@test.com');
      });
    });
  });

  it('should get one or multiple entities fron the cache', async () => {
    const id1 = uniqueId();
    const id2 = uniqueId();

    const user1 = new Model({ email: 'test1@test.com' }, id1);
    const user2 = new Model({ email: 'test2@test.com' }, id2);

    const result = await Promise.all([user1.save(), user2.save()]);

    result.forEach(entity => addKey(entity.entityKey));

    const responseSingle = await Model.get(result[0].entityKey.name);
    const responseMultiple = await Model.get([result[0].entityKey.name, result[1].entityKey.name]);

    expect(responseSingle.email).to.equal('test1@test.com');
    expect(responseMultiple[0].email).to.equal('test1@test.com');
    expect(responseMultiple[1].email).to.equal('test2@test.com');
  });
});
