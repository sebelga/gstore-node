import chai from 'chai';
import Chance from 'chance';
import { Datastore } from '@google-cloud/datastore';
import { Gstore, Entity, EntityKey } from '../../src';

type GenericObject = { [key: string]: any };

const ds = new Datastore({ projectId: 'gstore-integration-tests' });
const gstore = new Gstore();
gstore.connect(ds);

const { Schema } = gstore;
const { expect, assert } = chai;
const userSchema = new Schema({ address: { type: Schema.Types.Key } });
const addressBookSchema = new Schema({ label: { type: String } });
const addressSchema = new Schema({
  city: { type: String },
  country: { type: String },
  addressBook: { type: Schema.Types.Key },
});
const chance = new Chance();

let generatedIds: string[] = [];
const allKeys: EntityKey[] = [];

const UserModel = gstore.model('EntityTests-User', userSchema);
const AddressModel = gstore.model('EntityTests-Address', addressSchema);
const AddressBookModel = gstore.model('EntityTests-AddressBook', addressBookSchema);

const getId = (): string => {
  const id = chance.string({ pool: 'abcdefghijklmnopqrstuvwxyz' });
  if (generatedIds.includes(id)) {
    return getId();
  }
  generatedIds.push(id);
  return id;
};

const getAddressBook = (): Entity<any> & GenericObject => {
  const key = AddressBookModel.key(getId());
  allKeys.push(key);
  const data = { label: chance.string() };
  const addressBook = new AddressBookModel(data, undefined, undefined, undefined, key);
  return addressBook;
};

const getAddress = (addressBookEntity: Entity<any> | null = null): Entity<any> & GenericObject => {
  const key = AddressModel.key(getId());
  allKeys.push(key);
  const data = {
    city: chance.city(),
    country: chance.country(),
    addressBook: addressBookEntity !== null ? addressBookEntity.entityKey : null,
  };
  const address = new AddressModel(data, undefined, undefined, undefined, key);
  return address;
};

const getUser = (addressEntity: Entity<any>, id: string | number = getId()): Entity<{ address: any }> => {
  const key = UserModel.key(id);
  allKeys.push(key);
  const data = { address: addressEntity.entityKey };
  const user = new UserModel(data, undefined, undefined, undefined, key);
  return user;
};

const cleanUp = (): Promise<any> =>
  ((ds.delete(allKeys) as unknown) as Promise<any>)
    .then(() => Promise.all([UserModel.deleteAll(), AddressModel.deleteAll(), AddressBookModel.deleteAll()]))
    .catch((err) => {
                console.log('Error cleaning up'); // eslint-disable-line
                console.log(err); // eslint-disable-line
    });

describe('Entity (Integration Tests)', () => {
  const addressBook = getAddressBook();
  const address = getAddress(addressBook);
  let user: Entity<{ address: any }> & GenericObject;

  beforeAll(() => {
    generatedIds = [];
    return gstore.save([addressBook, address]);
  });

  afterAll(() => cleanUp());

  beforeEach(() => {
    user = getUser(address);
  });

  describe('save()', () => {
    test('should replace a populated ref to its key before saving', () =>
      user
        .populate()
        .then(() => user.save())
        .then(() => UserModel.get(user.entityKey.name!))
        .then((entityFetched) => {
          expect(entityFetched.entityData.address).deep.equal(address.entityKey);
        }));

    test('should add the id or name to the entity', async () => {
      const entity1 = await user.save();
      expect(entity1.id).equal(entity1.entityKey.name);

      const user2 = getUser(address, 1234);
      const entity2 = await user2.save();

      expect(entity2.id).equal(entity2.entityKey.id);
    });
  });

  describe('populate()', () => {
    test('should populate the user address', () =>
      user
        .populate()
        .populate('unknown') // allow chaining populate() calls
        .then(() => {
          expect(user.address.city).equal(address.city);
          expect(user.address.country).equal(address.country);
          // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
          // @ts-ignore
          expect(user.entityData.unknown).equal(null);
        }));

    test('should only populate the user address country', () =>
      user.populate('address', 'country').then(() => {
        expect(user.address.country).equal(address.country);
        assert.isUndefined(user.address.city);
      }));

    test('should allow deep fetching', () =>
      user
        .populate()
        .populate('address.addressBook', ['label', 'unknown'])
        .then(() => {
          expect(user.address.city).equal(address.city);
          expect(user.address.country).equal(address.country);
          expect(user.address.addressBook.label).equal(addressBook.label);
          expect(user.address.addressBook.unknown).equal(null);
        }));
  });
});
