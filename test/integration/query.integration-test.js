'use strict';

const Datastore = require('@google-cloud/datastore');
const chai = require('chai');
const { argv } = require('yargs');
const gstore = require('../../lib')();

const { Schema } = gstore;

const ds = new Datastore({ projectId: 'gstore-integration-tests' });
gstore.connect(ds);

const { expect } = chai;
const {
    k1, k2, k3, k4, entity1, entity2, entity3, entity4,
} = require('./data')(ds);

const allKeys = [k1, k2, k3, k4];

const cleanUp = (cb) => {
    ds.delete(allKeys).then(cb);
};

describe('Integration Tests (Queries)', () => {
    let Model;
    let query;

    before(function integrationTest(done) {
        if (argv.int !== true) {
            this.skip();
        }
        gstore.models = {};
        gstore.modelSchemas = {};

        const schema = new Schema({});
        Model = gstore.model('User', schema);
        query = Model.query();

        Model.deleteAll()
            .then(() => (
                // Add a few entities in the Datastore
                ds.save([entity1, entity2, entity3, entity4])
                    .then(() => done())
            ));
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
        query.run({ consistency: 'strong' })
            .then(({ entities }) => {
                expect(entities.length).equal(2);
            })
    ));
});
