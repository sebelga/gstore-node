'use strict';

const Datastore = require('@google-cloud/datastore');
const chai = require('chai');
const { argv } = require('yargs');
const gstore = require('../../lib')();

const ds = new Datastore({ projectId: 'gstore-integration-tests' });
gstore.connect(ds);

const { expect } = chai;
const {
    k1, k2, k3, k4, user1,
} = require('./data');

const allKeys = [k1, k2, k3, k4];

const cleanUp = (cb) => {
    ds.delete(allKeys).then(cb);
};

describe.only('Integration Tests (Datastore & Memory cache)', () => {
    beforeEach(function integrationTest() {
        if (argv.int !== true) {
            // Skip e2e tests suite
            this.skip();
        }
    });

    afterEach((done) => {
        cleanUp(() => done());
    });

    it('check that Local Datastore is up and running', () =>
        ds.get(k1).then((res) => {
            expect(typeof res[0]).equal('undefined');

            return ds
                .save({ key: k1, data: user1 })
                .then(() => ds.get(k1))
                .then((res2) => {
                    expect(res2[0]).deep.equal(user1);
                });
        }));
});
