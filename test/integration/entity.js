'use strict';

const chai = require('chai');
const Chance = require('chance');
const { Datastore } = require('@google-cloud/datastore');
const { argv } = require('yargs');
const { Gstore } = require('../../lib');

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

let generatedIds = [];
const allKeys = [];

const UserModel = gstore.model('EntityTests-User', userSchema);
const AddressModel = gstore.model('EntityTests-Address', addressSchema);
const AddressBookModel = gstore.model('EntityTests-AddressBook', addressBookSchema);

const getId = () => {
    const id = chance.string({ pool: 'abcdefghijklmnopqrstuvwxyz' });
    if (generatedIds.indexOf(id) >= 0) {
        return getId();
    }
    generatedIds.push(id);
    return id;
};

const getAddressBook = () => {
    const key = AddressBookModel.key(getId());
    allKeys.push(key);
    const data = { label: chance.string() };
    const addressBook = new AddressBookModel(data, null, null, null, key);
    return addressBook;
};

const getAddress = (addressBookEntity = null) => {
    const key = AddressModel.key(getId());
    allKeys.push(key);
    const data = { city: chance.city(), country: chance.country(), addressBook: addressBookEntity.entityKey };
    const address = new AddressModel(data, null, null, null, key);
    return address;
};

const getUser = addressEntity => {
    const key = UserModel.key(getId());
    allKeys.push(key);
    const data = { address: addressEntity.entityKey };
    const user = new UserModel(data, null, null, null, key);
    return user;
};

const cleanUp = () => ds.delete(allKeys).then(() => Promise.all([
    UserModel.deleteAll(),
    AddressModel.deleteAll(),
    AddressBookModel.deleteAll(),
]))
    .catch(err => {
                console.log('Error cleaning up'); // eslint-disable-line
                console.log(err); // eslint-disable-line
    });

describe('Entity (Integration Tests)', () => {
    const addressBook = getAddressBook();
    const address = getAddress(addressBook);
    let user;

    before(function integrationTest() {
        if (argv.int !== true) {
            this.skip();
        }
        generatedIds = [];
        // return gstore.save([...users, ...addresses]);
        return gstore.save([addressBook, address]);
    });

    after(function afterAllIntTest() {
        if (argv.int !== true) {
            this.skip();
        }
        return cleanUp();
    });

    beforeEach(function integrationTest() {
        if (argv.int !== true) {
            // Skip e2e tests suite
            this.skip();
        }
        user = getUser(address);
    });

    describe('save()', () => {
        it('should replace a populated ref to its key before saving', () => (
            user.populate()
                .then(() => user.save())
                .then(() => UserModel.get(user.entityKey.name))
                .then(entityFetched => {
                    expect(entityFetched.entityData.address).deep.equal(address.entityKey);
                })
        ));
    });

    describe('populate()', () => {
        it('should populate the user address', () => (
            user.populate()
                .populate('unknown') // allow chaining populate() calls
                .then(() => {
                    expect(user.address.city).equal(address.city);
                    expect(user.address.country).equal(address.country);
                    expect(user.entityData.unknown).equal(null);
                })
        ));

        it('should only populate the user address country', () => (
            user.populate('address', 'country')
                .then(() => {
                    expect(user.address.country).equal(address.country);
                    assert.isUndefined(user.address.city);
                })
        ));

        it('should allow deep fetching', () => (
            user
                .populate()
                .populate('address.addressBook', ['label', 'unknown'])
                .then(() => {
                    expect(user.address.city).equal(address.city);
                    expect(user.address.country).equal(address.country);
                    expect(user.address.addressBook.label).equal(addressBook.label);
                    expect(user.address.addressBook.unknown).equal(null);
                })
        ));
    });
});
