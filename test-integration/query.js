'use strict';

const chai = require('chai');
const Chance = require('chance');
const { Datastore } = require('@google-cloud/datastore');
const { Gstore } = require('../lib');

const gstore = new Gstore();
const gstoreWithCache = new Gstore({ cache: { config: { ttl: { queries: 600 } } } });
const ds = new Datastore({ projectId: 'gstore-integration-tests' });
gstore.connect(ds);
gstoreWithCache.connect(ds);

const { Schema } = gstore;
const { expect, assert } = chai;
const userSchema = new Schema({
  name: { type: String },
  age: { type: Number },
  address: { type: Schema.Types.Key },
  createdAt: { type: Date },
});
const addressSchema = new Schema({ city: { type: String }, country: { type: String } });
const chance = new Chance();

let generatedIds = [];
const allKeys = [];

const UserModel = gstore.model('QueryTests-User', userSchema);
const AddressModel = gstore.model('QueryTests-Address', addressSchema);

const getId = () => {
  const id = chance.string({ pool: 'abcdefghijklmnopqrstuvwxyz' });
  if (generatedIds.indexOf(id) >= 0) {
    return getId();
  }
  generatedIds.push(id);
  return id;
};

const getAddress = () => {
  const key = AddressModel.key(getId());
  allKeys.push(key);
  const data = { city: chance.city(), country: chance.country() };
  const address = new AddressModel(data, null, null, null, key);
  return address;
};

const getUser = address => {
  const key = UserModel.key(getId());
  allKeys.push(key);
  const data = {
    name: chance.string(),
    age: chance.integer({ min: 1 }),
    address: address.entityKey,
    createdAt: new Date('2019-01-20'),
  };
  const user = new UserModel(data, null, null, null, key);
  return user;
};

const addresses = [getAddress(), getAddress(), getAddress(), getAddress()];
const users = [
  getUser(addresses[0]),
  getUser(addresses[1]),
  getUser(addresses[2]),
  getUser(addresses[3]),
];
const mapAddressToId = addresses.reduce((acc, address) => ({
  ...acc,
  [address.entityKey.name]: address,
}), {});

const mapUserToId = users.reduce((acc, user) => ({
  ...acc,
  [user.entityKey.name]: user,
}), {});

const cleanUp = () => ds.delete(allKeys).then(() => Promise.all([UserModel.deleteAll(), AddressModel.deleteAll()]))
  .catch(err => {
        console.log('Error cleaning up'); // eslint-disable-line
        console.log(err); // eslint-disable-line
  });

describe('Queries (Integration Tests)', () => {
  before(() => {
    generatedIds = [];
    return gstore.save([...users, ...addresses]);
  });

  after(() => cleanUp());

  describe('Setup', () => {
    it('Return all the User and Addresses entities', () => (
      UserModel.query().run()
        .then(({ entities }) => {
          expect(entities.length).equal(users.length);
        })
        .then(() => AddressModel.query().run())
        .then(({ entities }) => {
          expect(entities.length).equal(addresses.length);
        })
    ));
  });

  describe('list()', () => {
    describe('populate()', () => {
      it('should populate the address of all users', () => (
        UserModel.list()
          .populate()
          .then(({ entities }) => {
            expect(entities.length).equal(users.length);

            entities.forEach(entity => {
              const entityKey = entity[gstore.ds.KEY];
              const addressId = mapUserToId[entityKey.name].address.name;
              const address = mapAddressToId[addressId];
              expect(entity.address.city).equal(address.city);
              expect(entity.address.country).equal(address.country);
            });
          })
      ));

      it('should also work with ENTITY format', () => (
        UserModel.list({ format: 'ENTITY' })
          .populate()
          .then(({ entities }) => {
            expect(entities.length).equal(users.length);

            entities.forEach(entity => {
              const { entityKey } = entity;
              const addressId = mapUserToId[entityKey.name].address.name;
              const address = mapAddressToId[addressId];
              expect(entity.address.city).equal(address.city);
              expect(entity.address.country).equal(address.country);
            });
          })
      ));

      it('should allow to select specific reference entity fields', () => (
        UserModel.list()
          .populate('address', 'country')
          .then(({ entities }) => {
            expect(entities.length).equal(users.length);

            entities.forEach(entity => {
              const entityKey = entity[gstore.ds.KEY];
              const addressId = mapUserToId[entityKey.name].address.name;
              const address = mapAddressToId[addressId];
              expect(entity.address.country).equal(address.country);
              assert.isUndefined(entity.address.city);
            });
          })
      ));

      context('when cache is active', () => {
        before(() => {
          gstore.cache = gstoreWithCache.cache;
        });
        after(() => {
          delete gstore.cache;
        });
        afterEach(() => {
          gstore.cache.reset();
        });

        it('should also populate() fields', () => (
          UserModel.list()
            .populate()
            .then(({ entities }) => {
              expect(entities.length).equal(users.length);

              entities.forEach(entity => {
                const entityKey = entity[gstore.ds.KEY];
                const addressId = mapUserToId[entityKey.name].address.name;
                const address = mapAddressToId[addressId];
                expect(entity.address.city).equal(address.city);
                expect(entity.address.country).equal(address.country);
              });
            })
        ));
      });
    });
  });

  describe('findOne()', () => {
    describe('populate()', () => {
      it('should populate the address of all users', () => (
        UserModel.findOne({ name: users[0].name })
          .populate()
          .then(entity => {
            const addressId = mapUserToId[entity.entityKey.name].address.name;
            const address = mapAddressToId[addressId];
            expect(entity.address.city).equal(address.city);
            expect(entity.address.country).equal(address.country);
          })
      ));

      it('should allow to select specific reference entity fields', () => (
        UserModel.findOne({ name: users[0].name })
          .populate('address', 'country')
          .then(entity => {
            const addressId = mapUserToId[entity.entityKey.name].address.name;
            const address = mapAddressToId[addressId];
            expect(entity.address.country).equal(address.country);
            assert.isUndefined(entity.address.city);
          })
      ));
    });
  });

  describe('findAround()', () => {
    describe('populate()', () => {
      it('should populate the address of all users', () => (
        UserModel.findAround('createdAt', new Date('2019-01-01'), { after: 10 })
          .populate()
          .then(entities => {
            expect(entities.length).equal(users.length);

            entities.forEach(entity => {
              const entityKey = entity[gstore.ds.KEY];
              const addressId = mapUserToId[entityKey.name].address.name;
              const address = mapAddressToId[addressId];
              expect(entity.address.city).equal(address.city);
              expect(entity.address.country).equal(address.country);
            });
          })
      ));

      it('should also work with ENTITY format', () => (
        UserModel.findAround('createdAt', new Date('2019-01-01'), { after: 10, format: 'ENTITY' })
          .populate()
          .then(entities => {
            expect(entities.length).equal(users.length);

            entities.forEach(entity => {
              const { entityKey } = entity;
              const addressId = mapUserToId[entityKey.name].address.name;
              const address = mapAddressToId[addressId];
              expect(entity.address.city).equal(address.city);
              expect(entity.address.country).equal(address.country);
            });
          })
      ));

      it('should allow to select specific reference entity fields', () => (
        UserModel.findAround('createdAt', new Date('2019-01-01'), { after: 10 })
          .populate('address', 'country')
          .then(entities => {
            expect(entities.length).equal(users.length);

            entities.forEach(entity => {
              const entityKey = entity[gstore.ds.KEY];
              const addressId = mapUserToId[entityKey.name].address.name;
              const address = mapAddressToId[addressId];
              expect(entity.address.country).equal(address.country);
              assert.isUndefined(entity.address.city);
            });
          })
      ));
    });
  });

  describe('datastore Queries()', () => {
    describe('populate()', () => {
      it('should populate the address of all users', () => (
        UserModel.query()
          .filter('createdAt', '>', new Date('2019-01-01'))
          .run()
          .populate()
          .then(({ entities }) => {
            expect(entities.length).equal(users.length);

            entities.forEach(entity => {
              const entityKey = entity[gstore.ds.KEY];
              const addressId = mapUserToId[entityKey.name].address.name;
              const address = mapAddressToId[addressId];
              expect(entity.address.city).equal(address.city);
              expect(entity.address.country).equal(address.country);
            });
          })
      ));

      it('should also work with ENTITY format', () => (
        UserModel.query()
          .filter('createdAt', '>', new Date('2019-01-01'))
          .run({ format: 'ENTITY' })
          .populate()
          .then(({ entities }) => {
            expect(entities.length).equal(users.length);

            entities.forEach(entity => {
              const { entityKey } = entity;
              const addressId = mapUserToId[entityKey.name].address.name;
              const address = mapAddressToId[addressId];
              expect(entity.address.city).equal(address.city);
              expect(entity.address.country).equal(address.country);
            });
          })
      ));

      it('should allow to select specific reference entity fields', () => (
        UserModel.query()
          .filter('createdAt', '>', new Date('2019-01-01'))
          .run()
          .populate('address', 'country')
          .populate('unknown')
          .then(({ entities }) => {
            expect(entities.length).equal(users.length);

            entities.forEach(entity => {
              const entityKey = entity[gstore.ds.KEY];
              const addressId = mapUserToId[entityKey.name].address.name;
              const address = mapAddressToId[addressId];
              expect(entity.address.country).equal(address.country);
              expect(entity.unknown).equal(null);
              assert.isUndefined(entity.address.city);
            });
          })
      ));
    });
  });
});
