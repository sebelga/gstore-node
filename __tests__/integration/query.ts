import chai from 'chai';
import Chance from 'chance';
import { Datastore } from '@google-cloud/datastore';

import { Gstore, Entity, EntityKey } from '../../src';

type GenericObject = { [key: string]: any };

const gstore = new Gstore();
const gstoreWithCache = new Gstore({ cache: { config: { ttl: { queries: 600 } } } });
const ds = new Datastore({ projectId: 'gstore-integration-tests' });
gstore.connect(ds);
gstoreWithCache.connect(ds);

const { Schema } = gstore;
const { expect, assert } = chai;
const chance = new Chance();

const userSchema = new Schema({
  name: { type: String },
  age: { type: Number },
  address: { type: Schema.Types.Key },
  createdAt: { type: Date },
});

const addressSchema = new Schema({ city: { type: String }, country: { type: String } });

let generatedIds: string[] = [];
const allKeys: EntityKey[] = [];

const UserModel = gstore.model('QueryTests-User', userSchema);
const AddressModel = gstore.model('QueryTests-Address', addressSchema);

const getId = (): string => {
  const id = chance.string({ pool: 'abcdefghijklmnopqrstuvwxyz' });
  if (generatedIds.includes(id)) {
    return getId();
  }
  generatedIds.push(id);
  return id;
};

const getAddress = (): Entity<any> => {
  const key = AddressModel.key(getId());
  allKeys.push(key);
  const data = { city: chance.city(), country: chance.country() };
  const address = new AddressModel(data, undefined, undefined, undefined, key);
  return address;
};

const getUser = (address: Entity<any>): Entity<any> & GenericObject => {
  const key = UserModel.key(getId());
  allKeys.push(key);
  const data = {
    name: chance.string(),
    age: chance.integer({ min: 1 }),
    address: address.entityKey,
    createdAt: new Date('2019-01-20'),
  };
  const user = new UserModel(data, undefined, undefined, undefined, key);
  return user;
};

const addresses = [getAddress(), getAddress(), getAddress(), getAddress()];
const users = [getUser(addresses[0]), getUser(addresses[1]), getUser(addresses[2]), getUser(addresses[3])];
const mapAddressToId = addresses.reduce(
  (acc, address) => ({
    ...acc,
    [address.entityKey.name as string]: address,
  }),
  {} as any,
);

const mapUserToId = users.reduce(
  (acc, user) => ({
    ...acc,
    [user.entityKey.name as string]: user,
  }),
  {} as any,
);

const cleanUp = (): Promise<any> =>
  ((ds.delete(allKeys) as unknown) as Promise<any>)
    .then(() => Promise.all([UserModel.deleteAll(), AddressModel.deleteAll()]))
    .catch((err) => {
        console.log('Error cleaning up'); // eslint-disable-line
        console.log(err); // eslint-disable-line
    });

describe('Queries (Integration Tests)', () => {
  beforeAll(() => {
    generatedIds = [];
    return gstore.save([...users, ...addresses]);
  });

  afterAll(() => cleanUp());

  describe('Setup', () => {
    test('Return all the User and Addresses entities', () =>
      UserModel.query()
        .run()
        .then(({ entities }) => {
          expect(entities.length).equal(users.length);
        })
        .then(() => AddressModel.query().run())
        .then(({ entities }) => {
          expect(entities.length).equal(addresses.length);
        }));
  });

  describe('list()', () => {
    describe('populate()', () => {
      test('should populate the address of all users', () =>
        UserModel.list()
          .populate()
          .then(({ entities }) => {
            expect(entities.length).equal(users.length);

            entities.forEach((entity) => {
              const entityKey = (entity as any)[gstore.ds.KEY];
              const addressId = mapUserToId[entityKey.name].address.name;
              const address = mapAddressToId[addressId];
              expect((entity.address as any).city).equal(address.city);
              expect((entity.address as any).country).equal(address.country);
            });
          }));

      test('should also work with ENTITY format', () =>
        UserModel.list({ format: 'ENTITY' })
          .populate()
          .then(({ entities }) => {
            expect(entities.length).equal(users.length);

            entities.forEach((entity) => {
              const { entityKey } = entity;
              const addressId = mapUserToId[entityKey.name as string].address.name;
              const address = mapAddressToId[addressId];
              expect((entity.address as any).city).equal(address.city);
              expect((entity.address as any).country).equal(address.country);
            });
          }));

      test('should allow to select specific reference entity fields', () =>
        UserModel.list()
          .populate('address', 'country')
          .then(({ entities }) => {
            expect(entities.length).equal(users.length);

            entities.forEach((entity) => {
              const entityKey = (entity as any)[gstore.ds.KEY];
              const addressId = mapUserToId[entityKey.name].address.name;
              const address = mapAddressToId[addressId];
              expect((entity.address as any).country).equal(address.country);
              assert.isUndefined((entity.address as any).city);
            });
          }));

      describe('when cache is active', () => {
        beforeAll(() => {
          gstore.cache = gstoreWithCache.cache;
        });
        afterAll(() => {
          delete gstore.cache;
        });
        afterEach(() => {
          gstore.cache!.reset();
        });

        test('should also populate() fields', () =>
          UserModel.list()
            .populate()
            .then(({ entities }) => {
              expect(entities.length).equal(users.length);

              entities.forEach((entity) => {
                const entityKey = (entity as any)[gstore.ds.KEY];
                const addressId = mapUserToId[entityKey.name].address.name;
                const address = mapAddressToId[addressId];
                expect((entity.address as any).city).equal(address.city);
                expect((entity.address as any).country).equal(address.country);
              });
            }));
      });
    });
  });

  describe('findOne()', () => {
    describe('populate()', () => {
      test('should populate the address of all users', () =>
        UserModel.findOne({ name: users[0].name as string })
          .populate()
          .then((entity) => {
            const addressId = mapUserToId[entity!.entityKey.name as string].address.name;
            const address = mapAddressToId[addressId];
            expect((entity!.address as any).city).equal(address.city);
            expect((entity!.address as any).country).equal(address.country);
          }));

      test('should allow to select specific reference entity fields', () =>
        UserModel.findOne({ name: users[0].name })
          .populate('address', 'country')
          .then((entity) => {
            const addressId = mapUserToId[entity!.entityKey.name as string].address.name;
            const address = mapAddressToId[addressId];
            expect((entity!.address as any).country).equal(address.country);
            assert.isUndefined((entity!.address as any).city);
          }));
    });
  });

  describe('findAround()', () => {
    describe('populate()', () => {
      test('should populate the address of all users', () =>
        UserModel.findAround('createdAt', new Date('2019-01-01'), { after: 10 })
          .populate()
          .then((entities) => {
            expect(entities.length).equal(users.length);

            entities.forEach((entity) => {
              const entityKey = (entity as any)[gstore.ds.KEY];
              const addressId = mapUserToId[entityKey.name].address.name;
              const address = mapAddressToId[addressId];
              expect((entity.address as any).city).equal(address.city);
              expect((entity.address as any).country).equal(address.country);
            });
          }));

      test('should also work with ENTITY format', () =>
        UserModel.findAround('createdAt', new Date('2019-01-01'), { after: 10, format: 'ENTITY' })
          .populate()
          .then((entities) => {
            expect(entities.length).equal(users.length);

            entities.forEach((entity) => {
              const { entityKey } = entity;
              const addressId = mapUserToId[entityKey.name as string].address.name;
              const address = mapAddressToId[addressId];
              expect((entity.address as any).city).equal(address.city);
              expect((entity.address as any).country).equal(address.country);
            });
          }));

      test('should allow to select specific reference entity fields', () =>
        UserModel.findAround('createdAt', new Date('2019-01-01'), { after: 10 })
          .populate('address', 'country')
          .then((entities) => {
            expect(entities.length).equal(users.length);

            entities.forEach((entity) => {
              const entityKey = (entity as any)[gstore.ds.KEY];
              const addressId = mapUserToId[entityKey.name].address.name;
              const address = mapAddressToId[addressId];
              expect((entity.address as any).country).equal(address.country);
              assert.isUndefined((entity.address as any).city);
            });
          }));
    });
  });

  describe('datastore Queries()', () => {
    describe('populate()', () => {
      test('should populate the address of all users', () =>
        UserModel.query()
          .filter('createdAt', '>', new Date('2019-01-01'))
          .run()
          .populate()
          .then(({ entities }) => {
            expect(entities.length).equal(users.length);

            entities.forEach((entity) => {
              const entityKey = (entity as GenericObject)[gstore.ds.KEY as any];
              const addressId = mapUserToId[entityKey.name].address.name;
              const address = mapAddressToId[addressId];
              expect((entity.address as GenericObject).city).equal(address.city);
              expect((entity.address as GenericObject).country).equal(address.country);
            });
          }));

      test('should also work with ENTITY format', () =>
        UserModel.query<'ENTITY'>()
          .filter('createdAt', '>', new Date('2019-01-01'))
          .run({ format: 'ENTITY' })
          .populate()
          .then(({ entities }) => {
            expect(entities.length).equal(users.length);

            entities.forEach((entity) => {
              const { entityKey } = entity;
              const addressId = mapUserToId[entityKey.name as string].address.name;
              const address = mapAddressToId[addressId];
              expect((entity.address as GenericObject).city).equal(address.city);
              expect((entity.address as GenericObject).country).equal(address.country);
            });
          }));

      test('should allow to select specific reference entity fields', () =>
        UserModel.query()
          .filter('createdAt', '>', new Date('2019-01-01'))
          .run()
          .populate('address', 'country')
          .populate('unknown')
          .then(({ entities }) => {
            expect(entities.length).equal(users.length);

            entities.forEach((entity) => {
              const entityKey = (entity as GenericObject)[gstore.ds.KEY as any];
              const addressId = mapUserToId[entityKey.name].address.name;
              const address = mapAddressToId[addressId];
              expect((entity.address as GenericObject).country).equal(address.country);
              // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
              // @ts-ignore
              expect(entity.unknown).equal(null);
              assert.isUndefined((entity.address as GenericObject).city);
            });
          }));
    });
  });
});
