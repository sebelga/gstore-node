'use strict';

const chai = require('chai');
const Chance = require('chance');
const { Datastore } = require('@google-cloud/datastore');
const { argv } = require('yargs');
const { Gstore } = require('../../lib');

const gstore = new Gstore();
const ds = new Datastore({ projectId: 'gstore-integration-tests' });
gstore.connect(ds);

const { Schema } = gstore;
const { expect } = chai;
const userSchema = new Schema({ name: { type: String } });
const chance = new Chance();

let generatedIds = [];
const allKeys = [];

const UserModel = gstore.model('GstoreTests-User', userSchema);

const getId = () => {
    const id = chance.string({ pool: 'abcdefghijklmnopqrstuvwxyz' });
    if (generatedIds.indexOf(id) >= 0) {
        return getId();
    }
    generatedIds.push(id);
    return id;
};

const getUser = () => {
    const key = UserModel.key(getId());
    allKeys.push(key);
    const data = { name: chance.string() };
    const user = new UserModel(data, null, null, null, key);
    return user;
};

const cleanUp = () => ds.delete(allKeys).then(() => UserModel.deleteAll())
    .catch(err => {
                console.log('Error cleaning up'); // eslint-disable-line
                console.log(err); // eslint-disable-line
    });

describe('Gstore (Integration Tests)', () => {
    before(function integrationTest() {
        if (argv.int !== true) {
            this.skip();
        }
        generatedIds = [];
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
    });

    describe('save()', () => {
        it('should convert entities to Datastore format and save them', () => {
            const users = [getUser(), getUser()];
            return gstore.save(users)
                .then(() => (
                    UserModel.list()
                        .then(({ entities: { 0: entity } }) => {
                            expect([users[0].name, users[1].name]).include(entity.name);
                        })
                ));
        });
    });
});
