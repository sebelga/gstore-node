'use strict';

const Datastore = require('@google-cloud/datastore');
const chai = require('chai');
const Chance = require('chance');
const { argv } = require('yargs');
const gstore = require('../../lib')({ namespace: 'integration-tests' });

const { Schema } = gstore;
const chance = new Chance();

const ds = new Datastore({ projectId: 'gstore-integration-tests' });
gstore.connect(ds);

const { expect } = chai;
const schema = new Schema({});

const UserModel = gstore.model('QueryTests-User', schema);

const getNewEntity = () => {
    const data = { name: chance.string(), age: chance.integer({ min: 1 }) };
    const user = new UserModel(data);
    return user;
};

const initialEntities = [getNewEntity(), getNewEntity(), getNewEntity(), getNewEntity()];

const cleanUp = (cb) => {
    UserModel.deleteAll().then(cb);
};

describe('Integration Tests (Queries)', () => {
    before(function integrationTest(done) {
        if (argv.int !== true) {
            this.skip();
        }

        gstore.save(initialEntities).then(() => { done(); });
    });

    beforeEach(function beforeEachIntTest() {
        if (argv.int !== true) {
            this.skip();
        }
    });

    after(function afterAllIntTest(done) {
        if (argv.int !== true) {
            this.skip();
        }
        cleanUp(() => done());
    });

    it('should forward options to underlying Datastore.Query', () => (
        UserModel.query().run()
            .then(({ entities }) => {
                expect(entities.length).equal(initialEntities.length);
            })
    ));
});
